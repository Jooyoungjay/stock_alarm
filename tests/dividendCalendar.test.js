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
  assert.deepEqual(
    calendar.months.map((month) => month.key),
    ['2026-05', '2026-06', '2026-07', '2026-08', '2026-09']
  );
  assert.equal(calendar.months[1].events[0].amount, 3000);
  assert.equal(calendar.months[4].events[0].amount, 3000);
  assert.deepEqual(calendar.summary.annualDividendTotals, [{ currency: 'KRW', amount: 12000 }]);
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
  assert.equal(event.paymentDate, '2026-06-20');
  assert.equal(event.exDividendDate, '2026-06-05');
  assert.equal(event.amount, 5);
  assert.equal(calendar.months[0].totals[0].amount, 5);
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
  assert.equal(calendar.months[0].events[0].amount, null);
  assert.deepEqual(calendar.months[0].totals, []);
});
