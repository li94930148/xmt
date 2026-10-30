export type ArchiveParseResult =
  | { kind: 'not-archive' }
  | { kind: 'invalid' }
  | { kind: 'archive'; snapshot: PublishedArchiveSnapshot };

export interface PublishedArchiveSnapshot {
  archivedAt?: string;
  topic?: {
    id?: number;
    title?: string;
    description?: string;
    platform?: string;
    deadline?: string;
  };
  script?: {
    version?: string;
    content?: string;
  };
  shootingComments: Array<{
    content: string;
    createdAt?: string;
    operatorName?: string;
  }>;
  publishedRecords: Array<{
    publishingId?: number;
    platform?: string;
    status?: string;
    publishTime?: string;
    url?: string;
    scriptSource?: ArchiveScriptSource | null;
    analytics?: {
      dataDate?: string;
      views?: number;
      likes?: number;
      shares?: number;
      comments?: number;
    } | null;
  }>;
  scriptSourceSnapshots: ArchiveScriptSourceSnapshot[];
}

export interface ArchiveScriptSource {
  topicId: number;
  sourceTopicId?: number;
  productionId: number | null;
  version: string | null;
  state: 'none' | 'unavailable' | 'unrecorded' | 'derived' | 'inherited';
}

export interface ArchiveScriptSourceSnapshot {
  topicId: number;
  productionId: number;
  version: string;
  content: string;
}

type JsonRecord = Record<string, unknown>;

const NOT_ARCHIVE: ArchiveParseResult = { kind: 'not-archive' };
const INVALID_ARCHIVE: ArchiveParseResult = { kind: 'invalid' };
const archivePathPattern = /^archive\/topic-[1-9]\d*$/;
const metricFields = ['views', 'likes', 'shares', 'comments'] as const;
const INVALID_ANALYTICS = Symbol('invalid-analytics');
const INVALID_STRING = Symbol('invalid-string');
const INVALID_SOURCE_ID = Symbol('invalid-source-id');

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function optionalString(record: JsonRecord, field: string): string | undefined | typeof INVALID_STRING {
  const value = record[field];
  if (value === undefined || value === null) return undefined;
  return typeof value === 'string' ? value : INVALID_STRING;
}

function optionalPositiveId(record: JsonRecord, field: string): number | undefined | null {
  const value = record[field];
  if (value === undefined || value === null) return value;
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : null;
}

function nullableSourceId(record: JsonRecord, field: string): number | null | undefined | typeof INVALID_SOURCE_ID {
  const value = record[field];
  if (value === undefined) return undefined;
  if (value === null) return null;
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : INVALID_SOURCE_ID;
}

function parseArchiveScriptSource(value: unknown): ArchiveScriptSource | null | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) return null;
  const topicId = optionalPositiveId(value, 'topic_id');
  const productionId = nullableSourceId(value, 'production_id');
  const sourceTopicId = nullableSourceId(value, 'source_topic_id');
  const version = optionalString(value, 'version');
  const state = value.state;
  if (topicId === undefined || topicId === null || productionId === undefined || productionId === INVALID_SOURCE_ID
    || sourceTopicId === INVALID_SOURCE_ID || (value.source_topic_id !== undefined && sourceTopicId === null)
    || version === INVALID_STRING || (version !== null && version !== undefined && typeof version !== 'string')
    || !['none', 'unavailable', 'unrecorded', 'derived', 'inherited'].includes(String(state))) return null;
  const normalizedVersion = version ?? null;
  if (state === 'derived' || state === 'inherited') {
    if (productionId === null || !normalizedVersion?.trim()) return null;
  } else if (state === 'none' || state === 'unrecorded') {
    if (productionId !== null || normalizedVersion !== null) return null;
  }
  return {
    topicId,
    ...(typeof sourceTopicId === 'number' ? { sourceTopicId } : {}),
    productionId,
    version: normalizedVersion,
    state: state as ArchiveScriptSource['state'],
  };
}

function parseArchiveScriptSourceSnapshots(value: unknown): ArchiveScriptSourceSnapshot[] {
  if (!Array.isArray(value)) return [];
  const snapshots: ArchiveScriptSourceSnapshot[] = [];
  for (const item of value) {
    if (!isRecord(item)) continue;
    const topicId = optionalPositiveId(item, 'topic_id');
    const productionId = optionalPositiveId(item, 'production_id');
    const version = optionalString(item, 'version');
    const content = optionalString(item, 'content');
    if (!topicId || !productionId || typeof version !== 'string' || !version.trim() || typeof content !== 'string') continue;
    snapshots.push({ topicId, productionId, version, content });
  }
  return snapshots;
}

function parseAnalytics(value: unknown): PublishedArchiveSnapshot['publishedRecords'][number]['analytics'] | undefined | typeof INVALID_ANALYTICS {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (!isRecord(value)) return INVALID_ANALYTICS;

  const dataDate = optionalString(value, 'data_date');
  if (dataDate === INVALID_STRING) return INVALID_ANALYTICS;
  const metrics: Partial<Record<(typeof metricFields)[number], number>> = {};
  for (const field of metricFields) {
    const metric = value[field];
    if (metric === undefined || metric === null) continue;
    if (typeof metric !== 'number' || !Number.isFinite(metric) || metric < 0) return INVALID_ANALYTICS;
    metrics[field] = metric;
  }
  return { ...(dataDate === undefined ? {} : { dataDate }), ...metrics };
}

function parsePublishedRecord(value: unknown): PublishedArchiveSnapshot['publishedRecords'][number] | null {
  if (!isRecord(value)) return null;
  const platform = optionalString(value, 'platform');
  const publishingId = optionalPositiveId(value, 'publishing_id') ?? optionalPositiveId(value, 'id');
  const status = optionalString(value, 'status');
  const publishTime = optionalString(value, 'publish_time');
  const url = optionalString(value, 'url');
  const analytics = parseAnalytics(value.analytics);
  const scriptSource = parseArchiveScriptSource(value.script_source);
  if (platform === INVALID_STRING || publishingId === null || status === INVALID_STRING
    || publishTime === INVALID_STRING || url === INVALID_STRING || analytics === INVALID_ANALYTICS) return null;
  const normalizedPlatform = platform?.trim();

  return {
    ...(publishingId === undefined ? {} : { publishingId }),
    ...(normalizedPlatform ? { platform: normalizedPlatform } : {}),
    ...(status === undefined ? {} : { status }),
    ...(publishTime === undefined ? {} : { publishTime }),
    ...(url === undefined ? {} : { url }),
    ...(value.script_source === undefined ? {} : { scriptSource }),
    ...(analytics === undefined ? {} : { analytics }),
  };
}

function parseTopic(value: unknown): PublishedArchiveSnapshot['topic'] | null | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) return null;
  const id = optionalPositiveId(value, 'id');
  const title = optionalString(value, 'title');
  const description = optionalString(value, 'description');
  const platform = optionalString(value, 'platform');
  const deadline = optionalString(value, 'deadline');
  if (id === null || value.title === null || title === INVALID_STRING || description === INVALID_STRING
    || platform === INVALID_STRING || deadline === INVALID_STRING) return null;
  return {
    ...(id === undefined ? {} : { id }),
    ...(title === undefined ? {} : { title }),
    ...(description === undefined ? {} : { description }),
    ...(platform === undefined ? {} : { platform }),
    ...(deadline === undefined ? {} : { deadline }),
  };
}

function parseScript(value: unknown): PublishedArchiveSnapshot['script'] | null | undefined {
  if (value === undefined || value === null) return undefined;
  if (!isRecord(value)) return null;
  const version = optionalString(value, 'version');
  const content = optionalString(value, 'content');
  if (version === INVALID_STRING || content === INVALID_STRING) return null;
  return {
    ...(version === undefined ? {} : { version }),
    ...(content === undefined ? {} : { content }),
  };
}

function parseShootingComments(value: unknown): PublishedArchiveSnapshot['shootingComments'] | null {
  if (value === undefined || value === null) return [];
  if (!isRecord(value)) return null;
  const comments = value.comments;
  if (comments === undefined || comments === null) return [];
  if (!Array.isArray(comments)) return null;
  const parsed: PublishedArchiveSnapshot['shootingComments'] = [];
  for (const comment of comments) {
    if (!isRecord(comment)) return null;
    const content = optionalString(comment, 'content');
    const createdAt = optionalString(comment, 'created_at');
    const operatorName = optionalString(comment, 'operator_name');
    if (content === INVALID_STRING || createdAt === INVALID_STRING || operatorName === INVALID_STRING) return null;
    parsed.push({
      content: content ?? '',
      ...(createdAt === undefined ? {} : { createdAt }),
      ...(operatorName === undefined ? {} : { operatorName }),
    });
  }
  return parsed;
}

/**
 * Parse only system-generated topic archive snapshots. All other resource
 * details remain on the normal plain-text path, even when their content is JSON.
 */
export function parseLegacyPublishedArchive(input: {
  libraryType?: unknown;
  sourceType?: unknown;
  filePath?: unknown;
  content?: unknown;
}): ArchiveParseResult {
  if (input.libraryType !== 'content_archive' || input.sourceType !== 'system_archive'
    || typeof input.filePath !== 'string' || !archivePathPattern.test(input.filePath)) return NOT_ARCHIVE;
  if (typeof input.content !== 'string' || !input.content.trim()) return INVALID_ARCHIVE;

  let value: unknown;
  try {
    value = JSON.parse(input.content);
  } catch {
    return INVALID_ARCHIVE;
  }
  if (!isRecord(value)) return INVALID_ARCHIVE;

  const hasNewRecords = Object.prototype.hasOwnProperty.call(value, 'published_records');
  if (hasNewRecords && !Array.isArray(value.published_records)) return INVALID_ARCHIVE;
  const newRecords = hasNewRecords ? (value.published_records as unknown[]).map(parsePublishedRecord) : [];
  if (newRecords.some((record) => record === null)) return INVALID_ARCHIVE;

  let publishedRecords = newRecords.filter((record): record is NonNullable<typeof record> => record !== null);
  if (publishedRecords.length === 0) {
    if (value.publishing !== undefined && !isRecord(value.publishing)) return INVALID_ARCHIVE;
    if (!isRecord(value.publishing)) return INVALID_ARCHIVE;
    const legacyRecord = { ...value.publishing };
    if (legacyRecord.analytics === undefined && value.analytics !== undefined) legacyRecord.analytics = value.analytics;
    const parsedLegacyRecord = parsePublishedRecord(legacyRecord);
    if (!parsedLegacyRecord) return INVALID_ARCHIVE;
    publishedRecords = [parsedLegacyRecord];
  }

  const topic = parseTopic(value.topic);
  const script = parseScript(value.script);
  const shootingComments = parseShootingComments(value.shooting);
  const archivedAt = optionalString(value, 'archived_at');
  if (topic === null || script === null || shootingComments === null || archivedAt === INVALID_STRING || value.archived_at === null) return INVALID_ARCHIVE;

  return {
    kind: 'archive',
    snapshot: {
      ...(archivedAt === undefined ? {} : { archivedAt }),
      ...(topic === undefined ? {} : { topic }),
      ...(script === undefined ? {} : { script }),
      shootingComments,
      publishedRecords,
      scriptSourceSnapshots: parseArchiveScriptSourceSnapshots(value.script_source_snapshots),
    },
  };
}

export function getSafeArchiveHttpUrl(value: string | undefined) {
  if (!value) return null;
  try {
    const url = new URL(value);
    if ((url.protocol !== 'http:' && url.protocol !== 'https:') || url.username || url.password) return null;
    return url.toString();
  } catch {
    return null;
  }
}
