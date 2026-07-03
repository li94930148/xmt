import { Eye, Plus, RefreshCw } from 'lucide-react';
import type { Retrospective } from '../../api/retrospectives';
import { ActionButton, GlassPanel } from '../studio';
import RetroStatusPill from './RetroStatusPill';
import { formatDate, formatDateTime, retroCategoryLabels } from './retroLabels';

type Props = {
  retrospectives: Retrospective[];
  loading: boolean;
  canCreate: boolean;
  onCreate: () => void;
  onRefresh: () => void;
  onOpen: (id: number) => void;
};

export default function RetroList({ retrospectives, loading, canCreate, onCreate, onRefresh, onOpen }: Props) {
  if (!loading && retrospectives.length === 0) {
    return (
      <GlassPanel className="flex min-h-[320px] flex-col items-center justify-center p-8 text-center">
        <div className="rounded-full border border-studio-border-soft bg-white/[0.05] p-4">
          <RefreshCw className="h-7 w-7 text-studio-text-muted" />
        </div>
        <h2 className="mt-5 text-lg font-bold text-studio-text-primary">暂无复盘</h2>
        <p className="mt-2 max-w-md text-sm leading-6 text-studio-text-muted">
          创建第一份复盘，把周期内的指标快照、结论和下一步行动沉淀下来。
        </p>
        {canCreate ? (
          <ActionButton variant="primary" className="mt-5" onClick={onCreate}>
            <Plus className="h-4 w-4" />
            新建复盘
          </ActionButton>
        ) : null}
      </GlassPanel>
    );
  }

  return (
    <GlassPanel className="overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-studio-border-soft px-5 py-4">
        <div>
          <h2 className="text-base font-bold text-studio-text-primary">复盘列表</h2>
          <p className="mt-1 text-xs text-studio-text-muted">保留 analytics 实时看板，这里只沉淀复盘闭环。</p>
        </div>
        <ActionButton onClick={onRefresh} disabled={loading}>
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          刷新
        </ActionButton>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-[980px] w-full text-left text-sm">
          <thead className="border-b border-studio-border-soft text-xs uppercase tracking-wide text-studio-text-muted">
            <tr>
              <th className="px-5 py-3 font-semibold">标题</th>
              <th className="px-4 py-3 font-semibold">类型</th>
              <th className="px-4 py-3 font-semibold">周期</th>
              <th className="px-4 py-3 font-semibold">状态</th>
              <th className="px-4 py-3 font-semibold">负责人</th>
              <th className="px-4 py-3 font-semibold">快照</th>
              <th className="px-4 py-3 font-semibold">行动项</th>
              <th className="px-4 py-3 font-semibold">发布时间</th>
              <th className="px-5 py-3 font-semibold">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-studio-border-soft">
            {loading ? (
              <tr>
                <td className="px-5 py-10 text-center text-studio-text-muted" colSpan={9}>
                  正在加载复盘列表...
                </td>
              </tr>
            ) : retrospectives.map((retro) => (
              <tr key={retro.id} className="transition hover:bg-white/[0.04]">
                <td className="max-w-[260px] px-5 py-4">
                  <button
                    type="button"
                    onClick={() => onOpen(retro.id)}
                    className="line-clamp-2 text-left font-semibold text-studio-text-primary hover:text-studio-cyan"
                  >
                    {retro.title}
                  </button>
                  <p className="mt-1 text-xs text-studio-text-muted">更新于 {formatDateTime(retro.updatedAt)}</p>
                </td>
                <td className="px-4 py-4 text-studio-text-secondary">
                  {retro.templateCategory ? retroCategoryLabels[retro.templateCategory] : '-'}
                </td>
                <td className="px-4 py-4 text-studio-text-secondary">
                  {formatDate(retro.periodStart)} 至 {formatDate(retro.periodEnd)}
                </td>
                <td className="px-4 py-4"><RetroStatusPill status={retro.status} /></td>
                <td className="px-4 py-4 text-studio-text-secondary">{retro.ownerName || '-'}</td>
                <td className="px-4 py-4 text-studio-text-primary">{retro.snapshotCount}</td>
                <td className="px-4 py-4 text-studio-text-primary">{retro.actionCount}</td>
                <td className="px-4 py-4 text-studio-text-secondary">{formatDateTime(retro.publishedAt)}</td>
                <td className="px-5 py-4">
                  <ActionButton variant="ghost" onClick={() => onOpen(retro.id)}>
                    <Eye className="h-4 w-4" />
                    详情
                  </ActionButton>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </GlassPanel>
  );
}
