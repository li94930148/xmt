# Socket 业务时段观察报告（v2.17.2）

## 观察信息

- 观察日期：2026-08-10
- 观察窗口：03:00–03:52 UTC（6 次只读采样，约每 10 分钟一次）
- 生产基线：v2.17.2 / `9ec005be04872965f30375083d46c4ee2536dc52`
- 运行模式：legacy
- 约束执行情况：未 reload PM2、未修改配置、未开启 Auth 灰度、未创建账号、未修改数据库。

## 运行态确认

整个观察窗口内，以下门禁均保持关闭：

- Auth v1：false
- Auth Web：false
- Login Rollout：false
- Socket Bridge：false
- Rollout mode：legacy
- Allowlist：0

API 健康检查持续返回 200；SQLite `quick_check` 持续为 `ok`；Caddy 服务保持 active。

## 采样结果

| 采样时间（UTC） | PM2 重启次数 | 进程内存 | Heap Used | Heap Size | 活跃 Socket | 连接 / 断开 / 重连 | SID unknown |
| --- | ---: | ---: | ---: | ---: | ---: | --- | ---: |
| 03:00:46 | 94 | 191.4 MiB | 90.11 MiB | 96.24 MiB | 2 | 10 / 8 / 2 | 3 |
| 03:10:36 | 94 | 195.3 MiB | 93.66 MiB | 97.94 MiB | 2 | 10 / 8 / 2 | 3 |
| 03:20:59 | 94 | 200.0 MiB | 97.71 MiB | 103.65 MiB | 2 | 10 / 8 / 2 | 3 |
| 03:31:45 | 94 | 206.5 MiB | 104.84 MiB | 109.98 MiB | 2 | 10 / 8 / 2 | 3 |
| 03:41:54 | 94 | 216.9 MiB | 112.49 MiB | 117.31 MiB | 2 | 10 / 8 / 2 | 3 |
| 03:52:03 | 94 | 216.2 MiB | 113.13 MiB | 119.14 MiB | 2 | 10 / 8 / 2 | 3 |

## Socket 生命周期

窗口内存在真实 Socket 样本。生命周期汇总在整个窗口内保持不变：

- 连接：10
- 断开：8
- 重连：2
- 活跃连接：2
- transport：全部为 polling
- upgrade：0

`Session ID unknown` 累计 3 次，分类如下：

| 分类 | 数量 | 说明 |
| --- | ---: | --- |
| A：server_missing_sid | 1 | 服务端不再持有 SID |
| B：client_repeated_polling_old_sid | 2 | 客户端继续请求旧 polling SID |
| C：proxy_chain_problem | 0 | 未发现 |
| D：transport_switch_problem | 0 | 未发现 |
| E：other | 0 | 未发现 |

观察窗口内未新增该类错误，因此当前样本只能说明历史异常未继续增长，不能证明其已被彻底消除。

## 稳定性观察

- PM2 重启增量：0；`unstable_restarts` 为 0。
- OOM 证据：未发现。
- Caddy 502：0。
- Caddy Socket 相关错误：0。
- API 与 SQLite：持续健康。

内存未出现快速失控，但尚未形成稳定平台：

- 进程内存从 191.4 MiB 上升至 216.2 MiB，净增约 24.8 MiB。
- Heap Used 从 90.11 MiB 上升至 113.13 MiB，净增约 23.0 MiB。
- 最后一次进程内存较前一次小幅回落，但 Heap Used 仍增加 0.64 MiB。

该窗口不足以判定存在泄漏，但也不足以证明长连接业务时段的 Heap 已稳定。

## C3.12-A 准入结论

**结论：暂不满足重新进入 Phase 2-C3-12-A 的条件。**

原因：

1. `Session ID unknown` 仍为 3 / 10，其中 B 类旧 polling SID 为 2 / 10，频率尚不适合在 Auth 灰度前忽略。
2. 60 分钟内 Heap 与进程内存整体持续抬升，尚未观察到可确认的稳定平台。
3. 虽然存在真实 Socket 样本且未见重启、502、OOM 或数据库异常，但样本量和稳定性证据仍不足。

## 后续建议

1. 保持生产 legacy 及所有 Auth 灰度门禁关闭。
2. 再完成至少 1–2 个真实业务窗口的只读观察，重点记录 GC 后内存、活跃连接数及 B 类旧 SID 增量。
3. 若 B 类仍持续出现，再单独评估客户端 polling 旧 SID 的生命周期治理；不要将该排查与 Auth 灰度变更合并。
