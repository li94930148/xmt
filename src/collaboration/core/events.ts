export const COLLABORATION_EVENTS = {
  JOIN: 'collaboration:join',
  LEAVE: 'collaboration:leave',
  HEARTBEAT: 'collaboration:heartbeat',
  USERS: 'collaboration:users',
  USER_JOINED: 'collaboration:user-joined',
  USER_LEFT: 'collaboration:user-left',
  TYPING: 'collaboration:typing',
  SYNC: 'collaboration:sync',
  UPDATE: 'collaboration:update',
  AWARENESS_UPDATE: 'collaboration:awareness-update',
  REHYDRATE: 'collaboration:rehydrate',
  SNAPSHOT_CREATED: 'collaboration:snapshot-created',
  DOC_LOCKED: 'collaboration:doc-locked',
  DOC_UNLOCKED: 'collaboration:doc-unlocked',
  CONFLICT_DETECTED: 'collaboration:conflict-detected',
} as const;

export type CollaborationDocType = 'production' | 'shooting';

export interface CollaborationUserPresence {
  id: number;
  name: string;
  role?: string;
  color: string;
  socketId?: string;
  lastSeen?: number;
  typing?: boolean;
}

export interface CollaborationRoomPayload {
  roomId: string;
  user: CollaborationUserPresence;
}

export interface CollaborationUpdatePayload {
  roomId: string;
  update: number[];
}

export interface CollaborationTypingPayload {
  roomId: string;
  userId: number;
  typing: boolean;
}

export function getCollaborationRoomId(type: CollaborationDocType, id: number | string) {
  return `${type}:${id}`;
}
