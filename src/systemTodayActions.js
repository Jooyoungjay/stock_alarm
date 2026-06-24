import { classifyQuoteFreshness, summarizeQuoteFreshness } from './quoteFreshness.js';
import { assessTelegramPollHealth } from './telegramPollHealth.js';
import { formatTodayActionPriority } from './todayActionPriority.js';

const TODAY_ACTION_LIMIT = 5;
const TODAY_ACTION_MAX_PER_STOCK = 2;
const SOLD_POSITION = 'sold';

export function getLatestObservationManualSummary(recent = []) {
  if (!Array.isArray(recent) || !recent.length) {
    return null;
  }

  const latest = recent[0];
  const manual = Number(latest.summary?.manual || 0);

  if (!manual) {
    return null;
  }

  return {
    manual,
    generatedAt: latest.generatedAt,
    fileName: latest.fileName
  };
}

export function getLatestObservationFailedSummary(recent = []) {
  if (!Array.isArray(recent) || !recent.length) {
    return null;
  }

  const latest = recent[0];
  const failed = Number(latest.summary?.failed || 0);

  if (!failed) {
    return null;
  }

  return {
    failed,
    generatedAt: latest.generatedAt,
    fileName: latest.fileName
  };
}

export function buildSystemTodayActions(context = {}) {
  const stocks = Array.isArray(context.stocks) ? context.stocks : [];
  const actions = [];
  const pollHealth =
    context.telegramPollHealth ??
    assessTelegramPollHealth({
      telegramConfigured: context.telegramConfigured,
      telegramCommandPollSeconds: context.telegramCommandPollSeconds,
      lastTelegramCommandPoll: context.lastTelegramCommandPoll ?? null,
      now: context.now
    });

  if (pollHealth && ['stale', 'error', 'unknown'].includes(pollHealth.status)) {
    actions.push(
      createTodayAction({
        type: 'telegram-poll-health',
        priority: pollHealth.level === 'bad' ? 'critical' : 'warning',
        rank: 5,
        title: `텔레그램 폴링 ${pollHealth.label}`,
        detail: [pollHealth.detail, pollHealth.nextAction].filter(Boolean).join(' '),
        meta: '원격 명령',
        commandHint: '/status 로 시세 신선도도 함께 확인'
      })
    );
  }

  const summary = summarizeQuoteFreshness(stocks, context);

  if (summary.needsAttention > 0) {
    actions.push(
      createTodayAction({
        type: 'quote-freshness-summary',
        priority: summary.error > 0 || summary.missing > 0 ? 'critical' : 'warning',
        rank: 6,
        title: '장중 시세 확인 필요',
        detail: `오래됨 ${summary.stale} · 실패 ${summary.error} · 미확인 ${summary.missing} · 기준 ${summary.maxAgeMinutes}분`,
        meta: '시세 신선도',
        commandHint: '/status 로 종목별 상세 확인'
      })
    );
  }

  const failedSummary = getLatestObservationFailedSummary(context.observationHistoryRecent);

  if (failedSummary) {
    actions.push(
      createTodayAction({
        type: 'observation-failed',
        priority: 'critical',
        rank: 7,
        title: '점검 실패 항목 확인',
        detail: `실패 ${failedSummary.failed}개 · ${formatGeneratedAt(failedSummary.generatedAt)}`,
        meta: '점검 히스토리',
        commandHint: '웹 관리자 점검 히스토리에서 확인'
      })
    );
  }

  const manualSummary = getLatestObservationManualSummary(context.observationHistoryRecent);

  if (manualSummary) {
    actions.push(
      createTodayAction({
        type: 'observation-manual',
        priority: 'warning',
        rank: 8,
        title: '점검 수동 확인 필요',
        detail: `수동 ${manualSummary.manual}개 · ${formatGeneratedAt(manualSummary.generatedAt)}`,
        meta: '점검 히스토리',
        commandHint: '웹 관리자 점검 히스토리에서 확인'
      })
    );
  }

  return actions;
}

export function buildStockTodayActions(stocks = [], options = {}) {
  return stocks.flatMap((stock) => buildStockTodayActionEntries(stock, options));
}

export function buildTelegramTodayActions(context = {}) {
  const stocks = Array.isArray(context.stocks) ? context.stocks : [];
  const systemActions = buildSystemTodayActions(context);
  const stockActions = buildStockTodayActions(stocks, context);
  return limitTodayActions([...systemActions, ...stockActions]);
}

export function formatTelegramTodayMessage(actions = []) {
  if (!actions.length) {
    return ['오늘 확인할 일', '', '긴급 확인 항목이 없습니다. 시세, 배당, 알림 상태에 당장 확인할 신호가 없습니다.'].join(
      '\n'
    );
  }

  const lines = ['오늘 확인할 일', `${actions.length}개 우선 확인`, ''];

  actions.forEach((action, index) => {
    lines.push(`${index + 1}. [${action.priorityLabel}] ${action.title}`);

    if (action.name && action.name !== action.title) {
      lines.push(`   ${action.name}`);
    }

    if (action.detail) {
      lines.push(`   ${action.detail}`);
    }

    if (action.commandHint) {
      lines.push(`   → ${action.commandHint}`);
    }
  });

  return lines.join('\n');
}

function buildStockTodayActionEntries(stock, options = {}) {
  if (normalizePositionStatus(stock?.positionStatus) === SOLD_POSITION || stock?.active === false) {
    return [];
  }

  const actions = [];
  const name = formatStockName(stock);

  if (stock.alertState === 'triggered') {
    actions.push(
      createTodayAction({
        type: 'threshold-alert',
        stock,
        name,
        priority: 'critical',
        rank: 0,
        title: '알림 기준 도달',
        detail: '현재가가 설정한 알림 기준에 닿았습니다.',
        meta: '가격 알림',
        commandHint: `/status ${stock.symbol}`
      })
    );
  }

  if (stock.lastCheckStatus === 'error' || String(stock.lastError || '').trim()) {
    actions.push(
      createTodayAction({
        type: 'quote-error',
        stock,
        name,
        priority: 'critical',
        rank: 10,
        title: '시세 조회 실패',
        detail: String(stock.lastError || '').trim() || '최근 시세 조회에 실패했습니다.',
        meta: stock.quoteProvider || '시세',
        commandHint: `/status ${stock.symbol}`
      })
    );
  } else {
    const freshness = classifyQuoteFreshness(stock, options);

    if (freshness.status === 'stale') {
      actions.push(
        createTodayAction({
          type: 'quote-stale',
          stock,
          name,
          priority: 'warning',
          rank: 12,
          title: '장중 시세 오래됨',
          detail: freshness.detail,
          meta: '시세 신선도',
          commandHint: `/status ${stock.symbol}`
        })
      );
    } else if (freshness.status === 'missing') {
      actions.push(
        createTodayAction({
          type: 'quote-missing',
          stock,
          name,
          priority: 'warning',
          rank: 11,
          title: '시세 미확인',
          detail: freshness.detail,
          meta: '시세 신선도',
          commandHint: `/status ${stock.symbol}`
        })
      );
    }
  }

  if (String(stock.dividendLastError || '').trim()) {
    actions.push(
      createTodayAction({
        type: 'dividend-error',
        stock,
        name,
        priority: 'warning',
        rank: 20,
        title: '배당 조회 실패',
        detail: String(stock.dividendLastError || '').trim(),
        meta: stock.dividendProvider || '배당',
        commandHint: `/dividend-status ${stock.symbol}`
      })
    );
  }

  return actions;
}

function createTodayAction({
  type,
  stock,
  name,
  priority,
  rank,
  title,
  detail,
  meta,
  commandHint = ''
}) {
  return {
    type,
    stock,
    name: name || (stock ? formatStockName(stock) : title),
    priority,
    priorityLabel: formatTodayActionPriority(priority),
    rank,
    title,
    detail,
    meta,
    commandHint
  };
}

function limitTodayActions(actions) {
  const selected = [];
  const stockCounts = new Map();
  const sorted = actions.filter(Boolean).sort(compareTodayActions);

  for (const action of sorted) {
    if (selected.length >= TODAY_ACTION_LIMIT) {
      break;
    }

    const stockKey = action.stock?.id || action.stock?.symbol || action.name || action.type;
    const count = stockCounts.get(stockKey) || 0;

    if (count >= TODAY_ACTION_MAX_PER_STOCK) {
      continue;
    }

    selected.push(action);
    stockCounts.set(stockKey, count + 1);
  }

  return selected;
}

function compareTodayActions(left, right) {
  if (left.rank !== right.rank) {
    return left.rank - right.rank;
  }

  return String(left.name || '').localeCompare(String(right.name || ''), 'ko-KR', {
    numeric: true
  });
}

function normalizePositionStatus(value) {
  return String(value || 'holding').trim().toLowerCase();
}

function formatStockName(stock = {}) {
  return String(stock.displayName || stock.symbol || '종목').trim();
}

function formatGeneratedAt(value) {
  if (!value) {
    return '시각 미상';
  }

  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleString('ko-KR') : String(value);
}
