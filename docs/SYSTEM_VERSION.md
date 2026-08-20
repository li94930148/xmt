# XMT 系统版本

## 当前版本

v2.20.0

## 版本规则

- 工程版本以 `package.json` 为准。
- 每次升级递增一个明确版本，不跳过中间版本。
- 版本变更需同步 README、根目录 CHANGELOG、`docs/CHANGELOG.md` 与系统更新说明。

## 本版本摘要

本版本将 Creator Collector 切换为 Scrapling First：采集在用户本机专用 Chrome Profile 中运行，通过 Python Worker 返回脱敏后的运营数据与能力清单；未完成真实登录 POC 前不会部署生产。
