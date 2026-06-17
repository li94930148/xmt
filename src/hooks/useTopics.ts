import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getTopics, createTopic, deleteTopic, auditTopic } from '../api';
import { useAppStore } from '../store';

// 选题列表查询 Hook
export function useTopics(params: {
  status?: string;
  search?: string;
  page?: number;
  limit?: number;
}) {
  return useQuery({
    queryKey: ['topics', params],
    queryFn: () => getTopics(params),
  });
}

// 创建选题 mutation
export function useCreateTopic() {
  const queryClient = useQueryClient();
  const appStore = useAppStore();

  return useMutation({
    mutationFn: createTopic,
    onSuccess: () => {
      // 使选题列表缓存失效，触发重新获取
      queryClient.invalidateQueries({ queryKey: ['topics'] });
      appStore.addNotification({ title: '创建成功', message: '选题已提交审核', type: 'success' });
    },
    onError: (error: Error) => {
      appStore.addNotification({ title: '创建失败', message: error.message, type: 'error' });
    },
  });
}

// 删除选题 mutation
export function useDeleteTopic() {
  const queryClient = useQueryClient();
  const appStore = useAppStore();

  return useMutation({
    mutationFn: deleteTopic,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['topics'] });
      appStore.addNotification({ title: '删除成功', message: '选题已删除', type: 'success' });
    },
    onError: (error: Error) => {
      appStore.addNotification({ title: '删除失败', message: error.message, type: 'error' });
    },
  });
}

// 审核选题 mutation
export function useAuditTopic() {
  const queryClient = useQueryClient();
  const appStore = useAppStore();

  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: { status: 'approved' | 'rejected'; comment: string; assignee_id?: number } }) =>
      auditTopic(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['topics'] });
    },
    onError: (error: Error) => {
      appStore.addNotification({ title: '审核失败', message: error.message, type: 'error' });
    },
  });
}
