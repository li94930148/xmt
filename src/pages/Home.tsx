import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  BarChart3,
  BookOpen,
  Calendar,
  CheckCircle2,
  Clock3,
  Compass,
  Download,
  FileClock,
  Flame,
  Lightbulb,
  Timer,
  TrendingUp,
  Users,
} from 'lucide-react';
import { getInspirations, getMonthlyStats, getProduction, getPublishing, getTeamStats, getTopics, voteInspiration } from '../api';
import { getDouyinDashboard } from '../api/creatorCenter';
import type { Inspiration, MonthlyStats, Production, Publishing, TeamStats, Topic, TopicStatus } from '../types';
import { useAuthStore } from '../store';
import { usePermission } from '../hooks/usePermission';
import AnnouncementBoard from '../components/AnnouncementBoard';
import PomodoroTimer from '../components/PomodoroTimer';
import {
  ActionButton,
  EmptyState,
  GlassPanel,
  MetricCard,
  PageShell,
  StatusPill,
  StudioSkeletonCard,
} from '../components/studio';
import { formatBeijingDate } from '../lib/utils';
import { ProgressBar, XMTCard } from '../design-system';
import DashboardBento from '../components/xmt-ui/DashboardBento';
import { buildHomeDashboardMetrics } from '../components/xmt-ui/homeDashboardMetrics';

const statusText: Record<TopicStatus, string> = {
  pending: '待审核',
  approved: '已通过',
  rejected: '已驳回',
  production: '创作中',
  shooting: '制作中',
  publishing: '待发布',
  completed: '已完成',
};

const statusTone: Record<TopicStatus, 'primary' | 'cyan' | 'violet' | 'coral' | 'amber' | 'success' | 'muted'> = {
  pending: 'amber',
  approved: 'success',
  rejected: 'coral',
  production: 'cyan',
  shooting: 'violet',
  publishing: 'primary',
  completed: 'success',
};

const DASHBOARD_PAGE_SIZE = 100;

async function getDashboardTopics() {
  const first = await getTopics({ limit: DASHBOARD_PAGE_SIZE });
  const pageCount = Math.ceil(first.total / first.limit);
  if (pageCount <= 1) return first.data;
  const remaining = await Promise.all(
    Array.from({ length: pageCount - 1 }, (_, index) => getTopics({ page: index + 2, limit: first.limit })),
  );
  return [...first.data, ...remaining.flatMap((page) => page.data)];
}

async function getDashboardPublishing() {
  const first = await getPublishing({ limit: DASHBOARD_PAGE_SIZE });
  const pageCount = Math.ceil(first.total / first.limit);
  if (pageCount <= 1) return first.data;
  const remaining = await Promise.all(
    Array.from({ length: pageCount - 1 }, (_, index) => getPublishing({ page: index + 2, limit: first.limit })),
  );
  return [...first.data, ...remaining.flatMap((page) => page.data)];
}

export default function Home() {
  const [teamStats, setTeamStats] = useState<TeamStats | null>(null);
  const [monthlyStats, setMonthlyStats] = useState<MonthlyStats | null>(null);
  const [pendingTopics, setPendingTopics] = useState<Topic[]>([]);
  const [pendingTopicTotal, setPendingTopicTotal] = useState(0);
  const [dashboardTopics, setDashboardTopics] = useState<Topic[]>([]);
  const [recentTopics, setRecentTopics] = useState<Topic[]>([]);
  const [productions, setProductions] = useState<Production[]>([]);
  const [publishing, setPublishing] = useState<Publishing[]>([]);
  const [douyinViews, setDouyinViews] = useState<number | null>(null);
  const [todayTopicCount, setTodayTopicCount] = useState(0);
  const [hotInspirations, setHotInspirations] = useState<Inspiration[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const { permissions, loading: permissionsLoading } = usePermission();
  const canViewAnalytics = user?.role === 'admin' || permissions.includes('*') || permissions.includes('analytics:view');
  const canViewCreatorData = user?.role === 'admin' || permissions.includes('*') || permissions.includes('creator:data:view');

  useEffect(() => {
    if (user && permissionsLoading) {
      return;
    }

    const fetchData = async () => {
      try {
        const [team, monthly, pending, recent, productionList, publishingList, douyin, inspirations] = await Promise.allSettled([
          canViewAnalytics ? getTeamStats() : Promise.resolve(null),
          canViewAnalytics ? getMonthlyStats() : Promise.resolve(null),
          getTopics({ status: 'pending', limit: 100 }),
          getDashboardTopics(),
          getProduction(),
          getDashboardPublishing(),
          canViewCreatorData ? getDouyinDashboard() : Promise.resolve(null),
          getInspirations({ limit: 6 }),
        ]);

        if (team.status === 'fulfilled' && team.value) setTeamStats(team.value);
        if (monthly.status === 'fulfilled' && monthly.value) setMonthlyStats(monthly.value);
        if (pending.status === 'fulfilled') {
          setPendingTopicTotal(pending.value.total);
          setPendingTopics(pending.value.data.slice(0, 5));
        }
        if (recent.status === 'fulfilled') {
          const today = formatBeijingDate(new Date().toISOString());
          setTodayTopicCount(recent.value.filter((topic) => formatBeijingDate(topic.created_at) === today).length);
          setDashboardTopics(recent.value);
          setRecentTopics(recent.value.slice(0, 6));
        }
        if (productionList.status === 'fulfilled') setProductions(productionList.value);
        if (publishingList.status === 'fulfilled') setPublishing(publishingList.value);
        if (douyin.status === 'fulfilled' && douyin.value) setDouyinViews(douyin.value.metrics.play_count);
        if (inspirations.status === 'fulfilled') {
          setHotInspirations([...inspirations.value.data].sort((a, b) => (b.votes || 0) - (a.votes || 0)).slice(0, 6));
        }
      } catch (error) {
        console.error('Failed to fetch dashboard data:', error);
      } finally {
        setLoading(false);
      }
    };

    void fetchData();
  }, [canViewAnalytics, canViewCreatorData, permissionsLoading, user]);

  const dashboardMetrics = useMemo(
    () => buildHomeDashboardMetrics(dashboardTopics, productions, publishing),
    [dashboardTopics, productions, publishing],
  );

  const toolActions = [
    { id: 'daily', label: '今日日报', desc: '填写今日进展', icon: FileClock, path: '/daily-report', tone: 'coral' },
    { id: 'topics', label: '新建选题', desc: '发起内容源头', icon: Compass, path: '/topics/add', tone: 'cyan' },
    { id: 'calendar', label: '排期日历', desc: '查看发布节奏', icon: Calendar, path: '/calendar', tone: 'primary' },
    { id: 'timer', label: '专注创作', desc: '番茄钟工作块', icon: Timer, path: '/pomodoro', tone: 'amber' },
    { id: 'resources', label: '资源库', desc: '素材与档案', icon: BookOpen, path: '/resources', tone: 'success' },
    { id: 'export', label: '报告中心', desc: '日报/周报/导出', icon: Download, path: '/export', tone: 'violet' },
  ];

  const handleVoteInspiration = async (id: number) => {
    try {
      await voteInspiration(id);
      setHotInspirations((prev) => prev.map((item) => (item.id === id ? { ...item, votes: (item.votes || 0) + 1, voted: true } : item)));
    } catch {
      // Voting is non-critical on the dashboard.
    }
  };

  const handleDashboardNavigate = useCallback((path: string) => navigate(path), [navigate]);

  if (loading) {
    return (
      <PageShell>
        <div className="grid gap-4 md:grid-cols-4">
          {[1, 2, 3, 4].map((item) => <StudioSkeletonCard key={item} />)}
        </div>
        <div className="grid gap-5 lg:grid-cols-3">
          <div className="lg:col-span-2"><StudioSkeletonCard /></div>
          <StudioSkeletonCard />
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <DashboardBento
        pendingTopics={pendingTopicTotal}
        inProduction={dashboardMetrics.inProduction}
        toPublish={dashboardMetrics.toPublish}
        todayTopics={todayTopicCount}
        completionRate={dashboardMetrics.productionIndex}
        totalViews={douyinViews ?? monthlyStats?.total_views ?? 0}
        hotInspirations={hotInspirations.length}
        onNavigate={handleDashboardNavigate}
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard title="已完成内容" value={dashboardMetrics.completedContent} unit="项" icon={CheckCircle2} tone="success" trend={{ label: '创作与发布', up: true }} />
        <MetricCard title="逾期任务" value={teamStats?.overdue_count || 0} unit="项" icon={Clock3} tone="coral" trend={{ label: '需关注', up: false }} />
        <XMTCard className="p-5">
          <div className="flex items-start justify-between gap-4"><div><p className="text-xs font-semibold text-studio-text-muted">生产指数</p><p className="mt-3 text-3xl font-bold text-studio-text-primary xmt-data-number">{dashboardMetrics.productionIndex}%</p></div><div className="flex h-11 w-11 items-center justify-center rounded-[14px] bg-gradient-to-br from-studio-cyan to-studio-primary shadow-lg shadow-studio-cyan/20"><TrendingUp className="h-5 w-5 text-white" /></div></div>
          <div className="mt-4"><ProgressBar value={dashboardMetrics.productionIndex} tone="success" label="当前内容链路进度" /></div>
        </XMTCard>
        <MetricCard title="播放量" value={(douyinViews ?? monthlyStats?.total_views ?? 0).toLocaleString()} unit="累计" icon={BarChart3} tone="violet" trend={{ label: douyinViews == null ? '数据复盘' : '抖音运营中心', up: true }} />
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(360px,0.75fr)]">
        <GlassPanel className="p-5">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-studio-text-primary">今日待办</h2>
              <p className="mt-1 text-xs text-studio-text-muted">优先处理阻塞内容流的节点</p>
            </div>
            <ActionButton variant="ghost" onClick={() => navigate('/topics')}>
              查看全部 <ArrowRight className="h-4 w-4" />
            </ActionButton>
          </div>

          {pendingTopics.length > 0 ? (
            <div className="space-y-2">
              {pendingTopics.map((topic) => (
                <button
                  key={topic.id}
                  onClick={() => navigate(`/topics/${topic.id}`)}
                  className="group flex w-full items-center gap-4 rounded-card border border-transparent bg-white/[0.035] p-4 text-left transition-all duration-200 hover:border-studio-border-active hover:bg-white/[0.06]"
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px] bg-studio-amber/12 text-studio-amber">
                    <Clock3 className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-studio-text-primary">{topic.title}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-studio-text-muted">
                      <span>{topic.creator_name || '未分配'} 发起</span>
                      <span>·</span>
                      <span>{formatBeijingDate(topic.created_at)}</span>
                    </div>
                  </div>
                  <StatusPill className="shrink-0" tone={statusTone[topic.status]}>{statusText[topic.status]}</StatusPill>
                  <span className="translate-x-2 text-xs font-semibold text-studio-cyan opacity-0 transition-all group-hover:translate-x-0 group-hover:opacity-100">
                    去审核
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <EmptyState icon={CheckCircle2} title="今日没有待审核选题" description="当前内容源头没有阻塞，可以推进创作、发布或复盘。" actionLabel="查看选题池" onAction={() => navigate('/topics')} />
          )}
        </GlassPanel>

        <div className="space-y-5">
          <GlassPanel className="p-5">
            <h2 className="text-base font-semibold text-studio-text-primary">实用工具</h2>
            <div className="mt-4 grid grid-cols-2 gap-3">
              {toolActions.map((action) => (
                <button
                  key={action.id}
                  onClick={() => navigate(action.path)}
                  className="group rounded-card border border-studio-border-soft bg-white/[0.04] p-4 text-left transition-all duration-200 hover:-translate-y-0.5 hover:border-studio-border-active hover:bg-white/[0.07]"
                >
                  <action.icon className="h-5 w-5 text-studio-cyan transition group-hover:text-studio-text-primary" />
                  <p className="mt-3 text-sm font-semibold text-studio-text-primary">{action.label}</p>
                  <p className="mt-1 text-xs text-studio-text-muted">{action.desc}</p>
                </button>
              ))}
            </div>
          </GlassPanel>

          <PomodoroTimer compact />
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-3">
        <GlassPanel className="p-5 xl:col-span-2">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-studio-text-primary">最近内容流</h2>
              <p className="mt-1 text-xs text-studio-text-muted">快速判断每个选题当前卡在哪一步</p>
            </div>
            <ActionButton variant="ghost" onClick={() => navigate('/topics')}>
              进入链路 <ArrowRight className="h-4 w-4" />
            </ActionButton>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {recentTopics.map((topic) => (
              <button key={topic.id} onClick={() => navigate(`/topics/${topic.id}`)} className="rounded-card border border-studio-border-soft bg-white/[0.035] p-4 text-left transition hover:border-studio-border-active hover:bg-white/[0.06]">
                <div className="flex items-start justify-between gap-3">
                  <p className="line-clamp-2 text-sm font-semibold text-studio-text-primary">{topic.title}</p>
                  <StatusPill className="shrink-0" tone={statusTone[topic.status]}>{statusText[topic.status]}</StatusPill>
                </div>
                <div className="mt-4 flex items-center justify-between text-xs text-studio-text-muted">
                  <span className="inline-flex items-center gap-1.5"><Users className="h-3.5 w-3.5" />{topic.assignee_name || topic.creator_name || '待认领'}</span>
                  <span>{topic.platform}</span>
                </div>
              </button>
            ))}
          </div>
        </GlassPanel>

        <GlassPanel className="p-5">
          <div className="mb-5 flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-[14px] bg-studio-coral/12 text-studio-coral">
              <Flame className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-studio-text-primary">热门灵感</h2>
              <p className="text-xs text-studio-text-muted">创意池信号</p>
            </div>
          </div>
          <div className="space-y-2">
            {hotInspirations.length > 0 ? hotInspirations.map((item) => (
              <div key={item.id} className="group flex w-full items-center gap-3 rounded-button bg-white/[0.035] p-3 text-left transition hover:bg-white/[0.07]">
                <Lightbulb className="h-4 w-4 shrink-0 text-studio-amber" />
                <button
                  type="button"
                  onClick={() => navigate('/inspirations')}
                  className="min-w-0 flex-1 truncate text-left text-sm text-studio-text-secondary group-hover:text-studio-text-primary"
                >
                  {item.title}
                </button>
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    void handleVoteInspiration(item.id);
                  }}
                  className="text-xs font-semibold text-studio-coral"
                >
                  {item.votes || 0}
                </button>
              </div>
            )) : <p className="rounded-button bg-white/[0.035] p-4 text-sm text-studio-text-muted">暂无灵感数据</p>}
          </div>
        </GlassPanel>
      </div>

      <div className="grid gap-5 xl:grid-cols-3">
        <div className="xl:col-span-2"><AnnouncementBoard /></div>
        <GlassPanel className="flex min-h-32 items-center justify-between gap-5 p-5">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-studio-text-primary">意见箱</h2>
            <p className="mt-1 text-sm leading-6 text-studio-text-muted">有想法、建议或问题？留下你的声音</p>
          </div>
          <ActionButton className="shrink-0" variant="ghost" onClick={() => navigate('/anonymous-feedback')}>进入意见墙 <ArrowRight className="h-4 w-4" /></ActionButton>
        </GlassPanel>
      </div>
    </PageShell>
  );
}
