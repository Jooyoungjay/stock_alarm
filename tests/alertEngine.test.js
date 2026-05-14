import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildRegistrationPreview,
  calculateDrawdownPercent,
  calculateProfitRetracementPercent,
  calculateProfitRetracementThreshold,
  calculateThresholdPrice,
  evaluateStock,
  initializeHighFromPurchaseDate,
  runAlertCheck,
  runManualQuoteCheck
} from '../src/alertEngine.js';

const baseStock = {
  id: 'stock-1',
  symbol: 'AAPL',
  displayName: 'Apple',
  purchasePrice: 90,
  purchaseDate: '2026-05-01',
  thresholdPercent: 5,
  alertCooldownMinutes: 30,
  active: true,
  highPrice: null,
  highPriceAt: null,
  highPriceSource: '',
  lastPrice: null,
  lastCheckedAt: null,
  lastCheckStatus: 'pending',
  lastError: '',
  lastErrorAt: null,
  lastAlertAt: null,
  currency: 'USD',
  exchange: 'Nasdaq',
  marketState: '',
  notes: '',
  createdAt: '2026-05-11T00:00:00.000Z',
  updatedAt: '2026-05-11T00:00:00.000Z'
};

test('first quote sets the high price without alerting', () => {
  const result = evaluateStock(baseStock, { price: 100, currency: 'USD' }, date('2026-05-11T00:01:00Z'));

  assert.equal(result.alertDue, false);
  assert.equal(result.highUpdated, true);
  assert.equal(result.nextStock.highPrice, 100);
  assert.equal(result.thresholdPrice, 95);
});

test('drop below threshold creates an alert when cooldown allows it', () => {
  const stock = {
    ...baseStock,
    highPrice: 100,
    highPriceAt: '2026-05-11T00:01:00.000Z'
  };
  const result = evaluateStock(stock, { price: 94, currency: 'USD' }, date('2026-05-11T00:10:00Z'));

  assert.equal(result.alertDue, true);
  assert.equal(result.highUpdated, false);
  assert.equal(result.drawdownPercent, 6);
  assert.equal(result.thresholdPrice, 95);
  assert.equal(result.nextStock.alertState, 'triggered');
  assert.equal(result.alertRepeatCount, 1);
});

test('purchase-loss alert uses purchase price as the alert basis', () => {
  const stock = {
    ...baseStock,
    alertType: 'purchase_loss',
    purchasePrice: 100,
    highPrice: 140,
    highPriceAt: '2026-05-11T00:01:00.000Z'
  };
  const result = evaluateStock(stock, { price: 94, currency: 'USD' }, date('2026-05-11T00:10:00Z'));

  assert.equal(result.alertDue, true);
  assert.equal(result.alertType, 'purchase_loss');
  assert.equal(result.thresholdPrice, 95);
  assert.equal(result.drawdownPercent, 6);
  assert.equal(result.metricLabel, '매수가 대비 손실률');
});

test('profit-retracement alert uses peak profit as the alert basis', () => {
  const stock = {
    ...baseStock,
    alertType: 'profit_retracement',
    purchasePrice: 100,
    thresholdPercent: 10,
    highPrice: 150,
    highPriceAt: '2026-05-11T00:01:00.000Z'
  };
  const result = evaluateStock(stock, { price: 144, currency: 'USD' }, date('2026-05-11T00:10:00Z'));

  assert.equal(result.alertDue, true);
  assert.equal(result.alertType, 'profit_retracement');
  assert.equal(result.thresholdPrice, 145);
  assert.equal(result.drawdownPercent, 12);
  assert.equal(result.metricLabel, '이익금 반납률');
});

test('profit-retracement alert waits until a peak profit exists', () => {
  const stock = {
    ...baseStock,
    alertType: 'profit_retracement',
    purchasePrice: 100,
    thresholdPercent: 10,
    highPrice: 100,
    highPriceAt: '2026-05-11T00:01:00.000Z'
  };
  const result = evaluateStock(stock, { price: 99, currency: 'USD' }, date('2026-05-11T00:10:00Z'));

  assert.equal(result.alertDue, false);
  assert.equal(result.thresholdPrice, null);
  assert.equal(result.drawdownPercent, 0);
  assert.equal(result.nextStock.alertState, 'clear');
});

test('target-price alert uses the direct target price as the threshold', () => {
  const stock = {
    ...baseStock,
    alertType: 'target_price',
    targetPrice: 95,
    highPrice: 140,
    highPriceAt: '2026-05-11T00:01:00.000Z'
  };
  const result = evaluateStock(stock, { price: 94, currency: 'USD' }, date('2026-05-11T00:10:00Z'));

  assert.equal(result.alertDue, true);
  assert.equal(result.alertType, 'target_price');
  assert.equal(result.thresholdPrice, 95);
  assert.equal(result.metricLabel, '기준가 대비 하락률');
  assert.ok(Math.abs(result.drawdownPercent - 1.0526315789) < 0.000001);
});

test('cooldown blocks repeated alerts', () => {
  const stock = {
    ...baseStock,
    highPrice: 100,
    lastAlertAt: '2026-05-11T00:00:00.000Z'
  };
  const result = evaluateStock(stock, { price: 90, currency: 'USD' }, date('2026-05-11T00:10:00Z'));

  assert.equal(result.alertDue, false);
  assert.equal(result.drawdownPercent, 10);
  assert.equal(result.nextStock.alertState, 'triggered');
  assert.equal(result.alertRepeatCount, 0);
});

test('repeated alert increments the repeat count after cooldown', () => {
  const stock = {
    ...baseStock,
    highPrice: 100,
    alertState: 'triggered',
    alertStartedAt: '2026-05-11T00:00:00.000Z',
    alertRepeatCount: 1,
    lastAlertAt: '2026-05-11T00:00:00.000Z'
  };
  const result = evaluateStock(stock, { price: 94, currency: 'USD' }, date('2026-05-11T00:40:00Z'));

  assert.equal(result.alertDue, true);
  assert.equal(result.alertRepeatCount, 2);
  assert.equal(result.nextStock.alertState, 'triggered');
  assert.equal(result.nextStock.alertStartedAt, '2026-05-11T00:00:00.000Z');
});

test('price recovery clears the alert state', () => {
  const stock = {
    ...baseStock,
    highPrice: 100,
    alertState: 'triggered',
    alertStartedAt: '2026-05-11T00:00:00.000Z',
    alertRepeatCount: 2,
    lastAlertAt: '2026-05-11T00:30:00.000Z'
  };
  const result = evaluateStock(stock, { price: 98, currency: 'USD' }, date('2026-05-11T00:45:00Z'));

  assert.equal(result.alertDue, false);
  assert.equal(result.recovered, true);
  assert.equal(result.nextStock.alertState, 'clear');
  assert.equal(result.nextStock.alertRepeatCount, 0);
  assert.equal(result.nextStock.alertRecoveredAt, '2026-05-11T00:45:00.000Z');
});

test('new high updates the high price and suppresses alert', () => {
  const stock = {
    ...baseStock,
    highPrice: 100,
    lastAlertAt: '2026-05-11T00:00:00.000Z'
  };
  const result = evaluateStock(stock, { price: 101, currency: 'USD' }, date('2026-05-11T01:00:00Z'));

  assert.equal(result.alertDue, false);
  assert.equal(result.highUpdated, true);
  assert.equal(result.nextStock.highPrice, 101);
});

test('drawdown and threshold helpers handle basic math', () => {
  assert.equal(calculateDrawdownPercent(200, 180), 10);
  assert.equal(calculateThresholdPrice(200, 7.5), 185);
  assert.equal(calculateProfitRetracementThreshold(150, 100, 10), 145);
  assert.equal(calculateProfitRetracementPercent(150, 100, 144), 12);
});

test('purchase date initializes high price from historical daily data', async () => {
  const store = createMemoryStore(baseStock);

  const stock = await initializeHighFromPurchaseDate(
    store,
    { quoteTimeoutMs: 10000, quoteProviders: 'stooq' },
    baseStock,
    {
      now: date('2026-05-11T00:00:00Z'),
      fetchHistoricalHighSince: async (symbol, startDate) => {
        assert.equal(symbol, 'AAPL');
        assert.equal(startDate, '2026-05-01');

        return {
          symbol,
          highPrice: 120,
          highPriceAt: '2026-05-08T00:00:00.000Z',
          currency: 'USD',
          exchange: 'Stooq',
          provider: 'stooq',
          points: 6
        };
      }
    }
  );

  assert.equal(stock.highPrice, 120);
  assert.equal(stock.highPriceAt, '2026-05-08T00:00:00.000Z');
  assert.equal(stock.highPriceSource, 'historical_daily');
  assert.equal(stock.lastCheckStatus, 'high_initialized');
  assert.equal(store.stocks[0].highPrice, 120);
});

test('purchase price becomes the initial high when it is above historical daily high', async () => {
  const stockInput = {
    ...baseStock,
    purchasePrice: 130
  };
  const store = createMemoryStore(stockInput);

  const stock = await initializeHighFromPurchaseDate(
    store,
    { quoteTimeoutMs: 10000, quoteProviders: 'stooq' },
    stockInput,
    {
      now: date('2026-05-11T00:00:00Z'),
      fetchHistoricalHighSince: async () => ({
        symbol: 'AAPL',
        highPrice: 120,
        highPriceAt: '2026-05-08T00:00:00.000Z',
        currency: 'USD',
        exchange: 'Stooq',
        provider: 'stooq',
        points: 6
      })
    }
  );

  assert.equal(stock.highPrice, 130);
  assert.equal(stock.highPriceAt, '2026-05-01T00:00:00.000Z');
  assert.equal(stock.highPriceSource, 'purchase_price');
});

test('registration preview calculates threshold and drawdown before saving', () => {
  const preview = buildRegistrationPreview(
    {
      purchasePrice: 90,
      quantity: 10,
      annualDividendPerShare: 2,
      purchaseDate: '2026-05-01',
      thresholdPercent: 5
    },
    {
      symbol: 'AAPL',
      price: 114,
      currency: 'USD',
      provider: 'yahoo'
    },
    {
      symbol: 'AAPL',
      highPrice: 120,
      highPriceAt: '2026-05-08T00:00:00.000Z',
      currency: 'USD',
      exchange: 'NasdaqGS',
      provider: 'yahoo',
      points: 6
    }
  );

  assert.equal(preview.quote.symbol, 'AAPL');
  assert.equal(preview.position.highPrice, 120);
  assert.equal(preview.position.thresholdPrice, 114);
  assert.equal(preview.position.drawdownPercent, 5);
  assert.equal(preview.position.alertNow, true);
  assert.equal(preview.position.quantity, 10);
  assert.equal(preview.position.investmentAmount, 900);
  assert.equal(preview.position.marketValue, 1140);
  assert.equal(preview.position.unrealizedProfit, 240);
  assert.ok(Math.abs(preview.position.unrealizedProfitPercent - 26.6666666667) < 0.000001);
  assert.equal(preview.position.annualDividendPerShare, 2);
  assert.equal(preview.position.expectedAnnualDividend, 20);
  assert.ok(Math.abs(preview.position.dividendYieldPercent - 2.2222222222) < 0.000001);
});

test('registration preview uses purchase price when it is the highest baseline', () => {
  const preview = buildRegistrationPreview(
    {
      purchasePrice: 130,
      purchaseDate: '2026-05-01',
      thresholdPercent: 10
    },
    {
      symbol: 'AAPL',
      price: 120,
      currency: 'USD',
      provider: 'yahoo'
    },
    {
      symbol: 'AAPL',
      highPrice: 125,
      highPriceAt: '2026-05-08T00:00:00.000Z',
      currency: 'USD',
      exchange: 'NasdaqGS',
      provider: 'yahoo',
      points: 6
    }
  );

  assert.equal(preview.position.highPrice, 130);
  assert.equal(preview.position.highPriceAt, '2026-05-01T00:00:00.000Z');
  assert.equal(preview.position.highPriceSource, 'purchase_price');
  assert.equal(preview.position.thresholdPrice, 117);
  assert.equal(preview.position.alertNow, false);
});

test('registration preview supports purchase-loss basis', () => {
  const preview = buildRegistrationPreview(
    {
      alertType: 'purchase_loss',
      purchasePrice: 100,
      purchaseDate: '2026-05-01',
      thresholdPercent: 5
    },
    {
      symbol: 'AAPL',
      price: 94,
      currency: 'USD',
      provider: 'yahoo'
    },
    {
      symbol: 'AAPL',
      highPrice: 130,
      highPriceAt: '2026-05-08T00:00:00.000Z',
      currency: 'USD',
      exchange: 'NasdaqGS',
      provider: 'yahoo',
      points: 6
    }
  );

  assert.equal(preview.position.alertType, 'purchase_loss');
  assert.equal(preview.position.referencePrice, 100);
  assert.equal(preview.position.thresholdPrice, 95);
  assert.equal(preview.position.drawdownPercent, 6);
  assert.equal(preview.position.alertNow, true);
});

test('registration preview supports profit-retracement basis', () => {
  const preview = buildRegistrationPreview(
    {
      alertType: 'profit_retracement',
      purchasePrice: 100,
      purchaseDate: '2026-05-01',
      thresholdPercent: 10
    },
    {
      symbol: 'AAPL',
      price: 145,
      currency: 'USD',
      provider: 'yahoo'
    },
    {
      symbol: 'AAPL',
      highPrice: 150,
      highPriceAt: '2026-05-08T00:00:00.000Z',
      currency: 'USD',
      exchange: 'NasdaqGS',
      provider: 'yahoo',
      points: 6
    }
  );

  assert.equal(preview.position.alertType, 'profit_retracement');
  assert.equal(preview.position.referencePrice, 150);
  assert.equal(preview.position.thresholdPrice, 145);
  assert.equal(preview.position.drawdownPercent, 10);
  assert.equal(preview.position.alertNow, true);
});

test('registration preview supports direct target price without historical high', () => {
  const preview = buildRegistrationPreview(
    {
      alertType: 'target_price',
      targetPrice: 95
    },
    {
      symbol: 'AAPL',
      price: 94,
      currency: 'USD',
      provider: 'yahoo'
    }
  );

  assert.equal(preview.position.alertType, 'target_price');
  assert.equal(preview.position.highPrice, null);
  assert.equal(preview.position.thresholdPrice, 95);
  assert.equal(preview.position.alertNow, true);
});

test('manual quote check sends an alert through the same alert path', async () => {
  const store = createMemoryStore({
    ...baseStock,
    highPrice: 100,
    highPriceAt: '2026-05-11T00:01:00.000Z'
  });
  const sentMessages = [];

  const result = await runManualQuoteCheck(
    store,
    {
      telegramBotToken: 'token',
      telegramChatId: 'chat',
      quoteTimeoutMs: 10000
    },
    'stock-1',
    { price: 94 },
    {
      now: date('2026-05-11T00:40:00Z'),
      sendTelegramMessage: async (_config, message) => {
        sentMessages.push(message);
        return { ok: true };
      }
    }
  );

  assert.equal(result.manual, true);
  assert.equal(result.results[0].status, 'alert');
  assert.equal(result.results[0].deliveryStatus, 'sent');
  assert.equal(store.alerts.length, 1);
  assert.equal(store.stocks[0].lastPrice, 94);
  assert.equal(store.stocks[0].lastCheckStatus, 'alert');
  assert.equal(store.stocks[0].lastError, '');
  assert.equal(store.stocks[0].lastAlertAt, '2026-05-11T00:40:00.000Z');
  assert.equal(store.stocks[0].alertState, 'triggered');
  assert.equal(store.stocks[0].alertRepeatCount, 1);
  assert.equal(store.alerts[0].alertRepeatCount, 1);
  assert.equal(sentMessages.length, 1);
});

test('manual quote check marks recovery without sending an alert', async () => {
  const store = createMemoryStore({
    ...baseStock,
    highPrice: 100,
    highPriceAt: '2026-05-11T00:01:00.000Z',
    alertState: 'triggered',
    alertStartedAt: '2026-05-11T00:00:00.000Z',
    alertRepeatCount: 2,
    lastAlertAt: '2026-05-11T00:30:00.000Z'
  });
  const sentMessages = [];

  const result = await runManualQuoteCheck(
    store,
    {
      telegramBotToken: 'token',
      telegramChatId: 'chat',
      quoteTimeoutMs: 10000
    },
    'stock-1',
    { price: 98 },
    {
      now: date('2026-05-11T00:45:00Z'),
      sendTelegramMessage: async (_config, message) => {
        sentMessages.push(message);
        return { ok: true };
      }
    }
  );

  assert.equal(result.results[0].status, 'recovered');
  assert.equal(result.results[0].recovered, true);
  assert.equal(store.alerts.length, 0);
  assert.equal(store.stocks[0].alertState, 'clear');
  assert.equal(store.stocks[0].alertRepeatCount, 0);
  assert.equal(store.stocks[0].alertRecoveredAt, '2026-05-11T00:45:00.000Z');
  assert.equal(sentMessages.length, 0);
});

test('quote fetch errors are persisted on the stock', async () => {
  const store = createMemoryStore(baseStock);

  const result = await runAlertCheck(
    store,
    {
      telegramBotToken: 'token',
      telegramChatId: 'chat',
      quoteTimeoutMs: 10000
    },
    {
      now: date('2026-05-11T00:46:00Z'),
      fetchQuote: async () => {
        throw new Error('가격 정보를 찾을 수 없습니다: AAPL');
      }
    }
  );

  assert.equal(result.results[0].status, 'error');
  assert.equal(result.results[0].error, '가격 정보를 찾을 수 없습니다: AAPL');
  assert.equal(store.stocks[0].lastCheckStatus, 'error');
  assert.equal(store.stocks[0].lastError, '가격 정보를 찾을 수 없습니다: AAPL');
  assert.equal(store.stocks[0].lastErrorAt, '2026-05-11T00:46:00.000Z');
});

function date(value) {
  return new Date(value);
}

function createMemoryStore(stock) {
  return {
    stocks: [{ ...stock }],
    alerts: [],
    async listStocks() {
      return this.stocks;
    },
    async replaceStock(nextStock) {
      const index = this.stocks.findIndex((item) => item.id === nextStock.id);
      this.stocks[index] = nextStock;
      return nextStock;
    },
    async appendAlert(alert) {
      this.alerts.push(alert);
      return alert;
    }
  };
}
