import { useState } from 'react';
import { FileText, Plus, Trash2 } from 'lucide-react';
import { ConfirmModal } from '@/components/common';
import {
  formatTopicDraftUpdatedAt,
  topicDraftTitle,
  type TopicDraftEntry,
} from '@/utils/topicDraft';

type TopicDraftPickerProps = {
  drafts: TopicDraftEntry[];
  activeDraftId: string | null;
  onSelect: (id: string) => boolean;
  onCreate: () => boolean;
  onDelete: (id: string) => boolean;
  onFailure: () => void;
  compact?: boolean;
};

export default function TopicDraftPicker({
  drafts,
  activeDraftId,
  onSelect,
  onCreate,
  onDelete,
  onFailure,
  compact = false,
}: TopicDraftPickerProps) {
  const [pendingDelete, setPendingDelete] = useState<TopicDraftEntry | null>(null);

  const handleSelect = (id: string) => {
    if (!onSelect(id)) onFailure();
  };

  const handleCreate = () => {
    if (!onCreate()) onFailure();
  };

  const handleDelete = (entry: TopicDraftEntry) => {
    setPendingDelete(entry);
  };

  return (
    <section aria-label="本机草稿列表" className="studio-sheen rounded-panel border border-studio-border-soft bg-studio-surface p-4 shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-semibold text-studio-text-primary">
            <FileText className="h-4 w-4 text-studio-primary" />
            本机草稿 <span className="text-studio-text-muted">{drafts.length}</span>
          </h2>
          <p className="mt-1 text-xs text-studio-text-muted">仅保存在当前设备和账号，可选择续写。</p>
        </div>
        <button
          type="button"
          onClick={handleCreate}
          className="xmt-btn xmt-btn-secondary inline-flex min-h-10 items-center gap-2 px-3 text-sm"
        >
          <Plus className="h-4 w-4" />新建草稿
        </button>
      </div>

      {drafts.length > 0 ? (
        <ul className={`mt-3 grid gap-2 ${compact ? 'grid-cols-1' : 'grid-cols-1 md:grid-cols-2'}`}>
          {drafts.map((entry) => {
            const title = topicDraftTitle(entry.draft);
            const selected = activeDraftId === entry.id;
            return (
              <li key={entry.id} className="flex min-w-0 items-stretch gap-2">
                <button
                  type="button"
                  aria-pressed={selected}
                  aria-label={`打开本机草稿：${title}`}
                  onClick={() => handleSelect(entry.id)}
                  className={`min-h-12 min-w-0 flex-1 rounded-button border px-3 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-studio-primary ${selected ? 'border-studio-primary bg-studio-primary/10' : 'border-studio-border-soft bg-studio-surface-soft hover:border-studio-border-active'}`}
                >
                  <span className="block truncate text-sm font-medium text-studio-text-primary">{title}</span>
                  <span className="mt-1 block text-xs text-studio-text-muted">最近保存 {formatTopicDraftUpdatedAt(entry.updatedAt)}{selected ? ' · 正在编辑' : ''}</span>
                </button>
                <button
                  type="button"
                  aria-label={`删除本机草稿：${title}`}
                  title="删除本机草稿"
                  onClick={() => handleDelete(entry)}
                  className="xmt-btn xmt-btn-ghost min-h-12 min-w-11 shrink-0 text-studio-text-muted hover:text-studio-coral-contrast"
                >
                  <Trash2 className="mx-auto h-4 w-4" />
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="mt-3 rounded-card border border-dashed border-studio-border-soft px-3 py-3 text-sm text-studio-text-muted">还没有已保存的草稿；输入内容后会自动保存到本机。</p>
      )}
      <ConfirmModal
        open={Boolean(pendingDelete)}
        title="确认删除本机草稿？"
        description={pendingDelete ? `删除「${topicDraftTitle(pendingDelete.draft)}」？只会删除当前设备上保存的草稿副本。此操作无法撤销。` : undefined}
        confirmText="删除草稿"
        variant="danger"
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => {
          if (pendingDelete && !onDelete(pendingDelete.id)) onFailure();
          setPendingDelete(null);
        }}
      />
    </section>
  );
}
