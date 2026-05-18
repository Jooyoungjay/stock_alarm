import { fetchDividendInfo } from './dividendProvider.js';
import { symbolCatalog } from './symbols.js';

export async function runDividendRefresh(store, config, options = {}) {
  const dividendFetcher = options.fetchDividendInfo || fetchDividendInfo;
  const now = options.now || new Date();
  const checkedAt = now.toISOString();
  const stocks = await store.listStocks();
  const results = [];

  for (const stock of stocks) {
    results.push(await refreshDividendForStock(store, config, stock, { dividendFetcher, now, checkedAt }));
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

export async function runSingleDividendRefresh(store, config, stockId, options = {}) {
  const dividendFetcher = options.fetchDividendInfo || fetchDividendInfo;
  const now = options.now || new Date();
  const checkedAt = now.toISOString();
  const stocks = await store.listStocks();
  const stock = stocks.find((item) => item.id === stockId);

  if (!stock) {
    throw new Error('종목을 찾을 수 없습니다.');
  }

  const result = await refreshDividendForStock(store, config, stock, { dividendFetcher, now, checkedAt });

  return {
    checkedAt,
    retry: true,
    summary: summarizeDividendResults([result]),
    results: [result]
  };
}

async function refreshDividendForStock(store, config, stock, context) {
  const { dividendFetcher, now, checkedAt } = context;

  if (!stock.active) {
    const diagnostic = createDividendDiagnostic({
      checkedAt,
      status: 'skipped',
      reason: 'inactive',
      stock
    });

    return {
      stockId: stock.id,
      symbol: stock.symbol,
      status: 'skipped',
      reason: 'inactive',
      diagnostic
    };
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
    const previousLastDividendValue = normalizePositiveNumber(stock.lastDividendValue);
    const nextLastDividendValue = normalizePositiveNumber(info.lastDividendValue);
    const nextExDividendDate = info.exDividendDate || '';
    const nextDividendDate = info.dividendDate || '';
    const change = getDividendChange(stock, {
      annualDividendPerShare: nextValue,
      lastDividendValue: nextLastDividendValue,
      exDividendDate: nextExDividendDate,
      dividendDate: nextDividendDate
    });
    const changed = change.changed;
    const diagnostic = createDividendDiagnostic({
      checkedAt,
      status: changed ? 'updated' : 'checked',
      stock,
      annualDividendPerShare: nextValue,
      previousAnnualDividendPerShare: previousValue,
      lastDividendValue: nextLastDividendValue,
      previousLastDividendValue,
      exDividendDate: nextExDividendDate,
      previousExDividendDate: stock.exDividendDate || '',
      dividendDate: nextDividendDate,
      previousDividendDate: stock.dividendDate || '',
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
      lastDividendValue: nextLastDividendValue,
      exDividendDate: nextExDividendDate,
      dividendDate: nextDividendDate,
      dividendUpdatedAt: changed ? checkedAt : stock.dividendUpdatedAt || checkedAt,
      dividendLastCheckedAt: checkedAt,
      dividendLastError: '',
      dividendLastErrorAt: null,
      dividendLastDiagnostic: diagnostic,
      dividendHistory: changed
        ? appendDividendHistory(stock.dividendHistory, {
            checkedAt,
            reason: change.reason,
            provider: info.provider || '',
            sourceSymbol: info.sourceSymbol || info.symbol || stock.symbol,
            currency: info.currency || stock.dividendCurrency || stock.currency || '',
            previousAnnualDividendPerShare: previousValue,
            annualDividendPerShare: nextValue,
            previousLastDividendValue,
            lastDividendValue: nextLastDividendValue,
            previousExDividendDate: stock.exDividendDate || '',
            exDividendDate: nextExDividendDate,
            previousDividendDate: stock.dividendDate || '',
            dividendDate: nextDividendDate
          })
        : stock.dividendHistory || [],
      updatedAt: checkedAt
    };

    await store.replaceStock(updatedStock);

    return {
      stockId: stock.id,
      symbol: stock.symbol,
      status: changed ? 'updated' : 'checked',
      annualDividendPerShare: nextValue,
      previousAnnualDividendPerShare: previousValue,
      provider: info.provider || '',
      sourceSymbol: info.sourceSymbol || '',
      lastDividendValue: nextLastDividendValue,
      exDividendDate: nextExDividendDate,
      dividendDate: nextDividendDate,
      attempts: diagnostic.attempts,
      diagnostic
    };
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

    return {
      stockId: stock.id,
      symbol: stock.symbol,
      status: 'error',
      error: message,
      attempts: diagnostic.attempts,
      diagnostic
    };
  }
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
    lastDividendValue: normalizePositiveNumber(input.lastDividendValue),
    previousLastDividendValue: normalizePositiveNumber(input.previousLastDividendValue),
    exDividendDate: input.exDividendDate || '',
    previousExDividendDate: input.previousExDividendDate || '',
    dividendDate: input.dividendDate || '',
    previousDividendDate: input.previousDividendDate || '',
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
    exDividendDate: attempt.exDividendDate || '',
    dividendDate: attempt.dividendDate || '',
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

function getDividendChange(stock, next) {
  const reasons = [];

  if (hasNumberChanged(stock.annualDividendPerShare, next.annualDividendPerShare)) {
    reasons.push('amount');
  }

  if (hasNumberChanged(stock.lastDividendValue, next.lastDividendValue)) {
    reasons.push('lastDividend');
  }

  if (hasTextChanged(stock.exDividendDate, next.exDividendDate)) {
    reasons.push('exDate');
  }

  if (hasTextChanged(stock.dividendDate, next.dividendDate)) {
    reasons.push('payDate');
  }

  return {
    changed: reasons.length > 0,
    reason: reasons.join(',')
  };
}

function hasNumberChanged(left, right) {
  const leftValue = normalizePositiveNumber(left);
  const rightValue = normalizePositiveNumber(right);

  if (leftValue === null && rightValue === null) {
    return false;
  }

  if (leftValue === null || rightValue === null) {
    return true;
  }

  return Math.abs(leftValue - rightValue) > 0.000001;
}

function hasTextChanged(left, right) {
  return String(left || '') !== String(right || '');
}

function appendDividendHistory(history, entry) {
  return [normalizeDividendHistoryEntry(entry), ...normalizeDividendHistory(history)].slice(0, 20);
}

function normalizeDividendHistory(history) {
  return Array.isArray(history) ? history.map(normalizeDividendHistoryEntry).filter(Boolean) : [];
}

function normalizeDividendHistoryEntry(entry) {
  if (!entry || typeof entry !== 'object') {
    return null;
  }

  return {
    checkedAt: entry.checkedAt || '',
    reason: String(entry.reason || ''),
    provider: String(entry.provider || ''),
    sourceSymbol: String(entry.sourceSymbol || ''),
    currency: String(entry.currency || ''),
    previousAnnualDividendPerShare: normalizePositiveNumber(entry.previousAnnualDividendPerShare),
    annualDividendPerShare: normalizePositiveNumber(entry.annualDividendPerShare),
    previousLastDividendValue: normalizePositiveNumber(entry.previousLastDividendValue),
    lastDividendValue: normalizePositiveNumber(entry.lastDividendValue),
    previousExDividendDate: entry.previousExDividendDate || '',
    exDividendDate: entry.exDividendDate || '',
    previousDividendDate: entry.previousDividendDate || '',
    dividendDate: entry.dividendDate || ''
  };
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
  const match = String(symbol || '').trim().match(/^(\d{5}[0-9A-Z])(?:\.(KS|KQ))?$/i);
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
