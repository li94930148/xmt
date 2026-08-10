# v2.17.2 Socket Lifecycle Fresh Baseline

采集时间：2026-08-10

## 观察范围

- 仅统计 v2.17.2 当前 PM2 进程的数据，不合并 v2.15.5 历史数据。
- 生产保持 legacy；Auth v1、Auth Web、Login Rollout、Socket Bridge 均为 false，allowlist 为 0。
- 本次仅执行只读采集，未 reload PM2、未修改配置、未创建测试账号、未修改数据库。

## 服务与稳定性

| 项目 | 结果 |
| --- | --- |
| 生产 commit / 版本 | `9ec005b` / v2.17.2 |
| PM2 | online；restart 94；unstable restart 0 |
| 进程启动时间 | 2026-08-08 21:18 UTC |
| API / Caddy / SQLite | health 200 / active / `quick_check = ok` |
| Caddy 502（当前进程启动后） | 0 |
| Caddy Socket 相关错误（当前进程启动后） | 0 |
| OOM（当前进程启动后） | 0 |
| 当前内存 / heap | 约 183 MiB / 81.30 MiB（92.14%） |

相较于前一轮只读采样，内存约由 127 MiB 升至 183 MiB，已用 heap 约由 34.39 MiB 升至 81.30 MiB；当前没有重启或 OOM，但趋势需继续观察。

## Socket 生命周期样本

| 指标 | 数值 |
| --- | ---: |
| 活跃连接 | 2 |
| connection / disconnect | 10 / 8 |
| transport | polling（10） |
| upgrade 成功 | 0 |
| reconnect | 2 |
| Session ID unknown 总量 | 3 |
| A：server_missing_sid | 1 |
| B：client_repeated_polling_old_sid | 2 |
| C：proxy_chain_problem | 0 |
| D：transport_switch_problem | 0 |
| E：other | 0 |

真实连接样本已经具备，异常比例可以评估：Session ID unknown 为 3/10 次连接。现有分类表明以旧 polling SID 重复请求为主，尚无 Caddy 5xx、代理链路或 transport upgrade 关联证据。

## C3.12-A 准入判断

**暂不允许进入 Phase 2-C3-12-A。**

满足项：

1. 已获得真实 Socket 连接、断连与重连样本。
2. Auth 运行态仍为 legacy，全部灰度门禁关闭。
3. 未发现 PM2 异常重启、Caddy 502 或 OOM。

阻塞项：

1. `Session ID unknown` 在当前小样本中为 3/10，频率偏高，需先确认旧 polling SID 的来源和影响范围。
2. 本轮两次采样之间 memory 与 used heap 上升明显，尚不足以证明无持续增长风险。
3. 所有样本仍为 polling，尚未获得 websocket upgrade 行为证据。

## 下一步建议

继续维持 legacy 与全部 Auth 门禁关闭，至少补充一个业务时段的连接、内存和 heap 趋势；同时针对 B 类旧 polling SID 完成客户端重连/代理超时链路核查。异常频率下降且内存曲线稳定后，再重新申请 C3.12-A。
