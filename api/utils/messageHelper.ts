import { beijingNow, executeInsert } from '../database/utils';
import { pushMessage } from './socket';
import { apiLogger } from '../observability/logger.js';

/**
 * 创建消息并推送实时通知。
 * 消息写入失败时只记录日志，避免影响主业务流程。
 */
export async function createMessage(
  userId: number,
  title: string,
  content: string,
  type: 'info' | 'success' | 'warning' | 'error' = 'info',
  link?: string
): Promise<number | null> {
  const safeLink = link || null;
  try {
    const messageId = await executeInsert(
      `INSERT INTO messages (user_id, title, content, type, link, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
      [userId, title, content, type, safeLink, beijingNow()],
    );
    pushMessage(userId, {
      id: messageId,
      title,
      content,
      type,
      link: safeLink,
    });
    return messageId;
  } catch (error) {
    apiLogger.warn({
      module: 'messages',
      operation: 'message.create_failed',
      error: { code: 'MESSAGE_CREATE_FAILED', name: error instanceof Error ? error.name : 'UnknownError' },
    }, 'api.messages.create_failed');
    return null;
  }
}
