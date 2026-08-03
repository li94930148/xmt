# Auth 生产 v2.14.5 部署与灰度前预检报告

## 部署信息

- 部署日期：2026-08-03（Asia/Shanghai）
- 版本：v2.14.5
- 提交：`840be73 修复: 完善Auth v1登录完成态处理`
- 数据库备份：`emergency-backup/xmt-v2.14.5-20260803-142700.db`（240MB）

## 部署结果

- 代码已快进同步至目标提交；
- 版本一致性检查通过；
- 生产构建完成；
- PM2 已受控 reload，`xmt-api` 为 online；
- Caddy 为 active；
- API 健康接口返回 HTTP 200；
- SQLite `PRAGMA quick_check` 返回 `ok`。

## 浏览器回归

使用项目 Playwright Chromium 在本地一致环境完成：

- legacy 登录导航通过；
- v1 模拟 allowlist 登录导航通过；
- v1 Auth Runtime 完成态存在；
- v1 登录流程未调用 legacy `GET /api/auth/me`；
- Auth browser、Login Gateway、类型检查和生产构建均通过。

## 生产运行态与灰度门禁

运行态来源为 PM2 process environment，确认：

- Auth v1：关闭；
- Auth Web：关闭；
- Login Rollout：关闭；
- Socket Bridge：关闭；
- 模式：`legacy`；
- allowlist：0；
- Socket Bridge 审批：关闭。

`auth:gray-readiness` 返回 `NOT_READY`，原因是所有灰度门禁、allowlist 和观察窗口均按本阶段要求保持关闭；这符合预期。

## 结论

v2.14.5 已稳定运行，灰度保持关闭，满足重新申请 Phase 2-C3-8-C3.9 member allowlist 灰度的技术前置条件。正式开启前仍需重新完成审批、隔离测试账号和运行态 `READY` 验证。
