import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildRegistrationPreview,
  buildProfitRetracementContext,
  calculateMaximumProfitAmount,
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
  const result = evaluateStock(
    baseStock,
    {
      price: 100,
      currency: 'USD',
      provider: 'stooq',
      providerLabel: 'Stooq',
      dataDelay: 'delayed',
      venue: 'us',
      licenseType: 'public',
      sourceNote: '무료 지연 시세',
      regularMarketTime: '2026-05-11T00:00:00.000Z'
    },
    date('2026-05-11T00:01:00Z')
  );

  assert.equal(result.alertDue, false);
  assert.equal(result.highUpdated, true);
  assert.equal(result.nextStock.highPrice, 100);
  assert.equal(result.thresholdPrice, 95);
  assert.equal(result.nextStock.quoteProvider, 'stooq');
  assert.equal(result.nextStock.quoteProviderLabel, 'Stooq');
  assert.equal(result.nextStock.quoteDataDelay, 'delayed');
  assert.equal(result.nextStock.quoteVenue, 'us');
  assert.equal(result.nextStock.quoteRegularMarketTime, '2026-05-11T00:00:00.000Z');
  assert.equal(result.nextStock.highPriceProvider, 'stooq');
  assert.equal(result.nextStock.highPriceDataDelay, 'delayed');
});

test('first monitoring quote uses purchase price as high when purchase date is omitted', () => {
  const stock = {
    ...baseStock,
    purchasePrice: 120,
    purchaseDate: '',
    highPrice: null,
    highPriceAt: null,
    highPriceSource: '',
    lastAlertAt: null
  };
  const result = evaluateStock(stock, { price: 100, currency: 'USD' }, date('2026-05-11T00:10:00Z'));

  assert.equal(result.highUpdated, true);
  assert.equal(result.nextStock.highPrice, 120);
  assert.equal(result.nextStock.highPriceSource, 'purchase_price');
  assert.equal(result.referenceLabel, '감시 최고가');
  assert.equal(result.thresholdPrice, 114);
  assert.equal(result.alertDue, true);
  assert.equal(result.nextStock.alertState, 'triggered');
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
    quantity: 10,
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
  assert.equal(result.maximumProfitAmount, 500);
  assert.equal(result.currentProfitAmount, 440);
  assert.equal(result.retracedProfitAmount, 60);
  assert.equal(result.retracedProfitPercent, 12);
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
  assert.equal(calculateMaximumProfitAmount(150, 100, 10), 500);
  assert.deepEqual(buildProfitRetracementContext({ highPrice: 150, purchasePrice: 100, quantity: 10 }, 144), {
    maximumProfitAmount: 500,
    maximumProfitPercent: 50,
    currentProfitAmount: 440,
    retracedProfitAmount: 60,
    retracedProfitPercent: 12
  });
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
          providerLabel: 'Stooq',
          dataDelay: 'eod',
          venue: 'us',
          sourceNote: '무료 지연 시세 · 일봉 데이터',
          points: 6
        };
      }
    }
  );

  assert.equal(stock.highPrice, 120);
  assert.equal(stock.highPriceAt, '2026-05-08T00:00:00.000Z');
  assert.equal(stock.highPriceSource, 'historical_daily');
  assert.equal(stock.highPriceProvider, 'stooq');
  assert.equal(stock.highPriceDataDelay, 'eod');
  assert.equal(stock.highPriceVenue, 'us');
  assert.equal(stock.quoteProvider || '', '');
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
  assert.equal(preview.position.totalReturnAmount, 260);
  assert.ok(Math.abs(preview.position.totalReturnPercent - 28.8888888889) < 0.000001);
  assert.equal(preview.position.maximumTotalReturnAmount, 320);
  assert.ok(Math.abs(preview.position.maximumTotalReturnPercent - 35.5555555556) < 0.000001);
  assert.equal(preview.position.totalReturnRetracedAmount, 60);
  assert.equal(preview.position.totalReturnRetracedPercent, 18.75);
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
      quantity: 10,
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
  assert.equal(preview.position.maximumProfitAmount, 500);
  assert.equal(preview.position.currentProfitAmount, 450);
  assert.equal(preview.position.retracedProfitAmount, 50);
  assert.equal(preview.position.retracedProfitPercent, 10);
});

test('registration preview uses monitoring high when purchase date is omitted', () => {
  const preview = buildRegistrationPreview(
    {
      alertType: 'profit_retracement',
      purchasePrice: 100,
      quantity: 10,
      thresholdPercent: 10
    },
    {
      symbol: 'AAPL',
      price: 120,
      currency: 'USD',
      provider: 'yahoo',
      regularMarketTime: '2026-05-11T00:00:00.000Z'
    }
  );

  assert.equal(preview.position.referenceLabel, '감시 최고가');
  assert.equal(preview.position.highPrice, 120);
  assert.equal(preview.position.highPriceSource, 'monitoring_start');
  assert.equal(preview.position.thresholdPrice, 118);
  assert.equal(preview.position.alertNow, false);
  assert.equal(preview.position.maximumProfitAmount, 200);
  assert.equal(preview.position.retracedProfitAmount, 0);
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

test('runAlertCheck skips stocks whose alert toggle is off', async () => {
  const store = createMemoryStore({
    ...baseStock,
    active: false
  });
  let fetched = false;

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
        fetched = true;
        throw new Error('fetchQuote should not be called');
      }
    }
  );

  assert.equal(result.results[0].status, 'skipped');
  assert.equal(result.results[0].reason, 'inactive');
  assert.equal(fetched, false);
  assert.equal(store.alerts.length, 0);
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

test('runAlertCheck records quote provider attempts when the fetcher reports them', async () => {
  const store = createMemoryStore({
    ...baseStock,
    highPrice: 100,
    highPriceAt: '2026-05-11T00:01:00.000Z'
  });
  const attempts = [];
  store.recordQuoteProviderAttempt = async (attempt) => {
    attempts.push(attempt);
  };

  await runAlertCheck(
    store,
    {
      telegramBotToken: 'token',
      telegramChatId: 'chat',
      quoteTimeoutMs: 10000,
      quoteProviders: 'stooq'
    },
    {
      now: date('2026-05-11T00:47:00Z'),
      fetchQuote: async (_symbol, options) => {
        await options.onProviderAttempt({
          type: 'quote',
          provider: 'stooq',
          symbol: 'AAPL',
          status: 'success',
          startedAt: '2026-05-11T00:47:00.000Z',
          finishedAt: '2026-05-11T00:47:00.050Z',
          durationMs: 50
        });

        return {
          symbol: 'AAPL',
          price: 99,
          currency: 'USD',
          provider: 'stooq'
        };
      }
    }
  );

  assert.equal(attempts.length, 1);
  assert.equal(attempts[0].provider, 'stooq');
  assert.equal(attempts[0].stockId, 'stock-1');
  assert.equal(attempts[0].source, 'alert_check');
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
