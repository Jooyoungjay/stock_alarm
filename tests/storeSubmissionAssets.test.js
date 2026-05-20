import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {
  buildStoreSubmissionAssetsReadiness,
  formatStoreSubmissionAssetsReport,
  getStoreSubmissionAssetsHelp,
  parseStoreSubmissionAssetsArgs
} from '../src/storeSubmissionAssets.js';
import { main as runStoreAssetsCheckCli } from '../scripts/check-store-assets.js';

test('buildStoreSubmissionAssetsReadiness passes when store assets are present', async () => {
  const rootDir = await createStoreAssetFixture();
  const screenshotDir = path.join(rootDir, 'mobile', 'store-assets', 'screenshots');
  const result = await buildStoreSubmissionAssetsReadiness({
    rootDir,
    screenshotDir,
    now: '2026-05-20T10:00:00.000Z',
    env: {
      PRIVACY_POLICY_URL: 'https://stock-alarm.example.com/privacy',
      SUPPORT_URL: 'https://stock-alarm.example.com/support'
    }
  });

  assert.equal(result.ready, true);
  assert.equal(result.generatedAt, '2026-05-20T10:00:00.000Z');
  assert.equal(result.values.appName, 'Stock Alarm');
  assert.equal(result.values.foundScreenshotCount, 6);
  assert.equal(result.summary.error, 0);
  assert.equal(result.checks.every((check) => check.ok), true);
});

test('buildStoreSubmissionAssetsReadiness flags missing screenshots and public URLs', async () => {
  const rootDir = await createStoreAssetFixture({ screenshots: false });
  const result = await buildStoreSubmissionAssetsReadiness({
    rootDir,
    env: {}
  });

  assert.equal(result.ready, false);
  assert.equal(result.checks.find((check) => check.name === 'privacy_policy_public_url').ok, false);
  assert.equal(result.checks.find((check) => check.name === 'support_public_url').ok, false);
  assert.equal(result.checks.find((check) => check.name === 'screenshot_files_present').ok, false);
  assert.match(formatStoreSubmissionAssetsReport(result), /NOT READY/);
});

test('store submission assets CLI supports help and JSON output', async () => {
  const rootDir = await createStoreAssetFixture();
  const output = createWritableBuffer();
  const errorOutput = createWritableBuffer();
  const code = await runStoreAssetsCheckCli(['--json'], {
    stdout: output,
    stderr: errorOutput,
    rootDir,
    screenshotDir: path.join(rootDir, 'mobile', 'store-assets', 'screenshots'),
    env: {
      PRIVACY_POLICY_URL: 'https://stock-alarm.example.com/privacy',
      SUPPORT_URL: 'https://stock-alarm.example.com/support'
    }
  });

  assert.equal(code, 0);
  assert.equal(JSON.parse(output.text).ready, true);
  assert.equal(errorOutput.text, '');

  const helpOutput = createWritableBuffer();
  const helpCode = await runStoreAssetsCheckCli(['--help'], {
    stdout: helpOutput,
    stderr: createWritableBuffer()
  });

  assert.equal(helpCode, 0);
  assert.match(helpOutput.text, /check:store-assets/);
  assert.match(getStoreSubmissionAssetsHelp(), /STORE_SCREENSHOT_DIR/);
  assert.equal(parseStoreSubmissionAssetsArgs(['--screenshot-dir', 'screens']).screenshotDir, 'screens');
});

async function createStoreAssetFixture(options = {}) {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), 'stock-alarm-store-assets-'));
  const mobileDir = path.join(rootDir, 'mobile');
  const assetsDir = path.join(mobileDir, 'assets');
  const docsDir = path.join(rootDir, 'docs');
  const screenshotsDir = path.join(mobileDir, 'store-assets', 'screenshots');

  await Promise.all([
    fs.mkdir(assetsDir, { recursive: true }),
    fs.mkdir(docsDir, { recursive: true }),
    fs.mkdir(screenshotsDir, { recursive: true })
  ]);
  await Promise.all([
    fs.writeFile(path.join(assetsDir, 'icon.png'), 'icon'),
    fs.writeFile(path.join(assetsDir, 'adaptive-icon.png'), 'adaptive'),
    fs.writeFile(path.join(docsDir, 'app-store-review-prep.md'), '# review'),
    fs.writeFile(path.join(docsDir, 'privacy-policy-ko.md'), '# privacy'),
    fs.writeFile(path.join(docsDir, 'store-screenshots.md'), '# screenshots')
  ]);
  await fs.writeFile(
    path.join(mobileDir, 'app.json'),
    JSON.stringify({
      expo: {
        name: 'Stock Alarm',
        slug: 'stock-alarm',
        version: '0.1.0',
        icon: './assets/icon.png',
        ios: {
          bundleIdentifier: 'com.jooyoungjay.stockalarm'
        },
        android: {
          package: 'com.jooyoungjay.stockalarm',
          adaptiveIcon: {
            foregroundImage: './assets/adaptive-icon.png',
            backgroundColor: '#0d1117'
          }
        }
      }
    })
  );
  await fs.writeFile(
    path.join(mobileDir, 'store-listing.ko.json'),
    JSON.stringify(buildListingFixture())
  );

  if (options.screenshots !== false) {
    for (const screen of buildListingFixture().storeScreenshots.screens) {
      await fs.writeFile(path.join(screenshotsDir, `${screen.fileName}.png`), 'png');
    }
  }

  return rootDir;
}

function buildListingFixture() {
  return {
    locale: 'ko-KR',
    appName: 'Stock Alarm',
    subtitle: '보유 종목 매도 기준과 배당 일정 알림',
    shortDescription: '계정 없이 보유 종목의 매도 기준, 배당 일정, 가격 알림을 관리합니다.',
    category: 'FINANCE',
    keywords: ['주식', '알림'],
    storeScreenshots: {
      sets: [
        { store: 'App Store', device: 'iPhone portrait', targetCount: 6 },
        { store: 'App Store', device: 'iPad portrait', targetCount: 4 },
        { store: 'Google Play', device: 'Android phone portrait', targetCount: 6 }
      ],
      screens: [
        '01-portfolio-summary',
        '02-watchlist-risk',
        '03-stock-form',
        '04-alert-toggle-push',
        '05-dividend-calendar',
        '06-alert-history'
      ].map((fileName) => ({
        id: fileName.slice(3),
        fileName,
        title: fileName,
        caption: 'caption',
        altText: 'Stock Alarm app screen'
      }))
    },
    fullDescription: [
      'Stock Alarm은 사용자가 입력한 기준에 따라 알림을 보냅니다.',
      '배당 일정을 확인할 수 있습니다.',
      '앱은 투자 자문, 매매 중개, 주문 실행을 제공하지 않습니다.'
    ],
    supportEmail: 'jumanz2@naver.com',
    privacyPolicyUrl: 'TBD',
    supportUrl: 'TBD',
    reviewNotes: [
      '계정 가입 없이 익명 기기 ID로 동작합니다.',
      'HTTPS 서버 주소를 제공합니다.',
      '푸시 알림 테스트가 가능합니다.',
      '투자 자문 기능은 없습니다.'
    ],
    dataSafety: {
      accountCreation: 'notRequired',
      dataCollected: [{ type: 'Device identifiers' }]
    }
  };
}

function createWritableBuffer() {
  return {
    text: '',
    write(value) {
      this.text += value;
    }
  };
}
