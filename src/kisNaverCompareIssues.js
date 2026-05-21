export const kisNaverCompareIssueStatesMetaKey = 'kisNaverCompareIssueStates';

export const KIS_NAVER_COMPARE_ISSUE_STATUSES = Object.freeze({
  OPEN: 'open',
  ACKNOWLEDGED: 'acknowledged',
  ON_HOLD: 'on_hold',
  RESOLVED: 'resolved'
});

const allowedStatuses = new Set(Object.values(KIS_NAVER_COMPARE_ISSUE_STATUSES));

export function normalizeKisNaverCompareIssueKey(value) {
  return String(value || '').trim();
}

export function normalizeKisNaverCompareIssueStateStatus(value) {
  const status = String(value || '').trim().toLowerCase();

  return allowedStatuses.has(status) ? status : '';
}

export function normalizeKisNaverCompareIssueStates(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  return Object.entries(value).reduce((result, [rawKey, rawState]) => {
    const key = normalizeKisNaverCompareIssueKey(rawKey);

    if (!key) {
      return result;
    }

    const source = rawState && typeof rawState === 'object' && !Array.isArray(rawState)
      ? rawState
      : {};
    const status = normalizeKisNaverCompareIssueStateStatus(source.status);

    if (!status) {
      return result;
    }

    result[key] = {
      issueKey: key,
      status,
      updatedAt: normalizeIsoDateTime(source.updatedAt),
      note: normalizeNote(source.note)
    };

    return result;
  }, {});
}

export async function readKisNaverCompareIssueStates(store) {
  if (typeof store?.getMetaValue !== 'function') {
    return {};
  }

  return normalizeKisNaverCompareIssueStates(
    await store.getMetaValue(kisNaverCompareIssueStatesMetaKey, {})
  );
}

export async function updateKisNaverCompareIssueState(store, input = {}, options = {}) {
  if (typeof store?.setMetaValue !== 'function') {
    throw new Error('이슈 상태를 저장할 수 없습니다.');
  }

  const issueKey = normalizeKisNaverCompareIssueKey(input.issueKey || input.key);
  const status = normalizeKisNaverCompareIssueStateStatus(input.status);

  if (!issueKey) {
    throw new Error('처리할 가격 비교 이슈 키가 필요합니다.');
  }

  if (!status) {
    throw new Error('가격 비교 이슈 상태는 open, acknowledged, on_hold, resolved 중 하나여야 합니다.');
  }

  const issueStates = await readKisNaverCompareIssueStates(store);
  const updatedAt = toIsoDateTime(options.now || new Date());
  const note = normalizeNote(input.note);
  const issueState = {
    issueKey,
    status,
    updatedAt,
    note
  };

  const nextIssueStates = {
    ...issueStates,
    [issueKey]: issueState
  };

  await store.setMetaValue(kisNaverCompareIssueStatesMetaKey, nextIssueStates);

  return {
    issueKey,
    issueState,
    issueStates: nextIssueStates
  };
}

export function applyKisNaverCompareIssueStates(snapshot, issueStates = {}) {
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) {
    return snapshot || null;
  }

  const normalizedStates = normalizeKisNaverCompareIssueStates(issueStates);
  const alert = snapshot.alert && typeof snapshot.alert === 'object' && !Array.isArray(snapshot.alert)
    ? snapshot.alert
    : null;
  const issues = Array.isArray(alert?.issues) ? alert.issues : [];

  if (!alert || !issues.length) {
    return snapshot;
  }

  const decoratedIssues = issues.map((issue) => {
    const key = normalizeKisNaverCompareIssueKey(issue?.key);
    const resolution = normalizedStates[key] || buildOpenIssueState(key);

    return {
      ...issue,
      resolution
    };
  });
  const issueStateSummary = buildKisNaverCompareIssueStateSummary(decoratedIssues);

  return {
    ...snapshot,
    alert: {
      ...alert,
      issues: decoratedIssues,
      issueStateSummary,
      openIssueCount: issueStateSummary.open,
      handledIssueCount:
        issueStateSummary.acknowledged + issueStateSummary.on_hold + issueStateSummary.resolved
    }
  };
}

export function buildKisNaverCompareIssueStateSummary(issues = []) {
  const summary = {
    open: 0,
    acknowledged: 0,
    on_hold: 0,
    resolved: 0,
    total: 0
  };

  for (const issue of Array.isArray(issues) ? issues : []) {
    const status =
      normalizeKisNaverCompareIssueStateStatus(issue?.resolution?.status || issue?.status) ||
      KIS_NAVER_COMPARE_ISSUE_STATUSES.OPEN;
    summary[status] = Number(summary[status] || 0) + 1;
    summary.total += 1;
  }

  return summary;
}

function buildOpenIssueState(issueKey) {
  return {
    issueKey,
    status: KIS_NAVER_COMPARE_ISSUE_STATUSES.OPEN,
    updatedAt: '',
    note: ''
  };
}

function normalizeNote(value) {
  return String(value || '').trim().slice(0, 300);
}

function normalizeIsoDateTime(value) {
  const text = String(value || '').trim();

  if (!text) {
    return '';
  }

  const timestamp = Date.parse(text);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : '';
}

function toIsoDateTime(value) {
  if (value instanceof Date) {
    return value.toISOString();
  }

  return normalizeIsoDateTime(value) || new Date().toISOString();
}
