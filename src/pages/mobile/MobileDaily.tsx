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

export default function MobileDaily() {
  const userId = useAuthStore((state) => state.user?.id ?? null);
  return <MobileDailySession key={userId ?? 'signed-out'} userId={userId} />;
}

function MobileDailySession({ userId }: { userId: number | null }) {
  const draftKey = userSafeDraftKey(userId, `daily:${reportDate}`);
  const [report, setReport] = useState<DailyReport | null>(null);
  const [items, setItems] = useState<DailyReportItem[]>(() => toItems(null));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const [loadError, setLoadError] = useState('');
  const [submissionNeedsVerification, setSubmissionNeedsVerification] = useState(false);
  const [verifyingSubmission, setVerifyingSubmission] = useState(false);
  const loadRequestSequence = useRef(0);
  const persistInFlight = useRef(false);
  const verifySubmissionInFlight = useRef(false);
  const networkState = useNetworkState();
  const { hasPermission, loading: permissionsLoading } = usePermission();
  const canSubmit = !permissionsLoading && hasPermission('report:daily:submit');
  const dailyStatus = getMobileDailyReportStatusView(report?.status, submissionNeedsVerification || verifyingSubmission);
  const readonly = dailyStatus.readOnly || submissionNeedsVerification || verifyingSubmission;

  const load = useCallback(async () => {
    const requestSequence = ++loadRequestSequence.current;
    if (permissionsLoading) return;
    if (!canSubmit || !draftKey) { setLoading(false); setNotice('当前账号没有填写日报的权限。'); return; }
    setLoading(true);
    setLoadError('');
    try {
      const result = await getMyDailyReport(reportDate);
      if (requestSequence !== loadRequestSequence.current || useAuthStore.getState().user?.id !== userId) return;
      setReport(result.report);
      const localDraft = readSafeDraftValue<DailyReportItem[]>(draftKey);
      const reportReadOnly = getMobileDailyReportStatusView(result.report?.status).readOnly;
      const recovered = reportReadOnly ? null : localDraft;
      setItems(recovered ?? toItems(result.report));
      if (recovered) setNotice('已恢复本地草稿，请确认后保存或提交。');
      else if (reportReadOnly && localDraft) setNotice('日报当前为只读状态，本机未提交草稿未应用且仍保留在本机。');
    } catch (error) {
      if (requestSequence !== loadRequestSequence.current || useAuthStore.getState().user?.id !== userId) return;
      const message = error instanceof Error ? error.message : '加载日报失败';
      setLoadError(message);
      setNotice(message);
    } finally {
      if (requestSequence === loadRequestSequence.current && useAuthStore.getState().user?.id === userId) setLoading(false);
    }
  }, [canSubmit, draftKey, permissionsLoading, userId]);

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

  const persist = async (submit: boolean) => {
    if (persistInFlight.current || submissionNeedsVerification || verifyingSubmission) return;
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
      const saved = await saveDailyReportDraft({ reportDate, version: report?.version, manualSummaryMd: '', riskLevel: 'normal', items });
      if (useAuthStore.getState().user?.id !== userId) return;
      // Saving the draft commits a new server version even if the follow-up submit fails.
      // Keep that version so a retry does not send a stale optimistic-concurrency token.
      setReport(saved);
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
      <p className="mt-2 text-xs text-studio-text-muted">{loading ? '正在载入…' : dailyStatus.description}</p>
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
        <textarea value={item?.contentMd ?? ''} disabled={readonly || loading || loadError !== '' || permissionsLoading || !canSubmit} onChange={(event) => setItems((current) => current.map((candidate) => candidate.sectionKey === section.key ? { ...candidate, contentMd: event.target.value } : candidate))} placeholder={section.placeholder} className="min-h-28 w-full resize-y rounded-xl border border-studio-border-soft bg-studio-bg p-3 text-sm leading-6 outline-none placeholder:text-studio-text-muted focus:border-studio-cyan disabled:opacity-60" />
      </label>;
    })}
    {notice ? <div role="status" className="space-y-2 px-1 text-sm text-studio-text-secondary"><p>{notice}</p>{submissionNeedsVerification ? <button type="button" disabled={verifyingSubmission} onClick={() => void verifySubmission()} className="min-h-10 font-semibold text-studio-primary-contrast">{verifyingSubmission ? '正在核实…' : '重新核实日报状态'}</button> : null}</div> : null}
    <div className="grid grid-cols-2 gap-3">
      <button type="button" disabled={readonly || saving || loading || Boolean(loadError) || permissionsLoading || !canSubmit} onClick={() => void persist(false)} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-studio-border-soft text-sm font-semibold disabled:opacity-50"><Save className="h-4 w-4" />保存草稿</button>
      <button type="button" disabled={readonly || saving || loading || Boolean(loadError) || permissionsLoading || !canSubmit} onClick={() => void persist(true)} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-studio-primary-button text-sm font-semibold text-white disabled:opacity-50"><Send className="h-4 w-4" />{verifyingSubmission ? '核实中…' : saving ? '处理中…' : submissionNeedsVerification ? '状态待核实' : '提交日报'}</button>
    </div>
  </div>;
}
