import { useState, useEffect } from 'react';
import { useAppStore } from '../store';
import { useThemeStyles } from '../hooks/useThemeStyles';
import { getUsers, createUser, updateUser, deleteUser, getLogs } from '../api';
import { User, ActivityLog } from '../types';
import { Plus, Search, Edit3, Trash2, User as UserIcon, Shield, Mail, Calendar, History, Lock, Unlock } from 'lucide-react';
import { formatBeijingTime, formatBeijingDate } from '../lib/utils';

export default function Users() {
  const [users, setUsers] = useState<User[]>([]);
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState<'users' | 'logs'>('users');
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [formData, setFormData] = useState<{ username: string; password: string; email: string; role: 'admin' | 'director' | 'member'; name: string; enabled: boolean }>({ username: '', password: '', email: '', role: 'member', name: '', enabled: true });
  const [editingUser, setEditingUser] = useState<User | null>(null);
  
  const appStore = useAppStore();
  const styles = useThemeStyles();

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        if (activeTab === 'users') {
          const result = await getUsers();
          setUsers(result.data);
        } else {
          const result = await getLogs();
          setLogs(result.data);
        }
      } catch (error) {
        appStore.addNotification({ title: '获取数据失败', message: (error as Error).message, type: 'error' });
      } finally {
        setLoading(false);
      }
    };
    
    fetchData();
  }, [activeTab]);

  const handleCreate = async () => {
    if (!formData.username || !formData.password) {
      appStore.addNotification({ title: '创建失败', message: '用户名和密码不能为空', type: 'error' });
      return;
    }
    
    try {
      await createUser(formData);
      appStore.addNotification({ title: '创建成功', message: '用户已创建', type: 'success' });
      setShowCreateModal(false);
      setFormData({ username: '', password: '', email: '', role: 'member', name: '', enabled: true });
      
      const result = await getUsers();
      setUsers(result.data);
    } catch (error) {
      appStore.addNotification({ title: '创建失败', message: (error as Error).message, type: 'error' });
    }
  };

  const handleEdit = async () => {
    if (!editingUser) return;

    try {
      const updateData: any = {};
      if (formData.password) updateData.password = formData.password;
      if (formData.email !== undefined) updateData.email = formData.email;
      if (formData.role) updateData.role = formData.role;
      if (formData.name !== undefined) updateData.name = formData.name;
      if (formData.enabled !== undefined) updateData.enabled = formData.enabled;

      await updateUser(editingUser.id, updateData);
      appStore.addNotification({ title: '更新成功', message: '用户信息已更新', type: 'success' });
      setShowEditModal(false);
      setEditingUser(null);

      // 直接更新本地状态
      setUsers(users.map(u => u.id === editingUser.id ? {
        ...u,
        name: formData.name || u.name,
        email: formData.email || u.email,
        role: formData.role || u.role,
        enabled: formData.enabled
      } : u));
    } catch (error) {
      appStore.addNotification({ title: '更新失败', message: (error as Error).message, type: 'error' });
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('确定要删除这个用户吗？')) return;
    
    try {
      await deleteUser(id);
      appStore.addNotification({ title: '删除成功', message: '用户已删除', type: 'success' });
      setUsers(users.filter(u => u.id !== id));
    } catch (error) {
      appStore.addNotification({ title: '删除失败', message: (error as Error).message, type: 'error' });
    }
  };

  const handleToggleEnable = async (user: User) => {
    try {
      await updateUser(user.id, { enabled: !user.enabled });
      appStore.addNotification({ 
        title: '操作成功', 
        message: user.enabled ? '用户已禁用' : '用户已启用', 
        type: 'success' 
      });
      setUsers(users.map(u => u.id === user.id ? { ...u, enabled: !u.enabled } : u));
    } catch (error) {
      appStore.addNotification({ title: '操作失败', message: (error as Error).message, type: 'error' });
    }
  };

  const openEditModal = (user: User) => {
    setEditingUser(user);
    setFormData({
      username: user.username,
      password: '',
      email: user.email,
      role: user.role,
      name: user.name,
      enabled: user.enabled
    });
    setShowEditModal(true);
  };

  const roleColors: Record<string, string> = {
    admin: 'bg-red-500/20 text-red-400 border-red-500/30',
    director: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    member: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
  };

  const roleText: Record<string, string> = {
    admin: '管理员',
    director: '编导',
    member: '普通成员',
  };

  const filteredUsers = users.filter(u => 
    u.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
    u.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    u.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredLogs = logs.filter(l => 
    l.action.toLowerCase().includes(searchTerm.toLowerCase()) ||
    l.user_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    l.target.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className={`text-2xl font-bold ${styles.textPrimary}`}>人员管理</h1>
          <p className={`${styles.textSecondary} mt-1`}>管理系统用户和查看操作日志</p>
        </div>
        {activeTab === 'users' && (
          <button
            onClick={() => setShowCreateModal(true)}
            className={`flex items-center gap-2 px-4 py-2 ${styles.buttonPrimary} rounded-lg transition-colors`}
          >
            <Plus className="w-5 h-5" />
            添加用户
          </button>
        )}
      </div>

      <div className={`flex gap-2 ${styles.bgSecondary} rounded-xl p-1 ${styles.border} w-fit`}>
        <button
          onClick={() => setActiveTab('users')}
          className={`px-4 py-2 rounded-lg transition-colors ${
            activeTab === 'users' ? `${styles.buttonPrimary}` : `${styles.textSecondary} ${styles.hoverBg}`
          }`}
        >
          用户列表
        </button>
        <button
          onClick={() => setActiveTab('logs')}
          className={`px-4 py-2 rounded-lg transition-colors flex items-center gap-2 ${
            activeTab === 'logs' ? `${styles.buttonPrimary}` : `${styles.textSecondary} ${styles.hoverBg}`
          }`}
        >
          <History className="w-4 h-4" />
          操作日志
        </button>
      </div>

      <div className={`${styles.bgSecondary} rounded-xl p-4 ${styles.border}`}>
        <div className="relative">
          <Search className={`absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 ${styles.textSecondary}`} />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder={activeTab === 'users' ? '搜索用户名、姓名或邮箱...' : '搜索操作、用户或目标...'}
            className={`w-full pl-10 pr-4 py-2 ${styles.bgInput} ${styles.borderInput} rounded-lg ${styles.textPrimary} ${styles.textPlaceholder} focus:outline-none focus:ring-2 focus:ring-blue-500`}
          />
        </div>
      </div>

      {activeTab === 'users' && (
        <div className={`${styles.bgSecondary} rounded-xl ${styles.border} overflow-hidden`}>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className={styles.tableHeader}>
                  <th className={`text-left px-6 py-3 ${styles.textSecondary} text-sm font-medium`}>用户名</th>
                  <th className={`text-left px-6 py-3 ${styles.textSecondary} text-sm font-medium`}>姓名</th>
                  <th className={`text-left px-6 py-3 ${styles.textSecondary} text-sm font-medium`}>邮箱</th>
                  <th className={`text-left px-6 py-3 ${styles.textSecondary} text-sm font-medium`}>角色</th>
                  <th className={`text-left px-6 py-3 ${styles.textSecondary} text-sm font-medium`}>状态</th>
                  <th className={`text-left px-6 py-3 ${styles.textSecondary} text-sm font-medium`}>创建时间</th>
                  <th className={`text-left px-6 py-3 ${styles.textSecondary} text-sm font-medium`}>操作</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-12 text-center">
                      <div className={`w-8 h-8 border-4 border-blue-500 ${styles.spinner} border-t-transparent rounded-full animate-spin mx-auto`}></div>
                    </td>
                  </tr>
                ) : filteredUsers.length === 0 ? (
                  <tr>
                    <td colSpan={7} className={`px-6 py-12 text-center ${styles.textSecondary}`}>暂无用户</td>
                  </tr>
                ) : (
                  filteredUsers.map((user) => (
                    <tr key={user.id} className={`border-t ${styles.tableRow} ${styles.tableHover}`}>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-full flex items-center justify-center">
                            <UserIcon className="w-5 h-5 text-white" />
                          </div>
                          <span className={`${styles.textPrimary} font-medium`}>{user.username}</span>
                        </div>
                      </td>
                      <td className={`px-6 py-4 ${styles.textSecondary}`}>{user.name}</td>
                      <td className={`px-6 py-4 ${styles.textSecondary} flex items-center gap-2`}>
                        <Mail className="w-4 h-4" />
                        {user.email || '-'}
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs border ${roleColors[user.role]}`}>
                          <Shield className="w-3 h-3" />
                          {roleText[user.role]}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <button
                          onClick={() => handleToggleEnable(user)}
                          className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs transition-colors ${
                            user.enabled 
                              ? 'bg-green-500/20 text-green-400 border border-green-500/30 hover:bg-green-500/30' 
                              : 'bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/30'
                          }`}
                        >
                          {user.enabled ? <Unlock className="w-3 h-3" /> : <Lock className="w-3 h-3" />}
                          {user.enabled ? '启用' : '禁用'}
                        </button>
                      </td>
                      <td className={`px-6 py-4 ${styles.textSecondary} flex items-center gap-2`}>
                        <Calendar className="w-4 h-4" />
                        {formatBeijingDate(user.created_at)}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => openEditModal(user)}
                            className={`p-2 text-blue-400 hover:text-blue-300 ${styles.hoverBg} rounded-lg transition-colors`}
                            title="编辑"
                          >
                            <Edit3 className="w-5 h-5" />
                          </button>
                          <button
                            onClick={() => handleDelete(user.id)}
                            className={`p-2 text-red-400 hover:text-red-300 ${styles.hoverBg} rounded-lg transition-colors`}
                            title="删除"
                          >
                            <Trash2 className="w-5 h-5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'logs' && (
        <div className={`${styles.bgSecondary} rounded-xl ${styles.border} overflow-hidden`}>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className={styles.tableHeader}>
                  <th className={`text-left px-6 py-3 ${styles.textSecondary} text-sm font-medium`}>操作人</th>
                  <th className={`text-left px-6 py-3 ${styles.textSecondary} text-sm font-medium`}>操作</th>
                  <th className={`text-left px-6 py-3 ${styles.textSecondary} text-sm font-medium`}>目标</th>
                  <th className={`text-left px-6 py-3 ${styles.textSecondary} text-sm font-medium`}>详情</th>
                  <th className={`text-left px-6 py-3 ${styles.textSecondary} text-sm font-medium`}>时间</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center">
                      <div className={`w-8 h-8 border-4 border-blue-500 ${styles.spinner} border-t-transparent rounded-full animate-spin mx-auto`}></div>
                    </td>
                  </tr>
                ) : filteredLogs.length === 0 ? (
                  <tr>
                    <td colSpan={5} className={`px-6 py-12 text-center ${styles.textSecondary}`}>暂无操作日志</td>
                  </tr>
                ) : (
                  filteredLogs.map((log) => (
                    <tr key={log.id} className={`border-t ${styles.tableRow} ${styles.tableHover}`}>
                      <td className={`px-6 py-4 ${styles.textPrimary} font-medium`}>{log.user_name}</td>
                      <td className={`px-6 py-4 ${styles.textSecondary}`}>{log.action}</td>
                      <td className={`px-6 py-4 ${styles.textSecondary}`}>{log.target}</td>
                      <td className={`px-6 py-4 ${styles.textSecondary} max-w-xs truncate`} title={log.detail}>
                        {log.detail}
                      </td>
                      <td className={`px-6 py-4 ${styles.textSecondary}`}>
                        {formatBeijingTime(log.created_at)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className={`${styles.bgSecondary} rounded-xl p-6 w-full max-w-lg mx-4 ${styles.border}`}>
            <div className="flex items-center justify-between mb-6">
              <h2 className={`text-xl font-bold ${styles.textPrimary}`}>添加用户</h2>
              <button
                onClick={() => setShowCreateModal(false)}
                className={styles.textSecondary}
              >
                <span className="text-2xl">&times;</span>
              </button>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className={`block ${styles.textSecondary} text-sm font-medium mb-2`}>用户名 *</label>
                <input
                  type="text"
                  value={formData.username}
                  onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                  className={`w-full px-4 py-2 ${styles.bgInput} ${styles.borderInput} rounded-lg ${styles.textPrimary} ${styles.textPlaceholder} focus:outline-none focus:ring-2 focus:ring-blue-500`}
                  placeholder="请输入用户名"
                />
              </div>
              
              <div>
                <label className={`block ${styles.textSecondary} text-sm font-medium mb-2`}>密码 *</label>
                <input
                  type="password"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  className={`w-full px-4 py-2 ${styles.bgInput} ${styles.borderInput} rounded-lg ${styles.textPrimary} ${styles.textPlaceholder} focus:outline-none focus:ring-2 focus:ring-blue-500`}
                  placeholder="请输入密码"
                />
              </div>
              
              <div>
                <label className={`block ${styles.textSecondary} text-sm font-medium mb-2`}>姓名</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className={`w-full px-4 py-2 ${styles.bgInput} ${styles.borderInput} rounded-lg ${styles.textPrimary} ${styles.textPlaceholder} focus:outline-none focus:ring-2 focus:ring-blue-500`}
                  placeholder="请输入姓名"
                />
              </div>
              
              <div>
                <label className={`block ${styles.textSecondary} text-sm font-medium mb-2`}>邮箱</label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className={`w-full px-4 py-2 ${styles.bgInput} ${styles.borderInput} rounded-lg ${styles.textPrimary} ${styles.textPlaceholder} focus:outline-none focus:ring-2 focus:ring-blue-500`}
                  placeholder="请输入邮箱"
                />
              </div>
              
              <div>
                <label className={`block ${styles.textSecondary} text-sm font-medium mb-2`}>角色</label>
                <select
                  value={formData.role}
                  onChange={(e) => setFormData({ ...formData, role: e.target.value as 'admin' | 'director' | 'member' })}
                  className={`w-full px-4 py-2 ${styles.bgInput} ${styles.borderInput} rounded-lg ${styles.textPrimary} focus:outline-none focus:ring-2 focus:ring-blue-500`}
                >
                  <option value="member">普通成员</option>
                  <option value="director">编导</option>
                  <option value="admin">管理员</option>
                </select>
              </div>
              
              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => setShowCreateModal(false)}
                  className={`flex-1 px-4 py-2 ${styles.buttonSecondary} rounded-lg transition-colors`}
                >
                  取消
                </button>
                <button
                  onClick={handleCreate}
                  className={`flex-1 px-4 py-2 ${styles.buttonPrimary} rounded-lg transition-colors`}
                >
                  保存
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showEditModal && editingUser && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className={`${styles.bgSecondary} rounded-xl p-6 w-full max-w-lg mx-4 ${styles.border}`}>
            <div className="flex items-center justify-between mb-6">
              <h2 className={`text-xl font-bold ${styles.textPrimary}`}>编辑用户</h2>
              <button
                onClick={() => { setShowEditModal(false); setEditingUser(null); }}
                className={styles.textSecondary}
              >
                <span className="text-2xl">&times;</span>
              </button>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className={`block ${styles.textSecondary} text-sm font-medium mb-2`}>用户名</label>
                <input
                  type="text"
                  value={formData.username}
                  onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                  className={`w-full px-4 py-2 ${styles.bgInput} ${styles.borderInput} rounded-lg ${styles.textPrimary} focus:outline-none focus:ring-2 focus:ring-blue-500`}
                  disabled
                />
              </div>
              
              <div>
                <label className={`block ${styles.textSecondary} text-sm font-medium mb-2`}>密码（留空则不修改）</label>
                <input
                  type="password"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  className={`w-full px-4 py-2 ${styles.bgInput} ${styles.borderInput} rounded-lg ${styles.textPrimary} ${styles.textPlaceholder} focus:outline-none focus:ring-2 focus:ring-blue-500`}
                  placeholder="留空则不修改密码"
                />
              </div>
              
              <div>
                <label className={`block ${styles.textSecondary} text-sm font-medium mb-2`}>姓名</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className={`w-full px-4 py-2 ${styles.bgInput} ${styles.borderInput} rounded-lg ${styles.textPrimary} ${styles.textPlaceholder} focus:outline-none focus:ring-2 focus:ring-blue-500`}
                />
              </div>
              
              <div>
                <label className={`block ${styles.textSecondary} text-sm font-medium mb-2`}>邮箱</label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className={`w-full px-4 py-2 ${styles.bgInput} ${styles.borderInput} rounded-lg ${styles.textPrimary} ${styles.textPlaceholder} focus:outline-none focus:ring-2 focus:ring-blue-500`}
                />
              </div>
              
              <div>
                <label className={`block ${styles.textSecondary} text-sm font-medium mb-2`}>角色</label>
                <select
                  value={formData.role}
                  onChange={(e) => setFormData({ ...formData, role: e.target.value as 'admin' | 'director' | 'member' })}
                  className={`w-full px-4 py-2 ${styles.bgInput} ${styles.borderInput} rounded-lg ${styles.textPrimary} focus:outline-none focus:ring-2 focus:ring-blue-500`}
                >
                  <option value="member">普通成员</option>
                  <option value="director">编导</option>
                  <option value="admin">管理员</option>
                </select>
              </div>
              
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id="enabled"
                  checked={formData.enabled}
                  onChange={(e) => setFormData({ ...formData, enabled: e.target.checked })}
                  className={`w-5 h-5 rounded ${styles.borderInput} ${styles.bgInput} text-blue-600 focus:ring-blue-500`}
                />
                <label htmlFor="enabled" className={styles.textSecondary}>启用用户</label>
              </div>
              
              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => { setShowEditModal(false); setEditingUser(null); }}
                  className={`flex-1 px-4 py-2 ${styles.buttonSecondary} rounded-lg transition-colors`}
                >
                  取消
                </button>
                <button
                  onClick={handleEdit}
                  className={`flex-1 px-4 py-2 ${styles.buttonPrimary} rounded-lg transition-colors`}
                >
                  保存
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}