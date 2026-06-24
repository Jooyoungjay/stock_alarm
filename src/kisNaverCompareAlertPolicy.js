export const KIS_NAVER_ALERT_POLICY_NOTES = Object.freeze({
  duplicate: '같은 알림 가능 이슈 조합은 한 번 전송한 뒤 이슈가 바뀔 때까지 중복 전송하지 않습니다.',
  cooldown: '같은 이슈는 쿨다운 시간이 지나야 재전송을 시도합니다.',
  acknowledged: '확인·보류 처리한 이슈는 같은 내용이 반복되어도 텔레그램 알림에서 제외합니다.',
  resolvedReopen:
    '해결 처리한 이슈가 다시 감지되면 열림으로 되돌리며, 재알림은 해결 후 쿨다운이 지난 뒤에만 보냅니다.',
  manual: '장기 반복 이슈는 확인 또는 보류로 두고, 일시적 해결이면 해결을 사용하세요.'
});

const defaultResolvedReopenCooldownMinutes = 1440;

export function buildKisNaverAutoCompareStableIssueKey(issue = {}) {
  const type = String(issue.type || '').trim();
  const symbol = String(issue.symbol || '').trim().toUpperCase();
  const market = String(issue.market || '').trim().toUpperCase();
  const legacyKey = String(issue.key || '').trim();

  switch (type) {
    case 'comparison_failed':
      return symbol ? `comparison_failed:${symbol}` : 'comparison_failed:unknown';
    case 'current_drift':
      return symbol && market
        ? `current_drift:${symbol}:${market}`
        : symbol
          ? `current_drift:${symbol}`
          : 'current_drift:unknown';
    case 'trend_repeated_abnormal':
    case 'trend_critical':
      return market ? `trend_abnormal:${market}` : 'trend_abnormal:unknown';
    case 'recommendation_changed':
      return legacyKey || 'recommendation_changed:unknown';
    case 'recommendation_review':
      return market
        ? `recommendation_review:${market}:${String(issue.currentMarket || issue.detail || '').slice(0, 40)}`
        : legacyKey || 'recommendation_review:unknown';
    default:
      return legacyKey || `issue:${type || 'unknown'}`;
  }
}

export function buildLegacyKisNaverCompareIssueKeys(issue = {}) {
  const legacyKeys = new Set();
  const legacyKey = String(issue.key || '').trim();
  const stableKey = buildKisNaverAutoCompareStableIssueKey(issue);

  if (legacyKey && legacyKey !== stableKey) {
    legacyKeys.add(legacyKey);
  }

  return [...legacyKeys];
}

export function resolveKisNaverCompareIssueState(stableKey, issueStates = {}, legacyKeys = []) {
  const normalizedStates =
    issueStates && typeof issueStates === 'object' && !Array.isArray(issueStates) ? issueStates : {};
  const lookupKeys = [stableKey, ...legacyKeys].filter(Boolean);

  for (const key of lookupKeys) {
    if (normalizedStates[key]) {
      return normalizedStates[key];
    }
  }

  return null;
}

export function shouldResendReopenedResolvedIssues(
  reopenedIssueKeys = [],
  issueStates = {},
  now = new Date(),
  cooldownMinutes = defaultResolvedReopenCooldownMinutes
) {
  const keys = (Array.isArray(reopenedIssueKeys) ? reopenedIssueKeys : []).filter(Boolean);

  if (!keys.length) {
    return false;
  }

  return keys.some((issueKey) => {
    const state = issueStates[issueKey];

    if (!state?.updatedAt) {
      return true;
    }

    return !isWithinMinutes(state.updatedAt, now, cooldownMinutes);
  });
}

export function formatKisNaverAutoCompareAlertSkipReason(reason = '') {
  const labels = {
    duplicate_issue: '중복 생략 — 같은 알림 가능 이슈가 이미 전송됨',
    cooldown: '쿨다운 생략 — 같은 이슈 재전송 대기 중',
    all_issues_handled: '처리 상태로 생략 — 확인·보류·해결 쿨다운 중인 이슈만 남음',
    kis_naver_auto_compare_alert_disabled: '자동 비교 알림 OFF',
    telegram_not_configured: 'Telegram 미설정',
    no_alert_issue: '알림 대상 이슈 없음',
    resolved_issue_reopened: '해결 이슈 재감지 — 재알림 전송'
  };

  return labels[String(reason || '').trim()] || String(reason || '').trim();
}

export function getDefaultResolvedReopenCooldownMinutes() {
  return defaultResolvedReopenCooldownMinutes;
}

function isWithinMinutes(previousAttemptAt, now, minutes) {
  const previousTime = new Date(previousAttemptAt).getTime();
  const nowTime = now instanceof Date ? now.getTime() : new Date(now).getTime();

  if (!Number.isFinite(previousTime) || !Number.isFinite(nowTime)) {
    return false;
  }

  return nowTime - previousTime < minutes * 60 * 1000;
}
