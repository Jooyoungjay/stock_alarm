import childProcess from 'node:child_process';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const command = process.argv[2] || 'status';
const wantsLanMode =
  command === 'start-lan' || process.argv.includes('--lan') || process.argv.includes('--phone');

if (wantsLanMode) {
  process.env.HOST = '0.0.0.0';
}

const { config } = await import('../src/config.js');
const {
  APP_NAME,
  getRuntimeHealthUrl,
  getRuntimeInfoPath,
  isSameRuntime,
  normalizeRuntimePath,
  readRuntimeInfo,
  removeRuntimeInfo
} = await import('../src/runtimeInfo.js');

const runtimePath = getRuntimeInfoPath(config.dataDir);
const outLogPath = path.join(config.dataDir, 'local-server.out.log');
const errLogPath = path.join(config.dataDir, 'local-server.err.log');

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

async function inspectRuntime(options = {}) {
  let info;

  try {
    info = await readRuntimeInfo(config.dataDir);
  } catch (error) {
    if (error.code === 'ENOENT') {
      return {
        state: 'stopped'
      };
    }

    throw error;
  }

  if (
    info.appName !== APP_NAME ||
    normalizeRuntimePath(info.rootDir) !== normalizeRuntimePath(config.rootDir)
  ) {
    return {
      state: 'foreign',
      info
    };
  }

  try {
    const health = await fetchHealth(getRuntimeHealthUrl(info));

    if (!isSameRuntime(info, health, config)) {
      return {
        state: 'mismatch',
        info,
        health
      };
    }

    return {
      state: 'running',
      info,
      health
    };
  } catch (error) {
    const pid = Number(info.pid);

    if (!Number.isFinite(pid) || !isProcessAlive(pid)) {
      if (options.cleanupStale) {
        await removeRuntimeInfo(config.dataDir, {
          pid,
          startedAt: info.startedAt
        });
      }

      return {
        state: options.cleanupStale ? 'stale_removed' : 'stale',
        info,
        error
      };
    }

    return {
      state: 'unverified',
      info,
      error
    };
  }
}

function getBrowserHost(host) {
  const rawHost = String(host || '').trim();

  if (!rawHost || rawHost === '0.0.0.0' || rawHost === '::') {
    return '127.0.0.1';
  }

  return rawHost;
}

function formatHost(host) {
  return host.includes(':') && !host.startsWith('[') ? `[${host}]` : host;
}

function getLocalUrl(info) {
  const host = formatHost(getBrowserHost(info.host));
  return `http://${host}:${info.port}`;
}

function getLanUrls(info) {
  if (info.host !== '0.0.0.0' && info.host !== '::') {
    return [];
  }

  return Object.values(os.networkInterfaces())
    .flat()
    .filter((item) => item && item.family === 'IPv4' && !item.internal)
    .map((item) => `http://${item.address}:${info.port}`);
}

function formatOptionalDate(value) {
  if (!value) {
    return '-';
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString('ko-KR');
}

function printRunningStatus(status, title = 'Stock Alarm 서버가 실행 중입니다.') {
  const { info, health } = status;
  const lanUrls = getLanUrls(info);

  console.log(title);
  console.log(`PID: ${info.pid}`);
  console.log(`포트: ${info.port}`);
  console.log(`PC 접속 주소: ${getLocalUrl(info)}`);
  console.log('종료: stop-local.bat 또는 npm run stop');

  if (lanUrls.length) {
    console.log('같은 Wi-Fi 휴대폰 접속 주소:');
    for (const url of lanUrls) {
      console.log(`- ${url}`);
    }
  }

  console.log(`텔레그램 설정: ${health.telegramConfigured ? '완료' : '미설정'}`);
  console.log(`시세 provider: ${health.quoteProviders}`);
  console.log(`일봉 provider: ${health.historicalQuoteProviders || health.quoteProviders}`);
  console.log(`시세 확인 주기: ${health.pollIntervalSeconds}초`);
  console.log(`마지막 시세 확인: ${formatOptionalDate(health.lastCheck?.checkedAt)}`);
  console.log(`마지막 명령 확인: ${formatOptionalDate(health.lastTelegramCommandPoll?.checkedAt)}`);
  console.log(`실행 정보: ${runtimePath}`);
  console.log(`로그: ${outLogPath}`);
  console.log(`오류 로그: ${errLogPath}`);
}

function printStoppedStatus(status) {
  if (status.state === 'stopped') {
    console.log('Stock Alarm 서버가 실행 중이 아닙니다.');
    console.log(`실행 정보 파일: ${runtimePath}`);
    console.log('시작: start-local.bat 또는 npm run local:start');
    console.log('상태: status-local.bat 또는 npm run local:status');
    return;
  }

  if (status.state === 'stale' || status.state === 'stale_removed') {
    console.log('실행 정보 파일은 있었지만 실제 서버는 실행 중이 아닙니다.');
    if (status.state === 'stale_removed') {
      console.log('오래된 실행 정보 파일을 정리했습니다.');
    }
    return;
  }

  if (status.state === 'foreign') {
    console.log('실행 정보 파일이 이 프로젝트의 Stock Alarm 서버가 아닙니다.');
    console.log(`파일: ${runtimePath}`);
    return;
  }

  if (status.state === 'mismatch') {
    console.log('실행 정보와 헬스 체크 응답이 서로 다릅니다. 자동 조작을 중단합니다.');
    return;
  }

  if (status.state === 'unverified') {
    console.log('실행 중인 프로세스가 있지만 Stock Alarm 서버인지 확인하지 못했습니다.');
    console.log(`PID: ${status.info.pid}`);
    console.log('다른 업무용 프로세스일 가능성을 배제할 수 없어 자동 조작하지 않습니다.');
  }
}

async function printStatus() {
  const status = await inspectRuntime();

  if (status.state === 'running') {
    printRunningStatus(status);
    return status;
  }

  printStoppedStatus(status);
  return status;
}

async function waitForServer(childPid) {
  for (let index = 0; index < 50; index += 1) {
    await delay(250);

    const status = await inspectRuntime();

    if (status.state === 'running') {
      return status;
    }

    if (!isProcessAlive(childPid)) {
      exitWithError(`서버 프로세스가 시작 중 종료되었습니다. 오류 로그를 확인하세요: ${errLogPath}`);
    }
  }

  exitWithError(`서버 시작을 확인하지 못했습니다. 로그를 확인하세요: ${outLogPath}`);
}

async function startServer() {
  await fs.mkdir(config.dataDir, { recursive: true });

  const currentStatus = await inspectRuntime({ cleanupStale: true });

  if (currentStatus.state === 'running') {
    printRunningStatus(currentStatus, 'Stock Alarm 서버가 이미 실행 중입니다.');
    return;
  }

  if (['foreign', 'mismatch', 'unverified'].includes(currentStatus.state)) {
    printStoppedStatus(currentStatus);
    exitWithError('안전을 위해 새 서버를 시작하지 않았습니다.');
  }

  const outLog = fsSync.openSync(outLogPath, 'a');
  const errLog = fsSync.openSync(errLogPath, 'a');
  const child = childProcess.spawn(process.execPath, ['src/server.js'], {
    cwd: config.rootDir,
    detached: true,
    env: {
      ...process.env,
      HOST: config.host,
      PORT: String(config.port),
      DATA_DIR: config.dataDir
    },
    stdio: ['ignore', outLog, errLog],
    windowsHide: true
  });

  child.unref();

  const status = await waitForServer(child.pid);
  printRunningStatus(status, wantsLanMode ? '휴대폰 테스트 모드로 서버를 시작했습니다.' : '서버를 시작했습니다.');

  if (wantsLanMode) {
    console.log('Windows 방화벽이 Node.js 접근 허용을 물어보면 같은 Wi-Fi 테스트를 위해 허용해야 합니다.');
  }
}

function printHelp() {
  console.log('사용법:');
  console.log('  node scripts/local-server.js start      # PC 전용 로컬 실행');
  console.log('  node scripts/local-server.js start-lan  # 같은 Wi-Fi에서 브라우저 접속 허용');
  console.log('  node scripts/local-server.js status     # 실행 상태 확인');
  console.log('종료: stop-local.bat 또는 npm run stop');
}

if (command === 'start' || command === 'start-lan') {
  await startServer();
} else if (command === 'status') {
  await printStatus();
} else if (command === 'help' || command === '--help' || command === '-h') {
  printHelp();
} else {
  printHelp();
  exitWithError(`알 수 없는 명령입니다: ${command}`);
}
