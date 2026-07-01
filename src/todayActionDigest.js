import path from 'node:path';

import { readEnrichedLastKisNaverAutoCompareSnapshot } from './kisNaverAutoCompare.js';
import { readLocalObservationHistoryReport } from './localObservationCheck.js';
import {
  buildTelegramTodayActions,
  formatTelegramTodayMessage
} from './systemTodayActions.js';
import { isTelegramConfigured, sendTelegramMessage } from './telegram.js';
import { assessTelegramPollHealth } from './telegramPollHealth.js';
import { filterCriticalTodayActions } from './todayActionPriority.js';

export const lastTodayActionDigestAlertMetaKey = 'lastTodayActionDigestAlert';

const defaultCooldownMinutes = 60;
const koreanMarketOpenMinutes = 9 * 60;
const koreanMarketCloseMinutes = 15 * 60 + 30;

export function isKoreanMarketSession(now = new Date()) {
  const date = now instanceof Date ? now : new Date(now);

  if (!Number.isFinite(date.getTime())) {
    return false;
  }

  const weekday = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Seoul',
    weekday: 'short'
  }).format(date);

  if (weekday === 'Sat' || weekday === 'Sun') {
    return false;
  }

  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Seoul',
    hour: 'numeric',
    minute: 'numeric',
    hour12: false
  }).formatToParts(date);

  const hour = Number(parts.find((part) => part.type === 'hour')?.value || 0);
  const minute = Number(parts.find((part) => part.type === 'minute')?.value || 0);
  const minutesOfDay = hour * 60 + minute;

  return minutesOfDay >= koreanMarketOpenMinutes && minutesOfDay < koreanMarketCloseMinutes;
}

export function buildTodayActionDigestFingerprint(actions = []) {
  return filterCriticalTodayActions(actions)
    .map((action) => {
      const symbol = String(action.stock?.symbol || action.stock?.id || '').trim();
      return symbol ? `${action.type}:${symbol}` : action.type;
    })
    .sort()
    .join('|');
}

export function formatTodayActionDigestMessage(actions = []) {
  const criticalActions = filterCriticalTodayActions(actions);

  if (!criticalActions.length) {
    return '';
  }

  const body = formatTelegramTodayMessage(criticalActions);
  const lines = body.split('\n');
  lines[0] = '[Stock Alarm] 장중 확인 필요';
  lines.push('');
  lines.push('/today 로 전체 보기');

  return lines.join('\n');
}

export async function buildTodayActionsContext(store, config, options = {}) {
  const stocks = Array.isArray(options.stocks) ? options.stocks : await store.listStocks();
  const rootDir = config.rootDir || options.rootDir || process.cwd();
  const dataDir = store?.dataDir || config.dataDir || path.join(rootDir, 'data');
  const observationHistory = Array.isArray(options.observationHistoryRecent)
    ? { recent: options.observationHistoryRecent }
    : await readLocalObservationHistoryReport({
        rootDir,
        dataDir,
        env: options.env
      });
  const kisNaverAutoCompare = await readEnrichedLastKisNaverAutoCompareSnapshot(store);
  const now = options.now;

  return {
    stocks,
    observationHistoryRecent: observationHistory.recent,
    kisNaverAutoCompare,
    telegramConfigured: isTelegramConfigured(config),
    telegramCommandPollSeconds: config.telegramCommandPollSeconds,
    lastTelegramCommandPoll: options.lastTelegramCommandPoll ?? null,
    telegramPollHealth: assessTelegramPollHealth({
      telegramConfigured: isTelegramConfigured(config),
      telegramCommandPollSeconds: config.telegramCommandPollSeconds,
      lastTelegramCommandPoll: options.lastTelegramCommandPoll ?? null,
      now
    }),
    now
  };
}

export async function runTodayActionDigest(store, config, options = {}) {
  const now = toDate(options.now);
  const force = Boolean(options.force);
  const enabled = config.todayActionDigestEnabled !== false;

  if (!enabled && !force) {
    return {
      checkedAt: now.toISOString(),
      skipped: true,
      reason: 'today_action_digest_disabled'
    };
  }

  if (!force && !isKoreanMarketSession(now)) {
    return {
      checkedAt: now.toISOString(),
      skipped: true,
      reason: 'outside_market_session'
    };
  }

  if (!isTelegramConfigured(config) && typeof options.sendTelegramMessage !== 'function') {
    return {
      checkedAt: now.toISOString(),
      skipped: true,
      reason: 'telegram_not_configured'
    };
  }

  const context = await buildTodayActionsContext(store, config, options);
  const actions = buildTelegramTodayActions(context);
  const criticalActions = filterCriticalTodayActions(actions);

  if (!criticalActions.length) {
    return {
      checkedAt: now.toISOString(),
      skipped: true,
      reason: 'no_critical_actions',
      criticalCount: 0
    };
  }

  const fingerprint = buildTodayActionDigestFingerprint(criticalActions);
  const cooldownMinutes = normalizeCooldownMinutes(config.todayActionDigestCooldownMinutes);
  const previous =
    typeof store.getMetaValue === 'function'
      ? await store.getMetaValue(lastTodayActionDigestAlertMetaKey, null)
      : null;

  if (
    !force &&
    previous?.fingerprint === fingerprint &&
    isWithinCooldown(previous.sentAt, now, cooldownMinutes)
  ) {
    return {
      checkedAt: now.toISOString(),
      skipped: true,
      reason: 'cooldown',
      fingerprint,
      cooldownMinutes,
      criticalCount: criticalActions.length
    };
  }

  const message = formatTodayActionDigestMessage(criticalActions);
  const sender = options.sendTelegramMessage || sendTelegramMessage;
  let deliveryStatus = 'failed';
  let deliveryError = '';

  try {
    await sender(config, message);
    deliveryStatus = 'sent';
  } catch (error) {
    deliveryError = error.message;
  }

  const result = {
    checkedAt: now.toISOString(),
    skipped: false,
    fingerprint,
    criticalCount: criticalActions.length,
    deliveryStatus,
    deliveryError,
    cooldownMinutes
  };

  if (deliveryStatus === 'sent' && typeof store.setMetaValue === 'function') {
    await store.setMetaValue(lastTodayActionDigestAlertMetaKey, {
      sentAt: now.toISOString(),
      fingerprint,
      criticalCount: criticalActions.length
    });
  }

  return result;
}

function normalizeCooldownMinutes(value) {
  const minutes = Number(value);
  return Number.isFinite(minutes) && minutes > 0 ? Math.floor(minutes) : defaultCooldownMinutes;
}

function isWithinCooldown(previousSentAt, now, cooldownMinutes) {
  const previousTime = new Date(previousSentAt || 0).getTime();
  const nowTime = now.getTime();

  if (!Number.isFinite(previousTime) || previousTime <= 0) {
    return false;
  }

  return nowTime - previousTime < cooldownMinutes * 60 * 1000;
}

function toDate(value) {
  const date = value instanceof Date ? value : new Date(value || Date.now());
  return Number.isFinite(date.getTime()) ? date : new Date();
}
