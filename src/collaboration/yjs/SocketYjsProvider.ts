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
  collaborationUpdateOutbox,
  type CollaborationUpdateOutbox,
} from './IndexedDbUpdateOutbox';
import {
  COLLABORATION_EVENTS,
  type CollaborationTypingPayload,
  type CollaborationUpdateAcknowledgement,
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
  onUpdatesConfirmed?: () => void;
  onConflict?: (payload: { code?: string; reason?: string }) => void;
  outbox?: CollaborationUpdateOutbox;
}

interface PendingUpdateEntry {
  update: Uint8Array;
  persistedId: number | null;
  persistence: Promise<void>;
}

interface InFlightUpdate {
  update: Uint8Array;
  attempts: number;
  entries: PendingUpdateEntry[];
}

export class SocketYjsProvider {
  readonly doc = new Y.Doc();
  readonly awareness = new Awareness(this.doc);

  private readonly socket: Socket;
  private readonly roomId: string;
  private readonly user: CollaborationUserPresence;
  private readonly onSynced?: () => void;
  private readonly onUpdatesConfirmed?: () => void;
  private readonly onConflict?: (payload: { code?: string; reason?: string }) => void;
  private readonly outbox: CollaborationUpdateOutbox;
  private readonly unsubscribers: Unsubscribe[] = [];
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private updateFlushTimer: ReturnType<typeof setTimeout> | null = null;
  private updateAcknowledgementTimer: ReturnType<typeof setTimeout> | null = null;
  private awarenessFlushTimer: ReturnType<typeof setTimeout> | null = null;
  private typingThrottleTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly pendingUpdates: PendingUpdateEntry[] = [];
  private inFlightUpdate: InFlightUpdate | null = null;
  private readonly pendingAwarenessClients = new Set<number>();
  private lastActivityAt = Date.now();
  private lastTypingAt = 0;
  private destroyed = false;
  private synced = false;
  private frozenForReconnect = false;
  private outboxReady = false;
  private syncInitialization: Promise<boolean> | null = null;
  private syncGeneration = 0;
  private flushingUpdates = false;
  hasInitializedContent = false;

  constructor({ socket, roomId, user, onSynced, onUpdatesConfirmed, onConflict, outbox }: SocketYjsProviderOptions) {
    this.socket = socket;
    this.roomId = roomId;
    this.user = user;
    this.onSynced = onSynced;
    this.onUpdatesConfirmed = onUpdatesConfirmed;
    this.onConflict = onConflict;
    this.outbox = outbox || collaborationUpdateOutbox;
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

  /** Pause outbound CRDT/awareness traffic until a new server SYNC is applied. */
  freezeForReconnect() {
    if (this.destroyed) return;
    this.syncGeneration += 1;
    this.frozenForReconnect = true;
    this.synced = false;
    if (this.updateFlushTimer) {
      clearTimeout(this.updateFlushTimer);
      this.updateFlushTimer = null;
    }
    if (this.updateAcknowledgementTimer) {
      clearTimeout(this.updateAcknowledgementTimer);
      this.updateAcknowledgementTimer = null;
    }
    if (this.awarenessFlushTimer) {
      clearTimeout(this.awarenessFlushTimer);
      this.awarenessFlushTimer = null;
    }
  }

  /** Re-enable outbound traffic after the normal SYNC event. */
  resumeAfterSync() {
    if (this.destroyed) return;
    this.frozenForReconnect = false;
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
    if (this.updateAcknowledgementTimer) clearTimeout(this.updateAcknowledgementTimer);
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
      const pending: PendingUpdateEntry = {
        update: update.slice(),
        persistedId: null,
        persistence: Promise.resolve(),
      };
      pending.persistence = this.outbox.append(this.user.id, this.roomId, pending.update)
        .then((id) => { pending.persistedId = id; })
        .catch((error: unknown) => {
          this.onConflict?.({
            code: 'LOCAL_OUTBOX_WRITE_FAILED',
            reason: error instanceof Error ? error.message : 'Could not save pending collaboration update locally',
          });
        });
      this.pendingUpdates.push(pending);
      recordCrdtMemoryUsage(this.roomId, Y.encodeStateAsUpdate(this.doc).length);
      if (!this.updateFlushTimer) {
        this.updateFlushTimer = setTimeout(flushUpdates, 50);
      }
    };

    const flushUpdates = () => {
      this.updateFlushTimer = null;
      if (this.destroyed || this.frozenForReconnect || !this.synced || this.flushingUpdates || (this.pendingUpdates.length === 0 && !this.inFlightUpdate)) return;
      this.flushingUpdates = true;
      void (async () => {
        try {
          if (!this.inFlightUpdate && this.pendingUpdates.length > 0) {
            const pendingCount = this.pendingUpdates.length;
            const candidates = this.pendingUpdates.slice(0, pendingCount);
            await Promise.all(candidates.map((entry) => entry.persistence));
            if (this.destroyed || this.frozenForReconnect || !this.synced || !this.socket.connected) return;
            const entries = this.pendingUpdates.splice(0, pendingCount);
            const updates = entries.map((entry) => entry.update);
            const update = updates.length === 1 ? updates[0]! : Y.mergeUpdates(updates);
            this.inFlightUpdate = { update, attempts: 0, entries };
          }
          if (this.inFlightUpdate && !this.updateAcknowledgementTimer) sendInFlightUpdate();
        } finally {
          this.flushingUpdates = false;
          if (!this.destroyed && !this.frozenForReconnect && this.synced && !this.inFlightUpdate && this.pendingUpdates.length > 0 && !this.updateFlushTimer) {
            this.updateFlushTimer = setTimeout(flushUpdates, 0);
          }
        }
      })();
    };

    const scheduleRetry = (batch: InFlightUpdate) => {
      if (this.destroyed || this.frozenForReconnect) return;
      const delay = Math.min(1000 * (2 ** Math.max(0, batch.attempts - 1)), 30000);
      this.updateAcknowledgementTimer = setTimeout(() => {
        this.updateAcknowledgementTimer = null;
        if (this.inFlightUpdate !== batch) return;
        sendInFlightUpdate();
      }, delay);
    };

    const sendInFlightUpdate = () => {
      const batch = this.inFlightUpdate;
      if (!batch || this.destroyed || this.frozenForReconnect || !this.synced || !this.socket.connected) return;
      if (this.updateAcknowledgementTimer) {
        clearTimeout(this.updateAcknowledgementTimer);
        this.updateAcknowledgementTimer = null;
      }
      const attempt = ++batch.attempts;
      const payload: CollaborationUpdatePayload = {
        roomId: this.roomId,
        update: Array.from(batch.update),
      };
      this.updateAcknowledgementTimer = setTimeout(() => {
        if (this.inFlightUpdate !== batch || batch.attempts !== attempt) return;
        this.onConflict?.({ code: 'ACK_TIMEOUT', reason: 'Collaboration update acknowledgement timed out' });
        scheduleRetry(batch);
      }, 10000);
      this.socket.emit(COLLABORATION_EVENTS.UPDATE, payload, (acknowledgement?: CollaborationUpdateAcknowledgement) => {
        if (this.destroyed) return;
        if (this.inFlightUpdate !== batch || batch.attempts !== attempt) return;
        if (this.updateAcknowledgementTimer) {
          clearTimeout(this.updateAcknowledgementTimer);
          this.updateAcknowledgementTimer = null;
        }
        if (acknowledgement?.ok) {
          this.inFlightUpdate = null;
          const persistedIds = batch.entries
            .map((entry) => entry.persistedId)
            .filter((id): id is number => id !== null);
          void this.outbox.remove(this.user.id, this.roomId, persistedIds)
            .then(() => {
              if (!this.destroyed && this.pendingUpdates.length === 0 && !this.inFlightUpdate) this.onUpdatesConfirmed?.();
            })
            .catch((error: unknown) => {
              this.onConflict?.({
                code: 'LOCAL_OUTBOX_CLEANUP_FAILED',
                reason: error instanceof Error ? error.message : 'Could not clean confirmed collaboration updates locally',
              });
            });
          if (this.pendingUpdates.length > 0 && !this.updateFlushTimer) {
            this.updateFlushTimer = setTimeout(flushUpdates, 0);
          }
          return;
        }
        const code = acknowledgement?.code || 'ACK_TIMEOUT';
        this.onConflict?.({ code, reason: acknowledgement?.reason });
        if (code === 'PERSISTENCE_FAILED' || code === 'ACK_TIMEOUT' || code === 'UPDATE_FAILED'
          || code === 'COORDINATION_UNAVAILABLE' || code === 'COORDINATION_CONFLICT') {
          scheduleRetry(batch);
        }
      });
    };

    const applyRemoteUpdate = (payload: CollaborationUpdatePayload) => {
      if (payload.roomId !== this.roomId || !Array.isArray(payload.update)) return;
      const startedAt = Date.now();
      Y.applyUpdate(this.doc, Uint8Array.from(payload.update), this);
      recordSyncLatency(this.roomId, Date.now() - startedAt);
      recordCrdtMemoryUsage(this.roomId, Y.encodeStateAsUpdate(this.doc).length);
    };

    const finishSync = async (generation: number) => {
      try {
        if (!this.outboxReady) {
          const persisted = await this.outbox.list(this.user.id, this.roomId);
          if (this.destroyed) return false;
          for (const entry of persisted) {
            const update = new Uint8Array(entry.update);
            Y.applyUpdate(this.doc, update, this);
            this.pendingUpdates.push({
              update,
              persistedId: entry.id,
              persistence: Promise.resolve(),
            });
          }
          this.outboxReady = true;
        }
      } catch (error) {
        this.onConflict?.({
          code: 'LOCAL_OUTBOX_RESTORE_FAILED',
          reason: error instanceof Error ? error.message : 'Could not restore pending collaboration updates',
        });
        return false;
      }
      if (this.destroyed || generation !== this.syncGeneration || !this.socket.connected) return false;
      this.synced = true;
      this.resumeAfterSync();
      if ((this.pendingUpdates.length > 0 || this.inFlightUpdate) && !this.updateFlushTimer) {
        this.updateFlushTimer = setTimeout(flushUpdates, 0);
      }
      if (!this.isEmpty) this.hasInitializedContent = true;
      this.onSynced?.();
      if (this.pendingUpdates.length === 0 && !this.inFlightUpdate) this.onUpdatesConfirmed?.();
      return true;
    };

    let latestSyncGeneration: number | null = null;
    const startSyncInitialization = (generation: number) => {
      const attempt = finishSync(generation);
      this.syncInitialization = attempt;
      void attempt.then(() => {
        if (this.syncInitialization !== attempt) return;
        this.syncInitialization = null;
        if (!this.synced && !this.destroyed && latestSyncGeneration !== null && latestSyncGeneration !== generation && this.socket.connected) {
          startSyncInitialization(latestSyncGeneration);
        }
      });
    };

    const handleSyncUpdate = (payload: CollaborationUpdatePayload) => {
      applyRemoteUpdate(payload);
      latestSyncGeneration = this.syncGeneration;
      if (!this.synced) {
        if (!this.syncInitialization) {
          startSyncInitialization(latestSyncGeneration);
        }
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
      if (this.destroyed || this.frozenForReconnect || !this.synced || this.pendingAwarenessClients.size === 0) return;
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
    const handleDisconnect = () => this.freezeForReconnect();

    const handleDocumentLocked = () => {
      this.setTyping(false);
    };

    const handleDocumentUnlocked = (payload: { docId?: string }) => {
      if (payload?.docId && payload.docId !== this.roomId) return;
      if (!this.inFlightUpdate || this.updateAcknowledgementTimer || !this.synced || this.updateFlushTimer) return;
      this.updateFlushTimer = setTimeout(flushUpdates, 0);
    };

    const handleConflictDetected = (payload: { roomId?: string; code?: string; reason?: string }) => {
      if (payload?.roomId && payload.roomId !== this.roomId) return;
      this.setTyping(false);
      this.onConflict?.(payload || {});
    };

    this.doc.on('update', sendUpdate);
    this.awareness.on('update', sendAwarenessUpdate);
    this.socket.on(COLLABORATION_EVENTS.SYNC, handleSyncUpdate);
    this.socket.on(COLLABORATION_EVENTS.UPDATE, handleRemoteUpdate);
    this.socket.on(COLLABORATION_EVENTS.AWARENESS_UPDATE, handleAwarenessUpdate);
    this.socket.on(COLLABORATION_EVENTS.DOC_LOCKED, handleDocumentLocked);
    this.socket.on(COLLABORATION_EVENTS.DOC_UNLOCKED, handleDocumentUnlocked);
    this.socket.on(COLLABORATION_EVENTS.CONFLICT_DETECTED, handleConflictDetected);
    this.socket.on('connect', handleReconnect);
    this.socket.on('disconnect', handleDisconnect);

    this.unsubscribers.push(() => this.doc.off('update', sendUpdate));
    this.unsubscribers.push(() => this.awareness.off('update', sendAwarenessUpdate));
    this.unsubscribers.push(() => this.socket.off(COLLABORATION_EVENTS.SYNC, handleSyncUpdate));
    this.unsubscribers.push(() => this.socket.off(COLLABORATION_EVENTS.UPDATE, handleRemoteUpdate));
    this.unsubscribers.push(() => this.socket.off(COLLABORATION_EVENTS.AWARENESS_UPDATE, handleAwarenessUpdate));
    this.unsubscribers.push(() => this.socket.off(COLLABORATION_EVENTS.DOC_LOCKED, handleDocumentLocked));
    this.unsubscribers.push(() => this.socket.off(COLLABORATION_EVENTS.DOC_UNLOCKED, handleDocumentUnlocked));
    this.unsubscribers.push(() => this.socket.off(COLLABORATION_EVENTS.CONFLICT_DETECTED, handleConflictDetected));
    this.unsubscribers.push(() => this.socket.off('connect', handleReconnect));
    this.unsubscribers.push(() => this.socket.off('disconnect', handleDisconnect));
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
