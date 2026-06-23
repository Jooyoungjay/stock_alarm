import { buildAlertRule, buildProfitRetracementContext } from './alertEngine.js';
import { calculateDividendGrowth } from './dividendGrowth.js';
import { isTelegramConfigured, sendTelegramMessage } from './telegram.js';

export const dailyBriefingMetaKey = 'lastDailyBriefingDate';

const defaultWarningDistancePercent = 5;
const defaultTopLimit = 5;
const defaultRetracementHighlightLimit = 3;
const defaultBriefingTime = '16:10';

const riskRanks = {
  alert: 0,
  warning: 1,
  error: 2,
  ok: 3,
  unknown: 4,
  inactive: 5
};

const riskLabels = {
  alert: '알림',
  warning: '주의',
  error: '조회 실패',
  ok: '정상',
  unknown: '확인 전',
  inactive: '알림 꺼짐'
};

export function buildRiskRanking(stocks, options = {}) {
  const warningDistancePercent = normalizePositiveNumber(
    options.warningDistancePercent,
    defaultWarningDistancePercent
  );

  return (Array.isArray(stocks) ? stocks : [])
    .map((stock) => buildRiskItem(stock, { warningDistancePercent }))
    .sort(compareRiskItems)
    .map((item, index) => ({
      ...item,
      rank: index + 1
    }));
}

export function buildDailyBriefing(stocks, options = {}) {
  const now = options.now || new Date();
  const ranking = buildRiskRanking(stocks, options);
  const activeRanking = ranking.filter((item) => item.level !== 'inactive');
  const topLimit = normalizePositiveInteger(options.topLimit, defaultTopLimit);
  const counts = ranking.reduce(
    (summary, item) => {
      summary[item.level] = (summary[item.level] || 0) + 1;
      if (item.level !== 'inactive') {
        summary.active += 1;
      }
      summary.total += 1;
      return summary;
    },
    {
      total: 0,
      active: 0,
      alert: 0,
      warning: 0,
      error: 0,
      ok: 0,
      unknown: 0,
      inactive: 0
    }
  );

  return {
    generatedAt: now.toISOString(),
    dateKey: getLocalDateKey(now),
    counts,
    ranking,
    topRisks: activeRanking.slice(0, topLimit),
    profitRetracementHighlights: buildProfitRetracementHighlights(stocks, {
      topLimit: options.retracementHighlightLimit
    }),
    portfolio: buildPortfolioSummary(stocks)
  };
}

export function formatDailyBriefingMessage(briefing, options = {}) {
  const generatedAt = briefing?.generatedAt ? new Date(briefing.generatedAt) : options.now || new Date();
  const counts = briefing?.counts || {};
  const topRisks = Array.isArray(briefing?.topRisks) ? briefing.topRisks : [];
  const profitRetracementHighlights = Array.isArray(briefing?.profitRetracementHighlights)
    ? briefing.profitRetracementHighlights
    : [];
  const portfolio = Array.isArray(briefing?.portfolio) ? briefing.portfolio : [];
  const lines = [
    '[Stock Alarm] 일일 브리핑',
    `${formatDateTime(generatedAt)} · 감시 ${counts.active || 0} · 알림 ${counts.alert || 0} · 주의 ${counts.warning || 0}${counts.error ? ` · 오류 ${counts.error}` : ''}`,
    ''
  ];

  lines.push('위험 종목');
  if (topRisks.length) {
    lines.push(...topRisks.map(formatRiskLine));
  } else {
    lines.push('감시중인 종목이 없습니다.');
  }

  if (profitRetracementHighlights.length) {
    lines.push('');
    lines.push('이익금 반납');
    lines.push(...profitRetracementHighlights.map(formatProfitRetracementLine));
  }

  if (portfolio.length) {
    lines.push('');
    lines.push('배당·평가');
    for (const group of portfolio) {
      lines.push(formatPortfolioBlock(group));
    }
  }

  const footnotes = [];
  if (counts.unknown) {
    footnotes.push(`확인 전 ${counts.unknown}개`);
  }
  if (counts.inactive) {
    footnotes.push(`알림 꺼짐 ${counts.inactive}개`);
  }

  if (footnotes.length) {
    lines.push('');
    lines.push(footnotes.join(' · '));
  }

  return lines.filter((line) => line !== null && line !== undefined).join('\n');
}

export async function runDailyBriefing(store, config, options = {}) {
  const now = options.now || new Date();
  const force = Boolean(options.force);
  const enabled = config.dailyBriefingEnabled !== false;
  const time = normalizeBriefingTime(config.dailyBriefingTime);

  if (!enabled && !force) {
    return {
      checkedAt: now.toISOString(),
      skipped: true,
      reason: 'daily_briefing_disabled'
    };
  }

  if (!force && !isDailyBriefingDue(now, time)) {
    return {
      checkedAt: now.toISOString(),
      skipped: true,
      reason: 'daily_briefing_not_due',
      scheduledTime: time
    };
  }

  const dateKey = getLocalDateKey(now);
  const lastDate = typeof store.getMetaValue === 'function'
    ? await store.getMetaValue(dailyBriefingMetaKey, '')
    : '';

  if (!force && lastDate === dateKey) {
    return {
      checkedAt: now.toISOString(),
      skipped: true,
      reason: 'daily_briefing_already_sent',
      dateKey,
      scheduledTime: time
    };
  }

  const stocks = await store.listStocks();
  const briefing = buildDailyBriefing(stocks, {
    now,
    warningDistancePercent: config.dailyBriefingWarningDistancePercent,
    topLimit: config.dailyBriefingTopLimit
  });
  const message = formatDailyBriefingMessage(briefing, { now });
  const sender = options.sendTelegramMessage || sendTelegramMessage;
  let deliveryStatus = 'not_configured';
  let deliveryError = '';

  if (isTelegramConfigured(config)) {
    try {
      await sender(config, message);
      deliveryStatus = 'sent';
    } catch (error) {
      deliveryStatus = 'failed';
      deliveryError = error.message;
    }
  }

  const result = {
    checkedAt: now.toISOString(),
    dateKey,
    scheduledTime: time,
    forced: force,
    deliveryStatus,
    deliveryError,
    briefing
  };

  if (deliveryStatus === 'sent' && typeof store.setMetaValue === 'function') {
    await store.setMetaValue(dailyBriefingMetaKey, dateKey);
  }

  return result;
}

export function isDailyBriefingDue(now = new Date(), time = defaultBriefingTime) {
  const parsed = parseBriefingTime(time);
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  return currentMinutes >= parsed.minutesOfDay;
}

export function normalizeBriefingTime(value) {
  try {
    const parsed = parseBriefingTime(value);
    return `${pad2(parsed.hour)}:${pad2(parsed.minute)}`;
  } catch {
    return defaultBriefingTime;
  }
}

function buildRiskItem(stock, options) {
  const base = {
    stockId: stock?.id || '',
    symbol: stock?.symbol || '',
    displayName: stock?.displayName || stock?.symbol || '',
    active: stock?.active !== false,
    level: 'unknown',
    label: riskLabels.unknown,
    detail: '아직 시세 확인 전입니다.',
    currentPrice: normalizeFiniteNumber(stock?.lastPrice),
    thresholdPrice: null,
    referencePrice: null,
    metricPercent: null,
    distanceToThreshold: null,
    distanceToThresholdPercent: null,
    currency: stock?.currency || '',
    lastCheckedAt: stock?.lastCheckedAt || null,
    lastError: stock?.lastError || ''
  };

  if (!base.active) {
    return {
      ...base,
      level: 'inactive',
      label: riskLabels.inactive,
      detail: '자동 가격 확인과 텔레그램 알림을 쉬고 있습니다.'
    };
  }

  if (stock?.lastCheckStatus === 'error') {
    return {
      ...base,
      level: 'error',
      label: riskLabels.error,
      detail: stock.lastError || '최근 시세 조회에 실패했습니다.'
    };
  }

  if (base.currentPrice === null || base.currentPrice <= 0) {
    return base;
  }

  try {
    const rule = buildAlertRule(stock, base.currentPrice);
    const thresholdPrice = normalizeFiniteNumber(rule.thresholdPrice);
    const distanceToThreshold =
      thresholdPrice !== null ? base.currentPrice - thresholdPrice : null;
    const distanceToThresholdPercent =
      distanceToThreshold !== null && thresholdPrice > 0
        ? (distanceToThreshold / thresholdPrice) * 100
        : null;
    const isAlert = stock?.alertState === 'triggered' || rule.isBelowThreshold;
    const isWarning =
      distanceToThresholdPercent !== null &&
      distanceToThresholdPercent <= options.warningDistancePercent;
    const level = isAlert ? 'alert' : isWarning ? 'warning' : 'ok';
    const profitContext = buildProfitRetracementContext(stock, base.currentPrice);
    const quantity = normalizeFiniteNumber(stock?.quantity);
    const annualDividendPerShare = normalizeFiniteNumber(stock?.annualDividendPerShare);
    const purchasePrice = normalizeFiniteNumber(stock?.purchasePrice);
    const expectedAnnualDividend =
      quantity !== null &&
      quantity > 0 &&
      annualDividendPerShare !== null &&
      annualDividendPerShare > 0
        ? quantity * annualDividendPerShare
        : null;
    const dividendYieldPercent =
      expectedAnnualDividend !== null &&
      purchasePrice !== null &&
      purchasePrice > 0 &&
      quantity !== null &&
      quantity > 0
        ? (expectedAnnualDividend / (purchasePrice * quantity)) * 100
        : null;

    return {
      ...base,
      level,
      label: riskLabels[level],
      detail: formatDistanceDetail(distanceToThreshold, distanceToThresholdPercent, base.currency),
      thresholdPrice,
      referencePrice: normalizeFiniteNumber(rule.referencePrice),
      metricPercent: normalizeFiniteNumber(rule.metricPercent),
      distanceToThreshold,
      distanceToThresholdPercent,
      alertType: rule.alertType,
      alertTypeLabel: rule.alertTypeLabel,
      thresholdLabel: rule.thresholdLabel,
      metricLabel: rule.metricLabel,
      retracedProfitAmount: profitContext.retracedProfitAmount,
      retracedProfitPercent: profitContext.retracedProfitPercent,
      maximumProfitAmount: profitContext.maximumProfitAmount,
      expectedAnnualDividend,
      dividendYieldPercent
    };
  } catch (error) {
    return {
      ...base,
      level: 'unknown',
      label: riskLabels.unknown,
      detail: error.message || '알림 기준을 계산하지 못했습니다.'
    };
  }
}

function compareRiskItems(left, right) {
  return (
    getRiskRank(left.level) - getRiskRank(right.level) ||
    getDistanceSortValue(left) - getDistanceSortValue(right) ||
    String(left.displayName || left.symbol).localeCompare(String(right.displayName || right.symbol), 'ko-KR')
  );
}

function getRiskRank(level) {
  return riskRanks[level] ?? 99;
}

function getDistanceSortValue(item) {
  const value = Number(item.distanceToThresholdPercent);
  return Number.isFinite(value) ? value : Number.POSITIVE_INFINITY;
}

function buildPortfolioSummary(stocks) {
  const groups = new Map();

  for (const stock of Array.isArray(stocks) ? stocks : []) {
    const quantity = normalizeFiniteNumber(stock.quantity);
    const purchasePrice = normalizeFiniteNumber(stock.purchasePrice);
    const currentPrice = normalizeFiniteNumber(stock.lastPrice);
    const annualDividendPerShare = normalizeFiniteNumber(stock.annualDividendPerShare);
    const dividendGrowth = calculateDividendGrowth(stock);

    if (quantity === null || quantity <= 0) {
      continue;
    }

    const currency = stock.currency || '';
    const key = currency || 'default';
    const group = groups.get(key) || {
      currency,
      stockCount: 0,
      investmentAmount: 0,
      marketValue: 0,
      valuedInvestmentAmount: 0,
      profit: 0,
      totalReturnAmount: 0,
      totalReturnInvestmentAmount: 0,
      totalReturnTrackedCount: 0,
      expectedAnnualDividend: 0,
      dividendInvestmentAmount: 0,
      previousAnnualDividend: 0,
      dividendGrowthAmount: 0,
      dividendGrowthBaseAmount: 0,
      dividendGrowthTrackedCount: 0
    };

    group.stockCount += 1;

    if (purchasePrice !== null && purchasePrice > 0) {
      const investmentAmount = quantity * purchasePrice;
      const expectedAnnualDividend =
        annualDividendPerShare !== null && annualDividendPerShare > 0
          ? quantity * annualDividendPerShare
          : null;
      group.investmentAmount += investmentAmount;

      if (currentPrice !== null && currentPrice > 0) {
        const marketValue = quantity * currentPrice;
        const profit = marketValue - investmentAmount;
        group.marketValue += marketValue;
        group.valuedInvestmentAmount += investmentAmount;
        group.profit += profit;
        group.totalReturnAmount += profit + (expectedAnnualDividend ?? 0);
        group.totalReturnInvestmentAmount += investmentAmount;
        group.totalReturnTrackedCount += 1;
      }

      if (expectedAnnualDividend !== null) {
        group.expectedAnnualDividend += expectedAnnualDividend;
        group.dividendInvestmentAmount += investmentAmount;
      }

      if (dividendGrowth.available) {
        const previousAnnualDividend = quantity * dividendGrowth.previousAnnualDividendPerShare;
        const currentAnnualDividend = quantity * dividendGrowth.annualDividendPerShare;
        group.previousAnnualDividend += previousAnnualDividend;
        group.dividendGrowthAmount += currentAnnualDividend - previousAnnualDividend;
        group.dividendGrowthBaseAmount += previousAnnualDividend;
        group.dividendGrowthTrackedCount += 1;
      }
    }

    groups.set(key, group);
  }

  return [...groups.values()].map((group) => ({
    ...group,
    marketValue: group.valuedInvestmentAmount > 0 ? group.marketValue : null,
    profit: group.valuedInvestmentAmount > 0 ? group.profit : null,
    profitPercent:
      group.valuedInvestmentAmount > 0 ? (group.profit / group.valuedInvestmentAmount) * 100 : null,
    totalReturnAmount:
      group.totalReturnTrackedCount > 0 ? group.totalReturnAmount : null,
    totalReturnPercent:
      group.totalReturnInvestmentAmount > 0
        ? (group.totalReturnAmount / group.totalReturnInvestmentAmount) * 100
        : null,
    expectedAnnualDividend:
      group.dividendInvestmentAmount > 0 ? group.expectedAnnualDividend : null,
    dividendYieldPercent:
      group.dividendInvestmentAmount > 0
        ? (group.expectedAnnualDividend / group.dividendInvestmentAmount) * 100
        : null,
    previousAnnualDividend:
      group.dividendGrowthTrackedCount > 0 ? group.previousAnnualDividend : null,
    dividendGrowthAmount:
      group.dividendGrowthTrackedCount > 0 ? group.dividendGrowthAmount : null,
    dividendGrowthPercent:
      group.dividendGrowthBaseAmount > 0
        ? (group.dividendGrowthAmount / group.dividendGrowthBaseAmount) * 100
        : null,
    dividendGrowthTrackedCount: group.dividendGrowthTrackedCount
  }));
}

function buildProfitRetracementHighlights(stocks, options = {}) {
  const topLimit = normalizePositiveInteger(options.topLimit, defaultRetracementHighlightLimit);

  return (Array.isArray(stocks) ? stocks : [])
    .filter((stock) => stock?.active !== false)
    .map((stock) => {
      const currentPrice = normalizeFiniteNumber(stock?.lastPrice);
      const profitContext = buildProfitRetracementContext(stock, currentPrice);

      return {
        stockId: stock?.id || '',
        symbol: stock?.symbol || '',
        displayName: stock?.displayName || stock?.symbol || '',
        currency: stock?.currency || '',
        ...profitContext
      };
    })
    .filter(
      (item) =>
        item.retracedProfitPercent !== null &&
        item.retracedProfitPercent > 0 &&
        item.retracedProfitAmount !== null &&
        item.retracedProfitAmount > 0
    )
    .sort(
      (left, right) =>
        right.retracedProfitPercent - left.retracedProfitPercent ||
        right.retracedProfitAmount - left.retracedProfitAmount ||
        String(left.displayName || left.symbol).localeCompare(
          String(right.displayName || right.symbol),
          'ko-KR'
        )
    )
    .slice(0, topLimit)
    .map((item, index) => ({
      ...item,
      rank: index + 1
    }));
}

function formatRiskLine(item, index) {
  const rank = index + 1;
  const name = item.displayName || item.symbol;
  const metrics = [];

  if (item.level === 'error') {
    return `${rank}. [${item.label}] ${name}\n   ${item.lastError || item.detail || '최근 시세 조회 실패'}`;
  }

  if (item.level === 'inactive') {
    return `${rank}. [${item.label}] ${name}`;
  }

  const price = formatMoney(item.currentPrice, item.currency);
  if (price !== '-') {
    metrics.push(price);
  }

  if (Number.isFinite(item.distanceToThresholdPercent)) {
    const label = item.distanceToThreshold <= 0 ? '기준 초과' : '기준 여유';
    metrics.push(`${label} ${Math.abs(item.distanceToThresholdPercent).toFixed(1)}%`);
  }

  if (item.metricPercent !== null && item.metricPercent !== undefined) {
    metrics.push(`${item.metricLabel || item.alertTypeLabel || '하락률'} -${Math.max(0, item.metricPercent).toFixed(1)}%`);
  }

  if (item.retracedProfitPercent !== null && item.retracedProfitPercent > 0) {
    metrics.push(`반납 ${item.retracedProfitPercent.toFixed(1)}%`);
  }

  if (item.expectedAnnualDividend !== null && item.dividendYieldPercent !== null) {
    metrics.push(`배당 ${formatPercent(item.dividendYieldPercent)}`);
  }

  if (!metrics.length && item.detail) {
    metrics.push(item.detail);
  }

  return metrics.length
    ? `${rank}. [${item.label}] ${name}\n   ${metrics.join(' · ')}`
    : `${rank}. [${item.label}] ${name}`;
}

function formatProfitRetracementLine(item, index) {
  const rank = index + 1;
  const name = item.displayName || item.symbol;
  const retraced = formatSignedMoney(item.retracedProfitAmount, item.currency);
  const retracedPercent = formatSignedPercent(item.retracedProfitPercent);
  const maximum = formatMoney(item.maximumProfitAmount, item.currency);

  return `${rank}. ${name} · 반납 ${retraced} (${retracedPercent}) / 최대 ${maximum}`;
}

function formatPortfolioBlock(group) {
  const currency = group.currency || '통화 미지정';
  const lines = [`${currency} · ${group.stockCount}종목`];

  if (group.profit !== null) {
    lines.push(
      `  평가 ${formatSignedMoney(group.profit, group.currency)} (${formatSignedPercent(group.profitPercent)})`
    );
  }

  if (group.expectedAnnualDividend !== null) {
    let dividendLine = `  배당 ${formatMoney(group.expectedAnnualDividend, group.currency)} (${formatPercent(group.dividendYieldPercent)})`;

    if (group.dividendGrowthPercent !== null) {
      dividendLine += ` · 성장 ${formatSignedPercent(group.dividendGrowthPercent)}`;
    }

    lines.push(dividendLine);
  }

  if (group.totalReturnAmount !== null) {
    lines.push(
      `  합산 ${formatSignedMoney(group.totalReturnAmount, group.currency)} (${formatSignedPercent(group.totalReturnPercent)})`
    );
  }

  return lines.join('\n');
}

function formatDistanceDetail(distance, distancePercent, currency) {
  if (!Number.isFinite(distance) || !Number.isFinite(distancePercent)) {
    return '알림 기준까지의 거리를 계산하지 못했습니다.';
  }

  if (distance <= 0) {
    return `기준가보다 ${formatMoney(Math.abs(distance), currency)} 낮음`;
  }

  return `기준가까지 ${formatMoney(distance, currency)} · ${distancePercent.toFixed(2)}%`;
}

function parseBriefingTime(value) {
  const match = String(value || defaultBriefingTime).trim().match(/^(\d{1,2}):(\d{2})$/);

  if (!match) {
    throw new Error('브리핑 시간은 HH:mm 형식이어야 합니다.');
  }

  const hour = Number(match[1]);
  const minute = Number(match[2]);

  if (!Number.isInteger(hour) || hour < 0 || hour > 23 || !Number.isInteger(minute) || minute > 59) {
    throw new Error('브리핑 시간은 HH:mm 형식이어야 합니다.');
  }

  return {
    hour,
    minute,
    minutesOfDay: hour * 60 + minute
  };
}

function getLocalDateKey(value) {
  const date = value instanceof Date ? value : new Date(value);
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function formatDateTime(value) {
  const date = value instanceof Date ? value : new Date(value);

  if (!Number.isFinite(date.getTime())) {
    return '-';
  }

  return date.toLocaleString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function formatMoney(value, currency) {
  const number = normalizeFiniteNumber(value);

  if (number === null) {
    return '-';
  }

  const formatted = number.toLocaleString('ko-KR', {
    maximumFractionDigits: Math.abs(number) >= 1000 ? 0 : 2
  });

  return currency ? `${formatted} ${currency}` : formatted;
}

function formatSignedMoney(value, currency) {
  const number = normalizeFiniteNumber(value);

  if (number === null) {
    return '-';
  }

  return `${number > 0 ? '+' : ''}${formatMoney(number, currency)}`;
}

function formatSignedPercent(value) {
  const number = normalizeFiniteNumber(value);

  if (number === null) {
    return '-';
  }

  return `${number > 0 ? '+' : ''}${number.toFixed(2)}%`;
}

function formatPercent(value) {
  const number = normalizeFiniteNumber(value);

  if (number === null) {
    return '-';
  }

  return `${number.toFixed(2)}%`;
}

function normalizeFiniteNumber(value) {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalizePositiveNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function normalizePositiveInteger(value, fallback) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : fallback;
}

function pad2(value) {
  return String(value).padStart(2, '0');
}
