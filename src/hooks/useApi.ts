import { useState, useCallback } from 'react';
import { useAppStore } from '../store';

interface UseApiOptions {
  successMessage?: string;
  errorMessage?: string;
  showSuccess?: boolean;
  showError?: boolean;
}

/**
 * 统一的 API 调用 Hook
 * 封装 loading 状态、错误处理、通知
 */
export function useApi<T extends (...args: any[]) => Promise<any>>(
  apiFn: T,
  options: UseApiOptions = {}
) {
  const {
    successMessage,
    errorMessage = '操作失败',
    showSuccess = false,
    showError = true,
  } = options;

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<Awaited<ReturnType<T>> | null>(null);
  const addNotification = useAppStore((s) => s.addNotification);

  const execute = useCallback(
    async (...args: Parameters<T>): Promise<Awaited<ReturnType<T>> | null> => {
      setLoading(true);
      setError(null);
      try {
        const result = await apiFn(...args);
        setData(result);
        if (showSuccess && successMessage) {
          addNotification({ title: '成功', message: successMessage, type: 'success' });
        }
        return result;
      } catch (err) {
        const msg = (err as Error).message || errorMessage;
        setError(msg);
        if (showError) {
          addNotification({ title: '错误', message: msg, type: 'error' });
        }
        return null;
      } finally {
        setLoading(false);
      }
    },
    [apiFn, successMessage, errorMessage, showSuccess, showError, addNotification]
  );

  return { loading, error, data, execute, setData };
}

/**
 * 统一的 API 响应解包
 * 后端返回 { data: ... } 格式时自动解包
 */
export function unwrapData<T>(response: any): T {
  if (response && typeof response === 'object' && 'data' in response) {
    return response.data as T;
  }
  return response as T;
}
