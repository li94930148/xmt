import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '../store';
import { getTopics, updateTopicStatus, getUsers } from '../api';
import { Topic, User } from '../types';
import { useThemeStyles } from '../hooks/useThemeStyles';
import { STATUS_COLORS, STATUS_TEXT } from '../constants';
import { formatBeijingDate } from '../lib/utils';
import {
  Clock, CheckCircle, XCircle, FileText, Camera, Send,
  ChevronLeft, ChevronRight, Filter, User as UserIcon, ExternalLink
} from 'lucide-react';

const columns = [
  { status: 'pending', label: '待审核', icon: Clock, color: 'bg-yellow-500', textColor: 'text-yellow-400' },
  { status: 'approved', label: '已通过', icon: CheckCircle, color: 'bg-green-500', textColor: 'text-green-400' },
  { status: 'rejected', label: '已驳回', icon: XCircle, color: 'bg-red-500', textColor: 'text-red-400' },
  { status: 'production', label: '创作中', icon: FileText, color: 'bg-blue-500', textColor: 'text-blue-400' },
  { status: 'shooting', label: '拍摄中', icon: Camera, color: 'bg-purple-500', textColor: 'text-purple-400' },
  { status: 'publishing', label: '发布中', icon: Send, color: 'bg-indigo-500', textColor: 'text-indigo-400' },
  { status: 'completed', label: '已完成', icon: CheckCircle, color: 'bg-gray-500', textColor: 'text-gray-400' },
];

const platformOptions = ['全部', '抖音', '快手', '小红书', 'B站', '视频号', '公众号'];

export default function Kanban() {
  const [topics, setTopics] = useState<Topic[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [platformFilter, setPlatformFilter] = useState('全部');
  const [assigneeFilter, setAssigneeFilter] = useState<number | ''>('');
  const appStore = useAppStore();
  const styles = useThemeStyles();
  const navigate = useNavigate();

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const [topicsRes, usersRes] = await Promise.all([
          getTopics({ limit: 200 }),
          getUsers()
        ]);
        setTopics(topicsRes.data);
        setUsers(usersRes.data || []);
      } catch (error) {
        appStore.addNotification({ title: '获取数据失败', message: (error as Error).message, type: 'error' });
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const filteredTopics = useMemo(() => {
    return topics.filter(t => {
      if (platformFilter !== '全部' && t.platform !== platformFilter) return false;
      if (assigneeFilter !== '' && t.assignee_id !== assigneeFilter) return false;
      return true;
    });
  }, [topics, platformFilter, assigneeFilter]);

  const topicsByStatus = useMemo(() => {
    const map: Record<string, Topic[]> = {};
    columns.forEach(c => { map[c.status] = []; });
    filteredTopics.forEach(t => {
      if (map[t.status]) map[t.status].push(t);
    });
    return map;
  }, [filteredTopics]);

  const handleStatusChange = async (topicId: number, newStatus: string) => {
    try {
      await updateTopicStatus(topicId, newStatus);
      setTopics(prev => prev.map(t => t.id === topicId ? { ...t, status: newStatus as Topic['status'] } : t));
      appStore.addNotification({ title: '状态已更新', message: '选题状态已切换', type: 'success' });
    } catch (error) {
      appStore.addNotification({ title: '更新失败', message: (error as Error).message, type: 'error' });
    }
  };

  const getNextStatuses = (current: string): { status: string; label: string }[] => {
    const flow: Record<string, { status: string; label: string }[]> = {
      pending: [{ status: 'approved', label: '通过' }, { status: 'rejected', label: '驳回' }],
      approved: [{ status: 'production', label: '开始创作', }],
      rejected: [{ status: 'pending', label: '重新审核' }],
      production: [{ status: 'shooting', label: '进入拍摄' }],
      shooting: [{ status: 'publishing', label: '发布' }],
      publishing: [{ status: 'completed', label: '完成' }],
      completed: [],
    };
    return flow[current] || [];
  };

  const handleTopicClick = (topic: Topic) => {
    const pathMap: Record<string, string> = {
      pending: `/topics/${topic.id}`,
      approved: `/topics/${topic.id}`,
      rejected: `/topics/${topic.id}`,
      production: `/production/${topic.id}`,
      shooting: `/shooting/${topic.id}`,
      publishing: `/publishing`,
      completed: `/topics/${topic.id}`,
    };
    const path = pathMap[topic.status] || `/topics/${topic.id}`;
    navigate(path);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className={`w-8 h-8 border-4 ${styles.spinner} border-t-transparent rounded-full animate-spin`}></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className={styles.pageTitle}>看板视图</h1>
        <p className={`${styles.subtitle} mt-1`}>拖拽或点击按钮切换选题</p>
      </div>

      {/* 筛选器 */}
      <div className={`${styles.card} p-4`}>
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex items-center gap-2">
            <Filter className={`w-4 h-4 ${styles.textMuted}`} />
            <span className={`text-sm ${styles.textSecondary}`}>平台</span>
            <select
              value={platformFilter}
              onChange={e => setPlatformFilter(e.target.value)}
              className={`px-3 py-1.5 ${styles.input} text-sm`}
            >
              {platformOptions.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <UserIcon className={`w-4 h-4 ${styles.textMuted}`} />
            <span className={`text-sm ${styles.textSecondary}`}>负责人：</span>
            <select
              value={assigneeFilter}
              onChange={e => setAssigneeFilter(e.target.value ? Number(e.target.value) : '')}
              className={`px-3 py-1.5 ${styles.input} text-sm`}
            >
              <option value="">全部</option>
              {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* 看板?*/}
      <div className="flex gap-4 overflow-x-auto pb-4">
        {columns.map(col => {
          const Icon = col.icon;
          const items = topicsByStatus[col.status] || [];
          return (
            <div key={col.status} className="flex-shrink-0 w-72">
              <div className={`${styles.card} p-0 overflow-hidden`}>
                <div className={`flex items-center gap-2 px-4 py-3 ${styles.bgTertiary} border-b ${styles.border}`}>
                  <div className={`w-2.5 h-2.5 rounded-full ${col.color}`}></div>
                  <span className={`text-sm font-semibold ${styles.textPrimary}`}>{col.label}</span>
                  <span className={`ml-auto text-xs ${styles.textMuted} ${styles.bgPrimary} px-2 py-0.5 rounded-full`}>
                    {items.length}
                  </span>
                </div>
                <div className="p-3 space-y-3 min-h-[200px] max-h-[calc(100vh-320px)] overflow-y-auto">
                  {items.length === 0 ? (
                    <div className={`text-center py-8 ${styles.textMuted} text-xs`}>暂无选题</div>
                  ) : (
                    items.map(topic => {
                      const nextStatuses = getNextStatuses(topic.status);
                      return (
                        <div
                          key={topic.id}
                          className={`${styles.bgTertiary} rounded-xl p-3.5 border ${styles.border} hover:border-[#5c7cfa]/30 transition-all duration-200 group cursor-pointer`}
                          onClick={() => handleTopicClick(topic)}
                        >
                          <div className={`text-sm font-medium ${styles.textPrimary} mb-2 line-clamp-2 flex items-center justify-between gap-2`}>
                            {topic.title}
                            <ExternalLink className={`w-3.5 h-3.5 ${styles.textMuted} opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0`} />
                          </div>
                          <div className="flex flex-wrap gap-1.5 mb-2.5">
                            {topic.platform && (
                              <span className={`text-[10px] px-2 py-0.5 rounded-full ${styles.bgSecondary} ${styles.textSecondary} border ${styles.border}`}>
                                {topic.platform}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center justify-between text-xs mb-2.5">
                            <span className={styles.textMuted}>
                              {topic.assignee_name || '未分配'}
                            </span>
                            {topic.deadline && (
                              <span className={new Date(topic.deadline) < new Date() ? 'text-red-400' : styles.textMuted}>
                                {formatBeijingDate(topic.deadline)}
                              </span>
                            )}
                          </div>
                          {nextStatuses.length > 0 && (
                            <div className="flex flex-wrap gap-1.5 pt-2 border-t ${styles.borderLight}">
                              {nextStatuses.map(ns => (
                                <button
                                  key={ns.status}
                                  onClick={(e) => { e.stopPropagation(); handleStatusChange(topic.id, ns.status); }}
                                  className={`text-[10px] px-2.5 py-1 rounded-lg font-medium transition-colors ${
                                    ns.status === 'rejected' || ns.status === 'completed'
                                      ? ns.status === 'rejected'
                                        ? 'bg-red-500/10 text-red-400 hover:bg-red-500/20'
                                        : 'bg-green-500/10 text-green-400 hover:bg-green-500/20'
                                      : 'bg-[#5c7cfa]/10 text-[#5c7cfa] hover:bg-[#5c7cfa]/20'
                                  }`}
                                >
                                  {ns.label}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
