# Phase D7-D5 Shooting Failure Browser Verification

## 1. 测试环境

- 本地开发服务：`http://127.0.0.1:5174`；通过仅监听 localhost 的 failure-injection proxy（`http://127.0.0.1:5175`）访问。
- 测试资源：Topic `112`、Production `86`、Shooting `35`。
- manifest：`tests/fixtures/shooting-graceful-dispose.manifest.local.json`，允许的受控目标为 `PUT /api/workflow/shooting/35`。
- 使用独立、已登录的测试浏览器会话。未记录任何密码或认证信息。
- 本阶段未修改应用代码、Runtime、Adapter、Yjs、Socket.IO、数据库或业务数据结构。

## 2. Proxy profile

| Profile | 受控行为 | 结果 |
| --- | --- | --- |
| `shooting_reject_once` | 首个允许路径请求直接返回 503，且不转发 | 用于失败、继续编辑、重试和竞态用例 |
| `shooting_timeout_once` | 首个允许路径请求超出 Runtime 保存预算 | 用于超时离开保护用例 |
| `shooting_passthrough` | 正常转发 | 用于重试成功和持久化验证 |

所有受控失败仅匹配 fixture manifest 中的 Shooting 35 保存路径；未扩大到 Production 或任意 Shooting ID。

## 3. 测试矩阵

| Case | 验证项 | 结果 | 观察结果 |
| --- | --- | --- | --- |
| 1 | `shooting_reject_once` 后继续编辑 | 通过 | 保存失败后 URL 保持 `/shooting/35`，失败对话框显示，编辑器和当前内容仍在；点击“继续编辑”关闭对话框且页面可继续编辑。 |
| 2 | 失败后切换 `passthrough` 并重试 | 通过 | “重试保存”后 `script_content` 保存成功，原 continuation 仅导航一次至 `/shooting`。 |
| 3 | `shooting_timeout_once` | 通过 | 保存超时后 URL 仍为 `/shooting/35`，失败确认 UI 显示，编辑器保留；没有提前导航。该 UI 路径属于非 durable/中断确认处理。 |
| 4 | 放弃离开 | 通过 | 在超时失败确认 UI 中点击“放弃离开”后，页面仅导航一次至 `/shooting`，编辑器已卸载。 |
| 5a | `retry/retry` 快速重复点击 | 通过 | 只产生一次可见导航，失败 UI 关闭，未观察到重复导航。 |
| 5b | `discard/retry` 快速交叉点击 | 未通过 | 失败 UI 保持打开、URL 保持 `/shooting/35`、未出现导航；两个动作都未成为 winner。反向的 `retry/discard` 并发操作也复现相同行为。单独随后点击“重试保存”可正常恢复并导航。 |
| 6 | `script_content` 持久化 | 通过 | `D7_D5_RETRY_SUCCESS` 在重开 `/shooting/35` 后仍存在，证明 retry 路径写入的是 Shooting 的 `script_content`。 |

## 4. script_content 验证与 fixture 清理

重试成功后重新打开 Shooting 35，编辑器显示 `D7D5RETRY_SUCCESS`（编辑器展示时将测试输入中的下划线规范化），确认保存内容已恢复。

完成验收后，已通过正常编辑与 autosave 将 fixture 恢复为初始内容：

```text
D7 Shooting Graceful Dispose Fixture Content
```

刷新页面后再次读取编辑器，确认恢复内容已持久化。

## 5. Console / Network

- 预期的受控 503 与超时只发生在 manifest 允许的 `PUT /api/workflow/shooting/35` 测试保存请求上。
- 未观察到 Shooting 页面可见的应用异常或协作断连现象。
- 浏览器自动化环境曾输出一次与本地 XMT 无关的 Statsig 外部分析请求超时；它不对应页面业务请求，未影响本次保存、对话框或导航结论。

## 6. 未覆盖项

- Shooting 详情当前没有独立“查看关联 Production”入口，因此该导航路径无法验收；本阶段按约束未修改页面。
- 浏览器关闭、刷新和 `beforeunload/pagehide` 不属于本阶段的受控离开范围，未测试。
- `discard/retry` 的 First Action Wins 竞态未通过，需要单独的页面交互修复任务；本阶段未现场修复。

## 7. 是否建议进入 D8

不建议在当前状态进入 D8 / Runtime 清理评估。

正常、快速、失败、超时、重试、单独放弃离开以及 `script_content` 持久化链路均已通过；但 Shooting failure dialog 的交叉动作竞态未满足“First Action Wins”要求。应先建立一个仅限共享失败对话框 action gate 的修复与浏览器回归任务，覆盖 `discard/retry` 和 `retry/discard`，再重新评估后续阶段。
