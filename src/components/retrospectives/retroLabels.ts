import type {
  RetroActionStatus,
  RetroTemplateCategory,
  RetrospectiveScopeType,
  RetrospectiveStatus,
} from '../../api/retrospectives';

export const retroCategoryLabels: Record<RetroTemplateCategory, string> = {
  weekly: '周复盘',
  project: '项目复盘',
  channel: '渠道复盘',
  topic: '选题复盘',
  daily: '日报复盘',
  custom: '自定义',
};

export const retroScopeLabels: Record<RetrospectiveScopeType, string> = {
  team: '团队',
  project: '项目',
  topic: '选题',
  channel: '渠道',
  user: '成员',
  daily_report: '日报',
  custom: '自定义',
};

export const retroStatusLabels: Record<RetrospectiveStatus, string> = {
  draft: '草稿',
  published: '已发布',
  archived: '已归档',
};

export const retroActionStatusLabels: Record<RetroActionStatus, string> = {
  todo: '待处理',
  doing: '进行中',
  done: '已完成',
  cancelled: '已取消',
};

export const metricCopy: Record<string, { label: string; group: string; description: string }> = {
  topics_count: { label: '选题数量', group: '内容生产', description: '周期内新建选题数量' },
  production_count: { label: '创作数量', group: '内容生产', description: '周期内进入创作管理的记录数量' },
  publishing_count: { label: '发布数量', group: '内容生产', description: '周期内发布管理记录数量' },
  daily_reports_submitted_count: { label: '日报提交数', group: '团队执行', description: '周期内已提交日报数量' },
  daily_reports_reviewed_count: { label: '日报已审核数', group: '团队执行', description: '周期内已审核日报数量' },
  daily_reports_rejected_count: { label: '日报退回数', group: '团队执行', description: '周期内被退回日报数量' },
  daily_reports_risk_count: { label: '日报风险数', group: '风险闭环', description: '周期内包含风险等级的日报数量' },
  daily_report_risk_section_nonempty: { label: '风险分段非空数', group: '风险闭环', description: '风险/阻塞分段填写过内容的日报数量' },
  daily_report_tomorrow_section_nonempty: { label: '明日计划非空数', group: '风险闭环', description: '明日计划分段填写过内容的日报数量' },
  retro_actions_count: { label: '行动项数量', group: '行动项', description: '周期内复盘行动项总数' },
  retro_actions_done_count: { label: '行动项完成数', group: '行动项', description: '周期内已完成行动项数量' },
};

export function formatDate(value?: string | null) {
  if (!value) return '-';
  return value.slice(0, 10);
}

export function formatDateTime(value?: string | null) {
  if (!value) return '-';
  return value.replace('T', ' ').slice(0, 16);
}

export function toFriendlyRetroError(error: unknown) {
  const err = error as Error & { status?: number; code?: string };
  if (err.status === 401) return '登录已失效，请重新登录';
  if (err.status === 403) return '当前账号没有执行此操作的权限';
  if (err.status === 404) return '复盘记录不存在或已不可访问';
  if (err.status === 409 || err.code === 'VERSION_CONFLICT') return '复盘已被更新，请刷新后再编辑';
  if (err.status === 400) return err.message || '请求参数不正确';
  return err.message || '服务暂时不可用，请稍后重试';
}
