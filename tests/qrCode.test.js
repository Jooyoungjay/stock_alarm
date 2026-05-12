import test from 'node:test';
import assert from 'node:assert/strict';
import { createQrMatrix, createQrSvg } from '../src/qrCode.js';

test('createQrMatrix creates a square boolean matrix for a local URL', () => {
  const matrix = createQrMatrix('http://127.0.0.1:3000');

  assert.equal(matrix.length, 25);
  assert.ok(matrix.every((row) => row.length === matrix.length));
  assert.ok(matrix.flat().every((module) => typeof module === 'boolean'));
  assert.equal(matrix[0][0], true);
  assert.equal(matrix[6][6], true);
});

test('createQrSvg renders an SVG QR code', () => {
  const svg = createQrSvg('http://192.168.0.15:3000');

  assert.match(svg, /^<svg /);
  assert.match(svg, /<path fill="#0d1117"/);
  assert.match(svg, /접속 QR 코드/);
});

test('createQrMatrix rejects text that exceeds the supported local URL length', () => {
  assert.throws(() => createQrMatrix('https://example.com/'.padEnd(120, 'a')), /너무 깁니다/);
});
