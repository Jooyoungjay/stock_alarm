import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateDrawdownPercent,
  calculateThresholdPrice,
  evaluateStock
} from '../src/alertEngine.js';

const baseStock = {
  id: 'stock-1',
  symbol: 'AAPL',
  displayName: 'Apple',
  thresholdPercent: 5,
  alertCooldownMinutes: 30,
  active: true,
  highPrice: null,
  highPriceAt: null,
  lastPrice: null,
  lastCheckedAt: null,
  lastAlertAt: null,
  currency: 'USD',
  exchange: 'Nasdaq',
  marketState: '',
  notes: '',
  createdAt: '2026-05-11T00:00:00.000Z',
  updatedAt: '2026-05-11T00:00:00.000Z'
};

test('first quote sets the high price without alerting', () => {
  const result = evaluateStock(baseStock, { price: 100, currency: 'USD' }, date('2026-05-11T00:01:00Z'));

  assert.equal(result.alertDue, false);
  assert.equal(result.highUpdated, true);
  assert.equal(result.nextStock.highPrice, 100);
  assert.equal(result.thresholdPrice, 95);
});

test('drop below threshold creates an alert when cooldown allows it', () => {
  const stock = {
    ...baseStock,
    highPrice: 100,
    highPriceAt: '2026-05-11T00:01:00.000Z'
  };
  const result = evaluateStock(stock, { price: 94, currency: 'USD' }, date('2026-05-11T00:10:00Z'));

  assert.equal(result.alertDue, true);
  assert.equal(result.highUpdated, false);
  assert.equal(result.drawdownPercent, 6);
  assert.equal(result.thresholdPrice, 95);
});

test('cooldown blocks repeated alerts', () => {
  const stock = {
    ...baseStock,
    highPrice: 100,
    lastAlertAt: '2026-05-11T00:00:00.000Z'
  };
  const result = evaluateStock(stock, { price: 90, currency: 'USD' }, date('2026-05-11T00:10:00Z'));

  assert.equal(result.alertDue, false);
  assert.equal(result.drawdownPercent, 10);
});

test('new high updates the high price and suppresses alert', () => {
  const stock = {
    ...baseStock,
    highPrice: 100,
    lastAlertAt: '2026-05-11T00:00:00.000Z'
  };
  const result = evaluateStock(stock, { price: 101, currency: 'USD' }, date('2026-05-11T01:00:00Z'));

  assert.equal(result.alertDue, false);
  assert.equal(result.highUpdated, true);
  assert.equal(result.nextStock.highPrice, 101);
});

test('drawdown and threshold helpers handle basic math', () => {
  assert.equal(calculateDrawdownPercent(200, 180), 10);
  assert.equal(calculateThresholdPrice(200, 7.5), 185);
});

function date(value) {
  return new Date(value);
}
