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
