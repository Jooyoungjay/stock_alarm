const epsilon = 0.000001;

export function calculateDividendGrowth(stock = {}) {
  const history = Array.isArray(stock.dividendHistory) ? stock.dividendHistory : [];
  const entry = findLatestDividendGrowthEntry(history);

  if (!entry) {
    return createEmptyDividendGrowth(stock, history.length);
  }

  return calculateDividendGrowthFromEntry(entry, stock, { preferStockValue: true });
}

export function calculateDividendGrowthFromEntry(entry, stock = {}, options = {}) {
  const history = Array.isArray(stock.dividendHistory) ? stock.dividendHistory : [];
  const previousAnnualDividendPerShare = normalizePreviousDividend(entry?.previousAnnualDividendPerShare);
  const annualDividendPerShare = resolveCurrentAnnualDividend(entry, stock, options);

  if (previousAnnualDividendPerShare === null || annualDividendPerShare === null) {
    return createEmptyDividendGrowth(stock, history.length);
  }

  const changeAmount = annualDividendPerShare - previousAnnualDividendPerShare;

  if (Math.abs(changeAmount) < epsilon) {
    return createEmptyDividendGrowth(stock, history.length);
  }

  return {
    available: true,
    status: getDividendGrowthStatus(changeAmount),
    previousAnnualDividendPerShare,
    annualDividendPerShare,
    changeAmount,
    changePercent: (changeAmount / previousAnnualDividendPerShare) * 100,
    checkedAt: entry.checkedAt || stock.dividendUpdatedAt || stock.dividendLastCheckedAt || null,
    provider: entry.provider || stock.dividendProvider || stock.dividendDataSource || '',
    reason: entry.reason || '',
    currency: entry.currency || stock.dividendCurrency || stock.currency || '',
    historyCount: history.length
  };
}

export function calculatePortfolioDividendGrowth(stocks = []) {
  const groups = new Map();

  for (const stock of Array.isArray(stocks) ? stocks : []) {
    const quantity = normalizePositiveNumber(stock?.quantity);
    const growth = calculateDividendGrowth(stock);

    if (quantity === null || !growth.available) {
      continue;
    }

    const currency = growth.currency || stock.currency || '';
    const key = currency || 'default';
    const group = groups.get(key) || {
      currency,
      stockCount: 0,
      previousAnnualDividend: 0,
      expectedAnnualDividend: 0
    };

    group.stockCount += 1;
    group.previousAnnualDividend += quantity * growth.previousAnnualDividendPerShare;
    group.expectedAnnualDividend += quantity * growth.annualDividendPerShare;
    groups.set(key, group);
  }

  return [...groups.values()]
    .map((group) => {
      const dividendGrowthAmount = group.expectedAnnualDividend - group.previousAnnualDividend;
      return {
        ...group,
        dividendGrowthAmount,
        dividendGrowthPercent:
          group.previousAnnualDividend > 0
            ? (dividendGrowthAmount / group.previousAnnualDividend) * 100
            : null,
        status: getDividendGrowthStatus(dividendGrowthAmount)
      };
    })
    .sort((left, right) => String(left.currency).localeCompare(String(right.currency), 'ko-KR'));
}

export function findLatestDividendGrowthEntry(history = []) {
  return (Array.isArray(history) ? history : []).find(hasAnnualDividendAmountChange) || null;
}

function hasAnnualDividendAmountChange(entry) {
  const previousAnnualDividendPerShare = normalizePreviousDividend(entry?.previousAnnualDividendPerShare);
  const annualDividendPerShare = normalizeCurrentDividend(entry?.annualDividendPerShare);

  return (
    previousAnnualDividendPerShare !== null &&
    annualDividendPerShare !== null &&
    Math.abs(annualDividendPerShare - previousAnnualDividendPerShare) >= epsilon
  );
}

function resolveCurrentAnnualDividend(entry, stock, options) {
  if (options.preferStockValue) {
    const stockValue = normalizeCurrentDividend(stock?.annualDividendPerShare);

    if (stockValue !== null) {
      return stockValue;
    }
  }

  return normalizeCurrentDividend(entry?.annualDividendPerShare);
}

function normalizePreviousDividend(value) {
  const number = normalizeNonNegativeNumber(value);
  return number !== null && number > 0 ? number : null;
}

function normalizeCurrentDividend(value) {
  if (value === undefined) {
    return null;
  }

  if (value === null || value === '') {
    return 0;
  }

  return normalizeNonNegativeNumber(value);
}

function normalizePositiveNumber(value) {
  const number = normalizeNonNegativeNumber(value);
  return number !== null && number > 0 ? number : null;
}

function normalizeNonNegativeNumber(value) {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function createEmptyDividendGrowth(stock = {}, historyCount = 0) {
  return {
    available: false,
    status: 'unknown',
    previousAnnualDividendPerShare: null,
    annualDividendPerShare: normalizeCurrentDividend(stock.annualDividendPerShare),
    changeAmount: null,
    changePercent: null,
    checkedAt: null,
    provider: '',
    reason: '',
    currency: stock.dividendCurrency || stock.currency || '',
    historyCount
  };
}

function getDividendGrowthStatus(changeAmount) {
  if (changeAmount > 0) {
    return 'increase';
  }

  if (changeAmount < 0) {
    return 'decrease';
  }

  return 'unchanged';
}
