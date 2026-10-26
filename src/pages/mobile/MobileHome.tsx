import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CalendarDays, ChevronRight, FilePlus2, FileText, Lightbulb, MessageCircle, PenLine } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { usePermission } from '@/hooks/usePermission';
import { useActionableMessages } from '@/hooks/useActionableMessages';
import { useAuthStore } from '@/store';
import { STATUS_TEXT } from '@/constants';
import { getHomeActivity, getHomeAttention, getInspirations, type HomeActivitySummary, type HomeAttentionSummary, type HomeAttentionTopic, type HomePipelineTopic } from '@/api';
import { ActionButton } from '@/components/studio';
import AnnouncementStrip from '@/components/AnnouncementStrip';
import { ProductionDraftSaveStatus } from '@/components/editor/ProductionDraftSaveStatus';
import { formatBeijingDate, formatBeijingTime } from '@/lib/utils';
import { isNative } from '@/platform/runtime';
import { orderHomeTasks, type HomeTaskCategory } from '@/lib/homeTaskOrdering';
import { getProductionVersionRoomId } from '@/collaboration/core/events';
import { getPlatformLabel } from '@/platform/platform-labels';

const quickActions = [
  { label: '提报选题', path: '/topics/add', icon: FilePlus2, permission: 'topic:create' },
  { label: '记灵感', path: '/inspirations', icon: Lightbulb, webOnly: true },
  { label: '写两句', path: '/production/content/new', icon: PenLine, permission: 'production:update', webOnly: true },
  { label: '写日报', path: '/daily-report', icon: PenLine, permission: 'report:daily:submit' },
  { label: '查看消息', path: '/messages', icon: MessageCircle },
  { label: '排期日历', path: '/calendar', icon: CalendarDays },
];

function attentionLabel(topic: HomeAttentionTopic) {
  if (topic.is_overdue) return { text: '已逾期', tone: 'bg-studio-coral/12 text-studio-coral-contrast' };
  if (topic.is_stalled) return { text: '阶段卡点', tone: 'bg-studio-amber/12 text-studio-amber-contrast' };
  return { text: '截止临近', tone: 'bg-studio-primary/12 text-studio-primary-contrast' };
}

type MobileTask = {
  id: string;
  category: HomeTaskCategory;
  label: string;
  title: string;
  detail: string;
  action: string;
  path: string;
  tone: string;
  saveDocId?: string;
};

type MobileStagePreview = { id: string; title: string; detail?: string; path: string };

function formatMobileStageElapsed(value?: string | null) {
  if (!value) return '阶段时间待确认';
  const normalized = value.includes('T') ? value : value.replace(' ', 'T');
  const dateValue = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(normalized) ? normalized : `${normalized}+08:00`;
  const enteredAt = Date.parse(dateValue);
  const elapsed = Date.now() - enteredAt;
  if (!Number.isFinite(enteredAt) || elapsed < 0) return '阶段时间待确认';
  if (elapsed < 60 * 60 * 1000) return '停留不到 1 小时';
  if (elapsed < 24 * 60 * 60 * 1000) return `停留 ${Math.floor(elapsed / (60 * 60 * 1000))} 小时`;
  return `停留 ${Math.floor(elapsed / (24 * 60 * 60 * 1000))} 天`;
}

function attentionDetail(topic: HomeAttentionTopic) {
  const label = attentionLabel(topic).text;
  return topic.deadline ? `${label} · 截止 ${formatBeijingDate(topic.deadline)}` : label;
}

const taskToneClasses: Record<HomeTaskCategory, string> = {
  message: 'bg-studio-violet/12 text-studio-violet-contrast',
  sync: 'bg-studio-coral/12 text-studio-coral-contrast',
  attention: 'bg-studio-amber/12 text-studio-amber-contrast',
  review: 'bg-studio-amber/12 text-studio-amber-contrast',
  'production-review': 'bg-studio-amber/12 text-studio-amber-contrast',
  draft: 'bg-studio-cyan/12 text-studio-cyan-contrast',
  publishing: 'bg-studio-primary/12 text-studio-primary-contrast',
};

const recentActivityToneClasses: Record<'version' | 'review' | 'reply' | 'topic_status', string> = {
  version: 'bg-studio-cyan/12 text-studio-cyan-contrast',
  review: 'bg-studio-violet/12 text-studio-violet-contrast',
  reply: 'bg-studio-primary/12 text-studio-primary-contrast',
  topic_status: 'bg-studio-amber/12 text-studio-amber-contrast',
};

export default function MobileHome() {
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const token = useAuthStore((state) => state.token);
  const userId = user?.id;
  const role = user?.role;
  const isManagementRole = user?.role === 'admin' || user?.role === 'director';
  const actionableMessages = useActionableMessages(isManagementRole);
  const { hasPermission, loading: permissionsLoading } = usePermission();
  const visibleActions = quickActions.filter((action) => (!action.webOnly || !isNative()) && (!action.permission || (!permissionsLoading && hasPermission(action.permission))));
  const [snapshot, setSnapshot] = useState<{
    userId: typeof userId; role: typeof role; token: typeof token;
    data: HomeAttentionSummary | null; error: string; loading: boolean;
  } | null>(null);
  const [inspirationSnapshot, setInspirationSnapshot] = useState<{
    userId: typeof userId; role: typeof role; token: typeof token;
    total: number | null; previews: Array<{ id: number; title: string }>; error: string; loading: boolean;
  } | null>(null);
  const [recentActivitySnapshot, setRecentActivitySnapshot] = useState<{
    userId: typeof userId; role: typeof role; token: typeof token;
    data: HomeActivitySummary | null; error: string; loading: boolean;
  } | null>(null);
  const [showAllTasks, setShowAllTasks] = useState(false);
  const [showRecentChanges, setShowRecentChanges] = useState(false);
  const [showStagePreviews, setShowStagePreviews] = useState(false);
  const request = useRef<AbortController | null>(null);
  const inspirationRequest = useRef(0);
  const recentActivityRequest = useRef<AbortController | null>(null);
  const current = snapshot?.userId === userId && snapshot?.role === role && snapshot?.token === token;
  const attention = current ? snapshot.data : null;
  const attentionError = current ? snapshot.error : '';
  const attentionLoading = !current || snapshot.loading;
  const active = attention?.active_topics?.topics ?? [];
  const inspirationCurrent = inspirationSnapshot?.userId === userId && inspirationSnapshot?.role === role && inspirationSnapshot?.token === token;
  const inspirationTotal = inspirationCurrent ? inspirationSnapshot.total : null;
  const inspirationPreviews = inspirationCurrent ? inspirationSnapshot.previews : [];
  const inspirationError = inspirationCurrent ? inspirationSnapshot.error : '';
  const inspirationLoading = !inspirationCurrent || inspirationSnapshot.loading;
  const recentActivityCurrent = recentActivitySnapshot !== null && recentActivitySnapshot.userId === userId
    && recentActivitySnapshot.role === role && recentActivitySnapshot.token === token;
  const recentActivity = recentActivityCurrent ? recentActivitySnapshot.data : null;
  const recentActivityError = recentActivityCurrent ? recentActivitySnapshot.error : '';
  const recentActivityLoading = Boolean(
    recentActivityCurrent && recentActivitySnapshot?.loading
      || showRecentChanges && userId && token && !recentActivityCurrent,
  );

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

  const loadInspirationTotal = useCallback(async () => {
    const requestId = ++inspirationRequest.current;
    setInspirationSnapshot({ userId, role, token, total: null, previews: [], error: '', loading: true });
    const isCurrent = () => {
      const auth = useAuthStore.getState();
      return inspirationRequest.current === requestId
        && auth.user?.id === userId && auth.user?.role === role && auth.token === token;
    };
    try {
      const result = await getInspirations({ limit: 3 });
      if (isCurrent()) setInspirationSnapshot({
        userId,
        role,
        token,
        total: result.total,
        previews: result.data.slice(0, 3).map(({ id, title }) => ({ id, title })),
        error: '',
        loading: false,
      });
    } catch {
      if (isCurrent()) setInspirationSnapshot({ userId, role, token, total: null, previews: [], error: '灵感数量暂时无法读取，请重试。', loading: false });
    }
  }, [userId, role, token]);

  const loadRecentActivity = useCallback(async () => {
    recentActivityRequest.current?.abort();
    const controller = new AbortController();
    recentActivityRequest.current = controller;
    const isCurrent = () => {
      const auth = useAuthStore.getState();
      return !controller.signal.aborted && recentActivityRequest.current === controller
        && auth.user?.id === userId && auth.user?.role === role && auth.token === token;
    };
    setRecentActivitySnapshot((currentSnapshot) => ({
      userId,
      role,
      token,
      data: currentSnapshot?.userId === userId && currentSnapshot?.role === role && currentSnapshot?.token === token
        ? currentSnapshot.data
        : null,
      error: '',
      loading: true,
    }));
    try {
      const result = await getHomeActivity(controller.signal);
      if (isCurrent()) setRecentActivitySnapshot({ userId, role, token, data: result, error: '', loading: false });
    } catch (error) {
      if (isCurrent()) setRecentActivitySnapshot((currentSnapshot) => ({
        userId,
        role,
        token,
        data: currentSnapshot?.userId === userId && currentSnapshot?.role === role && currentSnapshot?.token === token
          ? currentSnapshot.data
          : null,
        error: error instanceof Error ? error.message : '最近变化暂时无法读取，请重试。',
        loading: false,
      }));
    }
  }, [userId, role, token]);

  useEffect(() => {
    void loadInspirationTotal();
    return () => { inspirationRequest.current += 1; };
  }, [loadInspirationTotal]);

  useEffect(() => {
    if (!showRecentChanges || !userId || !token) {
      recentActivityRequest.current?.abort();
      return;
    }
    void loadRecentActivity();
    return () => { recentActivityRequest.current?.abort(); };
  }, [loadRecentActivity, showRecentChanges, token, userId]);

  const isReviewFirst = role === 'admin' || role === 'director' || hasPermission('topic:audit') || hasPermission('production:update');
  const taskHeading = isManagementRole ? '团队今日重点' : isReviewFirst ? '审核与内容推进' : '我的今日任务';
  const taskDescription = isManagementRole
    ? '优先处理待办消息和数据异常，再跟进团队选题与审核事项'
    : isReviewFirst
      ? '优先处理待审核内容，再跟进团队卡点和发布安排'
      : '优先继续自己的稿件，再跟进临近事项和发布安排';
  const todayTasks = useMemo<MobileTask[]>(() => {
    const tasks: MobileTask[] = [];
    if (isManagementRole && actionableMessages.count > 0) tasks.push({
      id: 'actionable-messages', category: 'message', label: '待处理消息', title: actionableMessages.messages[0]?.title || `${actionableMessages.count} 条消息待跟进`,
      detail: `${actionableMessages.count} 条未读消息可直接跟进`, action: '处理消息', path: '/messages?filter=actionable', tone: taskToneClasses.message,
    });
    if (isManagementRole && attention?.sync_anomalies.available) attention.sync_anomalies.tasks.forEach((task) => tasks.push({
      id: `sync-${task.id}`, category: 'sync', label: '同步异常', title: task.account_name,
      detail: `${task.status === 'failed' ? '同步失败' : '部分同步失败'} · ${task.failed_count} 项未同步${task.owner_name ? ` · ${task.owner_name}` : ''}`,
      action: '查看同步', path: `/analytics/creator-center?account_id=${encodeURIComponent(task.account_uid)}`,
      tone: task.status === 'failed' ? 'bg-studio-coral/12 text-studio-coral-contrast' : 'bg-studio-amber/12 text-studio-amber-contrast',
    }));
    (attention?.topics ?? []).forEach((topic) => {
      const label = attentionLabel(topic);
      tasks.push({
        id: `attention-${topic.id}`, category: 'attention', label: label.text, title: topic.title, detail: attentionDetail(topic),
        action: '跟进选题', path: `/topics/${topic.id}`, tone: label.tone,
      });
    });
    if (attention?.production_reviews.available) attention.production_reviews.tasks.forEach((task) => tasks.push({
      id: `production-review-${task.id}`, category: 'production-review', label: '待审核稿件', title: task.topic_title,
      detail: `${task.version || '当前版本'} · ${task.assignee_name ? `选题负责人：${task.assignee_name}` : '选题负责人待确认'}`,
      action: '审核稿件', path: `/production/${task.id}?action=review`, tone: taskToneClasses['production-review'],
    }));
    if (hasPermission('topic:audit')) (attention?.topic_stages.pending.topics || []).forEach((topic) => tasks.push({
      id: `topic-review-${topic.id}`, category: 'review', label: '待审核选题', title: topic.title,
      detail: `${topic.creator_name || '团队成员'} · ${formatBeijingDate(topic.created_at)}`,
      action: '开始审核', path: `/topics/${topic.id}?action=audit`, tone: taskToneClasses.review,
    }));
    (attention?.my_drafts.tasks || []).forEach((task) => tasks.push({
      id: `draft-${task.id}`, category: 'draft', label: '我的稿件', title: task.topic_title || `创作记录 #${task.id}`,
      detail: `${task.status === 'rejected' ? '退回修改' : '草稿待续写'} · ${task.version || '当前版本'} · ${formatBeijingTime(task.updated_at)}`,
      action: task.status === 'rejected' ? '处理退回' : '继续写稿', path: `/production/${task.id}`,
      tone: task.status === 'rejected' ? 'bg-studio-coral/12 text-studio-coral-contrast' : taskToneClasses.draft,
      saveDocId: getProductionVersionRoomId(task.id, String(task.version)),
    }));
    if (hasPermission('workflow:publishing')) (attention?.today_publishing.tasks || []).forEach((task) => tasks.push({
      id: `publishing-${task.id}`, category: 'publishing', label: '今日发布', title: task.topic_title,
      detail: `${getPlatformLabel(task.platform) || '平台待确认'} · ${formatBeijingDate(task.publish_time)} ${formatBeijingTime(task.publish_time, { hour: '2-digit', minute: '2-digit' })}`,
      action: '去发布', path: `/publishing/${task.id}`, tone: taskToneClasses.publishing,
    }));
    return orderHomeTasks(tasks, { isManagementRole, isReviewFirst });
  }, [actionableMessages.count, actionableMessages.messages, attention, hasPermission, isManagementRole, isReviewFirst]);
  const visibleTodayTasks = showAllTasks ? todayTasks : todayTasks.slice(0, 3);
  const remainingTaskCount = Math.max(0, todayTasks.length - visibleTodayTasks.length);
  const mobileStages: Array<{ id: string; label: string; count: number | null; path: string; previews: MobileStagePreview[] }> = [
    { id: 'ideas', label: '灵感池', count: inspirationTotal, path: '/inspirations', previews: inspirationPreviews.slice(0, 3).map((item) => ({ id: `inspiration-${item.id}`, title: item.title, path: '/inspirations' })) },
    { id: 'pending', label: '待审', count: attention?.topic_stages.pending.total ?? null, path: '/topics?status=pending', previews: (attention?.topic_stages.pending.topics || []).slice(0, 3).map((topic: HomePipelineTopic) => ({ id: `topic-${topic.id}`, title: topic.title, detail: formatMobileStageElapsed(topic.stage_entered_at), path: `/topics/${topic.id}` })) },
    { id: 'production', label: '创作中', count: attention?.topic_stages.production.total ?? null, path: '/topics?status=creation', previews: (attention?.topic_stages.production.topics || []).slice(0, 3).map((topic: HomePipelineTopic) => ({ id: `topic-${topic.id}`, title: topic.title, detail: topic.status === 'approved' ? `已通过 · 待开始创作 · ${formatMobileStageElapsed(topic.stage_entered_at)}` : formatMobileStageElapsed(topic.stage_entered_at), path: `/topics/${topic.id}` })) },
    { id: 'shooting', label: '成片', count: attention?.topic_stages.shooting.total ?? null, path: '/topics?status=shooting', previews: (attention?.topic_stages.shooting.topics || []).slice(0, 3).map((topic: HomePipelineTopic) => ({ id: `topic-${topic.id}`, title: topic.title, detail: formatMobileStageElapsed(topic.stage_entered_at), path: `/topics/${topic.id}` })) },
    { id: 'publishing', label: '待发', count: attention?.topic_stages.publishing.total ?? null, path: '/topics?status=publishing', previews: (attention?.topic_stages.publishing.topics || []).slice(0, 3).map((topic: HomePipelineTopic) => ({ id: `topic-${topic.id}`, title: topic.title, detail: formatMobileStageElapsed(topic.stage_entered_at), path: `/topics/${topic.id}` })) },
    { id: 'completed', label: '已发', count: attention?.topic_stages.completed.total ?? null, path: '/topics?status=completed', previews: (attention?.topic_stages.completed.topics || []).slice(0, 3).map((topic: HomePipelineTopic) => ({ id: `topic-${topic.id}`, title: topic.title, detail: formatMobileStageElapsed(topic.stage_entered_at), path: `/topics/${topic.id}` })) },
    {
      id: 'review',
      label: '复盘',
      count: attention?.retrospectives.available ? attention.retrospectives.total : null,
      path: '/retrospectives',
      previews: attention?.retrospectives.available
        ? attention.retrospectives.tasks.slice(0, 3).map((item) => ({ id: `retrospective-${item.id}`, title: item.title, detail: `${formatBeijingDate(item.updated_at)} · ${item.status === 'published' ? '已发布' : item.status === 'draft' ? '草稿' : '已归档'}`, path: `/retrospectives/${item.id}` }))
        : [],
    },
  ];

  return <div className="space-y-4">
    {!isNative() ? <AnnouncementStrip embedded /> : null}
    <section className="rounded-2xl border border-studio-border-soft bg-studio-surface p-4 shadow-card">
      <p className="text-sm text-studio-text-secondary">你好，{user?.name ?? '同事'}</p>
      <h2 className="mt-1 text-xl font-semibold text-studio-text-primary">今天，先完成最重要的工作</h2>
    </section>
    <section aria-labelledby="mobile-home-tasks-heading" className="rounded-2xl border border-studio-border-soft bg-studio-surface p-4 shadow-card">
      <div className="mb-3">
        <h2 id="mobile-home-tasks-heading" className="text-base font-semibold text-studio-text-primary">{taskHeading}</h2>
        <p className="mt-1 text-xs text-studio-text-secondary">{taskDescription}</p>
      </div>
      {isManagementRole && actionableMessages.error ? <div role="alert" className="mb-3 rounded-xl border border-studio-coral/30 bg-studio-coral/8 p-3">
        <p className="text-sm text-studio-coral-contrast">{actionableMessages.error}</p>
        <ActionButton variant="secondary" className="mt-3 w-full" disabled={actionableMessages.loading} onClick={actionableMessages.reload}>{actionableMessages.loading ? '正在重试…' : '重新加载消息'}</ActionButton>
      </div> : null}
      {attentionError ? <div role="alert" className="mb-3 rounded-xl border border-studio-coral/30 bg-studio-coral/8 p-3">
        <p className="text-sm text-studio-coral-contrast">{attentionError}</p>
        <ActionButton variant="secondary" className="mt-3 w-full" onClick={() => void loadAttention()}>重新加载</ActionButton>
      </div> : null}
      {visibleTodayTasks.length ? <div className="divide-y divide-studio-border-soft" data-testid="mobile-home-priority-tasks">
        {visibleTodayTasks.map((task) => <ActionButton
          key={task.id}
          data-testid="mobile-home-task"
          variant="ghost"
          className="h-auto w-full justify-between gap-3 px-2 py-3 text-left"
          onClick={() => navigate(task.path, { state: { mobileReturnTo: '/' } })}
        >
          <span className="min-w-0 flex-1">
            <span className="mb-1 flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${task.tone}`}>{task.label}</span>
              {task.saveDocId ? <ProductionDraftSaveStatus docId={task.saveDocId} userId={userId} testId="mobile-home-draft-save-status" /> : null}
            </span>
            <strong className="block truncate text-sm font-medium text-studio-text-primary">{task.title}</strong>
            <small className="mt-0.5 block truncate text-xs text-studio-text-secondary">{task.detail}</small>
          </span>
          <span className="shrink-0 text-xs font-semibold text-studio-primary-contrast">{task.action}</span>
          <ChevronRight aria-hidden="true" className="h-4 w-4 shrink-0 text-studio-text-secondary" />
        </ActionButton>)}
      </div> : attentionLoading || (isManagementRole && actionableMessages.loading) ? <p role="status" aria-live="polite" className="py-2 text-sm text-studio-text-secondary">正在整理今日任务…</p> : <p className="py-2 text-sm text-studio-text-secondary">当前没有需要立即处理的任务。</p>}
      {remainingTaskCount > 0 ? <ActionButton
        variant="ghost"
        className="mt-2 w-full justify-center py-2 text-sm"
        onClick={() => setShowAllTasks(true)}
      >查看剩余 {remainingTaskCount} 项</ActionButton> : showAllTasks && todayTasks.length > 3 ? <ActionButton
        variant="ghost"
        className="mt-2 w-full justify-center py-2 text-sm"
        onClick={() => setShowAllTasks(false)}
      >收起任务</ActionButton> : null}
    </section>
    <section aria-labelledby="mobile-home-stages-heading" className="rounded-2xl border border-studio-border-soft bg-studio-surface p-4 shadow-card">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div><h2 id="mobile-home-stages-heading" className="text-base font-semibold text-studio-text-primary">内容阶段</h2><p className="mt-1 text-xs text-studio-text-secondary">点选阶段查看对应内容</p></div>
      </div>
      <div className="flex w-full min-w-0 gap-2 overflow-x-auto pb-1" role="list" aria-label="内容生产各阶段">
        {mobileStages.map((stage) => <div role="listitem" key={stage.id}>
          <ActionButton
            variant="ghost"
            className="relative h-auto min-w-[72px] shrink-0 flex-col gap-1 rounded-xl bg-[var(--xmt-overlay-tint)] px-3 py-2 text-center"
            aria-describedby={stage.count === null ? `mobile-home-stage-${stage.id}-count-unavailable` : undefined}
            onClick={() => navigate(stage.path, { state: { mobileReturnTo: '/' } })}
          >
            <span className="text-base font-semibold text-studio-text-primary">{stage.count ?? '—'}</span>
            <span className="text-xs text-studio-text-secondary">{stage.label}</span>
            {stage.count === null ? <span id={`mobile-home-stage-${stage.id}-count-unavailable`} className="sr-only">数量暂不可用</span> : null}
          </ActionButton>
        </div>)}
      </div>
      <div className="mt-3 rounded-xl border border-studio-border-soft px-3 py-2">
        <button
          type="button"
          className="flex w-full items-center justify-between gap-3 text-left"
          aria-controls="mobile-home-stage-previews"
          aria-expanded={showStagePreviews}
          onClick={() => setShowStagePreviews((current) => !current)}
        >
          <span>
            <span className="block text-sm font-medium text-studio-text-primary">各阶段最新内容</span>
            <span className="mt-0.5 block text-xs text-studio-text-secondary">每阶段最多 3 条，含阶段停留时间</span>
          </span>
          <ChevronRight aria-hidden="true" className={`h-4 w-4 shrink-0 text-studio-text-secondary transition-transform ${showStagePreviews ? 'rotate-90' : ''}`} />
        </button>
        <div id="mobile-home-stage-previews" className="mt-2 space-y-3 border-t border-studio-border-soft pt-3" hidden={!showStagePreviews}>
          {attentionLoading || inspirationLoading ? <p className="text-sm text-studio-text-secondary" role="status">正在读取阶段最新内容…</p> : (
            <div className="space-y-3" data-testid="mobile-home-stage-preview-list">
              {mobileStages.map((stage) => <section key={stage.id} className="rounded-xl bg-[var(--xmt-overlay-tint)] p-3" aria-labelledby={`mobile-home-stage-${stage.id}`}>
                <div className="mb-2 flex items-center justify-between gap-2">
                  <h3 id={`mobile-home-stage-${stage.id}`} className="text-sm font-semibold text-studio-text-primary">{stage.label} · {stage.count === null ? '—' : stage.count}</h3>
                  <ActionButton variant="ghost" className="shrink-0 px-2 py-1 text-xs" onClick={() => navigate(stage.path, { state: { mobileReturnTo: '/' } })}>查看全部</ActionButton>
                </div>
                {stage.count === null ? stage.id === 'review' && attention && !attention.retrospectives.available
                  ? <div className="space-y-2" role="alert">
                    <p className="text-xs text-studio-coral-contrast">复盘摘要暂时无法读取，当前无法确认是否有复盘记录。</p>
                    <ActionButton variant="secondary" className="w-full justify-center px-3 py-1 text-sm" disabled={attentionLoading} onClick={() => void loadAttention()}>
                      {attentionLoading ? '正在重新读取…' : '重试读取复盘'}
                    </ActionButton>
                  </div>
                  : <p className="text-xs text-studio-coral-contrast">{stage.id === 'ideas' ? inspirationError || '暂时无法读取灵感内容。' : attentionError || '暂时无法读取阶段内容。'}</p>
                  : stage.previews.length ? <div className="space-y-1">
                    {stage.previews.slice(0, 3).map((preview) => <ActionButton key={preview.id} variant="ghost" className="h-auto w-full justify-between gap-2 px-2 py-2 text-left" data-testid="mobile-home-stage-preview" onClick={() => navigate(preview.path, { state: { mobileReturnTo: '/' } })}>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm text-studio-text-primary">{preview.title}</span>
                        {preview.detail ? <small className="mt-0.5 block text-xs text-studio-text-secondary">{preview.detail}</small> : null}
                      </span>
                      <ChevronRight aria-hidden="true" className="h-4 w-4 shrink-0 text-studio-text-secondary" />
                    </ActionButton>)}
                  </div> : <p className="text-xs text-studio-text-secondary">当前没有内容</p>}
              </section>)}
            </div>
          )}
        </div>
      </div>
      {inspirationError ? <div role="alert" className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-studio-coral-contrast">{inspirationError}</p>
        <ActionButton variant="secondary" className="px-3 py-1 text-sm" disabled={inspirationLoading} onClick={() => void loadInspirationTotal()}>重新加载</ActionButton>
      </div> : inspirationLoading ? <p role="status" aria-live="polite" className="mt-2 text-xs text-studio-text-secondary">正在读取灵感数量…</p> : null}
    </section>
    <section className="rounded-2xl border border-studio-border-soft bg-studio-surface p-4 shadow-card">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-3 text-left"
        aria-controls="mobile-home-recent-changes"
        aria-expanded={showRecentChanges}
        onClick={() => setShowRecentChanges((current) => !current)}
      >
        <span className="min-w-0">
          <span className="block text-base font-semibold text-studio-text-primary">最近变化</span>
          <span className="mt-1 block text-xs text-studio-text-secondary">稿件版本、批注回复与选题状态变化</span>
        </span>
        <ChevronRight aria-hidden="true" className={`h-5 w-5 shrink-0 text-studio-text-secondary transition-transform ${showRecentChanges ? 'rotate-90' : ''}`} />
      </button>
      <div id="mobile-home-recent-changes" className="mt-3 border-t border-studio-border-soft pt-3" hidden={!showRecentChanges}>
        {recentActivityLoading && !recentActivity ? <p className="py-2 text-sm text-studio-text-secondary" role="status">正在读取最近变化…</p> : null}
        {recentActivityLoading && recentActivity ? <p className="pb-2 text-xs text-studio-text-secondary" role="status">正在更新；上次成功读取的内容仍可查看。</p> : null}
        {recentActivityError ? <div className="mb-3 rounded-xl border border-studio-coral/30 bg-studio-coral/8 p-3" role="alert">
          <p className="text-sm text-studio-coral-contrast">{recentActivityError}</p>
          {recentActivity ? <p className="mt-1 text-xs text-studio-text-secondary">仍显示最近一次成功读取的内容，可能不是最新。</p> : null}
          <ActionButton variant="secondary" className="mt-3 w-full" disabled={recentActivityLoading} onClick={() => void loadRecentActivity()}>{recentActivityLoading ? '正在重试…' : '重新加载最近变化'}</ActionButton>
        </div> : null}
        {recentActivity && recentActivity.events.length > 0 ? <>
          <p className="mb-2 text-xs text-studio-text-secondary">{recentActivity.scope === 'all-visible-content' ? '团队可见范围' : '仅展示你可访问的内容变化'} · 最近 {Math.min(5, recentActivity.events.length)} 条</p>
          <div className="divide-y divide-studio-border-soft" data-testid="mobile-home-recent-changes-list">
            {recentActivity.events.slice(0, 5).map((event) => <ActionButton
              key={event.id}
              data-testid="mobile-home-recent-change"
              variant="ghost"
              className="h-auto w-full justify-between gap-3 px-2 py-3 text-left"
              onClick={() => navigate(event.path, { state: { mobileReturnTo: '/' } })}
            >
              <span className="min-w-0 flex-1">
                <span className={`mb-1 inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${recentActivityToneClasses[event.kind]}`}>{event.label}</span>
                <strong className="block truncate text-sm font-medium text-studio-text-primary">{event.title}</strong>
                <small className="mt-0.5 block truncate text-xs text-studio-text-secondary">{event.detail}</small>
                <small className="mt-1 block text-xs text-studio-text-secondary">{formatBeijingTime(event.occurred_at)}</small>
              </span>
              <ChevronRight aria-hidden="true" className="h-4 w-4 shrink-0 text-studio-text-secondary" />
            </ActionButton>)}
          </div>
          {!recentActivityLoading && !recentActivityError ? <ActionButton variant="ghost" className="mt-2 w-full justify-center text-sm" onClick={() => void loadRecentActivity()}>刷新最近变化</ActionButton> : null}
        </> : null}
        {recentActivity && recentActivity.events.length === 0 && !recentActivityLoading && !recentActivityError ? <p className="py-2 text-sm text-studio-text-secondary">目前没有可显示的稿件或选题变化。</p> : null}
        {!recentActivity && !recentActivityLoading && !recentActivityError ? <ActionButton variant="secondary" className="w-full" onClick={() => void loadRecentActivity()}>加载最近变化</ActionButton> : null}
      </div>
    </section>
    <section aria-labelledby="mobile-home-attention-heading" className="rounded-2xl border border-studio-border-soft bg-studio-surface p-4 shadow-card">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          {attention ? <p className="text-xs font-medium text-studio-text-secondary">{attention.scope === 'all-visible-content' ? '团队范围' : '个人范围'}</p> : null}
          <h2 id="mobile-home-attention-heading" className="mt-1 text-base font-semibold text-studio-text-primary">
            {attention?.scope === 'all-visible-content' ? '团队选题关注' : attention ? '我的选题关注' : '选题关注'}
          </h2>
        </div>
        <ActionButton variant="ghost" className="px-2 py-1 text-sm" onClick={() => navigate('/topics', { state: { mobileReturnTo: '/' } })}>查看选题</ActionButton>
      </div>
      {attentionLoading ? <p className="text-sm text-studio-text-secondary">正在读取关注事项…</p> : attentionError ? (
        <p className="text-sm text-studio-coral-contrast">关注事项暂不可用，请在今日任务卡重试。</p>
      ) : attention ? (
        <>
          <div className="grid grid-cols-3 gap-2" aria-label={`${attention.counts.total} 项需要跟进`}>
            {[
              { label: '逾期', count: attention.counts.overdue },
              { label: '卡点', count: attention.counts.stalled },
              { label: '临近截止', count: attention.counts.due_soon },
            ].map((item) => <div key={item.label} className="rounded-xl bg-[var(--xmt-overlay-tint)] px-2 py-2 text-center">
              <p className="text-lg font-semibold text-studio-text-primary">{item.count}</p>
              <p className="text-xs text-studio-text-secondary">{item.label}</p>
            </div>)}
          </div>
          {attention.counts.stage_time_unknown > 0 ? <p className="mt-2 text-xs text-studio-text-secondary">{attention.counts.stage_time_unknown} 项内容的当前阶段时间待确认，暂不计入卡点；这不代表它们一定没有卡点。</p> : null}
        </>
      ) : null}
    </section>
    {visibleActions.length ? <section><h2 className="mb-3 text-base font-semibold">快捷操作</h2><div className="grid grid-cols-2 gap-3">{visibleActions.map((action) => { const Icon = action.icon; return <ActionButton key={action.path} data-testid="mobile-home-quick-action" variant="ghost" onClick={() => navigate(action.path, { state: { mobileReturnTo: '/' } })} className="h-auto min-h-24 w-full flex-col items-start justify-between rounded-2xl border border-studio-border-soft bg-studio-surface p-4 text-left"><Icon className="h-5 w-5 text-studio-cyan" /><span className="text-sm font-medium">{action.label}</span></ActionButton>; })}</div></section> : null}
    <section>
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-studio-text-primary">{attention?.scope === 'all-visible-content' ? '团队进行中的选题' : attention ? '我的进行中的选题' : '进行中的选题'}</h2>
          {attention && !attentionError ? <p data-testid="mobile-home-active-topic-summary" className="mt-1 text-xs text-studio-text-secondary">共 {attention.active_topics.total} 项 · 展示最近 {active.length} 项</p> : null}
        </div>
        <ActionButton variant="ghost" className="shrink-0 px-2 py-1 text-sm" onClick={() => navigate('/topics', { state: { mobileReturnTo: '/' } })}>查看全部</ActionButton>
      </div>
      {attentionLoading ? <p className="text-sm text-studio-text-secondary">正在加载…</p>
        : attentionError ? <p className="text-sm text-studio-coral-contrast">进行中选题暂时无法确认，请使用上方重新加载。</p>
          : active.length ? <div className="space-y-2">{active.map((topic) => <ActionButton key={topic.id} variant="ghost" onClick={() => navigate(`/topics/${topic.id}`, { state: { mobileReturnTo: '/' } })} className="h-auto w-full justify-start gap-3 rounded-xl border border-studio-border-soft bg-studio-surface p-4 text-left">
            <FileText aria-hidden="true" className="h-5 w-5 shrink-0 text-studio-cyan" />
            <span className="min-w-0 flex-1 truncate text-sm font-medium text-studio-text-primary">{topic.title}</span>
            <span className="shrink-0 text-xs text-studio-text-secondary">{STATUS_TEXT[topic.status] || '状态待确认'}</span>
          </ActionButton>)}</div>
            : attention?.active_topics.total ? <p className="text-sm text-studio-text-secondary">共 {attention.active_topics.total} 项进行中选题，预览暂不可用；可查看全部。</p>
              : <p className="text-sm text-studio-text-secondary">当前没有进行中的选题。</p>}
    </section>
  </div>;
}
