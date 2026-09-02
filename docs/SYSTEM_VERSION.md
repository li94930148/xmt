# XMT 系统版本

## 当前版本

v2.20.10

## 版本规则

- 工程版本以 `package.json` 为准。
- 每次升级递增一个明确版本，不跳过中间版本。
- 版本变更需同步 README、根目录 CHANGELOG、`docs/CHANGELOG.md` 与系统更新说明。

## 本版本摘要

本版本修复 Creator Agent sandboxed Preload 的浏览器安全契约；Agent 升级为 v2.13.5-agent。HMAC 仅在 Main，Renderer 继续只接收短审计标识与范围状态。
