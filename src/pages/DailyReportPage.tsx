import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Archive, FileClock, RefreshCw, Users } from 'lucide-react';
import { useAuthStore } from '../store';
import { usePermission } from '../hooks/usePermission';
import { getDailyReportArchive, getMyDailyReport, getTeamDailyReports, saveDailyReportDraft, submitDailyReport, type DailyReport, type DailyReportItem } from '../api/dailyReports';
import { getUsers } from '../api/users';
import type { User } from '../types';
import { ActionButton, GlassPanel, PageHeader, PageShell } from '../components/studio';
import DailyReportComposer from '../components/daily-report/DailyReportComposer';
import DailyReportTeamBoard from '../components/daily-report/DailyReportTeamBoard';
import DailyReportArchiveList from '../components/daily-report/DailyReportArchiveList';
import DailyReportSummaryArchive from '../components/daily-report/DailyReportSummaryArchive';
import DailyReportDetailDrawer from '../components/daily-report/DailyReportDetailDrawer';

type TabKey = 'mine' | 'team' | 'summary';
const fields = [
  { key: 'today', title: '今日工作' },
  { key: 'tomorrow', title: '明日计划' },
  { key: 'coordination', title: '需要协调事项' },
];

function today() { return new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Shanghai' }); }
function daysAgo(days: number) { const date = new Date(); date.setDate(date.getDate() - days); return date.toLocaleDateString('sv-SE', { timeZone: 'Asia/Shanghai' }); }
function normalizeItems(report: DailyReport | null): DailyReportItem[] {
  return fields.map((field, index) => {
    const item = report?.items.find((entry) => entry.sectionKey === field.key);
    return { id: item?.id, sectionKey: field.key, title: field.title, contentMd: item?.contentMd || '', sortOrder: index };
  });
}
function hasContent(items: DailyReportItem[]) { return items.some((item) => item.contentMd.trim()); }
function errorMessage(error: unknown) { return error instanceof Error ? error.message : '请求失败，请稍后重试'; }

export default function DailyReportPage() {
  const location = useLocation();
  const user = useAuthStore((state) => state.user);
  const { hasPermission } = usePermission();
  const canViewTeam = user?.role === 'admin' || user?.role === 'director' || hasPermission('report:daily:view_team');
  const canViewArchive = user?.role === 'admin' || user?.role === 'director';
  const [tab, setTab] = useState<TabKey>(location.pathname.endsWith('/team') ? 'team' : location.pathname.endsWith('/summary') ? 'summary' : 'mine');
  const [date, setDate] = useState(today());
  const [report, setReport] = useState<DailyReport | null>(null);
  const [items, setItems] = useState<DailyReportItem[]>(normalizeItems(null));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [teamDate, setTeamDate] = useState(today());
  const [teamReports, setTeamReports] = useState<DailyReport[]>([]);
  const [teamLoading, setTeamLoading] = useState(false);
  const [teamError, setTeamError] = useState('');
  const [archiveStart, setArchiveStart] = useState(daysAgo(6));
  const [archiveEnd, setArchiveEnd] = useState(today());
  const [archiveReports, setArchiveReports] = useState<DailyReport[]>([]);
  const [archiveLoading, setArchiveLoading] = useState(false);
  const [archiveUserId, setArchiveUserId] = useState('');
  const [archiveUsers, setArchiveUsers] = useState<User[]>([]);
  const [detail, setDetail] = useState<DailyReport | null>(null);

  const loadMine = useCallback(async () => {
    setLoading(true);
    try { const result = await getMyDailyReport(date); setReport(result.report); setItems(normalizeItems(result.report)); }
    catch (error) { setTeamError(errorMessage(error)); }
    finally { setLoading(false); }
  }, [date]);
  const loadTeam = useCallback(async () => {
    if (!canViewTeam) return;
    setTeamLoading(true); setTeamError('');
    try { const result = await getTeamDailyReports({ date: teamDate, status: user?.role === 'admin' || user?.role === 'director' ? 'all' : 'submitted' }); setTeamReports(result.reports); }
    catch (error) { setTeamError(errorMessage(error)); setTeamReports([]); }
    finally { setTeamLoading(false); }
  }, [canViewTeam, teamDate, user?.role]);
  const loadArchive = useCallback(async () => {
    if (!canViewArchive) return;
    setArchiveLoading(true);
    try { const result = await getDailyReportArchive({ start: archiveStart, end: archiveEnd, userId: archiveUserId ? Number(archiveUserId) : undefined }); setArchiveReports(result.reports); }
    catch (error) { setTeamError(errorMessage(error)); }
    finally { setArchiveLoading(false); }
  }, [archiveEnd, archiveStart, archiveUserId, canViewArchive]);

  useEffect(() => { void loadMine(); }, [loadMine]);
  useEffect(() => { if (tab === 'team') void loadTeam(); if (tab === 'summary') void loadArchive(); }, [loadArchive, loadTeam, tab]);
  useEffect(() => { if (!canViewArchive) return; void getUsers({ page: 1, limit: 200 }).then((result) => setArchiveUsers(result.data || [])).catch(() => setArchiveUsers([])); }, [canViewArchive]);

  const save = async () => {
    setSaving(true);
    try { const saved = await saveDailyReportDraft({ reportDate: date, version: report?.version, manualSummaryMd: '', riskLevel: 'normal', items }); setReport(saved); setItems(normalizeItems(saved)); }
    finally { setSaving(false); }
  };
  const submit = async () => {
    if (!hasContent(items)) return;
    setSubmitting(true);
    try { const saved = report || await saveDailyReportDraft({ reportDate: date, manualSummaryMd: '', riskLevel: 'normal', items }); const submitted = await submitDailyReport(saved.id); setReport(submitted); setItems(normalizeItems(submitted)); }
    finally { setSubmitting(false); }
  };

  const tabs = useMemo(() => [
    { key: 'mine' as const, label: '我的日报', icon: FileClock, visible: true },
    { key: 'team' as const, label: '团队日报', icon: Users, visible: canViewTeam },
    { key: 'summary' as const, label: '总结归档', icon: Archive, visible: true },
  ], [canViewTeam]);

  return <PageShell>
    <PageHeader title="日报" description="记录每天的工作、计划和需要协调的事项。" actions={<ActionButton onClick={() => tab === 'mine' ? void loadMine() : tab === 'team' ? void loadTeam() : void loadArchive()}><RefreshCw className="h-4 w-4" />刷新</ActionButton>} />
    <GlassPanel className="p-2"><div className="flex flex-wrap gap-2">{tabs.filter((item) => item.visible).map((item) => { const Icon = item.icon; return <button key={item.key} type="button" onClick={() => setTab(item.key)} className={`inline-flex items-center gap-2 rounded-button px-4 py-2.5 text-sm font-semibold ${tab === item.key ? 'bg-studio-primary text-white' : 'text-studio-text-secondary hover:bg-white/[0.06]'}`}><Icon className="h-4 w-4" />{item.label}</button>; })}</div></GlassPanel>
    {tab === 'mine' ? <div className="space-y-5"><GlassPanel className="flex flex-wrap items-center gap-4 p-5"><label className="block"><span className="mb-2 block text-sm text-studio-text-muted">日期</span><input type="date" value={date} onChange={(event) => setDate(event.target.value)} className="rounded-button border border-studio-border-soft bg-white/[0.04] px-3 py-2 text-sm text-studio-text-primary" /></label><span className="text-sm text-studio-text-muted">{loading ? '加载中...' : report ? '已加载日报' : '今天还没有日报'}</span></GlassPanel><DailyReportComposer status={report?.status || 'draft'} items={items} saving={saving} submitting={submitting} onItemsChange={setItems} onSave={() => void save()} onSubmit={() => void submit()} /></div> : null}
    {tab === 'team' ? <DailyReportTeamBoard date={teamDate} reports={teamReports} loading={teamLoading} error={teamError} onDateChange={setTeamDate} onRefresh={loadTeam} onView={setDetail} /> : null}
    {tab === 'summary' ? <div className="space-y-5"><DailyReportSummaryArchive canViewArchive={canViewArchive} />{canViewArchive ? <DailyReportArchiveList start={archiveStart} end={archiveEnd} reports={archiveReports} loading={archiveLoading} canFilterUser users={archiveUsers} selectedUserId={archiveUserId} onStartChange={setArchiveStart} onEndChange={setArchiveEnd} onUserChange={setArchiveUserId} onSearch={loadArchive} onView={setDetail} /> : null}</div> : null}
    <DailyReportDetailDrawer report={detail} onClose={() => setDetail(null)} />
  </PageShell>;
}
