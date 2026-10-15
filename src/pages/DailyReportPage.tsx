import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ErrorState from '../components/common/ErrorState';
import { Archive, FileClock, RefreshCw, Users } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { useAuthStore, useAppStore } from '../store';
import { usePermission } from '../hooks/usePermission';
import { getMyDailyReport, getTeamDailyReports, saveDailyReportDraft, submitDailyReport, type DailyReport, type DailyReportItem } from '../api/dailyReports';
import { ActionButton, EmptyState, GlassPanel, PageHeader, PageShell } from '../components/studio';
import DailyReportComposer from '../components/daily-report/DailyReportComposer';
import DailyReportSummaryForm from '../components/daily-report/DailyReportSummaryForm';
import DailyReportTeamBoard from '../components/daily-report/DailyReportTeamBoard';
import DailyReportSummaryArchive from '../components/daily-report/DailyReportSummaryArchive';
import DailyReportDetailDrawer from '../components/daily-report/DailyReportDetailDrawer';
import { ReactBitsPageScene } from '../features/reactbits-appearance/slots/ReactBitsPageScene';
import { ReactBitsHeadingSlot } from '../features/reactbits-appearance/slots/ReactBitsHeadingSlot';
import { ReactBitsNavigationSlot } from '../features/reactbits-appearance/slots/ReactBitsNavigationSlot';
import { ReactBitsCardSlot } from '../features/reactbits-appearance/ReactBitsCardSlot';
import { ReactBitsRevealSlot } from '../features/reactbits-appearance/ReactBitsRevealSlot';

type TabKey = 'mine' | 'team' | 'summary';
type EntryType = 'daily' | 'monthly' | 'yearly';
const fields = [{ key: 'today', title: '今日工作' }, { key: 'tomorrow', title: '明日计划' }, { key: 'coordination', title: '需要协调事项' }];
function today() { return new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Shanghai' }); }
function normalizeItems(report: DailyReport | null): DailyReportItem[] { return fields.map((field, index) => { const item = report?.items.find((entry) => entry.sectionKey === field.key); return { id: item?.id, sectionKey: field.key, title: field.title, contentMd: item?.contentMd || '', sortOrder: index }; }); }
function hasContent(items: DailyReportItem[]) { return items.some((item) => item.contentMd.trim()); }

export default function DailyReportPage() {
  const location = useLocation();
  const user = useAuthStore((state) => state.user);
  const addNotification = useAppStore((state) => state.addNotification);
  const { hasPermission, loading: permissionsLoading } = usePermission();
  const canViewTeam = hasPermission('report:daily:view_team');
  const canViewArchive = hasPermission('report:daily:archive');
  const canViewOwnDailyArchive = canViewArchive || hasPermission('report:daily:submit');
  const [tab, setTab] = useState<TabKey>(location.pathname.endsWith('/team') ? 'team' : location.pathname.endsWith('/summary') ? 'summary' : 'mine');
  const [entryType, setEntryType] = useState<EntryType>('daily');
  const [report, setReport] = useState<DailyReport | null>(null);
  const [canCreateDaily, setCanCreateDaily] = useState(false);
  const [items, setItems] = useState<DailyReportItem[]>(normalizeItems(null));
  const [loading, setLoading] = useState(true);
  const [mineError, setMineError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const submitInFlight = useRef(false);
  const [submissionNotice, setSubmissionNotice] = useState('');
  const [teamDate, setTeamDate] = useState(today());
  const [teamReports, setTeamReports] = useState<DailyReport[]>([]);
  const [teamLoading, setTeamLoading] = useState(false);
  const [teamError, setTeamError] = useState('');
  const [detail, setDetail] = useState<DailyReport | null>(null);
  const reportDate = today();
  const canSubmitDaily = !permissionsLoading && hasPermission('report:daily:submit') && canCreateDaily;

  const loadMine = useCallback(async () => {
    if (submitInFlight.current) return;
    setLoading(true); setMineError('');
    try { const result = await getMyDailyReport(reportDate); setReport(result.report); setItems(normalizeItems(result.report)); setCanCreateDaily(result.canCreate === true); }
    catch (error) { setMineError(error instanceof Error ? error.message : '加载日报失败'); }
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
    if (submitInFlight.current) return;
    if (!canSubmitDaily) {
      addNotification({ title: '当前日报为只读', message: '如需填写或提交，请联系管理员开通日报权限。', type: 'warning' });
      return;
    }
    if (!hasContent(items)) {
      addNotification({ title: '日报尚未填写', message: '请至少填写一项日报内容后再提交。', type: 'warning' });
      return;
    }
    submitInFlight.current = true;
    setSubmitting(true);
    setSubmissionNotice('');
    let savedDraft: DailyReport | null = null;
    try {
      savedDraft = await saveDailyReportDraft({ reportDate, version: report?.version, manualSummaryMd: '', riskLevel: 'normal', items });
      // Draft save is a confirmed server write; keep its version for a safe submit retry.
      setReport(savedDraft);
      const submitted = await submitDailyReport(savedDraft.id);
      setReport(submitted);
      setItems(normalizeItems(submitted));
      addNotification({ title: '提交成功', message: '今日日报已提交。', type: 'success' });
    }
    catch (error) {
      const message = error instanceof Error ? error.message : '日报未提交，请重试。';
      if (savedDraft) {
        const notice = `日报草稿已保存，但提交失败：${message} 当前草稿版本已保留，可再次点击“提交日报”重试。`;
        setReport(savedDraft);
        setSubmissionNotice(notice);
      } else {
        addNotification({ title: '提交日报失败', message, type: 'error' });
      }
    }
    finally { submitInFlight.current = false; setSubmitting(false); }
  };

  const tabs = useMemo(() => [{ key: 'mine' as const, label: '我的日报', icon: FileClock, visible: true }, { key: 'team' as const, label: '团队日报', icon: Users, visible: canViewTeam }, { key: 'summary' as const, label: '总结归档', icon: Archive, visible: true }], [canViewTeam]);

  return <ReactBitsPageScene page="dailyReport"><PageShell>
    <PageHeader title={<ReactBitsHeadingSlot>日报</ReactBitsHeadingSlot>} description="记录每天的工作、计划和需要协调的事项。" actions={<ActionButton disabled={submitting} onClick={() => tab === 'mine' ? void loadMine() : tab === 'team' ? void loadTeam() : undefined}><RefreshCw className="h-4 w-4" />刷新</ActionButton>} />
    <ReactBitsNavigationSlot semantic="page-tabs"><GlassPanel className="p-2"><div className="flex flex-wrap gap-2">{tabs.filter((item) => item.visible).map((item) => { const Icon = item.icon; return <button key={item.key} type="button" onClick={() => setTab(item.key)} className={`inline-flex items-center gap-2 rounded-button px-4 py-2.5 text-sm font-semibold ${tab === item.key ? 'bg-studio-primary-button text-white shadow-glow-primary' : 'text-studio-text-secondary hover:bg-studio-surface-soft'}`}><Icon className="h-4 w-4" />{item.label}</button>; })}</div></GlassPanel></ReactBitsNavigationSlot>
    {tab === 'mine' ? <ReactBitsRevealSlot className="block"><ReactBitsCardSlot semantic="report-card" className="space-y-5"><GlassPanel className="flex flex-wrap items-center gap-4 p-5"><label className="block"><span className="mb-2 block text-sm text-studio-text-muted">记录类型</span><select value={entryType} onChange={(event) => setEntryType(event.target.value as EntryType)} className="rounded-button border border-studio-border-soft bg-studio-surface px-3 py-2 text-sm text-studio-text-primary"><option value="daily">日报</option><option value="monthly">月报</option><option value="yearly">年报</option></select></label>{entryType === 'daily' ? <span className="text-sm text-studio-text-muted">{loading ? '加载中...' : report ? '今日日报' : '今天还没有日报'}</span> : <span className="text-sm text-studio-text-muted">填写并提交个人{entryType === 'monthly' ? '月报' : '年报'}</span>}</GlassPanel>{entryType === 'daily' ? mineError ? <ErrorState title="日报加载失败" description={mineError} onRetry={() => void loadMine()} /> : loading ? <GlassPanel className="p-6 text-center text-sm text-studio-text-muted">正在加载今日日报…</GlassPanel> : <>
      {submissionNotice ? <div role="alert" className="rounded-xl border border-studio-amber/30 bg-studio-amber/10 px-4 py-3 text-sm leading-6 text-studio-amber-contrast">{submissionNotice}</div> : null}
      {permissionsLoading ? <GlassPanel className="p-6 text-center text-sm text-studio-text-secondary">正在确认日报权限…</GlassPanel> : !report && !canSubmitDaily ? <GlassPanel className="p-5"><EmptyState icon={FileClock} title="当前没有日报记录" description="当前账号未开通填写日报权限；已有日报仍可查看。" /></GlassPanel> : <DailyReportComposer status={report?.status || 'draft'} canEdit={canSubmitDaily} items={items} submitting={submitting} onItemsChange={setItems} onSubmit={() => void submit()} />}
    </> : <DailyReportSummaryForm kind={entryType} />}</ReactBitsCardSlot></ReactBitsRevealSlot> : null}
    {tab === 'team' ? permissionsLoading ? <GlassPanel className="p-6 text-center text-sm text-studio-text-secondary">正在确认团队日报权限…</GlassPanel> : canViewTeam ? <DailyReportTeamBoard date={teamDate} reports={teamReports} loading={teamLoading} error={teamError} onDateChange={setTeamDate} onRefresh={loadTeam} onView={setDetail} /> : <GlassPanel className="p-5"><EmptyState icon={Users} title="当前账号无权查看团队日报" description="如需查看，请联系管理员开通团队日报权限。" actionLabel="返回我的日报" onAction={() => setTab('mine')} /></GlassPanel> : null}
    {tab === 'summary' ? permissionsLoading ? <GlassPanel className="p-6 text-center text-sm text-studio-text-secondary">正在确认归档权限…</GlassPanel> : <DailyReportSummaryArchive canViewArchive={canViewArchive} canViewOwnDaily={canViewOwnDailyArchive} onView={setDetail} /> : null}
    <DailyReportDetailDrawer report={detail} onClose={() => setDetail(null)} />
  </PageShell></ReactBitsPageScene>;
}
