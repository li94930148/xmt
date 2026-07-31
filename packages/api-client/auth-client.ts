import type {
  AuthSessionSummary,
  LoginV1RequestInput,
  LoginV1WebData,
  RefreshWebData,
} from '../../shared/schema/auth.schema';
import { ApiClient } from './client';

export class AuthV1Client {
  constructor(private readonly client: ApiClient) {}

  loginV1(input: LoginV1RequestInput): Promise<LoginV1WebData> {
    return this.client.request<LoginV1WebData>('auth/login', { method: 'POST', body: input, skipAuth: true });
  }

  refreshV1(csrfToken: string): Promise<RefreshWebData> {
    return this.client.request<RefreshWebData>('auth/refresh', {
      method: 'POST',
      body: {},
      headers: { 'X-XMT-CSRF': csrfToken },
      skipAuth: true,
    });
  }

  logoutV1(csrfToken: string): Promise<null> {
    return this.client.request<null>('auth/logout', {
      method: 'POST',
      headers: { 'X-XMT-CSRF': csrfToken },
    });
  }

  getSessionsV1(): Promise<AuthSessionSummary[]> {
    return this.client.request<AuthSessionSummary[]>('auth/sessions');
  }
}
