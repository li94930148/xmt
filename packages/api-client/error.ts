import type { ApiError } from '../../shared/schema/error.schema';

export class ApiClientError extends Error {
  constructor(
    public readonly code: ApiError['error']['code'] | 'NETWORK_ERROR' | 'INVALID_RESPONSE',
    message: string,
    public readonly status: number,
    public readonly requestId?: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiClientError';
  }
}
