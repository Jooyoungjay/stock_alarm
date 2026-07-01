import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TODAY_ACTION_OBSERVATION_TYPES,
  TODAY_ACTION_STOCK_TYPES,
  TODAY_ACTION_SYSTEM_TYPES
} from '../src/todayActionContract.js';
import {
  buildTelegramTodayActions,
  summarizeTodayActions
} from '../src/systemTodayActions.js';

const sharedContext = {
  stocks: [
    {
      symbol: '005930',
      displayName: '삼성전자',
      active: true,
      alertState: 'triggered',
      lastCheckStatus: 'error',
      lastError: 'timeout',
      lastCheckedAt: '2026-06-24T11:55:00.000Z',
      lastPrice: 70000
    }
  ],
  observationHistoryRecent: [
    {
      generatedAt: '2026-06-24T09:00:00.000Z',
      summary: { failed: 1, manual: 0 }
    }
  ],
  kisNaverAutoCompare: {
    checkedAt: '2026-06-24T09:00:00.000Z',
    alert: {
      openIssueCount: 1,
      issueStateSummary: { open: 1, total: 1 },
      issues: []
    }
  },
  telegramPollHealth: {
    status: 'stale',
    level: 'bad',
    label: '지연',
    detail: '마지막 폴링 3분 전',
    nextAction: '서버 상태 확인'
  },
  now: Date.parse('2026-06-24T12:00:00.000Z')
};

test('summarizeTodayActions matches buildTelegramTodayActions display count and top order', () => {
  const displayed = buildTelegramTodayActions(sharedContext);
  const summary = summarizeTodayActions(sharedContext);

  assert.equal(summary.displayed, displayed.length);
  assert.deepEqual(
    summary.top.map((item) => item.type),
    displayed.map((action) => action.type)
  );
});

test('health todayActionsSummary top items use contracted observation types', () => {
  const summary = summarizeTodayActions(sharedContext);
  const allowed = new Set([
    ...Object.keys(TODAY_ACTION_SYSTEM_TYPES),
    ...Object.keys(TODAY_ACTION_STOCK_TYPES)
  ]);

  for (const item of summary.top) {
    assert.ok(allowed.has(item.type), `unexpected top type: ${item.type}`);
    assert.ok(TODAY_ACTION_OBSERVATION_TYPES.includes(item.type));
  }
});

test('telegram and health summaries agree on critical count for shared context', () => {
  const displayed = buildTelegramTodayActions(sharedContext);
  const summary = summarizeTodayActions(sharedContext);
  const telegramCritical = displayed.filter((action) => action.priority === 'critical').length;

  assert.ok(summary.critical >= telegramCritical);
  assert.ok(summary.needsAttention >= telegramCritical);
});
