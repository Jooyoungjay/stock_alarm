import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { createBackup } from './backups.js';
import { normalizeSymbolInput } from './symbols.js';

const emptyStore = {
  devices: [],
  stocks: [],
  alerts: [],
  meta: {}
};

export const ALERT_TYPES = Object.freeze({
  HIGH_DRAWDOWN: 'high_drawdown',
  PROFIT_RETRACEMENT: 'profit_retracement',
  PURCHASE_LOSS: 'purchase_loss',
  TARGET_PRICE: 'target_price'
});

export const DEFAULT_ALERT_TYPE = ALERT_TYPES.HIGH_DRAWDOWN;

async function ensureDataDir(dataDir) {
  await fs.mkdir(dataDir, { recursive: true });
}

async function readJson(filePath, fallback) {
  try {
    const content = stripBom(await fs.readFile(filePath, 'utf8'));
    return JSON.parse(content);
  } catch (error) {
    if (error.code === 'ENOENT') {
      return fallback;
    }

    throw error;
  }
}

function stripBom(value) {
  return String(value || '').replace(/^\uFEFF/, '');
}

async function writeJson(filePath, data) {
  const tempPath = `${filePath}.tmp`;
  await fs.writeFile(tempPath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  await fs.rename(tempPath, filePath);
}

function normalizeStock(input, defaults) {
  const now = new Date().toISOString();
  const symbol = normalizeSymbolInput(input.symbol);

  if (!symbol) {
    throw new Error('종목 코드를 입력하세요.');
  }

  const alertType = normalizeAlertType(input.alertType);
  const thresholdPercent = normalizeThresholdPercent(input.thresholdPercent);
  const targetPrice = normalizeOptionalPositiveNumber(
    input.targetPrice,
    '직접 기준가는 0보다 큰 숫자여야 합니다.'
  );

  const alertCooldownMinutes = Number(
    input.alertCooldownMinutes || defaults.defaultAlertCooldownMinutes
  );

  if (!Number.isFinite(alertCooldownMinutes) || alertCooldownMinutes < 1) {
    throw new Error('반복 알림 간격은 1분 이상이어야 합니다.');
  }

  const stock = {
    id: randomUUID(),
    deviceId: normalizeDeviceId(input.deviceId),
    symbol,
    displayName: String(input.displayName || '').trim(),
    purchasePrice: normalizeOptionalPositiveNumber(input.purchasePrice, '매수가는 0보다 큰 숫자여야 합니다.'),
    quantity: normalizeOptionalPositiveNumber(input.quantity, '보유 수량은 0보다 큰 숫자여야 합니다.'),
    annualDividendPerShare: normalizeOptionalPositiveNumber(
      input.annualDividendPerShare,
      '주당 연 배당금은 0보다 큰 숫자여야 합니다.'
    ),
    dividendFrequency: normalizeDividendFrequency(input.dividendFrequency),
    dividendMonths: normalizeDividendMonths(input.dividendMonths),
    dividendDataSource: input.annualDividendPerShare ? 'manual' : '',
    dividendProvider: '',
    dividendSourceSymbol: '',
    dividendCurrency: '',
    dividendYieldPercent: null,
    lastDividendValue: null,
    exDividendDate: '',
    dividendDate: '',
    dividendUpdatedAt: input.annualDividendPerShare ? now : null,
    dividendLastCheckedAt: null,
    dividendLastError: '',
    dividendLastErrorAt: null,
    dividendLastDiagnostic: null,
    dividendHistory: [],
    purchaseDate: normalizeOptionalDate(input.purchaseDate),
    alertType,
    thresholdPercent,
    targetPrice,
    alertCooldownMinutes,
    active: true,
    highPrice: null,
    highPriceAt: null,
    highPriceSource: '',
    lastPrice: null,
    lastCheckedAt: null,
    lastCheckStatus: 'pending',
    lastError: '',
    lastErrorAt: null,
    alertState: 'clear',
    alertStartedAt: null,
    alertRecoveredAt: null,
    alertRepeatCount: 0,
    lastAlertAt: null,
    lastAlertPrice: null,
    lastAlertThresholdPrice: null,
    lastAlertMetricPercent: null,
    currency: '',
    exchange: '',
    marketState: '',
    quoteProvider: '',
    notes: String(input.notes || '').trim(),
    createdAt: now,
    updatedAt: now
  };

  validateAlertTypeFields(stock);
  return stock;
}

function normalizeDevice(input) {
  const now = new Date().toISOString();
  const deviceId = String(input.deviceId || randomUUID()).trim();

  if (!deviceId) {
    throw new Error('기기 ID가 올바르지 않습니다.');
  }

  return {
    id: deviceId,
    label: String(input.label || '').trim(),
    platform: normalizeDevicePlatform(input.platform),
    pushTokens: [],
    createdAt: now,
    updatedAt: now,
    lastSeenAt: now
  };
}

function applyStockPatch(stock, patch) {
  const next = {
    ...stock,
    updatedAt: new Date().toISOString()
  };
  let alertConditionChanged = false;

  if (patch.displayName !== undefined) {
    next.displayName = String(patch.displayName || '').trim();
  }

  if (patch.notes !== undefined) {
    next.notes = String(patch.notes || '').trim();
  }

  if (patch.purchasePrice !== undefined) {
    next.purchasePrice = normalizeOptionalPositiveNumber(
      patch.purchasePrice,
      '매수가는 0보다 큰 숫자여야 합니다.'
    );
    alertConditionChanged = true;
  }

  if (patch.quantity !== undefined) {
    next.quantity = normalizeOptionalPositiveNumber(
      patch.quantity,
      '보유 수량은 0보다 큰 숫자여야 합니다.'
    );
  }

  if (patch.annualDividendPerShare !== undefined) {
    next.annualDividendPerShare = normalizeOptionalPositiveNumber(
      patch.annualDividendPerShare,
      '주당 연 배당금은 0보다 큰 숫자여야 합니다.'
    );
    next.dividendDataSource = next.annualDividendPerShare ? 'manual' : '';
    next.dividendProvider = '';
    next.dividendSourceSymbol = '';
    next.dividendCurrency = '';
    next.dividendYieldPercent = null;
    next.lastDividendValue = null;
    next.exDividendDate = '';
    next.dividendDate = '';
    next.dividendUpdatedAt = next.annualDividendPerShare ? next.updatedAt : null;
    next.dividendLastError = '';
    next.dividendLastErrorAt = null;
    next.dividendLastDiagnostic = null;

    if (hasDividendHistoryChange(stock, next)) {
      next.dividendHistory = appendDividendHistory(next.dividendHistory, {
        checkedAt: next.updatedAt,
        reason: 'manual',
        provider: 'manual',
        currency: next.dividendCurrency || next.currency || '',
        previousAnnualDividendPerShare: stock.annualDividendPerShare,
        annualDividendPerShare: next.annualDividendPerShare,
        previousLastDividendValue: stock.lastDividendValue,
        lastDividendValue: next.lastDividendValue,
        previousExDividendDate: stock.exDividendDate || '',
        exDividendDate: next.exDividendDate || '',
        previousDividendDate: stock.dividendDate || '',
        dividendDate: next.dividendDate || ''
      });
    }
  }

  if (patch.dividendFrequency !== undefined) {
    next.dividendFrequency = normalizeDividendFrequency(patch.dividendFrequency);
  }

  if (patch.dividendMonths !== undefined) {
    next.dividendMonths = normalizeDividendMonths(patch.dividendMonths);
  }

  if (patch.purchaseDate !== undefined) {
    next.purchaseDate = normalizeOptionalDate(patch.purchaseDate);
    alertConditionChanged = true;
  }

  if (patch.alertType !== undefined) {
    next.alertType = normalizeAlertType(patch.alertType);
    alertConditionChanged = true;
  }

  if (patch.thresholdPercent !== undefined) {
    next.thresholdPercent = normalizeThresholdPercent(patch.thresholdPercent);
    alertConditionChanged = true;
  }

  if (patch.targetPrice !== undefined) {
    next.targetPrice = normalizeOptionalPositiveNumber(
      patch.targetPrice,
      '직접 기준가는 0보다 큰 숫자여야 합니다.'
    );
    alertConditionChanged = true;
  }

  if (patch.alertCooldownMinutes !== undefined) {
    const alertCooldownMinutes = Number(patch.alertCooldownMinutes);

    if (!Number.isFinite(alertCooldownMinutes) || alertCooldownMinutes < 1) {
      throw new Error('반복 알림 간격은 1분 이상이어야 합니다.');
    }

    next.alertCooldownMinutes = alertCooldownMinutes;
  }

  if (patch.active !== undefined) {
    next.active = Boolean(patch.active);
  }

  if (patch.resetHighPrice) {
    next.highPrice = null;
    next.highPriceAt = null;
    next.highPriceSource = '';
    next.lastAlertAt = null;
    alertConditionChanged = true;
  }

  if (alertConditionChanged) {
    resetAlertState(next);
  }

  validateAlertTypeFields(next);
  return next;
}

function normalizeStoredStock(stock) {
  const purchasePrice = Number(stock.purchasePrice);
  const quantity = Number(stock.quantity);
  const annualDividendPerShare = Number(stock.annualDividendPerShare);
  const targetPrice = Number(stock.targetPrice);
  const alertType = normalizeStoredAlertType(stock.alertType);
  const normalizedTargetPrice =
    stock.targetPrice === undefined || stock.targetPrice === null || stock.targetPrice === ''
      ? null
      : Number.isFinite(targetPrice)
        ? targetPrice
        : null;
  const thresholdPercent = Number(stock.thresholdPercent);

  return {
    ...stock,
    deviceId: normalizeDeviceId(stock.deviceId),
    purchasePrice:
      stock.purchasePrice === undefined || stock.purchasePrice === null || stock.purchasePrice === ''
        ? null
        : Number.isFinite(purchasePrice)
          ? purchasePrice
          : null,
    quantity:
      stock.quantity === undefined || stock.quantity === null || stock.quantity === ''
        ? null
        : Number.isFinite(quantity) && quantity > 0
          ? quantity
          : null,
    annualDividendPerShare:
      stock.annualDividendPerShare === undefined ||
      stock.annualDividendPerShare === null ||
      stock.annualDividendPerShare === ''
        ? null
        : Number.isFinite(annualDividendPerShare) && annualDividendPerShare > 0
          ? annualDividendPerShare
          : null,
    dividendFrequency: normalizeStoredDividendFrequency(stock.dividendFrequency),
    dividendMonths: normalizeStoredDividendMonths(stock.dividendMonths),
    dividendDataSource:
      stock.dividendDataSource || (Number.isFinite(annualDividendPerShare) && annualDividendPerShare > 0 ? 'manual' : ''),
    dividendProvider: stock.dividendProvider || '',
    dividendSourceSymbol: stock.dividendSourceSymbol || '',
    dividendCurrency: stock.dividendCurrency || '',
    dividendYieldPercent: normalizeOptionalStoredNumber(stock.dividendYieldPercent),
    lastDividendValue: normalizeOptionalStoredNumber(stock.lastDividendValue),
    exDividendDate: stock.exDividendDate || '',
    dividendDate: stock.dividendDate || '',
    dividendUpdatedAt: stock.dividendUpdatedAt || null,
    dividendLastCheckedAt: stock.dividendLastCheckedAt || null,
    dividendLastError: stock.dividendLastError || '',
    dividendLastErrorAt: stock.dividendLastErrorAt || null,
    dividendLastDiagnostic: normalizeDividendDiagnostic(stock.dividendLastDiagnostic),
    dividendHistory: normalizeDividendHistory(stock.dividendHistory),
    purchaseDate: stock.purchaseDate || '',
    alertType:
      alertType === ALERT_TYPES.TARGET_PRICE && normalizedTargetPrice === null
        ? DEFAULT_ALERT_TYPE
        : alertType,
    thresholdPercent:
      Number.isFinite(thresholdPercent) && thresholdPercent > 0 && thresholdPercent < 100
        ? thresholdPercent
        : 5,
    targetPrice: normalizedTargetPrice,
    highPriceSource: stock.highPriceSource || '',
    lastCheckStatus: stock.lastCheckStatus || (stock.lastCheckedAt ? 'checked' : 'pending'),
    lastError: stock.lastError || '',
    lastErrorAt: stock.lastErrorAt || null,
    quoteProvider: stock.quoteProvider || '',
    alertState: normalizeAlertState(stock.alertState),
    alertStartedAt: stock.alertStartedAt || null,
    alertRecoveredAt: stock.alertRecoveredAt || null,
    alertRepeatCount: normalizeNonNegativeInteger(stock.alertRepeatCount),
    lastAlertPrice: normalizeOptionalStoredNumber(stock.lastAlertPrice),
    lastAlertThresholdPrice: normalizeOptionalStoredNumber(stock.lastAlertThresholdPrice),
    lastAlertMetricPercent: normalizeOptionalStoredNumber(stock.lastAlertMetricPercent)
  };
}

function normalizeStoredDevice(device) {
  return {
    id: String(device.id || device.deviceId || '').trim(),
    label: String(device.label || '').trim(),
    platform: normalizeDevicePlatform(device.platform),
    secretHash: device.secretHash || '',
    pushTokens: Array.isArray(device.pushTokens)
      ? device.pushTokens.map(normalizePushToken).filter((token) => token.token)
      : [],
    createdAt: device.createdAt || new Date().toISOString(),
    updatedAt: device.updatedAt || device.createdAt || new Date().toISOString(),
    lastSeenAt: device.lastSeenAt || device.updatedAt || device.createdAt || new Date().toISOString()
  };
}

function resetAlertState(stock) {
  stock.alertState = 'clear';
  stock.alertStartedAt = null;
  stock.alertRecoveredAt = null;
  stock.alertRepeatCount = 0;
  stock.lastAlertPrice = null;
  stock.lastAlertThresholdPrice = null;
  stock.lastAlertMetricPercent = null;
}

function normalizeAlertState(value) {
  return value === 'triggered' ? 'triggered' : 'clear';
}

function normalizeNonNegativeInteger(value) {
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 ? number : 0;
}

function normalizeOptionalStoredNumber(value) {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalizeDividendDiagnostic(value) {
  if (!value || typeof value !== 'object') {
    return null;
  }

  return {
    checkedAt: value.checkedAt || null,
    status: ['updated', 'checked', 'error', 'skipped'].includes(value.status)
      ? value.status
      : '',
    reason: String(value.reason || ''),
    error: String(value.error || ''),
    provider: String(value.provider || ''),
    sourceSymbol: String(value.sourceSymbol || ''),
    currency: String(value.currency || ''),
    annualDividendPerShare: normalizeOptionalStoredNumber(value.annualDividendPerShare),
    previousAnnualDividendPerShare: normalizeOptionalStoredNumber(
      value.previousAnnualDividendPerShare
    ),
    lastDividendValue: normalizeOptionalStoredNumber(value.lastDividendValue),
    previousLastDividendValue: normalizeOptionalStoredNumber(value.previousLastDividendValue),
    exDividendDate: String(value.exDividendDate || ''),
    previousExDividendDate: String(value.previousExDividendDate || ''),
    dividendDate: String(value.dividendDate || ''),
    previousDividendDate: String(value.previousDividendDate || ''),
    preservedAnnualDividendPerShare: normalizeOptionalStoredNumber(
      value.preservedAnnualDividendPerShare
    ),
    attempts: Array.isArray(value.attempts)
      ? value.attempts.map(normalizeDividendAttempt).filter((attempt) => attempt.provider)
      : []
  };
}

function normalizeDividendAttempt(value) {
  return {
    provider: String(value?.provider || ''),
    status: value?.status === 'success' ? 'success' : 'error',
    startedAt: value?.startedAt || '',
    finishedAt: value?.finishedAt || '',
    sourceSymbol: String(value?.sourceSymbol || ''),
    annualDividendPerShare: normalizeOptionalStoredNumber(value?.annualDividendPerShare),
    dividendYieldPercent: normalizeOptionalStoredNumber(value?.dividendYieldPercent),
    lastDividendValue: normalizeOptionalStoredNumber(value?.lastDividendValue),
    exDividendDate: String(value?.exDividendDate || ''),
    dividendDate: String(value?.dividendDate || ''),
    currency: String(value?.currency || ''),
    error: String(value?.error || '')
  };
}

function normalizeDividendHistory(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map(normalizeDividendHistoryEntry).filter(Boolean).slice(0, 20);
}

function normalizeDividendHistoryEntry(value) {
  if (!value || typeof value !== 'object') {
    return null;
  }

  return {
    checkedAt: String(value.checkedAt || ''),
    reason: String(value.reason || ''),
    provider: String(value.provider || ''),
    sourceSymbol: String(value.sourceSymbol || ''),
    currency: String(value.currency || ''),
    previousAnnualDividendPerShare: normalizeOptionalStoredNumber(
      value.previousAnnualDividendPerShare
    ),
    annualDividendPerShare: normalizeOptionalStoredNumber(value.annualDividendPerShare),
    previousLastDividendValue: normalizeOptionalStoredNumber(value.previousLastDividendValue),
    lastDividendValue: normalizeOptionalStoredNumber(value.lastDividendValue),
    previousExDividendDate: String(value.previousExDividendDate || ''),
    exDividendDate: String(value.exDividendDate || ''),
    previousDividendDate: String(value.previousDividendDate || ''),
    dividendDate: String(value.dividendDate || '')
  };
}

function appendDividendHistory(history, entry) {
  return [normalizeDividendHistoryEntry(entry), ...normalizeDividendHistory(history)]
    .filter(Boolean)
    .slice(0, 20);
}

function hasDividendHistoryChange(previous, next) {
  return (
    normalizeOptionalStoredNumber(previous.annualDividendPerShare) !==
      normalizeOptionalStoredNumber(next.annualDividendPerShare) ||
    normalizeOptionalStoredNumber(previous.lastDividendValue) !==
      normalizeOptionalStoredNumber(next.lastDividendValue) ||
    String(previous.exDividendDate || '') !== String(next.exDividendDate || '') ||
    String(previous.dividendDate || '') !== String(next.dividendDate || '')
  );
}

function normalizeDeviceId(value) {
  const id = String(value || '').trim();
  return id || null;
}

function normalizeDevicePlatform(value) {
  const platform = String(value || 'unknown').trim().toLowerCase();
  const allowed = ['ios', 'android', 'web', 'unknown'];

  return allowed.includes(platform) ? platform : 'unknown';
}

function createDeviceSecret() {
  return randomBytes(32).toString('base64url');
}

function hashDeviceSecret(secret) {
  return createHash('sha256').update(String(secret || '')).digest('hex');
}

function normalizePushToken(input) {
  return {
    token: String(input.token || '').trim(),
    provider: String(input.provider || 'expo').trim().toLowerCase(),
    platform: normalizeDevicePlatform(input.platform),
    enabled: input.enabled === undefined ? true : Boolean(input.enabled),
    updatedAt: input.updatedAt || new Date().toISOString()
  };
}

export function normalizeAlertType(value) {
  const alertType = String(value || DEFAULT_ALERT_TYPE).trim();

  if (Object.values(ALERT_TYPES).includes(alertType)) {
    return alertType;
  }

  throw new Error('알림 기준이 올바르지 않습니다.');
}

function normalizeStoredAlertType(value) {
  try {
    return normalizeAlertType(value);
  } catch {
    return DEFAULT_ALERT_TYPE;
  }
}

function normalizeThresholdPercent(value) {
  const fallbackValue = value === undefined || value === null || value === '' ? 5 : value;
  const thresholdPercent = Number(fallbackValue);

  if (!Number.isFinite(thresholdPercent) || thresholdPercent <= 0 || thresholdPercent >= 100) {
    throw new Error('하락률은 0보다 크고 100보다 작은 숫자여야 합니다.');
  }

  return thresholdPercent;
}

function validateAlertTypeFields(stock) {
  if (stock.alertType === ALERT_TYPES.PROFIT_RETRACEMENT && !stock.purchasePrice) {
    throw new Error('이익금 반납률 기준은 매수가가 필요합니다.');
  }

  if (stock.alertType === ALERT_TYPES.PURCHASE_LOSS && !stock.purchasePrice) {
    throw new Error('매수가 대비 손절률 기준은 매수가가 필요합니다.');
  }

  if (stock.alertType === ALERT_TYPES.TARGET_PRICE && !stock.targetPrice) {
    throw new Error('직접 기준가 알림은 기준가를 입력해야 합니다.');
  }
}

function normalizeOptionalPositiveNumber(value, errorMessage) {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  const number = Number(value);

  if (!Number.isFinite(number) || number <= 0) {
    throw new Error(errorMessage);
  }

  return number;
}

function normalizeOptionalDate(value) {
  if (value === undefined || value === null || value === '') {
    return '';
  }

  const raw = String(value).trim();
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);

  if (!match) {
    throw new Error('구매일 형식이 올바르지 않습니다.');
  }

  const parsed = new Date(`${raw}T00:00:00.000Z`);

  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== raw) {
    throw new Error('구매일 형식이 올바르지 않습니다.');
  }

  return raw;
}

function normalizeDividendFrequency(value) {
  const frequency = String(value || '').trim().toLowerCase();
  const allowed = ['', 'monthly', 'quarterly', 'semiannual', 'annual', 'custom'];

  if (allowed.includes(frequency)) {
    return frequency;
  }

  throw new Error('배당 주기는 monthly, quarterly, semiannual, annual, custom 중 하나여야 합니다.');
}

function normalizeStoredDividendFrequency(value) {
  try {
    return normalizeDividendFrequency(value);
  } catch {
    return '';
  }
}

function normalizeDividendMonths(value) {
  if (value === undefined || value === null || value === '') {
    return [];
  }

  const rawItems = Array.isArray(value)
    ? value
    : String(value)
        .split(/[\s,]+/)
        .map((item) => item.trim())
        .filter(Boolean);

  if (!rawItems.length) {
    return [];
  }

  const months = rawItems.map((item) => Number(item));

  if (months.some((month) => !Number.isInteger(month) || month < 1 || month > 12)) {
    throw new Error('배당 지급월은 1부터 12까지의 숫자로 입력해야 합니다.');
  }

  return [...new Set(months)].sort((left, right) => left - right);
}

function normalizeStoredDividendMonths(value) {
  try {
    return normalizeDividendMonths(value);
  } catch {
    return [];
  }
}

export class JsonStore {
  constructor(dataDir, defaults = {}) {
    this.dataDir = dataDir;
    this.filePath = path.join(dataDir, 'store.json');
    this.defaults = defaults;
    this.backups = {
      enabled: Boolean(defaults.backups?.enabled),
      maxBackups: defaults.backups?.maxBackups
    };
    this.ready = ensureDataDir(dataDir);
  }

  async read() {
    await this.ready;
    const data = await readJson(this.filePath, emptyStore);

    return {
      devices: Array.isArray(data.devices) ? data.devices.map(normalizeStoredDevice) : [],
      stocks: Array.isArray(data.stocks) ? data.stocks.map(normalizeStoredStock) : [],
      alerts: Array.isArray(data.alerts) ? data.alerts : [],
      meta: data.meta && typeof data.meta === 'object' ? data.meta : {}
    };
  }

  async write(data) {
    await this.ready;
    await writeJson(this.filePath, data);
  }

  async createDevice(input = {}) {
    const data = await this.read();
    const secret = createDeviceSecret();
    const device = {
      ...normalizeDevice(input),
      secretHash: hashDeviceSecret(secret)
    };

    if (data.devices.some((item) => item.id === device.id)) {
      throw new Error('이미 등록된 기기입니다.');
    }

    data.devices.push(device);
    await this.write(data);

    return {
      device: sanitizeDevice(device),
      deviceSecret: secret
    };
  }

  async authenticateDevice(deviceId, deviceSecret) {
    const data = await this.read();
    const id = String(deviceId || '').trim();
    const secretHash = hashDeviceSecret(deviceSecret);
    const index = data.devices.findIndex((device) => device.id === id);

    if (index === -1 || data.devices[index].secretHash !== secretHash) {
      throw new Error('기기 인증에 실패했습니다.');
    }

    const now = new Date().toISOString();
    data.devices[index] = {
      ...data.devices[index],
      lastSeenAt: now,
      updatedAt: now
    };
    await this.write(data);

    return sanitizeDevice(data.devices[index]);
  }

  async upsertDevicePushToken(deviceId, input) {
    const data = await this.read();
    const index = data.devices.findIndex((device) => device.id === deviceId);

    if (index === -1) {
      throw new Error('기기를 찾을 수 없습니다.');
    }

    const now = new Date().toISOString();
    const pushToken = normalizePushToken({
      ...input,
      updatedAt: now
    });

    if (!pushToken.token) {
      throw new Error('푸시 토큰을 입력하세요.');
    }

    const device = data.devices[index];
    const tokenIndex = device.pushTokens.findIndex(
      (item) => item.provider === pushToken.provider && item.token === pushToken.token
    );

    if (tokenIndex === -1) {
      device.pushTokens.push(pushToken);
    } else {
      device.pushTokens[tokenIndex] = {
        ...device.pushTokens[tokenIndex],
        ...pushToken
      };
    }

    device.platform = pushToken.platform === 'unknown' ? device.platform : pushToken.platform;
    device.updatedAt = now;
    device.lastSeenAt = now;
    data.devices[index] = device;
    await this.write(data);

    return sanitizeDevice(device);
  }

  async listStocks(options = {}) {
    const data = await this.read();
    const deviceId = normalizeDeviceId(options.deviceId);

    if (!deviceId) {
      return data.stocks;
    }

    return data.stocks.filter((stock) => normalizeDeviceId(stock.deviceId) === deviceId);
  }

  async addStock(input) {
    const data = await this.read();
    const stock = normalizeStock(input, this.defaults);

    if (
      data.stocks.some(
        (item) =>
          item.symbol === stock.symbol &&
          normalizeDeviceId(item.deviceId) === normalizeDeviceId(stock.deviceId)
      )
    ) {
      throw new Error('이미 등록된 종목입니다.');
    }

    await this.createBackup('before-add-stock');
    data.stocks.push(stock);
    await this.write(data);
    await this.createBackup('after-add-stock');
    return stock;
  }

  async updateStock(id, patch, options = {}) {
    const data = await this.read();
    const index = data.stocks.findIndex((stock) => stock.id === id);

    if (index === -1 || !stockMatchesDevice(data.stocks[index], options.deviceId)) {
      throw new Error('종목을 찾을 수 없습니다.');
    }

    await this.createBackup('before-update-stock');
    const updated = applyStockPatch(data.stocks[index], patch);
    data.stocks[index] = updated;
    await this.write(data);
    await this.createBackup('after-update-stock');
    return updated;
  }

  async replaceStock(stock) {
    const data = await this.read();
    const index = data.stocks.findIndex((item) => item.id === stock.id);

    if (index === -1) {
      return null;
    }

    data.stocks[index] = {
      ...stock,
      updatedAt: new Date().toISOString()
    };

    await this.write(data);
    return data.stocks[index];
  }

  async deleteStock(id, options = {}) {
    const data = await this.read();
    const beforeCount = data.stocks.length;
    await this.createBackup('before-delete-stock');
    data.stocks = data.stocks.filter(
      (stock) => stock.id !== id || !stockMatchesDevice(stock, options.deviceId)
    );

    if (data.stocks.length === beforeCount) {
      throw new Error('종목을 찾을 수 없습니다.');
    }

    await this.write(data);
    await this.createBackup('after-delete-stock');
  }

  async listAlerts(limit = 50, options = {}) {
    const data = await this.read();
    const deviceId = normalizeDeviceId(options.deviceId);
    const alerts = deviceId
      ? data.alerts.filter((alert) => normalizeDeviceId(alert.deviceId) === deviceId)
      : data.alerts;

    return alerts.slice(-limit).reverse();
  }

  async getMetaValue(key, fallback = null) {
    const data = await this.read();
    return data.meta[key] ?? fallback;
  }

  async setMetaValue(key, value) {
    const data = await this.read();
    data.meta = {
      ...data.meta,
      [key]: value
    };
    await this.write(data);
    return value;
  }

  async appendAlert(alert) {
    const data = await this.read();
    const item = {
      id: randomUUID(),
      ...alert,
      createdAt: alert.createdAt || new Date().toISOString()
    };

    data.alerts.push(item);
    data.alerts = data.alerts.slice(-500);
    await this.write(data);
    return item;
  }

  async createBackup(reason = 'manual') {
    if (!this.backups.enabled) {
      return {
        created: false,
        reason: 'disabled'
      };
    }

    await this.ready;
    return createBackup(this.dataDir, {
      reason,
      maxBackups: this.backups.maxBackups
    });
  }
}

function stockMatchesDevice(stock, deviceId) {
  if (deviceId === undefined) {
    return true;
  }

  return normalizeDeviceId(stock.deviceId) === normalizeDeviceId(deviceId);
}

function sanitizeDevice(device) {
  return {
    id: device.id,
    label: device.label,
    platform: device.platform,
    pushTokens: device.pushTokens.map((token) => ({
      provider: token.provider,
      platform: token.platform,
      enabled: token.enabled,
      updatedAt: token.updatedAt
    })),
    createdAt: device.createdAt,
    updatedAt: device.updatedAt,
    lastSeenAt: device.lastSeenAt
  };
}
