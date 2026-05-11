import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeSymbolInput, searchSymbols } from '../src/symbols.js';

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

test('searches stock catalog by Korean names and aliases', () => {
  assert.deepEqual(searchSymbols('두산')[0], {
    symbol: '336260',
    name: '두산퓨얼셀',
    market: 'KOSPI'
  });
  assert.equal(searchSymbols('퓨어셀')[0].symbol, '336260');
});

test('searches stock catalog by US symbols and aliases', () => {
  assert.equal(searchSymbols('aap')[0].symbol, 'AAPL');
  assert.equal(searchSymbols('엔비디아')[0].symbol, 'NVDA');
});
