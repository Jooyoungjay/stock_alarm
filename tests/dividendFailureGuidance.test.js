import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildDividendFailureNextActions,
  formatDividendFailureCause,
  formatDividendFailureGuidance,
  formatDividendFailureSummary,
  getDividendProviderStatusAction,
  DIVIDEND_MANUAL_ENTRY_ACTION,
  DIVIDEND_RETRY_STOCK_ACTION
} from '../public/dividendFailureGuidance.js';

test('formatDividendFailureCause maps missing provider keys to readable causes', () => {
  assert.match(
    formatDividendFailureCause('DATA_GO_KR_SERVICE_KEY가 설정되지 않았습니다.'),
    /공공데이터/
  );
  assert.match(formatDividendFailureCause('OPENDART_API_KEY가 설정되지 않았습니다.'), /OpenDART/);
});

test('buildDividendFailureNextActions returns unified retry and manual entry guidance', () => {
  const actions = buildDividendFailureNextActions({
    error: 'DATA_GO_KR_SERVICE_KEY가 설정되지 않았습니다.',
    provider: 'publicdata',
    attempts: [
      {
        provider: 'publicdata',
        status: 'error',
        error: 'DATA_GO_KR_SERVICE_KEY가 설정되지 않았습니다.'
      }
    ],
    preservedAnnualDividendPerShare: 500
  });

  assert.ok(actions.some((action) => /공공데이터/.test(action)));
  assert.ok(actions.includes(DIVIDEND_RETRY_STOCK_ACTION));
  assert.ok(actions.includes(DIVIDEND_MANUAL_ENTRY_ACTION));
  assert.ok(actions.some((action) => /유지/.test(action)));
});

test('formatDividendFailureGuidance matches stock card and telegram guidance shape', () => {
  const guidance = formatDividendFailureGuidance('배당 정보를 찾을 수 없습니다: 33626L', {
    provider: 'opendart',
    preservedAnnualDividendPerShare: 500
  });

  assert.match(guidance, /provider 데이터/);
  assert.match(guidance, /OpenDART:/);
  assert.match(guidance, /배당 재시도/);
  assert.match(guidance, /직접 입력/);
});

test('getDividendProviderStatusAction keeps admin provider card wording', () => {
  assert.match(
    getDividendProviderStatusAction('publicdata', 'error', 'SERVICE_KEY_IS_NOT_REGISTERED_ERROR'),
    /공공데이터:/
  );
  assert.equal(getDividendProviderStatusAction('yahoo', 'success'), '최근 검증에서 정상 응답을 받았습니다.');
});

test('formatDividendFailureSummary includes failure and next action lines', () => {
  const summary = formatDividendFailureSummary('배당 정보 조회 실패: opendart: 배당 정보를 찾을 수 없습니다.', {
    provider: 'opendart'
  });

  assert.match(summary, /배당 정보 조회 실패/);
  assert.match(summary, /다음 조치:/);
  assert.match(summary, /배당 재시도/);
});
