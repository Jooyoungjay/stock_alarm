import { fetchQuote } from './priceProvider.js';
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
    updatedAt: timestamp
  };

  if (!stock.highPrice || currentPrice > Number(stock.highPrice)) {
    nextStock.highPrice = currentPrice;
    nextStock.highPriceAt = timestamp;

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

export async function runAlertCheck(store, config, options = {}) {
  const quoteFetcher = options.fetchQuote || fetchQuote;
  const telegramSender = options.sendTelegramMessage || sendTelegramMessage;
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
      const quote = await quoteFetcher(stock.symbol, { timeoutMs: config.quoteTimeoutMs });
      const evaluation = evaluateStock(stock, quote, now);
      let nextStock = evaluation.nextStock;
      let deliveryStatus = 'none';
      let deliveryError = '';
      let alert = null;

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

      await store.replaceStock(nextStock);

      results.push({
        stockId: stock.id,
        symbol: stock.symbol,
        status: evaluation.alertDue ? 'alert' : evaluation.highUpdated ? 'high_updated' : 'checked',
        price: quote.price,
        highPrice: nextStock.highPrice,
        drawdownPercent: evaluation.drawdownPercent,
        thresholdPrice: evaluation.thresholdPrice,
        deliveryStatus,
        alert
      });
    } catch (error) {
      results.push({
        stockId: stock.id,
        symbol: stock.symbol,
        status: 'error',
        error: error.message
      });
    }
  }

  return {
    checkedAt: now.toISOString(),
    results
  };
}
