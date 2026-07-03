import { Save } from 'lucide-react';
import type { RetrospectiveStatus } from '../../api/retrospectives';
import { ActionButton, GlassPanel } from '../studio';

type Props = {
  value: string;
  status: RetrospectiveStatus;
  canEdit: boolean;
  saving: boolean;
  onChange: (value: string) => void;
  onSave: () => void;
};

export default function RetroSummaryEditor({ value, status, canEdit, saving, onChange, onSave }: Props) {
  const editable = status === 'draft' && canEdit;

  return (
    <GlassPanel className="p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-studio-text-primary">复盘结论</h2>
          <p className="mt-1 text-sm text-studio-text-muted">
            支持简单 Markdown。本轮不接富文本，避免影响编辑器主栈。
          </p>
        </div>
        {editable ? (
          <ActionButton onClick={onSave} disabled={saving}>
            <Save className="h-4 w-4" />
            {saving ? '保存中...' : '保存结论'}
          </ActionButton>
        ) : (
          <span className="rounded-full border border-studio-border-soft px-3 py-1 text-xs text-studio-text-muted">只读</span>
        )}
      </div>

      {editable ? (
        <textarea
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="mt-4 min-h-[220px] w-full resize-y rounded-panel border border-studio-border-soft bg-white/[0.04] px-4 py-3 text-sm leading-6 text-studio-text-primary outline-none transition focus:border-studio-border-active"
          placeholder="记录本周期发生了什么、为什么发生、下一轮怎么调整..."
        />
      ) : (
        <div className="mt-4 min-h-[160px] whitespace-pre-wrap rounded-panel border border-studio-border-soft bg-white/[0.04] px-4 py-3 text-sm leading-6 text-studio-text-secondary">
          {value.trim() || '暂未填写复盘结论'}
        </div>
      )}
    </GlassPanel>
  );
}
