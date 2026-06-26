import { buildKisNaverQuoteComparison } from './kisNaverCompare.js';
import {
  buildKisNaverAutoCompareStableIssueKey,
  buildLegacyKisNaverCompareIssueKeys,
  resolveKisNaverCompareIssueState,
  shouldResendReopenedResolvedIssues
} from './kisNaverCompareAlertPolicy.js';
import {
  KIS_NAVER_COMPARE_ISSUE_STATUSES,
  applyKisNaverCompareIssueStates,
  decorateKisNaverCompareIssues,
  normalizeKisNaverCompareIssueKey,
  readKisNaverCompareIssueStates,
  reopenResolvedKisNaverCompareIssues
} from './kisNaverCompareIssues.js';
import { isKoreanStockSymbol } from './priceProvider.js';
import {
  buildKisNaverCompareTrendSnapshot,
  buildKisNaverTrendRecommendation
} from './storage.js';
import { normalizeSymbolInput } from './symbols.js';
import {
  isTelegramConfigured,
  sendTelegramMessage as sendDefaultTelegramMessage
} from './telegram.js';

export const lastKisNaverAutoCompareMetaKey = 'lastKisNaverAutoCompare';
export const lastKisNaverAutoCompareAlertMetaKey = 'lastKisNaverAutoCompareAlert';

const defaultCandidateLimit = 5;
const defaultMarkets = 'all';
const defaultDriftThresholdPercent = 1;
const defaultAlertCooldownMinutes = 360;

export function normalizeKisNaverAutoCompareSymbol(value) {
  const normalized = normalizeSymbolInput(value) || String(value || '').trim().toUpperCase();
  return normalized.replace(/\.(KS|KQ)$/i, '');
}

export function buildKisNaverAutoCompareCandidates(stocks = [], options = {}) {
  const limit = normalizePositiveInteger(options.limit, defaultCandidateLimit, { min: 1 });
  const candidates = [];
  const seen = new Set();

  for (const stock of Array.isArray(stocks) ? stocks : []) {
    const symbol = normalizeKisNaverAutoCompareSymbol(stock?.symbol);

    if (!symbol || stock?.active === false || !isKoreanStockSymbol(symbol) || seen.has(symbol)) {
      continue;
    }

    seen.add(symbol);
    candidates.push({
      stockId: String(stock?.id || ''),
      symbol,
      displayName: String(stock?.displayName || stock?.name || stock?.symbol || symbol).trim(),
      kisMarketDivCode: String(stock?.kisMarketDivCode || '').trim().toUpperCase()
    });

    if (candidates.length >= limit) {
      break;
    }
  }

  return candidates;
}

export async function runKisNaverAutoCompare(store, config = {}, options = {}) {
  const now = toDate(options.now);
  const checkedAt = now.toISOString();
  const forced = Boolean(options.force);
  const enabled = Boolean(config.kisNaverAutoCompareEnabled);
  const previousSnapshot = await readLastKisNaverAutoCompareSnapshot(store);

  if (!enabled && !forced) {
    return persistLastKisNaverAutoCompare(store, {
      checkedAt,
      enabled,
      forced,
      skipped: true,
      reason: 'kis_naver_auto_compare_disabled',
      summary: createAutoCompareSummary([]),
      candidates: [],
      results: []
    });
  }

  const stocks = await store.listStocks();
  const candidates = buildKisNaverAutoCompareCandidates(stocks, {
    limit: options.limit ?? config.kisNaverAutoCompareLimit
  });

  if (!candidates.length) {
    return persistLastKisNaverAutoCompare(store, {
      checkedAt,
      enabled,
      forced,
      skipped: true,
      reason: 'no_active_korean_stocks',
      summary: createAutoCompareSummary([]),
      candidates: [],
      results: []
    });
  }

  const compare = options.compare || ((body) => buildKisNaverQuoteComparison(buildCompareOptions(body, config)));
  const results = [];

  for (const candidate of candidates) {
    results.push(
      await compareCandidate(store, compare, candidate, {
        checkedAt,
        market: options.market || config.kisNaverAutoCompareMarkets || defaultMarkets,
        driftThresholdPercent:
          options.driftThresholdPercent ??
          config.kisNaverAutoCompareDriftThresholdPercent ??
          defaultDriftThresholdPercent
      })
    );
  }

  const kisNaverCompareHistory =
    typeof store.getKisNaverCompareHistory === 'function'
      ? await store.getKisNaverCompareHistory(12)
      : [];
  const kisNaverCompareTrend = buildKisNaverCompareTrendSnapshot(kisNaverCompareHistory);
  const kisNaverTrendRecommendation =
    kisNaverCompareTrend.recommendation || buildKisNaverTrendRecommendation(kisNaverCompareTrend);
  const result = {
    checkedAt,
    enabled,
    forced,
    skipped: false,
    reason: '',
    summary: createAutoCompareSummary(results),
    candidates,
    results,
    kisNaverCompareHistory,
    kisNaverCompareTrend,
    kisNaverTrendRecommendation
  };
  result.alert = await maybeSendKisNaverAutoCompareAlert(store, config, result, {
    previousSnapshot,
    now,
    sendTelegramMessage: options.sendTelegramMessage
  });

  await persistLastKisNaverAutoCompare(store, result);
  return result;
}

export function buildKisNaverAutoCompareAlertIssues(result = {}, previousSnapshot = {}) {
  const issues = [];
  const seen = new Set();

  const addIssue = (issue) => {
    if (!issue?.key || seen.has(issue.key)) {
      return;
    }

    seen.add(issue.key);
    issues.push(issue);
  };

  for (const item of Array.isArray(result.results) ? result.results : []) {
    const status = String(item.status || '').trim();
    const symbol = String(item.symbol || '').trim().toUpperCase();
    const name = item.displayName || symbol || '종목';

    if (status === 'failed' || status === 'error' || item.ok === false) {
      const reason = normalizeIssueText(item.error || item.message || '가격 비교 실패');

      addIssue({
        type: 'comparison_failed',
        key: buildKisNaverAutoCompareStableIssueKey({
          type: 'comparison_failed',
          symbol
        }),
        severity: 'error',
        title: `${name} 비교 실패`,
        detail: reason,
        symbol,
        status
      });
    }

    const drift = item.drift || {};
    const driftStatus = String(drift.status || '').trim();

    if (
      drift.abnormal ||
      Number(drift.abnormal || 0) > 0 ||
      driftStatus === 'warning' ||
      driftStatus === 'critical'
    ) {
      const market = String(drift.worstMarket || '').trim().toUpperCase();
      const marketLabel = drift.worstMarketLabel || market || '시장';
      const difference = formatPercentValue(drift.maxAbsoluteDifferencePercent);
      const threshold = formatPercentValue(drift.thresholdPercent);

      addIssue({
        type: 'current_drift',
        key: buildKisNaverAutoCompareStableIssueKey({
          type: 'current_drift',
          symbol,
          market
        }),
        severity: driftStatus === 'critical' ? 'critical' : 'warning',
        title: `${name} 가격 괴리 ${getDriftStatusLabel(driftStatus)}`,
        detail: `${marketLabel} 최대 괴리율 ${difference}, 기준 ${threshold}`,
        symbol,
        market,
        marketLabel
      });
    }
  }

  const trend = result.kisNaverCompareTrend || {};

  for (const market of Array.isArray(trend.markets) ? trend.markets : []) {
    const status = String(market.status || '').trim();
    const marketCode = String(market.market || '').trim().toUpperCase();
    const marketLabel = market.marketLabel || marketCode || '시장';

    if (market.repeatedAbnormal) {
      addIssue({
        type: 'trend_repeated_abnormal',
        key: buildKisNaverAutoCompareStableIssueKey({
          type: 'trend_repeated_abnormal',
          market: marketCode
        }),
        severity: 'critical',
        title: `${marketLabel} 반복 이상치`,
        detail: `이상치 ${market.abnormalCount || 0}회 · 최근 괴리율 ${formatPercentValue(market.latestAbsoluteDifferencePercent)}`,
        market: marketCode,
        marketLabel
      });
    } else if (status === 'critical') {
      addIssue({
        type: 'trend_critical',
        key: buildKisNaverAutoCompareStableIssueKey({
          type: 'trend_critical',
          market: marketCode
        }),
        severity: 'critical',
        title: `${marketLabel} 추세 경고`,
        detail: `최근 상태 ${getDriftStatusLabel(market.latestStatus)} · 최대 괴리율 ${formatPercentValue(market.maxAbsoluteDifferencePercent)}`,
        market: marketCode,
        marketLabel
      });
    }
  }

  const currentRecommendation = getSnapshotRecommendation(result);
  const previousRecommendation = getSnapshotRecommendation(previousSnapshot);

  if (
    currentRecommendation?.market &&
    previousRecommendation?.market &&
    currentRecommendation.market !== previousRecommendation.market
  ) {
    addIssue({
      type: 'recommendation_changed',
      key: `recommendation_changed:${previousRecommendation.market}->${currentRecommendation.market}`,
      severity: 'warning',
      title: '추세 추천 시장 변경',
      detail: `${previousRecommendation.marketLabel || previousRecommendation.market} -> ${currentRecommendation.marketLabel || currentRecommendation.market}`,
      market: currentRecommendation.market,
      marketLabel: currentRecommendation.marketLabel || currentRecommendation.market
    });
  }

  if (
    currentRecommendation?.decision === 'review' ||
    currentRecommendation?.conflictsWithCurrent
  ) {
    addIssue({
      type: 'recommendation_review',
      key: buildKisNaverAutoCompareStableIssueKey({
        type: 'recommendation_review',
        market: currentRecommendation.market || '',
        currentMarket: currentRecommendation.currentMarket || '',
        detail: currentRecommendation.reason || ''
      }),
      severity: 'warning',
      title: '추세 추천 추가 확인 필요',
      detail:
        currentRecommendation.reason ||
        `${currentRecommendation.marketLabel || currentRecommendation.market} 추세 추천을 바로 적용하기 전 추가 비교가 필요합니다.`,
      market: currentRecommendation.market || '',
      marketLabel: currentRecommendation.marketLabel || currentRecommendation.market || ''
    });
  }

  return issues;
}

export function buildKisNaverAutoCompareAlertFingerprint(issues = []) {
  const keys = (Array.isArray(issues) ? issues : [])
    .map((issue) => String(issue?.key || '').trim())
    .filter(Boolean)
    .sort();

  return keys.join('|');
}

export function formatKisNaverAutoCompareAlertMessage(result = {}, issues = []) {
  const summary = result.summary || {};
  const trendRecommendation = getSnapshotRecommendation(result);
  const lines = [
    '[Stock Alarm] KIS/Naver 자동 점검 알림',
    `기준 시각: ${formatDateTime(result.checkedAt)}`,
    `대상 ${summary.checked || 0}개 · 성공 ${summary.success || 0}개 · 실패 ${Number(summary.failed || 0) + Number(summary.error || 0)}개`,
    '',
    '이슈',
    ...(issues.length
      ? issues.slice(0, 8).map((issue) => `- ${issue.title}: ${issue.detail || '-'}`)
      : ['- 특이사항 없음'])
  ];

  if (issues.length > 8) {
    lines.push(`- 그 외 ${issues.length - 8}건`);
  }

  if (trendRecommendation?.market) {
    lines.push(
      '',
      `추세 추천: ${trendRecommendation.marketLabel || trendRecommendation.market} · 표본 ${trendRecommendation.sampleCount || trendRecommendation.comparableCount || 0}개 · 신뢰 ${trendRecommendation.confidence || '-'}`
    );
  }

  lines.push('', '관리자 화면에서 KIS/Naver 가격 비교를 확인하세요.');

  return lines.join('\n');
}

export async function maybeSendKisNaverAutoCompareAlert(
  store,
  config = {},
  result = {},
  options = {}
) {
  const now = toDate(options.now);
  const checkedAt = result.checkedAt || now.toISOString();
  const rawIssues = buildKisNaverAutoCompareAlertIssues(result, options.previousSnapshot || {});
  let issueStates = await readKisNaverCompareIssueStates(store);
  const preReopenIssueStates = { ...issueStates };
  const resolvedReopenCooldownMinutes = normalizePositiveInteger(
    config.kisNaverAutoCompareResolvedReopenCooldownMinutes,
    1440,
    { min: 1 }
  );
  const resolvedIssueKeys = getIssueKeysByState(rawIssues, issueStates, KIS_NAVER_COMPARE_ISSUE_STATUSES.RESOLVED);
  const reopened = await reopenResolvedKisNaverCompareIssues(store, resolvedIssueKeys, {
    now,
    note: '자동 비교에서 해결 처리된 이슈가 다시 감지되어 열림으로 전환'
  });

  if (reopened.reopenedIssueKeys.length) {
    issueStates = reopened.issueStates;
  }

  const issuePolicy = buildKisNaverAutoCompareIssueAlertPolicy(
    decorateKisNaverCompareIssues(rawIssues, issueStates),
    reopened.reopenedIssueKeys,
    {
      issueStates: preReopenIssueStates,
      now,
      resolvedReopenCooldownMinutes
    }
  );
  const issues = issuePolicy.issues;
  const alertableIssues = issuePolicy.alertableIssues;
  const fingerprint = buildKisNaverAutoCompareAlertFingerprint(issues);
  const notificationFingerprint = buildKisNaverAutoCompareAlertFingerprint(alertableIssues);
  const previousAlert = await readLastKisNaverAutoCompareAlert(store);
  const baseAlert = {
    checkedAt,
    fingerprint,
    notificationFingerprint,
    issueCount: issues.length,
    alertableIssueCount: alertableIssues.length,
    suppressedIssueCount: issuePolicy.suppressedIssues.length,
    reopenedIssueCount: issuePolicy.reopenedIssueKeys.length,
    issues
  };

  if (!issues.length) {
    return persistKisNaverAutoCompareAlert(store, {
      ...baseAlert,
      deliveryStatus: 'no_issue',
      reason: 'no_alert_issue'
    });
  }

  if (!alertableIssues.length) {
    const sameFingerprint = previousAlert?.fingerprint === fingerprint;

    return persistKisNaverAutoCompareAlert(store, {
      ...baseAlert,
      deliveryStatus: 'skipped',
      reason: 'all_issues_handled',
      sentAt: sameFingerprint ? previousAlert.sentAt || null : null,
      attemptedAt: sameFingerprint
        ? previousAlert.attemptedAt || previousAlert.sentAt || null
        : null
    });
  }

  if (config.kisNaverAutoCompareAlertEnabled === false) {
    return persistKisNaverAutoCompareAlert(store, {
      ...baseAlert,
      deliveryStatus: 'disabled',
      reason: 'kis_naver_auto_compare_alert_disabled'
    });
  }

  const previousNotificationFingerprint = getPreviousNotificationFingerprint(previousAlert);
  const sameNotificationFingerprint = previousNotificationFingerprint === notificationFingerprint;
  const forceResolvedIssueResend =
    issuePolicy.reopenedIssueKeys.length > 0 &&
    shouldResendReopenedResolvedIssues(
      issuePolicy.reopenedIssueKeys,
      preReopenIssueStates,
      now,
      resolvedReopenCooldownMinutes
    );

  if (sameNotificationFingerprint && previousAlert?.sentAt && !forceResolvedIssueResend) {
    return persistKisNaverAutoCompareAlert(store, {
      ...baseAlert,
      deliveryStatus: 'skipped',
      reason: 'duplicate_issue',
      sentAt: previousAlert.sentAt,
      attemptedAt: previousAlert.attemptedAt || previousAlert.sentAt
    });
  }

  const cooldownMinutes = normalizePositiveInteger(
    config.kisNaverAutoCompareAlertCooldownMinutes,
    defaultAlertCooldownMinutes,
    { min: 1 }
  );
  const previousAttemptAt = previousAlert?.attemptedAt || previousAlert?.checkedAt || '';

  if (
    sameNotificationFingerprint &&
    previousAttemptAt &&
    isWithinCooldown(previousAttemptAt, now, cooldownMinutes) &&
    !forceResolvedIssueResend
  ) {
    return persistKisNaverAutoCompareAlert(store, {
      ...baseAlert,
      deliveryStatus: 'skipped',
      reason: 'cooldown',
      attemptedAt: previousAttemptAt,
      cooldownMinutes
    });
  }

  const attemptedAt = now.toISOString();
  const message = formatKisNaverAutoCompareAlertMessage(result, alertableIssues);

  if (!isTelegramConfigured(config)) {
    return persistKisNaverAutoCompareAlert(store, {
      ...baseAlert,
      deliveryStatus: 'not_configured',
      reason: 'telegram_not_configured',
      attemptedAt,
      cooldownMinutes,
      messagePreview: message
    });
  }

  try {
    const sender = options.sendTelegramMessage || sendDefaultTelegramMessage;

    await sender(config, message);

    return persistKisNaverAutoCompareAlert(store, {
      ...baseAlert,
      deliveryStatus: 'sent',
      reason: forceResolvedIssueResend ? 'resolved_issue_reopened' : '',
      attemptedAt,
      sentAt: attemptedAt,
      cooldownMinutes,
      resolvedReopenCooldownMinutes,
      messagePreview: message
    });
  } catch (error) {
    return persistKisNaverAutoCompareAlert(store, {
      ...baseAlert,
      deliveryStatus: 'failed',
      attemptedAt,
      cooldownMinutes,
      deliveryError: error.message || '텔레그램 알림 전송 실패',
      messagePreview: message
    });
  }
}

function buildKisNaverAutoCompareIssueAlertPolicy(issues = [], reopenedIssueKeys = [], options = {}) {
  const reopenedSet = new Set(
    (Array.isArray(reopenedIssueKeys) ? reopenedIssueKeys : [])
      .map((key) => String(key || '').trim())
      .filter(Boolean)
  );
  const issueStates = options.issueStates || {};
  const now = toDate(options.now);
  const resolvedReopenCooldownMinutes = normalizePositiveInteger(
    options.resolvedReopenCooldownMinutes,
    1440,
    { min: 1 }
  );
  const normalizedIssues = (Array.isArray(issues) ? issues : []).map((issue) => ({
    ...issue,
    alertPolicy: {
      reopened: reopenedSet.has(String(issue?.key || '').trim())
    }
  }));
  const alertableIssues = [];
  const suppressedIssues = [];

  for (const issue of normalizedIssues) {
    const status = getIssueResolutionStatus(issue);
    const issueKey = String(issue?.key || '').trim();

    if (
      status === KIS_NAVER_COMPARE_ISSUE_STATUSES.ACKNOWLEDGED ||
      status === KIS_NAVER_COMPARE_ISSUE_STATUSES.ON_HOLD
    ) {
      suppressedIssues.push(issue);
      continue;
    }

    if (
      issue.alertPolicy.reopened &&
      !shouldResendReopenedResolvedIssues(
        [issueKey],
        issueStates,
        now,
        resolvedReopenCooldownMinutes
      )
    ) {
      suppressedIssues.push({
        ...issue,
        alertPolicy: {
          ...issue.alertPolicy,
          resolvedReopenCooldown: true
        }
      });
      continue;
    }

    alertableIssues.push(issue);
  }

  return {
    issues: normalizedIssues,
    alertableIssues,
    suppressedIssues,
    reopenedIssueKeys: [...reopenedSet]
  };
}

function getIssueKeysByState(issues = [], issueStates = {}, status) {
  const keys = [];

  for (const issue of Array.isArray(issues) ? issues : []) {
    const stableKey = normalizeKisNaverCompareIssueKey(issue?.key);
    const legacyKeys = buildLegacyKisNaverCompareIssueKeys(issue);
    const state = resolveKisNaverCompareIssueState(stableKey, issueStates, legacyKeys);

    if (stableKey && state?.status === status) {
      keys.push(stableKey);
    }
  }

  return keys;
}

function getIssueResolutionStatus(issue = {}) {
  const status = String(issue?.resolution?.status || '').trim();

  if (
    status === KIS_NAVER_COMPARE_ISSUE_STATUSES.ACKNOWLEDGED ||
    status === KIS_NAVER_COMPARE_ISSUE_STATUSES.ON_HOLD ||
    status === KIS_NAVER_COMPARE_ISSUE_STATUSES.RESOLVED
  ) {
    return status;
  }

  return KIS_NAVER_COMPARE_ISSUE_STATUSES.OPEN;
}

function getPreviousNotificationFingerprint(alert = {}) {
  return String(alert?.notificationFingerprint || alert?.fingerprint || '').trim();
}

async function compareCandidate(store, compare, candidate, context) {
  try {
    const comparison = await compare({
      symbol: candidate.symbol,
      market: context.market,
      driftThresholdPercent: context.driftThresholdPercent
    });

    if (typeof store.recordKisNaverCompareHistory === 'function') {
      await store.recordKisNaverCompareHistory(comparison, { returnLimit: 12 });
    }

    return {
      stockId: candidate.stockId,
      symbol: candidate.symbol,
      displayName: candidate.displayName,
      status: comparison.ok ? 'checked' : 'failed',
      ok: Boolean(comparison.ok),
      generatedAt: comparison.generatedAt || context.checkedAt,
      summary: comparison.summary || {},
      drift: comparison.drift || {},
      recommendation: comparison.recommendation || null,
      message: comparison.message || '',
      error: comparison.ok ? '' : comparison.message || 'KIS/Naver 가격 비교 실패'
    };
  } catch (error) {
    return {
      stockId: candidate.stockId,
      symbol: candidate.symbol,
      displayName: candidate.displayName,
      status: 'error',
      ok: false,
      generatedAt: context.checkedAt,
      summary: {},
      drift: {},
      recommendation: null,
      message: '',
      error: error.message
    };
  }
}

function buildCompareOptions(body, config) {
  return {
    symbol: body.symbol,
    market: body.market || defaultMarkets,
    driftThresholdPercent: body.driftThresholdPercent,
    timeoutMs: config.quoteTimeoutMs,
    dataGoKrServiceKey: config.dataGoKrServiceKey,
    alphaVantageApiKey: config.alphaVantageApiKey,
    kisApiBaseUrl: config.kisApiBaseUrl,
    kisAppKey: config.kisAppKey,
    kisAppSecret: config.kisAppSecret,
    kisAccessToken: config.kisAccessToken,
    kisMarketDivCode: config.kisMarketDivCode,
    kisCustType: config.kisCustType,
    kisTokenAutoRefresh: config.kisTokenAutoRefresh,
    kisTokenCachePath: config.kisTokenCachePath
  };
}

function createAutoCompareSummary(results) {
  const items = Array.isArray(results) ? results : [];

  return {
    checked: items.length,
    success: items.filter((item) => item.status === 'checked').length,
    failed: items.filter((item) => item.status === 'failed').length,
    error: items.filter((item) => item.status === 'error').length,
    skipped: items.filter((item) => item.status === 'skipped').length
  };
}

async function persistLastKisNaverAutoCompare(store, result) {
  const snapshot = toLastAutoCompareSnapshot(result);

  if (typeof store.setMetaValue === 'function') {
    await store.setMetaValue(lastKisNaverAutoCompareMetaKey, snapshot);
  }

  return {
    ...result,
    lastKisNaverAutoCompare: snapshot
  };
}

async function readLastKisNaverAutoCompareSnapshot(store) {
  if (typeof store.getMetaValue !== 'function') {
    return null;
  }

  return store.getMetaValue(lastKisNaverAutoCompareMetaKey, null);
}

export async function readEnrichedLastKisNaverAutoCompareSnapshot(store) {
  const snapshot = await readLastKisNaverAutoCompareSnapshot(store);

  if (!snapshot) {
    return null;
  }

  const issueStates = await readKisNaverCompareIssueStates(store);
  return applyKisNaverCompareIssueStates(snapshot, issueStates);
}

async function readLastKisNaverAutoCompareAlert(store) {
  if (typeof store.getMetaValue !== 'function') {
    return null;
  }

  return store.getMetaValue(lastKisNaverAutoCompareAlertMetaKey, null);
}

async function persistKisNaverAutoCompareAlert(store, alert) {
  const snapshot = toKisNaverAutoCompareAlertSnapshot(alert);

  if (typeof store.setMetaValue === 'function') {
    await store.setMetaValue(lastKisNaverAutoCompareAlertMetaKey, snapshot);
  }

  return snapshot;
}

function toLastAutoCompareSnapshot(result) {
  return {
    checkedAt: result.checkedAt,
    enabled: Boolean(result.enabled),
    forced: Boolean(result.forced),
    skipped: Boolean(result.skipped),
    reason: String(result.reason || ''),
    summary: result.summary || createAutoCompareSummary([]),
    candidates: Array.isArray(result.candidates) ? result.candidates : [],
    results: Array.isArray(result.results) ? result.results : [],
    kisNaverCompareTrend: result.kisNaverCompareTrend || null,
    kisNaverTrendRecommendation: result.kisNaverTrendRecommendation || null,
    trendRecommendation: result.kisNaverTrendRecommendation || null,
    alert: result.alert || null
  };
}

function toKisNaverAutoCompareAlertSnapshot(alert = {}) {
  return {
    checkedAt: alert.checkedAt || new Date().toISOString(),
    deliveryStatus: String(alert.deliveryStatus || '').trim(),
    reason: String(alert.reason || '').trim(),
    deliveryError: String(alert.deliveryError || '').trim(),
    attemptedAt: alert.attemptedAt || null,
    sentAt: alert.sentAt || null,
    cooldownMinutes: alert.cooldownMinutes || null,
    fingerprint: String(alert.fingerprint || '').trim(),
    notificationFingerprint: String(alert.notificationFingerprint || '').trim(),
    issueCount: Number(alert.issueCount || 0),
    alertableIssueCount: Number(alert.alertableIssueCount || 0),
    suppressedIssueCount: Number(alert.suppressedIssueCount || 0),
    reopenedIssueCount: Number(alert.reopenedIssueCount || 0),
    issues: Array.isArray(alert.issues) ? alert.issues.slice(0, 20) : [],
    messagePreview: String(alert.messagePreview || '').slice(0, 2000)
  };
}

function getSnapshotRecommendation(snapshot = {}) {
  const recommendation =
    snapshot.kisNaverTrendRecommendation ||
    snapshot.trendRecommendation ||
    snapshot.kisNaverCompareTrend?.recommendation ||
    null;

  if (!recommendation?.market) {
    return null;
  }

  return {
    ...recommendation,
    market: String(recommendation.market || '').trim().toUpperCase(),
    marketLabel: recommendation.marketLabel || recommendation.market || '',
    currentMarket: String(recommendation.currentMarket || '').trim().toUpperCase(),
    currentMarketLabel: recommendation.currentMarketLabel || ''
  };
}

function isWithinCooldown(previousAttemptAt, now, cooldownMinutes) {
  const previousTime = new Date(previousAttemptAt).getTime();
  const nowTime = now.getTime();

  if (!Number.isFinite(previousTime) || !Number.isFinite(nowTime)) {
    return false;
  }

  return nowTime - previousTime < cooldownMinutes * 60 * 1000;
}

function normalizeIssueText(value) {
  return String(value || '')
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, 120);
}

function getDriftStatusLabel(status) {
  const labels = {
    normal: '정상',
    warning: '주의',
    critical: '경고',
    not_comparable: '비교 불가'
  };

  return labels[status] || '이상치';
}

function formatPercentValue(value) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return '-';
  }

  return `${number.toFixed(2)}%`;
}

function formatDateTime(value) {
  if (!value) {
    return '-';
  }

  const date = new Date(value);

  if (!Number.isFinite(date.getTime())) {
    return String(value);
  }

  return date.toLocaleString('ko-KR', {
    timeZone: 'Asia/Seoul'
  });
}

function normalizePositiveInteger(value, fallback, options = {}) {
  const parsed = Number(value);
  const min = options.min ?? 1;
  const max = options.max ?? Number.POSITIVE_INFINITY;

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, Math.floor(parsed)));
}

function toDate(value) {
  const date = value instanceof Date ? value : new Date(value || Date.now());
  return Number.isFinite(date.getTime()) ? date : new Date();
}
