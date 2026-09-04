import { useCallback, useEffect, useState } from 'react';
import { Archive, Eye } from 'lucide-react';
import { getDailyReportArchive, getSummaryArchive, type DailyReport, type MonthlyRecord, type SummaryArchive, type YearlyRecord } from '../../api/dailyReports';
import { getUsers } from '../../api/users';
import type { User } from '../../types';
import { ActionButton, EmptyState, GlassPanel } from '../studio';

type Props = { canViewArchive: boolean; onView: (report: DailyReport) => void };
type ArchiveKind = 'daily' | 'monthly' | 'yearly';

export function SummaryArchiveContent({ record }: { record: MonthlyRecord | YearlyRecord }) {
  return <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-studio-text-secondary">{record.display_content_md || '未填写内容'}</p>;
}

export default function DailyReportSummaryArchive({ canViewArchive, onView }: Props) {
  const now = new Date();
  const [kind, setKind] = useState<ArchiveKind>('daily');
  const [year, setYear] = useState(now.getFullYear());
  const [start, setStart] = useState(new Date(now.getTime() - 6 * 86400000).toLocaleDateString('sv-SE'));
  const [end, setEnd] = useState(now.toLocaleDateString('sv-SE'));
  const [userId, setUserId] = useState('');
  const [users, setUsers] = useState<User[]>([]);
  const [daily, setDaily] = useState<DailyReport[]>([]);
  const [summary, setSummary] = useState<SummaryArchive | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => { if (canViewArchive) void getUsers({ page: 1, limit: 200 }).then((result) => setUsers(result.data || [])).catch(() => setUsers([])); }, [canViewArchive]);

  const load = useCallback(async () => {
    if (!canViewArchive) return;
    setLoading(true);
    try {
      if (kind === 'daily') {
        const result = await getDailyReportArchive({ start, end, userId: userId ? Number(userId) : undefined });
        setDaily(result.reports);
      } else {
        setSummary(await getSummaryArchive(year, userId ? Number(userId) : undefined));
      }
    } finally { setLoading(false); }
  }, [canViewArchive, end, kind, start, userId, year]);

  useEffect(() => { void load(); }, [load]);

  if (!canViewArchive) return <GlassPanel className="p-5"><EmptyState icon={Archive} title="仅管理员可查看归档" description="" /></GlassPanel>;

  const monthly = summary?.monthly || [];
  const yearly = summary?.yearly || [];
  const summaryRows: Array<MonthlyRecord | YearlyRecord> = kind === 'monthly' ? monthly : yearly;

  return <GlassPanel className="overflow-hidden">
    <div className="border-b border-studio-border-soft px-5 py-4"><h2 className="text-base font-semibold text-studio-text-primary">总结归档</h2><p className="mt-1 text-sm text-studio-text-muted">按类型、日期和成员筛选日报、月报、年报。</p></div>
    <div className="flex flex-wrap items-end gap-3 border-b border-studio-border-soft px-5 py-4">
      <div className="flex gap-2">{(['daily', 'monthly', 'yearly'] as const).map((value) => <button key={value} type="button" onClick={() => setKind(value)} className={`rounded-button px-3 py-2 text-sm font-semibold ${kind === value ? 'bg-studio-primary text-white' : 'border border-studio-border-soft text-studio-text-secondary'}`}>{value === 'daily' ? '日报' : value === 'monthly' ? '月报' : '年报'}</button>)}</div>
      <label className="block"><span className="mb-2 block text-xs text-studio-text-muted">成员</span><select value={userId} onChange={(event) => setUserId(event.target.value)} className="rounded-button border border-studio-border-soft bg-studio-surface px-3 py-2 text-sm text-studio-text-primary"><option value="">全部成员</option>{users.map((user) => <option key={user.id} value={String(user.id)}>{user.name || user.username}</option>)}</select></label>
      {kind === 'daily' ? <><label className="block"><span className="mb-2 block text-xs text-studio-text-muted">开始日期</span><input type="date" value={start} onChange={(event) => setStart(event.target.value)} className="rounded-button border border-studio-border-soft bg-white/[0.04] px-3 py-2 text-sm text-studio-text-primary" /></label><label className="block"><span className="mb-2 block text-xs text-studio-text-muted">结束日期</span><input type="date" value={end} onChange={(event) => setEnd(event.target.value)} className="rounded-button border border-studio-border-soft bg-white/[0.04] px-3 py-2 text-sm text-studio-text-primary" /></label></> : <label className="block"><span className="mb-2 block text-xs text-studio-text-muted">年份</span><input type="number" value={year} onChange={(event) => setYear(Number(event.target.value))} className="w-28 rounded-button border border-studio-border-soft bg-white/[0.04] px-3 py-2 text-sm text-studio-text-primary" /></label>}
      <ActionButton onClick={() => void load()} disabled={loading}>查询</ActionButton>
    </div>
    {kind === 'daily' ? daily.length === 0 ? <div className="p-5"><EmptyState icon={Archive} title={loading ? '加载中' : '暂无日报归档'} description="当前筛选范围内没有日报记录。" /></div> : <div className="divide-y divide-studio-border-soft">{daily.map((report) => <div key={report.id} className="grid gap-3 px-5 py-4 md:grid-cols-[160px_140px_minmax(0,1fr)_90px] md:items-center"><div><div className="font-semibold text-studio-text-primary">{report.userName || report.username || `成员 ${report.userId}`}</div><div className="mt-1 text-xs text-studio-text-muted">{report.reportDate}</div></div><span className="text-sm text-studio-text-muted">{report.status === 'draft' ? '草稿' : '已提交'}</span><p className="line-clamp-3 whitespace-pre-wrap text-sm leading-6 text-studio-text-secondary">{report.manualSummaryMd || report.items.map((item) => item.contentMd).filter(Boolean).join('\n') || '未填写内容'}</p><ActionButton onClick={() => onView(report)} className="px-3 py-2"><Eye className="h-4 w-4" />查看</ActionButton></div>)}</div> : summaryRows.length === 0 ? <div className="p-5"><EmptyState icon={Archive} title={loading ? '加载中' : '暂无归档'} description="当前筛选范围内没有记录。" /></div> : <div className="divide-y divide-studio-border-soft">{summaryRows.map((record) => <div key={record.id} className="px-5 py-4"><div className="font-semibold text-studio-text-primary">{record.user_name || record.username || '成员'} · {kind === 'monthly' ? `${(record as MonthlyRecord).month} 月` : `${record.year} 年`}</div><SummaryArchiveContent record={record} /></div>)}</div>}
  </GlassPanel>;
}
