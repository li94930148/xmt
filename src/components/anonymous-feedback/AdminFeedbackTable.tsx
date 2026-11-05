import { Check, Eye, EyeOff, MessageSquare, Trash2 } from 'lucide-react';
import { formatBeijingDate } from '../../lib/utils';
import { ActionButton, EmptyState, GlassPanel, ResponsiveTableShell, StatusPill } from '../studio';
import LoadingState from '../common/LoadingState';
import type { AnonymousFeedback, AnonymousFeedbackStatus } from '../../api/anonymousFeedback';

const typeLabels = { feature: '功能建议', usage: '使用问题', process: '流程优化', team: '团队建议', other: '其他' } as const;
const statusTones = { pending: 'amber', processing: 'cyan', completed: 'success' } as const;

interface AdminFeedbackTableProps {
  items: AnonymousFeedback[];
  loading: boolean;
  listError: string;
  refreshNotice: string;
  refreshing: boolean;
  activeDeleteRecovery: boolean;
  busy: boolean;
  writeLocked: boolean;
  statusLabels: Record<AnonymousFeedbackStatus, string>;
  onRetryList: () => void;
  onView: (item: AnonymousFeedback) => void;
  onUpdate: (item: AnonymousFeedback, status: AnonymousFeedbackStatus) => void;
  onTogglePublic: (item: AnonymousFeedback) => void;
  onReply: (item: AnonymousFeedback) => void;
  onDelete: (item: AnonymousFeedback) => void;
}

function feedbackActionName(action: string, item: AnonymousFeedback) {
  return `${action}：${item.content.replace(/\s+/g, ' ').trim().slice(0, 48)}`;
}

export default function AdminFeedbackTable({
  items,
  loading,
  listError,
  refreshNotice,
  refreshing,
  activeDeleteRecovery,
  busy,
  writeLocked,
  statusLabels,
  onRetryList,
  onView,
  onUpdate,
  onTogglePublic,
  onReply,
  onDelete,
}: AdminFeedbackTableProps) {
  return (
    <>
      {listError ? (
        <div role="alert" className="mb-4 space-y-3 rounded-xl border border-studio-amber/30 bg-studio-amber/10 p-4 text-sm text-studio-amber-contrast">
          <p className="font-medium">{refreshNotice ? `${refreshNotice}；列表刷新失败，请重新加载列表，不要重复执行刚才的操作。` : '匿名意见列表暂不可用。'}</p>
          <p className="text-studio-text-secondary">{listError}</p>
          <ActionButton variant="secondary" onClick={onRetryList} disabled={refreshing}>
            {refreshing ? '正在重新加载…' : '重新加载列表'}
          </ActionButton>
        </div>
      ) : null}
      <GlassPanel data-testid="anonymous-feedback-admin-table-panel" className="overflow-visible">
        {loading ? <LoadingState type="table" rows={5} /> : items.length === 0 ? listError ? null : activeDeleteRecovery
          ? <div role="status" className="px-4 py-8 text-center text-sm text-studio-text-secondary">删除结果尚未核实，暂不将空列表视为删除成功。</div>
          : <EmptyState icon={MessageSquare} title="暂无匿名意见" description="团队成员提交的意见会显示在这里。" /> : <ResponsiveTableShell>
            <table className="w-full min-w-[1080px] table-fixed text-left text-sm">
              <thead className="border-b border-studio-border-soft bg-studio-surface-soft text-xs text-studio-text-muted">
                <tr>
                  <th className="px-4 py-3">时间</th>
                  <th className="px-4 py-3">类型</th>
                  <th className="px-4 py-3">内容</th>
                  <th className="px-4 py-3">需要回复</th>
                  <th className="px-4 py-3">公开</th>
                  <th className="px-4 py-3">状态</th>
                  <th className="sticky right-0 z-20 w-[260px] border-l border-studio-border-soft bg-studio-surface-soft px-4 py-3 text-right sm:w-[340px]">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-studio-border-soft">
                {items.map((item) => (
                  <tr key={item.id} className="text-studio-text-secondary">
                    <td className="whitespace-nowrap px-4 py-4 text-xs">{formatBeijingDate(item.created_at)}</td>
                    <td className="px-4 py-4">{typeLabels[item.type]}</td>
                    <td className="max-w-md px-4 py-4"><p className="line-clamp-2">{item.content}</p></td>
                    <td className="px-4 py-4">{Number(item.need_reply) ? '是' : '否'}</td>
                    <td className="px-4 py-4">{Number(item.is_public) ? '公开' : '隐藏'}</td>
                    <td className="px-4 py-4"><StatusPill tone={statusTones[item.status]}>{statusLabels[item.status]}</StatusPill></td>
                    <td data-testid={`feedback-row-actions-${item.id}`} className="sticky right-0 z-10 w-[260px] border-l border-studio-border-soft bg-studio-surface px-4 py-4 sm:w-[340px]">
                      <div className="flex flex-wrap justify-end gap-1 sm:flex-nowrap">
                        <ActionButton variant="ghost" title="查看详情" aria-label={feedbackActionName('查看意见详情', item)} disabled={busy} onClick={() => onView(item)}><Eye className="h-4 w-4" /></ActionButton>
                        {item.status === 'pending' ? <ActionButton variant="ghost" title="标记处理中" aria-label={feedbackActionName('标记为处理中', item)} disabled={writeLocked} onClick={() => onUpdate(item, 'processing')}><Check className="h-4 w-4" /></ActionButton> : null}
                        <ActionButton variant="ghost" title="标记完成" aria-label={feedbackActionName('标记为已完成', item)} disabled={writeLocked} onClick={() => onUpdate(item, 'completed')}><Check className="h-4 w-4" /></ActionButton>
                        <ActionButton variant="ghost" title={Number(item.is_public) ? '隐藏意见' : '公开意见'} aria-label={feedbackActionName(Number(item.is_public) ? '隐藏意见' : '公开意见', item)} disabled={writeLocked} onClick={() => onTogglePublic(item)}>{Number(item.is_public) ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</ActionButton>
                        <ActionButton variant="ghost" title="回复" aria-label={feedbackActionName('回复匿名意见', item)} disabled={writeLocked} onClick={() => onReply(item)}><MessageSquare className="h-4 w-4" /></ActionButton>
                        <ActionButton variant="ghost" title="删除" aria-label={feedbackActionName('删除匿名意见', item)} disabled={writeLocked} onClick={() => onDelete(item)}><Trash2 className="h-4 w-4 text-studio-coral" /></ActionButton>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ResponsiveTableShell>}
      </GlassPanel>
    </>
  );
}
