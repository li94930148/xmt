import { useCallback, useEffect, useState } from 'react';
import { Check, Eye, MessageSquare, Trash2 } from 'lucide-react';
import { deleteAnonymousFeedback, getAnonymousFeedback, updateAnonymousFeedback, type AnonymousFeedback, type AnonymousFeedbackStatus } from '../api/anonymousFeedback';
import { useAppStore } from '../store';
import { formatBeijingDate } from '../lib/utils';
import { ActionButton, EmptyState, GlassPanel, PageHeader, PageShell, ResponsiveTableShell, StatusPill } from '../components/studio';
import LoadingState from '../components/common/LoadingState';
import BaseModal from '../components/common/BaseModal';
import FormModal from '../components/common/FormModal';
import ConfirmModal from '../components/common/ConfirmModal';

const typeLabels = { feature: '功能建议', usage: '使用问题', process: '流程优化', team: '团队建议', other: '其他' } as const;
const statusLabels = { pending: '待处理', read: '已查看', done: '已完成' } as const;
const statusTones = { pending: 'amber', read: 'cyan', done: 'success' } as const;

export default function AnonymousFeedbackAdmin() {
  const [items, setItems] = useState<AnonymousFeedback[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<AnonymousFeedback | null>(null);
  const [replying, setReplying] = useState<AnonymousFeedback | null>(null);
  const [deleting, setDeleting] = useState<AnonymousFeedback | null>(null);
  const [reply, setReply] = useState('');
  const [busy, setBusy] = useState(false);
  const addNotification = useAppStore((state) => state.addNotification);

  const load = useCallback(async () => {
    try { setItems(await getAnonymousFeedback()); }
    catch (error) { addNotification({ title: '加载失败', message: error instanceof Error ? error.message : '无法获取意见', type: 'error' }); }
    finally { setLoading(false); }
  }, [addNotification]);
  useEffect(() => { void load(); }, [load]);

  const update = async (item: AnonymousFeedback, status: AnonymousFeedbackStatus) => {
    try { await updateAnonymousFeedback(item.id, { status }); await load(); }
    catch (error) { addNotification({ title: '更新失败', message: error instanceof Error ? error.message : '请稍后重试', type: 'error' }); }
  };

  const submitReply = async () => {
    if (!replying) return;
    setBusy(true);
    try { await updateAnonymousFeedback(replying.id, { reply_content: reply, status: 'done' }); setReplying(null); setReply(''); await load(); addNotification({ title: '回复已保存', message: '意见已标记为完成', type: 'success' }); }
    catch (error) { addNotification({ title: '保存失败', message: error instanceof Error ? error.message : '请稍后重试', type: 'error' }); }
    finally { setBusy(false); }
  };

  const remove = async () => {
    if (!deleting) return;
    setBusy(true);
    try { await deleteAnonymousFeedback(deleting.id); setDeleting(null); await load(); addNotification({ title: '删除成功', message: '该条意见已删除', type: 'success' }); }
    catch (error) { addNotification({ title: '删除失败', message: error instanceof Error ? error.message : '请稍后重试', type: 'error' }); }
    finally { setBusy(false); }
  };

  return <PageShell>
    <PageHeader title="匿名意见管理" description="查看和处理团队成员提交的匿名意见" />
    <GlassPanel className="overflow-hidden">
      {loading ? <LoadingState type="table" rows={5} /> : items.length === 0 ? <EmptyState icon={MessageSquare} title="暂无匿名意见" description="团队成员提交的意见会显示在这里。" /> : <ResponsiveTableShell>
        <table className="w-full min-w-[980px] text-left text-sm">
          <thead className="border-b border-studio-border-soft bg-white/[0.035] text-xs text-studio-text-muted"><tr><th className="px-4 py-3">时间</th><th className="px-4 py-3">类型</th><th className="px-4 py-3">内容</th><th className="px-4 py-3">需要回复</th><th className="px-4 py-3">状态</th><th className="px-4 py-3 text-right">操作</th></tr></thead>
          <tbody className="divide-y divide-studio-border-soft">{items.map((item) => <tr key={item.id} className="text-studio-text-secondary"><td className="whitespace-nowrap px-4 py-4 text-xs">{formatBeijingDate(item.created_at)}</td><td className="px-4 py-4">{typeLabels[item.type]}</td><td className="max-w-md px-4 py-4"><p className="line-clamp-2">{item.content}</p></td><td className="px-4 py-4">{Number(item.need_reply) ? '是' : '否'}</td><td className="px-4 py-4"><StatusPill tone={statusTones[item.status]}>{statusLabels[item.status]}</StatusPill></td><td className="px-4 py-4"><div className="flex justify-end gap-1"><ActionButton variant="ghost" title="查看详情" onClick={() => setSelected(item)}><Eye className="h-4 w-4" /></ActionButton>{item.status === 'pending' ? <ActionButton variant="ghost" title="标记已查看" onClick={() => void update(item, 'read')}><Check className="h-4 w-4" /></ActionButton> : null}<ActionButton variant="ghost" title="标记完成" onClick={() => void update(item, 'done')}><Check className="h-4 w-4" /></ActionButton><ActionButton variant="ghost" title="回复" onClick={() => { setReplying(item); setReply(item.reply_content || ''); }}><MessageSquare className="h-4 w-4" /></ActionButton><ActionButton variant="ghost" title="删除" onClick={() => setDeleting(item)}><Trash2 className="h-4 w-4 text-studio-coral" /></ActionButton></div></td></tr>)}</tbody>
        </table>
      </ResponsiveTableShell>}
    </GlassPanel>
    <BaseModal open={Boolean(selected)} onClose={() => setSelected(null)} title="意见详情"><div className="space-y-4 text-sm"><p className="whitespace-pre-wrap leading-7 text-studio-text-primary">{selected?.content}</p>{selected?.reply_content ? <div className="rounded-button bg-white/[0.04] p-4"><p className="mb-2 text-xs text-studio-text-muted">管理员回复</p><p className="whitespace-pre-wrap text-studio-text-secondary">{selected.reply_content}</p></div> : null}</div></BaseModal>
    <FormModal open={Boolean(replying)} onCancel={() => setReplying(null)} onSubmit={submitReply} loading={busy} title="回复意见" submitText="保存回复"><textarea rows={6} maxLength={2000} value={reply} onChange={(event) => setReply(event.target.value)} placeholder="输入回复内容" className="w-full rounded-button border border-studio-border-soft bg-white/[0.04] p-3 text-studio-text-primary outline-none focus:border-studio-border-active" /></FormModal>
    <ConfirmModal open={Boolean(deleting)} onCancel={() => setDeleting(null)} onConfirm={remove} loading={busy} variant="danger" title="删除意见" description="删除后无法恢复，确认继续吗？" confirmText="删除" />
  </PageShell>;
}
