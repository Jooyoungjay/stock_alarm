import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildExpoPushMessage,
  isExpoPushToken,
  sendExpoPushMessages,
  sendPushNotificationToDevice
} from '../src/pushNotifications.js';

test('Expo push helpers validate tokens and build messages', () => {
  assert.equal(isExpoPushToken('ExponentPushToken[test]'), true);
  assert.equal(isExpoPushToken('ExpoPushToken[test]'), true);
  assert.equal(isExpoPushToken('plain-token'), false);

  const message = buildExpoPushMessage({
    token: 'ExpoPushToken[test]',
    title: 'Stock Alarm',
    body: '테스트',
    data: { type: 'test' }
  });

  assert.equal(message.to, 'ExpoPushToken[test]');
  assert.equal(message.sound, 'default');
  assert.equal(message.data.type, 'test');
});

test('sendExpoPushMessages summarizes successful and failed tickets', async () => {
  const calls = [];
  const result = await sendExpoPushMessages(
    [
      buildExpoPushMessage({ token: 'ExpoPushToken[first]', body: '첫번째' }),
      buildExpoPushMessage({ token: 'ExpoPushToken[second]', body: '두번째' })
    ],
    {
      endpoint: 'https://example.test/push',
      fetchImpl: async (url, options) => {
        calls.push({ url, options });
        return jsonResponse({
          data: [
            { status: 'ok', id: 'ticket-1' },
            { status: 'error', message: 'DeviceNotRegistered' }
          ]
        });
      }
    }
  );

  assert.equal(calls[0].url, 'https://example.test/push');
  assert.equal(JSON.parse(calls[0].options.body).length, 2);
  assert.equal(result.deliveryStatus, 'partial');
  assert.equal(result.sent, 1);
  assert.equal(result.failed, 1);
  assert.match(result.errors[0], /DeviceNotRegistered/);
});

test('sendPushNotificationToDevice uses stored Expo tokens', async () => {
  const store = {
    async listDevicePushTokens(deviceId, options) {
      assert.equal(deviceId, 'device-1');
      assert.deepEqual(options, {
        provider: 'expo',
        enabledOnly: true
      });
      return [
        { token: 'ExpoPushToken[first]', provider: 'expo', enabled: true },
        { token: 'ExpoPushToken[first]', provider: 'expo', enabled: true },
        { token: 'bad-token', provider: 'expo', enabled: true }
      ];
    }
  };
  const calls = [];
  const result = await sendPushNotificationToDevice(
    store,
    {
      mobilePushEnabled: true,
      expoPushEndpoint: 'https://example.test/push'
    },
    'device-1',
    {
      title: '알림',
      body: '본문',
      data: { type: 'stock-alert' }
    },
    {
      fetchImpl: async (url, options) => {
        calls.push({ url, options });
        return jsonResponse({ data: [{ status: 'ok', id: 'ticket-1' }] });
      }
    }
  );

  assert.equal(calls.length, 1);
  assert.equal(JSON.parse(calls[0].options.body).to, 'ExpoPushToken[first]');
  assert.equal(result.deliveryStatus, 'sent');
  assert.equal(result.sent, 1);
});

test('sendPushNotificationToDevice reports missing token as not configured', async () => {
  const result = await sendPushNotificationToDevice(
    {
      async listDevicePushTokens() {
        return [];
      }
    },
    { mobilePushEnabled: true },
    'device-1',
    { title: '알림', body: '본문' }
  );

  assert.equal(result.deliveryStatus, 'not_configured');
  assert.equal(result.reason, 'device_has_no_push_tokens');
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
