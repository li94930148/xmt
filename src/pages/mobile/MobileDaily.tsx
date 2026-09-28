import { Save, Send } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
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
  const userId = useAuthStore((state) => state.user?.id);
  const draftKey = userSafeDraftKey(userId, `daily:${reportDate}`);
  const [report, setReport] = useState<DailyReport | null>(null);
  const [items, setItems] = useState<DailyReportItem[]>(() => toItems(null));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const [loadError, setLoadError] = useState('');
  const networkState = useNetworkState();
  const { hasPermission, loading: permissionsLoading } = usePermission();
  const canSubmit = !permissionsLoading && hasPermission('report:daily:submit');
  const dailyStatus = getMobileDailyReportStatusView(report?.status);
  const readonly = dailyStatus.readOnly;

  const load = useCallback(async () => {
    if (permissionsLoading) return;
    if (!canSubmit || !draftKey) { setLoading(false); setNotice('当前账号没有填写日报的权限。'); return; }
    setLoading(true);
    setLoadError('');
    try {
      const result = await getMyDailyReport(reportDate);
      setReport(result.report);
      const localDraft = readSafeDraftValue<DailyReportItem[]>(draftKey);
      const reportReadOnly = getMobileDailyReportStatusView(result.report?.status).readOnly;
      const recovered = reportReadOnly ? null : localDraft;
      setItems(recovered ?? toItems(result.report));
      if (recovered) setNotice('已恢复本地草稿，请确认后保存或提交。');
      else if (reportReadOnly && localDraft) setNotice('日报当前为只读状态，本机未提交草稿未应用且仍保留在本机。');
    } catch (error) {
      const message = error instanceof Error ? error.message : '加载日报失败';
      setLoadError(message);
      setNotice(message);
    } finally {
      setLoading(false);
    }
  }, [canSubmit, draftKey, permissionsLoading]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { if (canSubmit && draftKey && !readonly && !loading && !loadError) writeSafeDraft(draftKey, items); }, [canSubmit, draftKey, items, loadError, loading, readonly]);

  const persist = async (submit: boolean) => {
    if (!canSubmit || !draftKey) { setNotice('当前账号没有填写日报的权限。'); return; }
    if (loadError) { setNotice('日报尚未成功加载，请先重试，避免覆盖已有内容。'); return; }
    if (!items.some((item) => item.contentMd.trim())) {
      setNotice('请至少填写一项内容');
      return;
    }
    if (networkState === 'offline') { setNotice('当前离线，内容已保存在本地草稿，恢复网络后再提交。'); return; }
    setSaving(true);
    setNotice('');
    try {
      const saved = await saveDailyReportDraft({ reportDate, version: report?.version, manualSummaryMd: '', riskLevel: 'normal', items });
      // Saving the draft commits a new server version even if the follow-up submit fails.
      // Keep that version so a retry does not send a stale optimistic-concurrency token.
      setReport(saved);
      const next = submit ? await submitDailyReport(saved.id) : saved;
      setReport(next);
      setItems(toItems(next));
      clearSafeDraft(draftKey);
      setNotice(submit ? '日报已提交' : '草稿已保存');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '保存日报失败');
    } finally {
      setSaving(false);
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
    {loadError ? <div className="rounded-2xl border border-studio-coral/30 bg-studio-coral/10 p-4"><p role="alert" className="text-sm text-studio-text-secondary">日报加载失败，当前不会保存未确认的数据：{loadError}</p><button type="button" disabled={loading} onClick={() => void load()} className="mt-3 min-h-10 text-sm font-semibold text-studio-primary">{loading ? '正在重试…' : '重试加载'}</button></div> : null}
    {sections.map((section) => {
      const item = items.find((candidate) => candidate.sectionKey === section.key);
      return <label key={section.key} className="block rounded-2xl border border-studio-border-soft bg-studio-surface p-4">
        <span className="mb-2 block text-sm font-semibold">{section.title}</span>
        <textarea value={item?.contentMd ?? ''} disabled={readonly || loading || loadError !== '' || permissionsLoading || !canSubmit} onChange={(event) => setItems((current) => current.map((candidate) => candidate.sectionKey === section.key ? { ...candidate, contentMd: event.target.value } : candidate))} placeholder={section.placeholder} className="min-h-28 w-full resize-y rounded-xl border border-studio-border-soft bg-studio-bg p-3 text-sm leading-6 outline-none placeholder:text-studio-text-muted focus:border-studio-cyan disabled:opacity-60" />
      </label>;
    })}
    {notice ? <p role="status" className="px-1 text-sm text-studio-text-secondary">{notice}</p> : null}
    <div className="grid grid-cols-2 gap-3">
      <button type="button" disabled={readonly || saving || loading || Boolean(loadError) || permissionsLoading || !canSubmit} onClick={() => void persist(false)} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-studio-border-soft text-sm font-semibold disabled:opacity-50"><Save className="h-4 w-4" />保存草稿</button>
      <button type="button" disabled={readonly || saving || loading || Boolean(loadError) || permissionsLoading || !canSubmit} onClick={() => void persist(true)} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-studio-primary text-sm font-semibold text-white disabled:opacity-50"><Send className="h-4 w-4" />{saving ? '处理中…' : '提交日报'}</button>
    </div>
  </div>;
}
