import type { TopicStatus } from '@shared/types';

/**
 * 选题状态机 - 定义合法的状态转换
 * 
 * 流程图：
 * pending → approved (审核通过)
 * pending → rejected (审核驳回)
 * rejected → pending (重新提交)
 * approved → production (进入创作)
 * production → shooting (进入拍摄)
 * shooting → publishing (进入发布)
 * publishing → completed (完成)
 */

// 合法的状态转换映射
const VALID_TRANSITIONS: Record<TopicStatus, TopicStatus[]> = {
  pending:    ['approved', 'rejected'],
  approved:   ['production'],
  rejected:   ['pending'],  // 驳回后可重新提交
  production: ['shooting'],
  shooting:   ['publishing'],
  publishing: ['completed'],
  completed:  [],  // 终态
};

// 状态中文名
export const STATUS_TEXT: Record<TopicStatus, string> = {
  pending: '待审核',
  approved: '已通过',
  rejected: '已驳回',
  production: '创作中',
  shooting: '拍摄中',
  publishing: '发布中',
  completed: '已完成',
};

// 审核操作
export type AuditAction = 'approved' | 'rejected';

/**
 * 检查状态转换是否合法
 */
export function isValidTransition(from: TopicStatus, to: TopicStatus): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}

/**
 * 获取某个状态可以转换到的目标状态列表
 */
export function getNextStatuses(current: TopicStatus): TopicStatus[] {
  return VALID_TRANSITIONS[current] || [];
}

/**
 * 获取状态转换的中文描述
 */
export function getTransitionText(from: TopicStatus, to: TopicStatus): string {
  if (to === 'approved') return '审核通过';
  if (to === 'rejected') return '审核驳回';
  if (from === 'rejected' && to === 'pending') return '重新提交';
  return `状态变更为${STATUS_TEXT[to]}`;
}

/**
 * 检查审核操作是否合法（当前状态必须是 pending 或 rejected）
 */
export function isValidAuditAction(currentStatus: TopicStatus, action: AuditAction): boolean {
  if (action === 'approved') return currentStatus === 'pending';
  if (action === 'rejected') return currentStatus === 'pending';
  return false;
}
