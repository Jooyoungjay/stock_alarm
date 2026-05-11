import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeSymbolInput } from '../src/symbols.js';

test('normalizes plain symbols', () => {
  assert.equal(normalizeSymbolInput('aapl'), 'AAPL');
});

test('extracts Korean stock codes from mixed input', () => {
  assert.equal(normalizeSymbolInput('336260 두산 퓨얼셀'), '336260');
  assert.equal(normalizeSymbolInput('336260.KS 두산퓨얼셀'), '336260.KS');
});

test('maps common Korean name aliases', () => {
  assert.equal(normalizeSymbolInput('두산퓨얼셀'), '336260');
  assert.equal(normalizeSymbolInput('두산 퓨어셀'), '336260');
});
