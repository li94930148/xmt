import { createAdapter } from '@socket.io/redis-streams-adapter';
import { createClient } from 'redis';
import type { Server } from 'socket.io';
import { apiLogger } from '../../observability/logger.js';
import {
  resolveCollaborationCoordinationConfig,
  type CollaborationAdapterMode,
  type CollaborationCoordinationConfig,
} from './config.js';

type RedisClientState = Pick<ReturnType<typeof createClient>, 'isReady' | 'isOpen' | 'destroy'>;

let activeConfig: CollaborationCoordinationConfig | null = null;
let redisClient: RedisClientState | null = null;
let redisReady = false;
let initialRedisConnection = true;

export async function configureCollaborationSocketAdapter(
  io: Server,
  env: NodeJS.ProcessEnv = process.env,
) {
  if (activeConfig) throw new Error('Collaboration Socket.IO adapter has already been configured');
  const config = resolveCollaborationCoordinationConfig(env);
  activeConfig = config;

  if (config.mode === 'single') {
    return config;
  }

  const client = createClient({
    url: config.redisUrl,
    socket: {
      connectTimeout: 5_000,
      reconnectStrategy: (retries) => {
        // A cold start must fail promptly if the configured coordination store
        // is unavailable. Once connected, transient disconnects keep retrying.
        if (initialRedisConnection && retries >= 3) return new Error('Redis Streams startup connection failed');
        return Math.min(retries * 500, 10_000);
      },
    },
  });
  redisClient = client;
  client.on('error', () => {
    redisReady = false;
    apiLogger.error({ module: 'collaboration', operation: 'redis_streams.connection_error' }, 'api.collaboration.redis_connection_error');
  });
  client.on('reconnecting', () => {
    redisReady = false;
    apiLogger.warn({ module: 'collaboration', operation: 'redis_streams.reconnecting' }, 'api.collaboration.redis_reconnecting');
  });
  client.on('ready', () => {
    initialRedisConnection = false;
    redisReady = true;
    apiLogger.info({ module: 'collaboration', operation: 'redis_streams.ready' }, 'api.collaboration.redis_ready');
  });
  client.on('end', () => {
    redisReady = false;
  });

  try {
    await client.connect();
    if (!client.isReady) throw new Error('Redis Streams coordination did not become ready');
    io.adapter(createAdapter(client, {
      streamName: `${config.channelPrefix}:socketio:stream`,
      channelPrefix: `${config.channelPrefix}:socketio:channel`,
      maxLen: 10_000,
    }));
    redisReady = true;
    return config;
  } catch (error) {
    redisReady = false;
    if (client.isOpen) client.destroy();
    redisClient = null;
    activeConfig = null;
    initialRedisConnection = true;
    apiLogger.error({
      module: 'collaboration',
      operation: 'redis_streams.initialization_failed',
      error: { code: 'COORDINATION_UNAVAILABLE', name: error instanceof Error ? error.name : 'UnknownError' },
    }, 'api.collaboration.redis_initialization_failed');
    throw new Error('Unable to initialize Redis Streams coordination; refusing unsafe multi-instance startup');
  }
}

export function isCollaborationCoordinationReady() {
  if (!activeConfig || activeConfig.mode === 'single') return true;
  return redisReady && Boolean(redisClient?.isReady);
}

export function getCollaborationCoordinationMode(): CollaborationAdapterMode {
  return activeConfig?.mode ?? 'single';
}

export function closeCollaborationSocketAdapter() {
  redisReady = false;
  if (redisClient?.isOpen) redisClient.destroy();
  redisClient = null;
  activeConfig = null;
  initialRedisConnection = true;
}
