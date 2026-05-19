#!/usr/bin/env node

import { pathToFileURL } from 'node:url';

import {
  formatPostgresConnectionRehearsalReport,
  getPostgresConnectionRehearsalHelp,
  parsePostgresConnectionRehearsalArgs,
  runPostgresConnectionRehearsal
} from '../src/postgresConnectionRehearsal.js';

export async function main(argv = process.argv.slice(2), io = {}) {
  const stdout = io.stdout || process.stdout;
  const stderr = io.stderr || process.stderr;
  const options = parsePostgresConnectionRehearsalArgs(argv);

  if (options.help) {
    stdout.write(`${getPostgresConnectionRehearsalHelp()}\n`);
    return 0;
  }

  const result = await runPostgresConnectionRehearsal(options);

  if (options.json) {
    stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } else {
    stdout.write(formatPostgresConnectionRehearsalReport(result));
  }

  if (!result.ready) {
    stderr.write('Postgres 연결 리허설 검증에 실패했습니다.\n');
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
