import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getTopics, getTeamStats, getMonthlyStats } from '../api';
import { getInspirations, voteInspiration } from '../api';
import { Topic, TeamStats, MonthlyStats } from '../types';
import type { Inspiration } from '../types';
import { useThemeStyles } from '../hooks/useThemeStyles';
import { useAuthStore } from '../store';
import { SkeletonLine, SkeletonCard } from '../components/Skeleton';
import AnnouncementBoard from '../components/AnnouncementBoard';
import PomodoroTimer from '../components/PomodoroTimer';
import { STATUS_COLORS, STATUS_TEXT } from '../constants';
import { formatBeijingDate } from '../lib/utils';
import {
  FileText,
  CheckCircle,
  Clock,
  AlertTriangle,
  TrendingUp,
  Heart,
  Share2,
  MessageCircle,
  ArrowRight,
  Video,
  Camera,
  Send,
  Target,
  Zap,
  Calendar,
  Users,
  BarChart3,
  ChevronRight,
  Sparkles,
  ArrowUpRight,
  ArrowDownRight,
  Quote,
  Lightbulb,
  BookOpen,
  Download,
  Database,
  Timer,
  Flame,
  ThumbsUp,
  RefreshCw,
  Star,
  Compass,
} from 'lucide-react';

// 每日一言数据（30条精选）
const dailyQuotes = [
  { text: '创作不是灵感的等待，而是习惯的坚持。', author: '村上春树' },
  { text: '好的内容，是把复杂的事情说简单。', author: 'TED' },
  { text: '每一个爆款背后，都是无数次的尝试。', author: '抖音创作者' },
  { text: '不要等到完美才开始，开始了才会完美。', author: '华特·迪士尼' },
  { text: '内容为王，但分发为后。', author: '比尔·盖茨' },
  { text: '最好的投资，就是投资自己的大脑。', author: '沃伦·巴菲特' },
  { text: '创意是将看似无关的事物联系在一起。', author: '史蒂夫·乔布斯' },
  { text: '今天的努力，是明天的伏笔。', author: '人民日报' },
  { text: '短视频的尽头，是真诚。', author: '新媒体观察' },
  { text: '坚持输出，时间会给你答案。', author: '内容创作者' },
  { text: '把每一件简单的事做好就是不简单。', author: '张瑞敏' },
  { text: '用户不关心你多努力，只关心你给的价值。', author: '产品思维' },
  { text: '好的叙事，胜过一切技巧。', author: '故事力' },
  { text: '流量会消失，但好内容会留下来。', author: '内容行业' },
  { text: '做内容就像种树，最好的时间是十年前，其次是现在。', author: '自媒体人' },
  { text: '先完成，再完美。', author: '效率手册' },
  { text: '你以为的极限，可能只是别人的起点。保持谦逊。', author: '成长思维' },
  { text: '日拱一卒，功不唐捐。', author: '古典文学' },
  { text: '所有伟大的事都是由一系列小事汇聚而成。', author: '梵高' },
  { text: '创作的本质是表达，而不是完美。', author: '写作课' },
  { text: '你不需要很厉害才能开始，但你需要开始才能变得厉害。', author: '行动力' },
  { text: '每天进步 1%，一年后你将强大 37 倍。', author: '复利思维' },
  { text: '把复杂的事做简单是创新，把简单的事做复杂是添乱。', author: '设计思维' },
  { text: '做你害怕做的事，害怕自然就会消失。', author: '拉尔夫·爱默生' },
  { text: '世界上最远的距离是知道和做到之间。', author: '执行力' },
  { text: '与其在等待中枯萎，不如在行动中绽放。', author: '行动派' },
  { text: '专注力是这个时代最稀缺的资源。', author: '深度工作' },
  { text: '没有记录就没有发生，没有复盘就没有成长。', author: '个人成长' },
  { text: '种一棵树最好的时间是十年前，其次是现在。', author: '非洲谚语' },
  { text: '你的内容，就是你灵魂的模样。', author: '内容哲学' },
];

function getDailyQuote() {
  const today = new Date();
  const dayOfYear = Math.floor(
    (today.getTime() - new Date(today.getFullYear(), 0, 0).getTime()) / 86400000
  );
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
  const styles = useThemeStyles();
  const authStore = useAuthStore();
  const dailyQuote = getDailyQuote();

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [team, monthly, pending, recent, inspirations] = await Promise.allSettled([
          getTeamStats(),
          getMonthlyStats(),
          getTopics({ status: 'pending' }),
          getTopics(),
          getInspirations({ limit: 6 }),
        ]);
        if (team.status === 'fulfilled') setTeamStats(team.value);
        if (monthly.status === 'fulfilled') setMonthlyStats(monthly.value);
        if (pending.status === 'fulfilled') setPendingTopics(pending.value.data.slice(0, 5));
        if (recent.status === 'fulfilled') setRecentTopics(recent.value.data.slice(0, 6));
        if (inspirations.status === 'fulfilled') {
          // 按投票数排序取前6
          const sorted = [...inspirations.value.data]
            .sort((a, b) => (b.votes || 0) - (a.votes || 0))
            .slice(0, 6);
          setHotInspirations(sorted);
        }
      } catch (error) {
        console.error('Failed to fetch dashboard data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  const handleVoteInspiration = async (id: number) => {
    try {
      await voteInspiration(id);
      setHotInspirations(prev =>
        prev.map(item =>
          item.id === id
            ? { ...item, votes: (item.votes || 0) + 1, voted: true }
            : item
        )
      );
    } catch {
      // 静默处理
    }
  };

  const statCards = [
    {
      title: '本月完成',
      value: () => `${teamStats?.completed_count || 0}`,
      unit: '选题',
      icon: CheckCircle,
      gradient: 'from-emerald-400 to-teal-500',
      shadowColor: 'shadow-emerald-500/25',
      change: '+12%',
      up: true,
    },
    {
      title: '待审核',
      value: () => `${pendingTopics.length}`,
      unit: '选题',
      icon: Clock,
      gradient: 'from-amber-400 to-orange-500',
      shadowColor: 'shadow-amber-500/25',
      change: '-3',
      up: false,
    },
    {
      title: '逾期任务',
      value: () => `${teamStats?.overdue_count || 0}`,
      unit: '个',
      icon: AlertTriangle,
      gradient: 'from-rose-400 to-red-500',
      shadowColor: 'shadow-rose-500/25',
      change: '+2',
      up: true,
    },
    {
      title: '完成率',
      value: () => `${teamStats?.completion_rate || '0'}%`,
      unit: '本月',
      icon: TrendingUp,
      gradient: 'from-blue-400 to-indigo-500',
      shadowColor: 'shadow-blue-500/25',
      change: '+8%',
      up: true,
    },
  ];

  const channelStats = [
    { label: '播放量', value: () => (monthlyStats?.total_views || 0).toLocaleString(), icon: TrendingUp, gradient: 'from-blue-500 to-cyan-500' },
    { label: '点赞量', value: () => (monthlyStats?.total_likes || 0).toLocaleString(), icon: Heart, gradient: 'from-rose-500 to-pink-500' },
    { label: '分享量', value: () => (monthlyStats?.total_shares || 0).toLocaleString(), icon: Share2, gradient: 'from-emerald-500 to-green-500' },
    { label: '评论量', value: () => (monthlyStats?.total_comments || 0).toLocaleString(), icon: MessageCircle, gradient: 'from-purple-500 to-violet-500' },
  ];

  const toolActions = [
    { id: 'pomodoro', label: '番茄钟', icon: Timer, path: '/pomodoro', gradient: 'from-rose-400 to-orange-400', desc: '专注创作' },
    { id: 'export', label: '导出报告', icon: Download, path: '/export', gradient: 'from-blue-400 to-indigo-400', desc: '数据导出' },
    { id: 'backup', label: '数据备份', icon: Database, path: '/backup', gradient: 'from-emerald-400 to-teal-400', desc: '安全备份' },
    { id: 'calendar', label: '排期日历', icon: Calendar, path: '/calendar', gradient: 'from-purple-400 to-pink-400', desc: '日程管理' },
    { id: 'resources', label: '资源库', icon: BookOpen, path: '/resources', gradient: 'from-cyan-400 to-blue-400', desc: '资源管理' },
    { id: 'inspirations', label: '灵感池', icon: Lightbulb, path: '/inspirations', gradient: 'from-amber-400 to-yellow-400', desc: '创意收集' },
  ];

  const StatCardSkeleton = () => (
    <div className="p-5 rounded-2xl bg-theme-secondary border border-theme-border">
      <div className="flex items-start justify-between">
        <div className="flex-1 space-y-3">
          <SkeletonLine width="60px" height="0.625rem" />
          <SkeletonLine width="80px" height="1.875rem" />
          <SkeletonLine width="50px" height="0.75rem" />
        </div>
        <div className="w-12 h-12 rounded-xl bg-theme-tertiary animate-pulse" />
      </div>
    </div>
  );

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-theme-tertiary animate-pulse" />
          <div className="space-y-2">
            <SkeletonLine width="200px" height="1.5rem" />
            <SkeletonLine width="140px" height="0.875rem" />
          </div>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => <StatCardSkeleton key={i} />)}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <SkeletonCard />
          <div className="lg:col-span-2"><SkeletonCard /></div>
        </div>
      </div>
    );
  }

  const userName = authStore.user?.name || '小伙伴';

  return (
    <div className="space-y-6">
      {/* 欢迎区 + 每日一言 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* 欢迎卡片 */}
        <div className="lg:col-span-2 relative overflow-hidden rounded-2xl bg-gradient-to-br from-blue-500 via-indigo-500 to-purple-600 p-6 text-white shadow-xl shadow-indigo-500/20">
          <div className="relative z-10">
            <div className="flex items-center gap-2 mb-1">
              <Sparkles className="w-5 h-5 text-amber-300" />
              <span className="text-sm font-medium text-white/80">今日状态</span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight">
              你好，{userName} 👋
            </h1>
            <p className="text-sm text-white/70 mt-1">
              今天也要元气满满地创作呀！已坚持 {Math.floor(Math.random() * 30 + 1)} 天 ✨
            </p>
            <div className="flex items-center gap-3 mt-4">
              <button
                onClick={() => navigate('/topics')}
                className="flex items-center gap-2 px-4 py-2 bg-white/20 backdrop-blur-sm rounded-xl text-sm font-medium hover:bg-white/30 transition-all duration-200"
              >
                <Compass className="w-4 h-4" />
                开始创作
              </button>
              <span className="text-white/40 text-sm">
                {new Date().toLocaleDateString('zh-CN', { weekday: 'long', month: 'long', day: 'numeric' })}
              </span>
            </div>
          </div>
          {/* 装饰圆 */}
          <div className="absolute top-0 right-0 w-40 h-40 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/2" />
          <div className="absolute bottom-0 right-16 w-24 h-24 bg-white/5 rounded-full translate-y-1/2" />
        </div>

        {/* 每日一言 */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-950/30 dark:to-orange-950/30 border border-amber-200/50 dark:border-amber-800/30 p-6">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shadow-md shadow-amber-400/30">
              <Quote className="w-4 h-4 text-white" />
            </div>
            <h3 className="text-sm font-semibold text-amber-800 dark:text-amber-200">每日一言</h3>
          </div>
          <blockquote className="text-sm text-amber-900 dark:text-amber-100 leading-relaxed italic">
            "{dailyQuote.text}"
          </blockquote>
          <p className="text-xs text-amber-600 dark:text-amber-400 mt-3 text-right">
            — {dailyQuote.author}
          </p>
          {/* 装饰 */}
          <div className="absolute bottom-2 right-2 text-6xl text-amber-200/20 dark:text-amber-800/20 select-none pointer-events-none">
            "
          </div>
        </div>
      </div>

      {/* 数据统计卡片 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((card, index) => {
          const Icon = card.icon;
          return (
            <div
              key={index}
              className="relative overflow-hidden rounded-2xl bg-theme-secondary border border-theme-border p-5 hover:shadow-xl transition-all duration-300 hover:-translate-y-1 group"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <p className="text-theme-text-muted text-xs font-semibold uppercase tracking-wider">{card.title}</p>
                  <div className="flex items-baseline gap-2 mt-3">
                    <p className="text-3xl font-bold tracking-tight text-theme-text">{card.value()}</p>
                    <span className="text-xs font-medium text-theme-text-muted">{card.unit}</span>
                  </div>
                  <div className="flex items-center gap-1 mt-2">
                    {card.up ? (
                      <ArrowUpRight className="w-3 h-3 text-rose-400" />
                    ) : (
                      <ArrowDownRight className="w-3 h-3 text-emerald-400" />
                    )}
                    <span className={`text-xs font-medium ${card.up ? 'text-rose-400' : 'text-emerald-400'}`}>
                      {card.change}
                    </span>
                    <span className="text-xs text-theme-text-muted">vs 上月</span>
                  </div>
                </div>
                <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${card.gradient} flex items-center justify-center transition-transform duration-200 group-hover:scale-110 group-hover:rotate-3 shadow-lg ${card.shadowColor}`}>
                  <Icon className="w-6 h-6 text-white" />
                </div>
              </div>
              {/* 底部渐变条 */}
              <div className={`absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r ${card.gradient} opacity-0 group-hover:opacity-100 transition-opacity duration-300`} />
            </div>
          );
        })}
      </div>

      {/* 频道数据 + 实用工具 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 频道数据 */}
        <div className="rounded-2xl bg-theme-secondary border border-theme-border p-6">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center shadow-md shadow-blue-500/20">
                <BarChart3 className="w-4 h-4 text-white" />
              </div>
              <h3 className="text-base font-semibold text-theme-text">频道数据</h3>
            </div>
            <button
              onClick={() => navigate('/analytics')}
              className="text-xs font-medium flex items-center gap-1 text-blue-500 hover:text-blue-400 transition-colors"
            >
              查看详情 <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {channelStats.map((stat, index) => {
              const Icon = stat.icon;
              return (
                <div key={index} className="rounded-xl p-3.5 bg-theme-tertiary/50 hover:bg-theme-tertiary transition-all duration-200 hover:scale-[1.02] cursor-pointer group">
                  <div className="flex items-center gap-3">
                    <div className={`w-9 h-9 rounded-lg bg-gradient-to-br ${stat.gradient} flex items-center justify-center shadow-sm group-hover:scale-110 transition-transform`}>
                      <Icon className="w-4 h-4 text-white" />
                    </div>
                    <div>
                      <p className="text-xs text-theme-text-muted">{stat.label}</p>
                      <p className="text-lg font-bold tracking-tight text-theme-text">{stat.value()}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* 实用工具 */}
        <div className="lg:col-span-2 rounded-2xl bg-theme-secondary border border-theme-border p-6">
          <div className="flex items-center gap-2.5 mb-6">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-purple-500 flex items-center justify-center shadow-md shadow-violet-500/20">
              <Zap className="w-4 h-4 text-white" />
            </div>
            <h3 className="text-base font-semibold text-theme-text">实用工具</h3>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {toolActions.map((action) => {
              const Icon = action.icon;
              return (
                <button
                  key={action.id}
                  onClick={() => navigate(action.path)}
                  className="group relative overflow-hidden rounded-xl p-4 bg-theme-tertiary/50 border border-theme-border hover:border-transparent hover:bg-gradient-to-br hover:from-white/10 hover:to-white/5 transition-all duration-300 hover:scale-[1.02] hover:shadow-lg text-left"
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${action.gradient} flex items-center justify-center shadow-md group-hover:scale-110 group-hover:rotate-3 transition-transform duration-200`}>
                      <Icon className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-theme-text group-hover:text-theme-text transition-colors">{action.label}</p>
                      <p className="text-xs text-theme-text-muted">{action.desc}</p>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* 热门灵感 + 公告/番茄钟 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 热门灵感 */}
        <div className="lg:col-span-2 rounded-2xl bg-theme-secondary border border-theme-border p-6">
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-orange-400 to-red-500 flex items-center justify-center shadow-md shadow-orange-400/20">
                <Flame className="w-4 h-4 text-white" />
              </div>
              <h3 className="text-base font-semibold text-theme-text">热门灵感</h3>
            </div>
            <button
              onClick={() => navigate('/inspirations')}
              className="text-xs font-medium flex items-center gap-1 text-orange-500 hover:text-orange-400 transition-colors"
            >
              查看全部 <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {hotInspirations.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {hotInspirations.map((item, index) => (
                <div
                  key={item.id}
                  className="group relative rounded-xl p-4 bg-theme-tertiary/50 hover:bg-theme-tertiary border border-theme-border/50 hover:border-orange-400/30 transition-all duration-200 cursor-pointer"
                  onClick={() => navigate('/inspirations')}
                >
                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-gradient-to-br from-orange-400/20 to-red-400/20 flex items-center justify-center text-xs font-bold text-orange-400">
                      {index + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-theme-text truncate group-hover:text-orange-400 transition-colors">
                        {item.title}
                      </p>
                      {item.description && (
                        <p className="text-xs text-theme-text-muted mt-1 line-clamp-1">{item.description}</p>
                      )}
                      <div className="flex items-center gap-3 mt-2">
                        {item.category && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-orange-500/10 text-orange-400 font-medium">
                            {item.category}
                          </span>
                        )}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleVoteInspiration(item.id);
                          }}
                          className={`flex items-center gap-1 text-[10px] font-medium transition-colors ${
                            item.voted ? 'text-rose-400' : 'text-theme-text-muted hover:text-rose-400'
                          }`}
                        >
                          <ThumbsUp className="w-3 h-3" />
                          {item.votes || 0}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 rounded-xl bg-theme-tertiary/30">
              <Lightbulb className="w-10 h-10 mx-auto mb-2 text-theme-text-muted" />
              <p className="text-sm text-theme-text-muted">还没有灵感，去创建一个吧！</p>
              <button
                onClick={() => navigate('/inspirations')}
                className="mt-3 text-xs text-orange-400 hover:text-orange-300 font-medium"
              >
                前往灵感池 →
              </button>
            </div>
          )}
        </div>

        {/* 公告 + 番茄钟 */}
        <div className="space-y-6">
          <AnnouncementBoard />
          <PomodoroTimer compact />
        </div>
      </div>

      {/* 待审核 + 最近任务 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 待审核选题 */}
        <div className="rounded-2xl bg-theme-secondary border border-theme-border p-6">
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-400 to-yellow-500 flex items-center justify-center shadow-md shadow-amber-400/20">
                <Clock className="w-4 h-4 text-white" />
              </div>
              <h3 className="text-base font-semibold text-theme-text">待审核选题</h3>
            </div>
            <button
              onClick={() => navigate('/topics?status=pending')}
              className="text-xs font-medium flex items-center gap-1 text-amber-500 hover:text-amber-400 transition-colors"
            >
              查看全部 <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="space-y-2">
            {pendingTopics.length > 0 ? (
              pendingTopics.map((topic, index) => {
                const status = STATUS_COLORS[topic.status] || STATUS_COLORS.pending;
                return (
                  <div
                    key={topic.id}
                    className="rounded-xl p-4 transition-all duration-200 cursor-pointer group bg-theme-tertiary/50 hover:bg-theme-tertiary border border-transparent hover:border-amber-400/20"
                    onClick={() => navigate(`/topics/${topic.id}`)}
                    style={{ animationDelay: `${index * 50}ms` }}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm group-hover:text-amber-400 transition-colors duration-200 truncate text-theme-text">
                          {topic.title}
                        </p>
                        <div className="flex items-center gap-3 mt-2">
                          <div className="flex items-center gap-1.5">
                            <div className="w-4 h-4 rounded-full bg-gradient-to-br from-amber-400 to-orange-400 flex items-center justify-center">
                              <Users className="w-2.5 h-2.5 text-white" />
                            </div>
                            <span className="text-xs text-theme-text-muted">{topic.creator_name}</span>
                          </div>
                          <span className="text-xs text-theme-text-muted">
                            {formatBeijingDate(topic.created_at)}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 ml-3">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium ${status.bg} ${status.text}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${status.dot}`} />
                          {STATUS_TEXT[topic.status]}
                        </span>
                        <ChevronRight className="w-4 h-4 text-theme-text-muted group-hover:text-amber-400 group-hover:translate-x-0.5 transition-all duration-200" />
                      </div>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="rounded-xl p-8 text-center bg-theme-tertiary/30">
                <CheckCircle className="w-12 h-12 mx-auto mb-3 text-emerald-400" />
                <p className="text-sm text-theme-text-muted">全部审核完毕，干得漂亮！🎉</p>
              </div>
            )}
          </div>
        </div>

        {/* 最近任务 */}
        <div className="rounded-2xl bg-theme-secondary border border-theme-border p-6">
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-400 to-green-500 flex items-center justify-center shadow-md shadow-emerald-400/20">
                <Target className="w-4 h-4 text-white" />
              </div>
              <h3 className="text-base font-semibold text-theme-text">最近任务</h3>
            </div>
            <button
              onClick={() => navigate('/topics')}
              className="text-xs font-medium flex items-center gap-1 text-emerald-500 hover:text-emerald-400 transition-colors"
            >
              查看全部 <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="space-y-2">
            {recentTopics.length > 0 ? (
              recentTopics.map((topic) => {
                const status = STATUS_COLORS[topic.status] || STATUS_COLORS.pending;
                return (
                  <div
                    key={topic.id}
                    className="rounded-xl p-4 transition-all duration-200 cursor-pointer group bg-theme-tertiary/50 hover:bg-theme-tertiary border border-transparent hover:border-emerald-400/20"
                    onClick={() => {
                      const pathMap: Record<string, string> = {
                        production: '/production',
                        shooting: '/shooting',
                        publishing: '/publishing',
                      };
                      const path = pathMap[topic.status] || `/topics/${topic.id}`;
                      navigate(path);
                    }}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm group-hover:text-emerald-400 transition-colors duration-200 truncate text-theme-text">
                          {topic.title}
                        </p>
                        <div className="flex items-center gap-2 mt-2">
                          <span className="text-xs text-theme-text-muted">
                            当前阶段: <span className={`font-medium ${status.text}`}>{STATUS_TEXT[topic.status]}</span>
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 ml-3">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium ${status.bg} ${status.text}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${status.dot}`} />
                          {STATUS_TEXT[topic.status]}
                        </span>
                        <ChevronRight className="w-4 h-4 text-theme-text-muted group-hover:text-emerald-400 group-hover:translate-x-0.5 transition-all duration-200" />
                      </div>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="rounded-xl p-8 text-center bg-theme-tertiary/30">
                <FileText className="w-12 h-12 mx-auto mb-3 text-theme-text-muted" />
                <p className="text-sm text-theme-text-muted">暂无任务记录</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
