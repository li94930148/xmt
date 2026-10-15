const PRODUCTION_STATUS_LABELS: Record<string, string> = {
  draft: '草稿',
  review: '审核中',
  approved: '已通过',
  rejected: '已驳回',
};

export function productionStatusLabel(status: unknown): string {
  if (typeof status !== 'string') return '状态待确认';
  const key = status.trim().toLowerCase();
  return Object.prototype.hasOwnProperty.call(PRODUCTION_STATUS_LABELS, key) ? PRODUCTION_STATUS_LABELS[key] : '状态待确认';
}
