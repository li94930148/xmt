import rateLimit from 'express-rate-limit';

// 通用 API 限制：每分钟 200 次请求
export const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 分钟
  max: 200,
  message: {
    success: false,
    error: '请求过于频繁，请稍后再试',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// 登录接口限制：每 15 分钟最多 20 次尝试
export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 分钟
  max: 20,
  message: {
    success: false,
    error: '登录尝试次数过多，请 15 分钟后再试',
  },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true, // 成功的请求不计入限制
});

// 密码修改限制：每小时最多 3 次
export const passwordChangeLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 小时
  max: 3,
  message: {
    success: false,
    error: '密码修改尝试次数过多，请 1 小时后再试',
  },
  standardHeaders: true,
  legacyHeaders: false,
});
