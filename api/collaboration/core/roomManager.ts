import type { Server, Socket } from 'socket.io';
import {
  COLLABORATION_EVENTS,
  type CollaborationRoomPayload,
  type CollaborationTypingPayload,
  type CollaborationUpdateAcknowledgement,
  type CollaborationUpdatePayload,
  type CollaborationUserPresence,
} from '../../../src/collaboration/core/events.js';
import {
  applyRuntimeDocumentUpdate,
  getRuntimeDocumentState,
  isValidCollaborationUpdate,
  refreshRuntimeDocument,
  RuntimeDocumentContentionError,
  RuntimeDocumentLockedError,
  RuntimeDocumentPersistenceError,
  RuntimeDocumentTooLargeError,
  touchRuntimeDocument,
} from '../yjs/documentStore.js';
import { getCollaborationCoordinationMode, isCollaborationCoordinationReady } from '../coordination/socketAdapter.js';
import { logCollaborationEvent } from '../analytics/collaborationLogger.js';
import { getDocLock, isReadOnly, releaseLock, setDocLocked } from '../control/collaborationGuard.js';
import { collaborationAccessPolicy } from '../access/CollaborationAccessPolicy.js';
import type { User } from '../../types/index.js';
import { apiLogger } from '../../observability/logger.js';

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

export async function broadcastUserList(io: Server, roomId: string) {
  try {
    const sockets = await io.in(roomId).fetchSockets();
    const users = sockets.flatMap((socket) => {
      const presence = socket.data.collaborationPresence as CollaborationUserPresence | undefined;
      return presence ? [{ ...presence, socketId: socket.id }] : [];
    });
    io.to(roomId).emit(COLLABORATION_EVENTS.USERS, { roomId, users });
  } catch {
    // Do not publish a misleading partial member list when the cross-instance
    // adapter cannot answer the room query.
    if (getCollaborationCoordinationMode() === 'single') {
      io.to(roomId).emit(COLLABORATION_EVENTS.USERS, { roomId, users: publicUsers(roomId) });
      return;
    }
    apiLogger.warn({ module: 'collaboration', operation: 'presence.query_unavailable' }, 'api.collaboration.presence_unavailable');
  }
}

function socketUser(socket: Socket): User | undefined {
  const value = socket.data.user as User | undefined;
  return value?.id && value.enabled !== false ? value : undefined;
}

function hasJoinedRoom(socket: Socket, roomId: string) {
  return Boolean((socket.data.collaborationRooms as Set<string> | undefined)?.has(roomId));
}

export async function joinRoom(io: Server, socket: Socket, payload: CollaborationRoomPayload) {
  const roomId = String(payload?.roomId || '');
  if (!roomId || !payload?.user?.id) return;

  if (!isCollaborationCoordinationReady()) {
    socket.emit(COLLABORATION_EVENTS.CONFLICT_DETECTED, {
      roomId,
      code: 'COORDINATION_UNAVAILABLE',
      reason: 'Collaboration is reconnecting. Please retry shortly.',
      timestamp: Date.now(),
    });
    return;
  }

  const auth = socket.data.auth as { userId?: number } | undefined;
  const authenticated = socketUser(socket);
  const authenticatedUserId = Number(auth?.userId ?? authenticated?.id ?? 0);
  if (!authenticated || authenticatedUserId <= 0 || authenticated.id !== authenticatedUserId || !await collaborationAccessPolicy.canViewDocument(authenticated, roomId)) {
    socket.emit(COLLABORATION_EVENTS.CONFLICT_DETECTED, { roomId, reason: 'Room access denied', timestamp: Date.now() });
    return;
  }

  try {
    await refreshRuntimeDocument(roomId);
  } catch (error) {
    apiLogger.error({
      module: 'collaboration',
      operation: 'document.recovery_failed',
      error: { code: 'RECOVERY_FAILED', name: error instanceof Error ? error.name : 'UnknownError' },
    }, 'api.collaboration.recovery_failed');
    socket.emit(COLLABORATION_EVENTS.CONFLICT_DETECTED, {
      roomId,
      code: 'RECOVERY_FAILED',
      reason: 'Collaboration document recovery is unavailable',
      timestamp: Date.now(),
    });
    return;
  }

  const user: RuntimeUser = {
    ...payload.user,
    id: authenticatedUserId,
    name: authenticated.name || payload.user.name,
    role: authenticated.role,
    socketId: socket.id,
    lastSeen: Date.now(),
    typing: false,
  };

  await socket.join(roomId);
  getRoomUsers(roomId).set(socket.id, user);
  socket.data.collaborationPresence = {
    id: user.id,
    name: user.name,
    role: user.role,
    color: user.color,
    lastSeen: user.lastSeen,
    typing: false,
  } satisfies CollaborationUserPresence;
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
  const lock = await getDocLock(roomId);
  if (lock) {
    socket.emit(COLLABORATION_EVENTS.DOC_LOCKED, lock);
  }
  socket.to(roomId).emit(COLLABORATION_EVENTS.USER_JOINED, { roomId, user });
  await broadcastUserList(io, roomId);
}

export async function leaveRoom(io: Server, socket: Socket, roomId: string) {
  if (!roomId) return;

  const users = rooms.get(roomId);
  const user = users?.get(socket.id);

  await socket.leave(roomId);
  users?.delete(socket.id);
  if (socket.data.collaborationPresence) delete socket.data.collaborationPresence;

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
  }
  await broadcastUserList(io, roomId);
}

export function heartbeat(io: Server, socket: Socket, roomId: string) {
  const user = rooms.get(roomId)?.get(socket.id);
  if (!user) return;
  user.lastSeen = Date.now();
  const presence = socket.data.collaborationPresence as CollaborationUserPresence | undefined;
  if (presence) presence.lastSeen = user.lastSeen;
  void broadcastUserList(io, roomId);
}

export async function handleDocumentUpdate(
  io: Server,
  socket: Socket,
  payload: CollaborationUpdatePayload,
  acknowledge?: (result: CollaborationUpdateAcknowledgement) => void,
) {
  const roomId = String(payload?.roomId || '');
  if (!roomId || !isValidCollaborationUpdate(payload?.update)) {
    const reason = 'Invalid collaboration update';
    socket.emit(COLLABORATION_EVENTS.CONFLICT_DETECTED, { roomId, code: 'INVALID_UPDATE', reason, timestamp: Date.now() });
    acknowledge?.({ ok: false, code: 'INVALID_UPDATE', reason });
    return;
  }
  if (!isCollaborationCoordinationReady()) {
    const reason = 'Collaboration is reconnecting. Your update is being kept for retry.';
    socket.emit(COLLABORATION_EVENTS.CONFLICT_DETECTED, { roomId, code: 'COORDINATION_UNAVAILABLE', reason, timestamp: Date.now() });
    acknowledge?.({ ok: false, code: 'COORDINATION_UNAVAILABLE', reason });
    return;
  }
  const authenticated = socketUser(socket);
  const userId = String(authenticated?.id ?? 'unknown');
  const joined = authenticated ? hasJoinedRoom(socket, roomId) : false;
  const canEdit = authenticated && joined ? await collaborationAccessPolicy.canEditDocument(authenticated, roomId) : false;
  const lock = authenticated && joined && canEdit ? await getDocLock(roomId) : null;

  if (!authenticated || !joined || !canEdit || lock) {
    const reason = !authenticated
      ? 'Authentication required'
      : !joined
        ? 'Join the room before editing'
        : !canEdit
          ? 'Document edit permission denied'
          : lock?.reason || 'Document is read-only';
    const conflictPayload = {
      roomId,
      userId,
      reason,
      timestamp: Date.now(),
    };
    const code = !authenticated
      ? 'AUTHENTICATION_REQUIRED'
      : !joined
        ? 'ROOM_NOT_JOINED'
        : !canEdit
          ? 'EDIT_PERMISSION_DENIED'
          : 'DOCUMENT_LOCKED';
    logCollaborationEvent({
      type: 'conflict',
      docId: roomId,
      userId,
      metadata: conflictPayload,
    });
    socket.emit(COLLABORATION_EVENTS.CONFLICT_DETECTED, { ...conflictPayload, code });
    if (lock) io.to(roomId).emit(COLLABORATION_EVENTS.DOC_LOCKED, lock);
    acknowledge?.({ ok: false, code, reason });
    return;
  }

  try {
    const version = await applyRuntimeDocumentUpdate(roomId, payload.update, { userId });
    socket.to(roomId).emit(COLLABORATION_EVENTS.UPDATE, { ...payload, version });
    acknowledge?.({ ok: true, version });
  } catch (error) {
    if (error instanceof RuntimeDocumentPersistenceError) {
      apiLogger.warn({
        module: 'collaboration',
        operation: 'document.update_persistence_failed',
        error: { code: 'PERSISTENCE_FAILED', name: error.name },
      }, 'api.collaboration.update_persistence_failed');
      const reason = 'Collaboration update could not be saved';
      socket.emit(COLLABORATION_EVENTS.CONFLICT_DETECTED, {
        roomId,
        code: 'PERSISTENCE_FAILED',
        reason,
        timestamp: Date.now(),
      });
      acknowledge?.({ ok: false, code: 'PERSISTENCE_FAILED', reason });
      return;
    }
    if (error instanceof RuntimeDocumentTooLargeError) {
      const reason = 'Collaboration document exceeds the safe size limit';
      socket.emit(COLLABORATION_EVENTS.CONFLICT_DETECTED, {
        roomId,
        code: 'DOCUMENT_TOO_LARGE',
        reason,
        timestamp: Date.now(),
      });
      acknowledge?.({ ok: false, code: 'DOCUMENT_TOO_LARGE', reason });
      return;
    }
    if (error instanceof RuntimeDocumentLockedError) {
      const reason = error.reason || 'Document is read-only';
      socket.emit(COLLABORATION_EVENTS.CONFLICT_DETECTED, {
        roomId,
        code: 'DOCUMENT_LOCKED',
        reason,
        timestamp: Date.now(),
      });
      acknowledge?.({ ok: false, code: 'DOCUMENT_LOCKED', reason });
      return;
    }
    if (error instanceof RuntimeDocumentContentionError) {
      const reason = 'Another collaborator is updating this document. The saved change will retry.';
      socket.emit(COLLABORATION_EVENTS.CONFLICT_DETECTED, {
        roomId,
        code: 'COORDINATION_CONFLICT',
        reason,
        timestamp: Date.now(),
      });
      acknowledge?.({ ok: false, code: 'COORDINATION_CONFLICT', reason });
      return;
    }
    apiLogger.warn({
      module: 'collaboration',
      operation: 'document.update_rejected',
      error: { code: 'INVALID_UPDATE', name: error instanceof Error ? error.name : 'UnknownError' },
    }, 'api.collaboration.update_rejected');
    const reason = 'Invalid collaboration update';
    socket.emit(COLLABORATION_EVENTS.CONFLICT_DETECTED, { roomId, code: 'INVALID_UPDATE', reason, timestamp: Date.now() });
    acknowledge?.({ ok: false, code: 'INVALID_UPDATE', reason });
  }
}

export function handleAwarenessUpdate(socket: Socket, payload: CollaborationUpdatePayload) {
  const roomId = String(payload?.roomId || '');
  if (!isCollaborationCoordinationReady() || !roomId || !Array.isArray(payload?.update) || !hasJoinedRoom(socket, roomId)) return;
  socket.to(roomId).emit(COLLABORATION_EVENTS.AWARENESS_UPDATE, payload);
}

export async function handleTyping(io: Server, socket: Socket, payload: CollaborationTypingPayload) {
  const roomId = String(payload?.roomId || '');
  const user = rooms.get(roomId)?.get(socket.id);
  if (!roomId || !user || !hasJoinedRoom(socket, roomId)) return;
  if (await isReadOnly(roomId)) return;

  user.typing = Boolean(payload.typing);
  user.lastSeen = Date.now();
  const presence = socket.data.collaborationPresence as CollaborationUserPresence | undefined;
  if (presence) {
    presence.typing = user.typing;
    presence.lastSeen = user.lastSeen;
  }
  if (payload.typing) {
    logCollaborationEvent({
      type: 'typing',
      docId: roomId,
      userId: String(user.id),
      metadata: { socketId: socket.id },
    });
  }
  socket.to(roomId).emit(COLLABORATION_EVENTS.TYPING, payload);
  await broadcastUserList(io, roomId);
}

export async function lockRoom(io: Server, roomId: string, reason?: string, userId = 'system') {
  if (!isCollaborationCoordinationReady()) throw new Error('Collaboration coordination is unavailable');
  const lock = await setDocLocked(roomId, reason, userId);
  io.to(roomId).emit(COLLABORATION_EVENTS.DOC_LOCKED, lock);
  return lock;
}

export async function unlockRoom(io: Server, roomId: string, userId = 'system') {
  if (!isCollaborationCoordinationReady()) throw new Error('Collaboration coordination is unavailable');
  const released = await releaseLock(roomId, userId);
  if (released) {
    io.to(roomId).emit(COLLABORATION_EVENTS.DOC_UNLOCKED, { roomId, timestamp: Date.now() });
  }
  return released;
}

export async function leaveAllRooms(io: Server, socket: Socket) {
  const joined = socket.data.collaborationRooms as Set<string> | undefined;
  if (!joined) return;

  for (const roomId of joined) {
    await leaveRoom(io, socket, roomId);
  }
  joined.clear();
}
