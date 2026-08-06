# Socket 生命周期观测与生产稳定性复核

> 阶段：Phase 2-C3-8-C3.12-R1 Socket Lifecycle Observability
> 本地补丁版本：v2.15.5
> 生产只读复核时间：2026-08-06（Asia/Shanghai）

## 结论

**不进入 Auth 灰度，也不能直接重新执行 C3.12-A。**

生产实际已前进到 v2.15.3（`ab4989a`），本观测补丁 v2.15.5 尚未发布。当前只能确认旧日志中的异常频率，不能将其归类为新的生命周期诊断结论。

## 观测模型

新增 `SocketLifecycleObserver`，仅保留进程内映射，外部结构化日志和 loopback-only 摘要中不出现 Engine.IO sid、socket ID、token、cookie、用户、room、Yjs payload 或 Session 内容。

每个连接记录的安全字段：

- `connectionId`：服务端生成的随机关联 ID；
- transport、connected_at、disconnect_reason、disconnect_time；
- reconnect_attempt、upgrade 状态、生命周期耗时；
- `Session ID unknown` 分类、HTTP 状态和来源是否经过代理。

新内部只读摘要端点：`/internal/socket-lifecycle/summary`。仅 loopback 可访问，输出活动连接数、计数器和最近安全事件。

## `Session ID unknown` 分类

| 类别 | 判断依据 |
| --- | --- |
| A `server_missing_sid` | sid 不存在于当前进程活跃映射，且无已知的最近断开记录。 |
| B `client_repeated_polling_old_sid` | polling 请求命中 15 分钟内已断开的内部 sid 映射。 |
| C `proxy_chain_problem` | 经代理且收到 5xx 状态。 |
| D `transport_switch_problem` | websocket/upgrade 上下文中发生。 |
| E `other` | 其余无法安全归因的情况。 |

原始 sid 只用于内存关联和自动过期清理，不写入日志、指标或 API 响应。

## 本地验证

- polling 连接、reconnect、websocket upgrade、disconnect 生命周期：通过。
- 最近断开 polling sid：归类 B；未知 sid：归类 A；websocket：归类 D；代理 502：归类 C。
- 测试断言所有结构化事件均不含 sid、token 或 cookie。
- `npm run test:socket`、`npm run test:socket-coordinator`、`npm run test:yjs-auth-recovery`、`npm run check`、`npm run build`、`npm run version:check`：通过。

## 生产只读观察

| 项目 | 结果 |
| --- | --- |
| 生产版本 | v2.15.3，`ab4989a08dddf181ccf0836ceff1f4a88c8a2947` |
| Auth 运行态 | legacy；Auth v1/Auth Web/Login Rollout/Socket Bridge 均为 false；allowlist=0 |
| PM2 | online，单实例；累计重启 88；当前 uptime 约 72 分钟；unstable restarts=0 |
| 内存 | 当前 Used Heap 约 41 MiB；Heap Usage 95% 仅反映当前 43 MiB heap 容量，未发现 OOM 证据 |
| 近观察窗口异常 | 52 条 `Session ID unknown` |

## 根因判断与建议

已知生产是单实例 fork 模式，Caddy 对 `/socket.io/*` 直连反向代理，因此暂不支持“多实例未 sticky”结论。异常发生频率仍不可接受，但现有旧日志包含原始 sid 且缺少生命周期关联，无法在 A/C/D/E 之间做可信归因。

下一步应先将 v2.15.5 作为独立稳定性补丁发布，保持 Auth 灰度全关；随后在 legacy 运行态观察至少 24 小时：

1. 读取 loopback summary 的分类计数、upgrade 和 disconnect 原因；
2. 对比发布后 24 小时 `Session ID unknown` 的频率和分类；
3. 记录 PM2 restart 增量、内存绝对值和异常退出证据；
4. 只有分类可解释且趋势稳定时，重新执行 C3.12-A。
