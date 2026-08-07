import { Eye, Users } from 'lucide-react';
import type { DailyReport } from '../../api/dailyReports';
import { ActionButton, EmptyState, GlassPanel } from '../studio';

type Props = {
  date: string;
  reports: DailyReport[];
  loading: boolean;
  error?: string;
  onDateChange: (date: string) => void;
  onRefresh: () => void;
  onView: (report: DailyReport) => void;
};

export default function DailyReportTeamBoard({ date, reports, loading, error, onDateChange, onRefresh, onView }: Props) {
  return (
    <GlassPanel className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-studio-border-soft px-5 py-4">
        <div>
          <h2 className="text-base font-semibold text-studio-text-primary">团队日报</h2>
          <p className="mt-1 text-sm text-studio-text-muted">查看成员公开的日报内容。</p>
        </div>
        <div className="flex gap-2">
          <input type="date" value={date} onChange={(event) => onDateChange(event.target.value)} className="rounded-button border border-studio-border-soft bg-white/[0.04] px-3 py-2 text-sm text-studio-text-primary outline-none" />
          <ActionButton onClick={onRefresh} disabled={loading}>刷新</ActionButton>
        </div>
      </div>
      {error ? <div className="p-5"><EmptyState icon={Users} title="无法查看团队日报" description={error} /></div> : reports.length === 0 ? <div className="p-5"><EmptyState icon={Users} title={loading ? '加载中' : '暂无团队日报'} description="当前日期没有已提交日报。" /></div> : (
        <div className="divide-y divide-studio-border-soft">
          {reports.map((report) => (
            <div key={report.id} className="grid gap-3 px-5 py-4 md:grid-cols-[160px_140px_minmax(0,1fr)_90px] md:items-center">
              <span className="font-semibold text-studio-text-primary">{report.userName || report.username || `成员 ${report.userId}`}</span>
              <span className="text-sm text-studio-text-muted">{report.reportDate}</span>
              <p className="line-clamp-3 whitespace-pre-wrap text-sm leading-6 text-studio-text-secondary">{report.manualSummaryMd || report.items.map((item) => item.contentMd).filter(Boolean).join('\n') || '未填写内容'}</p>
              <ActionButton onClick={() => onView(report)} className="px-3 py-2"><Eye className="h-4 w-4" />查看</ActionButton>
            </div>
          ))}
        </div>
      )}
    </GlassPanel>
  );
}
