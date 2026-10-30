import type { AuthRolloutMode } from '../api/authRollout';

export function getAuthRolloutModeLabel(mode: AuthRolloutMode, percentage: number) {
  const labels: Record<AuthRolloutMode, string> = {
    disabled: '新版登录已关闭',
    legacy: '现有登录方式',
    internal: '内部账号试用',
    allowlist: '白名单账号试用',
    percentage: `按比例试用（${percentage}%）`,
  };
  return labels[mode];
}

export function getExistingLoginReadiness(runtimeMode: AuthRolloutMode, configuredMode: AuthRolloutMode, percentage: number) {
  if (runtimeMode === 'legacy') {
    return { ready: true, description: '当前运行仍使用现有登录方式，正式账号不会进入新版登录试用。' };
  }
  if (runtimeMode === 'disabled') {
    return { ready: true, description: '新版登录灰度已关闭，正式账号继续使用现有登录方式。' };
  }
  if (runtimeMode === 'allowlist' && configuredMode === 'allowlist') {
    return { ready: true, description: '当前运行和灰度配置均限定在指定试用名单内，不会自动扩大范围。' };
  }
  if (runtimeMode === 'allowlist') {
    return {
      ready: false,
      description: `运行时为白名单账号试用，但灰度配置为“${getAuthRolloutModeLabel(configuredMode, percentage)}”。请先核对配置一致性，再扩大试用范围。`,
    };
  }
  return {
    ready: false,
    description: `当前运行模式为“${getAuthRolloutModeLabel(runtimeMode, percentage)}”，不符合现阶段仅使用现有登录或白名单试用的条件。请先核对并调整配置。`,
  };
}
