import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createBackup, getBackupDir, listBackups } from '../src/backups.js';
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

async function createDataDir() {
  return fs.mkdtemp(path.join(os.tmpdir(), 'stock-alarm-backup-test-'));
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
