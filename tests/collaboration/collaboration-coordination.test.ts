import assert from 'node:assert/strict';
import { resolveCollaborationCoordinationConfig } from '../../api/collaboration/coordination/config.js';
import {
  configureCollaborationSocketAdapter,
  isCollaborationCoordinationReady,
} from '../../api/collaboration/coordination/socketAdapter.js';

assert.deepEqual(resolveCollaborationCoordinationConfig({ NODE_ENV: 'test' } as NodeJS.ProcessEnv), {
  mode: 'single',
  instanceCount: 1,
  channelPrefix: 'xmt:test',
});
assert.equal(isCollaborationCoordinationReady(), true, 'single-instance coordination remains available without Redis');

assert.throws(
  () => resolveCollaborationCoordinationConfig({ XMT_WEB_INSTANCE_COUNT: '2' } as NodeJS.ProcessEnv),
  /Multiple web instances require XMT_SOCKET_ADAPTER=redis-streams/,
);
assert.throws(
  () => resolveCollaborationCoordinationConfig({ XMT_SOCKET_ADAPTER: 'redis-streams' } as NodeJS.ProcessEnv),
  /XMT_REDIS_URL is required/,
);
assert.throws(
  () => resolveCollaborationCoordinationConfig({ XMT_WEB_INSTANCE_COUNT: '2workers' } as NodeJS.ProcessEnv),
  /XMT_WEB_INSTANCE_COUNT must be an integer/,
);
assert.throws(
  () => resolveCollaborationCoordinationConfig({ XMT_SOCKET_ADAPTER: 'redis' } as NodeJS.ProcessEnv),
  /XMT_SOCKET_ADAPTER must be single or redis-streams/,
);

assert.deepEqual(resolveCollaborationCoordinationConfig({
  NODE_ENV: 'production',
  XMT_WEB_INSTANCE_COUNT: '2',
  XMT_SOCKET_ADAPTER: 'redis-streams',
  XMT_REDIS_URL: 'rediss://test.invalid',
  XMT_SOCKET_ADAPTER_CHANNEL_PREFIX: 'xmt:cluster-a',
} as NodeJS.ProcessEnv), {
  mode: 'redis-streams',
  instanceCount: 2,
  redisUrl: 'rediss://test.invalid',
  channelPrefix: 'xmt:cluster-a',
});

assert.throws(
  () => resolveCollaborationCoordinationConfig({
    XMT_SOCKET_ADAPTER_CHANNEL_PREFIX: 'xmt:bad prefix',
  } as NodeJS.ProcessEnv),
  /XMT_SOCKET_ADAPTER_CHANNEL_PREFIX must contain/,
);

await assert.rejects(
  configureCollaborationSocketAdapter({ adapter() {} } as never, {
    NODE_ENV: 'test',
    XMT_WEB_INSTANCE_COUNT: '2',
    XMT_SOCKET_ADAPTER: 'redis-streams',
    XMT_REDIS_URL: 'redis://127.0.0.1:1',
  } as NodeJS.ProcessEnv),
  /Unable to initialize Redis Streams coordination/,
  'multi-instance startup fails closed instead of silently using a local adapter',
);

console.log('Collaboration coordination configuration tests passed');
