import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDividendCalendar } from '../src/dividendCalendar.js';

test('buildDividendCalendar creates upcoming monthly buckets from dividend months', () => {
  const calendar = buildDividendCalendar(
    [
      {
        id: 'stock-1',
        symbol: '336260',
        displayName: '두산퓨얼셀',
        quantity: 10,
        annualDividendPerShare: 1200,
        dividendFrequency: 'quarterly',
        currency: 'KRW'
      }
    ],
    {
      today: '2026-05-15',
      monthsAhead: 5
    }
  );

  assert.equal(calendar.months.length, 5);
  assert.equal(calendar.summary.stocksWithDividends, 1);
  assert.equal(calendar.summary.eventCount, 2);
  assert.equal(calendar.summary.estimatedEventCount, 2);
  assert.equal(calendar.summary.paymentEventCount, 2);
  assert.deepEqual(
    calendar.months.map((month) => month.key),
    ['2026-05', '2026-06', '2026-07', '2026-08', '2026-09']
  );
  assert.equal(calendar.months[1].events[0].amount, 3000);
  assert.equal(calendar.months[4].events[0].amount, 3000);
  assert.equal(calendar.months[1].eventCounts.estimated, 1);
  assert.deepEqual(calendar.months[1].estimatedTotals, [{ currency: 'KRW', amount: 3000 }]);
  assert.deepEqual(calendar.summary.annualDividendTotals, [{ currency: 'KRW', amount: 12000 }]);
  assert.deepEqual(calendar.summary.estimatedDividendTotals, [{ currency: 'KRW', amount: 6000 }]);
});

test('buildDividendCalendar decorates scheduled months with confirmed payment dates', () => {
  const calendar = buildDividendCalendar(
    [
      {
        id: 'stock-1',
        symbol: 'AAPL',
        displayName: 'Apple',
        quantity: 5,
        annualDividendPerShare: 4,
        lastDividendValue: 1,
        dividendFrequency: 'quarterly',
        dividendDate: '2026-06-20',
        exDividendDate: '2026-06-05',
        currency: 'USD'
      }
    ],
    {
      today: '2026-06-01',
      monthsAhead: 1
    }
  );

  const event = calendar.months[0].events[0];
  assert.equal(event.type, 'confirmed');
  assert.equal(event.certainty, 'confirmed');
  assert.equal(event.eventKind, 'payment');
  assert.equal(event.paymentDate, '2026-06-20');
  assert.equal(event.exDividendDate, '2026-06-05');
  assert.equal(event.amount, 5);
  assert.equal(calendar.months[0].totals[0].amount, 5);
  assert.equal(calendar.months[0].eventCounts.confirmed, 1);
  assert.equal(calendar.months[0].eventCounts.exDividend, 1);
  assert.deepEqual(calendar.months[0].confirmedTotals, [{ currency: 'USD', amount: 5 }]);
  assert.deepEqual(calendar.summary.confirmedDividendTotals, [{ currency: 'USD', amount: 5 }]);
});

test('buildDividendCalendar counts dividend stocks without a payment schedule', () => {
  const calendar = buildDividendCalendar(
    [
      {
        id: 'stock-1',
        symbol: 'MSFT',
        quantity: 3,
        annualDividendPerShare: 2.5,
        currency: 'USD'
      }
    ],
    {
      today: '2026-05-15',
      monthsAhead: 3
    }
  );

  assert.equal(calendar.summary.stocksWithDividends, 1);
  assert.equal(calendar.summary.pendingScheduleCount, 1);
  assert.equal(calendar.summary.eventCount, 0);
  assert.deepEqual(calendar.summary.annualDividendTotals, [{ currency: 'USD', amount: 7.5 }]);
});

test('buildDividendCalendar keeps ex-dividend events amountless when no payment is known', () => {
  const calendar = buildDividendCalendar(
    [
      {
        id: 'stock-1',
        symbol: '000660',
        displayName: 'SK하이닉스',
        exDividendDate: '2026-05-31',
        currency: 'KRW'
      }
    ],
    {
      today: '2026-05-01',
      monthsAhead: 1
    }
  );

  assert.equal(calendar.months[0].events[0].type, 'ex_dividend');
  assert.equal(calendar.months[0].events[0].eventKind, 'ex_dividend');
  assert.equal(calendar.months[0].events[0].amount, null);
  assert.equal(calendar.months[0].eventCounts.exDividend, 1);
  assert.equal(calendar.summary.exDividendEventCount, 1);
  assert.deepEqual(calendar.months[0].totals, []);
});

test('buildDividendCalendar exposes typed monthly totals for calendar filters', () => {
  const calendar = buildDividendCalendar(
    [
      {
        id: 'confirmed-stock',
        symbol: '005930',
        displayName: '삼성전자',
        quantity: 10,
        annualDividendPerShare: 1600,
        lastDividendValue: 400,
        dividendFrequency: 'quarterly',
        dividendDate: '2026-06-20',
        exDividendDate: '2026-06-05',
        currency: 'KRW'
      },
      {
        id: 'estimated-stock',
        symbol: 'AAPL',
        displayName: 'Apple',
        quantity: 5,
        annualDividendPerShare: 4,
        dividendFrequency: 'quarterly',
        currency: 'USD'
      },
      {
        id: 'ex-stock',
        symbol: '000660',
        displayName: 'SK하이닉스',
        exDividendDate: '2026-06-28',
        currency: 'KRW'
      }
    ],
    {
      today: '2026-06-01',
      monthsAhead: 1
    }
  );

  const month = calendar.months[0];

  assert.equal(calendar.summary.eventCount, 3);
  assert.equal(calendar.summary.confirmedEventCount, 1);
  assert.equal(calendar.summary.estimatedEventCount, 1);
  assert.equal(calendar.summary.exDividendEventCount, 2);
  assert.deepEqual(month.eventCounts, {
    total: 3,
    confirmed: 1,
    estimated: 1,
    payment: 2,
    exDividend: 2,
    amounted: 2
  });
  assert.deepEqual(month.confirmedTotals, [{ currency: 'KRW', amount: 4000 }]);
  assert.deepEqual(month.estimatedTotals, [{ currency: 'USD', amount: 5 }]);
  assert.deepEqual(month.paymentTotals, [
    { currency: 'KRW', amount: 4000 },
    { currency: 'USD', amount: 5 }
  ]);
});
