import type { Socket } from 'socket.io-client';
import * as Y from 'yjs';
import {
  Awareness,
  applyAwarenessUpdate,
  encodeAwarenessUpdate,
} from 'y-protocols/awareness';
import {
  COLLABORATION_EVENTS,
  type CollaborationTypingPayload,
  type CollaborationUpdatePayload,
  type CollaborationUserPresence,
} from '../core/events';

type Unsubscribe = () => void;

export interface SocketYjsProviderOptions {
  socket: Socket;
  roomId: string;
  user: CollaborationUserPresence;
}

export class SocketYjsProvider {
  readonly doc = new Y.Doc();
  readonly awareness = new Awareness(this.doc);

  private readonly socket: Socket;
  private readonly roomId: string;
  private readonly user: CollaborationUserPresence;
  private readonly unsubscribers: Unsubscribe[] = [];
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private destroyed = false;

  constructor({ socket, roomId, user }: SocketYjsProviderOptions) {
    this.socket = socket;
    this.roomId = roomId;
    this.user = user;
    this.bind();
    this.connect();
  }

  setTyping(typing: boolean) {
    if (this.destroyed) return;
    const payload: CollaborationTypingPayload = {
      roomId: this.roomId,
      userId: this.user.id,
      typing,
    };
    this.socket.emit(COLLABORATION_EVENTS.TYPING, payload);
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;

    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }

    this.socket.emit(COLLABORATION_EVENTS.LEAVE, { roomId: this.roomId, user: this.user });
    this.unsubscribers.forEach((unsubscribe) => unsubscribe());
    this.awareness.destroy();
    this.doc.destroy();
  }

  private bind() {
    const sendUpdate = (update: Uint8Array, origin: unknown) => {
      if (origin === this || this.destroyed) return;
      const payload: CollaborationUpdatePayload = {
        roomId: this.roomId,
        update: Array.from(update),
      };
      this.socket.emit(COLLABORATION_EVENTS.UPDATE, payload);
    };

    const handleRemoteUpdate = (payload: CollaborationUpdatePayload) => {
      if (payload.roomId !== this.roomId || !Array.isArray(payload.update)) return;
      Y.applyUpdate(this.doc, Uint8Array.from(payload.update), this);
    };

    const handleAwarenessUpdate = (payload: CollaborationUpdatePayload) => {
      if (payload.roomId !== this.roomId || !Array.isArray(payload.update)) return;
      applyAwarenessUpdate(this.awareness, Uint8Array.from(payload.update), this);
    };

    const sendAwarenessUpdate = (
      changes: { added: number[]; updated: number[]; removed: number[] },
      origin: unknown,
    ) => {
      if (origin === this || this.destroyed) return;
      const changedClients = [...changes.added, ...changes.updated, ...changes.removed];
      if (changedClients.length === 0) return;

      this.socket.emit(COLLABORATION_EVENTS.AWARENESS_UPDATE, {
        roomId: this.roomId,
        update: Array.from(encodeAwarenessUpdate(this.awareness, changedClients)),
      });
    };

    const handleReconnect = () => {
      if (this.destroyed) return;
      this.connect();
    };

    const handleDocumentLocked = () => {
      this.setTyping(false);
    };

    const handleConflictDetected = () => {
      this.setTyping(false);
    };

    this.doc.on('update', sendUpdate);
    this.awareness.on('update', sendAwarenessUpdate);
    this.socket.on(COLLABORATION_EVENTS.SYNC, handleRemoteUpdate);
    this.socket.on(COLLABORATION_EVENTS.UPDATE, handleRemoteUpdate);
    this.socket.on(COLLABORATION_EVENTS.AWARENESS_UPDATE, handleAwarenessUpdate);
    this.socket.on(COLLABORATION_EVENTS.DOC_LOCKED, handleDocumentLocked);
    this.socket.on(COLLABORATION_EVENTS.CONFLICT_DETECTED, handleConflictDetected);
    this.socket.on('connect', handleReconnect);

    this.unsubscribers.push(() => this.doc.off('update', sendUpdate));
    this.unsubscribers.push(() => this.awareness.off('update', sendAwarenessUpdate));
    this.unsubscribers.push(() => this.socket.off(COLLABORATION_EVENTS.SYNC, handleRemoteUpdate));
    this.unsubscribers.push(() => this.socket.off(COLLABORATION_EVENTS.UPDATE, handleRemoteUpdate));
    this.unsubscribers.push(() => this.socket.off(COLLABORATION_EVENTS.AWARENESS_UPDATE, handleAwarenessUpdate));
    this.unsubscribers.push(() => this.socket.off(COLLABORATION_EVENTS.DOC_LOCKED, handleDocumentLocked));
    this.unsubscribers.push(() => this.socket.off(COLLABORATION_EVENTS.CONFLICT_DETECTED, handleConflictDetected));
    this.unsubscribers.push(() => this.socket.off('connect', handleReconnect));
  }

  private connect() {
    this.awareness.setLocalStateField('user', {
      id: this.user.id,
      name: this.user.name,
      color: this.user.color,
      role: this.user.role,
    });
    this.socket.emit(COLLABORATION_EVENTS.JOIN, {
      roomId: this.roomId,
      user: this.user,
    });

    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = setInterval(() => {
      this.socket.emit(COLLABORATION_EVENTS.HEARTBEAT, { roomId: this.roomId });
    }, 15000);
  }
}
