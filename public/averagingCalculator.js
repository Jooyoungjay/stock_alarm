export function buildAveragingPlan(input = {}) {
  const currentQuantity = normalizePositiveNumber(input.currentQuantity);
  const currentAveragePrice = normalizePositiveNumber(input.currentAveragePrice);
  const additionalQuantity = normalizePositiveNumber(input.additionalQuantity);
  const additionalPrice = normalizePositiveNumber(input.additionalPrice);
  const targetAveragePrice = normalizePositiveNumber(input.targetAveragePrice);
  const currentPrice = normalizePositiveNumber(input.currentPrice);
  const highPrice = normalizePositiveNumber(input.highPrice);
  const thresholdPercent = normalizePercent(input.thresholdPercent);
  const alertType = normalizeAlertType(input.alertType);
  const targetPrice = normalizePositiveNumber(input.targetPrice);

  const currentInvestment =
    currentQuantity !== null && currentAveragePrice !== null
      ? currentQuantity * currentAveragePrice
      : null;
  const additionalInvestment =
    additionalQuantity !== null && additionalPrice !== null
      ? additionalQuantity * additionalPrice
      : null;
  const newQuantity =
    currentQuantity !== null && additionalQuantity !== null
      ? currentQuantity + additionalQuantity
      : null;
  const newInvestment =
    currentInvestment !== null && additionalInvestment !== null
      ? currentInvestment + additionalInvestment
      : null;
  const newAveragePrice =
    newQuantity !== null && newQuantity > 0 && newInvestment !== null
      ? newInvestment / newQuantity
      : null;
  const averagePriceChange =
    newAveragePrice !== null && currentAveragePrice !== null
      ? newAveragePrice - currentAveragePrice
      : null;
  const averagePriceChangePercent =
    averagePriceChange !== null && currentAveragePrice > 0
      ? (averagePriceChange / currentAveragePrice) * 100
      : null;
  const currentMarketValue =
    currentQuantity !== null && currentPrice !== null
      ? currentQuantity * currentPrice
      : null;
  const newMarketValue =
    newQuantity !== null && currentPrice !== null
      ? newQuantity * currentPrice
      : null;
  const currentProfit =
    currentMarketValue !== null && currentInvestment !== null
      ? currentMarketValue - currentInvestment
      : null;
  const newProfit =
    newMarketValue !== null && newInvestment !== null
      ? newMarketValue - newInvestment
      : null;
  const currentProfitPercent =
    currentProfit !== null && currentInvestment > 0
      ? (currentProfit / currentInvestment) * 100
      : null;
  const newProfitPercent =
    newProfit !== null && newInvestment > 0
      ? (newProfit / newInvestment) * 100
      : null;
  const alertThresholdBefore = calculateAlertThreshold({
    alertType,
    averagePrice: currentAveragePrice,
    highPrice,
    thresholdPercent,
    targetPrice
  });
  const alertThresholdAfter = calculateAlertThreshold({
    alertType,
    averagePrice: newAveragePrice,
    highPrice,
    thresholdPercent,
    targetPrice
  });
  const requiredForTargetAverage = calculateRequiredPurchaseForTargetAverage({
    currentQuantity,
    currentAveragePrice,
    additionalPrice,
    targetAveragePrice
  });

  return {
    validBase: currentQuantity !== null && currentAveragePrice !== null,
    canCalculate:
      currentQuantity !== null &&
      currentAveragePrice !== null &&
      additionalQuantity !== null &&
      additionalPrice !== null,
    canApply:
      currentQuantity !== null &&
      currentAveragePrice !== null &&
      additionalQuantity !== null &&
      additionalQuantity > 0 &&
      additionalPrice !== null &&
      additionalPrice > 0 &&
      newAveragePrice !== null &&
      newQuantity !== null,
    currentQuantity,
    currentAveragePrice,
    currentInvestment,
    additionalQuantity,
    additionalPrice,
    additionalInvestment,
    newQuantity,
    newInvestment,
    newAveragePrice,
    averagePriceChange,
    averagePriceChangePercent,
    breakEvenPrice: newAveragePrice,
    currentPrice,
    currentMarketValue,
    newMarketValue,
    currentProfit,
    currentProfitPercent,
    newProfit,
    newProfitPercent,
    highPrice,
    alertType,
    thresholdPercent,
    alertThresholdBefore,
    alertThresholdAfter,
    alertThresholdChange:
      alertThresholdBefore !== null && alertThresholdAfter !== null
        ? alertThresholdAfter - alertThresholdBefore
        : null,
    targetAveragePrice,
    requiredForTargetAverage
  };
}

export function calculateRequiredPurchaseForTargetAverage(input = {}) {
  const currentQuantity = normalizePositiveNumber(input.currentQuantity);
  const currentAveragePrice = normalizePositiveNumber(input.currentAveragePrice);
  const additionalPrice = normalizePositiveNumber(input.additionalPrice);
  const targetAveragePrice = normalizePositiveNumber(input.targetAveragePrice);

  if (
    currentQuantity === null ||
    currentAveragePrice === null ||
    additionalPrice === null ||
    targetAveragePrice === null
  ) {
    return null;
  }

  const denominator = targetAveragePrice - additionalPrice;

  if (denominator === 0) {
    return null;
  }

  const quantity = (currentQuantity * (currentAveragePrice - targetAveragePrice)) / denominator;

  if (!Number.isFinite(quantity) || quantity <= 0) {
    return null;
  }

  return {
    quantity,
    investmentAmount: quantity * additionalPrice,
    targetAveragePrice,
    additionalPrice
  };
}

export function calculateAlertThreshold(input = {}) {
  const alertType = normalizeAlertType(input.alertType);
  const averagePrice = normalizePositiveNumber(input.averagePrice);
  const highPrice = normalizePositiveNumber(input.highPrice);
  const thresholdPercent = normalizePercent(input.thresholdPercent);
  const targetPrice = normalizePositiveNumber(input.targetPrice);

  if (alertType === 'target_price') {
    return targetPrice;
  }

  if (alertType === 'purchase_loss') {
    return averagePrice !== null ? averagePrice * (1 - thresholdPercent / 100) : null;
  }

  if (alertType === 'profit_retracement') {
    return highPrice !== null && averagePrice !== null && highPrice > averagePrice
      ? highPrice - (highPrice - averagePrice) * (thresholdPercent / 100)
      : null;
  }

  return highPrice !== null ? highPrice * (1 - thresholdPercent / 100) : null;
}

function normalizePositiveNumber(value) {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  const number = Number(value);

  return Number.isFinite(number) && number > 0 ? number : null;
}

function normalizePercent(value) {
  const number = Number(value);

  return Number.isFinite(number) && number > 0 && number < 100 ? number : 5;
}

function normalizeAlertType(value) {
  const alertType = String(value || 'high_drawdown');
  const allowed = ['high_drawdown', 'profit_retracement', 'purchase_loss', 'target_price'];

  return allowed.includes(alertType) ? alertType : 'high_drawdown';
}
