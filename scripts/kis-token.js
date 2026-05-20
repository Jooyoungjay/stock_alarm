#!/usr/bin/env node

import { pathToFileURL } from 'node:url';

import { config } from '../src/config.js';
import {
  buildKisTokenReport,
  formatKisTokenReport,
  getKisTokenHelp,
  parseKisTokenArgs
} from '../src/kisToken.js';

export async function main(argv = process.argv.slice(2), io = {}) {
  const stdout = io.stdout || process.stdout;
  const stderr = io.stderr || process.stderr;
  const options = parseKisTokenArgs(argv, {
    env: io.env || process.env
  });

  if (options.help) {
    stdout.write(`${getKisTokenHelp()}\n`);
    return 0;
  }

  const env = options.env;
  const result = await buildKisTokenReport({
    kisApiBaseUrl: env.KIS_API_BASE_URL || config.kisApiBaseUrl,
    kisAppKey: env.KIS_APP_KEY || config.kisAppKey,
    kisAppSecret: env.KIS_APP_SECRET || config.kisAppSecret,
    kisAccessToken: options.forceRefresh ? '' : env.KIS_ACCESS_TOKEN || config.kisAccessToken,
    kisTokenCachePath: options.cachePath || env.KIS_TOKEN_CACHE_PATH || config.kisTokenCachePath,
    dataDir: env.DATA_DIR || config.dataDir,
    forceRefresh: options.forceRefresh,
    timeoutMs: config.quoteTimeoutMs,
    fetch: io.fetch,
    now: io.now
  });

  if (options.json) {
    stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } else {
    stdout.write(formatKisTokenReport(result));
  }

  if (!result.ok) {
    stderr.write('KIS 접근 토큰 점검에 실패했습니다.\n');
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
