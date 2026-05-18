import fs from 'node:fs';
import path from 'node:path';

const rootDir = process.cwd();

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return {};
  }

  const content = fs.readFileSync(filePath, 'utf8');
  const values = {};

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();

    if (!line || line.startsWith('#')) {
      continue;
    }

    const separatorIndex = line.indexOf('=');

    if (separatorIndex === -1) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    let value = line.slice(separatorIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (key) {
      values[key] = value;
    }
  }

  return values;
}

function loadEnvironment() {
  const fileValues = {
    ...parseEnvFile(path.join(rootDir, '.env')),
    ...parseEnvFile(path.join(rootDir, '.env.local'))
  };

  for (const [key, value] of Object.entries(fileValues)) {
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

function toNumber(value, fallback, options = {}) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  if (options.min !== undefined && parsed < options.min) {
    return options.min;
  }

  if (options.max !== undefined && parsed > options.max) {
    return options.max;
  }

  return parsed;
}

function toBoolean(value, fallback) {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }

  const normalized = String(value).trim().toLowerCase();

  if (['1', 'true', 'yes', 'y', 'on'].includes(normalized)) {
    return true;
  }

  if (['0', 'false', 'no', 'n', 'off'].includes(normalized)) {
    return false;
  }

  return fallback;
}

function toIntegerList(value, fallback, options = {}) {
  const rawItems = Array.isArray(value)
    ? value
    : String(value ?? '')
        .split(/[\s,]+/)
        .map((item) => item.trim())
        .filter(Boolean);
  const min = options.min ?? Number.NEGATIVE_INFINITY;
  const max = options.max ?? Number.POSITIVE_INFINITY;
  const values = rawItems
    .map((item) => Number(item))
    .filter((item) => Number.isInteger(item) && item >= min && item <= max);
  const unique = [...new Set(values)];

  return unique.length ? unique : fallback;
}

loadEnvironment();

const isRailwayRuntime = Boolean(
  process.env.RAILWAY_ENVIRONMENT ||
    process.env.RAILWAY_PROJECT_ID ||
    process.env.RAILWAY_SERVICE_ID
);

const defaultHost = isRailwayRuntime ? '0.0.0.0' : '127.0.0.1';
const defaultDataDir = process.env.RAILWAY_VOLUME_MOUNT_PATH || path.join(rootDir, 'data');

export const config = {
  rootDir,
  publicDir: path.join(rootDir, 'public'),
  dataDir: process.env.DATA_DIR || defaultDataDir,
  storageEngine: process.env.STORAGE_ENGINE || 'json',
  databaseUrl: process.env.DATABASE_URL || '',
  adminToken: process.env.ADMIN_TOKEN || '',
  host: process.env.HOST || defaultHost,
  port: toNumber(process.env.PORT, 3000, { min: 1, max: 65535 }),
  isRailwayRuntime,
  pollIntervalSeconds: toNumber(process.env.POLL_INTERVAL_SECONDS, 60, { min: 10 }),
  telegramCommandPollSeconds: toNumber(process.env.TELEGRAM_COMMAND_POLL_SECONDS, 5, { min: 2 }),
  dividendRefreshIntervalSeconds: toNumber(process.env.DIVIDEND_REFRESH_INTERVAL_SECONDS, 86400, {
    min: 60
  }),
  dailyBriefingEnabled: toBoolean(process.env.DAILY_BRIEFING_ENABLED, true),
  dailyBriefingTime: process.env.DAILY_BRIEFING_TIME || '16:10',
  dailyBriefingCheckIntervalSeconds: toNumber(
    process.env.DAILY_BRIEFING_CHECK_INTERVAL_SECONDS,
    60,
    { min: 30 }
  ),
  dailyBriefingWarningDistancePercent: toNumber(
    process.env.DAILY_BRIEFING_WARNING_DISTANCE_PERCENT,
    5,
    { min: 0.1, max: 100 }
  ),
  dailyBriefingTopLimit: toNumber(process.env.DAILY_BRIEFING_TOP_LIMIT, 5, { min: 1, max: 20 }),
  dividendEventAlertEnabled: toBoolean(process.env.DIVIDEND_EVENT_ALERT_ENABLED, true),
  dividendEventAlertCheckIntervalSeconds: toNumber(
    process.env.DIVIDEND_EVENT_ALERT_CHECK_INTERVAL_SECONDS,
    3600,
    { min: 60 }
  ),
  dividendEventAlertExDateOffsets: toIntegerList(
    process.env.DIVIDEND_EVENT_ALERT_EX_DATE_OFFSETS,
    [3, 1, 0, -1],
    { min: -30, max: 365 }
  ),
  dividendEventAlertPaymentDateOffsets: toIntegerList(
    process.env.DIVIDEND_EVENT_ALERT_PAYMENT_DATE_OFFSETS,
    [1, 0],
    { min: -30, max: 365 }
  ),
  backupRetention: toNumber(process.env.BACKUP_RETENTION, 30, { min: 1 }),
  defaultAlertCooldownMinutes: toNumber(process.env.DEFAULT_ALERT_COOLDOWN_MINUTES, 30, {
    min: 1
  }),
  quoteTimeoutMs: toNumber(process.env.QUOTE_TIMEOUT_MS, 10000, { min: 1000 }),
  quoteProviders: process.env.QUOTE_PROVIDERS || 'naver,stooq,alphavantage,yahoo',
  historicalQuoteProviders:
    process.env.HISTORICAL_QUOTE_PROVIDERS ||
    process.env.QUOTE_PROVIDERS ||
    'naver,stooq,alphavantage,yahoo',
  dividendProviders:
    process.env.DIVIDEND_PROVIDERS || 'publicdata,opendart,alphavantage,yahoo',
  dataGoKrServiceKey: process.env.DATA_GO_KR_SERVICE_KEY || '',
  openDartApiKey: process.env.OPENDART_API_KEY || '',
  alphaVantageApiKey: process.env.ALPHA_VANTAGE_API_KEY || '',
  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN || '',
  telegramChatId: process.env.TELEGRAM_CHAT_ID || '',
  mobilePushEnabled: toBoolean(process.env.MOBILE_PUSH_ENABLED, true),
  expoPushEndpoint: process.env.EXPO_PUSH_ENDPOINT || 'https://exp.host/--/api/v2/push/send'
};
