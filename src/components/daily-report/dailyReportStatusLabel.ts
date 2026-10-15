const DAILY_REPORT_STATUS_LABELS: Record<string, string> = {
  draft: '草稿',
  submitted: '已提交',
  approved: '已审核',
  rejected: '已退回',
  archived: '已归档',
};

export function dailyReportStatusLabel(status: unknown): string {
  if (typeof status !== 'string') return '状态待确认';
  const key = status.trim().toLowerCase();
  return Object.prototype.hasOwnProperty.call(DAILY_REPORT_STATUS_LABELS, key) ? DAILY_REPORT_STATUS_LABELS[key] : '状态待确认';
}
