# Phase D7-D2 Shooting Browser Verification

## 1. 测试环境

- 前端地址：`http://localhost:5174/shooting/34`
- 测试记录：Shooting ID `34`
- 预期协作房间：`shooting:34`
- 测试账号：既有管理员测试账号（未记录密码）
- 浏览器：Codex 内置浏览器，独立已登录会话
- 验收方式：真实页面编辑、受控页面导航、重新进入记录核对，以及 console 观察。

本阶段未修改代码、API、数据库、权限、workflow、Yjs、Socket.IO 或 Runtime。

## 2. 测试矩阵

| 用例 | 结果 | 证据与说明 |
| --- | --- | --- |
| 1. 正常离开 | 通过 | 编辑 `D7_SHOOTING_NORMAL_LEAVE`，等待自动保存后点击顶部返回。页面进入 `/shooting`；重新进入 `/shooting/34` 后标记仍存在。|
| 2. 快速离开 | 通过 | 输入 `D7_SHOOTING_FAST_LEAVE_TEST` 后立即点击顶部返回。页面进入 `/shooting`；重新进入 `/shooting/34` 后标记存在。|
| 3. 查看关联 Production | 未覆盖 | 当前 Shooting 34 的“查看创作版本历史”按钮为 disabled，页面显示关联 Production 版本为 `-`。改变关联数据会修改测试业务数据，超出本阶段“只测试、不改代码”的范围。|
| 4. 保存失败 / `not_durable` | 未覆盖 | 现有 failure-injection proxy 的固定安全白名单仅匹配 `PUT /api/workflow/production/85`，不能注入 Shooting 的 `script_content` 保存请求。未绕过该白名单，也未使用离线模拟替代。|
| 5. retry 恢复 | 未覆盖 | 依赖用例 4 进入 failure dialog；当前无法为 Shooting 安全触发该 dialog。|
| 6. discard | 未覆盖 | 依赖用例 4 进入 failure dialog；当前无法为 Shooting 安全触发该 dialog。|
| 7. 重复点击 / first action wins | 未覆盖 | 依赖用例 4 进入 failure dialog；当前无法为 Shooting 安全触发该 dialog。|

## 3. script_content 验证

Shooting 34 使用现有 Runtime autosave 与 Shooting adapter 保存链路。浏览器重进验证确认以下标记已存在于编辑器内容：

- `D7_SHOOTING_NORMAL_LEAVE`
- `D7_SHOOTING_FAST_LEAVE_TEST`

这证明正常离开与 debounce 窗口内的快速离开均未丢失最后输入。测试中未触发 Production 写入、版本创建、`version_action`、approval 或 Publishing。

## 4. Console 与 Network

- 已完成的 Shooting 正常与快速离开用例中，console error / warning 列表为空，未观察到 XMT 应用级异常。
- 正常保存以现有 `updateShooting(shooting.id, { script_content })` 链路完成；本阶段未变更 payload 或请求结构。
- 未启动针对 Shooting 的失败代理：这样避免把 Production 85 专用白名单扩大到其他请求，保持 D7-C.4 的安全边界。

## 5. 未覆盖原因与后续前置条件

1. **关联 Production 导航**：需要一个已关联 Production ID 的、可回滚 Shooting fixture。当前 Shooting 34 不具备该条件。
2. **失败、retry、discard 与动作竞态**：需要先另开测试基础设施任务，在不破坏 Production 85 白名单的情况下，为 `PUT` Shooting `script_content` 保存请求增加单独的本地/CI 白名单 profile，并完成代理自身测试。
3. 该基础设施任务完成后，应重新执行本 D2 的失败矩阵；不得以浏览器离线、直接 API 调用或数据库写入替代 failure-injection proxy。

## 6. 是否建议进入 D8

不建议进入 D8 或 Runtime 清理。

Shooting 的正常与快速离开闭环已有真实浏览器证据，但关联 Production 受控跳转及完整 failure-flow（`not_durable`、retry、discard、first action wins）尚未得到 Shooting 页面浏览器证据。应先补齐可回滚关联 fixture 与 Shooting 专用故障注入能力，再继续后续阶段。
