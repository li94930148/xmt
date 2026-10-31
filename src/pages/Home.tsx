import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  Clock3,
  FilePenLine,
  Lightbulb,
  MessageSquareText,
  PenLine,
  Send,
  Sparkles,
  Video,
} from 'lucide-react';
import { getHomeActivity, getHomeAttention, getInspirations } from '../api';
import type { HomeActivitySummary, HomeAttentionSummary, HomePipelineTopic } from '../api';
import { getDouyinDashboard, type DouyinDashboardData } from '../api/creatorCenter';
import type { Inspiration, TopicStatus } from '../types';
import { useAuthStore } from '../store';
import { usePermission } from '../hooks/usePermission';
import { useActionableMessages } from '../hooks/useActionableMessages';
import {
  ActionButton,
  EmptyState,
  GlassPanel,
  PageHeader,
  PageShell,
  StatusPill,
  StudioSkeletonCard,
} from '../components/studio';
import { formatBeijingDate, formatBeijingTime } from '../lib/utils';
import { getUserFacingErrorMessage } from '../lib/userFacingError';
import { orderHomeTasks, type HomeTaskCategory } from '../lib/homeTaskOrdering';
import { getPlatformLabel } from '../platform/platform-labels';
import { getProductionVersionRoomId } from '../collaboration/core/events';
import { ProductionDraftSaveStatus } from '../components/editor/ProductionDraftSaveStatus';
import HomeCrossModuleOverview from '../components/home/HomeCrossModuleOverview';

type Tone = 'primary' | 'cyan' | 'violet' | 'coral' | 'amber' | 'success' | 'muted';

type TaskItem = {
  id: string;
  category: HomeTaskCategory;
  title: string;
  context: string;
  meta: string;
  path: string;
  action: string;
  tone: Tone;
  icon: typeof Clock3;
  saveDocId?: string;
};

type ChangeItem = {
  id: string;
  type: string;
  title: string;
  detail: string;
  time: string;
  path: string;
  tone: Tone;
};

type StagePreview = {
  title: string;
  stageEnteredAt?: string | null;
  detail?: string;
};

type StageConfig = {
  id: string;
  label: string;
  count: number | null;
  icon: typeof Clock3;
  tone: Tone;
  path: string;
  items: StagePreview[];
};

type HomeCreatorMetricsState =
  | { userId: number; status: 'loading' | 'empty' | 'error' }
  | { userId: number; status: 'ready'; data: DouyinDashboardData };

type HomeActivityState = {
  userId: number | null;
  role: string | undefined;
  token: string | null;
  data: HomeActivitySummary | null;
  error: string;
  loading: boolean;
};

type HomeDashboardIdentity = {
  userId: number | null;
  role: string | undefined;
  token: string | null;
};

const topicStatusText: Record<TopicStatus, string> = {
  pending: '待审核',
  approved: '已通过',
  rejected: '已退回',
  production: '创作中',
  shooting: '成片制作',
  publishing: '待发布',
  completed: '已发布',
};

const retrospectiveStatusText = {
  draft: '草稿',
  published: '已发布',
  archived: '已归档',
} as const;

const stageToneClasses: Record<string, string> = {
  amber: 'bg-studio-amber/12 text-studio-amber-contrast',
  cyan: 'bg-studio-cyan/12 text-studio-cyan-contrast',
  violet: 'bg-studio-violet/12 text-studio-violet-contrast',
  coral: 'bg-studio-coral/12 text-studio-coral-contrast',
  success: 'bg-studio-success/12 text-studio-success-contrast',
  primary: 'bg-studio-primary/12 text-studio-primary-contrast',
};

function latestTopicPreviews(items: HomePipelineTopic[]): StagePreview[] {
  return items.slice(0, 3).map((item) => ({
    title: item.title,
    stageEnteredAt: item.stage_entered_at ?? null,
    detail: item.status === 'approved' ? '已通过 · 待开始创作' : undefined,
  }));
}

function formatStageElapsed(value?: string | null) {
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

export default function Home() {
  const [inspirations, setInspirations] = useState<Inspiration[]>([]);
  const [inspirationTotal, setInspirationTotal] = useState<number | null>(null);
  const [attention, setAttention] = useState<HomeAttentionSummary | null>(null);
  const [dashboardIdentity, setDashboardIdentity] = useState<HomeDashboardIdentity>({ userId: null, role: undefined, token: null });
  const [recentActivityState, setRecentActivityState] = useState<HomeActivityState>({ userId: null, role: undefined, token: null, data: null, error: '', loading: true });
  const [recentActivityReload, setRecentActivityReload] = useState(0);
  const [creatorMetricsState, setCreatorMetricsState] = useState<HomeCreatorMetricsState>({ userId: -1, status: 'loading' });
  const [creatorMetricsReload, setCreatorMetricsReload] = useState(0);
  const [attentionError, setAttentionError] = useState('');
  const [attentionLoading, setAttentionLoading] = useState(true);
  const [loading, setLoading] = useState(true);
  const [loadIssues, setLoadIssues] = useState<string[]>([]);
  const [dashboardReload, setDashboardReload] = useState(0);
  const [showChanges, setShowChanges] = useState(true);
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const token = useAuthStore((state) => state.token);
  const currentUserId = user?.id;
  const { loading: permissionsLoading, hasPermission } = usePermission();
  const dashboardMatchesCurrentIdentity = dashboardIdentity.userId === (currentUserId ?? null)
    && dashboardIdentity.role === user?.role
    && dashboardIdentity.token === token;
  const canCreateTopic = !permissionsLoading && hasPermission('topic:create');
  const canWriteProduction = !permissionsLoading && hasPermission('production:update');
  const canViewCreatorMetrics = !permissionsLoading && hasPermission('creator:data:view');
  const isManagementRole = user?.role === 'admin' || user?.role === 'director';
  const actionableMessages = useActionableMessages(isManagementRole);

  useEffect(() => {
    if (!user || permissionsLoading) return;

    const requestIdentity: HomeDashboardIdentity = { userId: user.id, role: user.role, token };
    let cancelled = false;
    const fetchDashboard = async () => {
      setLoading(true);
      setDashboardIdentity({ userId: null, role: undefined, token: null });
      setInspirations([]);
      setInspirationTotal(null);
      setAttention(null);
      setLoadIssues([]);
      setAttentionError('');
      setAttentionLoading(true);
      const requests = await Promise.allSettled([
        getInspirations({ limit: 4 }),
        getHomeAttention(),
      ]);

      if (cancelled) return;
      const [ideaResult, attentionResult] = requests;
      const failedSections = ideaResult.status === 'rejected' ? ['灵感池'] : [];
      if (attentionResult.status === 'fulfilled' && !attentionResult.value.retrospectives.available) failedSections.push('复盘');
      if (attentionResult.status === 'fulfilled' && !attentionResult.value.my_retro_actions.available) failedSections.push('复盘行动项');

      setInspirations(ideaResult.status === 'fulfilled' ? ideaResult.value.data : []);
      setInspirationTotal(ideaResult.status === 'fulfilled' ? ideaResult.value.total : null);
      if (attentionResult.status === 'fulfilled') setAttention(attentionResult.value);
      else {
        setAttention(null);
        setAttentionError(getUserFacingErrorMessage(attentionResult.reason, '工作台摘要暂时无法读取，请重试。'));
      }
      setAttentionLoading(false);

      setLoadIssues(failedSections);
      setDashboardIdentity(requestIdentity);
      setLoading(false);
    };

    void fetchDashboard();
    return () => { cancelled = true; };
  }, [dashboardReload, permissionsLoading, token, user]);

  useEffect(() => {
    if (!user) {
      setRecentActivityState({ userId: null, role: undefined, token: null, data: null, error: '', loading: true });
      return;
    }
    if (permissionsLoading) return;

    const requestUserId = user.id;
    const requestRole = user.role;
    const requestToken = token;
    let cancelled = false;
    setRecentActivityState((current) => ({
      userId: requestUserId,
      role: requestRole,
      token: requestToken,
      data: current.userId === requestUserId && current.role === requestRole && current.token === requestToken ? current.data : null,
      error: '',
      loading: true,
    }));
    getHomeActivity()
      .then((summary) => {
        if (!cancelled) setRecentActivityState((current) => current.userId === requestUserId && current.role === requestRole && current.token === requestToken
          ? { ...current, data: summary, error: '' }
          : current);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        const message = getUserFacingErrorMessage(error, '最近变化暂时无法读取，请重试。');
        setRecentActivityState((current) => current.userId === requestUserId && current.role === requestRole && current.token === requestToken
          ? { ...current, error: message }
          : current);
      })
      .finally(() => {
        if (!cancelled) setRecentActivityState((current) => current.userId === requestUserId && current.role === requestRole && current.token === requestToken
          ? { ...current, loading: false }
          : current);
      });

    return () => { cancelled = true; };
  }, [permissionsLoading, recentActivityReload, token, user]);

  useEffect(() => {
    if (currentUserId === undefined || permissionsLoading) return;

    if (!canViewCreatorMetrics) {
      setCreatorMetricsState({ userId: currentUserId, status: 'empty' });
      return;
    }

    const controller = new AbortController();
    let cancelled = false;
    setCreatorMetricsState({ userId: currentUserId, status: 'loading' });
    getDouyinDashboard(undefined, controller.signal)
      .then((data) => {
        if (!cancelled) setCreatorMetricsState({ userId: currentUserId, status: 'ready', data });
      })
      .catch((error: unknown) => {
        if (cancelled || controller.signal.aborted) return;
        const message = error instanceof Error ? error.message : '';
        const noAvailableAccount = /未找到已同步抖音账号|尚未完成标准化同步/.test(message);
        setCreatorMetricsState({ userId: currentUserId, status: noAvailableAccount ? 'empty' : 'error' });
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [canViewCreatorMetrics, creatorMetricsReload, currentUserId, permissionsLoading]);

  const tasks = useMemo<TaskItem[]>(() => {
    const result: TaskItem[] = [];
    if (isManagementRole && actionableMessages.count > 0) {
      result.push({
        id: 'actionable-messages',
        category: 'message',
        title: '待处理消息',
        context: actionableMessages.messages[0]?.title || `${actionableMessages.count} 条消息有后续操作`,
        meta: `${actionableMessages.count} 条未读消息可直接跟进`,
        path: '/messages?filter=actionable',
        action: '处理消息',
        tone: 'violet',
        icon: MessageSquareText,
      });
    }
    if (isManagementRole && attention?.sync_anomalies.available) {
      attention.sync_anomalies.tasks.forEach((item) => result.push({
        id: `sync-anomaly-${item.id}`,
        category: 'sync',
        title: item.status === 'failed' ? '同步失败' : '同步未完整',
        context: item.account_name,
        meta: `${item.owner_name ? `${item.owner_name} · ` : ''}${formatBeijingDate(item.start_time)} ${formatBeijingTime(item.start_time, { hour: '2-digit', minute: '2-digit' })} · ${item.failed_count} 项未同步`,
        path: `/analytics/creator-center?account_id=${encodeURIComponent(item.account_uid)}`,
        action: '查看同步',
        tone: item.status === 'failed' ? 'coral' : 'amber',
        icon: CircleAlert,
      }));
    }
    (attention?.topics || []).forEach((topic) => {
      const label = topic.is_overdue ? '已逾期' : topic.is_stalled ? '阶段卡点' : '截止临近';
      result.push({
        id: `attention-${topic.id}`,
        category: 'attention',
        title: label,
        context: topic.title,
        meta: `${topic.assignee_name ? `负责人：${topic.assignee_name}` : '负责人待认领'} · ${topic.deadline ? `截止 ${formatBeijingDate(topic.deadline)}` : '进入选题查看下一步'}`,
        path: `/topics/${topic.id}`,
        action: '跟进选题',
        tone: topic.is_overdue ? 'coral' : topic.is_stalled ? 'amber' : 'primary',
        icon: CircleAlert,
      });
    });
    if (attention?.production_reviews.available) {
      attention.production_reviews.tasks.forEach((item) => result.push({
        id: `production-review-${item.id}`,
        category: 'production-review',
        title: '待审核稿件',
        context: item.topic_title,
        meta: `${item.version || '当前版本'} · ${item.assignee_name ? `选题负责人：${item.assignee_name}` : '选题负责人待确认'} · ${formatBeijingDate(item.updated_at)} ${formatBeijingTime(item.updated_at, { hour: '2-digit', minute: '2-digit' })}`,
        path: `/production/${item.id}?action=review`,
        action: '审核稿件',
        tone: 'amber',
        icon: FilePenLine,
      }));
    }
    if (hasPermission('topic:audit')) {
      (attention?.topic_stages.pending.topics || []).forEach((topic) => result.push({
        id: `audit-${topic.id}`,
        category: 'review',
        title: '审核选题',
        context: topic.title,
        meta: `${topic.creator_name || '团队成员'} · ${formatBeijingDate(topic.created_at)}`,
        path: `/topics/${topic.id}?action=audit`,
        action: '开始审核',
        tone: 'amber',
        icon: MessageSquareText,
      }));
    }

    (attention?.my_drafts.tasks || []).forEach((item) => result.push({
        id: `production-${item.id}`,
        category: 'draft',
        title: item.status === 'rejected' ? '处理退回稿件' : '继续写稿',
        context: item.topic_title || `创作记录 #${item.id}`,
        meta: `${item.version || '当前版本'} · ${formatBeijingTime(item.updated_at)}`,
        path: `/production/${item.id}`,
        action: item.status === 'rejected' ? '处理退回' : '继续写稿',
        tone: item.status === 'rejected' ? 'coral' : 'cyan',
        icon: FilePenLine,
        saveDocId: getProductionVersionRoomId(item.id, String(item.version)),
    }));

    (attention?.my_retro_actions.tasks || []).forEach((item) => result.push({
      id: `retro-action-${item.id}`,
      category: 'retro-action',
      title: '复盘行动项',
      context: item.title,
      meta: `${item.retro_title} · ${item.status === 'doing' ? '进行中' : '待处理'} · ${item.due_date ? `截止 ${formatBeijingDate(item.due_date)}` : '未设置截止日期'}`,
      path: `/retrospectives/${item.retro_id}`,
      action: '去处理',
      tone: 'violet',
      icon: CheckCircle2,
    }));

    if (hasPermission('workflow:publishing')) {
      (attention?.today_publishing.tasks || []).forEach((item) => result.push({
        id: `today-publishing-${item.id}`,
        category: 'publishing',
        title: '今日发布',
        context: `${item.topic_title} · ${getPlatformLabel(item.platform) || '平台待确认'}`,
        meta: `${formatBeijingDate(item.publish_time)} ${formatBeijingTime(item.publish_time, { hour: '2-digit', minute: '2-digit' })}`,
        path: `/publishing/${item.id}`,
        action: '去发布',
        tone: 'primary',
        icon: Send,
      }));
    }

    const role = user?.role;
    const isReviewFirst = role === 'admin' || role === 'director' || hasPermission('topic:audit') || hasPermission('production:update');
    return orderHomeTasks(result, { isManagementRole, isReviewFirst });
  }, [actionableMessages.count, actionableMessages.messages, attention, hasPermission, isManagementRole, user?.role]);

  const canReviewTopics = hasPermission('topic:audit');
  const canReviewProductions = hasPermission('production:update');
  const taskHeading = isManagementRole ? '团队今日重点' : canReviewTopics || canReviewProductions ? '审核与内容推进' : '我的今日任务';
  const baseTaskDescription = isManagementRole
    ? '优先处理待办消息和数据异常，再跟进团队选题与审核事项'
    : canReviewTopics || canReviewProductions
      ? '优先处理待审核内容，再跟进团队卡点和发布安排'
      : '优先继续自己的稿件，再跟进临近事项和发布安排';
  let taskDescription = !isManagementRole && hasPermission('workflow:publishing') && (attention?.today_publishing.total || 0) > 0
    ? `${baseTaskDescription} · 今日待处理发布 ${attention?.today_publishing.total} 项`
    : baseTaskDescription;
  if (!isManagementRole && attention?.production_reviews.available && attention.production_reviews.total > 0) taskDescription += ` · 待审稿件 ${attention.production_reviews.total} 篇（按现有权限范围）`;
  if (attention?.my_retro_actions.available && attention.my_retro_actions.total > 0) taskDescription += ` · 我的复盘行动项 ${attention.my_retro_actions.total} 项`;

  const reloadAttention = async () => {
    const requestIdentity: HomeDashboardIdentity = { userId: user?.id ?? null, role: user?.role, token };
    const isRequestCurrent = () => {
      const currentAuth = useAuthStore.getState();
      return currentAuth.user?.id === requestIdentity.userId
        && currentAuth.user?.role === requestIdentity.role
        && currentAuth.token === requestIdentity.token;
    };
    if (!user || !isRequestCurrent()) return;

    setAttentionLoading(true);
    setAttentionError('');
    try {
      const summary = await getHomeAttention();
      if (!isRequestCurrent()) return;
      setAttention(summary);
      setLoadIssues((current) => {
        const remaining = current.filter((section) => section !== '复盘' && section !== '复盘行动项');
        if (!summary.retrospectives.available) remaining.push('复盘');
        if (!summary.my_retro_actions.available) remaining.push('复盘行动项');
        return remaining;
      });
    } catch (error) {
      if (!isRequestCurrent()) return;
      setAttentionError(getUserFacingErrorMessage(error, '工作台摘要暂时无法读取，请重试。'));
    } finally {
      if (isRequestCurrent()) setAttentionLoading(false);
    }
  };
  const attentionTopics = attention?.topics || [];
  const attentionTotal = attention?.counts.total ?? null;
  const taskSourcesUnavailable = Boolean(attentionError)
    || Boolean(attention && !attention.my_retro_actions.available)
    || Boolean(isManagementRole && actionableMessages.error);
  const taskSourcesLoading = Boolean(isManagementRole && actionableMessages.loading && !actionableMessages.messages.length && actionableMessages.count === 0);
  const currentRecentActivity = recentActivityState.userId === (currentUserId ?? null)
    && recentActivityState.role === user?.role
    && recentActivityState.token === token
    ? recentActivityState
    : { userId: currentUserId ?? null, role: user?.role, token, data: null, error: '', loading: true };
  const recentChanges = useMemo<ChangeItem[]>(() => (currentRecentActivity.data?.events || []).map((event) => ({
    id: event.id,
    type: event.label,
    title: event.title,
    detail: event.detail,
    time: event.occurred_at,
    path: event.path,
    tone: event.kind === 'version' ? 'cyan' : event.kind === 'review' ? 'violet' : event.kind === 'reply' ? 'primary' : 'amber',
  })), [currentRecentActivity.data]);
  const currentCreatorMetrics = canViewCreatorMetrics && creatorMetricsState.userId === user?.id
    ? creatorMetricsState
    : null;
  const currentCreatorData = currentCreatorMetrics?.status === 'ready' ? currentCreatorMetrics.data : null;
  const weeklyPlayGrowth = currentCreatorData?.growth_7d ?? null;
  const weeklyPlays = weeklyPlayGrowth?.plays ?? null;
  const currentFans = currentCreatorData?.metrics.fans_count ?? null;
  const hasCreatorMetric = weeklyPlays !== null || currentFans !== null;

  const stages: StageConfig[] = [
    { id: 'ideas', label: '灵感池', count: inspirationTotal, icon: Lightbulb, tone: 'amber', path: '/inspirations', items: inspirations.slice(0, 3).map((item) => ({ title: item.title })) },
    { id: 'pending', label: '待审', count: attention?.topic_stages.pending.total ?? null, icon: Clock3, tone: 'cyan', path: '/topics?status=pending', items: latestTopicPreviews(attention?.topic_stages.pending.topics || []) },
    { id: 'production', label: '创作中', count: attention?.topic_stages.production.total ?? null, icon: PenLine, tone: 'violet', path: '/topics?status=creation', items: latestTopicPreviews(attention?.topic_stages.production.topics || []) },
    { id: 'shooting', label: '成片', count: attention?.topic_stages.shooting.total ?? null, icon: Video, tone: 'success', path: '/topics?status=shooting', items: latestTopicPreviews(attention?.topic_stages.shooting.topics || []) },
    { id: 'publishing', label: '待发', count: attention?.topic_stages.publishing.total ?? null, icon: Send, tone: 'amber', path: '/topics?status=publishing', items: latestTopicPreviews(attention?.topic_stages.publishing.topics || []) },
    { id: 'completed', label: '已发', count: attention?.topic_stages.completed.total ?? null, icon: CheckCircle2, tone: 'primary', path: '/topics?status=completed', items: latestTopicPreviews(attention?.topic_stages.completed.topics || []) },
    { id: 'review', label: '复盘', count: attention?.retrospectives.available ? attention.retrospectives.total : null, icon: Sparkles, tone: 'violet', path: '/retrospectives', items: attention?.retrospectives.available ? attention.retrospectives.tasks.map((item) => ({
      title: item.title,
      detail: `周期 ${item.period_start}—${item.period_start.slice(0, 4) === item.period_end.slice(0, 4) ? item.period_end.slice(5) : item.period_end} · ${retrospectiveStatusText[item.status]}`,
    })) : [] },
  ];

  if (loading || permissionsLoading || !dashboardMatchesCurrentIdentity) {
    return <PageShell><span className="sr-only" role="status" aria-live="polite" aria-atomic="true">正在加载工作台…</span><StudioSkeletonCard /><div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]"><StudioSkeletonCard /><StudioSkeletonCard /></div><StudioSkeletonCard /></PageShell>;
  }

  return (
    <PageShell>
      <PageHeader
        title="工作台"
        description={`你好，${user?.name || user?.username || '伙伴'}。今天做什么、卡在哪里、谁需要处理，都在这里。`}
        actions={<><ActionButton onClick={() => navigate('/inspirations')}><Lightbulb className="h-4 w-4" />记灵感</ActionButton>{canWriteProduction ? <ActionButton onClick={() => navigate('/production?action=write')}><PenLine className="h-4 w-4" />写两句</ActionButton> : null}{canCreateTopic ? <ActionButton variant="primary" onClick={() => navigate('/topics/add')}><PenLine className="h-4 w-4" />新建选题</ActionButton> : null}</>}
      />

      {loadIssues.length > 0 ? <GlassPanel className="flex flex-wrap items-center justify-between gap-4 border-studio-coral/35 p-5" role="alert"><div className="min-w-0"><p className="text-sm font-semibold text-studio-coral-contrast">工作台部分数据暂时无法读取</p><p className="mt-1 text-sm text-studio-text-secondary">{loadIssues.join('、')}不可用；其它已成功读取的数据仍可查看。请重试补全工作台信息。</p></div><ActionButton variant="ghost" onClick={() => setDashboardReload((current) => current + 1)}>重新加载工作台</ActionButton></GlassPanel> : null}

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <GlassPanel className="overflow-visible">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-studio-border-soft px-5 py-4">
            <div><h2 className="text-base font-semibold text-studio-text-primary">{taskHeading}</h2><p className="mt-1 text-xs text-studio-text-muted">{taskDescription}</p></div>
            <ActionButton variant="ghost" onClick={() => navigate('/topics')}>进入选题管理 <ArrowRight className="h-4 w-4" /></ActionButton>
          </div>
          {isManagementRole && actionableMessages.error ? <div className="flex flex-wrap items-center justify-between gap-3 border-b border-studio-border-soft p-4" role="alert"><p className="text-sm text-studio-text-secondary">{actionableMessages.error}</p><ActionButton variant="ghost" disabled={actionableMessages.loading} onClick={actionableMessages.reload}>{actionableMessages.loading ? '正在重试…' : '重新加载'}</ActionButton></div> : null}
          {tasks.length > 0 ? <div className="divide-y divide-studio-border-soft">
            {tasks.map((task) => <div key={task.id} className="group flex flex-col gap-3 px-5 py-4 transition hover:bg-studio-surface-soft/55 sm:flex-row sm:items-center">
              <div className="flex min-w-0 flex-1 items-center gap-3"><div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-button ${stageToneClasses[task.tone] || stageToneClasses.primary}`}><task.icon className="h-5 w-5" /></div><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="text-sm font-semibold text-studio-text-primary">{task.title}</p><StatusPill tone={task.tone}>{task.action}</StatusPill></div><p className="mt-1 truncate text-sm text-studio-text-secondary">{task.context}</p><p data-testid="home-priority-task-meta" className="mt-1 text-xs text-studio-text-secondary">{task.meta}</p>{task.saveDocId ? <ProductionDraftSaveStatus docId={task.saveDocId} userId={user?.id} testId="home-draft-save-status" className="mt-1 block" /> : null}</div></div>
              <ActionButton data-testid="home-priority-task" aria-label={`${task.action}：${task.title} · ${task.context}`} className="shrink-0" variant={task.tone === 'coral' ? 'danger' : 'primary'} onClick={() => navigate(task.path)}>{task.action}<ChevronRight className="h-4 w-4" /></ActionButton>
            </div>)}
          </div> : taskSourcesUnavailable ? <p className="p-5 text-sm text-studio-text-muted" role="status">部分任务来源暂时无法读取，当前无法确认是否还有待处理任务；请修复读取问题后重试。</p> : taskSourcesLoading ? <p className="p-5 text-sm text-studio-text-muted" role="status">正在确认是否有待处理消息…</p> : <EmptyState icon={CheckCircle2} title="今天没有必须处理的任务" description={canCreateTopic ? '可以从记录灵感或创建选题开始下一轮内容生产。' : '可以从记录灵感开始下一轮内容生产。'} actionLabel={canCreateTopic ? '新建选题' : '记灵感'} onAction={() => navigate(canCreateTopic ? '/topics/add' : '/inspirations')} />}
        </GlassPanel>

        <GlassPanel>
          <div className="flex items-center justify-between border-b border-studio-border-soft px-5 py-4"><div><h2 className="text-base font-semibold text-studio-text-primary">{isManagementRole ? '团队工作概览' : attention?.scope === 'all-visible-content' ? '团队选题关注' : '我的选题关注'}</h2><p className="mt-1 text-xs text-studio-text-muted">{isManagementRole ? '选题、审核、发布、同步和待办消息' : attention ? `逾期 ${attention.counts.overdue} · 阶段超过 2 天 ${attention.counts.stalled} · 截止临近 ${attention.counts.due_soon}${attention.counts.stage_time_unknown > 0 ? ` · 阶段时间待确认 ${attention.counts.stage_time_unknown}` : ''}` : '逾期、长时间未推进或即将截止的内容'}</p></div>{isManagementRole ? null : <StatusPill tone={attentionTotal === null ? 'muted' : attentionTotal > 0 ? 'coral' : attention?.counts.stage_time_unknown ? 'amber' : 'success'}>{attentionTotal ?? '—'}</StatusPill>}</div>
          {isManagementRole ? <HomeCrossModuleOverview
            summary={attention}
            isManagementRole
            hasTopicAudit={!permissionsLoading && hasPermission('topic:audit')}
            hasPublishingAccess={!permissionsLoading && hasPermission('workflow:publishing')}
            actionableMessageCount={!actionableMessages.loading && !actionableMessages.error ? actionableMessages.count : null}
            onNavigate={(path) => navigate(path)}
          /> : null}
          {isManagementRole ? <div className="flex items-center justify-between px-5 pt-3"><h3 className="text-sm font-semibold text-studio-text-primary">选题卡点</h3><StatusPill tone={attentionTotal === null ? 'muted' : attentionTotal > 0 ? 'coral' : attention?.counts.stage_time_unknown ? 'amber' : 'success'}>{attentionTotal ?? '—'}</StatusPill></div> : null}
          {attentionError ? <div className="flex flex-wrap items-center justify-between gap-3 p-4" role="alert"><p className="text-sm text-studio-coral-contrast">{attentionError}</p><ActionButton variant="ghost" disabled={attentionLoading} onClick={() => void reloadAttention()}>{attentionLoading ? '正在重试…' : '重新加载'}</ActionButton></div> : attentionLoading ? <p className="p-4 text-sm text-studio-text-muted" role="status">正在整理需要关注的内容…</p> : attentionTopics.length > 0 ? <div className="space-y-2 p-3">{attentionTopics.map((topic) => {
            const reason = topic.is_overdue
              ? `已超过截止时间 · ${formatBeijingDate(topic.deadline)}`
              : topic.is_stalled
                ? `${formatStageElapsed(topic.stage_entered_at)} · 本阶段已超过 2 天`
                : `截止临近 · ${formatBeijingDate(topic.deadline)}`;
            return <button key={topic.id} type="button" onClick={() => navigate(`/topics/${topic.id}`)} className="flex w-full items-start gap-3 rounded-card border border-studio-border-soft bg-studio-surface-soft/45 p-3 text-left transition hover:border-studio-border-active hover:bg-studio-surface-elevated/60"><CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-studio-coral" /><div className="min-w-0 flex-1"><p className="line-clamp-2 text-sm font-semibold text-studio-text-primary">{topic.title}</p><p className="mt-1 text-xs text-studio-coral-contrast">{reason}</p><p className="mt-1 text-xs text-studio-text-muted">{topicStatusText[topic.status as TopicStatus] || '状态待确认'} · {topic.assignee_name || '待认领'}</p></div><ChevronRight className="mt-1 h-4 w-4 shrink-0 text-studio-text-muted" /></button>;
          })}{attentionTotal !== null && attentionTotal > attentionTopics.length ? <p className="px-1 pt-1 text-xs text-studio-text-muted">先显示最需要处理的 {attentionTopics.length} 条，共 {attentionTotal} 条。</p> : null}</div> : attention && attention.counts.stage_time_unknown > 0 ? <EmptyState icon={Clock3} title="目前没有逾期或已确认卡点内容" description={`${attention.counts.stage_time_unknown} 项内容的当前阶段时间待确认，暂不计入卡点；这不代表它们一定没有卡点。`} /> : <EmptyState icon={CheckCircle2} title="目前没有逾期或卡点内容" description="临近截止事项和超过两天未推进的内容会显示在这里。" />}
        </GlassPanel>
      </div>

      <GlassPanel className="overflow-visible">
        <div className="border-b border-studio-border-soft px-5 py-4"><h2 className="text-base font-semibold text-studio-text-primary">内容流</h2><p className="mt-1 text-xs text-studio-text-muted">从灵感到复盘，一眼看清每个阶段</p></div>
        <div className="overflow-x-auto p-4"><div className="grid min-w-[1050px] grid-cols-7 gap-2">{stages.map((stage, index) => <div key={stage.id} className="relative min-w-0">{index < stages.length - 1 ? <ChevronRight className="absolute -right-3 top-7 z-10 h-4 w-4 text-studio-text-muted" /> : null}<button type="button" onClick={() => navigate(stage.path)} className="h-full w-full rounded-card border border-studio-border-soft bg-studio-surface-soft/45 p-3 text-left transition hover:-translate-y-0.5 hover:border-studio-border-active hover:bg-studio-surface-elevated/65"><div className="flex items-center justify-between gap-2"><div className={`flex h-8 w-8 items-center justify-center rounded-button ${stageToneClasses[stage.tone]}`}><stage.icon className="h-4 w-4" /></div><span className="xmt-data-number text-xl font-semibold text-studio-text-primary">{stage.count ?? '—'}</span></div><p className="mt-3 text-sm font-semibold text-studio-text-primary">{stage.label}</p><div className="mt-3 space-y-2">{stage.count === null ? <p className="text-xs text-studio-coral-contrast">暂时无法读取</p> : stage.items.length > 0 ? stage.items.map((item, itemIndex) => <div key={`${item.title}-${itemIndex}`}><p className="line-clamp-2 text-xs leading-snug text-studio-text-secondary">{item.title}</p>{item.detail ? <p className="line-clamp-2 text-[10px] leading-snug text-studio-text-secondary">{item.detail}</p> : null}{item.stageEnteredAt !== undefined ? <p className="line-clamp-2 text-[10px] leading-snug text-studio-text-secondary">{formatStageElapsed(item.stageEnteredAt)}</p> : null}</div>) : <p className="text-xs text-studio-text-secondary">当前没有内容</p>}</div></button></div>)}</div></div>
      </GlassPanel>

      <GlassPanel>
        <div className="flex items-center justify-between gap-3 px-5 py-4">
          <div className="min-w-0 flex-1">
            <h2 id="home-recent-changes-title" className="text-base font-semibold text-studio-text-primary">最近变化</h2>
            <p className="mt-1 text-xs text-studio-text-muted">可追溯的稿件版本、批注和选题阶段变化</p>
          </div>
          <ActionButton
            type="button"
            variant="ghost"
            aria-label={showChanges ? '收起最近变化' : '展开最近变化'}
            aria-expanded={showChanges}
            aria-controls="home-recent-changes-content"
            onClick={() => setShowChanges((current) => !current)}
            className="min-h-10 shrink-0 gap-2 px-3"
          >
            <span>{showChanges ? '收起' : '展开'}</span>
            {showChanges ? <ChevronDown aria-hidden="true" className="h-5 w-5" /> : <ChevronRight aria-hidden="true" className="h-5 w-5" />}
          </ActionButton>
          {currentRecentActivity.data && !currentRecentActivity.loading && !currentRecentActivity.error ? (
            <ActionButton aria-label="刷新最近变化" variant="ghost" onClick={() => setRecentActivityReload((current) => current + 1)}>刷新</ActionButton>
          ) : null}
        </div>
      {hasPermission('workflow:publishing') && (attention?.today_publishing.total || 0) > tasks.filter((task) => task.category === 'publishing').length ? <p className="-mt-3 text-xs text-studio-text-muted">今日待发布 {attention?.today_publishing.total} 项，当前任务区显示其中优先事项。</p> : null}

      <div
        id="home-recent-changes-content"
        role="region"
        aria-labelledby="home-recent-changes-title"
        hidden={!showChanges}
        className={showChanges ? 'border-t border-studio-border-soft' : undefined}
      >
      {showChanges ? <>
        {currentCreatorMetrics?.status === 'loading' ? <p className="px-5 py-3 text-xs text-studio-text-muted" role="status">正在读取可用的抖音数据…</p> : null}
        {currentCreatorMetrics?.status === 'error' ? <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3" role="alert"><p className="text-sm text-studio-coral-contrast">运营数据暂时无法读取，请重试。</p><ActionButton variant="ghost" onClick={() => setCreatorMetricsReload((current) => current + 1)}>重试运营数据</ActionButton></div> : null}
        {hasCreatorMetric && currentCreatorData ? <section aria-label="近 7 天播放与粉丝数据" className="border-b border-studio-border-soft px-5 py-4">
          <h3 className="text-sm font-semibold text-studio-text-primary">运营数据</h3>
          <dl className="mt-3 grid gap-3 sm:grid-cols-2">
            {weeklyPlays !== null ? <div className="rounded-card border border-studio-border-soft bg-studio-surface-soft/45 px-4 py-3"><dt className="text-xs text-studio-text-secondary">近 7 天播放变化</dt><dd className="xmt-data-number mt-1 text-xl font-semibold text-studio-text-primary">{weeklyPlays.toLocaleString('zh-CN')}</dd></div> : null}
            {currentFans !== null ? <div className="rounded-card border border-studio-border-soft bg-studio-surface-soft/45 px-4 py-3"><dt className="text-xs text-studio-text-muted">粉丝总数</dt><dd className="xmt-data-number mt-1 text-xl font-semibold text-studio-text-primary">{currentFans.toLocaleString('zh-CN')}</dd></div> : null}
          </dl>
          <p className="mt-3 text-xs text-studio-text-secondary">
            {weeklyPlays !== null ? '统计口径：近 7 天按北京时间自然日计算，包含当天。' : '近 7 天播放变化暂不可用。'}{' '}
            {weeklyPlays !== null ? currentCreatorData.data_source === 'douyin_official_export'
              ? `播放变化来自官方逐日数据；采集时间：${weeklyPlayGrowth?.collected_at ? formatBeijingTime(weeklyPlayGrowth.collected_at, { year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '未知'}；数据截至：${weeklyPlayGrowth?.observed_through_date ? formatBeijingDate(weeklyPlayGrowth.observed_through_date) : '未知'}。`
              : currentCreatorData.data_source === 'douyin_creator_center_collection'
                ? `播放变化来自抖音采集快照；数据截至：${weeklyPlayGrowth?.observed_through_date ? formatBeijingDate(weeklyPlayGrowth.observed_through_date) : '未知'}；精确采集时间未知。`
                : `播放变化的数据来源未确认；数据截至：${weeklyPlayGrowth?.observed_through_date ? formatBeijingDate(weeklyPlayGrowth.observed_through_date) : '未知'}；精确观测时间未知。`
              : ''}{' '}
            {currentFans !== null ? `粉丝数是最近一次可用的总量，不代表本周新增；观测日期：${currentCreatorData.metrics.fans_observed_on ? formatBeijingDate(currentCreatorData.metrics.fans_observed_on) : '未知'}。` : ''}
          </p>
        </section> : null}
        <div className="divide-y divide-studio-border-soft">
          {currentRecentActivity.error ? <div className="flex flex-wrap items-center justify-between gap-3 p-4" role="alert"><div><p className="text-sm text-studio-coral-contrast">{currentRecentActivity.error}</p>{currentRecentActivity.data ? <p className="mt-1 text-xs text-studio-text-secondary">仍显示最近一次成功读取的数据，可能不是最新。</p> : null}</div><ActionButton variant="ghost" disabled={currentRecentActivity.loading} onClick={() => setRecentActivityReload((current) => current + 1)}>{currentRecentActivity.loading ? '正在重试…' : '重新加载'}</ActionButton></div> : null}
          {currentRecentActivity.loading && !currentRecentActivity.data ? <p className="p-5 text-sm text-studio-text-muted" role="status">正在读取最近变化…</p> : null}
          {currentRecentActivity.loading && currentRecentActivity.data ? <p className="p-4 text-sm text-studio-text-muted" role="status">正在更新最近变化；上次成功读取的内容仍可查看。</p> : null}
          {currentRecentActivity.data && recentChanges.length > 0 ? recentChanges.map((change) => <button key={change.id} type="button" onClick={() => navigate(change.path)} className="grid w-full gap-2 px-5 py-3 text-left transition hover:bg-studio-surface-soft/55 sm:grid-cols-[110px_minmax(0,1fr)_minmax(0,1fr)_150px] sm:items-center"><StatusPill className="justify-self-start" tone={change.tone}>{change.type}</StatusPill><span className="truncate text-sm font-medium text-studio-text-primary">{change.title}</span><span className="truncate text-sm text-studio-text-secondary">{change.detail}</span><span className="text-xs text-studio-text-muted sm:text-right">{formatBeijingTime(change.time)}</span></button>) : null}
          {currentRecentActivity.data && recentChanges.length === 0 && !currentRecentActivity.error && !currentRecentActivity.loading ? <EmptyState title="还没有最近变化" description="有新的稿件版本、批注或选题阶段变化后会显示在这里。" /> : null}
        </div>
      </> : null}
      </div>
      </GlassPanel>
    </PageShell>
  );
}
