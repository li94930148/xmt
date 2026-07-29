import type { NetworkCapture } from '../../../types.js';

type JsonRecord = Record<string, unknown>;
const record = (value: unknown): JsonRecord => value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {};
export function parseCount(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) && value >= 0 ? Math.floor(value) : null;
  if (value && typeof value === 'object') { const source=value as JsonRecord; for(const key of ['value','count','total','number','fans_count','follower_count','followers']){const parsed=parseCount(source[key]);if(parsed!==null)return parsed;} return null; }
  if (typeof value !== 'string') return null;
  const match=value.trim().replace(/[，,\s]/g,'').match(/(\d+(?:\.\d+)?)(万|亿)?(\+)?/); if(!match)return null;
  const base=Number(match[1]),multiplier=match[2]==='亿'?100_000_000:match[2]==='万'?10_000:1;
  return Number.isFinite(base)?Math.floor(base*multiplier):null;
}
const optionalNumber = parseCount;

export function parseAccount(captures: NetworkCapture[]) {
  const responses = captures.filter((capture) => /\/creator\/user\/info\/|\/media\/user\/info\//.test(capture.url)).map((capture) => record(capture.response));
  const verify = responses.map((response) => record(response.douyin_user_verify_info)).find((value) => Object.keys(value).length) || {};
  const profile = responses.map((response) => record(response.user_profile)).find((value) => Object.keys(value).length) || {};
  const user = responses.map((response) => record(response.user)).find((value) => Object.keys(value).length) || {};
  const avatar = record(user.avatar_larger);
  const avatarUrls = Array.isArray(avatar.url_list) ? avatar.url_list : [];
  const pick = (...values: unknown[]) => values.find((value) => value !== undefined && value !== null && value !== '');
  return {
    uid: String(pick(verify.douyin_unique_id, profile.unique_id, user.unique_id, user.short_id, user.uid) || ''),
    sec_uid: String(user.sec_uid || ''),
    nickname: String(pick(verify.nick_name, profile.nick_name, user.nickname) || ''),
    avatar: String(pick(verify.avatar_url, profile.avatar_url, avatarUrls[0]) || ''),
    fans_count: optionalNumber(pick(verify.follower_count, profile.follower_count, user.follower_count)),
    following_count: optionalNumber(pick(verify.following_count, profile.following_count, user.following_count)),
    total_likes: optionalNumber(pick(verify.total_favorited, profile.total_favorited, user.total_favorited)),
    works_count: optionalNumber(user.aweme_count),
    availability: {
      fans_count: optionalNumber(pick(verify.follower_count, profile.follower_count, user.follower_count)) !== null,
      following_count: optionalNumber(pick(verify.following_count, profile.following_count, user.following_count)) !== null,
      total_likes: optionalNumber(pick(verify.total_favorited, profile.total_favorited, user.total_favorited)) !== null,
      works_count: optionalNumber(user.aweme_count) !== null,
    },
  };
}

export function mergeAccountDomFallback(account:ReturnType<typeof parseAccount>,body:string){
  const identity=body.match(/(?:^|\n)([^\n]{1,40})\n抖音号[：:]\s*([0-9A-Za-z_-]+)/m);
  const count=(label:string)=>parseCount(body.match(new RegExp(`${label}\\s*([0-9.,，\\s]+(?:万|亿)?\\+?)`))?.[1]);
  const fans=account.fans_count??count('粉丝'),following=account.following_count??count('关注'),likes=account.total_likes??count('获赞');
  return{...account,uid:account.uid||identity?.[2]||'',nickname:account.nickname||identity?.[1]?.trim()||'',fans_count:fans,following_count:following,total_likes:likes,availability:{...account.availability,fans_count:fans!==null,following_count:following!==null,total_likes:likes!==null}};
}
