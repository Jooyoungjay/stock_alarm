import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildKisNaverAutoCompareCandidates,
  lastKisNaverAutoCompareMetaKey,
  normalizeKisNaverAutoCompareSymbol,
  runKisNaverAutoCompare
} from '../src/kisNaverAutoCompare.js';

test('buildKisNaverAutoCompareCandidates keeps active unique Korean stocks only', () => {
  const candidates = buildKisNaverAutoCompareCandidates(
    [
      { id: 'stock-1', symbol: '336260.KS', displayName: '두산퓨얼셀', active: true },
      { id: 'stock-2', symbol: '336260', displayName: '중복', active: true },
      { id: 'stock-3', symbol: '33626L', displayName: '두산퓨얼셀우', active: true },
      { id: 'stock-4', symbol: 'AAPL', displayName: 'Apple', active: true },
      { id: 'stock-5', symbol: '005930', displayName: '삼성전자', active: false }
    ],
    { limit: 5 }
  );

  assert.equal(normalizeKisNaverAutoCompareSymbol('33626L.KS'), '33626L');
  assert.deepEqual(
    candidates.map((item) => item.symbol),
    ['336260', '33626L']
  );
});

test('runKisNaverAutoCompare skips when disabled unless forced', async () => {
  const store = createMemoryStore([{ id: 'stock-1', symbol: '336260', active: true }]);
  let called = false;
  const result = await runKisNaverAutoCompare(
    store,
    { kisNaverAutoCompareEnabled: false },
    {
      now: new Date('2026-05-20T00:00:00.000Z'),
      compare: async () => {
        called = true;
      }
    }
  );

  assert.equal(result.skipped, true);
  assert.equal(result.reason, 'kis_naver_auto_compare_disabled');
  assert.equal(result.checkedAt, '2026-05-20T00:00:00.000Z');
  assert.equal(called, false);
  assert.equal(store.meta[lastKisNaverAutoCompareMetaKey].skipped, true);
});

test('runKisNaverAutoCompare records comparison history and trend snapshots', async () => {
  const store = createMemoryStore([
    { id: 'stock-1', symbol: '336260', displayName: '두산퓨얼셀', active: true },
    { id: 'stock-2', symbol: 'AAPL', displayName: 'Apple', active: true },
    { id: 'stock-3', symbol: '005930', displayName: '삼성전자', active: true }
  ]);
  const compared = [];
  const result = await runKisNaverAutoCompare(
    store,
    {
      kisNaverAutoCompareEnabled: true,
      kisNaverAutoCompareLimit: 3,
      kisNaverAutoCompareMarkets: 'J',
      kisNaverAutoCompareDriftThresholdPercent: 1
    },
    {
      now: new Date('2026-05-20T01:00:00.000Z'),
      compare: async (body) => {
        compared.push(body);
        return createComparison(body.symbol, {
          generatedAt: `2026-05-20T01:0${compared.length}:00.000Z`
        });
      }
    }
  );

  assert.deepEqual(compared.map((item) => item.symbol), ['336260', '005930']);
  assert.deepEqual(compared.map((item) => item.market), ['J', 'J']);
  assert.equal(result.summary.checked, 2);
  assert.equal(result.summary.success, 2);
  assert.equal(result.kisNaverCompareHistory.length, 2);
  assert.equal(result.kisNaverCompareTrend.historyCount, 2);
  assert.equal(result.kisNaverCompareTrend.markets[0].market, 'J');
  assert.equal(result.kisNaverTrendRecommendation.market, 'J');
  assert.equal(store.meta.kisNaverCompareHistory.length, 2);
  assert.equal(store.meta[lastKisNaverAutoCompareMetaKey].summary.success, 2);
});

test('runKisNaverAutoCompare keeps going when one comparison fails', async () => {
  const store = createMemoryStore([
    { id: 'stock-1', symbol: '336260', displayName: '두산퓨얼셀', active: true },
    { id: 'stock-2', symbol: '005930', displayName: '삼성전자', active: true }
  ]);
  const result = await runKisNaverAutoCompare(
    store,
    { kisNaverAutoCompareEnabled: true, kisNaverAutoCompareLimit: 2 },
    {
      now: new Date('2026-05-20T02:00:00.000Z'),
      compare: async (body) => {
        if (body.symbol === '336260') {
          throw new Error('KIS timeout');
        }

        return createComparison(body.symbol);
      }
    }
  );

  assert.equal(result.summary.checked, 2);
  assert.equal(result.summary.success, 1);
  assert.equal(result.summary.error, 1);
  assert.equal(result.results[0].status, 'error');
  assert.equal(result.results[1].status, 'checked');
  assert.equal(store.meta.kisNaverCompareHistory.length, 1);
});

function createComparison(symbol, options = {}) {
  return {
    id: `compare-${symbol}-${options.generatedAt || 'now'}`,
    ok: true,
    generatedAt: options.generatedAt || '2026-05-20T00:00:00.000Z',
    symbol,
    inputSymbol: symbol,
    markets: [{ code: 'J', label: 'KRX' }],
    summary: {
      total: 1,
      kisSuccess: 1,
      kisFailed: 0,
      comparable: 1
    },
    drift: {
      thresholdPercent: 1,
      status: 'normal',
      comparable: 1,
      normal: 1,
      warning: 0,
      critical: 0,
      abnormal: 0,
      maxAbsoluteDifferencePercent: 0.2,
      worstMarket: 'J',
      worstMarketLabel: 'KRX',
      message: ''
    },
    recommendation: {
      market: 'J',
      marketLabel: 'KRX',
      difference: 20,
      differencePercent: 0.2,
      absoluteDifference: 20,
      reason: '가격 차이가 가장 작습니다.'
    },
    naver: {
      ok: true,
      quote: {
        symbol,
        price: 10000,
        currency: 'KRW',
        provider: 'naver'
      }
    },
    results: [
      {
        market: 'J',
        marketLabel: 'KRX',
        ok: true,
        quote: {
          symbol,
          price: 10020,
          currency: 'KRW',
          provider: 'kis'
        },
        comparison: {
          comparable: true,
          difference: 20,
          differencePercent: 0.2,
          absoluteDifference: 20
        },
        drift: {
          status: 'normal',
          comparable: true,
          absoluteDifferencePercent: 0.2,
          abnormal: false
        }
      }
    ]
  };
}

function createMemoryStore(stocks) {
  return {
    stocks,
    meta: {},
    async listStocks() {
      return this.stocks;
    },
    async setMetaValue(key, value) {
      this.meta[key] = value;
      return value;
    },
    async getMetaValue(key, fallback = null) {
      return this.meta[key] ?? fallback;
    },
    async getKisNaverCompareHistory(limit = 20) {
      return (this.meta.kisNaverCompareHistory || []).slice(0, limit);
    },
    async recordKisNaverCompareHistory(entry) {
      this.meta.kisNaverCompareHistory = [
        entry,
        ...(this.meta.kisNaverCompareHistory || [])
      ].slice(0, 100);
      return this.getKisNaverCompareHistory(12);
    }
  };
}
