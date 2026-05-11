import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateDrawdownPercent,
  calculateThresholdPrice,
  evaluateStock,
  runAlertCheck,
  runManualQuoteCheck
} from '../src/alertEngine.js';

const baseStock = {
  id: 'stock-1',
  symbol: 'AAPL',
  displayName: 'Apple',
  thresholdPercent: 5,
  alertCooldownMinutes: 30,
  active: true,
  highPrice: null,
  highPriceAt: null,
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
  assert.equal(sentMessages.length, 1);
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
