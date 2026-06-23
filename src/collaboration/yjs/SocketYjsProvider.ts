import type { Socket } from 'socket.io-client';
import type { Schema } from '@tiptap/pm/model';
import * as Y from 'yjs';
import { prosemirrorJSONToYXmlFragment } from 'y-prosemirror';
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
import {
  recordCrdtMemoryUsage,
  recordSyncLatency,
} from '../../editor/performance/editorPerformanceMonitor';

type Unsubscribe = () => void;

export interface SocketYjsProviderOptions {
  socket: Socket;
  roomId: string;
  user: CollaborationUserPresence;
  onSynced?: () => void;
}

export class SocketYjsProvider {
  readonly doc = new Y.Doc();
  readonly awareness = new Awareness(this.doc);

  private readonly socket: Socket;
  private readonly roomId: string;
  private readonly user: CollaborationUserPresence;
  private readonly onSynced?: () => void;
  private readonly unsubscribers: Unsubscribe[] = [];
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private updateFlushTimer: ReturnType<typeof setTimeout> | null = null;
  private awarenessFlushTimer: ReturnType<typeof setTimeout> | null = null;
  private typingThrottleTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly pendingUpdates: Uint8Array[] = [];
  private readonly pendingAwarenessClients = new Set<number>();
  private lastActivityAt = Date.now();
  private lastTypingAt = 0;
  private destroyed = false;
  private synced = false;
  hasInitializedContent = false;

  constructor({ socket, roomId, user, onSynced }: SocketYjsProviderOptions) {
    this.socket = socket;
    this.roomId = roomId;
    this.user = user;
    this.onSynced = onSynced;
    this.bind();
    this.connect();
  }

  get fragment() {
    return this.doc.getXmlFragment('content');
  }

  get isEmpty() {
    return this.fragment.length === 0;
  }

  get hasSynced() {
    return this.synced;
  }

  applyInitialContentOnce(contentJson: Record<string, unknown>, schema: Schema) {
    if (this.destroyed || this.hasInitializedContent || !this.isEmpty) {
      return false;
    }

    this.doc.transact(() => {
      prosemirrorJSONToYXmlFragment(schema, contentJson, this.fragment);
    }, 'initial-content');

    this.hasInitializedContent = true;
    return true;
  }

  setTyping(typing: boolean) {
    if (this.destroyed) return;
    const now = Date.now();
    if (typing && now - this.lastTypingAt < 100) return;
    this.lastTypingAt = now;
    this.lastActivityAt = now;
    const payload: CollaborationTypingPayload = {
      roomId: this.roomId,
      userId: this.user.id,
      typing,
    };
    if (this.typingThrottleTimer) clearTimeout(this.typingThrottleTimer);
    this.typingThrottleTimer = setTimeout(() => {
      this.socket.emit(COLLABORATION_EVENTS.TYPING, payload);
    }, typing ? 100 : 0);
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;

    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    if (this.updateFlushTimer) clearTimeout(this.updateFlushTimer);
    if (this.awarenessFlushTimer) clearTimeout(this.awarenessFlushTimer);
    if (this.typingThrottleTimer) clearTimeout(this.typingThrottleTimer);

    this.socket.emit(COLLABORATION_EVENTS.LEAVE, { roomId: this.roomId, user: this.user });
    this.unsubscribers.forEach((unsubscribe) => unsubscribe());
    this.awareness.destroy();
    this.doc.destroy();
  }

  private bind() {
    const sendUpdate = (update: Uint8Array, origin: unknown) => {
      if (origin === this || this.destroyed) return;
      this.lastActivityAt = Date.now();
      this.pendingUpdates.push(update);
      recordCrdtMemoryUsage(this.roomId, Y.encodeStateAsUpdate(this.doc).length);
      if (!this.updateFlushTimer) {
        this.updateFlushTimer = setTimeout(flushUpdates, 50);
      }
    };

    const flushUpdates = () => {
      this.updateFlushTimer = null;
      if (this.destroyed || this.pendingUpdates.length === 0) return;
      const update = this.pendingUpdates.length === 1
        ? this.pendingUpdates[0]
        : Y.mergeUpdates(this.pendingUpdates);
      this.pendingUpdates.splice(0);
      const payload: CollaborationUpdatePayload = {
        roomId: this.roomId,
        update: Array.from(update),
      };
      this.socket.emit(COLLABORATION_EVENTS.UPDATE, payload);
    };

    const applyRemoteUpdate = (payload: CollaborationUpdatePayload) => {
      if (payload.roomId !== this.roomId || !Array.isArray(payload.update)) return;
      const startedAt = Date.now();
      Y.applyUpdate(this.doc, Uint8Array.from(payload.update), this);
      recordSyncLatency(this.roomId, Date.now() - startedAt);
      recordCrdtMemoryUsage(this.roomId, Y.encodeStateAsUpdate(this.doc).length);
    };

    const handleSyncUpdate = (payload: CollaborationUpdatePayload) => {
      applyRemoteUpdate(payload);
      if (!this.synced) {
        this.synced = true;
        if (!this.isEmpty) {
          this.hasInitializedContent = true;
        }
        this.onSynced?.();
      }
    };

    const handleRemoteUpdate = (payload: CollaborationUpdatePayload) => {
      applyRemoteUpdate(payload);
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
      if (Date.now() - this.lastActivityAt > 30000) return;
      changedClients.forEach((clientId) => this.pendingAwarenessClients.add(clientId));
      if (!this.awarenessFlushTimer) {
        this.awarenessFlushTimer = setTimeout(flushAwareness, 300);
      }
    };

    const flushAwareness = () => {
      this.awarenessFlushTimer = null;
      if (this.destroyed || this.pendingAwarenessClients.size === 0) return;
      if (Date.now() - this.lastActivityAt > 30000) {
        this.pendingAwarenessClients.clear();
        return;
      }
      const changedClients = Array.from(this.pendingAwarenessClients);
      this.pendingAwarenessClients.clear();

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
    this.socket.on(COLLABORATION_EVENTS.SYNC, handleSyncUpdate);
    this.socket.on(COLLABORATION_EVENTS.UPDATE, handleRemoteUpdate);
    this.socket.on(COLLABORATION_EVENTS.AWARENESS_UPDATE, handleAwarenessUpdate);
    this.socket.on(COLLABORATION_EVENTS.DOC_LOCKED, handleDocumentLocked);
    this.socket.on(COLLABORATION_EVENTS.CONFLICT_DETECTED, handleConflictDetected);
    this.socket.on('connect', handleReconnect);

    this.unsubscribers.push(() => this.doc.off('update', sendUpdate));
    this.unsubscribers.push(() => this.awareness.off('update', sendAwarenessUpdate));
    this.unsubscribers.push(() => this.socket.off(COLLABORATION_EVENTS.SYNC, handleSyncUpdate));
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
