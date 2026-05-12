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
          sourceSymbol: 'AAPL'
        };
      }
    }
  );

  assert.equal(result.checkedAt, '2026-05-12T00:00:00.000Z');
  assert.equal(result.results[0].status, 'updated');
  assert.equal(store.stocks[0].annualDividendPerShare, 3);
  assert.equal(store.stocks[0].dividendDataSource, 'yahoo');
  assert.equal(store.stocks[0].dividendProvider, 'yahoo');
  assert.equal(store.stocks[0].dividendYieldPercent, 2.5);
  assert.equal(store.stocks[0].lastDividendValue, 0.75);
  assert.equal(store.stocks[0].dividendLastCheckedAt, '2026-05-12T00:00:00.000Z');
  assert.equal(store.stocks[0].dividendLastError, '');
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
        throw new Error('배당 정보를 찾을 수 없습니다: AAPL');
      }
    }
  );

  assert.equal(result.results[0].status, 'error');
  assert.equal(store.stocks[0].annualDividendPerShare, 2);
  assert.equal(store.stocks[0].dividendDataSource, 'manual');
  assert.equal(store.stocks[0].dividendLastCheckedAt, '2026-05-12T00:05:00.000Z');
  assert.equal(store.stocks[0].dividendLastError, '배당 정보를 찾을 수 없습니다: AAPL');
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
