import { createLoginRolloutPolicy, readLoginRolloutPolicyConfig } from '../rollout/login-rollout-policy.js';

export type SocketBridgeGateStatus = {
  socketBridgeEnabled: boolean;
  socketBridgeApproval: boolean;
  socketV1EligibleUserCount: number;
  currentMode: 'legacy' | 'allowlist';
};

export function readSocketProductionBridgeGate(env: NodeJS.ProcessEnv = process.env): SocketBridgeGateStatus {
  const loginPolicy = readLoginRolloutPolicyConfig(env);
  const socketBridgeEnabled = env.XMT_SOCKET_AUTH_BRIDGE_ENABLED === 'true';
  const socketBridgeApproval = env.XMT_SOCKET_BRIDGE_APPROVED === 'true';
  if (env.NODE_ENV !== 'production') {
    return {
      socketBridgeEnabled,
      socketBridgeApproval,
      socketV1EligibleUserCount: loginPolicy.allowlistedUserIds.size,
      currentMode: socketBridgeEnabled ? 'allowlist' : 'legacy',
    };
  }
  const productionAllowed = env.NODE_ENV !== 'production' || socketBridgeApproval;
  const allowlistMode = loginPolicy.enabled && loginPolicy.mode === 'allowlist';
  return {
    socketBridgeEnabled: socketBridgeEnabled && productionAllowed && allowlistMode,
    socketBridgeApproval,
    socketV1EligibleUserCount: allowlistMode ? loginPolicy.allowlistedUserIds.size : 0,
    currentMode: socketBridgeEnabled && productionAllowed && allowlistMode ? 'allowlist' : 'legacy',
  };
}

export function isSocketV1EligibleUser(user: { id: number; role?: string | null }, env: NodeJS.ProcessEnv = process.env): boolean {
  const decision = createLoginRolloutPolicy(env).decide(user);
  return decision.mode === 'v1-web' && decision.reason === 'allowlist';
}
