export const DIVIDEND_MANUAL_ENTRY_ACTION =
  '자동 조회가 막히면 편집에서 주당 연 배당금을 직접 입력하면 배당 계산에 바로 반영됩니다.';

export const DIVIDEND_RETRY_STOCK_ACTION =
  '배당 재시도로 이 종목의 provider 응답을 다시 확인하세요.';

export const DIVIDEND_REFRESH_ALL_ACTION =
  '전체 배당 새로고침으로 provider 검증을 다시 실행하세요.';

export const DIVIDEND_PRESERVED_VALUE_ACTION = '실패해도 기존 주당 연 배당금은 유지됩니다.';

const PROVIDER_SETUP_HINTS = {
  publicdata: 'DATA_GO_KR_SERVICE_KEY와 금융위원회_주식배당정보 활용 권한을 확인하세요.',
  opendart: 'OPEN_DART_API_KEY와 회사명 매칭을 확인하세요.',
  alphavantage: 'ALPHA_VANTAGE_API_KEY와 호출 한도를 확인하세요.',
  yahoo: 'Yahoo 심볼 매핑과 네트워크 응답을 확인하세요.'
};

const PROVIDER_LABELS = {
  publicdata: '공공데이터',
  opendart: 'OpenDART',
  alphavantage: 'Alpha Vantage',
  yahoo: 'Yahoo'
};

export function formatDividendFailureCause(error) {
  const message = String(error || '');

  if (!message) {
    return '';
  }

  if (/OPENDART_API_KEY|OpenDART.*키|missing_opendart/i.test(message)) {
    return 'OpenDART 키가 없어 해당 provider를 사용할 수 없습니다.';
  }

  if (/ALPHA_VANTAGE_API_KEY|Alpha Vantage.*키|missing_alpha/i.test(message)) {
    return 'Alpha Vantage 키가 없어 해외 배당 provider를 사용할 수 없습니다.';
  }

  if (/DATA_GO_KR_SERVICE_KEY|공공데이터.*키|missing_data_go_kr/i.test(message)) {
    return '공공데이터포털 키가 없거나 인증키가 아직 승인되지 않았을 수 있습니다.';
  }

  if (/HTTP 401|Unauthorized|unauthorized/i.test(message)) {
    return '비공식 Yahoo 조회가 인증 제한으로 실패했습니다.';
  }

  if (/한국 종목이 아니|not korean|korean.*only/i.test(message)) {
    return '공공데이터와 OpenDART는 국내 종목용이라 해외 종목은 다른 provider 키가 필요합니다.';
  }

  if (/찾을 수 없습니다|not found|no dividend|empty|배당 정보/i.test(message)) {
    return 'provider 데이터에 해당 종목 또는 우선주 배당 행이 아직 없거나 회사명 매칭이 실패했을 수 있습니다.';
  }

  return '';
}

export function formatDividendFailureReason(error) {
  return formatDividendFailureCause(error);
}

function isCredentialError(error) {
  const text = String(error || '').toLowerCase();

  return (
    text.includes('key') ||
    text.includes('service') ||
    text.includes('인증') ||
    text.includes('권한') ||
    text.includes('설정되지 않')
  );
}

export function getDividendProviderSetupHint(provider, error = '') {
  const normalizedProvider = String(provider || '').trim().toLowerCase();

  if (isCredentialError(error)) {
    return PROVIDER_SETUP_HINTS[normalizedProvider] || 'API 키와 provider 설정을 확인하세요.';
  }

  return PROVIDER_SETUP_HINTS[normalizedProvider] || 'provider 오류와 종목 코드 매핑을 확인하세요.';
}

export function getDividendProviderStatusAction(provider, status, error = '') {
  if (status === 'success') {
    return '최근 검증에서 정상 응답을 받았습니다.';
  }

  if (status === 'pending') {
    return '아직 최근 검증에서 호출되지 않았습니다.';
  }

  const normalizedProvider = String(provider || '').trim().toLowerCase();
  const label = PROVIDER_LABELS[normalizedProvider] || normalizedProvider || 'provider';
  const hint = getDividendProviderSetupHint(normalizedProvider, error);

  return `${label}: ${hint}`;
}

function getLastFailedAttempt(attempts) {
  const failedAttempts = (Array.isArray(attempts) ? attempts : []).filter(
    (attempt) => attempt?.status === 'error'
  );

  return failedAttempts[failedAttempts.length - 1] || null;
}

export function buildDividendFailureNextActions(options = {}) {
  const {
    error = '',
    provider = '',
    attempts = [],
    preservedAnnualDividendPerShare = null,
    includeRetry = true,
    includeManualEntry = true,
    includeCause = true
  } = options;
  const actions = [];
  const lastFailed = getLastFailedAttempt(attempts);
  const targetProvider = String(provider || lastFailed?.provider || '').trim().toLowerCase();
  const targetError = String(error || lastFailed?.error || '');
  const cause = includeCause ? formatDividendFailureCause(targetError) : '';

  if (cause) {
    actions.push(cause);
  }

  if (targetProvider) {
    const providerAction = getDividendProviderStatusAction(targetProvider, 'error', targetError);

    if (!actions.includes(providerAction)) {
      actions.push(providerAction);
    }
  }

  if (hasPositiveNumber(preservedAnnualDividendPerShare)) {
    actions.push(DIVIDEND_PRESERVED_VALUE_ACTION);
  }

  if (includeRetry) {
    actions.push(DIVIDEND_RETRY_STOCK_ACTION);
  }

  if (includeManualEntry) {
    actions.push(DIVIDEND_MANUAL_ENTRY_ACTION);
  }

  return actions;
}

export function formatDividendFailureNextActionsText(options = {}) {
  return buildDividendFailureNextActions(options).join(' ');
}

export function formatDividendFailureGuidance(error, options = {}) {
  return formatDividendFailureNextActionsText({
    error,
    ...options
  });
}

export function formatDividendFailureSummary(error, options = {}) {
  const message = String(error || '').trim();
  const cause = formatDividendFailureCause(message);
  const parts = [];

  if (message) {
    parts.push(message);
  }

  if (cause && cause !== message) {
    parts.push(cause);
  }

  const nextActions = formatDividendFailureNextActionsText(options);

  if (nextActions) {
    parts.push(`다음 조치: ${nextActions}`);
  }

  return parts.filter(Boolean).join('\n');
}

function hasPositiveNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0;
}
