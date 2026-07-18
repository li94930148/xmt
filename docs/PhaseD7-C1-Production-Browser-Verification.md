# Phase D7-C.1 Production Browser Verification

## 1. 测试环境

- 前端地址：`http://localhost:5174/production/85`
- 浏览器：Codex 内置浏览器，独立已登录会话
- 测试账号：既有测试账号（管理员角色；未记录密码）
- 测试 Production：ID `85`
- 协作房间：`production:85`
- 关联测试选题：ID `111`
- 验收方式：真实页面操作、页面控制台观察、浏览器网络请求观察，以及离开后重新打开记录验证。

本阶段未修改任何代码、接口、数据库或运行时实现。测试中仅通过正常编辑器保存链路向 C1 可回滚测试记录写入了测试标记。

## 2. 用例结果

| 用例 | 结果 | 证据与说明 |
| --- | --- | --- |
| 1. 正常编辑后返回创作管理 | 通过 | 编辑后等待自动保存，观察到 `PUT /api/workflow/production/85` 返回 HTTP 200；请求保持 `version_action: none`。点击“返回创作管理”后正常进入 `/production`；重新打开 Production 85 后，编辑标记仍存在。|
| 2. 快速输入后立即返回 | 通过 | 输入 `D7_FAST_LEAVE_TEST_CONFIRMED` 后立即点击返回，页面正常跳转；重新打开 Production 85 后标记存在，说明最后一次输入已由离开前持久化链路保存。该立即离开窗口未单独捕获到对应的 API 事件，但已通过重新打开页面确认持久化结果。|
| 3a. 顶部关联选题导航 | 通过 | 点击顶部关联选题后进入 `/topics/111`。|
| 3b. 侧栏关联选题导航 | 通过 | 点击侧栏关联选题后进入 `/topics/111`。|
| 4. 进入成片制作 | 未执行（受范围限制） | Production 85 当前状态为 `draft`，页面显示“提交审核”，未提供“成片制作”入口。改变状态将修改 workflow，超出本阶段禁止范围。|
| 5. 模拟保存失败后阻止离开 | 阻断 | 已在编辑器输入失败测试标记并切换离线模拟；后续点击返回前，被浏览器 URL 安全策略拒绝自动化操作。未重试或绕过该策略，因此无法证明“阻止跳转 / 显示未保存提示”。|
| 6. 连续点击返回 | 未执行 | 受上述浏览器策略阻断影响，未继续进行可能干扰未保存测试输入的导航操作。不能据此宣称单一 dispose / 单一 navigation 已完成真实浏览器验证。|
| 7. 无 Runtime handle 场景 | 未执行 | 当前测试记录以管理员可编辑状态加载 Runtime handle。构造只读或未挂载编辑器状态需要改变记录状态、权限或页面条件，超出本阶段范围。|

## 3. 保存与导航观察

### 正常保存

- 观察到 Production 85 的自动保存请求：`PUT /api/workflow/production/85`，HTTP 200。
- 请求继续使用既有 Production 保存语义：`version_action: none`。
- 观察到协作链路向 `production:85` 发出更新请求并成功返回；本阶段未改动 Yjs 或 Socket.IO。
- 正常返回与快速返回后的重新打开均保留对应测试文本。

### Graceful Dispose 可观测性

页面没有面向浏览器测试的公开 dispose 事件或状态展示，因此无法直接读取 `gracefulDispose()` 的内部返回值。上述“返回”用例通过已接入的受控页面导航路径执行；持久化结果和最终路由结果构成间接验收证据。

## 4. Console 与 Network 异常

- 已完成的正常保存、返回和关联选题导航用例中，未观察到 XMT 页面应用级 console error 或 warning。
- 浏览器运行环境出现过一次外部 Statsig 网络超时提示；它不属于 XMT 前端、Production API、Yjs 或 Socket.IO 错误，未作为应用异常计入。
- 保存失败用例因浏览器自动化安全策略在点击动作前被阻断；这不是 XMT 运行时返回的保存失败结果。

## 5. 风险与未完成验收

1. 失败保存后的留页提示、重试或放弃离开尚未完成真实浏览器验证。
2. 连续点击返回的 in-flight dispose 复用尚未完成真实浏览器验证。
3. 无 handle 时维持原导航的页面级兼容性尚未完成真实浏览器验证。
4. Production 85 为 `draft`，因此本轮无法在不改变 workflow 的前提下验证 Production 到 Shooting 的入口是否经过 guard。
5. 本轮快速离开验证使用的最终持久化标记为 `D7_FAST_LEAVE_TEST_CONFIRMED`。最初计划的 `D7_FAST_LEAVE_TEST` 输入因页面自动化节点在前次导航后失效而未实际写入，不将其作为验收证据。

## 6. 是否建议进入 Shooting 接入

不建议目前据此进入 Shooting 页面 graceful-dispose 接入。

Production 的正常保存、快速离开和两个关联选题导航已取得积极结果，但失败阻止、重复导航、无 handle，以及 Production 到 Shooting 入口均未完成真实浏览器验收。应在可执行受控失败模拟、且具备不改变业务 workflow 的测试入口后，补齐这些用例，再评估 Shooting 接入。
