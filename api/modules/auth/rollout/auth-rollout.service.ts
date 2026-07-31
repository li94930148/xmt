import { createHash } from 'node:crypto';
import type { AuthRolloutConfig } from './auth-rollout.config.js';

export type AuthRolloutUser = {
  id: number;
  internal?: boolean;
};

export class AuthRolloutService {
  constructor(private readonly config: AuthRolloutConfig) {}

  shouldUseWebAuth(user: AuthRolloutUser): boolean {
    switch (this.config.mode) {
      case 'internal':
        return user.internal === true || this.config.internalUserIds.has(user.id);
      case 'allowlist':
        return this.config.allowlistedUserIds.has(user.id);
      case 'percentage':
        return this.bucketForUser(user.id) < Math.round(this.config.percentage * 100);
      case 'disabled':
      case 'legacy':
        return false;
    }
  }

  bucketForUser(userId: number): number {
    const digest = createHash('sha256')
      .update(`${this.config.hashSalt}:${userId}`)
      .digest();
    return digest.readUInt32BE(0) % 10_000;
  }
}
