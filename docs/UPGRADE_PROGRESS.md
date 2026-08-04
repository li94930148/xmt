# XMT 升级阶段记录

## v2.15.1 日报填写与归档交互优化（2026-08-04）

- 我的日报固定当天填写，移除日期选择和保存草稿按钮，改为直接提交。
- 修复已提交日报本人无法输入的问题，允许本人修改后再次提交。
- 月报、年报并入我的日报，通过记录类型切换。
- 总结归档新增日报、月报、年报筛选及成员、日期/年份筛选。

### 验证结果

- `npm run version:check`、`npm run check`、`npm run build` 通过。
- 日报相关文件定向 lint 通过；全量 lint 的既有问题未纳入本次修改。

## Phase 2-C3-8-C3.11：Gray Browser Observability Fixture

- 当前版本：v2.15.1

### 完成内容

1. 新增灰度浏览器观测夹具，关联 requestId、loginAttemptId、响应类别、适配器模式、Runtime 快照与路由路径。
2. 登录请求携带安全 requestId，v1 响应适配器兼容标准 API Contract 的 `meta.requestId`。
3. 新增浏览器夹具显式观测开关；默认生产页面不记录前端认证 trace。
4. 实现停止规则：HTTP 登录成功但未进入 `/` 时立即结束，不继续 Refresh、Socket、Yjs 或 Version Sync。

### 数据库变化

无。

### 测试结果

- `test:auth-browser`、`test:auth-login-navigation`、`test:auth-gray-browser-observer`、`test:browser-auth-recovery`、`test:auth`、`test:login-gateway`、类型检查、构建与版本一致性检查通过。

### 风险与下一阶段

1. 该夹具只在 Playwright 显式启用时采集安全字段，不记录 token、cookie、密码或 Session secret。
2. 未开启生产灰度、未创建账号、未修改 Auth 配置、数据库、Socket 或 Yjs。
3. 下一阶段 C3.12 可在审批后使用固定测试账号执行真实灰度；若停止规则触发，立即回滚并以观测结果定位。

## v2.15.0 日报系统轻量化重构（2026-08-04）

- 日报系统重构为我的日报、团队日报、总结归档三个入口。
- 移除统计、趋势、排名、自动分析、风险等级、关键数据和日历展示。
- 新增月报、年报结构化表单；管理员可查看全部日报/月报/年报，成员可查看团队公开日报。
- 保留既有日报、日报条目、月报、年报和审计数据，新增迁移 `007_daily_lightweight_refactor`。

### 验证结果

- `npm run version:check`、`npm run check`、`npm run build` 通过。
- 日报保存、提交、修改、团队查看、管理员归档和权限隔离完成回归验证。

## v2.14.7 日报工作台 V2 发布（2026-08-04）

- 已将日报工作台 V2 的迁移、API、页面路由、Tiptap 编辑器、模板权限和 30 秒自动保存发布到生产。
- 生产数据库已执行 `006_daily_workspace_v2`，保留既有日报提交、审核和审计链路。
- 生产验证：`npm run check`、`npm run build`、数据库迁移、API 健康检查通过。

## v2.14.5 日报工作台 V2（2026-08-03）

- 已完成日报工作台数据迁移、统计/总结 API、自动保存、路由和基础页面接入。
- 保留 `daily_reports`、`daily_report_items`、`daily_report_templates`、`daily_report_audit_logs` 及既有提交审核链路。

## Phase 2-C3-8-C3.5：Browser Auth Full Regression

- 当前版本：v2.14.4

### 完成内容

1. Auth 浏览器测试移除系统 Chrome 回退，强制使用项目 Playwright Chromium。
2. 浏览器回归覆盖 legacy / v1 Web、Refresh Cookie、页面恢复、Socket、Yjs 与版本同步链路。

### 数据库变化

无。

### 测试结果

- `test:auth-browser`、`test:browser-auth-recovery`、`test:auth-socket-yjs-e2e`、`test:auth`、`test:login-gateway`、`test:auth-rollout`、类型检查、构建和版本一致性检查均通过。

### 风险与下一阶段

1. 本阶段不启用生产灰度、不连接生产环境。
2. Chromium 回归已通过；重新申请 C3.3 前仍需新建审批记录、确认运行态与 readiness，不自动开启生产灰度。

## Phase 2-C3-8-C3.4：Web Login Gateway v1 Response Adapter

- 当前版本：v2.14.3

### 完成内容

1. 新增 Web 登录响应适配层，兼容 legacy `{ user, token }` 与 v1 Web API Contract envelope。
2. v1 Access Token 进入 Auth Runtime 与内存登录态，不写入 localStorage 或 sessionStorage；Refresh 继续依赖 HttpOnly Cookie 与 CSRF。
3. legacy 登录、JWT payload、7 天有效期、存储和错误行为保持不变。

### 数据库变化

无。

### 测试结果

- 版本一致性、登录响应适配器、legacy Auth、Login Gateway、Rollout、Web Runtime、Cookie/CSRF、Session、API Contract、Socket Bridge、Socket Coordinator、Yjs Recovery、类型检查和构建通过。
- `test:auth-browser` 因本机 Playwright 缺少匹配 Chromium 并在系统 Chrome 启动时收到 `SIGABRT` 未通过；未更改测试绕过该问题。

### 风险与下一阶段

1. 本阶段未开启生产灰度，未修改 Auth、Socket 或 Yjs 服务端契约。
2. 重新申请 C3.3 前，必须在部署后完成 legacy / allowlist 模拟浏览器回归、运行态一致性与审批检查。

## Phase 2-C3-8-C3.1：灰度配置来源统一与运行态门禁校验

- 当前版本：v2.14.2

### 完成内容

1. 新增 Auth 运行态配置快照，Login Gateway、Auth v1 Web、Socket Bridge 和管理诊断统一读取同一解析结果。
2. 新增仅本机访问的运行态诊断端点；灰度 readiness 通过实际 API 进程状态校验门禁和 allowlist 测试账号。
3. 明确 `.env` 仅为部署输入，变更后必须经 PM2 受控重启加载。

### 数据库变化

无。

### 测试结果

- 新增运行态配置回归测试；完整 Auth、Socket、Yjs、类型检查与构建将在提交前执行。

### 风险与下一阶段

1. 本阶段未开启生产灰度、未创建测试账号且未修改 allowlist。
2. 下一次 C3 必须先验证 PM2 配置更新流程能让运行态端点、预检与 readiness 三者一致，再申请新的观察窗口。

## Phase 2-C3-8-C2.5 灰度准备完善

- 当前版本：v2.14.1
- 完成内容：只读 readiness 检查、浏览器夹具、观察模板、准入清单与回滚准备。
- 数据库变化：无。

## Phase 2-C3-8-C 版本同步与大版本切换锁定

- 当前版本：v2.14.0
- 完成内容：大版本替代事件、旧版本只读锁定、版本历史状态标签与后端写入保护。
- 数据库变化：production_history 增加 version_state、superseded_by_version、superseded_at。
- 测试结果：版本同步事件契约、类型检查、构建通过。
- 风险说明：协作房间按 Production ID 复用，后端版本校验是写入最终防线。

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

## Phase 2-C1：Auth 模块化与 Refresh Token 基础设计

### 当前版本

`v2.12.0`。本阶段只有认证审计与设计文档，没有产品代码变化，因此不升级版本。

### 新增文档

- `docs/AUTH_CURRENT.md`
- `docs/PHASE2_AUTH_DESIGN.md`

### 文档变化

1. 完整审计 legacy `POST /api/auth/login`、7 天 JWT、用户状态回查、双轨角色/权限、前端 token 与记住密码存储、退出和 Socket 握手行为。
2. 明确当前没有 refresh token、设备会话、token 轮换、服务端撤销和长连接实时失效能力。
3. 设计 `api/modules/auth` 的 Route、Controller、Service、Repository、Policy、Token Service 与 Session Service 职责边界。
4. 设计 access/refresh token 模型、refresh hash 存储、轮换链、重放检测、并发刷新和会话撤销流程。
5. 设计 `/api/v1/auth/login|refresh|logout|logout-all|sessions` 的统一 envelope、错误码和 Web/Mobile 交付差异。
6. 设计 Web HttpOnly cookie、Expo SecureStore、统一 api-client，以及 access token 更新后的 Socket 重连、房间恢复和 Yjs 同步方案。
7. 制定 C2 至 C8 的兼容迁移、风险、回滚、实施门禁、测试和可观测性计划。
8. 同步 `docs/文档索引.md` 的认证文档入口与阅读路径。

### 代码变化

无。未创建 `api/modules/auth`，未修改后端、前端、Socket、权限、JWT 或 API 行为。

### 数据库变化

无。未创建 `refresh_tokens` 表，未修改表、字段、索引、数据、初始化逻辑或迁移脚本。设计中的字段和索引均为待评审规划。

### 验证结果

- 已按要求核对架构、升级计划、API Contract、升级进度和文档索引。
- 已审计后端 auth/users/middleware/utils/services、前端 Login/API/store、Socket 和 collaboration 认证链路。
- 已执行文档链接、Markdown 格式、差异范围和版本/代码未变检查。
- 未运行应用测试、类型检查、lint 或构建：本阶段明确只改文档，不改变可执行代码。

### 风险

1. 当前“记住密码”回退会把密码密文和解密密钥同时保存在 localStorage，不能抵御 XSS 或本地存储读取；本阶段只记录，不顺手修改。
2. 当前 7 天 Bearer JWT 不可主动撤销，退出和改密后仍可用到过期；已连接 Socket 也不会因账号或会话变化立即断开。
3. 候选 `refresh_tokens` 字段尚未明确稳定的 `session_id/family_id`；直接实施会妨碍完整轮换链和设备会话语义。
4. Web cookie 方案取决于正式域名、HTTPS、反向代理、CORS 与 CSRF 决策；Mobile refresh token 交付通道也尚需单独评审。
5. Socket 换 token 必须通过重新握手并恢复协作房间；未完成 Yjs 丢包/重复更新验证前不能缩短现有 JWT。

### 下一阶段建议

进入 Phase 2-C2：先建立 Auth Module 边界和 legacy 行为冻结测试，让旧 `/api/auth/*` 兼容委托新 Service；仍不创建 refresh token 表、不缩短 7 天 JWT、不切换前端。数据库会话模型、v1 暗启和 Web/Mobile 接入应分别作为后续可回滚阶段实施。

## Phase 2-C2：Auth Module 边界落地

### 当前版本

`v2.13.2`。任务说明基线为 `v2.12.0`，但实施时仓库已有 `v2.13.1` 有效版本，因此按真实基线升级 PATCH，未执行版本倒退。

### 新增目录与文件

- `api/modules/auth/index.ts`
- `api/modules/auth/auth.routes.ts`
- `api/modules/auth/auth.controller.ts`
- `api/modules/auth/auth.service.ts`
- `api/modules/auth/auth.repository.ts`
- `api/modules/auth/auth.sqlite-repository.ts`
- `api/modules/auth/auth.mapper.ts`
- `api/modules/auth/auth.types.ts`
- `api/modules/auth/auth.schema.ts`
- `api/modules/auth/token.service.ts`
- `api/modules/auth/password.service.ts`
- `tests/auth/auth.test.ts`
- `docs/releases/v2.13.2.md`

### 代码变化

1. legacy 登录的用户查询和登录日志写入迁入 SQLite Repository，Service 不直接依赖数据库工具。
2. Auth Service 编排参数存在性、用户存在、enabled、密码验证、JWT 签发和登录日志，内部不使用 Express 或 SQL。
3. Controller 只完成 legacy HTTP 输入输出和现有状态码/消息映射。
4. bcrypt compare 抽入 Password Service，算法和调用顺序保持不变。
5. 原 `signToken`/`verifyToken` 实现迁入 Token Service；`api/utils/jwt.ts` 保留兼容导出，因此 middleware 和 Socket 调用路径不变。
6. `api/routes/auth.ts` 保留，`POST /api/auth/login` 通过 module router 委托 Auth Controller；logout、me、change-password 保持原实现。
7. 新增 `npm run test:auth`，使用临时 SQLite 冻结 legacy 行为。

### 数据库变化

无。未创建 `refresh_tokens`，未修改 users 或其他表、字段、索引、初始化逻辑、数据和迁移脚本。

### 测试结果

- `npm run test:auth`：通过，覆盖登录成功、密码错误、用户不存在、禁用用户、JWT 验证、角色回查和 logout 不撤销 JWT。
- `npm run version:check`：通过，版本统一为 `v2.13.2`。
- `npm run check`：通过。
- `npm run build`：通过。
- Auth 新增/兼容文件及测试定向 lint：通过。
- `npm run test:topics`、`npm run test:api-contract`：通过，JWT 兼容导出未破坏既有模块测试。

### 风险

1. 当前只迁移 login；me、change-password 和 logout 仍在 legacy route，不能误认为 Auth 全量模块化完成。
2. logout 不撤销 JWT、7 天有效期和 Socket 仅握手认证等历史风险按要求保留。
3. legacy 输入没有切换严格 Zod 校验，`auth.schema.ts` 只记录当前宽松形状，避免改变错误行为。
4. Repository 继续绑定当前 SQLite SQL 语义；本阶段不提供其他数据库实现。
5. 工作区存在匿名反馈相关的并行未提交修改，本次提交必须排除这些文件。

### 下一阶段计划

先评审是否进入 Phase 2-C3。建议把 refresh/session 数据模型、数据库迁移和 v1 refresh 接口拆成独立可回滚任务；在此之前补充 Auth Service 单元测试和 me/change-password 的行为冻结矩阵，不缩短 JWT、不切换 Web 或 Socket。

## Phase 2-C2.5：Auth 完整收口

### 当前版本

`v2.13.3`。本阶段属于无数据库变化、无新 API 能力的模块收口，因此从 `v2.13.2` 升级 PATCH。

### 新增能力

1. Auth Controller 增加 `getMe`、`changePassword`、`logout` HTTP 适配。
2. Auth Service 增加 `getCurrentUser`、`changePassword`、`logout` 流程编排。
3. Auth Repository 增加按 ID 查询用户、更新密码、清除强制改密标记和写活动日志接口。
4. Password Service 增加 bcrypt hash，成本参数继续为 10。
5. Auth 行为冻结测试覆盖 current user、改密、退出和完整认证链路。

### 迁移接口

- `GET /api/auth/me`
- `POST /api/auth/change-password`
- `POST /api/auth/logout`

三个接口继续使用原路径、authenticate/password limiter 顺序、legacy 响应和中文错误消息，不新增 `/api/v1/auth/*`。

### 修改文件

- `api/modules/auth/auth.controller.ts`
- `api/modules/auth/auth.mapper.ts`
- `api/modules/auth/auth.repository.ts`
- `api/modules/auth/auth.routes.ts`
- `api/modules/auth/auth.service.ts`
- `api/modules/auth/auth.sqlite-repository.ts`
- `api/modules/auth/auth.types.ts`
- `api/modules/auth/password.service.ts`
- `api/routes/auth.ts`
- `tests/auth/auth.test.ts`
- `package.json`
- `package-lock.json`
- `CHANGELOG.md`
- `docs/CHANGELOG.md`
- `docs/SYSTEM_UPDATE.md`
- `docs/releases/v2.13.3.md`
- `docs/UPGRADE_PROGRESS.md`
- `docs/文档索引.md`

### 数据库变化

无。未创建 `refresh_tokens`、session 或其他表，未修改 `users` 表、字段、索引、初始化逻辑、迁移脚本和业务数据。

### 测试结果

- `npm run version:check`：通过，版本一致为 `v2.13.3`。
- `npm run test:auth`：通过。
- `npm run test:topics`：通过。
- `npm run test:api-contract`：通过。
- `npm run check`：通过。
- Auth 范围 lint：通过。
- `npm run build`：通过。

### 风险

1. logout 仍不撤销 JWT，修改密码后既有 JWT 仍有效；这是明确冻结的 legacy 行为。
2. JWT payload、7 天有效期、前端 token 存储和 Socket 握手认证均未升级。
3. 本阶段未增加密码复杂度、历史密码、强制退出或设备会话能力。
4. 工作区另有匿名反馈相关未提交改动，本阶段提交必须继续排除。

### 下一阶段计划

等待 Phase 2-C3 指令。不得在本阶段继续创建 Refresh Token、session、数据库迁移或修改前端/Socket 认证。

## Phase 2-C3-1：Auth Session / Refresh Token 架构设计

### 当前版本

`v2.13.3`。本阶段只完成架构设计，不修改代码和生产行为，因此版本号保持不变。

### 完成内容

1. 新增 `docs/PHASE2_AUTH_SESSION_DESIGN.md`，完成当前认证模型、目标架构、会话与 Refresh Token 生命周期设计。
2. 对比 `refresh_tokens`、`auth_sessions`、`device_sessions` 三种模型，选择 `auth_sessions` 作为稳定会话主模型，并使用 `auth_refresh_tokens` 保存单次轮换凭据。
3. 设计 token 单次轮换、SQLite 原子并发控制、Refresh Token 重放检测、泄露防护和会话撤销策略。
4. 设计多设备登录、当前会话退出、全部退出，以及用户改密、管理员重置和账号禁用后的会话策略。
5. 设计 Web HttpOnly Cookie、Mobile SecureStore、Socket 重新认证和 Yjs 重连恢复边界。
6. 规划 `/api/v1/auth/login|refresh|logout|logout-all|sessions`，遵守 v1 envelope、稳定错误码、requestId 和 Zod/OpenAPI 单一来源要求。
7. 定义分阶段迁移、用户灰度、观测指标、放量门禁、回滚和完整测试矩阵。

### 修改文件

- `docs/PHASE2_AUTH_SESSION_DESIGN.md`
- `docs/UPGRADE_PROGRESS.md`
- `docs/文档索引.md`

### 数据库变化

无。本阶段未创建 `auth_sessions`、`auth_refresh_tokens`、`refresh_tokens`、`device_sessions` 或其他表，未修改字段、索引、数据、初始化逻辑和 migration。文档中的表与索引仅为待评审设计。

### 测试结果

- 文档结构检查：通过，设计文档包含任务要求的十七个章节，Git whitespace 检查通过。
- `npm run version:check`：通过，版本一致并保持 `v2.13.3`。
- 未执行代码测试与构建：本阶段没有业务代码、配置、依赖或数据库变化；不会把未运行记录为通过。

### 风险

1. Access 15 分钟、Session 绝对 30 天/空闲 7 天是设计建议，实施前仍需产品、安全和运维评审。
2. SQLite 并发轮换、事务锁和清理性能必须用真实 migration 与并发测试证明，不能仅凭设计结论上线。
3. Web Cookie 依赖正式 HTTPS、同站部署、反向代理、CORS 和 CSRF 配置；部署事实未冻结前不能切换。
4. Mobile Refresh Token 响应体交付不能只信任客户端声明，必须在独立阶段完成受控交付门禁。
5. Session 即时撤销要求 v1 HTTP 检查 `sid`，Socket 多实例还要求共享撤销事件；缺少任一环节都不能宣称立即退出。
6. legacy 7 天 JWT、logout 不撤销和改密不撤销仍保持现状，灰度期会同时存在两种安全语义。

### 下一阶段计划

等待后续实施指令。建议下一阶段只处理数据模型与 migration 评审：先备份和验证 SQLite 原子性，再创建默认不被 legacy 使用的新表；不得把数据库、v1 接口、Web、Mobile 和 Socket 一次性切换。

## Phase 2-C3-2：Auth Session 数据库基础设施建设

### 当前版本

`v2.13.4`。本阶段新增认证会话数据库基础设施，从 `v2.13.3` 升级 PATCH；认证产品能力尚未开放。

### 完成内容

1. 新增正式 migration `005_auth_session_foundation`，在独立事务中幂等创建两张认证基础表和指定索引。
2. 新增 `auth_sessions`，承载用户、客户端展示元数据、会话活动、空闲/绝对到期和撤销信息。
3. 新增 `auth_refresh_tokens`，只保存未来 Refresh Token hash、pepper 版本、generation、替换关系和撤销信息，不保存明文。
4. 新增独立 Session Repository 接口、SQLite 实现和类型；未接入 Auth Service、Controller 或路由。
5. 新增 migration 专项测试，覆盖注册顺序、幂等执行、表、字段、索引唯一性、外键和既有 users 数据保护。
6. 同步认证设计、更新日志、业务升级说明、发布说明和文档索引。

### 修改文件

- `api/database/migrations/005_auth_session_foundation.ts`
- `api/database/migrations/index.ts`
- `api/modules/auth/session/session.repository.ts`
- `api/modules/auth/session/session.sqlite-repository.ts`
- `api/modules/auth/session/session.types.ts`
- `tests/auth/session-migration.test.ts`
- `package.json`
- `package-lock.json`
- `CHANGELOG.md`
- `docs/CHANGELOG.md`
- `docs/SYSTEM_UPDATE.md`
- `docs/PHASE2_AUTH_SESSION_DESIGN.md`
- `docs/UPGRADE_PROGRESS.md`
- `docs/文档索引.md`
- `docs/releases/v2.13.4.md`

### 数据库变化

1. 新增 `auth_sessions`，`user_id` 外键关联 `users(id)`；未修改 `users` 表。
2. 新增 `auth_refresh_tokens`，`session_id` 外键关联 `auth_sessions(id)`，`replaced_by_id` 自关联下一枚轮换记录。
3. 新增 `auth_sessions(user_id, revoked_at, absolute_expires_at)`、绝对到期和空闲到期索引。
4. 新增 Refresh Token hash 唯一索引、`(session_id, generation)` 唯一索引、session 创建时间和到期索引。
5. 未创建 token 生成或回填数据；新增表当前不被生产认证链路读写。

### 测试结果

- `npm run test:auth-session-migration`：通过。
- `npm run version:check`：通过，版本一致为 `v2.13.4`。
- `npm run test:auth`：通过，legacy 认证行为保持不变。
- `npm run test:topics`：通过。
- `npm run test:api-contract`：通过。
- `npm run check`：通过。
- Auth Session migration、Repository 与测试定向 lint：通过。
- `npm run build`：通过。

### 风险

1. 新表会在应用初始化时通过正式 migration 创建；上线前仍需按部署规范完成生产数据库备份。
2. Repository 目前提供原子消费的条件更新，但完整“消费旧 token + 创建新 token”事务编排不在本阶段，禁止直接接入生产刷新流程。
3. `client_type` 等设备信息只作未来展示与风险元数据，不是可信设备认证因子。
4. 新表当前没有清理任务；在真实签发前必须实现并验证保留期和清理策略。
5. legacy JWT 仍为 7 天且不可撤销，logout、前端和 Socket 安全语义没有变化。

### 下一阶段计划

等待下一步指令。建议 Phase 2-C3-3 只实现 Session/Token 内核事务与服务测试，继续不开放 `/api/v1/auth/*`、不切换 legacy、Web 或 Socket；必须先明确 pepper 密钥管理和并发刷新事务边界。

## Phase 2-C3-3：Auth Session 运行时服务建设

### 当前版本

`v2.13.5`。本阶段新增未接线的认证核心服务能力，从 `v2.13.4` 升级 PATCH。

### 完成内容

1. 新增 Session Service，支持创建稳定 session id、查询并区分有效/不存在/撤销/空闲过期/绝对过期状态。
2. 支持以 `logout`、`admin`、`security_event`、`logout_all`、`password_changed`、`user_disabled` 等原因撤销单会话或用户会话。
3. 新增 Refresh Token Service，使用 Node crypto 生成 32 字节随机值，并通过分版本 pepper 执行 HMAC-SHA256。
4. 新增独立 Refresh Token Repository 与 SQLite 实现；正常刷新在一个写事务中完成旧记录查询、session 校验、单次消费、替换记录插入和 session 活动更新。
5. 已使用 token 再次出现时返回内部安全事件，并在同一事务中撤销所属 session 与 token 链。
6. Token Service 增加 `createAccessTokenV1()`、`verifyAccessTokenV1()`，严格校验 HS256、issuer、audience 和 access 类型；legacy 方法保持原样。
7. 新增 Session Service 专项测试，覆盖会话生命周期、hash、单次消费、替换链、复用检测、撤销后不可用和新旧 JWT 隔离。

### 修改文件

- `api/modules/auth/index.ts`
- `api/modules/auth/token.service.ts`
- `api/modules/auth/session/session.repository.ts`
- `api/modules/auth/session/session.sqlite-repository.ts`
- `api/modules/auth/session/session.service.ts`
- `api/modules/auth/session/session.types.ts`
- `api/modules/auth/refresh/refresh-token.repository.ts`
- `api/modules/auth/refresh/refresh-token.sqlite-repository.ts`
- `api/modules/auth/refresh/refresh-token.service.ts`
- `tests/auth/session-service.test.ts`
- `package.json`
- `package-lock.json`
- `CHANGELOG.md`
- `docs/CHANGELOG.md`
- `docs/SYSTEM_UPDATE.md`
- `docs/PHASE2_AUTH_SESSION_DESIGN.md`
- `docs/UPGRADE_PROGRESS.md`
- `docs/文档索引.md`
- `docs/releases/v2.13.5.md`

### 数据库变化

无。未新增表、字段、索引或 migration；继续复用 `v2.13.4` 已创建的 `auth_sessions` 与 `auth_refresh_tokens`。测试只写入系统临时目录中的 SQLite 数据库。

### 测试结果

- `npm run test:auth-session-service`：通过。
- `npm run version:check`：通过，版本一致为 `v2.13.5`。
- `npm run test:auth-session-migration`：通过。
- `npm run test:auth`：通过，legacy JWT、登录、me、改密和 logout 行为保持不变。
- `npm run test:topics`：通过。
- `npm run test:api-contract`：通过。
- `npm run check`：通过。
- Auth 模块、相关 migration 与认证测试定向 lint：通过。
- `npm run build`：通过。

### 未接入范围

1. legacy `/api/auth/login|me|change-password|logout` 不调用 Session 或 Refresh Token Service。
2. `signToken()`、`verifyToken()`、旧 payload 和 7 天有效期不变。
3. 未挂载或开放 `/api/v1/auth/*`，没有 Controller、Cookie 或 HTTP 响应返回 Refresh Token。
4. 未修改 Web token 存储、api-client、Mobile SecureStore 或 Socket 认证。

### 风险

1. pepper 当前通过 Service 构造参数注入；正式接线前必须冻结环境密钥命名、加载、轮换和应急流程。
2. 复用检测采用严格策略，正常并发也可能触发 session 撤销；客户端单飞和跨标签协调必须在 Web 灰度前完成。
3. Refresh Token 内核内部会返回替换 token 原值供未来安全交付层使用；当前没有任何路由或日志接触该值。
4. session 与 token 清理任务、审计事件持久化和多实例撤销广播仍未实现。

### 下一阶段计划

等待 Phase 2-C3-4 指令。建议下一阶段只实现默认关闭的 v1 Auth HTTP 适配、Zod/OpenAPI 契约和暗启测试；在 pepper 密钥管理、Cookie/CSRF 和功能开关未冻结前不得对客户端开放。

## Phase 2-C3-4：Auth v1 HTTP 灰度适配

### 当前版本

`v2.13.6`。本阶段新增默认关闭的 Auth v1 实验接口，从 `v2.13.5` 升级 PATCH。

### 完成内容

1. 新增独立 Auth v1 Service、Controller、Router 和模块装配，不修改 legacy Auth Service 或路由。
2. 新增 `POST /api/v1/auth/login`：验证账号后创建 session、生成 Refresh Token 和 15 分钟 v1 Access Token，返回 v1 envelope。
3. 新增 `POST /api/v1/auth/refresh`：通过 C3-3 原子事务完成单次轮换，重复使用旧 token 时撤销 session 并返回稳定安全错误。
4. 新增 `POST /api/v1/auth/logout`：校验 v1 Access Token 和 session 后只撤销当前 session。
5. 新增 `GET /api/v1/auth/sessions`：只返回当前用户活跃 session 摘要，不返回 token hash、完整 UA 或 IP。
6. 新增 Auth Zod Schema 和稳定错误码，响应统一携带 requestId，登录与刷新设置 `Cache-Control: no-store`。
7. OpenAPI 增加四个 Auth v1 endpoint，并使用 `x-experimental: true` 标记。
8. `XMT_AUTH_V1_ENABLED` 默认关闭；即使误设为 true，`NODE_ENV=production` 仍强制不挂载。启用测试需要独立 pepper。
9. 新增临时 SQLite HTTP 测试，覆盖开关、登录、刷新、复用、退出、sessions 和 legacy 登录。

### 修改文件

- `.env.example`
- `api/app.ts`
- `api/openapi.ts`
- `api/modules/auth/refresh/refresh-token.service.ts`
- `api/modules/auth/session/session.service.ts`
- `api/modules/auth/v1/index.ts`
- `api/modules/auth/v1/auth.v1.service.ts`
- `api/modules/auth/v1/auth.v1.controller.ts`
- `api/modules/auth/v1/auth.v1.routes.ts`
- `shared/schema/auth.schema.ts`
- `shared/schema/error.schema.ts`
- `tests/auth/auth-v1.test.ts`
- `tests/api-contract/api-contract.test.ts`
- `package.json`
- `package-lock.json`
- `CHANGELOG.md`
- `docs/API_CONTRACT.md`
- `docs/CHANGELOG.md`
- `docs/SYSTEM_UPDATE.md`
- `docs/PHASE2_AUTH_SESSION_DESIGN.md`
- `docs/UPGRADE_PROGRESS.md`
- `docs/文档索引.md`
- `docs/releases/v2.13.6.md`

### 数据库变化

无。未新增表、字段、索引或 migration；继续复用 `auth_sessions` 与 `auth_refresh_tokens`。专项测试使用并清理系统临时目录中的 SQLite 数据库。

### Feature Flag

1. 默认 `XMT_AUTH_V1_ENABLED=false`，接口不挂载并进入标准 v1 404。
2. 仅非生产环境显式设为 `true` 时挂载。
3. `NODE_ENV=production` 强制关闭，确保本阶段不会向生产用户返回 Refresh Token。
4. `XMT_AUTH_REFRESH_PEPPER` 仅在实际启用时要求存在，不影响默认启动和 legacy。

### 测试结果

- `npm run test:auth-v1`：通过。
- `npm run test:api-contract`：通过，包含 Auth v1 OpenAPI experimental 标记。
- `npm run version:check`：通过，版本统一为 `v2.13.6`。
- `npm run test:auth`：通过，legacy 认证行为保持冻结。
- `npm run test:auth-session-migration`：通过。
- `npm run test:auth-session-service`：通过。
- `npm run check`：通过。
- Auth 范围 ESLint：通过。
- `npm run build`：通过。

### 未接入范围

1. legacy `/api/auth/*`、旧 JWT payload 和 7 天有效期不变。
2. Login 页面、store、api-client、Cookie、Mobile SecureStore 和 Socket 认证均未修改。
3. 没有生产灰度用户、用户 allowlist 或生产 Refresh Token 交付；生产环境强制不挂载。
4. 未实现 logout-all、指定设备撤销、CSRF/Cookie、跨标签刷新协调或 Socket 重认证。

### 风险

1. 实验接口在非生产启用时通过 JSON 传递 Refresh Token，只允许内部测试，不是最终 Web/Mobile 交付方案。
2. login 的 session 与首枚 Refresh Token 尚未封装为单一数据库事务；失败时会撤销已创建 session，但仍需在生产灰度前强化原子性。
3. 复用检测采用严格策略；客户端并发协调尚未实现。
4. session/token 清理、结构化安全审计、多实例撤销事件仍未实现。

### 下一阶段计划

等待 Phase 2-C3-5 指令。建议下一阶段先冻结生产 Cookie/CSRF、pepper 密钥管理、用户 allowlist 和登录原子事务，再进行 Web 内部账号灰度；不得直接全量切换现有 Login 或 Socket。

## Phase 2-C3-5-A：Web 认证迁移前置设计

### 当前版本

`v2.13.6`。本阶段只新增 Web 认证迁移设计，不改变已发布行为，因此版本保持不变。

### 完成内容

1. 基于 `Login.tsx`、`src/api/auth.ts`、Auth Store、全局 401 拦截器、Layout、ProtectedRoute、api-client 和 Socket hook 记录当前 Web 认证链路。
2. 冻结内存 Access Token + HttpOnly Refresh Cookie 的目标流程，以及冷启动恢复、单飞刷新、单次重试和新旧模式隔离。
3. 冻结 `__Host-xmt_refresh` 的 name、Domain、Path、Secure、HttpOnly、SameSite 和 Max-Age 语义。
4. 设计 Origin 校验与 session 绑定签名双提交 CSRF Token，明确来源、校验顺序和接口范围。
5. 设计 Refresh Pepper 的 Secret 来源、active version、双版本读取、自然轮换和泄露处置。
6. 设计总开关、Web 独立开关、用户 ID allowlist、管理员优先但显式准入、稳定分桶和回滚。
7. 冻结登录事务边界，要求 session、generation 0 Refresh 记录与审计同事务提交。
8. 设计后续 Socket handshake、Access 更新重连、房间恢复与 Yjs 同步，但本阶段不实施。
9. 将前端迁移拆为 Auth Runtime 准备、内部 HTTP 灰度、扩大灰度并向 Socket 阶段交接三个阶段。

### 修改文件

- `docs/PHASE2_AUTH_WEB_MIGRATION_DESIGN.md`
- `docs/UPGRADE_PROGRESS.md`
- `docs/文档索引.md`

### 数据库变化

无。未新增或修改表、字段、索引、migration 和数据；登录事务内容仅为设计。

### 测试结果

- 未运行代码测试或构建：本阶段仅修改 Markdown 设计文档，不改变代码、依赖、配置或运行行为。
- 已执行文档章节、版本、变更范围和 Git whitespace 检查。

### 风险说明

1. 当前 experimental v1 仍以 JSON 交付 Refresh Token，不能直接用于 Web；实施时必须切换为 Cookie 且确保 Web JSON 不含原值。
2. 请求分散且全局 401 拦截会与静默刷新竞争，必须按模块收敛而非一次性替换。
3. `__Host-` Cookie 要求 HTTPS、Path=/ 且无 Domain；线上 origin 与代理事实未确认前不能启用。
4. 严格单次轮换要求跨标签协调，否则正常并发可能触发 reuse 撤销。
5. Socket 尚未迁移，v1 Web 灰度不能被描述为完整认证迁移。

### 下一阶段计划

等待 Phase 2-C3-5-B 指令。建议下一阶段只实现后端 Web Cookie/CSRF、Pepper 版本加载、登录事务与 allowlist 基础设施，仍不修改 `Login.tsx`、前端 Token 存储、Socket、Caddy 或生产默认开关。

## Phase 2-C3-5-B：Web Auth Runtime 与迁移基础设施

### 当前版本

`v2.13.7`。本阶段新增 Web Auth 迁移基础能力，从 `v2.13.6` 升级 PATCH，但不切换现有登录入口。

### 完成内容

1. 新增 `src/auth/runtime`，提供 `legacy | v1-web` 模式、五态认证状态机、内存 Access Token Store、刷新协调和 Runtime。
2. Access Token Store 只使用类私有内存字段，不引用 localStorage/sessionStorage。
3. api-client 默认使用 `credentials: include`，仅在调用方明确允许 v1 refresh 时处理 401；刷新使用单飞锁，原请求最多重试一次。
4. 新增 Auth v1 Client，封装 login、refresh、logout 和 sessions，但未被现有页面或 API 引用。
5. 新增 `__Host-xmt_refresh` Cookie 设置/清除配置能力，固定 HttpOnly、SameSite=Lax、Path=/，不设置 Domain；尚未接入 Controller。
6. 新增 CSRF Service，支持 32 字节随机值、HMAC-SHA256 session 绑定签名、恒定时间验证和双提交校验；尚未接入接口。
7. 新增 `XMT_AUTH_WEB_ENABLED=false` 与数字用户 ID allowlist 解析；生产环境强制关闭，用户名不参与准入。
8. 新增专项测试，覆盖模式、开关、内存 Token、刷新单飞、401 单次重试、过期、清理、Auth Client、Cookie、CSRF 和 allowlist。

### 修改文件

- `src/auth/runtime/*`
- `packages/api-client/auth.ts`
- `packages/api-client/client.ts`
- `packages/api-client/types.ts`
- `packages/api-client/auth-client.ts`
- `api/modules/auth/web/*`
- `shared/schema/auth.schema.ts`
- `tests/auth/auth-web-runtime.test.ts`
- `.env.example`
- `package.json`
- `package-lock.json`
- `CHANGELOG.md`
- `docs/CHANGELOG.md`
- `docs/SYSTEM_UPDATE.md`
- `docs/PHASE2_AUTH_WEB_MIGRATION_DESIGN.md`
- `docs/UPGRADE_PROGRESS.md`
- `docs/文档索引.md`
- `docs/releases/v2.13.7.md`

### 数据库变化

无。未新增表、字段、索引、migration 或数据；现有 Auth Session/Refresh 表和 Repository 语义不变。

### 测试结果

- `npm run test:auth-web-runtime`：通过。
- `npm run version:check`：通过，版本统一为 `v2.13.7`。
- `npm run test:auth`：通过，legacy 登录、JWT、me、改密和 logout 行为保持冻结。
- `npm run test:auth-session-migration`：通过。
- `npm run test:auth-session-service`：通过。
- `npm run test:auth-v1`：通过。
- `npm run test:api-contract`：通过。
- `npm run check`：通过。
- Auth 相关 ESLint：通过。
- `npm run build`：通过。

### 当前未切换范围

1. `Login.tsx`、`src/api/auth.ts`、Auth Zustand Store 与现有持久 Token 逻辑未修改。
2. legacy `/api/auth/*`、旧 JWT payload、7 天有效期和生产登录行为不变。
3. Cookie/CSRF Service 未挂载到 v1 login/refresh/logout，experimental JSON Refresh Token 契约暂时不变。
4. `XMT_AUTH_WEB_ENABLED` 默认 false，生产强制关闭；没有真实灰度用户。
5. Socket、Yjs、Caddy 和线上 Cookie 策略未修改。

### 风险说明

1. 新 Runtime 尚无页面消费者，只有测试证明基础行为，不能宣称 Web 已完成迁移。
2. api-client 的单飞锁只覆盖同一实例；跨标签 BroadcastChannel/Web Locks 尚未实现。
3. Cookie/CSRF 未接线，因此还没有浏览器 Set-Cookie、Origin 或端到端 CSRF 保护验证。
4. 登录创建 session 与首枚 Refresh Token 的原子事务仍待下一阶段实现。

### 下一阶段计划

等待 Phase 2-C3-5-C 指令。建议只完成后端 Web Cookie/CSRF HTTP 适配、登录事务原子化和浏览器契约测试，继续不切换 `Login.tsx`、持久 Token、Socket、Caddy 或生产默认开关。

## Phase 2-C3-5-C：Web Cookie / CSRF HTTP 适配

### 当前版本

`v2.13.8`。本阶段完成默认关闭的 Web Cookie/CSRF HTTP 适配，从 `v2.13.7` 升级 PATCH。

### 完成内容

1. v1 Web login 使用 HttpOnly `__Host-xmt_refresh` Cookie 交付 Refresh Token，JSON 不再包含原值，并设置独立 CSRF Cookie。
2. Web refresh 只读取 Cookie，拒绝 body Refresh Token；依次完成空 body Schema、Origin、Cookie、Session、CSRF 和 Refresh hash/轮换校验。
3. refresh 成功后返回不含 Refresh Token 的标准 envelope，并覆盖新的 Refresh/CSRF Cookie。
4. Web logout 在 Access Token 与 session middleware 后校验 Origin/CSRF，撤销当前 session，并以同名同 Path、`Max-Age=0` 清除 Cookie。
5. 新增 Web 登录事务 Repository，将 `auth_sessions`、generation 0 Refresh hash 与 `activity_log` 纳入单个 SQLite 写事务。
6. Session/Refresh Service 新增记录准备能力，既有 create/rotate 行为与 legacy 路径保持不变。
7. OpenAPI、共享 Zod Schema 和 Auth v1 Client 更新为 Web Cookie 契约。
8. 新增 Cookie/CSRF HTTP 测试，覆盖 Cookie 属性、body 降级拒绝、CSRF 失败、轮换、重放、退出、no-store 和事务回滚。

### 修改文件

- `api/modules/auth/v1/*`
- `api/modules/auth/web/*`
- `api/modules/auth/session/session.service.ts`
- `api/modules/auth/refresh/refresh-token.service.ts`
- `api/openapi.ts`
- `shared/schema/auth.schema.ts`
- `packages/api-client/auth-client.ts`
- `tests/auth/auth-web-cookie.test.ts`
- `tests/auth/auth-web-runtime.test.ts`
- `.env.example`
- `package.json`
- `package-lock.json`
- `CHANGELOG.md`
- `docs/API_CONTRACT.md`
- `docs/CHANGELOG.md`
- `docs/SYSTEM_UPDATE.md`
- `docs/PHASE2_AUTH_WEB_MIGRATION_DESIGN.md`
- `docs/UPGRADE_PROGRESS.md`
- `docs/文档索引.md`
- `docs/releases/v2.13.8.md`

### 数据库变化

无。未新增表、字段、索引或 migration；只把现有 session、Refresh 记录和活动日志写入收口到单事务。

### 测试结果

- `npm run test:auth-web-cookie`：通过。
- `npm run version:check`：通过，版本统一为 `v2.13.8`。
- `npm run test:auth`：通过，legacy 行为保持冻结。
- `npm run test:auth-session-migration`：通过。
- `npm run test:auth-session-service`：通过。
- `npm run test:auth-v1`：通过，非 Web experimental 测试分支保持兼容。
- `npm run test:auth-web-runtime`：通过。
- `npm run test:api-contract`：通过。
- `npm run check`：通过。
- Auth 相关 ESLint：通过。
- `npm run build`：通过。

### 当前未切换范围

1. `Login.tsx`、legacy `/api/auth/*` 和现有前端登录入口不变。
2. localStorage/sessionStorage Token 逻辑、旧 JWT payload 和 7 天有效期不变。
3. Web Auth 仍要求 v1/Web 双开关、非生产环境和用户 ID allowlist；默认关闭且生产不可开启。
4. Socket、Yjs、Caddy 和线上 Cookie 配置不变。
5. Web Runtime 尚未被现有页面消费，普通用户不会进入 Cookie 流程。

### 风险说明

1. 当前 CSRF 来源使用非 HttpOnly Cookie + Header 双提交，仍依赖 CSP 和 XSS 治理，不能把 CSRF 视为 XSS 防护。
2. api-client 单飞仍是单实例范围，跨标签协调尚未实施。
3. Cookie Secure/Origin 的真实线上部署事实未验证，因此生产硬门禁继续保留。
4. Access Token 刷新后的 Socket 重认证和 Yjs 恢复尚未实施。

### 下一阶段计划

等待 Phase 2-C3-5-D 指令。建议只做非生产浏览器暗启测试入口或自动化夹具，验证 Runtime 冷启动、401 刷新和退出；仍不切正式 Login、持久 Token、Socket、Caddy 或生产开关。

## Phase 2-C3-5-D：Web Auth 暗启验证与浏览器契约测试

### 当前版本

`v2.13.9`。本阶段完成 Web Auth 非生产浏览器暗启验证基础，从 `v2.13.8` 升级 PATCH。

### 完成内容

1. 新增独立 Vite/Playwright 浏览器夹具，调用真实 Web Runtime、api-client 和 Auth v1 Cookie HTTP 接口，不接入正式页面。
2. 冻结 F5、新标签页、关闭重开后的 Cookie 冷启动恢复，确认 Access Token 只存在页面内存。
3. 覆盖多个并发 401 的单飞刷新，并处理刷新完成后迟到的旧 401，原请求最多重试一次。
4. 覆盖 Cookie 缺失、session 撤销、Refresh Token reuse 和 CSRF 失败，确认 Runtime 进入 expired 并清除 Token 与用户状态。
5. 覆盖 logout 后服务端 session 撤销、Cookie 清理、客户端清理及再次访问要求认证。
6. 冻结 v1/Web 双开关、用户 ID allowlist、非生产环境四重门禁。

### 修改文件

- `packages/api-client/client.ts`
- `src/auth/runtime/auth-runtime.ts`
- `tests/auth/auth-web-runtime.test.ts`
- `tests/auth/auth-browser.test.ts`
- `tests/auth/browser/fixture.html`
- `tests/auth/browser/fixture.ts`
- `package.json`
- `package-lock.json`
- `CHANGELOG.md`
- `docs/CHANGELOG.md`
- `docs/SYSTEM_UPDATE.md`
- `docs/UPGRADE_PROGRESS.md`
- `docs/文档索引.md`
- `docs/releases/v2.13.9.md`

### 数据库变化

无。未新增表、字段、索引或 migration；浏览器契约测试使用临时 SQLite，完成后关闭连接。

### 测试结果

- `npm run test:auth-browser`：通过，使用真实 Chromium 浏览器验证完整暗启闭环。
- `npm run version:check`：通过，版本统一为 `v2.13.9`。
- `npm run test:auth`：通过，legacy Auth 行为保持冻结。
- `npm run test:auth-v1`：通过。
- `npm run test:auth-web-runtime`：通过。
- `npm run test:auth-web-cookie`：通过。
- `npm run test:api-contract`：通过。
- `npm run check`：通过。
- Auth/Web Runtime/浏览器夹具范围 ESLint：通过。
- `npm run build`：通过。

### 当前未切换范围

1. `Login.tsx`、`src/api/auth.ts`、Zustand Auth Store 和正式页面登录入口未修改。
2. legacy `/api/auth/*`、浏览器持久 Token、旧 JWT payload 与 7 天有效期保持不变。
3. `XMT_AUTH_V1_ENABLED` 与 `XMT_AUTH_WEB_ENABLED` 默认关闭，生产环境硬门禁保持有效。
4. Socket、Yjs、Caddy 和线上 Cookie 策略未修改。

### 风险说明

1. 单飞刷新当前限定在单个页面 Runtime/api-client 实例，跨标签协调尚未实现。
2. 本阶段使用本地同源浏览器与临时数据库，不代表生产代理、域名和证书链已验证。
3. Web Runtime 仍未接入正式页面，测试通过不等于用户流量已迁移。

### 下一阶段计划

等待 Phase 2-C3-5-E 指令。建议先设计并验证跨标签刷新协调、暗启观测指标和灰度准入/退出清单，继续保持正式 Login、Socket、Caddy 与生产开关不变。

## Phase 2-C3-5-E1：Web Auth 灰度准入与观测体系建设

### 当前版本

`v2.13.10`。本阶段新增 Auth 灰度治理与迁移观测基础，从 `v2.13.9` 升级 PATCH。

### 完成内容

1. 新增统一 Auth Rollout Config，支持 `disabled`、`legacy`、`internal`、`allowlist`、`percentage` 五种模式。
2. 兼容旧 `XMT_AUTH_V1_ENABLED`、`XMT_AUTH_WEB_ENABLED` 和 `XMT_AUTH_WEB_ALLOWLIST_USER_IDS`；旧双开关同时为 true 时等价映射为 allowlist。
3. 新增 `AuthRolloutService.shouldUseWebAuth(user)`，按用户 ID 与非敏感 salt 执行 0–9999 稳定 SHA-256 分桶。
4. 新增八项 Auth Migration Metrics：legacy/v1 登录、refresh 成功/失败、CSRF 失败、Token reuse、logout 成功和 expired。
5. 新增 `auth.migration.login|refresh|logout|rollback` 结构化事件，携带 requestId、可用时的 userId、mode、outcome 和安全 reason，不记录 Token。
6. v1 Web Controller 与 legacy 登录接入观测；Cookie、CSRF、轮换、复用、注销和 session 失效均保持原响应契约。
7. 配置回滚为 `v1-web -> legacy`：停止新的 Web Auth 准入，不删除 Session 数据，不影响已签发 legacy JWT。

### 修改文件

- `api/modules/auth/rollout/*`
- `api/modules/auth/web/auth-web.config.ts`
- `api/modules/auth/v1/*`
- `api/modules/auth/auth.controller.ts`
- `api/modules/auth/index.ts`
- `tests/auth/auth-rollout.test.ts`
- `tests/auth/auth-web-cookie.test.ts`
- `.env.example`
- `package.json`
- `package-lock.json`
- `CHANGELOG.md`
- `docs/CHANGELOG.md`
- `docs/SYSTEM_UPDATE.md`
- `docs/UPGRADE_PROGRESS.md`
- `docs/文档索引.md`
- `docs/releases/v2.13.10.md`

### 数据库变化

无。未新增表、字段、索引或 migration；指标为进程内观测能力，Session 表只读验证回滚保留行为。

### 测试结果

- `npm run test:auth-rollout`：通过，覆盖五种模式、兼容配置、稳定分桶、回滚、指标和无 Token 日志。
- `npm run version:check`：通过，版本统一为 `v2.13.10`。
- `npm run test:auth`：通过，legacy 登录与 JWT 行为保持冻结。
- `npm run test:auth-v1`：通过，experimental v1 HTTP 行为保持兼容。
- `npm run test:auth-web-runtime`：通过。
- `npm run test:auth-web-cookie`：通过，包含迁移指标断言。
- `npm run test:api-contract`：通过。
- `npm run check`：通过。
- Auth/rollout 范围 ESLint：通过。
- `npm run build`：通过。

### 回滚与风险

1. 将 `XMT_AUTH_ROLLOUT_MODE` 设为 `legacy` 或 `disabled` 即停止新用户进入 v1-web；生产环境无条件归一为 legacy。
2. 回滚不清理 `auth_sessions` 或 `auth_refresh_tokens`，旧 JWT 验证路径继续工作。
3. 当前指标为单进程内存计数，重启会清零，多实例不会自动聚合；在正式灰度前需接入统一监控后端。
4. percentage 只决定准入，不会自动切换正式 Login；模式必须在后续入口接入阶段冻结到会话。

### 下一阶段计划

等待 Phase 2-C3-5-E2 指令。建议建设跨实例指标导出与告警阈值、灰度操作审计和准入决策只读诊断接口；继续不切正式 Login、Socket/Yjs、Caddy 或生产 Web Auth。

## Phase 2-C3-5-E2：Auth 灰度运行治理与上线准备

### 当前版本

`v2.13.11`。本阶段新增只读运行治理与上线准备能力，从 `v2.13.10` 升级 PATCH。

### 完成内容

1. 新增 Auth Rollout Status Service，返回当前 mode、enabled、用户 matchedRule 和安全 reason。
2. 新增时间指标事件与 Metrics Service，按 60 分钟、24 小时聚合 login、refresh、logout 和 failure。
3. 新增有界配置审计服务，字段包含 actor、action、before、after、reason、created_at；本阶段无写配置入口。
4. 新增 Threshold Config 与风险服务，覆盖 Refresh 失败率、CSRF 失败、Token reuse 和 expired 次数，超过阈值只生成风险事件。
5. 新增管理员只读 `GET /api/v1/auth-rollout/status`，继续接受 legacy JWT，并同步共享 Zod Schema 与 OpenAPI。
6. 新增 `/admin/auth-rollout` 认证迁移状态页，展示模式、指标、风险、用户准入原因和配置审计，不提供配置修改操作。
7. 新增 `AUTH_ROLLOUT_RUNBOOK.md`，冻结上线前检查、灰度步骤、观察指标、停止条件、回滚和责任人清单。

### 修改文件

- `api/modules/auth/rollout/*`
- `api/modules/auth/index.ts`
- `api/app.ts`
- `api/openapi.ts`
- `shared/schema/auth-rollout.schema.ts`
- `src/api/authRollout.ts`
- `src/pages/AuthRolloutStatus.tsx`
- `src/App.tsx`
- `src/config/navigation.ts`
- `tests/auth/auth-rollout-governance.test.ts`
- `tests/auth/browser/rollout-governance.html`
- `tests/auth/browser/rollout-governance.tsx`
- `.env.example`
- `package.json`
- `package-lock.json`
- `CHANGELOG.md`
- `docs/API_CONTRACT.md`
- `docs/AUTH_ROLLOUT_RUNBOOK.md`
- `docs/CHANGELOG.md`
- `docs/SYSTEM_UPDATE.md`
- `docs/UPGRADE_PROGRESS.md`
- `docs/文档索引.md`
- `docs/releases/v2.13.11.md`

### 数据库变化

无。未新增表、字段、索引或 migration；指标事件与配置审计为有界进程内数据。

### 测试结果

- `npm run test:auth-rollout-governance`：通过，覆盖诊断、时间指标、审计、阈值和回滚。
- 桌面 1440×900 和移动端 390×844 浏览器验证通过；用户诊断交互成功，无横向溢出或控制台错误。
- `npm run version:check`：通过，版本统一为 `v2.13.11`。
- `npm run test:auth`：通过，legacy 行为保持冻结。
- `npm run test:auth-rollout`：通过。
- `npm run test:auth-web-runtime`：通过。
- `npm run test:auth-web-cookie`：通过。
- `npm run test:api-contract`：通过。
- `npm run check`：通过。
- Auth Rollout/API/页面/浏览器夹具范围 ESLint：通过。
- `npm run build`：通过。

### 风险与未切换范围

1. 指标和审计为单进程有界内存记录，重启清零且多实例不聚合，不能替代正式监控和持久审计。
2. 阈值只生成风险事件，不自动修改灰度配置，停止动作仍需按运行手册人工执行和复核。
3. 正式 Login、默认 `/api/auth/login`、生产 v1-web、legacy JWT、Socket/Yjs、Caddy 和数据库结构均未修改。
4. 管理页只对 admin 开放且完全只读，本阶段不扩大或切换任何真实用户。

### 下一阶段计划

等待 E3 指令。建议只选择明确责任人的内部普通测试账号进入 allowlist，先完成值班、指标导出、报警通知和回滚演练；不要直接切换管理员、比例流量或依赖 Socket/Yjs 的工作流。

## Phase 2-C3-5-E3：生产 Auth v1-web 受控灰度准备

### 当前版本

`v2.13.12`。本阶段增加生产专用批准门禁，默认仍为 legacy。

### 完成内容

1. 生产环境只有同时满足独立批准开关和明确用户 ID allowlist 才可挂载 Auth v1。
2. `internal` 与 `percentage` 在生产继续强制回落 legacy，避免范围扩散。
3. 正式 Login、管理员账号、legacy JWT、Socket/Yjs 与 Caddy 不切换。
4. 灰度执行责任人由李庆承担，allowlist 由李庆与刘启超复核；观察窗口为 2026-07-31 12:00–13:00。

### 数据库变化

无数据库结构变化。生产执行阶段只新增三个隔离的 member 测试用户，并复用既有认证会话表。

### 测试结果

- `npm run version:check`：通过，版本统一为 `v2.13.12`。
- `npm run test:auth`、`test:auth-rollout`、`test:auth-v1`：通过。
- `npm run test:auth-web-runtime`、`test:auth-web-cookie`、`test:auth-browser`：通过。
- `npm run test:auth-rollout-governance`、`test:api-contract`：通过。
- `npm run check`、Auth 变更范围 ESLint、`npm run build`：通过。
- 生产真实浏览器与指标观察结果待执行后写入 `AUTH_PRODUCTION_GRAY_REPORT.md`。
- 生产真实浏览器验证通过：3 个隔离 member 账号完成登录、Cookie、Refresh、刷新/新标签页/重开、并发单飞、Logout、撤销与重新登录。
- 生产观察约 33 分钟，31 个连续健康样本全部正常；无新增 Socket、SQLite、未处理异常或 Yjs 错误。
- 测试结束后已恢复 legacy、关闭批准和 v1/Web 开关，并将测试账号标记 disabled；Session 与审计记录保留。

### 风险与回滚

1. 任一批准条件缺失即回落 legacy。
2. 生产禁止 `internal` 与 `percentage`。
3. 异常时将模式切回 legacy、关闭批准开关并重启；不删除会话和审计记录。
4. 结构化 login 日志事件数高于实际成功登录/Session 数，扩大灰度前需统一指标去重口径。

## Phase 2-C3-6-A：Auth 事件模型统一与外部指标基础

### 当前版本

`v2.13.13`。本阶段只治理认证观测，不扩大灰度或修改认证业务行为。

### 完成内容

1. 新增 `api/modules/auth/events/`，统一十类 Auth Event 与固定安全字段。
2. `AuthEventService` 成为认证指标唯一事实入口，日志只输出事件，不再作为计数来源。
3. 新增 `AuthMetricsService` 与 `AuthMetricsExporter`，当前使用有界 Memory Exporter，并为 Prometheus/OpenTelemetry 预留 `increment/observe/gauge`。
4. legacy 与 v1 登录成功均只产生一个 login success 计数；Session、Rollout 决策保持独立事件但不重复计入登录。
5. Refresh、CSRF、Token reuse、Logout、Session 撤销统一由 mapper 派生指标，移除 Controller/Route 的多点手工计数。
6. `/api/v1/auth-rollout/status` 增加 5 分钟窗口，连同 60 分钟、24 小时统一展示登录、刷新、失败和安全事件。

### 修改文件

- `api/modules/auth/events/*`
- `api/modules/auth/auth.controller.ts`
- `api/modules/auth/v1/*`
- `api/modules/auth/rollout/*`
- `shared/schema/auth-rollout.schema.ts`
- `src/api/authRollout.ts`
- `src/pages/AuthRolloutStatus.tsx`
- `tests/auth/*`
- `docs/*`
- `package.json`
- `package-lock.json`

### 数据库变化

无。未新增或修改任何认证表、字段、索引与 migration，旧日志也未删除。

### 测试结果

- `npm run version:check`：通过（v2.13.13）
- `npm run test:auth`：通过
- `npm run test:auth-rollout`：通过
- `npm run test:auth-events`：通过
- `npm run test:auth-web-runtime`：通过
- `npm run test:auth-web-cookie`：通过
- `npm run test:auth-browser`：通过
- `npm run test:api-contract`：通过
- `npm run test:auth-v1`：通过（补充回归）
- `npm run test:auth-rollout-governance`：通过（补充回归）
- `npm run check`：通过
- `npm run build`：通过
- Auth 相关范围 ESLint：通过

### 风险与下一阶段

1. Memory Exporter 在进程重启后清零，尚不能替代持久外部监控。
2. 旧 Migration Logger/Metrics 保留兼容导出，但生产 Auth 路径不再写入；后续确认无调用方后再单独弃用。
3. 正式 Login、legacy JWT、生产灰度、Socket/Yjs 和数据库结构保持不变。
4. 下一阶段应接入真实 Prometheus/OpenTelemetry Exporter 并冻结告警，再评估正式 Login 准入。

## Phase 2-C3-6-B：Auth 生产指标 Exporter 与告警基础

### 当前版本

`v2.13.14`。本阶段只建设认证观测基础，不扩大灰度或修改认证行为。

### 完成内容

1. 新增 `api/modules/auth/metrics/`，包含统一类型、Metrics Registry、Prometheus 与 OpenTelemetry 适配。
2. Registry 同时扇出 Memory 与 Prometheus；OTel 支持部署环境注入兼容 Meter，且不绑定具体厂商。
3. Prometheus 提供登录、Refresh、Refresh 失败、Logout、安全事件 Counter，活跃 Session Gauge 和 Refresh 耗时 Histogram。
4. Auth Event 继续作为唯一指标事实，多 Exporter 不会重复业务计数；安全指标只使用低基数事件类型与原因标签。
5. `/api/v1/auth-rollout/status` 增加 Exporter 状态、指标来源、最近事件时间和最近导出时间。
6. 新增 `AUTH_ALERT_RULES.md`，冻结 Refresh 失败率、Token reuse、CSRF、Expired 告警建议与停止动作。

### 修改文件

- `api/modules/auth/metrics/*`
- `api/modules/auth/events/*`
- `api/modules/auth/v1/auth.v1.controller.ts`
- `api/modules/auth/rollout/*`
- `shared/schema/auth-rollout.schema.ts`
- `src/api/authRollout.ts`
- `src/pages/AuthRolloutStatus.tsx`
- `tests/auth/auth-metrics-exporter.test.ts`
- `docs/*`
- `package.json`
- `package-lock.json`

### 数据库变化

无。未新增或修改表、字段、索引和 migration。

### 测试结果

- `npm run version:check`：通过（v2.13.14）
- `npm run test:auth`：通过
- `npm run test:auth-events`：通过
- `npm run test:auth-metrics-exporter`：通过
- `npm run test:auth-rollout`：通过
- `npm run test:auth-web-runtime`：通过
- `npm run test:auth-web-cookie`：通过
- `npm run test:api-contract`：通过
- `npm run check`：通过
- `npm run build`：通过
- Auth 相关范围 ESLint：通过

### 风险与下一阶段

1. Prometheus Exporter 需要部署侧接入抓取入口和持久监控后端；代码内聚合不能代替外部时序数据库。
2. OTel 默认不绑定 SDK 或厂商，需在部署组合根注入 Meter，并验证 Collector 与告警链路。
3. 活跃 Session Gauge 是单实例观测值，多实例应保留实例维度，不能简单求和当作全局唯一会话数。
4. 正式 Login 准入前需完成生产采集、跨实例聚合、告警通知、值班演练和基线校准；当前仍保持 legacy。

## Phase 2-C3-6-C：Auth 生产观测链路接入与正式 Login 准入设计

### 当前版本

`v2.13.15`。本阶段完成观测接入准备与设计，不切换生产 Login。

### 完成内容

1. 新增默认关闭的 `/internal/metrics/auth`，返回 Prometheus text format，并按配置 CIDR 校验来源。
2. 公网 Caddy 示例明确对内部指标路径返回 404；Prometheus 示例直接从私网 Node 地址抓取。
3. Prometheus/OTel 统一增加低基数 `instance` 标签，部署通过 `XMT_INSTANCE_ID` 提供稳定实例身份。
4. 新增 OTel Collector 配置样例，并用注入 Meter 模拟 Collector 验证 XMT → OTel Exporter → Collector 契约。
5. 新增 Warning/Critical 规则样例；Token reuse 只做离线规则验证，不在生产制造真实复用事件。
6. 新增多实例治理文档，明确 Counter/Histogram 聚合规则及 `active_sessions` 不可简单求和。
7. 新增正式 Login 迁移计划，冻结 legacy/v1 状态、准入前置、allowlist 阶段、回滚与 Socket/Yjs 风险。

### 修改文件

- `api/modules/auth/metrics/*`
- `api/modules/auth/events/*`
- `api/app.ts`
- `.env.example`
- `deploy/observability/*`
- `deploy/linux/Caddyfile.example`
- `tests/auth/auth-observability-integration.test.ts`
- `docs/*`
- `package.json`
- `package-lock.json`

### 数据库变化

无。未新增或修改表、字段、索引或 migration。

### 测试结果

- `npm run version:check`：通过（v2.13.15）
- `npm run test:auth`：通过
- `npm run test:auth-events`：通过
- `npm run test:auth-metrics-exporter`：通过
- `npm run test:auth-observability`：通过
- `npm run test:auth-rollout`：通过
- `npm run check`：通过
- `npm run build`：通过
- Auth 相关范围 ESLint：通过
- 本机无 OTel Collector 可执行文件；模拟 Collector Meter 与配置契约通过，真实 Collector 联通待部署环境验证。

### 风险与下一阶段

1. 本阶段验证的是本地 scrape 与模拟 Collector 契约，尚未连接真实生产 Prometheus、Collector 或通知平台。
2. Endpoint 必须同时受 Node CIDR、防火墙和反向代理保护；仅设置应用开关不足以授权公网访问。
3. instance 标识不稳定会导致时序膨胀；部署前必须冻结命名规则。
4. 正式 Login 仍不准入，下一阶段需完成真实监控联通、告警到达演练、24 小时基线和 Socket/Yjs 交接决策。

## Phase 2-C3-7-A：Socket/Yjs Auth Bridge 设计

### 当前版本

`v2.13.16`。本阶段只完成审计、设计和测试契约，不修改业务代码。

### 完成内容

1. 新增 `SOCKET_AUTH_CURRENT.md`，冻结 legacy handshake、Token 来源、用户复查、Room/Yjs 恢复与依赖点。
2. 新增 `AUTH_SOCKET_MIGRATION_DESIGN.md`，定义 `SocketAuthContext` 和显式 legacy/v1 验证分支。
3. 明确 v1 Socket 只传短期 Access Token，Refresh Token、Cookie 与 CSRF Token 永不进入 Socket。
4. 设计 HTTP 单飞 Refresh → Access 更新 → 新 handshake → Room/Yjs 恢复的固定顺序。
5. 规划 Legacy Socket → Bridge 暗启 → Bridge allowlist → v1 Socket 的可回滚阶段。
6. 新增 `AUTH_SOCKET_TEST_PLAN.md`，覆盖 Token 到期、Session 撤销、断网、Yjs 最终一致、多标签和回滚。
7. 审计识别 collaboration presence 依赖客户端 user payload、Room 准入未强绑定业务权限，列为 Bridge 实施前门禁。

### 修改文件

- `docs/SOCKET_AUTH_CURRENT.md`
- `docs/AUTH_SOCKET_MIGRATION_DESIGN.md`
- `docs/AUTH_SOCKET_TEST_PLAN.md`
- `docs/releases/v2.13.16.md`
- `docs/UPGRADE_PROGRESS.md`
- `docs/CHANGELOG.md`
- `docs/SYSTEM_UPDATE.md`
- `docs/文档索引.md`
- `CHANGELOG.md`
- `package.json`
- `package-lock.json`

### 数据库变化

无。未新增或修改数据库、migration、Socket/Yjs 协议或生产配置。

### 验证结果

- 三份核心设计文档与发布说明均存在、非空，章节结构检查通过。
- 文档索引、CHANGELOG、SYSTEM_UPDATE 与阶段记录引用检查通过。
- `npm run version:check`：通过（v2.13.16）。
- `git diff --check`：通过。
- 变更范围检查：仅文档、CHANGELOG 与版本元数据，无业务代码、数据库、Socket/Yjs 协议或生产配置变化。

### 风险与下一阶段

1. 当前 Socket 只在 handshake 验证 legacy JWT，长连接建立后不复验 Token 到期、Session 撤销或用户禁用。
2. v1 Access Token 当前无法通过 legacy `payload.userId` 链路建立身份。
3. Yjs 重连保留本地 Doc 并重发 JOIN，但待发送更新缺少应用级 ACK，必须以 CRDT 状态向量验证最终一致。
4. 下一阶段建议只实现纯 Auth Bridge middleware、Context mapper 和临时数据库契约测试，feature flag 默认关闭；不要同时切换前端或生产 Socket。

## Phase 2-C3-7-B：Socket Auth Bridge 基础设施实施

### 当前版本

`v2.13.17`。本阶段实现认证基础设施，Feature Flag 默认关闭，生产环境保持 legacy。

### 完成内容

1. 新增 `api/modules/auth/socket/`：types、Zod schema、mapper、service、middleware、errors。
2. 实现 `SocketAuthContext`，只允许 userId/sessionId/tokenType/authMode/issuedAt/expiresAt；不含 Token、Refresh、Cookie、密码或 role snapshot。
3. Bridge 关闭时走 legacy 分支；开启后按显式 mode 分支，legacy 使用旧 JWT，v1-web 使用 v1 Access Token + ACTIVE Session + enabled user。
4. 严格禁止 v1→legacy 或 legacy→v1 fallback，避免 token confusion。
5. 接入现有 Socket middleware，不重写 Socket 初始化、Room、消息、Heartbeat 或 Collaboration 事件。
6. Collaboration JOIN 使用服务端认证身份覆盖客户端 userId/name/role，新增 `authorizeSocketRoomJoin()` 预留入口但不改变业务权限规则。
7. 新增 legacy/v1、错误分支、Session revoked、disabled user、Feature Flag 和 no-fallback 测试。

### 修改文件

- `api/modules/auth/socket/*`
- `api/modules/auth/index.ts`
- `api/app.ts`
- `api/collaboration/core/roomManager.ts`
- `.env.example`
- `tests/auth/socket-auth-contract.test.ts`
- `tests/auth/socket-auth-bridge.test.ts`
- `docs/*`
- `package.json`
- `package-lock.json`

### 数据库变化

无。未新增或修改表、字段、索引或 migration。

### 测试结果

- `npm run version:check`：通过（v2.13.17）
- `npm run test:auth`：通过，legacy Auth 行为保持冻结
- `npm run test:auth-socket-contract`：通过
- `npm run test:auth-socket-bridge`：通过
- `npm run test:auth-events`：通过
- `npm run test:auth-rollout`：通过
- `npm run check`：通过
- `npm run build`：通过
- Auth 范围 ESLint：通过

### 风险与下一阶段

1. Bridge 当前只提供认证上下文；长连接到期主动断开、Access Refresh 后重连和 Yjs state-vector 恢复尚未实施。
2. Room 权限入口目前只做基础输入边界，未改变既有业务权限模型；下一阶段必须接入真实 owner/permission/scope 规则。
3. 生产 Flag 默认关闭且 NODE_ENV=production 硬性关闭；正式用户和 Socket 行为未切换。
4. 下一阶段建议实现 Socket Coordinator、Refresh 后重连、连接到期治理和 Yjs 恢复契约，继续保持灰度范围受控。

## Phase 2-C3-7-C：Socket Coordinator + Yjs Recovery Bridge 实施

### 当前版本

`v2.13.18`

### 完成内容

1. 新增 `src/auth/socket/` Coordinator、状态模型和 HTTP Auth Runtime Token Provider；Socket 内部不执行 Refresh。
2. 实现临期刷新、Access Token 写入 `socket.auth.token`、主动 disconnect/connect 重建 handshake，以及单飞 refresh 协调。
3. 固定恢复顺序：Socket handshake → Room JOIN → Yjs 恢复 → Awareness → typing → lock。
4. 新增 `YjsRecoveryBridge`，在重连期间冻结 outbound CRDT/awareness，保留同一 Y.Doc，并在服务端 SYNC 后恢复发送。
5. Session revoke/logout 会使 Coordinator 进入 expired 并销毁 Socket；默认不接入现有 legacy `useSocket`，生产 Bridge 仍关闭。

### 修改文件

- `src/auth/socket/socket-state.ts`
- `src/auth/socket/socket-token-provider.ts`
- `src/auth/socket/socket-coordinator.ts`
- `src/auth/socket/index.ts`
- `src/collaboration/yjs/SocketYjsProvider.ts`
- `tests/auth/socket-coordinator.test.ts`
- `tests/collaboration/yjs-auth-recovery.test.ts`
- `package.json`
- `docs/*`

### 数据库变化

无。未新增或修改数据库、migration、Socket/Yjs wire event、CRDT 协议或生产配置。

### 测试结果

- `npm run version:check`：通过（v2.13.18）
- `npm run test:socket-coordinator`：通过
- `npm run test:yjs-auth-recovery`：通过
- `npm run check`：通过
- `npm run build`：通过
- Auth/Socket/Yjs 范围 ESLint：通过

### 风险与下一阶段

1. Coordinator 尚未接入正式 Web 登录或现有 `useSocket`，不会改变生产默认连接。
2. Yjs 恢复仍复用现有 JOIN/SYNC/AWARENESS 事件，没有引入 wire event 或 ACK 协议；正式灰度前需做真实浏览器最终一致验证。
3. 下一阶段建议实施 Bridge Coordinator 的受控接入、连接过期服务端治理、logout/session revoke 主动断开和多标签协调，继续保持 allowlist 与可回滚。

## Phase 2-C3-7-D：Socket Coordinator 受控接入与真实浏览器一致性验证

### 当前版本

`v2.13.19`

### 完成内容

1. 新增 `VITE_XMT_SOCKET_COORDINATOR_ENABLED`，默认 `false`；关闭时完全保留现有 Socket 创建逻辑。
2. 开启且存在 Auth Runtime 时，使用 Runtime Token Provider → Socket Coordinator → Socket.IO；Coordinator 负责临期刷新、更新 handshake token 与重连。
3. 新增 BroadcastChannel 状态信号：`auth_changed`、`token_refreshed`、`logout`，严禁传递 Access/Refresh Token。
4. 新增标准生命周期原因常量和服务端 `auth:lifecycle` 关闭辅助能力：`AUTH_EXPIRED`、`SESSION_REVOKED`、`USER_DISABLED`。
5. 新增 Playwright 浏览器恢复契约，覆盖双标签信号、断线冻结、恢复同步与 logout 同步；本机 Playwright Chrome 无法启动时测试明确跳过并保留原因。

### 修改文件

- `src/auth/socket/socket-tab-coordinator.ts`
- `src/auth/socket/socket-coordinator.ts`
- `src/auth/socket/index.ts`
- `src/hooks/useSocket.ts`
- `api/modules/auth/socket/socket-auth.errors.ts`
- `api/modules/auth/socket/socket-auth.middleware.ts`
- `.env.example`
- `tests/browser/socket-auth-recovery.spec.ts`
- `tests/auth/socket-tab-coordinator.test.ts`
- `package.json`
- `package-lock.json`
- `docs/*`

### 数据库变化

无。未修改数据库、Yjs wire event、CRDT 协议或 legacy 登录行为。

### 测试结果

- `npm run version:check`：通过（v2.13.19）
- `npm run test:auth`：通过
- `npm run test:auth-socket-bridge`：通过
- `npm run test:socket-coordinator`：通过
- `npm run test:yjs-auth-recovery`：通过
- `npm run test:browser-auth-recovery`：浏览器运行环境不可启动，已安全跳过并记录，不伪造通过结果
- `npm run check`：通过
- `npm run build`：待最终提交前复跑

### 风险与下一阶段

1. Coordinator 接入仍由前端开关控制，生产默认关闭；正式 Web 用户和 legacy Socket 未切换。
2. 服务端生命周期辅助函数已提供，但本阶段未将撤销事件全量接入业务流程。
3. 下一阶段建议在具备可运行 Playwright 浏览器的 CI/验收机上完成真实 Socket/Yjs 端到端验证，再考虑 allowlist 灰度。

## Phase 2-C3-8-A：Auth + Socket + Yjs 真实浏览器闭环验证

### 当前版本

`v2.13.20`

### 完成内容

1. 诊断并修复 Playwright 浏览器环境：Playwright 1.60 期望缓存版本与本机缓存不一致，测试改为选择实际可用的 Chromium for Testing。
2. 修复浏览器测试使用 `about:blank` 导致 BroadcastChannel 跨标签不互通的问题，改用同源本地 HTTP fixture。
3. 新增 `tests/browser/auth-socket-yjs-e2e.spec.ts`，真实验证 v1-web 登录、HttpOnly Refresh Cookie、页面刷新恢复、Socket 重握手、Room JOIN、Yjs state vector、Awareness、Lock 和 Logout 同步。
4. 通过真实 Playwright 双页面验证：Access Token 仅在内存，Refresh 后 Socket 重连并恢复 Room/Yjs，多标签只传播 logout 状态信号。

### 修改文件

- `tests/browser/auth-socket-yjs-e2e.spec.ts`
- `tests/browser/socket-auth-recovery.spec.ts`
- `package.json`
- `package-lock.json`
- `docs/*`

### 数据库变化

无。未修改数据库、正式 Login、Yjs wire event 或生产配置。

### 测试结果

- `npm run version:check`：通过（v2.13.20）
- `npm run test:auth`：通过
- `npm run test:auth-socket-bridge`：通过
- `npm run test:socket-coordinator`：通过
- `npm run test:yjs-auth-recovery`：通过
- `npm run test:browser-auth-recovery`：通过
- `npm run test:auth-socket-yjs-e2e`：通过（真实 Chromium）
- `npm run check`：通过
- `npm run build`：通过

### 风险与下一阶段

1. 本阶段验证使用本地临时 Auth/Socket 测试服务器，不代表生产 Socket 已切换。
2. 生产仍保持 legacy，Coordinator 开关和 v1 Socket 继续关闭。
3. 下一阶段建议在 CI 固化 Chromium 版本与 Playwright 浏览器缓存，再进行 allowlist 用户的受控 Socket/Yjs 灰度。

## Phase 2-C3-8-B1：正式 Login 双轨灰度准入设计与实施准备

### 当前版本

`v2.13.21`

### 完成内容

1. 新增 `docs/AUTH_LOGIN_ROLLOUT_POLICY.md`，冻结 disabled、legacy、allowlist、percentage 模式和审批、观察、回滚规则。
2. 新增 `LoginRolloutPolicy`，提供统一入口前的纯准入决策；默认开关 `XMT_LOGIN_ROLLOUT_ENABLED=false`。
3. 强制管理员/director 保持 legacy；percentage 必须额外审批，生产必须显式批准，未批准自动回 legacy。
4. 新增 `tests/auth/login-rollout-policy.test.ts`，覆盖关闭、legacy、allowlist、管理员保护、非名单、percentage 和生产回滚。
5. 未修改 `/api/auth/login`、legacy JWT、数据库、Socket/Yjs 或生产灰度配置。

### 修改文件

- `api/modules/auth/rollout/login-rollout-policy.ts`
- `api/modules/auth/index.ts`
- `tests/auth/login-rollout-policy.test.ts`
- `.env.example`
- `package.json`
- `package-lock.json`
- `docs/AUTH_LOGIN_ROLLOUT_POLICY.md`
- `docs/*`

### 数据库变化

无。

### 测试结果

- Login Policy 专项测试通过；完整 Auth、Socket、Yjs、浏览器回归结果见提交前验证记录。

### 风险与下一阶段

1. Policy 尚未接入正式 `/api/auth/login`，生产行为保持 legacy。
2. 下一阶段应先实现可观测 Login Gateway 适配层，并以专用普通账号 allowlist 做受控演练，禁止自动扩大和 percentage 默认开启。

## Phase 2-C3-8-B2：Login Gateway 双轨接入与内部账号灰度准备

### 当前版本

`v2.13.22`

### 完成内容

1. 新增 `LoginGatewayController` 并接入 `POST /api/auth/login`。
2. Gateway 仅做用户身份预查和 Policy 决策：开关关闭、非名单、admin/director 或 v1 adapter 不可用时，委托原 legacy Controller。
3. allowlist 普通账号命中时，由 v1-web Controller 完成 Session、Refresh Cookie、CSRF、activity_log 和 v1-web 指标；Gateway 不重复计数。
4. legacy 分支继续沿用原 Controller，因此 JWT payload、7 天有效期、中文错误、限流中间件和 activity_log 保持原样。
5. 禁用 percentage 和自动名单扩大；生产默认开关关闭。
6. 新增 Login Gateway 专项测试；既有真实 Chromium Auth/Socket/Yjs 浏览器回归继续通过。

### 修改文件

- `api/modules/auth/rollout/login-gateway.controller.ts`
- `api/routes/auth.ts`
- `api/modules/auth/index.ts`
- `tests/auth/login-gateway.test.ts`
- `package.json`
- `package-lock.json`
- `docs/*`

### 数据库变化

无。

### 测试结果

- `npm run version:check`：通过（v2.13.22）
- `npm run test:login-gateway`：通过
- Auth、Rollout、Socket、Coordinator、Yjs、浏览器恢复、类型检查和构建：通过

### 风险与下一阶段

1. 生产 Flag 默认关闭，生产不会进入 v1-web；本阶段不自动添加 allowlist。
2. v1 分支依赖已有 v1 Auth Web 的 Origin、CSRF、Pepper 与审批配置；缺失 adapter 时安全回退 legacy。
3. 下一阶段建议由已审批的专用 member 测试账号，在固定观察窗口内验证 `/api/auth/login` Gateway 的真实 Cookie、Socket/Yjs 闭环，再决定是否扩大名单。

## Phase 2-C3-8-B3：Production Socket Bridge Controlled Enablement

### 当前版本

`v2.13.23`

### 完成内容

1. 生产 Socket Bridge 从环境硬关闭改为三重门禁：Bridge 开关、独立审批开关、Login allowlist 普通账号。
2. 非名单、admin、director、未审批、禁用 Bridge 或非 allowlist 模式均保留 legacy；v1 Token 不降级为 legacy JWT。
3. `/api/v1/auth-rollout/status` 增加 Socket Bridge 开启、审批、候选名单数量和当前模式。
4. 新增 `auth:production-preflight`，只读检查版本、commit、SQLite、备份、Rollout 与 Socket Bridge。
5. 新增生产 Gate 测试和生产门禁运行文档。

### 数据库变化

无。

### 测试结果

- `test:socket-production-gate` 通过；完整 Auth、Socket、Yjs、类型与构建结果见提交前验证。

### 风险与下一阶段

1. 代码只提供受控开启能力；生产变量仍默认关闭，未创建/启用测试账号，未扩大用户范围。
2. 真实生产灰度前必须确认 v2.13.23 部署、备份、审批、专用 member 账号和观察窗口。
