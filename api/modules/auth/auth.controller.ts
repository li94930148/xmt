import type { Request, Response } from 'express';
import type { AuthService } from './auth.service.js';
import { AuthServiceError } from './auth.types.js';
import { authMigrationLogger } from './rollout/auth-migration.logger.js';
import { authMigrationMetrics } from './rollout/auth-migration.metrics.js';

export class AuthController {
  constructor(private readonly service: AuthService) {}

  login = async (req: Request, res: Response) => {
    try {
      const { username, password, remember } = req.body;
      const result = await this.service.login({ username, password, remember });
      authMigrationMetrics.increment('legacy_login_count');
      authMigrationLogger.record({ event: 'auth.migration.login', requestId: req.requestId, userId: result.user.id, mode: 'legacy', outcome: 'success' });
      res.json(result);
    } catch (error) {
      if (error instanceof AuthServiceError) {
        if (error.code === 'MISSING_CREDENTIALS') {
          return res.status(400).json({ message: '用户名和密码不能为空' });
        }
        if (error.code === 'ACCOUNT_DISABLED') {
          return res.status(401).json({ message: '账号已被禁用' });
        }
        return res.status(401).json({ message: '用户名或密码错误' });
      }
      return res.status(500).json({ message: '登录失败' });
    }
  };

  getMe = async (req: Request, res: Response) => {
    try {
      const result = await this.service.getCurrentUser(req.user?.id);
      res.json(result);
    } catch (error) {
      if (error instanceof AuthServiceError) {
        if (error.code === 'USER_NOT_FOUND') {
          return res.status(401).json({ message: '用户不存在' });
        }
        if (error.code === 'ACCOUNT_DISABLED') {
          return res.status(401).json({ message: '账号已被禁用' });
        }
        return res.status(401).json({ message: '未登录' });
      }
      return res.status(500).json({ message: '获取用户信息失败' });
    }
  };

  changePassword = async (req: Request, res: Response) => {
    try {
      await this.service.changePassword({
        userId: req.user?.id,
        oldPassword: req.body.oldPassword,
        newPassword: req.body.newPassword,
      });
      res.json({ message: '密码修改成功' });
    } catch (error) {
      if (error instanceof AuthServiceError) {
        if (error.code === 'MISSING_PASSWORDS') {
          return res.status(400).json({ message: '旧密码和新密码不能为空' });
        }
        if (error.code === 'NEW_PASSWORD_TOO_SHORT') {
          return res.status(400).json({ message: '新密码至少6位' });
        }
        if (error.code === 'USER_NOT_FOUND') {
          return res.status(404).json({ message: '用户不存在' });
        }
        if (error.code === 'OLD_PASSWORD_INCORRECT') {
          return res.status(401).json({ message: '旧密码错误' });
        }
        return res.status(401).json({ message: '未登录' });
      }
      return res.status(500).json({ message: '修改密码失败' });
    }
  };

  logout = async (_req: Request, res: Response) => {
    await this.service.logout();
    res.json({ message: '登出成功' });
  };
}
