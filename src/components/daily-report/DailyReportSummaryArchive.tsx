import { useCallback, useEffect, useState } from 'react';
import { Archive, Save } from 'lucide-react';
import { getSummaryArchive, getMonthlyRecord, getYearlyRecord, saveMonthlyRecord, saveYearlyRecord, type SummaryArchive, type MonthlyRecord, type YearlyRecord } from '../../api/dailyReports';
import { ActionButton, EmptyState, GlassPanel } from '../studio';

type Props = { canViewArchive: boolean };

function Field({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (value: string) => void; placeholder: string }) {
  return <label className="block"><span className="mb-2 block text-sm font-semibold text-studio-text-primary">{label}</span><textarea value={value} onChange={(event) => onChange(event.target.value)} rows={5} placeholder={placeholder} className="w-full resize-y rounded-card border border-studio-border-soft bg-white/[0.04] px-4 py-3 text-sm leading-6 text-studio-text-primary outline-none placeholder:text-studio-text-muted focus:border-studio-border-active" /></label>;
}

export default function DailyReportSummaryArchive({ canViewArchive }: Props) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [monthly, setMonthly] = useState<MonthlyRecord>({ year, month, work_summary_md: '', key_projects_md: '', issues_plan_md: '' });
  const [yearly, setYearly] = useState<YearlyRecord>({ year, annual_summary_md: '', achievements_md: '', shortcomings_md: '', next_year_plan_md: '' });
  const [archive, setArchive] = useState<SummaryArchive | null>(null);
  const [saving, setSaving] = useState<'monthly' | 'yearly' | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const requests: [Promise<MonthlyRecord>, Promise<YearlyRecord>] = [getMonthlyRecord(year, month), getYearlyRecord(year)];
      const [monthlyRecord, yearlyRecord] = await Promise.all(requests);
      setMonthly((current) => ({ ...current, ...monthlyRecord, year, month }));
      setYearly((current) => ({ ...current, ...yearlyRecord, year }));
      if (canViewArchive) setArchive(await getSummaryArchive(year));
    } finally {
      setLoading(false);
    }
  }, [canViewArchive, month, year]);

  useEffect(() => { void load(); }, [load]);

  const saveMonthly = async () => { setSaving('monthly'); try { setMonthly(await saveMonthlyRecord(year, month, monthly)); } finally { setSaving(null); } };
  const saveYearly = async () => { setSaving('yearly'); try { setYearly(await saveYearlyRecord(year, yearly)); } finally { setSaving(null); } };

  return <div className="space-y-5">
    <GlassPanel className="flex flex-wrap items-end gap-3 p-5">
      <label className="block"><span className="mb-2 block text-sm text-studio-text-muted">年份</span><input type="number" value={year} onChange={(event) => setYear(Number(event.target.value))} className="rounded-button border border-studio-border-soft bg-white/[0.04] px-3 py-2 text-sm text-studio-text-primary" /></label>
      <label className="block"><span className="mb-2 block text-sm text-studio-text-muted">月份</span><select value={month} onChange={(event) => setMonth(Number(event.target.value))} className="rounded-button border border-studio-border-soft bg-studio-surface px-3 py-2 text-sm text-studio-text-primary">{Array.from({ length: 12 }, (_, index) => <option key={index + 1} value={index + 1}>{index + 1} 月</option>)}</select></label>
      <ActionButton onClick={() => void load()} disabled={loading}>刷新</ActionButton>
    </GlassPanel>
    <div className="grid gap-5 lg:grid-cols-2">
      <GlassPanel className="space-y-4 p-5"><div className="flex items-center justify-between"><h2 className="text-base font-semibold text-studio-text-primary">月报</h2><ActionButton onClick={() => void saveMonthly()} disabled={saving !== null}><Save className="h-4 w-4" />{saving === 'monthly' ? '保存中' : '保存月报'}</ActionButton></div><Field label="工作总结" value={monthly.work_summary_md || ''} onChange={(value) => setMonthly((current) => ({ ...current, work_summary_md: value }))} placeholder="记录本月工作总结" /><Field label="重点项目" value={monthly.key_projects_md || ''} onChange={(value) => setMonthly((current) => ({ ...current, key_projects_md: value }))} placeholder="记录本月重点项目" /><Field label="问题与计划" value={monthly.issues_plan_md || ''} onChange={(value) => setMonthly((current) => ({ ...current, issues_plan_md: value }))} placeholder="记录问题和下一步计划" /></GlassPanel>
      <GlassPanel className="space-y-4 p-5"><div className="flex items-center justify-between"><h2 className="text-base font-semibold text-studio-text-primary">年报</h2><ActionButton onClick={() => void saveYearly()} disabled={saving !== null}><Save className="h-4 w-4" />{saving === 'yearly' ? '保存中' : '保存年报'}</ActionButton></div><Field label="年度总结" value={yearly.annual_summary_md || ''} onChange={(value) => setYearly((current) => ({ ...current, annual_summary_md: value }))} placeholder="记录年度总结" /><Field label="主要成果" value={yearly.achievements_md || ''} onChange={(value) => setYearly((current) => ({ ...current, achievements_md: value }))} placeholder="记录主要成果" /><Field label="经验不足" value={yearly.shortcomings_md || ''} onChange={(value) => setYearly((current) => ({ ...current, shortcomings_md: value }))} placeholder="记录经验和不足" /><Field label="下一年度计划" value={yearly.next_year_plan_md || ''} onChange={(value) => setYearly((current) => ({ ...current, next_year_plan_md: value }))} placeholder="记录下一年度计划" /></GlassPanel>
    </div>
    {canViewArchive ? <GlassPanel className="overflow-hidden"><div className="border-b border-studio-border-soft px-5 py-4"><h2 className="text-base font-semibold text-studio-text-primary">管理员总结归档</h2><p className="mt-1 text-sm text-studio-text-muted">查看全部成员的月报和年报。</p></div>{archive && (archive.monthly.length > 0 || archive.yearly.length > 0) ? <div className="grid gap-5 p-5 lg:grid-cols-2"><div><h3 className="mb-3 text-sm font-semibold text-studio-text-primary">月报</h3><div className="space-y-3">{archive.monthly.map((record) => <div key={record.id} className="rounded-card border border-studio-border-soft p-4"><p className="font-semibold text-studio-text-primary">{record.user_name || record.username} · {record.month} 月</p><p className="mt-2 whitespace-pre-wrap text-sm text-studio-text-secondary">{record.work_summary_md || '暂无内容'}</p></div>)}</div></div><div><h3 className="mb-3 text-sm font-semibold text-studio-text-primary">年报</h3><div className="space-y-3">{archive.yearly.map((record) => <div key={record.id} className="rounded-card border border-studio-border-soft p-4"><p className="font-semibold text-studio-text-primary">{record.user_name || record.username} · {record.year} 年</p><p className="mt-2 whitespace-pre-wrap text-sm text-studio-text-secondary">{record.annual_summary_md || '暂无内容'}</p></div>)}</div></div></div> : <div className="p-5"><EmptyState icon={Archive} title="暂无总结归档" description="当前年份还没有月报或年报。" /></div>}</GlassPanel> : null}
  </div>;
}
