import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import {
  createBackup as createFileBackup,
  deleteBackup as deleteFileBackup,
  listBackups as listFileBackups,
  restoreBackup as restoreFileBackup
} from './backups.js';
import { buildDataModelInfo, normalizeStoreEnvelope, touchStoreEnvelope } from './dataModel.js';
import { normalizeKisMarketDivCode } from './kisMarket.js';
import { STORAGE_ENGINES } from './storageContract.js';
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

export function normalizeStock(input, defaults) {
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
    kisMarketDivCode: normalizeKisMarketDivCode(input.kisMarketDivCode),
    alertType,
    thresholdPercent,
    targetPrice,
    alertCooldownMinutes,
    active: true,
    highPrice: null,
    highPriceAt: null,
    highPriceSource: '',
    highPriceProvider: '',
    highPriceProviderLabel: '',
    highPriceDataDelay: '',
    highPriceVenue: '',
    highPriceSourceNote: '',
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
    quoteProviderLabel: '',
    quoteDataDelay: '',
    quoteVenue: '',
    quoteLicenseType: '',
    quoteSourceNote: '',
    quoteRegularMarketTime: null,
    investmentReason: String(input.investmentReason || '').trim(),
    investmentTargetPrice: normalizeOptionalPositiveNumber(
      input.investmentTargetPrice,
      '투자 목표가는 0보다 큰 숫자여야 합니다.'
    ),
    sellCondition: String(input.sellCondition || '').trim(),
    reviewDate: normalizeOptionalReviewDate(input.reviewDate),
    notes: String(input.notes || '').trim(),
    createdAt: now,
    updatedAt: now
  };

  validateAlertTypeFields(stock);
  return stock;
}

export function normalizeDevice(input) {
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

export function applyStockPatch(stock, patch) {
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

  if (patch.investmentReason !== undefined) {
    next.investmentReason = String(patch.investmentReason || '').trim();
  }

  if (patch.investmentTargetPrice !== undefined) {
    next.investmentTargetPrice = normalizeOptionalPositiveNumber(
      patch.investmentTargetPrice,
      '투자 목표가는 0보다 큰 숫자여야 합니다.'
    );
  }

  if (patch.sellCondition !== undefined) {
    next.sellCondition = String(patch.sellCondition || '').trim();
  }

  if (patch.reviewDate !== undefined) {
    next.reviewDate = normalizeOptionalReviewDate(patch.reviewDate);
  }

  if (patch.kisMarketDivCode !== undefined) {
    next.kisMarketDivCode = normalizeKisMarketDivCode(patch.kisMarketDivCode);
    alertConditionChanged = true;
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
    next.highPriceProvider = '';
    next.highPriceProviderLabel = '';
    next.highPriceDataDelay = '';
    next.highPriceVenue = '';
    next.highPriceSourceNote = '';
    next.lastAlertAt = null;
    alertConditionChanged = true;
  }

  if (alertConditionChanged) {
    resetAlertState(next);
  }

  validateAlertTypeFields(next);
  return next;
}

export function normalizeStoredStock(stock) {
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
    kisMarketDivCode: normalizeKisMarketDivCode(stock.kisMarketDivCode, { fallback: '' }),
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
    highPriceProvider: stock.highPriceProvider || '',
    highPriceProviderLabel: stock.highPriceProviderLabel || '',
    highPriceDataDelay: stock.highPriceDataDelay || '',
    highPriceVenue: stock.highPriceVenue || '',
    highPriceSourceNote: stock.highPriceSourceNote || '',
    lastCheckStatus: stock.lastCheckStatus || (stock.lastCheckedAt ? 'checked' : 'pending'),
    lastError: stock.lastError || '',
    lastErrorAt: stock.lastErrorAt || null,
    quoteProvider: stock.quoteProvider || '',
    quoteProviderLabel: stock.quoteProviderLabel || '',
    quoteDataDelay: stock.quoteDataDelay || '',
    quoteVenue: stock.quoteVenue || '',
    quoteLicenseType: stock.quoteLicenseType || '',
    quoteSourceNote: stock.quoteSourceNote || '',
    quoteRegularMarketTime: normalizeIsoDateTime(stock.quoteRegularMarketTime) || null,
    investmentReason: String(stock.investmentReason || '').trim(),
    investmentTargetPrice: normalizeOptionalStoredPositiveNumber(stock.investmentTargetPrice),
    sellCondition: String(stock.sellCondition || '').trim(),
    reviewDate: normalizeStoredOptionalDate(stock.reviewDate),
    notes: String(stock.notes || '').trim(),
    alertState: normalizeAlertState(stock.alertState),
    alertStartedAt: stock.alertStartedAt || null,
    alertRecoveredAt: stock.alertRecoveredAt || null,
    alertRepeatCount: normalizeNonNegativeInteger(stock.alertRepeatCount),
    lastAlertPrice: normalizeOptionalStoredNumber(stock.lastAlertPrice),
    lastAlertThresholdPrice: normalizeOptionalStoredNumber(stock.lastAlertThresholdPrice),
    lastAlertMetricPercent: normalizeOptionalStoredNumber(stock.lastAlertMetricPercent)
  };
}

export function normalizeStoredDevice(device) {
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

function normalizeOptionalStoredPositiveNumber(value) {
  const number = normalizeOptionalStoredNumber(value);

  return number !== null && number > 0 ? number : null;
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

function normalizeQuoteProviderAttempt(value) {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const provider = String(value.provider || '').trim().toLowerCase();

  if (!provider) {
    return null;
  }

  const status = ['success', 'error', 'skipped'].includes(value.status)
    ? value.status
    : 'error';
  const type = ['quote', 'historical'].includes(value.type) ? value.type : 'quote';
  const finishedAt = normalizeIsoDateTime(value.finishedAt) || new Date().toISOString();
  const startedAt = normalizeIsoDateTime(value.startedAt) || finishedAt;
  const durationMs = normalizeNonNegativeInteger(Math.round(Number(value.durationMs || 0)));

  return {
    provider,
    type,
    symbol: normalizeSymbolInput(value.symbol) || String(value.symbol || '').trim().toUpperCase(),
    status,
    reason: String(value.reason || ''),
    error: String(value.error || ''),
    startedAt,
    finishedAt,
    durationMs,
    source: String(value.source || ''),
    stockId: String(value.stockId || '')
  };
}

function normalizeIsoDateTime(value) {
  if (!value) {
    return '';
  }

  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : '';
}

function normalizeQuoteProviderStats(value) {
  const rawProviders =
    value && typeof value === 'object' && value.providers && typeof value.providers === 'object'
      ? value.providers
      : {};
  const providers = {};

  for (const [provider, stat] of Object.entries(rawProviders)) {
    const normalized = normalizeQuoteProviderStat(provider, stat);

    if (normalized.provider) {
      providers[normalized.provider] = normalized;
    }
  }

  const recentAttempts = Array.isArray(value?.recentAttempts)
    ? value.recentAttempts.map(normalizeQuoteProviderAttempt).filter(Boolean).slice(0, 100)
    : [];

  return {
    updatedAt: normalizeIsoDateTime(value?.updatedAt) || null,
    providers,
    recentAttempts
  };
}

function normalizeQuoteProviderStat(provider, value = {}) {
  const name = String(value.provider || provider || '').trim().toLowerCase();

  if (!name) {
    return {
      provider: ''
    };
  }

  const success = normalizeNonNegativeInteger(value.success);
  const error = normalizeNonNegativeInteger(value.error);
  const skipped = normalizeNonNegativeInteger(value.skipped);
  const attempts = normalizeNonNegativeInteger(value.attempts || success + error + skipped);
  const measuredAttempts = success + error;
  const totalDurationMs = normalizeNonNegativeInteger(value.totalDurationMs);
  const averageDurationMs =
    measuredAttempts > 0 ? Math.round(totalDurationMs / measuredAttempts) : 0;
  const failureRatePercent = measuredAttempts > 0 ? (error / measuredAttempts) * 100 : 0;

  return {
    provider: name,
    attempts,
    success,
    error,
    skipped,
    totalDurationMs,
    averageDurationMs,
    failureRatePercent,
    lastStatus: ['success', 'error', 'skipped'].includes(value.lastStatus)
      ? value.lastStatus
      : '',
    lastType: ['quote', 'historical'].includes(value.lastType) ? value.lastType : '',
    lastSymbol: String(value.lastSymbol || ''),
    lastReason: String(value.lastReason || ''),
    lastError: String(value.lastError || ''),
    lastCheckedAt: normalizeIsoDateTime(value.lastCheckedAt) || null,
    lastSuccessAt: normalizeIsoDateTime(value.lastSuccessAt) || null,
    lastErrorAt: normalizeIsoDateTime(value.lastErrorAt) || null
  };
}

export function updateQuoteProviderStats(value, rawAttempt) {
  const stats = normalizeQuoteProviderStats(value);
  const attempt = normalizeQuoteProviderAttempt(rawAttempt);

  if (!attempt) {
    return stats;
  }

  const current = normalizeQuoteProviderStat(
    attempt.provider,
    stats.providers[attempt.provider]
  );
  const next = {
    ...current,
    attempts: current.attempts + 1,
    lastStatus: attempt.status,
    lastType: attempt.type,
    lastSymbol: attempt.symbol,
    lastReason: attempt.reason,
    lastError: attempt.error,
    lastCheckedAt: attempt.finishedAt
  };

  if (attempt.status === 'success') {
    next.success += 1;
    next.lastSuccessAt = attempt.finishedAt;
    next.totalDurationMs += attempt.durationMs;
  } else if (attempt.status === 'error') {
    next.error += 1;
    next.lastErrorAt = attempt.finishedAt;
    next.totalDurationMs += attempt.durationMs;
  } else {
    next.skipped += 1;
  }

  const measuredAttempts = next.success + next.error;
  next.averageDurationMs =
    measuredAttempts > 0 ? Math.round(next.totalDurationMs / measuredAttempts) : 0;
  next.failureRatePercent =
    measuredAttempts > 0 ? (next.error / measuredAttempts) * 100 : 0;

  stats.providers[attempt.provider] = next;
  stats.recentAttempts = [attempt, ...stats.recentAttempts].slice(0, 100);
  stats.updatedAt = attempt.finishedAt;

  return stats;
}

export function buildQuoteProviderStatsSnapshot(value) {
  const stats = normalizeQuoteProviderStats(value);

  return {
    updatedAt: stats.updatedAt,
    providers: Object.values(stats.providers).sort((left, right) => {
      const leftTime = new Date(left.lastCheckedAt || 0).getTime();
      const rightTime = new Date(right.lastCheckedAt || 0).getTime();
      return rightTime - leftTime || left.provider.localeCompare(right.provider);
    }),
    recentAttempts: stats.recentAttempts
  };
}

function normalizeHistoryLimit(value, fallback = 20) {
  const number = Math.trunc(Number(value));

  if (!Number.isFinite(number) || number < 1) {
    return fallback;
  }

  return Math.min(number, 100);
}

function normalizeKisNaverCompareMarkets(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((market) => ({
      code: String(market?.code || '').trim().toUpperCase(),
      label: String(market?.label || '').trim()
    }))
    .filter((market) => market.code)
    .slice(0, 5);
}

function normalizeKisNaverCompareQuote(source = {}) {
  const quote = source?.quote && typeof source.quote === 'object' ? source.quote : source;

  return {
    ok: Boolean(source?.ok),
    price: normalizeOptionalStoredNumber(quote?.price),
    currency: String(quote?.currency || '').trim(),
    provider: String(quote?.provider || '').trim(),
    providerLabel: String(quote?.providerLabel || '').trim(),
    exchange: String(quote?.exchange || '').trim(),
    regularMarketTime: normalizeIsoDateTime(quote?.regularMarketTime) || null,
    error: String(source?.error || '').trim()
  };
}

function normalizeKisNaverDriftStatus(value, fallback = 'not_comparable') {
  const status = String(value || '').trim();

  return ['normal', 'warning', 'critical', 'not_comparable'].includes(status)
    ? status
    : fallback;
}

function normalizeKisNaverCompareHistoryResult(value = {}) {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const quote = value.quote && typeof value.quote === 'object' ? value.quote : {};
  const comparison = value.comparison && typeof value.comparison === 'object' ? value.comparison : value;
  const drift = value.drift && typeof value.drift === 'object' ? value.drift : value;
  const market = String(value.market || '').trim().toUpperCase();

  if (!market) {
    return null;
  }

  const comparable = Boolean(comparison.comparable);

  return {
    market,
    marketLabel: String(value.marketLabel || '').trim(),
    ok: Boolean(value.ok),
    comparable,
    price: normalizeOptionalStoredNumber(quote.price ?? value.price),
    currency: String(quote.currency || value.currency || '').trim(),
    difference: normalizeOptionalStoredNumber(comparison.difference ?? value.difference),
    differencePercent: normalizeOptionalStoredNumber(
      comparison.differencePercent ?? value.differencePercent
    ),
    absoluteDifference: normalizeOptionalStoredNumber(
      comparison.absoluteDifference ?? value.absoluteDifference
    ),
    absoluteDifferencePercent: normalizeOptionalStoredNumber(
      drift.absoluteDifferencePercent ?? value.absoluteDifferencePercent
    ),
    driftStatus: normalizeKisNaverDriftStatus(
      drift.status || value.driftStatus,
      comparable ? 'normal' : 'not_comparable'
    ),
    abnormal: Boolean(drift.abnormal ?? value.abnormal),
    error: String(value.error || comparison.reason || '').trim()
  };
}

function normalizeKisNaverCompareHistorySummary(value = {}) {
  const summary = value && typeof value === 'object' ? value : {};

  return {
    total: normalizeNonNegativeInteger(summary.total),
    kisSuccess: normalizeNonNegativeInteger(summary.kisSuccess),
    kisFailed: normalizeNonNegativeInteger(summary.kisFailed),
    comparable: normalizeNonNegativeInteger(summary.comparable)
  };
}

function normalizeKisNaverCompareHistoryDrift(value = {}) {
  const drift = value && typeof value === 'object' ? value : {};

  return {
    thresholdPercent: normalizeOptionalStoredNumber(drift.thresholdPercent),
    status: normalizeKisNaverDriftStatus(drift.status),
    comparable: normalizeNonNegativeInteger(drift.comparable),
    normal: normalizeNonNegativeInteger(drift.normal),
    warning: normalizeNonNegativeInteger(drift.warning),
    critical: normalizeNonNegativeInteger(drift.critical),
    abnormal: normalizeNonNegativeInteger(drift.abnormal),
    maxAbsoluteDifferencePercent: normalizeOptionalStoredNumber(
      drift.maxAbsoluteDifferencePercent
    ),
    worstMarket: String(drift.worstMarket || '').trim(),
    worstMarketLabel: String(drift.worstMarketLabel || '').trim(),
    message: String(drift.message || '').trim()
  };
}

function normalizeKisNaverCompareRecommendation(value = null) {
  if (!value || typeof value !== 'object' || !value.market) {
    return null;
  }

  return {
    market: String(value.market || '').trim().toUpperCase(),
    marketLabel: String(value.marketLabel || '').trim(),
    difference: normalizeOptionalStoredNumber(value.difference),
    differencePercent: normalizeOptionalStoredNumber(value.differencePercent),
    absoluteDifference: normalizeOptionalStoredNumber(value.absoluteDifference),
    reason: String(value.reason || '').trim()
  };
}

export function normalizeKisNaverCompareHistoryEntry(value = {}) {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const createdAt =
    normalizeIsoDateTime(value.createdAt) ||
    normalizeIsoDateTime(value.generatedAt) ||
    new Date().toISOString();
  const generatedAt = normalizeIsoDateTime(value.generatedAt) || createdAt;
  const symbol =
    normalizeSymbolInput(value.symbol) || String(value.symbol || '').trim().toUpperCase();
  const results = Array.isArray(value.results)
    ? value.results.map(normalizeKisNaverCompareHistoryResult).filter(Boolean)
    : [];

  return {
    id: String(value.id || randomUUID()).trim(),
    createdAt,
    generatedAt,
    symbol,
    inputSymbol: String(value.inputSymbol || '').trim(),
    ok: Boolean(value.ok),
    message: String(value.message || '').trim(),
    markets: normalizeKisNaverCompareMarkets(value.markets),
    summary: normalizeKisNaverCompareHistorySummary(value.summary),
    drift: normalizeKisNaverCompareHistoryDrift(value.drift),
    recommendation: normalizeKisNaverCompareRecommendation(value.recommendation),
    naver: normalizeKisNaverCompareQuote(value.naver),
    results
  };
}

function normalizeKisNaverCompareHistory(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map(normalizeKisNaverCompareHistoryEntry).filter(Boolean).slice(0, 100);
}

export function appendKisNaverCompareHistory(value, entry, options = {}) {
  const limit = normalizeHistoryLimit(options.limit ?? options.maxEntries, 100);
  const nextEntry = normalizeKisNaverCompareHistoryEntry(entry);
  const history = normalizeKisNaverCompareHistory(value);

  if (!nextEntry) {
    return history.slice(0, limit);
  }

  return [nextEntry, ...history.filter((item) => item.id !== nextEntry.id)].slice(0, limit);
}

export function buildKisNaverCompareHistorySnapshot(value, limit = 20) {
  return normalizeKisNaverCompareHistory(value).slice(0, normalizeHistoryLimit(limit, 20));
}

function getKisNaverTrendStatusRank(status) {
  if (status === 'critical') {
    return 3;
  }

  if (status === 'warning') {
    return 2;
  }

  if (status === 'normal') {
    return 1;
  }

  return 0;
}

function getKisNaverTrendStatusFromRank(rank) {
  if (rank >= 3) {
    return 'critical';
  }

  if (rank >= 2) {
    return 'warning';
  }

  if (rank >= 1) {
    return 'normal';
  }

  return 'not_comparable';
}

function roundTrendMetric(value) {
  const number = Number(value);

  return Number.isFinite(number) ? Math.round(number * 100) / 100 : null;
}

function createKisNaverTrendAccumulator(market, marketLabel) {
  return {
    market,
    marketLabel,
    sampleCount: 0,
    comparableCount: 0,
    normalCount: 0,
    warningCount: 0,
    criticalCount: 0,
    abnormalCount: 0,
    recommendedCount: 0,
    sumAbsoluteDifferencePercent: 0,
    maxAbsoluteDifferencePercent: null,
    minAbsoluteDifferencePercent: null,
    latestAt: null,
    latestStatus: 'not_comparable',
    latestAbsoluteDifferencePercent: null,
    latestDifferencePercent: null,
    latestSymbol: ''
  };
}

function finalizeKisNaverTrendMarket(accumulator) {
  const comparableCount = accumulator.comparableCount;
  const averageAbsoluteDifferencePercent =
    comparableCount > 0
      ? accumulator.sumAbsoluteDifferencePercent / comparableCount
      : null;
  const abnormalRatePercent =
    comparableCount > 0 ? (accumulator.abnormalCount / comparableCount) * 100 : null;
  const recommendationRatePercent =
    accumulator.sampleCount > 0
      ? (accumulator.recommendedCount / accumulator.sampleCount) * 100
      : null;
  const repeatedAbnormal = accumulator.abnormalCount >= 2;

  return {
    market: accumulator.market,
    marketLabel: accumulator.marketLabel,
    sampleCount: accumulator.sampleCount,
    comparableCount,
    normalCount: accumulator.normalCount,
    warningCount: accumulator.warningCount,
    criticalCount: accumulator.criticalCount,
    abnormalCount: accumulator.abnormalCount,
    repeatedAbnormal,
    recommendedCount: accumulator.recommendedCount,
    recommendationRatePercent: roundTrendMetric(recommendationRatePercent),
    averageAbsoluteDifferencePercent: roundTrendMetric(averageAbsoluteDifferencePercent),
    maxAbsoluteDifferencePercent: roundTrendMetric(accumulator.maxAbsoluteDifferencePercent),
    minAbsoluteDifferencePercent: roundTrendMetric(accumulator.minAbsoluteDifferencePercent),
    abnormalRatePercent: roundTrendMetric(abnormalRatePercent),
    latestAt: accumulator.latestAt,
    latestStatus: accumulator.latestStatus,
    latestAbsoluteDifferencePercent: roundTrendMetric(
      accumulator.latestAbsoluteDifferencePercent
    ),
    latestDifferencePercent: roundTrendMetric(accumulator.latestDifferencePercent),
    latestSymbol: accumulator.latestSymbol,
    status:
      comparableCount === 0
        ? 'not_comparable'
        : repeatedAbnormal
          ? 'critical'
          : getKisNaverTrendStatusFromRank(
              Math.max(
                getKisNaverTrendStatusRank(accumulator.latestStatus),
                accumulator.criticalCount > 0 ? 3 : accumulator.warningCount > 0 ? 2 : 1
              )
            )
  };
}

function sortKisNaverTrendMarkets(left, right) {
  const order = {
    J: 1,
    NX: 2,
    UN: 3
  };

  return (order[left.market] || 99) - (order[right.market] || 99) || left.market.localeCompare(right.market);
}

function findKisNaverStableTrendMarket(markets) {
  return markets
    .filter((market) => market.comparableCount > 0)
    .sort((left, right) => {
      const leftAverage = left.averageAbsoluteDifferencePercent ?? Number.POSITIVE_INFINITY;
      const rightAverage = right.averageAbsoluteDifferencePercent ?? Number.POSITIVE_INFINITY;

      return (
        leftAverage - rightAverage ||
        left.abnormalCount - right.abnormalCount ||
        right.recommendedCount - left.recommendedCount ||
        sortKisNaverTrendMarkets(left, right)
      );
    })[0] || null;
}

export function buildKisNaverCompareTrendSnapshot(value, limit = 100) {
  const history = buildKisNaverCompareHistorySnapshot(value, limit);
  const marketMap = new Map();

  for (const entry of history) {
    const recommendationMarket = String(entry.recommendation?.market || '').trim().toUpperCase();
    const createdAt = entry.createdAt || entry.generatedAt || null;

    for (const result of entry.results || []) {
      const market = String(result.market || '').trim().toUpperCase();

      if (!market) {
        continue;
      }

      const marketLabel = result.marketLabel || market;
      const accumulator =
        marketMap.get(market) || createKisNaverTrendAccumulator(market, marketLabel);
      const differencePercent = normalizeOptionalStoredNumber(result.differencePercent);
      const absoluteDifferencePercent =
        normalizeOptionalStoredNumber(result.absoluteDifferencePercent) ??
        (differencePercent === null ? null : Math.abs(differencePercent));
      const status = normalizeKisNaverDriftStatus(result.driftStatus);

      accumulator.marketLabel = accumulator.marketLabel || marketLabel;
      accumulator.sampleCount += 1;

      if (recommendationMarket === market) {
        accumulator.recommendedCount += 1;
      }

      if (result.comparable && absoluteDifferencePercent !== null) {
        accumulator.comparableCount += 1;
        accumulator.sumAbsoluteDifferencePercent += absoluteDifferencePercent;
        accumulator.maxAbsoluteDifferencePercent =
          accumulator.maxAbsoluteDifferencePercent === null
            ? absoluteDifferencePercent
            : Math.max(accumulator.maxAbsoluteDifferencePercent, absoluteDifferencePercent);
        accumulator.minAbsoluteDifferencePercent =
          accumulator.minAbsoluteDifferencePercent === null
            ? absoluteDifferencePercent
            : Math.min(accumulator.minAbsoluteDifferencePercent, absoluteDifferencePercent);

        if (status === 'critical') {
          accumulator.criticalCount += 1;
        } else if (status === 'warning') {
          accumulator.warningCount += 1;
        } else {
          accumulator.normalCount += 1;
        }

        if (result.abnormal || status === 'warning' || status === 'critical') {
          accumulator.abnormalCount += 1;
        }

        if (!accumulator.latestAt) {
          accumulator.latestAt = createdAt;
          accumulator.latestStatus = status;
          accumulator.latestAbsoluteDifferencePercent = absoluteDifferencePercent;
          accumulator.latestDifferencePercent = differencePercent;
          accumulator.latestSymbol = entry.symbol || entry.inputSymbol || '';
        }
      }

      marketMap.set(market, accumulator);
    }
  }

  const markets = [...marketMap.values()]
    .map(finalizeKisNaverTrendMarket)
    .sort(sortKisNaverTrendMarkets);
  const stableMarket = findKisNaverStableTrendMarket(markets);

  return {
    generatedAt: history[0]?.createdAt || history[0]?.generatedAt || null,
    historyCount: history.length,
    marketCount: markets.length,
    comparableCount: markets.reduce((sum, market) => sum + market.comparableCount, 0),
    repeatedAbnormalMarkets: markets.filter((market) => market.repeatedAbnormal).length,
    stableMarket: stableMarket
      ? {
          market: stableMarket.market,
          marketLabel: stableMarket.marketLabel,
          averageAbsoluteDifferencePercent: stableMarket.averageAbsoluteDifferencePercent,
          abnormalCount: stableMarket.abnormalCount,
          recommendedCount: stableMarket.recommendedCount
        }
      : null,
    markets
  };
}

export function normalizeDeviceId(value) {
  const id = String(value || '').trim();
  return id || null;
}

function normalizeDevicePlatform(value) {
  const platform = String(value || 'unknown').trim().toLowerCase();
  const allowed = ['ios', 'android', 'web', 'unknown'];

  return allowed.includes(platform) ? platform : 'unknown';
}

export function createDeviceSecret() {
  return randomBytes(32).toString('base64url');
}

export function hashDeviceSecret(secret) {
  return createHash('sha256').update(String(secret || '')).digest('hex');
}

export function normalizePushToken(input) {
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
  return normalizeOptionalDateField(value, '구매일 형식이 올바르지 않습니다.');
}

function normalizeOptionalReviewDate(value) {
  return normalizeOptionalDateField(value, '점검일 형식이 올바르지 않습니다.');
}

function normalizeStoredOptionalDate(value) {
  try {
    return normalizeOptionalDateField(value, '날짜 형식이 올바르지 않습니다.');
  } catch {
    return '';
  }
}

function normalizeOptionalDateField(value, errorMessage) {
  if (value === undefined || value === null || value === '') {
    return '';
  }

  const raw = String(value).trim();
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);

  if (!match) {
    throw new Error(errorMessage);
  }

  const parsed = new Date(`${raw}T00:00:00.000Z`);

  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== raw) {
    throw new Error(errorMessage);
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
    this.engine = STORAGE_ENGINES.JSON;
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
    const data = normalizeStoreEnvelope(await readJson(this.filePath, emptyStore));

    return {
      devices: Array.isArray(data.devices) ? data.devices.map(normalizeStoredDevice) : [],
      stocks: Array.isArray(data.stocks) ? data.stocks.map(normalizeStoredStock) : [],
      alerts: Array.isArray(data.alerts) ? data.alerts : [],
      meta: data.meta
    };
  }

  async write(data) {
    await this.ready;
    await writeJson(this.filePath, touchStoreEnvelope(data));
  }

  async getDataModelInfo() {
    const data = await this.read();
    return buildDataModelInfo(data);
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

  async listDevicePushTokens(deviceId, options = {}) {
    const data = await this.read();
    const id = String(deviceId || '').trim();
    const provider = String(options.provider || '').trim().toLowerCase();
    const enabledOnly = options.enabledOnly !== false;
    const device = data.devices.find((item) => item.id === id);

    if (!device) {
      return [];
    }

    return device.pushTokens
      .map(normalizePushToken)
      .filter((token) => token.token)
      .filter((token) => !provider || token.provider === provider)
      .filter((token) => !enabledOnly || token.enabled)
      .map((token) => ({
        ...token,
        deviceId: device.id,
        deviceLabel: device.label
      }));
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

  async getQuoteProviderStats() {
    const data = await this.read();
    return buildQuoteProviderStatsSnapshot(data.meta.quoteProviderStats);
  }

  async recordQuoteProviderAttempt(attempt) {
    const data = await this.read();
    data.meta = {
      ...data.meta,
      quoteProviderStats: updateQuoteProviderStats(data.meta.quoteProviderStats, attempt)
    };
    await this.write(data);
    return buildQuoteProviderStatsSnapshot(data.meta.quoteProviderStats);
  }

  async getKisNaverCompareHistory(limit = 20) {
    const data = await this.read();
    return buildKisNaverCompareHistorySnapshot(data.meta.kisNaverCompareHistory, limit);
  }

  async recordKisNaverCompareHistory(entry, options = {}) {
    const data = await this.read();
    data.meta = {
      ...data.meta,
      kisNaverCompareHistory: appendKisNaverCompareHistory(
        data.meta.kisNaverCompareHistory,
        entry,
        { limit: options.maxEntries || 100 }
      )
    };
    await this.write(data);
    return buildKisNaverCompareHistorySnapshot(
      data.meta.kisNaverCompareHistory,
      options.returnLimit || options.limit || 20
    );
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
    return createFileBackup(this.dataDir, {
      reason,
      maxBackups: this.backups.maxBackups,
      readSnapshot: () => this.exportBackupSnapshot()
    });
  }

  async listBackups(options = {}) {
    await this.ready;
    return listFileBackups(this.dataDir, options);
  }

  async restoreBackup(target, options = {}) {
    await this.ready;
    return restoreFileBackup(this.dataDir, target, {
      ...options,
      maxBackups: options.maxBackups ?? this.backups.maxBackups,
      readSnapshot: () => this.exportBackupSnapshot(),
      applySnapshot: (snapshot) => this.importBackupSnapshot(snapshot)
    });
  }

  async deleteBackup(target) {
    await this.ready;
    return deleteFileBackup(this.dataDir, target);
  }

  async exportBackupSnapshot() {
    return this.read();
  }

  async importBackupSnapshot(snapshot) {
    await this.ready;
    const data = normalizeStoreEnvelope(snapshot);
    await writeJson(this.filePath, data);
    return data;
  }
}

export function stockMatchesDevice(stock, deviceId) {
  if (deviceId === undefined) {
    return true;
  }

  return normalizeDeviceId(stock.deviceId) === normalizeDeviceId(deviceId);
}

export function sanitizeDevice(device) {
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
