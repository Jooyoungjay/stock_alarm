import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {
  buildAllTodayActions,
  buildSystemTodayActions,
  buildTelegramTodayActions,
  formatTelegramTodayMessage,
  getLatestObservationManualSummary,
  summarizeTodayActions
} from '../src/systemTodayActions.js';

test('buildSystemTodayActions includes poll health and quote freshness summaries', () => {
  const actions = buildSystemTodayActions({
    stocks: [
      {
        symbol: '005930',
        active: true,
        lastCheckedAt: '2020-01-01T00:00:00.000Z',
        lastPrice: 70000
      }
    ],
    telegramPollHealth: {
      status: 'stale',
      level: 'bad',
      label: '지연',
      detail: '마지막 폴링 3분 전',
      nextAction: '서버 상태 확인'
    },
    now: Date.parse('2026-06-24T12:00:00.000Z')
  });

  assert.ok(actions.some((action) => action.type === 'telegram-poll-health'));
  assert.ok(actions.some((action) => action.type === 'quote-freshness-summary'));
});

test('buildTelegramTodayActions prioritizes triggered alerts and formats message', () => {
  const actions = buildTelegramTodayActions({
    stocks: [
      {
        symbol: '005930',
        displayName: '삼성전자',
        active: true,
        alertState: 'triggered',
        lastCheckedAt: '2026-06-24T11:55:00.000Z',
        lastPrice: 70000
      }
    ],
    telegramPollHealth: { status: 'ok', level: 'ok', label: '정상', detail: '최근 폴링' },
    now: Date.parse('2026-06-24T12:00:00.000Z')
  });

  assert.equal(actions[0]?.type, 'threshold-alert');

  const message = formatTelegramTodayMessage(actions);
  assert.match(message, /오늘 확인할 일/);
  assert.match(message, /알림 기준 도달/);
  assert.match(message, /\/status 005930/);
});

test('getLatestObservationManualSummary reads manual count from recent history', () => {
  const summary = getLatestObservationManualSummary([
    {
      generatedAt: '2026-06-24T09:00:00.000Z',
      summary: { manual: 2 }
    }
  ]);

  assert.equal(summary?.manual, 2);
});

test('buildSystemTodayActions includes observation failed summary', () => {
  const actions = buildSystemTodayActions({
    stocks: [],
    observationHistoryRecent: [
      {
        generatedAt: '2026-06-24T09:00:00.000Z',
        summary: { failed: 2, manual: 0 }
      }
    ],
    telegramPollHealth: { status: 'ok', level: 'ok', label: '정상', detail: 'ok' }
  });

  assert.ok(actions.some((action) => action.type === 'observation-failed'));
});

test('buildSystemTodayActions includes open KIS/Naver compare issues', () => {
  const actions = buildSystemTodayActions({
    stocks: [],
    kisNaverAutoCompare: {
      checkedAt: '2026-06-24T09:00:00.000Z',
      alert: {
        openIssueCount: 2,
        issueStateSummary: { open: 2, total: 3 },
        issues: []
      }
    },
    telegramPollHealth: { status: 'ok', level: 'ok', label: '정상', detail: 'ok' }
  });

  const action = actions.find((item) => item.type === 'kis-naver-compare-open');

  assert.ok(action);
  assert.match(action.detail, /미처리 2개/);
  assert.match(action.commandHint, /KIS\/Naver/);
});

test('formatTelegramTodayMessage reports empty state', () => {
  const message = formatTelegramTodayMessage([]);
  assert.match(message, /긴급 확인 항목이 없습니다/);
});

test('summarizeTodayActions reports priority counts and top items', () => {
  const context = {
    stocks: [
      {
        symbol: '005930',
        displayName: '삼성전자',
        active: true,
        alertState: 'triggered',
        lastCheckedAt: '2026-06-24T11:55:00.000Z',
        lastPrice: 70000
      },
      {
        symbol: '000660',
        active: true,
        lastCheckStatus: 'error',
        lastError: 'timeout',
        lastCheckedAt: '2026-06-24T11:55:00.000Z'
      }
    ],
    observationHistoryRecent: [
      {
        generatedAt: '2026-06-24T09:00:00.000Z',
        summary: { failed: 1, manual: 0 }
      }
    ],
    telegramPollHealth: { status: 'ok', level: 'ok', label: '정상', detail: 'ok' },
    now: Date.parse('2026-06-24T12:00:00.000Z')
  };

  const summary = summarizeTodayActions(context);

  assert.ok(summary.total >= 3);
  assert.ok(summary.critical >= 2);
  assert.ok(summary.needsAttention >= summary.critical);
  assert.equal(summary.displayed, buildTelegramTodayActions(context).length);
  assert.equal(summary.top[0]?.type, 'threshold-alert');
  assert.equal(summary.top[0]?.symbol, '005930');
  assert.ok(summary.byType['threshold-alert'] >= 1);
  assert.ok(summary.byType['observation-failed'] >= 1);
});

test('buildAllTodayActions keeps more than telegram display limit', () => {
  const stocks = Array.from({ length: 8 }, (_, index) => ({
    symbol: `00${index}00`,
    active: true,
    alertState: 'triggered',
    lastCheckedAt: '2026-06-24T11:55:00.000Z',
    lastPrice: 1000 + index
  }));

  const allActions = buildAllTodayActions({
    stocks,
    telegramPollHealth: { status: 'ok', level: 'ok', label: '정상', detail: 'ok' },
    now: Date.parse('2026-06-24T12:00:00.000Z')
  });
  const displayed = buildTelegramTodayActions({
    stocks,
    telegramPollHealth: { status: 'ok', level: 'ok', label: '정상', detail: 'ok' },
    now: Date.parse('2026-06-24T12:00:00.000Z')
  });

  assert.ok(allActions.length > displayed.length);
  assert.equal(displayed.length, 5);
});
