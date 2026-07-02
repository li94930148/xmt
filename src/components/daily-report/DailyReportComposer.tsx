import { Plus, Save, Send } from 'lucide-react';
import type { DailyReportItem, DailyReportRiskLevel, DailyReportStatus } from '../../api/dailyReports';
import { ActionButton, GlassPanel } from '../studio';
import { DailyReportRiskPill, DailyReportStatusPill } from './DailyReportStatusPill';

type Section = {
  key: string;
  title: string;
};

type DailyReportComposerProps = {
  reportId?: number;
  status?: DailyReportStatus;
  version?: number;
  updatedAt?: string;
  submittedAt?: string | null;
  reviewComment?: string;
  sections: Section[];
  items: DailyReportItem[];
  manualSummary: string;
  riskLevel: DailyReportRiskLevel;
  saving: boolean;
  submitting: boolean;
  onItemsChange: (items: DailyReportItem[]) => void;
  onSummaryChange: (value: string) => void;
  onRiskChange: (value: DailyReportRiskLevel) => void;
  onSave: () => void;
  onSubmit: () => void;
  onCreateDraft: () => void;
};

const riskOptions: Array<{ value: DailyReportRiskLevel; label: string }> = [
  { value: 'normal', label: '无风险' },
  { value: 'warning', label: '有风险' },
  { value: 'blocked', label: '阻塞' },
];

export default function DailyReportComposer({
  reportId,
  status = 'draft',
  version,
  updatedAt,
  submittedAt,
  reviewComment,
  sections,
  items,
  manualSummary,
  riskLevel,
  saving,
  submitting,
  onItemsChange,
  onSummaryChange,
  onRiskChange,
  onSave,
  onSubmit,
  onCreateDraft,
}: DailyReportComposerProps) {
  const readonly = status === 'submitted' || status === 'approved' || status === 'archived';

  const getItem = (sectionKey: string) =>
    items.find((item) => item.sectionKey === sectionKey) || { sectionKey, title: '', contentMd: '' };

  const updateItem = (sectionKey: string, contentMd: string) => {
    const nextItems = [...items];
    const index = nextItems.findIndex((item) => item.sectionKey === sectionKey);
    if (index >= 0) {
      nextItems[index] = { ...nextItems[index], contentMd };
    } else {
      nextItems.push({ sectionKey, contentMd, sortOrder: nextItems.length });
    }
    onItemsChange(nextItems);
  };

  return (
    <GlassPanel className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-studio-border-soft bg-white/[0.025] px-5 py-4">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <DailyReportStatusPill status={status} />
            <DailyReportRiskPill risk={riskLevel} />
            {version ? <span className="text-xs text-studio-text-muted">版本 {version}</span> : null}
          </div>
          <div className="flex flex-wrap gap-3 text-xs text-studio-text-muted">
            {updatedAt ? <span>最后更新：{updatedAt}</span> : null}
            {submittedAt ? <span>提交时间：{submittedAt}</span> : null}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {!reportId ? (
            <ActionButton onClick={onCreateDraft}>
              <Plus className="h-4 w-4" />
              新建日报
            </ActionButton>
          ) : null}
          <ActionButton onClick={onSave} disabled={readonly || saving}>
            <Save className="h-4 w-4" />
            {saving ? '保存中' : '保存草稿'}
          </ActionButton>
          <ActionButton onClick={onSubmit} variant="primary" disabled={!reportId || readonly || submitting}>
            <Send className="h-4 w-4" />
            {submitting ? '提交中' : '提交日报'}
          </ActionButton>
        </div>
      </div>

      {status === 'rejected' && reviewComment ? (
        <div className="border-b border-studio-coral/25 bg-studio-coral/10 px-5 py-3 text-sm text-[#FFC2CC]">
          已退回：{reviewComment}。可修改后重新提交。
        </div>
      ) : null}

      <div className="space-y-5 p-5">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_220px]">
          <label className="block">
            <span className="mb-2 block text-sm font-semibold text-studio-text-primary">手动总结</span>
            <textarea
              value={manualSummary}
              onChange={(event) => onSummaryChange(event.target.value)}
              disabled={readonly}
              rows={4}
              className="w-full resize-y rounded-card border border-studio-border-soft bg-white/[0.04] px-4 py-3 text-sm leading-6 text-studio-text-primary outline-none transition placeholder:text-studio-text-muted focus:border-studio-border-active disabled:opacity-70"
              placeholder="概括今天最重要的进展、问题或需要管理者关注的事项"
            />
          </label>

          <label className="block">
            <span className="mb-2 block text-sm font-semibold text-studio-text-primary">风险等级</span>
            <select
              value={riskLevel}
              onChange={(event) => onRiskChange(event.target.value as DailyReportRiskLevel)}
              disabled={readonly}
              className="w-full rounded-card border border-studio-border-soft bg-studio-surface px-4 py-3 text-sm text-studio-text-primary outline-none focus:border-studio-border-active disabled:opacity-70"
            >
              {riskOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          {sections.map((section) => {
            const item = getItem(section.key);
            return (
              <label key={section.key} className="block">
                <span className="mb-2 block text-sm font-semibold text-studio-text-primary">{section.title}</span>
                <textarea
                  value={item.contentMd || ''}
                  onChange={(event) => updateItem(section.key, event.target.value)}
                  disabled={readonly}
                  rows={5}
                  className="w-full resize-y rounded-card border border-studio-border-soft bg-white/[0.04] px-4 py-3 text-sm leading-6 text-studio-text-primary outline-none transition placeholder:text-studio-text-muted focus:border-studio-border-active disabled:opacity-70"
                  placeholder={`${section.title}...`}
                />
              </label>
            );
          })}
        </div>
      </div>
    </GlassPanel>
  );
}
