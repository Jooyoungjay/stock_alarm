import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildDailyBriefing,
  buildRiskRanking,
  formatDailyBriefingMessage,
  isDailyBriefingDue,
  normalizeBriefingTime,
  runDailyBriefing
} from '../src/portfolioBriefing.js';

const baseStock = {
  id: 'stock-1',
  symbol: '336260',
  displayName: '두산퓨얼셀',
  purchasePrice: 90000,
  purchaseDate: '2026-05-11',
  alertType: 'high_drawdown',
  thresholdPercent: 5,
  targetPrice: null,
  alertCooldownMinutes: 30,
  active: true,
  highPrice: 100000,
  highPriceAt: '2026-05-12T00:00:00.000Z',
  highPriceSource: 'historical_daily',
  lastPrice: 96000,
  lastCheckedAt: '2026-05-13T06:00:00.000Z',
  lastCheckStatus: 'checked',
  lastError: '',
  alertState: 'clear',
  alertRepeatCount: 0,
  currency: 'KRW'
};

test('buildRiskRanking sorts alert and near-threshold stocks first', () => {
  const ranking = buildRiskRanking([
    {
      ...baseStock,
      id: 'ok',
      symbol: 'AAPL',
      displayName: 'Apple',
      highPrice: 100,
      lastPrice: 120,
      currency: 'USD'
    },
    {
      ...baseStock,
      id: 'warning',
      symbol: '000660',
      displayName: 'SK하이닉스',
      highPrice: 100000,
      lastPrice: 97000
    },
    {
      ...baseStock,
      id: 'alert',
      symbol: '336260',
      displayName: '두산퓨얼셀',
      highPrice: 100000,
      lastPrice: 94000,
      alertState: 'triggered'
    }
  ]);

  assert.equal(ranking[0].stockId, 'alert');
  assert.equal(ranking[0].level, 'alert');
  assert.equal(ranking[1].stockId, 'warning');
  assert.equal(ranking[1].level, 'warning');
  assert.equal(ranking[2].stockId, 'ok');
  assert.equal(ranking[2].level, 'ok');
  assert.equal(ranking[0].rank, 1);
});

test('buildDailyBriefing summarizes counts and portfolio metrics', () => {
  const briefing = buildDailyBriefing(
    [
      {
        ...baseStock,
        lastPrice: 94000,
        quantity: 10,
        annualDividendPerShare: 1200,
        alertState: 'triggered'
      },
      {
        ...baseStock,
        id: 'inactive',
        symbol: '005930',
        displayName: '삼성전자',
        active: false,
        quantity: 5
      }
    ],
    {
      now: new Date(2026, 4, 13, 16, 20)
    }
  );

  assert.equal(briefing.counts.total, 2);
  assert.equal(briefing.counts.active, 1);
  assert.equal(briefing.counts.alert, 1);
  assert.equal(briefing.counts.inactive, 1);
  assert.equal(briefing.topRisks.length, 1);
  assert.equal(briefing.portfolio[0].expectedAnnualDividend, 12000);
  assert.equal(briefing.portfolio[0].totalReturnAmount, 82000);
  assert.ok(Math.abs(briefing.portfolio[0].totalReturnPercent - 6.0740740741) < 0.000001);

  const message = formatDailyBriefingMessage(briefing);
  assert.match(message, /일일 브리핑/);
  assert.match(message, /위험도 순위/);
  assert.match(message, /두산퓨얼셀/);
  assert.match(message, /배당 포함 \+82,000 KRW \(\+6.07%\)/);
});

test('runDailyBriefing sends once per local day after scheduled time', async () => {
  const sent = [];
  const store = createMemoryStore([baseStock]);
  const config = {
    telegramBotToken: 'token',
    telegramChatId: 'chat',
    dailyBriefingEnabled: true,
    dailyBriefingTime: '16:10',
    dailyBriefingWarningDistancePercent: 5,
    dailyBriefingTopLimit: 5
  };

  const first = await runDailyBriefing(store, config, {
    now: new Date(2026, 4, 13, 16, 20),
    sendTelegramMessage: async (_config, message) => {
      sent.push(message);
    }
  });

  assert.equal(first.deliveryStatus, 'sent');
  assert.equal(store.meta.lastDailyBriefingDate, '2026-05-13');
  assert.equal(sent.length, 1);

  const second = await runDailyBriefing(store, config, {
    now: new Date(2026, 4, 13, 17, 20),
    sendTelegramMessage: async (_config, message) => {
      sent.push(message);
    }
  });

  assert.equal(second.skipped, true);
  assert.equal(second.reason, 'daily_briefing_already_sent');
  assert.equal(sent.length, 1);
});

test('daily briefing schedule helpers normalize and detect due time', () => {
  assert.equal(normalizeBriefingTime('7:05'), '07:05');
  assert.equal(normalizeBriefingTime('bad'), '16:10');
  assert.equal(isDailyBriefingDue(new Date(2026, 4, 13, 16, 9), '16:10'), false);
  assert.equal(isDailyBriefingDue(new Date(2026, 4, 13, 16, 10), '16:10'), true);
});

function createMemoryStore(stocks) {
  return {
    stocks,
    meta: {},
    async listStocks() {
      return this.stocks;
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
