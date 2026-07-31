import type { ApiError, ApiSuccess } from '../../shared/schema/error.schema';

export type ApiResponse<T> = ApiSuccess<T> | ApiError;

export type ApiClientRequestOptions = Omit<RequestInit, 'body'> & {
  body?: unknown;
  requestId?: string;
  skipAuth?: boolean;
};

export type TokenProvider = () => string | null | Promise<string | null>;
export type RefreshTokenHandler = () => Promise<string | null>;
export type RefreshEligibility = () => boolean;
