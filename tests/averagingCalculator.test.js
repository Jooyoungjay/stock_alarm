import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildAveragingPlan,
  calculateAlertThreshold,
  calculateRequiredPurchaseForTargetAverage
} from '../public/averagingCalculator.js';

test('buildAveragingPlan calculates new average price and profit impact', () => {
  const plan = buildAveragingPlan({
    currentQuantity: 10,
    currentAveragePrice: 100,
    additionalQuantity: 5,
    additionalPrice: 80,
    targetAveragePrice: 90,
    currentPrice: 95,
    highPrice: 130,
    alertType: 'profit_retracement',
    thresholdPercent: 10
  });

  assert.equal(plan.canApply, true);
  assert.equal(plan.currentInvestment, 1000);
  assert.equal(plan.additionalInvestment, 400);
  assert.equal(plan.newQuantity, 15);
  assert.equal(plan.newInvestment, 1400);
  assert.ok(Math.abs(plan.newAveragePrice - 93.3333333333) < 0.000001);
  assert.ok(Math.abs(plan.averagePriceChange + 6.6666666667) < 0.000001);
  assert.equal(plan.currentProfit, -50);
  assert.equal(plan.newProfit, 25);
  assert.equal(plan.alertThresholdBefore, 127);
  assert.ok(Math.abs(plan.alertThresholdAfter - 126.3333333333) < 0.000001);
  assert.equal(plan.requiredForTargetAverage.quantity, 10);
  assert.equal(plan.requiredForTargetAverage.investmentAmount, 800);
});

test('calculateRequiredPurchaseForTargetAverage returns null when target cannot be reached', () => {
  assert.equal(
    calculateRequiredPurchaseForTargetAverage({
      currentQuantity: 10,
      currentAveragePrice: 100,
      additionalPrice: 120,
      targetAveragePrice: 90
    }),
    null
  );
});

test('calculateAlertThreshold reflects average price only for matching alert rules', () => {
  assert.equal(
    calculateAlertThreshold({
      alertType: 'purchase_loss',
      averagePrice: 90,
      thresholdPercent: 5
    }),
    85.5
  );
  assert.equal(
    calculateAlertThreshold({
      alertType: 'high_drawdown',
      highPrice: 130,
      averagePrice: 90,
      thresholdPercent: 10
    }),
    117
  );
  assert.equal(
    calculateAlertThreshold({
      alertType: 'target_price',
      targetPrice: 88,
      averagePrice: 90,
      thresholdPercent: 10
    }),
    88
  );
});
