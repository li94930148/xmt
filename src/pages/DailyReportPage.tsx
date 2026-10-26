import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ErrorState from '../components/common/ErrorState';
import { Archive, FileClock, RefreshCw, Users } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { useAuthStore, useAppStore } from '../store';
import { usePermission } from '../hooks/usePermission';
import { getMyDailyReport, getTeamDailyReports, saveDailyReportDraft, submitDailyReport, type DailyReport, type DailyReportItem, type SaveDailyReportDraftPayload } from '../api/dailyReports';
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
import { dailyReportStatusLabel } from '../components/daily-report/dailyReportStatusLabel';

type TabKey = 'mine' | 'team' | 'summary';
type EntryType = 'daily' | 'monthly' | 'yearly';
const fields = [{ key: 'today', title: '今日工作' }, { key: 'tomorrow', title: '明日计划' }, { key: 'coordination', title: '需要协调事项' }];
function today() { return new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Shanghai' }); }
function normalizeItems(report: DailyReport | null): DailyReportItem[] { return fields.map((field, index) => { const item = report?.items.find((entry) => entry.sectionKey === field.key); return { id: item?.id, sectionKey: field.key, title: field.title, contentMd: item?.contentMd || '', sortOrder: index }; }); }
function hasContent(items: DailyReportItem[]) { return items.some((item) => item.contentMd.trim()); }

type DailyReportSnapshot = {
  id: number;
  userId: number;
  reportDate: string;
  status: string;
  manualSummaryMd: string;
  riskLevel: string;
  version: number;
  teamId: number | null;
  templateId: number | null;
  autoSummary: unknown;
  submittedAt: string | null;
  reviewedAt: string | null;
  reviewedBy: number | null;
  reviewComment: string;
  items: Array<{
    sectionKey: string;
    title: string;
    contentMd: string;
    sourceType: string | null;
    sourceId: number | null;
    sortOrder: number;
    meta: unknown;
  }>;
};

type DraftSaveRecovery = {
  schemaVersion: 1;
  userId: number;
  reportDate: string;
  payload: {
    reportDate: string;
    version?: number;
    manualSummaryMd: string;
    riskLevel: SaveDailyReportDraftPayload['riskLevel'];
    items: DailyReportItem[];
  };
  baseline: DailyReportSnapshot | null;
  templateId: number | null;
  phase: 'pending' | 'safe-retry' | 'conflict' | 'saved';
  lastError: string;
};

function dailyReportRecoveryKey(userId: number, reportDate: string) {
  return `xmt:daily-report-draft-recovery:v1:${userId}:${reportDate}`;
}

function readDraftSaveRecovery(key: string, userId: number | null, reportDate: string): DraftSaveRecovery | null {
  if (userId === null || typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(key);
    if (!raw) return null;
    const value = JSON.parse(raw) as DraftSaveRecovery;
    if (value?.schemaVersion !== 1 || value.userId !== userId || value.reportDate !== reportDate
      || value.payload?.reportDate !== reportDate || !Array.isArray(value.payload.items)
      || !['pending', 'safe-retry', 'conflict', 'saved'].includes(value.phase)) {
      window.sessionStorage.removeItem(key);
      return null;
    }
    return value;
  } catch {
    return null;
  }
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, stableValue(entry)]));
  }
  return value;
}

function stableEqual(left: unknown, right: unknown) {
  return JSON.stringify(stableValue(left)) === JSON.stringify(stableValue(right));
}

function reportSnapshot(report: DailyReport | null): DailyReportSnapshot | null {
  if (!report) return null;
  return {
    id: report.id,
    userId: report.userId,
    reportDate: report.reportDate,
    status: report.status,
    manualSummaryMd: report.manualSummaryMd || '',
    riskLevel: report.riskLevel,
    version: report.version,
    teamId: report.teamId ?? null,
    templateId: report.templateId ?? null,
    autoSummary: report.autoSummary ?? null,
    submittedAt: report.submittedAt ?? null,
    reviewedAt: report.reviewedAt ?? null,
    reviewedBy: report.reviewedBy ?? null,
    reviewComment: report.reviewComment || '',
    items: (report.items || []).map((item, index) => ({
      sectionKey: String(item.sectionKey || ''),
      title: String(item.title || ''),
      contentMd: String(item.contentMd || ''),
      sourceType: item.sourceType ?? null,
      sourceId: item.sourceId ?? null,
      sortOrder: Number.isFinite(item.sortOrder) ? Number(item.sortOrder) : index,
      meta: item.meta ?? null,
    })).map((item, index) => ({ item, index }))
      .sort((left, right) => left.item.sortOrder - right.item.sortOrder || left.index - right.index)
      .map(({ item }) => item),
  };
}

function expectedDraftMatches(report: DailyReport | null, recovery: DraftSaveRecovery) {
  const current = reportSnapshot(report);
  if (!current || current.userId !== recovery.userId || current.reportDate !== recovery.reportDate
    || current.status !== 'draft'
    || current.id <= 0
    || (recovery.baseline && current.id !== recovery.baseline.id)
    || current.version !== (recovery.baseline?.version ?? 0) + 1
    || current.manualSummaryMd !== recovery.payload.manualSummaryMd.trim()
    || current.riskLevel !== recovery.payload.riskLevel
    || current.teamId !== (recovery.baseline?.teamId ?? null)
    || current.templateId !== recovery.templateId
    || !stableEqual(current.autoSummary, recovery.baseline?.autoSummary ?? null)
    || current.submittedAt !== (recovery.baseline?.submittedAt ?? null)
    || current.reviewedAt !== (recovery.baseline?.reviewedAt ?? null)
    || current.reviewedBy !== (recovery.baseline?.reviewedBy ?? null)
    || current.reviewComment !== (recovery.baseline?.reviewComment ?? '')) return false;
  const expectedItems = recovery.payload.items.map((item, index) => ({
    sectionKey: String(item.sectionKey || '').trim(),
    title: String(item.title || '').trim(),
    contentMd: String(item.contentMd || '').trim(),
    sourceType: null,
    sourceId: null,
    sortOrder: Number.isFinite(item.sortOrder) ? Number(item.sortOrder) : index,
    meta: null,
  })).map((item, index) => ({ item, index }))
    .sort((left, right) => left.item.sortOrder - right.item.sortOrder || left.index - right.index)
    .map(({ item }) => item);
  return stableEqual(current.items, expectedItems);
}

function isKnownPreWriteRejection(error: unknown) {
  const status = (error as { status?: number } | null)?.status;
  return status === 400 || status === 401 || status === 403 || status === 409;
}

export default function DailyReportPage() {
  const userId = useAuthStore((state) => state.user?.id ?? null);
  return <DailyReportSession key={userId ?? 'signed-out'} userId={userId} />;
}

function DailyReportSession({ userId }: { userId: number | null }) {
  const location = useLocation();
  const user = useAuthStore((state) => state.user);
  const addNotification = useAppStore((state) => state.addNotification);
  const { hasPermission, loading: permissionsLoading } = usePermission();
  const canViewTeam = hasPermission('report:daily:view_team');
  const canViewArchive = hasPermission('report:daily:archive');
  const canViewOwnDailyArchive = canViewArchive || hasPermission('report:daily:submit');
  const reportDate = today();
  const recoveryKey = userId === null ? '' : dailyReportRecoveryKey(userId, reportDate);
  const [draftRecovery, setDraftRecovery] = useState<DraftSaveRecovery | null>(() => readDraftSaveRecovery(recoveryKey, userId, reportDate));
  const draftRecoveryRef = useRef(draftRecovery);
  const [tab, setTab] = useState<TabKey>(location.pathname.endsWith('/team') ? 'team' : location.pathname.endsWith('/summary') ? 'summary' : 'mine');
  const [entryType, setEntryType] = useState<EntryType>('daily');
  const [report, setReport] = useState<DailyReport | null>(null);
  const [canCreateDaily, setCanCreateDaily] = useState(false);
  const [reportTemplateId, setReportTemplateId] = useState<number | null>(null);
  const [items, setItems] = useState<DailyReportItem[]>(() => draftRecovery?.payload.items.map((item) => ({ ...item })) || normalizeItems(null));
  const [loading, setLoading] = useState(true);
  const [mineError, setMineError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const submitInFlight = useRef(false);
  const verifyDraftInFlight = useRef(false);
  const [verifyingDraft, setVerifyingDraft] = useState(false);
  const verifySubmissionInFlight = useRef(false);
  const mineRequestSequenceRef = useRef(0);
  const teamRequestSequenceRef = useRef(0);
  const [submissionNotice, setSubmissionNotice] = useState('');
  const [submissionNeedsVerification, setSubmissionNeedsVerification] = useState(false);
  const [verifyingSubmission, setVerifyingSubmission] = useState(false);
  const [teamDate, setTeamDate] = useState(today());
  const [teamReports, setTeamReports] = useState<DailyReport[]>([]);
  const [teamReportsQueryKey, setTeamReportsQueryKey] = useState('');
  const [teamLoading, setTeamLoading] = useState(false);
  const [teamError, setTeamError] = useState('');
  const [detail, setDetail] = useState<DailyReport | null>(null);
  const canSubmitDaily = !permissionsLoading && hasPermission('report:daily:submit') && canCreateDaily;
  const teamStatus = user?.role === 'admin' || user?.role === 'director' ? 'all' : 'submitted';
  const teamQueryKey = `${user?.id ?? 'anonymous'}:${teamDate}:${teamStatus}`;

  const persistDraftRecovery = useCallback((value: DraftSaveRecovery) => {
    try {
      if (!recoveryKey) return false;
      window.sessionStorage.setItem(recoveryKey, JSON.stringify(value));
    } catch {
      return false;
    }
    draftRecoveryRef.current = value;
    setDraftRecovery(value);
    return true;
  }, [recoveryKey]);

  const clearDraftRecovery = useCallback(() => {
    try { if (recoveryKey) window.sessionStorage.removeItem(recoveryKey); } catch { /* best-effort cleanup; the next read still verifies before any write */ }
    draftRecoveryRef.current = null;
    setDraftRecovery(null);
  }, [recoveryKey]);

  const setDraftRecoveryPhase = useCallback((phase: DraftSaveRecovery['phase'], lastError?: string) => {
    const current = draftRecoveryRef.current;
    if (!current) return;
    persistDraftRecovery({ ...current, phase, lastError: lastError ?? current.lastError });
  }, [persistDraftRecovery]);

  const reconcileDraftRecovery = useCallback((currentReport: DailyReport | null, canCreate: boolean, templateId: number | null) => {
    const recovery = draftRecoveryRef.current;
    if (!recovery) return;
    setReport(currentReport);
    setReportTemplateId(currentReport?.templateId ?? templateId);
    setItems(recovery.payload.items.map((item) => ({ ...item })));
    setCanCreateDaily(canCreate);
    let phase: DraftSaveRecovery['phase'];
    if (expectedDraftMatches(currentReport, recovery)) phase = 'saved';
    else if (recovery.phase !== 'saved' && stableEqual(reportSnapshot(currentReport), recovery.baseline)) phase = 'safe-retry';
    else phase = 'conflict';
    persistDraftRecovery({ ...recovery, phase, lastError: phase === 'saved' ? '' : recovery.lastError });
  }, [persistDraftRecovery]);

  const draftRecoveryNotice = draftRecovery?.phase === 'pending'
    ? `草稿保存结果仍无法确认（${draftRecovery.lastError || '读取结果暂不可用'}）。编辑和重复提交已锁定；可只读重新核实。`
    : draftRecovery?.phase === 'safe-retry'
      ? '服务器确认日报仍是保存前状态，尚未发现本次草稿写入。原载荷已保留；如需继续，可显式使用同一载荷安全重试。'
      : draftRecovery?.phase === 'conflict'
        ? '服务器日报与保存前状态及本次草稿均不一致。本地输入已保留，写入已锁定；请只读重新核实，不会自动覆盖。'
        : draftRecovery?.phase === 'saved'
          ? '服务器已确认草稿保存成功，尚未提交。点击“提交日报”只会提交已确认草稿，不会重复保存。'
          : '';

  const applyDraftReadResult = useCallback((result: Awaited<ReturnType<typeof getMyDailyReport>>) => {
    if (draftRecoveryRef.current) {
      reconcileDraftRecovery(result.report, result.canCreate === true, result.template.id);
      setReportTemplateId(result.template.id);
      return;
    }
    setReport(result.report);
    setItems(normalizeItems(result.report));
    setCanCreateDaily(result.canCreate === true);
    setReportTemplateId(result.template.id);
  }, [reconcileDraftRecovery]);

  const updateItems = useCallback((nextItems: DailyReportItem[]) => {
    if (draftRecoveryRef.current?.phase === 'saved') clearDraftRecovery();
    setItems(nextItems);
  }, [clearDraftRecovery]);

  const loadMine = useCallback(async () => {
    if (submitInFlight.current) return;
    const requestId = ++mineRequestSequenceRef.current;
    const isCurrentRequest = () => requestId === mineRequestSequenceRef.current
      && useAuthStore.getState().user?.id === userId;
    setLoading(true); setMineError('');
    try {
      const result = await getMyDailyReport(reportDate);
      if (!isCurrentRequest()) return;
      applyDraftReadResult(result);
    }
    catch (error) {
      if (isCurrentRequest()) {
        if (draftRecoveryRef.current) {
          setDraftRecoveryPhase('pending', error instanceof Error ? error.message : '只读核实失败');
          setMineError('');
          setItems(draftRecoveryRef.current.payload.items.map((item) => ({ ...item })));
        } else setMineError(error instanceof Error ? error.message : '加载日报失败');
      }
    }
    finally { if (isCurrentRequest()) setLoading(false); }
  }, [applyDraftReadResult, reportDate, setDraftRecoveryPhase, userId]);
  const loadTeam = useCallback(async () => {
    const requestId = ++teamRequestSequenceRef.current;
    if (!canViewTeam) return;
    setTeamLoading(true); setTeamError('');
    try {
      const result = await getTeamDailyReports({ date: teamDate, status: teamStatus });
      if (requestId !== teamRequestSequenceRef.current) return;
      setTeamReports(result.reports);
      setTeamReportsQueryKey(teamQueryKey);
    }
    catch (error) { if (requestId === teamRequestSequenceRef.current) setTeamError(error instanceof Error ? error.message : '加载团队日报失败'); }
    finally { if (requestId === teamRequestSequenceRef.current) setTeamLoading(false); }
  }, [canViewTeam, teamDate, teamQueryKey, teamStatus]);

  useEffect(() => {
    void loadMine();
    return () => { mineRequestSequenceRef.current += 1; };
  }, [loadMine]);
  useEffect(() => { if (tab === 'team') void loadTeam(); }, [loadTeam, tab]);

  const verifyDraftSave = async () => {
    if (verifyDraftInFlight.current || !draftRecoveryRef.current) return;
    verifyDraftInFlight.current = true;
    setVerifyingDraft(true);
    try {
      const result = await getMyDailyReport(reportDate);
      if (useAuthStore.getState().user?.id !== userId) return;
      applyDraftReadResult(result);
    } catch (error) {
      if (useAuthStore.getState().user?.id === userId) {
        const message = error instanceof Error ? error.message : '只读核实失败';
        setDraftRecoveryPhase('pending', message);
        const recovery = draftRecoveryRef.current;
        if (recovery) setItems(recovery.payload.items.map((item) => ({ ...item })));
      }
    } finally {
      verifyDraftInFlight.current = false;
      setVerifyingDraft(false);
    }
  };

  const handleDraftWriteFailure = async (error: unknown) => {
    const recovery = draftRecoveryRef.current;
    if (!recovery) return;
    const message = error instanceof Error ? error.message : '保存日报草稿失败';
    if (isKnownPreWriteRejection(error)) {
      clearDraftRecovery();
      setItems(recovery.payload.items.map((item) => ({ ...item })));
      addNotification({ title: '提交日报失败', message, type: 'error' });
      return;
    }

    setDraftRecoveryPhase('pending', message);
    try {
      const result = await getMyDailyReport(reportDate);
      if (useAuthStore.getState().user?.id !== userId) return;
      applyDraftReadResult(result);
    } catch (readError) {
      if (useAuthStore.getState().user?.id !== userId) return;
      const readMessage = readError instanceof Error ? readError.message : '只读核实失败';
      setDraftRecoveryPhase('pending', `${message}；只读核实失败：${readMessage}`);
      setMineError('');
      setItems(recovery.payload.items.map((item) => ({ ...item })));
    }
  };

  const verifySubmission = async () => {
    if (verifySubmissionInFlight.current) return;
    verifySubmissionInFlight.current = true;
    setVerifyingSubmission(true);
    try {
      const result = await getMyDailyReport(reportDate);
      if (useAuthStore.getState().user?.id !== userId) return;
      if (result.report) {
        setReport(result.report);
        setItems(normalizeItems(result.report));
      }
      setCanCreateDaily(result.canCreate === true);
      if (result.report?.status === 'submitted') {
        setSubmissionNeedsVerification(false);
        setSubmissionNotice('');
        addNotification({ title: '提交状态已核实', message: '今日日报已成功提交。', type: 'success' });
      } else if (result.report && (result.report.status === 'draft' || result.report.status === 'rejected')) {
        setSubmissionNeedsVerification(false);
        setSubmissionNotice(`服务器当前状态为“${dailyReportStatusLabel(result.report.status)}”，尚未确认提交成功；已保存内容已保留，可检查后重新提交。`);
      } else if (result.report) {
        setSubmissionNeedsVerification(false);
        setSubmissionNotice(`服务器当前状态为“${dailyReportStatusLabel(result.report.status)}”；已显示最新日报状态。`);
      } else {
        setSubmissionNeedsVerification(true);
        setSubmissionNotice('暂时没有读取到今天的日报，提交结果仍无法确认。请重新核实状态；确认前不要重复提交。');
      }
    } catch (error) {
      if (useAuthStore.getState().user?.id === userId) {
        const message = error instanceof Error ? error.message : '读取失败';
        setSubmissionNeedsVerification(true);
        setSubmissionNotice(`提交结果仍无法确认：${message}。请稍后重新核实状态；确认前不要重复提交。`);
      }
    } finally {
      verifySubmissionInFlight.current = false;
      setVerifyingSubmission(false);
    }
  };

  const submit = async () => {
    const currentRecovery = draftRecoveryRef.current;
    if (submitInFlight.current || submissionNeedsVerification || (currentRecovery && currentRecovery.phase !== 'saved')) return;
    if (!canSubmitDaily) {
      addNotification({ title: '当前日报为只读', message: '如需填写或提交，请联系管理员开通日报权限。', type: 'warning' });
      return;
    }
    if (report && report.status !== 'draft' && report.status !== 'rejected') return;
    if (!hasContent(items)) {
      addNotification({ title: '日报尚未填写', message: '请至少填写一项日报内容后再提交。', type: 'warning' });
      return;
    }
    submitInFlight.current = true;
    setSubmitting(true);
    setSubmissionNotice('');
    let savedDraft: DailyReport | null = null;
    try {
      if (currentRecovery?.phase === 'saved') {
        if (!report || !expectedDraftMatches(report, currentRecovery)) {
          setDraftRecoveryPhase('conflict', '当前日报已与已确认草稿不同，请只读重新核实。');
          return;
        }
        savedDraft = report;
        clearDraftRecovery();
      } else {
        const payload: SaveDailyReportDraftPayload = {
          reportDate,
          version: report?.version,
          manualSummaryMd: '',
          riskLevel: 'normal',
          items: items.map((item) => ({ ...item })),
        };
        const recovery: DraftSaveRecovery = {
          schemaVersion: 1,
          userId: userId ?? -1,
          reportDate,
          payload: { ...payload, items: payload.items.map((item) => ({ ...item })) },
          baseline: reportSnapshot(report),
          templateId: reportTemplateId,
          phase: 'pending',
          lastError: '',
        };
        if (!persistDraftRecovery(recovery)) {
          addNotification({ title: '日报未保存', message: '无法在当前浏览器保存本次恢复信息，因此尚未发送草稿保存请求。请检查浏览器存储后重试。', type: 'error' });
          return;
        }
        try {
          savedDraft = await saveDailyReportDraft(payload);
          clearDraftRecovery();
          setReport(savedDraft);
        } catch (error) {
          await handleDraftWriteFailure(error);
          return;
        }
      }

      try {
        const submitted = await submitDailyReport(savedDraft.id);
        setReport(submitted);
        setItems(normalizeItems(submitted));
        setSubmissionNeedsVerification(false);
        addNotification({ title: '提交成功', message: '今日日报已提交。', type: 'success' });
      } catch (error) {
      const message = error instanceof Error ? error.message : '日报未提交，请重试。';
        setReport(savedDraft);
        try {
          const current = await getMyDailyReport(reportDate);
          if (useAuthStore.getState().user?.id !== userId) return;
          if (current.report) {
            setReport(current.report);
            setItems(normalizeItems(current.report));
          }
          setCanCreateDaily(current.canCreate === true);
          if (current.report?.status === 'submitted') {
            setSubmissionNeedsVerification(false);
            setSubmissionNotice('');
            addNotification({ title: '提交状态已核实', message: '今日日报已成功提交。', type: 'success' });
          } else if (current.report && (current.report.status === 'draft' || current.report.status === 'rejected')) {
            setSubmissionNeedsVerification(false);
            setSubmissionNotice(`日报草稿已保存，但提交失败：${message} 服务器当前状态为“${dailyReportStatusLabel(current.report.status)}”，已保存内容已保留，可检查后重新提交。`);
          } else {
            setSubmissionNeedsVerification(true);
            setSubmissionNotice('日报提交请求未能确认，且暂时无法读取到当前日报。请重新核实状态；确认前不要重复提交。');
          }
        } catch (readError) {
          if (useAuthStore.getState().user?.id !== userId) return;
          const readMessage = readError instanceof Error ? readError.message : '读取失败';
          setItems(normalizeItems(savedDraft));
          setSubmissionNeedsVerification(true);
          setSubmissionNotice(`日报草稿已保存，但提交结果无法确认：${message}；读取当前状态也失败（${readMessage}）。请重试读取状态，确认前不要重复提交。`);
        }
      }
    }
    finally { submitInFlight.current = false; setSubmitting(false); }
  };

  const retrySameDraft = async () => {
    const recovery = draftRecoveryRef.current;
    if (submitInFlight.current || !recovery || recovery.phase !== 'safe-retry' || !canSubmitDaily) return;
    submitInFlight.current = true;
    setSubmitting(true);
    try {
      const saved = await saveDailyReportDraft(recovery.payload);
      const confirmed = { ...recovery, phase: 'saved' as const, lastError: '' };
      persistDraftRecovery(confirmed);
      setReport(saved);
      setReportTemplateId(saved.templateId ?? reportTemplateId);
      setItems(recovery.payload.items.map((item) => ({ ...item })));
      setSubmissionNotice('');
    } catch (error) {
      await handleDraftWriteFailure(error);
    } finally {
      submitInFlight.current = false;
      setSubmitting(false);
    }
  };

  const tabs = useMemo(() => [{ key: 'mine' as const, label: '我的日报', icon: FileClock, visible: true }, { key: 'team' as const, label: '团队日报', icon: Users, visible: canViewTeam }, { key: 'summary' as const, label: '总结归档', icon: Archive, visible: true }], [canViewTeam]);
  const draftSaveLocked = Boolean(draftRecovery && draftRecovery.phase !== 'saved');
  const composerLocked = draftSaveLocked || verifyingDraft || submissionNeedsVerification || verifyingSubmission;

  return <ReactBitsPageScene page="dailyReport"><PageShell>
    <PageHeader title={<ReactBitsHeadingSlot>日报</ReactBitsHeadingSlot>} description="记录每天的工作、计划和需要协调的事项。" actions={<ActionButton disabled={submitting || verifyingSubmission || verifyingDraft} onClick={() => tab === 'mine' ? draftSaveLocked ? void verifyDraftSave() : submissionNeedsVerification ? void verifySubmission() : void loadMine() : tab === 'team' ? void loadTeam() : undefined}><RefreshCw className="h-4 w-4" />{verifyingDraft || verifyingSubmission ? '核实中' : draftSaveLocked ? '核实草稿' : submissionNeedsVerification ? '核实状态' : '刷新'}</ActionButton>} />
    <ReactBitsNavigationSlot semantic="page-tabs"><GlassPanel className="p-2"><div className="flex flex-wrap gap-2">{tabs.filter((item) => item.visible).map((item) => { const Icon = item.icon; return <button key={item.key} type="button" onClick={() => setTab(item.key)} className={`inline-flex items-center gap-2 rounded-button px-4 py-2.5 text-sm font-semibold ${tab === item.key ? 'bg-studio-primary-button text-white shadow-glow-primary' : 'text-studio-text-secondary hover:bg-studio-surface-soft'}`}><Icon className="h-4 w-4" />{item.label}</button>; })}</div></GlassPanel></ReactBitsNavigationSlot>
    {tab === 'mine' ? <ReactBitsRevealSlot className="block"><ReactBitsCardSlot semantic="report-card" className="space-y-5"><GlassPanel className="flex flex-wrap items-center gap-4 p-5"><label className="block"><span className="mb-2 block text-sm text-studio-text-muted">记录类型</span><select value={entryType} onChange={(event) => setEntryType(event.target.value as EntryType)} className="rounded-button border border-studio-border-soft bg-studio-surface px-3 py-2 text-sm text-studio-text-primary"><option value="daily">日报</option><option value="monthly">月报</option><option value="yearly">年报</option></select></label>{entryType === 'daily' ? <span className="text-sm text-studio-text-muted">{loading ? '加载中...' : report ? '今日日报' : '今天还没有日报'}</span> : <span className="text-sm text-studio-text-muted">填写并提交个人{entryType === 'monthly' ? '月报' : '年报'}</span>}</GlassPanel>{entryType === 'daily' ? mineError ? <ErrorState title="日报加载失败" description={mineError} onRetry={() => void loadMine()} /> : loading ? <GlassPanel className="p-6 text-center text-sm text-studio-text-muted">正在加载今日日报…</GlassPanel> : <>
      {draftRecovery && draftRecoveryNotice ? <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-studio-amber/30 bg-studio-amber/10 px-4 py-3 text-sm leading-6 text-studio-amber-contrast"><span>{draftRecoveryNotice}</span><div className="flex flex-wrap gap-2">{draftRecovery.phase === 'safe-retry' ? <ActionButton disabled={submitting || verifyingDraft || !canSubmitDaily} onClick={() => void retrySameDraft()}>{submitting ? '正在安全重试…' : '同载荷安全重试'}</ActionButton> : null}{draftRecovery.phase !== 'saved' ? <ActionButton disabled={submitting || verifyingDraft} onClick={() => void verifyDraftSave()}>{verifyingDraft ? '正在核实…' : '重新核实草稿状态'}</ActionButton> : null}</div></div> : null}
      {submissionNotice ? <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-studio-amber/30 bg-studio-amber/10 px-4 py-3 text-sm leading-6 text-studio-amber-contrast"><span>{submissionNotice}</span>{submissionNeedsVerification ? <ActionButton disabled={verifyingSubmission} onClick={() => void verifySubmission()}>{verifyingSubmission ? '正在核实…' : '重新核实日报状态'}</ActionButton> : null}</div> : null}
      {permissionsLoading ? <GlassPanel className="p-6 text-center text-sm text-studio-text-secondary">正在确认日报权限…</GlassPanel> : !report && !canSubmitDaily && !draftRecovery ? <GlassPanel className="p-5"><EmptyState icon={FileClock} title="当前没有日报记录" description="当前账号未开通填写日报权限；已有日报仍可查看。" /></GlassPanel> : <DailyReportComposer status={composerLocked ? null : report?.status || 'draft'} canEdit={canSubmitDaily} items={items} submitting={submitting} submissionLocked={composerLocked} busyLabel={verifyingDraft || verifyingSubmission ? '核实中' : undefined} onItemsChange={updateItems} onSubmit={() => void submit()} />}
    </> : <DailyReportSummaryForm kind={entryType} />}</ReactBitsCardSlot></ReactBitsRevealSlot> : null}
    {tab === 'team' ? permissionsLoading ? <GlassPanel className="p-6 text-center text-sm text-studio-text-secondary">正在确认团队日报权限…</GlassPanel> : canViewTeam ? <div data-testid="team-daily-report-board"><DailyReportTeamBoard date={teamDate} reports={teamReportsQueryKey === teamQueryKey ? teamReports : []} loading={teamLoading} error={teamError} stale={teamReportsQueryKey === teamQueryKey && teamReports.length > 0} onDateChange={setTeamDate} onRefresh={loadTeam} onView={setDetail} /></div> : <GlassPanel className="p-5"><EmptyState icon={Users} title="当前账号无权查看团队日报" description="如需查看，请联系管理员开通团队日报权限。" actionLabel="返回我的日报" onAction={() => setTab('mine')} /></GlassPanel> : null}
    {tab === 'summary' ? permissionsLoading ? <GlassPanel className="p-6 text-center text-sm text-studio-text-secondary">正在确认归档权限…</GlassPanel> : <DailyReportSummaryArchive key={`${user?.id ?? 'anonymous'}:${canViewArchive ? 'archive' : 'own'}:${canViewOwnDailyArchive ? 'daily' : 'none'}`} canViewArchive={canViewArchive} canViewOwnDaily={canViewOwnDailyArchive} onView={setDetail} /> : null}
    <DailyReportDetailDrawer report={detail} onClose={() => setDetail(null)} />
  </PageShell></ReactBitsPageScene>;
}
