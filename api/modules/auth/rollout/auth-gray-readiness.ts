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
  rollbackReady: boolean; observationWindowMinutes: number; runtimeReachable?: boolean;
}): GrayReadiness {
  const reasons: string[] = [];
  if (input.runtimeReachable === false) reasons.push('无法读取实际 PM2 运行态 Auth 配置');
  const membersOnly = input.users.length >= 2 && input.users.length <= 3 && input.users.every((user) => user.enabled && user.role === 'member');
  if (!membersOnly) reasons.push('allowlist 必须是 2–3 个 enabled member，且不得包含 admin/director');
  const authV1 = input.authV1Enabled && input.authWebEnabled ? 'READY' : 'NOT_READY';
  const loginGateway = input.loginRolloutEnabled && input.mode === 'allowlist' && membersOnly ? 'READY' : 'NOT_READY';
  const socketBridge = input.socketBridgeEnabled && input.socketBridgeApproved && membersOnly ? 'READY' : 'NOT_READY';
  const browserFixture = input.browserFixture ? 'READY' : 'NOT_READY';
  const rollback = input.rollbackReady ? 'READY' : 'NOT_READY';
  const observationWindow = input.observationWindowMinutes >= 30 && input.observationWindowMinutes <= 60 ? 'READY' : 'NOT_READY';
  if (authV1 === 'NOT_READY') reasons.push('实际运行进程未同时启用 Auth v1 与 Auth Web');
  if (loginGateway === 'NOT_READY') reasons.push('实际运行进程未以 allowlist 模式启用 Login Gateway');
  if (socketBridge === 'NOT_READY') reasons.push('实际运行进程未完成 Socket Bridge 开关与审批门禁');
  if (browserFixture === 'NOT_READY') reasons.push('浏览器灰度验证夹具不存在');
  if (rollback === 'NOT_READY') reasons.push('未发现灰度配置回滚备份');
  if (observationWindow === 'NOT_READY') reasons.push('观察窗口必须设置为 30–60 分钟');
  const overall = input.runtimeReachable !== false && [authV1, loginGateway, socketBridge, browserFixture, rollback, observationWindow].every((value) => value === 'READY') ? 'READY' : 'NOT_READY';
  return { authV1, loginGateway, socketBridge, browserFixture, rollback, observationWindow, overall, reasons };
}
