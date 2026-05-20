import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {
  buildKisQuoteSmokeTest,
  formatKisQuoteSmokeTestReport,
  getKisQuoteSmokeTestHelp,
  normalizeKisSmokeMarkets,
  parseKisQuoteSmokeTestArgs
} from '../src/kisQuoteSmokeTest.js';
import { main as checkKisQuoteMain } from '../scripts/check-kis-quote.js';

test('KIS quote smoke test checks all requested markets without leaking tokens', async () => {
  const calls = [];
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'stock-alarm-kis-smoke-'));
  const result = await buildKisQuoteSmokeTest({
    symbol: '33626L.KS',
    market: 'all',
    kisApiBaseUrl: 'https://openapi.koreainvestment.com:9443',
    kisAppKey: 'app-key',
    kisAppSecret: 'app-secret',
    kisTokenAutoRefresh: true,
    kisTokenCachePath: path.join(dir, 'kis-token.json'),
    now: '2026-05-20T01:00:00.000Z',
    fetch: async (url, request) => {
      calls.push(String(url));

      if (String(url).endsWith('/oauth2/tokenP')) {
        assert.equal(request.method, 'POST');
        assert.deepEqual(JSON.parse(request.body), {
          grant_type: 'client_credentials',
          appkey: 'app-key',
          appsecret: 'app-secret'
        });

        return textJsonResponse({
          access_token: 'issued-secret-token',
          token_type: 'Bearer',
          expires_in: 86400
        });
      }

      assert.equal(request.headers.authorization, 'Bearer issued-secret-token');
      const market = url.searchParams.get('FID_COND_MRKT_DIV_CODE');
      assert.equal(url.searchParams.get('FID_INPUT_ISCD'), '33626L');

      return jsonResponse({
        rt_cd: '0',
        output: {
          stck_shrn_iscd: '33626L',
          hts_kor_isnm: `두산퓨얼셀우 ${market}`,
          stck_prpr: market === 'NX' ? '10100' : '10000',
          stck_bsop_date: '20260520',
          stck_cntg_hour: '101112'
        }
      });
    }
  });

  assert.equal(result.ok, true);
  assert.equal(result.inputSymbol, '33626L');
  assert.deepEqual(
    result.results.map((item) => [item.market, item.ok, item.quote.price]),
    [
      ['J', true, 10000],
      ['NX', true, 10100],
      ['UN', true, 10000]
    ]
  );
  assert.deepEqual(calls, [
    'https://openapi.koreainvestment.com:9443/oauth2/tokenP',
    'https://openapi.koreainvestment.com:9443/uapi/domestic-stock/v1/quotations/inquire-price?FID_COND_MRKT_DIV_CODE=J&FID_INPUT_ISCD=33626L',
    'https://openapi.koreainvestment.com:9443/uapi/domestic-stock/v1/quotations/inquire-price?FID_COND_MRKT_DIV_CODE=NX&FID_INPUT_ISCD=33626L',
    'https://openapi.koreainvestment.com:9443/uapi/domestic-stock/v1/quotations/inquire-price?FID_COND_MRKT_DIV_CODE=UN&FID_INPUT_ISCD=33626L'
  ]);
  assert.doesNotMatch(JSON.stringify(result), /issued-secret-token|app-secret/);

  const report = formatKisQuoteSmokeTestReport(result);
  assert.match(report, /KIS 현재가 smoke test 결과/);
  assert.match(report, /33626L/);
  assert.doesNotMatch(report, /issued-secret-token|app-secret/);
});

test('KIS quote smoke test reports market failures safely', async () => {
  const result = await buildKisQuoteSmokeTest({
    symbol: '005930',
    market: 'J,NX',
    kisApiBaseUrl: 'https://openapi.koreainvestment.com:9443',
    kisAppKey: 'app-key',
    kisAppSecret: 'app-secret',
    kisAccessToken: 'direct-access-token',
    fetch: async (url) => {
      const market = url.searchParams.get('FID_COND_MRKT_DIV_CODE');

      if (market === 'J') {
        return jsonResponse({
          rt_cd: '0',
          output: {
            stck_shrn_iscd: '005930',
            hts_kor_isnm: '삼성전자',
            stck_prpr: '68500'
          }
        });
      }

      return textResponse(500, {
        rt_cd: '1',
        msg_cd: 'EGW00123',
        msg1: 'NXT 조회 실패'
      });
    }
  });

  assert.equal(result.ok, false);
  assert.equal(result.summary.success, 1);
  assert.equal(result.summary.failed, 1);
  assert.equal(result.token.source, 'env');
  assert.match(result.results[1].error, /HTTP 500/);
  assert.doesNotMatch(JSON.stringify(result), /direct-access-token|app-secret/);
});

test('KIS quote smoke test args and help support symbol, market, and token options', async () => {
  assert.deepEqual(normalizeKisSmokeMarkets('krx,nxt,total'), ['J', 'NX', 'UN']);
  assert.deepEqual(normalizeKisSmokeMarkets('all'), ['J', 'NX', 'UN']);
  assert.throws(() => normalizeKisSmokeMarkets('bad'), /시장 구분/);

  const parsed = parseKisQuoteSmokeTestArgs(
    [
      '--symbol',
      '33626L',
      '--market=all',
      '--json',
      '--force-token',
      '--timeout-ms',
      '2500',
      '--cache-path=tmp-token.json',
      '--base-url',
      'https://openapi.koreainvestment.com:9443'
    ],
    {
      env: {}
    }
  );

  assert.equal(parsed.symbol, '33626L');
  assert.equal(parsed.market, 'all');
  assert.equal(parsed.json, true);
  assert.equal(parsed.forceToken, true);
  assert.equal(parsed.timeoutMs, 2500);
  assert.equal(parsed.cachePath, 'tmp-token.json');
  assert.match(getKisQuoteSmokeTestHelp(), /npm run check:kis-quote/);

  let output = '';
  const code = await checkKisQuoteMain(['--help'], {
    env: {},
    stdout: {
      write: (value) => {
        output += value;
      }
    },
    stderr: {
      write: () => {}
    }
  });

  assert.equal(code, 0);
  assert.match(output, /--symbol/);
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

function textJsonResponse(payload) {
  return {
    ok: true,
    status: 200,
    async text() {
      return JSON.stringify(payload);
    }
  };
}

function textResponse(status, payload) {
  return {
    ok: false,
    status,
    async text() {
      return JSON.stringify(payload);
    }
  };
}
