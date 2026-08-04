import { Send } from 'lucide-react';
import type { DailyReportItem, DailyReportStatus } from '../../api/dailyReports';
import { ActionButton, GlassPanel } from '../studio';
import { DailyReportStatusPill } from './DailyReportStatusPill';
import DailyReportRichSection from './DailyReportRichSection';

type DailyReportComposerProps = {
  status?: DailyReportStatus;
  items: DailyReportItem[];
  submitting: boolean;
  onItemsChange: (items: DailyReportItem[]) => void;
  onSubmit: () => void;
};

const fields = [
  { key: 'today', title: '今日工作', placeholder: '记录今天完成或推进的工作' },
  { key: 'tomorrow', title: '明日计划', placeholder: '记录明天准备开展的工作' },
  { key: 'coordination', title: '需要协调事项', placeholder: '记录需要他人或团队协助的事项' },
] as const;

export default function DailyReportComposer({ status = 'draft', items, submitting, onItemsChange, onSubmit }: DailyReportComposerProps) {
  const readonly = status === 'approved' || status === 'archived';
  const getItem = (key: string) => items.find((item) => item.sectionKey === key);
  const update = (key: string, contentMd: string) => {
    const next = fields.map((field, index) => {
      const current = getItem(field.key);
      return field.key === key
        ? { ...current, sectionKey: field.key, title: field.title, contentMd, sortOrder: index }
        : current || { sectionKey: field.key, title: field.title, contentMd: '', sortOrder: index };
    });
    onItemsChange(next);
  };

  return (
    <GlassPanel className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-studio-border-soft px-5 py-4">
        <DailyReportStatusPill status={status} />
        <div className="flex flex-wrap gap-2">
          <ActionButton onClick={onSubmit} variant="primary" disabled={readonly || submitting}>
            <Send className="h-4 w-4" />
            {submitting ? '提交中' : '提交日报'}
          </ActionButton>
        </div>
      </div>
      {status === 'rejected' ? <p className="border-b border-studio-coral/25 bg-studio-coral/10 px-5 py-3 text-sm text-[#FFC2CC]">日报已退回，请修改后重新提交。</p> : null}
      <div className="grid gap-5 p-5">
        {fields.map((field) => {
          const item = getItem(field.key);
          return (
            <label key={field.key} className="block">
              <span className="mb-2 block text-sm font-semibold text-studio-text-primary">{field.title}</span>
              <DailyReportRichSection value={item?.contentMd || ''} onChange={(value) => update(field.key, value)} disabled={readonly} placeholder={field.placeholder} />
            </label>
          );
        })}
      </div>
    </GlassPanel>
  );
}
