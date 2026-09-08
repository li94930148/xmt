# 生产运行维护

## 2026-09-07 登录服务不可用恢复记录

- GitHub `origin/main` 与生产 HEAD 均为 `de3c2d4`（v2.20.14）；完成 fetch 和 fast-forward 检查，无待同步提交。本地审计分支包含 main，并保留其额外提交。
- 故障现象：`/login` HTTP 200，`/api/health` HTTP 502，3001 端口无监听，Caddy active。
- 已证实原因：`/opt/node-v24.17.0-linux-x64` 缺失，Node/npm/PM2 链接失效；存活 PM2 进程的 `/proc/<pid>/exe` 标记为 deleted。PM2 在北京时间 11:14:26 记录 `spawn node ENOENT`，后端无法重新启动。删除来源尚未确定。
- 恢复前在服务器 `/root/xmt-runtime-repair-20260907-140100` 保存 PM2 dump、systemd 单元、PM2 日志及 SQLite 在线备份；备份 `PRAGMA quick_check` 返回 `ok`。该目录仅 root 可访问，不纳入 Git。
- 从 Node.js 官方下载原版本 24.17.0 Linux x64 安装包，并用官方 SHASUMS256.txt 核验 SHA-256；恢复原安装路径，安装原版本 PM2 7.0.1。
- 使用既有 PM2 配置执行 `pm2 restart xmt-api`，未使用 `--update-env`，未调整 Auth 灰度。健康检查通过后执行 `pm2 save` 与 `systemctl start pm2-root`。
- 验证：后端及公网健康 HTTP 200、`database.ok=true`、版本 2.20.14；公网登录接口空请求返回预期 HTTP 400 和“用户名和密码不能为空”；浏览器登录页正常；PM2 online，pm2-root active/enabled。
- 未使用真实用户凭据，未验证成功登录后的完整会话链路；未重启整台服务器验证自启。
- 本次为原版本运行环境恢复，仅补充运维文档，无业务代码、数据库结构或权限变更，不触发应用版本升级。

## 同类故障排查与恢复边界

1. 先分别检查公网页面、API、后端直连、端口及 Caddy，保留当前日志和进程证据。
2. 如果出现 `spawn node ENOENT`，检查 Node/npm/PM2 链接目标及 systemd 的 ExecStart/PATH。`/opt/node-*` 是生产运行依赖，不属于可删除缓存。
3. 恢复前备份数据库、进程保存配置和 systemd 单元；不要打印配置中的凭据。
4. 若运行目录缺失，优先恢复已确认的原版本到原路径，从官方来源下载并校验完整性；保留现有环境与应用版本，不混入应用升级。
5. 通过 PM2 恢复既有应用，确认直连和公网健康、登录接口、数据库状态后再保存进程列表，并确认 systemd active/enabled。
6. 应用代码发布仍使用 `deploy/xmt-safe-deploy.sh` 对应生产入口，提供精确 `TARGET_SHA_EXPECTED`，执行备份、迁移和构建门禁。
