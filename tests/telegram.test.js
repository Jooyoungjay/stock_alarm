import test from 'node:test';
import assert from 'node:assert/strict';
import { formatAlertMessage } from '../src/telegram.js';

test('formatAlertMessage explains profit retracement with maximum profit amount', () => {
  const message = formatAlertMessage(
    {
      symbol: 'AAPL',
      displayName: 'Apple',
      purchasePrice: 100,
      quantity: 10,
      highPrice: 150,
      highPriceAt: '2026-05-08T00:00:00.000Z',
      purchaseDate: '2026-05-01',
      alertCooldownMinutes: 30
    },
    {
      price: 144,
      currency: 'USD'
    },
    12,
    145,
    {
      alertType: 'profit_retracement',
      alertTypeLabel: '이익금 반납률',
      thresholdLabel: '최고 이익금 10% 반납',
      metricLabel: '이익금 반납률'
    }
  );

  assert.match(message, /최대 수익금: 500 USD/);
  assert.match(message, /현재 수익금: 440 USD/);
  assert.match(message, /반납 금액: 60 USD/);
});
