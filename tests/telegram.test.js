import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchTelegramUpdates, formatAlertMessage, sendTelegramMessage } from '../src/telegram.js';

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

test('sendTelegramMessage uses injected fetch implementation', async () => {
  const calls = [];
  const payload = await sendTelegramMessage(
    {
      telegramBotToken: 'test-token',
      telegramChatId: 'chat-1'
    },
    'hello',
    {
      fetch: async (url, init) => {
        calls.push({ url, init });

        return {
          ok: true,
          status: 200,
          json: async () => ({ ok: true, result: { message_id: 1 } })
        };
      }
    }
  );

  assert.equal(payload.ok, true);
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /bottest-token\/sendMessage$/);
  assert.equal(JSON.parse(calls[0].init.body).chat_id, 'chat-1');
});

test('fetchTelegramUpdates uses injected fetch implementation', async () => {
  const calls = [];
  const updates = await fetchTelegramUpdates(
    {
      telegramBotToken: 'test-token'
    },
    123,
    {
      timeoutSeconds: 1,
      fetch: async url => {
        calls.push(url);

        return {
          ok: true,
          status: 200,
          json: async () => ({ ok: true, result: [{ update_id: 124 }] })
        };
      }
    }
  );

  assert.deepEqual(updates, [{ update_id: 124 }]);
  assert.equal(calls.length, 1);
  assert.match(calls[0], /offset=123/);
});
