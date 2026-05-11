const yahooQuoteUrl = 'https://query1.finance.yahoo.com/v7/finance/quote';
const stooqQuoteUrl = 'https://stooq.com/q/l/';
const naverRealtimeUrl = 'https://polling.finance.naver.com/api/realtime';
const alphaVantageUrl = 'https://www.alphavantage.co/query';

const defaultProviders = ['naver', 'stooq', 'alphavantage', 'yahoo'];

export async function fetchQuote(symbol, options = {}) {
  const providers = normalizeProviders(options.providers);
  const errors = [];

  for (const provider of providers) {
    if (shouldSkipProvider(provider, symbol, options, providers)) {
      continue;
    }

    try {
      if (provider === 'naver') {
        return await fetchNaverQuote(symbol, options);
      }

      if (provider === 'stooq') {
        return await fetchStooqQuote(symbol, options);
      }

      if (provider === 'alphavantage') {
        return await fetchAlphaVantageQuote(symbol, options);
      }

      if (provider === 'yahoo') {
        return await fetchYahooQuote(symbol, options);
      }
    } catch (error) {
      errors.push(`${provider}: ${error.message}`);
    }
  }

  if (!errors.length) {
    throw new Error('가격 조회 실패: 사용할 수 있는 시세 provider가 없습니다.');
  }

  throw new Error(`가격 조회 실패: ${errors.join(' | ')}`);
}

function shouldSkipProvider(provider, symbol, options, providers) {
  if (providers.length <= 1) {
    return false;
  }

  if (provider === 'naver' && !isKoreanStockSymbol(symbol)) {
    return true;
  }

  if (provider === 'stooq' && isKoreanStockSymbol(symbol)) {
    return true;
  }

  if (provider === 'alphavantage' && !options.alphaVantageApiKey) {
    return true;
  }

  return false;
}

export function normalizeProviders(value) {
  if (!value) {
    return defaultProviders;
  }

  const providers = Array.isArray(value) ? value : String(value).split(',');
  const normalized = providers
    .map((provider) => provider.trim().toLowerCase())
    .filter(Boolean);

  return normalized.length ? normalized : defaultProviders;
}

export function isKoreanStockSymbol(symbol) {
  return /^\d{6}(\.(KS|KQ))?$/i.test(String(symbol || '').trim());
}

export function toNaverSymbol(symbol) {
  const normalized = String(symbol || '').trim().toUpperCase();

  if (!isKoreanStockSymbol(normalized)) {
    throw new Error('한국 주식 코드가 아닙니다.');
  }

  return normalized.slice(0, 6);
}

export function toStooqSymbol(symbol) {
  const normalized = String(symbol || '').trim().toLowerCase();

  if (!normalized) {
    throw new Error('종목 코드가 비어 있습니다.');
  }

  if (isKoreanStockSymbol(normalized)) {
    throw new Error('Stooq는 현재 한국 주식 조회에 사용하지 않습니다.');
  }

  if (normalized.includes('.')) {
    return normalized;
  }

  return `${normalized}.us`;
}

export function parseStooqCsv(content, requestedSymbol) {
  const lines = String(content || '')
    .trim()
    .split(/\r?\n/)
    .filter(Boolean);

  if (lines.length < 2) {
    throw new Error('Stooq 응답이 비어 있습니다.');
  }

  const headers = parseCsvLine(lines[0]);
  const values = parseCsvLine(lines[1]);
  const row = Object.fromEntries(headers.map((header, index) => [header, values[index]]));
  const price = Number(row.Close);

  if (!Number.isFinite(price) || price <= 0 || row.Close === 'N/D') {
    throw new Error(`가격 정보를 찾을 수 없습니다: ${requestedSymbol}`);
  }

  const date = row.Date && row.Date !== 'N/D' ? row.Date : '';
  const time = row.Time && row.Time !== 'N/D' ? row.Time : '';

  return {
    symbol: requestedSymbol,
    name: row.Symbol || requestedSymbol,
    price,
    currency: '',
    exchange: 'Stooq',
    marketState: 'DELAYED',
    provider: 'stooq',
    regularMarketTime: date && time ? new Date(`${date}T${time}Z`).toISOString() : null
  };
}

export function parseNaverQuote(payload, requestedSymbol) {
  const data = payload?.result?.areas?.flatMap((area) => area.datas || [])?.[0];
  const price = Number(data?.nv);

  if (!data || !Number.isFinite(price) || price <= 0) {
    throw new Error(`가격 정보를 찾을 수 없습니다: ${requestedSymbol}`);
  }

  return {
    symbol: requestedSymbol,
    name: data.nm || requestedSymbol,
    price,
    currency: 'KRW',
    exchange: 'Naver Finance',
    marketState: data.ms || '',
    provider: 'naver',
    regularMarketTime: payload?.result?.time ? new Date(payload.result.time).toISOString() : null
  };
}

export function parseAlphaVantageQuote(payload, requestedSymbol) {
  if (payload?.['Error Message']) {
    throw new Error(payload['Error Message']);
  }

  if (payload?.Note || payload?.Information) {
    throw new Error(payload.Note || payload.Information);
  }

  const quote = payload?.['Global Quote'];
  const price = Number(quote?.['05. price']);

  if (!quote || !Number.isFinite(price) || price <= 0) {
    throw new Error(`가격 정보를 찾을 수 없습니다: ${requestedSymbol}`);
  }

  return {
    symbol: quote['01. symbol'] || requestedSymbol,
    name: quote['01. symbol'] || requestedSymbol,
    price,
    currency: '',
    exchange: 'Alpha Vantage',
    marketState: 'DELAYED',
    provider: 'alphavantage',
    regularMarketTime: quote['07. latest trading day']
      ? new Date(`${quote['07. latest trading day']}T00:00:00Z`).toISOString()
      : null
  };
}

async function fetchNaverQuote(symbol, options = {}) {
  const naverSymbol = toNaverSymbol(symbol);
  const url = new URL(naverRealtimeUrl);
  url.searchParams.set('query', `SERVICE_ITEM:${naverSymbol}`);
  const payload = await fetchJson(url, options);

  return parseNaverQuote(payload, symbol);
}

async function fetchStooqQuote(symbol, options = {}) {
  const stooqSymbol = toStooqSymbol(symbol);
  const url = new URL(stooqQuoteUrl);
  url.searchParams.set('s', stooqSymbol);
  url.searchParams.set('f', 'sd2t2ohlcv');
  url.searchParams.set('h', '');
  url.searchParams.set('e', 'csv');
  const content = await fetchText(url, options);

  return parseStooqCsv(content, symbol);
}

async function fetchAlphaVantageQuote(symbol, options = {}) {
  if (!options.alphaVantageApiKey) {
    throw new Error('ALPHA_VANTAGE_API_KEY가 설정되지 않았습니다.');
  }

  const url = new URL(alphaVantageUrl);
  url.searchParams.set('function', 'GLOBAL_QUOTE');
  url.searchParams.set('symbol', symbol);
  url.searchParams.set('apikey', options.alphaVantageApiKey);
  const payload = await fetchJson(url, options);

  return parseAlphaVantageQuote(payload, symbol);
}

async function fetchYahooQuote(symbol, options = {}) {
  const url = new URL(yahooQuoteUrl);
  url.searchParams.set('symbols', symbol);
  const payload = await fetchJson(url, options);
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
    provider: 'yahoo',
    regularMarketTime: result.regularMarketTime
      ? new Date(result.regularMarketTime * 1000).toISOString()
      : null
  };
}

async function fetchJson(url, options = {}) {
  const response = await fetchWithTimeout(url, options);

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  return response.json();
}

async function fetchText(url, options = {}) {
  const response = await fetchWithTimeout(url, options);

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  return response.text();
}

async function fetchWithTimeout(url, options = {}) {
  const timeoutMs = options.timeoutMs || 10000;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      signal: controller.signal,
      headers: {
        accept: 'application/json, text/csv, text/plain, */*',
        'user-agent': 'stock-alarm-mvp/0.1'
      }
    });
  } finally {
    clearTimeout(timeout);
  }
}

function parseCsvLine(line) {
  const values = [];
  let value = '';
  let inQuotes = false;

  for (const character of line) {
    if (character === '"') {
      inQuotes = !inQuotes;
      continue;
    }

    if (character === ',' && !inQuotes) {
      values.push(value);
      value = '';
      continue;
    }

    value += character;
  }

  values.push(value);
  return values;
}
