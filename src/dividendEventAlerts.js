import { sendPushNotificationToDevice } from './pushNotifications.js';
import { isTelegramConfigured, sendTelegramMessage } from './telegram.js';

export const dividendEventAlertSentMetaKey = 'dividendEventAlerts.sent';
export const lastDividendEventAlertMetaKey = 'lastDividendEventAlert';

const defaultExDateOffsets = [3, 1, 0, -1];
const defaultPaymentDateOffsets = [1, 0];
const maxStoredSentRecords = 500;

const eventLabels = {
  ex_dividend: '배당락일',
  payment: '배당 지급일'
};

export function normalizeDividendEventAlertOffsets(value, fallback = []) {
  const rawItems = Array.isArray(value)
    ? value
    : String(value ?? '')
        .split(/[\s,]+/)
        .map((item) => item.trim())
        .filter(Boolean);
  const offsets = rawItems
    .map((item) => Number(item))
    .filter((item) => Number.isInteger(item) && item >= -30 && item <= 365);
  const unique = [...new Set(offsets)];

  if (unique.length) {
    return unique;
  }

  return [...fallback];
}

export function buildDividendEventAlertCandidates(stocks = [], options = {}) {
  const now = options.now || new Date();
  const today = toLocalDate(now);
  const exDateOffsets = normalizeDividendEventAlertOffsets(
    options.exDateOffsets,
    defaultExDateOffsets
  );
  const paymentDateOffsets = normalizeDividendEventAlertOffsets(
    options.paymentDateOffsets,
    defaultPaymentDateOffsets
  );
  const candidates = [];

  for (const stock of Array.isArray(stocks) ? stocks : []) {
    if (!stock || stock.active === false) {
      continue;
    }

    addDividendEventCandidate(candidates, stock, {
      type: 'ex_dividend',
      dateValue: stock.exDividendDate,
      today,
      offsets: exDateOffsets
    });
    addDividendEventCandidate(candidates, stock, {
      type: 'payment',
      dateValue: stock.dividendDate,
      today,
      offsets: paymentDateOffsets
    });
  }

  return candidates.sort(compareDividendEventCandidates);
}

export async function runDividendEventAlertCheck(store, config, options = {}) {
  const now = options.now || new Date();
  const checkedAt = now.toISOString();
  const force = Boolean(options.force);
  const enabled = config.dividendEventAlertEnabled !== false;

  if (!enabled && !force) {
    return persistLastDividendEventAlertCheck(store, {
      checkedAt,
      skipped: true,
      reason: 'dividend_event_alert_disabled',
      results: [],
      summary: buildDividendEventAlertSummary([])
    });
  }

  const stocks = await store.listStocks();
  const sentMap = await readSentMap(store);
  const candidates = buildDividendEventAlertCandidates(stocks, {
    now,
    exDateOffsets: config.dividendEventAlertExDateOffsets,
    paymentDateOffsets: config.dividendEventAlertPaymentDateOffsets
  });
  const results = [];
  let nextSentMap = pruneSentMap(sentMap);

  for (const candidate of candidates) {
    const key = buildDividendEventAlertKey(candidate);

    if (nextSentMap[key]) {
      results.push({
        ...toResultBase(candidate),
        status: 'already_sent',
        sentAt: nextSentMap[key].sentAt || ''
      });
      continue;
    }

    const delivery = await deliverDividendEventAlert(store, config, candidate, {
      now,
      sendTelegramMessage: options.sendTelegramMessage,
      sendPushNotification: options.sendPushNotification
    });
    const result = {
      ...toResultBase(candidate),
      ...delivery
    };

    nextSentMap[key] = {
      stockId: candidate.stock.id || '',
      symbol: candidate.stock.symbol || '',
      eventType: candidate.eventType,
      eventDate: candidate.eventDate,
      offsetDays: candidate.offsetDays,
      deliveryStatus: delivery.deliveryStatus,
      sentAt: checkedAt
    };
    results.push(result);
  }

  nextSentMap = pruneSentMap(nextSentMap);

  if (typeof store.setMetaValue === 'function') {
    await store.setMetaValue(dividendEventAlertSentMetaKey, nextSentMap);
  }

  return persistLastDividendEventAlertCheck(store, {
    checkedAt,
    summary: buildDividendEventAlertSummary(results),
    results
  });
}

export function formatDividendEventAlertMessage(candidate) {
  const stock = candidate.stock;
  const currency = stock.dividendCurrency || stock.currency || '';
  const quantity = normalizePositiveNumber(stock.quantity);
  const lastDividendValue = normalizePositiveNumber(stock.lastDividendValue);
  const expectedAmount =
    quantity !== null && lastDividendValue !== null ? quantity * lastDividendValue : null;
  const lines = [
    '[Stock Alarm] 배당 일정 알림',
    `${stock.displayName || stock.symbol} (${stock.symbol})`,
    `${candidate.eventLabel}: ${formatDateOnly(candidate.eventDate)} (${candidate.offsetLabel})`,
    lastDividendValue !== null
      ? `최근 1주 배당: ${formatNumber(lastDividendValue)}${formatCurrencySuffix(currency)}`
      : '',
    expectedAmount !== null
      ? `예상 보유 배당금: ${formatNumber(expectedAmount)}${formatCurrencySuffix(currency)} (${formatNumber(quantity)}주)`
      : '',
    stock.dividendProvider ? `출처: ${stock.dividendProvider}` : '',
    '시세와 배당 정보는 provider 업데이트 시점에 따라 달라질 수 있습니다.'
  ];

  return lines.filter(Boolean).join('\n');
}

function addDividendEventCandidate(candidates, stock, input) {
  const eventDate = parseDateKey(input.dateValue);

  if (!eventDate) {
    return;
  }

  const offsetDays = getDayDifference(eventDate.date, input.today);

  if (!input.offsets.includes(offsetDays)) {
    return;
  }

  candidates.push({
    stock,
    eventType: input.type,
    eventLabel: eventLabels[input.type],
    eventDate: eventDate.key,
    offsetDays,
    offsetLabel: formatOffsetLabel(offsetDays)
  });
}

async function deliverDividendEventAlert(store, config, candidate, options) {
  const message = formatDividendEventAlertMessage(candidate);
  const telegramSender = options.sendTelegramMessage || sendTelegramMessage;
  const pushSender = options.sendPushNotification || sendPushNotificationToDevice;
  let telegramDeliveryStatus = 'none';
  let telegramDeliveryError = '';
  let pushDeliveryStatus = 'none';
  let pushDeliveryError = '';
  let pushDeliverySent = 0;
  let pushDeliveryFailed = 0;

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

  try {
    const pushDelivery = await pushSender(
      store,
      config,
      candidate.stock.deviceId || null,
      {
        title: `[Stock Alarm] ${candidate.eventLabel}`,
        body: buildCompactDividendEventBody(candidate),
        data: {
          type: 'dividend-event-alert',
          stockId: candidate.stock.id || '',
          symbol: candidate.stock.symbol || '',
          eventType: candidate.eventType,
          eventDate: candidate.eventDate,
          offsetDays: candidate.offsetDays,
          createdAt: options.now.toISOString()
        }
      }
    );
    pushDeliveryStatus = pushDelivery?.deliveryStatus || 'none';
    pushDeliveryError = formatPushDeliveryError(pushDelivery);
    pushDeliverySent = Number(pushDelivery?.sent || 0);
    pushDeliveryFailed = Number(pushDelivery?.failed || 0);
  } catch (error) {
    pushDeliveryStatus = 'failed';
    pushDeliveryError = error.message;
  }

  const delivery = combineDelivery([
    {
      status: telegramDeliveryStatus,
      error: telegramDeliveryError
    },
    {
      status: pushDeliveryStatus,
      error: pushDeliveryError
    }
  ]);
  const alert = await appendDividendEventAlert(store, candidate, {
    now: options.now,
    message,
    deliveryStatus: delivery.deliveryStatus,
    deliveryError: delivery.deliveryError,
    telegramDeliveryStatus,
    telegramDeliveryError,
    pushDeliveryStatus,
    pushDeliveryError,
    pushDeliverySent,
    pushDeliveryFailed
  });

  return {
    status: delivery.deliveryStatus,
    deliveryStatus: delivery.deliveryStatus,
    deliveryError: delivery.deliveryError,
    telegramDeliveryStatus,
    telegramDeliveryError,
    pushDeliveryStatus,
    pushDeliveryError,
    pushDeliverySent,
    pushDeliveryFailed,
    alert
  };
}

async function appendDividendEventAlert(store, candidate, delivery) {
  if (typeof store.appendAlert !== 'function') {
    return null;
  }

  const stock = candidate.stock;
  const currency = stock.dividendCurrency || stock.currency || '';
  const quantity = normalizePositiveNumber(stock.quantity);
  const lastDividendValue = normalizePositiveNumber(stock.lastDividendValue);
  const expectedAmount =
    quantity !== null && lastDividendValue !== null ? quantity * lastDividendValue : null;

  return store.appendAlert({
    stockId: stock.id || '',
    deviceId: stock.deviceId || null,
    symbol: stock.symbol || '',
    displayName: stock.displayName || stock.symbol || '',
    price: null,
    currency,
    alertType: 'dividend_event',
    alertTypeLabel: candidate.eventLabel,
    metricLabel: candidate.eventLabel,
    drawdownPercent: null,
    dividendEventType: candidate.eventType,
    dividendEventDate: candidate.eventDate,
    dividendEventOffsetDays: candidate.offsetDays,
    dividendEventOffsetLabel: candidate.offsetLabel,
    lastDividendValue,
    expectedDividendAmount: expectedAmount,
    deliveryStatus: delivery.deliveryStatus,
    deliveryError: delivery.deliveryError,
    telegramDeliveryStatus: delivery.telegramDeliveryStatus,
    telegramDeliveryError: delivery.telegramDeliveryError,
    pushDeliveryStatus: delivery.pushDeliveryStatus,
    pushDeliveryError: delivery.pushDeliveryError,
    pushDeliverySent: delivery.pushDeliverySent,
    pushDeliveryFailed: delivery.pushDeliveryFailed,
    message: delivery.message,
    createdAt: delivery.now.toISOString()
  });
}

function buildDividendEventAlertSummary(results) {
  return (Array.isArray(results) ? results : []).reduce(
    (summary, result) => {
      summary.due += 1;
      if (result.status === 'already_sent') {
        summary.alreadySent += 1;
      } else if (result.deliveryStatus === 'sent' || result.deliveryStatus === 'partial') {
        summary.sent += 1;
      } else if (result.deliveryStatus === 'failed') {
        summary.failed += 1;
      } else if (result.deliveryStatus === 'not_configured') {
        summary.notConfigured += 1;
      }
      return summary;
    },
    {
      due: 0,
      sent: 0,
      failed: 0,
      notConfigured: 0,
      alreadySent: 0
    }
  );
}

function toResultBase(candidate) {
  return {
    stockId: candidate.stock.id || '',
    symbol: candidate.stock.symbol || '',
    displayName: candidate.stock.displayName || candidate.stock.symbol || '',
    eventType: candidate.eventType,
    eventLabel: candidate.eventLabel,
    eventDate: candidate.eventDate,
    offsetDays: candidate.offsetDays,
    offsetLabel: candidate.offsetLabel
  };
}

function buildDividendEventAlertKey(candidate) {
  return [
    candidate.stock.id || candidate.stock.symbol || '',
    candidate.eventType,
    candidate.eventDate,
    candidate.offsetDays
  ].join('|');
}

async function readSentMap(store) {
  if (typeof store.getMetaValue !== 'function') {
    return {};
  }

  return normalizeSentMap(await store.getMetaValue(dividendEventAlertSentMetaKey, {}));
}

async function persistLastDividendEventAlertCheck(store, result) {
  if (typeof store.setMetaValue === 'function') {
    await store.setMetaValue(lastDividendEventAlertMetaKey, result);
  }

  return result;
}

function normalizeSentMap(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value)
      .filter(([key, record]) => key && record && typeof record === 'object')
      .map(([key, record]) => [
        key,
        {
          stockId: String(record.stockId || ''),
          symbol: String(record.symbol || ''),
          eventType: String(record.eventType || ''),
          eventDate: String(record.eventDate || ''),
          offsetDays: Number(record.offsetDays),
          deliveryStatus: String(record.deliveryStatus || ''),
          sentAt: String(record.sentAt || '')
        }
      ])
  );
}

function pruneSentMap(value) {
  const entries = Object.entries(normalizeSentMap(value))
    .sort((left, right) => String(right[1].sentAt).localeCompare(String(left[1].sentAt)))
    .slice(0, maxStoredSentRecords);

  return Object.fromEntries(entries);
}

function combineDelivery(channels) {
  const activeChannels = channels.filter((channel) => channel.status && channel.status !== 'none');
  const sent = activeChannels.some((channel) => channel.status === 'sent' || channel.status === 'partial');
  const errors = activeChannels
    .filter((channel) => !sent || channel.status === 'failed')
    .map((channel) => channel.error)
    .filter(Boolean);

  if (sent) {
    return {
      deliveryStatus: 'sent',
      deliveryError: errors.join(' · ')
    };
  }

  if (activeChannels.some((channel) => channel.status === 'failed')) {
    return {
      deliveryStatus: 'failed',
      deliveryError: errors.join(' · ')
    };
  }

  if (activeChannels.some((channel) => channel.status === 'not_configured')) {
    return {
      deliveryStatus: 'not_configured',
      deliveryError: errors.join(' · ')
    };
  }

  return {
    deliveryStatus: 'none',
    deliveryError: ''
  };
}

function formatPushDeliveryError(result) {
  if (!result) {
    return '';
  }

  if (Array.isArray(result.errors) && result.errors.length) {
    return result.errors.join(' · ');
  }

  return result.reason || '';
}

function buildCompactDividendEventBody(candidate) {
  return `${candidate.stock.displayName || candidate.stock.symbol} ${candidate.eventLabel} ${formatDateOnly(candidate.eventDate)} ${candidate.offsetLabel}`;
}

function compareDividendEventCandidates(left, right) {
  return (
    left.eventDate.localeCompare(right.eventDate) ||
    left.eventType.localeCompare(right.eventType) ||
    String(left.stock.displayName || left.stock.symbol).localeCompare(
      String(right.stock.displayName || right.stock.symbol),
      'ko-KR'
    )
  );
}

function parseDateKey(value) {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})/);

  if (!match) {
    return null;
  }

  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));

  if (!Number.isFinite(date.getTime())) {
    return null;
  }

  return {
    date,
    key: toDateKey(date)
  };
}

function toLocalDate(value) {
  const date = value instanceof Date ? value : new Date(value);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function getDayDifference(leftDate, rightDate) {
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.round((leftDate.getTime() - rightDate.getTime()) / msPerDay);
}

function toDateKey(date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0')
  ].join('-');
}

function formatOffsetLabel(offsetDays) {
  if (offsetDays === 0) {
    return '당일';
  }

  if (offsetDays > 0) {
    return `${offsetDays}일 전`;
  }

  return `${Math.abs(offsetDays)}일 후`;
}

function normalizePositiveNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function formatNumber(value) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return '-';
  }

  return number.toLocaleString('ko-KR', {
    maximumFractionDigits: Math.abs(number) >= 1000 ? 0 : 2
  });
}

function formatCurrencySuffix(currency) {
  return currency ? ` ${currency}` : '';
}

function formatDateOnly(value) {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})/);

  if (!match) {
    return '-';
  }

  return `${match[1]}.${match[2]}.${match[3]}`;
}
