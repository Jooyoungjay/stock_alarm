export function formatCurrency(value, currency = 'KRW') {
  const amount = Number(value);

  if (!Number.isFinite(amount)) {
    return '-';
  }

  return new Intl.NumberFormat('ko-KR', {
    style: 'currency',
    currency,
    maximumFractionDigits: currency === 'KRW' ? 0 : 2
  }).format(amount);
}

export function formatPercent(value) {
  const percent = Number(value);

  if (!Number.isFinite(percent)) {
    return '-';
  }

  return `${percent.toFixed(2)}%`;
}

export function formatSignedPercent(value) {
  const percent = Number(value);

  if (!Number.isFinite(percent)) {
    return '-';
  }

  return `${percent > 0 ? '+' : ''}${percent.toFixed(2)}%`;
}

export function formatDateOnly(value) {
  if (!value) {
    return '-';
  }

  const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);

  if (match) {
    return `${match[1]}.${match[2]}.${match[3]}`;
  }

  return formatDateTime(value);
}

export function formatDateTime(value) {
  if (!value) {
    return '-';
  }

  const date = new Date(value);

  if (!Number.isFinite(date.getTime())) {
    return '-';
  }

  return date.toLocaleString('ko-KR');
}

export function formatCurrencyTotals(totals = []) {
  const items = (Array.isArray(totals) ? totals : [])
    .map((item) => ({
      amount: Number(item?.amount),
      currency: item?.currency || 'KRW'
    }))
    .filter((item) => Number.isFinite(item.amount));

  if (!items.length) {
    return '-';
  }

  return items.map((item) => formatCurrency(item.amount, item.currency)).join(' · ');
}

export function summarizeDividendCalendar(calendar = {}) {
  const summary = calendar?.summary || {};
  const months = Array.isArray(calendar?.months) ? calendar.months : [];

  return {
    monthsAhead: Number(summary.monthsAhead || months.length || 0),
    stocksWithDividends: Number(summary.stocksWithDividends || 0),
    eventCount: Number(summary.eventCount || 0),
    paymentEventCount: Number(summary.paymentEventCount || 0),
    exDividendEventCount: Number(summary.exDividendEventCount || 0),
    confirmedEventCount: Number(summary.confirmedEventCount || 0),
    estimatedEventCount: Number(summary.estimatedEventCount || 0),
    pendingScheduleCount: Number(summary.pendingScheduleCount || 0),
    annualDividendText: formatCurrencyTotals(summary.annualDividendTotals)
  };
}

export function summarizePortfolio(stocks = []) {
  const activeStocks = stocks.filter((stock) => stock.active !== false);
  const triggeredStocks = activeStocks.filter((stock) => stock.alertState === 'triggered');
  const warningStocks = activeStocks.filter((stock) => {
    const drawdown = Math.abs(Number(stock.drawdownPercent || 0));
    const threshold = Math.abs(Number(stock.thresholdPercent || 0));
    return threshold > 0 && drawdown >= threshold * 0.8 && stock.alertState !== 'triggered';
  });

  return {
    total: stocks.length,
    active: activeStocks.length,
    triggered: triggeredStocks.length,
    warning: warningStocks.length
  };
}
