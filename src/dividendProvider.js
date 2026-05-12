import { isKoreanStockSymbol } from './priceProvider.js';

const yahooQuoteSummaryUrl = 'https://query1.finance.yahoo.com/v10/finance/quoteSummary';
const defaultProviders = ['yahoo'];

export async function fetchDividendInfo(symbol, options = {}) {
  const providers = normalizeDividendProviders(options.providers);
  const errors = [];

  for (const provider of providers) {
    try {
      if (provider === 'yahoo') {
        return await fetchYahooDividendInfo(symbol, options);
      }
    } catch (error) {
      errors.push(`${provider}: ${error.message}`);
    }
  }

  if (!errors.length) {
    throw new Error('배당 정보 조회 실패: 사용할 수 있는 배당 provider가 없습니다.');
  }

  throw new Error(`배당 정보 조회 실패: ${errors.join(' | ')}`);
}

export function normalizeDividendProviders(value) {
  if (!value) {
    return defaultProviders;
  }

  const providers = Array.isArray(value) ? value : String(value).split(',');
  const normalized = providers
    .map((provider) => provider.trim().toLowerCase())
    .filter(Boolean);

  return normalized.length ? normalized : defaultProviders;
}

export function parseYahooDividendSummary(payload, requestedSymbol, sourceSymbol = requestedSymbol) {
  if (payload?.quoteSummary?.error) {
    throw new Error(payload.quoteSummary.error.description || 'Yahoo 배당 조회 오류');
  }

  const result = payload?.quoteSummary?.result?.[0];

  if (!result) {
    throw new Error(`배당 정보를 찾을 수 없습니다: ${requestedSymbol}`);
  }

  const summary = result.summaryDetail || {};
  const price = result.price || {};
  const annualDividendPerShare = pickFirstPositiveNumber(
    summary.dividendRate?.raw,
    summary.trailingAnnualDividendRate?.raw,
    inferAnnualDividendFromYield(summary.dividendYield?.raw, price.regularMarketPrice?.raw)
  );

  if (annualDividendPerShare === null) {
    throw new Error(`배당 정보를 찾을 수 없습니다: ${requestedSymbol}`);
  }

  return {
    symbol: requestedSymbol,
    sourceSymbol,
    annualDividendPerShare,
    dividendYieldPercent: normalizeYieldPercent(summary.dividendYield?.raw),
    lastDividendValue: normalizePositiveNumber(summary.lastDividendValue?.raw),
    exDividendDate: parseUnixDate(summary.exDividendDate?.raw),
    dividendDate: parseUnixDate(result.calendarEvents?.dividendDate?.raw),
    currency: price.currency || price.financialCurrency || '',
    provider: 'yahoo'
  };
}

export function toYahooDividendSymbol(symbol) {
  const normalized = String(symbol || '').trim().toUpperCase();

  if (!normalized) {
    throw new Error('종목 코드가 비어 있습니다.');
  }

  if (/^\d{6}$/.test(normalized)) {
    return `${normalized}.KS`;
  }

  if (isKoreanStockSymbol(normalized)) {
    return normalized;
  }

  return normalized;
}

async function fetchYahooDividendInfo(symbol, options = {}) {
  const sourceSymbols = getYahooDividendSymbols(symbol);
  const errors = [];

  for (const sourceSymbol of sourceSymbols) {
    try {
      const url = new URL(`${yahooQuoteSummaryUrl}/${encodeURIComponent(sourceSymbol)}`);
      url.searchParams.set('modules', 'summaryDetail,calendarEvents,price');
      const payload = await fetchJson(url, options);

      return parseYahooDividendSummary(payload, symbol, sourceSymbol);
    } catch (error) {
      errors.push(`${sourceSymbol}: ${error.message}`);
    }
  }

  throw new Error(errors.join(' | '));
}

function getYahooDividendSymbols(symbol) {
  const normalized = String(symbol || '').trim().toUpperCase();

  if (/^\d{6}$/.test(normalized)) {
    return [`${normalized}.KS`, `${normalized}.KQ`];
  }

  return [toYahooDividendSymbol(normalized)];
}

function inferAnnualDividendFromYield(dividendYield, marketPrice) {
  const yieldNumber = normalizePositiveNumber(dividendYield);
  const price = normalizePositiveNumber(marketPrice);

  if (yieldNumber === null || price === null) {
    return null;
  }

  const normalizedYield = yieldNumber > 1 ? yieldNumber / 100 : yieldNumber;
  return normalizedYield * price;
}

function normalizeYieldPercent(value) {
  const number = normalizePositiveNumber(value);

  if (number === null) {
    return null;
  }

  return number > 1 ? number : number * 100;
}

function pickFirstPositiveNumber(...values) {
  for (const value of values) {
    const number = normalizePositiveNumber(value);

    if (number !== null) {
      return number;
    }
  }

  return null;
}

function normalizePositiveNumber(value) {
  const number = Number(value);

  return Number.isFinite(number) && number > 0 ? number : null;
}

function parseUnixDate(value) {
  const timestamp = Number(value);

  if (!Number.isFinite(timestamp) || timestamp <= 0) {
    return '';
  }

  return new Date(timestamp * 1000).toISOString();
}

async function fetchJson(url, options = {}) {
  const response = await fetchWithTimeout(url, options);

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  return response.json();
}

async function fetchWithTimeout(url, options = {}) {
  const timeoutMs = Number(options.timeoutMs || 10000);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      headers: {
        accept: 'application/json'
      },
      signal: controller.signal
    });
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error('요청 시간이 초과되었습니다.');
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
