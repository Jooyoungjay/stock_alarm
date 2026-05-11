import { setTimeout as delay } from 'node:timers/promises';
import { config } from '../src/config.js';
import {
  APP_NAME,
  getRuntimeInfoPath,
  isSameRuntime,
  normalizeRuntimePath,
  readRuntimeInfo,
  removeRuntimeInfo
} from '../src/runtimeInfo.js';

function exitWithError(message) {
  console.error(message);
  process.exit(1);
}

function isProcessAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === 'EPERM';
  }
}

async function fetchHealth(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 1500);

  try {
    const response = await fetch(url, {
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}

function validateRuntimeFile(info) {
  if (info.appName !== APP_NAME) {
    exitWithError(`Refusing to stop: runtime file is not for ${APP_NAME}.`);
  }

  if (!Number.isInteger(Number(info.pid)) || Number(info.pid) <= 0) {
    exitWithError('Refusing to stop: runtime file has an invalid pid.');
  }

  if (!Number.isInteger(Number(info.port)) || Number(info.port) <= 0) {
    exitWithError('Refusing to stop: runtime file has an invalid port.');
  }

  if (normalizeRuntimePath(info.rootDir) !== normalizeRuntimePath(config.rootDir)) {
    exitWithError('Refusing to stop: runtime file belongs to a different project directory.');
  }
}

async function removeStaleRuntime(info) {
  await removeRuntimeInfo(config.dataDir, {
    pid: Number(info.pid),
    startedAt: info.startedAt
  });
}

async function waitUntilStopped(info) {
  for (let index = 0; index < 30; index += 1) {
    await delay(250);

    try {
      const health = await fetchHealth(info.healthUrl);

      if (!isSameRuntime(info, health, config)) {
        return true;
      }
    } catch {
      return true;
    }
  }

  return false;
}

const runtimePath = getRuntimeInfoPath(config.dataDir);

let info;
try {
  info = await readRuntimeInfo(config.dataDir);
} catch (error) {
  if (error.code === 'ENOENT') {
    console.log(`No Stock Alarm runtime file found at ${runtimePath}.`);
    process.exit(0);
  }

  throw error;
}

validateRuntimeFile(info);

let health;
try {
  health = await fetchHealth(info.healthUrl);
} catch (error) {
  if (!isProcessAlive(Number(info.pid))) {
    await removeStaleRuntime(info);
    console.log('Removed stale Stock Alarm runtime file. No running server was found.');
    process.exit(0);
  }

  exitWithError(
    `Refusing to stop pid ${info.pid}: health check failed, so this process cannot be verified as Stock Alarm.`
  );
}

if (!isSameRuntime(info, health, config)) {
  exitWithError('Refusing to stop: runtime file and health check do not describe the same server.');
}

console.log(`Stopping Stock Alarm pid ${info.pid} on port ${info.port}...`);

try {
  process.kill(Number(info.pid), 'SIGTERM');
} catch (error) {
  if (error.code !== 'ESRCH') {
    throw error;
  }
}

if (!(await waitUntilStopped(info))) {
  exitWithError(`Stock Alarm pid ${info.pid} did not stop within the timeout.`);
}

await removeStaleRuntime(info);
console.log('Stock Alarm server stopped.');
