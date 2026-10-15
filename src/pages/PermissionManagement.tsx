import { useState, useEffect, useRef, useCallback } from 'react';
import { useThemeStyles } from '../hooks/useThemeStyles';
import { usePermission } from '../hooks/usePermission';
import { useAppStore, useAuthStore } from '../store';
import { emitClientLog, safeClientErrorClass } from '../observability/client-logger';
import {
  Shield, Users, Settings, Plus, Trash2, Edit2, X, ChevronDown, ChevronRight
} from 'lucide-react';
import ConfirmModal from '../components/common/ConfirmModal';

interface Role {
  id: number;
  code: string;
  name: string;
  description: string;
  is_system: boolean;
  user_count: number;
  permission_count: number;
  permissions: Permission[];
}

interface Permission {
  id: number;
  code: string;
  name: string;
  module: string;
}

async function getResponseMessage(response: Response, fallback: string) {
  try {
    const data = await response.json();
    return typeof data?.message === 'string' && data.message.trim() ? data.message : fallback;
  } catch {
    return fallback;
  }
}

export default function PermissionManagement() {
  const styles = useThemeStyles();
  const addNotification = useAppStore((state) => state.addNotification);
  const { hasPermission } = usePermission();
  const token = useAuthStore((state) => state.token);

  const [roles, setRoles] = useState<Role[]>([]);
  const [groupedPermissions, setGroupedPermissions] = useState<Record<string, Permission[]>>({});
  const [loading, setLoading] = useState(true);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [confirmedWriteNotice, setConfirmedWriteNotice] = useState<string | null>(null);
  const [mutationBusy, setMutationBusy] = useState(false);
  const [deletingRole, setDeletingRole] = useState<Role | null>(null);
  const [editingRole, setEditingRole] = useState<Role | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [expandedModules, setExpandedModules] = useState<Set<string>>(new Set());
  const [formData, setFormData] = useState({ code: '', name: '', description: '', permission_ids: [] as number[] });
  const loadLockRef = useRef(false);
  const mutationLockRef = useRef(false);

  const fetchData = useCallback(async () => {
    if (loadLockRef.current) return false;
    loadLockRef.current = true;
    setLoading(true);
    try {
      const [rolesRes, permsRes] = await Promise.all([
        fetch('/api/roles', { headers: { Authorization: `Bearer ${token}` } }),
        fetch('/api/permissions', { headers: { Authorization: `Bearer ${token}` } })
      ]);

      if (!rolesRes.ok) throw new Error(await getResponseMessage(rolesRes, '角色列表加载失败，请重试。'));
      if (!permsRes.ok) throw new Error(await getResponseMessage(permsRes, '权限清单加载失败，请重试。'));

      const [rolesData, permsData] = await Promise.all([rolesRes.json(), permsRes.json()]);
      if (!Array.isArray(rolesData) || !Array.isArray(permsData?.permissions) || !permsData?.grouped || typeof permsData.grouped !== 'object') {
        throw new Error('角色或权限清单格式异常，请重新加载。');
      }
      setRoles(rolesData);
      setGroupedPermissions(permsData.grouped);
      // 默认展开所有模块
      setExpandedModules(new Set(Object.keys(permsData.grouped)));
      setHasLoadedOnce(true);
      setLoadError(null);
      setConfirmedWriteNotice(null);
      return true;
    } catch (error) {
      emitClientLog({ event: 'permissions.management_load_failed', level: 'error', fields: { errorClass: safeClientErrorClass(error) } });
      const message = error instanceof TypeError
        ? '暂时无法连接，角色与权限列表未加载；请检查网络后重试。'
        : error instanceof SyntaxError
          ? '角色与权限数据暂时无法读取，请重新加载。'
          : error instanceof Error
            ? error.message
            : '角色权限信息加载失败，请重试。';
      setLoadError(message);
      return false;
    } finally {
      loadLockRef.current = false;
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const handleCreateRole = async () => {
    if (mutationLockRef.current || loadError || confirmedWriteNotice) return;
    mutationLockRef.current = true;
    setMutationBusy(true);
    try {
      const response = await fetch('/api/roles', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });

      if (!response.ok) {
        addNotification({ title: '创建失败', message: await getResponseMessage(response, '角色创建失败，请重试。'), type: 'error' });
        return;
      }

      addNotification({ title: '创建成功', message: '服务器已确认角色创建', type: 'success' });
      setShowCreateForm(false);
      setFormData({ code: '', name: '', description: '', permission_ids: [] });
      const refreshed = await fetchData();
      if (!refreshed) setConfirmedWriteNotice('服务器已确认角色创建，但列表刷新失败；请重新加载确认，不要重复创建。');
    } catch {
      addNotification({ title: '创建失败', message: '网络连接异常，角色未确认创建，请检查后重试。', type: 'error' });
    } finally {
      mutationLockRef.current = false;
      setMutationBusy(false);
    }
  };

  const handleUpdateRole = async () => {
    if (!editingRole || mutationLockRef.current || loadError || confirmedWriteNotice) return;
    mutationLockRef.current = true;
    setMutationBusy(true);

    try {
      const response = await fetch(`/api/roles/${editingRole.id}`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formData.name,
          description: formData.description,
          permission_ids: formData.permission_ids
        })
      });

      if (!response.ok) {
        addNotification({ title: '更新失败', message: await getResponseMessage(response, '角色更新失败，请重试。'), type: 'error' });
        return;
      }

      addNotification({ title: '更新成功', message: '服务器已确认角色更新', type: 'success' });
      setEditingRole(null);
      setFormData({ code: '', name: '', description: '', permission_ids: [] });
      const refreshed = await fetchData();
      if (!refreshed) setConfirmedWriteNotice('服务器已确认角色更新，但列表刷新失败；请重新加载确认，不要重复保存。');
    } catch {
      addNotification({ title: '更新失败', message: '网络连接异常，角色未确认更新，请检查后重试。', type: 'error' });
    } finally {
      mutationLockRef.current = false;
      setMutationBusy(false);
    }
  };

  const handleDeleteRole = async () => {
    const role = deletingRole;
    if (!role || mutationLockRef.current || loadError || confirmedWriteNotice) return;
    mutationLockRef.current = true;
    setMutationBusy(true);

    try {
      const response = await fetch(`/api/roles/${role.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });

      if (!response.ok) {
        addNotification({ title: '删除失败', message: await getResponseMessage(response, '角色删除失败，请重试。'), type: 'error' });
        return;
      }

      setRoles((current) => current.filter((item) => item.id !== role.id));
      addNotification({ title: '删除成功', message: `角色“${role.name}”已删除`, type: 'success' });
      setDeletingRole(null);
    } catch {
      addNotification({ title: '删除失败', message: '网络连接异常，角色未确认删除，请检查后重试。', type: 'error' });
    } finally {
      mutationLockRef.current = false;
      setMutationBusy(false);
    }
  };

  const startEdit = (role: Role) => {
    setEditingRole(role);
    setFormData({
      code: role.code,
      name: role.name,
      description: role.description,
      permission_ids: role.permissions.map(p => p.id)
    });
  };

  const togglePermission = (permId: number) => {
    setFormData(prev => ({
      ...prev,
      permission_ids: prev.permission_ids.includes(permId)
        ? prev.permission_ids.filter(id => id !== permId)
        : [...prev.permission_ids, permId]
    }));
  };

  const toggleModule = (module: string) => {
    setExpandedModules(prev => {
      const next = new Set(prev);
      if (next.has(module)) {
        next.delete(module);
      } else {
        next.add(module);
      }
      return next;
    });
  };

  const selectAllModule = (module: string) => {
    const modulePerms = groupedPermissions[module] || [];
    const moduleIds = modulePerms.map(p => p.id);
    const allSelected = moduleIds.every(id => formData.permission_ids.includes(id));

    setFormData(prev => ({
      ...prev,
      permission_ids: allSelected
        ? prev.permission_ids.filter(id => !moduleIds.includes(id))
        : [...new Set([...prev.permission_ids, ...moduleIds])]
    }));
  };

  const getModuleLabel = (module: string): string => {
    const labels: Record<string, string> = {
      topic: '选题管理',
      workflow: '工作流',
      user: '用户管理',
      analytics: '数据分析',
      export: '数据导出',
      system: '系统管理'
    };
    return labels[module] || module;
  };

  if (loading && !hasLoadedOnce) {
    return (
      <div className={`flex items-center justify-center h-64 ${styles.textMuted}`}>
        <div className={`animate-spin rounded-8 h-8 w-8 border-2 ${styles.spinner} border-t-transparent`} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 页面标题 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className={styles.pageTitle}>角色权限管理</h1>
          <p className={styles.subtitle}>管理系统角色和权限分配</p>
        </div>
        {hasPermission('system:role') && (
          <button
            onClick={() => { setShowCreateForm(true); setFormData({ code: '', name: '', description: '', permission_ids: [] }); }}
            disabled={loading || mutationBusy || !!loadError || !!confirmedWriteNotice}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl ${styles.buttonPrimary}`}
          >
            <Plus className="w-4 h-4" />
            新建角色
          </button>
        )}
      </div>

      {(loadError || confirmedWriteNotice) && (
        <div role="alert" className={`flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-center sm:justify-between ${styles.border} ${styles.card}`}>
          <p className={styles.textSecondary}>{confirmedWriteNotice || loadError}</p>
          <button
            type="button"
            onClick={() => { void fetchData(); }}
            disabled={loading}
            className={`shrink-0 rounded-xl px-4 py-2 ${styles.buttonSecondary}`}
          >
            {loading ? '正在重新加载…' : '重新加载角色列表'}
          </button>
        </div>
      )}

      {hasLoadedOnce && !loading && roles.length === 0 && !loadError && (
        <div className={`rounded-2xl p-8 text-center ${styles.card} ${styles.textMuted}`}>
          暂无角色
        </div>
      )}

      {/* 角色列表 */}
      <div className="grid gap-4">
        {roles.map(role => (
          <div key={role.id} className={`p-4 rounded-2xl ${styles.card}`}>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 items-start gap-3 sm:items-center">
                <div data-testid={`role-icon-${role.code}`} className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                  role.code === 'admin' ? 'bg-studio-primary-soft text-studio-primary-contrast' :
                  role.code === 'director' ? 'bg-studio-success/10 text-studio-success-contrast' :
                  'bg-theme-tertiary text-theme-text-secondary'
                }`}>
                  <Shield className="w-5 h-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span data-testid="role-name" className={`font-medium ${styles.textPrimary}`}>{role.name}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${styles.bgTertiary} ${styles.textMuted}`}>
                      {role.code}
                    </span>
                    {role.is_system && (
                      <span data-testid="system-role-badge" className="text-xs px-2 py-0.5 rounded-full bg-studio-primary-soft text-studio-primary-contrast">
                        系统内置
                      </span>
                    )}
                  </div>
                  <p className={`text-sm ${styles.textMuted}`}>{role.description}</p>
                </div>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3 sm:gap-4">
                <div className="flex flex-wrap items-center gap-3 text-sm sm:gap-4">
                  <span className={styles.textMuted}>
                    <Users className="w-4 h-4 inline mr-1" />
                    {role.user_count} 用户
                  </span>
                  <span className={styles.textMuted}>
                    <Settings className="w-4 h-4 inline mr-1" />
                    {role.permission_count} 权限
                  </span>
                </div>
                {hasPermission('system:role') && (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => startEdit(role)}
                      disabled={loading || mutationBusy || !!loadError || !!confirmedWriteNotice}
                      className={`p-2 rounded-lg ${styles.hoverBg} ${styles.textMuted}`}
                      title="编辑"
                      aria-label={`编辑角色 ${role.name}`}
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    {!role.is_system && (
                      <button
                        onClick={() => setDeletingRole(role)}
                        disabled={loading || mutationBusy || !!loadError || !!confirmedWriteNotice}
                        className="p-2 rounded-lg text-studio-coral-contrast hover:bg-studio-coral-soft"
                        title="删除"
                        aria-label={`删除角色 ${role.name}`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* 权限标签 */}
            {role.permissions.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {role.permissions.slice(0, 10).map(perm => (
                  <span key={perm.id} className={`text-xs px-2 py-1 rounded-lg ${styles.bgTertiary} ${styles.textMuted}`}>
                    {perm.name}
                  </span>
                ))}
                {role.permissions.length > 10 && (
                  <span className={`text-xs px-2 py-1 rounded-lg ${styles.bgTertiary} ${styles.textMuted}`}>
                    +{role.permissions.length - 10} 更多
                  </span>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* 创建/编辑弹窗 */}
      {(showCreateForm || editingRole) && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-modal">
          <div className={`w-full max-w-2xl max-h-[80vh] overflow-y-auto rounded-2xl ${styles.modal} p-6`}>
            <div className="flex items-center justify-between mb-6">
              <h2 className={`text-xl font-bold ${styles.textPrimary}`}>
                {editingRole ? '编辑角色' : '新建角色'}
              </h2>
              <button
                onClick={() => { if (!mutationBusy) { setShowCreateForm(false); setEditingRole(null); } }}
                disabled={mutationBusy}
                className={`p-2 rounded-lg ${styles.hoverBg} ${styles.textMuted}`}
                aria-label="关闭角色编辑"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              {/* 角色信息 */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={`block text-sm font-medium mb-2 ${styles.textSecondary}`}>角色编码</label>
                  <input
                    type="text"
                    value={formData.code}
                    onChange={(e) => setFormData(prev => ({ ...prev, code: e.target.value }))}
                    disabled={!!editingRole || mutationBusy}
                    className={`w-full px-4 py-2 rounded-xl ${styles.input}`}
                    placeholder="如 editor"
                  />
                </div>
                <div>
                  <label className={`block text-sm font-medium mb-2 ${styles.textSecondary}`}>角色名称</label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                    disabled={mutationBusy}
                    className={`w-full px-4 py-2 rounded-xl ${styles.input}`}
                    placeholder="如 编辑"
                  />
                </div>
              </div>
              <div>
                <label className={`block text-sm font-medium mb-2 ${styles.textSecondary}`}>描述</label>
                <input
                  type="text"
                  value={formData.description}
                  onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                  disabled={mutationBusy}
                  className={`w-full px-4 py-2 rounded-xl ${styles.input}`}
                  placeholder="角色描述"
                />
              </div>

              {/* 权限选择 */}
              <div>
                <label className={`block text-sm font-medium mb-2 ${styles.textSecondary}`}>权限分配</label>
                <div className={`border rounded-xl ${styles.border} overflow-hidden`}>
                  {Object.entries(groupedPermissions).map(([module, perms]) => (
                    <div key={module} className="border-b last:border-b-0 border-inherit">
                      <div
                        className={`flex items-center justify-between px-4 py-3 cursor-pointer ${styles.hoverBg}`}
                        onClick={() => toggleModule(module)}
                      >
                        <div className="flex items-center gap-2">
                          {expandedModules.has(module) ? (
                            <ChevronDown className="w-4 h-4 text-theme-text-muted" />
                          ) : (
                            <ChevronRight className="w-4 h-4 text-theme-text-muted" />
                          )}
                          <span className={`font-medium ${styles.textPrimary}`}>{getModuleLabel(module)}</span>
                          <span className={`text-xs ${styles.textMuted}`}>
                            ({perms.filter(p => formData.permission_ids.includes(p.id)).length}/{perms.length})
                          </span>
                        </div>
                        <button
                          onClick={(e) => { e.stopPropagation(); selectAllModule(module); }}
                          disabled={mutationBusy}
                          className={`text-xs px-2 py-1 rounded ${styles.hoverBg} ${styles.textMuted}`}
                        >
                          {perms.every(p => formData.permission_ids.includes(p.id)) ? '取消全选' : '全选'}
                        </button>
                      </div>
                      {expandedModules.has(module) && (
                        <div className="px-4 pb-3 grid grid-cols-2 gap-2">
                          {perms.map(perm => (
                            <label
                              key={perm.id}
                              className={`flex items-center gap-2 p-2 rounded-lg cursor-pointer ${styles.hoverBg}`}
                            >
                              <input
                                type="checkbox"
                                checked={formData.permission_ids.includes(perm.id)}
                                onChange={() => togglePermission(perm.id)}
                                disabled={mutationBusy}
                                className="rounded border-studio-border-soft"
                              />
                              <span className={`text-sm ${styles.textPrimary}`}>{perm.name}</span>
                              <span className={`text-xs ${styles.textMuted}`}>{perm.code}</span>
                            </label>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* 操作按钮 */}
              <div className="flex justify-end gap-3 pt-4">
                <button
                  onClick={() => { if (!mutationBusy) { setShowCreateForm(false); setEditingRole(null); } }}
                  disabled={mutationBusy}
                  className={`px-4 py-2 rounded-xl ${styles.buttonSecondary}`}
                >
                  取消
                </button>
                <button
                  onClick={editingRole ? handleUpdateRole : handleCreateRole}
                  disabled={mutationBusy || !!loadError || !!confirmedWriteNotice}
                  className={`px-4 py-2 rounded-xl ${styles.buttonPrimary}`}
                >
                  {mutationBusy ? '处理中…' : editingRole ? '保存' : '创建'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <ConfirmModal
        open={!!deletingRole}
        title="确认删除角色"
        description={deletingRole ? `将删除角色“${deletingRole.name}”。此操作不可撤销。` : undefined}
        confirmText="删除角色"
        cancelText="取消"
        variant="danger"
        loading={mutationBusy}
        onCancel={() => { if (!mutationBusy) setDeletingRole(null); }}
        onConfirm={handleDeleteRole}
      />
    </div>
  );
}
