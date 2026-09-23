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
import { getInspirations, getProduction, getPublishing, getTopics } from '../api';
import type { Inspiration, Production, Publishing, Topic, TopicStatus } from '../types';
import { useAuthStore } from '../store';
import { usePermission } from '../hooks/usePermission';
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

type Tone = 'primary' | 'cyan' | 'violet' | 'coral' | 'amber' | 'success' | 'muted';

type TaskItem = {
  id: string;
  title: string;
  context: string;
  meta: string;
  path: string;
  action: string;
  tone: Tone;
  icon: typeof Clock3;
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

const topicStatusText: Record<TopicStatus, string> = {
  pending: '待审核',
  approved: '已通过',
  rejected: '已退回',
  production: '创作中',
  shooting: '成片制作',
  publishing: '待发布',
  completed: '已发布',
};

const topicStatusTone: Record<TopicStatus, Tone> = {
  pending: 'amber',
  approved: 'success',
  rejected: 'coral',
  production: 'cyan',
  shooting: 'violet',
  publishing: 'primary',
  completed: 'success',
};

const stageToneClasses: Record<string, string> = {
  amber: 'bg-studio-amber/12 text-studio-amber',
  cyan: 'bg-studio-cyan/12 text-studio-cyan',
  violet: 'bg-studio-violet/12 text-studio-violet',
  success: 'bg-studio-success/12 text-studio-success',
  primary: 'bg-studio-primary/12 text-studio-primary',
};

function isOverdue(topic: Topic) {
  return Boolean(topic.deadline && topic.status !== 'completed' && formatBeijingDate(topic.deadline) < formatBeijingDate(new Date().toISOString()));
}

function sortByUpdatedAt<T extends { updated_at: string }>(items: T[]) {
  return [...items].sort((left, right) => Date.parse(right.updated_at) - Date.parse(left.updated_at));
}

export default function Home() {
  const [pendingTopics, setPendingTopics] = useState<Topic[]>([]);
  const [productionTopics, setProductionTopics] = useState<Topic[]>([]);
  const [shootingTopics, setShootingTopics] = useState<Topic[]>([]);
  const [publishingTopics, setPublishingTopics] = useState<Topic[]>([]);
  const [completedTopics, setCompletedTopics] = useState<Topic[]>([]);
  const [productions, setProductions] = useState<Production[]>([]);
  const [publishing, setPublishing] = useState<Publishing[]>([]);
  const [inspirations, setInspirations] = useState<Inspiration[]>([]);
  const [stageTotals, setStageTotals] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [showChanges, setShowChanges] = useState(true);
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const { loading: permissionsLoading, hasPermission } = usePermission();

  useEffect(() => {
    if (!user || permissionsLoading) return;

    let cancelled = false;
    const fetchDashboard = async () => {
      setLoading(true);
      setLoadError('');
      const requests = await Promise.allSettled([
        getInspirations({ limit: 4 }),
        getTopics({ status: 'pending', limit: 5 }),
        getTopics({ status: 'production', limit: 5 }),
        getTopics({ status: 'shooting', limit: 5 }),
        getTopics({ status: 'publishing', limit: 5 }),
        getTopics({ status: 'completed', limit: 5 }),
        getProduction({ page: 1, limit: 12 }),
        getPublishing({ page: 1, limit: 12 }),
      ]);

      if (cancelled) return;
      const [ideaResult, pendingResult, productionResult, shootingResult, publishingTopicResult, completedResult, productionListResult, publishingListResult] = requests;

      if (ideaResult.status === 'fulfilled') setInspirations(ideaResult.value.data);
      if (pendingResult.status === 'fulfilled') setPendingTopics(pendingResult.value.data);
      if (productionResult.status === 'fulfilled') setProductionTopics(productionResult.value.data);
      if (shootingResult.status === 'fulfilled') setShootingTopics(shootingResult.value.data);
      if (publishingTopicResult.status === 'fulfilled') setPublishingTopics(publishingTopicResult.value.data);
      if (completedResult.status === 'fulfilled') setCompletedTopics(completedResult.value.data);
      if (productionListResult.status === 'fulfilled') setProductions(productionListResult.value.data);
      if (publishingListResult.status === 'fulfilled') setPublishing(publishingListResult.value.data);

      setStageTotals({
        ideas: ideaResult.status === 'fulfilled' ? ideaResult.value.total : 0,
        pending: pendingResult.status === 'fulfilled' ? pendingResult.value.total : 0,
        production: productionResult.status === 'fulfilled' ? productionResult.value.total : 0,
        shooting: shootingResult.status === 'fulfilled' ? shootingResult.value.total : 0,
        publishing: publishingTopicResult.status === 'fulfilled' ? publishingTopicResult.value.total : 0,
        completed: completedResult.status === 'fulfilled' ? completedResult.value.total : 0,
        review: publishingListResult.status === 'fulfilled' ? publishingListResult.value.summary.published : 0,
      });

      if (requests.every((result) => result.status === 'rejected')) setLoadError('工作台暂时无法加载，请稍后重试。');
      setLoading(false);
    };

    void fetchDashboard();
    return () => { cancelled = true; };
  }, [permissionsLoading, user]);

  const allTopics = useMemo(
    () => [...pendingTopics, ...productionTopics, ...shootingTopics, ...publishingTopics, ...completedTopics],
    [completedTopics, pendingTopics, productionTopics, publishingTopics, shootingTopics],
  );

  const tasks = useMemo<TaskItem[]>(() => {
    const result: TaskItem[] = [];
    if (hasPermission('topic:audit')) {
      pendingTopics.forEach((topic) => result.push({
        id: `audit-${topic.id}`,
        title: '审核选题',
        context: topic.title,
        meta: `${topic.creator_name || '团队成员'} · ${formatBeijingDate(topic.created_at)}`,
        path: `/topics/${topic.id}`,
        action: '开始审核',
        tone: 'amber',
        icon: MessageSquareText,
      }));
    }

    productions
      .filter((item) => item.operator_id === user?.id && ['draft', 'rejected'].includes(item.status))
      .forEach((item) => result.push({
        id: `production-${item.id}`,
        title: item.status === 'rejected' ? '处理退回稿件' : '继续写稿',
        context: item.topic_title || `创作记录 #${item.id}`,
        meta: `${item.version || '当前版本'} · ${formatBeijingTime(item.updated_at)}`,
        path: `/production/${item.id}`,
        action: item.status === 'rejected' ? '处理退回' : '继续写稿',
        tone: item.status === 'rejected' ? 'coral' : 'cyan',
        icon: FilePenLine,
      }));

    if (hasPermission('workflow:publishing')) {
      publishing
        .filter((item) => ['pending', 'scheduled'].includes(item.status))
        .forEach((item) => result.push({
          id: `publishing-${item.id}`,
          title: item.status === 'scheduled' ? '确认发布排期' : '准备发布',
          context: item.topic_title || `发布记录 #${item.id}`,
          meta: item.publish_time ? formatBeijingTime(item.publish_time) : '尚未设置发布时间',
          path: `/publishing/${item.id}`,
          action: item.status === 'scheduled' ? '确认排期' : '去发布',
          tone: 'primary',
          icon: Send,
        }));
    }

    return result.slice(0, 6);
  }, [hasPermission, pendingTopics, productions, publishing, user?.id]);

  const attentionTopics = useMemo(() => sortByUpdatedAt(allTopics.filter(isOverdue)).slice(0, 4), [allTopics]);

  const recentChanges = useMemo<ChangeItem[]>(() => {
    const topicChanges: ChangeItem[] = allTopics.map((topic) => ({
      id: `topic-${topic.id}`,
      type: '状态变化',
      title: topic.title,
      detail: `当前阶段：${topicStatusText[topic.status]}`,
      time: topic.updated_at,
      path: `/topics/${topic.id}`,
      tone: topicStatusTone[topic.status],
    }));
    const productionChanges: ChangeItem[] = productions.map((item) => ({
      id: `production-${item.id}`,
      type: '稿件更新',
      title: item.topic_title || `创作记录 #${item.id}`,
      detail: `更新至 ${item.version || '当前版本'}`,
      time: item.updated_at,
      path: `/production/${item.id}`,
      tone: 'cyan',
    }));
    const publishingChanges: ChangeItem[] = publishing.map((item) => ({
      id: `publishing-${item.id}`,
      type: '发布进度',
      title: item.topic_title || `发布记录 #${item.id}`,
      detail: item.status === 'published' ? '已完成发布' : item.status === 'failed' ? '发布需要处理' : '发布准备中',
      time: item.updated_at,
      path: `/publishing/${item.id}`,
      tone: item.status === 'failed' ? 'coral' : item.status === 'published' ? 'success' : 'primary',
    }));
    return [...topicChanges, ...productionChanges, ...publishingChanges]
      .sort((left, right) => Date.parse(right.time) - Date.parse(left.time))
      .slice(0, 6);
  }, [allTopics, productions, publishing]);

  const stages = [
    { id: 'ideas', label: '灵感池', count: stageTotals.ideas || 0, icon: Lightbulb, tone: 'amber', path: '/inspirations', items: inspirations.map((item) => item.title).slice(0, 2) },
    { id: 'pending', label: '待审', count: stageTotals.pending || 0, icon: Clock3, tone: 'cyan', path: '/topics?status=pending', items: pendingTopics.map((item) => item.title).slice(0, 2) },
    { id: 'production', label: '创作中', count: stageTotals.production || 0, icon: PenLine, tone: 'violet', path: '/topics?status=production', items: productionTopics.map((item) => item.title).slice(0, 2) },
    { id: 'shooting', label: '成片', count: stageTotals.shooting || 0, icon: Video, tone: 'success', path: '/topics?status=shooting', items: shootingTopics.map((item) => item.title).slice(0, 2) },
    { id: 'publishing', label: '待发', count: stageTotals.publishing || 0, icon: Send, tone: 'amber', path: '/topics?status=publishing', items: publishingTopics.map((item) => item.title).slice(0, 2) },
    { id: 'completed', label: '已发', count: stageTotals.completed || 0, icon: CheckCircle2, tone: 'primary', path: '/topics?status=completed', items: completedTopics.map((item) => item.title).slice(0, 2) },
    { id: 'review', label: '复盘', count: stageTotals.review || 0, icon: Sparkles, tone: 'violet', path: '/retrospectives', items: ['从发布记录开始复盘'] },
  ];

  if (loading) {
    return <PageShell><StudioSkeletonCard /><div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]"><StudioSkeletonCard /><StudioSkeletonCard /></div><StudioSkeletonCard /></PageShell>;
  }

  return (
    <PageShell>
      <PageHeader
        title="工作台"
        description={`你好，${user?.name || user?.username || '伙伴'}。今天做什么、卡在哪里、谁需要处理，都在这里。`}
        actions={<><ActionButton onClick={() => navigate('/inspirations')}><Lightbulb className="h-4 w-4" />记灵感</ActionButton><ActionButton variant="primary" onClick={() => navigate('/topics/add')}><PenLine className="h-4 w-4" />新建选题</ActionButton></>}
      />

      {loadError ? <GlassPanel className="border-studio-coral/35 p-5 text-sm text-studio-coral-contrast">{loadError}</GlassPanel> : null}

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <GlassPanel className="overflow-visible">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-studio-border-soft px-5 py-4">
            <div><h2 className="text-base font-semibold text-studio-text-primary">我的今日任务</h2><p className="mt-1 text-xs text-studio-text-muted">先处理最能推动内容流的下一步</p></div>
            <ActionButton variant="ghost" onClick={() => navigate('/topics')}>查看全部任务 <ArrowRight className="h-4 w-4" /></ActionButton>
          </div>
          {tasks.length > 0 ? <div className="divide-y divide-studio-border-soft">
            {tasks.map((task) => <div key={task.id} className="group flex flex-col gap-3 px-5 py-4 transition hover:bg-studio-surface-soft/55 sm:flex-row sm:items-center">
              <div className="flex min-w-0 flex-1 items-center gap-3"><div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-button ${stageToneClasses[task.tone] || stageToneClasses.primary}`}><task.icon className="h-5 w-5" /></div><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="text-sm font-semibold text-studio-text-primary">{task.title}</p><StatusPill tone={task.tone}>{task.action}</StatusPill></div><p className="mt-1 truncate text-sm text-studio-text-secondary">{task.context}</p><p className="mt-1 text-xs text-studio-text-muted">{task.meta}</p></div></div>
              <ActionButton className="shrink-0" variant={task.tone === 'coral' ? 'danger' : 'primary'} onClick={() => navigate(task.path)}>{task.action}<ChevronRight className="h-4 w-4" /></ActionButton>
            </div>)}
          </div> : <EmptyState icon={CheckCircle2} title="今天没有必须处理的任务" description="可以从记录灵感或创建选题开始下一轮内容生产。" actionLabel="新建选题" onAction={() => navigate('/topics/add')} />}
        </GlassPanel>

        <GlassPanel>
          <div className="flex items-center justify-between border-b border-studio-border-soft px-5 py-4"><div><h2 className="text-base font-semibold text-studio-text-primary">需要关注</h2><p className="mt-1 text-xs text-studio-text-muted">逾期或长时间未推进的内容</p></div><StatusPill tone={attentionTopics.length > 0 ? 'coral' : 'success'}>{attentionTopics.length}</StatusPill></div>
          {attentionTopics.length > 0 ? <div className="space-y-2 p-3">{attentionTopics.map((topic) => <button key={topic.id} type="button" onClick={() => navigate(`/topics/${topic.id}`)} className="flex w-full items-start gap-3 rounded-card border border-studio-border-soft bg-studio-surface-soft/45 p-3 text-left transition hover:border-studio-border-active hover:bg-studio-surface-elevated/60"><CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-studio-coral" /><div className="min-w-0 flex-1"><p className="line-clamp-2 text-sm font-semibold text-studio-text-primary">{topic.title}</p><p className="mt-1 text-xs text-studio-coral-contrast">已超过截止时间 · {formatBeijingDate(topic.deadline)}</p><p className="mt-1 text-xs text-studio-text-muted">{topicStatusText[topic.status]} · {topic.assignee_name || '待认领'}</p></div><ChevronRight className="mt-1 h-4 w-4 shrink-0 text-studio-text-muted" /></button>)}</div> : <EmptyState icon={CheckCircle2} title="没有逾期卡点" description="当前内容都在计划内推进。" />}
        </GlassPanel>
      </div>

      <GlassPanel className="overflow-visible">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-studio-border-soft px-5 py-4"><div><h2 className="text-base font-semibold text-studio-text-primary">内容流</h2><p className="mt-1 text-xs text-studio-text-muted">从灵感到复盘，一眼看清每个阶段</p></div><ActionButton variant="ghost" onClick={() => navigate('/topics')}>进入内容生产 <ArrowRight className="h-4 w-4" /></ActionButton></div>
        <div className="overflow-x-auto p-4"><div className="grid min-w-[1050px] grid-cols-7 gap-2">{stages.map((stage, index) => <div key={stage.id} className="relative min-w-0">{index < stages.length - 1 ? <ChevronRight className="absolute -right-3 top-7 z-10 h-4 w-4 text-studio-text-muted" /> : null}<button type="button" onClick={() => navigate(stage.path)} className="h-full w-full rounded-card border border-studio-border-soft bg-studio-surface-soft/45 p-3 text-left transition hover:-translate-y-0.5 hover:border-studio-border-active hover:bg-studio-surface-elevated/65"><div className="flex items-center justify-between gap-2"><div className={`flex h-8 w-8 items-center justify-center rounded-button ${stageToneClasses[stage.tone]}`}><stage.icon className="h-4 w-4" /></div><span className="xmt-data-number text-xl font-semibold text-studio-text-primary">{stage.count}</span></div><p className="mt-3 text-sm font-semibold text-studio-text-primary">{stage.label}</p><div className="mt-3 space-y-1.5">{stage.items.length > 0 ? stage.items.map((item) => <p key={item} className="truncate text-xs text-studio-text-muted">{item}</p>) : <p className="text-xs text-studio-text-muted">当前没有内容</p>}</div></button></div>)}</div></div>
      </GlassPanel>

      <GlassPanel>
        <button type="button" onClick={() => setShowChanges((current) => !current)} className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left"><div><h2 className="text-base font-semibold text-studio-text-primary">最近变化</h2><p className="mt-1 text-xs text-studio-text-muted">稿件、状态与发布进度的最新变化</p></div>{showChanges ? <ChevronDown className="h-5 w-5 text-studio-text-muted" /> : <ChevronRight className="h-5 w-5 text-studio-text-muted" />}</button>
        {showChanges ? <div className="border-t border-studio-border-soft"><div className="divide-y divide-studio-border-soft">{recentChanges.length > 0 ? recentChanges.map((change) => <button key={change.id} type="button" onClick={() => navigate(change.path)} className="grid w-full gap-2 px-5 py-3 text-left transition hover:bg-studio-surface-soft/55 sm:grid-cols-[110px_minmax(0,1fr)_minmax(0,1fr)_150px] sm:items-center"><StatusPill className="justify-self-start" tone={change.tone}>{change.type}</StatusPill><span className="truncate text-sm font-medium text-studio-text-primary">{change.title}</span><span className="truncate text-sm text-studio-text-secondary">{change.detail}</span><span className="text-xs text-studio-text-muted sm:text-right">{formatBeijingTime(change.time)}</span></button>) : <EmptyState title="还没有最近变化" description="稿件或状态更新后会显示在这里。" />}</div></div> : null}
      </GlassPanel>
    </PageShell>
  );
}
