import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {
  buildKisTokenReport,
  getKisAccessToken,
  getKisTokenHelp,
  normalizeKisTokenResponse,
  parseKisTokenArgs
} from '../src/kisToken.js';
import { main } from '../scripts/kis-token.js';

test('normalizeKisTokenResponse parses token expiry and masks reports', async () => {
  const token = normalizeKisTokenResponse(
    {
      access_token: 'Bearer abcdefghijklmnopqrstuvwxyz',
      token_type: 'Bearer',
      expires_in: 86400,
      access_token_token_expired: '2026-05-21 09:10:11'
    },
    {
      now: '2026-05-20T00:00:00.000Z'
    }
  );

  assert.equal(token.accessToken, 'abcdefghijklmnopqrstuvwxyz');
  assert.equal(token.expiresAt, '2026-05-21T00:10:11.000Z');

  const report = await buildKisTokenReport({
    kisAccessToken: 'Bearer abcdefghijklmnopqrstuvwxyz',
    now: '2026-05-20T00:00:00.000Z'
  });

  assert.equal(report.ok, true);
  assert.equal(report.source, 'env');
  assert.equal(report.maskedAccessToken, 'abcdef...wxyz');
  assert.equal(JSON.stringify(report).includes('abcdefghijklmnopqrstuvwxyz'), false);
});

test('getKisAccessToken returns a valid cached token without network calls', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'stock-alarm-kis-token-'));
  const cachePath = path.join(dir, 'kis-token.json');
  await fs.writeFile(
    cachePath,
    JSON.stringify({
      accessToken: 'cached-token',
      tokenType: 'Bearer',
      expiresAt: '2026-05-20T01:00:00.000Z'
    }),
    'utf8'
  );

  const token = await getKisAccessToken({
    kisTokenAutoRefresh: true,
    kisTokenCachePath: cachePath,
    now: '2026-05-20T00:00:00.000Z',
    fetch: async () => {
      throw new Error('fetch should not be called');
    }
  });

  assert.equal(token.accessToken, 'cached-token');
  assert.equal(token.source, 'cache');
  assert.equal(token.cached, true);
});

test('getKisAccessToken issues and caches a token when cache is missing', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'stock-alarm-kis-token-'));
  const cachePath = path.join(dir, 'kis-token.json');
  const calls = [];

  const token = await getKisAccessToken({
    kisApiBaseUrl: 'https://openapi.koreainvestment.com:9443',
    kisAppKey: 'app-key',
    kisAppSecret: 'app-secret',
    kisTokenAutoRefresh: true,
    kisTokenCachePath: cachePath,
    now: '2026-05-20T00:00:00.000Z',
    fetch: async (url, request) => {
      calls.push({ url: String(url), request });
      assert.equal(String(url), 'https://openapi.koreainvestment.com:9443/oauth2/tokenP');
      assert.equal(request.method, 'POST');
      assert.deepEqual(JSON.parse(request.body), {
        grant_type: 'client_credentials',
        appkey: 'app-key',
        appsecret: 'app-secret'
      });

      return textJsonResponse({
        access_token: 'issued-token',
        token_type: 'Bearer',
        expires_in: 86400
      });
    }
  });

  assert.equal(token.accessToken, 'issued-token');
  assert.equal(token.source, 'issued');
  assert.equal(calls.length, 1);

  const cached = JSON.parse(await fs.readFile(cachePath, 'utf8'));
  assert.equal(cached.accessToken, 'issued-token');
  assert.equal(cached.expiresAt, '2026-05-21T00:00:00.000Z');
});

test('KIS token CLI supports help and JSON output without leaking token', async () => {
  const help = getKisTokenHelp();
  assert.match(help, /npm run kis:token/);
  assert.match(help, /KIS_APP_KEY/);

  const parsed = parseKisTokenArgs(['--json', '--force', '--cache-path=tmp-token.json'], {
    env: {}
  });
  assert.equal(parsed.json, true);
  assert.equal(parsed.forceRefresh, true);
  assert.equal(parsed.cachePath, 'tmp-token.json');

  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'stock-alarm-kis-token-cli-'));
  const stdout = createBuffer();
  const stderr = createBuffer();
  const code = await main(['--json', '--cache-path', path.join(dir, 'kis-token.json')], {
    env: {
      KIS_APP_KEY: 'app-key',
      KIS_APP_SECRET: 'app-secret'
    },
    stdout,
    stderr,
    now: '2026-05-20T00:00:00.000Z',
    fetch: async () =>
      textJsonResponse({
        access_token: 'cli-issued-token',
        token_type: 'Bearer',
        expires_in: 86400
      })
  });

  assert.equal(code, 0);
  const payload = JSON.parse(stdout.text);
  assert.equal(payload.ok, true);
  assert.equal(payload.maskedAccessToken, 'cli-is...oken');
  assert.equal(stdout.text.includes('cli-issued-token'), false);
  assert.equal(stderr.text, '');
});

function textJsonResponse(payload, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async text() {
      return JSON.stringify(payload);
    }
  };
}

function createBuffer() {
  return {
    text: '',
    write(value) {
      this.text += value;
    }
  };
}
