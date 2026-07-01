import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { OBSERVATION_STATIC_MARKERS } from '../src/localObservationStaticMarkers.js';
import {
  TODAY_ACTION_ADMIN_JUMP_TYPES,
  TODAY_ACTION_LIMIT,
  TODAY_ACTION_MAX_PER_STOCK,
  TODAY_ACTION_OBSERVATION_TYPES,
  TODAY_ACTION_STOCK_TYPES,
  TODAY_ACTION_SYSTEM_TYPES
} from '../src/todayActionContract.js';
import {
  buildAllTodayActions,
  buildSystemTodayActions,
  buildTelegramTodayActions
} from '../src/systemTodayActions.js';

const systemTodayActionsSource = await fs.readFile(
  new URL('../src/systemTodayActions.js', import.meta.url),
  'utf8'
);
const appJsSource = await fs.readFile(new URL('../public/app.js', import.meta.url), 'utf8');

function extractTodayActionTypes(source) {
  return [...source.matchAll(/type:\s*'([^']+)'/g)].map((match) => match[1]);
}

test('todayAction contract lists shared system and stock types', () => {
  assert.equal(TODAY_ACTION_LIMIT, 5);
  assert.equal(TODAY_ACTION_MAX_PER_STOCK, 2);
  assert.deepEqual(TODAY_ACTION_ADMIN_JUMP_TYPES, ['observation-manual', 'observation-failed']);
  assert.deepEqual(OBSERVATION_STATIC_MARKERS.todayActionTypes, TODAY_ACTION_OBSERVATION_TYPES);
});

test('systemTodayActions types and ranks match contract', () => {
  const context = {
    stocks: [
      {
        symbol: '005930',
        displayName: '삼성전자',
        active: true,
        alertState: 'triggered',
        lastCheckStatus: 'error',
        lastError: 'timeout',
        dividendLastError: 'dividend fail',
        lastCheckedAt: '2020-01-01T00:00:00.000Z',
        lastPrice: 70000
      },
      {
        symbol: '000660',
        active: true,
        lastCheckedAt: '2020-01-01T00:00:00.000Z',
        lastPrice: 1000
      },
      {
        symbol: '035420',
        active: true,
        lastPrice: null
      }
    ],
    observationHistoryRecent: [
      {
        generatedAt: '2026-06-24T09:00:00.000Z',
        summary: { failed: 1, manual: 2 }
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

  const systemActions = buildSystemTodayActions(context);
  const allActions = buildAllTodayActions(context);

  for (const [type, rank] of Object.entries(TODAY_ACTION_SYSTEM_TYPES)) {
    const action = systemActions.find((item) => item.type === type);
    assert.ok(action, `missing system action type: ${type}`);
    assert.equal(action.rank, rank, `rank mismatch for ${type}`);
  }

  for (const [type, rank] of Object.entries(TODAY_ACTION_STOCK_TYPES)) {
    const action = allActions.find((item) => item.type === type);
    assert.ok(action, `missing stock action type: ${type}`);
    assert.equal(action.rank, rank, `rank mismatch for ${type}`);
  }
});

test('systemTodayActions source only uses contracted shared types', () => {
  const types = new Set(extractTodayActionTypes(systemTodayActionsSource));
  const allowed = new Set(TODAY_ACTION_OBSERVATION_TYPES);

  for (const type of types) {
    assert.ok(allowed.has(type), `unexpected systemTodayActions type: ${type}`);
  }
});

test('today action observation markers exist in app.js', () => {
  for (const marker of OBSERVATION_STATIC_MARKERS.todayActionControls) {
    assert.match(appJsSource, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});

test('limitTodayActions sorts by rank and caps global and per-stock duplicates', () => {
  const stocks = Array.from({ length: 8 }, (_, index) => ({
    symbol: `00${index}00`,
    active: true,
    alertState: 'triggered',
    lastCheckedAt: '2026-06-24T11:55:00.000Z',
    lastPrice: 1000 + index
  }));

  const context = {
    stocks,
    telegramPollHealth: { status: 'ok', level: 'ok', label: '정상', detail: 'ok' },
    now: Date.parse('2026-06-24T12:00:00.000Z')
  };

  const displayed = buildTelegramTodayActions(context);

  assert.equal(displayed.length, TODAY_ACTION_LIMIT);
  assert.equal(displayed[0]?.type, 'threshold-alert');
  assert.ok(
    displayed.every((action, index, list) => {
      if (index === 0) {
        return true;
      }

      const previous = list[index - 1];
      return (
        action.rank > previous.rank ||
        (action.rank === previous.rank &&
          String(action.name || '').localeCompare(String(previous.name || ''), 'ko-KR', {
            numeric: true
          }) >= 0)
      );
    })
  );
});

test('limitTodayActions keeps at most two actions per stock', () => {
  const stock = {
    symbol: '005930',
    displayName: '삼성전자',
    active: true,
    alertState: 'triggered',
    lastCheckStatus: 'error',
    lastError: 'timeout',
    dividendLastError: 'dividend fail',
    lastCheckedAt: '2020-01-01T00:00:00.000Z',
    lastPrice: 70000
  };

  const displayed = buildTelegramTodayActions({
    stocks: [stock],
    telegramPollHealth: { status: 'ok', level: 'ok', label: '정상', detail: 'ok' },
    now: Date.parse('2026-06-24T12:00:00.000Z')
  });

  const forStock = displayed.filter((action) => action.stock?.symbol === '005930');

  assert.ok(forStock.length <= TODAY_ACTION_MAX_PER_STOCK);
  assert.equal(forStock[0]?.type, 'threshold-alert');
});

test('public app.js keeps today action limit constants aligned with contract', () => {
  assert.match(appJsSource, new RegExp(`const TODAY_ACTION_LIMIT = ${TODAY_ACTION_LIMIT};`));
  assert.match(
    appJsSource,
    new RegExp(`const TODAY_ACTION_MAX_PER_STOCK = ${TODAY_ACTION_MAX_PER_STOCK};`)
  );
  assert.match(
    appJsSource,
    /action\.stock\?\.id \|\| action\.stock\?\.symbol \|\| action\.name \|\| action\.type/
  );
});
