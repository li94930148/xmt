import { useState, useEffect } from 'react';
import { useAppStore } from '../store';
import { useThemeStyles } from '../hooks/useThemeStyles';
import {
  getTeamStats,
  getMonthlyStats,
  getUserStats,
  createAnalytics,
  getTopics,
  getTopicAnalytics,
} from '../api';
import CollaborationHeatmap from '../components/CollaborationHeatmap';
import DataExport from '../components/DataExport';
import WeeklyReport from '../components/WeeklyReport';
import { FormModal, PageHeader, PageToolbar } from '../components/common';
import type { TeamStats, MonthlyStats, UserStats, Topic, Analytics as AnalyticsType } from '../types';
import {
  BarChart3,
  TrendingUp,
  Users,
  FileText,
  Plus,
  Download,
  Play,
  Heart,
  Share2,
  MessageCircle,
  Calendar,
} from 'lucide-react';
import { getCurrentBeijingDateTimeString } from '../lib/utils';

type TabType = 'overview' | 'export' | 'report';

export default function Analytics() {
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [teamStats, setTeamStats] = useState<TeamStats | null>(null);
  const [monthlyStats, setMonthlyStats] = useState<MonthlyStats | null>(null);
  const [userStats, setUserStats] = useState<UserStats[]>([]);
  const [allTopics, setAllTopics] = useState<Topic[]>([]);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [topicAnalytics, setTopicAnalytics] = useState<AnalyticsType[]>([]);
  const [selectedTopic, setSelectedTopic] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [formData, setFormData] = useState({
    topic_id: '',
    views: '',
    likes: '',
    shares: '',
    comments: '',
    data_date: '',
  });
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [year, setYear] = useState(new Date().getFullYear());

  const appStore = useAppStore();
  const styles = useThemeStyles();

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [team, monthly, user, topicList] = await Promise.all([
          getTeamStats({ month, year }),
          getMonthlyStats({ month, year }),
          getUserStats({ month, year }),
          getTopics(),
        ]);

        setTeamStats(team);
        setMonthlyStats(monthly);
        setUserStats(user);
        setAllTopics(topicList.data || []);
        setTopics((topicList.data || []).filter((topic) => topic.status === 'completed'));
      } catch (error) {
        appStore.addNotification({
          title: '获取数据失败',
          message: (error as Error).message,
          type: 'error',
        });
      }
    };

    void fetchData();
  }, [appStore, month, year]);

  useEffect(() => {
    if (!selectedTopic) {
      setTopicAnalytics([]);
      return;
    }

    const fetchTopicAnalytics = async () => {
      try {
        const analytics = await getTopicAnalytics(parseInt(selectedTopic, 10));
        setTopicAnalytics(analytics);
      } catch (error) {
        appStore.addNotification({
          title: '获取选题数据失败',
          message: (error as Error).message,
          type: 'error',
        });
      }
    };

    void fetchTopicAnalytics();
  }, [appStore, selectedTopic]);

  const handleCreate = async () => {
    if (!formData.topic_id) {
      appStore.addNotification({ title: '录入失败', message: '请选择选题', type: 'error' });
      return;
    }

    try {
      await createAnalytics({
        topic_id: parseInt(formData.topic_id, 10),
        views: parseInt(formData.views, 10) || 0,
        likes: parseInt(formData.likes, 10) || 0,
        shares: parseInt(formData.shares, 10) || 0,
        comments: parseInt(formData.comments, 10) || 0,
        data_date: formData.data_date,
      });

      appStore.addNotification({ title: '录入成功', message: '数据已保存', type: 'success' });
      setShowCreateModal(false);
      setFormData({ topic_id: '', views: '', likes: '', shares: '', comments: '', data_date: '' });

      const monthly = await getMonthlyStats({ month, year });
      setMonthlyStats(monthly);
    } catch (error) {
      appStore.addNotification({
        title: '录入失败',
        message: (error as Error).message,
        type: 'error',
      });
    }
  };

  const handleExport = () => {
    const data = {
      teamStats,
      monthlyStats,
      userStats,
      exportTime: getCurrentBeijingDateTimeString(),
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `analytics_${year}_${month}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);

    appStore.addNotification({ title: '导出成功', message: '报表已下载', type: 'success' });
  };

  const months = Array.from({ length: 12 }, (_, index) => ({
    value: index + 1,
    label: `${index + 1}月`,
  }));
  const years = [year - 1, year, year + 1].map((value) => ({
    value,
    label: `${value}年`,
  }));

  const tabs = [
    { id: 'overview' as TabType, label: '数据复盘', icon: BarChart3 },
    { id: 'export' as TabType, label: '数据导出', icon: Download },
    { id: 'report' as TabType, label: '周报生成', icon: FileText },
  ];

  const statCards = [
    { title: '本月完成', value: teamStats?.completed_count || 0, unit: '个选题', icon: BarChart3, color: '#51cf66' },
    { title: '完成率', value: `${teamStats?.completion_rate || '0'}%`, unit: '团队整体', icon: TrendingUp, color: '#5c7cfa' },
    { title: '逾期率', value: `${teamStats?.overdue_rate || '0'}%`, unit: '当前周期', icon: TrendingUp, color: '#ff6b6b' },
    { title: '平均耗时', value: teamStats?.avg_days || '0', unit: '天 / 选题', icon: Users, color: '#cc5de8' },
  ];

  const metricCards = [
    { label: '播放量', value: (monthlyStats?.total_views || 0).toLocaleString(), icon: Play, color: 'text-blue-400' },
    { label: '点赞量', value: (monthlyStats?.total_likes || 0).toLocaleString(), icon: Heart, color: 'text-red-400' },
    { label: '分享量', value: (monthlyStats?.total_shares || 0).toLocaleString(), icon: Share2, color: 'text-emerald-400' },
    { label: '评论量', value: (monthlyStats?.total_comments || 0).toLocaleString(), icon: MessageCircle, color: 'text-purple-400' },
  ];

  return (
    <div className="space-y-6">
      <div className={`flex items-center gap-1 rounded-xl p-1 ${styles.bgTertiary} w-fit`}>
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-all duration-200 ${
                activeTab === tab.id
                  ? `${styles.bgSecondary} ${styles.textPrimary} shadow-sm`
                  : `${styles.textMuted} ${styles.hoverBg}`
              }`}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {activeTab === 'export' ? <DataExport /> : null}
      {activeTab === 'report' ? <WeeklyReport /> : null}

      {activeTab === 'overview' ? (
        <>
          <PageHeader
            title="数据复盘"
            description="查看团队和个人在当前周期内的数据表现"
            actions={
              <div className="flex items-center gap-3">
                <button
                  onClick={handleExport}
                  className={`flex items-center gap-2 rounded-xl px-4 py-2.5 ${styles.buttonSecondary} transition-all duration-200`}
                >
                  <Download className="w-4 h-4" />
                  <span className="text-sm font-medium">导出报表</span>
                </button>
                <button
                  onClick={() => setShowCreateModal(true)}
                  className={`flex items-center gap-2 rounded-xl px-5 py-2.5 ${styles.buttonPrimary} transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]`}
                >
                  <Plus className="w-4 h-4" />
                  <span className="text-sm font-medium">录入数据</span>
                </button>
              </div>
            }
          />

          <PageToolbar
            left={
              <div className={`flex items-center gap-2 ${styles.card} p-2`}>
                <Calendar className={`w-4 h-4 ${styles.textSecondary}`} />
                <select
                  value={year}
                  onChange={(event) => setYear(parseInt(event.target.value, 10))}
                  className={`rounded-lg px-3 py-1 text-sm ${styles.bgInput} ${styles.borderInput} ${styles.textPrimary} ${styles.focusRing}`}
                >
                  {years.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
                <select
                  value={month}
                  onChange={(event) => setMonth(parseInt(event.target.value, 10))}
                  className={`rounded-lg px-3 py-1 text-sm ${styles.bgInput} ${styles.borderInput} ${styles.textPrimary} ${styles.focusRing}`}
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

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
            {statCards.map((card, index) => {
              const Icon = card.icon;
              return (
                <div
                  key={index}
                  className={`${styles.card} p-5 hover:shadow-soft-lg transition-all duration-300 hover:-translate-y-0.5 group`}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <p className={`${styles.textMuted} text-xs font-semibold uppercase tracking-wider`}>{card.title}</p>
                      <p className={`mt-3 text-3xl font-bold tracking-tight ${styles.textPrimary}`}>{card.value}</p>
                      <p className="mt-1 text-xs" style={{ color: card.color }}>
                        {card.unit}
                      </p>
                    </div>
                    <div
                      className="flex h-12 w-12 items-center justify-center rounded-xl transition-transform duration-200 group-hover:scale-110"
                      style={{ backgroundColor: `${card.color}15` }}
                    >
                      <Icon className="w-6 h-6" style={{ color: card.color }} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div className={`${styles.bgSecondary} rounded-xl p-6 ${styles.border}`}>
              <h3 className={`mb-4 text-lg font-semibold ${styles.textPrimary}`}>数据概览</h3>
              <div className="grid grid-cols-2 gap-4">
                {metricCards.map((item) => {
                  const Icon = item.icon;
                  return (
                    <div key={item.label} className={`${styles.bgTertiary} rounded-lg p-4`}>
                      <div className="mb-2 flex items-center gap-2">
                        <Icon className={`w-5 h-5 ${item.color}`} />
                        <span className={`${styles.textSecondary} text-sm`}>{item.label}</span>
                      </div>
                      <p className={`text-2xl font-bold ${styles.textPrimary}`}>{item.value}</p>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className={`${styles.bgSecondary} rounded-xl p-6 ${styles.border}`}>
              <h3 className={`mb-4 text-lg font-semibold ${styles.textPrimary}`}>选题数据趋势</h3>
              <div className="space-y-3">
                <select
                  value={selectedTopic}
                  onChange={(event) => setSelectedTopic(event.target.value)}
                  className={`w-full rounded-lg px-4 py-2 ${styles.bgInput} ${styles.borderInput} ${styles.textPrimary} ${styles.focusRing}`}
                >
                  <option value="">选择一个已完成选题</option>
                  {topics.map((topic) => (
                    <option key={topic.id} value={topic.id}>
                      {topic.title}
                    </option>
                  ))}
                </select>

                {selectedTopic && topicAnalytics.length > 0 ? (
                  <div className="space-y-2">
                    {topicAnalytics.map((item) => (
                      <div key={item.id} className={`${styles.bgTertiary} rounded-lg p-4`}>
                        <p className={`text-sm font-medium ${styles.textPrimary}`}>{item.data_date}</p>
                        <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                          <span className={styles.textSecondary}>播放：{item.views.toLocaleString()}</span>
                          <span className={styles.textSecondary}>点赞：{item.likes.toLocaleString()}</span>
                          <span className={styles.textSecondary}>分享：{item.shares.toLocaleString()}</span>
                          <span className={styles.textSecondary}>评论：{item.comments.toLocaleString()}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className={`${styles.textSecondary} py-8 text-center`}>选择选题后查看数据明细</p>
                )}
              </div>
            </div>
          </div>

          <div className={`${styles.bgSecondary} rounded-xl p-6 ${styles.border}`}>
            <h3 className={`mb-4 text-lg font-semibold ${styles.textPrimary}`}>个人统计排行</h3>
            <div className="overflow-x-auto">
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
                                ? 'bg-yellow-500 text-white'
                                : index === 1
                                  ? 'bg-gray-400 text-white'
                                  : index === 2
                                    ? 'bg-orange-600 text-white'
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
                        暂无数据
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <CollaborationHeatmap topics={allTopics} />

          <FormModal
            open={showCreateModal}
            onCancel={() => setShowCreateModal(false)}
            onSubmit={() => void handleCreate()}
            title="录入数据"
            submitText="保存"
            cancelText="取消"
            size="lg"
          >
            <div className="space-y-4">
              <div>
                <label className={`mb-2 block text-sm font-medium ${styles.textSecondary}`}>关联选题 *</label>
                <select
                  value={formData.topic_id}
                  onChange={(event) => setFormData({ ...formData, topic_id: event.target.value })}
                  className={`w-full rounded-lg px-4 py-2 ${styles.bgInput} ${styles.borderInput} ${styles.textPrimary} ${styles.focusRing}`}
                >
                  <option value="">请选择选题</option>
                  {topics.map((topic) => (
                    <option key={topic.id} value={topic.id}>
                      {topic.title}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={`mb-2 block text-sm font-medium ${styles.textSecondary}`}>播放量</label>
                  <input
                    type="number"
                    value={formData.views}
                    onChange={(event) => setFormData({ ...formData, views: event.target.value })}
                    className={`w-full rounded-lg px-4 py-2 ${styles.bgInput} ${styles.borderInput} ${styles.textPrimary} ${styles.textPlaceholder} ${styles.focusRing}`}
                    placeholder="0"
                  />
                </div>
                <div>
                  <label className={`mb-2 block text-sm font-medium ${styles.textSecondary}`}>点赞量</label>
                  <input
                    type="number"
                    value={formData.likes}
                    onChange={(event) => setFormData({ ...formData, likes: event.target.value })}
                    className={`w-full rounded-lg px-4 py-2 ${styles.bgInput} ${styles.borderInput} ${styles.textPrimary} ${styles.textPlaceholder} ${styles.focusRing}`}
                    placeholder="0"
                  />
                </div>
                <div>
                  <label className={`mb-2 block text-sm font-medium ${styles.textSecondary}`}>分享量</label>
                  <input
                    type="number"
                    value={formData.shares}
                    onChange={(event) => setFormData({ ...formData, shares: event.target.value })}
                    className={`w-full rounded-lg px-4 py-2 ${styles.bgInput} ${styles.borderInput} ${styles.textPrimary} ${styles.textPlaceholder} ${styles.focusRing}`}
                    placeholder="0"
                  />
                </div>
                <div>
                  <label className={`mb-2 block text-sm font-medium ${styles.textSecondary}`}>评论量</label>
                  <input
                    type="number"
                    value={formData.comments}
                    onChange={(event) => setFormData({ ...formData, comments: event.target.value })}
                    className={`w-full rounded-lg px-4 py-2 ${styles.bgInput} ${styles.borderInput} ${styles.textPrimary} ${styles.textPlaceholder} ${styles.focusRing}`}
                    placeholder="0"
                  />
                </div>
              </div>

              <div>
                <label className={`mb-2 block text-sm font-medium ${styles.textSecondary}`}>数据日期</label>
                <input
                  type="date"
                  value={formData.data_date}
                  onChange={(event) => setFormData({ ...formData, data_date: event.target.value })}
                  className={`w-full rounded-lg px-4 py-2 ${styles.bgInput} ${styles.borderInput} ${styles.textPrimary} ${styles.focusRing}`}
                />
              </div>
            </div>
          </FormModal>
        </>
      ) : null}
    </div>
  );
}
