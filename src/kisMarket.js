export const KIS_MARKET_DIV_CODES = Object.freeze(['J', 'NX', 'UN']);

export const KIS_MARKET_LABELS = Object.freeze({
  J: 'KRX',
  NX: 'NXT',
  UN: '통합'
});

const KIS_MARKET_ALIASES = Object.freeze({
  KRX: 'J',
  KOSPI: 'J',
  KOSDAQ: 'J',
  NXT: 'NX',
  NEXTRADE: 'NX',
  NEXT: 'NX',
  INTEGRATED: 'UN',
  TOTAL: 'UN',
  ALL: 'UN',
  UNIFIED: 'UN',
  통합: 'UN',
  DEFAULT: '',
  SERVER: '',
  SERVER_DEFAULT: '',
  기본값: ''
});

export function normalizeKisMarketDivCode(value, options = {}) {
  const text = String(value || '').trim().toUpperCase();

  if (!text) {
    return options.fallback ?? '';
  }

  const normalized = Object.hasOwn(KIS_MARKET_ALIASES, text) ? KIS_MARKET_ALIASES[text] : text;

  if (!normalized) {
    return '';
  }

  if (KIS_MARKET_DIV_CODES.includes(normalized)) {
    return normalized;
  }

  if (Object.hasOwn(options, 'fallback')) {
    return options.fallback;
  }

  throw new Error('KIS 시장 구분은 J, NX, UN 중 하나여야 합니다.');
}

export function resolveKisMarketDivCode(stockOrValue, fallback = 'J') {
  const value =
    stockOrValue && typeof stockOrValue === 'object' && !Array.isArray(stockOrValue)
      ? stockOrValue.kisMarketDivCode
      : stockOrValue;

  return normalizeKisMarketDivCode(value, {
    fallback: normalizeKisMarketDivCode(fallback, { fallback: 'J' })
  });
}

export function formatKisMarketDivCode(value, fallbackLabel = '서버 기본값') {
  const code = normalizeKisMarketDivCode(value, { fallback: '' });

  return code ? KIS_MARKET_LABELS[code] : fallbackLabel;
}
