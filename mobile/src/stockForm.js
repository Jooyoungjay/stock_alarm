export const ALERT_TYPE_OPTIONS = Object.freeze([
  { value: 'high_drawdown', label: '최고가' },
  { value: 'profit_retracement', label: '이익 반납' },
  { value: 'purchase_loss', label: '손절' },
  { value: 'target_price', label: '직접가' }
]);

export const KIS_MARKET_OPTIONS = Object.freeze([
  { value: '', label: '기본값' },
  { value: 'J', label: 'KRX' },
  { value: 'NX', label: 'NXT' },
  { value: 'UN', label: '통합' }
]);

export function createEmptyStockForm() {
  return {
    symbol: '',
    displayName: '',
    purchasePrice: '',
    quantity: '',
    purchaseDate: '',
    kisMarketDivCode: '',
    alertType: 'high_drawdown',
    thresholdPercent: '10',
    targetPrice: '',
    alertCooldownMinutes: '30',
    active: true,
    investmentReason: '',
    investmentTargetPrice: '',
    sellCondition: '',
    reviewDate: '',
    notes: ''
  };
}

export function stockToForm(stock = {}) {
  return {
    ...createEmptyStockForm(),
    symbol: stock.symbol || '',
    displayName: stock.displayName || '',
    purchasePrice: formatFormNumber(stock.purchasePrice),
    quantity: formatFormNumber(stock.quantity),
    purchaseDate: stock.purchaseDate || '',
    kisMarketDivCode: normalizeKisMarketDivCode(stock.kisMarketDivCode),
    alertType: stock.alertType || 'high_drawdown',
    thresholdPercent: formatFormNumber(stock.thresholdPercent || 10),
    targetPrice: formatFormNumber(stock.targetPrice),
    alertCooldownMinutes: formatFormNumber(stock.alertCooldownMinutes || 30),
    active: stock.active !== false,
    investmentReason: stock.investmentReason || '',
    investmentTargetPrice: formatFormNumber(stock.investmentTargetPrice),
    sellCondition: stock.sellCondition || '',
    reviewDate: stock.reviewDate || '',
    notes: stock.notes || ''
  };
}

export function validateStockForm(form, options = {}) {
  const editing = Boolean(options.editing);
  const normalized = normalizeForm(form);

  if (!editing && !normalized.symbol) {
    throw new Error('종목 코드를 입력하세요.');
  }

  validateOptionalPositiveNumber(normalized.purchasePrice, '매수가는 0보다 큰 숫자여야 합니다.');
  validateOptionalPositiveNumber(normalized.quantity, '보유 수량은 0보다 큰 숫자여야 합니다.');
  validateOptionalPositiveNumber(normalized.targetPrice, '직접 기준가는 0보다 큰 숫자여야 합니다.');
  validateOptionalPositiveNumber(normalized.investmentTargetPrice, '투자 목표가는 0보다 큰 숫자여야 합니다.');
  validateDate(normalized.purchaseDate, '매수일은 YYYY-MM-DD 형식이어야 합니다.');
  validateDate(normalized.reviewDate, '실적 체크일은 YYYY-MM-DD 형식이어야 합니다.');

  const thresholdPercent = Number(normalized.thresholdPercent || 10);
  const alertCooldownMinutes = Number(normalized.alertCooldownMinutes || 30);

  if (!Number.isFinite(thresholdPercent) || thresholdPercent <= 0 || thresholdPercent >= 100) {
    throw new Error('하락률/반납률은 0보다 크고 100보다 작은 숫자여야 합니다.');
  }

  if (!Number.isFinite(alertCooldownMinutes) || alertCooldownMinutes < 1) {
    throw new Error('반복 알림 간격은 1분 이상이어야 합니다.');
  }

  if (['profit_retracement', 'purchase_loss'].includes(normalized.alertType) && !normalized.purchasePrice) {
    throw new Error('이 알림 기준은 매수가가 필요합니다.');
  }

  if (normalized.alertType === 'target_price' && !normalized.targetPrice) {
    throw new Error('직접 기준가 알림은 기준가를 입력해야 합니다.');
  }
}

export function buildStockPayload(form, options = {}) {
  const editing = Boolean(options.editing);
  const normalized = normalizeForm(form);

  validateStockForm(normalized, { editing });

  const payload = {
    displayName: normalized.displayName,
    purchasePrice: toOptionalNumber(normalized.purchasePrice),
    quantity: toOptionalNumber(normalized.quantity),
    purchaseDate: normalized.purchaseDate,
    kisMarketDivCode: normalized.kisMarketDivCode,
    alertType: normalized.alertType,
    thresholdPercent: Number(normalized.thresholdPercent || 10),
    targetPrice: normalized.alertType === 'target_price' ? toOptionalNumber(normalized.targetPrice) : null,
    alertCooldownMinutes: Number(normalized.alertCooldownMinutes || 30),
    active: normalized.active !== false,
    investmentReason: normalized.investmentReason,
    investmentTargetPrice: toOptionalNumber(normalized.investmentTargetPrice),
    sellCondition: normalized.sellCondition,
    reviewDate: normalized.reviewDate,
    notes: normalized.notes
  };

  if (!editing) {
    payload.symbol = normalized.symbol;
  }

  return payload;
}

function normalizeForm(form) {
  return {
    ...createEmptyStockForm(),
    ...form,
    symbol: String(form.symbol || '').trim(),
    displayName: String(form.displayName || '').trim(),
    purchasePrice: String(form.purchasePrice || '').trim(),
    quantity: String(form.quantity || '').trim(),
    purchaseDate: String(form.purchaseDate || '').trim(),
    kisMarketDivCode: normalizeKisMarketDivCode(form.kisMarketDivCode),
    alertType: normalizeAlertType(form.alertType),
    thresholdPercent: String(form.thresholdPercent || '').trim(),
    targetPrice: String(form.targetPrice || '').trim(),
    alertCooldownMinutes: String(form.alertCooldownMinutes || '').trim(),
    active: form.active !== false,
    investmentReason: String(form.investmentReason || '').trim(),
    investmentTargetPrice: String(form.investmentTargetPrice || '').trim(),
    sellCondition: String(form.sellCondition || '').trim(),
    reviewDate: String(form.reviewDate || '').trim(),
    notes: String(form.notes || '').trim()
  };
}

function normalizeAlertType(value) {
  const alertType = String(value || 'high_drawdown').trim();

  if (ALERT_TYPE_OPTIONS.some((option) => option.value === alertType)) {
    return alertType;
  }

  return 'high_drawdown';
}

function normalizeKisMarketDivCode(value) {
  const text = String(value || '').trim().toUpperCase();
  const aliases = {
    KRX: 'J',
    NXT: 'NX',
    NEXTRADE: 'NX',
    INTEGRATED: 'UN',
    TOTAL: 'UN',
    ALL: 'UN',
    UNIFIED: 'UN',
    통합: 'UN',
    DEFAULT: '',
    SERVER: '',
    SERVER_DEFAULT: '',
    기본값: ''
  };
  const normalized = Object.prototype.hasOwnProperty.call(aliases, text) ? aliases[text] : text;

  return KIS_MARKET_OPTIONS.some((option) => option.value === normalized) ? normalized : '';
}

function formatFormNumber(value) {
  if (value === undefined || value === null || value === '') {
    return '';
  }

  return String(value);
}

function toOptionalNumber(value) {
  const raw = String(value || '').trim();

  if (!raw) {
    return null;
  }

  return Number(raw);
}

function validateOptionalPositiveNumber(value, errorMessage) {
  const raw = String(value || '').trim();

  if (!raw) {
    return;
  }

  const number = Number(raw);

  if (!Number.isFinite(number) || number <= 0) {
    throw new Error(errorMessage);
  }
}

function validateDate(value, errorMessage) {
  const raw = String(value || '').trim();

  if (!raw) {
    return;
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    throw new Error(errorMessage);
  }

  const parsed = new Date(`${raw}T00:00:00.000Z`);

  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== raw) {
    throw new Error(errorMessage);
  }
}
