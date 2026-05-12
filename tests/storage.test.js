import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { JsonStore } from '../src/storage.js';

test('JsonStore creates and authenticates anonymous devices', async () => {
  const store = await createStore();
  const created = await store.createDevice({
    label: 'Joo iPhone',
    platform: 'ios'
  });

  assert.equal(created.device.label, 'Joo iPhone');
  assert.equal(created.device.platform, 'ios');
  assert.ok(created.device.id);
  assert.ok(created.deviceSecret);
  assert.equal(created.device.secretHash, undefined);

  const authenticated = await store.authenticateDevice(created.device.id, created.deviceSecret);
  assert.equal(authenticated.id, created.device.id);

  await assert.rejects(() => store.authenticateDevice(created.device.id, 'wrong-secret'));
});

test('JsonStore stores sanitized push tokens for devices', async () => {
  const store = await createStore();
  const created = await store.createDevice({ platform: 'android' });
  const device = await store.upsertDevicePushToken(created.device.id, {
    token: 'ExponentPushToken[test]',
    provider: 'expo',
    platform: 'android'
  });

  assert.equal(device.pushTokens.length, 1);
  assert.equal(device.pushTokens[0].provider, 'expo');
  assert.equal(device.pushTokens[0].platform, 'android');
  assert.equal(device.pushTokens[0].enabled, true);
  assert.equal(device.pushTokens[0].token, undefined);
});

test('JsonStore scopes stocks and alerts by anonymous device', async () => {
  const store = await createStore();
  const first = await store.createDevice({ label: 'first' });
  const second = await store.createDevice({ label: 'second' });

  const firstStock = await store.addStock(stockInput({ deviceId: first.device.id }));
  const secondStock = await store.addStock(stockInput({ deviceId: second.device.id }));

  await assert.rejects(() => store.addStock(stockInput({ deviceId: first.device.id })));

  assert.equal((await store.listStocks({ deviceId: first.device.id })).length, 1);
  assert.equal((await store.listStocks({ deviceId: second.device.id })).length, 1);
  assert.equal((await store.listStocks()).length, 2);

  await assert.rejects(() =>
    store.updateStock(firstStock.id, { thresholdPercent: 8 }, { deviceId: second.device.id })
  );

  await store.updateStock(firstStock.id, { thresholdPercent: 8 }, { deviceId: first.device.id });
  assert.equal((await store.listStocks({ deviceId: first.device.id }))[0].thresholdPercent, 8);

  await store.appendAlert({ deviceId: first.device.id, stockId: firstStock.id, symbol: 'AAPL' });
  await store.appendAlert({ deviceId: second.device.id, stockId: secondStock.id, symbol: 'AAPL' });

  assert.equal((await store.listAlerts(10, { deviceId: first.device.id })).length, 1);
  assert.equal((await store.listAlerts(10, { deviceId: second.device.id })).length, 1);

  await store.deleteStock(firstStock.id, { deviceId: first.device.id });
  assert.equal((await store.listStocks({ deviceId: first.device.id })).length, 0);
  assert.equal((await store.listStocks({ deviceId: second.device.id })).length, 1);
});

test('JsonStore stores and updates optional stock quantity', async () => {
  const store = await createStore();
  const stock = await store.addStock(stockInput({ quantity: 12.5 }));

  assert.equal(stock.quantity, 12.5);
  assert.equal((await store.listStocks())[0].quantity, 12.5);

  const updated = await store.updateStock(stock.id, { quantity: '' });
  assert.equal(updated.quantity, null);

  await assert.rejects(
    () => store.updateStock(stock.id, { quantity: 0 }),
    /보유 수량/
  );
});

async function createStore() {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'stock-alarm-storage-test-'));
  return new JsonStore(dataDir, {
    defaultAlertCooldownMinutes: 30
  });
}

function stockInput(overrides = {}) {
  return {
    symbol: 'AAPL',
    displayName: 'Apple',
    purchasePrice: 100,
    purchaseDate: '2026-05-01',
    thresholdPercent: 5,
    ...overrides
  };
}
