import { Server } from 'socket.io';

let ioInstance: Server | null = null;

export const PUBLIC_SOCKET_ROOMS = new Set([
  'topics',
  'inspirations',
  'production',
  'shooting',
  'publishing',
]);

export const ADMIN_SOCKET_ROOM = 'admin_channel';

export function setSocketIO(io: Server) {
  ioInstance = io;
}

export function getSocketIO(): Server | null {
  return ioInstance;
}

/**
 * 向指定用户推送实时通知
 */
export function notifyUser(userId: number, event: string, data: unknown) {
  if (!ioInstance) return;
  try {
    ioInstance.to(`user_${userId}`).emit(event, data);
  } catch (err) {
    console.warn('[Socket] 推送失败:', err);
  }
}

/**
 * 消息创建时推送给目标用户
 */
export function pushMessage(userId: number, message: { id: number; title: string; content: string; type: string; link?: string | null }) {
  notifyUser(userId, 'new_message', message);
  // 同时发送未读消息数更新事件
  notifyUser(userId, 'unread_count', {});
}

// ========== 实时协作：房间广播 ==========

/**
 * 向房间内所有客户端广播事件
 * @param room 房间名（如 'inspirations', 'topics'）
 * @param event 事件名（如 'inspiration:voted'）
 * @param data 数据
 * @param excludeSocketId 排除某个 socket（通常是操作者本人，前端已乐观更新）
 */
export function broadcastToRoom(room: string, event: string, data: unknown, excludeSocketId?: string) {
  if (!ioInstance) {
    console.warn('[Socket] broadcastToRoom: ioInstance is null');
    return;
  }
  try {
    const roomSize = ioInstance.sockets.adapter.rooms.get(room)?.size ?? 0;
    console.log(`[Socket] broadcastToRoom: room=${room}, event=${event}, roomSize=${roomSize}, exclude=${excludeSocketId ?? 'none'}`);
    if (excludeSocketId) {
      ioInstance.to(room).except(excludeSocketId).emit(event, data);
    } else {
      ioInstance.to(room).emit(event, data);
    }
  } catch (err) {
    console.warn('[Socket] 广播失败:', err);
  }
}
