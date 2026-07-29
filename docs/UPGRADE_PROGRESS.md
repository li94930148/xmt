# XMT 升级阶段记录

## Phase 1：当前架构审计与长期升级规划

### 当前版本

`v2.10.2-storage`（仓库现有版本；该后缀格式不符合新版本规范，待首次有效代码升级时统一基线）

### 完成内容

1. 审计 Web 前端、Express API、共享代码、数据库、权限、实时协作和 Creator Agent。
2. 形成当前架构事实文档与分级问题列表。
3. 形成面向 Web、Android、iOS 的五阶段升级路线。
4. 明确 API v1、Zod/OpenAPI、Refresh Token、Repository、设计系统、Socket 拆分、测试、CI/CD 和监控方案。

### 修改文件

- `docs/ARCHITECTURE_CURRENT.md`
- `docs/ARCHITECTURE_UPGRADE_PLAN.md`
- `docs/UPGRADE_PROGRESS.md`
- `docs/文档索引.md`

### 数据库变化

无。本阶段只读分析，未创建 `refresh_tokens`，未修改表、字段、索引、数据或迁移脚本。

### 测试结果

- 未运行应用测试或构建：本阶段未修改业务代码、运行配置或依赖。
- 已执行 Markdown 差异与空白格式检查。

### 风险说明

1. 当前版本号带 `-storage` 后缀，后续代码升级前需确定纯 `X.Y.Z` 基线并同步根项目与 Agent。
2. 升级方案是目标设计，不代表对应能力已实现。
3. Phase 2 涉及 API 和后端边界，必须按单一垂直切片实施并保持旧接口兼容。

### 下一阶段计划

等待确认后进入 Phase 2 详细设计。建议以认证或选题模块为首个垂直切片，先明确文件级方案、兼容策略、测试、版本升级和回滚方式，不立即大规模移动目录。

## Phase 2：Topic 垂直切片设计

### 当前版本

`v2.10.2-storage`（本阶段仅设计，未触发产品版本升级）

### 完成内容

1. 核验 Topic 的七个现有接口、数据库关系、权限与数据范围。
2. 梳理 Topics、AddTopic、TopicDetail、Kanban 到 API、消息和 Socket 的调用链。
3. 设计 `api/modules/topics`、Repository、Service、Policy 与 Mapper 边界。
4. 设计共享 Zod Schema、`/api/v1/topics` 并行兼容方案。
5. 制定行为冻结、Repository、Service、API、前端和 E2E 测试方案。
6. 明确迁移风险、实施门禁和无数据库变更的回滚方案。

### 修改文件

- `docs/PHASE2_TOPIC_DESIGN.md`
- `docs/UPGRADE_PROGRESS.md`
- `docs/文档索引.md`

### 数据库变化

无。未修改表、字段、索引、数据或迁移脚本。

### 测试结果

- 未运行应用测试或构建：本阶段只新增和更新设计文档。
- 已执行 Markdown 差异与空白格式检查。

### 风险说明

1. 当前 Topic 权限和数据范围的真实代码与部分既有文档口径存在偏差；实施切片时必须先保持当前行为，权限调整另立任务。
2. 当前前端创建响应类型与后端真实 envelope 不一致，暂未修改。
3. Topic 删除存在非事务式兼容清理；本设计不扩大为数据库完整性治理。

### 下一阶段计划

等待实施指令。进入编码前先确认实施接口范围、v1 开关、测试数据库、依赖与版本基线；不得直接大规模移动目录。

## Phase 2-A：Topic 模块化基础落地

### 当前版本

`v2.11.0`。实施开始时根项目实际版本已是标准版本 `v2.10.3`，因此本次从该有效基线升级；早期文档中的 `v2.10.2-storage` 仅为设计阶段记录，未用于回退版本。

### 新增文件

- `api/modules/topics/index.ts`
- `api/modules/topics/topics.routes.ts`
- `api/modules/topics/topics.controller.ts`
- `api/modules/topics/topics.service.ts`
- `api/modules/topics/topics.repository.ts`
- `api/modules/topics/topics.sqlite-repository.ts`
- `api/modules/topics/topics.policy.ts`
- `api/modules/topics/topics.mapper.ts`
- `api/modules/topics/topics.types.ts`
- `shared/schema/topics.schema.ts`
- `tests/topics/topics.test.ts`
- `docs/releases/v2.11.0.md`

### 代码变化

1. Topic SQL 抽入 SQLite Repository，Service 不再直接依赖数据库工具。
2. 当前 `canViewTopic`、`canEditTopic` 与全量查看判断通过 Policy 复用，未改变角色或归属结果。
3. Service 统一编排创建、更新、删除、审核和状态流转，继续复用现有状态机、通知和 Socket 工具。
4. Controller 分离 legacy 与 v1 HTTP 适配；legacy 响应保持原 envelope。
5. `/api/topics` 继续可用；`/api/v1/topics` 由 `XMT_TOPICS_V1_ENABLED=true` 开启，默认关闭。
6. v1 使用严格 Zod Schema，legacy 继续宽松兼容。

### 数据库变化

无。未修改数据库结构、表、字段、索引、初始化逻辑或迁移脚本；测试只使用并清理系统临时目录中的 SQLite 数据库。

### 测试结果

- `npm run test:topics`：通过。
- `npm run check`：通过。
- `npx eslint api/modules/topics shared/schema/topics.schema.ts`：通过。
- `npm run build`：通过。
- `npm run lint`：未通过；全仓现有 259 个错误、38 个警告，Topic 新增文件中的问题已修复，未在本阶段扩大处理历史 lint 债务。

### 风险

1. legacy 行为虽然已由专项测试覆盖核心契约，后续仍需扩展七接口的完整角色与副作用矩阵。
2. v1 默认关闭；启用写接口前应增加更完整的集成观察与回滚验证。
3. 旧删除流程仍是逐项 best-effort 清理，本阶段按要求保持，不做事务化修复。
4. Repository 仍依赖 SQLite 语义，PostgreSQL 实现不在本阶段范围。

### 下一步计划

1. 扩充 Topic 行为冻结测试，覆盖审核、状态流转、通知和 Socket payload。
2. 在非生产环境只读启用 v1，观测分页、403 和错误 envelope。
3. 完成观察后再规划 Web 的单点 base path 切换；legacy 在观察窗口结束前不删除。
4. 权限模型、状态机和删除完整性如需调整，分别立项，不与模块迁移混合。

## Phase 2-B：API Contract 标准化建设

### 当前版本

`v2.12.0`

### 新增文件

- `docs/API_CONTRACT.md`
- `shared/schema/common.schema.ts`
- `shared/schema/error.schema.ts`
- `shared/schema/pagination.schema.ts`
- `api/middleware/request-id.ts`
- `api/openapi.ts`
- `packages/api-client/client.ts`
- `packages/api-client/error.ts`
- `packages/api-client/auth.ts`
- `packages/api-client/types.ts`
- `tests/api-contract/api-contract.test.ts`
- `docs/releases/v2.12.0.md`

### API 规范变化

1. 明确新接口使用 `/api/v1/*`，legacy `/api/*` 保持当前契约和业务行为。
2. v1 成功响应统一为 `{ success: true, data, meta }`，分页使用 `meta.page/limit/total`。
3. v1 错误响应统一为 `{ success: false, error: { code, message, requestId, details? } }`。
4. 增加公共错误码与 HTTP 状态映射；Topic 领域错误只在 HTTP 层映射，不改变 Service。
5. 全局生成或透传 `X-Request-ID`，v1 envelope 同时返回 requestId。
6. `/api/docs` 提供 Swagger UI，`/api/docs/openapi.json` 提供 OpenAPI 3.0.3 文档。

### Schema 变化

1. 新增 id、日期、requestId、分页和 meta 公共 Schema。
2. 新增公共成功/错误 Schema 与错误码 Schema。
3. Topic v1 与 OpenAPI 继续复用 `shared/schema/topics.schema.ts`，未为文档重复声明请求类型。
4. `packages/api-client` 直接复用共享 API 类型，本阶段未迁移 Web。

### 数据库变化

无。未修改数据库结构、表、字段、索引、数据、初始化代码或迁移脚本；所有 API Contract 集成测试使用系统临时目录中的 SQLite 数据库并在结束后清理。

### 测试结果

- `npm run test:topics`：通过。
- `npm run test:api-contract`：通过。
- `npm run check`：通过。
- API Contract 相关文件定向 lint：通过。
- `npm run build`：通过。
- `npm run lint`：未通过；全仓仍有既有 250 个错误、38 个警告，本阶段新增和修改的 Contract 文件已通过定向 lint。

### 风险

1. v1 Topic 仍由环境开关控制，默认关闭；OpenAPI 描述的是准备好的契约，不代表 Web 已切换。
2. legacy 认证和权限响应继续保持旧格式；只有 `/api/v1/*` 分支使用公共错误 envelope。
3. OpenAPI 首批只覆盖 Topic 列表、详情、创建和更新，其他模块不能被误认为已标准化。
4. api-client 目前是基础骨架，刷新 token 只有接口和并发互斥预留，尚未接入认证服务。

### 下一阶段计划

1. 按单模块垂直切片扩展 Auth 或 Production v1 Schema 与 OpenAPI，不批量迁移 legacy。
2. 为 OpenAPI 增加 CI 快照和破坏性差异检查。
3. 在非生产环境启用 Topic v1 观察后，再让 Web API 层通过单点配置试用 api-client。
4. requestId 后续接入结构化日志和错误监控，形成端到端查询链路。
