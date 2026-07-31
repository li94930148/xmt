import type { AuthEvent, AuthEventClass } from './auth-event.types.js';

export const AUTH_METRIC_NAMES = [
  'legacy_login_count',
  'v1_login_count',
  'refresh_success',
  'refresh_failed',
  'csrf_failed',
  'token_reuse_detected',
  'logout_success',
  'expired_count',
] as const;

export type AuthMetricName = typeof AUTH_METRIC_NAMES[number];

export function classifyAuthEvent(event: AuthEvent): AuthEventClass {
  return event.eventType === 'auth.csrf.failed'
    || event.eventType === 'auth.token.reuse_detected'
    || event.eventType === 'auth.login.failed'
    || event.eventType === 'auth.refresh.failed'
    || (event.eventType === 'auth.session.revoked' && event.success === false)
    ? 'security'
    : 'business_metric';
}

export function mapAuthEventToMetrics(event: AuthEvent): AuthMetricName[] {
  switch (event.eventType) {
    case 'auth.login.success':
      return [event.mode === 'legacy' ? 'legacy_login_count' : 'v1_login_count'];
    case 'auth.refresh.success':
      return ['refresh_success'];
    case 'auth.refresh.failed':
      return ['refresh_failed'];
    case 'auth.csrf.failed':
      return ['refresh_failed', 'csrf_failed'];
    case 'auth.token.reuse_detected':
      return ['refresh_failed', 'token_reuse_detected'];
    case 'auth.logout.success':
      return ['logout_success'];
    case 'auth.session.revoked':
      return event.success === false ? ['expired_count'] : [];
    default:
      return [];
  }
}
