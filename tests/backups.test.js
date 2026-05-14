import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  createBackup,
  deleteBackup,
  getBackupDir,
  listBackups,
  resolveBackup,
  restoreBackup
} from '../src/backups.js';
import { JsonStore } from '../src/storage.js';

test('createBackup copies store.json into the backups directory', async () => {
  const dataDir = await createDataDir();
  const storePayload = {
    stocks: [{ symbol: 'AAPL' }],
    alerts: [],
    meta: {}
  };
  await fs.writeFile(path.join(dataDir, 'store.json'), JSON.stringify(storePayload, null, 2), 'utf8');

  const backup = await createBackup(dataDir, {
    reason: 'manual test',
    maxBackups: 5
  });

  assert.equal(backup.created, true);
  assert.match(backup.name, /^store-\d{8}-\d{6}-\d{3}-manual-test-[a-f0-9]{8}\.json$/);

  const backupContent = JSON.parse(
    await fs.readFile(path.join(getBackupDir(dataDir), backup.name), 'utf8')
  );
  assert.equal(backupContent.stocks[0].symbol, 'AAPL');
});

test('createBackup accepts store.json with a UTF-8 BOM', async () => {
  const dataDir = await createDataDir();
  await fs.writeFile(
    path.join(dataDir, 'store.json'),
    '\uFEFF{"stocks":[{"symbol":"AAPL"}],"alerts":[],"meta":{}}\n',
    'utf8'
  );

  const backup = await createBackup(dataDir, {
    reason: 'bom test',
    maxBackups: 5
  });
  const backupContent = await fs.readFile(path.join(getBackupDir(dataDir), backup.name), 'utf8');

  assert.equal(backup.created, true);
  assert.equal(backupContent.startsWith('\uFEFF'), false);
  assert.equal(JSON.parse(backupContent).stocks[0].symbol, 'AAPL');
});

test('JsonStore reads store.json with a UTF-8 BOM', async () => {
  const dataDir = await createDataDir();
  await fs.writeFile(
    path.join(dataDir, 'store.json'),
    '\uFEFF{"stocks":[{"symbol":"AAPL"}],"alerts":[],"meta":{}}\n',
    'utf8'
  );

  const store = new JsonStore(dataDir, {
    defaultAlertCooldownMinutes: 30
  });
  const stocks = await store.listStocks();

  assert.equal(stocks[0].symbol, 'AAPL');
});

test('createBackup prunes old backups by retention count', async () => {
  const dataDir = await createDataDir();
  await fs.writeFile(path.join(dataDir, 'store.json'), '{"stocks":[],"alerts":[],"meta":{}}\n', 'utf8');

  await createBackup(dataDir, { reason: 'one', maxBackups: 2 });
  await delay(5);
  await createBackup(dataDir, { reason: 'two', maxBackups: 2 });
  await delay(5);
  await createBackup(dataDir, { reason: 'three', maxBackups: 2 });

  const backups = await listBackups(dataDir, { limit: 10 });

  assert.equal(backups.length, 2);
  assert.equal(backups[0].reason, 'three');
  assert.equal(backups[1].reason, 'two');
});

test('JsonStore creates automatic backups for stock mutations when enabled', async () => {
  const dataDir = await createDataDir();
  const store = new JsonStore(dataDir, {
    defaultAlertCooldownMinutes: 30,
    backups: {
      enabled: true,
      maxBackups: 10
    }
  });

  await store.addStock({
    symbol: 'AAPL',
    displayName: 'Apple',
    purchasePrice: 100,
    purchaseDate: '2026-05-01',
    thresholdPercent: 5
  });
  const stock = (await store.listStocks())[0];
  await store.updateStock(stock.id, { thresholdPercent: 6 });
  await store.deleteStock(stock.id);

  const backups = await listBackups(dataDir, { limit: 20 });
  const reasons = backups.map((backup) => backup.reason);

  assert.ok(reasons.includes('after-add-stock'));
  assert.ok(reasons.includes('before-update-stock'));
  assert.ok(reasons.includes('after-delete-stock'));
});

test('restoreBackup restores a validated backup and creates a safety backup first', async () => {
  const dataDir = await createDataDir();
  await fs.writeFile(
    path.join(dataDir, 'store.json'),
    JSON.stringify({ stocks: [{ symbol: 'OLD' }], alerts: [], meta: {} }, null, 2),
    'utf8'
  );
  const backup = await createBackup(dataDir, { reason: 'manual', maxBackups: 10 });

  await fs.writeFile(
    path.join(dataDir, 'store.json'),
    JSON.stringify({ stocks: [{ symbol: 'NEW' }], alerts: [], meta: {} }, null, 2),
    'utf8'
  );

  const result = await restoreBackup(dataDir, backup.name, { maxBackups: 10 });
  const restored = JSON.parse(await fs.readFile(path.join(dataDir, 'store.json'), 'utf8'));
  const backups = await listBackups(dataDir, { limit: 20 });

  assert.equal(result.restored, true);
  assert.equal(result.backup.name, backup.name);
  assert.equal(result.safetyBackup.created, true);
  assert.equal(restored.stocks[0].symbol, 'OLD');
  assert.ok(backups.some((item) => item.reason === 'before-restore'));
});

test('restoreBackup can resolve a backup by recent-list number', async () => {
  const dataDir = await createDataDir();
  await fs.writeFile(
    path.join(dataDir, 'store.json'),
    JSON.stringify({ stocks: [{ symbol: 'FIRST' }], alerts: [], meta: {} }, null, 2),
    'utf8'
  );
  await createBackup(dataDir, { reason: 'first', maxBackups: 10 });
  await delay(5);
  await fs.writeFile(
    path.join(dataDir, 'store.json'),
    JSON.stringify({ stocks: [{ symbol: 'SECOND' }], alerts: [], meta: {} }, null, 2),
    'utf8'
  );
  await createBackup(dataDir, { reason: 'second', maxBackups: 10 });

  const resolved = await resolveBackup(dataDir, '1');

  assert.equal(resolved.reason, 'second');
});

test('deleteBackup removes a validated backup file', async () => {
  const dataDir = await createDataDir();
  await fs.writeFile(path.join(dataDir, 'store.json'), '{"stocks":[],"alerts":[],"meta":{}}\n', 'utf8');
  const backup = await createBackup(dataDir, { reason: 'delete-me', maxBackups: 10 });

  const result = await deleteBackup(dataDir, backup.name);
  const backups = await listBackups(dataDir, { limit: 10 });

  assert.equal(result.deleted, true);
  assert.equal(result.backup.name, backup.name);
  assert.equal(backups.some((item) => item.name === backup.name), false);
  await assert.rejects(() => resolveBackup(dataDir, backup.name), /찾을 수 없습니다/);
});

test('restoreBackup rejects unsafe paths and invalid store payloads', async () => {
  const dataDir = await createDataDir();
  await fs.writeFile(path.join(dataDir, 'store.json'), '{"stocks":[],"alerts":[],"meta":{}}\n', 'utf8');
  await assert.rejects(() => resolveBackup(dataDir, '../store.json'), /파일명만/);

  const backupDir = getBackupDir(dataDir);
  await fs.mkdir(backupDir, { recursive: true });
  const invalidName = 'store-20260511-120000-000-invalid-12345678.json';
  await fs.writeFile(path.join(backupDir, invalidName), '{"stocks":[],"meta":{}}\n', 'utf8');

  await assert.rejects(() => restoreBackup(dataDir, invalidName), /alerts 배열/);
});

async function createDataDir() {
  return fs.mkdtemp(path.join(os.tmpdir(), 'stock-alarm-backup-test-'));
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
