export type CollaborationAdapterMode = 'single' | 'redis-streams';

export interface CollaborationCoordinationConfig {
  mode: CollaborationAdapterMode;
  instanceCount: number;
  redisUrl?: string;
  channelPrefix: string;
}

export function resolveCollaborationCoordinationConfig(
  env: NodeJS.ProcessEnv = process.env,
): CollaborationCoordinationConfig {
  const modeValue = (env.XMT_SOCKET_ADAPTER || 'single').trim();
  if (modeValue !== 'single' && modeValue !== 'redis-streams') {
    throw new Error('XMT_SOCKET_ADAPTER must be single or redis-streams');
  }

  const instanceCountValue = env.XMT_WEB_INSTANCE_COUNT || '1';
  const instanceCount = Number(instanceCountValue);
  if (!/^\d+$/.test(instanceCountValue) || !Number.isInteger(instanceCount) || instanceCount < 1 || instanceCount > 64) {
    throw new Error('XMT_WEB_INSTANCE_COUNT must be an integer from 1 to 64');
  }

  const redisUrl = env.XMT_REDIS_URL?.trim();
  if (modeValue === 'redis-streams' && !redisUrl) {
    throw new Error('XMT_REDIS_URL is required when XMT_SOCKET_ADAPTER=redis-streams');
  }
  if (instanceCount > 1 && modeValue !== 'redis-streams') {
    throw new Error('Multiple web instances require XMT_SOCKET_ADAPTER=redis-streams');
  }

  const channelPrefix = (env.XMT_SOCKET_ADAPTER_CHANNEL_PREFIX || `xmt:${env.NODE_ENV || 'development'}`).trim();
  if (!/^[a-zA-Z0-9:_-]{1,100}$/.test(channelPrefix)) {
    throw new Error('XMT_SOCKET_ADAPTER_CHANNEL_PREFIX must contain 1 to 100 letters, numbers, colons, underscores, or hyphens');
  }

  return {
    mode: modeValue,
    instanceCount,
    ...(modeValue === 'redis-streams' ? { redisUrl } : {}),
    channelPrefix,
  };
}
