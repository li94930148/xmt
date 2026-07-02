import { StatusPill, type StatusTone } from '../studio';
import type { DailyReportRiskLevel, DailyReportStatus } from '../../api/dailyReports';

const statusText: Record<DailyReportStatus, string> = {
  draft: '草稿',
  submitted: '已提交',
  approved: '已审核',
  rejected: '已退回',
  archived: '已归档',
};

const statusTone: Record<DailyReportStatus, StatusTone> = {
  draft: 'amber',
  submitted: 'cyan',
  approved: 'success',
  rejected: 'coral',
  archived: 'muted',
};

const riskText: Record<string, string> = {
  normal: '无风险',
  warning: '有风险',
  blocked: '阻塞',
  none: '无风险',
  low: '低',
  medium: '中',
  high: '高',
};

const riskTone: Record<string, StatusTone> = {
  normal: 'success',
  warning: 'amber',
  blocked: 'coral',
  none: 'success',
  low: 'cyan',
  medium: 'amber',
  high: 'coral',
};

export function DailyReportStatusPill({ status }: { status: DailyReportStatus }) {
  return <StatusPill tone={statusTone[status] || 'muted'}>{statusText[status] || status}</StatusPill>;
}

export function DailyReportRiskPill({ risk }: { risk?: DailyReportRiskLevel }) {
  const value = risk || 'normal';
  return <StatusPill tone={riskTone[value] || 'muted'}>{riskText[value] || value}</StatusPill>;
}
