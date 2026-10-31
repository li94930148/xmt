import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useThemeStyles } from '../hooks/useThemeStyles';
import { usePermission } from '../hooks/usePermission';
import {
  getTeamStats,
  getMonthlyStats,
  getUserStats,
  getTopics,
  getTopicAnalytics,
} from '../api';
import CollaborationHeatmap from '../components/CollaborationHeatmap';
import { PageHeader, PageToolbar } from '../components/common';
import ActionButton from '../components/studio/ActionButton';
import type { TeamStats, MonthlyStats, UserStats, Topic, Analytics as AnalyticsType } from '../types';
import {
  BarChart3,
  TrendingUp,
  Users,
  FileText,
  Play,
  Heart,
  Share2,
  MessageCircle,
  Calendar,
  RefreshCw,
} from 'lucide-react';
import { ReactBitsCardSlot } from '../features/reactbits-appearance/ReactBitsCardSlot';
import { ReactBitsHeadingSlot } from '../features/reactbits-appearance/slots/ReactBitsHeadingSlot';
import { ReactBitsMetricSlot } from '../features/reactbits-appearance/slots/ReactBitsMetricSlot';
import { ReactBitsPageScene } from '../features/reactbits-appearance/slots/ReactBitsPageScene';
import { analyticsStatToneStyles } from './analyticsStatColors';

export default function Analytics() {
  const navigate = useNavigate();
  const [teamStats, setTeamStats] = useState<TeamStats | null>(null);
  const [monthlyStats, setMonthlyStats] = useState<MonthlyStats | null>(null);
  const [userStats, setUserStats] = useState<UserStats[]>([]);
  const [allTopics, setAllTopics] = useState<Topic[]>([]);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [topicAnalytics, setTopicAnalytics] = useState<AnalyticsType[]>([]);
  const [selectedTopic, setSelectedTopic] = useState('');
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [year, setYear] = useState(new Date().getFullYear());
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [hasLoadedData, setHasLoadedData] = useState(false);
  const [loadedPeriod, setLoadedPeriod] = useState<{ month: number; year: number } | null>(null);
  const [topicAnalyticsLoading, setTopicAnalyticsLoading] = useState(false);
  const [topicAnalyticsError, setTopicAnalyticsError] = useState<string | null>(null);
  const [topicAnalyticsRetry, setTopicAnalyticsRetry] = useState(0);
  const analyticsRequestId = useRef(0);

  const styles = useThemeStyles();
  const { hasPermission } = usePermission();

  const fetchData = useCallback(async () => {
    const requestId = ++analyticsRequestId.current;
    setLoading(true);
    setLoadError(null);
    try {
      const [team, monthly, user, topicList] = await Promise.all([
        getTeamStats({ month, year }),
        getMonthlyStats({ month, year }),
        getUserStats({ month, year }),
        getTopics(),
      ]);
      if (requestId !== analyticsRequestId.current) return;

      setTeamStats(team);
      setMonthlyStats(monthly);
      setUserStats(user);
      setAllTopics(topicList.data || []);
      setTopics((topicList.data || []).filter((topic) => topic.status === 'completed'));
      setLoadedPeriod({ month, year });
      setHasLoadedData(true);
    } catch {
      if (requestId === analyticsRequestId.current) {
        setLoadError('请检查连接后重试。');
      }
    } finally {
      if (requestId === analyticsRequestId.current) setLoading(false);
    }
  }, [month, year]);

  useEffect(() => { void fetchData(); }, [fetchData]);

  useEffect(() => {
    if (!selectedTopic) {
      setTopicAnalytics([]);
      setTopicAnalyticsError(null);
      setTopicAnalyticsLoading(false);
      return;
    }

    let active = true;
    setTopicAnalyticsLoading(true);
    setTopicAnalyticsError(null);
    void getTopicAnalytics(parseInt(selectedTopic, 10))
      .then((analytics) => {
        if (active) setTopicAnalytics(analytics);
      })
      .catch(() => {
        if (active) setTopicAnalyticsError('该选题的数据暂时无法读取，请重试。');
      })
      .finally(() => {
        if (active) setTopicAnalyticsLoading(false);
      });

    return () => { active = false; };
  }, [selectedTopic, topicAnalyticsRetry]);

  const months = Array.from({ length: 12 }, (_, index) => ({
    value: index + 1,
    label: `${index + 1}月`,
  }));
  const years = [year - 1, year, year + 1].map((value) => ({
    value,
    label: `${value}年`,
  }));

  const statCards = [
    { title: '本月完成', value: teamStats?.completed_count ?? '—', unit: '个选题', icon: BarChart3, tone: 'success' },
    { title: '完成率', value: teamStats ? `${teamStats.completion_rate}%` : '—', unit: '团队整体', icon: TrendingUp, tone: 'primary' },
    { title: '逾期率', value: teamStats ? `${teamStats.overdue_rate}%` : '—', unit: '当前周期', icon: TrendingUp, tone: 'coral' },
    { title: '平均耗时', value: teamStats?.avg_days ?? '—', unit: '天 / 选题', icon: Users, tone: 'violet' },
  ] as const;

  const metricCards = [
    { label: '播放量', value: monthlyStats?.total_views ?? null, icon: Play, color: 'text-studio-primary' },
    { label: '点赞量', value: monthlyStats?.total_likes ?? null, icon: Heart, color: 'text-studio-coral' },
    { label: '分享量', value: monthlyStats?.total_shares ?? null, icon: Share2, color: 'text-studio-success' },
    { label: '评论量', value: monthlyStats?.total_comments ?? null, icon: MessageCircle, color: 'text-studio-violet' },
  ];

  return (
    <ReactBitsPageScene page="analytics">
    <div className="space-y-6">
          <PageHeader
            title={<ReactBitsHeadingSlot semantic="page-title">数据复盘</ReactBitsHeadingSlot>}
            description="按单条发布记录汇总作品累计表现；抖音官方导出优先，手工数据仅补缺并标明来源。"
            actions={
              <div className="flex items-center gap-3">
                {hasPermission('export:data') ? (
                  <ActionButton type="button" variant="secondary" onClick={() => navigate('/export')}>
                    <FileText className="w-4 h-4" />
                    打开报告中心
                  </ActionButton>
                ) : null}
                <button
                  onClick={() => navigate('/publishing')}
                  className={`flex items-center gap-2 rounded-xl px-5 py-2.5 ${styles.buttonPrimary} transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]`}
                >
                  <BarChart3 className="w-4 h-4" />
                  <span className="text-sm font-medium">前往发布管理补充</span>
                </button>
              </div>
            }
          />

          <PageToolbar
            left={
              <div className={`flex items-center gap-2 ${styles.card} p-2`}>
                <Calendar className={`w-4 h-4 ${styles.textSecondary}`} />
                <select
                  aria-label="统计年份"
                  value={year}
                  onChange={(event) => setYear(parseInt(event.target.value, 10))}
                  className={`min-h-10 rounded-lg px-3 py-1 text-sm ${styles.bgInput} ${styles.borderInput} ${styles.textPrimary} ${styles.focusRing}`}
                >
                  {years.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
                <select
                  aria-label="统计月份"
                  value={month}
                  onChange={(event) => setMonth(parseInt(event.target.value, 10))}
                  className={`min-h-10 rounded-lg px-3 py-1 text-sm ${styles.bgInput} ${styles.borderInput} ${styles.textPrimary} ${styles.focusRing}`}
                >
                  {months.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </div>
            }
          />

          {loadError ? (
            <div role="alert" className="flex flex-col gap-3 rounded-xl border border-studio-amber/25 bg-studio-amber/10 px-4 py-3 text-sm text-studio-amber-contrast sm:flex-row sm:items-center sm:justify-between">
              <span>
                {hasLoadedData
                  ? `统计更新失败，仍显示最近一次成功读取的 ${loadedPeriod?.year}年${loadedPeriod?.month}月数据。`
                  : '统计数据暂时无法读取，当前指标尚未确认。'} {loadError}
              </span>
              <ActionButton type="button" variant="secondary" disabled={loading} onClick={() => void fetchData()}>
                {loading ? '正在重新加载…' : '重新加载统计'}
              </ActionButton>
            </div>
          ) : loading && hasLoadedData ? (
            <p role="status" className="text-sm text-studio-text-secondary">
              正在读取 {year}年{month}月统计；当前仍显示 {loadedPeriod?.year}年{loadedPeriod?.month}月最近一次成功结果。
            </p>
          ) : null}

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
            {statCards.map((card, index) => {
              const Icon = card.icon;
              const toneStyles = analyticsStatToneStyles[card.tone];
              return (
                <ReactBitsCardSlot
                  key={index}
                  semantic="analytics-metric"
                  className={`${styles.card} p-5 hover:shadow-soft-lg transition-all duration-300 hover:-translate-y-0.5 group`}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wider text-studio-text-secondary">{card.title}</p>
                      <p data-analytics-metric={card.title} className={`mt-3 text-3xl font-bold tracking-tight ${styles.textPrimary}`}>
                        {card.value === '—' ? '—' : <ReactBitsMetricSlot value={typeof card.value === 'number' ? card.value : undefined}>{String(card.value)}</ReactBitsMetricSlot>}
                      </p>
                      <p data-analytics-stat-unit={card.tone} className="mt-1 text-xs" style={{ color: toneStyles.text }}>
                        {card.unit}
                      </p>
                    </div>
                    <div
                      data-analytics-stat-icon={card.tone}
                      className="flex h-12 w-12 items-center justify-center rounded-xl transition-transform duration-200 group-hover:scale-110"
                      style={{ backgroundColor: toneStyles.iconBackground }}
                    >
                      <Icon className="w-6 h-6" style={{ color: toneStyles.icon }} />
                    </div>
                  </div>
                </ReactBitsCardSlot>
              );
            })}
          </div>

          <p className="-mt-3 text-xs text-studio-text-secondary">
            {monthlyStats ? (
              <>
                {loadedPeriod?.year}年{loadedPeriod?.month}月含 {monthlyStats.publication_count || 0} 条已发布作品；逐作品汇总，不再把同一选题的多条发布数据相加混算。
                {(monthlyStats.legacy_unlinked_count || 0) + (monthlyStats.legacy_ambiguous_count || 0) > 0
                  ? ` 另有 ${(monthlyStats.legacy_unlinked_count || 0) + (monthlyStats.legacy_ambiguous_count || 0)} 条选题级历史数据未纳入，保留原始记录供核对。`
                  : ' 旧选题级历史仍保留；仅在可唯一对应发布记录时作为回退值。'}
              </>
            ) : '当前周期统计暂不可用，发布数量尚未确认。'}
          </p>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div className={`${styles.bgSecondary} rounded-xl p-6 ${styles.border}`}>
              <h2 className={`mb-4 text-lg font-semibold ${styles.textPrimary}`}>数据概览</h2>
              <div className="grid grid-cols-2 gap-4">
                {metricCards.map((item) => {
                  const Icon = item.icon;
                  return (
                    <ReactBitsCardSlot key={item.label} semantic="analytics-metric" className={`${styles.bgTertiary} rounded-lg p-4`}>
                      <div className="mb-2 flex items-center gap-2">
                        <Icon className={`w-5 h-5 ${item.color}`} />
                        <span className={`${styles.textSecondary} text-sm`}>{item.label}</span>
                      </div>
                      <p data-analytics-metric={item.label} className={`text-2xl font-bold ${styles.textPrimary}`}>
                        {item.value == null ? '—' : <ReactBitsMetricSlot value={item.value}>{item.value.toLocaleString()}</ReactBitsMetricSlot>}
                      </p>
                    </ReactBitsCardSlot>
                  );
                })}
              </div>
            </div>

            <div className={`${styles.bgSecondary} rounded-xl p-6 ${styles.border}`}>
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <h2 className={`text-lg font-semibold ${styles.textPrimary}`}>作品表现与历史数据</h2>
                {selectedTopic && topicAnalytics.length > 0 && !topicAnalyticsError ? (
                  <ActionButton type="button" variant="secondary" disabled={topicAnalyticsLoading} onClick={() => setTopicAnalyticsRetry((attempt) => attempt + 1)}>
                    <RefreshCw className={`h-4 w-4 ${topicAnalyticsLoading ? 'animate-spin' : ''}`} />
                    {topicAnalyticsLoading ? '正在刷新…' : '刷新选题数据'}
                  </ActionButton>
                ) : null}
              </div>
              <div className="space-y-3">
                <select
                  aria-label="选择已完成选题"
                  value={selectedTopic}
                  onChange={(event) => {
                    setTopicAnalytics([]);
                    setTopicAnalyticsError(null);
                    setSelectedTopic(event.target.value);
                  }}
                  className={`min-h-10 w-full scroll-mb-28 rounded-lg px-4 py-2 ${styles.bgInput} ${styles.borderInput} ${styles.textPrimary} ${styles.focusRing}`}
                >
                  <option value="">选择一个已完成选题</option>
                  {topics.map((topic) => (
                    <option key={topic.id} value={topic.id}>
                      {topic.title}
                    </option>
                  ))}
                </select>

                {topicAnalyticsError ? (
                  <div role="alert" className="flex flex-col items-center gap-3 rounded-xl border border-studio-amber/25 bg-studio-amber/10 px-4 py-4 text-center text-sm text-studio-amber-contrast">
                    <p>{topicAnalytics.length > 0 ? '选题数据刷新失败，仍保留最近一次成功读取的记录。' : topicAnalyticsError}</p>
                    <ActionButton type="button" variant="secondary" disabled={topicAnalyticsLoading} onClick={() => setTopicAnalyticsRetry((attempt) => attempt + 1)}>
                      {topicAnalyticsLoading ? '正在重试…' : '重试选题数据'}
                    </ActionButton>
                  </div>
                ) : null}
                {topicAnalyticsLoading ? (
                  <p role="status" className="py-3 text-center text-studio-text-secondary">
                    {topicAnalytics.length > 0 ? '正在更新该选题的数据；仍显示最近一次成功读取的记录。' : '正在读取该选题的数据…'}
                  </p>
                ) : null}
                {selectedTopic && topicAnalytics.length > 0 ? (
                  <div className="space-y-2">
                    {topicAnalytics.map((item) => (
                      <div key={`${item.record_type || 'legacy'}-${item.id}`} className={`${styles.bgTertiary} rounded-lg p-4`}>
                        <p className={`text-sm font-medium ${styles.textPrimary}`}>{item.data_date}</p>
                        <p className="mt-1 text-xs text-studio-text-secondary">
                          {item.record_type === 'publishing'
                            ? `发布记录 · ${Array.from(new Set([item.views_source, item.likes_source, item.shares_source, item.comments_source])).map((source) => ({
                              douyin_official_export: '抖音官方', manual: '手工补充', douyin_creator_collection: '运营采集',
                              douyin_legacy_current: '旧版抖音数据', legacy_analytics: '旧选题级数据', unavailable: '未录入',
                            }[source || 'unavailable'])).join('、')}`
                            : Number(item.publication_match_count || 0) > 1
                              ? '历史选题级数据 · 同日多条发布，未拆分'
                              : '历史选题级数据 · 未关联发布记录'}
                        </p>
                        <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                          <span className={styles.textSecondary}>播放：{item.views.toLocaleString()}</span>
                          <span className={styles.textSecondary}>点赞：{item.likes.toLocaleString()}</span>
                          <span className={styles.textSecondary}>分享：{item.shares.toLocaleString()}</span>
                          <span className={styles.textSecondary}>评论：{item.comments.toLocaleString()}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : null}
                {!topicAnalyticsLoading && !topicAnalyticsError && selectedTopic && topicAnalytics.length === 0 ? (
                  <p className={`${styles.textSecondary} py-8 text-center`}>该选题暂无已记录的数据。</p>
                ) : null}
                {!selectedTopic ? <p className={`${styles.textSecondary} py-8 text-center`}>选择选题后查看数据明细</p> : null}
              </div>
            </div>
          </div>

          <div className={`${styles.bgSecondary} rounded-xl p-6 ${styles.border}`}>
            <h2 className={`mb-4 text-lg font-semibold ${styles.textPrimary}`}>个人统计排行</h2>
            <div
              role="region"
              aria-label="个人统计排行（可横向滚动）"
              tabIndex={0}
              className="overflow-x-auto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-studio-focus-ring"
              onKeyDown={(event) => {
                if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
                event.preventDefault();
                event.currentTarget.scrollBy({ left: event.key === 'ArrowRight' ? 120 : -120 });
              }}
            >
              <table className="w-full">
                <thead>
                  <tr className={styles.tableHeader}>
                    <th className={`px-6 py-3 text-left text-sm font-medium ${styles.textSecondary}`}>排名</th>
                    <th className={`px-6 py-3 text-left text-sm font-medium ${styles.textSecondary}`}>姓名</th>
                    <th className={`px-6 py-3 text-left text-sm font-medium ${styles.textSecondary}`}>完成选题数</th>
                    <th className={`px-6 py-3 text-left text-sm font-medium ${styles.textSecondary}`}>总播放量</th>
                    <th className={`px-6 py-3 text-left text-sm font-medium ${styles.textSecondary}`}>总点赞量</th>
                  </tr>
                </thead>
                <tbody>
                  {userStats.length > 0 ? (
                    userStats.map((user, index) => (
                      <tr key={user.user_id} className={`border-t ${styles.tableRow} ${styles.tableHover}`}>
                        <td className="px-6 py-4">
                          <span
                            className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold ${
                              index === 0
                                ? 'border border-studio-amber/30 bg-studio-amber-soft text-studio-amber-contrast'
                                : index === 1
                                  ? 'border border-studio-border-soft bg-studio-surface-soft text-studio-text-secondary'
                                  : index === 2
                                    ? 'border border-studio-amber/30 bg-studio-amber-soft text-studio-amber-contrast'
                                    : `${styles.bgTertiary} ${styles.textSecondary}`
                            }`}
                          >
                            {index + 1}
                          </span>
                        </td>
                        <td className={`px-6 py-4 font-medium ${styles.textPrimary}`}>{user.user_name}</td>
                        <td className={`px-6 py-4 ${styles.textSecondary}`}>{user.topic_count}</td>
                        <td className={`px-6 py-4 ${styles.textSecondary}`}>
                          {user.total_views ? user.total_views.toLocaleString() : 0}
                        </td>
                        <td className={`px-6 py-4 ${styles.textSecondary}`}>
                          {user.total_likes ? user.total_likes.toLocaleString() : 0}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={5} className={`px-6 py-12 text-center ${styles.textSecondary}`}>
                        {hasLoadedData ? '暂无数据' : '统计数据暂不可用'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {hasLoadedData ? <div data-analytics-runtime="heatmap"><CollaborationHeatmap topics={allTopics} /></div> : null}

    </div>
    </ReactBitsPageScene>
  );
}
