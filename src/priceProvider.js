const yahooQuoteUrl = 'https://query1.finance.yahoo.com/v7/finance/quote';
const stooqQuoteUrl = 'https://stooq.com/q/l/';
const naverRealtimeUrl = 'https://polling.finance.naver.com/api/realtime';
const alphaVantageUrl = 'https://www.alphavantage.co/query';

const defaultProviders = ['naver', 'stooq', 'alphavantage', 'yahoo'];
const koreanStockSymbolPattern = /^(\d{5}[0-9A-Z])(?:\.(KS|KQ))?$/i;

export async function fetchHistoricalHighSince(symbol, startDate, options = {}) {
  const providers = normalizeProviders(options.providers);
  const start = normalizeHistoricalDate(startDate);
  const end = normalizeHistoricalDate(options.endDate || options.now || new Date());
  const errors = [];

  if (start > end) {
    throw new Error('구매일은 오늘보다 이후일 수 없습니다.');
  }

  for (const provider of providers) {
    if (shouldSkipHistoricalProvider(provider, symbol)) {
      continue;
    }

    try {
      if (provider === 'naver') {
        return await fetchNaverHistoricalHigh(symbol, start, end, options);
      }

      if (provider === 'stooq') {
        return await fetchStooqHistoricalHigh(symbol, start, end, options);
      }

      if (provider === 'yahoo') {
        return await fetchYahooHistoricalHigh(symbol, start, end, options);
      }
    } catch (error) {
      errors.push(`${provider}: ${error.message}`);
    }
  }

  if (!errors.length) {
    throw new Error('구매일 이후 최고가 조회 실패: 사용할 수 있는 일봉 provider가 없습니다.');
  }

  throw new Error(`구매일 이후 최고가 조회 실패: ${errors.join(' | ')}`);
}

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

function shouldSkipHistoricalProvider(provider, symbol) {
  if (provider === 'naver') {
    return !isKoreanStockSymbol(symbol);
  }

  if (provider === 'stooq') {
    return isKoreanStockSymbol(symbol);
  }

  if (provider === 'yahoo') {
    return isKoreanStockSymbol(symbol);
  }

  return true;
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
  return koreanStockSymbolPattern.test(String(symbol || '').trim());
}

export function toNaverSymbol(symbol) {
  const normalized = String(symbol || '').trim().toUpperCase();
  const match = normalized.match(koreanStockSymbolPattern);

  if (!match) {
    throw new Error('한국 주식 코드가 아닙니다.');
  }

  return match[1];
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

export function parseStooqHistoricalCsv(content, requestedSymbol) {
  const lines = String(content || '')
    .trim()
    .split(/\r?\n/)
    .filter(Boolean);

  if (lines.length < 2) {
    throw new Error('Stooq 일봉 응답이 비어 있습니다.');
  }

  const headers = parseCsvLine(lines[0]);
  const rows = lines.slice(1).map((line) => {
    const values = parseCsvLine(line);
    const row = Object.fromEntries(headers.map((header, index) => [header, values[index]]));

    return {
      date: row.Date,
      high: Number(row.High)
    };
  });

  return pickHighestDailyPrice(rows, {
    symbol: requestedSymbol,
    currency: '',
    exchange: 'Stooq',
    provider: 'stooq'
  });
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

export function parseNaverDailyChart(content, requestedSymbol) {
  const rows = [];
  const rowPattern =
    /\[\s*['"]?(\d{8})['"]?\s*,\s*([0-9.]+)\s*,\s*([0-9.]+)\s*,\s*([0-9.]+)\s*,\s*([0-9.]+)/g;
  let match = rowPattern.exec(String(content || ''));

  while (match) {
    rows.push({
      date: toDashedDate(match[1]),
      high: Number(match[3])
    });
    match = rowPattern.exec(String(content || ''));
  }

  return pickHighestDailyPrice(rows, {
    symbol: requestedSymbol,
    currency: 'KRW',
    exchange: 'Naver Finance',
    provider: 'naver'
  });
}

export function parseYahooHistoricalChart(payload, requestedSymbol) {
  if (payload?.chart?.error) {
    throw new Error(payload.chart.error.description || 'Yahoo 일봉 조회 오류');
  }

  const result = payload?.chart?.result?.[0];
  const timestamps = result?.timestamp || [];
  const quote = result?.indicators?.quote?.[0] || {};
  const highs = quote.high || [];
  const rows = timestamps.map((timestamp, index) => ({
    date: new Date(Number(timestamp) * 1000).toISOString().slice(0, 10),
    high: Number(highs[index])
  }));

  return pickHighestDailyPrice(rows, {
    symbol: requestedSymbol,
    currency: result?.meta?.currency || '',
    exchange: result?.meta?.fullExchangeName || result?.meta?.exchangeName || 'Yahoo',
    provider: 'yahoo'
  });
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

async function fetchNaverHistoricalHigh(symbol, start, end, options = {}) {
  const naverSymbol = toNaverSymbol(symbol);
  const url = new URL('https://api.finance.naver.com/siseJson.naver');
  url.searchParams.set('symbol', naverSymbol);
  url.searchParams.set('requestType', '1');
  url.searchParams.set('startTime', compactDate(start));
  url.searchParams.set('endTime', compactDate(end));
  url.searchParams.set('timeframe', 'day');
  const content = await fetchText(url, options);

  return parseNaverDailyChart(content, symbol);
}

async function fetchStooqHistoricalHigh(symbol, start, end, options = {}) {
  const stooqSymbol = toStooqSymbol(symbol);
  const url = new URL('https://stooq.com/q/d/l/');
  url.searchParams.set('s', stooqSymbol);
  url.searchParams.set('d1', compactDate(start));
  url.searchParams.set('d2', compactDate(end));
  url.searchParams.set('i', 'd');
  const content = await fetchText(url, options);

  return parseStooqHistoricalCsv(content, symbol);
}

async function fetchYahooHistoricalHigh(symbol, start, end, options = {}) {
  const url = new URL(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}`);
  url.searchParams.set('period1', String(toUnixSeconds(start)));
  url.searchParams.set('period2', String(toUnixSeconds(addDays(end, 1))));
  url.searchParams.set('interval', '1d');
  const payload = await fetchJson(url, options);

  return parseYahooHistoricalChart(payload, symbol);
}

async function fetchNaverQuote(symbol, options = {}) {
  const naverSymbol = toNaverSymbol(symbol);
  const url = new URL(naverRealtimeUrl);
  url.searchParams.set('query', `SERVICE_ITEM:${naverSymbol}`);
  const payload = await fetchJson(url, options, 'euc-kr');

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

async function fetchJson(url, options = {}, encoding = 'utf-8') {
  const response = await fetchWithTimeout(url, options);

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const decoder = new TextDecoder(encoding);
  const text = decoder.decode(await response.arrayBuffer());
  return JSON.parse(text);
}

async function fetchText(url, options = {}) {
  const response = await fetchWithTimeout(url, options);

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  return response.text();
}

function pickHighestDailyPrice(rows, meta) {
  const validRows = rows.filter((row) => Number.isFinite(Number(row.high)) && Number(row.high) > 0);

  if (!validRows.length) {
    throw new Error(`일봉 고가 정보를 찾을 수 없습니다: ${meta.symbol}`);
  }

  const best = validRows.reduce((highest, row) =>
    Number(row.high) > Number(highest.high) ? row : highest
  );

  return {
    symbol: meta.symbol,
    highPrice: Number(best.high),
    highPriceAt: toDateIso(best.date),
    currency: meta.currency || '',
    exchange: meta.exchange || '',
    provider: meta.provider || '',
    points: validRows.length
  };
}

function normalizeHistoricalDate(value) {
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }

  const raw = String(value || '').trim();
  const match = raw.match(/^(\d{4})-?(\d{2})-?(\d{2})/);

  if (!match) {
    throw new Error('구매일 형식이 올바르지 않습니다.');
  }

  const dashed = `${match[1]}-${match[2]}-${match[3]}`;
  const parsed = new Date(`${dashed}T00:00:00.000Z`);

  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== dashed) {
    throw new Error('구매일 형식이 올바르지 않습니다.');
  }

  return dashed;
}

function compactDate(value) {
  return normalizeHistoricalDate(value).replaceAll('-', '');
}

function toDashedDate(value) {
  const raw = String(value || '').trim();
  const match = raw.match(/^(\d{4})(\d{2})(\d{2})$/);

  if (!match) {
    throw new Error('일봉 날짜 형식이 올바르지 않습니다.');
  }

  return `${match[1]}-${match[2]}-${match[3]}`;
}

function toDateIso(value) {
  return `${normalizeHistoricalDate(value)}T00:00:00.000Z`;
}

function addDays(value, days) {
  const date = new Date(`${normalizeHistoricalDate(value)}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function toUnixSeconds(value) {
  return Math.floor(new Date(`${normalizeHistoricalDate(value)}T00:00:00.000Z`).getTime() / 1000);
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
