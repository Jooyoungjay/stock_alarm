#!/usr/bin/env node

import { pathToFileURL } from 'node:url';

import { config } from '../src/config.js';
import {
  buildExternalApiRecheck,
  formatExternalApiRecheckReport,
  getExternalApiRecheckHelp,
  parseExternalApiRecheckArgs
} from '../src/externalApiRecheck.js';

export async function main(argv = process.argv.slice(2), io = {}) {
  const stdout = io.stdout || process.stdout;
  const stderr = io.stderr || process.stderr;
  const options = parseExternalApiRecheckArgs(argv, {
    env: io.env
  });

  if (options.help) {
    stdout.write(`${getExternalApiRecheckHelp()}\n`);
    return 0;
  }

  const result = await buildExternalApiRecheck({
    config,
    env: options.env || process.env,
    fetch: io.fetch,
    sendTelegram: options.sendTelegram,
    kisSymbol: options.kisSymbol,
    kisMarket: options.kisMarket,
    publicDataSymbol: options.publicDataSymbol,
    publicDataStartDate: options.publicDataStartDate,
    publicDataEndDate: options.publicDataEndDate,
    timeoutMs: options.timeoutMs
  });

  if (options.json) {
    stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } else {
    stdout.write(formatExternalApiRecheckReport(result));
  }

  if (!result.ok) {
    stderr.write('외부 API 실계정 재점검에 미완료 항목이 있습니다.\n');
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
      console.error(error.message || error);
      process.exitCode = 1;
    });
}
