import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getAdminAuthStatus,
  getAdminTokenFromRequest,
  isAdminApiPath,
  isAdminAuthEnabled,
  isAdminRequestAuthorized
} from '../src/adminAuth.js';

function request(headers = {}) {
  return { headers };
}

test('admin auth stays open when ADMIN_TOKEN is not configured', () => {
  const config = { adminToken: '' };

  assert.equal(isAdminAuthEnabled(config), false);
  assert.equal(isAdminRequestAuthorized(request(), config), true);
  assert.deepEqual(getAdminAuthStatus(request(), config), {
    required: false,
    authenticated: true
  });
});

test('admin auth accepts x-admin-token and bearer token', () => {
  const config = { adminToken: 'secret-token' };

  assert.equal(isAdminAuthEnabled(config), true);
  assert.equal(isAdminRequestAuthorized(request({ 'x-admin-token': 'secret-token' }), config), true);
  assert.equal(
    isAdminRequestAuthorized(request({ authorization: 'Bearer secret-token' }), config),
    true
  );
  assert.equal(isAdminRequestAuthorized(request({ 'x-admin-token': 'wrong' }), config), false);
});

test('admin auth extracts token from supported headers', () => {
  assert.equal(getAdminTokenFromRequest(request({ 'x-admin-token': ' abc ' })), 'abc');
  assert.equal(getAdminTokenFromRequest(request({ authorization: 'Bearer abc' })), 'abc');
  assert.equal(getAdminTokenFromRequest(request({ authorization: 'Basic abc' })), '');
});

test('admin api path detection protects operational routes only', () => {
  assert.equal(isAdminApiPath('GET', '/api/health'), true);
  assert.equal(isAdminApiPath('GET', '/api/roadmap'), true);
  assert.equal(isAdminApiPath('GET', '/api/observation-issues'), true);
  assert.equal(isAdminApiPath('GET', '/api/observation-history'), true);
  assert.equal(isAdminApiPath('POST', '/api/observation-history/run'), true);
  assert.equal(isAdminApiPath('POST', '/api/observation-history/prune'), true);
  assert.equal(isAdminApiPath('GET', '/api/observation-history/observation-2026-05-22T09-00-00-000Z.json'), true);
  assert.equal(isAdminApiPath('DELETE', '/api/observation-history/observation-2026-05-22T09-00-00-000Z.json'), true);
  assert.equal(
    isAdminApiPath(
      'PATCH',
      '/api/observation-history/observation-2026-05-22T09-00-00-000Z.json/results/server-start/action'
    ),
    true
  );
  assert.equal(isAdminApiPath('GET', '/api/backups'), true);
  assert.equal(isAdminApiPath('DELETE', '/api/backups/example.json'), true);
  assert.equal(isAdminApiPath('POST', '/api/check-now'), true);
  assert.equal(isAdminApiPath('POST', '/api/dividends/refresh'), true);
  assert.equal(isAdminApiPath('POST', '/api/dividend-alerts/check'), true);
  assert.equal(isAdminApiPath('POST', '/api/telegram/test'), true);
  assert.equal(isAdminApiPath('POST', '/api/kis/quote-smoke-test'), true);
  assert.equal(isAdminApiPath('POST', '/api/kis/naver-compare'), true);
  assert.equal(isAdminApiPath('POST', '/api/kis/naver-compare/auto-run'), true);
  assert.equal(isAdminApiPath('PATCH', '/api/kis/naver-compare/issues'), true);
  assert.equal(isAdminApiPath('POST', '/api/kis/naver-compare/apply'), true);
  assert.equal(isAdminApiPath('GET', '/api/admin/session'), false);
  assert.equal(isAdminApiPath('GET', '/api/stocks'), false);
  assert.equal(isAdminApiPath('GET', '/api/quote-preview'), false);
  assert.equal(isAdminApiPath('POST', '/api/devices'), false);
  assert.equal(isAdminApiPath('GET', '/api/mobile/ping'), false);
});
