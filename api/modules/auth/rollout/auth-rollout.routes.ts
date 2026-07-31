import express from 'express';
import { authenticate, requireRole } from '../../../middleware/auth.js';
import { AuthRolloutController } from './auth-rollout.controller.js';

const controller = new AuthRolloutController();
export const authRolloutGovernanceRouter = express.Router();

authRolloutGovernanceRouter.get('/status', authenticate, requireRole(['admin']), controller.status);
