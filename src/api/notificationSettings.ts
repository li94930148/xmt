export type NotificationPreference = {
  id?: number;
  channel: string;
  event_type: string;
  enabled: boolean;
  config?: string | null;
};

export type NotificationChannel = {
  id: string;
  name: string;
  description: string;
};

export type NotificationEvent = {
  id: string;
  name: string;
  description: string;
};

async function readList<T>(response: Response, label: string): Promise<T[]> {
  const payload = await response.json().catch(() => null) as unknown;
  if (!response.ok) {
    const message = payload && typeof payload === 'object' && 'message' in payload
      ? String(payload.message)
      : `${label}加载失败（HTTP ${response.status}）`;
    throw new Error(message);
  }
  if (!Array.isArray(payload)) {
    throw new Error(`${label}数据格式异常，请重试`);
  }
  return payload as T[];
}

function notificationPreferenceKey(preference: NotificationPreference) {
  return `${preference.channel}\u0000${preference.event_type}`;
}

function canonicalNotificationPreferences(preferences: NotificationPreference[]) {
  return preferences
    .map((preference) => ({
      channel: preference.channel,
      event_type: preference.event_type,
      enabled: Boolean(preference.enabled),
      config: preference.config ?? null,
    }))
    .sort((left, right) => notificationPreferenceKey(left).localeCompare(notificationPreferenceKey(right)));
}

export function notificationPreferencesMatch(
  left: NotificationPreference[],
  right: NotificationPreference[],
) {
  return JSON.stringify(canonicalNotificationPreferences(left))
    === JSON.stringify(canonicalNotificationPreferences(right));
}

export type NotificationPreferenceSaveResult =
  | { kind: 'saved'; preferences: NotificationPreference[]; recovered: boolean }
  | { kind: 'conflict'; currentPreferences: NotificationPreference[] }
  | { kind: 'unknown'; message: string }
  | { kind: 'rejected'; message: string };

export async function getNotificationPreferences(
  token: string,
  request: typeof fetch = fetch,
  urlFor: (path: string) => string = (path) => path,
): Promise<NotificationPreference[]> {
  const response = await request(urlFor('/api/notifications/preferences'), {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  return readList<NotificationPreference>(response, '通知偏好');
}

export async function verifyNotificationPreferences(
  token: string,
  submittedPreferences: NotificationPreference[],
  request: typeof fetch = fetch,
  urlFor: (path: string) => string = (path) => path,
): Promise<NotificationPreferenceSaveResult> {
  try {
    const currentPreferences = await getNotificationPreferences(token, request, urlFor);
    if (notificationPreferencesMatch(currentPreferences, submittedPreferences)) {
      return { kind: 'saved', preferences: currentPreferences, recovered: true };
    }
    return { kind: 'conflict', currentPreferences };
  } catch {
    return {
      kind: 'unknown',
      message: '通知偏好保存结果尚未核实；当前页面设置已保留。请只读重新核实，确认前不要重复保存。',
    };
  }
}

export async function saveNotificationPreferences(
  token: string,
  submittedPreferences: NotificationPreference[],
  request: typeof fetch = fetch,
  urlFor: (path: string) => string = (path) => path,
): Promise<NotificationPreferenceSaveResult> {
  let response: Response;
  try {
    response = await request(urlFor('/api/notifications/preferences'), {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ preferences: submittedPreferences }),
    });
  } catch {
    return verifyNotificationPreferences(token, submittedPreferences, request, urlFor);
  }

  if (response.ok) {
    return { kind: 'saved', preferences: submittedPreferences, recovered: false };
  }

  if (response.status === 408 || response.status === 429 || response.status >= 500) {
    return verifyNotificationPreferences(token, submittedPreferences, request, urlFor);
  }

  const payload = await response.json().catch(() => null) as unknown;
  const message = payload && typeof payload === 'object' && 'message' in payload
    ? String(payload.message)
    : `通知偏好保存失败（HTTP ${response.status}）`;
  return { kind: 'rejected', message };
}

export async function getNotificationSettings(
  token: string,
  request: typeof fetch = fetch,
  urlFor: (path: string) => string = (path) => path,
): Promise<{ preferences: NotificationPreference[]; channels: NotificationChannel[]; events: NotificationEvent[] }> {
  const headers = { Authorization: `Bearer ${token}` };
  const responses = await Promise.all([
    request(urlFor('/api/notifications/preferences'), { headers }),
    request(urlFor('/api/notifications/channels'), { headers }),
    request(urlFor('/api/notifications/events'), { headers }),
  ]);
  const [preferences, channels, events] = await Promise.all([
    readList<NotificationPreference>(responses[0], '通知偏好'),
    readList<NotificationChannel>(responses[1], '通知渠道'),
    readList<NotificationEvent>(responses[2], '通知事件'),
  ]);
  return { preferences, channels, events };
}
