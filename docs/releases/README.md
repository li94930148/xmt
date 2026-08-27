# XMT 系统更新总说明

版本升级必须同时更新系统版本号、对应版本说明、根目录 `CHANGELOG.md` 与前端系统更新数据 `src/data/changelog.ts`。每份版本说明必须包含版本号、更新时间、升级类型、功能模块、数据库变化、API变化、前端变化、修复问题和风险说明。

| 版本 | 日期 | 类型 | 说明 |
| --- | --- | --- | --- |
| [v2.20.2](./v2.20.2-main-consolidation.md) | 2026-08-27 | PATCH 修复 | 主线收口与 Android Native Auth 真实续期调度 |
| [v2.19.11](./v2.19.11-creator-agent-protocol-hardening.md) | 2026-08-20 | PATCH 安全修复 | Creator Agent 上传协议与防重放边界收口 |
| [v2.19.10](./v2.19.10-p1-security-followup.md) | 2026-08-20 | PATCH 安全补充 | 认证 Origin 与角色权限边界 P1 补丁 |
| [v2.19.9](./v2.19.9-security-hardening.md) | 2026-08-20 | PATCH 安全修复 | 权限、XSS、协作、Webhook 与认证边界硬化 |
| [v2.19.8](./v2.19.8-android-production-endpoint-build-contract.md) | 2026-08-17 | PATCH 修复 | Android Production Endpoint Build Contract 与 APK 产物校验 |
| [v2.12.0](./v2.12.0.md) | 2026-07-29 | MINOR 架构升级 | API Contract、requestId、OpenAPI、api-client 基础 |
| [v2.11.0](./v2.11.0.md) | 2026-07-29 | MINOR 架构升级 | Topic 模块化基础、兼容 legacy、可选 API v1 |
| [v2.10.3](./v2.10.3.md) | 2026-07-29 | PATCH 修复 | 粉丝解析、封面保留、两行三列布局 |
| [v2.10.2-storage](./v2.10.2-storage.md) | 2026-07-24 | 数据可见性与作品库优化 | 查看/管理权限分离、cursor 分页、封面降级 |
| [v2.10.2-sync](./v2.10.2-sync.md) | 2026-07-24 | 服务端同步契约升级 | 新旧 Agent 契约兼容、双表一致性、同步日志增强 |
| [v2.10.2-agent](./v2.10.2.md) | 2026-07-24 | Agent 契约升级 | 安全 JSON、ID 保真、严格识别、cursor 分页 |
| [v2.10.1](./v2.10.1.md) | 2026-07-24 | 数据模型与驾驶舱修复 | 标准 `douyin_*` 数据中心 |
| [v2.10.0](./v2.10.0.md) | 2026-07-23 | 功能升级 | Creator Data Center 分析与报告 |
