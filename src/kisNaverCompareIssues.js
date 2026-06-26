import {
  buildLegacyKisNaverCompareIssueKeys,
  resolveKisNaverCompareIssueState
} from './kisNaverCompareAlertPolicy.js';

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

export async function reopenResolvedKisNaverCompareIssues(store, issueKeys = [], options = {}) {
  if (typeof store?.setMetaValue !== 'function') {
    return {
      issueStates: {},
      reopenedIssueKeys: []
    };
  }

  const normalizedKeys = [
    ...new Set(
      (Array.isArray(issueKeys) ? issueKeys : [])
        .map(normalizeKisNaverCompareIssueKey)
        .filter(Boolean)
    )
  ];

  if (!normalizedKeys.length) {
    return {
      issueStates: await readKisNaverCompareIssueStates(store),
      reopenedIssueKeys: []
    };
  }

  const issueStates = await readKisNaverCompareIssueStates(store);
  const updatedAt = toIsoDateTime(options.now || new Date());
  const note = normalizeNote(options.note || '해결 처리된 이슈가 다시 감지되어 열림으로 전환');
  const nextIssueStates = { ...issueStates };
  const reopenedIssueKeys = [];

  for (const issueKey of normalizedKeys) {
    const current = issueStates[issueKey];

    if (current?.status !== KIS_NAVER_COMPARE_ISSUE_STATUSES.RESOLVED) {
      continue;
    }

    nextIssueStates[issueKey] = {
      issueKey,
      status: KIS_NAVER_COMPARE_ISSUE_STATUSES.OPEN,
      updatedAt,
      note
    };
    reopenedIssueKeys.push(issueKey);
  }

  if (reopenedIssueKeys.length) {
    await store.setMetaValue(kisNaverCompareIssueStatesMetaKey, nextIssueStates);
  }

  return {
    issueStates: nextIssueStates,
    reopenedIssueKeys
  };
}

export function applyKisNaverCompareIssueStates(snapshot, issueStates = {}) {
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) {
    return snapshot || null;
  }

  const alert = snapshot.alert && typeof snapshot.alert === 'object' && !Array.isArray(snapshot.alert)
    ? snapshot.alert
    : null;
  const issues = Array.isArray(alert?.issues) ? alert.issues : [];

  if (!alert || !issues.length) {
    return snapshot;
  }

  const decoratedIssues = decorateKisNaverCompareIssues(issues, issueStates);
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

export function decorateKisNaverCompareIssues(issues = [], issueStates = {}) {
  const normalizedStates = normalizeKisNaverCompareIssueStates(issueStates);

  return (Array.isArray(issues) ? issues : []).map((issue) => {
    const key = normalizeKisNaverCompareIssueKey(issue?.key);
    const legacyKeys = buildLegacyKisNaverCompareIssueKeys(issue);
    const stored = resolveKisNaverCompareIssueState(key, normalizedStates, legacyKeys);
    const resolution = stored
      ? {
          ...stored,
          issueKey: key
        }
      : buildOpenIssueState(key);

    return {
      ...issue,
      resolution
    };
  });
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

export function summarizeKisNaverCompareOpenIssues(snapshot) {
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) {
    return null;
  }

  const alert =
    snapshot.alert && typeof snapshot.alert === 'object' && !Array.isArray(snapshot.alert)
      ? snapshot.alert
      : null;

  if (!alert) {
    return null;
  }

  const openFromCount = Number(alert.openIssueCount);

  if (Number.isFinite(openFromCount) && openFromCount > 0) {
    return {
      open: openFromCount,
      total: Number(alert.issueStateSummary?.total) || openFromCount,
      checkedAt: normalizeCheckedAt(snapshot.checkedAt || alert.attemptedAt)
    };
  }

  const issues = Array.isArray(alert.issues) ? alert.issues : [];
  const open = issues.filter((issue) => {
    const status =
      normalizeKisNaverCompareIssueStateStatus(issue?.resolution?.status) ||
      KIS_NAVER_COMPARE_ISSUE_STATUSES.OPEN;

    return status === KIS_NAVER_COMPARE_ISSUE_STATUSES.OPEN;
  }).length;

  if (!open) {
    return null;
  }

  return {
    open,
    total: issues.length,
    checkedAt: normalizeCheckedAt(snapshot.checkedAt || alert.attemptedAt)
  };
}

function normalizeCheckedAt(value) {
  const text = String(value || '').trim();

  if (!text) {
    return '';
  }

  const timestamp = Date.parse(text);
  return Number.isFinite(timestamp) ? text : '';
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
