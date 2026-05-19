import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  formatPostgresConnectionRehearsalReport,
  getPostgresConnectionRehearsalHelp,
  parsePostgresConnectionRehearsalArgs,
  runPostgresConnectionRehearsal
} from '../src/postgresConnectionRehearsal.js';
import { main as runPostgresConnectionRehearsalCli } from '../scripts/postgres-connection-rehearsal.js';
import { createFakePostgresClient } from './helpers/fakePostgresClient.js';

const fixtureSnapshotUrl = new URL('./fixtures/postgres-migration/store.snapshot.json', import.meta.url);

test('runPostgresConnectionRehearsal imports and exports the fixture through PostgresStore', async () => {
  const queryClient = createFakePostgresClient();
  const result = await runPostgresConnectionRehearsal({
    queryClient,
    databaseUrl: 'postgres://stock_user:secret@localhost:5432/stock_alarm',
    storePath: fileURLToPath(fixtureSnapshotUrl),
    now: '2026-05-19T09:30:00.000Z'
  });

  assert.equal(result.rehearsal, true);
  assert.equal(result.ready, true);
  assert.equal(result.generatedAt, '2026-05-19T09:30:00.000Z');
  assert.equal(result.postgres.databaseUrl, 'postgres://***:***@localhost:5432/stock_alarm');
  assert.equal(result.postgres.schema, 'public');
  assert.equal(result.postgres.tableName, 'stock_alarm_store_rehearsal');
  assert.deepEqual(result.checks.map((check) => check.ok), result.checks.map(() => true));
  assert.deepEqual(result.sourceSummary.counts, result.exportedSummary.counts);
  assert.ok(queryClient.queryLog.some((entry) => entry.sql.startsWith('CREATE SCHEMA IF NOT EXISTS')));
  assert.ok(queryClient.queryLog.some((entry) => entry.sql.startsWith('CREATE TABLE IF NOT EXISTS')));
  assert.ok(queryClient.queryLog.some((entry) => entry.sql.includes('DO UPDATE')));
});

test('formatPostgresConnectionRehearsalReport explains counts and checks', async () => {
  const result = await runPostgresConnectionRehearsal({
    queryClient: createFakePostgresClient(),
    databaseUrl: 'postgres://stock_user:secret@localhost:5432/stock_alarm',
    storePath: fileURLToPath(fixtureSnapshotUrl),
    now: '2026-05-19T09:30:00.000Z'
  });
  const report = formatPostgresConnectionRehearsalReport(result);

  assert.match(report, /Postgres 연결 리허설 결과/);
  assert.match(report, /stock_alarm_store_rehearsal/);
  assert.match(report, /원본 건수/);
  assert.match(report, /Postgres export 건수/);
  assert.match(report, /\[OK\] 종목 수/);
});

test('parsePostgresConnectionRehearsalArgs supports source and connection options', () => {
  const options = parsePostgresConnectionRehearsalArgs(
    [
      '--store',
      'data/backups/store.json',
      '--database-url',
      'postgres://user:pass@example.com/db',
      '--schema=stock_alarm',
      '--table-name',
      'stock_alarm_store_test',
      '--json',
      '--allow-production-table'
    ],
    {
      cwd: 'C:\\Project',
      env: {}
    }
  );

  assert.equal(options.dataDir, path.resolve('C:\\Project', 'data'));
  assert.equal(options.storePath, path.resolve('C:\\Project', 'data/backups/store.json'));
  assert.equal(options.databaseUrl, 'postgres://user:pass@example.com/db');
  assert.equal(options.schema, 'stock_alarm');
  assert.equal(options.tableName, 'stock_alarm_store_test');
  assert.equal(options.json, true);
  assert.equal(options.allowProductionTable, true);
});

test('Postgres rehearsal refuses missing connections and production table by default', async () => {
  await assert.rejects(
    () =>
      runPostgresConnectionRehearsal({
        storePath: fileURLToPath(fixtureSnapshotUrl),
        databaseUrl: '',
        env: {}
      }),
    /DATABASE_URL 또는 queryClient/
  );

  await assert.rejects(
    () =>
      runPostgresConnectionRehearsal({
        queryClient: createFakePostgresClient(),
        databaseUrl: 'postgres://user:pass@example.com/db',
        storePath: fileURLToPath(fixtureSnapshotUrl),
        tableName: 'stock_alarm_store'
      }),
    /운영 테이블명/
  );
});

test('postgres connection rehearsal CLI prints help', async () => {
  const helpOutput = createWritableBuffer();
  const helpCode = await runPostgresConnectionRehearsalCli(['--help'], {
    stdout: helpOutput,
    stderr: createWritableBuffer()
  });

  assert.equal(helpCode, 0);
  assert.match(helpOutput.text, /migrate:postgres:rehearsal/);
  assert.match(getPostgresConnectionRehearsalHelp(), /--database-url/);
});

function createWritableBuffer() {
  return {
    text: '',
    write(value) {
      this.text += value;
    }
  };
}
