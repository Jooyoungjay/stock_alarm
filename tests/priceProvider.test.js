import test from 'node:test';
import assert from 'node:assert/strict';
import {
  fetchHistoricalHighSince,
  fetchQuote,
  isKoreanStockSymbol,
  normalizeProviders,
  parseAlphaVantageQuote,
  parseNaverDailyChart,
  parseNaverQuote,
  parseKisQuote,
  parseNxtQuote,
  parsePublicDataStockPriceResponse,
  parseStooqCsv,
  parseStooqHistoricalCsv,
  parseYahooHistoricalChart,
  toNaverSymbol,
  toStooqSymbol
} from '../src/priceProvider.js';

test('provider list is normalized from a comma separated env value', () => {
  assert.deepEqual(normalizeProviders(' naver, stooq ,, yahoo '), ['naver', 'stooq', 'yahoo']);
  assert.deepEqual(normalizeProviders('public,data.go.kr,alpha-vantage'), [
    'publicdata',
    'publicdata',
    'alphavantage'
  ]);
  assert.deepEqual(normalizeProviders('nextrade,nextrade-ats,nxt-ats'), ['nxt', 'nxt', 'nxt']);
  assert.deepEqual(normalizeProviders('kis,korea-investment,한국투자증권'), ['kis', 'kis', 'kis']);
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

test('publicdata is skipped for quotes because it is historical only', async () => {
  const attempts = [];

  await assert.rejects(
    () =>
      fetchQuote('005930', {
        providers: 'publicdata',
        onProviderAttempt: (attempt) => attempts.push(attempt)
      }),
    /사용할 수 있는 시세 provider가 없습니다/
  );

  assert.deepEqual(
    attempts.map((attempt) => [attempt.provider, attempt.status, attempt.reason]),
    [['publicdata', 'skipped', 'historical_only_provider']]
  );
});

test('nxt quote provider is skipped until a contract endpoint is configured', async () => {
  const attempts = [];

  await assert.rejects(
    () =>
      fetchQuote('336260', {
        providers: 'nxt',
        onProviderAttempt: (attempt) => attempts.push(attempt)
      }),
    /사용할 수 있는 시세 provider가 없습니다/
  );

  assert.deepEqual(
    attempts.map((attempt) => [attempt.provider, attempt.status, attempt.reason]),
    [['nxt', 'skipped', 'missing_nxt_quote_endpoint']]
  );
});

test('KIS quote provider is skipped until broker credentials are configured', async () => {
  const attempts = [];

  await assert.rejects(
    () =>
      fetchQuote('005930', {
        providers: 'kis',
        onProviderAttempt: (attempt) => attempts.push(attempt)
      }),
    /사용할 수 있는 시세 provider가 없습니다/
  );

  assert.deepEqual(
    attempts.map((attempt) => [attempt.provider, attempt.status, attempt.reason]),
    [['kis', 'skipped', 'missing_kis_credentials']]
  );
});

test('publicdata historical high reports a missing key as a skipped attempt', async () => {
  const attempts = [];

  await assert.rejects(
    () =>
      fetchHistoricalHighSince('005930', '2026-05-01', {
        providers: 'publicdata',
        onProviderAttempt: (attempt) => attempts.push(attempt)
      }),
    /사용할 수 있는 일봉 provider가 없습니다/
  );

  assert.deepEqual(
    attempts.map((attempt) => [attempt.provider, attempt.status, attempt.reason]),
    [['publicdata', 'skipped', 'missing_data_go_kr_service_key']]
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

test('NXT quote response is parsed into a normalized quote', () => {
  const quote = parseNxtQuote(
    {
      data: {
        code: '336260',
        name: '두산퓨얼셀',
        tradePrice: '96,700',
        currency: 'KRW',
        marketState: 'OPEN',
        timestamp: 1778476711775
      }
    },
    '336260'
  );

  assert.equal(quote.symbol, '336260');
  assert.equal(quote.name, '두산퓨얼셀');
  assert.equal(quote.price, 96700);
  assert.equal(quote.provider, 'nxt');
  assert.equal(quote.providerLabel, 'NexTrade ATS');
  assert.equal(quote.dataDelay, 'realtime_contract');
  assert.equal(quote.venue, 'nxt');
  assert.equal(quote.licenseType, 'contract');
  assert.equal(quote.regularMarketTime, '2026-05-11T05:18:31.775Z');
});

test('KIS quote response is parsed into a normalized quote', () => {
  const quote = parseKisQuote(
    {
      rt_cd: '0',
      output: {
        stck_shrn_iscd: '005930',
        hts_kor_isnm: '삼성전자',
        stck_prpr: '68,500',
        stck_bsop_date: '20260520',
        stck_cntg_hour: '134501'
      }
    },
    '005930.KS',
    {
      kisMarketDivCode: 'UN'
    }
  );

  assert.equal(quote.symbol, '005930');
  assert.equal(quote.name, '삼성전자');
  assert.equal(quote.price, 68500);
  assert.equal(quote.currency, 'KRW');
  assert.equal(quote.exchange, 'KIS/통합');
  assert.equal(quote.provider, 'kis');
  assert.equal(quote.providerLabel, '한국투자증권 Open API');
  assert.equal(quote.dataDelay, 'realtime_polling');
  assert.equal(quote.venue, 'integrated');
  assert.equal(quote.licenseType, 'broker');
  assert.equal(quote.regularMarketTime, '2026-05-20T04:45:01.000Z');
});

test('fetchQuote calls KIS endpoint with broker headers', async () => {
  const attempts = [];
  const quote = await fetchQuote('005930.KS', {
    providers: 'kis',
    kisApiBaseUrl: 'https://openapi.koreainvestment.com:9443',
    kisAppKey: 'app-key',
    kisAppSecret: 'app-secret',
    kisAccessToken: 'Bearer access-token',
    kisMarketDivCode: 'NX',
    timeoutMs: 1000,
    onProviderAttempt: (attempt) => attempts.push(attempt),
    fetch: async (url, request) => {
      assert.equal(String(url.origin), 'https://openapi.koreainvestment.com:9443');
      assert.equal(url.pathname, '/uapi/domestic-stock/v1/quotations/inquire-price');
      assert.equal(url.searchParams.get('FID_COND_MRKT_DIV_CODE'), 'NX');
      assert.equal(url.searchParams.get('FID_INPUT_ISCD'), '005930');
      assert.equal(request.headers.authorization, 'Bearer access-token');
      assert.equal(request.headers.appkey, 'app-key');
      assert.equal(request.headers.appsecret, 'app-secret');
      assert.equal(request.headers.tr_id, 'FHKST01010100');
      assert.equal(request.headers.custtype, 'P');

      return jsonResponse({
        rt_cd: '0',
        output: {
          stck_shrn_iscd: '005930',
          hts_kor_isnm: '삼성전자',
          stck_prpr: '68500'
        }
      });
    }
  });

  assert.equal(quote.price, 68500);
  assert.equal(quote.provider, 'kis');
  assert.equal(quote.venue, 'nxt');
  assert.equal(attempts[0].provider, 'kis');
  assert.equal(attempts[0].status, 'success');
});

test('fetchQuote calls configured NXT endpoint with API key headers', async () => {
  const attempts = [];
  const quote = await fetchQuote('336260.KS', {
    providers: 'nxt',
    nxtQuoteEndpointTemplate: 'https://market.example.com/nxt/quotes/{symbol}',
    nxtApiKey: 'secret-key',
    timeoutMs: 1000,
    onProviderAttempt: (attempt) => attempts.push(attempt),
    fetch: async (url, request) => {
      assert.equal(String(url), 'https://market.example.com/nxt/quotes/336260');
      assert.equal(request.headers.Authorization, 'Bearer secret-key');

      return jsonResponse({
        quote: {
          symbol: '336260',
          name: '두산퓨얼셀',
          price: 96700
        }
      });
    }
  });

  assert.equal(quote.price, 96700);
  assert.equal(quote.provider, 'nxt');
  assert.equal(attempts[0].provider, 'nxt');
  assert.equal(attempts[0].status, 'success');
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

test('publicdata stock price response is parsed into a highest daily price', () => {
  const high = parsePublicDataStockPriceResponse(
    {
      response: {
        header: {
          resultCode: '00',
          resultMsg: 'NORMAL SERVICE.'
        },
        body: {
          items: {
            item: [
              {
                basDt: '20260507',
                srtnCd: '005930',
                itmsNm: '삼성전자',
                hipr: '283000'
              },
              {
                basDt: '20260508',
                srtnCd: '005930',
                itmsNm: '삼성전자',
                hipr: '287,500'
              },
              {
                basDt: '20260509',
                srtnCd: '000660',
                itmsNm: 'SK하이닉스',
                hipr: '350000'
              }
            ]
          }
        }
      }
    },
    '005930'
  );

  assert.equal(high.symbol, '005930');
  assert.equal(high.highPrice, 287500);
  assert.equal(high.highPriceAt, '2026-05-08T00:00:00.000Z');
  assert.equal(high.provider, 'publicdata');
  assert.equal(high.providerLabel, '공공데이터포털 주식시세');
  assert.equal(high.dataDelay, 'eod');
  assert.equal(high.venue, 'krx_estimated');
  assert.equal(high.sourceSymbol, '삼성전자');
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

function jsonResponse(payload) {
  return {
    ok: true,
    status: 200,
    async arrayBuffer() {
      return new TextEncoder().encode(JSON.stringify(payload)).buffer;
    }
  };
}
