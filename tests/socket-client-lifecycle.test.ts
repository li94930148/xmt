import assert from 'node:assert/strict';
import { SocketClientLifecycleDiagnostics } from '../src/observability/socket-client-lifecycle.ts';

let clock = Date.parse('2026-08-10T00:00:00.000Z');
const diagnostic = new SocketClientLifecycleDiagnostics(true, () => new Date(clock));
diagnostic.created();
clock += 1_000;
diagnostic.connected();
clock += 1_000;
diagnostic.reconnectAttempt(2);
clock += 1_000;
diagnostic.disconnected('ping timeout');
clock += 1_000;
diagnostic.destroyed('logout');

const events = diagnostic.snapshot();
assert.deepEqual(events.map((event) => event.event), ['created', 'connected', 'reconnect_attempt', 'disconnected', 'destroyed']);
assert.equal(events[2].reconnectAttempt, 2);
assert.equal(events[3].disconnectReason, 'ping timeout');
assert.equal(events.every((event) => Object.keys(event).every((key) => !/token|cookie|user|socketId/i.test(key))), true);
assert.equal(JSON.stringify(events).includes('access-token'), false);

const disabled = new SocketClientLifecycleDiagnostics(false);
disabled.created();
assert.deepEqual(disabled.snapshot(), []);
console.log('socket client lifecycle diagnostics tests passed');
