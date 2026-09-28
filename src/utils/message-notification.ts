export interface MessageNotificationInput {
  id: number;
  title?: string | null;
  content?: string | null;
  type?: string | null;
  link?: string | null;
}

export interface MessageNotificationGroup {
  startedAt: number;
  count: number;
}

export interface MessageDesktopNotification {
  title: string;
  body: string;
  tag: string;
  url: string;
  silent: boolean;
}

const GROUP_WINDOW_MS = 5 * 60 * 1000;
const KNOWN_TYPES = new Set(['info', 'success', 'warning', 'error']);
const TYPE_LABELS: Record<string, string> = {
  info: '通知',
  success: '完成',
  warning: '提醒',
  error: '异常',
};

function safeInternalPath(link: string | null | undefined): string | null {
  const containsControlCharacter = link?.split('').some((character) => {
    const code = character.charCodeAt(0);
    return code <= 0x1f || code === 0x7f;
  });
  if (!link || !link.startsWith('/') || link.startsWith('//') || link.includes('\\') || containsControlCharacter) return null;
  try {
    const target = new URL(link, 'https://xmt.invalid');
    if (target.origin !== 'https://xmt.invalid') return null;
    return `${target.pathname}${target.search}${target.hash}`;
  } catch {
    return null;
  }
}

/** Build a safe desktop alert and coalesce repeated same-topic/type alerts for five minutes. */
export function buildMessageDesktopNotification(
  message: MessageNotificationInput,
  groups: Map<string, MessageNotificationGroup>,
  now = Date.now(),
): MessageDesktopNotification {
  for (const [key, group] of groups) {
    if (now - group.startedAt > GROUP_WINDOW_MS) groups.delete(key);
  }

  const url = safeInternalPath(message.link) ?? '/messages';
  const type = message.type && KNOWN_TYPES.has(message.type) ? message.type : null;
  const topicId = /^\/topics\/(\d+)(?:\/|[?#]|$)/.exec(url)?.[1];
  const groupKey = topicId && type ? `${topicId}:${type}` : null;
  const group = groupKey ? groups.get(groupKey) : undefined;

  if (groupKey && group && now - group.startedAt <= GROUP_WINDOW_MS) {
    group.count += 1;
    const label = TYPE_LABELS[type as string];
    return {
      title: `${message.title || '选题动态'}（${group.count}条）`,
      body: `5 分钟内收到 ${group.count} 条同类${label}，点击查看此选题。`,
      tag: `xmt-topic-${topicId}-${type}`,
      url,
      silent: true,
    };
  }

  if (groupKey) groups.set(groupKey, { startedAt: now, count: 1 });
  if (groups.size > 500) {
    const oldestKey = groups.keys().next().value;
    if (oldestKey) groups.delete(oldestKey);
  }

  return {
    title: message.title || '新消息',
    body: message.content || '你有一条新消息',
    tag: groupKey ? `xmt-topic-${topicId}-${type}` : `xmt-msg-${message.id}`,
    url,
    silent: false,
  };
}
