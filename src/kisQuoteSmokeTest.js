import { fetchQuote, toNaverSymbol } from './priceProvider.js';
import { getKisAccessToken, resolveKisTokenCachePath } from './kisToken.js';

const defaultSymbol = '336260';
const supportedMarkets = new Set(['J', 'NX', 'UN']);
const marketLabels = {
  J: 'KRX',
  NX: 'NXT',
  UN: '통합'
};

export async function buildKisQuoteSmokeTest(options = {}) {
  const generatedAt = normalizeNow(options.now).toISOString();
  const secrets = [options.kisAppKey, options.kisAppSecret, options.kisAccessToken].filter(Boolean);
  let symbol = '';
  let inputSymbol = '';
  let markets = [];

  try {
    symbol = normalizeSmokeSymbol(options.symbol || defaultSymbol);
    inputSymbol = toNaverSymbol(symbol);
    markets = normalizeKisSmokeMarkets(
      options.markets || options.market || options.kisMarketDivCode || 'J'
    );
  } catch (error) {
    return {
      ok: false,
      generatedAt,
      symbol: symbol || String(options.symbol || '').trim(),
      inputSymbol,
      provider: 'kis',
      token: buildUnavailableTokenInfo(options),
      markets,
      summary: {
        total: 0,
        success: 0,
        failed: 1
      },
      results: [],
      message: sanitizeError(error, secrets)
    };
  }

  let token;

  try {
    token = await getKisAccessToken({
      ...options,
      kisTokenAutoRefresh: options.kisTokenAutoRefresh !== false
    });
  } catch (error) {
    return {
      ok: false,
      generatedAt,
      symbol,
      inputSymbol,
      provider: 'kis',
      token: buildUnavailableTokenInfo(options),
      markets: markets.map(toMarketInfo),
      summary: {
        total: markets.length,
        success: 0,
        failed: markets.length
      },
      results: [],
      message: `KIS 접근 토큰 확인 실패: ${sanitizeError(error, secrets)}`
    };
  }

  secrets.push(token.accessToken);
  const results = [];

  for (const market of markets) {
    const attempts = [];

    try {
      const quote = await fetchQuote(symbol, {
        ...options,
        providers: 'kis',
        kisAccessToken: token.accessToken,
        kisMarketDivCode: market,
        onProviderAttempt: async (attempt) => {
          const sanitized = sanitizeProviderAttempt(attempt, secrets);
          attempts.push(sanitized);

          if (typeof options.onProviderAttempt === 'function') {
            await options.onProviderAttempt(sanitized);
          }
        }
      });

      results.push({
        ok: true,
        market,
        marketLabel: marketLabels[market],
        quote: sanitizeQuote(quote),
        attempts
      });
    } catch (error) {
      results.push({
        ok: false,
        market,
        marketLabel: marketLabels[market],
        error: sanitizeError(error, secrets),
        attempts
      });
    }
  }

  const success = results.filter((result) => result.ok).length;
  const failed = results.length - success;

  return {
    ok: failed === 0,
    generatedAt,
    symbol,
    inputSymbol,
    provider: 'kis',
    token: sanitizeTokenInfo(token),
    markets: markets.map(toMarketInfo),
    summary: {
      total: results.length,
      success,
      failed
    },
    results,
    message:
      failed === 0
        ? 'KIS 현재가 smoke test가 성공했습니다.'
        : `KIS 현재가 smoke test에서 ${failed}개 시장 조회가 실패했습니다.`
  };
}

export function formatKisQuoteSmokeTestReport(result) {
  const lines = [
    'KIS 현재가 smoke test 결과',
    `상태: ${result.ok ? 'OK' : 'FAILED'}`,
    `생성 시각: ${result.generatedAt}`,
    `종목: ${result.symbol || '(없음)'}${result.inputSymbol ? ` (KIS 입력 ${result.inputSymbol})` : ''}`,
    `시장: ${formatMarketList(result.markets)}`,
    '',
    '토큰:',
    `- 사용 가능: ${result.token?.available ? '예' : '아니오'}`,
    `- 출처: ${result.token?.source || '(없음)'}`,
    `- 만료 시각: ${result.token?.expiresAt || '(알 수 없음)'}`,
    `- 캐시 경로: ${result.token?.cachePath || '(사용 안 함)'}`,
    ''
  ];

  if (result.results?.length) {
    lines.push('조회 결과:');

    for (const item of result.results) {
      if (item.ok) {
        const quote = item.quote;
        lines.push(
          `- [OK] ${item.market}/${item.marketLabel}: ${quote.name || quote.symbol} ${formatPrice(
            quote.price,
            quote.currency
          )} (${quote.exchange || 'KIS'}, ${quote.regularMarketTime || '시각 없음'})`
        );
      } else {
        lines.push(`- [FAILED] ${item.market}/${item.marketLabel}: ${item.error}`);
      }
    }

    lines.push('');
  }

  lines.push(
    `요약: total=${result.summary.total}, success=${result.summary.success}, failed=${result.summary.failed}`,
    `메시지: ${result.message}`
  );

  return `${lines.join('\n')}\n`;
}

export function parseKisQuoteSmokeTestArgs(args = [], options = {}) {
  const env = options.env || process.env;
  const parsed = {
    env,
    json: false,
    help: false,
    symbol: firstValue(env.KIS_SMOKE_SYMBOL) || defaultSymbol,
    market: firstValue(env.KIS_MARKET_DIV_CODE) || 'J',
    baseUrl: '',
    cachePath: '',
    forceToken: false,
    timeoutMs: null
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === '--help' || arg === '-h') {
      parsed.help = true;
    } else if (arg === '--json') {
      parsed.json = true;
    } else if (arg === '--symbol') {
      parsed.symbol = requireNextArg(args, index, '--symbol');
      index += 1;
    } else if (arg.startsWith('--symbol=')) {
      parsed.symbol = arg.slice('--symbol='.length);
    } else if (arg === '--market') {
      parsed.market = requireNextArg(args, index, '--market');
      index += 1;
    } else if (arg.startsWith('--market=')) {
      parsed.market = arg.slice('--market='.length);
    } else if (arg === '--base-url') {
      parsed.baseUrl = requireNextArg(args, index, '--base-url');
      index += 1;
    } else if (arg.startsWith('--base-url=')) {
      parsed.baseUrl = arg.slice('--base-url='.length);
    } else if (arg === '--cache-path') {
      parsed.cachePath = requireNextArg(args, index, '--cache-path');
      index += 1;
    } else if (arg.startsWith('--cache-path=')) {
      parsed.cachePath = arg.slice('--cache-path='.length);
    } else if (arg === '--timeout-ms') {
      parsed.timeoutMs = parseTimeout(requireNextArg(args, index, '--timeout-ms'));
      index += 1;
    } else if (arg.startsWith('--timeout-ms=')) {
      parsed.timeoutMs = parseTimeout(arg.slice('--timeout-ms='.length));
    } else if (arg === '--force-token' || arg === '--force') {
      parsed.forceToken = true;
    } else {
      throw new Error(`알 수 없는 옵션입니다: ${arg}`);
    }
  }

  return parsed;
}

export function getKisQuoteSmokeTestHelp() {
  return [
    '사용법: npm run check:kis-quote -- [옵션]',
    '',
    '옵션:',
    '  --symbol <code>       조회할 한국 주식 코드. 기본값 336260',
    '  --market <J|NX|UN|all>  KRX/NXT/통합 시장 구분. 쉼표로 여러 개 지정 가능',
    '  --json                사람이 읽는 보고서 대신 JSON 출력',
    '  --force-token         캐시가 유효해도 KIS 접근 토큰을 새로 발급',
    '  --cache-path <path>   기본 data/kis-token.json 대신 사용할 캐시 경로',
    '  --base-url <url>      기본 KIS_API_BASE_URL 대신 사용할 API URL',
    '  --timeout-ms <ms>     요청 제한 시간. 기본값 QUOTE_TIMEOUT_MS',
    '  --help                도움말 출력',
    '',
    '필수 환경변수:',
    '  KIS_APP_KEY           한국투자증권 앱 키',
    '  KIS_APP_SECRET        한국투자증권 앱 시크릿',
    '',
    '예시:',
    '  npm run check:kis-quote -- --symbol 336260 --market J',
    '  npm run check:kis-quote -- --symbol 33626L --market all',
    '  npm run check:kis-quote -- --symbol 005930 --market UN --json'
  ].join('\n');
}

export function normalizeKisSmokeMarkets(value) {
  const raw = Array.isArray(value) ? value : String(value || 'J').split(',');
  const normalized = raw.flatMap((item) => {
    const market = normalizeMarketAlias(item);
    return market === 'ALL' ? ['J', 'NX', 'UN'] : [market];
  });
  const unique = [...new Set(normalized)];

  if (!unique.length) {
    return ['J'];
  }

  for (const market of unique) {
    if (!supportedMarkets.has(market)) {
      throw new Error('KIS 시장 구분은 J, NX, UN, all 중 하나여야 합니다.');
    }
  }

  return unique;
}

function normalizeSmokeSymbol(value) {
  const symbol = String(value || '').trim().toUpperCase();

  if (!symbol) {
    throw new Error('조회할 종목 코드가 필요합니다.');
  }

  toNaverSymbol(symbol);
  return symbol;
}

function normalizeMarketAlias(value) {
  const market = String(value || '').trim().toUpperCase();

  if (!market) {
    return 'J';
  }

  if (['ALL', '*', '전체'].includes(market)) {
    return 'ALL';
  }

  if (['KRX', 'KOSPI', 'KOSDAQ'].includes(market)) {
    return 'J';
  }

  if (['NXT', 'NEXTRADE', 'NEXTRADE-ATS'].includes(market)) {
    return 'NX';
  }

  if (['TOTAL', 'INTEGRATED', 'UNIFIED', '통합'].includes(market)) {
    return 'UN';
  }

  return market;
}

function sanitizeTokenInfo(token) {
  return {
    available: true,
    source: token.source || '',
    expiresAt: token.expiresAt || null,
    cachePath: token.cachePath || null,
    cached: Boolean(token.cached)
  };
}

function buildUnavailableTokenInfo(options = {}) {
  return {
    available: false,
    source: '',
    expiresAt: null,
    cachePath: options.kisAccessToken ? null : resolveKisTokenCachePath(options),
    cached: false
  };
}

function sanitizeQuote(quote) {
  return {
    symbol: quote.symbol || '',
    name: quote.name || '',
    price: quote.price,
    currency: quote.currency || '',
    exchange: quote.exchange || '',
    marketState: quote.marketState || '',
    provider: quote.provider || 'kis',
    providerLabel: quote.providerLabel || '',
    dataDelay: quote.dataDelay || '',
    venue: quote.venue || '',
    licenseType: quote.licenseType || '',
    sourceNote: quote.sourceNote || '',
    regularMarketTime: quote.regularMarketTime || null
  };
}

function sanitizeProviderAttempt(attempt, secrets = []) {
  return {
    type: attempt.type || 'quote',
    provider: attempt.provider || 'kis',
    symbol: attempt.symbol || '',
    status: attempt.status || '',
    reason: attempt.reason || '',
    error: attempt.error ? sanitizeText(attempt.error, secrets) : '',
    startedAt: attempt.startedAt || '',
    finishedAt: attempt.finishedAt || '',
    durationMs: Number.isFinite(Number(attempt.durationMs)) ? Number(attempt.durationMs) : 0
  };
}

function sanitizeError(error, secrets = []) {
  return sanitizeText(error?.message || String(error || ''), secrets);
}

function sanitizeText(value, secrets = []) {
  let text = String(value || '').replace(/\s+/g, ' ').trim();

  for (const secret of secrets) {
    const raw = String(secret || '').trim();

    if (raw.length >= 4) {
      text = text.replaceAll(raw, maskSecret(raw));
    }
  }

  return text;
}

function toMarketInfo(market) {
  return {
    code: market,
    label: marketLabels[market] || market
  };
}

function formatMarketList(markets = []) {
  if (!markets.length) {
    return '(없음)';
  }

  return markets.map((market) => `${market.code}/${market.label}`).join(', ');
}

function formatPrice(price, currency) {
  const numeric = Number(price);
  const value = Number.isFinite(numeric) ? numeric.toLocaleString('ko-KR') : String(price || '');

  return `${value}${currency ? ` ${currency}` : ''}`;
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

function requireNextArg(args, index, name) {
  const value = args[index + 1];

  if (!value) {
    throw new Error(`${name} 값이 필요합니다.`);
  }

  return value;
}

function parseTimeout(value) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error('--timeout-ms 값은 1보다 큰 숫자여야 합니다.');
  }

  return parsed;
}

function normalizeNow(value) {
  const date = value ? new Date(value) : new Date();
  return Number.isFinite(date.getTime()) ? date : new Date();
}

function maskSecret(value) {
  const text = String(value || '').trim();

  if (text.length <= 10) {
    return `${text.slice(0, 2)}...${text.slice(-2)}`;
  }

  return `${text.slice(0, 6)}...${text.slice(-4)}`;
}
