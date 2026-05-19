import test from 'node:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { PostgresStore } from '../src/postgresStore.js';
import { JsonStore } from '../src/storage.js';
import {
  assertRunnableSnapshotContract,
  assertSnapshotContractMethods,
  assertUnavailableSnapshotContract
} from './helpers/storageSnapshotContract.js';

const fixtureSnapshotUrl = new URL('./fixtures/postgres-migration/store.snapshot.json', import.meta.url);
const expectedApiUrl = new URL('./fixtures/postgres-migration/expected-api.json', import.meta.url);

test('JsonStore satisfies the runnable backup snapshot export/import contract', async () => {
  const fixture = await readJson(fixtureSnapshotUrl);
  const expected = await readJson(expectedApiUrl);

  await assertRunnableSnapshotContract({
    name: 'JsonStore',
    createStore: createJsonStore,
    fixture,
    replacement: createReplacementSnapshot(),
    expectedSummary: {
      counts: expected.dataModelCounts
    },
    expectedStockSymbols: expected.stockSymbols,
    expectedAlertIds: expected.alertIds
  });
});

test('PostgresStore scaffold exposes snapshot methods but rejects runtime snapshot operations', async () => {
  const store = new PostgresStore({
    databaseUrl: 'postgres://stock_user:secret@localhost:5432/stock_alarm',
    backups: {
      enabled: true,
      maxBackups: 5
    }
  });

  assertSnapshotContractMethods(store, 'PostgresStore');
  await assertUnavailableSnapshotContract(store, {
    name: 'PostgresStore',
    errorPattern: /PostgresStore\..+아직 실행 가능하지 않습니다/
  });
});

async function createJsonStore() {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'stock-alarm-snapshot-contract-'));

  return new JsonStore(dataDir, {
    defaultAlertCooldownMinutes: 30,
    backups: {
      enabled: true,
      maxBackups: 5
    }
  });
}

function createReplacementSnapshot() {
  return {
    devices: [],
    stocks: [
      {
        id: 'replacement-stock',
        symbol: 'MSFT',
        displayName: 'Microsoft',
        purchasePrice: 300,
        quantity: 1,
        alertType: 'target_price',
        thresholdPercent: 5,
        targetPrice: 280,
        active: true,
        dividendHistory: [],
        createdAt: '2026-05-19T10:00:00.000Z',
        updatedAt: '2026-05-19T10:00:00.000Z'
      }
    ],
    alerts: [],
    meta: {
      schemaVersion: 1,
      createdAt: '2026-05-19T10:00:00.000Z',
      updatedAt: '2026-05-19T10:00:00.000Z'
    }
  };
}

async function readJson(url) {
  return JSON.parse(await fs.readFile(url, 'utf8'));
}
