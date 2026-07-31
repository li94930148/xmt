import { ApiAuth, type ApiAuthOptions } from './auth';
import { ApiClientError } from './error';
import type { ApiClientRequestOptions, ApiResponse } from './types';

export type ApiClientOptions = ApiAuthOptions & {
  baseURL?: string;
  fetchImpl?: typeof fetch;
};

function createRequestId() {
  return globalThis.crypto?.randomUUID?.() ?? `xmt-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function joinUrl(baseURL: string, path: string) {
  return `${baseURL.replace(/\/$/, '')}/${path.replace(/^\//, '')}`;
}

export class ApiClient {
  private readonly baseURL: string;
  private readonly fetchImpl: typeof fetch;
  private readonly auth: ApiAuth;

  constructor(options: ApiClientOptions = {}) {
    this.baseURL = options.baseURL ?? '/api/v1';
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis);
    this.auth = new ApiAuth(options);
  }

  async request<T>(path: string, options: ApiClientRequestOptions = {}): Promise<T> {
    const { requestId: suppliedRequestId, skipAuth, body: requestBody, ...requestInit } = options;
    const requestId = suppliedRequestId ?? createRequestId();
    let body: BodyInit | undefined;
    if (requestBody !== undefined) {
      body = JSON.stringify(requestBody);
    }

    const execute = async () => {
      const headers = new Headers(requestInit.headers);
      headers.set('Accept', 'application/json');
      headers.set('X-Request-ID', requestId);
      if (requestBody !== undefined) headers.set('Content-Type', 'application/json');
      const accessToken = skipAuth ? null : await this.auth.getAccessToken();
      if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`);
      try {
        const response = await this.fetchImpl(joinUrl(this.baseURL, path), {
          ...requestInit,
          credentials: requestInit.credentials ?? 'include',
          headers,
          body,
        });
        return { response, accessToken };
      } catch (error) {
        throw new ApiClientError('NETWORK_ERROR', error instanceof Error ? error.message : '网络请求失败', 0, requestId);
      }
    };

    let result = await execute();
    if (result.response.status === 401 && !skipAuth && this.auth.shouldRefreshAccessToken()) {
      const currentToken = await this.auth.getAccessToken();
      const refreshedToken = currentToken && currentToken !== result.accessToken
        ? currentToken
        : await this.auth.refreshAccessToken();
      if (refreshedToken) result = await execute();
    }
    const response = result.response;

    let payload: ApiResponse<T>;
    try {
      payload = await response.json() as ApiResponse<T>;
    } catch {
      throw new ApiClientError('INVALID_RESPONSE', '服务端返回了无效响应', response.status, response.headers.get('X-Request-ID') ?? requestId);
    }

    if (!response.ok || payload.success === false) {
      if (payload.success === false) {
        throw new ApiClientError(
          payload.error.code,
          payload.error.message,
          response.status,
          payload.error.requestId,
          payload.error.details,
        );
      }
      throw new ApiClientError('INVALID_RESPONSE', '服务端响应状态与内容不一致', response.status, requestId);
    }

    return payload.data;
  }
}
