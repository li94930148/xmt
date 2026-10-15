import { StatusPill, type StatusTone } from '../studio';
import type { DailyReportRiskLevel, DailyReportStatus } from '../../api/dailyReports';
import { dailyReportStatusLabel } from './dailyReportStatusLabel';

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
  const tone = Object.prototype.hasOwnProperty.call(statusTone, status) ? statusTone[status] : 'muted';
  return <StatusPill tone={tone}>{dailyReportStatusLabel(status)}</StatusPill>;
}

export function DailyReportRiskPill({ risk }: { risk?: DailyReportRiskLevel }) {
  const value = risk || 'normal';
  return <StatusPill tone={riskTone[value] || 'muted'}>{riskText[value] || '未知风险'}</StatusPill>;
}
