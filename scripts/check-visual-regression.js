#!/usr/bin/env node

import { pathToFileURL } from 'node:url';

import {
  formatVisualRegressionReport,
  getVisualRegressionHelp,
  parseVisualRegressionArgs,
  runVisualRegressionCheck
} from '../src/visualRegressionCheck.js';

export async function main(argv = process.argv.slice(2), io = {}) {
  const stdout = io.stdout || process.stdout;
  const stderr = io.stderr || process.stderr;
  const options = parseVisualRegressionArgs(argv, {
    env: io.env,
    rootDir: io.rootDir,
    baseUrl: io.baseUrl,
    outputDir: io.outputDir,
    adminToken: io.adminToken,
    timeoutMs: io.timeoutMs
  });

  if (options.help) {
    stdout.write(`${getVisualRegressionHelp()}\n`);
    return 0;
  }

  const result = await runVisualRegressionCheck({
    ...options,
    captureScenarios: io.captureScenarios,
    now: io.now
  });

  if (options.json) {
    stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } else {
    stdout.write(formatVisualRegressionReport(result));
  }

  if (!result.ready) {
    stderr.write('브라우저 시각 회귀 점검에 실패했습니다.\n');
    return 1;
  }

  if (options.failOnWarn && result.summary.warn > 0) {
    stderr.write('브라우저 시각 회귀 점검에 경고가 있어 실패로 처리합니다.\n');
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
