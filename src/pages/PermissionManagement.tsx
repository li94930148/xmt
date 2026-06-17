import { useState, useEffect } from 'react';
import { useThemeStyles } from '../hooks/useThemeStyles';
import { usePermission } from '../hooks/usePermission';
import { useAppStore, useAuthStore } from '../store';
import {
  Shield, Users, Settings, Plus, Trash2, Edit2, Check, X, ChevronDown, ChevronRight
} from 'lucide-react';

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

interface PermissionGroup {
  module: string;
  permissions: Permission[];
}

export default function PermissionManagement() {
  const styles = useThemeStyles();
  const appStore = useAppStore();
  const { hasPermission } = usePermission();
  const token = useAuthStore((state) => state.token);

  const [roles, setRoles] = useState<Role[]>([]);
  const [allPermissions, setAllPermissions] = useState<Permission[]>([]);
  const [groupedPermissions, setGroupedPermissions] = useState<Record<string, Permission[]>>({});
  const [loading, setLoading] = useState(true);
  const [editingRole, setEditingRole] = useState<Role | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [expandedModules, setExpandedModules] = useState<Set<string>>(new Set());
  const [formData, setFormData] = useState({ code: '', name: '', description: '', permission_ids: [] as number[] });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [rolesRes, permsRes] = await Promise.all([
        fetch('/api/roles', { headers: { Authorization: `Bearer ${token}` } }),
        fetch('/api/permissions', { headers: { Authorization: `Bearer ${token}` } })
      ]);

      if (rolesRes.ok) {
        const rolesData = await rolesRes.json();
        setRoles(rolesData);
      }

      if (permsRes.ok) {
        const permsData = await permsRes.json();
        setAllPermissions(permsData.permissions);
        setGroupedPermissions(permsData.grouped);
        // 默认展开所有模块
        setExpandedModules(new Set(Object.keys(permsData.grouped)));
      }
    } catch (error) {
      console.error('获取数据失败:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateRole = async () => {
    try {
      const response = await fetch('/api/roles', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });

      if (response.ok) {
        appStore.addNotification({ title: '创建成功', message: '角色已创建', type: 'success' });
        setShowCreateForm(false);
        setFormData({ code: '', name: '', description: '', permission_ids: [] });
        fetchData();
      } else {
        const data = await response.json();
        appStore.addNotification({ title: '创建失败', message: data.message, type: 'error' });
      }
    } catch (error) {
      appStore.addNotification({ title: '创建失败', message: '网络错误', type: 'error' });
    }
  };

  const handleUpdateRole = async () => {
    if (!editingRole) return;

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

      if (response.ok) {
        appStore.addNotification({ title: '更新成功', message: '角色已更新', type: 'success' });
        setEditingRole(null);
        setFormData({ code: '', name: '', description: '', permission_ids: [] });
        fetchData();
      } else {
        const data = await response.json();
        appStore.addNotification({ title: '更新失败', message: data.message, type: 'error' });
      }
    } catch (error) {
      appStore.addNotification({ title: '更新失败', message: '网络错误', type: 'error' });
    }
  };

  const handleDeleteRole = async (roleId: number) => {
    if (!confirm('确定删除此角色？')) return;

    try {
      const response = await fetch(`/api/roles/${roleId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });

      if (response.ok) {
        appStore.addNotification({ title: '删除成功', message: '角色已删除', type: 'success' });
        fetchData();
      } else {
        const data = await response.json();
        appStore.addNotification({ title: '删除失败', message: data.message, type: 'error' });
      }
    } catch (error) {
      appStore.addNotification({ title: '删除失败', message: '网络错误', type: 'error' });
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

  if (loading) {
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
            className={`flex items-center gap-2 px-4 py-2 rounded-xl ${styles.buttonPrimary}`}
          >
            <Plus className="w-4 h-4" />
            新建角色
          </button>
        )}
      </div>

      {/* 角色列表 */}
      <div className="grid gap-4">
        {roles.map(role => (
          <div key={role.id} className={`p-4 rounded-2xl ${styles.card}`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                  role.code === 'admin' ? 'bg-brand-500/10 text-brand-500' :
                  role.code === 'director' ? 'bg-[#51cf66]/10 text-[#51cf66]' :
                  'bg-theme-tertiary text-theme-text-secondary'
                }`}>
                  <Shield className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className={`font-medium ${styles.textPrimary}`}>{role.name}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${styles.bgTertiary} ${styles.textMuted}`}>
                      {role.code}
                    </span>
                    {role.is_system && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-brand-500/10 text-brand-500">
                        系统内置
                      </span>
                    )}
                  </div>
                  <p className={`text-sm ${styles.textMuted}`}>{role.description}</p>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-4 text-sm">
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
                      className={`p-2 rounded-lg ${styles.hoverBg} ${styles.textMuted}`}
                      title="编辑"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    {!role.is_system && (
                      <button
                        onClick={() => handleDeleteRole(role.id)}
                        className={`p-2 rounded-lg hover:bg-red-500/10 text-red-400`}
                        title="删除"
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
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
          <div className={`w-full max-w-2xl max-h-[80vh] overflow-y-auto rounded-2xl ${styles.modal} p-6`}>
            <div className="flex items-center justify-between mb-6">
              <h2 className={`text-xl font-bold ${styles.textPrimary}`}>
                {editingRole ? '编辑角色' : '新建角色'}
              </h2>
              <button
                onClick={() => { setShowCreateForm(false); setEditingRole(null); }}
                className={`p-2 rounded-lg ${styles.hoverBg} ${styles.textMuted}`}
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
                    disabled={!!editingRole}
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
                                className="rounded border-gray-300"
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
                  onClick={() => { setShowCreateForm(false); setEditingRole(null); }}
                  className={`px-4 py-2 rounded-xl ${styles.buttonSecondary}`}
                >
                  取消
                </button>
                <button
                  onClick={editingRole ? handleUpdateRole : handleCreateRole}
                  className={`px-4 py-2 rounded-xl ${styles.buttonPrimary}`}
                >
                  {editingRole ? '保存' : '创建'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
