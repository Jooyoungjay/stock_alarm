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
  host: process.env.HOST || defaultHost,
  port: toNumber(process.env.PORT, 3000, { min: 1, max: 65535 }),
  isRailwayRuntime,
  pollIntervalSeconds: toNumber(process.env.POLL_INTERVAL_SECONDS, 60, { min: 10 }),
  telegramCommandPollSeconds: toNumber(process.env.TELEGRAM_COMMAND_POLL_SECONDS, 5, { min: 2 }),
  backupRetention: toNumber(process.env.BACKUP_RETENTION, 30, { min: 1 }),
  defaultAlertCooldownMinutes: toNumber(process.env.DEFAULT_ALERT_COOLDOWN_MINUTES, 30, {
    min: 1
  }),
  quoteTimeoutMs: toNumber(process.env.QUOTE_TIMEOUT_MS, 10000, { min: 1000 }),
  quoteProviders: process.env.QUOTE_PROVIDERS || 'naver,stooq,alphavantage,yahoo',
  alphaVantageApiKey: process.env.ALPHA_VANTAGE_API_KEY || '',
  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN || '',
  telegramChatId: process.env.TELEGRAM_CHAT_ID || ''
};
