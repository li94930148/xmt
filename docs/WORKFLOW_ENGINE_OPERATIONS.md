# Workflow Engine 操作手册

本文说明当前仓库中 Workflow Engine 的实际运行方式、只读检查入口，以及如何安全评估 strict enforcement 的变更。它不授权生产配置变更、审批操作、数据库迁移或部署。

> **当前仓库模式：`v2_strict`。** 这是当前检出的代码状态，不等于已核验某个生产进程正在运行的版本。生产状态必须以已部署的精确提交、进程和静态资源为准；本文没有访问或验证生产环境。

## 1. 当前模式从哪里读取

当前唯一模式定义位于 `shared/workflow/policy.ts`：

```ts
export const WORKFLOW_ENGINE_MODE = 'v2_strict' as const;
```

这是编译期常量，不读取 `process.env`、`import.meta.env`、数据库配置或远程开关。仓库内也没有 `WORKFLOW_ENGINE_MODE` 环境变量覆盖实现；单独设置同名环境变量不会切换模式。该常量被共享策略、API runtime 和 WorkflowDesigner 引用，因此模式行为同时涉及服务端与前端代码。

要核实待发布代码的模式，应查看目标提交中的 `shared/workflow/policy.ts`，并检查服务端与前端构建产物来自同一目标提交。要核实生产当前状态，还必须另行核对线上精确 SHA、运行进程和实际提供的前端资源；仅查看本地源码或环境变量不足以证明生产状态。

## 2. 四层能力及其边界

### Shadow Logging：运行观测

审批请求通过前置身份、权限、选题和节点检查后，API 会把策略评估上下文写入 `workflow_shadow_logs`，包括状态转换、节点、操作者、模式、动作和原因。strict 阻断也会尝试记录原因；日志写入失败会被记录为服务端警告，但不把日志表变成业务主状态。

只读检查入口（需要登录及 `system:template` 权限）：

- `GET /api/workflow/shadow-logs`：最多返回最近 100 条；可用 `topic_id`、`user_id`、`node_id` 缩小范围。
- 审批结果和当前阶段仍应分别查看审批记录、选题与模板的真实业务状态。

`workflow_shadow_logs` 是观测和决策辅助数据，不是完整事件流，也不替代 `approval_records`。不得通过清理日志来“重置”流程或审批结果。

### Analytics：只读聚合

`GET /api/workflow/shadow-analytics`（同样需要 `system:template`）读取日志，聚合状态转换频次、节点活动、审批人分布、异常原因和风险计数。它用于发现样本与排查线索；统计数据依赖已记录的请求，不代表完整审批审计，也不自动更改流程。

### Decision：基于观测的风险提示与建议

`GET /api/workflow/shadow-decisions` 从最近最多 500 条日志计算 `allowed`、风险提示、建议转换、置信度和原因。当前实现是基于日志的规则计算，不是审批人身份来源、正式业务状态或人工审批结论。

需要特别注意：在当前 `v2_strict` 中，Decision 的 `allowed: false` 会进入审批 strict gate 并导致阻断。因此，虽然它来自观测数据并以建议/解释形式展示，不能把它描述成“只提示、不影响审批”。评估该信号时，应核对对应 shadow 样本及原因；不能仅凭汇总分数更改业务规则。

### Strict Control：当前强制执行

当前模式下：

- 审批 API 对状态转换策略、节点审批人策略或 Decision 判定不通过的请求返回 `400`，并尝试记录阻断原因。
- WorkflowDesigner 创建或更新模板前会检查节点；非法节点会在界面阻止保存并显示原因。
- 服务端模板创建和更新接口也独立验证节点是否属于允许的选题状态转换。

Strict gate 之外仍有独立检查，例如登录、权限、选题可访问范围、节点审批人、模板与节点匹配、当前阶段匹配及状态并发冲突。关闭或调整 strict policy 不代表这些检查消失，也不代表任何用户都可审批。

## 3. 常见检查路径

1. **先确认模式与代码版本。** 检查目标提交中的 `shared/workflow/policy.ts`；不要用环境变量推断模式。生产核验还需要精确 SHA 与进程/前端资源信息。
2. **确认业务对象。** 从选题详情确认当前状态、绑定模板和待处理节点；确认请求操作者是否满足现有权限与节点审批人规则。
3. **查看观测记录。** 用 `GET /api/workflow/shadow-logs?topic_id=<选题ID>` 限定单条选题；必要时再加 `node_id` 或 `user_id`。响应最多 100 条。
4. **查看聚合和建议。** 用 `GET /api/workflow/shadow-analytics` 检查是否存在重复异常模式；用 `GET /api/workflow/shadow-decisions` 查看相应节点的建议和原因。两者为只读接口，但可能返回多个业务对象的汇总，只供有权限的管理员诊断。
5. **把日志与业务记录交叉核对。** `approval_records`、选题当前状态和模板/节点配置才分别表达正式审批记录与业务状态。shadow log 可能包含被阻断尝试，不可把它等同于已完成审批。
6. **复现只使用隔离测试环境。** 不要为诊断在真实选题上尝试通过、驳回或状态推进；优先运行下方测试并使用隔离数据库/浏览器夹具。

仓库内可用的重点验证入口：

```sh
npm run test:workflow-template-create-idempotency
npm run test:integrity:workflow
npx tsx tests/topics/topic-state-machine.test.ts
npm run test:workflow-designer-language-browser
npm run check
npx tsc --noEmit
```

浏览器测试应在隔离夹具中运行；它不代替生产验收。涉及 API 阻断行为的变更，必须同时验证服务端和 WorkflowDesigner，不能只验证按钮状态或只跑共享策略单测。

## 4. 安全评估回到 non-strict

### 不是环境变量开关

当前没有可在运行中切换的 `WORKFLOW_ENGINE_MODE` 环境变量。仅修改服务器环境并重启不会改变此常量。要改变 strict enforcement，必须先设计并实施代码变更，再分别构建、测试和发布受影响的服务端与前端；需要按受控发布流程重启/更新对应应用，不是线上即时切换。

### 只改常量不足以形成完整回滚

在提出变更方案前，必须明确目标究竟是“只停止审批 strict 阻断”，还是还要放宽模板规则。当前实现至少有以下独立行为需要分别评估：

1. `shared/workflow/policy.ts` 的 `WorkflowEngineMode` 类型由当前常量推导为字面量 `v2_strict`，并非现成的 `shadow` / `v2_partial` 运行配置。
2. 审批路由只在 `WORKFLOW_ENGINE_MODE === 'v2_strict'` 时执行 policy/decision 阻断返回；如果代码改为非 strict，该 strict 阻断条件会停止生效，但身份、权限、审批人、模板匹配、阶段匹配和其他业务校验仍独立存在。**不能据此承诺所有审批请求仍会被阻断，也不能承诺所有请求都会成功。**
3. WorkflowDesigner 的保存前检查调用 `runTransitionCheck`，结果同时受 policy 与 Decision 影响；不能仅凭切换 policy 常量推断界面已进入纯提示模式。
4. 模板创建和更新 API 的 `workflowNodesHaveValidTransitions` 直接检查状态转换，不读取 mode。即使审批 strict gate 被关闭，这项模板输入校验当前仍会阻止非法状态转换。若计划放宽它，必须作为单独、明确评审的行为变更。
5. `/api/workflow/shadow-*` 观测接口及 `workflow_shadow_logs` 的读数可继续保留；不要删除日志来实现回滚。`approval_records` 和业务状态语义不应在模式回滚中顺带更改。

### 变更前的安全门槛

任何放宽 strict enforcement 的操作都必须先提交并评审独立方案，说明：目标模式及其精确定义、影响的审批状态/审批人判断/模板保存路径、Decision 是否继续参与 enforcement、保留哪些权限和业务校验、回滚点、验证矩阵及监测窗口。按 `docs/Codex开发规范.md`，修改 policy、Decision、审批 API 阻断条件或 WorkflowDesigner 保存行为必须先方案评审；不得以文档本身作为生产变更授权。

建议的隔离验证至少覆盖：

- policy 允许/拒绝的状态转换矩阵；
- 指定审批人、角色审批人、创建人及越权用户；
- Decision 正常与警告样本；
- WorkflowDesigner 新建和编辑模板；
- API 独立模板校验、审批结果、并发阶段变化和发布未完成场景；
- 观测日志在允许与阻断路径中的写入/失败处理；
- 服务端构建、前端构建、类型检查及回归测试。

若评审后仍计划生产变更，应由独立发布流程确认目标 SHA、备份/恢复路径、停机或重启安排、审批人及观察和停止条件；生产审批验收需单独授权。出现异常时恢复经过验证的上一版代码与前端资源，并只读核实业务状态；不删除 shadow logs，不盲目重放审批，也不把回滚视为数据库或历史审批记录的回滚。

## 5. 当前已知限制

- 本手册记录的是当前检出代码与仓库文档，不证明生产线上运行的提交或模式。
- `workflow_shadow_logs` 不是完整审批审计来源，Decision 结果不能替代业务复核。
- 模板节点校验、审批 policy gate、节点审批权限和业务状态检查是不同层次；任何模式变更必须逐层验证。
- `docs/系统架构.md` 中关于“将 `WORKFLOW_ENGINE_MODE` 切回非 strict”的段落是概括性说明；当前源码没有环境变量切换，而且模板 API 与 Designer 仍有独立校验。操作时应以本文列出的当前代码路径为准，不要按该段文字执行线上热切换。

## 6. 核对依据

- `shared/workflow/policy.ts`：模式常量、状态转换、节点审批人与配置策略。
- `shared/workflow/workflow_engine_facade.ts`、`shared/workflow/workflow_runtime.ts`、`shared/workflow/workflow_decision_core.ts`：策略、决策和 runtime 结果组合。
- `api/routes/workflow-templates.ts`：模板创建/更新校验、审批权限、strict gate、业务状态事务。
- `api/routes/workflow.ts`：Shadow Logs、Analytics、Decision 只读接口。
- `src/pages/WorkflowDesigner.tsx`：模板保存前检查与阻止行为。
- `shared/workflow/topic-state-machine.ts`：选题状态转换矩阵。
- `docs/数据库设计.md`：shadow log 与正式审批/业务状态的数据边界。
- `docs/Codex开发规范.md`、`docs/产品路线图.md`、`docs/重构规划.md`：当前规则治理与后续工作要求。
