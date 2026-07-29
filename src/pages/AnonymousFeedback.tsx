import { useCallback, useEffect, useState } from 'react';
import { Inbox, MessageSquareText, Plus } from 'lucide-react';
import AnonymousFeedbackModal from '../components/AnonymousFeedbackModal';
import { getPublicAnonymousFeedback, type AnonymousFeedbackType, type PublicAnonymousFeedback } from '../api/anonymousFeedback';
import { useAppStore } from '../store';
import { formatBeijingDate } from '../lib/utils';
import { ActionButton, EmptyState, GlassPanel, PageHeader, PageShell, StatusPill } from '../components/studio';
import LoadingState from '../components/common/LoadingState';

const typeLabels: Record<AnonymousFeedbackType, string> = {
  feature: '功能建议',
  usage: '使用问题',
  process: '流程优化',
  team: '团队建议',
  other: '其他',
};
const statusLabels = { pending: '待处理', processing: '处理中', completed: '已完成' } as const;
const statusTones = { pending: 'amber', processing: 'cyan', completed: 'success' } as const;

export default function AnonymousFeedbackPage() {
  const [items, setItems] = useState<PublicAnonymousFeedback[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const addNotification = useAppStore((state) => state.addNotification);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setItems(await getPublicAnonymousFeedback());
    } catch (error) {
      addNotification({ title: '加载失败', message: error instanceof Error ? error.message : '无法获取公开意见', type: 'error' });
    } finally {
      setLoading(false);
    }
  }, [addNotification]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <PageShell>
      <PageHeader
        title="匿名意见箱"
        description="匿名提交建议，帮助优化团队协作。"
        actions={<ActionButton variant="primary" onClick={() => setModalOpen(true)}><Plus className="h-4 w-4" />提交意见</ActionButton>}
      />

      <GlassPanel className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[15px] bg-studio-primary/12 text-studio-cyan">
            <MessageSquareText className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-studio-text-primary">提交意见</h2>
            <p className="mt-1 text-sm text-studio-text-muted">不记录提交人，提交后默认公开，管理员可隐藏不适合展示的内容。</p>
          </div>
        </div>
        <ActionButton onClick={() => setModalOpen(true)}>提交意见</ActionButton>
      </GlassPanel>

      <section>
        <div className="mb-4 flex items-end justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-studio-text-primary">公开意见</h2>
            <p className="mt-1 text-sm text-studio-text-muted">共 {items.length} 条团队建议</p>
          </div>
        </div>

        {loading ? <LoadingState type="section" text="正在加载公开意见..." /> : items.length === 0 ? (
          <GlassPanel><EmptyState icon={Inbox} title="暂无公开意见" description="成为第一个为团队协作留下建议的人。" actionLabel="提交意见" onAction={() => setModalOpen(true)} /></GlassPanel>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {items.map((item) => (
              <GlassPanel key={item.id} className="p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <span className="rounded-full border border-studio-border-soft bg-white/[0.04] px-3 py-1 text-xs font-semibold text-studio-text-secondary">{typeLabels[item.type]}</span>
                  <StatusPill tone={statusTones[item.status]}>{statusLabels[item.status]}</StatusPill>
                </div>
                <p className="mt-4 whitespace-pre-wrap text-sm leading-7 text-studio-text-primary">{item.content}</p>
                <p className="mt-4 text-xs text-studio-text-muted">提交时间：{formatBeijingDate(item.created_at)}</p>
                {item.reply_content ? (
                  <div className="mt-4 rounded-card border border-studio-primary/20 bg-studio-primary/8 p-4">
                    <p className="text-xs font-semibold text-studio-cyan">管理员回复</p>
                    <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-studio-text-secondary">{item.reply_content}</p>
                  </div>
                ) : null}
              </GlassPanel>
            ))}
          </div>
        )}
      </section>

      <AnonymousFeedbackModal open={modalOpen} onClose={() => setModalOpen(false)} onSubmitted={load} />
    </PageShell>
  );
}
