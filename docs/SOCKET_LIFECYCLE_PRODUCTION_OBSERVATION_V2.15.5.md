# Socket 生命周期生产观察报告 v2.15.5

> 阶段：Phase 2-C3-8-C3.12-R2
> 部署时间：2026-08-06 10:37（Asia/Shanghai）
> 状态：已部署，24 小时 legacy 观察窗口已开始。

## 部署信息

- 部署提交：`949fcd8678fea0d90ff3ee9b2198593d2f88afc8`
- 部署版本：v2.15.5
- 部署分支：`release/v2.15.4-ui-completion`
- 变更范围：仅 Socket 生命周期安全观测、分类与 loopback-only 摘要端点。
- 数据库备份：`emergency-backup/xmt-v2.15.5-socket-observability-20260806-103045.db`
- 备份大小：250,974,208 bytes。

## 部署前后状态

| 项目 | 部署前 | 部署后 |
| --- | --- | --- |
| 生产版本 | v2.15.3 | v2.15.5 |
| PM2 restart count | 88 | 90 |
| PM2 uptime | 约 80 分钟 | 4 秒（reload 后） |
| Used Heap | 约 43.02 MiB | 约 42.91 MiB |
| unstable restarts | 0 | 0 |
| API health | 正常 | 正常，返回 v2.15.5 |
| SQLite quick_check | ok | ok |
| Caddy | active | active |

部署前已确认 migrations `001` 至 `007` 均为 applied；本补丁未新增 migration、表、字段或数据修改。

## Auth 灰度状态

部署后运行态来源仍为 `pm2_process_env`：

- Auth v1：false
- Auth Web：false
- Login Rollout：false
- Socket Bridge：false
- Rollout mode：legacy
- allowlist：0
- Socket Bridge approval：false

未创建测试账号、未修改 allowlist、未开启 Auth 灰度。

## Socket 观测端点验证

`/internal/socket-lifecycle/summary` 仅从生产 localhost 访问成功。

初始摘要：

- active connections：2
- transport：均为 polling
- upgrade：尚无事件
- disconnect reason：尚无事件
- `Session ID unknown` 分类：尚无事件

事件仅包含服务端生成的 `connectionId`、transport、时序、重连次数、upgrade 状态和断开原因；不包含 sid、token、cookie、用户、Session、房间或 Yjs 内容。

## 观察窗口与准入结论

从部署完成起保持 legacy 至少 24 小时，观察：

1. `Session ID unknown` 总量及 A/B/C/D/E 分类；
2. active connections、disconnect reason、transport/upgrade 与 reconnect 事件；
3. PM2 restart 增量、绝对内存值、heap 与 OOM/异常退出证据；
4. Socket 错误趋势。

**当前不满足重新执行 C3.12-A 条件。** 原因是 24 小时观察窗口尚未完成，尚无可用的分类趋势数据。观察完成后进入 C3.12-R3 汇总复核；期间保持 Auth 灰度全部关闭。
