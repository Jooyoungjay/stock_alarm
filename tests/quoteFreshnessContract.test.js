import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

test('server and client quote freshness modules share core contract values', async () => {
  const [serverSource, clientSource] = await Promise.all([
    fs.readFile(new URL('../src/quoteFreshness.js', import.meta.url), 'utf8'),
    fs.readFile(new URL('../public/quoteFreshness.js', import.meta.url), 'utf8')
  ]);

  assert.match(serverSource, /DEFAULT_QUOTE_FRESHNESS_MAX_AGE_MINUTES = 30/);
  assert.match(clientSource, /DEFAULT_QUOTE_FRESHNESS_MAX_AGE_MINUTES = 30/);
  assert.match(serverSource, /label: '미확인'/);
  assert.match(clientSource, /label: '미확인'/);
  assert.match(serverSource, /hasPositiveNumber/);
  assert.match(clientSource, /hasPositiveNumber/);
});
