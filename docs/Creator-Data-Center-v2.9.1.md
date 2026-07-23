# Creator Data Center v2.9.1 稳定增强

v2.9.1 不修改 Chrome CDP、Network Collector、登录态、AES/HMAC 或 Yjs 同步协议。

## 同步语义

- Agent 保持真实页面采集，使用本地 `creator_works` 作为作品增量游标。
- 作品按 `platform_item_id` 增量上传；指标、账号经营和粉丝画像按 `snapshot_time` 保存历史。
- 服务端首先建立账号上下文，随后以独立事务写入 works、metrics、trends、account_metrics、fans、raw、page_schema 和 insights。
- 响应返回每个模块的 `success` / `failed`、错误明细和整体 `success` / `partial_success` / `failed`。

## 数据治理

- 原始响应在压缩前计算 SHA-256，使用 `(user_id, platform, hash)` 去重。
- `response_json` 保存 gzip 后的 Base64 数据，`compression='gzip'` 标记解码方式。
- Page Explorer 只从真实 XHR/fetch 响应提取最多三层字段路径，不推测接口字段。
- 洞察由数据库快照确定性计算，不调用任何外部 AI 服务。

## 权限范围

- `creator:data:view`：进入数据中心并读取已授权账号。
- `creator:data:manage`：刷新分析和管理账号授权。
- 账号所有者自动获得 manage；其他用户通过 `creator_account_access` 获得 view 或 manage。
- admin 可访问全部账号；director 仍受账号授权范围限制。
