import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {
  buildMobileHeaders,
  checkHealth,
  createDevice,
  createMobileStock,
  deleteMobileStock,
  getMobileSnapshot,
  normalizeBaseUrl,
  updateMobileStock
} from '../mobile/src/api.js';
import { summarizePortfolio } from '../mobile/src/format.js';
import { buildStockPayload, stockToForm, validateStockForm } from '../mobile/src/stockForm.js';

test('mobile API helpers normalize URLs and attach device auth headers', () => {
  assert.equal(normalizeBaseUrl('127.0.0.1:3001/'), 'http://127.0.0.1:3001');
  assert.deepEqual(
    buildMobileHeaders({ deviceId: 'device-1', deviceSecret: 'secret-1' }),
    {
      accept: 'application/json',
      'x-device-id': 'device-1',
      'x-device-secret': 'secret-1'
    }
  );
});

test('mobile API helpers call anonymous device endpoints', async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });

    if (url.endsWith('/api/mobile/ping')) {
      return jsonResponse({ ok: true, mobileApi: true, port: 3001 });
    }

    if (url.endsWith('/api/devices')) {
      return jsonResponse({
        device: { id: 'device-1', label: 'Joo iPhone', platform: 'ios' },
        deviceSecret: 'secret-1'
      }, 201);
    }

    if (url.endsWith('/api/mobile/stocks') && options.method === 'POST') {
      return jsonResponse({ stock: { id: 'stock-1', symbol: '336260', displayName: '두산퓨얼셀' } }, 201);
    }

    if (url.endsWith('/api/mobile/stocks/stock-1') && options.method === 'PATCH') {
      return jsonResponse({ stock: { id: 'stock-1', symbol: '336260', active: false } });
    }

    if (url.endsWith('/api/mobile/stocks/stock-1') && options.method === 'DELETE') {
      return jsonResponse({ ok: true });
    }

    return jsonResponse({ stocks: [{ id: 'stock-1', symbol: '336260' }], alerts: [] });
  };

  const created = await createDevice({
    baseUrl: 'http://localhost:3001',
    label: 'Joo iPhone',
    platform: 'ios',
    fetchImpl
  });
  const health = await checkHealth({
    baseUrl: 'http://localhost:3001',
    fetchImpl
  });
  const snapshot = await getMobileSnapshot({
    baseUrl: 'http://localhost:3001',
    session: { deviceId: created.device.id, deviceSecret: created.deviceSecret },
    fetchImpl
  });
  const added = await createMobileStock({
    baseUrl: 'http://localhost:3001',
    session: { deviceId: created.device.id, deviceSecret: created.deviceSecret },
    stock: { symbol: '336260', displayName: '두산퓨얼셀', thresholdPercent: 10 },
    fetchImpl
  });
  const updated = await updateMobileStock({
    baseUrl: 'http://localhost:3001',
    session: { deviceId: created.device.id, deviceSecret: created.deviceSecret },
    stockId: added.stock.id,
    patch: { active: false },
    fetchImpl
  });
  const deleted = await deleteMobileStock({
    baseUrl: 'http://localhost:3001',
    session: { deviceId: created.device.id, deviceSecret: created.deviceSecret },
    stockId: added.stock.id,
    fetchImpl
  });

  assert.equal(created.device.id, 'device-1');
  assert.equal(health.mobileApi, true);
  assert.equal(snapshot.stocks[0].symbol, '336260');
  assert.equal(added.stock.displayName, '두산퓨얼셀');
  assert.equal(updated.stock.active, false);
  assert.equal(deleted.ok, true);
  assert.equal(calls[0].options.method, 'POST');
  assert.equal(calls[1].url, 'http://localhost:3001/api/mobile/ping');
  assert.equal(calls[2].options.headers['x-device-id'], 'device-1');
  assert.equal(calls[3].options.method, 'POST');
  assert.equal(calls[4].options.method, 'PATCH');
  assert.equal(calls[5].options.method, 'DELETE');
});

test('mobile stock form builds add and edit payloads', () => {
  const form = stockToForm({
    id: 'stock-1',
    symbol: '336260',
    displayName: '두산퓨얼셀',
    purchasePrice: 80000,
    quantity: 10,
    alertType: 'profit_retracement',
    thresholdPercent: 15,
    alertCooldownMinutes: 30,
    investmentReason: '수소 성장',
    investmentTargetPrice: 120000,
    sellCondition: '분기 적자 확대',
    reviewDate: '2026-08-15',
    notes: '테스트'
  });

  validateStockForm(form, { editing: true });
  const addPayload = buildStockPayload(form, { editing: false });
  const editPayload = buildStockPayload({ ...form, active: false }, { editing: true });

  assert.equal(addPayload.symbol, '336260');
  assert.equal(addPayload.purchasePrice, 80000);
  assert.equal(addPayload.quantity, 10);
  assert.equal(addPayload.alertType, 'profit_retracement');
  assert.equal(addPayload.thresholdPercent, 15);
  assert.equal(addPayload.investmentTargetPrice, 120000);
  assert.equal(editPayload.symbol, undefined);
  assert.equal(editPayload.active, false);
});

test('mobile stock form rejects alert rules that need missing prices', () => {
  assert.throws(
    () => buildStockPayload({
      symbol: '336260',
      alertType: 'profit_retracement',
      thresholdPercent: '10',
      alertCooldownMinutes: '30'
    }),
    /매수가/
  );

  assert.throws(
    () => buildStockPayload({
      symbol: '336260',
      alertType: 'target_price',
      thresholdPercent: '10',
      alertCooldownMinutes: '30'
    }),
    /기준가/
  );
});

test('mobile portfolio summary counts active, warning, and triggered stocks', () => {
  const summary = summarizePortfolio([
    { active: true, alertState: 'clear', drawdownPercent: -8, thresholdPercent: 10 },
    { active: true, alertState: 'triggered', drawdownPercent: -12, thresholdPercent: 10 },
    { active: false, alertState: 'clear', drawdownPercent: -20, thresholdPercent: 10 }
  ]);

  assert.deepEqual(summary, {
    total: 3,
    active: 2,
    triggered: 1,
    warning: 1
  });
});

test('Expo mobile scaffold declares SDK 55 and app store identifiers', async () => {
  const packageJson = JSON.parse(await fs.readFile(new URL('../mobile/package.json', import.meta.url), 'utf8'));
  const appJson = JSON.parse(await fs.readFile(new URL('../mobile/app.json', import.meta.url), 'utf8'));
  const appSource = await fs.readFile(new URL('../mobile/App.js', import.meta.url), 'utf8');

  assert.equal(packageJson.dependencies.expo, '~55.0.0');
  assert.equal(packageJson.dependencies['expo-secure-store'], '~55.0.14');
  assert.equal(appJson.expo.ios.bundleIdentifier, 'com.jooyoungjay.stockalarm');
  assert.equal(appJson.expo.android.package, 'com.jooyoungjay.stockalarm');
  assert.match(appSource, /createDevice/);
  assert.match(appSource, /getMobileSnapshot/);
  assert.match(appSource, /createMobileStock/);
  assert.match(appSource, /updateMobileStock/);
  assert.match(appSource, /deleteMobileStock/);
});

function jsonResponse(payload, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return payload;
    }
  };
}
