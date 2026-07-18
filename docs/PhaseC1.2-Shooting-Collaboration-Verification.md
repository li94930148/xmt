# Phase C1.2 Shooting Collaboration Verification

## 1 测试环境

- 测试记录：Shooting ID `34`，关联测试选题 ID `111`。
- 预期协作 room：`shooting:34`。
- 浏览器 A：独立应用内浏览器会话，账号 `yffa23`。
- 浏览器 B：独立 Chrome 浏览器会话，账号 `1`。
- 两端分别登录，未共享 cookie、localStorage 或 session；本报告不记录密码。
- 所有输入均限于 Shooting `34` 的 `script_content` 测试标记；未点击“开始制作”、完成、删除、Publishing 或任何工作流按钮。

## 2 双用户进入

**通过。** 两端均打开 `/shooting/34`，初始 `script_content` 都是 `C1 Runtime Collaboration Shooting Test Content`。

- 两端分别建立独立 Socket 连接，且能接收对方后续的协作更新，行为与 `shooting:34` 的预期一致。
- A 显示 B 的 awareness 标签 `1 · admin`；B 显示 A 的 `李庆 · admin`。
- 未观察到重复初始化内容、重复 presence 或应用控制台错误。

现有 UI 未暴露 provider 实例计数，因此 provider 数量只能通过无重复正文、无重复 presence 的行为结果验证，不能作为内部计数断言。

## 3 Yjs 同步

**通过。** A 输入 `SHOOTING_USER_A` 后，B 收到更新；B 输入 `SHOOTING_USER_B` 后，A 收到更新。

两端 `contenteditable` 的原始 HTML 会因本地协作光标（`.xmt-collaboration-cursor`）插入位置不同而不完全相同。该节点是 awareness 展示节点；两端实际业务标记均存在且各出现一次，未发现重复 `script_content` 节点。

## 4 粘贴测试

**通过。** 在 Shooting `34` 中执行了：

- 纯文本粘贴：`SHOOTING_PLAIN_PASTE`
- HTML 富文本粘贴：`SHOOTING_HTML_PASTE`
- 大文本粘贴：`SHOOTING_LARGE_PASTE_` 加 4096 个字符
- A 粘贴 `SHOOTING_CONCURRENT_PASTE` 时，B 同时输入 `SHOOTING_CONCURRENT_EDIT`

所有标记在 A、B 两端均为 **1 次**，未观察到重复段落、重复节点或应用控制台错误。

## 5 Autosave

**通过（黑盒验证）。** A 快速追加 `SCRIPT_A`、`SCRIPT_B`、`SCRIPT_C`、`SCRIPT_D`，等待超过 Runtime 的 2.5 秒自动保存延迟，然后重新载入 `shooting/34`。

- 重新载入后所有此前的 Shooting 协作、粘贴及快速保存标记都存在。
- 重新载入的文本与 B 保持页面时的文本一致（忽略 awareness 标签与空白展示差异）。
- 验证的持久化字段是 Shooting 编辑器展示的 `script_content`；未进入 Production 页面或执行任何 Production 版本命令。

当前 UI 不展示请求 payload、请求次数或内部 revision，因此不能在本阶段直接断言 `updateShooting` 请求次数或 `contentRevision` 的白盒状态。

## 6 Refresh

**通过。** A 刷新 Shooting 详情页，B 保持编辑页：

- A 恢复了全部已保存的测试标记。
- A 的恢复内容与 B 的实时内容一致。
- B 在 A 刷新期间保持可编辑；未观察到重新 seed 导致的重复内容。

## 7 Reconnect

**通过。** 对 A 使用受控离线模拟，离线期间 B 输入 `SHOOTING_RECONNECT_B`。

- A 离线时没有收到该标记。
- 网络恢复后 A 收到并合并该标记，B 的内容保持存在。
- 两端无应用控制台 error，未观察到重复内容或旧内容覆盖。
- 测试结束前已恢复网络状态。

## 8 Destroy

**部分通过，发现风险。** A 在输入 `SHOOTING_DESTROY_A` 后立即离开 Shooting 详情页；B 保持在编辑页。

- B 未在 500ms 内收到 `SHOOTING_DESTROY_A`。
- 之后重新载入 Shooting `34`，该标记也不存在，说明这个紧邻页面离开的未同步输入没有持久化。
- B 本身未受影响：继续输入 `SHOOTING_DESTROY_B_STAYS` 后能正常自动保存，并在重新载入后恢复。

该现象与 Runtime destroy 时清理 pending autosave 的设计边界相符，但对用户而言仍是“离开页面前最后一次输入可能丢失”的数据风险。按本阶段限制，未修改 Runtime 或 Adapter；应另开修复/决策任务，明确页面卸载时应 flush、cancel，还是交由 Yjs/provider 完成可靠交接。

## 9 Workflow/Publishing 影响

**未发现影响。**

- 测试期间 Shooting 保持原有计划态，未点击“开始制作”或完成操作。
- 在 Publishing 列表搜索 `C1 TEST`，未出现关联发布记录。
- 未执行 workflow、Publishing、Production、权限、API 或数据库写入逻辑以外的操作；仅有既有 `script_content` 自动保存。

## 10 是否建议进入Runtime清理评估

**不建议现在进入 Runtime 清理评估。**

Shooting 的进入、Yjs 双向同步、四类粘贴、`script_content` 自动保存、刷新恢复及断线恢复均通过；但 Destroy 场景揭示了页面立即离开时最后一个未同步输入会丢失的风险。

建议先单开一个严格受限的故障修复/行为决策任务，明确并验证卸载时的保存与协作交接语义。该建议不授权修改 Runtime、Adapter、Yjs、Socket.IO、workflow、Publishing 或其他业务代码。
