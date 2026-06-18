import { useEffect, useMemo, useState } from 'react';
import { Calendar, Edit3, History, Lock, Mail, Plus, Search, Shield, Trash2, Unlock, User as UserIcon } from 'lucide-react';
import { createUser, deleteUser, getLogs, getRoles, getUsers, updateUser } from '../api';
import EmptyState from '../components/EmptyState';
import { ConfirmModal, FormModal, LoadingState, PageHeader, PageToolbar } from '../components/common';
import { useThemeStyles } from '../hooks/useThemeStyles';
import { getRoleDisplayName } from '../lib/roles';
import { formatBeijingDate, formatBeijingTime } from '../lib/utils';
import { useAppStore } from '../store';
import type { ActivityLog, User } from '../types';

interface RoleOption {
  id: number;
  code: string;
  name: string;
  description?: string;
  is_system?: boolean;
}

interface UserFormData {
  username: string;
  password: string;
  email: string;
  role: string;
  name: string;
  enabled: boolean;
}

const baseRoleColors: Record<string, string> = {
  admin: 'bg-red-500/20 text-red-400 border-red-500/30',
  director: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  editor: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  member: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
};

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
  const [users, setUsers] = useState<User[]>([]);
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [roles, setRoles] = useState<RoleOption[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState<'users' | 'logs'>('users');
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [formData, setFormData] = useState<UserFormData>(buildDefaultForm());
  const [pendingDeleteUser, setPendingDeleteUser] = useState<User | null>(null);
  const [deleting, setDeleting] = useState(false);

  const addNotification = useAppStore((state) => state.addNotification);
  const styles = useThemeStyles();

  const defaultRoleCode = useMemo(() => {
    if (roles.some((role) => role.code === 'member')) {
      return 'member';
    }
    return roles[0]?.code || '';
  }, [roles]);

  const roleNameMap = useMemo(
    () =>
      roles.reduce<Record<string, string>>((acc, role) => {
        acc[role.code] = role.name;
        return acc;
      }, {}),
    [roles],
  );

  const getRoleBadgeClass = (roleCode: string) =>
    baseRoleColors[roleCode] || 'bg-slate-500/20 text-slate-300 border-slate-500/30';

  const getRoleLabel = (roleCode: string) => roleNameMap[roleCode] || getRoleDisplayName(roleCode);

  const resetForm = (roleCode = defaultRoleCode) => {
    setFormData(buildDefaultForm(roleCode));
  };

  useEffect(() => {
    async function loadRoles() {
      try {
        const roleList = await getRoles();
        setRoles(roleList);
        setFormData((current) => ({
          ...current,
          role:
            current.role ||
            (roleList.some((role: RoleOption) => role.code === 'member') ? 'member' : roleList[0]?.code || ''),
        }));
      } catch (error) {
        addNotification({ title: '获取角色失败', message: (error as Error).message, type: 'error' });
      }
    }

    void loadRoles();
  }, [addNotification]);

  useEffect(() => {
    async function fetchCurrentTabData() {
      setLoading(true);
      try {
        if (activeTab === 'users') {
          const result = await getUsers();
          setUsers(result.data);
          return;
        }

        const result = await getLogs();
        setLogs(result.data);
      } catch (error) {
        addNotification({ title: '获取数据失败', message: (error as Error).message, type: 'error' });
      } finally {
        setLoading(false);
      }
    }

    void fetchCurrentTabData();
  }, [activeTab, addNotification]);

  const filteredUsers = users.filter(
    (user) =>
      user.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.email.toLowerCase().includes(searchTerm.toLowerCase()),
  );

  const filteredLogs = logs.filter(
    (log) =>
      log.action.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.user_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.target.toLowerCase().includes(searchTerm.toLowerCase()),
  );

  const openCreateModal = () => {
    resetForm();
    setShowCreateModal(true);
  };

  const openEditModal = (user: User) => {
    setEditingUser(user);
    setFormData({
      username: user.username,
      password: '',
      email: user.email,
      role: user.role,
      name: user.name,
      enabled: user.enabled,
    });
    setShowEditModal(true);
  };

  const handleCreate = async () => {
    if (!formData.username || !formData.password) {
      addNotification({ title: '创建失败', message: '用户名和密码不能为空', type: 'error' });
      return;
    }

    if (!formData.role) {
      addNotification({ title: '创建失败', message: '请选择角色', type: 'error' });
      return;
    }

    try {
      await createUser(formData);
      addNotification({ title: '创建成功', message: '用户已创建', type: 'success' });
      setShowCreateModal(false);
      resetForm();

      const result = await getUsers();
      setUsers(result.data);
    } catch (error) {
      addNotification({ title: '创建失败', message: (error as Error).message, type: 'error' });
    }
  };

  const handleEdit = async () => {
    if (!editingUser) {
      return;
    }

    if (!formData.role) {
      addNotification({ title: '更新失败', message: '请选择角色', type: 'error' });
      return;
    }

    try {
      const updateData: Partial<User> & { password?: string } = {
        email: formData.email,
        role: formData.role,
        name: formData.name,
        enabled: formData.enabled,
      };

      if (formData.password) {
        updateData.password = formData.password;
      }

      await updateUser(editingUser.id, updateData);
      addNotification({ title: '更新成功', message: '用户信息已更新', type: 'success' });
      setShowEditModal(false);
      setEditingUser(null);

      const result = await getUsers();
      setUsers(result.data);
    } catch (error) {
      addNotification({ title: '更新失败', message: (error as Error).message, type: 'error' });
    }
  };

  const handleDelete = async () => {
    if (!pendingDeleteUser) {
      return;
    }

    setDeleting(true);
    try {
      await deleteUser(pendingDeleteUser.id);
      addNotification({ title: '删除成功', message: '用户已删除', type: 'success' });
      setUsers((current) => current.filter((user) => user.id !== pendingDeleteUser.id));
      setPendingDeleteUser(null);
    } catch (error) {
      addNotification({ title: '删除失败', message: (error as Error).message, type: 'error' });
    } finally {
      setDeleting(false);
    }
  };

  const handleToggleEnable = async (user: User) => {
    try {
      await updateUser(user.id, { enabled: !user.enabled });
      addNotification({
        title: '操作成功',
        message: user.enabled ? '用户已禁用' : '用户已启用',
        type: 'success',
      });
      setUsers((current) =>
        current.map((item) => (item.id === user.id ? { ...item, enabled: !item.enabled } : item)),
      );
    } catch (error) {
      addNotification({ title: '操作失败', message: (error as Error).message, type: 'error' });
    }
  };

  const tabSwitch = (
    <div className={`flex w-fit gap-2 rounded-xl p-1 ${styles.bgSecondary} ${styles.border}`}>
      <button
        onClick={() => setActiveTab('users')}
        className={`rounded-lg px-4 py-2 transition-colors ${
          activeTab === 'users' ? styles.buttonPrimary : `${styles.textSecondary} ${styles.hoverBg}`
        }`}
      >
        用户列表
      </button>
      <button
        onClick={() => setActiveTab('logs')}
        className={`flex items-center gap-2 rounded-lg px-4 py-2 transition-colors ${
          activeTab === 'logs' ? styles.buttonPrimary : `${styles.textSecondary} ${styles.hoverBg}`
        }`}
      >
        <History className="h-4 w-4" />
        操作日志
      </button>
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
        className={`w-full rounded-lg py-2 pl-10 pr-4 ${styles.bgInput} ${styles.borderInput} ${styles.textPrimary} ${styles.textPlaceholder} focus:outline-none focus:ring-2 focus:ring-blue-500`}
      />
    </div>
  );

  return (
    <>
      <div className="space-y-6">
        <PageHeader
          title="人员管理"
          description="管理系统用户和查看操作日志"
          actions={
            activeTab === 'users' ? (
              <button
                onClick={openCreateModal}
                className={`flex items-center gap-2 rounded-lg px-4 py-2 ${styles.buttonPrimary} transition-colors`}
              >
                <Plus className="h-5 w-5" />
                添加用户
              </button>
            ) : undefined
          }
        />

        <PageToolbar left={tabSwitch} search={searchInput} />

        {activeTab === 'users' && (
          <div className={`${styles.bgSecondary} overflow-hidden rounded-xl ${styles.border}`}>
            {loading ? (
              <div className="px-6 py-12">
                <LoadingState type="section" text="加载用户中..." />
              </div>
            ) : filteredUsers.length === 0 ? (
              <EmptyState
                icon={UserIcon}
                title="暂无用户"
                description="当前还没有可显示的用户记录。"
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className={styles.tableHeader}>
                      <th className={`px-6 py-3 text-left text-sm font-medium ${styles.textSecondary}`}>用户名</th>
                      <th className={`px-6 py-3 text-left text-sm font-medium ${styles.textSecondary}`}>姓名</th>
                      <th className={`px-6 py-3 text-left text-sm font-medium ${styles.textSecondary}`}>邮箱</th>
                      <th className={`px-6 py-3 text-left text-sm font-medium ${styles.textSecondary}`}>角色</th>
                      <th className={`px-6 py-3 text-left text-sm font-medium ${styles.textSecondary}`}>状态</th>
                      <th className={`px-6 py-3 text-left text-sm font-medium ${styles.textSecondary}`}>创建时间</th>
                      <th className={`px-6 py-3 text-left text-sm font-medium ${styles.textSecondary}`}>操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredUsers.map((user) => (
                      <tr key={user.id} className={`border-t ${styles.tableRow} ${styles.tableHover}`}>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-cyan-500">
                              <UserIcon className="h-5 w-5 text-white" />
                            </div>
                            <span className={`font-medium ${styles.textPrimary}`}>{user.username}</span>
                          </div>
                        </td>
                        <td className={`px-6 py-4 ${styles.textSecondary}`}>{user.name || '-'}</td>
                        <td className={`px-6 py-4 ${styles.textSecondary}`}>
                          <div className="flex items-center gap-2">
                            <Mail className="h-4 w-4" />
                            {user.email || '-'}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs ${getRoleBadgeClass(user.role)}`}>
                            <Shield className="h-3 w-3" />
                            {getRoleLabel(user.role)}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <button
                            onClick={() => handleToggleEnable(user)}
                            className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs transition-colors ${
                              user.enabled
                                ? 'border border-green-500/30 bg-green-500/20 text-green-400 hover:bg-green-500/30'
                                : 'border border-red-500/30 bg-red-500/20 text-red-400 hover:bg-red-500/30'
                            }`}
                          >
                            {user.enabled ? <Unlock className="h-3 w-3" /> : <Lock className="h-3 w-3" />}
                            {user.enabled ? '启用' : '禁用'}
                          </button>
                        </td>
                        <td className={`px-6 py-4 ${styles.textSecondary}`}>
                          <div className="flex items-center gap-2">
                            <Calendar className="h-4 w-4" />
                            {formatBeijingDate(user.created_at)}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => openEditModal(user)}
                              className={`rounded-lg p-2 text-blue-400 transition-colors ${styles.hoverBg} hover:text-blue-300`}
                              title="编辑"
                            >
                              <Edit3 className="h-5 w-5" />
                            </button>
                            <button
                              onClick={() => setPendingDeleteUser(user)}
                              className={`rounded-lg p-2 text-red-400 transition-colors ${styles.hoverBg} hover:text-red-300`}
                              title="删除"
                            >
                              <Trash2 className="h-5 w-5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {activeTab === 'logs' && (
          <div className={`${styles.bgSecondary} overflow-hidden rounded-xl ${styles.border}`}>
            {loading ? (
              <div className="px-6 py-12">
                <LoadingState type="section" text="加载日志中..." />
              </div>
            ) : filteredLogs.length === 0 ? (
              <EmptyState
                icon={History}
                title="暂无操作日志"
                description="当前还没有可显示的操作记录。"
              />
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
                        <td className={`max-w-xs truncate px-6 py-4 ${styles.textSecondary}`} title={log.detail}>
                          {log.detail}
                        </td>
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

      <FormModal
        open={showCreateModal}
        title="添加用户"
        onCancel={() => setShowCreateModal(false)}
        onSubmit={handleCreate}
        submitText="保存"
        cancelText="取消"
      >
        <div className="space-y-4">
          <div>
            <label className={`mb-2 block text-sm font-medium ${styles.textSecondary}`}>用户名 *</label>
            <input
              type="text"
              value={formData.username}
              onChange={(event) => setFormData({ ...formData, username: event.target.value })}
              className={`w-full rounded-lg px-4 py-2 ${styles.bgInput} ${styles.borderInput} ${styles.textPrimary} ${styles.textPlaceholder} focus:outline-none focus:ring-2 focus:ring-blue-500`}
              placeholder="请输入用户名"
            />
          </div>

          <div>
            <label className={`mb-2 block text-sm font-medium ${styles.textSecondary}`}>密码 *</label>
            <input
              type="password"
              value={formData.password}
              onChange={(event) => setFormData({ ...formData, password: event.target.value })}
              className={`w-full rounded-lg px-4 py-2 ${styles.bgInput} ${styles.borderInput} ${styles.textPrimary} ${styles.textPlaceholder} focus:outline-none focus:ring-2 focus:ring-blue-500`}
              placeholder="请输入密码"
            />
          </div>

          <div>
            <label className={`mb-2 block text-sm font-medium ${styles.textSecondary}`}>姓名</label>
            <input
              type="text"
              value={formData.name}
              onChange={(event) => setFormData({ ...formData, name: event.target.value })}
              className={`w-full rounded-lg px-4 py-2 ${styles.bgInput} ${styles.borderInput} ${styles.textPrimary} ${styles.textPlaceholder} focus:outline-none focus:ring-2 focus:ring-blue-500`}
              placeholder="请输入姓名"
            />
          </div>

          <div>
            <label className={`mb-2 block text-sm font-medium ${styles.textSecondary}`}>邮箱</label>
            <input
              type="email"
              value={formData.email}
              onChange={(event) => setFormData({ ...formData, email: event.target.value })}
              className={`w-full rounded-lg px-4 py-2 ${styles.bgInput} ${styles.borderInput} ${styles.textPrimary} ${styles.textPlaceholder} focus:outline-none focus:ring-2 focus:ring-blue-500`}
              placeholder="请输入邮箱"
            />
          </div>

          <div>
            <label className={`mb-2 block text-sm font-medium ${styles.textSecondary}`}>角色</label>
            <select
              value={formData.role}
              onChange={(event) => setFormData({ ...formData, role: event.target.value })}
              className={`w-full rounded-lg px-4 py-2 ${styles.bgInput} ${styles.borderInput} ${styles.textPrimary} focus:outline-none focus:ring-2 focus:ring-blue-500`}
            >
              {roles.map((role) => (
                <option key={role.id} value={role.code}>
                  {role.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </FormModal>

      <FormModal
        open={showEditModal && Boolean(editingUser)}
        title="编辑用户"
        onCancel={() => {
          setShowEditModal(false);
          setEditingUser(null);
        }}
        onSubmit={handleEdit}
        submitText="保存"
        cancelText="取消"
      >
        <div className="space-y-4">
          <div>
            <label className={`mb-2 block text-sm font-medium ${styles.textSecondary}`}>用户名</label>
            <input
              type="text"
              value={formData.username}
              onChange={(event) => setFormData({ ...formData, username: event.target.value })}
              className={`w-full rounded-lg px-4 py-2 ${styles.bgInput} ${styles.borderInput} ${styles.textPrimary} focus:outline-none focus:ring-2 focus:ring-blue-500`}
              disabled
            />
          </div>

          <div>
            <label className={`mb-2 block text-sm font-medium ${styles.textSecondary}`}>密码（留空则不修改）</label>
            <input
              type="password"
              value={formData.password}
              onChange={(event) => setFormData({ ...formData, password: event.target.value })}
              className={`w-full rounded-lg px-4 py-2 ${styles.bgInput} ${styles.borderInput} ${styles.textPrimary} ${styles.textPlaceholder} focus:outline-none focus:ring-2 focus:ring-blue-500`}
              placeholder="留空则不修改密码"
            />
          </div>

          <div>
            <label className={`mb-2 block text-sm font-medium ${styles.textSecondary}`}>姓名</label>
            <input
              type="text"
              value={formData.name}
              onChange={(event) => setFormData({ ...formData, name: event.target.value })}
              className={`w-full rounded-lg px-4 py-2 ${styles.bgInput} ${styles.borderInput} ${styles.textPrimary} ${styles.textPlaceholder} focus:outline-none focus:ring-2 focus:ring-blue-500`}
            />
          </div>

          <div>
            <label className={`mb-2 block text-sm font-medium ${styles.textSecondary}`}>邮箱</label>
            <input
              type="email"
              value={formData.email}
              onChange={(event) => setFormData({ ...formData, email: event.target.value })}
              className={`w-full rounded-lg px-4 py-2 ${styles.bgInput} ${styles.borderInput} ${styles.textPrimary} ${styles.textPlaceholder} focus:outline-none focus:ring-2 focus:ring-blue-500`}
            />
          </div>

          <div>
            <label className={`mb-2 block text-sm font-medium ${styles.textSecondary}`}>角色</label>
            <select
              value={formData.role}
              onChange={(event) => setFormData({ ...formData, role: event.target.value })}
              className={`w-full rounded-lg px-4 py-2 ${styles.bgInput} ${styles.borderInput} ${styles.textPrimary} focus:outline-none focus:ring-2 focus:ring-blue-500`}
            >
              {roles.map((role) => (
                <option key={role.id} value={role.code}>
                  {role.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              id="enabled"
              checked={formData.enabled}
              onChange={(event) => setFormData({ ...formData, enabled: event.target.checked })}
              className={`h-5 w-5 rounded ${styles.borderInput} ${styles.bgInput} text-blue-600 focus:ring-blue-500`}
            />
            <label htmlFor="enabled" className={styles.textSecondary}>
              启用用户
            </label>
          </div>
        </div>
      </FormModal>

      <ConfirmModal
        open={Boolean(pendingDeleteUser)}
        title="确认删除用户"
        description={
          pendingDeleteUser
            ? `确定要删除用户「${pendingDeleteUser.username}」吗？该操作执行后将无法恢复。`
            : '确定要删除该用户吗？'
        }
        confirmText="确认删除"
        cancelText="取消"
        variant="danger"
        loading={deleting}
        onConfirm={handleDelete}
        onCancel={() => {
          if (!deleting) {
            setPendingDeleteUser(null);
          }
        }}
      />
    </>
  );
}
