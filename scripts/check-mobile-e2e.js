#!/usr/bin/env node

import { pathToFileURL } from 'node:url';

import {
  buildMobileE2eReadiness,
  formatMobileE2eReadinessReport,
  getMobileE2eReadinessHelp,
  parseMobileE2eReadinessArgs
} from '../src/mobileE2eReadiness.js';

export async function main(argv = process.argv.slice(2), io = {}) {
  const stdout = io.stdout || process.stdout;
  const stderr = io.stderr || process.stderr;
  const options = parseMobileE2eReadinessArgs(argv, {
    env: io.env,
    rootDir: io.rootDir,
    serverUrl: io.serverUrl
  });

  if (options.help) {
    stdout.write(`${getMobileE2eReadinessHelp()}\n`);
    return 0;
  }

  const result = await buildMobileE2eReadiness({
    ...options,
    fetchImpl: io.fetchImpl,
    networkInterfaces: io.networkInterfaces,
    nodeVersion: io.nodeVersion,
    now: io.now,
    runtimeInfo: io.runtimeInfo
  });

  if (options.json) {
    stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } else {
    stdout.write(formatMobileE2eReadinessReport(result));
  }

  if (!result.ready) {
    stderr.write('모바일 실기기 E2E 준비 점검에 실패했습니다.\n');
    return 1;
  }

  if (options.failOnWarn && result.summary.warn > 0) {
    stderr.write('모바일 실기기 E2E 준비 점검에 경고가 있어 실패로 처리합니다.\n');
    return 1;
  }

  return 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main()
    .then((code) => {
      process.exitCode = code;
    })
    .catch((error) => {
      process.stderr.write(`${error.message}\n`);
      process.exitCode = 1;
    });
}
