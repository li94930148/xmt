import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, Eye, EyeOff, MessageSquare, Trash2 } from 'lucide-react';
import { deleteAnonymousFeedback, getAnonymousFeedback, updateAnonymousFeedback, type AnonymousFeedback, type AnonymousFeedbackStatus } from '../api/anonymousFeedback';
import { useAppStore } from '../store';
import { formatBeijingDate } from '../lib/utils';
import { ActionButton, EmptyState, GlassPanel, PageHeader, PageShell, ResponsiveTableShell, StatusPill } from '../components/studio';
import LoadingState from '../components/common/LoadingState';
import BaseModal from '../components/common/BaseModal';
import FormModal from '../components/common/FormModal';
import ConfirmModal from '../components/common/ConfirmModal';

const typeLabels = { feature: '功能建议', usage: '使用问题', process: '流程优化', team: '团队建议', other: '其他' } as const;
const statusLabels = { pending: '待处理', processing: '处理中', completed: '已完成' } as const;
const statusTones = { pending: 'amber', processing: 'cyan', completed: 'success' } as const;

export default function AnonymousFeedbackAdmin() {
  const [items, setItems] = useState<AnonymousFeedback[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<AnonymousFeedback | null>(null);
  const [replying, setReplying] = useState<AnonymousFeedback | null>(null);
  const [deleting, setDeleting] = useState<AnonymousFeedback | null>(null);
  const [reply, setReply] = useState('');
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [listError, setListError] = useState('');
  const [refreshNotice, setRefreshNotice] = useState('');
  const mutationLock = useRef(false);
  const addNotification = useAppStore((state) => state.addNotification);

  const load = useCallback(async () => {
    setListError('');
    try {
      const nextItems = await getAnonymousFeedback();
      setItems(nextItems);
      setSelected((current) => current ? nextItems.find((item) => item.id === current.id) || null : null);
      return true;
    } catch (error) {
      setListError(error instanceof Error ? error.message : '无法获取意见');
      return false;
    }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const applyLocalUpdate = (id: number, changes: Partial<AnonymousFeedback>) => {
    setItems((current) => current.map((item) => item.id === id ? { ...item, ...changes } : item));
    setSelected((current) => current?.id === id ? { ...current, ...changes } : current);
  };

  const refreshAfterMutation = async (message: string, notification: { title: string; message: string }) => {
    const refreshed = await load();
    if (!refreshed) {
      setRefreshNotice(message);
      return;
    }
    setRefreshNotice('');
    addNotification({ ...notification, type: 'success' });
  };

  const retryList = async () => {
    setRefreshing(true);
    try {
      if (await load()) setRefreshNotice('');
    } finally { setRefreshing(false); }
  };

  const update = async (item: AnonymousFeedback, status: AnonymousFeedbackStatus) => {
    if (mutationLock.current) return;
    mutationLock.current = true;
    setBusy(true);
    setRefreshNotice('');
    try {
      await updateAnonymousFeedback(item.id, { status });
      applyLocalUpdate(item.id, { status });
      await refreshAfterMutation(`意见已标记为${statusLabels[status]}`, { title: '状态已更新', message: `意见已标记为${statusLabels[status]}` });
    }
    catch (error) { addNotification({ title: '更新失败', message: error instanceof Error ? error.message : '请稍后重试', type: 'error' }); }
    finally { mutationLock.current = false; setBusy(false); }
  };

  const togglePublic = async (item: AnonymousFeedback) => {
    if (mutationLock.current) return;
    mutationLock.current = true;
    setBusy(true);
    setRefreshNotice('');
    const nextIsPublic = !Number(item.is_public);
    try {
      await updateAnonymousFeedback(item.id, { is_public: nextIsPublic });
      const description = nextIsPublic ? '该条意见已公开' : '该条意见已隐藏';
      applyLocalUpdate(item.id, { is_public: nextIsPublic });
      await refreshAfterMutation(description, { title: '公开状态已更新', message: description });
    }
    catch (error) { addNotification({ title: '更新失败', message: error instanceof Error ? error.message : '无法修改公开状态', type: 'error' }); }
    finally { mutationLock.current = false; setBusy(false); }
  };

  const submitReply = async () => {
    if (!replying || mutationLock.current) return;
    const target = replying;
    mutationLock.current = true;
    setBusy(true);
    setRefreshNotice('');
    try {
      await updateAnonymousFeedback(target.id, { reply_content: reply, status: 'completed' });
      applyLocalUpdate(target.id, { reply_content: reply, status: 'completed' });
      setReplying(null);
      setReply('');
      await refreshAfterMutation('回复已保存，意见已标记为完成', { title: '回复已保存', message: '意见已标记为完成' });
    }
    catch (error) { addNotification({ title: '保存失败', message: error instanceof Error ? error.message : '请稍后重试', type: 'error' }); }
    finally { mutationLock.current = false; setBusy(false); }
  };

  const remove = async () => {
    if (!deleting || mutationLock.current) return;
    const target = deleting;
    mutationLock.current = true;
    setBusy(true);
    setRefreshNotice('');
    try {
      await deleteAnonymousFeedback(target.id);
      setItems((current) => current.filter((item) => item.id !== target.id));
      setSelected((current) => current?.id === target.id ? null : current);
      setDeleting(null);
      await refreshAfterMutation('匿名意见已删除', { title: '删除成功', message: '该条意见已删除' });
    }
    catch (error) { addNotification({ title: '删除失败', message: error instanceof Error ? error.message : '请稍后重试', type: 'error' }); }
    finally { mutationLock.current = false; setBusy(false); }
  };

  return <PageShell>
    <PageHeader title="匿名意见管理" description="查看和处理团队成员提交的匿名意见" />
    {listError ? <div role="alert" className="mb-4 space-y-3 rounded-xl border border-studio-amber/30 bg-studio-amber/10 p-4 text-sm text-studio-amber-contrast">
      <p className="font-medium">{refreshNotice ? `${refreshNotice}；列表刷新失败，请重新加载列表，不要重复执行刚才的操作。` : '匿名意见列表暂不可用。'}</p>
      <p className="text-studio-text-secondary">{listError}</p>
      <ActionButton variant="secondary" onClick={() => void retryList()} disabled={refreshing}>{refreshing ? '正在重新加载…' : '重新加载列表'}</ActionButton>
    </div> : null}
    <GlassPanel data-testid="anonymous-feedback-admin-table-panel" className="overflow-visible">
      {loading ? <LoadingState type="table" rows={5} /> : items.length === 0 ? listError ? null : <EmptyState icon={MessageSquare} title="暂无匿名意见" description="团队成员提交的意见会显示在这里。" /> : <ResponsiveTableShell>
        <table className="w-full min-w-[1080px] table-fixed text-left text-sm">
          <thead className="border-b border-studio-border-soft bg-studio-surface-soft text-xs text-studio-text-muted"><tr><th className="px-4 py-3">时间</th><th className="px-4 py-3">类型</th><th className="px-4 py-3">内容</th><th className="px-4 py-3">需要回复</th><th className="px-4 py-3">公开</th><th className="px-4 py-3">状态</th><th className="sticky right-0 z-20 w-[260px] border-l border-studio-border-soft bg-studio-surface-soft px-4 py-3 text-right sm:w-[340px]">操作</th></tr></thead>
          <tbody className="divide-y divide-studio-border-soft">{items.map((item) => <tr key={item.id} className="text-studio-text-secondary">
            <td className="whitespace-nowrap px-4 py-4 text-xs">{formatBeijingDate(item.created_at)}</td>
            <td className="px-4 py-4">{typeLabels[item.type]}</td>
            <td className="max-w-md px-4 py-4"><p className="line-clamp-2">{item.content}</p></td>
            <td className="px-4 py-4">{Number(item.need_reply) ? '是' : '否'}</td>
            <td className="px-4 py-4">{Number(item.is_public) ? '公开' : '隐藏'}</td>
            <td className="px-4 py-4"><StatusPill tone={statusTones[item.status]}>{statusLabels[item.status]}</StatusPill></td>
            <td data-testid={`feedback-row-actions-${item.id}`} className="sticky right-0 z-10 w-[260px] border-l border-studio-border-soft bg-studio-surface px-4 py-4 sm:w-[340px]">
              <div className="flex flex-wrap justify-end gap-1 sm:flex-nowrap">
                <ActionButton variant="ghost" title="查看详情" disabled={busy} onClick={() => setSelected(item)}><Eye className="h-4 w-4" /></ActionButton>
                {item.status === 'pending' ? <ActionButton variant="ghost" title="标记处理中" disabled={busy} onClick={() => void update(item, 'processing')}><Check className="h-4 w-4" /></ActionButton> : null}
                <ActionButton variant="ghost" title="标记完成" disabled={busy} onClick={() => void update(item, 'completed')}><Check className="h-4 w-4" /></ActionButton>
                <ActionButton variant="ghost" title={Number(item.is_public) ? '隐藏意见' : '公开意见'} disabled={busy} onClick={() => void togglePublic(item)}>{Number(item.is_public) ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</ActionButton>
                <ActionButton variant="ghost" title="回复" disabled={busy} onClick={() => { setReplying(item); setReply(item.reply_content || ''); }}><MessageSquare className="h-4 w-4" /></ActionButton>
                <ActionButton variant="ghost" title="删除" disabled={busy} onClick={() => setDeleting(item)}><Trash2 className="h-4 w-4 text-studio-coral" /></ActionButton>
              </div>
            </td>
          </tr>)}</tbody>
        </table>
      </ResponsiveTableShell>}
    </GlassPanel>
    <BaseModal open={Boolean(selected)} onClose={() => setSelected(null)} title="意见详情"><div className="space-y-4 text-sm"><p className="whitespace-pre-wrap leading-7 text-studio-text-primary">{selected?.content}</p>{selected?.reply_content ? <div className="rounded-button bg-studio-surface-soft p-4"><p className="mb-2 text-xs text-studio-text-muted">管理员回复</p><p className="whitespace-pre-wrap text-studio-text-secondary">{selected.reply_content}</p></div> : null}</div></BaseModal>
    <FormModal open={Boolean(replying)} onCancel={() => setReplying(null)} onSubmit={submitReply} loading={busy} title="回复意见" submitText="保存回复"><textarea rows={6} maxLength={2000} value={reply} onChange={(event) => setReply(event.target.value)} placeholder="输入回复内容" className="w-full rounded-button border border-studio-border-soft bg-studio-surface p-3 text-studio-text-primary outline-none focus:border-studio-border-active" /></FormModal>
    <ConfirmModal open={Boolean(deleting)} onCancel={() => setDeleting(null)} onConfirm={remove} loading={busy} variant="danger" title="删除意见" description="删除后无法恢复，确认继续吗？" confirmText="删除" />
  </PageShell>;
}
