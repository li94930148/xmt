import BaseModal from '../common/BaseModal';
import type { MonthlyRecord, YearlyRecord } from '../../api/dailyReports';

type SummaryKind = 'monthly' | 'yearly';
type SummaryRecord = MonthlyRecord | YearlyRecord;

function displayDate(value?: string | null) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('zh-CN', { hour12: false });
}

function valueOrEmpty(value?: string | null) {
  return value?.trim() ? value : '未填写';
}

export default function SummaryArchiveDetailModal({ kind, record, onClose }: { kind: SummaryKind; record: SummaryRecord | null; onClose: () => void }) {
  const monthly = kind === 'monthly';
  const fields = monthly
    ? [
      ['工作总结', (record as MonthlyRecord | null)?.work_summary_md],
      ['重点项目', (record as MonthlyRecord | null)?.key_projects_md],
      ['问题与计划', (record as MonthlyRecord | null)?.issues_plan_md],
    ]
    : [
      ['年度总结', (record as YearlyRecord | null)?.annual_summary_md],
      ['主要成果', (record as YearlyRecord | null)?.achievements_md],
      ['经验不足', (record as YearlyRecord | null)?.shortcomings_md],
      ['下一年度计划', (record as YearlyRecord | null)?.next_year_plan_md],
    ];
  const period = monthly ? `${(record as MonthlyRecord | null)?.year ?? ''} 年 ${(record as MonthlyRecord | null)?.month ?? ''} 月` : `${record?.year ?? ''} 年`;
  const author = record?.user_name || record?.username || '成员';

  return <BaseModal open={Boolean(record)} onClose={onClose} title={monthly ? '月报详情' : '年报详情'} description={`${author} · ${period}`} size="xl">
    <dl className="grid gap-3 rounded-card border border-studio-border-soft bg-white/[0.025] p-4 text-sm sm:grid-cols-2">
      <div><dt className="text-studio-text-muted">提交人</dt><dd className="mt-1 font-medium text-studio-text-primary">{author}</dd></div>
      <div><dt className="text-studio-text-muted">所属期间</dt><dd className="mt-1 font-medium text-studio-text-primary">{period}</dd></div>
      <div><dt className="text-studio-text-muted">提交时间</dt><dd className="mt-1 text-studio-text-secondary">{displayDate(record?.created_at)}</dd></div>
      <div><dt className="text-studio-text-muted">最后更新时间</dt><dd className="mt-1 text-studio-text-secondary">{displayDate(record?.updated_at)}</dd></div>
    </dl>
    <div className="mt-5 space-y-4">
      {fields.map(([label, value]) => <section key={label} className="rounded-card border border-studio-border-soft bg-white/[0.035] p-4"><h3 className="text-sm font-semibold text-studio-text-primary">{label}</h3><p className="mt-2 whitespace-pre-wrap break-words text-sm leading-7 text-studio-text-secondary">{valueOrEmpty(value)}</p></section>)}
    </div>
  </BaseModal>;
}
