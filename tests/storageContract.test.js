import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { PostgresStore, maskDatabaseUrl } from '../src/postgresStore.js';
import { JsonStore } from '../src/storage.js';
import { createStore } from '../src/storageFactory.js';
import { createFakePostgresClient } from './helpers/fakePostgresClient.js';
import {
  STORE_CONTRACT_METHODS,
  STORAGE_ENGINES,
  assertStoreContract,
  getStoreContractSnapshot,
  normalizeStorageEngine
} from '../src/storageContract.js';

test('JsonStore satisfies the storage contract', async () => {
  const store = await createJsonStore();
  const snapshot = getStoreContractSnapshot(store);

  assert.equal(snapshot.engine, STORAGE_ENGINES.JSON);
  assert.equal(snapshot.ready, true);
  assert.deepEqual(snapshot.missingMethods, []);
  assert.equal(snapshot.requiredMethodCount, STORE_CONTRACT_METHODS.length);
  assert.equal(assertStoreContract(store), store);
});

test('createStore returns a contract-compliant JsonStore for the default engine', async () => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'stock-alarm-factory-test-'));
  const store = createStore({
    dataDir,
    storageEngine: '',
    defaultAlertCooldownMinutes: 30,
    backupRetention: 5
  });

  assert.equal(store.engine, STORAGE_ENGINES.JSON);
  assert.equal(store.dataDir, dataDir);
  assert.equal(store.backups.enabled, true);
  assert.equal(store.backups.maxBackups, 5);
  assert.equal(typeof store.listBackups, 'function');
  assert.equal(typeof store.restoreBackup, 'function');
  assert.equal(typeof store.deleteBackup, 'function');
  assert.equal(typeof store.exportBackupSnapshot, 'function');
  assert.equal(typeof store.importBackupSnapshot, 'function');
  assert.deepEqual(getStoreContractSnapshot(store).missingMethods, []);
});

test('storage engine normalization rejects unsupported values', () => {
  assert.equal(normalizeStorageEngine(' JSON '), STORAGE_ENGINES.JSON);
  assert.equal(normalizeStorageEngine('postgres'), STORAGE_ENGINES.POSTGRES);
  assert.throws(() => normalizeStorageEngine('sqlite'), /지원하지 않는 저장소 엔진/);
});

test('PostgresStore query adapter satisfies the storage contract with an injected client', async () => {
  const queryClient = createFakePostgresClient();
  const store = new PostgresStore({
    databaseUrl: 'postgres://stock_user:secret@localhost:5432/stock_alarm',
    queryClient,
    backups: {
      enabled: false,
      maxBackups: 5
    }
  });
  const snapshot = getStoreContractSnapshot(store);

  assert.equal(snapshot.engine, STORAGE_ENGINES.POSTGRES);
  assert.equal(snapshot.ready, true);
  assert.deepEqual(snapshot.missingMethods, []);
  assert.equal(assertStoreContract(store), store);
  assert.equal(store.getConnectionInfo().configured, true);
  assert.equal(store.getConnectionInfo().runtimeEnabled, true);
  assert.equal(store.getConnectionInfo().implementationStage, 'jsonb-query-adapter');
  assert.equal(store.getConnectionInfo().databaseUrl, 'postgres://***:***@localhost:5432/stock_alarm');

  await store.importBackupSnapshot({
    devices: [],
    stocks: [
      {
        id: 'stock-1',
        symbol: 'AAPL',
        displayName: 'Apple',
        purchasePrice: 100,
        quantity: 2,
        alertType: 'profit_retracement',
        thresholdPercent: 10,
        active: true,
        dividendHistory: [],
        createdAt: '2026-05-19T00:00:00.000Z',
        updatedAt: '2026-05-19T00:00:00.000Z'
      }
    ],
    alerts: [],
    meta: {
      schemaVersion: 1,
      createdAt: '2026-05-19T00:00:00.000Z',
      updatedAt: '2026-05-19T00:00:00.000Z'
    }
  });

  const stocks = await store.listStocks();
  const alert = await store.appendAlert({
    stockId: 'stock-1',
    symbol: 'AAPL',
    alertType: 'profit_retracement',
    price: 120,
    sent: true,
    createdAt: '2026-05-19T00:01:00.000Z'
  });
  const dataModel = await store.getDataModelInfo();

  assert.deepEqual(stocks.map((stock) => stock.symbol), ['AAPL']);
  assert.equal(alert.symbol, 'AAPL');
  assert.equal((await store.listAlerts(10))[0].id, alert.id);
  assert.equal(await store.setMetaValue('telegramUpdateOffset', 42), 42);
  assert.equal(await store.getMetaValue('telegramUpdateOffset'), 42);
  assert.equal(dataModel.storageEngine, STORAGE_ENGINES.POSTGRES);
  assert.equal(dataModel.store.counts.stocks, 1);
  assert.ok(queryClient.queryLog.some((entry) => entry.sql.startsWith('CREATE TABLE IF NOT EXISTS')));
  assert.ok(queryClient.queryLog.some((entry) => entry.sql.startsWith('SELECT payload')));
  assert.ok(queryClient.queryLog.some((entry) => entry.sql.includes('DO UPDATE')));
});

test('PostgresStore without connection settings keeps runtime operations unavailable', async () => {
  const store = new PostgresStore();

  assert.equal(store.getConnectionInfo().runtimeEnabled, false);
  await assert.rejects(
    () => store.listStocks(),
    /PostgresStore\.connect를 실행할 수 없습니다/
  );
});

test('createStore blocks postgres runtime by default even though the query adapter exists', async () => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'stock-alarm-postgres-test-'));

  assert.throws(
    () =>
      createStore({
        dataDir,
        storageEngine: 'postgres',
        databaseUrl: 'postgres://stock_user:secret@localhost:5432/stock_alarm',
        defaultAlertCooldownMinutes: 30,
        backupRetention: 5
      }),
    /쿼리 어댑터까지 준비/
  );
});

test('createStore can return the postgres query adapter when explicitly allowed for contract tests', async () => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'stock-alarm-postgres-contract-test-'));
  const store = createStore(
    {
      dataDir,
      storageEngine: 'postgres',
      databaseUrl: '',
      defaultAlertCooldownMinutes: 30,
      backupRetention: 5
    },
    {
      allowExperimentalPostgres: true,
      backups: {
        enabled: false
      }
    }
  );

  assert.equal(store.engine, STORAGE_ENGINES.POSTGRES);
  assert.equal(store.backups.enabled, false);
  assert.equal(store.getConnectionInfo().configured, false);
  assert.deepEqual(getStoreContractSnapshot(store).missingMethods, []);
});

test('maskDatabaseUrl hides postgres credentials', () => {
  assert.equal(maskDatabaseUrl('postgres://user:pass@example.com/db'), 'postgres://***:***@example.com/db');
  assert.equal(maskDatabaseUrl('not-a-url://user:pass@example.com/db'), 'not-a-url://***:***@example.com/db');
  assert.equal(maskDatabaseUrl(''), '');
});

test('assertStoreContract reports missing methods', () => {
  assert.throws(
    () => assertStoreContract({ engine: 'custom', read() {} }, { name: 'CustomStore' }),
    /write/
  );
});

async function createJsonStore() {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'stock-alarm-contract-test-'));
  return new JsonStore(dataDir, {
    defaultAlertCooldownMinutes: 30
  });
}
