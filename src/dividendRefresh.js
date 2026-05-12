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
      results.push({
        stockId: stock.id,
        symbol: stock.symbol,
        status: 'skipped',
        reason: 'inactive'
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
        displayName: stock.displayName || '',
        now
      });
      const nextValue = normalizePositiveNumber(info.annualDividendPerShare);

      if (nextValue === null) {
        throw new Error('배당 정보에 주당 연 배당금이 없습니다.');
      }

      const previousValue = normalizePositiveNumber(stock.annualDividendPerShare);
      const changed = previousValue === null || Math.abs(previousValue - nextValue) > 0.000001;
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
        sourceSymbol: info.sourceSymbol || ''
      });
    } catch (error) {
      const message = error.message || '배당 정보 조회 중 오류가 발생했습니다.';

      await store.replaceStock({
        ...stock,
        dividendLastCheckedAt: checkedAt,
        dividendLastError: message,
        dividendLastErrorAt: checkedAt,
        updatedAt: checkedAt
      });
      results.push({
        stockId: stock.id,
        symbol: stock.symbol,
        status: 'error',
        error: message
      });
    }
  }

  return {
    checkedAt,
    results
  };
}

function normalizePositiveNumber(value) {
  const number = Number(value);

  return Number.isFinite(number) && number > 0 ? number : null;
}

function getDividendCompanyName(stock) {
  const displayName = String(stock.displayName || '').trim();

  if (displayName) {
    return displayName;
  }

  const catalogItem = symbolCatalog.find((item) => item.symbol === stock.symbol);

  return catalogItem?.name || stock.symbol;
}
