import { clearSafeDraft, readSafeDraftValue, userSafeDraftKey, writeSafeDraft } from '@/platform/safe-draft';

export type TopicDraft = {
  title: string;
  platform: string;
  deadline: string;
  assignee_id: string;
  projectBackground: string;
  targetAudience: string;
  expectedGoal: string;
  budget: string;
  outline: string;
};

export type TopicDraftEntry = {
  id: string;
  draft: TopicDraft;
  updatedAt: number;
};

export type TopicDraftCollection = {
  schemaVersion: 1;
  activeDraftId: string | null;
  drafts: TopicDraftEntry[];
};

export const emptyTopicDraft: TopicDraft = {
  title: '',
  platform: '',
  deadline: '',
  assignee_id: '',
  projectBackground: '',
  targetAudience: '',
  expectedGoal: '',
  budget: '',
  outline: '',
};

export function topicDraftKey(userId: number | null | undefined) {
  return userSafeDraftKey(userId, 'topic:new');
}

export function legacyDesktopTopicDraftKey(userId: number | null | undefined) {
  return Number.isSafeInteger(userId) && Number(userId) > 0 ? `topic:new:desktop:${userId}` : null;
}

export function hasTopicDraftContent(draft: TopicDraft) {
  return Object.values(draft).some((value) => value.trim().length > 0);
}

export function normalizeTopicDraft(value: unknown): TopicDraft | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const values = value as Record<string, unknown>;
  const draft = { ...emptyTopicDraft };
  for (const field of Object.keys(emptyTopicDraft) as Array<keyof TopicDraft>) {
    if (values[field] !== undefined && typeof values[field] !== 'string') return null;
    if (typeof values[field] === 'string') draft[field] = values[field];
  }
  return hasTopicDraftContent(draft) ? draft : null;
}

export function createTopicDraftId() {
  const randomId = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2, 12);
  return `topic-draft-${Date.now()}-${randomId}`;
}

export function topicDraftTitle(draft: TopicDraft) {
  return draft.title.trim() || '未命名选题';
}

export function formatTopicDraftUpdatedAt(timestamp: number) {
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Shanghai',
  }).format(new Date(timestamp));
}

function sortDrafts(entries: TopicDraftEntry[]) {
  return [...entries].sort((left, right) => right.updatedAt - left.updatedAt || left.id.localeCompare(right.id));
}

function normalizeCollection(value: unknown): TopicDraftCollection | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const stored = value as Record<string, unknown>;
  if (stored.schemaVersion !== 1 || !Array.isArray(stored.drafts)) return null;

  const entries = new Map<string, TopicDraftEntry>();
  for (const candidate of stored.drafts) {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) continue;
    const record = candidate as Record<string, unknown>;
    if (typeof record.id !== 'string' || record.id.length === 0) continue;
    const draft = normalizeTopicDraft(record.draft);
    if (!draft) continue;
    const updatedAt = typeof record.updatedAt === 'number' && Number.isFinite(record.updatedAt)
      ? record.updatedAt
      : 0;
    const existing = entries.get(record.id);
    if (!existing || existing.updatedAt <= updatedAt) entries.set(record.id, { id: record.id, draft, updatedAt });
  }
  const drafts = sortDrafts([...entries.values()]);
  const activeDraftId = typeof stored.activeDraftId === 'string' && stored.activeDraftId.length > 0
    ? stored.activeDraftId
    : drafts[0]?.id ?? null;
  return { schemaVersion: 1, activeDraftId, drafts };
}

function migrateSingleDraft(value: unknown): TopicDraftEntry | null {
  const draft = normalizeTopicDraft(value);
  return draft ? { id: createTopicDraftId(), draft, updatedAt: Date.now() } : null;
}

export function readTopicDraftCollection(key: string | null, legacyKey?: string | null): TopicDraftCollection {
  if (!key) return { schemaVersion: 1, activeDraftId: null, drafts: [] };

  const currentValue = readSafeDraftValue<unknown>(key);
  const collection = normalizeCollection(currentValue);
  if (collection) return collection;

  const legacyEntry = migrateSingleDraft(currentValue)
    ?? (legacyKey ? migrateSingleDraft(readSafeDraftValue<unknown>(legacyKey)) : null);
  if (!legacyEntry) return { schemaVersion: 1, activeDraftId: null, drafts: [] };

  const migrated = { schemaVersion: 1 as const, activeDraftId: legacyEntry.id, drafts: [legacyEntry] };
  if (writeSafeDraft(key, migrated) && legacyKey) clearSafeDraft(legacyKey);
  return migrated;
}

export function upsertTopicDraftEntry(entries: TopicDraftEntry[], id: string, draft: TopicDraft, updatedAt = Date.now()) {
  const remaining = entries.filter((entry) => entry.id !== id);
  if (!hasTopicDraftContent(draft)) return sortDrafts(remaining);
  return sortDrafts([...remaining, { id, draft: { ...draft }, updatedAt }]);
}

export function removeTopicDraftEntry(entries: TopicDraftEntry[], id: string) {
  return sortDrafts(entries.filter((entry) => entry.id !== id));
}

export function persistTopicDraftCollection(key: string | null, legacyKey: string | null | undefined, collection: TopicDraftCollection) {
  if (!key) return false;
  const next = normalizeCollection(collection) ?? { schemaVersion: 1 as const, activeDraftId: null, drafts: [] };
  const saved = writeSafeDraft(key, next);
  if (!saved) return false;
  if (legacyKey) clearSafeDraft(legacyKey);
  return true;
}

export function clearTopicDraftCollection(key: string | null, legacyKey?: string | null) {
  const currentCleared = key ? clearSafeDraft(key) : true;
  const legacyCleared = legacyKey ? clearSafeDraft(legacyKey) : true;
  return currentCleared && legacyCleared;
}
