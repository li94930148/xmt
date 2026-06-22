import type { Server, Socket } from 'socket.io';
import {
  COLLABORATION_EVENTS,
  type CollaborationRoomPayload,
  type CollaborationTypingPayload,
  type CollaborationUpdatePayload,
  type CollaborationUserPresence,
} from '../../../src/collaboration/core/events.js';
import {
  applyRuntimeDocumentUpdate,
  getRuntimeDocumentState,
  touchRuntimeDocument,
} from '../yjs/documentStore.js';
import { logCollaborationEvent } from '../analytics/collaborationLogger.js';
import { canEdit, getDocLock, isReadOnly, releaseLock, setDocLocked } from '../control/collaborationGuard.js';

type RuntimeUser = CollaborationUserPresence & {
  socketId: string;
  lastSeen: number;
  typing?: boolean;
};

const rooms = new Map<string, Map<string, RuntimeUser>>();

function getRoomUsers(roomId: string) {
  let users = rooms.get(roomId);
  if (!users) {
    users = new Map<string, RuntimeUser>();
    rooms.set(roomId, users);
  }
  return users;
}

export function getRoomUsersSnapshot(roomId: string) {
  return publicUsers(roomId);
}

function publicUsers(roomId: string) {
  return Array.from(getRoomUsers(roomId).values()).map((user) => ({
    id: user.id,
    name: user.name,
    role: user.role,
    color: user.color,
    socketId: user.socketId,
    lastSeen: user.lastSeen,
    typing: Boolean(user.typing),
  }));
}

export function broadcastUserList(io: Server, roomId: string) {
  io.to(roomId).emit(COLLABORATION_EVENTS.USERS, {
    roomId,
    users: publicUsers(roomId),
  });
}

export function joinRoom(io: Server, socket: Socket, payload: CollaborationRoomPayload) {
  const roomId = String(payload?.roomId || '');
  if (!roomId || !payload?.user?.id) return;

  const user: RuntimeUser = {
    ...payload.user,
    socketId: socket.id,
    lastSeen: Date.now(),
    typing: false,
  };

  socket.join(roomId);
  getRoomUsers(roomId).set(socket.id, user);
  logCollaborationEvent({
    type: 'join',
    docId: roomId,
    userId: String(user.id),
    metadata: { socketId: socket.id, role: user.role },
  });
  socket.data.collaborationRooms = new Set([
    ...Array.from((socket.data.collaborationRooms as Set<string> | undefined) || []),
    roomId,
  ]);

  socket.emit(COLLABORATION_EVENTS.SYNC, {
    roomId,
    update: getRuntimeDocumentState(roomId),
  });
  const lock = getDocLock(roomId);
  if (lock) {
    socket.emit(COLLABORATION_EVENTS.DOC_LOCKED, lock);
  }
  socket.to(roomId).emit(COLLABORATION_EVENTS.USER_JOINED, { roomId, user });
  broadcastUserList(io, roomId);
}

export function leaveRoom(io: Server, socket: Socket, roomId: string) {
  if (!roomId) return;

  const users = rooms.get(roomId);
  const user = users?.get(socket.id);

  socket.leave(roomId);
  users?.delete(socket.id);

  if (user) {
    logCollaborationEvent({
      type: 'leave',
      docId: roomId,
      userId: String(user.id),
      metadata: { socketId: socket.id },
    });
    socket.to(roomId).emit(COLLABORATION_EVENTS.USER_LEFT, { roomId, user });
  }

  if (!users || users.size === 0) {
    rooms.delete(roomId);
    touchRuntimeDocument(roomId);
    return;
  }

  broadcastUserList(io, roomId);
}

export function heartbeat(io: Server, socket: Socket, roomId: string) {
  const user = rooms.get(roomId)?.get(socket.id);
  if (!user) return;
  user.lastSeen = Date.now();
  broadcastUserList(io, roomId);
}

export function handleDocumentUpdate(io: Server, socket: Socket, payload: CollaborationUpdatePayload) {
  const roomId = String(payload?.roomId || '');
  if (!roomId || !Array.isArray(payload?.update)) return;
  const socketUser = socket.data.user as { id?: number | string } | undefined;
  const userId = String(socketUser?.id ?? 'unknown');

  if (!canEdit(userId, roomId)) {
    const lock = getDocLock(roomId);
    const conflictPayload = {
      roomId,
      userId,
      reason: lock?.reason || 'Document is read-only',
      timestamp: Date.now(),
    };
    logCollaborationEvent({
      type: 'conflict',
      docId: roomId,
      userId,
      metadata: conflictPayload,
    });
    socket.emit(COLLABORATION_EVENTS.CONFLICT_DETECTED, conflictPayload);
    io.to(roomId).emit(COLLABORATION_EVENTS.DOC_LOCKED, lock || { docId: roomId, reason: 'Document is read-only' });
    return;
  }

  const version = applyRuntimeDocumentUpdate(roomId, payload.update, { userId });
  socket.to(roomId).emit(COLLABORATION_EVENTS.UPDATE, { ...payload, version });
}

export function handleAwarenessUpdate(socket: Socket, payload: CollaborationUpdatePayload) {
  const roomId = String(payload?.roomId || '');
  if (!roomId || !Array.isArray(payload?.update)) return;
  socket.to(roomId).emit(COLLABORATION_EVENTS.AWARENESS_UPDATE, payload);
}

export function handleTyping(io: Server, socket: Socket, payload: CollaborationTypingPayload) {
  const roomId = String(payload?.roomId || '');
  const user = rooms.get(roomId)?.get(socket.id);
  if (!roomId || !user) return;
  if (isReadOnly(roomId)) return;

  user.typing = Boolean(payload.typing);
  user.lastSeen = Date.now();
  if (payload.typing) {
    logCollaborationEvent({
      type: 'typing',
      docId: roomId,
      userId: String(user.id),
      metadata: { socketId: socket.id },
    });
  }
  socket.to(roomId).emit(COLLABORATION_EVENTS.TYPING, payload);
  broadcastUserList(io, roomId);
}

export function lockRoom(io: Server, roomId: string, reason?: string, userId = 'system') {
  const lock = setDocLocked(roomId, reason, userId);
  io.to(roomId).emit(COLLABORATION_EVENTS.DOC_LOCKED, lock);
  return lock;
}

export function unlockRoom(io: Server, roomId: string, userId = 'system') {
  const released = releaseLock(roomId, userId);
  if (released) {
    io.to(roomId).emit(COLLABORATION_EVENTS.DOC_UNLOCKED, { roomId, timestamp: Date.now() });
  }
  return released;
}

export function leaveAllRooms(io: Server, socket: Socket) {
  const joined = socket.data.collaborationRooms as Set<string> | undefined;
  if (!joined) return;

  for (const roomId of joined) {
    leaveRoom(io, socket, roomId);
  }
  joined.clear();
}
