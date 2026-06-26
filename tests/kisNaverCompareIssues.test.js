import assert from 'node:assert/strict';
import test from 'node:test';

import {
  applyKisNaverCompareIssueStates,
  buildKisNaverCompareIssueStateSummary,
  kisNaverCompareIssueStatesMetaKey,
  normalizeKisNaverCompareIssueStates,
  reopenResolvedKisNaverCompareIssues,
  summarizeKisNaverCompareOpenIssues,
  updateKisNaverCompareIssueState
} from '../src/kisNaverCompareIssues.js';

test('updateKisNaverCompareIssueState stores a normalized issue status', async () => {
  const store = createMemoryStore();
  const result = await updateKisNaverCompareIssueState(
    store,
    {
      issueKey: 'market-change|336260|KRX',
      status: 'resolved',
      note: '확인 완료'
    },
    { now: new Date('2026-05-21T01:02:03.000Z') }
  );

  assert.equal(result.issueState.status, 'resolved');
  assert.equal(result.issueState.updatedAt, '2026-05-21T01:02:03.000Z');
  assert.equal(
    store.meta[kisNaverCompareIssueStatesMetaKey]['market-change|336260|KRX'].note,
    '확인 완료'
  );
});

test('updateKisNaverCompareIssueState rejects missing keys and invalid statuses', async () => {
  const store = createMemoryStore();

  await assert.rejects(
    () => updateKisNaverCompareIssueState(store, { status: 'resolved' }),
    /이슈 키/
  );
  await assert.rejects(
    () => updateKisNaverCompareIssueState(store, { issueKey: 'issue-1', status: 'done' }),
    /open, acknowledged, on_hold, resolved/
  );
});

test('applyKisNaverCompareIssueStates decorates alert issues and summarizes status counts', () => {
  const snapshot = {
    checkedAt: '2026-05-21T00:00:00.000Z',
    alert: {
      issues: [
        { key: 'issue-1', title: '반복 괴리' },
        { key: 'issue-2', title: '추천 변경' },
        { key: 'issue-3', title: '조회 실패' }
      ]
    }
  };
  const decorated = applyKisNaverCompareIssueStates(snapshot, {
    'issue-1': { status: 'acknowledged', updatedAt: '2026-05-21T01:00:00.000Z' },
    'issue-2': { status: 'resolved', updatedAt: '2026-05-21T01:10:00.000Z' }
  });

  assert.equal(decorated.alert.issues[0].resolution.status, 'acknowledged');
  assert.equal(decorated.alert.issues[1].resolution.status, 'resolved');
  assert.equal(decorated.alert.issues[2].resolution.status, 'open');
  assert.deepEqual(decorated.alert.issueStateSummary, {
    open: 1,
    acknowledged: 1,
    on_hold: 0,
    resolved: 1,
    total: 3
  });
  assert.equal(decorated.alert.openIssueCount, 1);
  assert.equal(decorated.alert.handledIssueCount, 2);
});

test('summarizeKisNaverCompareOpenIssues returns null when no open issues remain', () => {
  const snapshot = applyKisNaverCompareIssueStates(
    {
      checkedAt: '2026-06-24T09:00:00.000Z',
      alert: {
        issues: [{ key: 'issue-1', title: '괴리' }]
      }
    },
    {
      'issue-1': { status: 'resolved', updatedAt: '2026-06-24T09:30:00.000Z' }
    }
  );

  assert.equal(summarizeKisNaverCompareOpenIssues(snapshot), null);
});

test('summarizeKisNaverCompareOpenIssues counts open issues from enriched snapshot', () => {
  const snapshot = applyKisNaverCompareIssueStates(
    {
      checkedAt: '2026-06-24T09:00:00.000Z',
      alert: {
        issues: [
          { key: 'issue-1', title: '괴리' },
          { key: 'issue-2', title: '실패' }
        ]
      }
    },
    {
      'issue-1': { status: 'on_hold', updatedAt: '2026-06-24T09:10:00.000Z' }
    }
  );

  const summary = summarizeKisNaverCompareOpenIssues(snapshot);

  assert.equal(summary?.open, 1);
  assert.equal(summary?.total, 2);
  assert.equal(summary?.checkedAt, '2026-06-24T09:00:00.000Z');
});

test('normalizeKisNaverCompareIssueStates drops invalid entries', () => {
  assert.deepEqual(
    normalizeKisNaverCompareIssueStates({
      '': { status: 'resolved' },
      'issue-1': { status: 'ignored' },
      'issue-2': { status: 'on_hold', updatedAt: 'bad-date' }
    }),
    {
      'issue-2': {
        issueKey: 'issue-2',
        status: 'on_hold',
        updatedAt: '',
        note: ''
      }
    }
  );
});

test('reopenResolvedKisNaverCompareIssues only reopens resolved issues', async () => {
  const store = createMemoryStore({
    [kisNaverCompareIssueStatesMetaKey]: {
      'issue-1': { issueKey: 'issue-1', status: 'resolved' },
      'issue-2': { issueKey: 'issue-2', status: 'on_hold' }
    }
  });
  const result = await reopenResolvedKisNaverCompareIssues(
    store,
    ['issue-1', 'issue-2'],
    { now: new Date('2026-05-21T02:00:00.000Z') }
  );

  assert.deepEqual(result.reopenedIssueKeys, ['issue-1']);
  assert.equal(result.issueStates['issue-1'].status, 'open');
  assert.equal(result.issueStates['issue-1'].updatedAt, '2026-05-21T02:00:00.000Z');
  assert.equal(result.issueStates['issue-2'].status, 'on_hold');
});

test('buildKisNaverCompareIssueStateSummary counts issue resolutions', () => {
  assert.deepEqual(
    buildKisNaverCompareIssueStateSummary([
      { resolution: { status: 'open' } },
      { resolution: { status: 'acknowledged' } },
      { resolution: { status: 'on_hold' } },
      { resolution: { status: 'resolved' } },
      { resolution: { status: 'unknown' } }
    ]),
    {
      open: 2,
      acknowledged: 1,
      on_hold: 1,
      resolved: 1,
      total: 5
    }
  );
});

function createMemoryStore(meta = {}) {
  return {
    meta: { ...meta },
    async getMetaValue(key, fallback = null) {
      return this.meta[key] ?? fallback;
    },
    async setMetaValue(key, value) {
      this.meta[key] = value;
      return value;
    }
  };
}
