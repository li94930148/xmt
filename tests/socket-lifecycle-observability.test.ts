import assert from 'node:assert/strict';
import { SocketLifecycleObserver } from '../api/observability/socket-lifecycle-observability.js';

let now = Date.parse('2026-08-06T00:00:00.000Z');
const events: Array<Record<string, unknown>> = [];
const observer = new SocketLifecycleObserver(() => now, (event) => events.push(event));

const connectionId = observer.connected({ engineSid: 'engine-secret-a', transport: 'polling' });
assert.ok(connectionId);
observer.reconnect('engine-secret-a', 2);
observer.upgraded('engine-secret-a', 'websocket');
now += 1_200;
observer.disconnected({ engineSid: 'engine-secret-a', reason: 'transport close' });

assert.equal(observer.engineConnectionError({
  message: 'Session ID unknown',
  requestUrl: '/socket.io/?transport=polling&sid=engine-secret-a',
}), 'client_repeated_polling_old_sid');
assert.equal(observer.engineConnectionError({
  message: 'Session ID unknown',
  requestUrl: '/socket.io/?transport=polling&sid=unknown-engine',
}), 'server_missing_sid');
assert.equal(observer.engineConnectionError({
  message: 'Session ID unknown',
  requestUrl: '/socket.io/?transport=websocket&sid=unknown-engine',
}), 'transport_switch_problem');
assert.equal(observer.engineConnectionError({
  message: 'Session ID unknown',
  requestUrl: '/socket.io/?transport=polling&sid=unknown-engine',
  httpStatus: 502,
  proxied: true,
}), 'proxy_chain_problem');
assert.equal(observer.engineConnectionError({ message: 'different error' }), null);

const serializedEvents = JSON.stringify(events);
assert.equal(serializedEvents.includes('engine-secret-a'), false);
assert.equal(serializedEvents.includes('sid='), false);
assert.equal(serializedEvents.includes('token'), false);
assert.equal(observer.getSummary().counters['session_id_unknown.client_repeated_polling_old_sid'], 1);
assert.equal(observer.getSummary().counters['session_id_unknown.server_missing_sid'], 1);
assert.equal(observer.getSummary().counters['session_id_unknown.transport_switch_problem'], 1);
assert.equal(observer.getSummary().counters['session_id_unknown.proxy_chain_problem'], 1);

console.log('socket lifecycle observability tests passed');
