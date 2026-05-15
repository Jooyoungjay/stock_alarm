const frequencyLabels = {
  monthly: '월배당',
  quarterly: '분기배당',
  semiannual: '반기배당',
  annual: '연배당',
  custom: '직접 입력',
  '': '미정'
};

export function buildDividendCalendar(stocks = [], options = {}) {
  const today = normalizeDate(options.today) || new Date();
  const monthsAhead = normalizeMonthsAhead(options.monthsAhead);
  const months = buildUpcomingMonths(today, monthsAhead);
  const monthMap = new Map(months.map((month) => [month.key, { ...month, totals: [], events: [] }]));
  const summary = {
    monthsAhead,
    eventCount: 0,
    stocksWithDividends: 0,
    pendingScheduleCount: 0,
    annualDividendTotals: []
  };
  const annualTotals = new Map();

  for (const stock of stocks) {
    const dividend = buildStockDividendSummary(stock);

    if (!dividend.hasDividend) {
      continue;
    }

    summary.stocksWithDividends += 1;

    if (dividend.expectedAnnualDividend !== null) {
      addCurrencyAmount(annualTotals, dividend.currency, dividend.expectedAnnualDividend);
    }

    if (!dividend.months.length || dividend.paymentAmount === null) {
      summary.pendingScheduleCount += 1;
    }

    const scheduledEvents = addScheduledDividendEvents(monthMap, stock, dividend);
    addDatedDividendEvent(monthMap, stock, dividend, scheduledEvents, 'payment', stock.dividendDate);
    addDatedDividendEvent(monthMap, stock, dividend, scheduledEvents, 'ex_dividend', stock.exDividendDate);
  }

  for (const month of monthMap.values()) {
    const totals = new Map();

    month.events.sort(compareDividendEvents);

    for (const event of month.events) {
      summary.eventCount += 1;

      if (event.amount !== null) {
        addCurrencyAmount(totals, event.currency, event.amount);
      }
    }

    month.totals = mapCurrencyTotals(totals);
  }

  summary.annualDividendTotals = mapCurrencyTotals(annualTotals);

  return {
    months: [...monthMap.values()],
    summary
  };
}

function buildStockDividendSummary(stock) {
  const quantity = normalizePositiveNumber(stock.quantity);
  const annualDividendPerShare = normalizePositiveNumber(stock.annualDividendPerShare);
  const lastDividendValue = normalizePositiveNumber(stock.lastDividendValue);
  const expectedAnnualDividend =
    quantity !== null && annualDividendPerShare !== null ? quantity * annualDividendPerShare : null;
  const frequency = normalizeDividendFrequency(stock.dividendFrequency);
  const explicitMonths = parseDividendMonths(stock.dividendMonths);
  const months = explicitMonths.length ? explicitMonths : getDefaultDividendMonths(frequency);
  const paymentAmount =
    expectedAnnualDividend !== null && months.length ? expectedAnnualDividend / months.length : null;
  const datedPaymentAmount =
    quantity !== null && lastDividendValue !== null
      ? quantity * lastDividendValue
      : paymentAmount;

  return {
    hasDividend:
      expectedAnnualDividend !== null ||
      lastDividendValue !== null ||
      Boolean(stock.exDividendDate || stock.dividendDate),
    quantity,
    annualDividendPerShare,
    lastDividendValue,
    expectedAnnualDividend,
    frequency,
    frequencyLabel: frequencyLabels[frequency] || frequencyLabels[''],
    months,
    paymentAmount,
    datedPaymentAmount,
    currency: stock.dividendCurrency || stock.currency || ''
  };
}

function addScheduledDividendEvents(monthMap, stock, dividend) {
  const scheduledEvents = new Map();

  if (dividend.paymentAmount === null || !dividend.months.length) {
    return scheduledEvents;
  }

  for (const month of monthMap.values()) {
    if (!dividend.months.includes(month.month)) {
      continue;
    }

    const event = buildDividendEvent(stock, dividend, {
      monthKey: month.key,
      year: month.year,
      month: month.month,
      type: 'estimated',
      amount: dividend.paymentAmount
    });

    month.events.push(event);
    scheduledEvents.set(month.key, event);
  }

  return scheduledEvents;
}

function addDatedDividendEvent(monthMap, stock, dividend, scheduledEvents, type, dateValue) {
  const date = normalizeDate(dateValue);

  if (!date) {
    return;
  }

  const key = getMonthKey(date);
  const month = monthMap.get(key);

  if (!month) {
    return;
  }

  const scheduled = scheduledEvents.get(key);

  if (scheduled) {
    if (type === 'payment') {
      scheduled.paymentDate = toDateKey(date);
      scheduled.type = 'confirmed';
      scheduled.amount = dividend.datedPaymentAmount ?? scheduled.amount;
      scheduled.amountSource = dividend.lastDividendValue !== null ? 'last_dividend' : 'estimated';
    } else {
      scheduled.exDividendDate = toDateKey(date);
    }

    return;
  }

  month.events.push(
    buildDividendEvent(stock, dividend, {
      monthKey: key,
      year: month.year,
      month: month.month,
      type,
      amount: type === 'payment' ? dividend.datedPaymentAmount : null,
      paymentDate: type === 'payment' ? toDateKey(date) : '',
      exDividendDate: type === 'ex_dividend' ? toDateKey(date) : ''
    })
  );
}

function buildDividendEvent(stock, dividend, event) {
  return {
    stockId: stock.id || '',
    symbol: stock.symbol || '',
    displayName: stock.displayName || stock.symbol || '',
    monthKey: event.monthKey,
    year: event.year,
    month: event.month,
    type: event.type,
    amount: normalizeNullableNumber(event.amount),
    amountSource: event.amountSource || (event.type === 'payment' ? 'last_dividend' : 'estimated'),
    currency: dividend.currency,
    frequency: dividend.frequency,
    frequencyLabel: dividend.frequencyLabel,
    paymentDate: event.paymentDate || '',
    exDividendDate: event.exDividendDate || '',
    dividendDataSource: stock.dividendDataSource || '',
    dividendProvider: stock.dividendProvider || '',
    annualDividendPerShare: dividend.annualDividendPerShare,
    lastDividendValue: dividend.lastDividendValue
  };
}

function buildUpcomingMonths(today, monthsAhead) {
  const base = new Date(today.getFullYear(), today.getMonth(), 1);
  const months = [];

  for (let index = 0; index < monthsAhead; index += 1) {
    const date = new Date(base.getFullYear(), base.getMonth() + index, 1);
    const year = date.getFullYear();
    const month = date.getMonth() + 1;

    months.push({
      key: `${year}-${String(month).padStart(2, '0')}`,
      year,
      month,
      label: `${year}년 ${month}월`
    });
  }

  return months;
}

function normalizeMonthsAhead(value) {
  const number = Number(value ?? 6);

  if (!Number.isInteger(number) || number < 1) {
    return 6;
  }

  return Math.min(number, 12);
}

function normalizeDividendFrequency(value) {
  const frequency = String(value || '').trim().toLowerCase();
  const allowed = ['', 'monthly', 'quarterly', 'semiannual', 'annual', 'custom'];

  return allowed.includes(frequency) ? frequency : '';
}

function getDefaultDividendMonths(frequency) {
  if (frequency === 'monthly') {
    return [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
  }

  if (frequency === 'quarterly') {
    return [3, 6, 9, 12];
  }

  if (frequency === 'semiannual') {
    return [6, 12];
  }

  if (frequency === 'annual') {
    return [12];
  }

  return [];
}

function parseDividendMonths(value) {
  if (value === undefined || value === null || value === '') {
    return [];
  }

  const rawItems = Array.isArray(value)
    ? value
    : String(value)
        .split(/[\s,]+/)
        .map((item) => item.trim())
        .filter(Boolean);

  const months = rawItems
    .map((item) => Number(item))
    .filter((month) => Number.isInteger(month) && month >= 1 && month <= 12);

  return [...new Set(months)].sort((left, right) => left - right);
}

function normalizePositiveNumber(value) {
  const number = Number(value);

  return Number.isFinite(number) && number > 0 ? number : null;
}

function normalizeNullableNumber(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const number = Number(value);

  return Number.isFinite(number) ? number : null;
}

function normalizeDate(value) {
  if (value instanceof Date && Number.isFinite(value.getTime())) {
    return value;
  }

  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})/);

  if (!match) {
    return null;
  }

  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));

  return Number.isFinite(date.getTime()) ? date : null;
}

function toDateKey(date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0')
  ].join('-');
}

function getMonthKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function addCurrencyAmount(map, currency, amount) {
  const value = Number(amount);

  if (!Number.isFinite(value)) {
    return;
  }

  const key = currency || '';
  map.set(key, (map.get(key) || 0) + value);
}

function mapCurrencyTotals(map) {
  return [...map.entries()]
    .map(([currency, amount]) => ({ currency, amount }))
    .sort((left, right) => String(left.currency).localeCompare(String(right.currency), 'ko-KR'));
}

function compareDividendEvents(left, right) {
  const leftDate = left.paymentDate || left.exDividendDate || '';
  const rightDate = right.paymentDate || right.exDividendDate || '';

  if (leftDate !== rightDate) {
    return leftDate.localeCompare(rightDate);
  }

  return left.displayName.localeCompare(right.displayName, 'ko-KR');
}
