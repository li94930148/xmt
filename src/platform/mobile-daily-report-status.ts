import type { DailyReportStatus } from '@/api/dailyReports';

export type MobileDailyReportStatusView = {
  label: string;
  description: string;
  readOnly: boolean;
};

const statusViews: Record<DailyReportStatus, MobileDailyReportStatusView> = {
  draft: { label: '草稿', description: '草稿尚未提交，可继续填写、保存或提交。', readOnly: false },
  submitted: { label: '审核中', description: '日报已提交，审核完成前为只读状态。', readOnly: true },
  approved: { label: '已通过', description: '日报已通过审核，当前为只读状态。', readOnly: true },
  rejected: { label: '已退回', description: '请根据审核意见修改后重新提交。', readOnly: false },
  archived: { label: '已归档', description: '日报已归档，当前为只读状态。', readOnly: true },
};

export function getMobileDailyReportStatusView(status: DailyReportStatus | null | undefined, outcomeUncertain = false) {
  if (outcomeUncertain) {
    return { label: '状态待确认', description: '提交结果尚无法确认，核实前不要重复提交。', readOnly: true };
  }
  if (!status) return { label: '未填写', description: '今天尚未填写，可保存草稿或提交。', readOnly: false };
  if (Object.prototype.hasOwnProperty.call(statusViews, status)) return statusViews[status];
  return { label: '状态待确认', description: '服务器返回了暂不支持的日报状态，当前为只读状态。', readOnly: true };
}
