import test from 'node:test';
import assert from 'node:assert/strict';
import { formatTodayActionPriority, filterCriticalTodayActions, TODAY_ACTION_PRIORITY_LABELS } from '../src/todayActionPriority.js';

test('formatTodayActionPriority maps known priorities', () => {
  assert.equal(formatTodayActionPriority('critical'), TODAY_ACTION_PRIORITY_LABELS.critical);
  assert.equal(formatTodayActionPriority('unknown'), TODAY_ACTION_PRIORITY_LABELS.info);
});

test('filterCriticalTodayActions keeps only critical priority rows', () => {
  const filtered = filterCriticalTodayActions([
    { type: 'threshold-alert', priority: 'critical' },
    { type: 'quote-stale', priority: 'warning' }
  ]);

  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].type, 'threshold-alert');
});
