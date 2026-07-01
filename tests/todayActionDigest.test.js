import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildTodayActionDigestFingerprint,
  formatTodayActionDigestMessage,
  isKoreanMarketSession,
  lastTodayActionDigestAlertMetaKey,
  runTodayActionDigest
} from '../src/todayActionDigest.js';

test('isKoreanMarketSession is true on weekday KST market hours', () => {
  assert.equal(isKoreanMarketSession(new Date('2026-06-24T01:00:00.000Z')), true);
});

test('isKoreanMarketSession is false on weekends and after close', () => {
  assert.equal(isKoreanMarketSession(new Date('2026-06-20T01:00:00.000Z')), false);
  assert.equal(isKoreanMarketSession(new Date('2026-06-24T07:00:00.000Z')), false);
});

test('buildTodayActionDigestFingerprint ignores warning actions', () => {
  const fingerprint = buildTodayActionDigestFingerprint([
    { type: 'threshold-alert', priority: 'critical', stock: { symbol: '005930' } },
    { type: 'quote-stale', priority: 'warning', stock: { symbol: '000660' } }
  ]);

  assert.equal(fingerprint, 'threshold-alert:005930');
});

test('formatTodayActionDigestMessage prefixes digest header and /today hint', () => {
  const message = formatTodayActionDigestMessage([
    {
      priority: 'critical',
      priorityLabel: '확인 필요',
      title: '알림 기준 도달',
      name: '삼성전자',
      detail: '테스트',
      commandHint: '/status 005930'
    }
  ]);

  assert.match(message, /\[Stock Alarm\] 장중 확인 필요/);
  assert.match(message, /알림 기준 도달/);
  assert.match(message, /\/today 로 전체 보기/);
});

test('runTodayActionDigest sends critical digest and stores cooldown fingerprint', async () => {
  const store = createMemoryStore();
  const sent = [];
  const now = new Date('2026-06-24T01:00:00.000Z');

  await store.addStock({
    symbol: '005930',
    displayName: '삼성전자',
    purchasePrice: 70000,
    thresholdPercent: 5,
    active: true,
    alertState: 'triggered',
    lastPrice: 65000,
    lastCheckedAt: now.toISOString(),
    currency: 'KRW'
  });

  const first = await runTodayActionDigest(
    store,
    {
      telegramBotToken: 'token',
      telegramChatId: '123',
      telegramCommandPollSeconds: 30,
      todayActionDigestCooldownMinutes: 60
    },
    {
      force: true,
      now,
      observationHistoryRecent: [],
      lastTelegramCommandPoll: { checkedAt: now.toISOString() },
      sendTelegramMessage: async (_config, text) => {
        sent.push(text);
      }
    }
  );

  assert.equal(first.skipped, false);
  assert.equal(first.deliveryStatus, 'sent');
  assert.equal(first.criticalCount, 1);
  assert.equal(sent.length, 1);
  assert.match(sent[0], /장중 확인 필요/);

  const secondNow = new Date(now.getTime() + 5 * 60 * 1000);

  const second = await runTodayActionDigest(
    store,
    {
      telegramBotToken: 'token',
      telegramChatId: '123',
      telegramCommandPollSeconds: 30,
      todayActionDigestCooldownMinutes: 60
    },
    {
      now: secondNow,
      observationHistoryRecent: [],
      lastTelegramCommandPoll: { checkedAt: secondNow.toISOString() },
      sendTelegramMessage: async (_config, text) => {
        sent.push(text);
      }
    }
  );

  assert.equal(second.skipped, true);
  assert.equal(second.reason, 'cooldown');
  assert.equal(sent.length, 1);
  assert.equal(store.meta[lastTodayActionDigestAlertMetaKey].fingerprint, first.fingerprint);
});

test('runTodayActionDigest skips when no critical actions remain', async () => {
  const store = createMemoryStore();
  const sent = [];

  await store.addStock({
    symbol: '005930',
    displayName: '삼성전자',
    purchasePrice: 70000,
    thresholdPercent: 5,
    active: true,
    alertState: 'watching',
    lastPrice: 72000,
    lastCheckedAt: new Date('2026-06-24T01:00:00.000Z').toISOString(),
    currency: 'KRW'
  });

  const result = await runTodayActionDigest(
    store,
    { telegramBotToken: 'token', telegramChatId: '123', telegramCommandPollSeconds: 30 },
    {
      force: true,
      now: new Date('2026-06-24T01:00:00.000Z'),
      observationHistoryRecent: [],
      lastTelegramCommandPoll: { checkedAt: new Date('2026-06-24T01:00:00.000Z').toISOString() },
      sendTelegramMessage: async (_config, text) => {
        sent.push(text);
      }
    }
  );

  assert.equal(result.skipped, true);
  assert.equal(result.reason, 'no_critical_actions');
  assert.equal(sent.length, 0);
});

function createMemoryStore() {
  const state = {
    stocks: [],
    meta: {}
  };

  return {
    dataDir: '/tmp/stock-alarm-test',
    meta: state.meta,
    async listStocks() {
      return state.stocks.map((stock) => ({ ...stock }));
    },
    async addStock(input) {
      const stock = {
        id: `stock-${state.stocks.length + 1}`,
        ...input
      };
      state.stocks.push(stock);
      return { ...stock };
    },
    async getMetaValue(key, fallback = null) {
      return Object.prototype.hasOwnProperty.call(state.meta, key) ? state.meta[key] : fallback;
    },
    async setMetaValue(key, value) {
      state.meta[key] = value;
      return value;
    }
  };
}
