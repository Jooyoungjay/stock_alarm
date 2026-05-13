import zlib from 'node:zlib';
import { isKoreanStockSymbol } from './priceProvider.js';

const publicDataDividendUrl =
  'http://apis.data.go.kr/1160100/GetStocDiviInfoService_V2/getDiviInfo_V2';
const openDartAlotMatterUrl = 'https://opendart.fss.or.kr/api/alotMatter.json';
const openDartCorpCodeUrl = 'https://opendart.fss.or.kr/api/corpCode.xml';
const alphaVantageUrl = 'https://www.alphavantage.co/query';
const yahooQuoteSummaryUrl = 'https://query1.finance.yahoo.com/v10/finance/quoteSummary';
const defaultProviders = ['publicdata', 'opendart', 'alphavantage', 'yahoo'];
const openDartReportCodes = ['11011', '11014', '11012', '11013'];
const oneYearMs = 370 * 24 * 60 * 60 * 1000;

const openDartCorpCodeCache = new Map();

export async function fetchDividendInfo(symbol, options = {}) {
  const providers = normalizeDividendProviders(options.providers);
  const errors = [];
  const attempts = [];

  for (const provider of providers) {
    const startedAt = new Date().toISOString();

    try {
      const info = await fetchDividendInfoFromProvider(provider, symbol, options);
      const attempt = createDividendAttempt(provider, {
        status: 'success',
        startedAt,
        info
      });
      attempts.push(attempt);

      return {
        ...info,
        attempts
      };
    } catch (error) {
      const message = error.message || '배당 정보 조회 중 오류가 발생했습니다.';
      errors.push(`${provider}: ${message}`);
      attempts.push(
        createDividendAttempt(provider, {
          status: 'error',
          startedAt,
          error: message
        })
      );
    }
  }

  if (!errors.length) {
    const error = new Error('배당 정보 조회 실패: 사용할 수 있는 배당 provider가 없습니다.');
    error.attempts = attempts;
    throw error;
  }

  const error = new Error(`배당 정보 조회 실패: ${errors.join(' | ')}`);
  error.attempts = attempts;
  throw error;
}

async function fetchDividendInfoFromProvider(provider, symbol, options) {
  if (provider === 'publicdata') {
    return fetchPublicDataDividendInfo(symbol, options);
  }

  if (provider === 'opendart') {
    return fetchOpenDartDividendInfo(symbol, options);
  }

  if (provider === 'alphavantage') {
    return fetchAlphaVantageDividendInfo(symbol, options);
  }

  if (provider === 'yahoo') {
    return fetchYahooDividendInfo(symbol, options);
  }

  throw new Error(`지원하지 않는 배당 provider입니다: ${provider}`);
}

function createDividendAttempt(provider, input) {
  const attempt = {
    provider,
    status: input.status,
    startedAt: input.startedAt || '',
    finishedAt: new Date().toISOString()
  };

  if (input.info) {
    attempt.sourceSymbol = input.info.sourceSymbol || input.info.symbol || '';
    attempt.annualDividendPerShare = normalizePositiveNumber(input.info.annualDividendPerShare);
    attempt.dividendYieldPercent = normalizePositiveNumber(input.info.dividendYieldPercent);
    attempt.lastDividendValue = normalizePositiveNumber(input.info.lastDividendValue);
    attempt.exDividendDate = input.info.exDividendDate || '';
    attempt.dividendDate = input.info.dividendDate || '';
    attempt.currency = input.info.currency || '';
  }

  if (input.error) {
    attempt.error = String(input.error);
  }

  return attempt;
}

export function normalizeDividendProviders(value) {
  if (!value) {
    return defaultProviders;
  }

  const providers = Array.isArray(value) ? value : String(value).split(',');
  const normalized = providers
    .map((provider) => provider.trim().toLowerCase())
    .filter(Boolean)
    .map((provider) => {
      if (['data', 'datagokr', 'data.go.kr', 'public'].includes(provider)) {
        return 'publicdata';
      }

      if (['dart', 'open-dart', 'open_dart'].includes(provider)) {
        return 'opendart';
      }

      if (['alpha', 'alpha-vantage', 'alpha_vantage'].includes(provider)) {
        return 'alphavantage';
      }

      return provider;
    });

  return normalized.length ? normalized : defaultProviders;
}

export function parsePublicDataDividendResponse(
  payload,
  requestedSymbol,
  sourceName,
  options = {}
) {
  const header = payload?.response?.header || {};

  if (header.resultCode && !['00', '0000'].includes(String(header.resultCode))) {
    throw new Error(header.resultMsg || '공공데이터 배당 조회 오류');
  }

  const items = normalizeItems(payload?.response?.body?.items?.item);
  const stockCode = getKoreanStockCode(requestedSymbol);
  const sourceNames = normalizeCompanyNameCandidates([
    sourceName,
    ...(options.companyNameCandidates || []),
    options.companyName,
    options.displayName
  ]);
  const matchingItems =
    sourceNames.length || stockCode
      ? items.filter((item) => isPublicDataDividendItemMatch(item, stockCode, sourceNames))
      : items;
  const selectedItems = matchingItems.length === 0 && items.length === 1 ? items : matchingItems;
  const events = selectedItems
    .map((item) => ({
      amount: pickFirstPositiveNumber(
        item.stckGenrDvdnAmt,
        item.stckDvdnAmt,
        item.cashDvdnAmt,
        item.dvdnAmt,
        findDividendAmountInRecord(item)
      ),
      exDate: parseCompactDate(item.dvdnBasDt || item.dvdnBseDt || item.basDt || item.rghtStndDt),
      payDate: parseCompactDate(item.cashDvdnPayDt || item.dvdnPayDt || item.payDt),
      currency: 'KRW',
      sourceSymbol: findCompanyNameInRecord(item) || sourceNames[0] || requestedSymbol
    }))
    .filter((event) => event.amount !== null);

  return buildDividendInfoFromEvents(events, {
    symbol: requestedSymbol,
    provider: 'publicdata',
    sourceSymbol: selectedItems[0] ? findCompanyNameInRecord(selectedItems[0]) : sourceNames[0] || requestedSymbol,
    currency: 'KRW',
    now: options.now
  });
}

export function parseOpenDartAlotMatter(payload, requestedSymbol, sourceSymbol, options = {}) {
  if (payload?.status && payload.status !== '000') {
    throw new Error(payload.message || 'OpenDART 배당 조회 오류');
  }

  const rows = normalizeItems(payload?.list);
  const commonRows = rows.filter((row) => {
    const stockKind = String(row.stock_knd || '').trim();
    return !stockKind || stockKind.includes('보통') || /common/i.test(stockKind);
  });
  const dividendRows = commonRows.filter((row) => {
    const label = String(row.se || '').replace(/\s+/g, '');
    return (
      label.includes('주당') &&
      (label.includes('현금배당') || label.includes('배당금') || label.includes('cashdividend'))
    );
  });
  const row = dividendRows[0] || commonRows.find((item) => parseLooseNumber(item.thstrm) !== null);
  const amount = parseLooseNumber(row?.thstrm);

  if (amount === null) {
    throw new Error(`OpenDART 배당 정보를 찾을 수 없습니다: ${requestedSymbol}`);
  }

  return {
    symbol: requestedSymbol,
    sourceSymbol,
    annualDividendPerShare: amount,
    dividendYieldPercent: null,
    lastDividendValue: amount,
    exDividendDate: '',
    dividendDate: '',
    currency: 'KRW',
    provider: 'opendart',
    fiscalDate: row?.stlm_dt || ''
  };
}

export function parseAlphaVantageDividends(payload, requestedSymbol, options = {}) {
  if (payload?.['Error Message']) {
    throw new Error(payload['Error Message']);
  }

  if (payload?.Note || payload?.Information) {
    throw new Error(payload.Note || payload.Information);
  }

  const rows = normalizeItems(payload?.data);
  const events = rows
    .map((row) => ({
      amount: pickFirstPositiveNumber(row.amount, row.dividend_amount, row.cash_amount),
      exDate: parseDashedDate(row.ex_dividend_date || row.exDate),
      payDate: parseDashedDate(row.payment_date || row.pay_date || row.payDate),
      currency: row.currency || '',
      sourceSymbol: payload.symbol || requestedSymbol
    }))
    .filter((event) => event.amount !== null);

  return buildDividendInfoFromEvents(events, {
    symbol: requestedSymbol,
    provider: 'alphavantage',
    sourceSymbol: payload.symbol || requestedSymbol,
    currency: '',
    now: options.now
  });
}

export function parseYahooDividendSummary(payload, requestedSymbol, sourceSymbol = requestedSymbol) {
  if (payload?.quoteSummary?.error) {
    throw new Error(payload.quoteSummary.error.description || 'Yahoo 배당 조회 오류');
  }

  const result = payload?.quoteSummary?.result?.[0];

  if (!result) {
    throw new Error(`배당 정보를 찾을 수 없습니다: ${requestedSymbol}`);
  }

  const summary = result.summaryDetail || {};
  const price = result.price || {};
  const annualDividendPerShare = pickFirstPositiveNumber(
    summary.dividendRate?.raw,
    summary.trailingAnnualDividendRate?.raw,
    inferAnnualDividendFromYield(summary.dividendYield?.raw, price.regularMarketPrice?.raw)
  );

  if (annualDividendPerShare === null) {
    throw new Error(`배당 정보를 찾을 수 없습니다: ${requestedSymbol}`);
  }

  return {
    symbol: requestedSymbol,
    sourceSymbol,
    annualDividendPerShare,
    dividendYieldPercent: normalizeYieldPercent(summary.dividendYield?.raw),
    lastDividendValue: normalizePositiveNumber(summary.lastDividendValue?.raw),
    exDividendDate: parseUnixDate(summary.exDividendDate?.raw),
    dividendDate: parseUnixDate(result.calendarEvents?.dividendDate?.raw),
    currency: price.currency || price.financialCurrency || '',
    provider: 'yahoo'
  };
}

export function toYahooDividendSymbol(symbol) {
  const normalized = String(symbol || '').trim().toUpperCase();

  if (!normalized) {
    throw new Error('종목 코드가 비어 있습니다.');
  }

  if (/^\d{6}$/.test(normalized)) {
    return `${normalized}.KS`;
  }

  if (isKoreanStockSymbol(normalized)) {
    return normalized;
  }

  return normalized;
}

async function fetchPublicDataDividendInfo(symbol, options = {}) {
  if (!isKoreanStockSymbol(symbol)) {
    throw new Error('공공데이터 배당정보는 한국 종목만 조회합니다.');
  }

  if (!options.dataGoKrServiceKey) {
    throw new Error('DATA_GO_KR_SERVICE_KEY가 설정되지 않았습니다.');
  }

  const sourceNames = normalizeCompanyNameCandidates([
    ...(options.companyNameCandidates || []),
    options.companyName,
    options.displayName
  ]);

  if (!sourceNames.length) {
    throw new Error('공공데이터 배당정보 조회에는 종목 표시 이름이 필요합니다.');
  }

  const errors = [];

  for (const sourceName of sourceNames) {
    try {
      const url = createPublicDataUrl(options.dataGoKrServiceKey);
      url.searchParams.set('pageNo', '1');
      url.searchParams.set('numOfRows', '100');
      url.searchParams.set('resultType', 'json');
      url.searchParams.set('stckIssuCmpyNm', sourceName);
      const payload = await fetchJson(url, options);

      return parsePublicDataDividendResponse(payload, symbol, sourceName, {
        ...options,
        companyNameCandidates: sourceNames
      });
    } catch (error) {
      errors.push(`${sourceName}: ${error.message}`);
    }
  }

  throw new Error(`공공데이터 배당정보 조회 실패: ${errors.join(' | ')}`);
}

async function fetchOpenDartDividendInfo(symbol, options = {}) {
  if (!isKoreanStockSymbol(symbol)) {
    throw new Error('OpenDART 배당정보는 한국 종목만 조회합니다.');
  }

  if (!options.openDartApiKey) {
    throw new Error('OPENDART_API_KEY가 설정되지 않았습니다.');
  }

  const corp = await findOpenDartCorpByStockCode(symbol, options);
  const now = options.now || new Date();
  const currentYear = now.getUTCFullYear();
  const errors = [];

  for (let year = currentYear; year >= currentYear - 3; year -= 1) {
    for (const reportCode of openDartReportCodes) {
      try {
        const url = new URL(openDartAlotMatterUrl);
        url.searchParams.set('crtfc_key', options.openDartApiKey);
        url.searchParams.set('corp_code', corp.corpCode);
        url.searchParams.set('bsns_year', String(year));
        url.searchParams.set('reprt_code', reportCode);
        const payload = await fetchJson(url, options);

        return parseOpenDartAlotMatter(payload, symbol, corp.stockName || corp.corpName || corp.corpCode, options);
      } catch (error) {
        errors.push(`${year}/${reportCode}: ${error.message}`);
      }
    }
  }

  throw new Error(errors.join(' | '));
}

async function fetchAlphaVantageDividendInfo(symbol, options = {}) {
  if (isKoreanStockSymbol(symbol)) {
    throw new Error('Alpha Vantage 배당정보는 한국 종목 조회에 사용하지 않습니다.');
  }

  if (!options.alphaVantageApiKey) {
    throw new Error('ALPHA_VANTAGE_API_KEY가 설정되지 않았습니다.');
  }

  const url = new URL(alphaVantageUrl);
  url.searchParams.set('function', 'DIVIDENDS');
  url.searchParams.set('symbol', symbol);
  url.searchParams.set('apikey', options.alphaVantageApiKey);
  const payload = await fetchJson(url, options);

  return parseAlphaVantageDividends(payload, symbol, options);
}

async function fetchYahooDividendInfo(symbol, options = {}) {
  const sourceSymbols = getYahooDividendSymbols(symbol);
  const errors = [];

  for (const sourceSymbol of sourceSymbols) {
    try {
      const url = new URL(`${yahooQuoteSummaryUrl}/${encodeURIComponent(sourceSymbol)}`);
      url.searchParams.set('modules', 'summaryDetail,calendarEvents,price');
      const payload = await fetchJson(url, options);

      return parseYahooDividendSummary(payload, symbol, sourceSymbol);
    } catch (error) {
      errors.push(`${sourceSymbol}: ${error.message}`);
    }
  }

  throw new Error(errors.join(' | '));
}

async function findOpenDartCorpByStockCode(symbol, options = {}) {
  const companies = await loadOpenDartCompanies(options);
  const company = findOpenDartCorpMatch(companies, symbol, options);

  if (company) {
    return company;
  }

  throw new Error(`OpenDART 고유번호를 찾을 수 없습니다: ${symbol}`);
}

export function findOpenDartCorpMatch(companies, symbol, options = {}) {
  const stockCode = getKoreanStockCode(symbol);
  const company = companies.find((item) => item.stockCode === stockCode);

  if (company) {
    return company;
  }

  const sourceNames = normalizeCompanyNameCandidates([
    ...(options.companyNameCandidates || []),
    options.companyName,
    options.displayName
  ]);
  const matchedByName = companies.find((item) =>
    sourceNames.some(
      (sourceName) =>
        isCompanyNameMatch(item.corpName, sourceName) ||
        isCompanyNameMatch(item.stockName, sourceName)
    )
  );

  if (matchedByName) {
    return matchedByName;
  }

  return null;
}

async function loadOpenDartCompanies(options = {}) {
  const apiKey = String(options.openDartApiKey || '').trim();

  if (!apiKey) {
    throw new Error('OPENDART_API_KEY가 설정되지 않았습니다.');
  }

  if (!openDartCorpCodeCache.has(apiKey)) {
    openDartCorpCodeCache.set(apiKey, fetchOpenDartCompanies(options));
  }

  return openDartCorpCodeCache.get(apiKey);
}

async function fetchOpenDartCompanies(options = {}) {
  const url = new URL(openDartCorpCodeUrl);
  url.searchParams.set('crtfc_key', options.openDartApiKey);
  const response = await fetchWithTimeout(url, options);

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  const xml = extractFirstZipTextFile(buffer);

  return parseOpenDartCorpCodeXml(xml);
}

export function parseOpenDartCorpCodeXml(xml) {
  return [...String(xml || '').matchAll(/<list>([\s\S]*?)<\/list>/g)]
    .map((match) => ({
      corpCode: getXmlValue(match[1], 'corp_code'),
      corpName: getXmlValue(match[1], 'corp_name'),
      stockName: getXmlValue(match[1], 'stock_name'),
      stockCode: getXmlValue(match[1], 'stock_code'),
      modifyDate: getXmlValue(match[1], 'modify_date')
    }))
    .filter((item) => item.corpCode);
}

function extractFirstZipTextFile(buffer) {
  const eocdOffset = findZipEndOfCentralDirectory(buffer);

  if (eocdOffset === -1) {
    throw new Error('OpenDART 고유번호 ZIP 파일을 해석할 수 없습니다.');
  }

  const centralDirectoryOffset = buffer.readUInt32LE(eocdOffset + 16);
  const entryCount = buffer.readUInt16LE(eocdOffset + 10);
  let offset = centralDirectoryOffset;

  for (let index = 0; index < entryCount; index += 1) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) {
      throw new Error('OpenDART 고유번호 ZIP 중앙 디렉터리를 해석할 수 없습니다.');
    }

    const compressionMethod = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const fileNameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localHeaderOffset = buffer.readUInt32LE(offset + 42);
    const fileName = buffer.slice(offset + 46, offset + 46 + fileNameLength).toString('utf8');

    if (fileName.toLowerCase().endsWith('.xml')) {
      return extractZipEntry(buffer, localHeaderOffset, compressionMethod, compressedSize).toString('utf8');
    }

    offset += 46 + fileNameLength + extraLength + commentLength;
  }

  throw new Error('OpenDART 고유번호 XML 파일을 찾을 수 없습니다.');
}

function extractZipEntry(buffer, localHeaderOffset, compressionMethod, compressedSize) {
  if (buffer.readUInt32LE(localHeaderOffset) !== 0x04034b50) {
    throw new Error('OpenDART 고유번호 ZIP 로컬 헤더를 해석할 수 없습니다.');
  }

  const fileNameLength = buffer.readUInt16LE(localHeaderOffset + 26);
  const extraLength = buffer.readUInt16LE(localHeaderOffset + 28);
  const dataOffset = localHeaderOffset + 30 + fileNameLength + extraLength;
  const compressed = buffer.slice(dataOffset, dataOffset + compressedSize);

  if (compressionMethod === 0) {
    return compressed;
  }

  if (compressionMethod === 8) {
    return zlib.inflateRawSync(compressed);
  }

  throw new Error(`지원하지 않는 ZIP 압축 방식입니다: ${compressionMethod}`);
}

function findZipEndOfCentralDirectory(buffer) {
  for (let offset = buffer.length - 22; offset >= 0; offset -= 1) {
    if (buffer.readUInt32LE(offset) === 0x06054b50) {
      return offset;
    }
  }

  return -1;
}

function getYahooDividendSymbols(symbol) {
  const normalized = String(symbol || '').trim().toUpperCase();

  if (/^\d{6}$/.test(normalized)) {
    return [`${normalized}.KS`, `${normalized}.KQ`];
  }

  return [toYahooDividendSymbol(normalized)];
}

function createPublicDataUrl(serviceKey) {
  const key = String(serviceKey || '').trim();

  if (!key) {
    throw new Error('DATA_GO_KR_SERVICE_KEY가 설정되지 않았습니다.');
  }

  if (key.includes('%')) {
    return new URL(`${publicDataDividendUrl}?serviceKey=${key}`);
  }

  const url = new URL(publicDataDividendUrl);
  url.searchParams.set('serviceKey', key);
  return url;
}

function buildDividendInfoFromEvents(events, meta = {}) {
  const validEvents = events
    .map((event) => ({
      ...event,
      amount: normalizePositiveNumber(event.amount),
      exDate: event.exDate || '',
      payDate: event.payDate || ''
    }))
    .filter((event) => event.amount !== null)
    .sort((left, right) => getEventTime(right) - getEventTime(left));

  if (!validEvents.length) {
    throw new Error(`배당 정보를 찾을 수 없습니다: ${meta.symbol}`);
  }

  const now = meta.now || new Date();
  const cutoff = now.getTime() - oneYearMs;
  const recentEvents = validEvents.filter((event) => getEventTime(event) >= cutoff);
  const annualDividendPerShare =
    recentEvents.length > 1
      ? sumAmounts(recentEvents)
      : inferAnnualDividendFromEvents(validEvents);
  const latest = validEvents[0];

  if (!annualDividendPerShare) {
    throw new Error(`배당 정보를 찾을 수 없습니다: ${meta.symbol}`);
  }

  return {
    symbol: meta.symbol,
    sourceSymbol: latest.sourceSymbol || meta.sourceSymbol || meta.symbol,
    annualDividendPerShare,
    dividendYieldPercent: null,
    lastDividendValue: latest.amount,
    exDividendDate: latest.exDate || '',
    dividendDate: latest.payDate || '',
    currency: latest.currency || meta.currency || '',
    provider: meta.provider
  };
}

function inferAnnualDividendFromEvents(events) {
  const latest = events[0];

  if (!latest) {
    return null;
  }

  if (events.length < 2) {
    return latest.amount;
  }

  const latestTime = getEventTime(events[0]);
  const previousTime = getEventTime(events[1]);
  const gapDays = Math.abs(latestTime - previousTime) / (24 * 60 * 60 * 1000);
  const frequency = inferFrequencyFromGapDays(gapDays);

  return latest.amount * frequency;
}

function inferFrequencyFromGapDays(gapDays) {
  if (!Number.isFinite(gapDays) || gapDays <= 0) {
    return 1;
  }

  if (gapDays <= 40) {
    return 12;
  }

  if (gapDays <= 130) {
    return 4;
  }

  if (gapDays <= 230) {
    return 2;
  }

  return 1;
}

function sumAmounts(events) {
  return events.reduce((sum, event) => sum + event.amount, 0);
}

function getEventTime(event) {
  const value = event.exDate || event.payDate || '';
  const time = value ? new Date(value).getTime() : 0;

  return Number.isFinite(time) ? time : 0;
}

function findDividendAmountInRecord(record) {
  const candidates = Object.entries(record || {}).filter(([key]) => {
    const normalized = key.toLowerCase();
    return (
      (normalized.includes('dvdn') || normalized.includes('divi')) &&
      !normalized.includes('rt') &&
      !normalized.includes('rate') &&
      !normalized.includes('dt') &&
      !normalized.includes('date')
    );
  });

  for (const [, value] of candidates) {
    const number = parseLooseNumber(value);

    if (number !== null) {
      return number;
    }
  }

  return null;
}

function inferAnnualDividendFromYield(dividendYield, marketPrice) {
  const yieldNumber = normalizePositiveNumber(dividendYield);
  const price = normalizePositiveNumber(marketPrice);

  if (yieldNumber === null || price === null) {
    return null;
  }

  const normalizedYield = yieldNumber > 1 ? yieldNumber / 100 : yieldNumber;
  return normalizedYield * price;
}

function normalizeYieldPercent(value) {
  const number = normalizePositiveNumber(value);

  if (number === null) {
    return null;
  }

  return number > 1 ? number : number * 100;
}

function pickFirstPositiveNumber(...values) {
  for (const value of values) {
    const number = normalizePositiveNumber(value);

    if (number !== null) {
      return number;
    }
  }

  return null;
}

function normalizePositiveNumber(value) {
  const number = parseLooseNumber(value);

  return number !== null && number > 0 ? number : null;
}

function parseLooseNumber(value) {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  const text = String(value).replace(/,/g, '').trim();

  if (!text || text === '-' || text.toLowerCase() === 'nan') {
    return null;
  }

  const number = Number(text);

  return Number.isFinite(number) ? number : null;
}

function normalizeItems(value) {
  if (!value) {
    return [];
  }

  return Array.isArray(value) ? value : [value];
}

function parseCompactDate(value) {
  const text = String(value || '').replace(/\D/g, '');

  if (text.length !== 8) {
    return '';
  }

  return parseDashedDate(`${text.slice(0, 4)}-${text.slice(4, 6)}-${text.slice(6, 8)}`);
}

function parseDashedDate(value) {
  const text = String(value || '').trim();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    return '';
  }

  const date = new Date(`${text}T00:00:00.000Z`);

  return Number.isFinite(date.getTime()) ? date.toISOString() : '';
}

function parseUnixDate(value) {
  const timestamp = Number(value);

  if (!Number.isFinite(timestamp) || timestamp <= 0) {
    return '';
  }

  return new Date(timestamp * 1000).toISOString();
}

function getKoreanStockCode(symbol) {
  const match = String(symbol || '').trim().match(/^(\d{6})(?:\.(KS|KQ))?$/i);
  return match ? match[1] : '';
}

function normalizeCompanyNameCandidates(values) {
  const seen = new Set();
  const result = [];

  for (const value of values.flatMap((item) => (Array.isArray(item) ? item : [item]))) {
    const text = String(value || '').trim();

    if (!text) {
      continue;
    }

    for (const candidate of expandCompanyNameCandidate(text)) {
      const normalized = normalizeCompanyName(candidate);

      if (!normalized || seen.has(normalized)) {
        continue;
      }

      seen.add(normalized);
      result.push(candidate);
    }
  }

  return result;
}

function expandCompanyNameCandidate(value) {
  const text = String(value || '').trim();
  const withoutStockClass = text.replace(/보통주|우선주|우선|[0-9]*우B?$/gi, '').trim();
  const withoutCorpPrefix = withoutStockClass
    .replace(/^\(?주\)?\s*/i, '')
    .replace(/^㈜\s*/i, '')
    .replace(/^주식회사\s*/i, '')
    .trim();
  const withoutCorpSuffix = withoutCorpPrefix
    .replace(/\s*\(?주\)?$/i, '')
    .replace(/\s*㈜$/i, '')
    .replace(/\s*주식회사$/i, '')
    .trim();

  return [text, withoutStockClass, withoutCorpPrefix, withoutCorpSuffix];
}

function isPublicDataDividendItemMatch(item, stockCode, sourceNames) {
  if (stockCode && recordContainsStockCode(item, stockCode)) {
    return true;
  }

  const companyName = findCompanyNameInRecord(item);

  if (!companyName) {
    return false;
  }

  return sourceNames.some((sourceName) => isCompanyNameMatch(companyName, sourceName));
}

function recordContainsStockCode(record, stockCode) {
  const code = String(stockCode || '').trim();

  if (!code) {
    return false;
  }

  return Object.entries(record || {}).some(([key, value]) => {
    const normalizedKey = String(key || '').toLowerCase();
    const text = String(value || '').replace(/\D/g, '');

    if (!text) {
      return false;
    }

    if (text === code || text.includes(code)) {
      return true;
    }

    return (
      (normalizedKey.includes('srtn') ||
        normalizedKey.includes('stock') ||
        normalizedKey.includes('stck') ||
        normalizedKey.includes('isin')) &&
      text.endsWith(code)
    );
  });
}

function findCompanyNameInRecord(record) {
  const preferredKeys = [
    'stckIssuCmpyNm',
    'isinCdNm',
    'corpNm',
    'corpName',
    'stockName',
    'stckNm',
    'itmsNm'
  ];

  for (const key of preferredKeys) {
    const value = record?.[key];

    if (value) {
      return String(value).trim();
    }
  }

  for (const [key, value] of Object.entries(record || {})) {
    const normalizedKey = key.toLowerCase();

    if (
      value &&
      (normalizedKey.includes('cmpynm') ||
        normalizedKey.includes('corp') ||
        normalizedKey.includes('name') ||
        normalizedKey.includes('nm'))
    ) {
      return String(value).trim();
    }
  }

  return '';
}

function isCompanyNameMatch(left, right) {
  const normalizedLeft = normalizeCompanyName(left);
  const normalizedRight = normalizeCompanyName(right);

  if (!normalizedLeft || !normalizedRight) {
    return false;
  }

  if (normalizedLeft === normalizedRight) {
    return true;
  }

  const minLength = Math.min(normalizedLeft.length, normalizedRight.length);

  return minLength >= 2 && (normalizedLeft.includes(normalizedRight) || normalizedRight.includes(normalizedLeft));
}

function normalizeCompanyName(value) {
  return String(value || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/\(주\)|㈜|주식회사/g, '')
    .replace(/보통주|우선주|우선/g, '')
    .replace(/[^0-9a-z가-힣]/g, '');
}

function getXmlValue(xml, tagName) {
  const match = String(xml || '').match(new RegExp(`<${tagName}>([\\s\\S]*?)<\\/${tagName}>`));

  return match ? decodeXmlEntities(match[1].trim()) : '';
}

function decodeXmlEntities(value) {
  return String(value || '')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&amp;', '&')
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'");
}

async function fetchJson(url, options = {}) {
  const response = await fetchWithTimeout(url, options);

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  return response.json();
}

async function fetchWithTimeout(url, options = {}) {
  const timeoutMs = Number(options.timeoutMs || 10000);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      headers: {
        accept: 'application/json, text/plain, */*'
      },
      signal: controller.signal
    });
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error('요청 시간이 초과되었습니다.');
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
