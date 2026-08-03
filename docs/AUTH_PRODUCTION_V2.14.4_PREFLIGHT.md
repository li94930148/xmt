# Auth 生产 Member Allowlist 灰度 Round 2 预检

**执行时间：** 2026-08-03
**预检性质：** 只读；未创建账号、未修改配置、未重启服务。

## 结论

**预检通过，待本轮审批。**

生产已受控升级到目标 `v2.14.4 / 353f0d6`。所有 Auth 门禁继续关闭，灰度 readiness 返回 `NOT_READY` 是预期结果：当前尚未创建测试账号、写入 allowlist、设置观察窗口或取得本轮审批。在完整审批前，不得执行这些操作。

## 只读核验结果

| 项目 | 结果 |
| --- | --- |
| 生产 commit | `353f0d651de84c19520f0523c9ab7376b3922131` |
| 生产版本 | `v2.14.4` |
| PM2 | `xmt-api` online，运行版本 2.14.4，部署后新进程已加载 |
| Caddy | active |
| API health | HTTP 200 |
| SQLite | `data/xmt.db` 的 `PRAGMA quick_check` 返回 `ok` |
| 部署前备份 | `emergency-backup/xmt-20260803-112425.db`（240 MB） |

## Auth 运行态

内部运行态端点显示：

- Auth v1：`false`
- Auth Web：`false`
- Login Rollout：`false`
- Socket Bridge：`false`
- Rollout Mode：`legacy`
- allowlist：空（0）

`npm run auth:gray-readiness` 返回 `NOT_READY`；原因包括没有 2–3 个 enabled member allowlist、Auth v1 / Login Gateway / Socket Bridge 门禁关闭，以及没有配置 30–60 分钟观察窗口。这与生产保持 legacy、尚未开始本轮灰度的预期一致。

## 允许的下一步

1. 由技术、安全、业务负责人、执行人与两位 allowlist 复核人重新确认本轮审批、观察窗口与停止条件。
2. 在审批记录完整后，创建 2 个隔离 member 测试账号，写入唯一 PM2 配置来源并受控重启。
3. 运行态端点、管理员诊断和 gray readiness 三者全部为 `READY` 后，才可开始真实浏览器观察窗口。
