import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildDividendEventAlertCandidates,
  dividendEventAlertSentMetaKey,
  formatDividendEventAlertMessage,
  normalizeDividendEventAlertOffsets,
  runDividendEventAlertCheck
} from '../src/dividendEventAlerts.js';

const baseStock = {
  id: 'stock-1',
  deviceId: 'device-1',
  symbol: 'AAPL',
  displayName: 'Apple',
  active: true,
  quantity: 5,
  annualDividendPerShare: 4,
  lastDividendValue: 1,
  exDividendDate: '2026-05-20T00:00:00.000Z',
  dividendDate: '2026-05-18T00:00:00.000Z',
  dividendProvider: 'yahoo',
  dividendCurrency: 'USD',
  currency: 'USD'
};

test('buildDividendEventAlertCandidates finds configured ex-date and payment reminders', () => {
  const candidates = buildDividendEventAlertCandidates([baseStock], {
    now: new Date('2026-05-17T09:00:00.000Z'),
    exDateOffsets: [3, 1, 0, -1],
    paymentDateOffsets: [1, 0]
  });

  assert.equal(candidates.length, 2);
  assert.deepEqual(
    candidates.map((item) => [item.eventType, item.eventDate, item.offsetDays, item.offsetLabel]),
    [
      ['payment', '2026-05-18', 1, '1일 전'],
      ['ex_dividend', '2026-05-20', 3, '3일 전']
    ]
  );
});

test('formatDividendEventAlertMessage explains event date and expected dividend amount', () => {
  const [candidate] = buildDividendEventAlertCandidates([baseStock], {
    now: new Date('2026-05-17T09:00:00.000Z'),
    exDateOffsets: [3],
    paymentDateOffsets: [365]
  });
  const message = formatDividendEventAlertMessage(candidate);

  assert.match(message, /배당 일정 알림/);
  assert.match(message, /Apple \(AAPL\)/);
  assert.match(message, /배당락일: 2026\.05\.20 \(3일 전\)/);
  assert.match(message, /예상 보유 배당금: 5 USD \(5주\)/);
});

test('runDividendEventAlertCheck sends telegram once per dividend event key', async () => {
  const store = createMemoryStore(baseStock);
  const telegramMessages = [];
  const options = {
    now: new Date('2026-05-17T09:00:00.000Z'),
    sendTelegramMessage: async (config, message) => {
      assert.equal(config.telegramChatId, '5863355323');
      telegramMessages.push(message);
    }
  };

  const first = await runDividendEventAlertCheck(store, createConfig(), options);

  assert.equal(first.summary.due, 2);
  assert.equal(first.summary.sent, 2);
  assert.equal(first.results[0].deliveryStatus, 'sent');
  assert.equal(telegramMessages.length, 2);
  assert.equal(store.alerts.length, 2);
  assert.equal(store.alerts[0].alertType, 'dividend_event');
  assert.equal(store.alerts[0].pushDeliveryStatus, undefined);
  assert.equal(store.alerts[0].dividendEventOffsetLabel, '1일 전');
  assert.equal(Object.keys(store.meta[dividendEventAlertSentMetaKey]).length, 2);

  const second = await runDividendEventAlertCheck(store, createConfig(), options);

  assert.equal(second.summary.due, 2);
  assert.equal(second.summary.alreadySent, 2);
  assert.equal(telegramMessages.length, 2);
  assert.equal(store.alerts.length, 2);
});

test('runDividendEventAlertCheck can be disabled by config', async () => {
  const store = createMemoryStore(baseStock);
  const result = await runDividendEventAlertCheck(
    store,
    {
      ...createConfig(),
      dividendEventAlertEnabled: false
    },
    {
      now: new Date('2026-05-17T09:00:00.000Z')
    }
  );

  assert.equal(result.skipped, true);
  assert.equal(result.reason, 'dividend_event_alert_disabled');
  assert.equal(store.alerts.length, 0);
});

test('normalizeDividendEventAlertOffsets keeps valid integer offsets with fallback', () => {
  assert.deepEqual(normalizeDividendEventAlertOffsets('3,1,0,-1,bad,400', [1, 0]), [3, 1, 0, -1]);
  assert.deepEqual(normalizeDividendEventAlertOffsets('', [1, 0]), [1, 0]);
});

function createConfig() {
  return {
    telegramBotToken: 'token',
    telegramChatId: '5863355323',
    dividendEventAlertEnabled: true,
    dividendEventAlertExDateOffsets: [3, 1, 0, -1],
    dividendEventAlertPaymentDateOffsets: [1, 0]
  };
}

function createMemoryStore(stock) {
  return {
    stocks: [{ ...stock }],
    alerts: [],
    meta: {},
    async listStocks() {
      return this.stocks;
    },
    async appendAlert(alert) {
      const item = {
        id: `alert-${this.alerts.length + 1}`,
        ...alert
      };
      this.alerts.push(item);
      return item;
    },
    async getMetaValue(key, fallback = null) {
      return this.meta[key] ?? fallback;
    },
    async setMetaValue(key, value) {
      this.meta[key] = value;
      return value;
    }
  };
}
