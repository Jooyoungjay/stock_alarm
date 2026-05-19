import assert from 'node:assert/strict';

import { buildStoreSummary } from '../../src/dataModel.js';

export const SNAPSHOT_CONTRACT_METHODS = Object.freeze([
  'exportBackupSnapshot',
  'importBackupSnapshot',
  'createBackup',
  'restoreBackup',
  'listBackups',
  'deleteBackup'
]);

export async function assertRunnableSnapshotContract(options = {}) {
  const {
    name,
    createStore,
    fixture,
    replacement,
    expectedSummary,
    expectedStockSymbols,
    expectedAlertIds
  } = options;
  const store = await createStore();

  assertSnapshotContractMethods(store, name);

  const imported = await store.importBackupSnapshot(fixture);
  const importedSummary = buildStoreSummary(imported);
  assert.deepEqual(importedSummary.counts, expectedSummary.counts);

  const firstExport = await store.exportBackupSnapshot();
  assert.deepEqual(buildStoreSummary(firstExport).counts, expectedSummary.counts);
  assert.deepEqual(firstExport.stocks.map((stock) => stock.symbol), expectedStockSymbols);
  assert.deepEqual(
    (await store.listAlerts(100)).map((alert) => alert.id),
    expectedAlertIds
  );

  await store.importBackupSnapshot(replacement);
  const replacedExport = await store.exportBackupSnapshot();
  assert.deepEqual(replacedExport.stocks.map((stock) => stock.symbol), ['MSFT']);
  assert.equal((await store.listAlerts(100)).length, 0);

  await store.importBackupSnapshot(firstExport);
  const restoredExport = await store.exportBackupSnapshot();
  assert.deepEqual(buildStoreSummary(restoredExport).counts, expectedSummary.counts);
  assert.deepEqual(restoredExport.stocks.map((stock) => stock.symbol), expectedStockSymbols);
}

export async function assertUnavailableSnapshotContract(store, options = {}) {
  assertSnapshotContractMethods(store, options.name);

  for (const method of SNAPSHOT_CONTRACT_METHODS) {
    await assert.rejects(
      () => store[method](),
      options.errorPattern || /실행할 수 없습니다/,
      `${options.name || 'store'}.${method} should reject while unavailable`
    );
  }
}

export function assertSnapshotContractMethods(store, name = 'store') {
  for (const method of SNAPSHOT_CONTRACT_METHODS) {
    assert.equal(typeof store?.[method], 'function', `${name}.${method} must be a function`);
  }
}
