import { Eye, Pencil, Trash2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { ResourceListItem } from '@/api/resourceCenter';
import { EmptyState, ResponsiveTableShell } from '@/components/studio';

export default function ResourceTable({ items, canEdit, canDelete, onDelete }: { items: ResourceListItem[]; canEdit: boolean; canDelete: boolean; onDelete?: (item: ResourceListItem) => void }) {
  if (items.length === 0) return <EmptyState title="暂无资料" />;
  return (
    <ResponsiveTableShell>
      <table className="w-full min-w-[760px] text-left text-sm">
        <thead className="border-b border-studio-border-soft text-xs text-studio-text-muted">
          <tr><th className="px-5 py-3 font-medium">标题</th><th className="px-4 py-3 font-medium">分类</th><th className="px-4 py-3 font-medium">标签</th><th className="px-4 py-3 font-medium">更新时间</th><th className="px-5 py-3 text-right font-medium">操作</th></tr>
        </thead>
        <tbody className="divide-y divide-studio-border-soft">
          {items.map((item) => (
            <tr key={item.id} className="transition-colors hover:bg-white/[0.03]">
              <td className="px-5 py-4"><Link className="font-medium text-studio-text-primary hover:text-studio-cyan" to={`/asset-center/resources/${item.id}`}>{item.title}</Link></td>
              <td className="px-4 py-4 text-studio-text-secondary">{item.category?.name || '—'}</td>
              <td className="px-4 py-4"><div className="flex max-w-56 flex-wrap gap-1.5">{item.tags.length ? item.tags.slice(0, 3).map((tag) => <span key={tag.id} className="rounded-button bg-white/[0.06] px-2 py-1 text-xs text-studio-text-secondary">{tag.name}</span>) : <span className="text-studio-text-muted">—</span>}</div></td>
              <td className="px-4 py-4 whitespace-nowrap text-studio-text-secondary">{new Date(item.updated_at).toLocaleDateString('zh-CN')}</td>
              <td className="px-5 py-4"><div className="flex justify-end gap-1"><Link aria-label="查看" className="rounded-button p-2 text-studio-text-muted hover:bg-white/[0.06] hover:text-studio-cyan" to={`/asset-center/resources/${item.id}`}><Eye className="h-4 w-4" /></Link>{canEdit ? <Link aria-label="编辑" className="rounded-button p-2 text-studio-text-muted hover:bg-white/[0.06] hover:text-studio-cyan" to={`/asset-center/resources/${item.id}?edit=1`}><Pencil className="h-4 w-4" /></Link> : null}{canDelete && onDelete ? <button type="button" aria-label="删除" onClick={() => onDelete(item)} className="rounded-button p-2 text-studio-text-muted hover:bg-red-500/10 hover:text-red-400"><Trash2 className="h-4 w-4" /></button> : null}</div></td>
            </tr>
          ))}
        </tbody>
      </table>
    </ResponsiveTableShell>
  );
}
