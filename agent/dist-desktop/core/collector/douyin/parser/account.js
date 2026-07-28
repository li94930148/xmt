"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseAccount = parseAccount;
exports.mergeAccountDomFallback = mergeAccountDomFallback;
const record = (value) => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
const optionalNumber = (value) => value === undefined || value === null || value === '' ? null : Number.isFinite(Number(value)) ? Number(value) : null;
function parseAccount(captures) {
    const responses = captures.filter((capture) => /\/creator\/user\/info\/|\/media\/user\/info\//.test(capture.url)).map((capture) => record(capture.response));
    const verify = responses.map((response) => record(response.douyin_user_verify_info)).find((value) => Object.keys(value).length) || {};
    const profile = responses.map((response) => record(response.user_profile)).find((value) => Object.keys(value).length) || {};
    const user = responses.map((response) => record(response.user)).find((value) => Object.keys(value).length) || {};
    const avatar = record(user.avatar_larger);
    const avatarUrls = Array.isArray(avatar.url_list) ? avatar.url_list : [];
    const pick = (...values) => values.find((value) => value !== undefined && value !== null && value !== '');
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
function mergeAccountDomFallback(account, body) {
    const identity = body.match(/(?:^|\n)([^\n]{1,40})\n抖音号[：:]\s*([0-9A-Za-z_-]+)/m);
    const count = (label) => optionalNumber(body.match(new RegExp(`${label}\\s*([0-9.]+)(万)?`))?.slice(1).reduce((value, part, index) => index === 0 ? Number(part) : part ? Number(value) * 10_000 : value, 0));
    const fans = account.fans_count ?? count('粉丝'), following = account.following_count ?? count('关注'), likes = account.total_likes ?? count('获赞');
    return { ...account, uid: account.uid || identity?.[2] || '', nickname: account.nickname || identity?.[1]?.trim() || '', fans_count: fans, following_count: following, total_likes: likes, availability: { ...account.availability, fans_count: fans !== null, following_count: following !== null, total_likes: likes !== null } };
}
