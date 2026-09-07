// 全局请求体与同步包体积上限的唯一定义处。
// 此前 16MB/12MB 两个魔法数字分散在 app.ts 与 creatorSyncV291.ts，
// 文案与实际限制互相矛盾（2.20.6 修复）。所有引用方一律从这里取值。

/** Express JSON/URL-encoded 请求体上限（字符串形式供 express.json({ limit }) 使用） */
export const HTTP_JSON_BODY_LIMIT = '16mb'

/** Express 请求体上限（字节形式，供文案与数值比较使用） */
export const HTTP_JSON_BODY_LIMIT_BYTES = 16 * 1024 * 1024

/** Express 请求体上限（MB 数值，供错误文案使用） */
export const HTTP_JSON_BODY_LIMIT_MB = HTTP_JSON_BODY_LIMIT_BYTES / (1024 * 1024)

/**
 * Creator Agent 数据同步包上限（字节）。
 * 注意：该值小于 HTTP 请求体上限，是同步协议自身的独立限制，
 * 命中此上限时会先于全局 413 返回 413 + 专属文案。
 */
export const CREATOR_SYNC_MAX_PAYLOAD_BYTES = 12 * 1024 * 1024

/** Creator Agent 数据同步包上限（MB 数值，供错误文案使用） */
export const CREATOR_SYNC_MAX_PAYLOAD_MB = CREATOR_SYNC_MAX_PAYLOAD_BYTES / (1024 * 1024)
