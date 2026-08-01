# Auth 生产部署预检报告

> 检查日期：2026-08-01  
> 检查范围：仅只读检查；未修改生产代码、配置、服务、数据库或灰度状态。  
> 目标版本：v2.13.23

## 结论

**不具备开启 Production Socket Bridge 受控灰度的条件。**

生产环境当前运行的是 v2.13.12，未部署包含 v2.13.23 Production Socket Bridge 三重门禁及 `auth:production-preflight` 脚本的提交。必须先完成版本一致的部署并重新执行本预检；本次不进行灰度操作。

## 检查结果

| 项目 | 结果 | 说明 |
| --- | --- | --- |
| 生产提交 | 阻断 | `6390636b5983feee824709195a98946a461e85d2`，不是本阶段本地提交 `155793b`。 |
| 运行版本 | 阻断 | PM2 与健康接口均为 `v2.13.12`，目标为 `v2.13.23`。 |
| 预检脚本 | 阻断 | `npm run auth:production-preflight` 不存在，说明新部署尚未生效。 |
| PM2 | 通过（需关注） | `xmt-api` 为 online，监听 `127.0.0.1:3001`；累计重启 61 次，堆内存使用约 92%，上线前需复核稳定性。 |
| Caddy | 通过（需关注） | 服务为 active；日志中存在对 `127.0.0.1:3001` 的历史 Socket.IO 502 记录，当前端口已监听，仍应在部署后复测。 |
| API 健康 | 通过 | `http://127.0.0.1:3001/api/health` 返回 200，数据库状态 `ok`。 |
| SQLite | 通过 | `data/xmt.db` 的 `PRAGMA quick_check` 返回 `ok`。 |
| 最近数据库备份 | 通过 | `data/backups/xmt-2026-08-01-08-43-20.db`，时间 `2026-08-01 08:43:21`，大小 249,163,776 bytes。 |
| Auth Rollout | 关闭 | Login rollout、Auth v1、Web Auth 均为 `false`；allowlist 数量为 0。诊断接口未认证访问返回 401，配置状态已通过脱敏只读检查确认。 |
| Socket Bridge | 关闭 | `XMT_SOCKET_AUTH_BRIDGE_ENABLED=false`，`XMT_SOCKET_BRIDGE_APPROVED=false`。 |
| 运行环境 | 确认 | `NODE_ENV=production`。 |

## 本次读取的接口与命令结果

- `git rev-parse HEAD`：`6390636b5983feee824709195a98946a461e85d2`
- `pm2 status`：`xmt-api` online，版本 `2.13.12`
- `systemctl status caddy`：active (running)
- 健康接口：HTTP 200
- 灰度诊断接口：未携带认证上下文时返回 HTTP 401（符合访问控制预期）

## 重新预检前的必要条件

1. 将生产部署升级至 v2.13.23（含提交 `155793b` 或包含其内容的后续提交）。
2. 确认 PM2 的运行版本、`package.json` 版本和健康接口版本均为 v2.13.23。
3. 在生产目录执行 `npm run auth:production-preflight` 并确认通过。
4. 复核 PM2 重启次数、内存占用以及 Caddy Socket.IO 502 是否仍在持续发生。
5. 保持 Login Rollout 与 Socket Bridge 的全部开关关闭，直至完成新的审批和受控开启指令。

## 安全说明

本报告未记录任何密码、Token、Cookie、allowlist 用户 ID 或环境变量敏感值。
