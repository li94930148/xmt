import { useState, useEffect, useMemo } from 'react';
import { useAppStore } from '../store';
import {
  getAchievements, getMyAchievements, getAchievementProgress,
  getAchievementStats, getLeaderboard, getRecentAchievements,
  checkAchievements, seedAchievements
} from '../api';
import type { Achievement, AchievementStats, AchievementProgress, LeaderboardEntry, RecentAchievement } from '../api/achievements';
import { useThemeStyles } from '../hooks/useThemeStyles';
import { usePermission } from '../hooks/usePermission';
import { StatusBadge, RarityBadge, PointBadge } from '../components/Badge';
import { ACHIEVEMENT_CATEGORIES, ACHIEVEMENT_RARITIES, ACHIEVEMENT_LEVELS } from '../constants';
import { formatBeijingDate } from '../lib/utils';
import {
  Trophy, Award, Star, Sparkles, Lock, CheckCircle, RefreshCw,
  TrendingUp, Users, Crown, Zap, Filter, ChevronRight
} from 'lucide-react';

type TabKey = 'all' | 'earned' | 'locked';
type ViewMode = 'grid' | 'leaderboard' | 'feed';

export default function Achievements() {
  const [allAchievements, setAllAchievements] = useState<Achievement[]>([]);
  const [myAchievements, setMyAchievements] = useState<Achievement[]>([]);
  const [progress, setProgress] = useState<Record<number, AchievementProgress>>({});
  const [stats, setStats] = useState<AchievementStats | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [recentAchievements, setRecentAchievements] = useState<RecentAchievement[]>([]);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [activeTab, setActiveTab] = useState<TabKey>('all');
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [rarityFilter, setRarityFilter] = useState('all');
  const appStore = useAppStore();
  const styles = useThemeStyles();
  const { hasPermission } = usePermission();
  const canManageAchievements = hasPermission('system:achievement');

  const fetchData = async () => {
    setLoading(true);
    try {
      const [allRes, myRes, progressRes, statsRes, leaderboardRes, recentRes] = await Promise.all([
        getAchievements().catch(() => []),
        getMyAchievements().catch(() => []),
        getAchievementProgress().catch(() => ({})),
        getAchievementStats().catch(() => null),
        getLeaderboard().catch(() => []),
        getRecentAchievements(10).catch(() => []),
      ]);
      setAllAchievements(Array.isArray(allRes) ? allRes : []);
      setMyAchievements(Array.isArray(myRes) ? myRes : []);
      setProgress(progressRes || {});
      setStats(statsRes);
      setLeaderboard(Array.isArray(leaderboardRes) ? leaderboardRes : []);
      setRecentAchievements(Array.isArray(recentRes) ? recentRes : []);
    } catch (error) {
      appStore.addNotification({ title: '获取成就数据失败', message: (error as Error).message, type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  // 已获得的 ID 集合
  const earnedIds = useMemo(() => new Set(myAchievements.filter(a => a.earned).map(a => a.id)), [myAchievements]);

  // 根据 tab 和筛选条件过滤
  const filteredAchievements = useMemo(() => {
    let list = allAchievements;
    if (activeTab === 'earned') list = list.filter(a => earnedIds.has(a.id));
    if (activeTab === 'locked') list = list.filter(a => !earnedIds.has(a.id));
    if (categoryFilter !== 'all') list = list.filter(a => a.category === categoryFilter);
    if (rarityFilter !== 'all') list = list.filter(a => a.rarity === rarityFilter);
    return list;
  }, [allAchievements, activeTab, categoryFilter, rarityFilter, earnedIds]);

  // 当前用户等级
  const currentLevel = useMemo(() => {
    const points = stats?.totalPoints || 0;
    const level = [...ACHIEVEMENT_LEVELS].reverse().find(l => points >= l.minPoints);
    return level || ACHIEVEMENT_LEVELS[0];
  }, [stats]);

  // 下一级所需积分
  const nextLevel = useMemo(() => {
    const points = stats?.totalPoints || 0;
    return ACHIEVEMENT_LEVELS.find(l => l.minPoints > points);
  }, [stats]);

  const handleCheck = async () => {
    setChecking(true);
    try {
      const result = await checkAchievements();
      if (result.newAchievements && result.newAchievements.length > 0) {
        appStore.addNotification({
          title: '🎉 新成就解锁！',
          message: `恭喜获得 ${result.newAchievements.map(a => a.name).join('、')}`,
          type: 'success',
        });
      } else {
        appStore.addNotification({ title: '检查完成', message: '暂无新成就解锁', type: 'info' });
      }
      fetchData();
    } catch (error) {
      appStore.addNotification({ title: '检查失败', message: (error as Error).message, type: 'error' });
    } finally {
      setChecking(false);
    }
  };

  const handleSeed = async () => {
    setSeeding(true);
    try {
      const result = await seedAchievements();
      appStore.addNotification({ title: '初始化完成', message: result.message, type: 'success' });
      fetchData();
    } catch (error) {
      appStore.addNotification({ title: '初始化失败', message: (error as Error).message, type: 'error' });
    } finally {
      setSeeding(false);
    }
  };

  const earnedCount = myAchievements.filter(a => a.earned).length;
  const totalCount = allAchievements.length;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className={`w-8 h-8 border-4 ${styles.spinner} border-t-transparent rounded-full animate-spin`}></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 头部 */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className={styles.pageTitle}>成就系统</h1>
          <p className={`${styles.subtitle} mt-1`}>完成任务解锁成就，展示你的工作成果</p>
        </div>
        <div className="flex items-center gap-2">
          {canManageAchievements && allAchievements.length === 0 && (
            <button
              onClick={handleSeed}
              disabled={seeding}
              className={`flex items-center gap-2 px-4 py-2.5 ${styles.buttonSecondary} rounded-xl transition-all duration-200 disabled:opacity-50`}
            >
              {seeding ? (
                <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
              ) : (
                <Zap className="w-4 h-4" />
              )}
              <span className="font-medium text-sm">初始化预设成就</span>
            </button>
          )}
          <button
            onClick={handleCheck}
            disabled={checking}
            className={`flex items-center gap-2 px-5 py-2.5 ${styles.buttonPrimary} rounded-xl transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50`}
          >
            {checking ? (
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4" />
            )}
            <span className="font-medium text-sm">检查新成就</span>
          </button>
        </div>
      </div>

      {/* 等级 & 统计卡片 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* 等级卡片 */}
        <div className={`${styles.card} p-5 relative overflow-hidden`}>
          <div className="absolute top-2 right-2 text-4xl opacity-20">{currentLevel.icon}</div>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-yellow-500/20 to-orange-500/20 flex items-center justify-center">
              <Crown className="w-6 h-6 text-yellow-400" />
            </div>
            <div>
              <p className={`text-2xl font-bold ${styles.textPrimary}`}>
                Lv.{currentLevel.level} {currentLevel.name}
              </p>
              <p className={`text-xs ${styles.textMuted}`}>
                {stats?.totalPoints || 0} 积分
                {nextLevel && ` · 距下一级还需 ${nextLevel.minPoints - (stats?.totalPoints || 0)}`}
              </p>
            </div>
          </div>
          {/* 进度条 */}
          {nextLevel && (
            <div className="mt-3">
              <div className={`h-1.5 rounded-full ${styles.progressBg}`}>
                <div
                  className="h-full rounded-full bg-gradient-to-r from-yellow-500 to-orange-500 transition-all duration-500"
                  style={{ width: `${Math.min(100, ((stats?.totalPoints || 0) - currentLevel.minPoints) / (nextLevel.minPoints - currentLevel.minPoints) * 100)}%` }}
                />
              </div>
            </div>
          )}
        </div>

        {/* 已解锁 */}
        <div className={`${styles.card} p-5`}>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-[#5c7cfa]/15 flex items-center justify-center">
              <Trophy className="w-6 h-6 text-[#5c7cfa]" />
            </div>
            <div>
              <p className={`text-2xl font-bold ${styles.textPrimary}`}>
                {earnedCount}<span className={`text-sm font-normal ${styles.textMuted}`}>/{totalCount}</span>
              </p>
              <p className={`text-xs ${styles.textMuted}`}>已解锁成就</p>
            </div>
          </div>
        </div>

        {/* 总积分 */}
        <div className={`${styles.card} p-5`}>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-yellow-500/15 flex items-center justify-center">
              <Star className="w-6 h-6 text-yellow-400" />
            </div>
            <div>
              <p className={`text-2xl font-bold ${styles.textPrimary}`}>{stats?.totalPoints || 0}</p>
              <p className={`text-xs ${styles.textMuted}`}>总积分</p>
            </div>
          </div>
        </div>

        {/* 完成度 */}
        <div className={`${styles.card} p-5`}>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-green-500/15 flex items-center justify-center">
              <Award className="w-6 h-6 text-green-400" />
            </div>
            <div>
              <p className={`text-2xl font-bold ${styles.textPrimary}`}>
                {totalCount > 0 ? Math.round((earnedCount / totalCount) * 100) : 0}%
              </p>
              <p className={`text-xs ${styles.textMuted}`}>完成度</p>
            </div>
          </div>
        </div>
      </div>

      {/* 视图切换 + 筛选 */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        {/* Tab 切换 */}
        <div className={`flex items-center gap-1 p-1 rounded-xl ${styles.bgTertiary}`}>
          {[
            { key: 'all', label: '全部', count: totalCount },
            { key: 'earned', label: '已获得', count: earnedCount },
            { key: 'locked', label: '未解锁', count: totalCount - earnedCount },
          ].map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key as TabKey)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                activeTab === tab.key
                  ? `${styles.bgCard} ${styles.textPrimary} shadow-sm`
                  : `${styles.textSecondary} hover:${styles.textPrimary}`
              }`}
            >
              {tab.label} <span className={`ml-1 text-xs ${styles.textMuted}`}>({tab.count})</span>
            </button>
          ))}
        </div>

        {/* 筛选 & 视图 */}
        <div className="flex items-center gap-2">
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className={`px-3 py-2 text-sm rounded-lg ${styles.input}`}
          >
            <option value="all">全部分类</option>
            {ACHIEVEMENT_CATEGORIES.map(c => (
              <option key={c.value} value={c.value}>{c.icon} {c.label}</option>
            ))}
          </select>
          <select
            value={rarityFilter}
            onChange={(e) => setRarityFilter(e.target.value)}
            className={`px-3 py-2 text-sm rounded-lg ${styles.input}`}
          >
            <option value="all">全部稀有度</option>
            {ACHIEVEMENT_RARITIES.map(r => (
              <option key={r.value} value={r.value}>{r.label}</option>
            ))}
          </select>
          <div className={`flex items-center gap-1 p-1 rounded-lg ${styles.bgTertiary}`}>
            <button
              onClick={() => setViewMode('grid')}
              className={`p-2 rounded-md transition-colors ${viewMode === 'grid' ? `${styles.bgCard} ${styles.textPrimary}` : styles.textMuted}`}
              title="卡片视图"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" /></svg>
            </button>
            <button
              onClick={() => setViewMode('leaderboard')}
              className={`p-2 rounded-md transition-colors ${viewMode === 'leaderboard' ? `${styles.bgCard} ${styles.textPrimary}` : styles.textMuted}`}
              title="排行榜"
            >
              <TrendingUp className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('feed')}
              className={`p-2 rounded-md transition-colors ${viewMode === 'feed' ? `${styles.bgCard} ${styles.textPrimary}` : styles.textMuted}`}
              title="动态"
            >
              <Sparkles className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* 内容区域 */}
      {viewMode === 'grid' && (
        <>
          {filteredAchievements.length === 0 ? (
            <div className={`${styles.card} p-12 text-center`}>
              <Trophy className={`w-12 h-12 ${styles.textMuted} mx-auto mb-4`} />
              <h3 className={`text-lg font-medium ${styles.textPrimary} mb-2`}>
                {allAchievements.length === 0 ? '暂无成就' : '没有匹配的成就'}
              </h3>
              <p className={styles.textSecondary}>
                {allAchievements.length === 0 ? '点击上方按钮初始化预设成就' : '尝试调整筛选条件'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredAchievements.map(achievement => {
                const isEarned = earnedIds.has(achievement.id);
                const prog = progress[achievement.id];
                const rarityConfig = ACHIEVEMENT_RARITIES.find(r => r.value === achievement.rarity) || ACHIEVEMENT_RARITIES[0];

                return (
                  <div
                    key={achievement.id}
                    className={`${styles.card} p-5 transition-all duration-300 hover:shadow-soft-lg ${
                      isEarned
                        ? `border-[${rarityConfig.value === 'legendary' ? '#ffd43b' : '#5c7cfa'}]/30 hover:-translate-y-0.5`
                        : 'opacity-70 hover:opacity-90'
                    }`}
                  >
                    <div className="flex items-start gap-4">
                      {/* 图标 */}
                      <div className={`w-14 h-14 rounded-xl flex items-center justify-center flex-shrink-0 transition-transform duration-200 ${
                        isEarned
                          ? 'bg-gradient-to-br from-yellow-500/20 to-orange-500/20'
                          : styles.bgTertiary
                      }`}>
                        {isEarned ? (
                          <span className="text-3xl">{achievement.icon || '🏆'}</span>
                        ) : (
                          <Lock className={`w-6 h-6 ${styles.textMuted}`} />
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        {/* 标题行 */}
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className={`text-sm font-semibold ${styles.textPrimary} truncate`}>
                            {achievement.name}
                          </h3>
                          {isEarned && <CheckCircle className="w-4 h-4 text-green-400 flex-shrink-0" />}
                        </div>

                        {/* 描述 */}
                        <p className={`text-xs ${styles.textSecondary} mb-2 line-clamp-2`}>
                          {achievement.description}
                        </p>

                        {/* 标签 */}
                        <div className="flex items-center gap-2 flex-wrap mb-2">
                          <RarityBadge rarity={achievement.rarity} />
                          <PointBadge points={achievement.points || 0} />
                          {achievement.category && (
                            <span className={`text-[10px] px-2 py-0.5 rounded-full ${styles.bgTertiary} ${styles.textMuted}`}>
                              {ACHIEVEMENT_CATEGORIES.find(c => c.value === achievement.category)?.label || achievement.category}
                            </span>
                          )}
                        </div>

                        {/* 进度条（仅未获得时显示） */}
                        {!isEarned && prog && prog.target > 0 && (
                          <div>
                            <div className="flex items-center justify-between mb-1">
                              <span className={`text-[10px] ${styles.textMuted}`}>
                                {prog.current}/{prog.target}
                              </span>
                              <span className={`text-[10px] ${styles.textMuted}`}>
                                {prog.percentage}%
                              </span>
                            </div>
                            <div className={`h-1.5 rounded-full ${styles.progressBg}`}>
                              <div
                                className="h-full rounded-full bg-gradient-to-r from-[#5c7cfa] to-[#748ffc] transition-all duration-500"
                                style={{ width: `${prog.percentage}%` }}
                              />
                            </div>
                          </div>
                        )}

                        {/* 获得时间 */}
                        {isEarned && achievement.earned_at && (
                          <p className={`text-[10px] ${styles.textMuted} mt-1`}>
                            ✅ {formatBeijingDate(achievement.earned_at)} 获得
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* 排行榜视图 */}
      {viewMode === 'leaderboard' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* 积分排行榜 */}
          <div className={`${styles.card} p-6`}>
            <div className="flex items-center gap-2.5 mb-5">
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center bg-yellow-500/10`}>
                <Crown className="w-4 h-4 text-yellow-400" />
              </div>
              <h3 className={`text-base font-semibold ${styles.textPrimary}`}>积分排行榜</h3>
            </div>

            {leaderboard.length === 0 ? (
              <div className={`p-8 text-center ${styles.textMuted}`}>
                <Users className="w-10 h-10 mx-auto mb-3 opacity-50" />
                <p className="text-sm">暂无数据</p>
              </div>
            ) : (
              <div className="space-y-2">
                {leaderboard.map((entry, index) => {
                  const isTop3 = index < 3;
                  const medals = ['🥇', '🥈', '🥉'];
                  return (
                    <div
                      key={entry.user_id}
                      className={`flex items-center gap-4 p-3 rounded-xl transition-colors ${
                        isTop3 ? 'bg-yellow-500/5' : styles.hoverBg
                      }`}
                    >
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-sm ${
                        isTop3 ? 'text-lg' : `${styles.bgTertiary} ${styles.textMuted}`
                      }`}>
                        {isTop3 ? medals[index] : index + 1}
                      </div>
                      <div className={`w-9 h-9 rounded-full bg-gradient-to-br from-[#5c7cfa] to-[#748ffc] flex items-center justify-center text-white font-bold text-sm`}>
                        {entry.user_name?.charAt(0) || '?'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-medium ${styles.textPrimary} truncate`}>{entry.user_name}</p>
                        <p className={`text-xs ${styles.textMuted}`}>{entry.achievement_count} 个成就</p>
                      </div>
                      <div className="text-right">
                        <p className={`text-sm font-bold ${styles.textPrimary}`}>{entry.total_points}</p>
                        <p className={`text-[10px] ${styles.textMuted}`}>积分</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* 成就分类统计 */}
          <div className={`${styles.card} p-6`}>
            <div className="flex items-center gap-2.5 mb-5">
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center bg-[#5c7cfa]/10`}>
                <TrendingUp className="w-4 h-4 text-[#5c7cfa]" />
              </div>
              <h3 className={`text-base font-semibold ${styles.textPrimary}`}>分类统计</h3>
            </div>

            <div className="space-y-3">
              {ACHIEVEMENT_CATEGORIES.map(cat => {
                const catStats = stats?.byCategory?.find(c => c.category === cat.value);
                const total = catStats?.total || 0;
                const earned = catStats?.earned || 0;
                const pct = total > 0 ? Math.round((earned / total) * 100) : 0;

                return (
                  <div key={cat.value} className={`p-4 rounded-xl ${styles.bgTertiary}`}>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-lg">{cat.icon}</span>
                        <span className={`text-sm font-medium ${styles.textPrimary}`}>{cat.label}</span>
                      </div>
                      <span className={`text-xs ${styles.textMuted}`}>{earned}/{total}</span>
                    </div>
                    <div className={`h-1.5 rounded-full ${styles.progressBg}`}>
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-[#5c7cfa] to-[#748ffc] transition-all duration-500"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            {/* 稀有度分布 */}
            <div className="mt-6">
              <h4 className={`text-sm font-medium ${styles.textPrimary} mb-3`}>稀有度分布</h4>
              <div className="grid grid-cols-2 gap-2">
                {ACHIEVEMENT_RARITIES.map(rarity => {
                  const rStats = stats?.byRarity?.find(r => r.rarity === rarity.value);
                  return (
                    <div key={rarity.value} className={`flex items-center justify-between p-3 rounded-lg ${styles.bgTertiary}`}>
                      <div className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full ${rarity.bg.replace('/10', '')}`} />
                        <span className={`text-xs font-medium ${rarity.color}`}>{rarity.label}</span>
                      </div>
                      <span className={`text-xs ${styles.textMuted}`}>{rStats?.earned || 0}/{rStats?.total || 0}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 动态视图 */}
      {viewMode === 'feed' && (
        <div className={`${styles.card} p-6`}>
          <div className="flex items-center gap-2.5 mb-5">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center bg-purple-500/10`}>
              <Sparkles className="w-4 h-4 text-purple-400" />
            </div>
            <h3 className={`text-base font-semibold ${styles.textPrimary}`}>最近获得的成就</h3>
          </div>

          {recentAchievements.length === 0 ? (
            <div className={`p-8 text-center ${styles.textMuted}`}>
              <Trophy className="w-10 h-10 mx-auto mb-3 opacity-50" />
              <p className="text-sm">暂无人获得成就</p>
            </div>
          ) : (
            <div className="space-y-3">
              {recentAchievements.map((item, index) => {
                const rarityConfig = ACHIEVEMENT_RARITIES.find(r => r.value === item.rarity) || ACHIEVEMENT_RARITIES[0];
                return (
                  <div
                    key={item.id}
                    className={`flex items-center gap-4 p-4 rounded-xl transition-all duration-200 ${styles.hoverBg}`}
                    style={{ animationDelay: `${index * 50}ms` }}
                  >
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#5c7cfa] to-[#748ffc] flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
                      {item.user_name?.charAt(0) || '?'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm ${styles.textPrimary}`}>
                        <span className="font-semibold">{item.user_name}</span>
                        <span className={styles.textSecondary}> 获得了 </span>
                        <span className="font-semibold">{item.achievement_name}</span>
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        <RarityBadge rarity={item.rarity} />
                        <PointBadge points={item.points} />
                        <span className={`text-[10px] ${styles.textMuted}`}>
                          {formatBeijingDate(item.earned_at)}
                        </span>
                      </div>
                    </div>
                    <span className="text-2xl flex-shrink-0">{item.icon || '🏆'}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
