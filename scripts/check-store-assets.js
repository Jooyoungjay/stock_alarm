#!/usr/bin/env node

import { pathToFileURL } from 'node:url';

import {
  buildStoreSubmissionAssetsReadiness,
  formatStoreSubmissionAssetsReport,
  getStoreSubmissionAssetsHelp,
  parseStoreSubmissionAssetsArgs
} from '../src/storeSubmissionAssets.js';

export async function main(argv = process.argv.slice(2), io = {}) {
  const stdout = io.stdout || process.stdout;
  const stderr = io.stderr || process.stderr;
  const options = parseStoreSubmissionAssetsArgs(argv, {
    env: io.env,
    rootDir: io.rootDir,
    screenshotDir: io.screenshotDir
  });

  if (options.help) {
    stdout.write(`${getStoreSubmissionAssetsHelp()}\n`);
    return 0;
  }

  const result = await buildStoreSubmissionAssetsReadiness(options);

  if (options.json) {
    stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } else {
    stdout.write(formatStoreSubmissionAssetsReport(result));
  }

  if (!result.ready) {
    stderr.write('스토어 제출 자산 최종 점검에 실패했습니다.\n');
    return 1;
  }

  if (options.failOnWarn && result.summary.warn > 0) {
    stderr.write('스토어 제출 자산 최종 점검에 경고가 있어 실패로 처리합니다.\n');
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
