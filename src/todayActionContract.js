export const TODAY_ACTION_LIMIT = 5;
export const TODAY_ACTION_MAX_PER_STOCK = 2;

export const TODAY_ACTION_SYSTEM_TYPES = Object.freeze({
  'telegram-poll-health': 5,
  'quote-freshness-summary': 6,
  'observation-failed': 7,
  'observation-manual': 8,
  'kis-naver-compare-open': 9
});

export const TODAY_ACTION_STOCK_TYPES = Object.freeze({
  'threshold-alert': 0,
  'quote-error': 10,
  'quote-missing': 11,
  'quote-stale': 12,
  'dividend-error': 20
});

export const TODAY_ACTION_ADMIN_JUMP_TYPES = Object.freeze([
  'observation-manual',
  'observation-failed'
]);

export const TODAY_ACTION_OBSERVATION_TYPES = Object.freeze([
  ...Object.keys(TODAY_ACTION_SYSTEM_TYPES),
  ...Object.keys(TODAY_ACTION_STOCK_TYPES)
]);
