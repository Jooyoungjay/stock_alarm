import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {
  buildMobileE2eReadiness,
  formatMobileE2eReadinessReport,
  getMobileE2eReadinessHelp,
  parseMobileE2eReadinessArgs
} from '../src/mobileE2eReadiness.js';
import { main as checkMobileE2eMain } from '../scripts/check-mobile-e2e.js';

test('buildMobileE2eReadiness passes for a LAN-ready mobile test setup', async () => {
  const rootDir = await createMobileFixture({
    defaultApiBaseUrl: 'http://192.168.0.10:3001',
    projectId: 'expo-project-id',
    installExpo: true,
    runtime: {
      appName: 'stock_alarm',
      host: '0.0.0.0',
      port: 3001
    }
  });
  const result = await buildMobileE2eReadiness({
    rootDir,
    now: '2026-05-21T04:00:00.000Z',
    nodeVersion: 'v22.12.0',
    networkInterfaces: {
      WiFi: [
        {
          family: 'IPv4',
          internal: false,
          address: '192.168.0.10'
        }
      ]
    },
    fetchImpl: async (url) => {
      assert.equal(url, 'http://192.168.0.10:3001/api/mobile/ping');
      return jsonResponse({ ok: true, mobileApi: true, port: 3001 });
    }
  });

  assert.equal(result.ready, true);
  assert.equal(result.summary.error, 0);
  assert.equal(result.values.runtimeState, 'running');
  assert.deepEqual(result.values.lanUrls, ['http://192.168.0.10:3001']);
  assert.equal(result.checks.find((check) => check.name === 'mobile_ping').ok, true);

  const report = formatMobileE2eReadinessReport(result);
  assert.match(report, /모바일 실기기 E2E 준비 점검 결과/);
  assert.match(report, /READY/);
});

test('buildMobileE2eReadiness blocks physical testing when server is PC-only', async () => {
  const rootDir = await createMobileFixture({
    defaultApiBaseUrl: 'http://127.0.0.1:3001',
    runtime: {
      appName: 'stock_alarm',
      host: '127.0.0.1',
      port: 3001
    }
  });
  const result = await buildMobileE2eReadiness({
    rootDir,
    nodeVersion: 'v22.12.0',
    probeServer: false
  });
  const lanCheck = result.checks.find((check) => check.name === 'server_lan_bind');

  assert.equal(result.ready, false);
  assert.equal(lanCheck.ok, false);
  assert.match(lanCheck.message, /local:phone/);
  assert.ok(result.nextActions.some((action) => action.includes('npm run local:phone')));
});

test('mobile E2E readiness args and CLI help are documented', async () => {
  const parsed = parseMobileE2eReadinessArgs(
    ['--json', '--fail-on-warn', '--server-url', '192.168.0.10:3001', '--no-probe'],
    {
      env: {}
    }
  );

  assert.equal(parsed.json, true);
  assert.equal(parsed.failOnWarn, true);
  assert.equal(parsed.serverUrl, '192.168.0.10:3001');
  assert.equal(parsed.probeServer, false);
  assert.match(getMobileE2eReadinessHelp(), /check:mobile-e2e/);

  let output = '';
  const code = await checkMobileE2eMain(['--help'], {
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
  assert.match(output, /local:phone/);
});

async function createMobileFixture(options = {}) {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), 'stock-alarm-mobile-e2e-'));
  const mobileDir = path.join(rootDir, 'mobile');
  const srcDir = path.join(mobileDir, 'src');
  const docsDir = path.join(rootDir, 'docs');
  const dataDir = path.join(rootDir, 'data');

  await fs.mkdir(srcDir, { recursive: true });
  await fs.mkdir(docsDir, { recursive: true });
  await fs.mkdir(dataDir, { recursive: true });

  await fs.writeFile(
    path.join(mobileDir, 'package.json'),
    JSON.stringify(
      {
        dependencies: {
          expo: '~55.0.0',
          'expo-notifications': '~55.0.23',
          'expo-secure-store': '~55.0.14'
        }
      },
      null,
      2
    )
  );
  await fs.writeFile(
    path.join(mobileDir, 'app.json'),
    JSON.stringify(
      {
        expo: {
          name: 'Stock Alarm',
          ios: {
            bundleIdentifier: 'com.jooyoungjay.stockalarm'
          },
          android: {
            package: 'com.jooyoungjay.stockalarm'
          },
          plugins: [
            ['expo-secure-store', {}],
            ['expo-notifications', {}]
          ],
          extra: {
            defaultApiBaseUrl: options.defaultApiBaseUrl || 'http://127.0.0.1:3001',
            eas: options.projectId
              ? {
                  projectId: options.projectId
                }
              : undefined
          }
        }
      },
      null,
      2
    )
  );

  await fs.writeFile(path.join(mobileDir, 'App.js'), 'export default function App() { return null; }\n');
  await fs.writeFile(path.join(srcDir, 'api.js'), 'export function checkHealth() {}\n');
  await fs.writeFile(path.join(srcDir, 'deviceStorage.js'), 'export function loadDeviceSession() {}\n');
  await fs.writeFile(path.join(srcDir, 'pushNotifications.js'), 'export function registerForPushNotificationsAsync() {}\n');
  await fs.writeFile(path.join(docsDir, 'mobile-real-device-e2e.md'), '# 모바일 실기기 E2E 테스트\n');

  if (options.installExpo) {
    await fs.mkdir(path.join(mobileDir, 'node_modules', 'expo'), { recursive: true });
    await fs.writeFile(path.join(mobileDir, 'node_modules', 'expo', 'package.json'), '{}\n');
  }

  if (options.runtime) {
    await fs.writeFile(
      path.join(dataDir, 'server.json'),
      JSON.stringify(
        {
          pid: 1234,
          rootDir,
          dataDir,
          startedAt: '2026-05-21T04:00:00.000Z',
          ...options.runtime
        },
        null,
        2
      )
    );
  }

  return rootDir;
}

function jsonResponse(payload, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return payload;
    }
  };
}
