import { Eye, Pencil, Trash2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { ResourceListItem } from '@/api/resourceCenter';
import { EmptyState, ResponsiveTableShell } from '@/components/studio';
import { formatBeijingDate } from '@/lib/utils';
import { getResourceDetailPath } from '@/platform/resource-navigation';
import { resourceStatusLabel } from './resourceLabels';

type ResourceTableEmptyState = {
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
};

export default function ResourceTable({ items, canEdit, canDelete, onDelete, emptyState }: { items: ResourceListItem[]; canEdit: boolean; canDelete: boolean; onDelete?: (item: ResourceListItem) => void; emptyState?: ResourceTableEmptyState }) {
  if (items.length === 0) {
    const state = emptyState || { title: '暂无资料' };
    return (
      <div>
        {emptyState ? <p role="status" aria-live="polite" className="sr-only">{state.title}{state.description ? `。${state.description}` : ''}</p> : null}
        <EmptyState {...state} />
      </div>
    );
  }
  return (
    <ResponsiveTableShell>
      <table className="w-full min-w-[760px] text-left text-sm">
        <thead className="border-b border-studio-border-soft bg-studio-surface-soft text-xs text-studio-text-muted">
          <tr><th className="px-5 py-3 font-medium">标题</th><th className="px-4 py-3 font-medium">分类</th><th className="px-4 py-3 font-medium">标签</th><th className="px-4 py-3 font-medium">更新时间</th><th className="sticky right-0 z-20 border-l border-studio-border-soft bg-studio-surface-soft px-5 py-3 text-right font-medium">操作</th></tr>
        </thead>
        <tbody className="divide-y divide-studio-border-soft">
          {items.map((item) => (
            <tr key={item.id} className="group transition-colors hover:bg-studio-surface-soft">
              <td className="px-5 py-4"><Link className="font-medium text-studio-text-primary hover:text-studio-cyan-contrast" to={getResourceDetailPath(item.id, item.library_type)}>{item.title}</Link>{item.status === 'deleted' ? <span className="mt-1 block text-xs text-studio-text-secondary">{resourceStatusLabel(item.status)}</span> : null}</td>
              <td className="px-4 py-4 text-studio-text-secondary">{item.category?.name || '—'}</td>
              <td className="px-4 py-4"><div className="flex max-w-56 flex-wrap gap-1.5">{item.tags.length ? item.tags.slice(0, 3).map((tag) => <span key={tag.id} className="rounded-button bg-studio-surface-elevated px-2 py-1 text-xs text-studio-text-secondary">{tag.name}</span>) : <span className="text-studio-text-muted">—</span>}</div></td>
              <td className="px-4 py-4 whitespace-nowrap text-studio-text-secondary">{formatBeijingDate(item.updated_at)}</td>
              <td className="sticky right-0 z-10 border-l border-studio-border-soft bg-studio-surface px-5 py-4 transition-colors group-hover:bg-studio-surface-soft"><div className="flex justify-end gap-1"><Link aria-label={`查看资料 ${item.title}`} className="xmt-btn xmt-btn-ghost h-10 w-10 min-w-10 shrink-0 !p-0 text-studio-text-muted hover:bg-studio-surface-soft hover:text-studio-cyan-contrast" to={getResourceDetailPath(item.id, item.library_type)}><Eye className="h-4 w-4" /></Link>{item.status !== 'deleted' && canEdit ? <Link aria-label={`编辑资料 ${item.title}`} className="xmt-btn xmt-btn-ghost h-10 w-10 min-w-10 shrink-0 !p-0 text-studio-text-muted hover:bg-studio-surface-soft hover:text-studio-cyan-contrast" to={getResourceDetailPath(item.id, item.library_type, true)}><Pencil className="h-4 w-4" /></Link> : null}{item.status !== 'deleted' && canDelete && onDelete ? <button type="button" aria-label={`删除资料 ${item.title}`} onClick={() => onDelete(item)} className="xmt-btn xmt-btn-ghost h-10 w-10 min-w-10 shrink-0 !p-0 text-studio-text-muted hover:bg-studio-coral-soft hover:text-studio-coral-contrast"><Trash2 className="h-4 w-4" /></button> : null}</div></td>
            </tr>
          ))}
        </tbody>
      </table>
    </ResponsiveTableShell>
  );
}
