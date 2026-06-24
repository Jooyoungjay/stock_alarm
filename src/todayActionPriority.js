export const TODAY_ACTION_PRIORITY_LABELS = Object.freeze({
  critical: '확인 필요',
  warning: '주의',
  info: '확인'
});

export function formatTodayActionPriority(priority) {
  return TODAY_ACTION_PRIORITY_LABELS[priority] || TODAY_ACTION_PRIORITY_LABELS.info;
}
