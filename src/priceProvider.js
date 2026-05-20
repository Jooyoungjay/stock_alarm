import { getKisAccessToken } from './kisToken.js';

const yahooQuoteUrl = 'https://query1.finance.yahoo.com/v7/finance/quote';
const stooqQuoteUrl = 'https://stooq.com/q/l/';
const naverRealtimeUrl = 'https://polling.finance.naver.com/api/realtime';
const publicDataStockPriceUrl =
  'http://apis.data.go.kr/1160100/service/GetStockSecuritiesInfoService/getStockPriceInfo';
const alphaVantageUrl = 'https://www.alphavantage.co/query';

const defaultProviders = ['naver', 'stooq', 'alphavantage', 'yahoo'];
const supportedQuoteProviders = [...defaultProviders, 'nxt', 'kis'];
const koreanStockSymbolPattern = /^(\d{5}[0-9A-Z])(?:\.(KS|KQ))?$/i;
const kisQuotePath = '/uapi/domestic-stock/v1/quotations/inquire-price';
const kisQuoteTrId = 'FHKST01010100';

export async function fetchHistoricalHighSince(symbol, startDate, options = {}) {
  const providers = normalizeProviders(options.providers);
  const start = normalizeHistoricalDate(startDate);
  const end = normalizeHistoricalDate(options.endDate || options.now || new Date());
  const errors = [];

  if (start > end) {
    throw new Error('구매일은 오늘보다 이후일 수 없습니다.');
  }

  for (const provider of providers) {
    const skipReason = getHistoricalProviderSkipReason(provider, symbol, options);

    if (skipReason) {
      await recordProviderAttempt(options, {
        type: 'historical',
        provider,
        symbol,
        status: 'skipped',
        reason: skipReason
      });
      continue;
    }

    const startedAt = new Date();

    try {
      let result = null;

      if (provider === 'naver') {
        result = await fetchNaverHistoricalHigh(symbol, start, end, options);
      }

      if (provider === 'publicdata') {
        result = await fetchPublicDataHistoricalHigh(symbol, start, end, options);
      }

      if (provider === 'stooq') {
        result = await fetchStooqHistoricalHigh(symbol, start, end, options);
      }

      if (provider === 'yahoo') {
        result = await fetchYahooHistoricalHigh(symbol, start, end, options);
      }

      if (result) {
        await recordProviderAttempt(options, {
          type: 'historical',
          provider,
          symbol,
          status: 'success',
          startedAt
        });
        return result;
      }
    } catch (error) {
      errors.push(`${provider}: ${error.message}`);
      await recordProviderAttempt(options, {
        type: 'historical',
        provider,
        symbol,
        status: 'error',
        error: error.message,
        startedAt
      });
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
    const skipReason = getProviderSkipReason(provider, symbol, options, providers);

    if (skipReason) {
      await recordProviderAttempt(options, {
        type: 'quote',
        provider,
        symbol,
        status: 'skipped',
        reason: skipReason
      });
      continue;
    }

    const startedAt = new Date();

    try {
      let result = null;

      if (provider === 'naver') {
        result = await fetchNaverQuote(symbol, options);
      }

      if (provider === 'nxt') {
        result = await fetchNxtQuote(symbol, options);
      }

      if (provider === 'kis') {
        result = await fetchKisQuote(symbol, options);
      }

      if (provider === 'stooq') {
        result = await fetchStooqQuote(symbol, options);
      }

      if (provider === 'alphavantage') {
        result = await fetchAlphaVantageQuote(symbol, options);
      }

      if (provider === 'yahoo') {
        result = await fetchYahooQuote(symbol, options);
      }

      if (result) {
        await recordProviderAttempt(options, {
          type: 'quote',
          provider,
          symbol,
          status: 'success',
          startedAt
        });
        return result;
      }
    } catch (error) {
      errors.push(`${provider}: ${error.message}`);
      await recordProviderAttempt(options, {
        type: 'quote',
        provider,
        symbol,
        status: 'error',
        error: error.message,
        startedAt
      });
    }
  }

  if (!errors.length) {
    throw new Error('가격 조회 실패: 사용할 수 있는 시세 provider가 없습니다.');
  }

  throw new Error(`가격 조회 실패: ${errors.join(' | ')}`);
}

function getProviderSkipReason(provider, symbol, options, providers) {
  if (provider === 'publicdata') {
    return 'historical_only_provider';
  }

  if (!supportedQuoteProviders.includes(provider)) {
    return 'unsupported_provider';
  }

  if (provider === 'nxt') {
    if (!isKoreanStockSymbol(symbol)) {
      return 'not_korean_symbol';
    }

    if (!options.nxtQuoteEndpointTemplate) {
      return 'missing_nxt_quote_endpoint';
    }
  }

  if (provider === 'kis') {
    if (!isKoreanStockSymbol(symbol)) {
      return 'not_korean_symbol';
    }

    if (!hasKisCredentials(options)) {
      return 'missing_kis_credentials';
    }
  }

  if (providers.length <= 1) {
    return '';
  }

  if (provider === 'naver' && !isKoreanStockSymbol(symbol)) {
    return 'not_korean_symbol';
  }

  if (provider === 'stooq' && isKoreanStockSymbol(symbol)) {
    return 'korean_symbol_not_supported';
  }

  if (provider === 'alphavantage' && !options.alphaVantageApiKey) {
    return 'missing_alpha_vantage_key';
  }

  return '';
}

function getHistoricalProviderSkipReason(provider, symbol, options = {}) {
  if (provider === 'publicdata') {
    if (!isKoreanStockSymbol(symbol)) {
      return 'not_korean_symbol';
    }

    if (!options.dataGoKrServiceKey) {
      return 'missing_data_go_kr_service_key';
    }

    return '';
  }

  if (provider === 'naver') {
    return isKoreanStockSymbol(symbol) ? '' : 'not_korean_symbol';
  }

  if (provider === 'stooq') {
    return isKoreanStockSymbol(symbol) ? 'korean_symbol_not_supported' : '';
  }

  if (provider === 'yahoo') {
    return isKoreanStockSymbol(symbol) ? 'korean_symbol_not_supported' : '';
  }

  return 'historical_not_supported';
}

export function normalizeProviders(value) {
  if (!value) {
    return defaultProviders;
  }

  const providers = Array.isArray(value) ? value : String(value).split(',');
  const normalized = providers
    .map((provider) => provider.trim().toLowerCase())
    .map((provider) => {
      if (['data', 'datagokr', 'data.go.kr', 'public'].includes(provider)) {
        return 'publicdata';
      }

      if (['alpha', 'alpha-vantage', 'alpha_vantage'].includes(provider)) {
        return 'alphavantage';
      }

      if (['nextrade', 'nextrade-ats', 'nxt-ats'].includes(provider)) {
        return 'nxt';
      }

      if (
        [
          'kis',
          'korea-investment',
          'koreainvestment',
          'kis-openapi',
          'kis-open-api',
          '한국투자증권',
          '한투'
        ].includes(provider)
      ) {
        return 'kis';
      }

      return provider;
    })
    .filter(Boolean);

  return normalized.length ? normalized : defaultProviders;
}

export function isKoreanStockSymbol(symbol) {
  return koreanStockSymbolPattern.test(String(symbol || '').trim());
}

const quoteSourceDefaults = {
  naver: {
    providerLabel: 'Naver Finance',
    dataDelay: 'realtime_estimated',
    venue: 'krx_estimated',
    licenseType: 'unofficial',
    sourceNote: '무료/비공식 시세'
  },
  nxt: {
    providerLabel: 'NexTrade ATS',
    dataDelay: 'realtime_contract',
    venue: 'nxt',
    licenseType: 'contract',
    sourceNote: '공식/계약 기반 NXT 시세'
  },
  kis: {
    providerLabel: '한국투자증권 Open API',
    dataDelay: 'realtime_polling',
    venue: 'krx',
    licenseType: 'broker',
    sourceNote: '증권사 REST 현재가'
  },
  stooq: {
    providerLabel: 'Stooq',
    dataDelay: 'delayed',
    venue: 'us',
    licenseType: 'public',
    sourceNote: '무료 지연 시세'
  },
  alphavantage: {
    providerLabel: 'Alpha Vantage',
    dataDelay: 'delayed',
    venue: 'us',
    licenseType: 'keyed',
    sourceNote: 'API 키 기반 지연 시세'
  },
  publicdata: {
    providerLabel: '공공데이터포털 주식시세',
    dataDelay: 'eod',
    venue: 'krx_estimated',
    licenseType: 'public',
    sourceNote: '금융위원회 주식시세정보'
  },
  yahoo: {
    providerLabel: 'Yahoo Finance',
    dataDelay: 'delayed',
    venue: 'us',
    licenseType: 'unofficial',
    sourceNote: '무료/비공식 시세'
  },
  manual: {
    providerLabel: '수동 테스트',
    dataDelay: 'manual',
    venue: 'manual',
    licenseType: 'manual',
    sourceNote: '사용자 입력 테스트 가격'
  }
};

export function getQuoteSourceMeta(provider, options = {}) {
  const normalizedProvider = String(provider || '').trim().toLowerCase();
  const defaults = quoteSourceDefaults[normalizedProvider] || {
    providerLabel: provider || 'Unknown',
    dataDelay: 'unknown',
    venue: isKoreanStockSymbol(options.symbol) ? 'krx_estimated' : 'unknown',
    licenseType: 'unknown',
    sourceNote: ''
  };
  const isHistorical = options.type === 'historical';
  const historicalNote = isHistorical
    ? `${defaults.sourceNote ? `${defaults.sourceNote} · ` : ''}일봉 데이터`
    : defaults.sourceNote;

  return {
    providerLabel: options.providerLabel || defaults.providerLabel,
    dataDelay: options.dataDelay || (isHistorical ? 'eod' : defaults.dataDelay),
    venue: options.venue || defaults.venue,
    licenseType: options.licenseType || defaults.licenseType,
    sourceNote: options.sourceNote || historicalNote
  };
}

function withQuoteSourceMeta(value, options = {}) {
  const provider = value?.provider || options.provider || '';

  return {
    ...value,
    ...getQuoteSourceMeta(provider, { ...value, ...options })
  };
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

  return withQuoteSourceMeta({
    symbol: requestedSymbol,
    name: row.Symbol || requestedSymbol,
    price,
    currency: '',
    exchange: 'Stooq',
    marketState: 'DELAYED',
    provider: 'stooq',
    regularMarketTime: date && time ? new Date(`${date}T${time}Z`).toISOString() : null
  });
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

  return withQuoteSourceMeta({
    symbol: requestedSymbol,
    name: data.nm || requestedSymbol,
    price,
    currency: 'KRW',
    exchange: 'Naver Finance',
    marketState: data.ms || '',
    provider: 'naver',
    regularMarketTime: payload?.result?.time ? new Date(payload.result.time).toISOString() : null
  });
}

export function parseNxtQuote(payload, requestedSymbol) {
  const data = unwrapNxtQuotePayload(payload);
  const price = parseLooseNumber(
    firstPresentValue(
      data.price,
      data.currentPrice,
      data.lastPrice,
      data.tradePrice,
      data.regularMarketPrice,
      data.close
    )
  );

  if (!data || !Number.isFinite(price) || price <= 0) {
    throw new Error(`NXT 가격 정보를 찾을 수 없습니다: ${requestedSymbol}`);
  }

  return withQuoteSourceMeta({
    symbol: data.symbol || data.code || data.stockCode || requestedSymbol,
    name: data.name || data.stockName || data.itmsNm || requestedSymbol,
    price,
    currency: data.currency || 'KRW',
    exchange: data.exchange || 'NexTrade ATS',
    marketState: data.marketState || data.session || '',
    provider: 'nxt',
    regularMarketTime: normalizeMarketTimestamp(
      firstPresentValue(data.regularMarketTime, data.tradeTime, data.timestamp, data.time)
    ),
    dataDelay: data.dataDelay || undefined,
    venue: data.venue || 'nxt',
    sourceNote: data.sourceNote || undefined
  });
}

export function parseKisQuote(payload, requestedSymbol, options = {}) {
  if (payload?.rt_cd && String(payload.rt_cd) !== '0') {
    throw new Error(payload.msg1 || payload.msg_cd || 'KIS 현재가 조회 오류');
  }

  const data = unwrapKisQuotePayload(payload);
  const price = parseLooseNumber(
    firstPresentValue(
      data.stck_prpr,
      data.currentPrice,
      data.lastPrice,
      data.tradePrice,
      data.regularMarketPrice,
      data.close
    )
  );

  if (!data || !Number.isFinite(price) || price <= 0) {
    throw new Error(`KIS 가격 정보를 찾을 수 없습니다: ${requestedSymbol}`);
  }

  const marketDivCode = normalizeKisMarketDivCode(options.kisMarketDivCode);

  return withQuoteSourceMeta(
    {
      symbol: data.stck_shrn_iscd || data.shtn_pdno || data.code || requestedSymbol,
      name: data.hts_kor_isnm || data.prdt_name || data.name || requestedSymbol,
      price,
      currency: 'KRW',
      exchange: toKisExchangeName(marketDivCode),
      marketState: data.iscd_stat_cls_code || data.marketState || '',
      provider: 'kis',
      regularMarketTime: normalizeKisTimestamp(data),
      venue: toKisVenue(marketDivCode)
    },
    {
      kisMarketDivCode: marketDivCode
    }
  );
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

export function parsePublicDataStockPriceResponse(payload, requestedSymbol) {
  const header = payload?.response?.header || {};

  if (header.resultCode && !['00', '0000'].includes(String(header.resultCode))) {
    throw new Error(header.resultMsg || '공공데이터 주식시세 조회 오류');
  }

  const stockCode = toNaverSymbol(requestedSymbol);
  const items = normalizeItems(payload?.response?.body?.items?.item);
  const matchingItems = items.filter((item) => recordStockCodeMatches(item, stockCode));
  const rows = matchingItems.map((item) => ({
    date: item.basDt || item.basdt,
    high: parseLooseNumber(item.hipr || item.highPrice || item.high)
  }));
  const high = pickHighestDailyPrice(rows, {
    symbol: requestedSymbol,
    currency: 'KRW',
    exchange: '공공데이터포털/금융위원회',
    provider: 'publicdata'
  });

  return {
    ...high,
    sourceSymbol: matchingItems[0]?.itmsNm || matchingItems[0]?.itmsnm || stockCode
  };
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

  return withQuoteSourceMeta({
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
  });
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

async function fetchPublicDataHistoricalHigh(symbol, start, end, options = {}) {
  if (!options.dataGoKrServiceKey) {
    throw new Error('DATA_GO_KR_SERVICE_KEY가 설정되지 않았습니다.');
  }

  const url = createPublicDataStockPriceUrl(options.dataGoKrServiceKey);
  url.searchParams.set('pageNo', '1');
  url.searchParams.set('numOfRows', '5000');
  url.searchParams.set('resultType', 'json');
  url.searchParams.set('beginBasDt', compactDate(start));
  url.searchParams.set('endBasDt', compactDate(addDays(end, 1)));
  url.searchParams.set('likeSrtnCd', toNaverSymbol(symbol));
  const payload = await fetchJson(url, options);

  return parsePublicDataStockPriceResponse(payload, symbol);
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

async function fetchNxtQuote(symbol, options = {}) {
  const url = buildNxtQuoteUrl(options.nxtQuoteEndpointTemplate, symbol);
  const payload = await fetchJson(url, {
    ...options,
    headers: {
      ...options.headers,
      ...buildNxtHeaders(options)
    }
  });

  return parseNxtQuote(payload, symbol);
}

async function fetchKisQuote(symbol, options = {}) {
  const marketDivCode = normalizeKisMarketDivCode(options.kisMarketDivCode);
  const url = buildKisQuoteUrl(options.kisApiBaseUrl, symbol, marketDivCode);
  const token = await getKisAccessToken(options);
  const payload = await fetchJson(url, {
    ...options,
    headers: {
      ...options.headers,
      ...buildKisHeaders(options, token.accessToken)
    }
  });

  return parseKisQuote(payload, symbol, {
    kisMarketDivCode: marketDivCode
  });
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

  return withQuoteSourceMeta({
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
  });
}

async function fetchJson(url, options = {}, encoding = 'utf-8') {
  const response = await fetchWithTimeout(url, options);

  if (!response.ok) {
    throw new Error(await formatHttpError(response));
  }

  const decoder = new TextDecoder(encoding);
  const text = decoder.decode(await response.arrayBuffer());
  return JSON.parse(text);
}

async function fetchText(url, options = {}) {
  const response = await fetchWithTimeout(url, options);

  if (!response.ok) {
    throw new Error(await formatHttpError(response));
  }

  return response.text();
}

async function formatHttpError(response) {
  let detail = '';

  try {
    detail = (await response.text()).replace(/\s+/g, ' ').trim();
  } catch {
    detail = '';
  }

  if (detail.length > 180) {
    detail = `${detail.slice(0, 177)}...`;
  }

  return detail ? `HTTP ${response.status}: ${detail}` : `HTTP ${response.status}`;
}

function createPublicDataStockPriceUrl(serviceKey) {
  const key = String(serviceKey || '').trim();

  if (!key) {
    throw new Error('DATA_GO_KR_SERVICE_KEY가 설정되지 않았습니다.');
  }

  if (key.includes('%')) {
    return new URL(`${publicDataStockPriceUrl}?serviceKey=${key}`);
  }

  const url = new URL(publicDataStockPriceUrl);
  url.searchParams.set('serviceKey', key);
  return url;
}

function normalizeItems(value) {
  if (!value) {
    return [];
  }

  return Array.isArray(value) ? value : [value];
}

function recordStockCodeMatches(item, stockCode) {
  const normalizedCode = String(stockCode || '').trim().toUpperCase();

  if (!normalizedCode) {
    return false;
  }

  return [item?.srtnCd, item?.srtncd, item?.isinCd, item?.isincd]
    .map((value) => String(value || '').trim().toUpperCase())
    .some((value) => value === normalizedCode);
}

function parseLooseNumber(value) {
  if (value === undefined || value === null || value === '') {
    return NaN;
  }

  const normalized = String(value).replaceAll(',', '').trim();
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : NaN;
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
    points: validRows.length,
    ...getQuoteSourceMeta(meta.provider || '', {
      symbol: meta.symbol,
      type: 'historical'
    })
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
  const fetchImpl = options.fetch || fetch;

  try {
    return await fetchImpl(url, {
      signal: controller.signal,
      headers: {
        accept: 'application/json, text/csv, text/plain, */*',
        'user-agent': 'stock-alarm-mvp/0.1',
        ...normalizeHeaders(options.headers)
      }
    });
  } finally {
    clearTimeout(timeout);
  }
}

function buildNxtQuoteUrl(template, symbol) {
  const endpointTemplate = String(template || '').trim();

  if (!endpointTemplate) {
    throw new Error('NXT_QUOTE_ENDPOINT_TEMPLATE가 설정되지 않았습니다.');
  }

  const rawSymbol = String(symbol || '').trim().toUpperCase();
  const code = toNaverSymbol(rawSymbol);
  const replacements = {
    '{symbol}': encodeURIComponent(code),
    '{code}': encodeURIComponent(code),
    '{nxtSymbol}': encodeURIComponent(code),
    '{rawSymbol}': encodeURIComponent(rawSymbol)
  };
  let rendered = endpointTemplate;
  let replaced = false;

  for (const [token, value] of Object.entries(replacements)) {
    if (rendered.includes(token)) {
      rendered = rendered.replaceAll(token, value);
      replaced = true;
    }
  }

  const url = new URL(rendered);

  if (!replaced) {
    url.searchParams.set('symbol', code);
  }

  return url;
}

function buildNxtHeaders(options = {}) {
  const apiKey = String(options.nxtApiKey || '').trim();

  if (!apiKey) {
    return {};
  }

  const headerName = String(options.nxtApiKeyHeader || 'Authorization').trim() || 'Authorization';
  const scheme = String(options.nxtApiKeyScheme || 'Bearer').trim();
  const headerValue =
    headerName.toLowerCase() === 'authorization' && scheme ? `${scheme} ${apiKey}` : apiKey;

  return {
    [headerName]: headerValue
  };
}

function buildKisQuoteUrl(baseUrl, symbol, marketDivCode) {
  const endpoint = String(baseUrl || 'https://openapi.koreainvestment.com:9443').trim();
  const url = new URL(kisQuotePath, endpoint.endsWith('/') ? endpoint : `${endpoint}/`);
  url.searchParams.set('FID_COND_MRKT_DIV_CODE', normalizeKisMarketDivCode(marketDivCode));
  url.searchParams.set('FID_INPUT_ISCD', toNaverSymbol(symbol));

  return url;
}

function buildKisHeaders(options = {}, accessToken) {
  return {
    authorization: `Bearer ${String(accessToken || '').trim().replace(/^Bearer\s+/i, '')}`,
    appkey: options.kisAppKey,
    appsecret: options.kisAppSecret,
    tr_id: options.kisTrId || kisQuoteTrId,
    custtype: options.kisCustType || 'P'
  };
}

function hasKisCredentials(options = {}) {
  return Boolean(
    options.kisAppKey &&
      options.kisAppSecret &&
      (options.kisAccessToken || options.kisTokenAutoRefresh)
  );
}

function normalizeKisMarketDivCode(value) {
  const text = String(value || 'J').trim().toUpperCase();

  if (['J', 'NX', 'UN'].includes(text)) {
    return text;
  }

  return 'J';
}

function toKisVenue(marketDivCode) {
  if (marketDivCode === 'NX') {
    return 'nxt';
  }

  if (marketDivCode === 'UN') {
    return 'integrated';
  }

  return 'krx';
}

function toKisExchangeName(marketDivCode) {
  if (marketDivCode === 'NX') {
    return 'KIS/NXT';
  }

  if (marketDivCode === 'UN') {
    return 'KIS/통합';
  }

  return 'KIS/KRX';
}

function normalizeHeaders(headers = {}) {
  return Object.fromEntries(
    Object.entries(headers || {}).filter(([, value]) => value !== undefined && value !== null)
  );
}

function unwrapNxtQuotePayload(payload) {
  if (Array.isArray(payload)) {
    return payload[0] || {};
  }

  if (!payload || typeof payload !== 'object') {
    return {};
  }

  if (Array.isArray(payload.data)) {
    return payload.data[0] || {};
  }

  if (Array.isArray(payload.result)) {
    return payload.result[0] || {};
  }

  return payload.quote || payload.data?.quote || payload.data || payload.result || payload;
}

function unwrapKisQuotePayload(payload) {
  if (Array.isArray(payload)) {
    return payload[0] || {};
  }

  if (!payload || typeof payload !== 'object') {
    return {};
  }

  if (Array.isArray(payload.output)) {
    return payload.output[0] || {};
  }

  return payload.output || payload.data?.output || payload.quote || payload.data || payload;
}

function firstPresentValue(...values) {
  return values.find((value) => value !== undefined && value !== null && value !== '');
}

function normalizeKisTimestamp(data) {
  const date = String(
    firstPresentValue(data.stck_bsop_date, data.bsop_date, data.bas_dt, data.date) || ''
  ).trim();
  const time = String(
    firstPresentValue(data.stck_cntg_hour, data.cntg_hour, data.trade_time, data.time) || ''
  ).trim();
  const dateMatch = date.match(/^(\d{4})(\d{2})(\d{2})$/);
  const timeMatch = time.match(/^(\d{2})(\d{2})(\d{2})$/);

  if (!dateMatch || !timeMatch) {
    return null;
  }

  const parsed = new Date(
    `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}T${timeMatch[1]}:${timeMatch[2]}:${timeMatch[3]}+09:00`
  );

  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
}

function normalizeMarketTimestamp(value) {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  if (typeof value === 'number' || /^\d+$/.test(String(value))) {
    const number = Number(value);
    const timestamp = number > 9999999999 ? number : number * 1000;
    const date = new Date(timestamp);
    return Number.isFinite(date.getTime()) ? date.toISOString() : null;
  }

  const date = new Date(String(value));
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

async function recordProviderAttempt(options, input) {
  if (typeof options.onProviderAttempt !== 'function') {
    return;
  }

  const finishedAt = new Date();
  const startedAt = input.startedAt instanceof Date ? input.startedAt : finishedAt;
  const durationMs = Math.max(0, finishedAt.getTime() - startedAt.getTime());
  const attempt = {
    type: input.type || 'quote',
    provider: input.provider,
    symbol: input.symbol,
    status: input.status,
    reason: input.reason || '',
    error: input.error || '',
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    durationMs
  };

  try {
    await options.onProviderAttempt(attempt);
  } catch {
    // Diagnostics must never break the price lookup path.
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
