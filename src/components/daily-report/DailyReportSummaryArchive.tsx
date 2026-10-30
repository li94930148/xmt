import { useCallback, useEffect, useRef, useState } from 'react';
import { Archive, Eye } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { getDailyReportArchive, getSummaryArchive, type DailyReport, type MonthlyRecord, type SummaryArchive, type YearlyRecord } from '../../api/dailyReports';
import { getUsers } from '../../api/users';
import type { User } from '../../types';
import { ActionButton, EmptyState, GlassPanel } from '../studio';
import SummaryArchiveDetailModal from './SummaryArchiveDetailModal';
import { dateKeyBjt } from '@shared/time';
import { formatBeijingTime } from '../../lib/utils';
import ErrorState from '../common/ErrorState';
import { dailyReportStatusLabel } from './dailyReportStatusLabel';
import { getUserFacingErrorMessage } from '../../lib/userFacingError';

type Props = { canViewArchive: boolean; canViewOwnDaily: boolean; onView: (report: DailyReport) => void };
type ArchiveKind = 'daily' | 'monthly' | 'yearly';

export function SummaryArchiveContent({ record }: { record: MonthlyRecord | YearlyRecord }) {
  return <p className="mt-2 line-clamp-3 whitespace-pre-wrap text-sm leading-6 text-studio-text-secondary">{record.display_content_md || '未填写内容'}</p>;
}

export default function DailyReportSummaryArchive({ canViewArchive, canViewOwnDaily, onView }: Props) {
  const now = new Date();
  const [searchParams] = useSearchParams();
  const requestedDate = searchParams.get('date') || '';
  const requestedUserId = searchParams.get('userId') || '';
  const [kind, setKind] = useState<ArchiveKind>('daily');
  const [year, setYear] = useState(now.getFullYear());
  const [start, setStart] = useState(requestedDate || dateKeyBjt(new Date(now.getTime() - 6 * 86400000)));
  const [end, setEnd] = useState(requestedDate || dateKeyBjt(now));
  const [userId, setUserId] = useState(canViewArchive ? requestedUserId : '');
  const [users, setUsers] = useState<User[]>([]);
  const userDirectoryRequestRef = useRef(0);
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersLoadError, setUsersLoadError] = useState(false);
  const [daily, setDaily] = useState<DailyReport[]>([]);
  const [summary, setSummary] = useState<SummaryArchive | null>(null);
  const [selectedSummary, setSelectedSummary] = useState<MonthlyRecord | YearlyRecord | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(requestedDate)) return;
    setStart(requestedDate);
    setEnd(requestedDate);
    if (canViewArchive && requestedUserId) setUserId(requestedUserId);
  }, [canViewArchive, requestedDate, requestedUserId]);

  const loadUsers = useCallback(async () => {
    const requestId = ++userDirectoryRequestRef.current;
    if (!canViewArchive) {
      setUsers([]);
      setUsersLoadError(false);
      setUsersLoading(false);
      return;
    }

    setUsersLoading(true);
    setUsersLoadError(false);
    try {
      const result = await getUsers({ page: 1, limit: 200 });
      if (requestId === userDirectoryRequestRef.current) setUsers(result.data || []);
    } catch {
      if (requestId === userDirectoryRequestRef.current) setUsersLoadError(true);
    } finally {
      if (requestId === userDirectoryRequestRef.current) setUsersLoading(false);
    }
  }, [canViewArchive]);

  useEffect(() => {
    void loadUsers();
    return () => { userDirectoryRequestRef.current += 1; };
  }, [loadUsers]);

  const load = useCallback(async () => {
    if (!canViewOwnDaily) return;
    setLoading(true);
    setLoadError('');
    try {
      if (kind === 'daily') {
        const result = await getDailyReportArchive({ start, end, userId: userId ? Number(userId) : undefined });
        setDaily(result.reports);
      } else if (canViewArchive) {
        setSummary(await getSummaryArchive(year, userId ? Number(userId) : undefined));
      } else {
        setSummary(null);
      }
    } catch (error) {
      setLoadError(getUserFacingErrorMessage(error, '日报归档加载失败，请检查连接后重试。'));
    } finally {
      setLoading(false);
    }
  }, [canViewArchive, canViewOwnDaily, end, kind, start, userId, year]);

  useEffect(() => { void load(); }, [load]);

  if (!canViewOwnDaily) return <GlassPanel className="p-5"><EmptyState icon={Archive} title="暂无归档权限" description="需要日报提交或归档权限才能查看日报记录。" /></GlassPanel>;
  if (loadError) return <ErrorState title="日报归档加载失败" description={loadError} onRetry={() => void load()} />;

  const monthly = summary?.monthly || [];
  const yearly = summary?.yearly || [];
  const summaryRows: Array<MonthlyRecord | YearlyRecord> = kind === 'monthly' ? monthly : yearly;
  const summaryKind = kind === 'monthly' ? 'monthly' : 'yearly';

  return (
    <>
      <GlassPanel className="overflow-hidden">
        <div className="border-b border-studio-border-soft px-5 py-4">
          <h2 className="text-base font-semibold text-studio-text-primary">总结归档</h2>
          <p className="mt-1 text-sm text-studio-text-muted">按类型、日期和成员筛选日报、月报、年报。</p>
        </div>
        <div className="flex flex-wrap items-end gap-3 border-b border-studio-border-soft px-5 py-4">
          <div role="group" aria-label="归档周期" className="flex flex-wrap gap-2">
            {(['daily', 'monthly', 'yearly'] as const).map((value) => (
              <button key={value} type="button" aria-pressed={kind === value} disabled={!canViewArchive && value !== 'daily'} onClick={() => setKind(value)} className={`xmt-btn min-h-10 inline-flex shrink-0 items-center justify-center rounded-button px-3 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-45 ${kind === value ? 'bg-studio-primary-button text-white' : 'border border-studio-border-soft text-studio-text-secondary'}`}>
                {value === 'daily' ? '日报' : value === 'monthly' ? '月报' : '年报'}
              </button>
            ))}
          </div>
          {canViewArchive ? (
            <label className="block">
              <span className="mb-2 block text-xs text-studio-text-muted">成员</span>
              <select data-testid="daily-report-archive-user-filter" value={userId} onChange={(event) => setUserId(event.target.value)} className="rounded-button border border-studio-border-soft bg-studio-surface px-3 py-2 text-sm text-studio-text-primary">
                <option value="">全部成员</option>
                {userId && !users.some((user) => String(user.id) === userId) ? <option value={userId} disabled>已选择成员（名称暂不可用）</option> : null}
                {users.map((user) => <option key={user.id} value={String(user.id)}>{user.name || user.username}</option>)}
              </select>
              {usersLoading ? <span role="status" className="mt-1 block text-xs text-studio-text-muted">正在加载成员名单…</span> : null}
              {usersLoadError ? (
                <span role="alert" className="mt-2 flex flex-wrap items-center gap-2 text-xs text-studio-danger">
                  <span>成员名单加载失败，筛选选项可能不完整。</span>
                  <ActionButton onClick={() => void loadUsers()} disabled={usersLoading} className="px-2 py-1">重试</ActionButton>
                </span>
              ) : null}
            </label>
          ) : <span className="text-xs text-studio-text-muted">仅显示自己的日报</span>}
          {kind === 'daily' ? (
            <>
              <label className="block"><span className="mb-2 block text-xs text-studio-text-muted">开始日期</span><input type="date" value={start} onChange={(event) => setStart(event.target.value)} className="rounded-button border border-studio-border-soft bg-studio-surface px-3 py-2 text-sm text-studio-text-primary" /></label>
              <label className="block"><span className="mb-2 block text-xs text-studio-text-muted">结束日期</span><input type="date" value={end} onChange={(event) => setEnd(event.target.value)} className="rounded-button border border-studio-border-soft bg-studio-surface px-3 py-2 text-sm text-studio-text-primary" /></label>
            </>
          ) : (
            <label className="block"><span className="mb-2 block text-xs text-studio-text-muted">年份</span><input type="number" value={year} onChange={(event) => setYear(Number(event.target.value))} className="w-28 rounded-button border border-studio-border-soft bg-studio-surface px-3 py-2 text-sm text-studio-text-primary" /></label>
          )}
          <ActionButton onClick={() => void load()} disabled={loading}>查询</ActionButton>
        </div>
        {kind === 'daily' ? (
          daily.length === 0 ? (
            <div className="p-5"><EmptyState icon={Archive} title={loading ? '加载中' : '暂无日报归档'} description="当前筛选范围内没有日报记录。" /></div>
          ) : (
            <div className="divide-y divide-studio-border-soft">
              {daily.map((report) => (
                <div key={report.id} className="grid gap-3 px-5 py-4 md:grid-cols-[160px_140px_minmax(0,1fr)_90px] md:items-center">
                  <div>
                    <div className="font-semibold text-studio-text-primary">{report.userName || report.username || `成员 ${report.userId}`}</div>
                    <div className="mt-1 text-xs text-studio-text-muted">{report.reportDate}</div>
                  </div>
                  <span className="text-sm text-studio-text-muted">{dailyReportStatusLabel(report.status)}</span>
                  <p className="line-clamp-3 whitespace-pre-wrap text-sm leading-6 text-studio-text-secondary">{report.manualSummaryMd || report.items.map((item) => item.contentMd).filter(Boolean).join('\n') || '未填写内容'}</p>
                  <ActionButton onClick={() => onView(report)} className="px-3 py-2"><Eye className="h-4 w-4" />查看</ActionButton>
                </div>
              ))}
            </div>
          )
        ) : summaryRows.length === 0 ? (
          <div className="p-5"><EmptyState icon={Archive} title={loading ? '加载中' : '暂无归档'} description="当前筛选范围内没有记录。" /></div>
        ) : (
          <div className="divide-y divide-studio-border-soft">
            {summaryRows.map((record) => (
              <button key={record.id} type="button" onClick={() => setSelectedSummary(record)} className="grid w-full gap-3 px-5 py-4 text-left transition-colors hover:bg-studio-surface-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-studio-cyan md:grid-cols-[minmax(0,1fr)_150px] md:items-center">
                <div className="min-w-0">
                  <div className="font-semibold text-studio-text-primary">{record.user_name || record.username || '成员'} · {kind === 'monthly' ? `${(record as MonthlyRecord).month} 月` : `${record.year} 年`}</div>
                  <p className="mt-1 text-xs text-studio-text-muted">{record.updated_at ? `更新于 ${formatBeijingTime(record.updated_at)}` : '已提交'}</p>
                  <SummaryArchiveContent record={record} />
                </div>
                <span className="inline-flex items-center justify-self-start gap-2 rounded-button border border-studio-border-soft px-3 py-2 text-sm font-semibold text-studio-text-secondary md:justify-self-end"><Eye className="h-4 w-4" />查看详情</span>
              </button>
            ))}
          </div>
        )}
      </GlassPanel>
      <SummaryArchiveDetailModal kind={summaryKind} record={selectedSummary} onClose={() => setSelectedSummary(null)} />
    </>
  );
}
