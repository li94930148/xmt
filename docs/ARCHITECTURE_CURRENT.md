# 当前系统架构

## 文档范围

本文是 Phase 1 只读架构审计结果，依据 2026-07-28 工作区中的 `src/`、`api/`、`shared/`、`scripts/`、`agent/` 及现有架构、数据库、权限和编辑器规范整理。仓库不存在独立的 `database/` 目录，数据库实现实际位于 `api/database/`。

本文只描述当前已实现状态，不代表未来目标已经落地。

## 1. 项目目录结构

```text
xmt/
├── src/                 React Web 前端
│   ├── api/             按业务域封装的请求函数
│   ├── collaboration/   客户端 Socket.IO / Yjs 协作层
│   ├── components/      通用、编辑器、业务组件
│   ├── editor/          编辑器运行时、适配器、状态与遥测
│   ├── hooks/           权限、查询和业务复用逻辑
│   ├── pages/           页面组件
│   └── store/           Zustand 状态
├── api/                 Express API 与 Socket.IO 服务
│   ├── collaboration/   服务端协作、快照、恢复和分析
│   ├── database/        SQLite/libSQL 初始化和访问工具
│   ├── middleware/      认证、权限、限流
│   ├── routes/          API 路由与部分业务逻辑
│   ├── services/        部分复杂业务服务
│   └── utils/           JWT、响应、访问范围等工具
├── shared/              前后端共享类型、时间和工作流规则
├── scripts/             回归、数据核验、迁移和诊断脚本
├── agent/               Electron Creator Agent
├── tests/               少量 Node 级测试
└── docs/                产品、架构、治理和阶段记录
```

当前是前后端同仓、同进程部署的模块化单体。它便于快速交付，但 Web、API、共享契约和桌面 Agent 尚未形成正式工作区包边界。

## 2. 前端架构

### 2.1 技术栈

- React 18、TypeScript、Vite。
- React Router 7 管理 SPA 路由。
- TanStack Query 已在根入口注册，并在部分 hooks 中使用。
- Zustand 管理认证、主题、侧栏、通知，也仍保存选题和消息等服务端数据。
- Tailwind CSS 与 `studio` 组件共同组成当前 UI 基础。
- Tiptap 3、Yjs、y-prosemirror 提供富文本和协作能力。
- Framer Motion 提供部分动效。

### 2.2 路由

`src/App.tsx` 约 239 行，集中负责页面懒加载、主题初始化、身份守卫、权限守卫和全部业务路由。页面已按访问条件分组，但尚无 `src/routes/` 目录或领域路由清单。

主要路由域包括：认证、选题、创作、成片、发布、资源、灵感、日历、消息、工作流、分析、Creator Center、复盘和系统管理。

### 2.3 状态管理

当前状态来源并存：

1. TanStack Query：部分选题和通用 API 查询。
2. Zustand：认证与 UI 状态，同时保存 `topics`、`messages` 等服务端数据副本。
3. 页面本地状态：大量页面自行请求并维护加载、错误和数据状态。
4. Yjs：协作编辑期间的实时文档状态。

这会造成缓存失效、重复请求和“哪一份数据是最新”的判断成本。现状尚未完全落实“TanStack Query 管服务端状态、Zustand 只管客户端状态”的边界。

### 2.4 UI 组件体系

组件存在三层：

1. `components/common/`：表单、弹窗、页面头部、加载和错误状态。
2. `components/studio/`：新视觉体系下的页面壳、卡片、状态标签和交互组件。
3. 业务组件：日报、复盘、社媒分析、工作流和编辑器组件。

当前已有设计规范和复用基础，但 `common`、`studio` 与页面内局部实现仍并存，设计 token 主要依附 Web CSS/Tailwind，尚未成为 Web 与移动端可共享的软件包。

## 3. 后端架构

### 3.1 Express 结构

`api/server.ts` 仅处理环境加载、进程级异常和启动调用；`api/app.ts` 约 588 行，负责：

- Express、中间件与静态资源装配。
- HTTP/HTTPS 服务器创建。
- CORS 和代理信任策略。
- 30 余个路由挂载。
- Socket.IO 认证、房间和协作事件。
- 健康检查、错误和 SPA fallback。
- 数据库初始化、快照清理、备份定时器和优雅退出。

因此真正过重的是 `api/app.ts`，而非 `api/server.ts`。

### 3.2 Middleware

- `authenticate`：解析 Bearer JWT、重新查询用户并验证启用状态。
- `requireRole`：基于用户主角色做粗粒度守卫。
- `requirePermission` / `requireAllPermissions`：查询 RBAC 表并使用 5 分钟内存缓存。
- `rateLimit`：登录、密码和通用 API 限流。

### 3.3 Routes 与 Service

路由按资源拆分，但边界不均衡：`workflow.ts` 超过 800 行，部分路由直接包含校验、权限范围、SQL、业务决策和响应拼装。`services/` 在 Creator、抖音、复盘和工作流决策等复杂领域已形成，但核心内容域仍大量采用路由直连数据库。

现有 API 统一挂载在 `/api/*`，尚无 `/api/v1/*` 版本前缀。响应结构存在 `{ message }`、裸对象及 `{ success, ... }` 等多种形式。

### 3.4 Database 访问方式

数据库使用 `@libsql/client` 访问本地 SQLite 文件。`api/database/utils.ts` 提供 `queryOne`、`queryAll`、`execute`、`executeInsert` 和事务包装，参数绑定较统一。

但这仍是 SQL 工具层，不是 Repository Layer。审计中发现约 60 个路由/服务直接导入数据库工具，业务规则和 SQL 仍高度耦合。

## 4. 数据库分析

### 4.1 当前规模与数据域

`api/database/db.ts` 超过 2200 行，包含约 99 个唯一建表声明，并同时承担初始化、种子和运行时兼容迁移。主要数据域如下：

| 数据域 | 代表表 | 主要关系与数据流 |
|---|---|---|
| 用户权限 | `users`、`roles`、`permissions`、`user_roles`、`role_permissions` | 用户通过角色映射获得权限；`users.role` 仍作为兼容主角色参与判断 |
| 内容生产 | `topics`、`production`、`shooting`、`publishing`、`analytics` | 以 topic 为主轴推进创作、成片、发布和效果分析 |
| 历史版本 | `topic_history`、`production_history`、`approval_records` | 保存选题/创作历史与审批事实 |
| 协作消息 | `comments`、`messages`、`activity_log`、`notification_preferences` | 业务动作产生评论、通知和审计记录 |
| 工作流 | `workflow_templates`、`workflow_nodes`、`workflow_shadow_logs` | 模板定义节点；审批事实与观测日志语义分离 |
| 资源运营 | `resources`、`inspirations`、`calendar_events`、`achievements` | 为内容生产提供素材、灵感、排期和激励 |
| 创作者数据 | `douyin_*`、`creator_*`、`social_*`、`video_*` | Agent/OpenAPI 数据进入快照、内容、指标和分析表 |
| 日报复盘 | `daily_reports*`、`retrospectives`、`retro_*` | 团队日报、指标快照、复盘行动与审计 |
| 系统元数据 | `app_meta` | 保存运行时演进标记 |

### 4.2 主要问题

- 数据关系大量靠应用 SQL 和约定维护，领域边界不够显式。
- 初始化、迁移、种子和兼容修复集中在单一文件，变更审查风险高。
- `editing` 等历史兼容表仍存在，需要继续冻结并观察，而非直接删除。
- 当前没有独立 Repository 接口，SQLite 方言分散在业务层，使 PostgreSQL 迁移成本偏高。
- 数据表规模已显著超过早期文档中的简化清单，数据库文档需持续以代码和真实库核验。

## 5. 权限系统分析

### 5.1 当前角色

- `admin`：全权限和系统治理。
- `director`：内容全流程、分析、模板与抖音运营，不包含核心系统管理。
- `editor`：查看/编辑相关选题、创作和评论协作。
- `member`：创建及参与相关选题、评论和本人任务。

### 5.2 控制方式

权限由四层共同构成：

1. 前端 `ProtectedRoute` 验证登录。
2. 前端 `RoleGuard` 控制页面入口。
3. 后端认证、角色和 `模块:动作` RBAC 权限中间件控制操作。
4. 路由/工具层继续叠加 owner、assignee、topic scope 和 Workflow strict gate。

### 5.3 问题

- `users.role` 与 `user_roles` 双轨并存，主角色与多角色语义需要继续统一。
- 前端守卫只能改善体验，真正安全依赖后端；新接口容易因人工遗漏而缺少权限守卫。
- 权限缓存是单进程内存 Map，多实例部署时失效与更新无法天然同步。
- 数据归属判断分散在路由和工具中，尚未形成可复用、可测试的授权策略层。
- 部分操作同时依赖角色、权限码、数据范围和工作流策略，缺少统一授权决策结果与审计上下文。

## 6. 协作系统分析

### 6.1 Tiptap 与统一入口

`ContentEditor` 是业务编辑器统一入口，底层主线为 Tiptap；`RichTextEditor` 仅作为 legacy 兼容层。业务持久化格式仍为 HTML string。

### 6.2 Yjs 与 Socket.IO

客户端 `SocketYjsProvider` 为每个协作文档创建 Y.Doc，通过 Socket.IO 发送合并后的更新、awareness、typing 和 heartbeat。服务端 `roomManager` 管理房间、在线用户、文档锁和广播，`documentStore` 维护运行时文档状态。

当前所有实时能力共用默认 Socket.IO namespace 和同一服务进程：用户房间、公共通知房间、远程登录会话与文档协作事件都在 `api/app.ts` 装配。

### 6.3 保存与版本机制

当前约定是三源模型：

- Yjs：协作期间的 realtime truth。
- SQLite 业务字段：persistence truth。
- snapshot：recovery truth。

`writeConsistency` 负责 Yjs 与数据库之间的统一写入语义；编辑器 runtime 另包含手动保存、自动保存、离开前持久化与 graceful dispose。`topic_history`、`production_history` 和发布归档承担业务版本/历史记录，协作 snapshot 只用于恢复，不等同于业务版本。

### 6.4 风险

- 协作、在线状态和通知共享默认 namespace，事件治理和扩容边界不清晰。
- Yjs 文档和房间主要保存在单进程内存，横向扩容前必须增加 Redis Adapter 与跨实例文档协调方案。
- snapshot 定时器、清理器和备份任务与 Web 进程绑定，多实例时可能重复执行。
- `api/app.ts` 直接导入前端目录中的协作事件常量，说明共享契约边界尚未完全收敛到 `shared/`。

## 7. Creator Agent 分析

Creator Agent 是独立 Electron + React 桌面应用，使用 Playwright 连接本机浏览器，完成页面发现、数据采集、解析、本地加密存储和上传。当前源码已按 `browser`、`collector`、`contracts`、`crypto`、`database`、`network`、`scheduler`、`uploader` 分层，并有 Windows/macOS 构建配置和跨平台浏览器会话测试。

主要问题：

- `agent/` 同时提交源码和多个 `dist-*` 构建产物，审查噪音和版本漂移风险高。
- Agent 版本带 `-agent` 后缀，与新的纯语义版本规范不一致。
- 采集器以抖音为中心，`parser` 尚未成为清晰的顶层边界。
- Agent 与服务端契约依赖版本化测试和人工同步，尚未由共享 SDK/Schema 自动生成。

## 8. 当前问题列表

### 严重

1. 数据库初始化与迁移集中在超大文件，且核心业务大量直接 SQL，数据库演进和未来迁移风险高。
2. Socket.IO/Yjs 运行时依赖单进程内存，当前结构不能直接安全横向扩容。
3. API 缺少统一 Schema 验证、响应契约和版本前缀，Web 与未来移动端容易产生契约漂移。
4. 当前仅有 7 天 access JWT，无 refresh token、设备会话和服务端撤销能力；退出登录不能使已签发 token 立即失效。

### 中等

1. `api/app.ts` 同时负责应用装配、实时通信、定时任务和生命周期，修改影响面过大。
2. `App.tsx` 集中全部路由，领域页面和权限配置难以独立演进。
3. Zustand、TanStack Query、页面本地请求并存，服务端状态存在多份缓存。
4. RBAC、主角色、数据归属和工作流授权分散，缺少统一策略接口。
5. 结构化日志、requestId 和错误监控尚未落地，主要依赖 `console.*`。
6. 测试以脚本、Node test 和局部契约测试为主，缺少统一 Vitest、Supertest、Testing Library 测试层次。
7. Creator Agent 构建产物与源码混放，且版本契约尚未共享化。

### 轻微

1. `common` 与 `studio` UI 组件体系仍需收敛命名和 token 来源。
2. 部分页面绕过 `src/api/` 直接调用 `fetch`，错误处理和认证头重复。
3. API 响应格式和错误文案不完全一致。
4. 现有文档对数据库表规模和实时协作现状存在滞后，需要持续更新。

## 9. 审计结论

XMT 已不是简单 CRUD 项目，而是具备内容主流程、权限、工作流、协作编辑和创作者数据平台能力的模块化单体。当前最合适的路线不是重写或微服务化，而是在保持业务兼容的前提下，先建立契约、模块、Repository、日志和测试边界，再为多端和横向扩容做准备。
