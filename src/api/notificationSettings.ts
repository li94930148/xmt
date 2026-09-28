export type NotificationPreference = {
  id?: number;
  channel: string;
  event_type: string;
  enabled: boolean;
  config?: string;
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
