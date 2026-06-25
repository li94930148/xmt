import rateLimit, { ipKeyGenerator } from 'express-rate-limit';

const LOGIN_WINDOW_MS = 15 * 60 * 1000;

function normalizeLoginUsername(value: unknown) {
  if (typeof value !== 'string') return 'anonymous';

  const normalized = value.trim().toLowerCase();
  return normalized || 'anonymous';
}

// 通用 API 限制：每分钟 200 次请求
export const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 200,
  message: {
    success: false,
    error: '请求过于频繁，请稍后再试',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// 登录接口限制：按 username + 客户端 IP 统计，避免反代后单 IP 误伤全站用户
export const loginLimiter = rateLimit({
  windowMs: LOGIN_WINDOW_MS,
  max: 20,
  keyGenerator: (req) => {
    const username = normalizeLoginUsername(req.body?.username);
    return `${username}:${ipKeyGenerator(req.ip || '')}`;
  },
  handler: (_req, res) => {
    res.status(429).json({
      success: false,
      error: 'Too many login attempts',
      message: '登录试错次数过多，请稍后再试',
      retryAfterSeconds: Math.ceil(LOGIN_WINDOW_MS / 1000),
    });
  },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
});

// 密码修改限制：每小时最多 3 次
export const passwordChangeLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 3,
  message: {
    success: false,
    error: '密码修改尝试次数过多，请 1 小时后再试',
  },
  standardHeaders: true,
  legacyHeaders: false,
});
