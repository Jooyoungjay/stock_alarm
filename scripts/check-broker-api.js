#!/usr/bin/env node

import { pathToFileURL } from 'node:url';

import {
  buildBrokerApiAdapterReview,
  formatBrokerApiAdapterReviewReport,
  getBrokerApiAdapterReviewHelp,
  parseBrokerApiAdapterReviewArgs
} from '../src/brokerApiAdapterReview.js';

export async function main(argv = process.argv.slice(2), io = {}) {
  const stdout = io.stdout || process.stdout;
  const stderr = io.stderr || process.stderr;
  const options = parseBrokerApiAdapterReviewArgs(argv, {
    env: io.env
  });

  if (options.help) {
    stdout.write(`${getBrokerApiAdapterReviewHelp()}\n`);
    return 0;
  }

  const result = buildBrokerApiAdapterReview(options);

  if (options.json) {
    stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } else {
    stdout.write(formatBrokerApiAdapterReviewReport(result));
  }

  if (!result.ready) {
    stderr.write('증권사 API adapter 점검에 실패했습니다.\n');
    return 1;
  }

  if (options.failOnWarn && result.summary.warn > 0) {
    stderr.write('증권사 API adapter 점검에 경고가 있어 실패로 처리합니다.\n');
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
