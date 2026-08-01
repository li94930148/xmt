import {
  LoginGatewayController,
  createAuthModule,
  createLoginRolloutPolicy,
  createLegacyAuthRouter,
} from '../modules/auth/index.js';
import { createAuthV1Module, isAuthV1Enabled } from '../modules/auth/v1/index.js';

const authModule = createAuthModule();
const loginRolloutEnabled = process.env.XMT_LOGIN_ROLLOUT_ENABLED === 'true';
const authV1Module = loginRolloutEnabled && isAuthV1Enabled() && process.env.XMT_AUTH_REFRESH_PEPPER?.trim()
  ? createAuthV1Module(process.env.XMT_AUTH_REFRESH_PEPPER.trim())
  : null;
const loginGateway = new LoginGatewayController({
  repository: authModule.repository,
  policy: createLoginRolloutPolicy(),
  legacyLogin: authModule.controller.login,
  v1WebLogin: authV1Module?.controller.login,
});

export default createLegacyAuthRouter({ ...authModule.controller, login: loginGateway.login });
