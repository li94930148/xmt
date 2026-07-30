import express from 'express';
import { loginAccountLimiter, loginIpLimiter, logFailedLogin } from '../../middleware/rateLimit.js';
import type { AuthController } from './auth.controller.js';

export function createLegacyAuthRouter(controller: AuthController) {
  const router = express.Router();
  router.post('/login', loginIpLimiter, loginAccountLimiter, logFailedLogin, controller.login);
  return router;
}
