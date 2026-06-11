import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAppStore } from '../store';

/**
 * 通用 API 查询 Hook
 * @param queryKey 查询键
 * @param queryFn 查询函数
 * @param options 额外选项
 */
export function useApiQuery<T>(
  queryKey: string[],
  queryFn: () => Promise<T>,
  options?: {
    enabled?: boolean;
    staleTime?: number;
  }
) {
  return useQuery({
    queryKey,
    queryFn,
    ...options,
  });
}

/**
 * 通用 API Mutation Hook
 * @param mutationFn 变更函数
 * @param queryKeyToInvalidate 需要失效的查询键
 * @param successMessage 成功消息
 */
export function useApiMutation<T, V>(
  mutationFn: (variables: V) => Promise<T>,
  queryKeyToInvalidate?: string[],
  successMessage?: { title: string; message: string }
) {
  const queryClient = useQueryClient();
  const appStore = useAppStore();

  return useMutation({
    mutationFn,
    onSuccess: () => {
      if (queryKeyToInvalidate) {
        queryClient.invalidateQueries({ queryKey: queryKeyToInvalidate });
      }
      if (successMessage) {
        appStore.addNotification({ ...successMessage, type: 'success' });
      }
    },
    onError: (error: Error) => {
      appStore.addNotification({ title: '操作失败', message: error.message, type: 'error' });
    },
  });
}
