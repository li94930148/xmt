export type ClientLogLevel = 'debug' | 'info' | 'warn' | 'error';

export type ClientLogEvent =
  | 'api.auth_expired'
  | 'api.network_error'
  | 'auth.login_trace'
  | 'editor.annotation_create_failed'
  | 'notification.sound_play_failed'
  | 'permissions.load_failed'
  | 'permissions.management_load_failed'
  | 'renderer.error_boundary_caught'
  | 'runtime.native_endpoint_invalid'
  | 'settings.notification_preferences_load_failed'
  | 'socket.connected'
  | 'socket.connect_failed'
  | 'socket.disconnected'
  | 'socket.lifecycle'
  | 'topics.user_list_load_failed'
  | 'workflow.shadow_logs_load_failed'
  | 'workflow.template_detail_load_failed'
  | 'workflow.templates_load_failed';

export interface ClientLogInput {
  event: ClientLogEvent;
  level?: ClientLogLevel;
  fields?: Record<string, unknown>;
}

const fieldsByEvent: Record<ClientLogEvent, readonly string[]> = {
  'api.auth_expired': [],
  'api.network_error': [],
  'auth.login_trace': [
    'authEvent', 'mode', 'status', 'responseKind', 'httpStatus', 'hasRequestId',
    'hasLoginAttemptId', 'hasAccessToken', 'loginCompleted', 'hasUserId',
  ],
  'editor.annotation_create_failed': ['errorClass'],
  'notification.sound_play_failed': ['errorClass'],
  'permissions.load_failed': ['errorClass'],
  'permissions.management_load_failed': ['errorClass'],
  'renderer.error_boundary_caught': ['errorClass'],
  'runtime.native_endpoint_invalid': [],
  'settings.notification_preferences_load_failed': ['errorClass'],
  'socket.connected': [],
  'socket.connect_failed': ['errorClass'],
  'socket.disconnected': ['reason'],
  'socket.lifecycle': ['lifecycleEvent', 'reason', 'reconnectAttempt'],
  'topics.user_list_load_failed': ['errorClass'],
  'workflow.shadow_logs_load_failed': ['errorClass'],
  'workflow.template_detail_load_failed': ['errorClass'],
  'workflow.templates_load_failed': ['errorClass'],
};

const allowedValues: Record<string, readonly string[]> = {
  authEvent: [
    'auth.response.received', 'auth.adapter.selected', 'auth.runtime.before',
    'auth.runtime.after', 'auth.redirect.start', 'auth.redirect.end',
  ],
  mode: ['legacy', 'v1-web'],
  status: ['anonymous', 'bootstrapping', 'authenticating', 'authenticated', 'redirecting', 'refreshing', 'expired'],
  responseKind: ['legacy', 'v1-envelope'],
  reason: ['io server disconnect', 'io client disconnect', 'ping timeout', 'transport close', 'transport error', 'parse error', 'unknown'],
  lifecycleEvent: ['created', 'connected', 'disconnected', 'reconnect_attempt', 'destroyed'],
  errorClass: ['Error', 'TypeError', 'RangeError', 'ReferenceError', 'SyntaxError', 'AbortError', 'OtherError'],
};

const booleanFields = new Set(['hasRequestId', 'hasLoginAttemptId', 'hasAccessToken', 'loginCompleted', 'hasUserId']);
const allowedLevels = new Set<ClientLogLevel>(['debug', 'info', 'warn', 'error']);

function safeValue(key: string, value: unknown): string | number | boolean | undefined {
  if (booleanFields.has(key)) return typeof value === 'boolean' ? value : undefined;
  if (key === 'reconnectAttempt') {
    return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 100 ? value : undefined;
  }
  if (key === 'httpStatus') {
    return typeof value === 'number' && Number.isInteger(value) && value >= 100 && value <= 599 ? value : undefined;
  }
  return typeof value === 'string' && allowedValues[key]?.includes(value) ? value : undefined;
}

export function serializeClientLog(input: ClientLogInput, timestamp = new Date().toISOString()): string {
  const fields: Record<string, string | number | boolean> = {};
  for (const key of fieldsByEvent[input.event] || []) {
    const value = safeValue(key, input.fields?.[key]);
    if (value !== undefined) fields[key] = value;
  }
  return JSON.stringify({
    timestamp,
    level: input.level && allowedLevels.has(input.level) ? input.level : 'info',
    application: 'xmt-web',
    event: input.event,
    ...fields,
  });
}

export function emitClientLog(input: ClientLogInput): void {
  const line = serializeClientLog(input);
  const level = input.level && allowedLevels.has(input.level) ? input.level : 'info';
  console[level](line);
}

export function safeClientErrorClass(error: unknown): string {
  const name = error instanceof Error ? error.name : '';
  return allowedValues.errorClass.includes(name) ? name : 'OtherError';
}

export function normalizeSocketDisconnectReason(reason: unknown): string {
  return typeof reason === 'string' && allowedValues.reason.includes(reason) ? reason : 'unknown';
}
