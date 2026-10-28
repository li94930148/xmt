import { Save, Send } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { getMyDailyReport, saveDailyReportDraft, submitDailyReport, type DailyReport, type DailyReportItem } from '@/api/dailyReports';
import { clearSafeDraft, readSafeDraftValue, userSafeDraftKey, writeSafeDraft } from '@/platform/safe-draft';
import { useAuthStore } from '@/store';
import { useNetworkState } from '@/platform/network';
import { usePermission } from '@/hooks/usePermission';
import AccessDeniedState from '@/components/AccessDeniedState';
import { getMobileDailyReportStatusView } from '@/platform/mobile-daily-report-status';

const sections = [
  { key: 'today', title: '今日工作', placeholder: '记录今天完成或推进的工作' },
  { key: 'tomorrow', title: '明日计划', placeholder: '记录明天准备开展的工作' },
  { key: 'coordination', title: '需要协调事项', placeholder: '记录需要他人或团队协助的事项' },
] as const;

const reportDate = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Shanghai' });

function toItems(report: DailyReport | null): DailyReportItem[] {
  return sections.map((section, sortOrder) => {
    const item = report?.items.find((candidate) => candidate.sectionKey === section.key);
    return { id: item?.id, sectionKey: section.key, title: section.title, contentMd: item?.contentMd ?? '', sortOrder };
  });
}

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
    riskLevel: DailyReport['riskLevel'];
    items: DailyReportItem[];
  };
  baseline: DailyReportSnapshot | null;
  templateId: number | null;
  phase: 'pending' | 'safe-retry' | 'conflict' | 'saved';
  lastError: string;
};

function dailyReportRecoveryKey(userId: number | null, date: string) {
  return userId === null ? '' : `xmt:mobile-daily-report-draft-recovery:v1:${userId}:${date}`;
}

function readDraftSaveRecovery(key: string, userId: number | null, date: string): DraftSaveRecovery | null {
  if (userId === null || !key || typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(key);
    if (!raw) return null;
    const value = JSON.parse(raw) as DraftSaveRecovery;
    if (value?.schemaVersion !== 1 || value.userId !== userId || value.reportDate !== date
      || value.payload?.reportDate !== date || !Array.isArray(value.payload.items)
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
    || current.status !== 'draft' || current.id <= 0
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

export default function MobileDaily() {
  const userId = useAuthStore((state) => state.user?.id ?? null);
  return <MobileDailySession key={userId ?? 'signed-out'} userId={userId} />;
}

function MobileDailySession({ userId }: { userId: number | null }) {
  const draftKey = userSafeDraftKey(userId, `daily:${reportDate}`);
  const recoveryKey = dailyReportRecoveryKey(userId, reportDate);
  const [draftRecovery, setDraftRecovery] = useState<DraftSaveRecovery | null>(() => readDraftSaveRecovery(recoveryKey, userId, reportDate));
  const draftRecoveryRef = useRef(draftRecovery);
  const [report, setReport] = useState<DailyReport | null>(null);
  const [templateId, setTemplateId] = useState<number | null>(null);
  const [items, setItems] = useState<DailyReportItem[]>(() => draftRecovery?.payload.items.map((item) => ({ ...item })) ?? toItems(null));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const [loadError, setLoadError] = useState('');
  const [submissionNeedsVerification, setSubmissionNeedsVerification] = useState(false);
  const [verifyingSubmission, setVerifyingSubmission] = useState(false);
  const [verifyingDraft, setVerifyingDraft] = useState(false);
  const loadRequestSequence = useRef(0);
  const persistInFlight = useRef(false);
  const verifyDraftInFlight = useRef(false);
  const verifySubmissionInFlight = useRef(false);
  const networkState = useNetworkState();
  const { hasPermission, loading: permissionsLoading } = usePermission();
  const canSubmit = !permissionsLoading && hasPermission('report:daily:submit');
  const dailyStatus = getMobileDailyReportStatusView(report?.status, submissionNeedsVerification || verifyingSubmission);
  const draftWriteLocked = Boolean(draftRecovery && draftRecovery.phase !== 'saved');
  const readonly = dailyStatus.readOnly || submissionNeedsVerification || verifyingSubmission || verifyingDraft || draftWriteLocked || saving;

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
    try { if (recoveryKey) window.sessionStorage.removeItem(recoveryKey); } catch { /* best-effort cleanup; future writes still require read-only verification */ }
    draftRecoveryRef.current = null;
    setDraftRecovery(null);
  }, [recoveryKey]);

  const setDraftRecoveryPhase = useCallback((phase: DraftSaveRecovery['phase'], lastError?: string) => {
    const current = draftRecoveryRef.current;
    if (!current) return;
    persistDraftRecovery({ ...current, phase, lastError: lastError ?? current.lastError });
  }, [persistDraftRecovery]);

  const reconcileDraftRecovery = useCallback((currentReport: DailyReport | null, currentTemplateId: number | null) => {
    const recovery = draftRecoveryRef.current;
    if (!recovery) return;
    setReport(currentReport);
    setTemplateId(currentTemplateId);
    setItems(recovery.payload.items.map((item) => ({ ...item })));
    let phase: DraftSaveRecovery['phase'];
    if (expectedDraftMatches(currentReport, recovery)) phase = 'saved';
    else if (recovery.phase !== 'saved' && stableEqual(reportSnapshot(currentReport), recovery.baseline)) phase = 'safe-retry';
    else phase = 'conflict';
    persistDraftRecovery({ ...recovery, phase, lastError: phase === 'saved' ? '' : recovery.lastError });
    if (phase === 'saved') setNotice('服务器已确认草稿保存成功，尚未提交。可检查后再提交。');
    else if (phase === 'safe-retry') setNotice('服务器确认日报仍是保存前状态，尚未发现本次草稿写入。原内容已保留；如需继续，可显式使用同一载荷安全重试。');
    else setNotice('服务器日报与保存前状态及本次草稿均不一致。本地输入已保留，写入已锁定；请只读重新核实，不会自动覆盖。');
  }, [persistDraftRecovery]);

  const applyDraftReadResult = useCallback((result: Awaited<ReturnType<typeof getMyDailyReport>>) => {
    if (draftRecoveryRef.current) {
      reconcileDraftRecovery(result.report, result.template.id);
      return;
    }
    setReport(result.report);
    setTemplateId(result.template.id);
    const localDraft = draftKey ? readSafeDraftValue<DailyReportItem[]>(draftKey) : null;
    const reportReadOnly = getMobileDailyReportStatusView(result.report?.status).readOnly;
    const recovered = reportReadOnly ? null : localDraft;
    setItems(recovered ?? toItems(result.report));
    if (recovered) setNotice('已恢复本地草稿，请确认后保存或提交。');
    else if (reportReadOnly && localDraft) setNotice('日报当前为只读状态，本机未提交草稿未应用且仍保留在本机。');
  }, [draftKey, reconcileDraftRecovery]);

  const handleDraftWriteFailure = useCallback(async (error: unknown) => {
    const recovery = draftRecoveryRef.current;
    if (!recovery) return;
    const message = error instanceof Error ? error.message : '保存日报草稿失败';
    if (isKnownPreWriteRejection(error)) {
      clearDraftRecovery();
      setItems(recovery.payload.items.map((item) => ({ ...item })));
      setNotice(message);
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
      setNotice(`草稿保存结果仍无法确认（${message}；只读核实失败：${readMessage}）。编辑和重复保存已锁定，请重新核实。`);
    }
  }, [applyDraftReadResult, clearDraftRecovery, setDraftRecoveryPhase, userId]);

  const load = useCallback(async () => {
    const requestSequence = ++loadRequestSequence.current;
    if (permissionsLoading) return;
    if (!canSubmit || !draftKey) { setLoading(false); setNotice('当前账号没有填写日报的权限。'); return; }
    setLoading(true);
    setLoadError('');
    try {
      const result = await getMyDailyReport(reportDate);
      if (requestSequence !== loadRequestSequence.current || useAuthStore.getState().user?.id !== userId) return;
      applyDraftReadResult(result);
    } catch (error) {
      if (requestSequence !== loadRequestSequence.current || useAuthStore.getState().user?.id !== userId) return;
      const message = error instanceof Error ? error.message : '加载日报失败';
      if (draftRecoveryRef.current) {
        setDraftRecoveryPhase('pending', message);
        setNotice(`草稿保存结果仍无法确认（${message}）。编辑和重复保存已锁定，请重新核实。`);
      } else {
        setLoadError(message);
        setNotice(message);
      }
    } finally {
      if (requestSequence === loadRequestSequence.current && useAuthStore.getState().user?.id === userId) setLoading(false);
    }
  }, [applyDraftReadResult, canSubmit, draftKey, permissionsLoading, setDraftRecoveryPhase, userId]);

  useEffect(() => {
    void load();
    return () => { loadRequestSequence.current += 1; };
  }, [load]);
  useEffect(() => { if (canSubmit && draftKey && !readonly && !loading && !loadError) writeSafeDraft(draftKey, items); }, [canSubmit, draftKey, items, loadError, loading, readonly]);

  const verifySubmission = async () => {
    if (verifySubmissionInFlight.current) return;
    verifySubmissionInFlight.current = true;
    setVerifyingSubmission(true);
    try {
      const result = await getMyDailyReport(reportDate);
      if (useAuthStore.getState().user?.id !== userId) return;
      if (result.report) {
        setReport(result.report);
        setItems(toItems(result.report));
      }
      if (result.report?.status === 'submitted') {
        if (draftKey) clearSafeDraft(draftKey);
        setSubmissionNeedsVerification(false);
        setNotice('日报已成功提交，当前为只读状态。');
      } else if (result.report && (result.report.status === 'draft' || result.report.status === 'rejected')) {
        setSubmissionNeedsVerification(false);
        setNotice(`服务器当前状态为“${getMobileDailyReportStatusView(result.report.status).label}”，尚未确认提交成功；已保存内容已保留，可检查后重新提交。`);
      } else if (result.report) {
        setSubmissionNeedsVerification(false);
        setNotice(`服务器当前状态为“${getMobileDailyReportStatusView(result.report.status).label}”，已显示最新日报状态。`);
      } else {
        setSubmissionNeedsVerification(true);
        setNotice('暂时没有读取到今天的日报，提交结果仍无法确认。请重新核实状态；确认前不要重复提交。');
      }
    } catch (error) {
      if (useAuthStore.getState().user?.id === userId) {
        const message = error instanceof Error ? error.message : '读取失败';
        setSubmissionNeedsVerification(true);
        setNotice(`提交结果仍无法确认：${message}。请稍后重新核实状态；确认前不要重复提交。`);
      }
    } finally {
      verifySubmissionInFlight.current = false;
      setVerifyingSubmission(false);
    }
  };

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
        setNotice(`草稿保存结果仍无法确认（${message}）。编辑和重复保存已锁定，请稍后重新核实。`);
      }
    } finally {
      verifyDraftInFlight.current = false;
      setVerifyingDraft(false);
    }
  };

  const retryDraftSave = async () => {
    const recovery = draftRecoveryRef.current;
    if (persistInFlight.current || !recovery || recovery.phase !== 'safe-retry' || !canSubmit) return;
    if (networkState === 'offline') { setNotice('当前离线，无法安全重试草稿保存。'); return; }
    const pendingRecovery = { ...recovery, phase: 'pending' as const, lastError: '' };
    if (!persistDraftRecovery(pendingRecovery)) {
      setNotice('无法保存草稿恢复信息，因此尚未重试写入。请检查浏览器存储后重试。');
      return;
    }
    persistInFlight.current = true;
    setSaving(true);
    try {
      const saved = await saveDailyReportDraft(recovery.payload);
      if (useAuthStore.getState().user?.id !== userId) return;
      clearDraftRecovery();
      setReport(saved);
      setTemplateId(saved.templateId ?? recovery.templateId);
      setItems(toItems(saved));
      setNotice('草稿已保存；尚未提交。');
    } catch (error) {
      if (useAuthStore.getState().user?.id === userId) await handleDraftWriteFailure(error);
    } finally {
      persistInFlight.current = false;
      if (useAuthStore.getState().user?.id === userId) setSaving(false);
    }
  };

  const updateItems = (nextItems: DailyReportItem[]) => {
    if (draftRecoveryRef.current?.phase === 'saved') clearDraftRecovery();
    setItems(nextItems);
  };

  const persist = async (submit: boolean) => {
    const currentRecovery = draftRecoveryRef.current;
    if (persistInFlight.current || submissionNeedsVerification || verifyingSubmission || verifyingDraft
      || (currentRecovery && currentRecovery.phase !== 'saved')) return;
    if (!canSubmit || !draftKey) { setNotice('当前账号没有填写日报的权限。'); return; }
    if (submit && report && report.status !== 'draft' && report.status !== 'rejected') {
      setNotice('当前日报状态不可再次提交，请先核实最新状态。');
      return;
    }
    if (loadError) { setNotice('日报尚未成功加载，请先重试，避免覆盖已有内容。'); return; }
    if (!items.some((item) => item.contentMd.trim())) {
      setNotice('请至少填写一项内容');
      return;
    }
    if (networkState === 'offline') { setNotice('当前离线，内容已保存在本地草稿，恢复网络后再提交。'); return; }
    persistInFlight.current = true;
    setSaving(true);
    setNotice('');
    try {
      let saved: DailyReport;
      if (currentRecovery?.phase === 'saved') {
        if (!report || !expectedDraftMatches(report, currentRecovery)) {
          const conflict = { ...currentRecovery, phase: 'conflict' as const, lastError: '当前日报与已核实草稿不一致' };
          persistDraftRecovery(conflict);
          setNotice('当前日报已与已确认草稿不同，写入已锁定；请只读重新核实。');
          return;
        }
        if (!submit) {
          setNotice('草稿已保存');
          return;
        }
        saved = report;
        clearDraftRecovery();
      } else {
        const payload = {
          reportDate,
          // Version 0 asserts that no server report exists yet, closing the race between a read-only check and an explicit retry.
          version: report?.version ?? 0,
          manualSummaryMd: '',
          riskLevel: 'normal' as const,
          items: items.map((item) => ({ ...item })),
        };
        const recovery: DraftSaveRecovery = {
          schemaVersion: 1,
          userId: userId ?? -1,
          reportDate,
          payload,
          baseline: reportSnapshot(report),
          templateId,
          phase: 'pending',
          lastError: '',
        };
        if (!persistDraftRecovery(recovery)) {
          setNotice('无法在当前浏览器保存本次恢复信息，因此尚未发送草稿保存请求。请检查浏览器存储后重试。');
          return;
        }
        try {
          saved = await saveDailyReportDraft(payload);
          clearDraftRecovery();
          setReport(saved);
          setTemplateId(saved.templateId ?? templateId);
        } catch (error) {
          if (useAuthStore.getState().user?.id === userId) await handleDraftWriteFailure(error);
          return;
        }
      }
      if (useAuthStore.getState().user?.id !== userId) return;
      if (!submit) {
        setItems(toItems(saved));
        setNotice('草稿已保存');
        return;
      }
      try {
        const next = await submitDailyReport(saved.id);
        if (useAuthStore.getState().user?.id !== userId) return;
        setReport(next);
        setItems(toItems(next));
        setSubmissionNeedsVerification(false);
        if (draftKey) clearSafeDraft(draftKey);
        setNotice('日报已提交');
      } catch (submitError) {
        if (useAuthStore.getState().user?.id !== userId) return;
        const submitMessage = submitError instanceof Error ? submitError.message : '提交失败';
        try {
          const current = await getMyDailyReport(reportDate);
          if (useAuthStore.getState().user?.id !== userId) return;
          if (current.report) {
            setReport(current.report);
            setItems(toItems(current.report));
          }
          if (current.report?.status === 'submitted') {
            setSubmissionNeedsVerification(false);
            if (draftKey) clearSafeDraft(draftKey);
            setNotice('日报已成功提交，当前为只读状态。');
          } else if (current.report && (current.report.status === 'draft' || current.report.status === 'rejected')) {
            setSubmissionNeedsVerification(false);
            setNotice(`草稿已保存，但提交失败：${submitMessage}。服务器当前状态为“${getMobileDailyReportStatusView(current.report.status).label}”，可检查后重新提交。`);
          } else if (current.report) {
            setSubmissionNeedsVerification(false);
            setNotice(`提交后服务器状态为“${getMobileDailyReportStatusView(current.report.status).label}”，已显示最新日报状态。`);
          } else {
            setSubmissionNeedsVerification(true);
            setNotice('日报提交结果无法确认。请重新核实状态；确认前不要重复提交。');
          }
        } catch (readError) {
          if (useAuthStore.getState().user?.id !== userId) return;
          const readMessage = readError instanceof Error ? readError.message : '读取失败';
          setSubmissionNeedsVerification(true);
          setNotice(`草稿已保存，但提交结果无法确认：${submitMessage}；读取当前状态也失败（${readMessage}）。请重试读取状态，确认前不要重复提交。`);
        }
      }
    } catch (error) {
      if (useAuthStore.getState().user?.id === userId) setNotice(error instanceof Error ? error.message : '保存日报失败');
    } finally {
      persistInFlight.current = false;
      if (useAuthStore.getState().user?.id === userId) setSaving(false);
    }
  };

  if (!permissionsLoading && !canSubmit) return <AccessDeniedState title="暂时无法填写日报" description="请联系管理员分配日报提交权限。" />;

  return <div className="space-y-4">
    <div className="rounded-2xl border border-studio-border-soft bg-studio-surface p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold">{reportDate} · 我的日报</p>
        {!loading ? <span className={`shrink-0 rounded-full border px-2.5 py-1 text-xs font-medium ${
          report?.status === 'approved' ? 'border-studio-success/30 bg-studio-success-soft text-studio-success-contrast' :
          report?.status === 'rejected' ? 'border-studio-coral/30 bg-studio-coral/10 text-studio-coral-contrast' :
          report?.status === 'submitted' ? 'border-studio-primary/30 bg-studio-primary-soft text-studio-primary-contrast' :
          report?.status === 'draft' ? 'border-studio-amber/30 bg-studio-amber-soft text-studio-amber-contrast' :
          'border-studio-border-soft bg-studio-surface-soft text-studio-text-secondary'
        }`}>{dailyStatus.label}</span> : null}
      </div>
      {loading ? <p role="status" aria-live="polite" aria-atomic="true" className="mt-2 text-xs text-studio-text-muted">正在加载今日日报…</p> : <p className="mt-2 text-xs text-studio-text-muted">{dailyStatus.description}</p>}
      {report?.status === 'rejected' && report.reviewComment?.trim() ? <div className="mt-3 rounded-xl border border-studio-coral/30 bg-studio-coral/10 p-3">
        <p className="text-xs font-semibold text-studio-coral-contrast">审核意见</p>
        <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-studio-text-secondary">{report.reviewComment}</p>
      </div> : null}
    </div>
    {loadError ? <div className="rounded-2xl border border-studio-coral/30 bg-studio-coral/10 p-4"><p role="alert" className="text-sm text-studio-text-secondary">日报加载失败，当前不会保存未确认的数据：{loadError}</p><button type="button" disabled={loading} onClick={() => void load()} className="mt-3 min-h-10 text-sm font-semibold text-studio-primary-contrast">{loading ? '正在重试…' : '重试加载'}</button></div> : null}
    {sections.map((section) => {
      const item = items.find((candidate) => candidate.sectionKey === section.key);
      return <label key={section.key} className="block rounded-2xl border border-studio-border-soft bg-studio-surface p-4">
        <span className="mb-2 block text-sm font-semibold">{section.title}</span>
        <textarea value={item?.contentMd ?? ''} disabled={readonly || loading || loadError !== '' || permissionsLoading || !canSubmit} onChange={(event) => updateItems(items.map((candidate) => candidate.sectionKey === section.key ? { ...candidate, contentMd: event.target.value } : candidate))} placeholder={section.placeholder} className="min-h-28 w-full resize-y rounded-xl border border-studio-border-soft bg-studio-bg p-3 text-sm leading-6 outline-none placeholder:text-studio-text-muted focus:border-studio-cyan disabled:opacity-60" />
      </label>;
    })}
    {notice ? <div role={draftRecovery && draftRecovery.phase !== 'saved' ? 'alert' : 'status'} className="space-y-2 px-1 text-sm text-studio-text-secondary"><p>{notice}</p>{draftRecovery && draftRecovery.phase !== 'saved' ? <div className="flex flex-wrap gap-3"><button type="button" disabled={verifyingDraft || saving} onClick={() => void verifyDraftSave()} className="min-h-10 font-semibold text-studio-primary-contrast">{verifyingDraft ? '正在核实…' : '重新核实草稿状态'}</button>{draftRecovery.phase === 'safe-retry' ? <button type="button" disabled={saving || verifyingDraft || !canSubmit} onClick={() => void retryDraftSave()} className="min-h-10 font-semibold text-studio-primary-contrast">{saving ? '正在安全重试…' : '同载荷安全重试'}</button> : null}</div> : null}{submissionNeedsVerification ? <button type="button" disabled={verifyingSubmission} onClick={() => void verifySubmission()} className="min-h-10 font-semibold text-studio-primary-contrast">{verifyingSubmission ? '正在核实…' : '重新核实日报状态'}</button> : null}</div> : null}
    <div className="grid grid-cols-2 gap-3">
      <button type="button" disabled={readonly || saving || loading || Boolean(loadError) || permissionsLoading || !canSubmit} onClick={() => void persist(false)} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-studio-border-soft text-sm font-semibold disabled:opacity-50"><Save className="h-4 w-4" />保存草稿</button>
      <button type="button" disabled={readonly || saving || loading || Boolean(loadError) || permissionsLoading || !canSubmit} onClick={() => void persist(true)} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-studio-primary-button text-sm font-semibold text-white disabled:opacity-50"><Send className="h-4 w-4" />{verifyingDraft || verifyingSubmission ? '核实中…' : saving ? '处理中…' : submissionNeedsVerification ? '状态待核实' : '提交日报'}</button>
    </div>
  </div>;
}
