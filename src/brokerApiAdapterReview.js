const defaultEnv = process.env;
const supportedProviders = new Set(['none', 'kis', 'kiwoom']);
const providerLabels = {
  none: '미사용',
  kis: '한국투자증권 Open API',
  kiwoom: '키움 REST API'
};
const supportedKisMarketDivCodes = new Set(['J', 'NX', 'UN']);

export function buildBrokerApiAdapterReview(input = {}) {
  const env = input.env || defaultEnv;
  const now = normalizeGeneratedAt(input.now);
  const values = normalizeBrokerApiValues(env);
  const checks = buildChecks(values);
  const summary = summarizeChecks(checks);

  return {
    ready: summary.error === 0,
    generatedAt: now,
    values: {
      provider: values.provider,
      providerLabel: providerLabels[values.provider] || values.provider,
      tradingEnabled: values.tradingEnabled,
      kisBaseUrl: values.kisBaseUrl,
      hasKisAppKey: Boolean(values.kisAppKey),
      hasKisAppSecret: Boolean(values.kisAppSecret),
      hasKisAccessToken: Boolean(values.kisAccessToken),
      hasKisAccountNumber: Boolean(values.kisAccountNumber),
      kisMarketDivCode: values.kisMarketDivCode,
      kiwoomBaseUrl: values.kiwoomBaseUrl,
      hasKiwoomAppKey: Boolean(values.kiwoomAppKey),
      hasKiwoomSecretKey: Boolean(values.kiwoomSecretKey),
      hasKiwoomAccessToken: Boolean(values.kiwoomAccessToken),
      hasKiwoomAccountNumber: Boolean(values.kiwoomAccountNumber),
      recommendedOrder: [
        '한국투자증권 Open API: REST/WebSocket 문서와 공식 샘플 저장소가 있어 1순위',
        '키움 REST API: REST/OAuth와 시세/실시간시세 문서가 있어 2순위'
      ]
    },
    summary,
    checks
  };
}

export function formatBrokerApiAdapterReviewReport(result) {
  const lines = [
    '증권사 API adapter 점검 결과',
    `생성 시각: ${result.generatedAt}`,
    `준비 상태: ${result.ready ? 'READY' : 'NOT READY'}`,
    '',
    '주요 값:',
    `- BROKER_QUOTE_PROVIDER: ${result.values.provider} (${result.values.providerLabel})`,
    `- BROKER_TRADING_ENABLED: ${result.values.tradingEnabled ? 'true' : 'false'}`,
    `- KIS_API_BASE_URL: ${result.values.kisBaseUrl}`,
    `- KIS_APP_KEY: ${result.values.hasKisAppKey ? '설정됨' : '미설정'}`,
    `- KIS_APP_SECRET: ${result.values.hasKisAppSecret ? '설정됨' : '미설정'}`,
    `- KIS_ACCESS_TOKEN: ${result.values.hasKisAccessToken ? '설정됨' : '미설정'}`,
    `- KIS_MARKET_DIV_CODE: ${result.values.kisMarketDivCode}`,
    `- KIWOOM_API_BASE_URL: ${result.values.kiwoomBaseUrl}`,
    `- KIWOOM_APP_KEY: ${result.values.hasKiwoomAppKey ? '설정됨' : '미설정'}`,
    `- KIWOOM_SECRET_KEY: ${result.values.hasKiwoomSecretKey ? '설정됨' : '미설정'}`,
    `- KIWOOM_ACCESS_TOKEN: ${result.values.hasKiwoomAccessToken ? '설정됨' : '미설정'}`,
    '',
    '추천 순서:'
  ];

  result.values.recommendedOrder.forEach((item, index) => {
    lines.push(`${index + 1}. ${item}`);
  });

  lines.push('', '검증 결과:');

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

export function parseBrokerApiAdapterReviewArgs(args = [], options = {}) {
  const parsed = {
    env: { ...(options.env || process.env) },
    json: false,
    help: false,
    failOnWarn: false
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === '--help' || arg === '-h') {
      parsed.help = true;
    } else if (arg === '--json') {
      parsed.json = true;
    } else if (arg === '--fail-on-warn') {
      parsed.failOnWarn = true;
    } else if (arg === '--provider') {
      const value = args[index + 1];

      if (!value) {
        throw new Error('--provider 값이 필요합니다.');
      }

      parsed.env.BROKER_QUOTE_PROVIDER = value;
      index += 1;
    } else if (arg.startsWith('--provider=')) {
      parsed.env.BROKER_QUOTE_PROVIDER = arg.slice('--provider='.length);
    } else {
      throw new Error(`알 수 없는 옵션입니다: ${arg}`);
    }
  }

  return parsed;
}

export function getBrokerApiAdapterReviewHelp() {
  return [
    '사용법: npm run check:broker-api -- [옵션]',
    '',
    '옵션:',
    '  --provider <none|kis|kiwoom>  점검할 증권사 provider를 임시 지정',
    '  --json                        사람이 읽는 보고서 대신 JSON 출력',
    '  --fail-on-warn                경고가 있어도 종료 코드 1로 처리',
    '  --help                        도움말 출력',
    '',
    '주요 환경변수:',
    '  BROKER_QUOTE_PROVIDER         none, kis, kiwoom 중 하나. 기본값 none',
    '  BROKER_TRADING_ENABLED        주문 기능 사용 여부. 이 앱은 false만 허용',
    '  KIS_API_BASE_URL              한국투자증권 Open API URL',
    '  KIS_APP_KEY                   한국투자증권 앱 키',
    '  KIS_APP_SECRET                한국투자증권 앱 시크릿',
    '  KIS_ACCESS_TOKEN              한국투자증권 접근 토큰',
    '  KIS_MARKET_DIV_CODE           J:KRX, NX:NXT, UN:통합. 기본값 J',
    '  KIWOOM_API_BASE_URL           키움 REST API URL',
    '  KIWOOM_APP_KEY                키움 앱 키',
    '  KIWOOM_SECRET_KEY             키움 시크릿 키',
    '  KIWOOM_ACCESS_TOKEN           키움 접근 토큰'
  ].join('\n');
}

function normalizeBrokerApiValues(env) {
  const provider = normalizeProvider(firstValue(env.BROKER_QUOTE_PROVIDER) || 'none');

  return {
    provider,
    tradingEnabled: normalizeBoolean(firstValue(env.BROKER_TRADING_ENABLED), false),
    kisBaseUrl: firstValue(env.KIS_API_BASE_URL) || 'https://openapi.koreainvestment.com:9443',
    kisAppKey: firstValue(env.KIS_APP_KEY),
    kisAppSecret: firstValue(env.KIS_APP_SECRET),
    kisAccessToken: firstValue(env.KIS_ACCESS_TOKEN),
    kisAccountNumber: firstValue(env.KIS_ACCOUNT_NUMBER),
    kisMarketDivCode: (firstValue(env.KIS_MARKET_DIV_CODE) || 'J').toUpperCase(),
    kiwoomBaseUrl: firstValue(env.KIWOOM_API_BASE_URL) || 'https://api.kiwoom.com',
    kiwoomAppKey: firstValue(env.KIWOOM_APP_KEY),
    kiwoomSecretKey: firstValue(env.KIWOOM_SECRET_KEY),
    kiwoomAccessToken: firstValue(env.KIWOOM_ACCESS_TOKEN),
    kiwoomAccountNumber: firstValue(env.KIWOOM_ACCOUNT_NUMBER)
  };
}

function buildChecks(values) {
  const checks = [
    {
      name: 'provider_supported',
      label: '증권사 provider 값',
      level: 'error',
      ok: supportedProviders.has(values.provider),
      message: supportedProviders.has(values.provider)
        ? `BROKER_QUOTE_PROVIDER=${values.provider} 값을 사용할 수 있습니다.`
        : 'BROKER_QUOTE_PROVIDER는 none, kis, kiwoom 중 하나여야 합니다.'
    },
    {
      name: 'provider_selected',
      label: '증권사 시세 provider 선택',
      level: 'warn',
      ok: values.provider !== 'none',
      message:
        values.provider !== 'none'
          ? `${providerLabels[values.provider] || values.provider} provider를 점검합니다.`
          : '아직 증권사 provider를 사용하지 않습니다. 현재 무료 시세 체인은 그대로 유지됩니다.'
    },
    {
      name: 'trading_disabled',
      label: '주문 기능 차단',
      level: 'error',
      ok: !values.tradingEnabled,
      message:
        !values.tradingEnabled
          ? '알림 앱 범위를 유지하기 위해 주문/자동매매 기능은 꺼져 있습니다.'
          : '이 앱은 알림 전용이므로 BROKER_TRADING_ENABLED=true 설정을 허용하지 않습니다.'
    }
  ];

  if (values.provider === 'kis') {
    checks.push(
      createBrokerUrlCheck({
        name: 'kis_base_url_https',
        label: 'KIS API URL',
        value: values.kisBaseUrl
      }),
      createPresenceCheck({
        name: 'kis_app_key_present',
        label: 'KIS 앱 키',
        value: values.kisAppKey,
        message: 'KIS_APP_KEY가 필요합니다.'
      }),
      createPresenceCheck({
        name: 'kis_app_secret_present',
        label: 'KIS 앱 시크릿',
        value: values.kisAppSecret,
        message: 'KIS_APP_SECRET이 필요합니다.'
      }),
      createPresenceCheck({
        name: 'kis_access_token_present',
        label: 'KIS 접근 토큰',
        value: values.kisAccessToken,
        message: '현재 앱에서 직접 현재가를 호출하려면 KIS_ACCESS_TOKEN이 필요합니다.'
      }),
      createOptionalAccountCheck({
        name: 'kis_account_number_present',
        label: 'KIS 계좌번호',
        value: values.kisAccountNumber
      }),
      {
        name: 'kis_market_div_code_supported',
        label: 'KIS 시장 구분 코드',
        level: 'error',
        ok: supportedKisMarketDivCodes.has(values.kisMarketDivCode),
        message: supportedKisMarketDivCodes.has(values.kisMarketDivCode)
          ? `KIS_MARKET_DIV_CODE=${values.kisMarketDivCode} 값을 사용할 수 있습니다.`
          : 'KIS_MARKET_DIV_CODE는 J, NX, UN 중 하나여야 합니다.'
      }
    );
  }

  if (values.provider === 'kiwoom') {
    checks.push(
      createBrokerUrlCheck({
        name: 'kiwoom_base_url_https',
        label: '키움 API URL',
        value: values.kiwoomBaseUrl
      }),
      createPresenceCheck({
        name: 'kiwoom_app_key_present',
        label: '키움 앱 키',
        value: values.kiwoomAppKey,
        message: 'KIWOOM_APP_KEY가 필요합니다.'
      }),
      createPresenceCheck({
        name: 'kiwoom_secret_key_present',
        label: '키움 시크릿 키',
        value: values.kiwoomSecretKey,
        message: 'KIWOOM_SECRET_KEY가 필요합니다.'
      }),
      createPresenceCheck({
        name: 'kiwoom_access_token_present',
        label: '키움 접근 토큰',
        value: values.kiwoomAccessToken,
        message: '현재 앱에서 직접 현재가를 호출하려면 KIWOOM_ACCESS_TOKEN이 필요합니다.'
      }),
      createOptionalAccountCheck({
        name: 'kiwoom_account_number_present',
        label: '키움 계좌번호',
        value: values.kiwoomAccountNumber
      })
    );
  }

  return checks;
}

function createBrokerUrlCheck(options) {
  const parsed = parseUrl(options.value);
  const ok = Boolean(parsed) && parsed.protocol === 'https:' && !isLocalHostName(parsed.hostname);

  return {
    name: options.name,
    label: options.label,
    level: 'error',
    ok,
    message: ok
      ? `${options.label}이 공개 HTTPS URL입니다.`
      : `${options.label}은 localhost가 아닌 HTTPS URL이어야 합니다.`
  };
}

function createPresenceCheck(options) {
  return {
    name: options.name,
    label: options.label,
    level: 'error',
    ok: Boolean(options.value),
    message: options.value ? `${options.label}가 설정되어 있습니다.` : options.message
  };
}

function createOptionalAccountCheck(options) {
  return {
    name: options.name,
    label: options.label,
    level: 'warn',
    ok: Boolean(options.value),
    message: options.value
      ? `${options.label}가 설정되어 있습니다.`
      : '현재가 조회에는 필수가 아니지만, 향후 계좌 기반 기능 검증을 위해 계좌번호 설정을 권장합니다.'
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

function normalizeProvider(value) {
  const text = String(value || '').trim().toLowerCase();

  if (['', 'none', 'off', 'false', 'disabled'].includes(text)) {
    return 'none';
  }

  if (['kis', 'korea-investment', 'koreainvestment', '한국투자증권', '한투'].includes(text)) {
    return 'kis';
  }

  if (['kiwoom', 'kiwoom-rest', '키움', '키움증권'].includes(text)) {
    return 'kiwoom';
  }

  return text;
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
