import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildKisNaverAutoCompareStableIssueKey,
  formatKisNaverAutoCompareAlertSkipReason,
  resolveKisNaverCompareIssueState,
  shouldResendReopenedResolvedIssues
} from '../src/kisNaverCompareAlertPolicy.js';

test('buildKisNaverAutoCompareStableIssueKey ignores transient error text', () => {
  assert.equal(
    buildKisNaverAutoCompareStableIssueKey({
      type: 'comparison_failed',
      symbol: '336260',
      key: 'comparison_failed:336260:error:KIS timeout'
    }),
    'comparison_failed:336260'
  );
  assert.equal(
    buildKisNaverAutoCompareStableIssueKey({
      type: 'current_drift',
      symbol: '005930',
      market: 'J',
      key: 'current_drift:005930:J:warning'
    }),
    'current_drift:005930:J'
  );
});

test('resolveKisNaverCompareIssueState reads legacy issue keys', () => {
  const state = resolveKisNaverCompareIssueState(
    'comparison_failed:336260',
    {
      'comparison_failed:336260:error:KIS timeout': {
        issueKey: 'comparison_failed:336260:error:KIS timeout',
        status: 'on_hold',
        updatedAt: '2026-05-20T03:00:00.000Z'
      }
    },
    ['comparison_failed:336260:error:KIS timeout']
  );

  assert.equal(state.status, 'on_hold');
});

test('shouldResendReopenedResolvedIssues waits for cooldown after resolve', () => {
  const now = new Date('2026-05-20T04:00:00.000Z');

  assert.equal(
    shouldResendReopenedResolvedIssues(
      ['comparison_failed:336260'],
      {
        'comparison_failed:336260': {
          status: 'resolved',
          updatedAt: '2026-05-20T03:30:00.000Z'
        }
      },
      now,
      1440
    ),
    false
  );
  assert.equal(
    shouldResendReopenedResolvedIssues(
      ['comparison_failed:336260'],
      {
        'comparison_failed:336260': {
          status: 'resolved',
          updatedAt: '2026-05-19T03:30:00.000Z'
        }
      },
      now,
      1440
    ),
    true
  );
});

test('formatKisNaverAutoCompareAlertSkipReason documents skip reasons', () => {
  assert.match(formatKisNaverAutoCompareAlertSkipReason('duplicate_issue'), /중복/);
  assert.match(formatKisNaverAutoCompareAlertSkipReason('all_issues_handled'), /처리/);
});
