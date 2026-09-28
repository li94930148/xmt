export interface BatchMutationNotice {
  title: string;
  message: string;
  type: 'success' | 'warning' | 'error';
  failedIds: number[];
}

export function createBatchMutationNotice({
  action,
  selectedIds,
  failedIds,
  status,
  firstError,
}: {
  action: 'audit' | 'delete';
  selectedIds: number[];
  failedIds: number[];
  status?: 'approved' | 'rejected';
  firstError?: string;
}): BatchMutationNotice {
  const failedIdSet = new Set(failedIds);
  const retainedIds = selectedIds.filter((id) => failedIdSet.has(id));
  const failedCount = retainedIds.length;
  const successCount = selectedIds.length - failedCount;
  const actionLabel = action === 'audit' ? '批量审核' : '批量删除';
  const successDescription = action === 'delete'
    ? `已删除 ${successCount} 个选题`
    : `${status === 'rejected' ? '已驳回' : '已通过'} ${successCount} 个选题`;
  const normalizedError = firstError?.replace(/\s+/g, ' ').trim().slice(0, 120);
  const retryDescription = `失败的 ${failedCount} 个选题已保留选择，可重试。`;
  const errorDescription = normalizedError ? `首个失败原因：${normalizedError}` : '';

  if (failedCount === 0) {
    return {
      title: `${actionLabel}成功`,
      message: `${successDescription}。`,
      type: 'success',
      failedIds: [],
    };
  }

  if (successCount === 0) {
    return {
      title: `${actionLabel}失败`,
      message: `选中的 ${selectedIds.length} 个选题均未成功。${retryDescription}${errorDescription}`,
      type: 'error',
      failedIds: retainedIds,
    };
  }

  return {
    title: `${actionLabel}部分完成`,
    message: `${successDescription}，${failedCount} 个失败。${retryDescription}${errorDescription}`,
    type: 'warning',
    failedIds: retainedIds,
  };
}
