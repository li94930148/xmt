import type { RefreshTokenHandler, TokenProvider } from './types';

export type ApiAuthOptions = {
  getAccessToken?: TokenProvider;
  refreshAccessToken?: RefreshTokenHandler;
};

export class ApiAuth {
  private refreshInFlight: Promise<string | null> | null = null;

  constructor(private readonly options: ApiAuthOptions = {}) {}

  getAccessToken() {
    return this.options.getAccessToken?.() ?? null;
  }

  refreshAccessToken() {
    if (!this.options.refreshAccessToken) return Promise.resolve(null);
    if (!this.refreshInFlight) {
      this.refreshInFlight = this.options.refreshAccessToken().finally(() => {
        this.refreshInFlight = null;
      });
    }
    return this.refreshInFlight;
  }
}
