/**
 * 协作相关类型定义（预留接口）
 * 后续实现实时协作功能时使用
 */

export interface CollaborationUser {
  id: number;
  name: string;
  color: string;
  cursor?: CursorPosition;
}

export interface CursorPosition {
  from: number;
  to: number;
}

export interface CollaborationDocument {
  id: string;
  type: 'production' | 'outline';
  referenceId: number;
  version: number;
  content: string;
  lastModified: Date;
  lastModifiedBy: number;
}

export interface CollaborationEvent {
  type: 'join' | 'leave' | 'update' | 'cursor';
  userId: number;
  documentId: string;
  timestamp: Date;
  payload?: unknown;
}

export interface CollaborationState {
  document: CollaborationDocument | null;
  users: CollaborationUser[];
  connected: boolean;
  version: number;
}
