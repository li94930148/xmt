import express from 'express';
import { createAsyncRouter } from '../../../middleware/async-router';
import { authenticate, requireRole } from '../../../middleware/auth.js';
import { AuthRolloutController } from './auth-rollout.controller.js';

const controller = new AuthRolloutController();
export const authRolloutGovernanceRouter = createAsyncRouter();

authRolloutGovernanceRouter.get('/status', authenticate, requireRole(['admin']), controller.status);
