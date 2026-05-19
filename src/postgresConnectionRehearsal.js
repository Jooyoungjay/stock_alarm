import path from 'node:path';

import { buildStoreSummary, normalizeStoreEnvelope } from './dataModel.js';
import { loadJsonStoreSnapshot } from './postgresMigrationDryRun.js';
import { maskDatabaseUrl, PostgresStore } from './postgresStore.js';

const defaultRehearsalTableName = 'stock_alarm_store_rehearsal';
const productionTableName = 'stock_alarm_store';

export async function runPostgresConnectionRehearsal(options = {}) {
  const generatedAt = normalizeGeneratedAt(options.now);
  const env = options.env || process.env;
  const databaseUrl = String(options.databaseUrl || env.DATABASE_URL || '').trim();

  if (!databaseUrl && !options.queryClient) {
    throw new Error('Postgres 연결 리허설에는 DATABASE_URL 또는 queryClient가 필요합니다.');
  }

  const tableName = String(options.tableName || defaultRehearsalTableName).trim();

  if (tableName === productionTableName && options.allowProductionTable !== true) {
    throw new Error(
      `운영 테이블명(${productionTableName})은 기본 리허설에서 사용할 수 없습니다. 별도 검증 없이 운영 데이터를 덮지 않도록 전용 테이블을 사용하세요.`
    );
  }

  const source = await loadJsonStoreSnapshot(options);
  const sourceSnapshot = normalizeStoreEnvelope(source.snapshot, { now: generatedAt });
  const sourceSummary = buildStoreSummary(sourceSnapshot);
  const store = new PostgresStore({
    databaseUrl,
    queryClient: options.queryClient,
    createPool: options.createPool,
    dataDir: options.dataDir,
    schema: options.schema || 'public',
    tableName,
    defaultAlertCooldownMinutes: options.defaultAlertCooldownMinutes || 30,
    backups: {
      enabled: false
    }
  });

  try {
    await store.importBackupSnapshot(sourceSnapshot);
    const exportedSnapshot = await store.exportBackupSnapshot();
    const exportedSummary = buildStoreSummary(exportedSnapshot);
    const checks = buildRehearsalChecks(sourceSnapshot, exportedSnapshot, sourceSummary, exportedSummary);

    return {
      rehearsal: true,
      target: 'postgres',
      generatedAt,
      source: source.source,
      postgres: {
        ...store.getConnectionInfo(),
        databaseUrl: maskDatabaseUrl(databaseUrl),
        tableName
      },
      sourceSummary,
      exportedSummary,
      checks,
      ready: checks.every((check) => check.ok),
      note:
        tableName === defaultRehearsalTableName
          ? '리허설 전용 테이블에만 import/export를 수행했습니다.'
          : '사용자가 지정한 테이블에 import/export를 수행했습니다.'
    };
  } finally {
    await store.close();
  }
}

export function formatPostgresConnectionRehearsalReport(result) {
  const lines = [
    'Postgres 연결 리허설 결과',
    `대상: ${result.target}`,
    `생성 시각: ${result.generatedAt}`,
    `DB: ${result.postgres.databaseUrl || '(queryClient)'}`,
    `스키마/테이블: ${result.postgres.schema}.${result.postgres.tableName}`
  ];

  if (result.source?.storePath) {
    lines.push(`원본 파일: ${result.source.storePath}`);
  } else if (result.source?.dataDir) {
    lines.push(`원본 데이터 폴더: ${result.source.dataDir}`);
  }

  lines.push(
    '',
    '원본 건수:',
    formatCounts(result.sourceSummary.counts),
    '',
    'Postgres export 건수:',
    formatCounts(result.exportedSummary.counts),
    '',
    '검증 결과:'
  );

  for (const check of result.checks) {
    const status = check.ok ? 'OK' : 'FAIL';
    lines.push(`- [${status}] ${check.label}: expected=${formatValue(check.expected)}, actual=${formatValue(check.actual)}`);
  }

  lines.push('', result.note);

  return `${lines.join('\n')}\n`;
}

export function parsePostgresConnectionRehearsalArgs(args = [], options = {}) {
  const parsed = {
    cwd: options.cwd || process.cwd(),
    env: options.env || process.env,
    dataDir: 'data',
    storePath: '',
    databaseUrl: '',
    schema: 'public',
    tableName: defaultRehearsalTableName,
    json: false,
    help: false,
    allowProductionTable: false
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === '--help' || arg === '-h') {
      parsed.help = true;
    } else if (arg === '--json') {
      parsed.json = true;
    } else if (arg === '--allow-production-table') {
      parsed.allowProductionTable = true;
    } else if (arg === '--data-dir') {
      parsed.dataDir = requireNextValue(args, index, arg);
      index += 1;
    } else if (arg.startsWith('--data-dir=')) {
      parsed.dataDir = arg.slice('--data-dir='.length);
    } else if (arg === '--store') {
      parsed.storePath = requireNextValue(args, index, arg);
      index += 1;
    } else if (arg.startsWith('--store=')) {
      parsed.storePath = arg.slice('--store='.length);
    } else if (arg === '--database-url') {
      parsed.databaseUrl = requireNextValue(args, index, arg);
      index += 1;
    } else if (arg.startsWith('--database-url=')) {
      parsed.databaseUrl = arg.slice('--database-url='.length);
    } else if (arg === '--schema') {
      parsed.schema = requireNextValue(args, index, arg);
      index += 1;
    } else if (arg.startsWith('--schema=')) {
      parsed.schema = arg.slice('--schema='.length);
    } else if (arg === '--table-name') {
      parsed.tableName = requireNextValue(args, index, arg);
      index += 1;
    } else if (arg.startsWith('--table-name=')) {
      parsed.tableName = arg.slice('--table-name='.length);
    } else {
      throw new Error(`알 수 없는 옵션입니다: ${arg}`);
    }
  }

  parsed.databaseUrl = parsed.databaseUrl || parsed.env.DATABASE_URL || '';
  parsed.dataDir = parsed.dataDir ? path.resolve(parsed.cwd, parsed.dataDir) : '';
  parsed.storePath = parsed.storePath ? path.resolve(parsed.cwd, parsed.storePath) : '';

  return parsed;
}

export function getPostgresConnectionRehearsalHelp() {
  return [
    '사용법: npm run migrate:postgres:rehearsal -- [옵션]',
    '',
    '옵션:',
    '  --database-url <url>       Postgres 연결 문자열. 없으면 DATABASE_URL 환경변수 사용',
    '  --data-dir <path>          data 폴더 경로. 기본값: data',
    '  --store <path>             data/store.json 또는 백업 JSON 파일을 직접 지정',
    '  --schema <name>            Postgres schema. 기본값: public',
    `  --table-name <name>        리허설 테이블. 기본값: ${defaultRehearsalTableName}`,
    '  --allow-production-table   stock_alarm_store 테이블 사용을 명시 허용',
    '  --json                     사람이 읽는 보고서 대신 JSON 출력',
    '  --help                     도움말 출력'
  ].join('\n');
}

function buildRehearsalChecks(sourceSnapshot, exportedSnapshot, sourceSummary, exportedSummary) {
  const sourceStocks = sourceSnapshot.stocks.map((stock) => stock.symbol);
  const exportedStocks = exportedSnapshot.stocks.map((stock) => stock.symbol);
  const sourceAlertIds = sourceSnapshot.alerts.map((alert) => alert.id || '');
  const exportedAlertIds = exportedSnapshot.alerts.map((alert) => alert.id || '');

  return [
    createCheck('devices_count', '기기 수', sourceSummary.counts.devices, exportedSummary.counts.devices),
    createCheck('push_tokens_count', '푸시 토큰 수', sourceSummary.counts.pushTokens, exportedSummary.counts.pushTokens),
    createCheck('stocks_count', '종목 수', sourceSummary.counts.stocks, exportedSummary.counts.stocks),
    createCheck('active_stocks_count', '활성 종목 수', sourceSummary.counts.activeStocks, exportedSummary.counts.activeStocks),
    createCheck('alerts_count', '알림 기록 수', sourceSummary.counts.alerts, exportedSummary.counts.alerts),
    createCheck(
      'dividend_events_count',
      '배당 변경 이력 수',
      sourceSummary.counts.dividendEvents,
      exportedSummary.counts.dividendEvents
    ),
    createCheck('stock_symbols', '종목 코드 목록', sourceStocks, exportedStocks),
    createCheck('alert_ids', '알림 ID 목록', sourceAlertIds, exportedAlertIds)
  ];
}

function createCheck(name, label, expected, actual) {
  return {
    name,
    label,
    expected,
    actual,
    ok: JSON.stringify(expected) === JSON.stringify(actual)
  };
}

function formatCounts(counts) {
  return [
    `- devices: ${counts.devices}`,
    `- pushTokens: ${counts.pushTokens}`,
    `- stocks: ${counts.stocks}`,
    `- activeStocks: ${counts.activeStocks}`,
    `- alerts: ${counts.alerts}`,
    `- dividendEvents: ${counts.dividendEvents}`
  ].join('\n');
}

function formatValue(value) {
  return Array.isArray(value) ? `[${value.join(', ')}]` : value;
}

function normalizeGeneratedAt(value) {
  const date = value ? new Date(value) : new Date();

  return Number.isFinite(date.getTime()) ? date.toISOString() : new Date().toISOString();
}

function requireNextValue(args, index, option) {
  const value = args[index + 1];

  if (!value || value.startsWith('--')) {
    throw new Error(`${option} 옵션 값이 필요합니다.`);
  }

  return value;
}
