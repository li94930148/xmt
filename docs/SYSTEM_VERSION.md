# XMT 系统版本

## 当前版本

v2.19.9

## 版本规则

- 工程版本以 `package.json` 为准。
- 每次升级递增一个明确版本，不跳过中间版本。
- 版本变更需同步 README、根目录 CHANGELOG、`docs/CHANGELOG.md` 与系统更新说明。

## 本版本摘要

本版本修复 Android Native Auth 真实登录后的自动续期调度：以服务端 `expiresIn` 作为主要 lifetime 合同，登录/刷新显式绑定 scheduler，并提供非敏感诊断状态与生命周期补偿。
