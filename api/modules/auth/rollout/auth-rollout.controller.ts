import type { Request, Response } from 'express';
import { sendV1Error, sendV1Success } from '../../../utils/response.js';
import { authRolloutStatusQuerySchema } from '../../../../shared/schema/auth-rollout.schema.js';
import {
  authMigrationMetricsService,
  authRolloutAuditService,
  authRolloutRiskService,
  authRolloutStatusService,
  authRolloutThresholds,
} from './auth-rollout-governance.js';

export class AuthRolloutController {
  status = (req: Request, res: Response) => {
    const query = authRolloutStatusQuerySchema.safeParse(req.query);
    if (!query.success) {
      return sendV1Error(req, res, {
        code: 'VALIDATION_ERROR',
        message: '请求参数不合法',
        details: query.error.flatten(),
      }, 400);
    }
    const userId = query.data.userId ?? req.user?.id ?? null;
    if (!userId) {
      return sendV1Error(req, res, {
        code: 'VALIDATION_ERROR',
        message: 'userId 必须为正整数',
      }, 400);
    }

    const risk = authRolloutRiskService.evaluate();
    return sendV1Success(req, res, {
      rollout: authRolloutStatusService.current(),
      diagnostic: {
        userId,
        ...authRolloutStatusService.diagnose({ id: userId }),
      },
      metrics: {
        lastHour: authMigrationMetricsService.aggregate(60),
        last24Hours: authMigrationMetricsService.aggregate(24 * 60),
      },
      risk: { status: risk.status, events: risk.risks },
      thresholds: authRolloutThresholds,
      audits: authRolloutAuditService.list(20),
      generatedAt: new Date().toISOString(),
    });
  };
}
