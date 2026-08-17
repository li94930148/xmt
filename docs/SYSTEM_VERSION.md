# XMT 系统版本

## 当前版本

v2.19.7

## 版本规则

- 工程版本以 `package.json` 为准。
- 每次升级递增一个明确版本，不跳过中间版本。
- 版本变更需同步 README、根目录 CHANGELOG、`docs/CHANGELOG.md` 与系统更新说明。

## 本版本摘要

本版本修复 Android Native Auth 的 access token 自动续期；Native Runtime 不再依赖默认关闭的 Socket Coordinator，且不放宽既有 CORS、安全存储或灰度准入边界。
