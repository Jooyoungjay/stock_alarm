export const DEFAULT_TELEGRAM_POLL_STALE_FACTOR = 6;

export const TELEGRAM_UNRESPONSIVE_NEXT_ACTION =
  '서버를 재시작하고 TELEGRAM_BOT_TOKEN·TELEGRAM_CHAT_ID를 확인한 뒤 /api/health 의 lastTelegramCommandPoll 을 다시 봅니다.';

export function assessTelegramPollHealth(input = {}) {
  const telegramConfigured = Boolean(input.telegramConfigured);
  const pollSeconds = normalizePollSeconds(input.telegramCommandPollSeconds);
  const staleAfterSeconds = pollSeconds * normalizeStaleFactor(input.staleFactor);
  const now = input.now instanceof Date ? input.now.getTime() : Number(input.now) || Date.now();
  const lastPoll = input.lastTelegramCommandPoll || null;

  if (!telegramConfigured) {
    return {
      status: 'not_configured',
      level: 'warn',
      label: '미설정',
      detail: '.env 에 TELEGRAM_BOT_TOKEN 과 TELEGRAM_CHAT_ID 가 필요합니다.',
      staleAfterSeconds,
      nextAction: '텔레그램 env 설정 후 서버를 재시작하세요.'
    };
  }

  if (lastPoll?.error) {
    return {
      status: 'error',
      level: 'bad',
      label: '폴링 오류',
      detail: String(lastPoll.error),
      staleAfterSeconds,
      nextAction: TELEGRAM_UNRESPONSIVE_NEXT_ACTION
    };
  }

  const checkedAt = String(lastPoll?.checkedAt || '').trim();

  if (!checkedAt) {
    return {
      status: 'unknown',
      level: 'warn',
      label: '미확인',
      detail: '아직 텔레그램 명령 폴링 기록이 없습니다.',
      staleAfterSeconds,
      nextAction: TELEGRAM_UNRESPONSIVE_NEXT_ACTION
    };
  }

  const ageSeconds = (now - new Date(checkedAt).getTime()) / 1000;

  if (!Number.isFinite(ageSeconds) || ageSeconds < 0) {
    return {
      status: 'unknown',
      level: 'warn',
      label: '시각 오류',
      detail: '마지막 폴링 시각을 해석하지 못했습니다.',
      staleAfterSeconds,
      nextAction: TELEGRAM_UNRESPONSIVE_NEXT_ACTION
    };
  }

  if (ageSeconds > staleAfterSeconds) {
    return {
      status: 'stale',
      level: 'bad',
      label: '무응답 의심',
      detail: `마지막 폴링 ${Math.round(ageSeconds)}초 전 · 기준 ${staleAfterSeconds}초`,
      ageSeconds: Math.round(ageSeconds),
      staleAfterSeconds,
      nextAction: TELEGRAM_UNRESPONSIVE_NEXT_ACTION
    };
  }

  return {
    status: 'ok',
    level: 'ok',
    label: '정상',
    detail: `마지막 폴링 ${Math.round(ageSeconds)}초 전 · ${pollSeconds}초 주기`,
    ageSeconds: Math.round(ageSeconds),
    staleAfterSeconds,
    nextAction: ''
  };
}

function normalizePollSeconds(value) {
  const seconds = Number(value);
  return Number.isFinite(seconds) && seconds > 0 ? seconds : 5;
}

function normalizeStaleFactor(value) {
  const factor = Number(value);
  return Number.isFinite(factor) && factor > 0 ? factor : DEFAULT_TELEGRAM_POLL_STALE_FACTOR;
}
