#!/usr/bin/env node

import { pathToFileURL } from 'node:url';

import {
  formatPostgresMigrationDryRunReport,
  getPostgresMigrationDryRunHelp,
  parsePostgresMigrationDryRunArgs,
  runPostgresMigrationDryRun
} from '../src/postgresMigrationDryRun.js';

export async function main(argv = process.argv.slice(2), io = {}) {
  const stdout = io.stdout || process.stdout;
  const stderr = io.stderr || process.stderr;
  const options = parsePostgresMigrationDryRunArgs(argv);

  if (options.help) {
    stdout.write(`${getPostgresMigrationDryRunHelp()}\n`);
    return 0;
  }

  const result = await runPostgresMigrationDryRun(options);

  if (options.json) {
    stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } else {
    stdout.write(formatPostgresMigrationDryRunReport(result));
  }

  if (!result.checks.every((check) => check.ok)) {
    stderr.write('dry-run 검증에 실패했습니다.\n');
    return 1;
  }

  if (options.failOnWarning && result.warnings.length > 0) {
    stderr.write('dry-run 주의 사항이 있어 실패로 처리합니다.\n');
    return 1;
  }

  return 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main().then((code) => {
    process.exitCode = code;
  }).catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
