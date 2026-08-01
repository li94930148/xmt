export type SocketAuthErrorCode =
  | 'AUTH_REQUIRED'
  | 'AUTH_INVALID'
  | 'AUTH_EXPIRED'
  | 'SESSION_INACTIVE'
  | 'USER_NOT_FOUND'
  | 'USER_DISABLED'
  | 'IDENTITY_MISMATCH'
  | 'HANDSHAKE_INVALID';

export const SOCKET_AUTH_LIFECYCLE_REASONS = {
  AUTH_EXPIRED: 'AUTH_EXPIRED',
  SESSION_REVOKED: 'SESSION_REVOKED',
  USER_DISABLED: 'USER_DISABLED',
} as const;

export type SocketAuthLifecycleReason = keyof typeof SOCKET_AUTH_LIFECYCLE_REASONS;

export class SocketAuthError extends Error {
  constructor(
    readonly code: SocketAuthErrorCode,
    message = 'Authentication failed',
  ) {
    super(message);
    this.name = 'SocketAuthError';
  }
}
