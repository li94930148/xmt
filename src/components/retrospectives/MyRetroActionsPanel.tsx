import { ExternalLink, RefreshCw } from 'lucide-react';
import type { RetroAction } from '../../api/retrospectives';
import { ActionButton, GlassPanel } from '../studio';
import { formatDate, retroActionStatusLabels } from './retroLabels';

type Props = {
  actions: RetroAction[];
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
  onOpen: (retroId: number) => void;
};

function today() {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Shanghai' });
}

function isOverdue(action: RetroAction) {
  return Boolean(action.dueDate && action.dueDate < today() && action.status !== 'done' && action.status !== 'cancelled');
}

export default function MyRetroActionsPanel({ actions, loading, error, onRefresh, onOpen }: Props) {
  return (
    <GlassPanel data-testid="my-retro-actions-panel" className="p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-studio-text-primary">我的复盘行动项</h2>
          <p className="mt-1 text-xs text-studio-text-secondary">仅显示待处理和进行中的行动项。</p>
        </div>
        <ActionButton variant="ghost" onClick={onRefresh} disabled={loading} aria-busy={loading}>
          <RefreshCw aria-hidden="true" className={`h-4 w-4 ${loading ? 'animate-spin motion-reduce:animate-none' : ''}`} />
          刷新
        </ActionButton>
      </div>

      {error ? (
        <div role="alert" className="mt-4 flex flex-col gap-3 rounded-panel border border-studio-border-soft bg-studio-surface-soft p-4 text-sm text-studio-text-primary sm:flex-row sm:items-center sm:justify-between">
          <p>{actions.length > 0 ? `行动项刷新失败，仍显示最近一次成功读取的内容：${error}` : `个人行动项暂不可用：${error}`}</p>
          <ActionButton variant="ghost" onClick={onRefresh} disabled={loading}>重新加载行动项</ActionButton>
        </div>
      ) : null}

      <div className="mt-4 grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
        {loading ? (
          <div role="status" aria-live="polite" aria-atomic="true" className="rounded-panel border border-studio-border-soft bg-studio-surface-soft p-4 text-sm text-studio-text-secondary">
            正在加载行动项...
          </div>
        ) : error && actions.length === 0 ? null : actions.length === 0 ? (
          <div className="rounded-panel border border-studio-border-soft bg-studio-surface-soft p-4 text-sm text-studio-text-secondary">
            当前没有需要你跟进的复盘行动项。
          </div>
        ) : actions.slice(0, 6).map((action) => (
          <button
            key={action.id}
            type="button"
            onClick={() => onOpen(action.retroId)}
            className="rounded-panel border border-studio-border-soft bg-studio-surface-soft p-4 text-left transition hover:border-studio-cyan/60 hover:bg-studio-surface-elevated"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="line-clamp-1 font-semibold text-studio-text-primary">{action.title}</p>
                <p className="mt-1 line-clamp-1 text-xs text-studio-text-secondary">{action.retroTitle || `复盘 #${action.retroId}`}</p>
              </div>
              <ExternalLink className="h-4 w-4 shrink-0 text-studio-text-muted" />
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
              <span className="rounded-full border border-studio-border-soft px-2 py-0.5 text-studio-text-secondary">
                {retroActionStatusLabels[action.status]}
              </span>
              <span className="text-studio-text-secondary">截止 {formatDate(action.dueDate)}</span>
              {isOverdue(action) ? <span className="rounded-full bg-studio-coral/10 px-2 py-0.5 text-studio-coral-contrast">已逾期</span> : null}
            </div>
          </button>
        ))}
      </div>
    </GlassPanel>
  );
}
