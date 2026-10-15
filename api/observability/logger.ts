import pino from 'pino';

const environment = process.env.NODE_ENV || 'development';

export const apiLogger = pino({
  name: 'xmt-api',
  level: process.env.LOG_LEVEL || (environment === 'test' ? 'silent' : 'info'),
  base: {
    service: 'xmt-api',
    environment,
  },
  redact: {
    paths: [
      'password',
      'token',
      'accessToken',
      'refreshToken',
      'authorization',
      'cookie',
      'headers.authorization',
      'headers.cookie',
      'req.headers.authorization',
      'req.headers.cookie',
    ],
    censor: '[REDACTED]',
  },
});
