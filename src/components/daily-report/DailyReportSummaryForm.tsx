import { useEffect, useState } from 'react';
import { Send } from 'lucide-react';
import { getMonthlyRecord, getYearlyRecord, saveMonthlyRecord, saveYearlyRecord, type MonthlyRecord, type YearlyRecord } from '../../api/dailyReports';
import { ActionButton, GlassPanel } from '../studio';

type Props = { kind: 'monthly' | 'yearly' };

function Field({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (value: string) => void; placeholder: string }) {
  return <label className="block"><span className="mb-2 block text-sm font-semibold text-studio-text-primary">{label}</span><textarea value={value} onChange={(event) => onChange(event.target.value)} rows={5} placeholder={placeholder} className="w-full resize-y rounded-card border border-studio-border-soft bg-white/[0.04] px-4 py-3 text-sm leading-6 text-studio-text-primary outline-none placeholder:text-studio-text-muted focus:border-studio-border-active" /></label>;
}

export default function DailyReportSummaryForm({ kind }: Props) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [monthly, setMonthly] = useState<MonthlyRecord>({ year, month, work_summary_md: '', key_projects_md: '', issues_plan_md: '', display_content_md: '' });
  const [yearly, setYearly] = useState<YearlyRecord>({ year, annual_summary_md: '', achievements_md: '', shortcomings_md: '', next_year_plan_md: '', display_content_md: '' });
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    const request = kind === 'monthly' ? getMonthlyRecord(year, month) : getYearlyRecord(year);
    void request.then((record) => {
      if (!active) return;
      if (kind === 'monthly') setMonthly((current) => ({ ...current, ...record, year, month }));
      else setYearly((current) => ({ ...current, ...record, year }));
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [kind, month, year]);

  const submit = async () => {
    setSubmitting(true);
    try {
      if (kind === 'monthly') setMonthly(await saveMonthlyRecord(year, month, monthly));
      else setYearly(await saveYearlyRecord(year, yearly));
    } finally { setSubmitting(false); }
  };

  return <GlassPanel className="space-y-4 p-5">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="flex flex-wrap gap-3">
        <label className="block"><span className="mb-2 block text-sm text-studio-text-muted">年份</span><input type="number" value={year} onChange={(event) => setYear(Number(event.target.value))} className="w-28 rounded-button border border-studio-border-soft bg-white/[0.04] px-3 py-2 text-sm text-studio-text-primary" /></label>
        {kind === 'monthly' ? <label className="block"><span className="mb-2 block text-sm text-studio-text-muted">月份</span><select value={month} onChange={(event) => setMonth(Number(event.target.value))} className="rounded-button border border-studio-border-soft bg-studio-surface px-3 py-2 text-sm text-studio-text-primary">{Array.from({ length: 12 }, (_, index) => <option key={index + 1} value={index + 1}>{index + 1} 月</option>)}</select></label> : null}
      </div>
      <ActionButton onClick={() => void submit()} variant="primary" disabled={loading || submitting}><Send className="h-4 w-4" />{submitting ? '提交中' : kind === 'monthly' ? '提交月报' : '提交年报'}</ActionButton>
    </div>
    {kind === 'monthly' ? <div className="grid gap-5 md:grid-cols-2"><Field label="工作总结" value={monthly.work_summary_md || ''} onChange={(value) => setMonthly((current) => ({ ...current, work_summary_md: value }))} placeholder="记录本月工作总结" /><Field label="重点项目" value={monthly.key_projects_md || ''} onChange={(value) => setMonthly((current) => ({ ...current, key_projects_md: value }))} placeholder="记录本月重点项目" /><Field label="问题与计划" value={monthly.issues_plan_md || ''} onChange={(value) => setMonthly((current) => ({ ...current, issues_plan_md: value }))} placeholder="记录问题和下一步计划" /></div> : <div className="grid gap-5 md:grid-cols-2"><Field label="年度总结" value={yearly.annual_summary_md || ''} onChange={(value) => setYearly((current) => ({ ...current, annual_summary_md: value }))} placeholder="记录年度总结" /><Field label="主要成果" value={yearly.achievements_md || ''} onChange={(value) => setYearly((current) => ({ ...current, achievements_md: value }))} placeholder="记录主要成果" /><Field label="经验不足" value={yearly.shortcomings_md || ''} onChange={(value) => setYearly((current) => ({ ...current, shortcomings_md: value }))} placeholder="记录经验和不足" /><Field label="下一年度计划" value={yearly.next_year_plan_md || ''} onChange={(value) => setYearly((current) => ({ ...current, next_year_plan_md: value }))} placeholder="记录下一年度计划" /></div>}
  </GlassPanel>;
}
