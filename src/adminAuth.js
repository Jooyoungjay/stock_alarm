import { timingSafeEqual } from 'node:crypto';

export const ADMIN_TOKEN_HEADER = 'x-admin-token';

export function normalizeAdminToken(value) {
  return String(value || '').trim();
}

export function isAdminAuthEnabled(config) {
  return Boolean(normalizeAdminToken(config?.adminToken));
}

export function getAdminTokenFromRequest(request) {
  const headerToken = request.headers[ADMIN_TOKEN_HEADER];
  const authorization = request.headers.authorization || '';

  if (headerToken) {
    return normalizeAdminToken(Array.isArray(headerToken) ? headerToken[0] : headerToken);
  }

  if (authorization.toLowerCase().startsWith('bearer ')) {
    return normalizeAdminToken(authorization.slice(7));
  }

  return '';
}

export function isAdminRequestAuthorized(request, config) {
  const expectedToken = normalizeAdminToken(config?.adminToken);

  if (!expectedToken) {
    return true;
  }

  return safeTokenEquals(getAdminTokenFromRequest(request), expectedToken);
}

export function getAdminAuthStatus(request, config) {
  const required = isAdminAuthEnabled(config);

  return {
    required,
    authenticated: required ? isAdminRequestAuthorized(request, config) : true
  };
}

export function isAdminApiPath(method, pathname) {
  if (pathname === '/api/admin/session') {
    return false;
  }

  if (
    pathname === '/api/health' ||
    pathname === '/api/data-model' ||
    pathname === '/api/roadmap' ||
    pathname === '/api/observation-issues'
  ) {
    return true;
  }

  if (pathname === '/api/quote-provider-stats') {
    return true;
  }

  if (pathname === '/api/kis/quote-smoke-test' && method === 'POST') {
    return true;
  }

  if (pathname === '/api/kis/naver-compare' && method === 'POST') {
    return true;
  }

  if (pathname === '/api/kis/naver-compare/auto-run' && method === 'POST') {
    return true;
  }

  if (pathname === '/api/kis/naver-compare/issues' && method === 'PATCH') {
    return true;
  }

  if (pathname === '/api/kis/naver-compare/apply' && method === 'POST') {
    return true;
  }

  if (pathname === '/api/check-now' && method === 'POST') {
    return true;
  }

  if (pathname === '/api/dividends/refresh' && method === 'POST') {
    return true;
  }

  if (pathname === '/api/dividend-alerts/check' && method === 'POST') {
    return true;
  }

  if (pathname === '/api/briefing/send' && method === 'POST') {
    return true;
  }

  if (pathname === '/api/telegram/test' && method === 'POST') {
    return true;
  }

  return pathname === '/api/backups' || pathname.startsWith('/api/backups/');
}

function safeTokenEquals(actual, expected) {
  const actualBuffer = Buffer.from(normalizeAdminToken(actual));
  const expectedBuffer = Buffer.from(normalizeAdminToken(expected));

  if (actualBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return timingSafeEqual(actualBuffer, expectedBuffer);
}
