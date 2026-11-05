import {
  LoginGatewayController,
  createAuthModule,
  createLoginRolloutPolicy,
  createLegacyAuthRouter,
} from '../modules/auth/index.js';
import { createAuthV1Module } from '../modules/auth/v1/index.js';
import { authRolloutRuntimeConfig } from '../config/auth-rollout-runtime.js';
import { resolveAppRuntimeConfig } from '../config/app-runtime.js';

const authModule = createAuthModule();
const loginRolloutEnabled = authRolloutRuntimeConfig.loginRolloutEnabled;
const appRuntimeConfig = resolveAppRuntimeConfig();
const authV1Module = appRuntimeConfig.authV1LoginEnabled
  ? createAuthV1Module(appRuntimeConfig.authRefreshPepper)
  : null;
const loginGateway = new LoginGatewayController({
  repository: authModule.repository,
  policy: createLoginRolloutPolicy(),
  legacyLogin: authModule.controller.login,
  v1WebLogin: authV1Module?.controller.login,
});

export default createLegacyAuthRouter({ ...authModule.controller, login: loginGateway.login });
