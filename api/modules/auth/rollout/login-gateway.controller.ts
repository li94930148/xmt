import type { Request, Response } from 'express';
import type { AuthRepository } from '../auth.repository.js';
import type { LoginRolloutPolicy } from './login-rollout-policy.js';

export type LoginHandler = (req: Request, res: Response) => Promise<Response | undefined>;

type LoginGatewayDependencies = {
  repository: Pick<AuthRepository, 'findUserByUsername'>;
  policy: LoginRolloutPolicy;
  legacyLogin: LoginHandler;
  v1WebLogin?: LoginHandler;
};

/**
 * Decides the login transport before credential verification. The legacy handler
 * remains the exact implementation for every non-eligible request.
 */
export class LoginGatewayController {
  constructor(private readonly dependencies: LoginGatewayDependencies) {}

  login: LoginHandler = async (req, res) => {
    const username = typeof req.body?.username === 'string' ? req.body.username : null;
    const user = username ? await this.dependencies.repository.findUserByUsername(username) : null;
    const decision = user ? this.dependencies.policy.decide({ id: user.id, role: user.role }) : null;

    // B2 only permits explicit allowlists; percentage rollout is intentionally not wired here.
    if (decision?.mode === 'v1-web' && decision.reason === 'allowlist' && this.dependencies.v1WebLogin) {
      req.body = {
        ...req.body,
        client: req.body?.client ?? { type: 'web', deviceName: 'XMT Web Login Gateway' },
      };
      return this.dependencies.v1WebLogin(req, res);
    }

    return this.dependencies.legacyLogin(req, res);
  };
}
