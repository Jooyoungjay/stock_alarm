#!/usr/bin/env node
/**
 * QA hook: run npm test after edits under src/, tests/, or public/.
 * Disable via .cursor/hooks.json if too noisy.
 */
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

function readStdin() {
  try {
    return readFileSync(0, 'utf8');
  } catch {
    return '';
  }
}

function extractEditedPath(payload) {
  const candidates = [
    payload.file_path,
    payload.filePath,
    payload.path,
    payload.file,
    payload.uri
  ].filter(Boolean);

  for (const value of candidates) {
    const text = String(value);
    if (text.includes('stock_alarm')) {
      const idx = text.indexOf('stock_alarm');
      const tail = text.slice(idx + 'stock_alarm'.length).replace(/^[/\\]+/, '');
      if (tail) {
        return tail.replace(/\\/g, '/');
      }
    }
    const normalized = text.replace(/^file:\/\//, '').replace(/\\/g, '/');
    if (normalized.includes('/src/') || normalized.includes('/tests/') || normalized.includes('/public/')) {
      const match = normalized.match(/(?:src|tests|public)\/.+$/);
      if (match) {
        return match[0];
      }
    }
  }

  return '';
}

function shouldRunTests(relativePath) {
  if (!relativePath) {
    return false;
  }

  return (
    relativePath.startsWith('src/') ||
    relativePath.startsWith('tests/') ||
    relativePath.startsWith('public/')
  );
}

const raw = readStdin();
let payload = {};

if (raw.trim()) {
  try {
    payload = JSON.parse(raw);
  } catch {
    payload = {};
  }
}

const editedPath = extractEditedPath(payload);

if (!shouldRunTests(editedPath)) {
  process.stdout.write(JSON.stringify({}));
  process.exit(0);
}

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

try {
  const output = execSync('npm test', {
    cwd: rootDir,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 110000,
    shell: true
  });

  const passMatch = output.match(/# pass (\d+)/);
  const failMatch = output.match(/# fail (\d+)/);
  const pass = passMatch ? passMatch[1] : '?';
  const fail = failMatch ? failMatch[1] : '0';

  process.stdout.write(
    JSON.stringify({
      additional_context: `QA hook: npm test after editing \`${editedPath}\` — pass ${pass}, fail ${fail}.`
    })
  );
  process.exit(0);
} catch (error) {
  const stderr = error.stderr?.toString() || '';
  const stdout = error.stdout?.toString() || '';
  const snippet = (stderr || stdout).split('\n').slice(-15).join('\n');

  process.stdout.write(
    JSON.stringify({
      additional_context: `QA hook: npm test FAILED after editing \`${editedPath}\`. Fix before finishing.\n${snippet}`
    })
  );
  process.exit(0);
}
