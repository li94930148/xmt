export type SocketTabEvent = 'auth_changed' | 'token_refreshed' | 'logout';

type TabSignal = { type: SocketTabEvent };

/** Cross-tab coordination deliberately carries signals only; credentials never leave memory. */
export class SocketTabCoordinator {
  private readonly channel: BroadcastChannel | null;
  private readonly listeners = new Set<(event: SocketTabEvent) => void>();
  private readonly onMessage = (event: MessageEvent<TabSignal>) => {
    if (event.data?.type) this.listeners.forEach((listener) => listener(event.data.type));
  };

  constructor(name = 'xmt-auth') {
    this.channel = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(name);
    this.channel?.addEventListener('message', this.onMessage);
  }

  on(listener: (event: SocketTabEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  notify(type: SocketTabEvent): void { this.channel?.postMessage({ type }); }

  close(): void {
    this.channel?.removeEventListener('message', this.onMessage);
    this.channel?.close();
    this.listeners.clear();
  }
}

export function readSocketCoordinatorEnabled(env: Record<string, string | undefined> = {}) {
  return env.VITE_XMT_SOCKET_COORDINATOR_ENABLED === 'true';
}
