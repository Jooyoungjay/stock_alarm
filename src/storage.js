import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { normalizeSymbolInput } from './symbols.js';

const emptyStore = {
  stocks: [],
  alerts: [],
  meta: {}
};

export const ALERT_TYPES = Object.freeze({
  HIGH_DRAWDOWN: 'high_drawdown',
  PURCHASE_LOSS: 'purchase_loss',
  TARGET_PRICE: 'target_price'
});

export const DEFAULT_ALERT_TYPE = ALERT_TYPES.HIGH_DRAWDOWN;

async function ensureDataDir(dataDir) {
  await fs.mkdir(dataDir, { recursive: true });
}

async function readJson(filePath, fallback) {
  try {
    const content = await fs.readFile(filePath, 'utf8');
    return JSON.parse(content);
  } catch (error) {
    if (error.code === 'ENOENT') {
      return fallback;
    }

    throw error;
  }
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
    symbol,
    displayName: String(input.displayName || '').trim(),
    purchasePrice: normalizeOptionalPositiveNumber(input.purchasePrice, '매수가는 0보다 큰 숫자여야 합니다.'),
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
    purchasePrice:
      stock.purchasePrice === undefined || stock.purchasePrice === null || stock.purchasePrice === ''
        ? null
        : Number.isFinite(purchasePrice)
          ? purchasePrice
          : null,
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

export class JsonStore {
  constructor(dataDir, defaults = {}) {
    this.dataDir = dataDir;
    this.filePath = path.join(dataDir, 'store.json');
    this.defaults = defaults;
    this.ready = ensureDataDir(dataDir);
  }

  async read() {
    await this.ready;
    const data = await readJson(this.filePath, emptyStore);

    return {
      stocks: Array.isArray(data.stocks) ? data.stocks.map(normalizeStoredStock) : [],
      alerts: Array.isArray(data.alerts) ? data.alerts : [],
      meta: data.meta && typeof data.meta === 'object' ? data.meta : {}
    };
  }

  async write(data) {
    await this.ready;
    await writeJson(this.filePath, data);
  }

  async listStocks() {
    const data = await this.read();
    return data.stocks;
  }

  async addStock(input) {
    const data = await this.read();
    const stock = normalizeStock(input, this.defaults);

    if (data.stocks.some((item) => item.symbol === stock.symbol)) {
      throw new Error('이미 등록된 종목입니다.');
    }

    data.stocks.push(stock);
    await this.write(data);
    return stock;
  }

  async updateStock(id, patch) {
    const data = await this.read();
    const index = data.stocks.findIndex((stock) => stock.id === id);

    if (index === -1) {
      throw new Error('종목을 찾을 수 없습니다.');
    }

    const updated = applyStockPatch(data.stocks[index], patch);
    data.stocks[index] = updated;
    await this.write(data);
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

  async deleteStock(id) {
    const data = await this.read();
    const beforeCount = data.stocks.length;
    data.stocks = data.stocks.filter((stock) => stock.id !== id);

    if (data.stocks.length === beforeCount) {
      throw new Error('종목을 찾을 수 없습니다.');
    }

    await this.write(data);
  }

  async listAlerts(limit = 50) {
    const data = await this.read();
    return data.alerts.slice(-limit).reverse();
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
}
