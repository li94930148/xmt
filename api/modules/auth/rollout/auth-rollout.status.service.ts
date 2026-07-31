import type { AuthRolloutConfig, AuthRolloutMode } from './auth-rollout.config.js';
import { isWebAuthRolloutEnabled } from './auth-rollout.config.js';
import type { AuthRolloutUser } from './auth-rollout.service.js';
import { AuthRolloutService } from './auth-rollout.service.js';

export type AuthRolloutMatchedRule = AuthRolloutMode | 'none';

export class AuthRolloutStatusService {
  private readonly rollout: AuthRolloutService;

  constructor(private readonly config: AuthRolloutConfig) {
    this.rollout = new AuthRolloutService(config);
  }

  diagnose(user: AuthRolloutUser) {
    const enabled = this.rollout.shouldUseWebAuth(user);
    const mode = this.config.mode;
    let reason: string;

    if (mode === 'disabled') reason = 'Auth Web 灰度能力已关闭';
    else if (mode === 'legacy') reason = '当前配置要求继续使用 legacy';
    else if (mode === 'internal') reason = enabled ? '用户命中内部账号名单' : '用户未命中内部账号名单';
    else if (mode === 'allowlist') reason = enabled ? '用户命中灰度白名单' : '用户未命中灰度白名单';
    else {
      const bucket = this.rollout.bucketForUser(user.id);
      reason = enabled
        ? `用户稳定分桶 ${bucket} 命中 ${this.config.percentage}% 灰度范围`
        : `用户稳定分桶 ${bucket} 未命中 ${this.config.percentage}% 灰度范围`;
    }

    return {
      mode,
      enabled,
      matchedRule: enabled ? mode : 'none' as AuthRolloutMatchedRule,
      reason,
    };
  }

  current() {
    return {
      mode: this.config.mode,
      enabled: isWebAuthRolloutEnabled(this.config),
      percentage: this.config.percentage,
      allowlistCount: this.config.allowlistedUserIds.size,
      internalCount: this.config.internalUserIds.size,
    };
  }
}
