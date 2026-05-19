import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {
  buildPostgresMigrationDryRun,
  formatPostgresMigrationDryRunReport,
  parsePostgresMigrationDryRunArgs,
  runPostgresMigrationDryRun
} from '../src/postgresMigrationDryRun.js';

test('buildPostgresMigrationDryRun flattens JSON store data into Postgres table samples', () => {
  const result = buildPostgresMigrationDryRun(createSnapshot(), {
    now: '2026-05-19T00:00:00.000Z',
    sampleLimit: 5,
    source: {
      type: 'test'
    }
  });

  assert.equal(result.dryRun, true);
  assert.equal(result.target, 'postgres');
  assert.equal(result.schemaVersion, 1);
  assert.equal(result.counts.devices, 1);
  assert.equal(result.counts.push_tokens, 1);
  assert.equal(result.counts.stocks, 1);
  assert.equal(result.counts.dividend_events, 1);
  assert.equal(result.counts.alerts, 1);
  assert.equal(result.counts.quote_provider_stats, 1);
  assert.equal(result.counts.quote_provider_attempts, 1);
  assert.equal(result.counts.job_runs, 2);
  assert.equal(result.counts.settings, 1);
  assert.equal(result.readyForMigration, true);
  assert.deepEqual(result.warnings, []);

  assert.equal(result.tables.devices.sampleRows[0].secret_hash, 'secret-hash');
  assert.equal(result.tables.push_tokens.sampleRows[0].provider, 'expo');
  assert.equal(result.tables.push_tokens.sampleRows[0].device_id, 'device-1');
  assert.equal(result.tables.push_tokens.sampleRows[0].token, undefined);
  assert.notEqual(result.tables.push_tokens.sampleRows[0].token_hash, 'ExponentPushToken[secret]');
  assert.equal(JSON.stringify(result.tables.push_tokens).includes('ExponentPushToken[secret]'), false);

  assert.equal(result.tables.stocks.sampleRows[0].symbol, '336260');
  assert.equal(result.tables.stocks.sampleRows[0].purchase_price, 88779);
  assert.equal(result.tables.stocks.sampleRows[0].dividend_snapshot.annualDividendPerShare, 1200);
  assert.equal(result.tables.dividend_events.sampleRows[0].stock_id, 'stock-1');
  assert.equal(result.tables.alerts.sampleRows[0].maximum_profit_amount, 10000);
  assert.equal(result.tables.quote_provider_stats.sampleRows[0].provider, 'naver');
  assert.equal(result.tables.job_runs.sampleRows.some((row) => row.key === 'lastDividendRefresh'), true);
  assert.equal(result.tables.settings.sampleRows[0].key, 'telegramUpdateOffset');
  assert.equal(result.checks.every((check) => check.ok), true);
});

test('runPostgresMigrationDryRun reads store.json without mutating the JSON file', async () => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'stock-alarm-dry-run-'));
  const storePath = path.join(dataDir, 'store.json');
  const payload = {
    devices: [],
    stocks: [
      {
        symbol: 'AAPL',
        displayName: 'Apple',
        purchasePrice: 100,
        thresholdPercent: 10,
        active: true
      }
    ],
    alerts: [],
    meta: {
      schemaVersion: 1
    }
  };
  await fs.writeFile(storePath, JSON.stringify(payload, null, 2), 'utf8');
  const before = await fs.readFile(storePath, 'utf8');

  const result = await runPostgresMigrationDryRun({
    dataDir,
    now: '2026-05-19T00:00:00.000Z'
  });
  const after = await fs.readFile(storePath, 'utf8');

  assert.equal(result.source.storePath, storePath);
  assert.equal(result.counts.stocks, 1);
  assert.equal(result.tables.stocks.sampleRows[0].symbol, 'AAPL');
  assert.equal(before, after);
});

test('formatPostgresMigrationDryRunReport summarizes counts and dry-run safety', () => {
  const result = buildPostgresMigrationDryRun(createSnapshot(), {
    now: '2026-05-19T00:00:00.000Z',
    sampleLimit: 1,
    source: {
      storePath: 'C:\\My Web Sites\\stock_alarm\\data\\store.json'
    }
  });
  const report = formatPostgresMigrationDryRunReport(result);

  assert.match(report, /JSON -> Postgres dry-run 결과/);
  assert.match(report, /stocks: 1행/);
  assert.match(report, /푸시 토큰 원문 비저장/);
  assert.match(report, /실제 Postgres 연결 또는 DB 쓰기는 수행하지 않았습니다/);
});

test('parsePostgresMigrationDryRunArgs supports data source and output options', () => {
  const options = parsePostgresMigrationDryRunArgs(
    ['--store', 'data/backups/store.json', '--samples=3', '--json', '--fail-on-warning'],
    {
      cwd: 'C:\\Project'
    }
  );

  assert.equal(options.dataDir, path.resolve('C:\\Project', 'data'));
  assert.equal(options.storePath, path.resolve('C:\\Project', 'data/backups/store.json'));
  assert.equal(options.sampleLimit, 3);
  assert.equal(options.json, true);
  assert.equal(options.failOnWarning, true);
});

function createSnapshot() {
  return {
    devices: [
      {
        id: 'device-1',
        label: 'phone',
        platform: 'ios',
        secretHash: 'secret-hash',
        pushTokens: [
          {
            token: 'ExponentPushToken[secret]',
            provider: 'expo',
            platform: 'ios',
            enabled: true,
            updatedAt: '2026-05-19T00:01:00.000Z'
          }
        ],
        createdAt: '2026-05-19T00:00:00.000Z',
        updatedAt: '2026-05-19T00:01:00.000Z',
        lastSeenAt: '2026-05-19T00:02:00.000Z'
      }
    ],
    stocks: [
      {
        id: 'stock-1',
        deviceId: 'device-1',
        symbol: '336260',
        displayName: '두산퓨얼셀',
        purchasePrice: 88779,
        quantity: 10,
        purchaseDate: '',
        alertType: 'profit_retracement',
        thresholdPercent: 10,
        active: true,
        highPrice: 103800,
        highPriceAt: '2026-05-18T06:00:00.000Z',
        lastPrice: 96700,
        lastCheckedAt: '2026-05-19T06:00:00.000Z',
        alertState: 'triggered',
        currency: 'KRW',
        exchange: 'KRX',
        quoteProvider: 'naver',
        annualDividendPerShare: 1200,
        dividendFrequency: 'quarterly',
        dividendMonths: [3, 6, 9, 12],
        dividendProvider: 'publicdata',
        dividendHistory: [
          {
            checkedAt: '2026-05-19T00:03:00.000Z',
            reason: 'provider',
            provider: 'publicdata',
            sourceSymbol: '336260',
            currency: 'KRW',
            previousAnnualDividendPerShare: 1000,
            annualDividendPerShare: 1200,
            lastDividendValue: 300,
            exDividendDate: '2026-06-27',
            dividendDate: '2026-07-15'
          }
        ],
        createdAt: '2026-05-19T00:00:00.000Z',
        updatedAt: '2026-05-19T00:04:00.000Z'
      }
    ],
    alerts: [
      {
        stockId: 'stock-1',
        deviceId: 'device-1',
        symbol: '336260',
        displayName: '두산퓨얼셀',
        alertType: 'profit_retracement',
        price: 96700,
        thresholdPrice: 95000,
        maximumProfitAmount: 10000,
        currentProfitAmount: 8000,
        retracedProfitAmount: 2000,
        retracedProfitPercent: 20,
        sent: true,
        message: 'test alert',
        createdAt: '2026-05-19T00:05:00.000Z'
      }
    ],
    meta: {
      schemaVersion: 1,
      createdAt: '2026-05-19T00:00:00.000Z',
      updatedAt: '2026-05-19T00:05:00.000Z',
      telegramUpdateOffset: 42,
      lastDailyBriefingDate: '2026-05-19',
      lastDividendRefresh: {
        status: 'checked',
        checkedAt: '2026-05-19T00:06:00.000Z'
      },
      quoteProviderStats: {
        providers: {
          naver: {
            attempts: 2,
            success: 1,
            error: 1,
            skipped: 0,
            totalDurationMs: 100,
            averageDurationMs: 100,
            failureRatePercent: 50,
            lastStatus: 'success',
            lastType: 'quote',
            lastSymbol: '336260',
            lastCheckedAt: '2026-05-19T00:07:00.000Z'
          }
        },
        recentAttempts: [
          {
            provider: 'naver',
            type: 'quote',
            symbol: '336260',
            status: 'success',
            startedAt: '2026-05-19T00:06:59.000Z',
            finishedAt: '2026-05-19T00:07:00.000Z',
            durationMs: 100,
            stockId: 'stock-1'
          }
        ]
      }
    }
  };
}
