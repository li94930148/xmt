import { apiLogger } from '../observability/logger.js';

export function requireCreatorAgentV1(body: Record<string, unknown>, endpoint: 'data-sync' | 'report') {
  if (body.protocol_version === 1) return;
  apiLogger.warn({
    module: 'creator_agent',
    operation: 'protocol.rejected',
    endpoint,
    protocolVersion: typeof body.protocol_version === 'number' && Number.isSafeInteger(body.protocol_version)
      ? body.protocol_version
      : undefined,
    error: { code: 'PROTOCOL_VERSION_UNSUPPORTED' },
  }, 'api.creator_agent.protocol_rejected');
  throw Object.assign(new Error('Creator Agent 仅接受 protocol_version=1'), { statusCode: 426 });
}
