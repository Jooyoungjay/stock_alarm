export const DEFAULT_API_BASE_URL = 'http://127.0.0.1:3001';

export function normalizeBaseUrl(value) {
  const raw = String(value || '').trim();
  const fallback = DEFAULT_API_BASE_URL;
  const withProtocol = raw
    ? (/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `http://${raw}`)
    : fallback;

  return withProtocol.replace(/\/+$/, '');
}

export function normalizeDevicePlatform(value) {
  const platform = String(value || '').trim().toLowerCase();

  if (['ios', 'android', 'web'].includes(platform)) {
    return platform;
  }

  return 'unknown';
}

export function buildMobileHeaders(session, extra = {}) {
  const headers = {
    accept: 'application/json',
    ...extra
  };

  if (session?.deviceId && session?.deviceSecret) {
    headers['x-device-id'] = session.deviceId;
    headers['x-device-secret'] = session.deviceSecret;
  }

  return headers;
}

export async function requestJson(path, options = {}) {
  const {
    baseUrl = DEFAULT_API_BASE_URL,
    method = 'GET',
    body,
    session,
    fetchImpl = globalThis.fetch
  } = options;

  if (typeof fetchImpl !== 'function') {
    throw new Error('fetch 구현체가 필요합니다.');
  }

  const hasBody = body !== undefined;
  const response = await fetchImpl(`${normalizeBaseUrl(baseUrl)}${path}`, {
    method,
    headers: buildMobileHeaders(session, hasBody ? { 'content-type': 'application/json' } : {}),
    body: hasBody ? JSON.stringify(body) : undefined
  });

  const payload = await parseJsonResponse(response);

  if (!response.ok) {
    throw new Error(getPayloadError(payload) || `HTTP ${response.status}`);
  }

  return payload;
}

export function checkHealth({ baseUrl, fetchImpl } = {}) {
  return requestJson('/api/mobile/ping', { baseUrl, fetchImpl });
}

export function createDevice({ baseUrl, label, platform, fetchImpl } = {}) {
  return requestJson('/api/devices', {
    baseUrl,
    method: 'POST',
    body: {
      label: String(label || '').trim() || 'Stock Alarm Mobile',
      platform: normalizeDevicePlatform(platform)
    },
    fetchImpl
  });
}

export function getMobileSnapshot({ baseUrl, session, fetchImpl } = {}) {
  return requestJson('/api/mobile/stocks', {
    baseUrl,
    session,
    fetchImpl
  });
}

export function createMobileStock({ baseUrl, session, stock, fetchImpl } = {}) {
  return requestJson('/api/mobile/stocks', {
    baseUrl,
    method: 'POST',
    body: stock,
    session,
    fetchImpl
  });
}

export function updateMobileStock({ baseUrl, session, stockId, patch, fetchImpl } = {}) {
  return requestJson(`/api/mobile/stocks/${encodeURIComponent(stockId)}`, {
    baseUrl,
    method: 'PATCH',
    body: patch,
    session,
    fetchImpl
  });
}

export function deleteMobileStock({ baseUrl, session, stockId, fetchImpl } = {}) {
  return requestJson(`/api/mobile/stocks/${encodeURIComponent(stockId)}`, {
    baseUrl,
    method: 'DELETE',
    session,
    fetchImpl
  });
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
    return { message: text };
  }
}

function getPayloadError(payload) {
  if (!payload || typeof payload !== 'object') {
    return '';
  }

  return payload.error || payload.message || '';
}
