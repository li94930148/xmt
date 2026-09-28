type WorkflowStatusKind = 'shooting' | 'publishing';

const WORKFLOW_STATUS_LABELS: Record<WorkflowStatusKind, Record<string, string>> = {
  shooting: {
    planned: '计划中',
    pending: '计划中',
    in_progress: '制作中',
    completed: '已完成',
    cancelled: '已取消',
  },
  publishing: {
    pending: '待发布',
    published: '已发布',
    failed: '发布异常',
    scheduled: '已定时',
  },
};

export function getWorkflowStatusLabel(kind: WorkflowStatusKind, status: string | null | undefined): string {
  if (!status) return '状态待确认';
  return Object.prototype.hasOwnProperty.call(WORKFLOW_STATUS_LABELS[kind], status)
    ? WORKFLOW_STATUS_LABELS[kind][status]
    : '状态待确认';
}

export function isKnownWorkflowStatus(kind: WorkflowStatusKind, status: string | null | undefined): boolean {
  return Boolean(status && Object.prototype.hasOwnProperty.call(WORKFLOW_STATUS_LABELS[kind], status));
}
