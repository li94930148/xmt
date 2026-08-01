import type { SocketRoomRecovery, SocketCoordinatorState } from './socket-state';
import { initialSocketCoordinatorState } from './socket-state';
import type { SocketToken, SocketTokenProvider } from './socket-token-provider';

type SocketLike = {
  auth: Record<string, unknown>;
  connected: boolean;
  connect: () => unknown;
  disconnect: () => unknown;
  on: (event: string, listener: (...args: unknown[]) => void) => unknown;
  off: (event: string, listener: (...args: unknown[]) => void) => unknown;
};

type CoordinatorOptions = {
  socket: SocketLike;
  tokenProvider: SocketTokenProvider;
  onStateChange?: (state: SocketCoordinatorState) => void;
  refreshLeadMs?: number;
  maxReconnectAttempts?: number;
};

/** Coordinates HTTP token refresh and Socket.IO reconnect without refreshing inside Socket. */
export class SocketCoordinator {
  private state: SocketCoordinatorState = { ...initialSocketCoordinatorState };
  private readonly rooms = new Map<string, SocketRoomRecovery>();
  private readonly refreshLeadMs: number;
  private readonly maxReconnectAttempts: number;
  private expiryTimer: ReturnType<typeof setTimeout> | null = null;
  private refreshInFlight: Promise<boolean> | null = null;
  private destroyed = false;
  private readonly onConnect = () => { void this.handleConnected(); };
  private readonly onDisconnect = () => {
    if (!this.destroyed && this.state.status !== 'expired') this.update({ connected: false, status: 'reconnecting' });
  };
  private readonly onConnectError = (error: unknown) => {
    const message = error instanceof Error ? error.message : 'socket_connect_error';
    this.update({ connected: false, status: 'reconnecting', lastError: message });
  };

  constructor(private readonly options: CoordinatorOptions) {
    this.refreshLeadMs = options.refreshLeadMs ?? 30_000;
    this.maxReconnectAttempts = options.maxReconnectAttempts ?? 5;
    options.socket.on('connect', this.onConnect);
    options.socket.on('disconnect', this.onDisconnect);
    options.socket.on('connect_error', this.onConnectError);
    options.tokenProvider.subscribe?.((token) => { if (token) this.scheduleExpiry(token); });
    const token = options.tokenProvider.getToken();
    if (token) this.scheduleExpiry(token);
  }

  getState(): SocketCoordinatorState { return { ...this.state }; }

  registerRoom(room: SocketRoomRecovery): () => void {
    this.rooms.set(room.roomId, room);
    return () => this.rooms.delete(room.roomId);
  }

  connect(): void {
    if (this.destroyed || this.state.status === 'expired') return;
    this.update({ status: 'connecting', lastError: null });
    this.options.socket.connect();
  }

  async refreshAndReconnect(): Promise<boolean> {
    if (this.destroyed || this.state.status === 'expired') return false;
    if (!this.refreshInFlight) {
      this.update({ status: 'refreshing' });
      this.refreshInFlight = this.options.tokenProvider.refresh()
        .then((token) => {
          if (!token) { this.expire(); return false; }
          this.scheduleExpiry(token);
          this.options.socket.auth.token = token.accessToken;
          this.update({ status: 'reconnecting', connected: false });
          this.options.socket.disconnect();
          this.options.socket.connect();
          return true;
        })
        .catch((error: Error) => { this.update({ lastError: error.message }); this.expire(); return false; })
        .finally(() => { this.refreshInFlight = null; });
    }
    return this.refreshInFlight;
  }

  logout(): void {
    this.destroyed = true;
    this.clearExpiry();
    this.rooms.clear();
    this.options.socket.disconnect();
    this.update({ status: 'idle', connected: false });
  }

  sessionRevoked(): void { this.expire(); }

  expire(): void {
    this.clearExpiry();
    this.update({ status: 'expired', connected: false });
    this.options.socket.disconnect();
  }

  destroy(): void { this.logout(); this.options.socket.off('connect', this.onConnect); this.options.socket.off('disconnect', this.onDisconnect); this.options.socket.off('connect_error', this.onConnectError); }

  private async handleConnected() {
    if (this.destroyed) return;
    this.update({ status: 'authenticated', connected: true, reconnectAttempt: 0, lastError: null });
    for (const room of this.rooms.values()) {
      await room.join();
      await room.restoreYjs?.();
      await room.restoreAwareness?.();
      await room.restoreTyping?.();
      await room.restoreLock?.();
    }
  }

  private scheduleExpiry(token: SocketToken) {
    this.clearExpiry();
    const delay = Math.max(0, token.expiresAt * 1000 - Date.now() - this.refreshLeadMs);
    this.expiryTimer = setTimeout(() => { void this.refreshAndReconnect(); }, delay);
  }

  private clearExpiry() { if (this.expiryTimer) clearTimeout(this.expiryTimer); this.expiryTimer = null; }

  private update(patch: Partial<SocketCoordinatorState>) {
    this.state = { ...this.state, ...patch };
    this.options.onStateChange?.(this.getState());
  }
}

/** Small, protocol-neutral bridge for keeping a Y.Doc alive while Socket is offline. */
export class YjsRecoveryBridge {
  private frozen = false;
  private synced = false;
  constructor(private readonly hooks: { join: () => void; sync: () => void; awareness?: () => void; onResume?: () => void }) {}
  freeze(): void { this.frozen = true; this.synced = false; }
  resume(): void { this.frozen = false; this.hooks.join(); }
  markSynced(): void { this.synced = true; this.hooks.awareness?.(); this.hooks.onResume?.(); }
  canSend(): boolean { return !this.frozen && this.synced; }
  getState(): { frozen: boolean; synced: boolean } { return { frozen: this.frozen, synced: this.synced }; }
  recover(): void { if (this.frozen) return; this.hooks.join(); this.hooks.sync(); }
}
