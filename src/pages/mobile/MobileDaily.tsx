import { Save, Send } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { getMyDailyReport, saveDailyReportDraft, submitDailyReport, type DailyReport, type DailyReportItem } from '@/api/dailyReports';

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
  const [report, setReport] = useState<DailyReport | null>(null);
  const [items, setItems] = useState<DailyReportItem[]>(() => toItems(null));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const readonly = report?.status === 'approved' || report?.status === 'archived';

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await getMyDailyReport(reportDate);
      setReport(result.report);
      setItems(toItems(result.report));
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '加载日报失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const persist = async (submit: boolean) => {
    if (!items.some((item) => item.contentMd.trim())) {
      setNotice('请至少填写一项内容');
      return;
    }
    setSaving(true);
    setNotice('');
    try {
      const saved = await saveDailyReportDraft({ reportDate, version: report?.version, manualSummaryMd: '', riskLevel: 'normal', items });
      const next = submit ? await submitDailyReport(saved.id) : saved;
      setReport(next);
      setItems(toItems(next));
      setNotice(submit ? '日报已提交' : '草稿已保存');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '保存日报失败');
    } finally {
      setSaving(false);
    }
  };

  return <div className="space-y-4">
    <div className="rounded-2xl border border-studio-border-soft bg-studio-surface p-4">
      <p className="text-sm font-semibold">{reportDate} · 我的日报</p>
      <p className="mt-1 text-xs text-studio-text-muted">{loading ? '正在载入…' : report?.status === 'submitted' ? '已提交，仍可继续查看' : '填写后可先保存草稿'}</p>
    </div>
    {sections.map((section) => {
      const item = items.find((candidate) => candidate.sectionKey === section.key);
      return <label key={section.key} className="block rounded-2xl border border-studio-border-soft bg-studio-surface p-4">
        <span className="mb-2 block text-sm font-semibold">{section.title}</span>
        <textarea value={item?.contentMd ?? ''} disabled={readonly || loading} onChange={(event) => setItems((current) => current.map((candidate) => candidate.sectionKey === section.key ? { ...candidate, contentMd: event.target.value } : candidate))} placeholder={section.placeholder} className="min-h-28 w-full resize-y rounded-xl border border-studio-border-soft bg-studio-bg p-3 text-sm leading-6 outline-none placeholder:text-studio-text-muted focus:border-studio-cyan disabled:opacity-60" />
      </label>;
    })}
    {notice ? <p role="status" className="px-1 text-sm text-studio-text-secondary">{notice}</p> : null}
    <div className="grid grid-cols-2 gap-3">
      <button type="button" disabled={readonly || saving || loading} onClick={() => void persist(false)} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-studio-border-soft text-sm font-semibold disabled:opacity-50"><Save className="h-4 w-4" />保存草稿</button>
      <button type="button" disabled={readonly || saving || loading} onClick={() => void persist(true)} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-studio-primary text-sm font-semibold text-white disabled:opacity-50"><Send className="h-4 w-4" />{saving ? '处理中…' : '提交日报'}</button>
    </div>
  </div>;
}
