import test from 'node:test';
import assert from 'node:assert/strict';
import {
  fetchQuote,
  isKoreanStockSymbol,
  normalizeProviders,
  parseAlphaVantageQuote,
  parseNaverDailyChart,
  parseNaverQuote,
  parseStooqCsv,
  parseStooqHistoricalCsv,
  parseYahooHistoricalChart,
  toNaverSymbol,
  toStooqSymbol
} from '../src/priceProvider.js';

test('provider list is normalized from a comma separated env value', () => {
  assert.deepEqual(normalizeProviders(' naver, stooq ,, yahoo '), ['naver', 'stooq', 'yahoo']);
});

test('fetchQuote reports when every configured provider is skipped', async () => {
  const attempts = [];

  await assert.rejects(
    () =>
      fetchQuote('AAPL', {
        providers: 'naver,alphavantage',
        onProviderAttempt: (attempt) => attempts.push(attempt)
      }),
    /사용할 수 있는 시세 provider가 없습니다/
  );

  assert.deepEqual(
    attempts.map((attempt) => [attempt.provider, attempt.status, attempt.reason]),
    [
      ['naver', 'skipped', 'not_korean_symbol'],
      ['alphavantage', 'skipped', 'missing_alpha_vantage_key']
    ]
  );
});

test('Korean symbols are detected and converted for Naver', () => {
  assert.equal(isKoreanStockSymbol('005930'), true);
  assert.equal(isKoreanStockSymbol('005930.KS'), true);
  assert.equal(isKoreanStockSymbol('035720.KQ'), true);
  assert.equal(isKoreanStockSymbol('33626L'), true);
  assert.equal(isKoreanStockSymbol('33626L.KS'), true);
  assert.equal(isKoreanStockSymbol('AAPL'), false);
  assert.equal(toNaverSymbol('005930.KS'), '005930');
  assert.equal(toNaverSymbol('33626L.KS'), '33626L');
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
  assert.equal(quote.providerLabel, 'Stooq');
  assert.equal(quote.dataDelay, 'delayed');
  assert.equal(quote.venue, 'us');
});

test('Stooq historical CSV is parsed into a highest daily price', () => {
  const high = parseStooqHistoricalCsv(
    [
      'Date,Open,High,Low,Close,Volume',
      '2026-05-07,285,290,282,288,1000',
      '2026-05-08,288,294.76,286,293.32,2000',
      '2026-05-11,292,293,289,290,1500'
    ].join('\n'),
    'AAPL'
  );

  assert.equal(high.symbol, 'AAPL');
  assert.equal(high.highPrice, 294.76);
  assert.equal(high.highPriceAt, '2026-05-08T00:00:00.000Z');
  assert.equal(high.provider, 'stooq');
  assert.equal(high.providerLabel, 'Stooq');
  assert.equal(high.dataDelay, 'eod');
  assert.equal(high.points, 3);
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
  assert.equal(quote.providerLabel, 'Naver Finance');
  assert.equal(quote.dataDelay, 'realtime_estimated');
  assert.equal(quote.venue, 'krx_estimated');
});

test('Naver daily chart is parsed into a highest daily price', () => {
  const high = parseNaverDailyChart(
    [
      "['날짜', '시가', '고가', '저가', '종가', '거래량']",
      "['20260507', 280000, 283000, 279000, 282000, 1000]",
      "['20260508', 282000, 287500, 281000, 286000, 2000]",
      "['20260511', 286000, 286500, 280000, 284500, 1500]"
    ].join('\n'),
    '005930'
  );

  assert.equal(high.symbol, '005930');
  assert.equal(high.highPrice, 287500);
  assert.equal(high.highPriceAt, '2026-05-08T00:00:00.000Z');
  assert.equal(high.currency, 'KRW');
  assert.equal(high.provider, 'naver');
  assert.equal(high.dataDelay, 'eod');
  assert.equal(high.venue, 'krx_estimated');
});

test('Yahoo historical chart is parsed into a highest daily price', () => {
  const high = parseYahooHistoricalChart(
    {
      chart: {
        result: [
          {
            meta: {
              currency: 'USD',
              fullExchangeName: 'NasdaqGS'
            },
            timestamp: [1777642200, 1777901400, 1777987800],
            indicators: {
              quote: [
                {
                  high: [290.12, 294.76, 291.5]
                }
              ]
            }
          }
        ]
      }
    },
    'AAPL'
  );

  assert.equal(high.symbol, 'AAPL');
  assert.equal(high.highPrice, 294.76);
  assert.equal(high.highPriceAt, '2026-05-04T00:00:00.000Z');
  assert.equal(high.currency, 'USD');
  assert.equal(high.provider, 'yahoo');
  assert.equal(high.dataDelay, 'eod');
  assert.equal(high.venue, 'us');
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
  assert.equal(quote.dataDelay, 'delayed');
  assert.equal(quote.licenseType, 'keyed');
});
