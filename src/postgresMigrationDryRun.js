import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

import { buildStoreSummary, normalizeStoreEnvelope } from './dataModel.js';
import { JsonStore } from './storage.js';

export const POSTGRES_DRY_RUN_TABLES = Object.freeze([
  'devices',
  'push_tokens',
  'stocks',
  'dividend_events',
  'alerts',
  'quote_provider_stats',
  'quote_provider_attempts',
  'job_runs',
  'settings'
]);

const RESERVED_META_KEYS = new Set(['schemaVersion', 'createdAt', 'updatedAt', 'quoteProviderStats']);
const JOB_RUN_META_KEYS = new Set([
  'lastDividendRefresh',
  'lastDividendEventAlert',
  'lastDailyBriefingDate'
]);

export async function runPostgresMigrationDryRun(options = {}) {
  const source = await loadJsonStoreSnapshot(options);

  return buildPostgresMigrationDryRun(source.snapshot, {
    ...options,
    source: source.source
  });
}

export async function loadJsonStoreSnapshot(options = {}) {
  if (options.storePath) {
    const storePath = path.resolve(options.cwd || process.cwd(), options.storePath);
    const raw = await fs.readFile(storePath, 'utf8');

    return {
      snapshot: JSON.parse(stripBom(raw)),
      source: {
        type: 'file',
        storePath
      }
    };
  }

  const dataDir = path.resolve(options.cwd || process.cwd(), options.dataDir || 'data');
  const store = new JsonStore(dataDir, {
    defaultAlertCooldownMinutes: options.defaultAlertCooldownMinutes || 30,
    backups: {
      enabled: false
    }
  });

  return {
    snapshot: await store.exportBackupSnapshot(),
    source: {
      type: 'dataDir',
      dataDir,
      storePath: path.join(dataDir, 'store.json')
    }
  };
}

export function buildPostgresMigrationDryRun(input = {}, options = {}) {
  const generatedAt = normalizeGeneratedAt(options.now);
  const sampleLimit = normalizeSampleLimit(options.sampleLimit);
  const data = normalizeStoreEnvelope(input, { now: generatedAt });
  const rows = buildPostgresMigrationRows(data);
  const counts = buildTableCounts(rows);
  const summary = buildStoreSummary(data);
  const checks = buildMigrationChecks(summary.counts, counts, rows);
  const warnings = buildMigrationWarnings(data, rows);

  return {
    dryRun: true,
    target: 'postgres',
    generatedAt,
    source: options.source || null,
    schemaVersion: data.meta.schemaVersion,
    summary,
    counts,
    tables: Object.fromEntries(
      POSTGRES_DRY_RUN_TABLES.map((table) => [
        table,
        {
          count: rows[table].length,
          sampleRows: rows[table].slice(0, sampleLimit)
        }
      ])
    ),
    checks,
    warnings,
    readyForMigration: checks.every((check) => check.ok) && warnings.length === 0
  };
}

export function buildPostgresMigrationRows(input = {}) {
  const data = normalizeStoreEnvelope(input);
  const devices = data.devices;
  const stocks = data.stocks;
  const alerts = data.alerts;
  const quoteProviderStats = normalizeQuoteProviderStats(data.meta.quoteProviderStats);

  return {
    devices: devices.map(mapDeviceRow),
    push_tokens: devices.flatMap(mapPushTokenRows),
    stocks: stocks.map(mapStockRow),
    dividend_events: stocks.flatMap(mapDividendEventRows),
    alerts: alerts.map(mapAlertRow),
    quote_provider_stats: Object.values(quoteProviderStats.providers).map(mapQuoteProviderStatRow),
    quote_provider_attempts: quoteProviderStats.recentAttempts.map(mapQuoteProviderAttemptRow),
    job_runs: mapJobRunRows(data.meta),
    settings: mapSettingRows(data.meta)
  };
}

export function formatPostgresMigrationDryRunReport(result) {
  const lines = [
    'JSON -> Postgres dry-run 결과',
    `대상: ${result.target}`,
    `스키마 버전: ${result.schemaVersion}`,
    `생성 시각: ${result.generatedAt}`
  ];

  if (result.source?.storePath) {
    lines.push(`원본 파일: ${result.source.storePath}`);
  } else if (result.source?.dataDir) {
    lines.push(`원본 데이터 폴더: ${result.source.dataDir}`);
  }

  lines.push('', '테이블별 예상 행 수:');

  for (const table of POSTGRES_DRY_RUN_TABLES) {
    lines.push(`- ${table}: ${result.counts[table]}행`);
  }

  lines.push('', '검증 결과:');

  for (const check of result.checks) {
    const status = check.ok ? 'OK' : 'FAIL';
    lines.push(`- [${status}] ${check.label}: expected=${check.expected}, actual=${check.actual}`);
  }

  if (result.warnings.length > 0) {
    lines.push('', '주의 사항:');

    for (const warning of result.warnings) {
      lines.push(`- ${warning}`);
    }
  } else {
    lines.push('', '주의 사항: 없음');
  }

  lines.push('', '실제 Postgres 연결 또는 DB 쓰기는 수행하지 않았습니다.');

  return `${lines.join('\n')}\n`;
}

export function parsePostgresMigrationDryRunArgs(args = [], options = {}) {
  const parsed = {
    cwd: options.cwd || process.cwd(),
    dataDir: 'data',
    storePath: '',
    sampleLimit: 2,
    json: false,
    failOnWarning: false,
    help: false
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === '--help' || arg === '-h') {
      parsed.help = true;
    } else if (arg === '--json') {
      parsed.json = true;
    } else if (arg === '--fail-on-warning') {
      parsed.failOnWarning = true;
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
    } else if (arg === '--samples' || arg === '--sample-limit') {
      parsed.sampleLimit = Number(requireNextValue(args, index, arg));
      index += 1;
    } else if (arg.startsWith('--samples=')) {
      parsed.sampleLimit = Number(arg.slice('--samples='.length));
    } else if (arg.startsWith('--sample-limit=')) {
      parsed.sampleLimit = Number(arg.slice('--sample-limit='.length));
    } else {
      throw new Error(`알 수 없는 옵션입니다: ${arg}`);
    }
  }

  parsed.sampleLimit = normalizeSampleLimit(parsed.sampleLimit);
  parsed.dataDir = parsed.dataDir ? path.resolve(parsed.cwd, parsed.dataDir) : '';
  parsed.storePath = parsed.storePath ? path.resolve(parsed.cwd, parsed.storePath) : '';

  return parsed;
}

export function getPostgresMigrationDryRunHelp() {
  return [
    '사용법: npm run migrate:postgres:dry-run -- [옵션]',
    '',
    '옵션:',
    '  --data-dir <path>       data 폴더 경로. 기본값: data',
    '  --store <path>          data/store.json 또는 백업 JSON 파일을 직접 지정',
    '  --samples <number>      테이블별 샘플 행 수. 기본값: 2',
    '  --json                  사람이 읽는 보고서 대신 JSON 출력',
    '  --fail-on-warning       주의 사항이 있으면 종료 코드 1',
    '  --help                  도움말 출력'
  ].join('\n');
}

function mapDeviceRow(device) {
  return {
    id: stringify(device.id),
    label: stringify(device.label),
    platform: stringify(device.platform || 'unknown'),
    secret_hash: stringify(device.secretHash),
    created_at: nullableString(device.createdAt),
    updated_at: nullableString(device.updatedAt),
    last_seen_at: nullableString(device.lastSeenAt)
  };
}

function mapPushTokenRows(device) {
  const deviceId = stringify(device.id);
  const tokens = Array.isArray(device.pushTokens) ? device.pushTokens : [];

  return tokens.map((token, index) => {
    const tokenHash = hashSensitiveValue(token.token);

    return {
      id: stableId('push_token', [deviceId, token.provider, tokenHash, index]),
      device_id: deviceId,
      provider: stringify(token.provider || 'expo'),
      platform: stringify(token.platform || device.platform || 'unknown'),
      token_hash: tokenHash,
      enabled: token.enabled === undefined ? true : Boolean(token.enabled),
      updated_at: nullableString(token.updatedAt || device.updatedAt)
    };
  });
}

function mapStockRow(stock, index) {
  return {
    id: stringify(stock.id || stableId('stock', [stock.symbol, stock.deviceId, index])),
    device_id: nullableString(stock.deviceId),
    symbol: stringify(stock.symbol),
    display_name: stringify(stock.displayName),
    purchase_price: nullableNumber(stock.purchasePrice),
    quantity: nullableNumber(stock.quantity),
    purchase_date: nullableString(stock.purchaseDate),
    alert_type: stringify(stock.alertType),
    threshold_percent: nullableNumber(stock.thresholdPercent),
    target_price: nullableNumber(stock.targetPrice),
    alert_cooldown_minutes: nullableNumber(stock.alertCooldownMinutes),
    active: stock.active !== false,
    high_price: nullableNumber(stock.highPrice),
    high_price_at: nullableString(stock.highPriceAt),
    last_price: nullableNumber(stock.lastPrice),
    last_checked_at: nullableString(stock.lastCheckedAt),
    alert_state: stringify(stock.alertState || 'clear'),
    currency: stringify(stock.currency),
    exchange: stringify(stock.exchange),
    quote_provider: stringify(stock.quoteProvider),
    quote_metadata: {
      marketState: stringify(stock.marketState),
      providerLabel: stringify(stock.quoteProviderLabel),
      dataDelay: stringify(stock.quoteDataDelay),
      venue: stringify(stock.quoteVenue),
      licenseType: stringify(stock.quoteLicenseType),
      sourceNote: stringify(stock.quoteSourceNote),
      regularMarketTime: nullableString(stock.quoteRegularMarketTime)
    },
    dividend_snapshot: {
      annualDividendPerShare: nullableNumber(stock.annualDividendPerShare),
      dividendFrequency: stringify(stock.dividendFrequency),
      dividendMonths: Array.isArray(stock.dividendMonths) ? stock.dividendMonths : [],
      dividendProvider: stringify(stock.dividendProvider),
      dividendDataSource: stringify(stock.dividendDataSource),
      dividendSourceSymbol: stringify(stock.dividendSourceSymbol),
      dividendCurrency: stringify(stock.dividendCurrency),
      dividendYieldPercent: nullableNumber(stock.dividendYieldPercent),
      lastDividendValue: nullableNumber(stock.lastDividendValue),
      exDividendDate: stringify(stock.exDividendDate),
      dividendDate: stringify(stock.dividendDate),
      updatedAt: nullableString(stock.dividendUpdatedAt),
      lastCheckedAt: nullableString(stock.dividendLastCheckedAt),
      lastError: stringify(stock.dividendLastError)
    },
    investment_reason: stringify(stock.investmentReason),
    investment_target_price: nullableNumber(stock.investmentTargetPrice),
    sell_condition: stringify(stock.sellCondition),
    review_date: nullableString(stock.reviewDate),
    notes: stringify(stock.notes),
    created_at: nullableString(stock.createdAt),
    updated_at: nullableString(stock.updatedAt)
  };
}

function mapDividendEventRows(stock) {
  const history = Array.isArray(stock.dividendHistory) ? stock.dividendHistory : [];

  return history.map((event, index) => ({
    id: stableId('dividend_event', [stock.id, stock.symbol, event.checkedAt, event.provider, index]),
    stock_id: stringify(stock.id),
    symbol: stringify(stock.symbol),
    checked_at: nullableString(event.checkedAt),
    reason: stringify(event.reason),
    provider: stringify(event.provider),
    source_symbol: stringify(event.sourceSymbol),
    currency: stringify(event.currency),
    previous_annual_dividend_per_share: nullableNumber(event.previousAnnualDividendPerShare),
    annual_dividend_per_share: nullableNumber(event.annualDividendPerShare),
    previous_last_dividend_value: nullableNumber(event.previousLastDividendValue),
    last_dividend_value: nullableNumber(event.lastDividendValue),
    previous_ex_dividend_date: nullableString(event.previousExDividendDate),
    ex_dividend_date: nullableString(event.exDividendDate),
    previous_dividend_date: nullableString(event.previousDividendDate),
    dividend_date: nullableString(event.dividendDate)
  }));
}

function mapAlertRow(alert, index) {
  return {
    id: stringify(alert.id || stableId('alert', [alert.stockId, alert.symbol, alert.createdAt, index])),
    device_id: nullableString(alert.deviceId),
    stock_id: nullableString(alert.stockId),
    symbol: stringify(alert.symbol),
    display_name: stringify(alert.displayName),
    alert_type: stringify(alert.alertType),
    price: nullableNumber(alert.price),
    threshold_price: nullableNumber(alert.thresholdPrice),
    metric_percent: nullableNumber(alert.drawdownPercent ?? alert.metricPercent),
    maximum_profit_amount: nullableNumber(alert.maximumProfitAmount),
    current_profit_amount: nullableNumber(alert.currentProfitAmount),
    retraced_profit_amount: nullableNumber(alert.retracedProfitAmount),
    retraced_profit_percent: nullableNumber(alert.retracedProfitPercent),
    dividend_event_type: nullableString(alert.dividendEventType),
    dividend_event_date: nullableString(alert.dividendEventDate),
    dividend_event_offset_days: nullableNumber(alert.dividendEventOffsetDays),
    expected_dividend_amount: nullableNumber(alert.expectedDividendAmount),
    delivery_status: stringify(alert.deliveryStatus),
    delivery_error: stringify(alert.deliveryError),
    telegram_delivery_status: stringify(alert.telegramDeliveryStatus),
    push_delivery_status: stringify(alert.pushDeliveryStatus),
    push_delivery_sent: nullableNumber(alert.pushDeliverySent),
    push_delivery_failed: nullableNumber(alert.pushDeliveryFailed),
    sent: alert.sent === undefined ? isAlertDelivered(alert) : Boolean(alert.sent),
    message: stringify(alert.message),
    created_at: nullableString(alert.createdAt)
  };
}

function mapQuoteProviderStatRow(stat) {
  return {
    provider: stringify(stat.provider),
    attempts: numberOrZero(stat.attempts),
    success: numberOrZero(stat.success),
    error: numberOrZero(stat.error),
    skipped: numberOrZero(stat.skipped),
    total_duration_ms: numberOrZero(stat.totalDurationMs),
    average_duration_ms: numberOrZero(stat.averageDurationMs),
    failure_rate_percent: numberOrZero(stat.failureRatePercent),
    last_status: stringify(stat.lastStatus),
    last_type: stringify(stat.lastType),
    last_symbol: stringify(stat.lastSymbol),
    last_reason: stringify(stat.lastReason),
    last_error: stringify(stat.lastError),
    last_checked_at: nullableString(stat.lastCheckedAt),
    last_success_at: nullableString(stat.lastSuccessAt),
    last_error_at: nullableString(stat.lastErrorAt)
  };
}

function mapQuoteProviderAttemptRow(attempt, index) {
  return {
    id: stableId('quote_provider_attempt', [
      attempt.provider,
      attempt.type,
      attempt.symbol,
      attempt.startedAt,
      attempt.finishedAt,
      index
    ]),
    provider: stringify(attempt.provider),
    type: stringify(attempt.type),
    symbol: stringify(attempt.symbol),
    status: stringify(attempt.status),
    reason: stringify(attempt.reason),
    error: stringify(attempt.error),
    started_at: nullableString(attempt.startedAt),
    finished_at: nullableString(attempt.finishedAt),
    duration_ms: numberOrZero(attempt.durationMs),
    source: stringify(attempt.source),
    stock_id: nullableString(attempt.stockId)
  };
}

function mapJobRunRows(meta) {
  return Object.entries(meta)
    .filter(([key]) => JOB_RUN_META_KEYS.has(key))
    .map(([key, value]) => ({
      id: stableId('job_run', [key, JSON.stringify(value)]),
      key,
      status: extractJobStatus(value),
      value_json: cloneJson(value),
      observed_at: extractObservedAt(value)
    }));
}

function mapSettingRows(meta) {
  return Object.entries(meta)
    .filter(([key]) => !RESERVED_META_KEYS.has(key) && !JOB_RUN_META_KEYS.has(key))
    .map(([key, value]) => ({
      key,
      value_json: cloneJson(value),
      updated_at: nullableString(meta.updatedAt)
    }));
}

function buildTableCounts(rows) {
  return Object.fromEntries(POSTGRES_DRY_RUN_TABLES.map((table) => [table, rows[table].length]));
}

function buildMigrationChecks(expected, counts, rows) {
  return [
    createCountCheck('devices_count', '기기 수', expected.devices, counts.devices),
    createCountCheck('push_tokens_count', '푸시 토큰 수', expected.pushTokens, counts.push_tokens),
    createCountCheck('stocks_count', '종목 수', expected.stocks, counts.stocks),
    createCountCheck('alerts_count', '알림 기록 수', expected.alerts, counts.alerts),
    createCountCheck(
      'dividend_events_count',
      '배당 변경 이력 수',
      expected.dividendEvents,
      counts.dividend_events
    ),
    {
      name: 'push_tokens_are_hashed',
      label: '푸시 토큰 원문 비저장',
      expected: rows.push_tokens.length,
      actual: rows.push_tokens.filter((row) => row.token_hash && row.token === undefined).length,
      ok: rows.push_tokens.every((row) => row.token_hash && row.token === undefined)
    },
    {
      name: 'dry_run_only',
      label: 'DB 쓰기 미수행',
      expected: true,
      actual: true,
      ok: true
    }
  ];
}

function buildMigrationWarnings(data, rows) {
  const warnings = [];
  const deviceIds = new Set(rows.devices.map((row) => row.id).filter(Boolean));
  const stockIds = new Set(rows.stocks.map((row) => row.id).filter(Boolean));
  const duplicateStockIds = findDuplicates(rows.stocks.map((row) => row.id).filter(Boolean));
  const duplicateDeviceIds = findDuplicates(rows.devices.map((row) => row.id).filter(Boolean));

  if (duplicateDeviceIds.length > 0) {
    warnings.push(`중복 기기 ID가 있습니다: ${duplicateDeviceIds.join(', ')}`);
  }

  if (duplicateStockIds.length > 0) {
    warnings.push(`중복 종목 ID가 있습니다: ${duplicateStockIds.join(', ')}`);
  }

  for (const stock of rows.stocks) {
    if (!stock.symbol) {
      warnings.push(`symbol이 비어 있는 종목이 있습니다: ${stock.id}`);
    }

    if (stock.device_id && !deviceIds.has(stock.device_id)) {
      warnings.push(`종목 ${stock.symbol || stock.id}의 device_id가 devices에 없습니다: ${stock.device_id}`);
    }
  }

  for (const alert of rows.alerts) {
    if (!alert.symbol) {
      warnings.push(`symbol이 비어 있는 알림 기록이 있습니다: ${alert.id}`);
    }

    if (alert.stock_id && !stockIds.has(alert.stock_id)) {
      warnings.push(`알림 ${alert.id}의 stock_id가 stocks에 없습니다: ${alert.stock_id}`);
    }
  }

  if (data.meta.schemaVersion !== 1) {
    warnings.push(`확인되지 않은 스키마 버전입니다: ${data.meta.schemaVersion}`);
  }

  return [...new Set(warnings)];
}

function normalizeQuoteProviderStats(value) {
  const providers =
    value && typeof value === 'object' && value.providers && typeof value.providers === 'object'
      ? Object.fromEntries(
          Object.entries(value.providers)
            .map(([provider, stat]) => [provider, normalizeQuoteProviderStat(provider, stat)])
            .filter(([, stat]) => stat.provider)
        )
      : {};
  const recentAttempts = Array.isArray(value?.recentAttempts)
    ? value.recentAttempts.map(normalizeQuoteProviderAttempt).filter(Boolean)
    : [];

  return {
    providers,
    recentAttempts
  };
}

function normalizeQuoteProviderStat(provider, value = {}) {
  const name = stringify(value.provider || provider).toLowerCase();

  if (!name) {
    return { provider: '' };
  }

  return {
    provider: name,
    attempts: numberOrZero(value.attempts),
    success: numberOrZero(value.success),
    error: numberOrZero(value.error),
    skipped: numberOrZero(value.skipped),
    totalDurationMs: numberOrZero(value.totalDurationMs),
    averageDurationMs: numberOrZero(value.averageDurationMs),
    failureRatePercent: numberOrZero(value.failureRatePercent),
    lastStatus: stringify(value.lastStatus),
    lastType: stringify(value.lastType),
    lastSymbol: stringify(value.lastSymbol),
    lastReason: stringify(value.lastReason),
    lastError: stringify(value.lastError),
    lastCheckedAt: nullableString(value.lastCheckedAt),
    lastSuccessAt: nullableString(value.lastSuccessAt),
    lastErrorAt: nullableString(value.lastErrorAt)
  };
}

function normalizeQuoteProviderAttempt(value = {}) {
  const provider = stringify(value.provider).toLowerCase();

  if (!provider) {
    return null;
  }

  return {
    provider,
    type: stringify(value.type || 'quote'),
    symbol: stringify(value.symbol).toUpperCase(),
    status: stringify(value.status || 'error'),
    reason: stringify(value.reason),
    error: stringify(value.error),
    startedAt: nullableString(value.startedAt || value.finishedAt),
    finishedAt: nullableString(value.finishedAt || value.startedAt),
    durationMs: numberOrZero(value.durationMs),
    source: stringify(value.source),
    stockId: stringify(value.stockId)
  };
}

function createCountCheck(name, label, expected, actual) {
  return {
    name,
    label,
    expected,
    actual,
    ok: expected === actual
  };
}

function hashSensitiveValue(value) {
  return createHash('sha256').update(String(value || '')).digest('hex');
}

function stableId(prefix, parts) {
  return `${prefix}_${createHash('sha256').update(parts.map((part) => stringify(part)).join('|')).digest('hex').slice(0, 24)}`;
}

function stringify(value) {
  return value === undefined || value === null ? '' : String(value).trim();
}

function nullableString(value) {
  const text = stringify(value);

  return text || null;
}

function nullableNumber(value) {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  const number = Number(value);

  return Number.isFinite(number) ? number : null;
}

function numberOrZero(value) {
  const number = nullableNumber(value);

  return number === null ? 0 : number;
}

function normalizeGeneratedAt(value) {
  const date = value ? new Date(value) : new Date();

  return Number.isFinite(date.getTime()) ? date.toISOString() : new Date().toISOString();
}

function normalizeSampleLimit(value) {
  const number = Number(value);

  return Number.isInteger(number) && number >= 0 ? Math.min(number, 20) : 2;
}

function extractJobStatus(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return stringify(value.status || value.deliveryStatus || value.result || 'recorded');
  }

  return 'recorded';
}

function extractObservedAt(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return (
      nullableString(value.checkedAt) ||
      nullableString(value.finishedAt) ||
      nullableString(value.sentAt) ||
      nullableString(value.createdAt)
    );
  }

  return null;
}

function isAlertDelivered(alert) {
  return [alert.deliveryStatus, alert.telegramDeliveryStatus, alert.pushDeliveryStatus].some(
    (status) => stringify(status) === 'sent'
  );
}

function cloneJson(value) {
  return value === undefined ? null : JSON.parse(JSON.stringify(value));
}

function findDuplicates(values) {
  const seen = new Set();
  const duplicates = new Set();

  for (const value of values) {
    if (seen.has(value)) {
      duplicates.add(value);
    }

    seen.add(value);
  }

  return [...duplicates];
}

function stripBom(value) {
  return value.charCodeAt(0) === 0xfeff ? value.slice(1) : value;
}

function requireNextValue(args, index, option) {
  const value = args[index + 1];

  if (!value || value.startsWith('--')) {
    throw new Error(`${option} 옵션 값이 필요합니다.`);
  }

  return value;
}
