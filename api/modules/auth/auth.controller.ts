import type { Request, Response } from 'express';
import type { AuthService } from './auth.service.js';
import { AuthServiceError } from './auth.types.js';

export class AuthController {
  constructor(private readonly service: AuthService) {}

  login = async (req: Request, res: Response) => {
    try {
      const { username, password, remember } = req.body;
      const result = await this.service.login({ username, password, remember });
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
}
