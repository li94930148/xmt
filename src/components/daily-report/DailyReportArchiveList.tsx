import { Archive } from 'lucide-react';
import type { DailyReport } from '../../api/dailyReports';
import type { User } from '../../types';
import { ActionButton, EmptyState, GlassPanel } from '../studio';
import { DailyReportRiskPill, DailyReportStatusPill } from './DailyReportStatusPill';

type DailyReportArchiveListProps = {
  start: string;
  end: string;
  reports: DailyReport[];
  loading: boolean;
  canFilterUser?: boolean;
  users?: User[];
  selectedUserId?: string;
  onStartChange: (date: string) => void;
  onEndChange: (date: string) => void;
  onUserChange?: (userId: string) => void;
  onSearch: () => void;
  onView: (report: DailyReport) => void;
};

export default function DailyReportArchiveList({
  start,
  end,
  reports,
  loading,
  canFilterUser = false,
  users = [],
  selectedUserId = '',
  onStartChange,
  onEndChange,
  onUserChange,
  onSearch,
  onView,
}: DailyReportArchiveListProps) {
  return (
    <GlassPanel className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-studio-border-soft px-5 py-4">
        <div>
          <h2 className="text-base font-semibold text-studio-text-primary">日报归档</h2>
          <p className="mt-1 text-sm text-studio-text-muted">默认查看最近 7 天，单次查询最多 31 天。</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canFilterUser ? (
            <select
              value={selectedUserId}
              onChange={(event) => onUserChange?.(event.target.value)}
              className="rounded-button border border-studio-border-soft bg-studio-surface px-3 py-2 text-sm text-studio-text-primary outline-none"
            >
              <option value="">All members</option>
              {users.map((user) => (
                <option key={user.id} value={String(user.id)}>
                  {user.name || user.username}
                </option>
              ))}
            </select>
          ) : null}
          <input type="date" value={start} onChange={(event) => onStartChange(event.target.value)} className="rounded-button border border-studio-border-soft bg-white/[0.04] px-3 py-2 text-sm text-studio-text-primary outline-none" />
          <input type="date" value={end} onChange={(event) => onEndChange(event.target.value)} className="rounded-button border border-studio-border-soft bg-white/[0.04] px-3 py-2 text-sm text-studio-text-primary outline-none" />
          <ActionButton onClick={onSearch} disabled={loading}>查询</ActionButton>
        </div>
      </div>

      {reports.length === 0 ? (
        <div className="p-5">
          <EmptyState icon={Archive} title={loading ? '加载中' : '暂无归档'} description="当前日期范围内没有日报记录。" />
        </div>
      ) : (
        <div className="divide-y divide-studio-border-soft">
          {reports.map((report) => (
            <div key={report.id} className="grid gap-3 px-5 py-4 lg:grid-cols-[120px_160px_120px_minmax(0,1fr)_180px_110px] lg:items-center">
              <div>
                <div className="font-semibold text-studio-text-primary">{report.reportDate}</div>
                <div className="mt-1 text-xs text-studio-text-muted">{report.userName || report.username || `User ${report.userId}`}</div>
              </div>
              <DailyReportStatusPill status={report.status} />
              <DailyReportRiskPill risk={report.riskLevel} />
              <p className="line-clamp-2 text-sm text-studio-text-secondary">
                {report.manualSummaryMd || report.items.map((item) => item.contentMd).filter(Boolean).join(' / ') || '-'}
              </p>
              <ActionButton onClick={() => onView(report)} className="px-3 py-2 lg:order-last">
                Detail
              </ActionButton>
              <div className="text-xs text-studio-text-muted">
                <div>提交：{report.submittedAt || '-'}</div>
                <div>审核：{report.reviewedAt || report.reviewComment || '-'}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </GlassPanel>
  );
}
