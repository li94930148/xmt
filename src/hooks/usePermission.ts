import { useCallback, useEffect, useState } from 'react';
import { useAuthStore } from '../store';
import { emitClientLog, safeClientErrorClass } from '../observability/client-logger';

const EMPTY_PERMISSIONS: string[] = [];
const ADMIN_PERMISSIONS = ['*'];

export function usePermission() {
  const userId = useAuthStore((state) => state.user?.id);
  const role = useAuthStore((state) => state.user?.role);
  const token = useAuthStore((state) => state.token);
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState<{
    userId: typeof userId; role: typeof role; token: typeof token; revision: number; permissions: string[];
  } | null>(null);
  const current = result?.userId === userId && result?.role === role && result?.token === token && result?.revision === revision;
  const loading = Boolean(userId && role !== 'admin' && !current);
  const permissions = !userId ? EMPTY_PERMISSIONS : role === 'admin' ? ADMIN_PERMISSIONS : current ? result.permissions : EMPTY_PERMISSIONS;

  useEffect(() => {
    if (!userId || role === 'admin') return;
    const controller = new AbortController();
    const isCurrent = () => {
      const auth = useAuthStore.getState();
      return !controller.signal.aborted && auth.user?.id === userId && auth.user?.role === role && auth.token === token;
    };
    void (async () => {
      let codes: string[] = [];
      try {
        const response = await fetch('/api/permissions/my', {
          signal: controller.signal,
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (response.ok) {
          const data: unknown = await response.json();
          if (Array.isArray(data)) codes = data.filter((code): code is string => typeof code === 'string');
        }
      } catch (error) {
        if (isCurrent()) emitClientLog({ event: 'permissions.load_failed', level: 'error', fields: { errorClass: safeClientErrorClass(error) } });
      } finally {
        if (isCurrent()) setResult({ userId, role, token, revision, permissions: codes });
      }
    })();
    return () => controller.abort();
  }, [userId, role, token, revision]);

  const hasPermission = (code: string): boolean => {
    if (!userId || loading) return false;
    if (role === 'admin') return true;
    return permissions.includes(code) || permissions.includes('*');
  };

  const hasAnyPermission = (codes: string[]): boolean => {
    if (!userId || loading) return false;
    if (role === 'admin') return true;
    return codes.some((code) => permissions.includes(code));
  };

  const hasAllPermissions = (codes: string[]): boolean => {
    if (!userId || loading) return false;
    if (role === 'admin') return true;
    return codes.every((code) => permissions.includes(code));
  };

  const refreshPermissions = useCallback(() => setRevision((value) => value + 1), []);

  return {
    permissions,
    loading,
    hasPermission,
    hasAnyPermission,
    hasAllPermissions,
    refreshPermissions,
  };
}
