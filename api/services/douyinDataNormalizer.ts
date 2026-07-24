type JsonRecord = Record<string, unknown>;

export type NormalizedDouyinAccount = {
  douyin_uid: string;
  nickname: string;
  avatar: string;
  fans_count: number;
  following_count: number;
  works_count: number;
  total_likes: number;
};

export type NormalizedDouyinWork = {
  aweme_id: string;
  title: string;
  cover_url: string;
  publish_time: string | null;
  play_count: number;
  like_count: number;
  comment_count: number;
  share_count: number;
  collect_count: number;
  duration: number;
  completion_rate: number;
  interaction_rate: number;
  raw: JsonRecord;
};

export type NormalizedDouyinPayload = {
  account: NormalizedDouyinAccount;
  works: NormalizedDouyinWork[];
  api_count: number;
  rejected_count: number;
};

export type DouyinCollectionMode = 'discover' | 'metrics_refresh' | 'full_snapshot';

export type DouyinWorkInput = {
  aweme_id: string;
  title: string;
  cover_url: string;
  publish_time: string;
  video_url: string;
  metrics: JsonRecord;
};

export type DouyinContractSummary = {
  raw_response_count: number;
  aweme_candidate_count: number;
  normalized_success_count: number;
  rejected_count: number;
  rejected_reasons: Record<string, number>;
};

export type NormalizedDouyinContract = {
  account: NormalizedDouyinAccount;
  works: NormalizedDouyinWork[];
  contract_version: '2.10.2';
  collection_mode: DouyinCollectionMode;
  snapshot_id: string;
  summary: DouyinContractSummary;
};

const blockedTitles = new Set(['react', 'flash_mod_modal', 'start_flash_mod']);
const record = (value: unknown): JsonRecord => value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {};
const list = (value: unknown): unknown[] => Array.isArray(value) ? value : [];
const text = (value: unknown) => value == null ? '' : String(value).trim();
const number = (value: unknown) => {
  const parsed = typeof value === 'string' ? Number(value.replace(/,/g, '').replace('%', '')) : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};
const first = (...values: unknown[]) => values.find(value => value !== undefined && value !== null && value !== '');
const nested = (source: JsonRecord, path: string) => path.split('.').reduce<unknown>((value, key) => record(value)[key], source);
const firstPath = (source: JsonRecord, paths: string[]) => first(...paths.map(path => nested(source, path)));

function imageUrl(value: unknown): string {
  if (typeof value === 'string') return value;
  const source = record(value);
  return text(first(source.url, list(source.url_list)[0], list(source.urlList)[0], source.uri));
}

function timestamp(value: unknown): string | null {
  if (value == null || value === '') return null;
  const numeric = Number(value);
  const date = Number.isFinite(numeric)
    ? new Date(numeric < 10_000_000_000 ? numeric * 1000 : numeric)
    : new Date(String(value));
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function candidateArrays(value: unknown, key = '', depth = 0, output: JsonRecord[][] = []): JsonRecord[][] {
  if (depth > 10 || value == null) return output;
  if (Array.isArray(value)) {
    if (/^(aweme_list|awemeList|item_list|itemList|video_list|videoList|works)$/i.test(key)) {
      output.push(value.map(record).filter(item => Object.keys(item).length));
    }
    for (const item of value) candidateArrays(item, '', depth + 1, output);
  } else if (typeof value === 'object') {
    for (const [childKey, child] of Object.entries(value as JsonRecord)) candidateArrays(child, childKey, depth + 1, output);
  }
  return output;
}

function accountCandidates(value: unknown, depth = 0, output: JsonRecord[] = []): JsonRecord[] {
  if (depth > 9 || value == null) return output;
  if (Array.isArray(value)) for (const item of value) accountCandidates(item, depth + 1, output);
  else if (typeof value === 'object') {
    const source = value as JsonRecord;
    const uid = firstPath(source, ['douyin_uid', 'sec_uid', 'uid', 'user_id']);
    const nickname = firstPath(source, ['nickname', 'nick_name', 'user_name']);
    if (uid && nickname) output.push(source);
    for (const child of Object.values(source)) accountCandidates(child, depth + 1, output);
  }
  return output;
}

function normalizeWork(source: JsonRecord): NormalizedDouyinWork | null {
  const awemeId = text(firstPath(source, ['aweme_id', 'awemeId', 'item_id', 'itemId']));
  const title = text(firstPath(source, ['desc', 'title', 'caption']));
  const stats = record(firstPath(source, ['statistics', 'stats', 'data.statistics']));
  const hasStatistics = Object.keys(stats).some(key => /play|digg|like|comment|share|collect/i.test(key));
  if (!awemeId || !title || blockedTitles.has(title.toLowerCase()) || !hasStatistics) return null;

  const playCount = number(firstPath(stats, ['play_count', 'playCount', 'vv']));
  const likeCount = number(firstPath(stats, ['digg_count', 'like_count', 'likeCount']));
  const commentCount = number(firstPath(stats, ['comment_count', 'commentCount']));
  const shareCount = number(firstPath(stats, ['share_count', 'shareCount']));
  const collectCount = number(firstPath(stats, ['collect_count', 'collectCount', 'favorite_count']));
  const completionRaw = number(firstPath(source, ['completion_rate', 'finish_rate', 'statistics.completion_rate']));
  const completionRate = completionRaw > 1 ? completionRaw / 100 : completionRaw;
  const interactions = likeCount + commentCount + shareCount + collectCount;
  const durationRaw = number(firstPath(source, ['duration', 'video.duration', 'video_duration']));
  return {
    aweme_id: awemeId,
    title,
    cover_url: imageUrl(firstPath(source, ['video.cover', 'video.origin_cover', 'video.dynamic_cover', 'cover', 'cover_url'])),
    publish_time: timestamp(firstPath(source, ['create_time', 'publish_time', 'publishTime'])),
    play_count: playCount,
    like_count: likeCount,
    comment_count: commentCount,
    share_count: shareCount,
    collect_count: collectCount,
    duration: durationRaw > 10_000 ? durationRaw / 1000 : durationRaw,
    completion_rate: Math.max(0, completionRate),
    interaction_rate: playCount > 0 ? interactions / playCount : 0,
    raw: source,
  };
}

function nonNegativeInteger(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
}

function contractMetric(metrics: JsonRecord, keys: string[]): number {
  return number(first(...keys.map(key => metrics[key])));
}

function incrementReason(reasons: Record<string, number>, reason: string, count = 1) {
  reasons[reason] = (reasons[reason] || 0) + count;
}

function validateContractWork(value: unknown): { work?: NormalizedDouyinWork; reason?: string } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { reason: 'not_object' };
  const source = value as JsonRecord;
  const identifier = source.aweme_id ?? source.item_id;
  if (identifier == null) return { reason: 'missing_aweme_id' };
  if (typeof identifier !== 'string') return { reason: 'invalid_id_type' };
  const awemeId = identifier.trim();
  if (!awemeId) return { reason: 'missing_aweme_id' };
  if (typeof source.title !== 'string' || !source.title.trim()) return { reason: 'missing_title' };
  const title = source.title.trim();
  if (blockedTitles.has(title.toLowerCase())) return { reason: 'blocked_non_work_title' };
  if (!source.metrics || typeof source.metrics !== 'object' || Array.isArray(source.metrics)) return { reason: 'invalid_metrics' };
  const metrics = source.metrics as JsonRecord;
  const playCount = contractMetric(metrics, ['play_count', 'views', 'view_count']);
  const likeCount = contractMetric(metrics, ['like_count', 'likes', 'digg_count']);
  const commentCount = contractMetric(metrics, ['comment_count', 'comments']);
  const shareCount = contractMetric(metrics, ['share_count', 'shares']);
  const collectCount = contractMetric(metrics, ['collect_count', 'favorite_count', 'collects']);
  const completionRaw = contractMetric(metrics, ['completion_rate', 'finish_rate']);
  const completionRate = completionRaw > 1 ? completionRaw / 100 : completionRaw;
  const interactions = likeCount + commentCount + shareCount + collectCount;
  const durationRaw = number(source.duration);
  return {
    work: {
      aweme_id: awemeId,
      title,
      cover_url: typeof source.cover_url === 'string' ? source.cover_url : '',
      publish_time: timestamp(source.publish_time),
      play_count: playCount,
      like_count: likeCount,
      comment_count: commentCount,
      share_count: shareCount,
      collect_count: collectCount,
      duration: durationRaw > 10_000 ? durationRaw / 1000 : durationRaw,
      completion_rate: Math.max(0, completionRate),
      interaction_rate: playCount > 0 ? interactions / playCount : 0,
      raw: {
        aweme_id: awemeId,
        title,
        cover_url: typeof source.cover_url === 'string' ? source.cover_url : '',
        publish_time: typeof source.publish_time === 'string' ? source.publish_time : '',
        video_url: typeof source.video_url === 'string' ? source.video_url : '',
        metrics,
      },
    },
  };
}

export class DouyinDataNormalizer {
  normalizeContractV2102(payload: JsonRecord, fallbackUid: string): NormalizedDouyinContract {
    const suppliedAccount = record(payload.account);
    const uidValue = firstPath(suppliedAccount, ['douyin_uid', 'platform_uid', 'sec_uid', 'uid']);
    if (uidValue !== undefined && typeof uidValue !== 'string') throw Object.assign(new Error('v2.10.2 账号 ID 必须为字符串'), { statusCode: 400 });
    const uid = text(uidValue) || fallbackUid;
    const collectionStats = record(payload.collection_stats || record(payload.sync_task).collection_stats);
    const agentReasons = record(collectionStats.rejected_reasons);
    const rejectedReasons: Record<string, number> = {};
    for (const [reason, count] of Object.entries(agentReasons)) {
      const validCount = nonNegativeInteger(count);
      if (validCount) incrementReason(rejectedReasons, reason, validCount);
    }
    const source = Array.isArray(payload.works) ? payload.works : Array.isArray(payload.contents) ? payload.contents : [];
    const works = new Map<string, NormalizedDouyinWork>();
    for (const candidate of source) {
      const result = validateContractWork(candidate);
      if (!result.work) {
        incrementReason(rejectedReasons, result.reason || 'invalid_work');
        continue;
      }
      if (works.has(result.work.aweme_id)) {
        incrementReason(rejectedReasons, 'duplicate_aweme_id');
        continue;
      }
      works.set(result.work.aweme_id, result.work);
    }
    const normalizedWorks = [...works.values()];
    const serverRejected = source.length - normalizedWorks.length;
    const agentRejected = nonNegativeInteger(collectionStats.rejected_count);
    const collectionMode = payload.collection_mode === 'discover' || payload.collection_mode === 'metrics_refresh' ? payload.collection_mode : 'full_snapshot';
    const snapshotId = text(payload.snapshot_id || record(payload.sync_task).snapshot_id);
    if (!snapshotId) throw Object.assign(new Error('v2.10.2 缺少 snapshot_id'), { statusCode: 400 });
    return {
      contract_version: '2.10.2',
      collection_mode: collectionMode,
      snapshot_id: snapshotId,
      account: {
        douyin_uid: uid,
        nickname: text(firstPath(suppliedAccount, ['nickname', 'nick_name', 'account_name'])),
        avatar: imageUrl(firstPath(suppliedAccount, ['avatar', 'avatar_thumb', 'avatar_url'])),
        fans_count: number(firstPath(suppliedAccount, ['fans_count', 'follower_count', 'followers'])),
        following_count: number(firstPath(suppliedAccount, ['following_count', 'follow_count', 'following'])),
        works_count: number(firstPath(suppliedAccount, ['works_count', 'aweme_count', 'video_count'])) || normalizedWorks.length,
        total_likes: number(firstPath(suppliedAccount, ['total_likes', 'total_favorited', 'favoriting_count'])),
      },
      works: normalizedWorks,
      summary: {
        raw_response_count: nonNegativeInteger(collectionStats.raw_response_count, list(payload.raw_records).length),
        aweme_candidate_count: nonNegativeInteger(collectionStats.aweme_candidate_count, source.length),
        normalized_success_count: normalizedWorks.length,
        rejected_count: agentRejected + serverRejected,
        rejected_reasons: rejectedReasons,
      },
    };
  }

  normalize(payload: JsonRecord, fallbackUid: string): NormalizedDouyinPayload {
    const rawRecords = list(payload.raw_records).map(record);
    const responses = rawRecords.map(item => first(item.response_json, item.response)).filter(Boolean);
    const suppliedWorks = list(payload.contents).map(record);
    const workSources = [...responses.flatMap(response => candidateArrays(response).flat()), ...suppliedWorks];
    const works = new Map<string, NormalizedDouyinWork>();
    let rejectedCount = 0;
    for (const source of workSources) {
      const normalized = normalizeWork(source);
      if (!normalized) { rejectedCount += 1; continue; }
      const previous = works.get(normalized.aweme_id);
      if (!previous || normalized.play_count >= previous.play_count) works.set(normalized.aweme_id, normalized);
    }

    const suppliedAccount = record(payload.account);
    const discoveredAccount = responses.flatMap(response => accountCandidates(response)).sort((a, b) => Object.keys(b).length - Object.keys(a).length)[0] || {};
    const fromAccount = (paths: string[]) => first(firstPath(suppliedAccount, paths), firstPath(discoveredAccount, paths));
    const uid = text(fromAccount(['douyin_uid', 'platform_uid', 'sec_uid', 'uid', 'user_id'])) || fallbackUid;
    const avatar = imageUrl(fromAccount(['avatar', 'avatar_thumb', 'avatar_medium', 'avatar_url']));
    const normalizedWorks = [...works.values()];
    return {
      account: {
        douyin_uid: uid,
        nickname: text(fromAccount(['nickname', 'nick_name', 'account_name', 'user_name'])),
        avatar,
        fans_count: number(fromAccount(['fans_count', 'follower_count', 'followers'])),
        following_count: number(fromAccount(['following_count', 'follow_count', 'following'])),
        works_count: number(fromAccount(['works_count', 'aweme_count', 'video_count'])) || normalizedWorks.length,
        total_likes: number(fromAccount(['total_likes', 'total_favorited', 'favoriting_count'])),
      },
      works: normalizedWorks,
      api_count: rawRecords.length,
      rejected_count: rejectedCount,
    };
  }
}

export const douyinDataNormalizer = new DouyinDataNormalizer();
