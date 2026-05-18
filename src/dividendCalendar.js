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
  const monthMap = new Map(months.map(createDividendCalendarMonth));
  const summary = {
    monthsAhead,
    eventCount: 0,
    confirmedEventCount: 0,
    estimatedEventCount: 0,
    paymentEventCount: 0,
    exDividendEventCount: 0,
    stocksWithDividends: 0,
    pendingScheduleCount: 0,
    annualDividendTotals: [],
    confirmedDividendTotals: [],
    estimatedDividendTotals: [],
    paymentDividendTotals: []
  };
  const annualTotals = new Map();
  const confirmedTotals = new Map();
  const estimatedTotals = new Map();
  const paymentTotals = new Map();

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
    const monthTotals = new Map();
    const monthConfirmedTotals = new Map();
    const monthEstimatedTotals = new Map();
    const monthPaymentTotals = new Map();
    const eventCounts = createDividendEventCounts();

    month.events.sort(compareDividendEvents);

    for (const event of month.events) {
      summary.eventCount += 1;
      incrementDividendEventCounts(eventCounts, event);
      incrementDividendSummary(summary, event);

      if (event.amount !== null && event.amount !== undefined) {
        addCurrencyAmount(monthTotals, event.currency, event.amount);

        if (isConfirmedDividendEvent(event)) {
          addCurrencyAmount(monthConfirmedTotals, event.currency, event.amount);
          addCurrencyAmount(confirmedTotals, event.currency, event.amount);
        }

        if (event.type === 'estimated') {
          addCurrencyAmount(monthEstimatedTotals, event.currency, event.amount);
          addCurrencyAmount(estimatedTotals, event.currency, event.amount);
        }

        if (isDividendPaymentEvent(event)) {
          addCurrencyAmount(monthPaymentTotals, event.currency, event.amount);
          addCurrencyAmount(paymentTotals, event.currency, event.amount);
        }
      }
    }

    month.totals = mapCurrencyTotals(monthTotals);
    month.confirmedTotals = mapCurrencyTotals(monthConfirmedTotals);
    month.estimatedTotals = mapCurrencyTotals(monthEstimatedTotals);
    month.paymentTotals = mapCurrencyTotals(monthPaymentTotals);
    month.eventCounts = eventCounts;
  }

  summary.annualDividendTotals = mapCurrencyTotals(annualTotals);
  summary.confirmedDividendTotals = mapCurrencyTotals(confirmedTotals);
  summary.estimatedDividendTotals = mapCurrencyTotals(estimatedTotals);
  summary.paymentDividendTotals = mapCurrencyTotals(paymentTotals);

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
      scheduled.certainty = 'confirmed';
      scheduled.eventKind = 'payment';
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
  const type = event.type || 'estimated';
  const eventKind = type === 'ex_dividend' ? 'ex_dividend' : 'payment';
  const certainty = type === 'estimated' ? 'estimated' : type === 'ex_dividend' ? 'event_only' : 'confirmed';

  return {
    stockId: stock.id || '',
    symbol: stock.symbol || '',
    displayName: stock.displayName || stock.symbol || '',
    monthKey: event.monthKey,
    year: event.year,
    month: event.month,
    type,
    eventKind,
    certainty,
    amount: normalizeNullableNumber(event.amount),
    amountSource: event.amountSource || (isConfirmedDividendEvent({ type }) ? 'last_dividend' : 'estimated'),
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

function createDividendCalendarMonth(month) {
  return [
    month.key,
    {
      ...month,
      totals: [],
      confirmedTotals: [],
      estimatedTotals: [],
      paymentTotals: [],
      eventCounts: createDividendEventCounts(),
      events: []
    }
  ];
}

function createDividendEventCounts() {
  return {
    total: 0,
    confirmed: 0,
    estimated: 0,
    payment: 0,
    exDividend: 0,
    amounted: 0
  };
}

function incrementDividendEventCounts(target, event) {
  target.total += 1;

  if (isConfirmedDividendEvent(event)) {
    target.confirmed += 1;
  }

  if (event.type === 'estimated') {
    target.estimated += 1;
  }

  if (isDividendPaymentEvent(event)) {
    target.payment += 1;
  }

  if (event.exDividendDate || event.type === 'ex_dividend') {
    target.exDividend += 1;
  }

  if (event.amount !== null && event.amount !== undefined) {
    target.amounted += 1;
  }
}

function incrementDividendSummary(summary, event) {
  if (isConfirmedDividendEvent(event)) {
    summary.confirmedEventCount += 1;
  }

  if (event.type === 'estimated') {
    summary.estimatedEventCount += 1;
  }

  if (isDividendPaymentEvent(event)) {
    summary.paymentEventCount += 1;
  }

  if (event.exDividendDate || event.type === 'ex_dividend') {
    summary.exDividendEventCount += 1;
  }
}

function isConfirmedDividendEvent(event) {
  return event.type === 'confirmed' || event.type === 'payment' || event.certainty === 'confirmed';
}

function isDividendPaymentEvent(event) {
  return event.eventKind === 'payment' || ['confirmed', 'estimated', 'payment'].includes(event.type);
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
