import { config } from '../src/config.js';

const checks = [
  {
    ok: config.host === '0.0.0.0',
    level: 'error',
    message: `HOST must be 0.0.0.0 on Railway. Current: ${config.host}`
  },
  {
    ok: Boolean(process.env.PORT),
    level: 'warn',
    message: 'PORT is not set. Railway injects PORT at runtime, so this is expected locally.'
  },
  {
    ok: config.dataDir === '/app/data' || Boolean(process.env.RAILWAY_VOLUME_MOUNT_PATH),
    level: 'warn',
    message: `DATA_DIR should point to the Railway Volume mount path, recommended /app/data. Current: ${config.dataDir}`
  },
  {
    ok: Boolean(config.telegramBotToken),
    level: 'warn',
    message: 'TELEGRAM_BOT_TOKEN is empty. Telegram alerts and commands will not work.'
  },
  {
    ok: Boolean(config.telegramChatId),
    level: 'warn',
    message: 'TELEGRAM_CHAT_ID is empty. Telegram alerts and commands will not work.'
  }
];

let hasError = false;

console.log('[Stock Alarm] Railway configuration check');
console.log(`host=${config.host}`);
console.log(`port=${config.port}`);
console.log(`dataDir=${config.dataDir}`);
console.log(`railwayRuntime=${config.isRailwayRuntime}`);

for (const check of checks) {
  if (check.ok) {
    continue;
  }

  console.log(`${check.level.toUpperCase()}: ${check.message}`);
  hasError ||= check.level === 'error';
}

if (hasError) {
  process.exit(1);
}

console.log('Configuration check completed.');
