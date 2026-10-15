import { useCallback, useEffect, useRef, useState } from 'react';
import { CalendarDays, ChevronRight, CircleAlert, FilePlus2, FileText, MessageCircle, MessageSquareText, PenLine } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { usePermission } from '@/hooks/usePermission';
import { useActionableMessages } from '@/hooks/useActionableMessages';
import { useAuthStore, useMessageStore } from '@/store';
import { STATUS_TEXT } from '@/constants';
import { getHomeAttention, type HomeAttentionSummary, type HomeAttentionTopic } from '@/api';
import { ActionButton } from '@/components/studio';
import { formatBeijingDate, formatBeijingTime } from '@/lib/utils';

const quickActions = [
  { label: '提报选题', path: '/topics/add', icon: FilePlus2, permission: 'topic:create' },
  { label: '写日报', path: '/daily-report', icon: PenLine, permission: 'report:daily:submit' },
  { label: '查看消息', path: '/messages', icon: MessageCircle },
  { label: '排期日历', path: '/calendar', icon: CalendarDays },
];

function attentionLabel(topic: HomeAttentionTopic) {
  if (topic.is_overdue) return { text: '已逾期', tone: 'bg-studio-coral/12 text-studio-coral-contrast' };
  if (topic.is_stalled) return { text: '阶段卡点', tone: 'bg-studio-amber/12 text-studio-amber-contrast' };
  return { text: '截止临近', tone: 'bg-studio-primary/12 text-studio-primary-contrast' };
}

export default function MobileHome() {
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const token = useAuthStore((state) => state.token);
  const userId = user?.id;
  const role = user?.role;
  const unread = useMessageStore((state) => state.unreadCount);
  const isManagementRole = user?.role === 'admin' || user?.role === 'director';
  const actionableMessages = useActionableMessages(isManagementRole);
  const { hasPermission, loading: permissionsLoading } = usePermission();
  const visibleActions = quickActions.filter((action) => !action.permission || (!permissionsLoading && hasPermission(action.permission)));
  const [snapshot, setSnapshot] = useState<{
    userId: typeof userId; role: typeof role; token: typeof token;
    data: HomeAttentionSummary | null; error: string; loading: boolean;
  } | null>(null);
  const request = useRef<AbortController | null>(null);
  const current = snapshot?.userId === userId && snapshot?.role === role && snapshot?.token === token;
  const attention = current ? snapshot.data : null;
  const attentionError = current ? snapshot.error : '';
  const attentionLoading = !current || snapshot.loading;
  const active = attention?.active_topics?.topics ?? [];

  const loadAttention = useCallback(async () => {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setSnapshot({ userId, role, token, data: null, error: '', loading: true });
    const isCurrent = () => {
      const auth = useAuthStore.getState();
      return !controller.signal.aborted && request.current === controller
        && auth.user?.id === userId && auth.user?.role === role && auth.token === token;
    };
    try {
      const result = await getHomeAttention(controller.signal);
      if (isCurrent()) setSnapshot({ userId, role, token, data: result, error: '', loading: false });
    } catch (error) {
      if (isCurrent()) setSnapshot({ userId, role, token, data: null, error: error instanceof Error ? error.message : '关注事项暂时无法加载，请重试。', loading: false });
    }
  }, [userId, role, token]);

  useEffect(() => {
    void loadAttention();
    return () => { request.current?.abort(); };
  }, [loadAttention]);

  const attentionTopics = attention?.topics.slice(0, 3) ?? [];
  const hiddenAttentionCount = Math.max(0, (attention?.counts.total ?? 0) - attentionTopics.length);
  const todayPublishingTasks = attention?.today_publishing.tasks.slice(0, 3) ?? [];
  const hiddenTodayPublishingCount = Math.max(0, (attention?.today_publishing.total ?? 0) - todayPublishingTasks.length);
  const syncAnomalyTasks = attention?.sync_anomalies.tasks.slice(0, 3) ?? [];
  const hiddenSyncAnomalyCount = Math.max(0, (attention?.sync_anomalies.total ?? 0) - syncAnomalyTasks.length);
  const productionReviewTasks = attention?.production_reviews.tasks.slice(0, 3) ?? [];
  const hiddenProductionReviewCount = Math.max(0, (attention?.production_reviews.total ?? 0) - productionReviewTasks.length);

  return <div className="space-y-5">
    <section className="rounded-2xl border border-studio-border-soft bg-studio-surface p-5 shadow-card">
      <p className="text-sm text-studio-text-muted">你好，{user?.name ?? '同事'}</p>
      <h2 className="mt-1 text-xl font-semibold text-studio-text-primary">今天，先完成最重要的工作</h2>
      <div className="mt-5 grid grid-cols-2 gap-3">
        <button onClick={() => navigate('/topics')} className="rounded-xl bg-studio-primary/15 p-4 text-left"><p className="text-2xl font-semibold text-studio-cyan-contrast">{attention?.active_topics?.total ?? '—'}</p><p className="mt-1 text-sm text-studio-text-secondary">进行中选题</p></button>
        <button onClick={() => navigate('/messages')} className="rounded-xl bg-[var(--xmt-overlay-tint)] p-4 text-left"><p className="text-2xl font-semibold text-studio-text-primary">{unread}</p><p className="mt-1 text-sm text-studio-text-secondary">未读消息</p></button>
      </div>
    </section>
    <section aria-labelledby="mobile-home-attention-heading" className="rounded-2xl border border-studio-border-soft bg-studio-surface p-4 shadow-card">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          {attention ? <p className="text-xs font-medium text-studio-text-muted">{attention.scope === 'all-visible-content' ? '团队范围' : '个人范围'}</p> : null}
          <h2 id="mobile-home-attention-heading" className="mt-1 text-base font-semibold text-studio-text-primary">
            {attention?.scope === 'all-visible-content' ? '团队选题关注' : attention ? '我的选题关注' : '选题关注'}
          </h2>
        </div>
        <CircleAlert aria-hidden="true" className="mt-1 h-5 w-5 shrink-0 text-studio-amber-contrast" />
      </div>
      {attentionLoading ? <p className="text-sm text-studio-text-muted">正在读取关注事项…</p> : attentionError ? (
        <div role="alert" className="rounded-xl border border-studio-coral/30 bg-studio-coral/8 p-3">
          <p className="text-sm text-studio-coral-contrast">{attentionError}</p>
          <ActionButton variant="secondary" className="mt-3 w-full" onClick={() => void loadAttention()}>重新加载</ActionButton>
        </div>
      ) : attention ? (
        <>
          <div className="grid grid-cols-3 gap-2" aria-label={`${attention.counts.total} 项需要跟进`}>
            {[
              { label: '逾期', count: attention.counts.overdue },
              { label: '卡点', count: attention.counts.stalled },
              { label: '临近截止', count: attention.counts.due_soon },
            ].map((item) => <div key={item.label} className="rounded-xl bg-[var(--xmt-overlay-tint)] px-2 py-2 text-center">
              <p className="text-lg font-semibold text-studio-text-primary">{item.count}</p>
              <p className="text-xs text-studio-text-muted">{item.label}</p>
            </div>)}
          </div>
          {attentionTopics.length ? <div className="mt-3 space-y-2">
            {attentionTopics.map((topic) => {
              const label = attentionLabel(topic);
              return <ActionButton
                key={topic.id}
                variant="ghost"
                aria-label={`查看需要关注的选题：${topic.title}`}
                className="h-auto w-full justify-between gap-3 border-studio-border-soft px-3 py-3 text-left"
                onClick={() => navigate(`/topics/${topic.id}`, { state: { mobileReturnTo: '/' } })}
              >
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-studio-text-primary">{topic.title}</span>
                <span className={`shrink-0 rounded-full px-2 py-1 text-xs font-medium ${label.tone}`}>{label.text}</span>
                <ChevronRight aria-hidden="true" className="h-4 w-4 shrink-0 text-studio-text-muted" />
              </ActionButton>;
            })}
          </div> : <p className="mt-3 text-sm text-studio-text-muted">当前没有需要关注的选题。</p>}
          {hiddenAttentionCount > 0 ? <p className="mt-3 text-xs text-studio-text-muted">另有 {hiddenAttentionCount} 项，请进入选题查看。各类数量可能重叠。</p> : null}
        </>
      ) : null}
    </section>
    {isManagementRole && attention?.sync_anomalies.available && attention.sync_anomalies.total > 0 ? <section aria-labelledby="mobile-home-sync-anomalies-heading" className="rounded-2xl border border-studio-border-soft bg-studio-surface p-4 shadow-card">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div><h2 id="mobile-home-sync-anomalies-heading" className="text-base font-semibold text-studio-text-primary">数据同步异常</h2><p className="mt-1 text-xs text-studio-text-muted">按各账号最近一次已结束同步结果统计，完整同步成功后自动移除</p></div>
        <CircleAlert aria-hidden="true" className="mt-1 h-5 w-5 shrink-0 text-studio-coral-contrast" />
      </div>
      <div className="space-y-2">
        {syncAnomalyTasks.map((task) => <ActionButton
          key={task.id}
          variant="ghost"
          aria-label={`查看同步异常：${task.account_name}`}
          className="h-auto w-full justify-between gap-3 border-studio-border-soft px-3 py-3 text-left"
          onClick={() => navigate(`/analytics/creator-center?account_id=${encodeURIComponent(task.account_uid)}`, { state: { mobileReturnTo: '/' } })}
        >
          <span className="min-w-0 flex-1"><strong className="block truncate text-sm font-medium text-studio-text-primary">{task.account_name}</strong><small className="mt-1 block text-xs text-studio-text-muted">{task.status === 'failed' ? '同步失败' : '部分同步失败'} · {task.failed_count} 项未同步</small></span>
          <ChevronRight aria-hidden="true" className="h-4 w-4 shrink-0 text-studio-text-muted" />
        </ActionButton>)}
      </div>
      {hiddenSyncAnomalyCount > 0 ? <p className="mt-3 text-xs text-studio-text-muted">另有 {hiddenSyncAnomalyCount} 个账号，请进入创作者数据逐项查看。</p> : null}
    </section> : null}
    {attention?.production_reviews.available && attention.production_reviews.total > 0 ? <section aria-labelledby="mobile-home-production-reviews-heading" className="rounded-2xl border border-studio-border-soft bg-studio-surface p-4 shadow-card">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div><h2 id="mobile-home-production-reviews-heading" className="text-base font-semibold text-studio-text-primary">待审核稿件</h2><p className="mt-1 text-xs text-studio-text-muted">按当前稿件操作权限展示，并非专属指派 · {attention.production_reviews.total} 篇</p></div>
        <FileText aria-hidden="true" className="mt-1 h-5 w-5 shrink-0 text-studio-amber-contrast" />
      </div>
      <div className="space-y-2">
        {productionReviewTasks.map((task) => <ActionButton
          key={task.id}
          variant="ghost"
          aria-label={`打开待审核稿件：${task.topic_title}`}
          className="h-auto w-full justify-between gap-3 border-studio-border-soft px-3 py-3 text-left"
          onClick={() => navigate(`/production/${task.id}`, { state: { mobileReturnTo: '/' } })}
        >
          <span className="min-w-0 flex-1"><strong className="block truncate text-sm font-medium text-studio-text-primary">{task.topic_title}</strong><small className="mt-1 block text-xs text-studio-text-muted">{task.version || '当前版本'} · {task.assignee_name ? `选题负责人：${task.assignee_name}` : '选题负责人待确认'}</small></span>
          <ChevronRight aria-hidden="true" className="h-4 w-4 shrink-0 text-studio-text-muted" />
        </ActionButton>)}
      </div>
      {hiddenProductionReviewCount > 0 ? <p className="mt-3 text-xs text-studio-text-muted">另有 {hiddenProductionReviewCount} 篇，请进入创作管理继续处理。</p> : null}
    </section> : null}
    {hasPermission('workflow:publishing') && (attention?.today_publishing.total || 0) > 0 ? <section aria-labelledby="mobile-home-publishing-heading" className="rounded-2xl border border-studio-border-soft bg-studio-surface p-4 shadow-card">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div><h2 id="mobile-home-publishing-heading" className="text-base font-semibold text-studio-text-primary">今日发布</h2><p className="mt-1 text-xs text-studio-text-muted">待处理 {attention?.today_publishing.total} 个平台安排</p></div>
        <CalendarDays aria-hidden="true" className="mt-1 h-5 w-5 shrink-0 text-studio-primary-contrast" />
      </div>
      <div className="space-y-2">
        {todayPublishingTasks.map((task) => <ActionButton
          key={task.id}
          variant="ghost"
          aria-label={`处理今日发布：${task.topic_title}，${task.platform || '平台待确认'}`}
          className="h-auto w-full justify-between gap-3 border-studio-border-soft px-3 py-3 text-left"
          onClick={() => navigate(`/publishing/${task.id}`, { state: { mobileReturnTo: '/' } })}
        >
          <span className="min-w-0 flex-1"><strong className="block truncate text-sm font-medium text-studio-text-primary">{task.topic_title}</strong><small className="mt-1 block text-xs text-studio-text-muted">{task.platform || '平台待确认'} · {formatBeijingDate(task.publish_time)} {formatBeijingTime(task.publish_time, { hour: '2-digit', minute: '2-digit' })}</small></span>
          <ChevronRight aria-hidden="true" className="h-4 w-4 shrink-0 text-studio-text-muted" />
        </ActionButton>)}
      </div>
      {hiddenTodayPublishingCount > 0 ? <p className="mt-3 text-xs text-studio-text-muted">另有 {hiddenTodayPublishingCount} 个平台安排，请进入发布查看。</p> : null}
    </section> : null}
    {isManagementRole && actionableMessages.error ? <section aria-labelledby="mobile-home-actionable-messages-heading" className="rounded-2xl border border-studio-border-soft bg-studio-surface p-4 shadow-card">
      <div className="flex items-start justify-between gap-3"><div><h2 id="mobile-home-actionable-messages-heading" className="text-base font-semibold text-studio-text-primary">待处理消息</h2><p role="alert" className="mt-1 text-sm text-studio-text-muted">{actionableMessages.error}</p></div><MessageSquareText aria-hidden="true" className="mt-1 h-5 w-5 shrink-0 text-studio-violet-contrast" /></div>
      <ActionButton variant="secondary" className="mt-3 w-full" disabled={actionableMessages.loading} onClick={actionableMessages.reload}>{actionableMessages.loading ? '正在重试…' : '重新加载'}</ActionButton>
    </section> : isManagementRole && actionableMessages.count > 0 ? <section aria-labelledby="mobile-home-actionable-messages-heading" className="rounded-2xl border border-studio-border-soft bg-studio-surface p-4 shadow-card">
      <div className="mb-3 flex items-start justify-between gap-3"><div><h2 id="mobile-home-actionable-messages-heading" className="text-base font-semibold text-studio-text-primary">待处理消息</h2><p className="mt-1 text-xs text-studio-text-muted">{actionableMessages.count} 条未读消息可直接跟进</p></div><MessageSquareText aria-hidden="true" className="mt-1 h-5 w-5 shrink-0 text-studio-violet-contrast" /></div>
      {actionableMessages.messages.slice(0, 2).map((message) => <p key={message.id} className="truncate py-1 text-sm text-studio-text-secondary">{message.title}</p>)}
      <ActionButton variant="primary" className="mt-3 w-full" onClick={() => navigate('/messages?filter=actionable', { state: { mobileReturnTo: '/' } })}>查看待处理消息 <ChevronRight className="h-4 w-4" /></ActionButton>
    </section> : null}
    {visibleActions.length ? <section><h2 className="mb-3 text-base font-semibold">快捷操作</h2><div className="grid grid-cols-2 gap-3">{visibleActions.map((action) => { const Icon = action.icon; return <button key={action.path} onClick={() => navigate(action.path, { state: { mobileReturnTo: '/' } })} className="flex min-h-24 flex-col justify-between rounded-2xl border border-studio-border-soft bg-studio-surface p-4 text-left"><Icon className="h-5 w-5 text-studio-cyan" /><span className="text-sm font-medium">{action.label}</span></button>; })}</div></section> : null}
    <section><div className="mb-3 flex items-center justify-between"><h2 className="text-base font-semibold">{attention?.scope === 'all-visible-content' ? '团队最近选题' : attention ? '我的最近选题' : '最近选题'}</h2><button onClick={() => navigate('/topics')} className="text-sm text-studio-cyan">查看全部</button></div>{attentionLoading ? <p className="text-sm text-studio-text-muted">正在加载…</p> : attentionError ? <p className="text-sm text-studio-text-muted">最近选题暂时无法确认，请使用上方重新加载。</p> : active.length ? <div className="space-y-2">{active.map((topic) => <button key={topic.id} onClick={() => navigate(`/topics/${topic.id}`, { state: { mobileReturnTo: '/' } })} className="flex w-full items-center gap-3 rounded-xl border border-studio-border-soft bg-studio-surface p-4 text-left"><FileText className="h-5 w-5 shrink-0 text-studio-cyan" /><span className="min-w-0 flex-1 truncate text-sm font-medium">{topic.title}</span><span className="text-xs text-studio-text-muted">{STATUS_TEXT[topic.status] || '状态待确认'}</span></button>)}</div> : <p className="text-sm text-studio-text-muted">当前没有进行中的选题。</p>}</section>
  </div>;
}
