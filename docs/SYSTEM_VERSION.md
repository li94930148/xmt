# XMT 系统版本

## 当前版本

v2.20.6

## 版本规则

- 工程版本以 `package.json` 为准。
- 每次升级递增一个明确版本，不跳过中间版本。
- 版本变更需同步 README、根目录 CHANGELOG、`docs/CHANGELOG.md` 与系统更新说明。

## 本版本摘要

本版本解耦 Creator Agent Profile 认证事实与临时登录窗口；Creator Agent 升级到 v2.13.2-agent。Main 权威计算登录动作和同步能力，保留本地队列迁移与 macOS arm64 打包运行时边界。
