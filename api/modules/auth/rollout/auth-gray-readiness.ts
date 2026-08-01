export type GrayReadinessUser = { id: number; role: string; enabled: boolean };

export type GrayReadiness = {
  authV1: 'READY' | 'NOT_READY';
  loginGateway: 'READY' | 'NOT_READY';
  socketBridge: 'READY' | 'NOT_READY';
  browserFixture: 'READY' | 'NOT_READY';
  rollback: 'READY' | 'NOT_READY';
  observationWindow: 'READY' | 'NOT_READY';
  overall: 'READY' | 'NOT_READY';
  reasons: string[];
};

export function assessAuthGrayReadiness(input: {
  authV1Enabled: boolean; authWebEnabled: boolean; loginRolloutEnabled: boolean;
  socketBridgeEnabled: boolean; socketBridgeApproved: boolean;
  mode: string; users: GrayReadinessUser[]; browserFixture: boolean;
  rollbackReady: boolean; observationWindowMinutes: number;
}): GrayReadiness {
  const reasons: string[] = [];
  const membersOnly = input.users.length >= 2 && input.users.length <= 3 && input.users.every((user) => user.enabled && user.role === 'member');
  if (!membersOnly) reasons.push('allowlist 必须是 2–3 个 enabled member，且不得包含 admin/director');
  const authV1 = input.authV1Enabled && input.authWebEnabled ? 'READY' : 'NOT_READY';
  const loginGateway = input.loginRolloutEnabled && input.mode === 'allowlist' && membersOnly ? 'READY' : 'NOT_READY';
  const socketBridge = input.socketBridgeEnabled && input.socketBridgeApproved && membersOnly ? 'READY' : 'NOT_READY';
  const browserFixture = input.browserFixture ? 'READY' : 'NOT_READY';
  const rollback = input.rollbackReady ? 'READY' : 'NOT_READY';
  const observationWindow = input.observationWindowMinutes >= 30 && input.observationWindowMinutes <= 60 ? 'READY' : 'NOT_READY';
  const overall = [authV1, loginGateway, socketBridge, browserFixture, rollback, observationWindow].every((value) => value === 'READY') ? 'READY' : 'NOT_READY';
  return { authV1, loginGateway, socketBridge, browserFixture, rollback, observationWindow, overall, reasons };
}
