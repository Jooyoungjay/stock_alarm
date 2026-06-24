export const DEFAULT_QUOTE_FRESHNESS_MAX_AGE_MINUTES = 30;

export const QUOTE_FRESHNESS_NEXT_ACTION =
  '즉시 확인 또는 종목별 시세 재시도 후 check:observation --live-session 으로 다시 확인하세요.';

export function getStockQuoteCheckedAt(stock = {}) {
  return String(stock.lastCheckedAt || stock.quoteRegularMarketTime || '').trim();
}

export function getQuoteAgeMinutes(stock = {}, now = Date.now()) {
  const checkedAt = getStockQuoteCheckedAt(stock);

  if (!checkedAt) {
    return null;
  }

  const time = new Date(checkedAt).getTime();

  if (!Number.isFinite(time) || time <= 0) {
    return null;
  }

  return (now - time) / 60000;
}

export function classifyQuoteFreshness(stock = {}, options = {}) {
  const maxAgeMinutes = normalizeMaxAgeMinutes(
    options.maxAgeMinutes ?? DEFAULT_QUOTE_FRESHNESS_MAX_AGE_MINUTES
  );
  const now = options.now ?? Date.now();

  if (stock.lastCheckStatus === 'error' || String(stock.lastError || '').trim()) {
    return {
      status: 'error',
      level: 'bad',
      label: '조회 실패',
      detail: String(stock.lastError || '').trim() || '최근 시세를 가져오지 못했습니다.',
      nextAction: QUOTE_FRESHNESS_NEXT_ACTION
    };
  }

  const checkedAt = getStockQuoteCheckedAt(stock);

  if (!checkedAt || !hasPositiveNumber(stock.lastPrice)) {
    return {
      status: 'missing',
      level: 'pending',
      label: '미확인',
      detail: '아직 서버에서 시세를 확인하지 않았습니다.',
      nextAction: QUOTE_FRESHNESS_NEXT_ACTION
    };
  }

  const ageMinutes = getQuoteAgeMinutes(stock, now);

  if (Number.isFinite(ageMinutes) && ageMinutes > maxAgeMinutes) {
    return {
      status: 'stale',
      level: 'stale',
      label: '장중 오래됨',
      detail: `${Math.round(ageMinutes)}분 전 확인 · 기준 ${maxAgeMinutes}분`,
      nextAction: QUOTE_FRESHNESS_NEXT_ACTION
    };
  }

  const delay = String(stock.quoteDataDelay || '').toLowerCase();

  if (delay.includes('delayed') || delay.includes('eod') || ageMinutes > 60) {
    return {
      status: 'delayed',
      level: 'delayed',
      label: '지연 가능',
      detail: `${getProviderLabel(stock.quoteProvider)} · ${getQuoteDataDelayLabel(stock.quoteDataDelay) || '지연/종가'}`,
      nextAction: ''
    };
  }

  return {
    status: 'fresh',
    level: 'ok',
    label: '정상',
    detail: `${getProviderLabel(stock.quoteProvider)} · ${formatCheckedAt(checkedAt)}`,
    nextAction: ''
  };
}

export function summarizeQuoteFreshness(stocks = [], options = {}) {
  const activeStocks = stocks.filter((stock) => stock?.active !== false);
  const summary = {
    activeCount: activeStocks.length,
    stale: 0,
    error: 0,
    missing: 0,
    delayed: 0,
    fresh: 0
  };

  for (const stock of activeStocks) {
    const freshness = classifyQuoteFreshness(stock, options);
    summary[freshness.status] = (summary[freshness.status] || 0) + 1;
  }

  summary.needsAttention = summary.stale + summary.error + summary.missing;
  summary.maxAgeMinutes = normalizeMaxAgeMinutes(
    options.maxAgeMinutes ?? DEFAULT_QUOTE_FRESHNESS_MAX_AGE_MINUTES
  );

  return summary;
}

function normalizeMaxAgeMinutes(value) {
  const minutes = Number(value);
  return Number.isFinite(minutes) && minutes > 0 ? minutes : DEFAULT_QUOTE_FRESHNESS_MAX_AGE_MINUTES;
}

function hasPositiveNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0;
}

function getProviderLabel(value) {
  return String(value || '').trim() || 'provider 미상';
}

function getQuoteDataDelayLabel(value) {
  const labels = {
    realtime_estimated: '실시간 추정',
    realtime_contract: '계약 실시간',
    realtime_polling: '실시간 조회',
    delayed: '지연',
    delayed_or_close: '지연/종가',
    eod: '일봉',
    manual: '수동',
    unknown: '성격 불명'
  };

  return labels[String(value || '').toLowerCase()] || '';
}

function formatCheckedAt(value) {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleString('ko-KR') : value;
}
