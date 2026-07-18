# Shooting Failure Test Infrastructure Design

## 1. 目标与边界

本设计只补齐 Shooting graceful-dispose 的浏览器验收能力，不改变业务保存、Runtime、LeaveGuard contract、数据库、权限、workflow、Yjs 或 Socket.IO。

当前缺口有两项：

1. 现有本地/CI failure-injection proxy 只允许匹配 `PUT /api/workflow/production/85`；它不能安全地注入 Shooting `script_content` 保存失败。
2. Shooting 34 没有关联 Production ID，因此“查看关联 Production”按钮 disabled，无法验证 guarded navigation。

以下设施均只服务于本地/CI 和可回滚测试 fixture，绝不作为产品运行时开关。

## 2. Shooting 专用 Failure Injection

### 2.1 精确匹配目标

Shooting 的既有保存调用为：

```text
PUT /api/workflow/shooting/<shootingFixtureId>
```

该请求由现有 Shooting adapter 调用 `updateShooting(shooting.id, { script_content })` 产生。故障代理只按 method 与精确 path 匹配；它不读取、缓存或输出正文，因此不会记录 `script_content`、Authorization、cookie 或账号信息。

### 2.2 独立 profile

新增 profile 命名空间，不改变或扩大现有 Production profile：

| Shooting profile | 第一次精确匹配请求 | 后续同类请求 | 是否转发第一次请求 |
| --- | --- | --- | --- |
| `shooting_reject_once` | 直接返回 HTTP 503 | 透明转发 | 否 |
| `shooting_timeout_once` | 延迟超过 LeaveGuard timeout 预算后返回 HTTP 504 | 透明转发 | 否 |
| `shooting_passthrough` | 透明转发 | 透明转发 | 是 |

Production 的 `reject_once`、`timeout_once`、`passthrough` 仍只作用于 Production 85；Shooting profile 不得复用 Production target，也不得让 Production profile 接受 Shooting path。

### 2.3 目标注册与 fail-closed 规则

后续实现应建立一个仅测试目录可读的 fixture manifest，例如：

```json
{
  "shootingGracefulDispose": {
    "shootingId": 0,
    "productionId": 0,
    "allowedPath": "/api/workflow/shooting/0"
  }
}
```

ID 在创建 fixture 后写入 manifest；实现不能接受任意 path 或任意 ID。代理启动要求同时满足：

1. `NODE_ENV !== 'production'`；
2. 只监听 `127.0.0.1`；
3. upstream 只能是显式本地 `http` origin；
4. profile 为三个 Shooting profile 之一；
5. fixture manifest 存在、ID 为正整数、target 与 manifest 完全一致；
6. target method 为 `PUT` 且 pathname 精确等于 manifest 的 Shooting path。

任一条件不满足即拒绝启动。非目标请求仍仅能透明转发到经验证的本地 upstream；代理不允许连接外部 upstream。每个一次性 profile 在内存中只消费一次，测试结束即关闭进程并删除临时 manifest。

### 2.4 自测范围

实现任务必须为代理本身新增以下测试：

1. `shooting_reject_once`：首次请求 503 且 upstream 收到 0 次；第二次透明转发；
2. `shooting_timeout_once`：首次请求延迟超过预算并返回 504，且 upstream 收到 0 次；第二次透明转发；
3. `shooting_passthrough`：目标请求透明转发；
4. Production profile 不能命中 Shooting target，Shooting profile 不能命中 Production 85 target；
5. 缺失 manifest、ID 不匹配、非本地 upstream 与 production 环境均 fail-closed；
6. 输出中不含请求正文、Authorization、cookie、账号或密码。

## 3. Shooting 关联 Production 测试 Fixture

### 3.1 Fixture 组成

不得修改已有 Shooting 34。应通过正常业务/API 创建独立、可删除的最小 fixture 链：

| 资源 | 建议名称 | 必要条件 |
| --- | --- | --- |
| 测试选题（如创建 Production 的正常流程要求） | `[D7 TEST] Shooting Graceful Dispose Topic` | 明确标记测试，仅关联该 fixture。|
| Production | `[D7 TEST] Shooting Graceful Dispose Production` | 可编辑、可被 Shooting 引用，记录生成的 ID。|
| Shooting | `[D7 TEST] Shooting Graceful Dispose Shooting` | 显式关联上述 Production ID，记录生成的 ID，`script_content` 初始化为唯一测试文本。|

创建必须使用项目已有的正常创建流程/API，不得直接编辑 SQLite。若 Shooting 创建要求 Production 已通过某个既有工作流状态，允许仅在**新建 fixture**上按正常流程达到该前置状态；不得修改任何现有业务记录或默认 workflow 规则。

建议初始 `script_content`：

```text
D7 Shooting Graceful Dispose Fixture Content
```

创建完成后必须记录：fixture 创建时间、topic/production/shooting ID、预期 room `shooting:<shootingId>`、关联 Production ID、创建操作者和删除负责人。测试账号应通过现有资源归属/角色规则能够编辑；不新增权限例外。

### 3.2 Fixture 验收前置检查

执行 D7-D2 扩展验收前，确认：

1. Shooting 页面顶部返回可用；
2. 侧栏“查看创作版本历史”未 disabled，且目标为 fixture Production ID；
3. 编辑器 room 为 `shooting:<shootingFixtureId>`；
4. `script_content` 初始值为 fixture 专用文本；
5. fixture 没有 Publishing 记录或非测试关联。

## 4. 回滚与清理方案

### 4.1 Proxy 清理

1. 结束浏览器测试前等待当前一次性 profile settle 或明确停止测试；
2. 关闭 failure-injection proxy 进程；
3. 删除本次临时 fixture manifest；
4. 验证本地监听端口已释放；
5. 不保留 profile、target 或凭据到环境文件、localStorage、日志或代码配置。

### 4.2 Fixture 删除

清理顺序必须反向处理依赖，且只删除带完整 `[D7 TEST]` 标记并与本轮 manifest ID 完全匹配的记录：

```text
Shooting fixture
  -> Production fixture
  -> Topic fixture（仅当本轮新建且无其他关联）
```

删除使用已有业务删除流程/API；每步先读取并核对 ID、名称和关联关系。若有未预期的 Publishing、history 或人工关联，停止删除并记录风险，不以直接数据库操作强行清理。

## 5. D7-D2 扩展验收矩阵

| 用例 | 前置 profile | 操作 | 通过标准 |
| --- | --- | --- | --- |
| 正常离开 | `shooting_passthrough` | 编辑后等待 autosave，点击返回列表 | `script_content` 重进可见；一次 navigation。|
| 快速离开 | `shooting_passthrough` | 输入唯一标记后立即返回 | 重进可见最新标记；不丢失最后输入。|
| 关联 Production | `shooting_passthrough` | 编辑后点击侧栏关联 Production | 保存完成后一次跳转到 fixture Production；不改变 Production 内容或版本。|
| reject failure | `shooting_reject_once` | 编辑后点击明确受控离开按钮 | URL 保持 Shooting；`not_durable` dialog；编辑器仍挂载；请求不转发。|
| timeout failure | `shooting_timeout_once` | 编辑后点击明确受控离开按钮 | URL 保持 Shooting；timeout dialog；请求不转发。|
| retry | reject/timeout 后切 `shooting_passthrough` | 点击重试保存 | `script_content` 保存；原 continuation 仅执行一次。|
| discard | failure dialog | 点击放弃离开 | 一次 navigation；不宣称失败内容已保存；destroy-before-continuation 由 contract 测试佐证。|
| retry/retry | failure dialog 后 passthrough | 快速双击 retry | first retry winner；一次保存/一次 navigation。|
| discard/retry | failure dialog 后 passthrough | 快速触发 discard 与 retry | first action winner；无重复保存、destroy 或 navigation。|

每个用例记录：URL、fixture ID、room、测试标记、可见 dialog 状态、页面 console error/warning、代理 profile 是否消费、最终 `script_content` 重进结果。不得记录密码、Authorization、cookie 或编辑正文。

## 6. 实施顺序

1. 新开测试基础设施实现任务：增加 Shooting profile 与严格 fixture-manifest 校验，并完成代理自测；不修改业务页面。
2. 新开 fixture 创建任务：仅用正常业务流程创建上述关联 fixture，并生成受控 manifest；不改 Shooting 34。
3. 新开 D7-D2 扩展浏览器验收任务：按本矩阵执行并生成报告。
4. 仅当矩阵全部通过后，才重新评估 D8；当前不进入 D8 或 Runtime 清理。

本阶段仅完成设计，未创建 proxy profile、fixture、manifest、测试数据或任何业务实现。
