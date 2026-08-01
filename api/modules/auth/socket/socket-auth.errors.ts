export type SocketAuthErrorCode =
  | 'AUTH_REQUIRED'
  | 'AUTH_INVALID'
  | 'AUTH_EXPIRED'
  | 'SESSION_INACTIVE'
  | 'USER_NOT_FOUND'
  | 'USER_DISABLED'
  | 'IDENTITY_MISMATCH'
  | 'HANDSHAKE_INVALID';

export class SocketAuthError extends Error {
  constructor(
    readonly code: SocketAuthErrorCode,
    message = 'Authentication failed',
  ) {
    super(message);
    this.name = 'SocketAuthError';
  }
}
