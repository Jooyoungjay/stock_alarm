import fs from 'node:fs/promises';
import path from 'node:path';

export const APP_NAME = 'stock_alarm';
export const APP_DISPLAY_NAME = 'Stock Alarm';
export const RUNTIME_FILE_NAME = 'server.json';

export function getRuntimeInfoPath(dataDir) {
  return path.join(dataDir, RUNTIME_FILE_NAME);
}

export function normalizeRuntimePath(value) {
  return path.resolve(String(value || '')).toLowerCase();
}

export function buildRuntimeInfo(config, port, startedAt) {
  return {
    appName: APP_NAME,
    appDisplayName: APP_DISPLAY_NAME,
    pid: process.pid,
    ppid: process.ppid,
    host: config.host,
    port,
    cwd: process.cwd(),
    rootDir: config.rootDir,
    dataDir: config.dataDir,
    nodeVersion: process.version,
    platform: process.platform,
    startedAt,
    healthUrl: `http://${config.host}:${port}/api/health`
  };
}

export async function writeRuntimeInfo(dataDir, info) {
  await fs.mkdir(dataDir, { recursive: true });

  const filePath = getRuntimeInfoPath(dataDir);
  const tempPath = `${filePath}.tmp`;
  await fs.writeFile(tempPath, `${JSON.stringify(info, null, 2)}\n`, 'utf8');
  await fs.rename(tempPath, filePath);

  return filePath;
}

export async function readRuntimeInfo(dataDir) {
  const filePath = getRuntimeInfoPath(dataDir);
  const content = await fs.readFile(filePath, 'utf8');
  return JSON.parse(content);
}

export async function removeRuntimeInfo(dataDir, expected = {}) {
  const filePath = getRuntimeInfoPath(dataDir);

  let info;
  try {
    info = JSON.parse(await fs.readFile(filePath, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') {
      return false;
    }

    throw error;
  }

  if (expected.pid !== undefined && Number(info.pid) !== Number(expected.pid)) {
    return false;
  }

  if (expected.startedAt !== undefined && info.startedAt !== expected.startedAt) {
    return false;
  }

  await fs.unlink(filePath);
  return true;
}

export function isSameRuntime(info, health, config) {
  if (!info || !health) {
    return false;
  }

  return (
    info.appName === APP_NAME &&
    health.appName === APP_NAME &&
    Number(info.pid) === Number(health.pid) &&
    Number(info.port) === Number(health.port) &&
    info.startedAt === health.startedAt &&
    normalizeRuntimePath(info.cwd) === normalizeRuntimePath(health.cwd) &&
    normalizeRuntimePath(info.rootDir) === normalizeRuntimePath(config.rootDir)
  );
}
