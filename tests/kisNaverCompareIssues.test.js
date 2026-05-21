import assert from 'node:assert/strict';
import test from 'node:test';

import {
  applyKisNaverCompareIssueStates,
  buildKisNaverCompareIssueStateSummary,
  kisNaverCompareIssueStatesMetaKey,
  normalizeKisNaverCompareIssueStates,
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
