import type { Socket } from 'socket.io';
import { SocketAuthError, type SocketAuthLifecycleReason } from './socket-auth.errors.js';
import { SocketAuthService } from './socket-auth.service.js';
import { readSocketProductionBridgeGate } from './socket-production-gate.js';
import { resolveAuthRolloutRuntimeConfig } from '../../../config/auth-rollout-runtime.js';

type SocketLike = Socket & { data: Record<string, unknown> };

export function readSocketAuthBridgeEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const runtime = resolveAuthRolloutRuntimeConfig(env);
  return readSocketProductionBridgeGate(env).socketBridgeEnabled || runtime.mobileSocketEnabled;
}

export function getSocketHandshake(socket: SocketLike) {
  const auth = socket.handshake.auth;
  const token = typeof auth?.token === 'string'
    ? auth.token
    : typeof socket.handshake.headers.authorization === 'string'
      ? socket.handshake.headers.authorization.replace(/^Bearer\s+/i, '')
      : null;
  return { token, mode: auth?.mode };
}

export function createSocketAuthMiddleware(
  service: SocketAuthService,
  options: {
    enabled: boolean;
    isV1EligibleUser?: (user: { id: number; role: string }) => boolean;
    isMobileEligibleUser?: (user: { id: number; role: string }) => boolean;
    onFailure?: (reason: string, socket: Socket) => void;
  },
) {
  return async (socket: Socket, next: (error?: Error) => void) => {
    const handshake = getSocketHandshake(socket as SocketLike);
    if (!handshake.token) {
      options.onFailure?.('missing_token', socket);
      return next(new SocketAuthError('AUTH_REQUIRED', 'Authentication required'));
    }

    try {
      const requestedMode = handshake.mode;
      const mode = requestedMode === undefined ? 'legacy' : requestedMode;
      if (mode !== 'legacy' && !options.enabled) throw new SocketAuthError('AUTH_INVALID', 'Authentication not allowed');
      const identity = await service.authenticate({
        token: handshake.token,
        mode,
      });
      if (mode === 'v1-web' && options.isV1EligibleUser && !options.isV1EligibleUser(identity.user)) {
        throw new SocketAuthError('AUTH_INVALID', 'Authentication not allowed');
      }
      if (mode === 'v1-mobile' && options.isMobileEligibleUser && !options.isMobileEligibleUser(identity.user)) {
        throw new SocketAuthError('AUTH_INVALID', 'Authentication not allowed');
      }
      socket.data.auth = identity.auth;
      // Compatibility projection for existing room/message handlers.
      socket.data.user = identity.user;
      return next();
    } catch (error) {
      const authError = error instanceof SocketAuthError ? error : new SocketAuthError('AUTH_INVALID');
      options.onFailure?.(authError.code.toLowerCase(), socket);
      return next(new Error(authError.message));
    }
  };
}

export function emitSocketAuthLifecycle(socket: Socket, reason: SocketAuthLifecycleReason): void {
  socket.emit('auth:lifecycle', { reason });
  socket.disconnect(true);
}
