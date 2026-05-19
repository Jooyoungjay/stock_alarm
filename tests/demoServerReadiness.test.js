import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildDemoServerReadiness,
  formatDemoServerReadinessReport,
  getDemoServerReadinessHelp,
  parseDemoServerReadinessArgs
} from '../src/demoServerReadiness.js';
import { main as runDemoServerCheckCli } from '../scripts/check-demo-server.js';

test('buildDemoServerReadiness passes for a public HTTPS demo configuration', () => {
  const result = buildDemoServerReadiness({
    now: '2026-05-19T10:00:00.000Z',
    env: {
      REVIEW_DEMO_URL: 'https://stock-alarm-demo.example.com',
      PRIVACY_POLICY_URL: 'https://stock-alarm-demo.example.com/privacy',
      SUPPORT_URL: 'https://stock-alarm-demo.example.com/support',
      REVIEW_NOTES_URL: 'https://stock-alarm-demo.example.com/review-notes',
      ADMIN_TOKEN: 'review-admin-token-123',
      HOST: '0.0.0.0',
      DATA_DIR: '/app/data',
      STORAGE_ENGINE: 'json',
      MOBILE_PUSH_ENABLED: 'true',
      EXPO_PUSH_ENDPOINT: 'https://exp.host/--/api/v2/push/send',
      TELEGRAM_BOT_TOKEN: 'bot-token',
      TELEGRAM_CHAT_ID: '12345'
    }
  });

  assert.equal(result.ready, true);
  assert.equal(result.generatedAt, '2026-05-19T10:00:00.000Z');
  assert.equal(result.values.demoBaseUrl, 'https://stock-alarm-demo.example.com');
  assert.equal(result.summary.error, 0);
  assert.equal(result.checks.every((check) => check.ok), true);
});

test('buildDemoServerReadiness rejects localhost and missing required review URLs', () => {
  const result = buildDemoServerReadiness({
    env: {
      REVIEW_DEMO_URL: 'http://127.0.0.1:3000',
      PRIVACY_POLICY_URL: '',
      SUPPORT_URL: 'https://support.example.com',
      ADMIN_TOKEN: '',
      HOST: '127.0.0.1',
      STORAGE_ENGINE: 'postgres',
      DATABASE_URL: '',
      MOBILE_PUSH_ENABLED: 'true',
      EXPO_PUSH_ENDPOINT: 'http://push.example.com'
    }
  });

  assert.equal(result.ready, false);
  assert.ok(result.summary.error >= 4);
  assert.equal(result.checks.find((check) => check.name === 'demo_url_https').ok, false);
  assert.equal(result.checks.find((check) => check.name === 'privacy_policy_https').ok, false);
  assert.equal(result.checks.find((check) => check.name === 'admin_token_present').ok, false);
  assert.equal(result.checks.find((check) => check.name === 'postgres_database_url').ok, false);
  assert.equal(result.checks.find((check) => check.name === 'mobile_push_endpoint_https').ok, false);
});

test('formatDemoServerReadinessReport summarizes warnings and errors', () => {
  const result = buildDemoServerReadiness({
    now: '2026-05-19T10:00:00.000Z',
    env: {
      REVIEW_DEMO_URL: 'https://stock-alarm-demo.example.com',
      PRIVACY_POLICY_URL: 'https://stock-alarm-demo.example.com/privacy',
      SUPPORT_URL: 'https://stock-alarm-demo.example.com/support',
      ADMIN_TOKEN: 'short',
      HOST: '127.0.0.1',
      STORAGE_ENGINE: 'json',
      DATA_DIR: '/app/data'
    }
  });
  const report = formatDemoServerReadinessReport(result);

  assert.match(report, /HTTPS 데모 서버 준비 점검 결과/);
  assert.match(report, /데모 URL: https:\/\/stock-alarm-demo\.example\.com/);
  assert.match(report, /관리자 토큰 길이/);
  assert.match(report, /요약: error=0, warn=/);
});

test('parseDemoServerReadinessArgs supports output and strict warning options', () => {
  const options = parseDemoServerReadinessArgs(['--json', '--fail-on-warn'], {
    env: {
      REVIEW_DEMO_URL: 'https://example.com'
    }
  });

  assert.equal(options.json, true);
  assert.equal(options.failOnWarn, true);
  assert.equal(options.help, false);
  assert.equal(options.env.REVIEW_DEMO_URL, 'https://example.com');
});

test('demo server readiness CLI prints help and fails on missing config', async () => {
  const helpOutput = createWritableBuffer();
  const helpCode = await runDemoServerCheckCli(['--help'], {
    stdout: helpOutput,
    stderr: createWritableBuffer()
  });

  assert.equal(helpCode, 0);
  assert.match(helpOutput.text, /check:demo/);
  assert.match(getDemoServerReadinessHelp(), /REVIEW_DEMO_URL/);

  const output = createWritableBuffer();
  const errorOutput = createWritableBuffer();
  const code = await runDemoServerCheckCli([], {
    stdout: output,
    stderr: errorOutput,
    env: {}
  });

  assert.equal(code, 1);
  assert.match(output.text, /NOT READY/);
  assert.match(errorOutput.text, /점검에 실패/);
});

function createWritableBuffer() {
  return {
    text: '',
    write(value) {
      this.text += value;
    }
  };
}
