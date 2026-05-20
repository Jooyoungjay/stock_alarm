import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildKisNaverQuoteComparison,
  normalizeComparisonMarkets
} from '../src/kisNaverCompare.js';

test('KIS/Naver quote comparison calculates market price differences', async () => {
  const attempts = [];
  const result = await buildKisNaverQuoteComparison({
    symbol: '336260',
    market: 'J,NX',
    now: '2026-05-20T00:00:00Z',
    fetchQuote: async (symbol, options) => {
      await options.onProviderAttempt({
        type: 'quote',
        provider: options.providers,
        symbol,
        status: 'success',
        durationMs: 7
      });
      attempts.push({
        provider: options.providers,
        market: options.kisMarketDivCode || ''
      });

      if (options.providers === 'naver') {
        return {
          symbol,
          name: '두산퓨얼셀',
          price: 10000,
          currency: 'KRW',
          exchange: 'Naver Finance',
          provider: 'naver',
          providerLabel: 'Naver Finance'
        };
      }

      return {
        symbol,
        name: '두산퓨얼셀',
        price: options.kisMarketDivCode === 'NX' ? 10150 : 9950,
        currency: 'KRW',
        exchange: `KIS/${options.kisMarketDivCode}`,
        provider: 'kis',
        providerLabel: '한국투자증권 Open API'
      };
    }
  });

  assert.equal(result.ok, true);
  assert.equal(result.symbol, '336260');
  assert.equal(result.inputSymbol, '336260');
  assert.equal(result.summary.kisTotal, 2);
  assert.equal(result.summary.kisSuccess, 2);
  assert.equal(result.summary.comparable, 2);
  assert.equal(result.naver.quote.price, 10000);
  assert.equal(result.results[0].market, 'J');
  assert.equal(result.results[0].comparison.difference, -50);
  assert.equal(result.results[1].market, 'NX');
  assert.equal(result.results[1].comparison.difference, 150);
  assert.equal(result.results[1].comparison.differencePercent, 1.5);
  assert.equal(result.recommendation.market, 'J');
  assert.equal(result.recommendation.absoluteDifference, 50);
  assert.match(result.recommendation.reason, /가격 차이/);
  assert.deepEqual(attempts, [
    { provider: 'naver', market: '' },
    { provider: 'kis', market: 'J' },
    { provider: 'kis', market: 'NX' }
  ]);
});

test('KIS/Naver quote comparison reports partial market failures', async () => {
  const result = await buildKisNaverQuoteComparison({
    symbol: '336260',
    market: 'all',
    kisAppSecret: 'very-secret-value',
    fetchQuote: async (_symbol, options) => {
      if (options.providers === 'naver') {
        return {
          symbol: '336260',
          price: 10000,
          currency: 'KRW',
          provider: 'naver'
        };
      }

      if (options.kisMarketDivCode === 'NX') {
        throw new Error('NX market failed with very-secret-value');
      }

      return {
        symbol: '336260',
        price: 10000,
        currency: 'KRW',
        provider: 'kis'
      };
    }
  });

  assert.equal(result.ok, false);
  assert.equal(result.summary.kisTotal, 3);
  assert.equal(result.summary.kisSuccess, 2);
  assert.equal(result.summary.kisFailed, 1);
  assert.match(result.message, /1개 KIS 시장 조회가 실패/);
  assert.equal(result.results.find((item) => item.market === 'NX').ok, false);
  assert.doesNotMatch(result.results.find((item) => item.market === 'NX').error, /very-secret-value/);
});

test('normalizeComparisonMarkets supports aliases and rejects invalid markets', () => {
  assert.deepEqual(normalizeComparisonMarkets('all'), ['J', 'NX', 'UN']);
  assert.deepEqual(normalizeComparisonMarkets('KRX,NXT,통합'), ['J', 'NX', 'UN']);
  assert.throws(() => normalizeComparisonMarkets('BAD'), /KIS 시장 구분/);
});
