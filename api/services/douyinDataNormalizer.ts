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

export class DouyinDataNormalizer {
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
