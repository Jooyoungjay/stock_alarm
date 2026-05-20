#!/usr/bin/env node

import { pathToFileURL } from 'node:url';

import { config } from '../src/config.js';
import {
  buildKisQuoteSmokeTest,
  formatKisQuoteSmokeTestReport,
  getKisQuoteSmokeTestHelp,
  parseKisQuoteSmokeTestArgs
} from '../src/kisQuoteSmokeTest.js';

export async function main(argv = process.argv.slice(2), io = {}) {
  const stdout = io.stdout || process.stdout;
  const stderr = io.stderr || process.stderr;
  const options = parseKisQuoteSmokeTestArgs(argv, {
    env: io.env
  });

  if (options.help) {
    stdout.write(`${getKisQuoteSmokeTestHelp()}\n`);
    return 0;
  }

  const env = options.env || process.env;
  const result = await buildKisQuoteSmokeTest({
    symbol: options.symbol,
    market: options.market,
    kisApiBaseUrl: options.baseUrl || env.KIS_API_BASE_URL || config.kisApiBaseUrl,
    kisAppKey: env.KIS_APP_KEY || config.kisAppKey,
    kisAppSecret: env.KIS_APP_SECRET || config.kisAppSecret,
    kisAccessToken: options.forceToken ? '' : env.KIS_ACCESS_TOKEN || config.kisAccessToken,
    kisTokenAutoRefresh: config.kisTokenAutoRefresh,
    kisTokenCachePath: options.cachePath || env.KIS_TOKEN_CACHE_PATH || config.kisTokenCachePath,
    forceRefresh: options.forceToken,
    kisCustType: env.KIS_CUST_TYPE || config.kisCustType,
    timeoutMs: options.timeoutMs || config.quoteTimeoutMs
  });

  if (options.json) {
    stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } else {
    stdout.write(formatKisQuoteSmokeTestReport(result));
  }

  if (!result.ok) {
    stderr.write('KIS 현재가 smoke test에 실패했습니다.\n');
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
