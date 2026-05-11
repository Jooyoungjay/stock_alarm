import { fetchHistoricalHighSince, fetchQuote } from './priceProvider.js';
import { formatAlertMessage, isTelegramConfigured, sendTelegramMessage } from './telegram.js';

export function calculateDrawdownPercent(highPrice, currentPrice) {
  const high = Number(highPrice);
  const current = Number(currentPrice);

  if (!Number.isFinite(high) || high <= 0 || !Number.isFinite(current)) {
    return 0;
  }

  return Math.max(0, ((high - current) / high) * 100);
}

export function calculateThresholdPrice(highPrice, thresholdPercent) {
  const high = Number(highPrice);
  const threshold = Number(thresholdPercent);

  if (!Number.isFinite(high) || !Number.isFinite(threshold)) {
    return null;
  }

  return high * (1 - threshold / 100);
}

export function buildPurchaseHighBaseline(stock, historicalHigh) {
  const purchasePrice = Number(stock.purchasePrice);
  const purchasePriceIsHigher =
    Number.isFinite(purchasePrice) && purchasePrice > Number(historicalHigh.highPrice);

  if (purchasePriceIsHigher) {
    return {
      ...historicalHigh,
      highPrice: purchasePrice,
      highPriceAt: `${stock.purchaseDate}T00:00:00.000Z`,
      source: 'purchase_price'
    };
  }

  return {
    ...historicalHigh,
    source: 'historical_daily'
  };
}

export function buildRegistrationPreview(input, quote, historicalHigh = null) {
  const thresholdPercent = Number(input.thresholdPercent);
  const currentPrice = Number(quote.price);

  if (!Number.isFinite(currentPrice) || currentPrice <= 0) {
    throw new Error('현재가가 올바르지 않습니다.');
  }

  if (!historicalHigh) {
    return {
      quote,
      position: null
    };
  }

  const purchasePrice = Number(input.purchasePrice);

  if (!Number.isFinite(purchasePrice) || purchasePrice <= 0) {
    throw new Error('매수가는 0보다 큰 숫자여야 합니다.');
  }

  if (!Number.isFinite(thresholdPercent) || thresholdPercent <= 0 || thresholdPercent >= 100) {
    throw new Error('하락률은 0보다 크고 100보다 작은 숫자여야 합니다.');
  }

  const baseline = buildPurchaseHighBaseline(input, historicalHigh);
  const thresholdPrice = calculateThresholdPrice(baseline.highPrice, thresholdPercent);
  const drawdownPercent = calculateDrawdownPercent(baseline.highPrice, currentPrice);
  const distanceToThreshold = thresholdPrice === null ? null : currentPrice - thresholdPrice;
  const distanceToThresholdPercent =
    thresholdPrice === null || currentPrice <= 0 ? null : (distanceToThreshold / currentPrice) * 100;

  return {
    quote,
    position: {
      purchasePrice: Number(input.purchasePrice),
      purchaseDate: input.purchaseDate,
      highPrice: baseline.highPrice,
      highPriceAt: baseline.highPriceAt,
      highPriceSource: baseline.source,
      historicalHighPrice: historicalHigh.highPrice,
      historicalHighAt: historicalHigh.highPriceAt,
      thresholdPercent,
      thresholdPrice,
      drawdownPercent,
      distanceToThreshold,
      distanceToThresholdPercent,
      alertNow: thresholdPrice !== null && currentPrice <= thresholdPrice,
      currency: baseline.currency || quote.currency || '',
      provider: baseline.provider || ''
    }
  };
}

export function evaluateStock(stock, quote, now = new Date()) {
  const timestamp = now.toISOString();
  const currentPrice = Number(quote.price);

  if (!Number.isFinite(currentPrice) || currentPrice <= 0) {
    throw new Error('현재가가 올바르지 않습니다.');
  }

  const nextStock = {
    ...stock,
    lastPrice: currentPrice,
    lastCheckedAt: timestamp,
    currency: quote.currency || stock.currency || '',
    exchange: quote.exchange || stock.exchange || '',
    marketState: quote.marketState || stock.marketState || '',
    quoteProvider: quote.provider || stock.quoteProvider || '',
    updatedAt: timestamp
  };

  if (!stock.highPrice || currentPrice > Number(stock.highPrice)) {
    nextStock.highPrice = currentPrice;
    nextStock.highPriceAt = timestamp;
    nextStock.highPriceSource = quote.marketState === 'MANUAL_TEST' ? 'manual' : 'realtime';

    return {
      nextStock,
      alertDue: false,
      highUpdated: true,
      drawdownPercent: 0,
      thresholdPrice: calculateThresholdPrice(currentPrice, stock.thresholdPercent)
    };
  }

  const thresholdPrice = calculateThresholdPrice(stock.highPrice, stock.thresholdPercent);
  const drawdownPercent = calculateDrawdownPercent(stock.highPrice, currentPrice);
  const isBelowThreshold = thresholdPrice !== null && currentPrice <= thresholdPrice;
  const lastAlertAt = stock.lastAlertAt ? new Date(stock.lastAlertAt).getTime() : 0;
  const cooldownMs = Number(stock.alertCooldownMinutes || 1) * 60 * 1000;
  const cooldownElapsed = !lastAlertAt || now.getTime() - lastAlertAt >= cooldownMs;

  return {
    nextStock,
    alertDue: Boolean(stock.active && isBelowThreshold && cooldownElapsed),
    highUpdated: false,
    drawdownPercent,
    thresholdPrice
  };
}

export async function initializeHighFromPurchaseDate(store, config, stock, options = {}) {
  if (!stock.purchaseDate) {
    return stock;
  }

  const highFetcher = options.fetchHistoricalHighSince || fetchHistoricalHighSince;
  const now = options.now || new Date();
  const historicalHigh = await highFetcher(stock.symbol, stock.purchaseDate, {
    timeoutMs: config.quoteTimeoutMs,
    providers: config.quoteProviders,
    alphaVantageApiKey: config.alphaVantageApiKey,
    endDate: now
  });
  const baselineHigh = buildPurchaseHighBaseline(stock, historicalHigh);
  const currentHigh = Number(stock.highPrice);
  const shouldUpdateHigh =
    !Number.isFinite(currentHigh) || currentHigh <= 0 || baselineHigh.highPrice >= currentHigh;
  const timestamp = now.toISOString();

  if (!shouldUpdateHigh) {
    return store.replaceStock({
      ...stock,
      lastCheckStatus: 'high_initialized',
      lastError: '',
      lastErrorAt: null,
      updatedAt: timestamp
    });
  }

  return store.replaceStock({
    ...stock,
    highPrice: baselineHigh.highPrice,
    highPriceAt: baselineHigh.highPriceAt,
    highPriceSource: baselineHigh.source,
    currency: baselineHigh.currency || stock.currency || '',
    exchange: baselineHigh.exchange || stock.exchange || '',
    quoteProvider: baselineHigh.provider || stock.quoteProvider || '',
    lastCheckStatus: 'high_initialized',
    lastError: '',
    lastErrorAt: null,
    updatedAt: timestamp
  });
}

async function markStockError(store, stock, error, now) {
  const timestamp = now.toISOString();
  const message = error.message || '가격 조회 중 오류가 발생했습니다.';

  await store.replaceStock({
    ...stock,
    lastCheckedAt: timestamp,
    lastCheckStatus: 'error',
    lastError: message,
    lastErrorAt: timestamp,
    updatedAt: timestamp
  });

  return {
    stockId: stock.id,
    symbol: stock.symbol,
    status: 'error',
    error: message
  };
}

async function processStockQuote(store, config, stock, quote, options = {}) {
  const telegramSender = options.sendTelegramMessage || sendTelegramMessage;
  const now = options.now || new Date();

  if (!stock.active) {
    return {
      stockId: stock.id,
      symbol: stock.symbol,
      status: 'skipped',
      reason: 'inactive'
    };
  }

  try {
    const evaluation = evaluateStock(stock, quote, now);
    let nextStock = evaluation.nextStock;
    let deliveryStatus = 'none';
    let deliveryError = '';
    let alert = null;
    const status = evaluation.alertDue ? 'alert' : evaluation.highUpdated ? 'high_updated' : 'checked';

    if (evaluation.alertDue) {
      const message = formatAlertMessage(
        nextStock,
        quote,
        evaluation.drawdownPercent,
        evaluation.thresholdPrice
      );

      try {
        if (isTelegramConfigured(config)) {
          await telegramSender(config, message);
          deliveryStatus = 'sent';
        } else {
          deliveryStatus = 'not_configured';
          deliveryError = '텔레그램 설정이 없습니다.';
        }
      } catch (error) {
        deliveryStatus = 'failed';
        deliveryError = error.message;
      }

      nextStock = {
        ...nextStock,
        lastAlertAt: now.toISOString()
      };

      alert = await store.appendAlert({
        stockId: stock.id,
        symbol: stock.symbol,
        displayName: stock.displayName || quote.name || stock.symbol,
        price: quote.price,
        highPrice: stock.highPrice,
        thresholdPercent: stock.thresholdPercent,
        thresholdPrice: evaluation.thresholdPrice,
        drawdownPercent: evaluation.drawdownPercent,
        deliveryStatus,
        deliveryError,
        message,
        createdAt: now.toISOString()
      });
    }

    await store.replaceStock({
      ...nextStock,
      lastCheckStatus: status,
      lastError: '',
      lastErrorAt: null
    });

    return {
      stockId: stock.id,
      symbol: stock.symbol,
      status,
      price: quote.price,
      highPrice: nextStock.highPrice,
      drawdownPercent: evaluation.drawdownPercent,
      thresholdPrice: evaluation.thresholdPrice,
      deliveryStatus,
      alert
    };
  } catch (error) {
    return markStockError(store, stock, error, now);
  }
}

export async function runAlertCheck(store, config, options = {}) {
  const quoteFetcher = options.fetchQuote || fetchQuote;
  const now = options.now || new Date();
  const stocks = await store.listStocks();
  const results = [];

  for (const stock of stocks) {
    if (!stock.active) {
      results.push({
        stockId: stock.id,
        symbol: stock.symbol,
        status: 'skipped',
        reason: 'inactive'
      });
      continue;
    }

    try {
      const quote = await quoteFetcher(stock.symbol, {
        timeoutMs: config.quoteTimeoutMs,
        providers: config.quoteProviders,
        alphaVantageApiKey: config.alphaVantageApiKey
      });
      const result = await processStockQuote(store, config, stock, quote, {
        now,
        sendTelegramMessage: options.sendTelegramMessage
      });
      results.push(result);
    } catch (error) {
      results.push(await markStockError(store, stock, error, now));
    }
  }

  return {
    checkedAt: now.toISOString(),
    results
  };
}

export async function runManualQuoteCheck(store, config, stockId, manualQuote, options = {}) {
  const now = options.now || new Date();
  const price = Number(manualQuote.price);

  if (!Number.isFinite(price) || price <= 0) {
    throw new Error('테스트 현재가는 0보다 큰 숫자여야 합니다.');
  }

  const stocks = await store.listStocks();
  const stock = stocks.find((item) => item.id === stockId);

  if (!stock) {
    throw new Error('종목을 찾을 수 없습니다.');
  }

  const quote = {
    symbol: stock.symbol,
    name: stock.displayName || stock.symbol,
    price,
    currency: manualQuote.currency || stock.currency || '',
    exchange: manualQuote.exchange || stock.exchange || 'Manual test',
    marketState: 'MANUAL_TEST',
    regularMarketTime: now.toISOString()
  };

  const result = await processStockQuote(store, config, stock, quote, {
    now,
    sendTelegramMessage: options.sendTelegramMessage
  });

  return {
    checkedAt: now.toISOString(),
    manual: true,
    results: [result]
  };
}
