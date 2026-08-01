import assert from 'node:assert/strict';
import { SocketCoordinator, YjsRecoveryBridge } from '../../src/auth/socket/index.ts';

class FakeSocket {
  auth: Record<string, unknown> = {};
  connected = false;
  private listeners = new Map<string, Set<(...args: unknown[]) => void>>();
  on(event: string, listener: (...args: unknown[]) => void) { if (!this.listeners.has(event)) this.listeners.set(event, new Set()); this.listeners.get(event)!.add(listener); return this; }
  off(event: string, listener: (...args: unknown[]) => void) { this.listeners.get(event)?.delete(listener); return this; }
  emit(event: string, ...args: unknown[]) { this.listeners.get(event)?.forEach((listener) => listener(...args)); }
  connect() { this.connected = true; this.emit('connect'); }
  disconnect() { this.connected = false; this.emit('disconnect', 'client namespace disconnect'); }
}

const token = { accessToken: 'access-only', expiresAt: Math.floor(Date.now() / 1000) + 3600 };
let current = token;
let refreshes = 0;
const socket = new FakeSocket();
const coordinator = new SocketCoordinator({
  socket,
  tokenProvider: { getToken: () => current, refresh: async () => { refreshes += 1; current = { ...token, accessToken: `access-${refreshes}` }; return current; } },
});

const order: string[] = [];
coordinator.registerRoom({ roomId: 'production:1', join: () => order.push('join'), restoreYjs: () => order.push('yjs'), restoreAwareness: () => order.push('awareness'), restoreTyping: () => order.push('typing'), restoreLock: () => order.push('lock') });
coordinator.connect();
await new Promise((resolve) => setTimeout(resolve, 0));
assert.equal(coordinator.getState().status, 'authenticated');
assert.deepEqual(order, ['join', 'yjs', 'awareness', 'typing', 'lock']);

await coordinator.refreshAndReconnect();
await new Promise((resolve) => setTimeout(resolve, 0));
assert.equal(refreshes, 1);
assert.equal(socket.auth.token, 'access-1');
assert.equal(coordinator.getState().status, 'authenticated');
coordinator.sessionRevoked();
assert.equal(coordinator.getState().status, 'expired');
coordinator.destroy();

const bridgeEvents: string[] = [];
const bridge = new YjsRecoveryBridge({ join: () => bridgeEvents.push('join'), sync: () => bridgeEvents.push('sync'), awareness: () => bridgeEvents.push('awareness'), onResume: () => bridgeEvents.push('resume') });
bridge.freeze();
assert.equal(bridge.canSend(), false);
bridge.resume();
bridge.recover();
bridge.markSynced();
assert.deepEqual(bridgeEvents, ['join', 'join', 'sync', 'awareness', 'resume']);
assert.equal(bridge.canSend(), true);

console.log('socket coordinator tests passed');
