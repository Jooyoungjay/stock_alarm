import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  APP_NAME,
  buildRuntimeInfo,
  getRuntimeInfoPath,
  isSameRuntime,
  readRuntimeInfo,
  removeRuntimeInfo,
  writeRuntimeInfo
} from '../src/runtimeInfo.js';

test('runtime info is written, read, and removed only for the matching process', async () => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'stock-runtime-'));
  const config = {
    host: '127.0.0.1',
    rootDir: process.cwd(),
    dataDir
  };
  const startedAt = '2026-05-11T00:00:00.000Z';
  const info = buildRuntimeInfo(config, 3001, startedAt);

  const filePath = await writeRuntimeInfo(dataDir, info);
  assert.equal(filePath, getRuntimeInfoPath(dataDir));

  const saved = await readRuntimeInfo(dataDir);
  assert.equal(saved.appName, APP_NAME);
  assert.equal(saved.pid, process.pid);
  assert.equal(saved.port, 3001);
  assert.equal(saved.startedAt, startedAt);

  assert.equal(await removeRuntimeInfo(dataDir, { pid: process.pid + 1 }), false);
  assert.equal(await removeRuntimeInfo(dataDir, { pid: process.pid, startedAt }), true);
});

test('isSameRuntime requires app, pid, port, start time, and project directory to match', () => {
  const config = {
    rootDir: process.cwd()
  };
  const info = {
    appName: APP_NAME,
    pid: 123,
    port: 3001,
    startedAt: '2026-05-11T00:00:00.000Z',
    cwd: process.cwd(),
    rootDir: process.cwd()
  };
  const health = {
    appName: APP_NAME,
    pid: 123,
    port: 3001,
    startedAt: '2026-05-11T00:00:00.000Z',
    cwd: process.cwd()
  };

  assert.equal(isSameRuntime(info, health, config), true);
  assert.equal(isSameRuntime(info, { ...health, pid: 456 }, config), false);
  assert.equal(isSameRuntime(info, { ...health, port: 3002 }, config), false);
  assert.equal(isSameRuntime(info, { ...health, appName: 'other_app' }, config), false);
});
