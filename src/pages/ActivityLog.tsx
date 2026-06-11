import { useState, useEffect } from 'react';
import { useThemeStyles } from '../hooks/useThemeStyles';
import { useAppStore } from '../store';
import { getActivityLogs, getUsers } from '../api';
import type { ActivityLog as ActivityLogType, User } from '../types';
import { Clock, User as UserIcon, Filter, ChevronLeft, ChevronRight, Loader2, FileText, Settings, Trash2, Edit, Plus, LogIn, Send } from 'lucide-react';

const actionIcons: Record<string, typeof FileText> = {
  create: Plus,
  update: Edit,
  delete: Trash2,
  login: LogIn,
  publish: Send,
  default: Settings,
};

const actionLabels: Record<string, string> = {
  create: '创建',
  update: '更新',
  delete: '删除',
  login: '登录',
  publish: '发布',
  audit: '审核',
  status_change: '状态变更',
};

const actionColors: Record<string, string> = {
  create: '#51cf66',
  update: '#5c7cfa',
  delete: '#ff6b6b',
  login: '#cc5de8',
  publish: '#ff922b',
  audit: '#ffd43b',
  status_change: '#20c997',
};

export default function ActivityLog() {
  const [logs, setLogs] = useState<ActivityLogType[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit] = useState(20);
  const [loading, setLoading] = useState(false);
  const [users, setUsers] = useState<User[]>([]);
  const [selectedUser, setSelectedUser] = useState<number | undefined>(undefined);
  const styles = useThemeStyles();
  const appStore = useAppStore();

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const result = await getActivityLogs({ page, limit, user_id: selectedUser });
      setLogs(result.data);
      setTotal(result.total);
    } catch (error) {
      appStore.addNotification({ title: '获取日志失败', message: (error as Error).message, type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const fetchUsers = async () => {
    try {
      const result = await getUsers({ limit: 100 });
      setUsers(result.data);
    } catch {
      // 静默失败
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  useEffect(() => {
    fetchLogs();
  }, [page, selectedUser]);

  const totalPages = Math.ceil(total / limit);

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return '刚刚';
    if (minutes < 60) return `${minutes}分钟前`;
    if (hours < 24) return `${hours}小时前`;
    if (days < 7) return `${days}天前`;
    return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Shanghai' });
  };

  const getActionIcon = (action: string) => {
    const key = Object.keys(actionIcons).find(k => action.toLowerCase().includes(k)) || 'default';
    return actionIcons[key];
  };

  const getActionColor = (action: string) => {
    const key = Object.keys(actionColors).find(k => action.toLowerCase().includes(k));
    return key ? actionColors[key] : (styles.isDark ? '#636983' : '#9aa0b0');
  };

  const getActionLabel = (action: string) => {
    const key = Object.keys(actionLabels).find(k => action.toLowerCase().includes(k));
    return key ? actionLabels[key] : action;
  };

  return (
    <div className="space-y-6">
      {/* 页面标题 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className={styles.pageTitle}>活动日志</h1>
          <p className={`${styles.subtitle} mt-1`}>查看团队成员的操作记录</p>
        </div>
        <div className="flex items-center gap-3">
          {/* 用户筛选 */}
          <div className={`flex items-center gap-2 ${styles.card} p-2`}>
            <Filter className={`w-4 h-4 ${styles.textSecondary}`} />
            <select
              value={selectedUser || ''}
              onChange={(e) => {
                setSelectedUser(e.target.value ? Number(e.target.value) : undefined);
                setPage(1);
              }}
              className={`px-3 py-1 ${styles.bgInput} ${styles.borderInput} rounded-lg ${styles.textPrimary} text-sm ${styles.focusRing}`}
            >
              <option value="">全部用户</option>
              {users.map(user => (
                <option key={user.id} value={user.id}>{user.name || user.username}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* 时间线 */}
      <div className={`${styles.card} p-6`}>
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-[#5c7cfa]" />
          </div>
        ) : logs.length === 0 ? (
          <div className="text-center py-16">
            <Clock className={`w-12 h-12 mx-auto ${styles.textMuted} mb-3`} />
            <p className={styles.textSecondary}>暂无活动记录</p>
          </div>
        ) : (
          <div className="relative">
            {/* 时间线中线 */}
            <div className={`absolute left-6 top-0 bottom-0 w-0.5 ${styles.border}`} />

            <div className="space-y-1">
              {logs.map((log, index) => {
                const Icon = getActionIcon(log.action);
                const color = getActionColor(log.action);
                const label = getActionLabel(log.action);

                return (
                  <div key={log.id} className="relative flex gap-4 group animate-slide-in" style={{ animationDelay: `${index * 30}ms` }}>
                    {/* 时间线节点 */}
                    <div className="relative z-10 flex-shrink-0">
                      <div
                        className="w-12 h-12 rounded-xl flex items-center justify-center transition-transform duration-200 group-hover:scale-110"
                        style={{ backgroundColor: `${color}15` }}
                      >
                        <Icon className="w-5 h-5" style={{ color }} />
                      </div>
                    </div>

                    {/* 内容 */}
                    <div className={`flex-1 pb-6 ${styles.hoverBg} rounded-xl p-4 -m-1 transition-colors duration-200`}>
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`text-sm font-semibold ${styles.textPrimary}`}>
                              {log.user_name || `用户#${log.user_id}`}
                            </span>
                            <span
                              className="text-xs px-2 py-0.5 rounded-full font-medium"
                              style={{ backgroundColor: `${color}15`, color }}
                            >
                              {label}
                            </span>
                            <span className={`text-sm ${styles.textSecondary}`}>
                              {log.target}
                            </span>
                          </div>
                          {log.detail && (
                            <p className={`text-sm ${styles.textMuted} mt-1.5 line-clamp-2`}>
                              {log.detail}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <Clock className={`w-3 h-3 ${styles.textMuted}`} />
                          <span className={`text-xs ${styles.textMuted} whitespace-nowrap`}>
                            {formatTime(log.created_at)}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* 分页 */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className={`text-sm ${styles.textSecondary}`}>
            共 {total} 条记录，第 {page}/{totalPages} 页
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page <= 1}
              className={`p-2 ${styles.buttonSecondary} rounded-lg disabled:opacity-30 transition-all duration-200`}
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              let pageNum: number;
              if (totalPages <= 5) {
                pageNum = i + 1;
              } else if (page <= 3) {
                pageNum = i + 1;
              } else if (page >= totalPages - 2) {
                pageNum = totalPages - 4 + i;
              } else {
                pageNum = page - 2 + i;
              }
              return (
                <button
                  key={pageNum}
                  onClick={() => setPage(pageNum)}
                  className={`w-9 h-9 rounded-lg text-sm font-medium transition-all duration-200 ${
                    page === pageNum
                      ? `${styles.buttonPrimary}`
                      : `${styles.buttonSecondary}`
                  }`}
                >
                  {pageNum}
                </button>
              );
            })}
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className={`p-2 ${styles.buttonSecondary} rounded-lg disabled:opacity-30 transition-all duration-200`}
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
