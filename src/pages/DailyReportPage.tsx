import { useCallback, useEffect, useMemo, useState } from 'react';
import { Archive, FileClock, RefreshCw, Users } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { useAuthStore } from '../store';
import { usePermission } from '../hooks/usePermission';
import { getMyDailyReport, getTeamDailyReports, saveDailyReportDraft, submitDailyReport, type DailyReport, type DailyReportItem } from '../api/dailyReports';
import { ActionButton, GlassPanel, PageHeader, PageShell } from '../components/studio';
import DailyReportComposer from '../components/daily-report/DailyReportComposer';
import DailyReportSummaryForm from '../components/daily-report/DailyReportSummaryForm';
import DailyReportTeamBoard from '../components/daily-report/DailyReportTeamBoard';
import DailyReportSummaryArchive from '../components/daily-report/DailyReportSummaryArchive';
import DailyReportDetailDrawer from '../components/daily-report/DailyReportDetailDrawer';

type TabKey = 'mine' | 'team' | 'summary';
type EntryType = 'daily' | 'monthly' | 'yearly';
const fields = [{ key: 'today', title: '今日工作' }, { key: 'tomorrow', title: '明日计划' }, { key: 'coordination', title: '需要协调事项' }];
function today() { return new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Shanghai' }); }
function normalizeItems(report: DailyReport | null): DailyReportItem[] { return fields.map((field, index) => { const item = report?.items.find((entry) => entry.sectionKey === field.key); return { id: item?.id, sectionKey: field.key, title: field.title, contentMd: item?.contentMd || '', sortOrder: index }; }); }
function hasContent(items: DailyReportItem[]) { return items.some((item) => item.contentMd.trim()); }

export default function DailyReportPage() {
  const location = useLocation();
  const user = useAuthStore((state) => state.user);
  const { hasPermission } = usePermission();
  const canViewTeam = user?.role === 'admin' || user?.role === 'director' || hasPermission('report:daily:view_team');
  const canViewArchive = user?.role === 'admin' || user?.role === 'director';
  const [tab, setTab] = useState<TabKey>(location.pathname.endsWith('/team') ? 'team' : location.pathname.endsWith('/summary') ? 'summary' : 'mine');
  const [entryType, setEntryType] = useState<EntryType>('daily');
  const [report, setReport] = useState<DailyReport | null>(null);
  const [items, setItems] = useState<DailyReportItem[]>(normalizeItems(null));
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [teamDate, setTeamDate] = useState(today());
  const [teamReports, setTeamReports] = useState<DailyReport[]>([]);
  const [teamLoading, setTeamLoading] = useState(false);
  const [teamError, setTeamError] = useState('');
  const [detail, setDetail] = useState<DailyReport | null>(null);
  const reportDate = today();

  const loadMine = useCallback(async () => {
    setLoading(true);
    try { const result = await getMyDailyReport(reportDate); setReport(result.report); setItems(normalizeItems(result.report)); }
    catch (error) { setTeamError(error instanceof Error ? error.message : '加载日报失败'); }
    finally { setLoading(false); }
  }, [reportDate]);
  const loadTeam = useCallback(async () => {
    if (!canViewTeam) return;
    setTeamLoading(true); setTeamError('');
    try { const result = await getTeamDailyReports({ date: teamDate, status: user?.role === 'admin' || user?.role === 'director' ? 'all' : 'submitted' }); setTeamReports(result.reports); }
    catch (error) { setTeamError(error instanceof Error ? error.message : '加载团队日报失败'); setTeamReports([]); }
    finally { setTeamLoading(false); }
  }, [canViewTeam, teamDate, user?.role]);

  useEffect(() => { void loadMine(); }, [loadMine]);
  useEffect(() => { if (tab === 'team') void loadTeam(); }, [loadTeam, tab]);

  const submit = async () => {
    if (!hasContent(items)) return;
    setSubmitting(true);
    try { const saved = await saveDailyReportDraft({ reportDate, version: report?.version, manualSummaryMd: '', riskLevel: 'normal', items }); const submitted = await submitDailyReport(saved.id); setReport(submitted); setItems(normalizeItems(submitted)); }
    finally { setSubmitting(false); }
  };

  const tabs = useMemo(() => [{ key: 'mine' as const, label: '我的日报', icon: FileClock, visible: true }, { key: 'team' as const, label: '团队日报', icon: Users, visible: canViewTeam }, { key: 'summary' as const, label: '总结归档', icon: Archive, visible: true }], [canViewTeam]);

  return <PageShell>
    <PageHeader title="日报" description="记录每天的工作、计划和需要协调的事项。" actions={<ActionButton onClick={() => tab === 'mine' ? void loadMine() : tab === 'team' ? void loadTeam() : undefined}><RefreshCw className="h-4 w-4" />刷新</ActionButton>} />
    <GlassPanel className="p-2"><div className="flex flex-wrap gap-2">{tabs.filter((item) => item.visible).map((item) => { const Icon = item.icon; return <button key={item.key} type="button" onClick={() => setTab(item.key)} className={`inline-flex items-center gap-2 rounded-button px-4 py-2.5 text-sm font-semibold ${tab === item.key ? 'bg-studio-primary text-white' : 'text-studio-text-secondary hover:bg-white/[0.06]'}`}><Icon className="h-4 w-4" />{item.label}</button>; })}</div></GlassPanel>
    {tab === 'mine' ? <div className="space-y-5"><GlassPanel className="flex flex-wrap items-center gap-4 p-5"><label className="block"><span className="mb-2 block text-sm text-studio-text-muted">记录类型</span><select value={entryType} onChange={(event) => setEntryType(event.target.value as EntryType)} className="rounded-button border border-studio-border-soft bg-studio-surface px-3 py-2 text-sm text-studio-text-primary"><option value="daily">日报</option><option value="monthly">月报</option><option value="yearly">年报</option></select></label>{entryType === 'daily' ? <span className="text-sm text-studio-text-muted">{loading ? '加载中...' : report ? '今日日报' : '今天还没有日报'}</span> : <span className="text-sm text-studio-text-muted">填写并提交个人{entryType === 'monthly' ? '月报' : '年报'}</span>}</GlassPanel>{entryType === 'daily' ? <DailyReportComposer status={report?.status || 'draft'} items={items} submitting={submitting} onItemsChange={setItems} onSubmit={() => void submit()} /> : <DailyReportSummaryForm kind={entryType} />}</div> : null}
    {tab === 'team' ? <DailyReportTeamBoard date={teamDate} reports={teamReports} loading={teamLoading} error={teamError} onDateChange={setTeamDate} onRefresh={loadTeam} onView={setDetail} /> : null}
    {tab === 'summary' ? <DailyReportSummaryArchive canViewArchive={canViewArchive} onView={setDetail} /> : null}
    <DailyReportDetailDrawer report={detail} onClose={() => setDetail(null)} />
  </PageShell>;
}
