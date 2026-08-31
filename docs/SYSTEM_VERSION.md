# XMT 系统版本

## 当前版本

v2.20.5

## 版本规则

- 工程版本以 `package.json` 为准。
- 每次升级递增一个明确版本，不跳过中间版本。
- 版本变更需同步 README、根目录 CHANGELOG、`docs/CHANGELOG.md` 与系统更新说明。

## 本版本摘要

本版本修复 Creator Agent 登录窗口与浏览器状态不一致；Creator Agent 升级到 v2.13.1-agent。登录确认由 Main 状态机授权，保留本地队列迁移与 macOS arm64 打包运行时边界。
