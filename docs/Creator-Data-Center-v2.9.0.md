# Creator Data Center v2.9.0 架构说明

## 现有 v2.8.1 链路审计

Creator Agent 已形成可复用的真实采集链路：

1. `core/browser` 通过 `BrowserAdapter` 统一系统 Chrome CDP 与内置 Chromium 会话，登录状态由既有适配器确认。
2. `core/network` 的 Response Collector 监听真实 XHR/fetch，Discovery Store 持久化已发现 API，不猜测接口。
3. `core/collector/douyin` 按作品管理、作品详情、账号总览、作品分析、粉丝画像页面生成统一 `CreatorSnapshot`。
4. `core/database/creatorDatabase.ts` 将快照写入本地 SQLite，支持离线缓存和模块级错误隔离。
5. `core/uploader` 使用 Agent Token 派生 AES-256-GCM 密钥，加密快照后以 HMAC-SHA256 签名上传。

v2.9.0 不修改 Chrome CDP、Network Collector 和登录态管理。新增能力位于 Explorer、上传映射、服务端数据中台和前端展示层。

## v2.9.0 数据流

```text
真实 Chrome 创作者中心
  -> 既有 Collector / SQLite 快照
  -> 平台无关上传映射
  -> AES-256-GCM + HMAC-SHA256
  -> POST /api/creator-agent/data-sync
  -> 服务端事务、去重、快照与原始数据入仓
  -> /analytics/creator-center
```

平台原始字段仅保存在 `raw_json` / `creator_api_raw_records`；业务查询使用平台无关字段，因此后续可接入小红书、视频号和快手而无需重建分析层。

## 安全与一致性

- `creator_platform_accounts.user_id` 是 XMT 租户边界。
- Agent 身份、平台和账号三者必须与注册绑定一致。
- 内容、指标、趋势、账号指标和画像使用业务唯一键幂等写入。
- 一批同步在单个数据库写事务中完成，任一核心写入失败即回滚。
- 原始 API 响应完整保留，页面或接口变化后可以重新解析。
