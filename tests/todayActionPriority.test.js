import test from 'node:test';
import assert from 'node:assert/strict';
import { formatTodayActionPriority, TODAY_ACTION_PRIORITY_LABELS } from '../src/todayActionPriority.js';

test('formatTodayActionPriority maps known priorities', () => {
  assert.equal(formatTodayActionPriority('critical'), TODAY_ACTION_PRIORITY_LABELS.critical);
  assert.equal(formatTodayActionPriority('unknown'), TODAY_ACTION_PRIORITY_LABELS.info);
});
