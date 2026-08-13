import type { Message } from '@/types';

export type MobileMessageCategory = 'workflow' | 'collaboration' | 'system';

const collaborationTerms = /(协作|评论|批注|共同编辑|在线编辑|collaborat|comment)/i;
const workflowTerms = /(选题|日报|审核|状态|发布|拍摄|任务|流程|workflow|review)/i;

/**
 * Existing messages store a severity in `type`, not a business category. Keep
 * that contract intact and derive the mobile inbox grouping from the route and
 * visible business text so old records remain correctly usable.
 */
export function getMobileMessageCategory(message: Pick<Message, 'title' | 'content' | 'link'>): MobileMessageCategory {
  const text = `${message.title}\n${message.content}`;
  const link = message.link ?? '';
  if (/^\/(?:production|collaboration)(?:\/|$)/.test(link) || collaborationTerms.test(text)) return 'collaboration';
  if (/^\/(?:topics|production|shooting|publishing|daily-report|workflow)(?:\/|$)/.test(link) || workflowTerms.test(text)) return 'workflow';
  return 'system';
}
