#!/usr/bin/env node

import { pathToFileURL } from 'node:url';

import {
  formatLocalObservationReport,
  getLocalObservationHelp,
  parseLocalObservationArgs,
  runLocalObservationCheck
} from '../src/localObservationCheck.js';

export async function main(argv = process.argv.slice(2), io = {}) {
  const stdout = io.stdout || process.stdout;
  const stderr = io.stderr || process.stderr;
  const options = parseLocalObservationArgs(argv, {
    env: io.env,
    rootDir: io.rootDir,
    baseUrl: io.baseUrl,
    adminToken: io.adminToken,
    timeoutMs: io.timeoutMs
  });

  if (options.help) {
    stdout.write(`${getLocalObservationHelp()}\n`);
    return 0;
  }

  const result = await runLocalObservationCheck({
    ...options,
    fetchImpl: io.fetchImpl,
    now: io.now
  });

  if (options.json) {
    stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } else {
    stdout.write(formatLocalObservationReport(result));
  }

  if (!result.ready) {
    stderr.write('로컬 웹앱 실사용 체크에 실패 항목이 있습니다.\n');
    return 1;
  }

  if (options.failOnManual && result.summary.manual > 0) {
    stderr.write('로컬 웹앱 실사용 체크에 수동 확인 항목이 남아 있습니다.\n');
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
