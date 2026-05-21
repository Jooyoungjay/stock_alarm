import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {
  buildExternalApiRecheck,
  formatExternalApiRecheckReport,
  getExternalApiRecheckHelp,
  parseExternalApiRecheckArgs
} from '../src/externalApiRecheck.js';
import { main as checkExternalApisMain } from '../scripts/check-external-apis.js';

test('buildExternalApiRecheck summarizes configured external API checks without leaking secrets', async () => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'stock-alarm-external-api-'));
  const calls = [];
  const result = await buildExternalApiRecheck({
    now: '2026-05-21T03:00:00.000Z',
    sendTelegram: true,
    kisSymbol: '33626L',
    kisMarket: 'all',
    publicDataSymbol: '005930',
    publicDataStartDate: '2026-05-01',
    publicDataEndDate: '2026-05-15',
    config: {
      quoteTimeoutMs: 3000,
      kisApiBaseUrl: 'https://openapi.koreainvestment.com:9443',
      kisAppKey: 'secret-kis-app-key',
      kisAppSecret: 'secret-kis-app-secret',
      kisAccessToken: '',
      kisTokenAutoRefresh: true,
      kisTokenCachePath: path.join(dataDir, 'kis-token.json'),
      kisCustType: 'P',
      dataGoKrServiceKey: 'secret-publicdata-key',
      telegramBotToken: 'secret-telegram-token',
      telegramChatId: 'secret-chat-id'
    },
    env: {
      BROKER_QUOTE_PROVIDER: 'kis',
      BROKER_TRADING_ENABLED: 'false',
      KIS_API_BASE_URL: 'https://openapi.koreainvestment.com:9443',
      KIS_APP_KEY: 'secret-kis-app-key',
      KIS_APP_SECRET: 'secret-kis-app-secret',
      KIS_ACCESS_TOKEN: 'direct-token',
      KIS_ACCOUNT_NUMBER: '12345678-01',
      KIS_MARKET_DIV_CODE: 'UN',
      KIS_TOKEN_AUTO_REFRESH: 'true'
    },
    fetch: async (url, request = {}) => {
      calls.push(String(url));

      if (String(url).endsWith('/oauth2/tokenP')) {
        assert.equal(request.method, 'POST');
        return textJsonResponse({
          access_token: 'issued-secret-token',
          expires_in: 3600
        });
      }

      if (String(url).includes('/uapi/domestic-stock/v1/quotations/inquire-price')) {
        const market = url.searchParams.get('FID_COND_MRKT_DIV_CODE');
        return arrayBufferJsonResponse({
          rt_cd: '0',
          output: {
            stck_shrn_iscd: '33626L',
            hts_kor_isnm: '두산퓨얼셀우',
            stck_prpr: market === 'NX' ? '10100' : '10000'
          }
        });
      }

      if (String(url).includes('getStockPriceInfo')) {
        return arrayBufferJsonResponse({
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
                  }
                ]
              }
            }
          }
        });
      }

      if (String(url).includes('/sendMessage')) {
        assert.match(request.body, /외부 API 실계정 재점검/);
        return jsonResponse({
          ok: true,
          result: {
            message_id: 1
          }
        });
      }

      throw new Error(`unexpected fetch: ${url}`);
    }
  });

  assert.equal(result.overallStatus, 'READY');
  assert.equal(result.summary.failed, 0);
  assert.equal(result.summary.skipped, 0);
  assert.deepEqual(
    result.checks.map((check) => [check.id, check.status]),
    [
      ['broker', 'passed'],
      ['kis_quote', 'passed'],
      ['publicdata_price', 'passed'],
      ['telegram', 'passed']
    ]
  );
  assert.ok(calls.some((url) => url.includes('/sendMessage')));

  const serialized = JSON.stringify(result);
  assert.doesNotMatch(serialized, /secret-kis-app-key|secret-kis-app-secret|secret-publicdata-key|secret-telegram-token|secret-chat-id|issued-secret-token/);

  const report = formatExternalApiRecheckReport(result);
  assert.match(report, /외부 API 실계정 재점검 결과/);
  assert.match(report, /종합 상태: READY/);
});

test('buildExternalApiRecheck reports missing keys and skipped telegram send as actionable items', async () => {
  const result = await buildExternalApiRecheck({
    now: '2026-05-21T03:00:00.000Z',
    config: {
      quoteTimeoutMs: 3000,
      kisApiBaseUrl: 'https://openapi.koreainvestment.com:9443',
      kisAppKey: '',
      kisAppSecret: '',
      kisAccessToken: '',
      kisTokenAutoRefresh: true,
      kisTokenCachePath: 'data/kis-token.json',
      kisCustType: 'P',
      dataGoKrServiceKey: '',
      telegramBotToken: 'telegram-token',
      telegramChatId: '1234'
    },
    env: {
      BROKER_QUOTE_PROVIDER: 'none',
      BROKER_TRADING_ENABLED: 'false'
    }
  });

  assert.equal(result.overallStatus, 'FAILED');
  assert.equal(result.summary.failed, 2);
  assert.equal(result.summary.skipped, 1);
  assert.equal(result.checks.find((check) => check.id === 'telegram').status, 'skipped');
  assert.ok(result.nextActions.some((action) => action.includes('KIS_APP_KEY')));
  assert.ok(result.nextActions.some((action) => action.includes('DATA_GO_KR_SERVICE_KEY')));
  assert.ok(result.nextActions.some((action) => action.includes('--send-telegram')));
});

test('external API recheck args and CLI support help and JSON output', async () => {
  const parsed = parseExternalApiRecheckArgs(
    [
      '--json',
      '--send-telegram',
      '--kis-symbol=33626L',
      '--kis-market',
      'all',
      '--publicdata-symbol',
      '005930',
      '--publicdata-start=2026-05-01',
      '--publicdata-end',
      '2026-05-15',
      '--timeout-ms',
      '2500'
    ],
    {
      env: {}
    }
  );

  assert.equal(parsed.json, true);
  assert.equal(parsed.sendTelegram, true);
  assert.equal(parsed.kisSymbol, '33626L');
  assert.equal(parsed.kisMarket, 'all');
  assert.equal(parsed.publicDataSymbol, '005930');
  assert.equal(parsed.publicDataStartDate, '2026-05-01');
  assert.equal(parsed.publicDataEndDate, '2026-05-15');
  assert.equal(parsed.timeoutMs, 2500);
  assert.match(getExternalApiRecheckHelp(), /check:external-apis/);

  let output = '';
  const code = await checkExternalApisMain(['--help'], {
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
  assert.match(output, /--send-telegram/);
});

function arrayBufferJsonResponse(payload) {
  return {
    ok: true,
    status: 200,
    async arrayBuffer() {
      return new TextEncoder().encode(JSON.stringify(payload)).buffer;
    },
    async text() {
      return JSON.stringify(payload);
    },
    async json() {
      return payload;
    }
  };
}

function textJsonResponse(payload) {
  return {
    ok: true,
    status: 200,
    async text() {
      return JSON.stringify(payload);
    },
    async arrayBuffer() {
      return new TextEncoder().encode(JSON.stringify(payload)).buffer;
    },
    async json() {
      return payload;
    }
  };
}

function jsonResponse(payload) {
  return {
    ok: true,
    status: 200,
    async json() {
      return payload;
    },
    async text() {
      return JSON.stringify(payload);
    },
    async arrayBuffer() {
      return new TextEncoder().encode(JSON.stringify(payload)).buffer;
    }
  };
}
