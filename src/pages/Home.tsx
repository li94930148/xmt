import { useEffect, useMemo, useState } from 'react';
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
  FileText,
  Flame,
  Lightbulb,
  MessageSquareText,
  PenLine,
  Send,
  Sparkles,
  Timer,
  TrendingUp,
  Users,
  Video,
} from 'lucide-react';
import { getInspirations, getMonthlyStats, getTeamStats, getTopics, voteInspiration } from '../api';
import type { Inspiration, MonthlyStats, TeamStats, Topic, TopicStatus } from '../types';
import { useAuthStore } from '../store';
import { usePermission } from '../hooks/usePermission';
import AnnouncementBoard from '../components/AnnouncementBoard';
import PomodoroTimer from '../components/PomodoroTimer';
import {
  ActionButton,
  EmptyState,
  GlassPanel,
  MetricCard,
  MotionCard,
  PageShell,
  StatusPill,
  StudioSkeletonCard,
} from '../components/studio';
import { formatBeijingDate } from '../lib/utils';

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

const dailyQuotes = [
  { text: '好的内容不是堆满信息，而是在正确的时间推动下一步。', author: '内容工作台' },
  { text: '今天先让生产链路流动起来，灵感会在协作里变清晰。', author: '内容节奏手记' },
  { text: '选题、创作、发布、复盘，每一步都应该被看见。', author: '团队协作记录' },
  { text: '创意需要锋芒，执行需要秩序。', author: '新媒体工作台' },
];

function getDailyQuote() {
  const today = new Date();
  const dayOfYear = Math.floor((today.getTime() - new Date(today.getFullYear(), 0, 0).getTime()) / 86400000);
  return dailyQuotes[dayOfYear % dailyQuotes.length];
}

export default function Home() {
  const [teamStats, setTeamStats] = useState<TeamStats | null>(null);
  const [monthlyStats, setMonthlyStats] = useState<MonthlyStats | null>(null);
  const [pendingTopics, setPendingTopics] = useState<Topic[]>([]);
  const [recentTopics, setRecentTopics] = useState<Topic[]>([]);
  const [hotInspirations, setHotInspirations] = useState<Inspiration[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const { permissions, loading: permissionsLoading } = usePermission();
  const dailyQuote = getDailyQuote();
  const canViewAnalytics = user?.role === 'admin' || permissions.includes('*') || permissions.includes('analytics:view');

  useEffect(() => {
    if (user && permissionsLoading) {
      return;
    }

    const fetchData = async () => {
      try {
        const [team, monthly, pending, recent, inspirations] = await Promise.allSettled([
          canViewAnalytics ? getTeamStats() : Promise.resolve(null),
          canViewAnalytics ? getMonthlyStats() : Promise.resolve(null),
          getTopics({ status: 'pending' }),
          getTopics(),
          getInspirations({ limit: 6 }),
        ]);

        if (team.status === 'fulfilled' && team.value) setTeamStats(team.value);
        if (monthly.status === 'fulfilled' && monthly.value) setMonthlyStats(monthly.value);
        if (pending.status === 'fulfilled') setPendingTopics(pending.value.data.slice(0, 5));
        if (recent.status === 'fulfilled') setRecentTopics(recent.value.data.slice(0, 6));
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
  }, [canViewAnalytics, permissionsLoading, user]);

  const rhythm = useMemo(() => {
    const inProduction = recentTopics.filter((topic) => topic.status === 'production').length;
    const toPublish = recentTopics.filter((topic) => topic.status === 'publishing').length;

    return [
      { label: '待审核选题', value: pendingTopics.length, icon: Clock3, tone: 'amber' as const, path: '/topics?status=pending' },
      { label: '进行中稿件', value: inProduction, icon: PenLine, tone: 'cyan' as const, path: '/production' },
      { label: '今日待发布', value: toPublish, icon: Send, tone: 'primary' as const, path: '/publishing' },
      { label: '待提交日报', value: 1, icon: FileClock, tone: 'coral' as const, path: '/daily-report' },
    ];
  }, [pendingTopics.length, recentTopics]);

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
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.7fr)_minmax(320px,0.8fr)]">
        <MotionCard className="studio-edge-line overflow-hidden p-6 md:p-7" glow>
          <div className="relative z-10 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-studio-cyan/25 bg-studio-cyan/10 px-3 py-1 text-xs font-semibold text-studio-cyan">
                <Sparkles className="h-3.5 w-3.5" />
                今日内容节奏
              </div>
              <h1 className="text-3xl font-bold tracking-normal text-studio-text-primary md:text-4xl">
                {user?.name || '伙伴'}，今天优先让内容链路往前走。
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-studio-text-secondary">
                优先处理待审核与待发布内容，继续推进今天的内容节奏。
              </p>
              <div className="mt-5 flex flex-wrap items-center gap-3">
                <ActionButton onClick={() => navigate('/topics')} variant="primary">
                  <FileText className="h-4 w-4" />
                  进入选题池
                </ActionButton>
                <ActionButton onClick={() => navigate('/daily-report')}>
                  <FileClock className="h-4 w-4" />
                  今日日报
                </ActionButton>
                <span className="text-xs text-studio-text-muted">
                  {new Date().toLocaleDateString('zh-CN', { weekday: 'long', month: 'long', day: 'numeric' })}
                </span>
              </div>
            </div>
            <div className="w-full rounded-card border border-studio-border-soft bg-white/[0.05] p-4 lg:max-w-[240px]">
              <p className="text-xs font-semibold text-studio-text-muted">今日主线</p>
              <div className="mt-4 space-y-3">
                {rhythm.slice(0, 3).map((item) => (
                  <button key={item.label} onClick={() => navigate(item.path)} className="flex w-full items-center justify-between gap-3 rounded-button bg-white/[0.04] px-3 py-2 text-left transition hover:bg-white/[0.08]">
                    <span className="text-sm text-studio-text-secondary">{item.label}</span>
                    <span className="text-lg font-bold text-studio-text-primary">{item.value}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="pointer-events-none absolute right-0 top-0 h-48 w-48 rounded-full bg-studio-cyan/10 blur-3xl" />
          <div className="pointer-events-none absolute bottom-0 left-1/3 h-32 w-64 rounded-full bg-studio-violet/10 blur-3xl" />
        </MotionCard>

        <GlassPanel className="p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-[14px] bg-studio-amber/15 text-studio-amber">
              <MessageSquareText className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-studio-text-primary">每日一言</h2>
              <p className="text-xs text-studio-text-muted">开始前看一眼</p>
            </div>
          </div>
          <blockquote className="mt-5 text-sm leading-6 text-studio-text-secondary">“{dailyQuote.text}”</blockquote>
          <p className="mt-3 text-right text-xs text-studio-text-muted">- {dailyQuote.author}</p>
        </GlassPanel>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {rhythm.map((item) => (
          <MotionCard key={item.label} className="p-5" onClick={() => navigate(item.path)}>
            <button className="flex w-full items-center gap-4 text-left">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[16px] border border-studio-border-soft bg-white/[0.05]">
                <item.icon className="h-5 w-5 text-studio-cyan" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-studio-text-primary">{item.label}</p>
                <p className="mt-1 text-xs text-studio-text-muted">点击进入处理</p>
              </div>
              <span className="text-2xl font-bold text-studio-text-primary">{item.value}</span>
            </button>
          </MotionCard>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard title="本月完成" value={teamStats?.completed_count || 0} unit="选题" icon={CheckCircle2} tone="success" trend={{ label: '内容交付', up: true }} />
        <MetricCard title="逾期任务" value={teamStats?.overdue_count || 0} unit="项" icon={Clock3} tone="coral" trend={{ label: '需关注', up: false }} />
        <MetricCard title="完成率" value={`${teamStats?.completion_rate || '0'}%`} unit="本月" icon={TrendingUp} tone="cyan" trend={{ label: '团队节奏', up: true }} />
        <MetricCard title="播放量" value={(monthlyStats?.total_views || 0).toLocaleString()} unit="累计" icon={BarChart3} tone="violet" trend={{ label: '数据复盘', up: true }} />
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

      <AnnouncementBoard />
    </PageShell>
  );
}
