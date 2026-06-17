import { beijingNow, execute } from '../database/utils';
import { pushMessage } from './socket';

/**
 * 创建消息并推送实时通知。
 * 消息写入失败时只记录日志，避免影响主业务流程。
 */
export function createMessage(
  userId: number,
  title: string,
  content: string,
  type: 'info' | 'success' | 'warning' | 'error' = 'info',
  link?: string
) {
  const safeLink = link || null;

  void execute(
    `INSERT INTO messages (user_id, title, content, type, link, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
    [userId, title, content, type, safeLink, beijingNow()]
  )
    .then(() => {
      pushMessage(userId, {
        id: Date.now(),
        title,
        content,
        type,
        link: safeLink,
      });
    })
    .catch((error) => {
      console.warn('[Message] 创建消息失败:', error);
    });
}
