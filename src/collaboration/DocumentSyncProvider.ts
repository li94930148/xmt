/**
 * 文档同步提供者（预留接口）
 * 后续接入 Y.js / Socket.IO 实时协作时实现
 */
import type { CollaborationDocument, CollaborationUser, CollaborationState } from './types';

export interface DocumentSyncProvider {
  /** 连接到协作服务 */
  connect(documentId: string): Promise<void>;

  /** 断开连接 */
  disconnect(): void;

  /** 获取当前文档状态 */
  getState(): CollaborationState;

  /** 发送本地变更 */
  sendUpdate(content: string): void;

  /** 订阅远程变更 */
  onUpdate(callback: (doc: CollaborationDocument) => void): () => void;

  /** 订阅用户列表变化 */
  onUsersChange(callback: (users: CollaborationUser[]) => void): () => void;

  /** 获取当前在线用户 */
  getOnlineUsers(): CollaborationUser[];
}

/**
 * 创建文档同步提供者实例（占位实现）
 * TODO: 后续接入 Y.js + Socket.IO
 */
export function createDocumentSyncProvider(): DocumentSyncProvider {
  return {
    async connect() { /* placeholder */ },
    disconnect() { /* placeholder */ },
    getState() {
      return { document: null, users: [], connected: false, version: 0 };
    },
    sendUpdate() { /* placeholder */ },
    onUpdate() { return () => {}; },
    onUsersChange() { return () => {}; },
    getOnlineUsers() { return []; },
  };
}
