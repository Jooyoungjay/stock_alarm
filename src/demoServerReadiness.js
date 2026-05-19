const defaultEnv = process.env;
const allowedStorageEngines = new Set(['json', 'postgres']);

export function buildDemoServerReadiness(input = {}) {
  const env = input.env || defaultEnv;
  const now = normalizeGeneratedAt(input.now);
  const values = normalizeDemoServerValues(env);
  const checks = buildChecks(values);
  const summary = summarizeChecks(checks);

  return {
    ready: summary.error === 0,
    generatedAt: now,
    values: {
      demoBaseUrl: values.demoBaseUrl,
      privacyPolicyUrl: values.privacyPolicyUrl,
      supportUrl: values.supportUrl,
      reviewNotesUrl: values.reviewNotesUrl,
      host: values.host,
      storageEngine: values.storageEngine,
      dataDir: values.dataDir,
      mobilePushEnabled: values.mobilePushEnabled,
      hasAdminToken: Boolean(values.adminToken),
      hasTelegramBotToken: Boolean(values.telegramBotToken),
      hasTelegramChatId: Boolean(values.telegramChatId),
      hasDatabaseUrl: Boolean(values.databaseUrl)
    },
    summary,
    checks
  };
}

export function formatDemoServerReadinessReport(result) {
  const lines = [
    'HTTPS 데모 서버 준비 점검 결과',
    `생성 시각: ${result.generatedAt}`,
    `준비 상태: ${result.ready ? 'READY' : 'NOT READY'}`,
    '',
    '주요 값:',
    `- 데모 URL: ${result.values.demoBaseUrl || '(미설정)'}`,
    `- 개인정보 처리방침 URL: ${result.values.privacyPolicyUrl || '(미설정)'}`,
    `- 지원 URL: ${result.values.supportUrl || '(미설정)'}`,
    `- 리뷰 메모 URL: ${result.values.reviewNotesUrl || '(미설정)'}`,
    `- HOST: ${result.values.host || '(미설정)'}`,
    `- STORAGE_ENGINE: ${result.values.storageEngine}`,
    `- DATA_DIR: ${result.values.dataDir || '(미설정)'}`,
    `- ADMIN_TOKEN: ${result.values.hasAdminToken ? '설정됨' : '미설정'}`,
    '',
    '검증 결과:'
  ];

  for (const check of result.checks) {
    const status = check.ok ? 'OK' : check.level.toUpperCase();
    lines.push(`- [${status}] ${check.label}: ${check.message}`);
  }

  lines.push(
    '',
    `요약: error=${result.summary.error}, warn=${result.summary.warn}, ok=${result.summary.ok}`
  );

  return `${lines.join('\n')}\n`;
}

export function parseDemoServerReadinessArgs(args = [], options = {}) {
  const parsed = {
    env: options.env || process.env,
    json: false,
    help: false,
    failOnWarn: false
  };

  for (const arg of args) {
    if (arg === '--help' || arg === '-h') {
      parsed.help = true;
    } else if (arg === '--json') {
      parsed.json = true;
    } else if (arg === '--fail-on-warn') {
      parsed.failOnWarn = true;
    } else {
      throw new Error(`알 수 없는 옵션입니다: ${arg}`);
    }
  }

  return parsed;
}

export function getDemoServerReadinessHelp() {
  return [
    '사용법: npm run check:demo -- [옵션]',
    '',
    '옵션:',
    '  --json          사람이 읽는 보고서 대신 JSON 출력',
    '  --fail-on-warn  경고가 있어도 종료 코드 1로 처리',
    '  --help          도움말 출력',
    '',
    '주요 환경변수:',
    '  REVIEW_DEMO_URL       앱 리뷰어가 접속할 HTTPS 데모 서버 URL',
    '  PRIVACY_POLICY_URL    공개 HTTPS 개인정보 처리방침 URL',
    '  SUPPORT_URL           공개 HTTPS 지원/문의 URL',
    '  REVIEW_NOTES_URL      선택. 리뷰어 안내 문서 URL',
    '  ADMIN_TOKEN           관리자 화면과 운영 API 보호 토큰'
  ].join('\n');
}

function normalizeDemoServerValues(env) {
  return {
    demoBaseUrl: firstValue(env.REVIEW_DEMO_URL, env.DEMO_BASE_URL, env.PUBLIC_BASE_URL),
    privacyPolicyUrl: firstValue(env.PRIVACY_POLICY_URL),
    supportUrl: firstValue(env.SUPPORT_URL),
    reviewNotesUrl: firstValue(env.REVIEW_NOTES_URL),
    adminToken: firstValue(env.ADMIN_TOKEN),
    host: firstValue(env.HOST) || '127.0.0.1',
    dataDir: firstValue(env.DATA_DIR),
    storageEngine: (firstValue(env.STORAGE_ENGINE) || 'json').toLowerCase(),
    databaseUrl: firstValue(env.DATABASE_URL),
    telegramBotToken: firstValue(env.TELEGRAM_BOT_TOKEN),
    telegramChatId: firstValue(env.TELEGRAM_CHAT_ID),
    mobilePushEnabled: normalizeBoolean(firstValue(env.MOBILE_PUSH_ENABLED), true),
    expoPushEndpoint: firstValue(env.EXPO_PUSH_ENDPOINT) || 'https://exp.host/--/api/v2/push/send'
  };
}

function buildChecks(values) {
  return [
    createUrlCheck({
      name: 'demo_url_https',
      label: 'HTTPS 데모 서버 URL',
      value: values.demoBaseUrl,
      level: 'error',
      required: true,
      allowLocalhost: false
    }),
    createUrlCheck({
      name: 'privacy_policy_https',
      label: '개인정보 처리방침 URL',
      value: values.privacyPolicyUrl,
      level: 'error',
      required: true,
      allowLocalhost: false
    }),
    createUrlCheck({
      name: 'support_url_https',
      label: '지원 URL',
      value: values.supportUrl,
      level: 'error',
      required: true,
      allowLocalhost: false
    }),
    createUrlCheck({
      name: 'review_notes_url_https',
      label: '리뷰어 안내 URL',
      value: values.reviewNotesUrl,
      level: 'warn',
      required: false,
      allowLocalhost: false
    }),
    {
      name: 'admin_token_present',
      label: '관리자 보호 토큰',
      level: 'error',
      ok: Boolean(values.adminToken),
      message: values.adminToken
        ? 'ADMIN_TOKEN이 설정되어 있습니다.'
        : '데모 서버에서는 /admin과 운영 API 보호를 위해 ADMIN_TOKEN이 필요합니다.'
    },
    {
      name: 'admin_token_strength',
      label: '관리자 토큰 길이',
      level: 'warn',
      ok: !values.adminToken || values.adminToken.length >= 16,
      message:
        !values.adminToken || values.adminToken.length >= 16
          ? 'ADMIN_TOKEN 길이가 기본 기준을 만족합니다.'
          : 'ADMIN_TOKEN은 최소 16자 이상을 권장합니다.'
    },
    {
      name: 'host_public_bind',
      label: '외부 접속 바인딩',
      level: 'warn',
      ok: values.host === '0.0.0.0',
      message:
        values.host === '0.0.0.0'
          ? 'HOST가 외부 접속 가능한 0.0.0.0으로 설정되어 있습니다.'
          : `외부 데모 서버에서는 HOST=0.0.0.0을 권장합니다. 현재: ${values.host}`
    },
    {
      name: 'storage_engine_supported',
      label: '저장소 엔진',
      level: 'error',
      ok: allowedStorageEngines.has(values.storageEngine),
      message: allowedStorageEngines.has(values.storageEngine)
        ? `STORAGE_ENGINE=${values.storageEngine} 값을 사용할 수 있습니다.`
        : `STORAGE_ENGINE은 json 또는 postgres여야 합니다. 현재: ${values.storageEngine}`
    },
    {
      name: 'postgres_database_url',
      label: 'Postgres 연결 문자열',
      level: 'error',
      ok: values.storageEngine !== 'postgres' || Boolean(values.databaseUrl),
      message:
        values.storageEngine !== 'postgres' || values.databaseUrl
          ? 'Postgres 저장소 설정 기준을 만족합니다.'
          : 'STORAGE_ENGINE=postgres이면 DATABASE_URL이 필요합니다.'
    },
    {
      name: 'data_dir_configured',
      label: '데이터 저장 경로',
      level: 'warn',
      ok: Boolean(values.dataDir) || values.storageEngine === 'postgres',
      message:
        values.dataDir || values.storageEngine === 'postgres'
          ? 'DATA_DIR 또는 DB 저장소 설정이 준비되어 있습니다.'
          : 'JSON 저장소 데모 서버는 재시작 후 데이터 보존을 위해 DATA_DIR 설정을 권장합니다.'
    },
    {
      name: 'mobile_push_endpoint_https',
      label: '모바일 푸시 엔드포인트',
      level: values.mobilePushEnabled ? 'error' : 'warn',
      ok: !values.mobilePushEnabled || isHttpsUrl(values.expoPushEndpoint),
      message:
        !values.mobilePushEnabled || isHttpsUrl(values.expoPushEndpoint)
          ? '모바일 푸시 설정 기준을 만족합니다.'
          : 'MOBILE_PUSH_ENABLED=true이면 EXPO_PUSH_ENDPOINT는 HTTPS URL이어야 합니다.'
    },
    {
      name: 'telegram_alerts_configured',
      label: '텔레그램 알림 설정',
      level: 'warn',
      ok: Boolean(values.telegramBotToken && values.telegramChatId),
      message:
        values.telegramBotToken && values.telegramChatId
          ? '텔레그램 알림 설정이 준비되어 있습니다.'
          : '텔레그램 알림까지 시연하려면 TELEGRAM_BOT_TOKEN과 TELEGRAM_CHAT_ID가 필요합니다.'
    }
  ];
}

function createUrlCheck(options) {
  const parsed = parseUrl(options.value);
  const missingOk = !options.required && !options.value;

  if (missingOk) {
    return {
      name: options.name,
      label: options.label,
      level: options.level,
      ok: true,
      message: '선택 항목입니다.'
    };
  }

  const ok =
    Boolean(parsed) &&
    parsed.protocol === 'https:' &&
    (options.allowLocalhost || !isLocalHostName(parsed.hostname));

  return {
    name: options.name,
    label: options.label,
    level: options.level,
    ok,
    message: ok
      ? `${options.label}이 공개 HTTPS URL입니다.`
      : `${options.label}은 localhost가 아닌 공개 HTTPS URL이어야 합니다.`
  };
}

function summarizeChecks(checks) {
  return checks.reduce(
    (summary, check) => {
      if (check.ok) {
        summary.ok += 1;
      } else {
        summary[check.level] += 1;
      }

      return summary;
    },
    {
      ok: 0,
      warn: 0,
      error: 0
    }
  );
}

function firstValue(...values) {
  for (const value of values) {
    const text = String(value || '').trim();

    if (text) {
      return text;
    }
  }

  return '';
}

function parseUrl(value) {
  try {
    return new URL(String(value || '').trim());
  } catch {
    return null;
  }
}

function isHttpsUrl(value) {
  const parsed = parseUrl(value);
  return parsed?.protocol === 'https:';
}

function isLocalHostName(value) {
  const host = String(value || '').trim().toLowerCase();
  return ['localhost', '127.0.0.1', '0.0.0.0', '::1'].includes(host);
}

function normalizeBoolean(value, fallback) {
  const text = String(value ?? '').trim().toLowerCase();

  if (!text) {
    return fallback;
  }

  if (['1', 'true', 'yes', 'y', 'on'].includes(text)) {
    return true;
  }

  if (['0', 'false', 'no', 'n', 'off'].includes(text)) {
    return false;
  }

  return fallback;
}

function normalizeGeneratedAt(value) {
  const date = value ? new Date(value) : new Date();

  return Number.isFinite(date.getTime()) ? date.toISOString() : new Date().toISOString();
}
