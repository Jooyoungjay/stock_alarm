import { fetchHistoricalHighSince, fetchQuote, getQuoteSourceMeta } from './priceProvider.js';
import { resolveKisMarketDivCode } from './kisMarket.js';
import { ALERT_TYPES, DEFAULT_ALERT_TYPE, POSITION_STATUSES, normalizeAlertType } from './storage.js';
import { formatAlertMessage, isTelegramConfigured, sendTelegramMessage } from './telegram.js';

const alertTypeLabels = {
  [ALERT_TYPES.HIGH_DRAWDOWN]: '최고가 대비 하락률',
  [ALERT_TYPES.PROFIT_RETRACEMENT]: '이익금 반납률',
  [ALERT_TYPES.PURCHASE_LOSS]: '매수가 대비 손절률',
  [ALERT_TYPES.TARGET_PRICE]: '직접 기준가'
};

function getStockKisMarketDivCode(stock, config = {}) {
  return resolveKisMarketDivCode(stock?.kisMarketDivCode, config.kisMarketDivCode || 'J');
}

function isSoldPosition(stock) {
  return stock?.positionStatus === POSITION_STATUSES.SOLD;
}

function getAlertSnoozeUntil(stock) {
  const time = new Date(stock?.alertSnoozedUntil || 0).getTime();
  return Number.isFinite(time) && time > 0 ? time : 0;
}

export function isAlertSnoozed(stock, now = new Date()) {
  const until = getAlertSnoozeUntil(stock);
  return until > now.getTime();
}

export function calculateDrawdownPercent(highPrice, currentPrice) {
  const high = Number(highPrice);
  const current = Number(currentPrice);

  if (!Number.isFinite(high) || high <= 0 || !Number.isFinite(current)) {
    return 0;
  }

  return Math.max(0, ((high - current) / high) * 100);
}

export function calculateThresholdPrice(highPrice, thresholdPercent) {
  const high = Number(highPrice);
  const threshold = Number(thresholdPercent);

  if (!Number.isFinite(high) || !Number.isFinite(threshold)) {
    return null;
  }

  return high * (1 - threshold / 100);
}

export function calculateProfitRetracementThreshold(highPrice, purchasePrice, retracementPercent) {
  const high = Number(highPrice);
  const purchase = Number(purchasePrice);
  const retracement = Number(retracementPercent);

  if (
    !Number.isFinite(high) ||
    high <= 0 ||
    !Number.isFinite(purchase) ||
    purchase <= 0 ||
    !Number.isFinite(retracement) ||
    high <= purchase
  ) {
    return null;
  }

  return high - (high - purchase) * (retracement / 100);
}

export function calculateProfitRetracementPercent(highPrice, purchasePrice, currentPrice) {
  const high = Number(highPrice);
  const purchase = Number(purchasePrice);
  const current = Number(currentPrice);

  if (
    !Number.isFinite(high) ||
    high <= 0 ||
    !Number.isFinite(purchase) ||
    purchase <= 0 ||
    !Number.isFinite(current) ||
    high <= purchase
  ) {
    return 0;
  }

  return Math.max(0, ((high - current) / (high - purchase)) * 100);
}

export function calculateMaximumProfitAmount(highPrice, purchasePrice, quantity) {
  const high = Number(highPrice);
  const purchase = Number(purchasePrice);
  const shares = Number(quantity);

  if (
    !Number.isFinite(high) ||
    !Number.isFinite(purchase) ||
    !Number.isFinite(shares) ||
    high <= 0 ||
    purchase <= 0 ||
    shares <= 0
  ) {
    return null;
  }

  return Math.max(0, (high - purchase) * shares);
}

export function buildProfitRetracementContext(stock, currentPrice) {
  const quantity = Number(stock.quantity);
  const purchasePrice = Number(stock.purchasePrice);
  const highPrice = Number(stock.highPrice);
  const current = Number(currentPrice);
  const maximumProfitAmount = calculateMaximumProfitAmount(highPrice, purchasePrice, quantity);

  if (
    maximumProfitAmount === null ||
    !Number.isFinite(current) ||
    current <= 0 ||
    !Number.isFinite(purchasePrice) ||
    purchasePrice <= 0 ||
    !Number.isFinite(quantity) ||
    quantity <= 0
  ) {
    return {
      maximumProfitAmount,
      maximumProfitPercent: null,
      currentProfitAmount: null,
      retracedProfitAmount: null,
      retracedProfitPercent: null
    };
  }

  const investmentAmount = purchasePrice * quantity;
  const currentProfitAmount = (current - purchasePrice) * quantity;
  const retracedProfitAmount = Math.max(0, maximumProfitAmount - currentProfitAmount);

  return {
    maximumProfitAmount,
    maximumProfitPercent:
      investmentAmount > 0 ? (maximumProfitAmount / investmentAmount) * 100 : null,
    currentProfitAmount,
    retracedProfitAmount,
    retracedProfitPercent:
      maximumProfitAmount > 0 ? (retracedProfitAmount / maximumProfitAmount) * 100 : null
  };
}

export function getAlertTypeLabel(alertType) {
  return alertTypeLabels[getNormalizedAlertType(alertType)] || alertTypeLabels[DEFAULT_ALERT_TYPE];
}

export function buildAlertRule(stock, currentPrice) {
  const alertType = getNormalizedAlertType(stock.alertType);
  const current = Number(currentPrice);

  if (!Number.isFinite(current) || current <= 0) {
    throw new Error('현재가가 올바르지 않습니다.');
  }

  if (alertType === ALERT_TYPES.TARGET_PRICE) {
    const targetPrice = Number(stock.targetPrice);

    if (!Number.isFinite(targetPrice) || targetPrice <= 0) {
      throw new Error('직접 기준가 알림은 기준가를 입력해야 합니다.');
    }

    const metricPercent = calculateDrawdownPercent(targetPrice, current);

    return {
      alertType,
      alertTypeLabel: getAlertTypeLabel(alertType),
      referencePrice: targetPrice,
      referenceLabel: '직접 기준가',
      thresholdLabel: '직접 기준가',
      metricLabel: '기준가 대비 하락률',
      metricPercent,
      drawdownPercent: metricPercent,
      thresholdPrice: targetPrice,
      thresholdPercent: null,
      isBelowThreshold: current <= targetPrice
    };
  }

  const thresholdPercent = normalizeRuleThresholdPercent(stock.thresholdPercent);

  if (alertType === ALERT_TYPES.PROFIT_RETRACEMENT) {
    const highPrice = Number(stock.highPrice);
    const purchasePrice = Number(stock.purchasePrice);

    if (!Number.isFinite(purchasePrice) || purchasePrice <= 0) {
      throw new Error('이익금 반납률 기준은 매수가가 필요합니다.');
    }

    if (!Number.isFinite(highPrice) || highPrice <= 0) {
      throw new Error('최고가 기준이 아직 계산되지 않았습니다.');
    }

    const thresholdPrice = calculateProfitRetracementThreshold(
      highPrice,
      purchasePrice,
      thresholdPercent
    );
    const metricPercent = calculateProfitRetracementPercent(highPrice, purchasePrice, current);

    return {
      alertType,
      alertTypeLabel: getAlertTypeLabel(alertType),
      referencePrice: highPrice,
      referenceLabel: stock.purchaseDate ? '구매일 이후 최고가' : '감시 최고가',
      thresholdLabel: `최고 이익금 ${thresholdPercent}% 반납`,
      metricLabel: '이익금 반납률',
      metricPercent,
      drawdownPercent: metricPercent,
      thresholdPrice,
      thresholdPercent,
      isBelowThreshold: thresholdPrice !== null && current <= thresholdPrice
    };
  }

  const referencePrice =
    alertType === ALERT_TYPES.PURCHASE_LOSS ? Number(stock.purchasePrice) : Number(stock.highPrice);

  if (!Number.isFinite(referencePrice) || referencePrice <= 0) {
    throw new Error(
      alertType === ALERT_TYPES.PURCHASE_LOSS
        ? '매수가 대비 손절률 기준은 매수가가 필요합니다.'
        : '최고가 기준이 아직 계산되지 않았습니다.'
    );
  }

  const thresholdPrice = calculateThresholdPrice(referencePrice, thresholdPercent);
  const metricPercent = calculateDrawdownPercent(referencePrice, current);

  return {
    alertType,
    alertTypeLabel: getAlertTypeLabel(alertType),
    referencePrice,
    referenceLabel:
      alertType === ALERT_TYPES.PURCHASE_LOSS
        ? '매수가'
        : stock.purchaseDate
          ? '구매일 이후 최고가'
          : '감시 최고가',
    thresholdLabel:
      alertType === ALERT_TYPES.PURCHASE_LOSS
        ? `매수가 -${thresholdPercent}%`
        : `${stock.purchaseDate ? '최고가' : '감시 최고가'} -${thresholdPercent}%`,
    metricLabel:
      alertType === ALERT_TYPES.PURCHASE_LOSS ? '매수가 대비 손실률' : '최고가 대비 하락률',
    metricPercent,
    drawdownPercent: metricPercent,
    thresholdPrice,
    thresholdPercent,
    isBelowThreshold: thresholdPrice !== null && current <= thresholdPrice
  };
}

function getNormalizedAlertType(alertType) {
  try {
    return normalizeAlertType(alertType);
  } catch {
    return DEFAULT_ALERT_TYPE;
  }
}

function normalizeRuleThresholdPercent(value) {
  const thresholdPercent = Number(value === undefined || value === null || value === '' ? 5 : value);

  if (!Number.isFinite(thresholdPercent) || thresholdPercent <= 0 || thresholdPercent >= 100) {
    throw new Error('하락률은 0보다 크고 100보다 작은 숫자여야 합니다.');
  }

  return thresholdPercent;
}

export function buildPurchaseHighBaseline(stock, historicalHigh) {
  const purchasePrice = Number(stock.purchasePrice);
  const purchasePriceIsHigher =
    Number.isFinite(purchasePrice) && purchasePrice > Number(historicalHigh.highPrice);

  if (purchasePriceIsHigher) {
    return {
      ...historicalHigh,
      highPrice: purchasePrice,
      highPriceAt: `${stock.purchaseDate}T00:00:00.000Z`,
      source: 'purchase_price'
    };
  }

  return {
    ...historicalHigh,
    source: 'historical_daily'
  };
}

export function buildMonitoringHighBaseline(stock, quote, now = new Date()) {
  const currentPrice = Number(quote.price);

  if (!Number.isFinite(currentPrice) || currentPrice <= 0) {
    throw new Error('현재가가 올바르지 않습니다.');
  }

  const purchasePrice = Number(stock.purchasePrice);
  const purchasePriceIsHigher = Number.isFinite(purchasePrice) && purchasePrice > currentPrice;
  const timestamp = quote.regularMarketTime || now.toISOString();

  return {
    symbol: quote.symbol || stock.symbol,
    highPrice: purchasePriceIsHigher ? purchasePrice : currentPrice,
    highPriceAt: timestamp,
    currency: quote.currency || stock.currency || '',
    exchange: quote.exchange || stock.exchange || '',
    provider: quote.provider || '',
    providerLabel: quote.providerLabel || '',
    dataDelay: quote.dataDelay || '',
    venue: quote.venue || '',
    licenseType: quote.licenseType || '',
    sourceNote: quote.sourceNote || '',
    source: purchasePriceIsHigher ? 'purchase_price' : 'monitoring_start'
  };
}

export function buildRegistrationPreview(input, quote, historicalHigh = null) {
  const currentPrice = Number(quote.price);

  if (!Number.isFinite(currentPrice) || currentPrice <= 0) {
    throw new Error('현재가가 올바르지 않습니다.');
  }

  const alertType = getNormalizedAlertType(input.alertType);
  const needsHistoricalHigh =
    alertType === ALERT_TYPES.HIGH_DRAWDOWN || alertType === ALERT_TYPES.PROFIT_RETRACEMENT;

  if (!historicalHigh && needsHistoricalHigh && input.purchaseDate) {
    return {
      quote,
      position: null
    };
  }

  const purchasePrice = Number(input.purchasePrice);
  const quantity = Number(input.quantity);
  const annualDividendPerShare = Number(input.annualDividendPerShare);

  if (
    (alertType === ALERT_TYPES.HIGH_DRAWDOWN ||
      alertType === ALERT_TYPES.PROFIT_RETRACEMENT ||
      alertType === ALERT_TYPES.PURCHASE_LOSS) &&
    (!Number.isFinite(purchasePrice) || purchasePrice <= 0)
  ) {
    throw new Error('매수가는 0보다 큰 숫자여야 합니다.');
  }

  const baseline = historicalHigh
    ? buildPurchaseHighBaseline(input, historicalHigh)
    : needsHistoricalHigh
      ? buildMonitoringHighBaseline(input, quote)
      : null;
  const alertRule = buildAlertRule(
    {
      ...input,
      alertType,
      purchasePrice: Number.isFinite(purchasePrice) ? purchasePrice : null,
      highPrice: baseline?.highPrice ?? null,
      targetPrice: input.targetPrice
    },
    currentPrice
  );
  const thresholdPrice = alertRule.thresholdPrice;
  const distanceToThreshold = thresholdPrice === null ? null : currentPrice - thresholdPrice;
  const distanceToThresholdPercent =
    thresholdPrice === null || currentPrice <= 0 ? null : (distanceToThreshold / currentPrice) * 100;
  const normalizedQuantity = Number.isFinite(quantity) && quantity > 0 ? quantity : null;
  const investmentAmount =
    normalizedQuantity && Number.isFinite(purchasePrice) && purchasePrice > 0
      ? normalizedQuantity * purchasePrice
      : null;
  const marketValue = normalizedQuantity ? normalizedQuantity * currentPrice : null;
  const unrealizedProfit =
    investmentAmount !== null && marketValue !== null ? marketValue - investmentAmount : null;
  const unrealizedProfitPercent =
    unrealizedProfit !== null && investmentAmount > 0 ? (unrealizedProfit / investmentAmount) * 100 : null;
  const profitContext = buildProfitRetracementContext(
    {
      ...input,
      purchasePrice,
      quantity: normalizedQuantity,
      highPrice: baseline?.highPrice ?? null
    },
    currentPrice
  );
  const normalizedAnnualDividendPerShare =
    Number.isFinite(annualDividendPerShare) && annualDividendPerShare > 0
      ? annualDividendPerShare
      : null;
  const expectedAnnualDividend =
    normalizedQuantity && normalizedAnnualDividendPerShare
      ? normalizedQuantity * normalizedAnnualDividendPerShare
      : null;
  const dividendYieldPercent =
    expectedAnnualDividend !== null && investmentAmount > 0
      ? (expectedAnnualDividend / investmentAmount) * 100
      : null;
  const dividendReturnAmount = expectedAnnualDividend ?? 0;
  const totalReturnAmount =
    unrealizedProfit !== null ? unrealizedProfit + dividendReturnAmount : null;
  const totalReturnPercent =
    totalReturnAmount !== null && investmentAmount > 0
      ? (totalReturnAmount / investmentAmount) * 100
      : null;
  const maximumTotalReturnAmount =
    profitContext.maximumProfitAmount !== null
      ? profitContext.maximumProfitAmount + dividendReturnAmount
      : null;
  const maximumTotalReturnPercent =
    maximumTotalReturnAmount !== null && investmentAmount > 0
      ? (maximumTotalReturnAmount / investmentAmount) * 100
      : null;
  const totalReturnRetracedAmount =
    maximumTotalReturnAmount !== null && totalReturnAmount !== null
      ? Math.max(0, maximumTotalReturnAmount - totalReturnAmount)
      : null;
  const totalReturnRetracedPercent =
    totalReturnRetracedAmount !== null && maximumTotalReturnAmount > 0
      ? (totalReturnRetracedAmount / maximumTotalReturnAmount) * 100
      : null;

  return {
    quote,
    position: {
      alertType,
      alertTypeLabel: alertRule.alertTypeLabel,
      purchasePrice: Number.isFinite(purchasePrice) ? purchasePrice : null,
      quantity: normalizedQuantity,
      investmentAmount,
      marketValue,
      unrealizedProfit,
      unrealizedProfitPercent,
      totalReturnAmount,
      totalReturnPercent,
      maximumProfitAmount: profitContext.maximumProfitAmount,
      maximumProfitPercent: profitContext.maximumProfitPercent,
      maximumTotalReturnAmount,
      maximumTotalReturnPercent,
      currentProfitAmount: profitContext.currentProfitAmount,
      retracedProfitAmount: profitContext.retracedProfitAmount,
      retracedProfitPercent: profitContext.retracedProfitPercent,
      totalReturnRetracedAmount,
      totalReturnRetracedPercent,
      annualDividendPerShare: normalizedAnnualDividendPerShare,
      expectedAnnualDividend,
      dividendYieldPercent,
      purchaseDate: input.purchaseDate,
      highPrice: baseline?.highPrice ?? null,
      highPriceAt: baseline?.highPriceAt ?? null,
      highPriceSource: baseline?.source ?? '',
      historicalHighPrice: historicalHigh?.highPrice ?? null,
      historicalHighAt: historicalHigh?.highPriceAt ?? null,
      referencePrice: alertRule.referencePrice,
      referenceLabel: alertRule.referenceLabel,
      targetPrice: alertType === ALERT_TYPES.TARGET_PRICE ? alertRule.thresholdPrice : null,
      thresholdPercent: alertRule.thresholdPercent,
      thresholdLabel: alertRule.thresholdLabel,
      thresholdPrice,
      metricLabel: alertRule.metricLabel,
      metricPercent: alertRule.metricPercent,
      drawdownPercent: alertRule.metricPercent,
      distanceToThreshold,
      distanceToThresholdPercent,
      alertNow: alertRule.isBelowThreshold,
      currency: baseline?.currency || quote.currency || '',
      provider: baseline?.provider || '',
      providerLabel: baseline?.providerLabel || '',
      dataDelay: baseline?.dataDelay || '',
      venue: baseline?.venue || '',
      licenseType: baseline?.licenseType || '',
      sourceNote: baseline?.sourceNote || ''
    }
  };
}

export function evaluateStock(stock, quote, now = new Date()) {
  const timestamp = now.toISOString();
  const currentPrice = Number(quote.price);

  if (!Number.isFinite(currentPrice) || currentPrice <= 0) {
    throw new Error('현재가가 올바르지 않습니다.');
  }

  const nextStock = {
    ...stock,
    lastPrice: currentPrice,
    lastCheckedAt: timestamp,
    currency: quote.currency || stock.currency || '',
    exchange: quote.exchange || stock.exchange || '',
    marketState: quote.marketState || stock.marketState || '',
    quoteProvider: quote.provider || stock.quoteProvider || '',
    quoteProviderLabel: quote.providerLabel || stock.quoteProviderLabel || '',
    quoteDataDelay: quote.dataDelay || stock.quoteDataDelay || '',
    quoteVenue: quote.venue || stock.quoteVenue || '',
    quoteLicenseType: quote.licenseType || stock.quoteLicenseType || '',
    quoteSourceNote: quote.sourceNote || stock.quoteSourceNote || '',
    quoteRegularMarketTime: quote.regularMarketTime || stock.quoteRegularMarketTime || null,
    updatedAt: timestamp
  };

  const existingHighPrice = Number(stock.highPrice);
  const hasExistingHighPrice = Number.isFinite(existingHighPrice) && existingHighPrice > 0;
  const baselineHigh = !hasExistingHighPrice && !stock.purchaseDate
    ? buildMonitoringHighBaseline(stock, quote, now)
    : null;
  const baselineHighPrice = Number(baselineHigh?.highPrice);
  const highUpdated =
    !hasExistingHighPrice ||
    (Number.isFinite(baselineHighPrice) && baselineHighPrice > existingHighPrice) ||
    currentPrice > existingHighPrice;

  if (highUpdated) {
    const nextHighPrice =
      baselineHigh && Number.isFinite(baselineHighPrice) && baselineHighPrice > currentPrice
        ? baselineHighPrice
        : currentPrice;
    const nextHighFromBaseline = baselineHigh && nextHighPrice === baselineHighPrice;

    nextStock.highPrice = nextHighPrice;
    nextStock.highPriceAt = nextHighFromBaseline ? baselineHigh.highPriceAt : timestamp;
    nextStock.highPriceSource = nextHighFromBaseline
      ? baselineHigh.source
      : quote.marketState === 'MANUAL_TEST'
        ? 'manual'
        : 'realtime';
    nextStock.highPriceProvider = quote.provider || stock.highPriceProvider || '';
    nextStock.highPriceProviderLabel = quote.providerLabel || stock.highPriceProviderLabel || '';
    nextStock.highPriceDataDelay = quote.dataDelay || stock.highPriceDataDelay || '';
    nextStock.highPriceVenue = quote.venue || stock.highPriceVenue || '';
    nextStock.highPriceSourceNote = quote.sourceNote || stock.highPriceSourceNote || '';
  }

  const alertRule = buildAlertRule(nextStock, currentPrice);
  const profitContext = buildProfitRetracementContext(nextStock, currentPrice);
  const highUpdatedByCurrentPrice = highUpdated && Number(nextStock.highPrice) === currentPrice;
  const suppressAlertForNewHigh =
    highUpdatedByCurrentPrice && alertRule.alertType === ALERT_TYPES.HIGH_DRAWDOWN;
  const isAlertConditionActive = !suppressAlertForNewHigh && alertRule.isBelowThreshold;
  const previousAlertState = stock.alertState === 'triggered' ? 'triggered' : 'clear';
  const recovered = previousAlertState === 'triggered' && !isAlertConditionActive;
  const lastAlertAt = stock.lastAlertAt ? new Date(stock.lastAlertAt).getTime() : 0;
  const cooldownMs = Number(stock.alertCooldownMinutes || 1) * 60 * 1000;
  const cooldownElapsed = !lastAlertAt || now.getTime() - lastAlertAt >= cooldownMs;
  const alertSnoozed = isAlertSnoozed(stock, now);
  const alertSuppressedReason = isSoldPosition(stock)
    ? 'sold'
    : !stock.active
      ? 'inactive'
      : alertSnoozed
        ? 'snoozed'
        : !cooldownElapsed
          ? 'cooldown'
          : '';
  const alertDue = Boolean(
    stock.active &&
      !alertSnoozed &&
      !isSoldPosition(stock) &&
      isAlertConditionActive &&
      cooldownElapsed
  );
  const previousRepeatCount = normalizeRepeatCount(stock.alertRepeatCount);
  const nextAlertRepeatCount = alertDue
    ? previousAlertState === 'triggered'
      ? previousRepeatCount + 1
      : 1
    : previousRepeatCount;

  if (isAlertConditionActive) {
    nextStock.alertState = 'triggered';
    nextStock.alertStartedAt =
      previousAlertState === 'triggered' ? stock.alertStartedAt || timestamp : timestamp;
    nextStock.alertRecoveredAt = previousAlertState === 'triggered' ? stock.alertRecoveredAt || null : null;
    nextStock.alertRepeatCount = nextAlertRepeatCount;
  } else {
    nextStock.alertState = 'clear';
    nextStock.alertStartedAt = null;
    nextStock.alertRepeatCount = 0;

    if (recovered) {
      nextStock.alertRecoveredAt = timestamp;
    }
  }

  return {
    nextStock,
    alertDue,
    alertSnoozed,
    alertSuppressedReason,
    highUpdated,
    recovered,
    isAlertConditionActive,
    alertRepeatCount: nextAlertRepeatCount,
    drawdownPercent: alertRule.metricPercent,
    thresholdPrice: alertRule.thresholdPrice,
    alertType: alertRule.alertType,
    alertTypeLabel: alertRule.alertTypeLabel,
    referencePrice: alertRule.referencePrice,
    referenceLabel: alertRule.referenceLabel,
    thresholdLabel: alertRule.thresholdLabel,
    metricLabel: alertRule.metricLabel,
    ...profitContext
  };
}

function normalizeRepeatCount(value) {
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 ? number : 0;
}

export async function initializeHighFromPurchaseDate(store, config, stock, options = {}) {
  if (!stock.purchaseDate) {
    return stock;
  }

  const highFetcher = options.fetchHistoricalHighSince || fetchHistoricalHighSince;
  const now = options.now || new Date();
  const historicalHigh = await highFetcher(stock.symbol, stock.purchaseDate, {
    timeoutMs: config.quoteTimeoutMs,
    providers: config.historicalQuoteProviders || config.quoteProviders,
    dataGoKrServiceKey: config.dataGoKrServiceKey,
    alphaVantageApiKey: config.alphaVantageApiKey,
    endDate: now,
    onProviderAttempt: (attempt) =>
      recordQuoteProviderAttempt(store, {
        ...attempt,
        stockId: stock.id,
        source: 'historical_high'
      })
  });
  const baselineHigh = buildPurchaseHighBaseline(stock, historicalHigh);
  const currentHigh = Number(stock.highPrice);
  const shouldUpdateHigh =
    !Number.isFinite(currentHigh) || currentHigh <= 0 || baselineHigh.highPrice >= currentHigh;
  const timestamp = now.toISOString();

  if (!shouldUpdateHigh) {
    return store.replaceStock({
      ...stock,
      lastCheckStatus: 'high_initialized',
      lastError: '',
      lastErrorAt: null,
      updatedAt: timestamp
    });
  }

  return store.replaceStock({
    ...stock,
    highPrice: baselineHigh.highPrice,
    highPriceAt: baselineHigh.highPriceAt,
    highPriceSource: baselineHigh.source,
    highPriceProvider: baselineHigh.provider || stock.highPriceProvider || '',
    highPriceProviderLabel: baselineHigh.providerLabel || stock.highPriceProviderLabel || '',
    highPriceDataDelay: baselineHigh.dataDelay || stock.highPriceDataDelay || '',
    highPriceVenue: baselineHigh.venue || stock.highPriceVenue || '',
    highPriceSourceNote: baselineHigh.sourceNote || stock.highPriceSourceNote || '',
    currency: baselineHigh.currency || stock.currency || '',
    exchange: baselineHigh.exchange || stock.exchange || '',
    quoteProvider: stock.quoteProvider || '',
    lastCheckStatus: 'high_initialized',
    lastError: '',
    lastErrorAt: null,
    updatedAt: timestamp
  });
}

async function markStockError(store, stock, error, now) {
  const timestamp = now.toISOString();
  const message = error.message || '가격 조회 중 오류가 발생했습니다.';

  await store.replaceStock({
    ...stock,
    lastCheckedAt: timestamp,
    lastCheckStatus: 'error',
    lastError: message,
    lastErrorAt: timestamp,
    updatedAt: timestamp
  });

  return {
    stockId: stock.id,
    symbol: stock.symbol,
    status: 'error',
    error: message
  };
}

async function processStockQuote(store, config, stock, quote, options = {}) {
  const telegramSender = options.sendTelegramMessage || sendTelegramMessage;
  const now = options.now || new Date();

  if (isSoldPosition(stock)) {
    return {
      stockId: stock.id,
      symbol: stock.symbol,
      status: 'skipped',
      reason: 'sold'
    };
  }

  if (!stock.active) {
    return {
      stockId: stock.id,
      symbol: stock.symbol,
      status: 'skipped',
      reason: 'inactive'
    };
  }

  try {
    const evaluation = evaluateStock(stock, quote, now);
    let nextStock = evaluation.nextStock;
    let deliveryStatus = 'none';
    let deliveryError = '';
    let telegramDeliveryStatus = 'none';
    let telegramDeliveryError = '';
    let pushDeliveryStatus = 'none';
    let pushDeliveryError = '';
    let pushDeliverySent = 0;
    let pushDeliveryFailed = 0;
    let alert = null;
    const status = evaluation.alertDue
      ? 'alert'
      : evaluation.recovered
        ? 'recovered'
        : evaluation.highUpdated
          ? 'high_updated'
          : 'checked';

    if (evaluation.alertDue) {
      const message = formatAlertMessage(
        nextStock,
        quote,
        evaluation.drawdownPercent,
        evaluation.thresholdPrice,
        evaluation
      );

      try {
        if (isTelegramConfigured(config)) {
          await telegramSender(config, message);
          telegramDeliveryStatus = 'sent';
        } else {
          telegramDeliveryStatus = 'not_configured';
          telegramDeliveryError = '텔레그램 설정이 없습니다.';
        }
      } catch (error) {
        telegramDeliveryStatus = 'failed';
        telegramDeliveryError = error.message;
      }

      deliveryStatus = telegramDeliveryStatus;
      deliveryError = telegramDeliveryError;

      nextStock = {
        ...nextStock,
        lastAlertAt: now.toISOString(),
        lastAlertPrice: quote.price,
        lastAlertThresholdPrice: evaluation.thresholdPrice,
        lastAlertMetricPercent: evaluation.drawdownPercent,
        alertRepeatCount: evaluation.alertRepeatCount
      };

      alert = await store.appendAlert({
        stockId: stock.id,
        deviceId: stock.deviceId || null,
        symbol: stock.symbol,
        displayName: stock.displayName || quote.name || stock.symbol,
        price: quote.price,
        currency: quote.currency || nextStock.currency || '',
        highPrice: nextStock.highPrice,
        alertType: evaluation.alertType,
        alertTypeLabel: evaluation.alertTypeLabel,
        thresholdPercent: stock.thresholdPercent,
        thresholdPrice: evaluation.thresholdPrice,
        metricLabel: evaluation.metricLabel,
        drawdownPercent: evaluation.drawdownPercent,
        maximumProfitAmount: evaluation.maximumProfitAmount,
        currentProfitAmount: evaluation.currentProfitAmount,
        retracedProfitAmount: evaluation.retracedProfitAmount,
        retracedProfitPercent: evaluation.retracedProfitPercent,
        alertState: nextStock.alertState,
        alertRepeatCount: evaluation.alertRepeatCount,
        lastRecoveredAt: nextStock.alertRecoveredAt,
        deliveryStatus,
        deliveryError,
        telegramDeliveryStatus,
        telegramDeliveryError,
        pushDeliveryStatus,
        pushDeliveryError,
        pushDeliverySent,
        pushDeliveryFailed,
        message,
        createdAt: now.toISOString()
      });
    }

    await store.replaceStock({
      ...nextStock,
      lastCheckStatus: status,
      lastError: '',
      lastErrorAt: null
    });

    return {
      stockId: stock.id,
      symbol: stock.symbol,
      status,
      price: quote.price,
      highPrice: nextStock.highPrice,
      alertType: evaluation.alertType,
      alertTypeLabel: evaluation.alertTypeLabel,
      alertState: nextStock.alertState,
      alertRepeatCount: nextStock.alertRepeatCount,
      alertSnoozed: evaluation.alertSnoozed,
      alertSuppressedReason: evaluation.alertSuppressedReason,
      recovered: evaluation.recovered,
      drawdownPercent: evaluation.drawdownPercent,
      thresholdPrice: evaluation.thresholdPrice,
      metricLabel: evaluation.metricLabel,
      maximumProfitAmount: evaluation.maximumProfitAmount,
      currentProfitAmount: evaluation.currentProfitAmount,
      retracedProfitAmount: evaluation.retracedProfitAmount,
      retracedProfitPercent: evaluation.retracedProfitPercent,
      deliveryStatus,
      telegramDeliveryStatus,
      pushDeliveryStatus,
      alert
    };
  } catch (error) {
    return markStockError(store, stock, error, now);
  }
}

export async function runAlertCheck(store, config, options = {}) {
  const quoteFetcher = options.fetchQuote || fetchQuote;
  const now = options.now || new Date();
  const stocks = await store.listStocks();
  const results = [];

  for (const stock of stocks) {
    if (isSoldPosition(stock)) {
      results.push({
        stockId: stock.id,
        symbol: stock.symbol,
        status: 'skipped',
        reason: 'sold'
      });
      continue;
    }

    if (!stock.active) {
      results.push({
        stockId: stock.id,
        symbol: stock.symbol,
        status: 'skipped',
        reason: 'inactive'
      });
      continue;
    }

    try {
      const quote = await quoteFetcher(stock.symbol, {
        timeoutMs: config.quoteTimeoutMs,
        providers: config.quoteProviders,
        dataGoKrServiceKey: config.dataGoKrServiceKey,
        alphaVantageApiKey: config.alphaVantageApiKey,
        nxtQuoteEndpointTemplate: config.nxtQuoteEndpointTemplate,
        nxtApiKey: config.nxtApiKey,
        nxtApiKeyHeader: config.nxtApiKeyHeader,
        nxtApiKeyScheme: config.nxtApiKeyScheme,
        kisApiBaseUrl: config.kisApiBaseUrl,
        kisAppKey: config.kisAppKey,
        kisAppSecret: config.kisAppSecret,
        kisAccessToken: config.kisAccessToken,
        kisMarketDivCode: getStockKisMarketDivCode(stock, config),
        kisCustType: config.kisCustType,
        kisTokenAutoRefresh: config.kisTokenAutoRefresh,
        kisTokenCachePath: config.kisTokenCachePath,
        onProviderAttempt: (attempt) =>
          recordQuoteProviderAttempt(store, {
            ...attempt,
            stockId: stock.id,
            source: 'alert_check'
          })
      });
      const result = await processStockQuote(store, config, stock, quote, {
        now,
        sendTelegramMessage: options.sendTelegramMessage
      });
      results.push(result);
    } catch (error) {
      results.push(await markStockError(store, stock, error, now));
    }
  }

  return {
    checkedAt: now.toISOString(),
    results
  };
}

export async function runStockQuoteRetry(store, config, stockId, options = {}) {
  const quoteFetcher = options.fetchQuote || fetchQuote;
  const now = options.now || new Date();
  const stocks = await store.listStocks();
  const stock = stocks.find((item) => item.id === stockId);

  if (!stock) {
    throw new Error('종목을 찾을 수 없습니다.');
  }

  if (isSoldPosition(stock)) {
    return {
      checkedAt: now.toISOString(),
      retry: true,
      results: [
        {
          stockId: stock.id,
          symbol: stock.symbol,
          status: 'skipped',
          reason: 'sold'
        }
      ]
    };
  }

  if (!stock.active) {
    return {
      checkedAt: now.toISOString(),
      retry: true,
      results: [
        {
          stockId: stock.id,
          symbol: stock.symbol,
          status: 'skipped',
          reason: 'inactive'
        }
      ]
    };
  }

  let result;

  try {
    const quote = await quoteFetcher(stock.symbol, {
      timeoutMs: config.quoteTimeoutMs,
      providers: config.quoteProviders,
      dataGoKrServiceKey: config.dataGoKrServiceKey,
      alphaVantageApiKey: config.alphaVantageApiKey,
      nxtQuoteEndpointTemplate: config.nxtQuoteEndpointTemplate,
      nxtApiKey: config.nxtApiKey,
      nxtApiKeyHeader: config.nxtApiKeyHeader,
      nxtApiKeyScheme: config.nxtApiKeyScheme,
      kisApiBaseUrl: config.kisApiBaseUrl,
      kisAppKey: config.kisAppKey,
      kisAppSecret: config.kisAppSecret,
      kisAccessToken: config.kisAccessToken,
      kisMarketDivCode: getStockKisMarketDivCode(stock, config),
      kisCustType: config.kisCustType,
      kisTokenAutoRefresh: config.kisTokenAutoRefresh,
      kisTokenCachePath: config.kisTokenCachePath,
      onProviderAttempt: (attempt) =>
        recordQuoteProviderAttempt(store, {
          ...attempt,
          stockId: stock.id,
          source: 'stock_retry'
        })
    });

    result = await processStockQuote(store, config, stock, quote, {
      now,
      sendTelegramMessage: options.sendTelegramMessage
    });
  } catch (error) {
    result = await markStockError(store, stock, error, now);
  }

  return {
    checkedAt: now.toISOString(),
    retry: true,
    results: [result]
  };
}

export async function runManualQuoteCheck(store, config, stockId, manualQuote, options = {}) {
  const now = options.now || new Date();
  const price = Number(manualQuote.price);

  if (!Number.isFinite(price) || price <= 0) {
    throw new Error('테스트 현재가는 0보다 큰 숫자여야 합니다.');
  }

  const stocks = await store.listStocks();
  const stock = stocks.find((item) => item.id === stockId);

  if (!stock) {
    throw new Error('종목을 찾을 수 없습니다.');
  }

  const quote = {
    symbol: stock.symbol,
    name: stock.displayName || stock.symbol,
    price,
    currency: manualQuote.currency || stock.currency || '',
    exchange: manualQuote.exchange || stock.exchange || 'Manual test',
    marketState: 'MANUAL_TEST',
    provider: 'manual',
    regularMarketTime: now.toISOString(),
    ...getQuoteSourceMeta('manual')
  };

  const result = await processStockQuote(store, config, stock, quote, {
    now,
    sendTelegramMessage: options.sendTelegramMessage
  });

  return {
    checkedAt: now.toISOString(),
    manual: true,
    results: [result]
  };
}

async function recordQuoteProviderAttempt(store, attempt) {
  if (typeof store.recordQuoteProviderAttempt !== 'function') {
    return;
  }

  await store.recordQuoteProviderAttempt(attempt);
}
