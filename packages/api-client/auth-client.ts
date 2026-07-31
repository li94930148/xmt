import type {
  AuthSessionSummary,
  LoginV1Data,
  LoginV1RequestInput,
  RefreshData,
} from '../../shared/schema/auth.schema';
import { ApiClient } from './client';

export class AuthV1Client {
  constructor(private readonly client: ApiClient) {}

  loginV1(input: LoginV1RequestInput): Promise<LoginV1Data> {
    return this.client.request<LoginV1Data>('auth/login', { method: 'POST', body: input, skipAuth: true });
  }

  refreshV1(refreshToken?: string): Promise<RefreshData> {
    return this.client.request<RefreshData>('auth/refresh', {
      method: 'POST',
      body: refreshToken ? { refreshToken } : undefined,
      skipAuth: true,
    });
  }

  logoutV1(): Promise<null> {
    return this.client.request<null>('auth/logout', { method: 'POST' });
  }

  getSessionsV1(): Promise<AuthSessionSummary[]> {
    return this.client.request<AuthSessionSummary[]>('auth/sessions');
  }
}
