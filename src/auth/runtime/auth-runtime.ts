import type { AuthV1User } from '../../../shared/schema/auth.schema';
import type { AuthMode } from './auth-mode';
import { initialAuthRuntimeState, type AuthRuntimeState } from './auth-state';
import { RefreshManager } from './refresh-manager';
import { MemoryAccessTokenStore } from './token-memory-store';

type AuthRuntimeDependencies = {
  tokenStore?: MemoryAccessTokenStore;
  refreshManager?: RefreshManager;
  refreshAccessToken: () => Promise<string | null>;
};

export class AuthRuntime {
  private state: AuthRuntimeState = { ...initialAuthRuntimeState };
  private readonly tokenStore: MemoryAccessTokenStore;
  private readonly refreshManager: RefreshManager;

  constructor(private readonly dependencies: AuthRuntimeDependencies) {
    this.tokenStore = dependencies.tokenStore ?? new MemoryAccessTokenStore();
    this.refreshManager = dependencies.refreshManager ?? new RefreshManager();
  }

  getState(): AuthRuntimeState {
    return { ...this.state };
  }

  getAccessToken(): string | null {
    return this.tokenStore.getToken();
  }

  isV1WebMode(): boolean {
    return this.state.mode === 'v1-web';
  }

  bootstrap(mode: AuthMode): void {
    this.state = { mode, status: mode === 'v1-web' ? 'bootstrapping' : 'anonymous', user: null };
  }

  authenticate(user: AuthV1User, accessToken: string): void {
    this.tokenStore.setToken(accessToken);
    this.state = { mode: 'v1-web', status: 'authenticated', user };
  }

  async refresh(): Promise<string | null> {
    if (!this.isV1WebMode()) return null;
    this.state = { ...this.state, status: 'refreshing' };
    try {
      const token = await this.refreshManager.run(this.dependencies.refreshAccessToken);
      if (!token) {
        this.expire();
        return null;
      }
      this.tokenStore.setToken(token);
      this.state = { ...this.state, status: 'authenticated' };
      return token;
    } catch {
      this.expire();
      return null;
    }
  }

  expire(): void {
    this.tokenStore.clearToken();
    this.state = { ...this.state, status: 'expired' };
  }

  clear(): void {
    this.tokenStore.clearToken();
    this.state = { ...initialAuthRuntimeState };
  }
}
