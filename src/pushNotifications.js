export const DEFAULT_EXPO_PUSH_ENDPOINT = 'https://exp.host/--/api/v2/push/send';

export function isExpoPushToken(token) {
  return /^(ExponentPushToken|ExpoPushToken)\[[^\]]+\]$/.test(String(token || '').trim());
}

export function buildExpoPushMessage(input = {}) {
  const token = String(input.token || '').trim();

  if (!isExpoPushToken(token)) {
    throw new Error('Expo 푸시 토큰 형식이 올바르지 않습니다.');
  }

  return {
    to: token,
    sound: input.sound || 'default',
    title: String(input.title || 'Stock Alarm').trim(),
    body: String(input.body || '').trim(),
    data: input.data && typeof input.data === 'object' ? input.data : {},
    priority: input.priority || 'high'
  };
}

export async function sendExpoPushMessages(messages, options = {}) {
  const endpoint = options.endpoint || DEFAULT_EXPO_PUSH_ENDPOINT;
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const payload = Array.isArray(messages) ? messages : [messages];

  if (!payload.length) {
    return buildPushDeliveryResult('not_configured', {
      reason: 'no_push_messages'
    });
  }

  if (typeof fetchImpl !== 'function') {
    return buildPushDeliveryResult('not_configured', {
      reason: 'missing_fetch'
    });
  }

  const response = await fetchImpl(endpoint, {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'accept-encoding': 'gzip, deflate',
      'content-type': 'application/json'
    },
    body: JSON.stringify(payload.length === 1 ? payload[0] : payload)
  });
  const body = await parseJsonResponse(response);

  if (!response.ok) {
    return buildPushDeliveryResult('failed', {
      failed: payload.length,
      errors: [getResponseError(body) || `Expo Push HTTP ${response.status}`],
      response: body
    });
  }

  const tickets = normalizeExpoTickets(body);
  const failedTickets = tickets.filter((ticket) => ticket.status === 'error');
  const sentTickets = tickets.filter((ticket) => ticket.status === 'ok');
  const status = failedTickets.length
    ? sentTickets.length
      ? 'partial'
      : 'failed'
    : 'sent';

  return buildPushDeliveryResult(status, {
    sent: sentTickets.length || (tickets.length ? 0 : payload.length),
    failed: failedTickets.length,
    errors: failedTickets.map(formatExpoTicketError).filter(Boolean),
    tickets,
    response: body
  });
}

export async function sendPushNotificationToDevice(store, config, deviceId, notification, options = {}) {
  if (config.mobilePushEnabled === false) {
    return buildPushDeliveryResult('not_configured', {
      reason: 'mobile_push_disabled'
    });
  }

  if (!deviceId) {
    return buildPushDeliveryResult('not_configured', {
      reason: 'stock_has_no_device'
    });
  }

  if (typeof store.listDevicePushTokens !== 'function') {
    return buildPushDeliveryResult('not_configured', {
      reason: 'store_cannot_list_push_tokens'
    });
  }

  const tokens = await store.listDevicePushTokens(deviceId, {
    provider: 'expo',
    enabledOnly: true
  });
  const uniqueTokens = dedupePushTokens(tokens)
    .map((token) => token.token)
    .filter(isExpoPushToken);

  if (!uniqueTokens.length) {
    return buildPushDeliveryResult('not_configured', {
      reason: 'device_has_no_push_tokens'
    });
  }

  const messages = uniqueTokens.map((token) =>
    buildExpoPushMessage({
      token,
      title: notification.title,
      body: notification.body,
      data: {
        ...(notification.data || {}),
        deviceId
      }
    })
  );

  return sendExpoPushMessages(messages, {
    endpoint: config.expoPushEndpoint,
    fetchImpl: options.fetchImpl
  });
}

export function sendPushNotificationForStock(store, config, stock, alertMessage, context = {}, options = {}) {
  return sendPushNotificationToDevice(
    store,
    config,
    stock.deviceId,
    {
      title: `[Stock Alarm] ${stock.displayName || stock.symbol}`,
      body: buildCompactAlertBody(alertMessage),
      data: {
        type: 'stock-alert',
        stockId: stock.id,
        symbol: stock.symbol,
        alertType: context.evaluation?.alertType || stock.alertType || '',
        price: context.quote?.price ?? null,
        thresholdPrice: context.evaluation?.thresholdPrice ?? null,
        createdAt: new Date().toISOString()
      }
    },
    options
  );
}

function buildPushDeliveryResult(deliveryStatus, values = {}) {
  return {
    deliveryStatus,
    reason: values.reason || '',
    sent: values.sent || 0,
    failed: values.failed || 0,
    errors: values.errors || [],
    tickets: values.tickets || [],
    response: values.response || null
  };
}

function dedupePushTokens(tokens) {
  const seen = new Set();
  const result = [];

  for (const token of tokens || []) {
    const value = String(token?.token || '').trim();

    if (!value || seen.has(value)) {
      continue;
    }

    seen.add(value);
    result.push({
      ...token,
      token: value
    });
  }

  return result;
}

function buildCompactAlertBody(message) {
  const lines = String(message || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const body = lines.slice(1, 4).join(' · ') || lines[0] || '알림 조건에 도달했습니다.';

  return body.length > 180 ? `${body.slice(0, 177)}...` : body;
}

async function parseJsonResponse(response) {
  if (typeof response.json === 'function') {
    try {
      return await response.json();
    } catch {
      return {};
    }
  }

  if (typeof response.text !== 'function') {
    return {};
  }

  const text = await response.text();

  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text);
  } catch {
    return {
      message: text
    };
  }
}

function normalizeExpoTickets(body) {
  const data = body?.data;

  if (Array.isArray(data)) {
    return data;
  }

  if (data && typeof data === 'object') {
    return [data];
  }

  return [];
}

function formatExpoTicketError(ticket) {
  if (!ticket || typeof ticket !== 'object') {
    return '';
  }

  const detail = ticket.details?.error ? ` (${ticket.details.error})` : '';
  return `${ticket.message || 'Expo Push error'}${detail}`;
}

function getResponseError(body) {
  if (!body || typeof body !== 'object') {
    return '';
  }

  return body.error || body.message || '';
}
