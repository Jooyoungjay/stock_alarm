import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeDividendProviders,
  parseYahooDividendSummary,
  toYahooDividendSymbol
} from '../src/dividendProvider.js';

test('parseYahooDividendSummary extracts annual dividend data', () => {
  const info = parseYahooDividendSummary(
    {
      quoteSummary: {
        result: [
          {
            price: {
              currency: 'USD',
              regularMarketPrice: { raw: 200 }
            },
            summaryDetail: {
              dividendRate: { raw: 4.8 },
              dividendYield: { raw: 0.024 },
              lastDividendValue: { raw: 1.2 },
              exDividendDate: { raw: 1778457600 }
            },
            calendarEvents: {
              dividendDate: { raw: 1779667200 }
            }
          }
        ],
        error: null
      }
    },
    'AAPL',
    'AAPL'
  );

  assert.equal(info.symbol, 'AAPL');
  assert.equal(info.annualDividendPerShare, 4.8);
  assert.equal(info.dividendYieldPercent, 2.4);
  assert.equal(info.lastDividendValue, 1.2);
  assert.equal(info.exDividendDate, '2026-05-11T00:00:00.000Z');
  assert.equal(info.dividendDate, '2026-05-25T00:00:00.000Z');
  assert.equal(info.currency, 'USD');
  assert.equal(info.provider, 'yahoo');
});

test('parseYahooDividendSummary infers annual dividend from yield when rate is missing', () => {
  const info = parseYahooDividendSummary(
    {
      quoteSummary: {
        result: [
          {
            price: {
              currency: 'USD',
              regularMarketPrice: { raw: 100 }
            },
            summaryDetail: {
              dividendYield: { raw: 0.03 }
            }
          }
        ],
        error: null
      }
    },
    'AAPL'
  );

  assert.equal(info.annualDividendPerShare, 3);
  assert.equal(info.dividendYieldPercent, 3);
});

test('parseYahooDividendSummary rejects payloads without dividend data', () => {
  assert.throws(
    () =>
      parseYahooDividendSummary(
        {
          quoteSummary: {
            result: [
              {
                price: { currency: 'USD' },
                summaryDetail: {}
              }
            ],
            error: null
          }
        },
        'AAPL'
      ),
    /배당 정보/
  );
});

test('toYahooDividendSymbol maps plain Korean codes to Yahoo KOSPI symbols', () => {
  assert.equal(toYahooDividendSymbol('336260'), '336260.KS');
  assert.equal(toYahooDividendSymbol('058470.KQ'), '058470.KQ');
  assert.equal(toYahooDividendSymbol('AAPL'), 'AAPL');
});

test('normalizeDividendProviders keeps supported provider order', () => {
  assert.deepEqual(normalizeDividendProviders(' yahoo '), ['yahoo']);
  assert.deepEqual(normalizeDividendProviders(''), ['yahoo']);
});
