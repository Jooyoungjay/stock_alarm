import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { DATA_SCHEMA_VERSION } from '../src/dataModel.js';
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
  const stock = await store.addStock(
    stockInput({
      quantity: 12.5,
      annualDividendPerShare: 1200,
      dividendFrequency: 'quarterly',
      dividendMonths: '3,6,9,12'
    })
  );

  assert.equal(stock.quantity, 12.5);
  assert.equal(stock.annualDividendPerShare, 1200);
  assert.equal(stock.dividendFrequency, 'quarterly');
  assert.deepEqual(stock.dividendMonths, [3, 6, 9, 12]);
  assert.equal(stock.dividendDataSource, 'manual');
  assert.ok(stock.dividendUpdatedAt);
  assert.equal((await store.listStocks())[0].quantity, 12.5);
  assert.equal((await store.listStocks())[0].annualDividendPerShare, 1200);
  assert.equal((await store.listStocks())[0].dividendFrequency, 'quarterly');
  assert.deepEqual((await store.listStocks())[0].dividendMonths, [3, 6, 9, 12]);

  const updated = await store.updateStock(stock.id, {
    quantity: '',
    annualDividendPerShare: '',
    dividendFrequency: '',
    dividendMonths: ''
  });
  assert.equal(updated.quantity, null);
  assert.equal(updated.annualDividendPerShare, null);
  assert.equal(updated.dividendFrequency, '');
  assert.deepEqual(updated.dividendMonths, []);
  assert.equal(updated.dividendDataSource, '');
  assert.equal(updated.dividendUpdatedAt, null);
  assert.equal(updated.dividendHistory.length, 1);
  assert.equal(updated.dividendHistory[0].provider, 'manual');
  assert.equal(updated.dividendHistory[0].previousAnnualDividendPerShare, 1200);
  assert.equal(updated.dividendHistory[0].annualDividendPerShare, null);

  await assert.rejects(
    () => store.updateStock(stock.id, { quantity: 0 }),
    /보유 수량/
  );

  await assert.rejects(
    () => store.updateStock(stock.id, { annualDividendPerShare: 0 }),
    /배당금/
  );

  await assert.rejects(
    () => store.updateStock(stock.id, { dividendFrequency: 'weekly' }),
    /배당 주기/
  );

  await assert.rejects(
    () => store.updateStock(stock.id, { dividendMonths: '0,13' }),
    /배당 지급월/
  );
});

test('JsonStore stores and updates investment plan fields', async () => {
  const store = await createStore();
  const stock = await store.addStock(
    stockInput({
      investmentReason: '수소 밸류체인 성장',
      investmentTargetPrice: 120000,
      sellCondition: '분기 적자가 확대되면 재검토',
      reviewDate: '2026-08-15',
      notes: '실적 발표 확인'
    })
  );

  assert.equal(stock.investmentReason, '수소 밸류체인 성장');
  assert.equal(stock.investmentTargetPrice, 120000);
  assert.equal(stock.sellCondition, '분기 적자가 확대되면 재검토');
  assert.equal(stock.reviewDate, '2026-08-15');
  assert.equal(stock.notes, '실적 발표 확인');

  const updated = await store.updateStock(stock.id, {
    investmentReason: '',
    investmentTargetPrice: '',
    sellCondition: '목표가 도달 또는 thesis 훼손',
    reviewDate: '',
    notes: ''
  });

  assert.equal(updated.investmentReason, '');
  assert.equal(updated.investmentTargetPrice, null);
  assert.equal(updated.sellCondition, '목표가 도달 또는 thesis 훼손');
  assert.equal(updated.reviewDate, '');
  assert.equal(updated.notes, '');

  await assert.rejects(
    () => store.updateStock(stock.id, { investmentTargetPrice: 0 }),
    /투자 목표가/
  );

  await assert.rejects(
    () => store.updateStock(stock.id, { reviewDate: '2026-99-99' }),
    /점검일/
  );
});

test('JsonStore records quote provider success and failure stats', async () => {
  const store = await createStore();

  await store.recordQuoteProviderAttempt({
    provider: 'naver',
    type: 'quote',
    symbol: '005930',
    status: 'success',
    startedAt: '2026-05-14T00:00:00.000Z',
    finishedAt: '2026-05-14T00:00:00.120Z',
    durationMs: 120
  });
  await store.recordQuoteProviderAttempt({
    provider: 'naver',
    type: 'quote',
    symbol: '005930',
    status: 'error',
    error: 'HTTP 500',
    startedAt: '2026-05-14T00:01:00.000Z',
    finishedAt: '2026-05-14T00:01:00.080Z',
    durationMs: 80
  });
  await store.recordQuoteProviderAttempt({
    provider: 'alphavantage',
    type: 'quote',
    symbol: '005930',
    status: 'skipped',
    reason: 'missing_alpha_vantage_key',
    finishedAt: '2026-05-14T00:01:00.081Z'
  });

  const stats = await store.getQuoteProviderStats();
  const naver = stats.providers.find((item) => item.provider === 'naver');
  const alphaVantage = stats.providers.find((item) => item.provider === 'alphavantage');

  assert.equal(naver.attempts, 2);
  assert.equal(naver.success, 1);
  assert.equal(naver.error, 1);
  assert.equal(naver.averageDurationMs, 100);
  assert.equal(naver.failureRatePercent, 50);
  assert.equal(naver.lastError, 'HTTP 500');
  assert.equal(alphaVantage.skipped, 1);
  assert.equal(stats.recentAttempts[0].provider, 'alphavantage');
});

test('JsonStore preserves quote source metadata on stored stocks', async () => {
  const store = await createStore();
  const stock = await store.addStock(stockInput());

  await store.replaceStock({
    ...stock,
    quoteProvider: 'naver',
    quoteProviderLabel: 'Naver Finance',
    quoteDataDelay: 'realtime_estimated',
    quoteVenue: 'krx_estimated',
    quoteLicenseType: 'unofficial',
    quoteSourceNote: '무료/비공식 시세',
    quoteRegularMarketTime: '2026-05-14T00:00:00.000Z',
    highPriceProvider: 'naver',
    highPriceProviderLabel: 'Naver Finance',
    highPriceDataDelay: 'eod',
    highPriceVenue: 'krx_estimated',
    highPriceSourceNote: '무료/비공식 시세 · 일봉 데이터'
  });

  const saved = (await store.listStocks())[0];
  assert.equal(saved.quoteProviderLabel, 'Naver Finance');
  assert.equal(saved.quoteDataDelay, 'realtime_estimated');
  assert.equal(saved.quoteVenue, 'krx_estimated');
  assert.equal(saved.quoteRegularMarketTime, '2026-05-14T00:00:00.000Z');
  assert.equal(saved.highPriceDataDelay, 'eod');
  assert.equal(saved.highPriceVenue, 'krx_estimated');
});

test('JsonStore normalizes schema metadata and reports data model counts', async () => {
  const store = await createStore();
  await fs.writeFile(
    store.filePath,
    JSON.stringify(
      {
        devices: [
          {
            id: 'device-1',
            platform: 'ios',
            pushTokens: [
              {
                token: 'ExponentPushToken[test]',
                provider: 'expo',
                platform: 'ios',
                enabled: true,
                updatedAt: '2026-05-15T00:00:00.000Z'
              }
            ]
          }
        ],
        stocks: [
          stockInput({
            id: 'stock-1',
            active: true,
            quantity: 2,
            dividendHistory: [
              {
                checkedAt: '2026-05-15T00:00:00.000Z',
                provider: 'manual',
                annualDividendPerShare: 100
              }
            ]
          })
        ],
        alerts: [{ id: 'alert-1', symbol: 'AAPL', createdAt: '2026-05-15T00:00:00.000Z' }]
      },
      null,
      2
    ),
    'utf8'
  );

  const data = await store.read();
  assert.equal(data.meta.schemaVersion, DATA_SCHEMA_VERSION);
  assert.ok(data.meta.createdAt);
  assert.ok(data.meta.updatedAt);

  const info = await store.getDataModelInfo();
  assert.equal(info.schemaVersion, DATA_SCHEMA_VERSION);
  assert.equal(info.storageEngine, 'json');
  assert.ok(info.entities.some((entity) => entity.name === 'stocks'));
  assert.equal(info.store.counts.devices, 1);
  assert.equal(info.store.counts.pushTokens, 1);
  assert.equal(info.store.counts.stocks, 1);
  assert.equal(info.store.counts.activeStocks, 1);
  assert.equal(info.store.counts.alerts, 1);
  assert.equal(info.store.counts.dividendEvents, 1);

  await store.write(data);
  const raw = JSON.parse(await fs.readFile(store.filePath, 'utf8'));
  assert.equal(raw.meta.schemaVersion, DATA_SCHEMA_VERSION);
  assert.ok(raw.meta.updatedAt);
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
