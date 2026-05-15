import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { JsonStore } from '../src/storage.js';
import { createStore } from '../src/storageFactory.js';
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
  assert.deepEqual(getStoreContractSnapshot(store).missingMethods, []);
});

test('storage engine normalization rejects unsupported values', () => {
  assert.equal(normalizeStorageEngine(' JSON '), STORAGE_ENGINES.JSON);
  assert.equal(normalizeStorageEngine('postgres'), STORAGE_ENGINES.POSTGRES);
  assert.throws(() => normalizeStorageEngine('sqlite'), /지원하지 않는 저장소 엔진/);
});

test('createStore fails clearly for the future postgres engine', async () => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'stock-alarm-postgres-test-'));

  assert.throws(
    () =>
      createStore({
        dataDir,
        storageEngine: 'postgres',
        defaultAlertCooldownMinutes: 30,
        backupRetention: 5
      }),
    /아직 구현되지 않았습니다/
  );
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
