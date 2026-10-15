import { useEffect, useMemo, useState } from 'react';
import { Calendar, Edit3, History, Lock, Mail, Plus, Search, Shield, Trash2, Unlock, User as UserIcon } from 'lucide-react';
import { useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { createUser, deleteUser, getAssignableRoles, getLogs, getUsers, updateUser } from '../api';
import EmptyState from '../components/EmptyState';
import { ConfirmModal, FormModal, LoadingState, PageHeader, PageToolbar } from '../components/common';
import { ResponsiveTableShell } from '../components/studio';
import Pagination from '../components/Pagination';
import { usePermission } from '../hooks/usePermission';
import { useThemeStyles } from '../hooks/useThemeStyles';
import { getRoleDisplayName } from '../lib/roles';
import { formatBeijingDate, formatBeijingTime } from '../lib/utils';
import { useAppStore } from '../store';
import type { ActivityLog, User } from '../types';

interface RoleOption {
  id: number;
  code: string;
  name: string;
}

interface UserFormData {
  username: string;
  password: string;
  email: string;
  role: string;
  name: string;
  enabled: boolean;
}

const roleColors: Record<string, string> = {
  admin: 'bg-studio-coral-soft text-studio-coral-contrast border-studio-border-soft',
  director: 'bg-studio-primary-soft text-studio-primary-contrast border-studio-border-soft',
  editor: 'bg-studio-violet-soft text-studio-violet-contrast border-studio-border-soft',
  copywriter: 'bg-studio-success-soft text-studio-success-contrast border-studio-border-soft',
  post_production: 'bg-studio-amber-soft text-studio-amber-contrast border-studio-border-soft',
  camera: 'bg-studio-cyan-soft text-studio-cyan-contrast border-studio-border-soft',
  member: 'bg-studio-surface-soft text-studio-text-secondary border-studio-border-soft',
};

const USER_PAGE_SIZE = 50;

function buildDefaultForm(roleCode = 'member'): UserFormData {
  return {
    username: '',
    password: '',
    email: '',
    role: roleCode,
    name: '',
    enabled: true,
  };
}

export default function Users() {
  const [searchParams] = useSearchParams();
  const requestedSearch = searchParams.get('search') || '';
  const [users, setUsers] = useState<User[]>([]);
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [roles, setRoles] = useState<RoleOption[]>([]);
  const [searchTerm, setSearchTerm] = useState(requestedSearch);
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState(requestedSearch);
  const [usersPage, setUsersPage] = useState(1);
  const [usersTotal, setUsersTotal] = useState(0);
  const [activeTab, setActiveTab] = useState<'users' | 'logs'>('users');
  const [loading, setLoading] = useState(true);
  const [usersLoadError, setUsersLoadError] = useState<string | null>(null);
  const [logsLoadError, setLogsLoadError] = useState<string | null>(null);
  const [logsRefreshing, setLogsRefreshing] = useState(false);
  const [usersMutationNotice, setUsersMutationNotice] = useState<string | null>(null);
  const [usersRefreshing, setUsersRefreshing] = useState(false);
  const [userMutationPending, setUserMutationPending] = useState(false);
  const userMutationLockRef = useRef(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [formData, setFormData] = useState<UserFormData>(buildDefaultForm());
  const [pendingDeleteUser, setPendingDeleteUser] = useState<User | null>(null);

  const addNotification = useAppStore((state) => state.addNotification);
  const styles = useThemeStyles();
  const { hasPermission } = usePermission();

  useEffect(() => {
    setSearchTerm(requestedSearch);
    setDebouncedSearchTerm(requestedSearch);
    setUsersPage(1);
  }, [requestedSearch]);

  const canViewUsers = hasPermission('user:view');
  const canCreateUser = hasPermission('user:create');
  const canUpdateUser = hasPermission('user:update');
  const canDeleteUser = hasPermission('user:delete');
  const canViewLogs = hasPermission('user:logs');
  const canManageRoles = hasPermission('system:role');
  const canLoadAssignableRoles = canCreateUser || canUpdateUser;
  const usersSearchTerm = activeTab === 'users' ? debouncedSearchTerm : '';

  const defaultRoleCode = useMemo(() => {
    if (roles.some((role) => role.code === 'member')) return 'member';
    return roles[0]?.code || 'member';
  }, [roles]);

  const roleNameMap = useMemo(
    () => roles.reduce<Record<string, string>>((acc, role) => {
      acc[role.code] = role.name;
      return acc;
    }, {}),
    [roles],
  );

  const getRoleBadgeClass = (roleCode: string) => roleColors[roleCode] || 'border-studio-border-soft bg-studio-surface-soft text-studio-text-secondary';
  const getRoleLabel = (roleCode: string) => roleNameMap[roleCode] || getRoleDisplayName(roleCode);

  const ensureAssignableRoles = async () => {
    if (!canLoadAssignableRoles) return roles;
    if (roles.length > 0) return roles;

    try {
      const roleList = await getAssignableRoles();
      setRoles(roleList);
      setFormData((current) => ({
        ...current,
        role: current.role || (roleList.some((role) => role.code === 'member') ? 'member' : roleList[0]?.code || ''),
      }));
      return roleList;
    } catch (error) {
      addNotification({ title: '获取角色失败', message: (error as Error).message, type: 'error' });
      return [];
    }
  };

  useEffect(() => {
    const nextSearch = searchTerm.trim();
    const timeout = window.setTimeout(() => {
      if (nextSearch !== debouncedSearchTerm) {
        setDebouncedSearchTerm(nextSearch);
        setUsersPage(1);
      }
    }, 300);
    return () => window.clearTimeout(timeout);
  }, [debouncedSearchTerm, searchTerm]);

  useEffect(() => {
    if (activeTab === 'logs' && !canViewLogs) {
      setActiveTab('users');
    }
  }, [activeTab, canViewLogs]);

  useEffect(() => {
    let active = true;
    async function fetchCurrentTabData() {
      setLoading(true);
      if (activeTab === 'users') setUsersLoadError(null);
      if (activeTab === 'logs') setLogsLoadError(null);
      try {
        if (activeTab === 'users') {
          if (!canViewUsers) {
            setUsers([]);
            setUsersTotal(0);
            return;
          }
          const result = await getUsers({
            page: usersPage,
            limit: USER_PAGE_SIZE,
            ...(usersSearchTerm ? { search: usersSearchTerm } : {}),
          });
          if (!active) return;
          setUsers(result.data);
          setUsersTotal(result.total);
          setUsersLoadError(null);
          setUsersMutationNotice(null);
          return;
        }

        if (!canViewLogs) {
          setLogs([]);
          return;
        }

        const result = await getLogs();
        if (!active) return;
        setLogs(result.data);
        setLogsLoadError(null);
      } catch (error) {
        if (!active) return;
        if (activeTab === 'users') {
          setUsersLoadError(error instanceof Error ? error.message : '请检查网络后重试');
        } else {
          setLogsLoadError(error instanceof Error ? error.message : '请检查网络后重试');
        }
        addNotification({ title: '获取数据失败', message: error instanceof Error ? error.message : '请检查网络后重试', type: 'error' });
      } finally {
        if (active) setLoading(false);
      }
    }

    void fetchCurrentTabData();
    return () => { active = false; };
  }, [activeTab, addNotification, canViewLogs, canViewUsers, usersPage, usersSearchTerm]);

  useEffect(() => {
    const totalPages = Math.max(1, Math.ceil(usersTotal / USER_PAGE_SIZE));
    if (activeTab === 'users' && !loading && usersPage > totalPages) setUsersPage(totalPages);
  }, [activeTab, loading, usersPage, usersTotal]);

  const filteredUsers = users;

  const filteredLogs = logs.filter((log) => {
    const term = searchTerm.toLowerCase();
    return (
      log.action.toLowerCase().includes(term) ||
      (log.user_name || '').toLowerCase().includes(term) ||
      log.target.toLowerCase().includes(term)
    );
  });

  const openCreateModal = async () => {
    if (!canCreateUser) return;
    const roleList = await ensureAssignableRoles();
    const nextRole = roleList.some((role) => role.code === 'member') ? 'member' : roleList[0]?.code || defaultRoleCode;
    setFormData(buildDefaultForm(nextRole));
    setShowCreateModal(true);
  };

  const openEditModal = async (user: User) => {
    if (!canUpdateUser) return;
    await ensureAssignableRoles();
    setEditingUser(user);
    setFormData({
      username: user.username,
      password: '',
      email: user.email || '',
      role: user.role,
      name: user.name || '',
      enabled: user.enabled,
    });
    setShowEditModal(true);
  };

  const refreshUsers = async (): Promise<boolean> => {
    if (!canViewUsers) return true;
    setUsersRefreshing(true);
    try {
      const result = await getUsers({
        page: usersPage,
        limit: USER_PAGE_SIZE,
        ...(usersSearchTerm ? { search: usersSearchTerm } : {}),
      });
      setUsers(result.data);
      setUsersTotal(result.total);
      setUsersLoadError(null);
      setUsersMutationNotice(null);
      return true;
    } catch (error) {
      setUsersLoadError(error instanceof Error ? error.message : '请检查网络后重试');
      return false;
    } finally {
      setUsersRefreshing(false);
    }
  };

  const refreshAfterConfirmedUserMutation = async (action: string) => {
    const refreshed = await refreshUsers();
    if (!refreshed) {
      setUsersMutationNotice(`服务端已确认${action}，但用户列表刷新失败；请重新加载列表确认，不要重复操作。`);
    }
    return refreshed;
  };

  const refreshLogs = async (): Promise<boolean> => {
    if (!canViewLogs) return false;
    setLogsRefreshing(true);
    try {
      const result = await getLogs();
      setLogs(result.data);
      setLogsLoadError(null);
      return true;
    } catch (error) {
      setLogsLoadError(error instanceof Error ? error.message : '请检查网络后重试');
      return false;
    } finally {
      setLogsRefreshing(false);
    }
  };

  const handleCreate = async () => {
    if (!canCreateUser || userMutationLockRef.current) return;
    if (!formData.username || !formData.password) {
      addNotification({ title: '创建失败', message: '用户名和密码不能为空', type: 'error' });
      return;
    }
    if (!formData.role) {
      addNotification({ title: '创建失败', message: '请选择角色', type: 'error' });
      return;
    }

    userMutationLockRef.current = true;
    setUserMutationPending(true);
    try {
      await createUser(formData);
      addNotification({ title: '创建成功', message: '用户已创建', type: 'success' });
      setShowCreateModal(false);
      setFormData(buildDefaultForm(defaultRoleCode));
      await refreshAfterConfirmedUserMutation('用户创建');
    } catch (error) {
      addNotification({ title: '创建失败', message: (error as Error).message, type: 'error' });
    } finally {
      userMutationLockRef.current = false;
      setUserMutationPending(false);
    }
  };

  const handleEdit = async () => {
    if (!canUpdateUser || !editingUser || userMutationLockRef.current) return;
    if (!formData.role) {
      addNotification({ title: '更新失败', message: '请选择角色', type: 'error' });
      return;
    }

    userMutationLockRef.current = true;
    setUserMutationPending(true);
    try {
      const updateData: Partial<User> & { password?: string } = {
        email: formData.email,
        role: formData.role,
        name: formData.name,
        enabled: formData.enabled,
      };
      if (formData.password) updateData.password = formData.password;

      await updateUser(editingUser.id, updateData);
      addNotification({ title: '更新成功', message: '用户信息已更新', type: 'success' });
      setUsers((current) => current.map((user) => user.id === editingUser.id ? {
        ...user,
        email: updateData.email ?? user.email,
        role: updateData.role ?? user.role,
        name: updateData.name ?? user.name,
        enabled: updateData.enabled ?? user.enabled,
      } : user));
      setShowEditModal(false);
      setEditingUser(null);
      await refreshAfterConfirmedUserMutation('用户信息更新');
    } catch (error) {
      addNotification({ title: '更新失败', message: (error as Error).message, type: 'error' });
    } finally {
      userMutationLockRef.current = false;
      setUserMutationPending(false);
    }
  };

  const handleDelete = async () => {
    if (!canDeleteUser || !pendingDeleteUser || userMutationLockRef.current) return;
    const deletingUser = pendingDeleteUser;
    userMutationLockRef.current = true;
    setUserMutationPending(true);
    try {
      await deleteUser(deletingUser.id);
      addNotification({ title: '删除成功', message: `用户 ${deletingUser.username} 已删除`, type: 'success' });
      setUsers((current) => current.filter((user) => user.id !== deletingUser.id));
      setUsersTotal((current) => Math.max(0, current - 1));
      setPendingDeleteUser(null);
    } catch (error) {
      addNotification({ title: '删除失败', message: (error as Error).message, type: 'error' });
    } finally {
      userMutationLockRef.current = false;
      setUserMutationPending(false);
    }
  };

  const handleToggleEnable = async (user: User) => {
    if (!canUpdateUser || userMutationLockRef.current) return;
    userMutationLockRef.current = true;
    setUserMutationPending(true);
    try {
      await updateUser(user.id, { enabled: !user.enabled });
      addNotification({
        title: '操作成功',
        message: user.enabled ? '用户已禁用' : '用户已启用',
        type: 'success',
      });
      setUsers((current) => current.map((item) => (item.id === user.id ? { ...item, enabled: !item.enabled } : item)));
    } catch (error) {
      addNotification({ title: '操作失败', message: (error as Error).message, type: 'error' });
    } finally {
      userMutationLockRef.current = false;
      setUserMutationPending(false);
    }
  };

  const tabSwitch = (
    <div className={`flex w-fit gap-2 rounded-xl p-1 ${styles.bgSecondary} ${styles.border}`}>
      <button
        onClick={() => setActiveTab('users')}
        className={`rounded-lg px-4 py-2 transition-colors ${activeTab === 'users' ? styles.buttonPrimary : `${styles.textSecondary} ${styles.hoverBg}`}`}
      >
        用户列表
      </button>
      {canViewLogs && (
        <button
          onClick={() => setActiveTab('logs')}
          className={`flex items-center gap-2 rounded-lg px-4 py-2 transition-colors ${activeTab === 'logs' ? styles.buttonPrimary : `${styles.textSecondary} ${styles.hoverBg}`}`}
        >
          <History className="h-4 w-4" />
          操作日志
        </button>
      )}
    </div>
  );

  const searchInput = (
    <div className="relative">
      <Search className={`absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 ${styles.textSecondary}`} />
      <input
        type="text"
        value={searchTerm}
        onChange={(event) => setSearchTerm(event.target.value)}
        placeholder={activeTab === 'users' ? '搜索用户名、姓名或邮箱...' : '搜索操作、用户或目标...'}
        className={`w-full rounded-lg py-2 pl-10 pr-4 ${styles.bgInput} ${styles.borderInput} ${styles.textPrimary} ${styles.textPlaceholder} focus:outline-none focus:ring-2 focus:ring-studio-primary`}
      />
    </div>
  );

  const renderRoleSelect = (
    <select
      id="user-role"
      value={formData.role}
      onChange={(event) => setFormData({ ...formData, role: event.target.value })}
      className={`w-full rounded-lg px-4 py-2 ${styles.bgInput} ${styles.borderInput} ${styles.textPrimary} focus:outline-none focus:ring-2 focus:ring-studio-primary`}
    >
      {roles.map((role) => (
        <option key={role.id} value={role.code}>
          {role.name}
        </option>
      ))}
    </select>
  );

  return (
    <>
      <div className="space-y-6">
        <PageHeader
          title="人员管理"
          description={canManageRoles ? '管理系统用户、角色分配和操作日志' : '查看系统用户和可访问的操作信息'}
          actions={
            activeTab === 'users' && canCreateUser ? (
              <button type="button" disabled={loading || userMutationPending} onClick={() => void openCreateModal()} className={`flex items-center gap-2 rounded-lg px-4 py-2 ${styles.buttonPrimary} transition-colors disabled:cursor-not-allowed disabled:opacity-50`}>
                <Plus className="h-5 w-5" />
                添加用户
              </button>
            ) : undefined
          }
        />

        <PageToolbar left={tabSwitch} search={searchInput} />

        {activeTab === 'users' && (usersMutationNotice || usersLoadError) ? (
          <div role="alert" className="flex flex-col gap-3 rounded-xl border border-studio-border-soft bg-studio-surface-soft p-4 text-sm text-studio-text-primary sm:flex-row sm:items-center sm:justify-between">
            <p className="min-w-0">{usersMutationNotice || `用户列表暂不可用：${usersLoadError}`}</p>
            {canViewUsers ? (
              <button type="button" disabled={loading || usersRefreshing} onClick={() => void refreshUsers()} className={`self-start rounded-lg px-4 py-2 ${styles.buttonSecondary} disabled:cursor-not-allowed disabled:opacity-50 sm:self-auto`}>
                {usersRefreshing ? '正在重新加载' : '重新加载列表'}
              </button>
            ) : null}
          </div>
        ) : null}

        {activeTab === 'logs' && logsLoadError ? (
          <div role="alert" className="flex flex-col gap-3 rounded-xl border border-studio-border-soft bg-studio-surface-soft p-4 text-sm text-studio-text-primary sm:flex-row sm:items-center sm:justify-between">
            <p className="min-w-0">操作日志暂不可用：{logsLoadError}</p>
            {canViewLogs ? (
              <button type="button" disabled={loading || logsRefreshing} onClick={() => void refreshLogs()} className={`self-start rounded-lg px-4 py-2 ${styles.buttonSecondary} disabled:cursor-not-allowed disabled:opacity-50 sm:self-auto`}>
                {logsRefreshing ? '正在重新加载' : '重新加载日志'}
              </button>
            ) : null}
          </div>
        ) : null}

        {activeTab === 'users' && (
          <div className="min-w-0">
            {loading ? (
              <div className={`${styles.bgSecondary} rounded-xl ${styles.border} px-6 py-12`}><LoadingState type="section" text="加载用户中..." /></div>
            ) : usersLoadError && filteredUsers.length === 0 ? null : filteredUsers.length === 0 ? (
              <div className={`${styles.bgSecondary} rounded-xl ${styles.border}`}><EmptyState icon={UserIcon} title="暂无用户" description="当前没有可显示的用户记录。" /></div>
            ) : (
              <ResponsiveTableShell footer={<Pagination page={usersPage} total={usersTotal} limit={USER_PAGE_SIZE} onChange={setUsersPage} />}>
                <table className="w-full min-w-[1240px] table-fixed">
                  <thead>
                    <tr className={styles.tableHeader}>
                      <th className={`w-[200px] px-6 py-3 text-left text-sm font-medium ${styles.textSecondary}`}>用户名</th>
                      <th className={`w-[140px] px-6 py-3 text-left text-sm font-medium ${styles.textSecondary}`}>姓名</th>
                      <th className={`w-[220px] px-6 py-3 text-left text-sm font-medium ${styles.textSecondary}`}>邮箱</th>
                      <th className={`w-[160px] px-6 py-3 text-left text-sm font-medium ${styles.textSecondary}`}>角色</th>
                      <th className={`w-[120px] px-6 py-3 text-left text-sm font-medium ${styles.textSecondary}`}>状态</th>
                      <th className={`w-[180px] px-6 py-3 text-left text-sm font-medium ${styles.textSecondary}`}>创建时间</th>
                      <th className="sticky right-0 z-20 w-[168px] border-l border-studio-border-soft bg-studio-surface-soft px-1.5 py-3 text-right text-sm font-medium text-studio-text-secondary sm:w-[260px] sm:px-3">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredUsers.map((user) => (
                      <tr key={user.id} className={`border-t ${styles.tableRow} ${styles.tableHover}`}>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-studio-primary to-studio-cyan">
                              <UserIcon className="h-5 w-5 text-white" />
                            </div>
                            <span className={`truncate font-medium ${styles.textPrimary}`} title={user.username}>{user.username}</span>
                          </div>
                        </td>
                        <td className={`truncate px-6 py-4 ${styles.textSecondary}`} title={user.name || undefined}>{user.name || '-'}</td>
                        <td className={`px-6 py-4 ${styles.textSecondary}`}>
                          <div className="flex min-w-0 items-center gap-2"><Mail className="h-4 w-4 shrink-0" /><span className="truncate" title={user.email || undefined}>{user.email || '-'}</span></div>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs ${getRoleBadgeClass(user.role)}`}>
                            <Shield className="h-3 w-3" />
                            {getRoleLabel(user.role)}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs ${user.enabled ? 'border-studio-border-soft bg-studio-success-soft text-studio-success-contrast' : 'border-studio-border-soft bg-studio-coral-soft text-studio-coral-contrast'}`}>
                            {user.enabled ? <Unlock className="h-3 w-3" /> : <Lock className="h-3 w-3" />}
                            {user.enabled ? '已启用' : '已禁用'}
                          </span>
                        </td>
                        <td className={`px-6 py-4 ${styles.textSecondary}`}>
                          <div className="flex items-center gap-2 whitespace-nowrap"><Calendar className="h-4 w-4 shrink-0" />{formatBeijingDate(user.created_at)}</div>
                        </td>
                        <td data-testid={`user-row-actions-${user.id}`} className="sticky right-0 z-10 w-[168px] border-l border-studio-border-soft bg-studio-surface px-1.5 py-4 sm:w-[260px] sm:px-3">
                          <div className="flex flex-wrap items-center justify-end gap-0.5 sm:flex-nowrap sm:gap-1">
                            {canUpdateUser && (
                              <button
                                onClick={() => void handleToggleEnable(user)}
                                aria-label={`${user.enabled ? '禁用' : '启用'}用户 ${user.username}`}
                                disabled={userMutationPending}
                                className={`inline-flex items-center gap-1 rounded-lg border px-1.5 py-2 text-xs transition-opacity hover:opacity-85 sm:px-2.5 ${user.enabled ? 'border-studio-border-soft bg-studio-coral-soft text-studio-coral-contrast' : 'border-studio-border-soft bg-studio-success-soft text-studio-success-contrast'}`}
                              >
                                {user.enabled ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5" />}
                                {user.enabled ? '禁用' : '启用'}
                              </button>
                            )}
                            {canUpdateUser && (
                              <button type="button" disabled={userMutationPending} onClick={() => void openEditModal(user)} className={`rounded-lg p-1.5 text-studio-primary transition-colors ${styles.hoverBg} hover:text-studio-primary disabled:opacity-50 sm:p-2`} title="编辑" aria-label={`编辑用户 ${user.username}`}>
                                <Edit3 className="h-4 w-4 sm:h-5 sm:w-5" />
                              </button>
                            )}
                            {canDeleteUser && (
                              <button type="button" disabled={userMutationPending} onClick={() => setPendingDeleteUser(user)} className={`rounded-lg p-1.5 text-studio-coral transition-colors ${styles.hoverBg} hover:text-studio-coral disabled:opacity-50 sm:p-2`} title="删除" aria-label={`删除用户 ${user.username}`}>
                                <Trash2 className="h-4 w-4 sm:h-5 sm:w-5" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </ResponsiveTableShell>
            )}
          </div>
        )}

        {activeTab === 'logs' && canViewLogs && (
          <div className={`${styles.bgSecondary} overflow-hidden rounded-xl ${styles.border}`}>
            {loading ? (
              <div className="px-6 py-12"><LoadingState type="section" text="加载日志中..." /></div>
            ) : logsLoadError && filteredLogs.length === 0 ? null : filteredLogs.length === 0 ? (
              <EmptyState icon={History} title="暂无操作日志" description="当前没有可显示的操作记录。" />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className={styles.tableHeader}>
                      <th className={`px-6 py-3 text-left text-sm font-medium ${styles.textSecondary}`}>操作人</th>
                      <th className={`px-6 py-3 text-left text-sm font-medium ${styles.textSecondary}`}>操作</th>
                      <th className={`px-6 py-3 text-left text-sm font-medium ${styles.textSecondary}`}>目标</th>
                      <th className={`px-6 py-3 text-left text-sm font-medium ${styles.textSecondary}`}>详情</th>
                      <th className={`px-6 py-3 text-left text-sm font-medium ${styles.textSecondary}`}>时间</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredLogs.map((log) => (
                      <tr key={log.id} className={`border-t ${styles.tableRow} ${styles.tableHover}`}>
                        <td className={`px-6 py-4 font-medium ${styles.textPrimary}`}>{log.user_name || '-'}</td>
                        <td className={`px-6 py-4 ${styles.textSecondary}`}>{log.action}</td>
                        <td className={`px-6 py-4 ${styles.textSecondary}`}>{log.target}</td>
                        <td className={`max-w-xs truncate px-6 py-4 ${styles.textSecondary}`} title={log.detail}>{log.detail}</td>
                        <td className={`px-6 py-4 ${styles.textSecondary}`}>{formatBeijingTime(log.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      <FormModal open={showCreateModal} title="添加用户" onCancel={() => { if (!userMutationLockRef.current) setShowCreateModal(false); }} onSubmit={handleCreate} submitText="保存" cancelText="取消" loading={userMutationPending}>
        <div className="space-y-4">
          <div>
            <label htmlFor="create-user-username" className={`mb-2 block text-sm font-medium ${styles.textSecondary}`}>用户名 *</label>
            <input id="create-user-username" type="text" value={formData.username} onChange={(event) => setFormData({ ...formData, username: event.target.value })} className={`w-full rounded-lg px-4 py-2 ${styles.bgInput} ${styles.borderInput} ${styles.textPrimary} ${styles.textPlaceholder} focus:outline-none focus:ring-2 focus:ring-studio-primary`} placeholder="请输入用户名" />
          </div>
          <div>
            <label htmlFor="create-user-password" className={`mb-2 block text-sm font-medium ${styles.textSecondary}`}>密码 *</label>
            <input id="create-user-password" type="password" value={formData.password} onChange={(event) => setFormData({ ...formData, password: event.target.value })} className={`w-full rounded-lg px-4 py-2 ${styles.bgInput} ${styles.borderInput} ${styles.textPrimary} ${styles.textPlaceholder} focus:outline-none focus:ring-2 focus:ring-studio-primary`} placeholder="请输入密码" />
          </div>
          <div>
            <label htmlFor="create-user-name" className={`mb-2 block text-sm font-medium ${styles.textSecondary}`}>姓名</label>
            <input id="create-user-name" type="text" value={formData.name} onChange={(event) => setFormData({ ...formData, name: event.target.value })} className={`w-full rounded-lg px-4 py-2 ${styles.bgInput} ${styles.borderInput} ${styles.textPrimary} ${styles.textPlaceholder} focus:outline-none focus:ring-2 focus:ring-studio-primary`} placeholder="请输入姓名" />
          </div>
          <div>
            <label htmlFor="create-user-email" className={`mb-2 block text-sm font-medium ${styles.textSecondary}`}>邮箱</label>
            <input id="create-user-email" type="email" value={formData.email} onChange={(event) => setFormData({ ...formData, email: event.target.value })} className={`w-full rounded-lg px-4 py-2 ${styles.bgInput} ${styles.borderInput} ${styles.textPrimary} ${styles.textPlaceholder} focus:outline-none focus:ring-2 focus:ring-studio-primary`} placeholder="请输入邮箱" />
          </div>
          <div>
            <label htmlFor="user-role" className={`mb-2 block text-sm font-medium ${styles.textSecondary}`}>角色</label>
            {renderRoleSelect}
          </div>
        </div>
      </FormModal>

      <FormModal open={showEditModal && Boolean(editingUser)} title="编辑用户" onCancel={() => { if (!userMutationLockRef.current) { setShowEditModal(false); setEditingUser(null); } }} onSubmit={handleEdit} submitText="保存" cancelText="取消" loading={userMutationPending}>
        <div className="space-y-4">
          <div>
            <label htmlFor="edit-user-username" className={`mb-2 block text-sm font-medium ${styles.textSecondary}`}>用户名</label>
            <input id="edit-user-username" type="text" value={formData.username} className={`w-full rounded-lg px-4 py-2 ${styles.bgInput} ${styles.borderInput} ${styles.textPrimary} focus:outline-none focus:ring-2 focus:ring-studio-primary`} disabled />
          </div>
          <div>
            <label htmlFor="edit-user-password" className={`mb-2 block text-sm font-medium ${styles.textSecondary}`}>密码（留空则不修改）</label>
            <input id="edit-user-password" type="password" value={formData.password} onChange={(event) => setFormData({ ...formData, password: event.target.value })} className={`w-full rounded-lg px-4 py-2 ${styles.bgInput} ${styles.borderInput} ${styles.textPrimary} ${styles.textPlaceholder} focus:outline-none focus:ring-2 focus:ring-studio-primary`} placeholder="留空则不修改密码" />
          </div>
          <div>
            <label htmlFor="edit-user-name" className={`mb-2 block text-sm font-medium ${styles.textSecondary}`}>姓名</label>
            <input id="edit-user-name" type="text" value={formData.name} onChange={(event) => setFormData({ ...formData, name: event.target.value })} className={`w-full rounded-lg px-4 py-2 ${styles.bgInput} ${styles.borderInput} ${styles.textPrimary} ${styles.textPlaceholder} focus:outline-none focus:ring-2 focus:ring-studio-primary`} />
          </div>
          <div>
            <label htmlFor="edit-user-email" className={`mb-2 block text-sm font-medium ${styles.textSecondary}`}>邮箱</label>
            <input id="edit-user-email" type="email" value={formData.email} onChange={(event) => setFormData({ ...formData, email: event.target.value })} className={`w-full rounded-lg px-4 py-2 ${styles.bgInput} ${styles.borderInput} ${styles.textPrimary} ${styles.textPlaceholder} focus:outline-none focus:ring-2 focus:ring-studio-primary`} />
          </div>
          <div>
            <label htmlFor="user-role" className={`mb-2 block text-sm font-medium ${styles.textSecondary}`}>角色</label>
            {renderRoleSelect}
          </div>
          <div className="flex items-center gap-3">
            <input type="checkbox" id="enabled" checked={formData.enabled} onChange={(event) => setFormData({ ...formData, enabled: event.target.checked })} className={`h-5 w-5 rounded ${styles.borderInput} ${styles.bgInput} text-studio-primary focus:ring-studio-primary`} />
            <label htmlFor="enabled" className={styles.textSecondary}>启用用户</label>
          </div>
        </div>
      </FormModal>

      <ConfirmModal
        open={Boolean(pendingDeleteUser)}
        title="确认删除用户"
        description={pendingDeleteUser ? `确定要删除用户「${pendingDeleteUser.username}」吗？该操作执行后将无法恢复。` : '确定要删除该用户吗？'}
        confirmText="确认删除"
        cancelText="取消"
        variant="danger"
        loading={userMutationPending}
        onConfirm={handleDelete}
        onCancel={() => { if (!userMutationLockRef.current) setPendingDeleteUser(null); }}
      />
    </>
  );
}
