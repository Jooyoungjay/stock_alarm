const yahooQuoteUrl = 'https://query1.finance.yahoo.com/v7/finance/quote';

export async function fetchQuote(symbol, options = {}) {
  const timeoutMs = options.timeoutMs || 10000;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const url = new URL(yahooQuoteUrl);
  url.searchParams.set('symbols', symbol);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        accept: 'application/json',
        'user-agent': 'stock-alarm-mvp/0.1'
      }
    });

    if (!response.ok) {
      throw new Error(`가격 조회 실패: HTTP ${response.status}`);
    }

    const payload = await response.json();
    const result = payload?.quoteResponse?.result?.[0];

    if (!result || result.regularMarketPrice === undefined || result.regularMarketPrice === null) {
      throw new Error(`가격 정보를 찾을 수 없습니다: ${symbol}`);
    }

    return {
      symbol: result.symbol || symbol,
      name: result.shortName || result.longName || '',
      price: Number(result.regularMarketPrice),
      currency: result.currency || '',
      exchange: result.fullExchangeName || result.exchange || '',
      marketState: result.marketState || '',
      regularMarketTime: result.regularMarketTime
        ? new Date(result.regularMarketTime * 1000).toISOString()
        : null
    };
  } finally {
    clearTimeout(timeout);
  }
}
