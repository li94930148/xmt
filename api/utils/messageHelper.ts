import { beijingNow, execute } from '../database/utils';
import { pushMessage } from './socket';

/**
 * 创建消息并推送实时通知
 */
export function createMessage(
  userId: number,
  title: string,
  content: string,
  type: 'info' | 'success' | 'warning' | 'error' = 'info',
  link?: string
) {
  // 确保 link 为有效字符串，undefined/null 不写入
  const safeLink = link || null;
  
  execute(
    `INSERT INTO messages (user_id, title, content, type, link, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
    [userId, title, content, type, safeLink, beijingNow()]
  );
  
  // 推送实时通知（包含 link）
  pushMessage(userId, {
    id: Date.now(), // 临时 ID，前端会重新查询
    title,
    content,
    type,
    link: safeLink
  });
}
