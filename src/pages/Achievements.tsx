import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import PageHeading from '@/components/common/PageHeading';
import { useAppStore, useAuthStore } from '../store';
import { ErrorState, LoadingState } from '../components/common';
import {
  getAchievements, getMyAchievements, getAchievementProgress,
  getAchievementStats, getLeaderboard, getRecentAchievements,
  checkAchievements, seedAchievements
} from '../api';
import { AchievementApiError, type Achievement, type AchievementStats, type AchievementProgress, type LeaderboardEntry, type RecentAchievement } from '../api/achievements';
import { useThemeStyles } from '../hooks/useThemeStyles';
import { usePermission } from '../hooks/usePermission';
import { RarityBadge, PointBadge } from '../components/Badge';
import { ACHIEVEMENT_CATEGORIES, ACHIEVEMENT_RARITIES, ACHIEVEMENT_LEVELS } from '../constants';
import { formatBeijingDate } from '../lib/utils';
import { getUserFacingErrorMessage } from '../lib/userFacingError';
import {
  Trophy, Award, Star, Sparkles, Lock, CheckCircle, RefreshCw,
  TrendingUp, Users, Crown, Zap
} from 'lucide-react';

type TabKey = 'all' | 'earned' | 'locked';
type ViewMode = 'grid' | 'leaderboard' | 'feed';
type SeedRecovery = {
  actorId: number;
  kind: 'unknown' | 'not_found';
  message: string;
};

const transientSeedStatuses = new Set([408, 425, 429]);

function isDefinitiveSeedRejection(error: unknown): error is AchievementApiError {
  return error instanceof AchievementApiError
    && error.status >= 400
    && error.status < 500
    && !transientSeedStatuses.has(error.status);
}

export default function Achievements() {
  const [allAchievements, setAllAchievements] = useState<Achievement[]>([]);
  const [myAchievements, setMyAchievements] = useState<Achievement[]>([]);
  const [progress, setProgress] = useState<Record<number, AchievementProgress>>({});
  const [stats, setStats] = useState<AchievementStats | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [recentAchievements, setRecentAchievements] = useState<RecentAchievement[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [checking, setChecking] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [seedRecovery, setSeedRecovery] = useState<SeedRecovery | null>(null);
  const [seedVerificationBusy, setSeedVerificationBusy] = useState(false);
  const [activeTab, setActiveTab] = useState<TabKey>('all');
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [rarityFilter, setRarityFilter] = useState('all');
  const appStore = useAppStore();
  const styles = useThemeStyles();
  const { hasPermission } = usePermission();
  const canManageAchievements = hasPermission('system:achievement');
  const seedMutationLockRef = useRef(false);
  const seedVerificationLockRef = useRef(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const [allRes, myRes, progressRes, statsRes, leaderboardRes, recentRes] = await Promise.all([
        getAchievements(),
        getMyAchievements(),
        getAchievementProgress(),
        getAchievementStats(),
        getLeaderboard(),
        getRecentAchievements(10),
      ]);
      setAllAchievements(Array.isArray(allRes) ? allRes : []);
      setMyAchievements(Array.isArray(myRes) ? myRes : []);
      setProgress(progressRes || {});
      setStats(statsRes);
      setLeaderboard(Array.isArray(leaderboardRes) ? leaderboardRes : []);
      setRecentAchievements(Array.isArray(recentRes) ? recentRes : []);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void fetchData(); }, [fetchData]);

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
      appStore.addNotification({
        title: '检查失败',
        message: getUserFacingErrorMessage(error, '检查新成就暂时失败，请稍后重试。'),
        type: 'error',
      });
    } finally {
      setChecking(false);
    }
  };

  async function verifySeedRecovery(recovery: SeedRecovery) {
    if (seedVerificationLockRef.current) return;
    if (Number(useAuthStore.getState().user?.id) !== recovery.actorId) {
      setSeedRecovery({
        ...recovery,
        kind: 'unknown',
        message: '登录账号已变化；请切回发起初始化的账号后再只读核实。',
      });
      return;
    }

    seedVerificationLockRef.current = true;
    setSeedVerificationBusy(true);
    setSeedRecovery({
      ...recovery,
      kind: 'unknown',
      message: '正在只读核实预设成就初始化结果；核实期间不会再次提交。',
    });
    try {
      const definitions = await getAchievements(undefined, undefined, { cache: 'no-store' });
      if (!Array.isArray(definitions)) throw new Error('成就列表格式异常');
      if (Number(useAuthStore.getState().user?.id) !== recovery.actorId) {
        setSeedRecovery({
          ...recovery,
          kind: 'unknown',
          message: '登录账号已变化；请切回发起初始化的账号后再只读核实。',
        });
        return;
      }

      if (definitions.length > 0) {
        setAllAchievements(definitions);
        setSeedRecovery(null);
        appStore.addNotification({
          title: '初始化结果已核实',
          message: '只读核实确认服务器当前已有预设成就内容，页面已同步；未重复提交。',
          type: 'success',
        });
        return;
      }

      setSeedRecovery({
        actorId: recovery.actorId,
        kind: 'not_found',
        message: '只读核实确认服务器当前成就列表为空；确认后可显式重试初始化。',
      });
    } catch {
      setSeedRecovery({
        actorId: recovery.actorId,
        kind: 'unknown',
        message: '暂时无法核实预设成就初始化结果；写入已锁定，请只读重新核实。',
      });
    } finally {
      seedVerificationLockRef.current = false;
      setSeedVerificationBusy(false);
    }
  }

  const handleSeed = async () => {
    if (seedMutationLockRef.current || (seedRecovery && seedRecovery.kind !== 'not_found')) return;
    const actorId = Number(useAuthStore.getState().user?.id);
    if (!Number.isSafeInteger(actorId) || actorId <= 0) {
      appStore.addNotification({ title: '初始化失败', message: '登录状态尚未确认，请重新登录后重试。', type: 'error' });
      return;
    }

    seedMutationLockRef.current = true;
    setSeeding(true);
    setSeedRecovery(null);
    try {
      const result = await seedAchievements();
      appStore.addNotification({ title: '初始化完成', message: result.message, type: 'success' });
      await fetchData();
    } catch (error) {
      if (!isDefinitiveSeedRejection(error)) {
        const recovery: SeedRecovery = {
          actorId,
          kind: 'unknown',
          message: '预设成就初始化结果尚未确认，正在只读核实；核实前不会再次提交。',
        };
        setSeedRecovery(recovery);
        await verifySeedRecovery(recovery);
        return;
      }
      appStore.addNotification({
        title: '初始化失败',
        message: getUserFacingErrorMessage(error, '启用预设成就暂时失败，请稍后重试。'),
        type: 'error',
      });
    } finally {
      seedMutationLockRef.current = false;
      setSeeding(false);
    }
  };

  const earnedCount = myAchievements.filter(a => a.earned).length;
  const totalCount = allAchievements.length;

  if (loading) {
    return <LoadingState type="inline" text="正在加载成就数据…" className="flex h-64 w-full justify-center" />;
  }

  if (loadError) {
    return (
      <ErrorState
        title="成就数据加载失败"
        description="暂时无法获取完整成就信息，请检查网络后重试。"
        actionText="重试加载"
        onRetry={() => void fetchData()}
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* 头部 */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <PageHeading className={styles.pageTitle}>成就系统</PageHeading>
          <p className={`${styles.subtitle} mt-1`}>完成任务解锁成就，展示你的工作成果</p>
        </div>
        <div className="flex items-center gap-2">
          {canManageAchievements && allAchievements.length === 0 && !seedRecovery && (
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
              <span className="font-medium text-sm">启用预设成就</span>
            </button>
          )}
          {allAchievements.length > 0 && (
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
          )}
        </div>
      </div>

      {seedRecovery ? (
        <div
          data-testid="achievement-seed-recovery"
          role={seedRecovery.kind === 'unknown' ? 'alert' : 'status'}
          className={`flex flex-col gap-3 rounded-xl border p-4 ${styles.border} ${styles.card}`}
        >
          <p className={styles.textSecondary}>{seedRecovery.message}</p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void verifySeedRecovery(seedRecovery)}
              disabled={seedVerificationBusy || seeding}
              className={`px-4 py-2 ${styles.buttonSecondary} rounded-xl disabled:opacity-50`}
            >
              {seedVerificationBusy ? '正在只读核实…' : '只读重新核实'}
            </button>
            {seedRecovery.kind === 'not_found' ? (
              <button
                type="button"
                onClick={() => void handleSeed()}
                disabled={seeding || seedVerificationBusy}
                className={`px-4 py-2 ${styles.buttonPrimary} rounded-xl disabled:opacity-50`}
              >
                {seeding ? '正在初始化…' : '明确重试初始化'}
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      {/* 等级 & 统计卡片 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* 等级卡片 */}
        <div className={`${styles.card} p-5 relative overflow-hidden`}>
          <div className="absolute top-2 right-2 text-4xl opacity-20">{currentLevel.icon}</div>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-studio-amber/20 to-studio-amber/20 flex items-center justify-center">
              <Crown className="w-6 h-6 text-studio-amber" />
            </div>
            <div>
              <p className={`text-2xl font-bold ${styles.textPrimary}`}>
                Lv.{currentLevel.level} {currentLevel.name}
              </p>
              <p className={`text-xs ${styles.textSecondary}`}>
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
                  className="h-full rounded-full bg-gradient-to-r from-studio-amber to-studio-amber transition-all duration-500"
                  style={{ width: `${Math.min(100, ((stats?.totalPoints || 0) - currentLevel.minPoints) / (nextLevel.minPoints - currentLevel.minPoints) * 100)}%` }}
                />
              </div>
            </div>
          )}
        </div>

        {/* 已解锁 */}
        <div className={`${styles.card} p-5`}>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-studio-primary/15 flex items-center justify-center">
              <Trophy className="w-6 h-6 text-studio-primary" />
            </div>
            <div>
              <p className={`text-2xl font-bold ${styles.textPrimary}`}>
                {earnedCount}<span className={`text-sm font-normal ${styles.textSecondary}`}>/{totalCount}</span>
              </p>
              <p className={`text-xs ${styles.textSecondary}`}>已解锁成就</p>
            </div>
          </div>
        </div>

        {/* 总积分 */}
        <div className={`${styles.card} p-5`}>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-studio-amber/15 flex items-center justify-center">
              <Star className="w-6 h-6 text-studio-amber" />
            </div>
            <div>
              <p className={`text-2xl font-bold ${styles.textPrimary}`}>{stats?.totalPoints || 0}</p>
              <p className={`text-xs ${styles.textSecondary}`}>总积分</p>
            </div>
          </div>
        </div>

        {/* 完成度 */}
        <div className={`${styles.card} p-5`}>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-studio-success/15 flex items-center justify-center">
              <Award className="w-6 h-6 text-studio-success" />
            </div>
            <div>
              <p className={`text-2xl font-bold ${styles.textPrimary}`}>
                {totalCount > 0 ? Math.round((earnedCount / totalCount) * 100) : 0}%
              </p>
              <p className={`text-xs ${styles.textSecondary}`}>完成度</p>
            </div>
          </div>
        </div>
      </div>

      {/* 视图切换 + 筛选 */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        {/* Tab 切换 */}
        <div role="group" aria-label="按成就状态筛选" className={`flex items-center gap-1 p-1 rounded-xl ${styles.bgTertiary}`}>
          {[
            { key: 'all', label: '全部', count: totalCount },
            { key: 'earned', label: '已获得', count: earnedCount },
            { key: 'locked', label: '未解锁', count: totalCount - earnedCount },
          ].map(tab => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key as TabKey)}
              aria-pressed={activeTab === tab.key}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                activeTab === tab.key
                  ? `${styles.bgCard} ${styles.textPrimary} shadow-sm`
                  : `${styles.textSecondary} hover:${styles.textPrimary}`
              }`}
            >
              {tab.label} <span data-testid="achievement-filter-count" className="ml-1 text-xs text-studio-text-secondary">({tab.count})</span>
            </button>
          ))}
        </div>

        {/* 筛选 & 视图 */}
        <div className="flex items-center gap-2">
          <select
            id="achievement-category-filter"
            name="achievementCategory"
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            aria-label="按成就类别筛选"
            className={`px-3 py-2 text-sm rounded-lg ${styles.input}`}
          >
            <option value="all">全部分类</option>
            {ACHIEVEMENT_CATEGORIES.map(c => (
              <option key={c.value} value={c.value}>{c.icon} {c.label}</option>
            ))}
          </select>
          <select
            id="achievement-rarity-filter"
            name="achievementRarity"
            value={rarityFilter}
            onChange={(e) => setRarityFilter(e.target.value)}
            aria-label="按成就稀有度筛选"
            className={`px-3 py-2 text-sm rounded-lg ${styles.input}`}
          >
            <option value="all">全部稀有度</option>
            {ACHIEVEMENT_RARITIES.map(r => (
              <option key={r.value} value={r.value}>{r.label}</option>
            ))}
          </select>
          <div role="group" aria-label="成就视图" className={`flex items-center gap-1 p-1 rounded-lg ${styles.bgTertiary}`}>
            <button
              onClick={() => setViewMode('grid')}
              className={`min-h-10 min-w-10 p-2 rounded-md transition-colors ${viewMode === 'grid' ? `${styles.bgCard} ${styles.textPrimary}` : styles.textMuted}`}
              aria-label="卡片视图"
              aria-pressed={viewMode === 'grid'}
              title="卡片视图"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" /></svg>
            </button>
            <button
              onClick={() => setViewMode('leaderboard')}
              className={`min-h-10 min-w-10 p-2 rounded-md transition-colors ${viewMode === 'leaderboard' ? `${styles.bgCard} ${styles.textPrimary}` : styles.textMuted}`}
              aria-label="排行榜"
              aria-pressed={viewMode === 'leaderboard'}
              title="排行榜"
            >
              <TrendingUp className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('feed')}
              className={`min-h-10 min-w-10 p-2 rounded-md transition-colors ${viewMode === 'feed' ? `${styles.bgCard} ${styles.textPrimary}` : styles.textMuted}`}
              aria-label="动态"
              aria-pressed={viewMode === 'feed'}
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
          <h2 className="sr-only">成就列表</h2>
          {filteredAchievements.length === 0 ? (
            <div className={`${styles.card} p-12 text-center`}>
              <Trophy className={`w-12 h-12 ${styles.textMuted} mx-auto mb-4`} />
              <h3 className={`text-lg font-medium ${styles.textPrimary} mb-2`}>
                {allAchievements.length === 0 ? '暂无可查看的成就' : '没有匹配的成就'}
              </h3>
              <p className={styles.textSecondary}>
                {allAchievements.length === 0
                  ? canManageAchievements
                    ? '启用预设成就后，成员即可查看并解锁。'
                    : '当前还没有可查看的成就，请联系管理员启用成就内容。'
                  : '尝试调整筛选条件'}
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
                        ? `border-[${rarityConfig.value === 'legendary' ? 'var(--xmt-amber)' : 'var(--xmt-primary)'}]/30 hover:-translate-y-0.5`
                        : 'opacity-70 hover:opacity-90'
                    }`}
                  >
                    <div className="flex items-start gap-4">
                      {/* 图标 */}
                      <div className={`w-14 h-14 rounded-xl flex items-center justify-center flex-shrink-0 transition-transform duration-200 ${
                        isEarned
                          ? 'bg-gradient-to-br from-studio-amber/20 to-studio-amber/20'
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
                          {isEarned && <CheckCircle className="w-4 h-4 text-studio-success flex-shrink-0" />}
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
                            <span className={`text-[10px] px-2 py-0.5 rounded-full ${styles.bgTertiary} ${styles.textSecondary}`}>
                              {ACHIEVEMENT_CATEGORIES.find(c => c.value === achievement.category)?.label || achievement.category}
                            </span>
                          )}
                        </div>

                        {/* 进度条（仅未获得时显示） */}
                        {!isEarned && prog && prog.target > 0 && (
                          <div>
                            <div className="flex items-center justify-between mb-1">
                              <span className={`text-[10px] ${styles.textSecondary}`}>
                                {prog.current}/{prog.target}
                              </span>
                              <span className={`text-[10px] ${styles.textSecondary}`}>
                                {prog.percentage}%
                              </span>
                            </div>
                            <div className={`h-1.5 rounded-full ${styles.progressBg}`}>
                              <div
                                className="h-full rounded-full bg-gradient-to-r from-studio-primary to-studio-primary transition-all duration-500"
                                style={{ width: `${prog.percentage}%` }}
                              />
                            </div>
                          </div>
                        )}

                        {/* 获得时间 */}
                        {isEarned && achievement.earned_at && (
                          <p className={`text-[10px] ${styles.textSecondary} mt-1`}>
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
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center bg-studio-amber/10`}>
                <Crown className="w-4 h-4 text-studio-amber" />
              </div>
              <h2 className={`text-base font-semibold ${styles.textPrimary}`}>积分排行榜</h2>
            </div>

            {leaderboard.length === 0 ? (
              <div role="status" className={`p-8 text-center ${styles.textSecondary}`}>
                <Users className="w-10 h-10 mx-auto mb-3 opacity-50" />
                <p className={`text-sm font-medium ${styles.textSecondary}`}>当前没有可显示的成员积分排行</p>
                <p className="mt-1 text-xs">启用成员后，这里会显示成就积分排行。</p>
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
                        isTop3 ? 'bg-studio-amber/5' : styles.hoverBg
                      }`}
                    >
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-sm ${
                        isTop3 ? 'text-lg' : `${styles.bgTertiary} ${styles.textSecondary}`
                      }`}>
                        {isTop3 ? medals[index] : index + 1}
                      </div>
                      <div data-testid="achievement-leaderboard-avatar" className="flex h-9 w-9 items-center justify-center rounded-full bg-studio-primary-button text-sm font-bold text-white">
                        {entry.user_name?.charAt(0) || '?'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-medium ${styles.textPrimary} truncate`}>{entry.user_name}</p>
                        <p className={`text-xs ${styles.textSecondary}`}>{entry.achievement_count} 个成就</p>
                      </div>
                      <div className="text-right">
                        <p className={`text-sm font-bold ${styles.textPrimary}`}>{entry.total_points}</p>
                        <p className={`text-[10px] ${styles.textSecondary}`}>积分</p>
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
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center bg-studio-primary/10`}>
                <TrendingUp className="w-4 h-4 text-studio-primary" />
              </div>
              <h2 className={`text-base font-semibold ${styles.textPrimary}`}>分类统计</h2>
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
                      <span data-testid="achievement-category-count" className="text-xs text-studio-text-secondary">{earned}/{total}</span>
                    </div>
                    <div className={`h-1.5 rounded-full ${styles.progressBg}`}>
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-studio-primary to-studio-primary transition-all duration-500"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            {/* 稀有度分布 */}
            <div className="mt-6">
              <h3 className={`text-sm font-medium ${styles.textPrimary} mb-3`}>稀有度分布</h3>
              <div className="grid grid-cols-2 gap-2">
                {ACHIEVEMENT_RARITIES.map(rarity => {
                  const rStats = stats?.byRarity?.find(r => r.rarity === rarity.value);
                  return (
                    <div key={rarity.value} className={`flex items-center justify-between p-3 rounded-lg ${styles.bgTertiary}`}>
                      <div className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full ${rarity.dot}`} />
                        <span className={`text-xs font-medium ${rarity.color}`}>{rarity.label}</span>
                      </div>
                      <span data-testid="achievement-rarity-count" className="text-xs text-studio-text-secondary">{rStats?.earned || 0}/{rStats?.total || 0}</span>
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
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center bg-studio-violet/10`}>
              <Sparkles className="w-4 h-4 text-studio-violet" />
            </div>
            <h2 className={`text-base font-semibold ${styles.textPrimary}`}>最近获得的成就</h2>
          </div>

          {recentAchievements.length === 0 ? (
            <div className={`p-8 text-center ${styles.textSecondary}`}>
              <Trophy className="w-10 h-10 mx-auto mb-3 opacity-50" />
              <p className="text-sm">暂无人获得成就</p>
            </div>
          ) : (
            <div className="space-y-3">
              {recentAchievements.map((item, index) => {
                return (
                  <div
                    key={item.id}
                    className={`flex items-center gap-4 p-4 rounded-xl transition-all duration-200 ${styles.hoverBg}`}
                    style={{ animationDelay: `${index * 50}ms` }}
                  >
                    <div data-testid="achievement-feed-avatar" className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-studio-primary-button text-sm font-bold text-white">
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
                        <span className={`text-[10px] ${styles.textSecondary}`}>
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
