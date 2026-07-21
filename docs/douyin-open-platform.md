# 岚曜新媒体协作平台 · 抖音开放平台中心

## 架构

前端“抖音运营中心”调用 `/api/douyin`；Express 路由负责认证与 XMT 权限；`api/services/douyin/` 是 OAuth、令牌加密、用户、视频、数据同步和 Webhook 的 OpenAPI 边界；SQLite 保存授权账号、令牌、视频、同步日志和事件去重记录。页面不会调用爬虫、人工录入或模拟数据。

## OAuth 流程

1. 用户点击“绑定抖音账号”，调用 `POST /api/douyin/accounts/bind`（或 `GET /api/douyin/oauth/url`）。
2. 服务端创建一次性 state 并返回抖音授权地址。
3. 抖音回调 `GET /api/douyin/oauth/callback?code=&state=`。
4. 服务端以 code 换取令牌，将 access_token 和 refresh_token 以 AES-256-GCM 加密保存，建立账号关系。

## 接口

| 接口 | 权限 | 用途 |
| --- | --- | --- |
| `GET /api/douyin/accounts` | `douyin:view` | 已授权账号 |
| `POST /api/douyin/accounts/bind` | `douyin:account` | 发起绑定 |
| `DELETE /api/douyin/accounts/:id` | `douyin:account` | 逻辑解绑 |
| `GET /api/douyin/oauth/url` | `douyin:account` | 获取授权地址 |
| `GET /api/douyin/oauth/callback` | state | OAuth 回调 |
| `GET /api/douyin/videos` / `statistics` | `douyin:view` | OpenAPI 已同步数据 |
| `POST /api/douyin/sync` | `douyin:sync` | 记录并发起同步 |
| `POST /api/douyin/webhook` | 抖音验签 | 挑战校验、去重事件入库 |

## 数据库与权限

新增/升级 `douyin_accounts`、`douyin_tokens`、`douyin_videos`、`douyin_sync_logs`、`douyin_webhook_events`。管理员拥有全部权限；管理层（运营负责人）获得 `douyin:view/account/sync/report`；创作者应仅获 `douyin:view` 且服务端按 `user_id` 限制账号；普通成员不分配抖音权限。

## 审核通过后的配置

在部署密钥中设置 `DOUYIN_CLIENT_KEY`、`DOUYIN_CLIENT_SECRET`、`DOUYIN_REDIRECT_URI`、`DOUYIN_WEBHOOK_URL`。生产回调建议为 `https://lanyaomedia.com/api/douyin/oauth/callback`，Webhook 为 `https://lanyaomedia.com/api/douyin/webhook`。在抖音控制台登记相同的授权回调、安全域名及 HTTPS Webhook URL，再申请所需用户、视频和数据 scope。

## Webhook

启用能力后配置 `DOUYIN_WEBHOOK_SECRET`。平台的 `verify_webhook` 请求会收到文本 JSON 的 `challenge` 响应；普通事件按 `X-Douyin-Signature` 验签，使用 event_id/log_id 去重后写入事件表。`api/services/douyin/scheduler.ts` 已提供每日同步任务入口；审核通过后可由 node-cron 或部署平台每日触发一次，避免在审核期发出无权限请求。
