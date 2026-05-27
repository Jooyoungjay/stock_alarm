import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

test('web app connection failures use actionable messages and mode-aware retry', async () => {
  const script = await fs.readFile(new URL('../public/app.js', import.meta.url), 'utf8');

  assert.match(script, /const CONNECTION_ERROR_MESSAGE/);
  assert.match(script, /const CONNECTION_ERROR_ACTION_MESSAGE/);
  assert.match(script, /wrapped\.isConnectionError = true/);
  assert.match(script, /function showErrorMessage/);
  assert.match(script, /function getDisplayErrorMessage/);
  assert.match(script, /function isConnectionError/);
  assert.match(script, /async function retryConnection/);
  assert.match(script, /await loadAdminData\(\)/);
  assert.doesNotMatch(script, /showMessage\(error\.message, true\)/);
  assert.doesNotMatch(script, /setConnectionProblem\(error\.message/);
});
