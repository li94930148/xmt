export const AUTH_EVENT_TYPES = [
  'auth.login.success',
  'auth.login.failed',
  'auth.refresh.success',
  'auth.refresh.failed',
  'auth.logout.success',
  'auth.session.created',
  'auth.session.revoked',
  'auth.csrf.failed',
  'auth.token.reuse_detected',
  'auth.rollout.decision',
] as const;

export type AuthEventType = typeof AUTH_EVENT_TYPES[number];
export type AuthEventMode = 'legacy' | 'v1-web';
export type AuthEventClientType = 'web' | 'ios' | 'android' | 'unknown';

export type AuthEventInput = {
  eventType: AuthEventType;
  requestId?: string | null;
  userId?: number | null;
  sessionId?: string | null;
  mode: AuthEventMode;
  clientType?: AuthEventClientType | null;
  success: boolean;
  reason?: string | null;
  createdAt?: Date;
};

export type AuthEvent = {
  eventId: string;
  eventType: AuthEventType;
  requestId: string | null;
  userId: number | null;
  sessionId: string | null;
  mode: AuthEventMode;
  clientType: AuthEventClientType;
  success: boolean;
  reason: string | null;
  createdAt: string;
};

export type AuthEventClass = 'business_metric' | 'security';
