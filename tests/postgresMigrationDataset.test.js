import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildPostgresMigrationDryRun } from '../src/postgresMigrationDryRun.js';
import { JsonStore } from '../src/storage.js';

const fixtureSnapshotUrl = new URL('./fixtures/postgres-migration/store.snapshot.json', import.meta.url);
const expectedApiUrl = new URL('./fixtures/postgres-migration/expected-api.json', import.meta.url);
const fixedNow = '2026-05-19T09:00:00.000Z';

test('Postgres migration fixture defines the JsonStore API comparison baseline', async () => {
  const expected = await readJson(expectedApiUrl);
  const store = await createFixtureStore();
  const dataModel = await store.getDataModelInfo();
  const stocks = await store.listStocks();
  const alerts = await store.listAlerts(30);

  assert.equal(dataModel.schemaVersion, 1);
  assert.equal(dataModel.storageEngine, 'json');
  assert.deepEqual(dataModel.store.counts, expected.dataModelCounts);
  assert.deepEqual(stocks.map((stock) => stock.symbol), expected.stockSymbols);
  assert.deepEqual(alerts.map((alert) => alert.id), expected.alertIds);
  assert.deepEqual(
    (await store.listStocks({ deviceId: 'device-1' })).map((stock) => stock.symbol),
    expected.deviceStockSymbols['device-1']
  );
  assert.deepEqual(
    (await store.listStocks({ deviceId: 'device-2' })).map((stock) => stock.symbol),
    expected.deviceStockSymbols['device-2']
  );
  assert.deepEqual(
    (await store.listAlerts(30, { deviceId: 'device-1' })).map((alert) => alert.id),
    expected.deviceAlertIds['device-1']
  );
  assert.deepEqual(
    (await store.listAlerts(30, { deviceId: 'device-2' })).map((alert) => alert.id),
    expected.deviceAlertIds['device-2']
  );
});

test('Postgres migration fixture defines the dry-run table comparison baseline', async () => {
  const snapshot = await readJson(fixtureSnapshotUrl);
  const expected = await readJson(expectedApiUrl);
  const result = buildPostgresMigrationDryRun(snapshot, {
    now: fixedNow,
    sampleLimit: 10,
    source: {
      type: 'fixture',
      storePath: fileURLToPath(fixtureSnapshotUrl)
    }
  });

  assert.equal(result.generatedAt, fixedNow);
  assert.deepEqual(result.counts, expected.dryRunCounts);
  assert.deepEqual(result.warnings, expected.dryRunWarnings);
  assert.equal(result.readyForMigration, false);
  assert.deepEqual(
    result.tables.stocks.sampleRows.map((row) => ({
      id: row.id,
      device_id: row.device_id,
      account_type: row.account_type,
      account_name: row.account_name,
      symbol: row.symbol,
      purchase_price: row.purchase_price,
      quantity: row.quantity,
      alert_type: row.alert_type,
      active: row.active,
      dividendAnnual: row.dividend_snapshot.annualDividendPerShare
    })),
    expected.dryRunStockRows
  );
  assert.deepEqual(
    result.tables.alerts.sampleRows.map((row) => ({
      id: row.id,
      stock_id: row.stock_id,
      symbol: row.symbol,
      alert_type: row.alert_type,
      sent: row.sent
    })),
    expected.dryRunAlertRows
  );
  assert.equal(result.tables.push_tokens.sampleRows.every((row) => row.token === undefined), true);
  assert.equal(result.tables.push_tokens.sampleRows.every((row) => /^[a-f0-9]{64}$/.test(row.token_hash)), true);
  assert.deepEqual(
    result.tables.quote_provider_stats.sampleRows.map((row) => row.provider).sort(),
    ['naver', 'yahoo']
  );
  assert.deepEqual(
    result.tables.job_runs.sampleRows.map((row) => row.key).sort(),
    ['lastDailyBriefingDate', 'lastDividendEventAlert', 'lastDividendRefresh']
  );
  assert.deepEqual(
    result.tables.settings.sampleRows.map((row) => row.key),
    ['telegramUpdateOffset']
  );
});

async function createFixtureStore() {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'stock-alarm-postgres-fixture-'));
  await fs.copyFile(fixtureSnapshotUrl, path.join(dataDir, 'store.json'));

  return new JsonStore(dataDir, {
    defaultAlertCooldownMinutes: 30,
    backups: {
      enabled: false
    }
  });
}

async function readJson(url) {
  return JSON.parse(await fs.readFile(url, 'utf8'));
}
