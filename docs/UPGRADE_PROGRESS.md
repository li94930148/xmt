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

### 风险与回滚

1. 任一批准条件缺失即回落 legacy。
2. 生产禁止 `internal` 与 `percentage`。
3. 异常时将模式切回 legacy、关闭批准开关并重启；不删除会话和审计记录。
