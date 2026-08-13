import { useAuthStore } from '../store';
import type { User } from '../types';
import { adaptLoginResponse, type AuthLoginResult } from '../auth/web/login-response-adapter';
import { emitAuthLoginDebugTrace } from '../auth/web/auth-login-debug';
import { apiFetch } from './transport';

declare const __APP_VERSION__: string;

const BASE_URL = '/api';

export type LoginErrorKind = 'invalid_credentials' | 'rate_limited' | 'account_unavailable' | 'server_unavailable';
export type LoginRateLimitDimension = 'api' | 'login_ip' | 'login_account';

export class LoginError extends Error {
  status?: number;
  kind: LoginErrorKind;
  retryAfterSeconds?: number;
  remainingAttempts?: number;
  rateLimitDimension?: LoginRateLimitDimension;

  constructor(
    message: string,
    kind: LoginErrorKind,
    options: { status?: number; retryAfterSeconds?: number; remainingAttempts?: number; rateLimitDimension?: LoginRateLimitDimension } = {},
  ) {
    super(message);
    this.name = 'LoginError';
    this.kind = kind;
    this.status = options.status;
    this.retryAfterSeconds = options.retryAfterSeconds;
    this.remainingAttempts = options.remainingAttempts;
    this.rateLimitDimension = options.rateLimitDimension;
  }
}

function getAuthHeader(): Record<string, string> {
  const token = useAuthStore.getState().token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
  return response.json().catch(() => ({}));
}

function readRetryAfterSeconds(response: Response, body: Record<string, unknown>) {
  const bodySeconds = Number(body.retryAfterSeconds);
  if (Number.isFinite(bodySeconds) && bodySeconds > 0) {
    return Math.ceil(bodySeconds);
  }

  const retryAfter = response.headers.get('Retry-After');
  if (!retryAfter) return undefined;

  const headerSeconds = Number(retryAfter);
  if (Number.isFinite(headerSeconds) && headerSeconds > 0) {
    return Math.ceil(headerSeconds);
  }

  const retryDate = Date.parse(retryAfter);
  if (Number.isFinite(retryDate)) {
    return Math.max(1, Math.ceil((retryDate - Date.now()) / 1000));
  }

  return undefined;
}

function readRemainingAttempts(body: Record<string, unknown>) {
  const remainingAttempts = Number(body.remainingAttempts);
  return Number.isFinite(remainingAttempts) && remainingAttempts >= 0 ? Math.floor(remainingAttempts) : undefined;
}

function createLoginAttemptId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `xmt-login-${crypto.randomUUID()}`;
  }
  return `xmt-login-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export async function login(username: string, password: string): Promise<AuthLoginResult> {
  let response: Response;
  const loginAttemptId = createLoginAttemptId();

  try {
    response = await fetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Request-ID': loginAttemptId },
      body: JSON.stringify({ username, password }),
    });
  } catch {
    throw new LoginError('当前服务暂时不可用，请稍后再试。', 'server_unavailable');
  }

  if (!response.ok) {
    const body = await readJson(response);

    if (response.status === 429) {
      throw new LoginError('试错次数过多，请稍后再试。', 'rate_limited', {
        status: response.status,
        retryAfterSeconds: readRetryAfterSeconds(response, body),
        remainingAttempts: readRemainingAttempts(body),
        rateLimitDimension: readRateLimitDimension(body),
      });
    }

    const v1Error = body.error && typeof body.error === 'object'
      ? (body.error as { message?: unknown }).message
      : undefined;
    const rawMessage = typeof body.message === 'string'
      ? body.message
      : typeof v1Error === 'string' ? v1Error : '';
    if (response.status === 401 && rawMessage.includes('禁用')) {
      throw new LoginError('当前账号暂不可用，请联系管理员。', 'account_unavailable', { status: response.status });
    }

    if (response.status === 400 || response.status === 401) {
      throw new LoginError('用户名或密码不正确，请检查后重试。', 'invalid_credentials', { status: response.status });
    }

    throw new LoginError('当前服务暂时不可用，请稍后再试。', 'server_unavailable', { status: response.status });
  }

  const payload = await response.json();
  const responseKind = payload && typeof payload === 'object' && (payload as { success?: unknown }).success === true
    ? 'v1-envelope'
    : 'legacy';
  const requestId = response.headers.get('X-Request-ID') ?? undefined;
  emitAuthLoginDebugTrace('auth.response.received', {
    responseKind, status: response.status, requestId: requestId ?? null, loginAttemptId,
  });
  return adaptLoginResponse(payload, { requestId, loginAttemptId });
}

export async function mobileLogin(username: string, password: string): Promise<AuthLoginResult & { refreshToken: string }> {
  let response: Response;
  try {
    response = await apiFetch('/v1/auth/mobile/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password, client: { type: 'android', deviceName: 'XMT Android', appVersion: __APP_VERSION__ } }),
    });
  } catch { throw new LoginError('当前网络不可用，请检查连接后重试。', 'server_unavailable'); }
  if (!response.ok) throw new LoginError(response.status === 401 ? '用户名或密码不正确，请检查后重试。' : '当前服务暂时不可用，请稍后再试。', response.status === 401 ? 'invalid_credentials' : 'server_unavailable', { status: response.status });
  const payload = await response.json() as { data?: { refreshToken?: unknown } };
  const refreshToken = payload.data?.refreshToken;
  if (typeof refreshToken !== 'string' || refreshToken.length < 32) throw new LoginError('移动认证响应无效，请重试。', 'server_unavailable');
  return { ...adaptLoginResponse(payload), refreshToken };
}

export async function getMe(): Promise<User> {
  const response = await fetch(`${BASE_URL}/auth/me`, {
    headers: getAuthHeader(),
  });
  if (!response.ok) throw new Error('获取用户信息失败');
  return response.json();
}

export async function changePassword(oldPassword: string, newPassword: string): Promise<{ message: string }> {
  const response = await fetch(`${BASE_URL}/auth/change-password`, {
    method: 'POST',
    headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ oldPassword, newPassword }),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.message || '修改密码失败');
  }
  return response.json();
}

function readRateLimitDimension(body: Record<string, unknown>): LoginRateLimitDimension | undefined {
  return body.dimension === 'api' || body.dimension === 'login_ip' || body.dimension === 'login_account'
    ? body.dimension
    : undefined;
}
