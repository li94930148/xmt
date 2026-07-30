import express from 'express';
import { loginAccountLimiter, loginIpLimiter, logFailedLogin } from '../../middleware/rateLimit.js';
import { authenticate } from '../../middleware/auth.js';
import { passwordChangeLimiter } from '../../middleware/rateLimit.js';
import type { AuthController } from './auth.controller.js';

export function createLegacyAuthRouter(controller: AuthController) {
  const router = express.Router();
  router.post('/login', loginIpLimiter, loginAccountLimiter, logFailedLogin, controller.login);
  router.post('/logout', authenticate, controller.logout);
  router.get('/me', authenticate, controller.getMe);
  router.post('/change-password', passwordChangeLimiter, authenticate, controller.changePassword);
  return router;
}
