import test from 'node:test';
import assert from 'node:assert/strict';
import { runDividendRefresh } from '../src/dividendRefresh.js';

const baseStock = {
  id: 'stock-1',
  symbol: 'AAPL',
  displayName: 'Apple',
  active: true,
  annualDividendPerShare: 2,
  dividendDataSource: 'manual',
  dividendProvider: '',
  dividendSourceSymbol: '',
  dividendCurrency: '',
  dividendYieldPercent: null,
  lastDividendValue: null,
  exDividendDate: '',
  dividendDate: '',
  dividendUpdatedAt: '2026-05-10T00:00:00.000Z',
  dividendLastCheckedAt: null,
  dividendLastError: '',
  dividendLastErrorAt: null,
  dividendHistory: [],
  currency: 'USD',
  updatedAt: '2026-05-10T00:00:00.000Z'
};

test('runDividendRefresh updates annual dividend per share from provider data', async () => {
  const store = createMemoryStore(baseStock);
  const result = await runDividendRefresh(
    store,
    {
      quoteTimeoutMs: 1000,
      dividendProviders: 'yahoo'
    },
    {
      now: new Date('2026-05-12T00:00:00.000Z'),
      fetchDividendInfo: async (symbol, options) => {
        assert.equal(symbol, 'AAPL');
        assert.equal(options.providers, 'yahoo');

        return {
          annualDividendPerShare: 3,
          dividendYieldPercent: 2.5,
          lastDividendValue: 0.75,
          exDividendDate: '2026-05-11T00:00:00.000Z',
          dividendDate: '2026-05-25T00:00:00.000Z',
          currency: 'USD',
          provider: 'yahoo',
          sourceSymbol: 'AAPL',
          attempts: [
            {
              provider: 'publicdata',
              status: 'error',
              error: '국내 종목만 조회합니다.'
            },
            {
              provider: 'yahoo',
              status: 'success',
              annualDividendPerShare: 3,
              lastDividendValue: 0.75,
              exDividendDate: '2026-05-11T00:00:00.000Z',
              dividendDate: '2026-05-25T00:00:00.000Z',
              currency: 'USD',
              sourceSymbol: 'AAPL'
            }
          ]
        };
      }
    }
  );

  assert.equal(result.checkedAt, '2026-05-12T00:00:00.000Z');
  assert.deepEqual(result.summary, {
    checked: 1,
    updated: 1,
    error: 0,
    skipped: 0
  });
  assert.equal(result.results[0].status, 'updated');
  assert.equal(result.results[0].attempts.length, 2);
  assert.equal(store.stocks[0].annualDividendPerShare, 3);
  assert.equal(store.stocks[0].dividendDataSource, 'yahoo');
  assert.equal(store.stocks[0].dividendProvider, 'yahoo');
  assert.equal(store.stocks[0].dividendYieldPercent, 2.5);
  assert.equal(store.stocks[0].lastDividendValue, 0.75);
  assert.equal(store.stocks[0].exDividendDate, '2026-05-11T00:00:00.000Z');
  assert.equal(store.stocks[0].dividendDate, '2026-05-25T00:00:00.000Z');
  assert.equal(store.stocks[0].dividendLastCheckedAt, '2026-05-12T00:00:00.000Z');
  assert.equal(store.stocks[0].dividendLastError, '');
  assert.equal(store.stocks[0].dividendLastDiagnostic.status, 'updated');
  assert.equal(store.stocks[0].dividendLastDiagnostic.provider, 'yahoo');
  assert.equal(store.stocks[0].dividendLastDiagnostic.lastDividendValue, 0.75);
  assert.equal(store.stocks[0].dividendLastDiagnostic.exDividendDate, '2026-05-11T00:00:00.000Z');
  assert.equal(store.stocks[0].dividendLastDiagnostic.attempts[1].status, 'success');
  assert.equal(store.stocks[0].dividendLastDiagnostic.attempts[1].exDividendDate, '2026-05-11T00:00:00.000Z');
  assert.equal(store.stocks[0].dividendHistory.length, 1);
  assert.equal(store.stocks[0].dividendHistory[0].previousAnnualDividendPerShare, 2);
  assert.equal(store.stocks[0].dividendHistory[0].annualDividendPerShare, 3);
});

test('runDividendRefresh records event date changes even when annual dividend is unchanged', async () => {
  const store = createMemoryStore({
    ...baseStock,
    annualDividendPerShare: 3,
    dividendDataSource: 'yahoo',
    dividendProvider: 'yahoo',
    lastDividendValue: 0.75,
    exDividendDate: '2026-05-11T00:00:00.000Z',
    dividendDate: '2026-05-25T00:00:00.000Z'
  });
  const result = await runDividendRefresh(
    store,
    {
      quoteTimeoutMs: 1000,
      dividendProviders: 'yahoo'
    },
    {
      now: new Date('2026-06-12T00:00:00.000Z'),
      fetchDividendInfo: async () => ({
        annualDividendPerShare: 3,
        dividendYieldPercent: 2.5,
        lastDividendValue: 0.75,
        exDividendDate: '2026-06-11T00:00:00.000Z',
        dividendDate: '2026-06-25T00:00:00.000Z',
        currency: 'USD',
        provider: 'yahoo',
        sourceSymbol: 'AAPL',
        attempts: []
      })
    }
  );

  assert.equal(result.results[0].status, 'updated');
  assert.equal(store.stocks[0].annualDividendPerShare, 3);
  assert.equal(store.stocks[0].exDividendDate, '2026-06-11T00:00:00.000Z');
  assert.equal(store.stocks[0].dividendDate, '2026-06-25T00:00:00.000Z');
  assert.equal(store.stocks[0].dividendHistory.length, 1);
  assert.equal(store.stocks[0].dividendHistory[0].reason, 'exDate,payDate');
  assert.equal(store.stocks[0].dividendHistory[0].previousExDividendDate, '2026-05-11T00:00:00.000Z');
  assert.equal(store.stocks[0].dividendHistory[0].exDividendDate, '2026-06-11T00:00:00.000Z');
});

test('runDividendRefresh preserves existing dividend value when provider fails', async () => {
  const store = createMemoryStore(baseStock);
  const result = await runDividendRefresh(
    store,
    {
      quoteTimeoutMs: 1000,
      dividendProviders: 'yahoo'
    },
    {
      now: new Date('2026-05-12T00:05:00.000Z'),
      fetchDividendInfo: async () => {
        const error = new Error('배당 정보를 찾을 수 없습니다: AAPL');
        error.attempts = [
          {
            provider: 'yahoo',
            status: 'error',
            error: '배당 정보를 찾을 수 없습니다: AAPL'
          }
        ];
        throw error;
      }
    }
  );

  assert.equal(result.results[0].status, 'error');
  assert.equal(store.stocks[0].annualDividendPerShare, 2);
  assert.equal(store.stocks[0].dividendDataSource, 'manual');
  assert.equal(store.stocks[0].dividendLastCheckedAt, '2026-05-12T00:05:00.000Z');
  assert.equal(store.stocks[0].dividendLastError, '배당 정보를 찾을 수 없습니다: AAPL');
  assert.equal(store.stocks[0].dividendLastDiagnostic.status, 'error');
  assert.equal(store.stocks[0].dividendLastDiagnostic.preservedAnnualDividendPerShare, 2);
  assert.equal(store.stocks[0].dividendLastDiagnostic.attempts[0].provider, 'yahoo');
});

test('runDividendRefresh skips inactive stocks', async () => {
  const store = createMemoryStore({
    ...baseStock,
    active: false
  });
  let fetchCalled = false;
  const result = await runDividendRefresh(
    store,
    {
      quoteTimeoutMs: 1000,
      dividendProviders: 'yahoo'
    },
    {
      fetchDividendInfo: async () => {
        fetchCalled = true;
      }
    }
  );

  assert.equal(result.results[0].status, 'skipped');
  assert.equal(fetchCalled, false);
});

function createMemoryStore(stock) {
  return {
    stocks: [{ ...stock }],
    async listStocks() {
      return this.stocks;
    },
    async replaceStock(nextStock) {
      const index = this.stocks.findIndex((item) => item.id === nextStock.id);
      this.stocks[index] = nextStock;
      return nextStock;
    }
  };
}
