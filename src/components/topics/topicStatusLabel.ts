const TOPIC_STATUS_LABELS: Record<string, string> = {
  pending: '待审核',
  approved: '已通过',
  rejected: '已驳回',
  production: '创作中',
  shooting: '成片制作',
  publishing: '发布中',
  completed: '已完成',
};

export function topicStatusLabel(status: unknown): string {
  if (typeof status !== 'string') return '状态待确认';
  const key = status.trim().toLowerCase();
  return Object.prototype.hasOwnProperty.call(TOPIC_STATUS_LABELS, key) ? TOPIC_STATUS_LABELS[key] : '状态待确认';
}
