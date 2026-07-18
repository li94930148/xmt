# Phase C1.1 Production Collaboration Verification

## 1 测试环境

- 测试记录：Production ID `85`，关联测试选题 ID `111`。
- 预期协作 room：`production:85`。
- 浏览器 A：独立的应用内浏览器会话，账号 `yffa23`。
- 浏览器 B：独立的 Chrome 浏览器会话，账号 `1`。
- 两个会话分别完成登录，未共享 cookie、localStorage 或 session；本报告不记录密码。
- 测试期间只编辑 `[C1 TEST] Runtime Collaboration Production`，未操作业务记录、版本按钮、审核按钮或删除按钮。

## 2 双用户进入结果

**通过。** 两端均打开 `/production/85`，初始正文均为创建时的测试内容。两端分别建立了不同的 Socket 连接，并能收到对方的协作更新；这与同一 `production:85` 协作 room 的预期一致。

- A 看到了 B 的 awareness 标签：`1 · admin`。
- B 看到了 A 的 awareness 标签：`李庆 · admin`。
- 每端各有一个编辑区，未观察到重复初始化的正文、重复 awareness 用户或控制台应用错误。

当前 UI 未暴露 provider 实例计数，因此“provider 数量”为行为级验证：没有看到重复内容或重复 presence，不能作为内部实例计数的直接断言。

## 3 Yjs 同步结果

**通过。** A 写入 `USER_A_TEST` 后，B 收到更新；B 再写入 `USER_B_TEST` 后，A 收到更新。

直接读取 `contenteditable.innerText` 时，两端会因本地协作光标标签不同而出现文本差异。将 `.xmt-collaboration-cursor` 临时 awareness 节点剔除后，两端实际文档 HTML 一致，两个标记各仅出现一次。这是展示层 presence 节点，不是重复业务内容。

## 4 粘贴测试结果

**通过。** 在同一测试记录中依次执行：

- A 纯文本粘贴：`PLAIN_PASTE_C1`
- B HTML 富文本粘贴：`HTML_PASTE_C1`
- A 大段文本粘贴：`LARGE_PASTE_C1_` 加 4096 个字符
- A 粘贴 `CONCURRENT_PASTE_C1` 的同时，B 输入 `CONCURRENT_EDIT_B_C1`

去除 awareness 节点后，两端文档完全一致。每个粘贴/输入标记在 A、B 两端均为 **1 次**；未观察到重复段落、重复节点或控制台错误。协作光标标签随远端焦点显示，未出现光标跳转导致的内容重复。

## 5 Autosave 结果

**行为通过。** A 连续输入 `A`、`B`、`C`、`D` 后等待超过 Runtime 的 2.5 秒自动保存延迟，再通过页面重新载入验证持久化内容。

- 全部已有协作标记以及 `A`、`B`、`C`、`D` 都能从重新载入的 Production 中恢复。
- 重新载入后的持久化文本（去除 awareness 标签并归一化空白）与 B 的实时文本一致，未出现旧内容覆盖最新内容。
- 展开版本历史后仅显示 `v1.0 当前生效`，未出现 `v1.1`、`v2.0` 或其他新版本；本次没有触发小修保存或另开新版。观察结果符合 autosave 使用 `version_action: 'none'` 的预期。

当前页面没有暴露请求计数、`contentRevision` 或 HTTP payload；因此本阶段不能对“HTTP 请求绝对次数”或单个 revision 的内部状态做直接断言。上述结论是基于快速输入后的最终持久化内容及版本历史的黑盒验证。

## 6 Refresh 恢复结果

**通过。** A 编辑后的页面刷新，B 保持在原编辑页面。

- A 刷新后成功恢复全部测试标记。
- 恢复内容与未刷新的 B 的实时内容一致（忽略各自的 awareness 标签）。
- room 仍为同一 Production 测试文档，未观察到重新 seed 导致的内容重复。
- B 在 A 刷新期间保持可用。

## 7 Reconnect 结果

**通过。** 对 A 执行了受控离线模拟；离线期间 B 输入 `RECONNECT_B_C1`。

- A 离线时未收到该标记。
- 恢复网络后，A 收到并合并 `RECONNECT_B_C1`；B 端内容保持存在。
- A 的应用日志仅记录预期的 `Socket connect_error: xhr poll error`，无应用控制台 error。
- 未观察到重复内容或重复 presence。网络状态已在测试结束前恢复。

## 8 Destroy 结果

**行为通过。** A 在输入 `DESTROY_PENDING_A_C1` 后立即离开 Production 详情页；B 保持在编辑页。

- B 收到 A 离开前的协作更新。
- B 继续输入 `DESTROY_B_STAYS_C1` 并在等待自动保存窗口后保持正常。
- A 离开后 URL 为 Production 列表，B 未被断开或阻塞，控制台无新增应用错误。

`destroy()` 内部 pending 队列不是现有 UI 的可观测状态；在不增加埋点、不修改 Runtime 的限制下，无法直接断言其内存队列已清空。本项验证的是可观察行为：离开页面未对另一位用户或当前文档造成异常影响。

## 9 问题记录

未发现需要现场修复的 Production 协同、粘贴、持久化、刷新、重连或页面离开问题。

已记录的可观测性限制：

- 当前页面未展示 provider 数量、Autosave 请求次数、内部 revision 或请求 payload。
- 因此这些内部指标不能在“只测试、不修改代码”的本阶段做白盒断言；如后续需要严格计数，应单开可观测性测试任务，不能在 Runtime 中临时加入业务逻辑。

## 10 是否建议进入 Shooting 验证

**建议进入 Shooting 验证。** Production 的双用户核心行为已经通过黑盒验证：实时同步、四类粘贴、最新内容持久化、刷新恢复、断线合并、页面离开隔离，以及不新增版本均符合预期。

该建议不等同于 Runtime 清理批准；本阶段没有修改 Runtime、Adapter、ContentEditor、Editor、Yjs、Socket.IO、API、数据库、权限或版本逻辑。
