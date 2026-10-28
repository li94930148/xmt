import { useState, useEffect, useCallback } from 'react';
import { useThemeStyles } from '../hooks/useThemeStyles';
import { getActivityLogs, getUsers } from '../api';
import type { ActivityLog as ActivityLogType, User } from '../types';
import { Clock, Filter, ChevronLeft, ChevronRight, Loader2, FileText, Settings, Trash2, Edit, Plus, LogIn, Send } from 'lucide-react';
import { formatBeijingTime } from '../lib/utils';
import ActionButton from '../components/studio/ActionButton';

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
  create: 'var(--xmt-success)',
  update: 'var(--xmt-primary)',
  delete: 'var(--xmt-coral)',
  login: 'var(--xmt-violet)',
  publish: 'var(--xmt-amber)',
  audit: 'var(--xmt-amber)',
  status_change: 'var(--xmt-success)',
};

const actionContrastColors: Record<string, string> = {
  create: 'var(--xmt-success-contrast)',
  update: 'var(--xmt-primary-contrast)',
  delete: 'var(--xmt-coral-contrast)',
  login: 'var(--xmt-violet-contrast)',
  publish: 'var(--xmt-amber-contrast)',
  audit: 'var(--xmt-amber-contrast)',
  status_change: 'var(--xmt-success-contrast)',
};

export default function ActivityLog() {
  const [logs, setLogs] = useState<ActivityLogType[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit] = useState(20);
  const [loading, setLoading] = useState(true);
  const [logsError, setLogsError] = useState<string | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [usersLoading, setUsersLoading] = useState(true);
  const [usersError, setUsersError] = useState<string | null>(null);
  const [selectedUser, setSelectedUser] = useState<number | undefined>(undefined);
  const styles = useThemeStyles();

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    setLogsError(null);
    try {
      const result = await getActivityLogs({ page, limit, user_id: selectedUser });
      setLogs(result.data);
      setTotal(result.total);
    } catch (error) {
      setLogsError(error instanceof Error ? error.message : '获取活动日志失败');
    } finally {
      setLoading(false);
    }
  }, [page, limit, selectedUser]);

  const fetchUsers = useCallback(async () => {
    setUsersLoading(true);
    setUsersError(null);
    try {
      const result = await getUsers({ limit: 100 });
      setUsers(result.data);
    } catch (error) {
      setUsersError(error instanceof Error ? error.message : '获取成员筛选列表失败');
    } finally {
      setUsersLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchUsers();
  }, [fetchUsers]);

  useEffect(() => {
    void fetchLogs();
  }, [fetchLogs]);

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
    return formatBeijingTime(dateStr, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  const getActionIcon = (action: string) => {
    const key = Object.keys(actionIcons).find(k => action.toLowerCase().includes(k)) || 'default';
    return actionIcons[key];
  };

  const getActionColor = (action: string) => {
    const key = Object.keys(actionColors).find(k => action.toLowerCase().includes(k));
    return key ? actionColors[key] : (styles.isDark ? 'var(--xmt-text-muted)' : 'var(--xmt-text-secondary)');
  };

  const getActionContrastColor = (action: string) => {
    const key = Object.keys(actionContrastColors).find(k => action.toLowerCase().includes(k));
    return key ? actionContrastColors[key] : (styles.isDark ? 'var(--xmt-text-primary)' : 'var(--xmt-text-secondary)');
  };

  const getActionLabel = (action: string) => {
    const key = Object.keys(actionLabels).find(k => action.toLowerCase().includes(k));
    return key ? actionLabels[key] : action;
  };

  return (
    <div className="space-y-6">
      {/* 页面标题 */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className={styles.pageTitle}>活动日志</h1>
          <p className={`${styles.subtitle} mt-1`}>查看团队成员的操作记录</p>
        </div>
        <div className="flex w-full flex-col items-stretch gap-3 sm:w-auto sm:flex-row sm:items-center">
          {/* 用户筛选 */}
          <div className={`flex w-full min-w-0 items-center gap-2 ${styles.card} p-2 sm:w-auto`}>
            <Filter className={`w-4 h-4 shrink-0 ${styles.textSecondary}`} />
            <select
              id="activity-log-user-filter"
              aria-label="筛选活动日志成员"
              value={selectedUser || ''}
              onChange={(e) => {
                setSelectedUser(e.target.value ? Number(e.target.value) : undefined);
                setPage(1);
              }}
              className={`h-10 w-full min-w-0 flex-1 px-3 ${styles.bgInput} ${styles.borderInput} rounded-lg ${styles.textPrimary} text-sm ${styles.focusRing} sm:w-auto sm:flex-none`}
            >
              <option value="">全部用户</option>
              {users.map(user => (
                <option key={user.id} value={user.id}>{user.name || user.username}</option>
              ))}
            </select>
          </div>
          {usersError ? <div role="status" className="flex w-full flex-wrap items-center gap-2 rounded-button border border-studio-amber/25 bg-studio-amber/10 px-3 py-2 text-xs text-studio-amber-contrast sm:w-auto">
            <span>成员筛选暂不可用。{usersError}</span>
            <ActionButton type="button" variant="secondary" disabled={usersLoading} onClick={() => void fetchUsers()}>{usersLoading ? '正在加载成员…' : '重试成员筛选'}</ActionButton>
          </div> : null}
        </div>
      </div>

      {/* 时间线 */}
      <div className={`${styles.card} p-4 sm:p-6`}>
        {logsError ? <div role="alert" className="mb-4 flex flex-col gap-3 rounded-button border border-studio-amber/25 bg-studio-amber/10 px-4 py-3 text-sm text-studio-amber-contrast sm:flex-row sm:items-center sm:justify-between">
          <span>{logs.length ? '活动日志刷新失败，仍显示最近一次成功读取的记录。' : '活动日志暂时无法读取。'} {logsError}</span>
          <ActionButton type="button" variant="secondary" disabled={loading} onClick={() => void fetchLogs()}>{loading ? '正在重新加载…' : '重新加载日志'}</ActionButton>
        </div> : null}
        {loading ? (
          <div role="status" aria-live="polite" aria-atomic="true" className="flex items-center justify-center gap-3 py-16">
            <Loader2 aria-hidden="true" className="w-6 h-6 animate-spin text-studio-primary" />
            <span className={styles.textSecondary}>正在加载活动日志…</span>
          </div>
        ) : logsError && logs.length === 0 ? null : logs.length === 0 ? (
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
                  <div key={log.id} className="relative flex min-w-0 gap-3 group animate-slide-in sm:gap-4" style={{ animationDelay: `${index * 30}ms` }}>
                    {/* 时间线节点 */}
                    <div className="relative z-10 flex-shrink-0">
                      <div
                        data-activity-action-marker
                        className="w-12 h-12 rounded-xl flex items-center justify-center transition-transform duration-200 group-hover:scale-110"
                        style={{ backgroundColor: `color-mix(in srgb, ${color} 8%, transparent)` }}
                      >
                        <Icon className="w-5 h-5" style={{ color }} />
                      </div>
                    </div>

                    {/* 内容 */}
                    <div className={`min-w-0 flex-1 pb-6 ${styles.hoverBg} rounded-xl p-4 -m-1 transition-colors duration-200`}>
                      <div className="flex min-w-0 flex-col items-start gap-2 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0 flex-1">
                          <div className="flex min-w-0 items-center gap-2 flex-wrap">
                            <span className={`text-sm font-semibold ${styles.textPrimary}`}>
                              {log.user_name || `用户#${log.user_id}`}
                            </span>
                            <span
                              data-activity-action-badge
                              className="text-xs px-2 py-0.5 rounded-full font-medium"
                              style={{ backgroundColor: `color-mix(in srgb, ${color} 8%, transparent)`, color: getActionContrastColor(log.action) }}
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
                        <div className="flex shrink-0 items-center gap-1 whitespace-nowrap">
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
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className={`text-sm ${styles.textSecondary} sm:whitespace-nowrap`}>
            共 {total} 条记录，第 {page}/{totalPages} 页
          </p>
          <div className="flex items-center justify-center gap-2">
            <button
              aria-label="上一页"
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="xmt-btn xmt-btn-secondary h-10 w-10 min-h-10 min-w-10 rounded-button p-0 disabled:opacity-30 transition-all duration-200"
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
                  aria-current={page === pageNum ? 'page' : undefined}
                  onClick={() => setPage(pageNum)}
                  className={`xmt-btn h-10 w-10 min-h-10 min-w-10 rounded-button p-0 text-sm font-medium transition-all duration-200 ${
                    page === pageNum
                      ? 'xmt-btn-primary'
                      : 'xmt-btn-secondary'
                  }`}
                >
                  {pageNum}
                </button>
              );
            })}
            <button
              aria-label="下一页"
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="xmt-btn xmt-btn-secondary h-10 w-10 min-h-10 min-w-10 rounded-button p-0 disabled:opacity-30 transition-all duration-200"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
