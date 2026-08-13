# XMT 系统版本

## 当前版本

v2.18.4

## 版本规则

- 工程版本以 `package.json` 为准。
- 每次升级递增一个明确版本，不跳过中间版本。
- 版本变更需同步 README、根目录 CHANGELOG、`docs/CHANGELOG.md` 与系统更新说明。

## 本版本摘要

本版本补齐正式部署的版本一致性 Gate：在 PM2 重启前验证工程、页面、health 与发布文档版本事实源一致。
