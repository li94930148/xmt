# XMT 系统版本

## 当前版本

v2.20.16

## 版本规则

- 工程版本以 `package.json` 为准。
- 每次升级递增一个明确版本，不跳过中间版本。
- 版本变更需同步 README、根目录 CHANGELOG、`docs/CHANGELOG.md` 与系统更新说明。

## 本版本摘要

本版本（v2.20.16）收口审计发现的两个生产依赖中危公告（`@tiptap` `mergeAttributes()` `__proto__` 污染、`qs` 数组上限与 `isBuffer` DoS）以及工程化改进：HTTP 级错误脱敏拦截器加回归测试、请求体与同步包体积常量统一来源、xlsx 解析前用 `sheet['!ref']` 做行 / 列上限防护、清除 `creatorDataCenter.acceptCreatorDataSync` 死代码、成就进度去 N+1、新增 HTTPS 部署硬性要求说明。无数据库迁移、未变更对外 API 行为。

在本版本之前（v2.20.14）完善月报、年报归档详情查看、完整字段展示和权限错误语义；无 schema 变更，Creator Agent 版本保持 v2.13.7-agent。
