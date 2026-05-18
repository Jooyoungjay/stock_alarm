import assert from 'node:assert/strict';
import test from 'node:test';

import {
  calculateDividendGrowth,
  calculateDividendGrowthFromEntry,
  calculatePortfolioDividendGrowth
} from '../src/dividendGrowth.js';

test('calculateDividendGrowth returns the latest annual dividend growth rate', () => {
  const growth = calculateDividendGrowth({
    symbol: '336260',
    currency: 'KRW',
    annualDividendPerShare: 1200,
    dividendHistory: [
      {
        checkedAt: '2026-05-18T09:00:00.000Z',
        provider: 'publicdata',
        currency: 'KRW',
        previousAnnualDividendPerShare: 1000,
        annualDividendPerShare: 1200
      }
    ]
  });

  assert.equal(growth.available, true);
  assert.equal(growth.status, 'increase');
  assert.equal(growth.previousAnnualDividendPerShare, 1000);
  assert.equal(growth.annualDividendPerShare, 1200);
  assert.equal(growth.changeAmount, 200);
  assert.equal(growth.changePercent, 20);
  assert.equal(growth.provider, 'publicdata');
});

test('calculateDividendGrowth skips date-only history and uses the latest amount change', () => {
  const growth = calculateDividendGrowth({
    annualDividendPerShare: 900,
    dividendHistory: [
      {
        checkedAt: '2026-05-18T09:00:00.000Z',
        previousAnnualDividendPerShare: 900,
        annualDividendPerShare: 900,
        previousExDividendDate: '2026-03-01',
        exDividendDate: '2026-03-02'
      },
      {
        checkedAt: '2026-05-17T09:00:00.000Z',
        previousAnnualDividendPerShare: 1000,
        annualDividendPerShare: 900
      }
    ]
  });

  assert.equal(growth.available, true);
  assert.equal(growth.status, 'decrease');
  assert.equal(growth.changeAmount, -100);
  assert.equal(growth.changePercent, -10);
});

test('calculateDividendGrowth handles removed dividend as a full decrease', () => {
  const growth = calculateDividendGrowth({
    annualDividendPerShare: null,
    dividendHistory: [
      {
        checkedAt: '2026-05-18T09:00:00.000Z',
        previousAnnualDividendPerShare: 500,
        annualDividendPerShare: null
      }
    ]
  });

  assert.equal(growth.available, true);
  assert.equal(growth.status, 'decrease');
  assert.equal(growth.annualDividendPerShare, 0);
  assert.equal(growth.changeAmount, -500);
  assert.equal(growth.changePercent, -100);
});

test('calculateDividendGrowthFromEntry uses entry value for history rows', () => {
  const growth = calculateDividendGrowthFromEntry(
    {
      previousAnnualDividendPerShare: 800,
      annualDividendPerShare: 1000
    },
    {
      annualDividendPerShare: 1200
    }
  );

  assert.equal(growth.available, true);
  assert.equal(growth.annualDividendPerShare, 1000);
  assert.equal(growth.changePercent, 25);
});

test('calculatePortfolioDividendGrowth groups growth by currency and quantity', () => {
  const groups = calculatePortfolioDividendGrowth([
    {
      currency: 'KRW',
      quantity: 10,
      annualDividendPerShare: 1200,
      dividendHistory: [
        {
          previousAnnualDividendPerShare: 1000,
          annualDividendPerShare: 1200
        }
      ]
    },
    {
      currency: 'KRW',
      quantity: 5,
      annualDividendPerShare: 600,
      dividendHistory: [
        {
          previousAnnualDividendPerShare: 500,
          annualDividendPerShare: 600
        }
      ]
    },
    {
      currency: 'USD',
      quantity: 3,
      annualDividendPerShare: 2,
      dividendHistory: []
    }
  ]);

  assert.equal(groups.length, 1);
  assert.equal(groups[0].currency, 'KRW');
  assert.equal(groups[0].stockCount, 2);
  assert.equal(groups[0].previousAnnualDividend, 12500);
  assert.equal(groups[0].expectedAnnualDividend, 15000);
  assert.equal(groups[0].dividendGrowthAmount, 2500);
  assert.equal(groups[0].dividendGrowthPercent, 20);
});
