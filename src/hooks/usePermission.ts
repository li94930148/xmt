import { useEffect, useState } from 'react';
import { useAuthStore } from '../store';

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

    if (user.role === 'admin') {
      setPermissions(['*']);
      setLoading(false);
      return;
    }

    void fetchPermissions();
  }, [user]);

  const fetchPermissions = async () => {
    try {
      const token = useAuthStore.getState().token;
      const response = await fetch('/api/permissions/my', {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.ok) {
        const data = await response.json();
        setPermissions(data);
      }
    } catch (error) {
      console.error('Failed to load permissions:', error);
    } finally {
      setLoading(false);
    }
  };

  const hasPermission = (code: string): boolean => {
    if (!user) return false;
    if (user.role === 'admin') return true;
    return permissions.includes(code) || permissions.includes('*');
  };

  const hasAnyPermission = (codes: string[]): boolean => {
    if (!user) return false;
    if (user.role === 'admin') return true;
    return codes.some((code) => permissions.includes(code));
  };

  const hasAllPermissions = (codes: string[]): boolean => {
    if (!user) return false;
    if (user.role === 'admin') return true;
    return codes.every((code) => permissions.includes(code));
  };

  const refreshPermissions = () => {
    setLoading(true);
    void fetchPermissions();
  };

  return {
    permissions,
    loading,
    hasPermission,
    hasAnyPermission,
    hasAllPermissions,
    refreshPermissions,
  };
}
