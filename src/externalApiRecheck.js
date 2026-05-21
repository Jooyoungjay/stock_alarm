import { buildBrokerApiAdapterReview } from './brokerApiAdapterReview.js';
import { buildKisQuoteSmokeTest } from './kisQuoteSmokeTest.js';
import { fetchHistoricalHighSince } from './priceProvider.js';
import { isTelegramConfigured, sendTelegramMessage } from './telegram.js';

const defaultKisSymbol = '336260';
const defaultPublicDataSymbol = '005930';
const dayMs = 24 * 60 * 60 * 1000;

export async function buildExternalApiRecheck(options = {}) {
  const now = normalizeDate(options.now || new Date());
  const generatedAt = now.toISOString();
  const config = options.config || {};
  const env = options.env || process.env;
  const timeoutMs = normalizePositiveInteger(options.timeoutMs || config.quoteTimeoutMs, 10000);
  const publicDataEndDate = normalizeDateOnly(options.publicDataEndDate || options.publicdataEndDate) ||
    formatDateOnly(now);
  const publicDataStartDate = normalizeDateOnly(options.publicDataStartDate || options.publicdataStartDate) ||
    formatDateOnly(new Date(now.getTime() - 14 * dayMs));
  const context = {
    kisSymbol: normalizeText(options.kisSymbol || config.kisSmokeSymbol || defaultKisSymbol),
    kisMarket: normalizeText(options.kisMarket || 'all'),
    publicDataSymbol: normalizeText(options.publicDataSymbol || options.publicdataSymbol || defaultPublicDataSymbol),
    publicDataStartDate,
    publicDataEndDate,
    sendTelegram: Boolean(options.sendTelegram)
  };
  const secrets = buildSecretList(config, env);
  const checks = [
    buildBrokerCheck(env, generatedAt),
    await buildKisCheck(config, context, {
      fetch: options.fetch,
      generatedAt,
      now,
      secrets,
      timeoutMs
    }),
    await buildPublicDataCheck(config, context, {
      fetch: options.fetch,
      secrets,
      timeoutMs
    }),
    await buildTelegramCheck(config, context, {
      fetch: options.fetch,
      generatedAt,
      secrets
    })
  ];
  const summary = summarizeExternalApiChecks(checks);

  return {
    ok: summary.failed === 0 && summary.skipped === 0 && summary.warning === 0,
    overallStatus: getOverallStatus(summary),
    generatedAt,
    context,
    summary,
    checks,
    nextActions: buildExternalApiNextActions(checks)
  };
}

export function formatExternalApiRecheckReport(result = {}) {
  const lines = [
    '외부 API 실계정 재점검 결과',
    `생성 시각: ${result.generatedAt || new Date().toISOString()}`,
    `종합 상태: ${result.overallStatus || 'UNKNOWN'}`,
    '',
    '점검 대상:',
    `- KIS 종목/시장: ${result.context?.kisSymbol || defaultKisSymbol} / ${result.context?.kisMarket || 'all'}`,
    `- 공공데이터 일봉: ${result.context?.publicDataSymbol || defaultPublicDataSymbol} (${result.context?.publicDataStartDate || '-'} ~ ${result.context?.publicDataEndDate || '-'})`,
    `- 텔레그램 실전송: ${result.context?.sendTelegram ? '실행' : '생략'}`,
    '',
    '결과:'
  ];

  for (const check of Array.isArray(result.checks) ? result.checks : []) {
    lines.push(`- [${formatStatus(check.status)}] ${check.label}: ${check.message}`);

    for (const detail of Array.isArray(check.details) ? check.details : []) {
      lines.push(`  - ${detail}`);
    }
  }

  lines.push(
    '',
    `요약: passed=${result.summary?.passed || 0}, warning=${result.summary?.warning || 0}, skipped=${result.summary?.skipped || 0}, failed=${result.summary?.failed || 0}`
  );

  if (Array.isArray(result.nextActions) && result.nextActions.length) {
    lines.push('', '다음 조치:');

    result.nextActions.forEach((action, index) => {
      lines.push(`${index + 1}. ${action}`);
    });
  }

  return `${lines.join('\n')}\n`;
}

export function parseExternalApiRecheckArgs(args = [], options = {}) {
  const env = options.env || process.env;
  const parsed = {
    env,
    json: false,
    help: false,
    sendTelegram: false,
    kisSymbol: firstValue(env.KIS_SMOKE_SYMBOL) || defaultKisSymbol,
    kisMarket: 'all',
    publicDataSymbol: firstValue(env.PUBLICDATA_SMOKE_SYMBOL) || defaultPublicDataSymbol,
    publicDataStartDate: '',
    publicDataEndDate: '',
    timeoutMs: null
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === '--help' || arg === '-h') {
      parsed.help = true;
    } else if (arg === '--json') {
      parsed.json = true;
    } else if (arg === '--send-telegram') {
      parsed.sendTelegram = true;
    } else if (arg === '--kis-symbol') {
      parsed.kisSymbol = requireNextValue(args, (index += 1), arg);
    } else if (arg.startsWith('--kis-symbol=')) {
      parsed.kisSymbol = arg.split('=').slice(1).join('=');
    } else if (arg === '--kis-market') {
      parsed.kisMarket = requireNextValue(args, (index += 1), arg);
    } else if (arg.startsWith('--kis-market=')) {
      parsed.kisMarket = arg.split('=').slice(1).join('=');
    } else if (arg === '--publicdata-symbol' || arg === '--public-data-symbol') {
      parsed.publicDataSymbol = requireNextValue(args, (index += 1), arg);
    } else if (arg.startsWith('--publicdata-symbol=')) {
      parsed.publicDataSymbol = arg.split('=').slice(1).join('=');
    } else if (arg.startsWith('--public-data-symbol=')) {
      parsed.publicDataSymbol = arg.split('=').slice(1).join('=');
    } else if (arg === '--publicdata-start' || arg === '--public-data-start') {
      parsed.publicDataStartDate = requireNextValue(args, (index += 1), arg);
    } else if (arg.startsWith('--publicdata-start=')) {
      parsed.publicDataStartDate = arg.split('=').slice(1).join('=');
    } else if (arg.startsWith('--public-data-start=')) {
      parsed.publicDataStartDate = arg.split('=').slice(1).join('=');
    } else if (arg === '--publicdata-end' || arg === '--public-data-end') {
      parsed.publicDataEndDate = requireNextValue(args, (index += 1), arg);
    } else if (arg.startsWith('--publicdata-end=')) {
      parsed.publicDataEndDate = arg.split('=').slice(1).join('=');
    } else if (arg.startsWith('--public-data-end=')) {
      parsed.publicDataEndDate = arg.split('=').slice(1).join('=');
    } else if (arg === '--timeout-ms') {
      parsed.timeoutMs = normalizePositiveInteger(requireNextValue(args, (index += 1), arg), null);
    } else if (arg.startsWith('--timeout-ms=')) {
      parsed.timeoutMs = normalizePositiveInteger(arg.split('=').slice(1).join('='), null);
    } else {
      throw new Error(`알 수 없는 옵션입니다: ${arg}`);
    }
  }

  return parsed;
}

export function getExternalApiRecheckHelp() {
  return [
    '사용법: npm run check:external-apis -- [옵션]',
    '',
    '옵션:',
    '  --json                         JSON으로 출력',
    '  --send-telegram                텔레그램 테스트 메시지 실제 전송',
    '  --kis-symbol <종목코드>        KIS 현재가 점검 종목. 기본값 KIS_SMOKE_SYMBOL 또는 336260',
    '  --kis-market <시장>            KIS 시장. all, J, NX, UN. 기본값 all',
    '  --publicdata-symbol <종목코드> 공공데이터 일봉 점검 종목. 기본값 005930',
    '  --publicdata-start <YYYY-MM-DD> 공공데이터 점검 시작일. 기본값 최근 14일',
    '  --publicdata-end <YYYY-MM-DD>  공공데이터 점검 종료일. 기본값 오늘',
    '  --timeout-ms <숫자>            외부 API 요청 timeout',
    '',
    '환경변수:',
    '  KIS_APP_KEY / KIS_APP_SECRET / KIS_ACCESS_TOKEN',
    '  DATA_GO_KR_SERVICE_KEY',
    '  TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID',
    '',
    '예시:',
    '  npm run check:external-apis',
    '  npm run check:external-apis -- --send-telegram',
    '  npm run check:external-apis -- --kis-symbol 33626L --kis-market all --publicdata-symbol 005930'
  ].join('\n');
}

function buildBrokerCheck(env, generatedAt) {
  const result = buildBrokerApiAdapterReview({ env, now: generatedAt });
  const hasWarnings = Number(result.summary?.warn || 0) > 0;

  return {
    id: 'broker',
    label: '증권사 adapter 설정',
    status: result.ready ? (hasWarnings ? 'warning' : 'passed') : 'failed',
    message: result.ready
      ? hasWarnings
        ? '주문 차단은 정상이며, 현재 증권사 provider는 선택하지 않은 상태입니다.'
        : '증권사 adapter 설정이 현재 범위에서 유효합니다.'
      : '증권사 adapter 설정에 오류가 있습니다.',
    details: [
      `BROKER_QUOTE_PROVIDER=${result.values.provider}`,
      `KIS_APP_KEY=${result.values.hasKisAppKey ? '설정됨' : '미설정'}`,
      `KIS_APP_SECRET=${result.values.hasKisAppSecret ? '설정됨' : '미설정'}`,
      `KIS_ACCESS_TOKEN=${result.values.hasKisAccessToken ? '설정됨' : '미설정'}`,
      `BROKER_TRADING_ENABLED=${result.values.tradingEnabled ? 'true' : 'false'}`
    ],
    raw: result
  };
}

async function buildKisCheck(config, context, options) {
  const result = await buildKisQuoteSmokeTest({
    symbol: context.kisSymbol,
    market: context.kisMarket,
    kisApiBaseUrl: config.kisApiBaseUrl,
    kisAppKey: config.kisAppKey,
    kisAppSecret: config.kisAppSecret,
    kisAccessToken: config.kisAccessToken,
    kisTokenAutoRefresh: config.kisTokenAutoRefresh,
    kisTokenCachePath: config.kisTokenCachePath,
    kisCustType: config.kisCustType,
    fetch: options.fetch,
    now: options.now,
    timeoutMs: options.timeoutMs
  });

  return {
    id: 'kis_quote',
    label: 'KIS 현재가 실계정',
    status: result.ok ? 'passed' : 'failed',
    message: sanitizeText(result.message, options.secrets),
    details: [
      `토큰 출처: ${result.token?.source || '(없음)'}`,
      `토큰 사용 가능: ${result.token?.available ? '예' : '아니오'}`,
      `시장 성공/실패: ${result.summary?.success || 0}/${result.summary?.failed || 0}`
    ],
    raw: sanitizeObject(result, options.secrets)
  };
}

async function buildPublicDataCheck(config, context, options) {
  const attempts = [];

  try {
    const result = await fetchHistoricalHighSince(
      context.publicDataSymbol,
      context.publicDataStartDate,
      {
        providers: 'publicdata',
        endDate: context.publicDataEndDate,
        timeoutMs: options.timeoutMs,
        dataGoKrServiceKey: config.dataGoKrServiceKey,
        fetch: options.fetch,
        onProviderAttempt: (attempt) => attempts.push(attempt)
      }
    );

    return {
      id: 'publicdata_price',
      label: '공공데이터 일봉',
      status: 'passed',
      message: `${context.publicDataSymbol} 최고가 ${result.highPrice}를 조회했습니다.`,
      details: [
        `최고가 기준일: ${result.highPriceAt || '(없음)'}`,
        `provider: ${result.providerLabel || result.provider || 'publicdata'}`
      ],
      raw: sanitizeObject({ result, attempts }, options.secrets)
    };
  } catch (error) {
    return {
      id: 'publicdata_price',
      label: '공공데이터 일봉',
      status: 'failed',
      message: sanitizeText(error.message || '공공데이터 일봉 조회 실패', options.secrets),
      details: attempts.map((attempt) =>
        `${attempt.provider}: ${attempt.status}${attempt.error ? ` (${sanitizeText(attempt.error, options.secrets)})` : ''}`
      ),
      raw: sanitizeObject({ attempts }, options.secrets)
    };
  }
}

async function buildTelegramCheck(config, context, options) {
  if (!isTelegramConfigured(config)) {
    return {
      id: 'telegram',
      label: '텔레그램 실전송',
      status: 'failed',
      message: 'TELEGRAM_BOT_TOKEN 또는 TELEGRAM_CHAT_ID가 설정되지 않았습니다.',
      details: [
        `TELEGRAM_BOT_TOKEN=${config.telegramBotToken ? '설정됨' : '미설정'}`,
        `TELEGRAM_CHAT_ID=${config.telegramChatId ? '설정됨' : '미설정'}`
      ]
    };
  }

  if (!context.sendTelegram) {
    return {
      id: 'telegram',
      label: '텔레그램 실전송',
      status: 'skipped',
      message: '설정은 확인했지만 실제 전송은 생략했습니다. --send-telegram 옵션으로 전송 확인이 필요합니다.',
      details: ['TELEGRAM_BOT_TOKEN=설정됨', 'TELEGRAM_CHAT_ID=설정됨']
    };
  }

  try {
    await sendTelegramMessage(
      config,
      `[Stock Alarm] 외부 API 실계정 재점검\n생성 시각: ${options.generatedAt}`,
      {
        fetch: options.fetch
      }
    );

    return {
      id: 'telegram',
      label: '텔레그램 실전송',
      status: 'passed',
      message: '테스트 메시지를 전송했습니다.',
      details: ['TELEGRAM_BOT_TOKEN=설정됨', 'TELEGRAM_CHAT_ID=설정됨']
    };
  } catch (error) {
    return {
      id: 'telegram',
      label: '텔레그램 실전송',
      status: 'failed',
      message: sanitizeText(error.message || '텔레그램 테스트 메시지 전송 실패', options.secrets),
      details: ['TELEGRAM_BOT_TOKEN=설정됨', 'TELEGRAM_CHAT_ID=설정됨']
    };
  }
}

function summarizeExternalApiChecks(checks) {
  return checks.reduce(
    (summary, check) => {
      if (check.status === 'passed') {
        summary.passed += 1;
      } else if (check.status === 'warning') {
        summary.warning += 1;
      } else if (check.status === 'skipped') {
        summary.skipped += 1;
      } else {
        summary.failed += 1;
      }

      return summary;
    },
    {
      passed: 0,
      warning: 0,
      skipped: 0,
      failed: 0
    }
  );
}

function getOverallStatus(summary) {
  if (summary.failed > 0) {
    return 'FAILED';
  }

  if (summary.warning > 0 || summary.skipped > 0) {
    return 'PARTIAL';
  }

  return 'READY';
}

function buildExternalApiNextActions(checks = []) {
  const actions = [];
  const byId = Object.fromEntries(checks.map((check) => [check.id, check]));

  if (byId.kis_quote?.status === 'failed') {
    actions.push('KIS_APP_KEY와 KIS_APP_SECRET을 설정한 뒤 `npm run check:external-apis -- --kis-symbol 336260 --kis-market all`을 다시 실행합니다.');
  }

  if (byId.publicdata_price?.status === 'failed') {
    actions.push('공공데이터포털에서 금융위원회 주식시세정보 활용 신청 상태와 `DATA_GO_KR_SERVICE_KEY` 권한을 확인합니다.');
  }

  if (byId.telegram?.status === 'skipped') {
    actions.push('텔레그램 실전송까지 확인하려면 `npm run check:external-apis -- --send-telegram`을 실행합니다.');
  } else if (byId.telegram?.status === 'failed') {
    actions.push('TELEGRAM_BOT_TOKEN과 TELEGRAM_CHAT_ID를 설정한 뒤 텔레그램 테스트 전송을 재실행합니다.');
  }

  if (byId.broker?.status === 'warning') {
    actions.push('KIS provider를 실제 시세 체인에 넣으려면 `BROKER_QUOTE_PROVIDER=kis` 또는 `QUOTE_PROVIDERS=kis,naver,...` 적용 여부를 별도로 결정합니다.');
  }

  return actions;
}

function buildSecretList(config = {}, env = {}) {
  return [
    config.kisAppKey,
    config.kisAppSecret,
    config.kisAccessToken,
    config.dataGoKrServiceKey,
    config.telegramBotToken,
    config.telegramChatId,
    env.KIS_APP_KEY,
    env.KIS_APP_SECRET,
    env.KIS_ACCESS_TOKEN,
    env.DATA_GO_KR_SERVICE_KEY,
    env.TELEGRAM_BOT_TOKEN,
    env.TELEGRAM_CHAT_ID
  ].filter((value) => normalizeText(value).length >= 4);
}

function sanitizeObject(value, secrets = []) {
  return JSON.parse(sanitizeText(JSON.stringify(value || null), secrets));
}

function sanitizeText(value, secrets = []) {
  let text = String(value || '');

  for (const secret of secrets) {
    const normalized = normalizeText(secret);

    if (normalized) {
      text = text.split(normalized).join('[REDACTED]');
    }
  }

  return text;
}

function formatStatus(status) {
  if (status === 'passed') {
    return 'OK';
  }

  if (status === 'warning') {
    return 'WARN';
  }

  if (status === 'skipped') {
    return 'SKIP';
  }

  return 'FAIL';
}

function normalizeDate(value) {
  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return new Date();
  }

  return date;
}

function normalizeDateOnly(value) {
  const text = normalizeText(value);

  if (!text) {
    return '';
  }

  const compact = text.replace(/[^\d]/g, '');

  if (compact.length !== 8) {
    return '';
  }

  return `${compact.slice(0, 4)}-${compact.slice(4, 6)}-${compact.slice(6, 8)}`;
}

function formatDateOnly(date) {
  return date.toISOString().slice(0, 10);
}

function normalizePositiveInteger(value, fallback) {
  const number = Number(value);

  if (!Number.isFinite(number) || number <= 0) {
    return fallback;
  }

  return Math.floor(number);
}

function requireNextValue(args, index, option) {
  const value = args[index];

  if (!value || value.startsWith('--')) {
    throw new Error(`${option} 옵션 값이 필요합니다.`);
  }

  return value;
}

function firstValue(...values) {
  for (const value of values) {
    const text = normalizeText(value);

    if (text) {
      return text;
    }
  }

  return '';
}

function normalizeText(value) {
  return String(value || '').trim();
}
