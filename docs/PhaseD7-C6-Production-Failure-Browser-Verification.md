# Phase D7-C.6 Production Failure Browser Verification

## 1. 环境

- 浏览器入口：本地 failure-injection proxy，`http://localhost:5175/production/85`
- 上游：本地 Vite 开发服务 `http://127.0.0.1:5174`
- 测试记录：Production ID `85`，协作房间 `production:85`
- 测试账号：既有管理员测试账号（未记录密码）
- 保存目标白名单：`PUT /api/workflow/production/85`
- 代理 profile：`reject_once`、`timeout_once`、`passthrough`

每次进入失败场景前，先使用 `passthrough` 使页面协作初始化稳定，再切换一次性 profile 并输入新的 C6 测试标记。这样避免页面初始化中的协作写入消耗一次性故障注入。

本阶段未修改 Production 业务、Runtime、Adapter、API、数据库、权限、workflow、Yjs 或 Socket.IO。为使测试代理能作为 Windows 命令行脚本运行，仅修正了测试脚本自身的入口路径解析（`pathToFileURL`）；代理自测随后通过。

## 2. 测试矩阵

| 用例 | Profile | 结果 | 关键证据 |
| --- | --- | --- |
| reject_once + 继续编辑 | `reject_once` | 通过 | 输入 `D7_C6_REJECT_CONTINUE_2` 后点击返回：URL 保持 `/production/85`，显示“未能确认保存” dialog，编辑器与输入内容仍存在。点击“继续编辑”后 dialog 关闭，仍停留当前页。|
| reject_once + retry | `reject_once` 后切换 `passthrough` | 通过 | 失败 dialog 出现“重试保存”；切换 passthrough 后点击重试，进入 `/production`。重新打开 Production 85 后 `D7_C6_RETRY` 存在，确认 retry 已持久化并继续原 navigation。|
| timeout_once | `timeout_once` | 通过 | 输入 `D7_C6_TIMEOUT` 后点击返回：URL 保持 `/production/85`，显示“保存确认超时” dialog，编辑器仍存在，且提供“重试保存”。|
| discardAndLeave | 失败 dialog 后 `passthrough` | 通过（黑盒） | 点击“放弃离开”后进入 `/production`，失败 dialog 消失。页面未暴露 Runtime destroy 事件，因此浏览器只能确认该 UI 路径完成一次 navigation；`discardAndLeave()` 调用与 destroy 顺序由既有 hook/component 测试覆盖。|
| 快速 retry / retry | 失败 dialog 后 `passthrough` | 通过（黑盒） | 对“重试保存”执行快速双击，最终只进入一次 `/production`，没有残留 failure dialog。|
| 快速 discard / retry | 失败 dialog 后 `passthrough` | 发现问题 | 两个互斥按钮的并发自动化点击均被浏览器接受，但页面保持在失败 dialog，未发生 navigation；随后单独点击“放弃离开”可正常进入 `/production`。未出现重复保存或重复 navigation，但该冲突点击没有形成预期的“第一动作获胜”终态。|

## 3. 各异常流结果

### reject_once

一次性 HTTP 503 不会转发到本地 upstream，因此不会由该失败请求写入 Production。页面将该保存结果映射为 `not_durable`，受控导航被阻止，失败 dialog 提供继续编辑、retry 和 discard。

### retry

在失败 dialog 打开后切换到 `passthrough`，retry 使用既有 LeaveGuard continuation。浏览器确认内容保存后只到达一次创作列表；没有触发版本、审批或 workflow 操作。

### timeout_once

代理延迟超过 1500ms 测试预算后返回 504。页面显示 timeout 专用文案并保持当前路由，符合 `not_durable` 的保护要求。

### discard

浏览器确认“放弃离开”不会停留在失败 dialog，并完成一次列表导航。此路径不声称内容已保存；由于这是黑盒页面验收，无法直接读取 `destroy()` 内部调用事件。

## 4. Console 与 Network

- 已完成用例中，页面 console 的 error / warning 列表为空，未观察到 XMT 应用级 console 异常。
- `reject_once` 的可见结果是 HTTP 503 对应的 `not_durable` dialog；请求未转发。
- `timeout_once` 的可见结果是超过预算后的 HTTP 504 对应 timeout dialog；请求未转发。
- retry 使用 `passthrough` 后重新打开记录确认了保存结果。
- 测试代理不记录 Authorization、cookie、密码、请求正文或编辑内容；本报告也不包含这些数据。

## 5. 发现问题

### 互斥失败操作的并发处理

在同一失败 dialog 中快速触发 `discard` 与 `retry` 时，未发生重复 navigation 或重复保存，但两个动作均未推进页面，dialog 仍保持打开。单独操作正常。

这说明当前 action gate 已避免重复副作用，但“两个不同操作同时到达时，哪一个应成为唯一 winner”的页面级行为还没有被明确固定。本阶段禁止修改业务代码，因此仅记录问题；后续应单开小修复任务，将 gate 语义明确为首个 action 锁定后，后续不同 action 忽略，并补充真实浏览器回归。

## 6. 是否建议进入 Shooting

不建议进入 Shooting graceful-dispose 接入。

Production 的 `not_durable`、timeout、retry、discard 与重复 retry 已获得浏览器证据，但 discard/retry 冲突操作仍有未收敛行为。应先完成该 Production UI 边界修复与回归验证，再重新评估 Shooting。
