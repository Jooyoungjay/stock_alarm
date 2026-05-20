import { buildKisNaverQuoteComparison } from './kisNaverCompare.js';
import { isKoreanStockSymbol } from './priceProvider.js';
import {
  buildKisNaverCompareTrendSnapshot,
  buildKisNaverTrendRecommendation
} from './storage.js';
import { normalizeSymbolInput } from './symbols.js';

export const lastKisNaverAutoCompareMetaKey = 'lastKisNaverAutoCompare';

const defaultCandidateLimit = 5;
const defaultMarkets = 'all';
const defaultDriftThresholdPercent = 1;

export function normalizeKisNaverAutoCompareSymbol(value) {
  const normalized = normalizeSymbolInput(value) || String(value || '').trim().toUpperCase();
  return normalized.replace(/\.(KS|KQ)$/i, '');
}

export function buildKisNaverAutoCompareCandidates(stocks = [], options = {}) {
  const limit = normalizePositiveInteger(options.limit, defaultCandidateLimit, { min: 1 });
  const candidates = [];
  const seen = new Set();

  for (const stock of Array.isArray(stocks) ? stocks : []) {
    const symbol = normalizeKisNaverAutoCompareSymbol(stock?.symbol);

    if (!symbol || stock?.active === false || !isKoreanStockSymbol(symbol) || seen.has(symbol)) {
      continue;
    }

    seen.add(symbol);
    candidates.push({
      stockId: String(stock?.id || ''),
      symbol,
      displayName: String(stock?.displayName || stock?.name || stock?.symbol || symbol).trim(),
      kisMarketDivCode: String(stock?.kisMarketDivCode || '').trim().toUpperCase()
    });

    if (candidates.length >= limit) {
      break;
    }
  }

  return candidates;
}

export async function runKisNaverAutoCompare(store, config = {}, options = {}) {
  const now = toDate(options.now);
  const checkedAt = now.toISOString();
  const forced = Boolean(options.force);
  const enabled = Boolean(config.kisNaverAutoCompareEnabled);

  if (!enabled && !forced) {
    return persistLastKisNaverAutoCompare(store, {
      checkedAt,
      enabled,
      forced,
      skipped: true,
      reason: 'kis_naver_auto_compare_disabled',
      summary: createAutoCompareSummary([]),
      candidates: [],
      results: []
    });
  }

  const stocks = await store.listStocks();
  const candidates = buildKisNaverAutoCompareCandidates(stocks, {
    limit: options.limit ?? config.kisNaverAutoCompareLimit
  });

  if (!candidates.length) {
    return persistLastKisNaverAutoCompare(store, {
      checkedAt,
      enabled,
      forced,
      skipped: true,
      reason: 'no_active_korean_stocks',
      summary: createAutoCompareSummary([]),
      candidates: [],
      results: []
    });
  }

  const compare = options.compare || ((body) => buildKisNaverQuoteComparison(buildCompareOptions(body, config)));
  const results = [];

  for (const candidate of candidates) {
    results.push(
      await compareCandidate(store, compare, candidate, {
        checkedAt,
        market: options.market || config.kisNaverAutoCompareMarkets || defaultMarkets,
        driftThresholdPercent:
          options.driftThresholdPercent ??
          config.kisNaverAutoCompareDriftThresholdPercent ??
          defaultDriftThresholdPercent
      })
    );
  }

  const kisNaverCompareHistory =
    typeof store.getKisNaverCompareHistory === 'function'
      ? await store.getKisNaverCompareHistory(12)
      : [];
  const kisNaverCompareTrend = buildKisNaverCompareTrendSnapshot(kisNaverCompareHistory);
  const kisNaverTrendRecommendation =
    kisNaverCompareTrend.recommendation || buildKisNaverTrendRecommendation(kisNaverCompareTrend);
  const result = {
    checkedAt,
    enabled,
    forced,
    skipped: false,
    reason: '',
    summary: createAutoCompareSummary(results),
    candidates,
    results,
    kisNaverCompareHistory,
    kisNaverCompareTrend,
    kisNaverTrendRecommendation
  };

  await persistLastKisNaverAutoCompare(store, result);
  return result;
}

async function compareCandidate(store, compare, candidate, context) {
  try {
    const comparison = await compare({
      symbol: candidate.symbol,
      market: context.market,
      driftThresholdPercent: context.driftThresholdPercent
    });

    if (typeof store.recordKisNaverCompareHistory === 'function') {
      await store.recordKisNaverCompareHistory(comparison, { returnLimit: 12 });
    }

    return {
      stockId: candidate.stockId,
      symbol: candidate.symbol,
      displayName: candidate.displayName,
      status: comparison.ok ? 'checked' : 'failed',
      ok: Boolean(comparison.ok),
      generatedAt: comparison.generatedAt || context.checkedAt,
      summary: comparison.summary || {},
      drift: comparison.drift || {},
      recommendation: comparison.recommendation || null,
      message: comparison.message || '',
      error: comparison.ok ? '' : comparison.message || 'KIS/Naver 가격 비교 실패'
    };
  } catch (error) {
    return {
      stockId: candidate.stockId,
      symbol: candidate.symbol,
      displayName: candidate.displayName,
      status: 'error',
      ok: false,
      generatedAt: context.checkedAt,
      summary: {},
      drift: {},
      recommendation: null,
      message: '',
      error: error.message
    };
  }
}

function buildCompareOptions(body, config) {
  return {
    symbol: body.symbol,
    market: body.market || defaultMarkets,
    driftThresholdPercent: body.driftThresholdPercent,
    timeoutMs: config.quoteTimeoutMs,
    dataGoKrServiceKey: config.dataGoKrServiceKey,
    alphaVantageApiKey: config.alphaVantageApiKey,
    kisApiBaseUrl: config.kisApiBaseUrl,
    kisAppKey: config.kisAppKey,
    kisAppSecret: config.kisAppSecret,
    kisAccessToken: config.kisAccessToken,
    kisMarketDivCode: config.kisMarketDivCode,
    kisCustType: config.kisCustType,
    kisTokenAutoRefresh: config.kisTokenAutoRefresh,
    kisTokenCachePath: config.kisTokenCachePath
  };
}

function createAutoCompareSummary(results) {
  const items = Array.isArray(results) ? results : [];

  return {
    checked: items.length,
    success: items.filter((item) => item.status === 'checked').length,
    failed: items.filter((item) => item.status === 'failed').length,
    error: items.filter((item) => item.status === 'error').length,
    skipped: items.filter((item) => item.status === 'skipped').length
  };
}

async function persistLastKisNaverAutoCompare(store, result) {
  const snapshot = toLastAutoCompareSnapshot(result);

  if (typeof store.setMetaValue === 'function') {
    await store.setMetaValue(lastKisNaverAutoCompareMetaKey, snapshot);
  }

  return {
    ...result,
    lastKisNaverAutoCompare: snapshot
  };
}

function toLastAutoCompareSnapshot(result) {
  return {
    checkedAt: result.checkedAt,
    enabled: Boolean(result.enabled),
    forced: Boolean(result.forced),
    skipped: Boolean(result.skipped),
    reason: String(result.reason || ''),
    summary: result.summary || createAutoCompareSummary([]),
    candidates: Array.isArray(result.candidates) ? result.candidates : [],
    results: Array.isArray(result.results) ? result.results : []
  };
}

function normalizePositiveInteger(value, fallback, options = {}) {
  const parsed = Number(value);
  const min = options.min ?? 1;
  const max = options.max ?? Number.POSITIVE_INFINITY;

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, Math.floor(parsed)));
}

function toDate(value) {
  const date = value instanceof Date ? value : new Date(value || Date.now());
  return Number.isFinite(date.getTime()) ? date : new Date();
}
