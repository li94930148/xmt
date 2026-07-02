import { Eye, ShieldCheck } from 'lucide-react';
import type { DailyReport, DailyReportStatus } from '../../api/dailyReports';
import { ActionButton, EmptyState, GlassPanel } from '../studio';
import { DailyReportRiskPill, DailyReportStatusPill } from './DailyReportStatusPill';

type DailyReportTeamBoardProps = {
  date: string;
  status: DailyReportStatus | 'all';
  reports: DailyReport[];
  loading: boolean;
  error?: string;
  onDateChange: (date: string) => void;
  onStatusChange: (status: DailyReportStatus | 'all') => void;
  onRefresh: () => void;
  onView: (report: DailyReport) => void;
  onReview: (report: DailyReport) => void;
};

const statuses: Array<{ value: DailyReportStatus | 'all'; label: string }> = [
  { value: 'all', label: '全部' },
  { value: 'draft', label: '草稿' },
  { value: 'submitted', label: '已提交' },
  { value: 'approved', label: '已审核' },
  { value: 'rejected', label: '已退回' },
  { value: 'archived', label: '已归档' },
];

export default function DailyReportTeamBoard({
  date,
  status,
  reports,
  loading,
  error,
  onDateChange,
  onStatusChange,
  onRefresh,
  onView,
  onReview,
}: DailyReportTeamBoardProps) {
  return (
    <GlassPanel className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-studio-border-soft px-5 py-4">
        <div>
          <h2 className="text-base font-semibold text-studio-text-primary">团队日报</h2>
          <p className="mt-1 text-sm text-studio-text-muted">查看成员提交情况并审核已提交日报。</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <input
            type="date"
            value={date}
            onChange={(event) => onDateChange(event.target.value)}
            className="rounded-button border border-studio-border-soft bg-white/[0.04] px-3 py-2 text-sm text-studio-text-primary outline-none"
          />
          <select
            value={status}
            onChange={(event) => onStatusChange(event.target.value as DailyReportStatus | 'all')}
            className="rounded-button border border-studio-border-soft bg-studio-surface px-3 py-2 text-sm text-studio-text-primary outline-none"
          >
            {statuses.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
          <ActionButton onClick={onRefresh} disabled={loading}>刷新</ActionButton>
        </div>
      </div>

      {error ? (
        <div className="p-5">
          <EmptyState icon={ShieldCheck} title="无法查看团队日报" description={error} />
        </div>
      ) : reports.length === 0 ? (
        <div className="p-5">
          <EmptyState icon={Eye} title={loading ? '加载中' : '暂无团队日报'} description="当前筛选条件下还没有日报记录。" />
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="border-b border-studio-border-soft bg-white/[0.035] text-left text-xs text-studio-text-muted">
              <tr>
                <th className="px-5 py-3">成员</th>
                <th className="px-5 py-3">日期</th>
                <th className="px-5 py-3">状态</th>
                <th className="px-5 py-3">风险</th>
                <th className="px-5 py-3">摘要</th>
                <th className="px-5 py-3">提交/审核</th>
                <th className="px-5 py-3">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-studio-border-soft">
              {reports.map((report) => (
                <tr key={report.id} className="text-studio-text-secondary">
                  <td className="px-5 py-4 font-semibold text-studio-text-primary">{report.userName || report.username || `用户 ${report.userId}`}</td>
                  <td className="px-5 py-4">{report.reportDate}</td>
                  <td className="px-5 py-4"><DailyReportStatusPill status={report.status} /></td>
                  <td className="px-5 py-4"><DailyReportRiskPill risk={report.riskLevel} /></td>
                  <td className="max-w-sm px-5 py-4">
                    <p className="line-clamp-2">{report.summaryExcerpt || report.manualSummaryMd || report.itemSummary?.[0]?.excerpt || '-'}</p>
                  </td>
                  <td className="px-5 py-4 text-xs">
                    <div>{report.submittedAt || '-'}</div>
                    <div className="mt-1 text-studio-text-muted">{report.reviewedAt || report.reviewComment || ''}</div>
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex flex-wrap gap-2">
                      <ActionButton onClick={() => onView(report)} className="px-3 py-2">
                        Detail
                      </ActionButton>
                      <ActionButton onClick={() => onReview(report)} disabled={report.status !== 'submitted'} className="px-3 py-2">
                      审核
                      </ActionButton>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </GlassPanel>
  );
}
