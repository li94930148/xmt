# XMT 长期架构升级方案

## 1. 目标与原则

目标是将 XMT 演进为支持 Web、Android、iOS 和 Creator Agent 的内容生产操作系统，同时保持当前业务持续可用。

演进原则：

1. 不重写、不删除现有功能、不一次性迁移数据库。
2. 先建立兼容边界，再移动实现。
3. 新接口优先采用新标准，旧接口保持兼容并记录退役条件。
4. 每阶段可独立测试、构建、回滚和发布。
5. 当前模块化单体继续作为主形态，不以拆微服务为目标。

## 2. 目标仓库结构

```text
XMT/
├── web/                       React Web 应用
├── mobile/                    React Native + Expo（Phase 3 后创建）
├── api/
│   ├── app.ts                 创建应用、注册模块
│   ├── server.ts              启动与进程生命周期
│   ├── core/
│   │   ├── config/
│   │   ├── database/
│   │   ├── logger/
│   │   └── middleware/
│   └── modules/
│       ├── auth/
│       ├── topics/
│       ├── production/
│       ├── collaboration/
│       ├── douyin/
│       ├── analytics/
│       ├── notification/
│       └── system/
├── packages/
│   ├── api-client/
│   ├── schemas/
│   ├── auth-sdk/
│   ├── permissions/
│   └── design-tokens/
├── agent/
└── docs/
```

目录移动必须后置。Phase 2 先在现有目录中建立目标边界和兼容导出，验证稳定后再将 `src/` 迁入 `web/`，避免一次性破坏构建和部署。

## 3. 后端模块化方案

每个业务模块建议采用：

```text
modules/topics/
├── index.ts             模块公开入口与路由注册
├── topics.routes.ts     HTTP 路由
├── topics.schema.ts     Zod 请求/响应 Schema
├── topics.service.ts    业务用例
├── topics.repository.ts 数据访问接口与实现
├── topics.policy.ts     权限和数据范围策略
└── topics.types.ts      模块内部类型
```

`api/app.ts` 最终只负责创建 Express 应用、装配 core middleware、注册模块、错误处理和健康检查。HTTP/HTTPS/Socket server、定时任务和信号处理分别进入 server/bootstrap、realtime 和 jobs 边界。

迁移顺序建议：认证 → 选题 → 创作/工作流 → 通知 → 分析/抖音 → 系统模块。每次只迁移一个垂直切片，原路由通过 re-export 或兼容挂载继续工作。

## 4. API 标准化与兼容策略

### 4.1 路径

- 新接口统一为 `/api/v1/*`。
- 当前 `/api/*` 保持可用，并调用同一 service，不复制业务逻辑。
- 每个旧接口登记 owner、调用方、兼容期限和迁移状态。
- 在 Web 和 Agent 全部切换前，不删除旧路径。

### 4.2 Schema 与响应

建立 `packages/schemas`（过渡期可先为 `shared/schema`），使用 Zod 定义请求、响应和错误 Schema。Schema 是 OpenAPI 和 API client 类型的单一来源。

建议统一响应：

```ts
type ApiSuccess<T> = { success: true; data: T; meta?: Record<string, unknown> };
type ApiError = { success: false; error: { code: string; message: string; requestId: string; details?: unknown } };
```

旧接口响应保持原格式；v1 新接口使用统一 envelope。不得为追求统一而一次性改变现有 Web 调用契约。

### 4.3 OpenAPI

由 Zod Schema 生成 OpenAPI 3 文档，并在 `/api/docs` 提供只读 Swagger UI。第一批覆盖登录、用户、选题、创作和数据分析；CI 校验 OpenAPI 生成和破坏性差异。

## 5. 认证体系升级

### 5.1 Token 设计

- Access token：JWT，15 分钟，只携带必要身份声明。
- Refresh token：高熵随机值，30 天；客户端仅保存原值，服务端只保存 hash。
- Web 优先使用 Secure、HttpOnly、SameSite Cookie 保存 refresh token；移动端使用系统安全存储。
- Access token 继续通过 Authorization header 传递。

### 5.2 数据模型

规划新增 `refresh_tokens`：

| 字段 | 建议 |
|---|---|
| `id` | UUID/不可预测标识 |
| `user_id` | 关联用户并建立索引 |
| `token_hash` | 唯一索引，不保存明文 |
| `expire_at` | 过期时间 |
| `device_info` | 设备展示信息，限制长度，不作为可信身份 |
| `created_at` | 创建时间 |

实施时还应评估增加 `revoked_at`、`last_used_at`、`replaced_by_id`，支持轮换、重放检测、单设备退出和全设备退出。该表只在安全设计评审与迁移脚本通过后创建，本阶段不改数据库。

### 5.3 兼容迁移

先新增 `/api/v1/auth/login|refresh|logout|logout-all`，旧登录继续返回当前 7 天 token。Web 切换完成并经过观察窗口后，再缩短旧 token 生命周期；Socket 需要支持 access token 更新和重连。

## 6. Repository Layer 与数据库演进

### 6.1 Repository 边界

首批建立 `UserRepository`、`TopicRepository`、`ProductionRepository` 接口。Service 依赖接口，不依赖 SQLite SQL；SQLite 实现仍复用当前事务工具。

Repository 负责查询、持久化和事务内数据操作，不负责 HTTP、权限提示、通知和业务流程决策。复杂报表可以使用专用 Read Repository，避免强行套用通用 CRUD。

### 6.2 迁移治理

1. 将建表、种子、数据修复和运行时兼容逻辑拆分。
2. 引入只前进、带编号、可审计的迁移文件和迁移表。
3. CI 在临时 SQLite 上执行全量迁移、重复执行检查和 Schema 快照比较。
4. 建立 SQLite/PostgreSQL 方言差异清单：时间、布尔值、自动 ID、JSON、全文检索和 upsert。
5. PostgreSQL 迁移前先完成双环境 Repository 契约测试、数据迁移演练和回滚方案；不做在线直接切库。

## 7. 前端架构规划

### 7.1 路由拆分

建立 `src/routes/`：

```text
routes/
├── auth.tsx
├── production.tsx
├── analytics.tsx
├── system.tsx
└── index.tsx
```

路由定义同时携带权限元数据，菜单与路由尽量消费同一份声明。`App.tsx` 最终只负责 Provider、错误边界和路由入口。

### 7.2 状态边界

- TanStack Query：用户资料、权限、选题、任务、消息、分析等服务端状态。
- Zustand：主题、侧栏、页面临时状态、编辑 UI 和本地交互状态。
- Yjs：协作文档实时状态。
- React Hook/local state：组件生命周期内表单与展示状态。

迁移时先为每个资源定义 query key 和失效策略，再删除对应 Zustand 数据副本。不得先删除旧 store 再补查询层。

### 7.3 API client

`packages/api-client` 提供：

- 统一 base URL、认证头、超时、错误解析和 requestId。
- access token 刷新互斥，防止并发请求重复刷新。
- 由 Schema/OpenAPI 生成或约束的类型化方法。
- Web、Mobile 和 Agent 可注入不同 token storage，不直接依赖浏览器 localStorage。

## 8. 设计系统与移动端准备

建立平台无关的 `packages/design-tokens`，输出颜色语义、字体级别、间距、圆角、阴影和状态色。Web 将 token 映射为 CSS variables/Tailwind；React Native 映射为 TypeScript theme。

本阶段不开发 App。Phase 3 才创建 React Native + Expo 应用，并且只在 API client、认证/权限 SDK、共享 Schema 和 design tokens 稳定后开始。Web 组件不直接共享给移动端，共享的是契约、业务规则、hooks 内核和设计 token。

## 9. Socket.IO 升级规划

目标 namespace：

- `/collaboration`：Yjs 更新、文档锁、快照与冲突。
- `/presence`：在线、输入状态和心跳。
- `/notification`：用户消息、未读数和业务广播。

升级步骤：

1. 先把事件类型从 `src/` 移入共享契约包。
2. 抽出 Socket 鉴权、中间件、namespace 注册和房间策略。
3. 同一进程中启用新 namespace，同时保留默认 namespace 兼容桥。
4. 增加协议版本、payload Zod 校验、事件指标和背压限制。
5. 引入 Redis Adapter 前，定义跨实例文档状态、锁、presence、快照任务和故障恢复语义。
6. 将 snapshot、清理和备份调度迁至带分布式锁的 job runner，避免多实例重复执行。

Redis Adapter 只解决事件广播，不自动解决 Y.Doc 持久状态和任务唯一执行，必须联合设计。

## 10. Creator Agent 规划

保持现有 Electron、Playwright、加密和上传链路，不重写。逐步整理为：

```text
agent/
├── browser/
├── collector/
├── parser/
├── service/
├── desktop/
└── tests/
```

优先事项：移除源码仓库中的可再生构建产物、统一纯语义版本号、复用 `api-client` 和 Schema、保留 Windows/macOS doctor 与浏览器能力测试。任何采集协议变化都需保持旧 Agent 兼容窗口。

## 11. 测试体系

| 层级 | 工具 | 首批覆盖 |
|---|---|---|
| 单元/服务 | Vitest | service、policy、repository 契约、Schema |
| API 集成 | Supertest + 临时 SQLite | 登录、刷新、选题创建、创作保存、权限拒绝 |
| 前端组件 | Testing Library | 登录、权限守卫、编辑器保存状态 |
| E2E | Playwright | 登录 → 创建选题 → 进入创作 → 保存版本；双上下文多人协作 |
| Agent | Node/Vitest + Playwright | 浏览器发现、解析契约、加密上传和跨平台路径 |

现有脚本测试先纳入统一命令，不立即删除。建立测试金字塔后再逐步收敛重复脚本。

## 12. CI/CD

GitHub Actions 目标流水线：install → typecheck → lint → unit/integration test → build → E2E smoke。

并行增加：

- `npm audit` 分级门禁和例外到期机制。
- 数据库从零迁移、升级迁移和重复执行检查。
- OpenAPI 生成与兼容性检查。
- Web 与 Agent 独立构建矩阵。
- 构建产物、版本号和更新文档一致性检查。

部署继续保持单体可回滚发布；数据库变化必须先备份、迁移检查，再切换应用版本。

## 13. 日志与监控

引入 Pino，定义统一字段：`requestId`、`userId`、`module`、`operation`、`error.code`、耗时和环境。HTTP 中间件生成/透传 requestId，API 错误响应返回同一 requestId。

逐步替换业务 `console.*`，但启动期致命错误可保留直接输出。日志禁止记录密码、JWT、refresh token、OAuth token、Cookie 和完整个人敏感信息。

Sentry 分阶段接入 Web、API 和 Agent，上传 source map，并设置环境、版本、用户脱敏和采样策略。关键业务另增加登录失败率、保存失败率、协作重连、快照延迟和采集失败率指标。

## 14. 执行阶段与退出条件

### Phase 1：只读分析（本阶段）

交付当前架构、升级方案和阶段记录；不修改业务代码与数据库。

### Phase 2：后端基础治理

范围：core/modules 边界、首批 `/api/v1`、Zod、OpenAPI、首批 Repository 和结构化日志。

退出条件：旧接口回归通过；首批 v1 接口有 Schema、文档和集成测试；`app.ts` 不再装配业务事件细节；无数据库语义变化。

### Phase 3：多端基础

范围：`api-client`、token 刷新、权限 SDK、design tokens；满足退出条件后才创建 Expo 壳。

退出条件：Web 使用共享 client 完成核心链路；刷新轮换与单/全设备退出测试通过；移动端无需复制业务类型。

### Phase 4：基础设施

范围：Socket namespace、Redis Adapter、job runner、Pino/Sentry 完整接入。

退出条件：双实例协作、presence、通知和故障恢复测试通过；定时任务不会重复执行；可回退单实例模式。

进度：v5.0.0–5.0.1 在 XMT 的 P2-8 中加入可选 Redis Streams adapter，并在本机双 API 进程/隔离 SQLite/临时 Redis 与 sticky-cookie 测试代理中验收协作广播、presence、持久写入及 Redis 中断恢复。v5.0.2 为 Creator Agent 标准同步（schema v1）加入账号级数据库唯一约束，并以双 Node 进程竞态验证互斥、终态重试和释放；忙时使用可重试 503。v5.0.3 修正站内消息实时推送 ID，并在双 API 测试中验收跨实例消息、用户隔离、已读和断线后恢复；Playwright MCP 与 Chrome DevTools MCP 在隔离浏览器/API/Socket.IO 环境验证消息页实时更新及断网重连后从 API 恢复消息和未读数。v6.0.0 新增 SAFE_EXPAND 迁移 024 与共享数据库租约 runner，按数据库时钟原子抢占/续租/释放，过期接管递增 fencing token；双独立 Node 进程验证互斥、超出租期仍持有、主动释放、崩溃过期接管及旧持有者无法续期或释放新租约。该模块尚未注册生产任务；官方导出 schema v2 仍走既有幂等事务，未挂载的旧采集服务不纳入。快照多实例关闭、房间清理本地化、备份在 Web 之外使用共享锁。生产 Caddy/负载均衡、生产 Redis 持久性/HA、具体任务的副作用幂等/取消与崩溃恢复仍未验收。本 Phase 仍未完成，不得据此将整套服务横向扩容。下一本地步骤应盘点可安全迁移的具体任务及副作用契约，再逐项接入；不得直接启动 social ingestion scheduler。

v6.0.0 后续接入审查已完成：房间清理和远程浏览器画面流必须保持实例/会话本地；内存快照在多实例已关闭；备份继续由 systemd/CLI 持有现有文件锁。旧短视频采集计划虽然是唯一发现的业务定时器候选，但其 `social-review` 路由在 `api/app.ts` 明确不挂载，且服务会复用账号持久 Chrome Profile、允许手动与计划入口并行、每次尝试新建采集记录，并在完成后才推进计划时间。因此不应为未挂载的 legacy 服务扩建任务租约。当前代码检索仅发现实例本地协作清理和 API 外备份；下一步应检查已挂载的抖音 OpenAPI / Creator Agent 路径是否有真实共享调度需求。只有产品决定恢复旧路径时，才补账号级跨入口互斥、计划发生幂等键、崩溃记录收敛及租约失效取消语义；未启动调度器，也未更改运行配置。

v6.0.1 完成已挂载抖音路径的并发合同核对：Creator Agent schema v1 由迁移 023 单飞索引保护；schema v2 官方导入在共享数据库事务中按批次 ID 幂等，并新增两独立 Node 进程并发重放测试（含可重试 SQLite 争用）。旧 `/api/douyin/sync*` 当前明确返回 410；Webhook 只验签/去重入库且 worker 无调用，因此没有可安全交给通用租约 runner 的现行周期任务。`npm run test:collaboration-coordination` 与临时 Redis 双 API 集成复验通过；该测试关闭 RDB/AOF，不覆盖故障重启后的 Redis 数据保留。部署目录只有单后端 Caddy 示例，开发机没有 Caddy 可执行文件，安全部署脚本继续硬性限制单 PM2 实例。未改业务运行逻辑或数据库；真实 Caddy 粘性会话、Redis 持久性/HA 与生产代理仍需独立验收。

v6.0.2 扩展本地临时 Redis 双 API 集成测试：AOF 开启且 `appendfsync always`，写入 Socket.IO stream 后重启 Redis，确认 stream 长度持久保留，API 协作随后恢复。该证据仅限隔离测试，不等于生产 Redis 备份、HA 或故障切换验收。部署目录仍只有单后端 Caddy 示例，本机无 Caddy 可执行文件，安全部署仍强制单 PM2 实例；真实代理、粘性会话及生产 Redis 持久性/HA 未验收，Phase 4 未退出。

v6.0.3 在 v6.0.2 的本地 AOF 测试上增加针对测试专用 Redis 子进程的 `SIGKILL`：重启后 Socket.IO stream 长度不变；两个 API 实例在 Redis 中断期间 fail-closed，恢复后继续写入并广播 Yjs 更新。该验收只针对进程级强制终止，不覆盖断电、存储损坏、备份恢复或生产 HA。真实 Caddy/代理仍未验证，安全部署继续强制单 PM2 实例，Phase 4 未退出。

v6.1.0 增加 Pino API logger 与请求完成中间件，输出 requestId、数字 userId、module、路由模板 operation、statusCode、durationMs、error.code 和 environment；不记录请求/响应对象、URL 查询、正文或凭据。活跃 API 的认证、限流、Socket、协作、数据库、消息、日报、工作流和发布日志改为白名单结构字段；移除原始 IP、URL、UA、房间/用户标识、原始异常/SQL 消息，并规范化 Origin/transport。活跃 API 路径无普通 `console.*`，只保留致命配置错误直出；未挂载的 legacy remote-browser/social-review 不改。Creator Agent 2.14.5-agent 将桌面与采集阶段写入本地 NDJSON 白名单日志，不记录账号/设备标识、浏览器路径、URL、worker 原始消息或异常文本。相关字段、敏感信息排除与协作/Agent 回归通过。将 `ip-address@10.5.0` 与 `engine.io@6.6.9` 的生产依赖覆写升级到已修复版本，并把开发树 `brace-expansion` 定点更新至兼容范围的修复版；完整 `npm audit` 清零。Sentry 外部接入仍需 DSN、脱敏/采样政策；Web 浏览器错误采集和生产日志采集/保留容量尚未完成，Phase 4 仍未退出。

v6.1.1 为活跃 Web 诊断增加统一 JSON 控制台 logger，覆盖认证流程、Socket 生命周期、前端 API 错误、错误边界、权限、通知、编辑器和运行环境；事件/字段白名单、原始标识仅保留存在性、错误类别与已知断连原因枚举，避免动态异常消息和堆栈进入诊断输出。该实现不发送外部遥测，不能替代 Sentry，也没有建立生产采集或保留策略；Phase 4 仍未退出。

### Phase 5：数据库演进

范围：Repository 全面覆盖核心域、正式迁移体系和 PostgreSQL 迁移方案/演练。

退出条件：SQLite 与 PostgreSQL Repository 契约测试一致；数据校验、备份、迁移和回滚演练完成；获得单独生产迁移授权。

## 15. 风险与回滚原则

1. API：新旧路由并行，回滚只需让客户端继续使用旧路径。
2. 认证：旧 JWT 在兼容窗口保留，refresh token 功能可通过配置关闭。
3. Repository：保留原 SQL 适配入口，按模块切换，不全局替换。
4. Socket：默认 namespace 与新 namespace 并行观察，Redis 可关闭回到单实例。
5. 前端：路由和 Query 迁移按领域开关或独立提交推进。
6. 数据库：所有 Schema 变化单独阶段、先备份、先演练，不与大规模业务重构同批发布。

## 16. Phase 2 建议起点

下一步不要直接搬目录。建议先提交一份 Phase 2 详细设计，选择认证或选题作为首个垂直切片，明确文件清单、兼容路由、Schema、Repository 接口、测试、版本升级级别和回滚方式，待确认后实施。
