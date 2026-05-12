import { fetchHistoricalHighSince, fetchQuote } from './priceProvider.js';
import { ALERT_TYPES, DEFAULT_ALERT_TYPE, normalizeAlertType } from './storage.js';
import { formatAlertMessage, isTelegramConfigured, sendTelegramMessage } from './telegram.js';

const alertTypeLabels = {
  [ALERT_TYPES.HIGH_DRAWDOWN]: '최고가 대비 하락률',
  [ALERT_TYPES.PURCHASE_LOSS]: '매수가 대비 손절률',
  [ALERT_TYPES.TARGET_PRICE]: '직접 기준가'
};

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

export function getAlertTypeLabel(alertType) {
  return alertTypeLabels[getNormalizedAlertType(alertType)] || alertTypeLabels[DEFAULT_ALERT_TYPE];
}

export function buildAlertRule(stock, currentPrice) {
  const alertType = getNormalizedAlertType(stock.alertType);
  const current = Number(currentPrice);

  if (!Number.isFinite(current) || current <= 0) {
    throw new Error('현재가가 올바르지 않습니다.');
  }

  if (alertType === ALERT_TYPES.TARGET_PRICE) {
    const targetPrice = Number(stock.targetPrice);

    if (!Number.isFinite(targetPrice) || targetPrice <= 0) {
      throw new Error('직접 기준가 알림은 기준가를 입력해야 합니다.');
    }

    const metricPercent = calculateDrawdownPercent(targetPrice, current);

    return {
      alertType,
      alertTypeLabel: getAlertTypeLabel(alertType),
      referencePrice: targetPrice,
      referenceLabel: '직접 기준가',
      thresholdLabel: '직접 기준가',
      metricLabel: '기준가 대비 하락률',
      metricPercent,
      drawdownPercent: metricPercent,
      thresholdPrice: targetPrice,
      thresholdPercent: null,
      isBelowThreshold: current <= targetPrice
    };
  }

  const thresholdPercent = normalizeRuleThresholdPercent(stock.thresholdPercent);
  const referencePrice =
    alertType === ALERT_TYPES.PURCHASE_LOSS ? Number(stock.purchasePrice) : Number(stock.highPrice);

  if (!Number.isFinite(referencePrice) || referencePrice <= 0) {
    throw new Error(
      alertType === ALERT_TYPES.PURCHASE_LOSS
        ? '매수가 대비 손절률 기준은 매수가가 필요합니다.'
        : '최고가 기준이 아직 계산되지 않았습니다.'
    );
  }

  const thresholdPrice = calculateThresholdPrice(referencePrice, thresholdPercent);
  const metricPercent = calculateDrawdownPercent(referencePrice, current);

  return {
    alertType,
    alertTypeLabel: getAlertTypeLabel(alertType),
    referencePrice,
    referenceLabel: alertType === ALERT_TYPES.PURCHASE_LOSS ? '매수가' : '구매일 이후 최고가',
    thresholdLabel:
      alertType === ALERT_TYPES.PURCHASE_LOSS
        ? `매수가 -${thresholdPercent}%`
        : `최고가 -${thresholdPercent}%`,
    metricLabel:
      alertType === ALERT_TYPES.PURCHASE_LOSS ? '매수가 대비 손실률' : '최고가 대비 하락률',
    metricPercent,
    drawdownPercent: metricPercent,
    thresholdPrice,
    thresholdPercent,
    isBelowThreshold: thresholdPrice !== null && current <= thresholdPrice
  };
}

function getNormalizedAlertType(alertType) {
  try {
    return normalizeAlertType(alertType);
  } catch {
    return DEFAULT_ALERT_TYPE;
  }
}

function normalizeRuleThresholdPercent(value) {
  const thresholdPercent = Number(value === undefined || value === null || value === '' ? 5 : value);

  if (!Number.isFinite(thresholdPercent) || thresholdPercent <= 0 || thresholdPercent >= 100) {
    throw new Error('하락률은 0보다 크고 100보다 작은 숫자여야 합니다.');
  }

  return thresholdPercent;
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
  const currentPrice = Number(quote.price);

  if (!Number.isFinite(currentPrice) || currentPrice <= 0) {
    throw new Error('현재가가 올바르지 않습니다.');
  }

  const alertType = getNormalizedAlertType(input.alertType);
  const needsHistoricalHigh = alertType === ALERT_TYPES.HIGH_DRAWDOWN;

  if (!historicalHigh && needsHistoricalHigh) {
    return {
      quote,
      position: null
    };
  }

  const purchasePrice = Number(input.purchasePrice);
  const quantity = Number(input.quantity);

  if (
    (alertType === ALERT_TYPES.HIGH_DRAWDOWN || alertType === ALERT_TYPES.PURCHASE_LOSS) &&
    (!Number.isFinite(purchasePrice) || purchasePrice <= 0)
  ) {
    throw new Error('매수가는 0보다 큰 숫자여야 합니다.');
  }

  const baseline = historicalHigh ? buildPurchaseHighBaseline(input, historicalHigh) : null;
  const alertRule = buildAlertRule(
    {
      ...input,
      alertType,
      purchasePrice: Number.isFinite(purchasePrice) ? purchasePrice : null,
      highPrice: baseline?.highPrice ?? null,
      targetPrice: input.targetPrice
    },
    currentPrice
  );
  const thresholdPrice = alertRule.thresholdPrice;
  const distanceToThreshold = thresholdPrice === null ? null : currentPrice - thresholdPrice;
  const distanceToThresholdPercent =
    thresholdPrice === null || currentPrice <= 0 ? null : (distanceToThreshold / currentPrice) * 100;
  const normalizedQuantity = Number.isFinite(quantity) && quantity > 0 ? quantity : null;
  const investmentAmount =
    normalizedQuantity && Number.isFinite(purchasePrice) && purchasePrice > 0
      ? normalizedQuantity * purchasePrice
      : null;
  const marketValue = normalizedQuantity ? normalizedQuantity * currentPrice : null;
  const unrealizedProfit =
    investmentAmount !== null && marketValue !== null ? marketValue - investmentAmount : null;
  const unrealizedProfitPercent =
    unrealizedProfit !== null && investmentAmount > 0 ? (unrealizedProfit / investmentAmount) * 100 : null;

  return {
    quote,
    position: {
      alertType,
      alertTypeLabel: alertRule.alertTypeLabel,
      purchasePrice: Number.isFinite(purchasePrice) ? purchasePrice : null,
      quantity: normalizedQuantity,
      investmentAmount,
      marketValue,
      unrealizedProfit,
      unrealizedProfitPercent,
      purchaseDate: input.purchaseDate,
      highPrice: baseline?.highPrice ?? null,
      highPriceAt: baseline?.highPriceAt ?? null,
      highPriceSource: baseline?.source ?? '',
      historicalHighPrice: historicalHigh?.highPrice ?? null,
      historicalHighAt: historicalHigh?.highPriceAt ?? null,
      referencePrice: alertRule.referencePrice,
      referenceLabel: alertRule.referenceLabel,
      targetPrice: alertType === ALERT_TYPES.TARGET_PRICE ? alertRule.thresholdPrice : null,
      thresholdPercent: alertRule.thresholdPercent,
      thresholdLabel: alertRule.thresholdLabel,
      thresholdPrice,
      metricLabel: alertRule.metricLabel,
      metricPercent: alertRule.metricPercent,
      drawdownPercent: alertRule.metricPercent,
      distanceToThreshold,
      distanceToThresholdPercent,
      alertNow: alertRule.isBelowThreshold,
      currency: baseline?.currency || quote.currency || '',
      provider: baseline?.provider || ''
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

  const highUpdated = !stock.highPrice || currentPrice > Number(stock.highPrice);

  if (highUpdated) {
    nextStock.highPrice = currentPrice;
    nextStock.highPriceAt = timestamp;
    nextStock.highPriceSource = quote.marketState === 'MANUAL_TEST' ? 'manual' : 'realtime';
  }

  const alertRule = buildAlertRule(nextStock, currentPrice);
  const suppressAlertForNewHigh =
    highUpdated && alertRule.alertType === ALERT_TYPES.HIGH_DRAWDOWN;
  const isAlertConditionActive = !suppressAlertForNewHigh && alertRule.isBelowThreshold;
  const previousAlertState = stock.alertState === 'triggered' ? 'triggered' : 'clear';
  const recovered = previousAlertState === 'triggered' && !isAlertConditionActive;
  const lastAlertAt = stock.lastAlertAt ? new Date(stock.lastAlertAt).getTime() : 0;
  const cooldownMs = Number(stock.alertCooldownMinutes || 1) * 60 * 1000;
  const cooldownElapsed = !lastAlertAt || now.getTime() - lastAlertAt >= cooldownMs;
  const alertDue = Boolean(stock.active && isAlertConditionActive && cooldownElapsed);
  const previousRepeatCount = normalizeRepeatCount(stock.alertRepeatCount);
  const nextAlertRepeatCount = alertDue
    ? previousAlertState === 'triggered'
      ? previousRepeatCount + 1
      : 1
    : previousRepeatCount;

  if (isAlertConditionActive) {
    nextStock.alertState = 'triggered';
    nextStock.alertStartedAt =
      previousAlertState === 'triggered' ? stock.alertStartedAt || timestamp : timestamp;
    nextStock.alertRecoveredAt = previousAlertState === 'triggered' ? stock.alertRecoveredAt || null : null;
    nextStock.alertRepeatCount = nextAlertRepeatCount;
  } else {
    nextStock.alertState = 'clear';
    nextStock.alertStartedAt = null;
    nextStock.alertRepeatCount = 0;

    if (recovered) {
      nextStock.alertRecoveredAt = timestamp;
    }
  }

  return {
    nextStock,
    alertDue,
    highUpdated,
    recovered,
    isAlertConditionActive,
    alertRepeatCount: nextAlertRepeatCount,
    drawdownPercent: alertRule.metricPercent,
    thresholdPrice: alertRule.thresholdPrice,
    alertType: alertRule.alertType,
    alertTypeLabel: alertRule.alertTypeLabel,
    referencePrice: alertRule.referencePrice,
    referenceLabel: alertRule.referenceLabel,
    thresholdLabel: alertRule.thresholdLabel,
    metricLabel: alertRule.metricLabel
  };
}

function normalizeRepeatCount(value) {
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 ? number : 0;
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
    const status = evaluation.alertDue
      ? 'alert'
      : evaluation.recovered
        ? 'recovered'
        : evaluation.highUpdated
          ? 'high_updated'
          : 'checked';

    if (evaluation.alertDue) {
      const message = formatAlertMessage(
        nextStock,
        quote,
        evaluation.drawdownPercent,
        evaluation.thresholdPrice,
        evaluation
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
        lastAlertAt: now.toISOString(),
        lastAlertPrice: quote.price,
        lastAlertThresholdPrice: evaluation.thresholdPrice,
        lastAlertMetricPercent: evaluation.drawdownPercent,
        alertRepeatCount: evaluation.alertRepeatCount
      };

      alert = await store.appendAlert({
        stockId: stock.id,
        deviceId: stock.deviceId || null,
        symbol: stock.symbol,
        displayName: stock.displayName || quote.name || stock.symbol,
        price: quote.price,
        highPrice: nextStock.highPrice,
        alertType: evaluation.alertType,
        alertTypeLabel: evaluation.alertTypeLabel,
        thresholdPercent: stock.thresholdPercent,
        thresholdPrice: evaluation.thresholdPrice,
        metricLabel: evaluation.metricLabel,
        drawdownPercent: evaluation.drawdownPercent,
        alertState: nextStock.alertState,
        alertRepeatCount: evaluation.alertRepeatCount,
        lastRecoveredAt: nextStock.alertRecoveredAt,
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
      alertType: evaluation.alertType,
      alertTypeLabel: evaluation.alertTypeLabel,
      alertState: nextStock.alertState,
      alertRepeatCount: nextStock.alertRepeatCount,
      recovered: evaluation.recovered,
      drawdownPercent: evaluation.drawdownPercent,
      thresholdPrice: evaluation.thresholdPrice,
      metricLabel: evaluation.metricLabel,
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
