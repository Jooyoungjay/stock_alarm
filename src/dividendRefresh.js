import { fetchDividendInfo } from './dividendProvider.js';
import { symbolCatalog } from './symbols.js';

export async function runDividendRefresh(store, config, options = {}) {
  const dividendFetcher = options.fetchDividendInfo || fetchDividendInfo;
  const now = options.now || new Date();
  const checkedAt = now.toISOString();
  const stocks = await store.listStocks();
  const results = [];

  for (const stock of stocks) {
    if (!stock.active) {
      const diagnostic = createDividendDiagnostic({
        checkedAt,
        status: 'skipped',
        reason: 'inactive',
        stock
      });
      results.push({
        stockId: stock.id,
        symbol: stock.symbol,
        status: 'skipped',
        reason: 'inactive',
        diagnostic
      });
      continue;
    }

    try {
      const info = await dividendFetcher(stock.symbol, {
        timeoutMs: config.quoteTimeoutMs,
        providers: config.dividendProviders,
        dataGoKrServiceKey: config.dataGoKrServiceKey,
        openDartApiKey: config.openDartApiKey,
        alphaVantageApiKey: config.alphaVantageApiKey,
        companyName: getDividendCompanyName(stock),
        companyNameCandidates: getDividendCompanyNameCandidates(stock),
        displayName: stock.displayName || '',
        now
      });
      const nextValue = normalizePositiveNumber(info.annualDividendPerShare);

      if (nextValue === null) {
        const error = new Error('배당 정보에 주당 연 배당금이 없습니다.');
        error.attempts = info.attempts;
        throw error;
      }

      const previousValue = normalizePositiveNumber(stock.annualDividendPerShare);
      const changed = previousValue === null || Math.abs(previousValue - nextValue) > 0.000001;
      const diagnostic = createDividendDiagnostic({
        checkedAt,
        status: changed ? 'updated' : 'checked',
        stock,
        annualDividendPerShare: nextValue,
        previousAnnualDividendPerShare: previousValue,
        provider: info.provider || '',
        sourceSymbol: info.sourceSymbol || info.symbol || stock.symbol,
        currency: info.currency || stock.dividendCurrency || stock.currency || '',
        attempts: info.attempts
      });
      const updatedStock = {
        ...stock,
        annualDividendPerShare: nextValue,
        dividendDataSource: info.provider || 'api',
        dividendProvider: info.provider || '',
        dividendSourceSymbol: info.sourceSymbol || info.symbol || stock.symbol,
        dividendCurrency: info.currency || stock.dividendCurrency || stock.currency || '',
        dividendYieldPercent: normalizePositiveNumber(info.dividendYieldPercent),
        lastDividendValue: normalizePositiveNumber(info.lastDividendValue),
        exDividendDate: info.exDividendDate || '',
        dividendDate: info.dividendDate || '',
        dividendUpdatedAt: changed ? checkedAt : stock.dividendUpdatedAt || checkedAt,
        dividendLastCheckedAt: checkedAt,
        dividendLastError: '',
        dividendLastErrorAt: null,
        dividendLastDiagnostic: diagnostic,
        updatedAt: checkedAt
      };

      await store.replaceStock(updatedStock);
      results.push({
        stockId: stock.id,
        symbol: stock.symbol,
        status: changed ? 'updated' : 'checked',
        annualDividendPerShare: nextValue,
        previousAnnualDividendPerShare: previousValue,
        provider: info.provider || '',
        sourceSymbol: info.sourceSymbol || '',
        attempts: diagnostic.attempts,
        diagnostic
      });
    } catch (error) {
      const message = error.message || '배당 정보 조회 중 오류가 발생했습니다.';
      const diagnostic = createDividendDiagnostic({
        checkedAt,
        status: 'error',
        stock,
        error: message,
        attempts: error.attempts
      });

      await store.replaceStock({
        ...stock,
        dividendLastCheckedAt: checkedAt,
        dividendLastError: message,
        dividendLastErrorAt: checkedAt,
        dividendLastDiagnostic: diagnostic,
        updatedAt: checkedAt
      });
      results.push({
        stockId: stock.id,
        symbol: stock.symbol,
        status: 'error',
        error: message,
        attempts: diagnostic.attempts,
        diagnostic
      });
    }
  }

  const summary = summarizeDividendResults(results);
  const refreshResult = {
    checkedAt,
    summary,
    results
  };

  if (typeof store.setMetaValue === 'function') {
    await store.setMetaValue('lastDividendRefresh', refreshResult);
  }

  return refreshResult;
}

function normalizePositiveNumber(value) {
  const number = Number(value);

  return Number.isFinite(number) && number > 0 ? number : null;
}

function createDividendDiagnostic(input) {
  const previousValue = normalizePositiveNumber(input.previousAnnualDividendPerShare);
  const currentValue = normalizePositiveNumber(input.annualDividendPerShare);
  const preservedValue = normalizePositiveNumber(input.stock?.annualDividendPerShare);

  return {
    checkedAt: input.checkedAt,
    status: input.status,
    reason: input.reason || '',
    error: input.error || '',
    provider: input.provider || '',
    sourceSymbol: input.sourceSymbol || '',
    currency: input.currency || input.stock?.dividendCurrency || input.stock?.currency || '',
    annualDividendPerShare: currentValue,
    previousAnnualDividendPerShare: previousValue,
    preservedAnnualDividendPerShare: input.status === 'error' ? preservedValue : null,
    attempts: normalizeDividendAttempts(input.attempts)
  };
}

function normalizeDividendAttempts(attempts) {
  if (!Array.isArray(attempts)) {
    return [];
  }

  return attempts.map((attempt) => ({
    provider: String(attempt.provider || '').trim(),
    status: attempt.status === 'success' ? 'success' : 'error',
    startedAt: attempt.startedAt || '',
    finishedAt: attempt.finishedAt || '',
    sourceSymbol: attempt.sourceSymbol || '',
    annualDividendPerShare: normalizePositiveNumber(attempt.annualDividendPerShare),
    dividendYieldPercent: normalizePositiveNumber(attempt.dividendYieldPercent),
    lastDividendValue: normalizePositiveNumber(attempt.lastDividendValue),
    currency: attempt.currency || '',
    error: attempt.error || ''
  }));
}

function summarizeDividendResults(results) {
  return results.reduce(
    (summary, item) => {
      if (item.status === 'updated') {
        summary.updated += 1;
        summary.checked += 1;
      } else if (item.status === 'checked') {
        summary.checked += 1;
      } else if (item.status === 'error') {
        summary.error += 1;
        summary.checked += 1;
      } else if (item.status === 'skipped') {
        summary.skipped += 1;
      }

      return summary;
    },
    {
      checked: 0,
      updated: 0,
      error: 0,
      skipped: 0
    }
  );
}

function getDividendCompanyName(stock) {
  return getDividendCompanyNameCandidates(stock)[0] || stock.symbol;
}

function getDividendCompanyNameCandidates(stock) {
  const plainSymbol = getPlainKoreanSymbol(stock.symbol);
  const catalogItem = symbolCatalog.find(
    (item) => item.symbol === stock.symbol || (plainSymbol && item.symbol === plainSymbol)
  );
  const candidates = [
    stock.displayName,
    catalogItem?.name,
    ...(catalogItem?.aliases || [])
  ];

  return uniqueNonEmpty(candidates);
}

function getPlainKoreanSymbol(symbol) {
  const match = String(symbol || '').trim().match(/^(\d{6})(?:\.(KS|KQ))?$/i);
  return match ? match[1] : '';
}

function uniqueNonEmpty(values) {
  const seen = new Set();
  const result = [];

  for (const value of values) {
    const text = String(value || '').trim();

    if (!text || seen.has(text)) {
      continue;
    }

    seen.add(text);
    result.push(text);
  }

  return result;
}
