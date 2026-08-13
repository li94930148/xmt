# XMT 系统版本

## 当前版本

v2.18.3

## 版本规则

- 工程版本以 `package.json` 为准。
- 每次升级递增一个明确版本，不跳过中间版本。
- 版本变更需同步 README、根目录 CHANGELOG、`docs/CHANGELOG.md` 与系统更新说明。

## 本版本摘要

本版本修复正式部署入口：固定目标 SHA，并在 PM2 重启前对正式 SQLite 在线备份执行非破坏 Restore Drill。
