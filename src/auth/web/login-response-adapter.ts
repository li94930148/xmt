import type { AuthSessionSummary, AuthV1User } from '../../../shared/schema/auth.schema';
import type { User } from '../../types';

export type AuthLoginMode = 'legacy' | 'v1-web';

export type AuthLoginResult = {
  user: User;
  accessToken: string;
  authMode: AuthLoginMode;
  forceChangePassword: boolean;
  session?: AuthSessionSummary;
  requestId?: string;
};

export class LoginResponseAdapterError extends Error {
  constructor(message = '登录响应格式无效') {
    super(message);
    this.name = 'LoginResponseAdapterError';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function requireNumber(value: unknown, field: string): number {
  if (!Number.isSafeInteger(value) || Number(value) <= 0) {
    throw new LoginResponseAdapterError(`登录响应缺少有效${field}`);
  }
  return Number(value);
}

function requireString(value: unknown, field: string): string {
  if (!isString(value)) throw new LoginResponseAdapterError(`登录响应缺少有效${field}`);
  return value;
}

function toLegacyUser(value: unknown): User {
  if (!isRecord(value)) throw new LoginResponseAdapterError('登录响应缺少用户信息');
  return {
    id: requireNumber(value.id, '用户 ID'),
    username: requireString(value.username, '用户名'),
    password: typeof value.password === 'string' ? value.password : '',
    email: typeof value.email === 'string' ? value.email : '',
    role: requireString(value.role, '用户角色'),
    name: requireString(value.name, '用户名称'),
    enabled: value.enabled !== false,
    force_change_password: value.force_change_password === true,
    created_at: typeof value.created_at === 'string' ? value.created_at : '',
    updated_at: typeof value.updated_at === 'string' ? value.updated_at : '',
  };
}

function toV1User(value: unknown): User {
  if (!isRecord(value)) throw new LoginResponseAdapterError('v1 登录响应缺少用户信息');
  return {
    id: requireNumber(value.id, '用户 ID'),
    username: requireString(value.username, '用户名'),
    password: '',
    email: typeof value.email === 'string' ? value.email : '',
    role: requireString(value.role, '用户角色'),
    name: requireString(value.name, '用户名称'),
    enabled: true,
    force_change_password: value.forceChangePassword === true,
    created_at: '',
    updated_at: '',
  };
}

function toSession(value: unknown): AuthSessionSummary {
  if (!isRecord(value)) throw new LoginResponseAdapterError('v1 登录响应缺少会话信息');
  return {
    id: requireString(value.id, '会话 ID'),
    clientType: requireString(value.clientType, '会话客户端类型'),
    deviceName: typeof value.deviceName === 'string' ? value.deviceName : null,
    appVersion: typeof value.appVersion === 'string' ? value.appVersion : null,
    createdAt: requireString(value.createdAt, '会话创建时间'),
    lastSeenAt: requireString(value.lastSeenAt, '会话最后访问时间'),
    idleExpiresAt: requireString(value.idleExpiresAt, '会话空闲过期时间'),
    absoluteExpiresAt: requireString(value.absoluteExpiresAt, '会话绝对过期时间'),
    current: value.current === true,
  };
}

/** Converts the two login contracts into a token-safe UI result. */
export function adaptLoginResponse(payload: unknown): AuthLoginResult {
  if (!isRecord(payload)) throw new LoginResponseAdapterError();

  // The legacy branch is deliberately first and preserves its response contract.
  if (isRecord(payload.user) && isString(payload.token)) {
    const user = toLegacyUser(payload.user);
    return {
      user,
      accessToken: payload.token,
      authMode: 'legacy',
      forceChangePassword: payload.forceChangePassword === true || user.force_change_password === true,
    };
  }

  if (payload.success !== true || !isRecord(payload.data)) throw new LoginResponseAdapterError();
  const data = payload.data;
  const user = toV1User(data.user);
  return {
    user,
    accessToken: requireString(data.accessToken, 'Access Token'),
    authMode: 'v1-web',
    forceChangePassword: user.force_change_password === true,
    session: toSession(data.session),
    requestId: typeof payload.requestId === 'string' ? payload.requestId : undefined,
  };
}

export function toAuthV1User(user: User): AuthV1User {
  return {
    id: user.id,
    username: user.username,
    name: user.name,
    email: user.email,
    role: user.role,
    forceChangePassword: user.force_change_password === true,
  };
}
