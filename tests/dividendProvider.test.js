import test from 'node:test';
import assert from 'node:assert/strict';
import {
  fetchDividendInfo,
  findOpenDartCorpMatch,
  normalizeDividendProviders,
  parseAlphaVantageDividends,
  parseOpenDartCorpCodeXml,
  parseOpenDartAlotMatter,
  parsePublicDataDividendResponse,
  parseYahooDividendSummary,
  toYahooDividendSymbol
} from '../src/dividendProvider.js';

test('fetchDividendInfo records provider attempts until success', async () => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async () => ({
    ok: true,
    async json() {
      return {
        quoteSummary: {
          result: [
            {
              price: {
                currency: 'USD',
                regularMarketPrice: { raw: 200 }
              },
              summaryDetail: {
                dividendRate: { raw: 4.8 }
              }
            }
          ],
          error: null
        }
      };
    }
  });

  try {
    const info = await fetchDividendInfo('AAPL', {
      providers: 'unknown,yahoo'
    });

    assert.equal(info.provider, 'yahoo');
    assert.equal(info.attempts.length, 2);
    assert.equal(info.attempts[0].provider, 'unknown');
    assert.equal(info.attempts[0].status, 'error');
    assert.equal(info.attempts[1].provider, 'yahoo');
    assert.equal(info.attempts[1].status, 'success');
    assert.equal(info.attempts[1].annualDividendPerShare, 4.8);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('fetchDividendInfo attaches provider attempts to failures', async () => {
  await assert.rejects(
    () =>
      fetchDividendInfo('AAPL', {
        providers: 'unknown'
      }),
    (error) => {
      assert.match(error.message, /배당 정보 조회 실패/);
      assert.equal(error.attempts.length, 1);
      assert.equal(error.attempts[0].provider, 'unknown');
      assert.equal(error.attempts[0].status, 'error');
      return true;
    }
  );
});

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
  assert.equal(toYahooDividendSymbol('33626L'), '33626L.KS');
  assert.equal(toYahooDividendSymbol('058470.KQ'), '058470.KQ');
  assert.equal(toYahooDividendSymbol('AAPL'), 'AAPL');
});

test('normalizeDividendProviders keeps supported provider order', () => {
  assert.deepEqual(normalizeDividendProviders(' public, open-dart, alpha-vantage, yahoo '), [
    'publicdata',
    'opendart',
    'alphavantage',
    'yahoo'
  ]);
  assert.deepEqual(normalizeDividendProviders(''), [
    'publicdata',
    'opendart',
    'alphavantage',
    'yahoo'
  ]);
});

test('parseAlphaVantageDividends sums recent dividend events', () => {
  const info = parseAlphaVantageDividends(
    {
      symbol: 'AAPL',
      data: [
        {
          ex_dividend_date: '2026-02-10',
          payment_date: '2026-02-18',
          amount: '0.26'
        },
        {
          ex_dividend_date: '2025-11-10',
          payment_date: '2025-11-18',
          amount: '0.26'
        },
        {
          ex_dividend_date: '2025-08-10',
          payment_date: '2025-08-18',
          amount: '0.25'
        },
        {
          ex_dividend_date: '2025-05-10',
          payment_date: '2025-05-18',
          amount: '0.25'
        }
      ]
    },
    'AAPL',
    {
      now: new Date('2026-05-12T00:00:00.000Z')
    }
  );

  assert.equal(info.provider, 'alphavantage');
  assert.equal(info.annualDividendPerShare, 1.02);
  assert.equal(info.lastDividendValue, 0.26);
  assert.equal(info.exDividendDate, '2026-02-10T00:00:00.000Z');
  assert.equal(info.dividendDate, '2026-02-18T00:00:00.000Z');
});

test('parsePublicDataDividendResponse extracts Korean dividend rows', () => {
  const info = parsePublicDataDividendResponse(
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
                stckIssuCmpyNm: '두산퓨얼셀',
                basDt: '20260401',
                dvdnBasDt: '20260331',
                cashDvdnPayDt: '20260420',
                stckGenrDvdnAmt: '150'
              },
              {
                stckIssuCmpyNm: '다른회사',
                basDt: '20260401',
                stckGenrDvdnAmt: '999'
              }
            ]
          }
        }
      }
    },
    '336260',
    '두산퓨얼셀',
    {
      now: new Date('2026-05-12T00:00:00.000Z')
    }
  );

  assert.equal(info.provider, 'publicdata');
  assert.equal(info.annualDividendPerShare, 150);
  assert.equal(info.lastDividendValue, 150);
  assert.equal(info.exDividendDate, '2026-03-31T00:00:00.000Z');
  assert.equal(info.dividendDate, '2026-04-20T00:00:00.000Z');
  assert.equal(info.currency, 'KRW');
});

test('parsePublicDataDividendResponse matches by stock code when company names differ', () => {
  const info = parsePublicDataDividendResponse(
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
                srtnCd: '336260',
                stckIssuCmpyNm: '두산퓨얼셀보통주',
                dvdnBasDt: '20260331',
                stckGenrDvdnAmt: '150'
              },
              {
                srtnCd: '000000',
                stckIssuCmpyNm: '다른회사',
                dvdnBasDt: '20260331',
                stckGenrDvdnAmt: '999'
              }
            ]
          }
        }
      }
    },
    '336260',
    '두산 퓨얼셀',
    {
      now: new Date('2026-05-12T00:00:00.000Z')
    }
  );

  assert.equal(info.provider, 'publicdata');
  assert.equal(info.annualDividendPerShare, 150);
  assert.equal(info.sourceSymbol, '두산퓨얼셀보통주');
});

test('parsePublicDataDividendResponse matches alphanumeric Korean preferred stock codes', () => {
  const info = parsePublicDataDividendResponse(
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
                srtnCd: '33626L',
                stckIssuCmpyNm: '두산퓨얼셀우선주',
                dvdnBasDt: '20260331',
                stckGenrDvdnAmt: '200'
              },
              {
                srtnCd: '336260',
                stckIssuCmpyNm: '두산퓨얼셀보통주',
                dvdnBasDt: '20260331',
                stckGenrDvdnAmt: '150'
              }
            ]
          }
        }
      }
    },
    '33626L',
    '두산퓨얼셀',
    {
      now: new Date('2026-05-12T00:00:00.000Z')
    }
  );

  assert.equal(info.provider, 'publicdata');
  assert.equal(info.annualDividendPerShare, 200);
  assert.equal(info.sourceSymbol, '두산퓨얼셀우선주');
});

test('parsePublicDataDividendResponse matches company name variants', () => {
  const info = parsePublicDataDividendResponse(
    {
      response: {
        header: {
          resultCode: '00',
          resultMsg: 'NORMAL SERVICE.'
        },
        body: {
          items: {
            item: {
              stckIssuCmpyNm: '두산퓨얼셀보통주',
              dvdnBasDt: '20260331',
              stckGenrDvdnAmt: '150'
            }
          }
        }
      }
    },
    '336260',
    '두산 퓨얼셀',
    {
      companyNameCandidates: ['두산퓨얼셀', 'Doosan Fuelcell'],
      now: new Date('2026-05-12T00:00:00.000Z')
    }
  );

  assert.equal(info.annualDividendPerShare, 150);
  assert.equal(info.sourceSymbol, '두산퓨얼셀보통주');
});

test('parseOpenDartAlotMatter extracts common stock cash dividend row', () => {
  const info = parseOpenDartAlotMatter(
    {
      status: '000',
      message: '정상',
      list: [
        {
          se: '주당 현금배당금(원)',
          stock_knd: '보통주',
          thstrm: '1,200',
          stlm_dt: '2025-12-31'
        }
      ]
    },
    '005930',
    '삼성전자'
  );

  assert.equal(info.provider, 'opendart');
  assert.equal(info.annualDividendPerShare, 1200);
  assert.equal(info.lastDividendValue, 1200);
  assert.equal(info.currency, 'KRW');
});

test('parseOpenDartCorpCodeXml keeps companies for name fallback matching', () => {
  const companies = parseOpenDartCorpCodeXml(`
    <result>
      <list>
        <corp_code>00126380</corp_code>
        <corp_name>삼성전자</corp_name>
        <stock_code>005930</stock_code>
        <modify_date>20260101</modify_date>
      </list>
      <list>
        <corp_code>00999999</corp_code>
        <corp_name>두산퓨얼셀</corp_name>
        <stock_code></stock_code>
        <modify_date>20260101</modify_date>
      </list>
    </result>
  `);

  assert.equal(companies.length, 2);
  assert.equal(findOpenDartCorpMatch(companies, '005930')?.corpCode, '00126380');
  assert.equal(
    findOpenDartCorpMatch(companies, '336260', {
      companyNameCandidates: ['두산 퓨얼셀']
    })?.corpCode,
    '00999999'
  );
});
