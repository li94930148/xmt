# Controlled Failure Test Design

## 1. 当前验收缺口

Phase D7-C.1 与 D7-C.2 已在 Production 85 的真实浏览器页面确认正常保存、快速离开持久化、受控导航和重复点击的黑盒结果。以下情形仍没有页面级的可重复证据：

1. `persist()` 失败或超时后，`AggregateDisposeResult.outcome === 'not_durable'` 是否阻止 continuation；
2. Runtime 已被取消或销毁时，`outcome === 'interrupted'` 的页面行为；
3. `runtimeHandleRef.current === null` 时是否维持既有 `navigate()`；
4. 进入 `waiting_confirmation` 后，用户是否能选择 retry 或明确放弃离开。

当前 `useEditorLeaveGuard` 已定义上述通用语义：

- `durable` 执行 continuation；
- `not_durable` 与 `interrupted` 停留在 `waiting_confirmation`；
- `retry()` 重试原离开请求；
- `discardAndLeave()` 先执行立即 `destroy()`，再执行原 continuation；
- 无 handle 时直接执行 continuation。

ProductionDetail 当前只消费 `requestLeave()`，在 `waiting_confirmation` 时发送“留在当前页面并重试保存”的通知；它还没有渲染 retry/discard UI。因此不能把已有 hook 单测当成页面交互验收。

## 2. Failure Injection 方案

### 2.1 推荐：本地 E2E 反向代理故障注入器

使用独立的、仅供本地/CI 使用的 E2E 反向代理作为浏览器测试入口，而不是修改 Production 保存逻辑、Adapter 或 Runtime。

```text
浏览器（E2E 专用本地地址）
  -> Failure Injection Proxy
     -> Vite / 本地 API
        -> 现有 Production persist 链路
```

代理只在明确启用的 profile 下拦截以下精确请求：

```text
PUT /api/workflow/production/85
```

其余请求原样转发。测试 profile 必须是一次性且具名的：

| Profile | 行为 | 预期页面结果 | 数据库影响 |
| --- | --- | --- | --- |
| `reject_once` | 对下一次精确匹配的保存请求直接返回 503 | `not_durable`、不导航、进入失败确认 UI | 请求不转发，因此不写入 |
| `timeout_once` | 在 guard 的 timeout 预算外延迟响应，随后断开或返回 504 | `not_durable`（`timed_out`）、不导航、进入失败确认 UI | 请求在延迟期间不转发，因此不写入 |
| `passthrough` | 不拦截 | 用于 retry 后成功保存 | 正常既有保存 |

浏览器用例应先在 Production 85 输入唯一测试标记，再点击一个已接入 guard 的明确页面按钮。对 `reject_once` / `timeout_once` 的断言是：

1. URL 未改变，编辑器仍挂载；
2. 未产生页面 continuation；
3. 显示失败确认 UI；
4. 刷新或重新打开前，该测试标记不能被作为成功保存结果误认；
5. 将 profile 切换回 `passthrough` 后点击 retry，确认同一标记被保存且只发生一次导航。

### 2.2 `interrupted` 的专用场景

网络失败或超时产生的是 `not_durable`，不能冒充 `interrupted`。后者在当前 contract 中代表已经取消或销毁，例如 handle 已 `destroy()` / Runtime 已被标记为销毁。

推荐在**组件集成测试**而非真实业务页面上覆盖此路径：

1. 用真实 `EditorLeaveGuardController` 和一个可控 mock `ContentEditorRuntimeHandle` 发起 `requestLeave()`；
2. 让 mock `gracefulDispose()` 返回 `interrupted`，分别使用 `cancelled` 与 `already_disposed` durability status；
3. 断言 continuation 未执行，状态为 `waiting_confirmation`；
4. 断言已销毁 handle 时不展示不可执行的 retry，只允许留在页面或经二次确认后 discard。

若必须增加浏览器层覆盖，只能在一个隔离的 E2E fixture 中提供“销毁 pending runtime”的测试控制器；不得让真实 ProductionDetail、全局 `window` 或线上 bundle 暴露此控制器。该 fixture 验证 guard 和失败 UI 组合，不将取消行为植入 Production 工作流。

### 2.3 注入器安全约束

- 仅监听 `127.0.0.1` 的随机本地端口，upstream 只能是显式本地地址；拒绝非本地 upstream。
- 启动时必须验证 `NODE_ENV !== 'production'`，否则立即退出；不部署、不随产品启动。
- profile 必须由测试启动命令传入，默认 `passthrough`；不得从 URL、localStorage、用户输入或生产配置读取。
- 只允许测试记录白名单（当前为 Production 85）；请求 method、path、host 与 profile 不同时一律透传或直接拒绝启动。
- 每个失败 profile 只消费一次，并记录到测试进程内存；不记录账号、密码、Authorization 或编辑内容。
- 测试结束必须关闭代理；测试数据仍按既有 C1 删除/回滚方案清理，而非直接修改 SQLite。

## 3. No Handle 测试方案

### 3.1 分层验证

无 Runtime handle 不是权限或 workflow 状态；它是 `ContentEditor` 尚未挂载、已卸载或只读呈现时 handle bridge 传入 `null` 的页面兼容路径。应采用两层验证。

| 层级 | 方案 | 验证内容 |
| --- | --- | --- |
| 组件/页面集成测试 | 渲染 ProductionDetail，使用测试模块替身让 `ContentEditor` 只调用 `onRuntimeHandleChange(null)` | 点击返回、关联选题等明确导航时直接执行原 continuation；不调用 `gracefulDispose` |
| 浏览器 fixture | 仅在 E2E test build 使用模块别名，把 ContentEditor 替换为最小 bridge fixture；fixture 呈现同名受控导航并通知 `null` handle | 用户可见的路由行为仍为一次正常导航 |

此方案不修改真实用户权限、不改变 Production status、不修改 workflow，也不把 `null` handle 注入生产页面。

### 3.2 禁止的方案

- 不通过更改角色、资源归属或审批状态制造只读；
- 不通过 DevTools 改写 React ref、DOM 属性或全局变量伪造 handle；
- 不向 Production API 增加测试参数、字段或特殊权限；
- 不在 ProductionDetail 内保留长期运行时开关，例如 `?noRuntimeHandle=1`。

真实页面的无 handle 情况应继续由自然生命周期覆盖；确定性回归则由隔离的测试模块替身负责。

## 4. UI 验证方案

### 4.1 需要补齐的 Production 页面状态 UI

后续独立的页面 UX 实现任务应消费 `useEditorLeaveGuard` 已有的 `state`、`result`、`retry` 与 `discardAndLeave`，而不修改 Runtime contract。

| Guard 结果 | 页面行为 | 用户操作 |
| --- | --- | --- |
| `durable` | 立即继续原 navigation | 无需确认 |
| `durable + degraded` | 继续 navigation，并保留非阻塞协作交接提示 | 无需确认 |
| `not_durable` | 停留当前页面，显示“未能确认保存”确认面板 | 重试保存、留在此页、放弃并离开 |
| `interrupted` | 停留当前页面，显示“保存过程已中断，无法确认内容是否持久化”确认面板 | 留在此页；仅在 handle 仍可用且可重试时显示重试；放弃并离开 |

“放弃并离开”必须是第二次显式确认的破坏性动作。确认后才调用 `discardAndLeave()`；它会执行立即 `destroy()` 后再调用原 continuation。面板应在 `leaving` / `disposing` 时禁用重复按钮，避免第二个 leave 流程。

失败 UI 的最小可访问性要求：

- 使用语义 dialog，并把初始焦点移到说明或“重试保存”按钮；
- 明确说明“未确认保存”而不是声称内容已经丢失；
- 不展示原始网络错误、请求 header、账号或文档内容；
- 关闭/“留在此页”只关闭面板，不调用 `destroy()`；
- retry 成功后只执行最初保存的 navigation continuation 一次。

### 4.2 浏览器验收矩阵

在失败注入器与 UI 实现均完成后，使用 Production 85 执行：

| 用例 | 注入 profile | 关键断言 |
| --- | --- | --- |
| 保存被拒绝 | `reject_once` | URL 不变、`not_durable` UI、无导航、retry 成功后一次导航 |
| 保存超时 | `timeout_once` | URL 不变、超时文案、无需写库、切换 passthrough 后 retry 成功 |
| 显式放弃 | `reject_once` | 二次确认后 `destroy()` 再一次导航；不假称保存成功 |
| 被中断 | fixture 返回 `interrupted` | 不导航、正确 UI；根据可用性限制 retry |
| 无 handle | null-handle fixture | 直接一次 navigation；没有失败 UI 或 Runtime 调用 |

## 5. 安全边界

本设计不改变以下边界：

- `ContentEditorRuntime` 继续以 Autosave 为唯一 durability participant；
- `ContentEditorAdapter.persist()`、Production API payload、`version_action`、历史与审批规则不增加测试分支；
- 不修改 Yjs、Socket.IO、provider 或 collaboration protocol；
- 不增加数据库字段、迁移或直接数据库写入；
- 不测试或暴露真实账号密码，不使用非测试业务记录；
- 不接入 Shooting，且不将 Production 测试设施共享为业务行为。

## 6. 实施计划

1. 新开**测试基础设施任务**：实现只监听 localhost、白名单 fail-closed 的 E2E failure-injection proxy，并为 `reject_once` / `timeout_once` 编写自身测试。
2. 新开**Production 失败状态 UX 任务**：仅在 ProductionDetail 消费现有 `useEditorLeaveGuard` 返回值，增加确认面板与 retry/discard 操作；不修改 Runtime、Adapter 或 API。
3. 新开**测试工具任务**：增加 ProductionDetail 的 null-handle 组件测试，并建立 test-build-only ContentEditor 模块替身；不引入产品运行时 flag。
4. 在隔离本地环境执行浏览器矩阵；记录 URL、页面状态、保存结果、console 和代理计数，不记录敏感请求信息。
5. 只有 `not_durable`、`interrupted`、retry/discard 与无 handle 的证据齐全后，才重新评估 Shooting 页面接入。

本阶段仅完成设计，未创建测试工具、代理、fixture、页面 UI 或任何业务实现。
