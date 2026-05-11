import test from 'node:test';
import assert from 'node:assert/strict';
import {
  fetchQuote,
  isKoreanStockSymbol,
  normalizeProviders,
  parseAlphaVantageQuote,
  parseNaverQuote,
  parseStooqCsv,
  toNaverSymbol,
  toStooqSymbol
} from '../src/priceProvider.js';

test('provider list is normalized from a comma separated env value', () => {
  assert.deepEqual(normalizeProviders(' naver, stooq ,, yahoo '), ['naver', 'stooq', 'yahoo']);
});

test('fetchQuote reports when every configured provider is skipped', async () => {
  await assert.rejects(
    () => fetchQuote('AAPL', { providers: 'naver,alphavantage' }),
    /사용할 수 있는 시세 provider가 없습니다/
  );
});

test('Korean symbols are detected and converted for Naver', () => {
  assert.equal(isKoreanStockSymbol('005930'), true);
  assert.equal(isKoreanStockSymbol('005930.KS'), true);
  assert.equal(isKoreanStockSymbol('035720.KQ'), true);
  assert.equal(isKoreanStockSymbol('AAPL'), false);
  assert.equal(toNaverSymbol('005930.KS'), '005930');
});

test('US symbols are converted for Stooq', () => {
  assert.equal(toStooqSymbol('AAPL'), 'aapl.us');
  assert.equal(toStooqSymbol('BRK.B.US'), 'brk.b.us');
  assert.throws(() => toStooqSymbol('005930.KS'), /한국 주식/);
});

test('Stooq CSV quote is parsed into a normalized quote', () => {
  const quote = parseStooqCsv(
    [
      'Symbol,Date,Time,Open,High,Low,Close,Volume',
      'AAPL.US,2026-05-08,22:00:21,290.01,294.76,290,293.32,52692761'
    ].join('\n'),
    'AAPL'
  );

  assert.equal(quote.symbol, 'AAPL');
  assert.equal(quote.price, 293.32);
  assert.equal(quote.exchange, 'Stooq');
  assert.equal(quote.provider, 'stooq');
});

test('Naver quote response is parsed into a normalized quote', () => {
  const quote = parseNaverQuote(
    {
      result: {
        time: 1778476711775,
        areas: [
          {
            datas: [
              {
                cd: '005930',
                nm: '삼성전자',
                nv: 287750,
                ms: 'OPEN'
              }
            ]
          }
        ]
      }
    },
    '005930.KS'
  );

  assert.equal(quote.symbol, '005930.KS');
  assert.equal(quote.name, '삼성전자');
  assert.equal(quote.price, 287750);
  assert.equal(quote.currency, 'KRW');
  assert.equal(quote.provider, 'naver');
});

test('Alpha Vantage global quote is parsed into a normalized quote', () => {
  const quote = parseAlphaVantageQuote(
    {
      'Global Quote': {
        '01. symbol': 'IBM',
        '05. price': '229.7600',
        '07. latest trading day': '2026-05-08'
      }
    },
    'IBM'
  );

  assert.equal(quote.symbol, 'IBM');
  assert.equal(quote.price, 229.76);
  assert.equal(quote.provider, 'alphavantage');
});
