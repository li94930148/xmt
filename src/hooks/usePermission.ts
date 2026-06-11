import { useState, useEffect } from 'react';
import { useAuthStore } from '../store';

/**
 * 权限管理 Hook
 * 提供权限检查和权限列表
 */
export function usePermission() {
  const user = useAuthStore((state) => state.user);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setPermissions([]);
      setLoading(false);
      return;
    }

    // admin 角色拥有所有权限，无需请求
    if (user.role === 'admin') {
      setPermissions(['*']); // 通配符表示所有权限
      setLoading(false);
      return;
    }

    fetchPermissions();
  }, [user]);

  const fetchPermissions = async () => {
    try {
      const token = useAuthStore.getState().token;
      const response = await fetch('/api/permissions/my', {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (response.ok) {
        const data = await response.json();
        setPermissions(data);
      }
    } catch (error) {
      console.error('获取权限列表失败:', error);
    } finally {
      setLoading(false);
    }
  };

  /**
   * 检查是否拥有指定权限
   * @param code 权限编码，如 'topic:create'
   * @returns boolean
   */
  const hasPermission = (code: string): boolean => {
    if (!user) return false;
    if (user.role === 'admin') return true; // admin 拥有所有权限
    return permissions.includes(code) || permissions.includes('*');
  };

  /**
   * 检查是否拥有任意一个权限
   * @param codes 权限编码列表
   * @returns boolean
   */
  const hasAnyPermission = (codes: string[]): boolean => {
    if (!user) return false;
    if (user.role === 'admin') return true;
    return codes.some(code => permissions.includes(code));
  };

  /**
   * 检查是否拥有所有权限
   * @param codes 权限编码列表
   * @returns boolean
   */
  const hasAllPermissions = (codes: string[]): boolean => {
    if (!user) return false;
    if (user.role === 'admin') return true;
    return codes.every(code => permissions.includes(code));
  };

  /**
   * 刷新权限列表
   */
  const refreshPermissions = () => {
    setLoading(true);
    fetchPermissions();
  };

  return {
    permissions,
    loading,
    hasPermission,
    hasAnyPermission,
    hasAllPermissions,
    refreshPermissions,
    isAdmin: user?.role === 'admin',
    isDirector: user?.role === 'director',
  };
}
