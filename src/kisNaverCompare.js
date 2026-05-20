import { fetchQuote as defaultFetchQuote, toNaverSymbol } from './priceProvider.js';

const defaultSymbol = '336260';
const supportedMarkets = new Set(['J', 'NX', 'UN']);
const marketLabels = {
  J: 'KRX',
  NX: 'NXT',
  UN: '통합'
};

export async function buildKisNaverQuoteComparison(options = {}) {
  const generatedAt = normalizeNow(options.now).toISOString();
  const secrets = [options.kisAppKey, options.kisAppSecret, options.kisAccessToken].filter(Boolean);
  const quoteFetcher = options.fetchQuote || defaultFetchQuote;
  let symbol = '';
  let inputSymbol = '';
  let markets = [];

  try {
    symbol = normalizeComparisonSymbol(options.symbol || defaultSymbol);
    inputSymbol = toNaverSymbol(symbol);
    markets = normalizeComparisonMarkets(options.markets || options.market || 'all');
  } catch (error) {
    return {
      ok: false,
      generatedAt,
      symbol: symbol || String(options.symbol || '').trim(),
      inputSymbol,
      provider: 'kis_naver_compare',
      markets,
      naver: null,
      results: [],
      summary: {
        kisTotal: 0,
        kisSuccess: 0,
        kisFailed: 0,
        comparable: 0
      },
      message: sanitizeError(error, secrets)
    };
  }

  const naver = await fetchProviderQuote({
    provider: 'naver',
    symbol,
    options: {
      ...options,
      providers: 'naver'
    },
    quoteFetcher,
    secrets
  });
  const results = [];

  for (const market of markets) {
    const item = await fetchProviderQuote({
      provider: 'kis',
      symbol,
      market,
      options: {
        ...options,
        providers: 'kis',
        kisMarketDivCode: market
      },
      quoteFetcher,
      secrets
    });

    results.push({
      ...item,
      market,
      marketLabel: marketLabels[market],
      comparison: compareQuotes(naver.quote, item.quote)
    });
  }

  const kisSuccess = results.filter((item) => item.ok).length;
  const kisFailed = results.length - kisSuccess;
  const comparable = results.filter((item) => item.comparison?.comparable).length;
  const ok = Boolean(naver.ok && comparable && kisFailed === 0);
  const recommendation = buildMarketRecommendation(results);

  return {
    ok,
    generatedAt,
    symbol,
    inputSymbol,
    provider: 'kis_naver_compare',
    markets: markets.map(toMarketInfo),
    naver,
    recommendation,
    results,
    summary: {
      kisTotal: results.length,
      kisSuccess,
      kisFailed,
      comparable
    },
    message: buildComparisonMessage({ naver, kisFailed, comparable, total: results.length })
  };
}

export function normalizeComparisonMarkets(value) {
  const raw = Array.isArray(value) ? value : String(value || 'all').split(',');
  const normalized = raw.flatMap((item) => {
    const market = normalizeMarketAlias(item);
    return market === 'ALL' ? ['J', 'NX', 'UN'] : [market];
  });
  const unique = [...new Set(normalized)];

  if (!unique.length) {
    return ['J', 'NX', 'UN'];
  }

  for (const market of unique) {
    if (!supportedMarkets.has(market)) {
      throw new Error('KIS 시장 구분은 J, NX, UN, all 중 하나여야 합니다.');
    }
  }

  return unique;
}

async function fetchProviderQuote({ provider, symbol, market, options, quoteFetcher, secrets }) {
  const attempts = [];

  try {
    const quote = await quoteFetcher(symbol, {
      ...options,
      onProviderAttempt: async (attempt) => {
        const sanitized = sanitizeProviderAttempt(attempt, secrets);
        attempts.push(sanitized);

        if (typeof options.onProviderAttempt === 'function') {
          await options.onProviderAttempt(sanitized);
        }
      }
    });

    return {
      ok: true,
      provider,
      market: market || '',
      quote: sanitizeQuote(quote),
      attempts
    };
  } catch (error) {
    return {
      ok: false,
      provider,
      market: market || '',
      quote: null,
      error: sanitizeError(error, secrets),
      attempts
    };
  }
}

function compareQuotes(naverQuote, kisQuote) {
  if (!naverQuote || !kisQuote) {
    return {
      comparable: false,
      reason: '비교할 수 있는 양쪽 가격이 없습니다.'
    };
  }

  const naverPrice = Number(naverQuote.price);
  const kisPrice = Number(kisQuote.price);

  if (!Number.isFinite(naverPrice) || naverPrice <= 0 || !Number.isFinite(kisPrice) || kisPrice <= 0) {
    return {
      comparable: false,
      reason: '비교할 수 있는 가격 형식이 아닙니다.'
    };
  }

  const naverCurrency = String(naverQuote.currency || '').trim();
  const kisCurrency = String(kisQuote.currency || '').trim();

  if (naverCurrency && kisCurrency && naverCurrency !== kisCurrency) {
    return {
      comparable: false,
      reason: `통화가 다릅니다: Naver ${naverCurrency}, KIS ${kisCurrency}`
    };
  }

  const difference = kisPrice - naverPrice;
  const differencePercent = (difference / naverPrice) * 100;

  return {
    comparable: true,
    basisProvider: 'naver',
    basisPrice: naverPrice,
    targetProvider: 'kis',
    targetPrice: kisPrice,
    difference,
    absoluteDifference: Math.abs(difference),
    differencePercent,
    direction: difference > 0 ? 'above' : difference < 0 ? 'below' : 'equal'
  };
}

function buildComparisonMessage({ naver, kisFailed, comparable, total }) {
  if (!naver.ok) {
    return `Naver 기준 가격 조회에 실패했습니다: ${naver.error || '알 수 없는 오류'}`;
  }

  if (!comparable) {
    return 'KIS와 Naver를 비교할 수 있는 시장 결과가 없습니다.';
  }

  if (kisFailed > 0) {
    return `KIS/Naver 가격 비교가 완료됐지만 ${kisFailed}개 KIS 시장 조회가 실패했습니다.`;
  }

  return `KIS/Naver 가격 비교가 완료됐습니다. ${comparable}/${total}개 시장을 비교했습니다.`;
}

function buildMarketRecommendation(results = []) {
  const comparableResults = results.filter((item) => item.comparison?.comparable);

  if (!comparableResults.length) {
    return null;
  }

  const best = comparableResults.reduce((currentBest, item) => {
    if (!currentBest) {
      return item;
    }

    return item.comparison.absoluteDifference < currentBest.comparison.absoluteDifference
      ? item
      : currentBest;
  }, null);

  return {
    market: best.market,
    marketLabel: best.marketLabel,
    difference: best.comparison.difference,
    absoluteDifference: best.comparison.absoluteDifference,
    differencePercent: best.comparison.differencePercent,
    reason: 'Naver 기준가와 가격 차이가 가장 작은 KIS 시장입니다.'
  };
}

function normalizeComparisonSymbol(value) {
  const symbol = String(value || '').trim().toUpperCase();

  if (!symbol) {
    throw new Error('조회할 종목 코드가 필요합니다.');
  }

  toNaverSymbol(symbol);
  return symbol;
}

function normalizeMarketAlias(value) {
  const market = String(value || '').trim().toUpperCase();

  if (!market || ['ALL', '*', '전체'].includes(market)) {
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

function sanitizeQuote(quote) {
  if (!quote) {
    return null;
  }

  return {
    symbol: quote.symbol || '',
    name: quote.name || '',
    price: quote.price,
    currency: quote.currency || '',
    exchange: quote.exchange || '',
    marketState: quote.marketState || '',
    provider: quote.provider || '',
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
    provider: attempt.provider || '',
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
