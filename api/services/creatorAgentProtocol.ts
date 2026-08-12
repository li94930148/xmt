export function requireCreatorAgentV1(body: Record<string, unknown>, endpoint: 'data-sync' | 'report') {
  if (body.protocol_version === 1) return;
  console.warn('[CreatorAgent][legacy-protocol]', { endpoint, protocolVersion: body.protocol_version ?? null, enforcement: process.env.XMT_CREATOR_AGENT_V1_ONLY === 'true' });
  if (process.env.XMT_CREATOR_AGENT_V1_ONLY === 'true') {
    throw Object.assign(new Error('Creator Agent 仅接受 protocol_version=1'), { statusCode: 426 });
  }
}
