import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildBrokerApiAdapterReview,
  formatBrokerApiAdapterReviewReport,
  getBrokerApiAdapterReviewHelp,
  parseBrokerApiAdapterReviewArgs
} from '../src/brokerApiAdapterReview.js';
import { main } from '../scripts/check-broker-api.js';

test('default broker API review keeps current free provider chain enabled', () => {
  const result = buildBrokerApiAdapterReview({
    env: {},
    now: '2026-05-20T00:00:00.000Z'
  });

  assert.equal(result.ready, true);
  assert.equal(result.values.provider, 'none');
  assert.equal(result.values.tradingEnabled, false);
  assert.equal(result.summary.error, 0);
  assert.equal(result.summary.warn, 1);
  assert.ok(result.checks.some((check) => check.name === 'provider_selected' && !check.ok));

  const report = formatBrokerApiAdapterReviewReport(result);
  assert.match(report, /증권사 API adapter 점검 결과/);
  assert.match(report, /BROKER_QUOTE_PROVIDER: none/);
});

test('KIS provider is ready when quote-only credentials are present', () => {
  const result = buildBrokerApiAdapterReview({
    env: {
      BROKER_QUOTE_PROVIDER: 'kis',
      BROKER_TRADING_ENABLED: 'false',
      KIS_API_BASE_URL: 'https://openapi.koreainvestment.com:9443',
      KIS_APP_KEY: 'app-key',
      KIS_APP_SECRET: 'app-secret',
      KIS_ACCESS_TOKEN: 'access-token',
      KIS_ACCOUNT_NUMBER: '12345678-01',
      KIS_MARKET_DIV_CODE: 'UN'
    }
  });

  assert.equal(result.ready, true);
  assert.equal(result.values.provider, 'kis');
  assert.equal(result.values.kisMarketDivCode, 'UN');
  assert.equal(result.summary.error, 0);
  assert.ok(result.checks.some((check) => check.name === 'kis_access_token_or_auto_refresh' && check.ok));
  assert.ok(result.checks.some((check) => check.name === 'kis_market_div_code_supported' && check.ok));
});

test('KIS provider is ready with app credentials and automatic token refresh', () => {
  const result = buildBrokerApiAdapterReview({
    env: {
      BROKER_QUOTE_PROVIDER: 'kis',
      KIS_APP_KEY: 'app-key',
      KIS_APP_SECRET: 'app-secret',
      KIS_TOKEN_AUTO_REFRESH: 'true'
    }
  });

  assert.equal(result.ready, true);
  assert.equal(result.values.hasKisAccessToken, false);
  assert.equal(result.values.kisTokenAutoRefresh, true);
  assert.ok(result.checks.some((check) => check.name === 'kis_access_token_or_auto_refresh' && check.ok));
});

test('KIS provider fails when credentials are missing or trading is enabled', () => {
  const result = buildBrokerApiAdapterReview({
    env: {
      BROKER_QUOTE_PROVIDER: 'kis',
      BROKER_TRADING_ENABLED: 'true',
      KIS_API_BASE_URL: 'http://localhost:3000'
    }
  });

  assert.equal(result.ready, false);
  assert.ok(result.summary.error >= 4);
  assert.ok(result.checks.some((check) => check.name === 'trading_disabled' && !check.ok));
  assert.ok(result.checks.some((check) => check.name === 'kis_base_url_https' && !check.ok));
  assert.ok(result.checks.some((check) => check.name === 'kis_app_key_present' && !check.ok));
});

test('Kiwoom provider is ready when quote-only credentials are present', () => {
  const result = buildBrokerApiAdapterReview({
    env: {
      BROKER_QUOTE_PROVIDER: '키움',
      KIWOOM_API_BASE_URL: 'https://api.kiwoom.com',
      KIWOOM_APP_KEY: 'app-key',
      KIWOOM_SECRET_KEY: 'secret-key',
      KIWOOM_ACCESS_TOKEN: 'access-token',
      KIWOOM_ACCOUNT_NUMBER: '12345678'
    }
  });

  assert.equal(result.ready, true);
  assert.equal(result.values.provider, 'kiwoom');
  assert.equal(result.summary.error, 0);
  assert.ok(result.checks.some((check) => check.name === 'kiwoom_secret_key_present' && check.ok));
});

test('broker API CLI options support help, json, and provider override', async () => {
  const help = getBrokerApiAdapterReviewHelp();
  assert.match(help, /npm run check:broker-api/);
  assert.match(help, /BROKER_TRADING_ENABLED/);

  const parsed = parseBrokerApiAdapterReviewArgs(['--provider=kis', '--json'], {
    env: {}
  });
  assert.equal(parsed.json, true);
  assert.equal(parsed.env.BROKER_QUOTE_PROVIDER, 'kis');

  const stdout = createBuffer();
  const stderr = createBuffer();
  const code = await main(['--json', '--provider', 'kiwoom'], {
    env: {
      KIWOOM_APP_KEY: 'app-key',
      KIWOOM_SECRET_KEY: 'secret-key',
      KIWOOM_ACCESS_TOKEN: 'access-token'
    },
    stdout,
    stderr
  });

  assert.equal(code, 0);
  const payload = JSON.parse(stdout.text);
  assert.equal(payload.values.provider, 'kiwoom');
  assert.equal(stderr.text, '');
});

function createBuffer() {
  return {
    text: '',
    write(value) {
      this.text += value;
    }
  };
}
