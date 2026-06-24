import test from 'node:test';
import assert from 'node:assert/strict';

import { stripLegacyStoreFields, countLegacyStoreFields } from '../src/legacyStoreCleanup.js';
import { classifyQuoteFreshness, summarizeQuoteFreshness } from '../src/quoteFreshness.js';
import { assessTelegramPollHealth } from '../src/telegramPollHealth.js';

test('stripLegacyStoreFields removes devices push and deviceId fields', () => {
  const cleaned = stripLegacyStoreFields(
    {
      devices: [{ id: 'd1', pushTokens: [{ token: 'x' }] }],
      stocks: [{ id: 's1', symbol: 'AAPL', deviceId: 'd1' }],
      alerts: [
        {
          id: 'a1',
          symbol: 'AAPL',
          deviceId: 'd1',
          pushDeliveryStatus: 'none',
          pushDeliverySent: 0
        }
      ],
      meta: { schemaVersion: 1 }
    },
    { schemaVersion: 2 }
  );

  assert.equal(cleaned.devices, undefined);
  assert.equal(cleaned.stocks[0].deviceId, undefined);
  assert.equal(cleaned.alerts[0].pushDeliveryStatus, undefined);
  assert.equal(cleaned.meta.schemaVersion, 2);
  assert.equal(countLegacyStoreFields(cleaned).devices, 0);
});

test('classifyQuoteFreshness marks stale quotes using live-session threshold', () => {
  const now = new Date('2026-06-22T10:00:00.000Z').getTime();
  const freshness = classifyQuoteFreshness(
    {
      lastCheckedAt: '2026-06-22T09:00:00.000Z',
      lastPrice: 100,
      quoteProvider: 'kis'
    },
    { now, maxAgeMinutes: 30 }
  );

  assert.equal(freshness.status, 'stale');
  assert.match(freshness.nextAction, /live-session/);
  assert.equal(
    summarizeQuoteFreshness(
      [{ active: true, lastCheckedAt: '2026-06-22T09:00:00.000Z', lastPrice: 100 }],
      { now, maxAgeMinutes: 30 }
    ).needsAttention,
    1
  );
});

test('assessTelegramPollHealth flags stale polling as unresponsive', () => {
  const health = assessTelegramPollHealth({
    telegramConfigured: true,
    telegramCommandPollSeconds: 5,
    lastTelegramCommandPoll: {
      checkedAt: '2026-06-22T09:00:00.000Z'
    },
    now: new Date('2026-06-22T10:00:00.000Z').getTime()
  });

  assert.equal(health.status, 'stale');
  assert.match(health.nextAction, /TELEGRAM_/);
});
