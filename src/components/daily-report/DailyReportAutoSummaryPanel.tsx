import { Wand2 } from 'lucide-react';
import type { DailyReportItem, GenerateDraftResponse } from '../../api/dailyReports';
import { ActionButton, EmptyState, GlassPanel } from '../studio';

type DailyReportAutoSummaryPanelProps = {
  loading: boolean;
  result: GenerateDraftResponse | null;
  onGenerate: () => void;
  onApply: (items: DailyReportItem[]) => void;
};

const sourceLabels: Record<string, string> = {
  topic: '选题',
  production: '创作',
  publishing: '发布',
  unknown: '未知来源',
};

export default function DailyReportAutoSummaryPanel({
  loading,
  result,
  onGenerate,
  onApply,
}: DailyReportAutoSummaryPanelProps) {
  const suggestions = result?.suggestions || [];

  return (
    <GlassPanel className="p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-studio-text-primary">自动草稿</h2>
          <p className="mt-1 text-sm text-studio-text-muted">只读取系统已有记录，不生成虚构内容。</p>
        </div>
        <ActionButton onClick={onGenerate} disabled={loading}>
          <Wand2 className="h-4 w-4" />
          {loading ? '生成中' : '生成自动草稿'}
        </ActionButton>
      </div>

      {!result ? (
        <EmptyState icon={Wand2} title="暂无自动草稿" description="点击生成后，会展示今天的选题、创作和发布记录。" />
      ) : suggestions.length === 0 ? (
        <EmptyState icon={Wand2} title="今天暂无系统自动记录" description="可以继续手动填写日报。" />
      ) : (
        <div className="space-y-3">
          {suggestions.map((item, index) => (
            <div key={`${item.sourceType}-${item.sourceId}-${index}`} className="rounded-card border border-studio-border-soft bg-white/[0.04] p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold text-studio-text-primary">{item.title || '自动记录'}</p>
                <span className="text-xs text-studio-text-muted">{sourceLabels[item.sourceType || 'unknown'] || '业务来源'} #{item.sourceId || '-'}</span>
              </div>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-studio-text-secondary">{item.contentMd}</p>
            </div>
          ))}
          <ActionButton onClick={() => onApply(suggestions)} variant="primary" className="w-full">
            追加到对应分段
          </ActionButton>
        </div>
      )}
    </GlassPanel>
  );
}
