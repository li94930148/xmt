# Changelog

## 2.20.4 - 2026-08-28

### 修复

- Creator Agent 本地队列使用 canonical JSON TEXT 与严格 SQLite 参数边界，读取时校验 payload SHA-256。
- 旧数据库启动先完成 upload_queue 幂等迁移和就绪检查；同步错误不再向界面暴露 SQL 或驱动参数。

### 版本与兼容性

- XMT 升级至 v2.20.4，Creator Agent 升级至 v2.13.0-agent；未开始 macOS 正式打包、发布或生产同步。

## 2.20.3 - 2026-08-28

### 新增

- Creator Agent 本地解析官方导出 Excel，并通过 schema v2 安全同步标准数据和审计摘要。

### 版本与兼容性

- 新增仅追加的官方导出批次、文件和指标审计表；v1 上传协议与既有 Creator 数据读取路径保持兼容。

## 2.20.2 - 2026-08-27

### 修复

- 恢复此前未进入主线的 Android Native Auth 真实续期调度：V1 登录保留服务端 `expiresIn`，移动登录完成后显式绑定 Token 生命周期。
- refresh 成功后按新生命周期重新调度；JWT `exp` 仅作回退，并补齐前后台、网络恢复、可见性与延迟定时器补偿。
- 增加调度代际保护、single-flight 与真实登录到连续两轮 refresh 的集成合同，防止重复刷新和旧定时器回流。
- 归档 v2.17.2 Socket 业务时段只读观察报告；日报布局代码已由 v2.19.3 合入，不重复迁移旧实现。

### 版本与兼容性

- XMT 与 Android 统一升级至 v2.20.2 / 22002；Creator Agent 保持 v2.12.1-agent。
- 无数据库迁移，不改变 RBAC、Session concurrency、生产端点、Creator 上传协议或 Scrapling Collector 合同。

## 2.20.1 - 2026-08-26

### 修复与验收

- 修复 works SQLite 非标量字段持久化。
- 增加 Creator Collector 无 UI CLI E2E 入口、官方导出观测与连续双导出验收。
- 修复 Collector 未观测账号资料覆盖已有资料；账号元数据现按 observed-only 语义更新。
- 修复 full_snapshot 固定滚动导致历史作品可能漏采，改为带安全上限的耗尽式滚动验收。
- 修复 Creator Agent 发布包缺失 Scrapling Collector runtime；发布版现携带冻结 Worker 并增加 Windows artifact contract。
- 收紧 full_snapshot：耗尽前恢复并验证无约束全量视图，无法确认时 fail closed。
- 恢复 Creator 作品指标容器与别名兼容；未观测指标不再被制造为零值。
- `--exports` 现为每轮两份官方导出的 fail-closed E2E Gate。
- Collector 现严格复用 Agent 所选 Chromium-compatible 浏览器运行时/可执行路径，不再强制 Google Chrome。
- Worker `login_required` 现作为类型化认证失败向 Desktop 传播，UI 与 heartbeat 会立即反映登录失效。

## 2.19.11 - 2026-08-20

### Security

- Creator Agent `/data-sync` 现在永久要求 `protocol_version=1`，签名覆盖 timestamp 与 nonce，并在验签后以原子 nonce 预留拒绝重放。
- 退役未被现行客户端使用的旧 `/api/creator-agent/report` 上传入口，统一返回 410，关闭旧协议旁路。

### Tests

- 新增 Creator Agent 上传防重放安全合同并纳入核心安全 CI。
## 2.19.10 - 2026-08-20

### Security

- Legacy 401 Recovery 使用精确 URL Origin 验证，避免将新 Bearer Token 发送到伪同源、错误端口或 HTTP 地址。
- 角色批量授予和角色权限定义在事务前执行调用者权限上限检查，拒绝自举提权。

### Fixes

- 增加认证 Origin 与角色权限安全回归合同，并纳入核心安全 CI。

## 2.19.9 - 2026-08-20

### Security

- 限制用户角色授予上限，非管理员不能创建或修改为 admin。
- 所有富文本和 Markdown 预览在最终 DOM 渲染前统一净化；畸形 Yjs 更新只拒绝当前消息。
- Douyin Webhook 缺 Secret 或签名非法时一律拒绝；Legacy JWT 固定 HS256。
- 禁用账号吊销 Auth V1 会话并断开该用户实时连接；角色变化也会强制重连。

### Fixes

- Legacy Web 和 Native HTTP 401 复用既有 refresh runtime 后仅重试一次。
- Production build 不再注入 react-dev-locator，新增安全合同进入 CI。

## 2.19.8 - 2026-08-17

### Fixes

- Android Production Build 固定注入 `https://lanyaomedia.com/api` 与 `https://lanyaomedia.com`，不再依赖开发者 shell 或未提交环境文件。
- Native Production 缺失或错误 endpoint 时 fail-closed；移动端 API Health 与认证响应拒绝 HTTP 200 HTML 假成功。
- 新增构建 manifest、Build Output/APK 端点校验，并将正式 Android 产物合同加入 CI。

## 2.19.7 - 2026-08-17

### Fixes

- Android Native Auth 独立调度 access token 临期 refresh，不再依赖默认关闭的 Socket Coordinator。
- 区分终态认证失败与瞬时网络失败：后者保留 Keystore refresh credential，并采用有界重试及生命周期补偿。

## 2.19.6 - 2026-08-14

### Fixes

- Android Capacitor HTTPS localhost Origin 以精确 allowlist 方式进入 CORS 策略；拒绝任意端口、局域网与 lookalike 来源。
- 新增真实 HTTP CORS 合同测试，覆盖 HTTPS localhost 的 GET、OPTIONS、credentials 与恶意 Origin 拒绝。

## 2.19.5 - 2026-08-14

### 新增

- 编辑器生产区新增 Word 式格式刷：单击应用一次，双击可连续应用，支持 Esc 或再次点击退出。
- 格式刷通过 ProseMirror transaction 复制字符样式、颜色、高亮、标题、对齐和首行缩进；不复制链接、批注或业务元数据。

## 2.19.4 - 2026-08-14

### Fixes

- 让公网内部路由检查读取权威运行时环境文件，并为重启后的健康检查提供受限重试，避免健康服务尚未就绪时误判回滚失败。

## 2.19.3 - 2026-08-14

### Fixes

- 修复日报页在 Glass Surface 外观下将表单区块横向挤压为窄列的问题。

## 2.19.2 - 2026-08-13

### 安全

- 统一 `/internal/*` Direct Loopback 边界，拒绝带反向代理转发证据的请求。
- 生产默认绑定 `127.0.0.1`，并建立运行环境文件、运行时回读和公网暴露门禁。

## 2.19.1 - 2026-08-13

### Mobile Auth production gate

- Added an independently approved Android allowlist gate for login, refresh, session and Socket.IO.
- Closed the production generic V1-login fallback when Web V1 is not enabled.

## 2.19.0 - 2026-08-13

### Android 移动办公

- 新增 Capacitor Android 工程、移动底部导航、Safe Area、网络/前后台与返回键适配。
- 增加平台运行时、HTTPS/WSS 端点配置、Android Keystore 刷新凭据存储与 Mobile Auth 合同。

## 2.18.4 - 2026-08-13

### Deployment safety

- Run version consistency validation before the deployment backup restore drill and any service restart.

## 2.18.3 - 2026-08-13

### Deployment safety

- Require an exact target SHA for safe deployment and run the deployment backup restore drill before any service restart.

## 2.18.2 - 2026-08-12

### Operations reliability

- Added a shared backup lock, non-destructive restore drill, and migration rollback-compatibility gate.
- Expanded version consistency checks across runtime, UI, and release documentation.

## 2.18.1 - 2026-08-12

### Security and release reliability

- Enforced resource-scoped Socket.IO collaboration authorization, including a view-only boundary for non-privileged participants.
- Added real Socket.IO/Yjs authorization black-box coverage to the CI security contract.
- Made role/permission updates atomic and aligned the primary role with role mappings.
- Made SQLite deployment backups verifiable and deployment failures roll back the application revision.
- Added explainable Auth readiness decisions: `GO`, `NO-GO`, or `INSUFFICIENT_DATA` with per-check status.

### Database changes

- No schema changes.

## 2.18.0 - 2026-08-12

### 新增

- 建立 React Bits Scene 场景化页面编排体系与页面级视觉应用范围。
- 新增岚曜极光、深空科技、丝绸创意、线性协作、极简无扰、自由搭配六套视觉方案。
- Appearance Center 支持 Scene Preview、配置导入导出、恢复默认与持久化。
- 增加 Persistent-Off、Guard-Only 与关键 Scene 浏览器自动化回归。

### 优化

- 优化 Home、Topics、Daily Report、Creator、Analytics、Workflow、Editor 的视觉表现与响应式体验。
- 完善字号、深浅主题、motionMode 与 Canvas owner/lifecycle 管理。
- Appearance Center 高级设置默认折叠，页面应用范围与设置语义更清晰。

### 修复

- 修复 Silk / React Three Fiber 生命周期兼容与动效关闭后的 Canvas 残留风险。
- 修复 Settings 主题 select accessible name、React Bits locator、A11Y 与视觉裁切问题。

### 技术说明

- Workflow Engine、Backend、API、permissions、Socket.IO、Yjs 与 Database 未修改。

## 2.17.2 - 2026-08-08

### React Bits 认证态兼容测试补充

- 认证态兼容测试统一仅从临时 `XMT_E2E_*` 环境变量读取专用测试账号，不提供明文 fallback。
- 扩展本地 Playwright 验收：登录、双主题、六套预设、字号、三种视口、按钮组合、外观持久化与恢复默认。
- 测试目标强制限制为 `localhost` 或 `127.0.0.1`，避免误连生产环境。

## 2.17.1 - 2026-08-08

### React Bits 浅色主题与字体兼容修复

- 修复 React Bits 按钮在浅色模式下的文字、边框与高光对比；分别适配 primary、secondary、ghost、danger、icon 与 AI 变体。
- 为 SpecularButton 传入主题颜色参数，并修复 GlareHover、ClickSpark 与 Magnet 的尺寸和布局约束。
- 为文本动画增加语义字号与外层裁切安全区；全局字号改为仅作用于业务正文，不再改变 `html` 的 rem 基准。
- 外观中心新增同一草稿配置的深色、浅色真实预览及仅开发环境可见的兼容矩阵。

## 2.17.0 - 2026-08-08

### React Bits 原生动效主题系统

- 建立 React Bits 官方组件来源层、官方来源清单及按需动态加载注册表。
- 新增“外观与动效”中心：六套官方预设、背景/文本/按钮/卡片/内容进入动画自由搭配、实时预览、导入导出及恢复默认。
- 新增浏览器本地外观配置与 reduced-motion、移动端低强度、WebGL 静态 fallback 策略。
- Login、Home 和通用 ActionButton 接入外观槽位；不修改后端 API、数据库、权限、Workflow、Socket.IO 或 Yjs。

## 2.16.1 - 2026-08-07

### 首页驾驶舱视觉增强

- 将 Home 升级为品牌级内容生产驾驶舱，新增融合 Aurora 的 Hero 展示区域与核心指标入口。
- MagicBento 调整为非对称大卡与辅助卡组合，强化内容生产指数、任务、选题、审核、发布、播放和 AI 入口层级。
- 首页关键内容接入 AnimatedContent 进入动画，并启用 MagicBento 的 Spotlight、粒子、倾斜、磁吸和点击反馈。
- 增加 WebGL 与减少动态效果偏好的降级机制，完成 1440 桌面端及 390×844 移动端适配。
- 后端 API、数据库、权限系统、Workflow Engine、Socket.IO 与 Yjs 均保持不变。

## 2.16.0 - 2026-08-06

### React Bits 原生体验升级

- 正式接入 React Bits 官方 TypeScript + Tailwind 组件源码，建立 `src/components/reactbits` 第三方组件层与 `src/components/xmt-ui` 业务适配层。
- Login 接入 Aurora 动态背景，并提供 WebGL 不可用时的静态渐变降级。
- Home 驾驶舱接入 MagicBento，Dashboard 数据展示接入 AnimatedContent。
- Topics 的重点选题接入 SpotlightCard，保留普通高频列表原有展示方式。
- Creator Dashboard 接入 ProfileCard，仅展示已同步的真实账号和内容数据，并适配桌面与移动端布局。
- 后端 API、数据库、权限系统、Workflow Engine、Socket.IO 与 Yjs 均保持不变。

## 2.15.4 - 2026-08-06

### UI 应用补全升级

- 完成 XMT 自研 Design System 与 XMTCard 在 Dashboard、Topics、Workflow 和 Creator 页面中的业务应用；本版本不属于 React Bits 官方组件集成。
- Dashboard 保留 AnimatedNumber 与 ProgressBar，并统一使用 XMTCard 的 hover 交互。
- 不修改 API、数据库、权限系统、Workflow Engine、Socket.IO、Yjs 或 Creator Agent。
## 2.15.3 - 2026-08-05

### React Bits 风格 Design System 基础升级

- 发布日期：2026-08-06；已完成生产环境部署与基础线上验证。

- 建立 XMT Design System，统一颜色、字体、圆角、阴影和动效 token。
- 新增 XMTTheme、XMTCard、AnimatedNumber 与 ProgressBar 基础组件。
- 首页指标接入数字变化动画与完成率进度动画，保留传媒 SaaS 的克制表达。
- 升级页面过渡、空状态、加载状态、弹窗进入动效及侧边栏展开收缩体验。
- 不修改后端 API、数据库、权限系统、Workflow Engine、Socket.IO、Yjs 或 Creator Agent。

## 2.13.17 - 2026-08-01

- 新增 Socket Auth Bridge 模块与 SocketAuthContext Zod 契约。
- 增加 legacy/v1-web 显式认证分支，严格禁止跨模式 fallback。
- Collaboration JOIN 改为使用服务端认证身份覆盖客户端展示身份；预留 Room 权限入口。
- Feature Flag 默认关闭，生产环境硬性保持关闭；Yjs 协议、正式 Login、数据库不变。

## 2.13.16 - 2026-07-31

- 完成 Socket/Yjs 当前认证链路审计与 Auth Bridge 设计。
- 冻结 SocketAuthContext、v1 Access handshake、Refresh 重连和 Room/Yjs 恢复契约。
- 新增断网、多标签、Token 到期、Yjs 最终一致性和回滚测试计划。
- 仅更新设计文档；不修改生产 Socket、Yjs、正式 Login、数据库或灰度配置。

## 2.13.15 - 2026-07-31

- 新增默认关闭、受内网 CIDR 控制的 Auth Prometheus HTTP endpoint。
- Prometheus/OTel 指标增加稳定 instance 标签，并提供 scrape、Collector 与告警规则示例。
- 新增多实例指标治理和正式 Login 迁移设计；active_sessions 不作为全局唯一会话数求和。
- 不修改正式 Login、legacy JWT、Socket/Yjs、数据库或生产用户灰度。

## 2.13.14 - 2026-07-31

- 新增 Auth Metrics Registry、Prometheus Exporter 与厂商无关 OpenTelemetry 适配。
- 增加登录、Refresh、失败、Logout、安全事件、活跃 Session 和 Refresh 耗时生产指标。
- Auth Rollout 诊断增加 Exporter 状态、指标来源、最近事件和最近导出时间。
- 新增生产告警规则基础；不修改 Login、legacy JWT、Socket/Yjs、数据库或生产灰度。

## 2.13.13 - 2026-07-31

- 新增统一 Auth Event、Metrics Service 与 Memory Exporter，指标只从事件事实派生。
- 修复成功登录在不同观测层重复计数；Session 与 Rollout 事件不再重复增加 login 指标。
- Auth Rollout 诊断增加 5 分钟窗口和统一安全事件统计，保留 60 分钟与 24 小时窗口。
- 不修改正式 Login、legacy 行为、Socket/Yjs 或数据库认证结构。

## 2.13.12 - 2026-07-31

- 新增生产 Auth v1-web 独立批准门禁；仅允许批准后的明确用户 ID allowlist。
- 生产 `internal` 与 `percentage` 模式继续强制回落 legacy，未批准配置不会挂载 v1 Auth。
- 不切换正式 Login、管理员账号、Socket/Yjs 或 legacy JWT。
- 无数据库结构变化，生产验证使用三个隔离的普通测试账号。

## 2.13.11 - 2026-07-31

- 新增管理员只读 Auth Rollout 状态诊断，展示当前模式、用户命中规则、指标、风险和配置审计。
- Auth Migration Metrics 增加有界时间事件与 60 分钟/24 小时聚合，不记录 Token。
- 新增 Refresh 失败率、CSRF、Token reuse 和 expired 停止阈值，只生成风险事件，不自动修改配置。
- 新增认证迁移状态管理页与运行手册；正式登录、生产灰度、legacy JWT、Socket/Yjs 和 Caddy 不变。
- 无数据库结构变化，配置审计和运行指标当前为进程内有界记录。

## 2.13.10 - 2026-07-31

- 新增统一 Auth Rollout Config，支持 disabled、legacy、internal、allowlist 和稳定 percentage 分桶。
- 兼容现有 `XMT_AUTH_V1_ENABLED`、`XMT_AUTH_WEB_ENABLED` 与用户 ID allowlist，生产环境继续强制 legacy。
- 新增 Auth Migration Metrics 和不含 Token 的结构化迁移事件，覆盖登录、刷新、CSRF、复用、退出与过期。
- 配置回滚只停止新用户进入 v1-web，保留既有 Session 数据，legacy JWT 继续有效。
- 正式 Login、默认登录流程、Socket/Yjs、Caddy 和生产 v1-web 均未切换。

## 2.13.9 - 2026-07-31

- 新增真实 Chromium Web Auth 暗启契约测试，覆盖冷启动、F5、新标签页、关闭重开、并发 401、失败过期和注销闭环。
- 浏览器验证确认 Access Token 仅存在内存，HttpOnly Refresh Cookie 不可由页面读取，CSRF Cookie 可按契约回传。
- api-client 修复浏览器默认 fetch 调用上下文，并避免已完成刷新后的迟到 401 再次触发刷新。
- legacy 登录、正式 Login 页面、持久 Token、Socket/Yjs、Caddy、生产开关和线上 Cookie 策略不变。

## 2.13.8 - 2026-07-31

- 为显式开启且命中用户 ID 白名单的非生产 v1 Web Auth 增加 HttpOnly Refresh Cookie 与 CSRF HTTP 适配。
- Web login/refresh JSON 不再返回 Refresh Token；refresh 只接受 Cookie，并在成功轮换后覆盖 Cookie。
- Web login 将 session、generation 0 Refresh hash 和登录活动记录纳入同一 SQLite 事务。
- logout 验证 Access/Session/Origin/CSRF 后撤销 session，并以相同 Cookie 范围清除凭据。
- legacy 登录、持久 Token、JWT、Socket、Caddy 和生产开关不变。

## 2.13.7 - 2026-07-31

- 新增未接入现有登录页的 Web Auth Runtime，Access Token 仅保存在内存，并提供认证状态机和刷新单飞能力。
- api-client 增加 `credentials: include`、显式 v1 模式 401 刷新和原请求最多一次重试，并新增 Auth v1 客户端封装。
- 新增未挂载的 Refresh Cookie、CSRF 签名服务、Web Auth 开关与用户 ID allowlist 基础能力。
- legacy 登录、浏览器持久 Token、JWT、Socket、Caddy 和生产 v1 开关均保持不变。

## 2.13.6 - 2026-07-30

- 新增由 `XMT_AUTH_V1_ENABLED` 控制的实验性 `/api/v1/auth/login|refresh|logout|sessions`，默认关闭且生产环境强制不挂载。
- 新增 Auth v1 Zod Schema、标准响应/错误码和 OpenAPI `x-experimental` 标记。
- 新增 HTTP 集成测试，覆盖 token 轮换、复用撤销、session 查询和 logout，并验证 legacy 7 天 JWT 不变。
- 未修改 Login 页面、Cookie、前端 token 存储或 Socket 认证。

## 2.13.5 - 2026-07-30

- 新增未接线的 Session Service 和 Refresh Token Service，支持会话生命周期、256-bit 随机凭据、分版本 HMAC、单次轮换与复用检测。
- 新增 SQLite 原子轮换 Repository，在一个事务内消费旧 token、创建替换记录并更新会话活动。
- 为 Token Service 增加独立 v1 Access Token 方法，旧 `signToken`、`verifyToken`、payload 和 7 天有效期保持不变。
- 新增 Session Service 专项测试；未开放 `/api/v1/auth/*`，未修改前端或 Socket 认证。

## 2.13.4 - 2026-07-30

- 通过正式 migration 新增 `auth_sessions` 与 `auth_refresh_tokens`，包含会话到期、撤销、轮换链及必要索引。
- 新增独立 Session Repository 接口与 SQLite 基础实现，但不接入 Auth Service。
- 新增 migration 专项测试，验证表、字段、索引、外键、幂等执行和既有用户数据完整性。
- legacy `/api/auth/*`、7 天 JWT、前端 token 存储、Socket 认证和生产登录行为保持不变。

## 2.13.3 - 2026-07-30

- 将 legacy `GET /api/auth/me`、`POST /api/auth/change-password` 和 `POST /api/auth/logout` 收口到 Auth Module。
- Controller、Service、Repository 与密码服务分别承担 HTTP、流程、SQLite 和 bcrypt 职责，旧路由只保留模块入口。
- 扩展认证行为冻结测试，覆盖当前用户、禁用账号、修改密码、强制改密标记清除、完整认证链路及退出后 JWT 仍有效。
- 未修改数据库、JWT、权限、Socket、前端 token 存储或 logout 语义，未引入 Refresh Token。

## 2.13.2 - 2026-07-30

- 建立 Auth Repository、Service、Controller、Token、Password 与 Mapper 模块边界。
- legacy `POST /api/auth/login` 改为委托 Auth Module，响应、错误、JWT、日志和限流行为保持不变。
- 新增临时 SQLite 认证冻结测试，覆盖登录、JWT 验证、角色回查以及 logout 不撤销令牌的现状。
- 未修改数据库、权限、Socket、前端登录或 7 天 JWT 有效期，未引入 Refresh Token。

## 2.13.1 - 2026-07-30

- 修复资料库“新增资料”按钮没有交互的问题，补齐创建表单、校验、真实写入和详情跳转。
- 山东地情档案导入增加 UTF-8、BOM、换行、不可见字符、行尾空白和过量空行清洗。
- manifest 同时记录原始与清洗后 SHA256、清洗数量和字符变化，继续支持批次审计、幂等、恢复和回滚。

## 2.13.0 - 2026-07-30

- 创作生产详情新增参考资料模块，支持搜索资料中心、添加关联、查看详情和解除关联。
- 新增生产资料关联 API，复用 `resource_relations` 保存 `production/reference` 关系，不新增业务数据表。
- 生产编辑者可在具备资料查看权限时使用关联能力，普通查看用户只读，资料管理权限保持不变。
- 资料关联操作独立于编辑器正文、版本历史、协作编辑和保存流程，解除关联不会删除原资料。

## 2.12.0 - 2026-07-29

- 建立 `/api/v1/*` 成功、错误、分页、错误码和 HTTP 状态码契约。
- 新增 requestId 生成、透传和响应回写机制，Topic v1 envelope 统一携带 requestId。
- 新增 Zod 驱动的 OpenAPI 3.0.3 文档与 `/api/docs` Swagger UI，首批覆盖四个 Topic v1 接口。
- 新增 `packages/api-client` 基础骨架和 API Contract 临时 SQLite 测试；legacy API 与业务规则保持不变。

## 2.11.0 - 2026-07-29

- 将 Topic 的 Repository、Policy、Service、Controller 与 HTTP 路由抽离到 `api/modules/topics`，旧 `/api/topics` 保持兼容。
- 新增默认关闭的 `/api/v1/topics` 严格 Zod 契约；只有设置 `XMT_TOPICS_V1_ENABLED=true` 才挂载，Web 仍使用旧接口。
- 新增临时 SQLite Topic 专项测试，覆盖 Repository、Service 失败分支及 legacy/v1 API 契约。
- 保持数据库结构、权限判断、状态机、通知、Socket 事件和 history/activity 写入行为不变。

## 2.10.3 - 2026-07-29

- 修复 Creator Agent 未上传粉丝总数的问题，兼容分隔符、万/亿单位、加号和嵌套对象。
- 修复作品主封面在统一载荷裁剪时丢失的问题，并保留有效旧封面。
- 限制全量同步中审计原始响应的上传体积，保留标准化作品和指标，避免代理链路长时间传输后断开。
- 全量同步默认采集全部作品列表并抽取 3 条详情，缩短浏览器采集时间且不影响粉丝、封面和作品指标入库。
- 移除账号健康度模块，将六个指标调整为桌面端两行三列。
- 封面统一使用无 Referer 懒加载和失败占位；官方 API 运营调度继续关闭。

## 2.10.2-storage - 2026-07-24

- Creator 数据查看权限与管理权限分离：具有 `creator:data:view` 的系统角色可查看已完成标准化同步的公开平台账号，管理操作仍仅限 admin、director。
- Creator Agent 抖音驾驶舱、作品库、趋势、同步日志和运营分析查询统一使用公开查看范围；同步、绑定和授权管理继续保留权限隔离。
- 抖音作品库 API 增加 cursor 分页，默认 20 条、最大 100 条，前端按页加载。
- 统一作品封面解析顺序，并为作品库与驾驶舱 TOP5 增加懒加载和失败占位。
- 本阶段不修改数据库结构、不执行生产数据库变更，也不清理历史数据。

## 2.10.2-sync - 2026-07-24

- 服务端按 `contract_version` 分流，支持 v2.10.2 严格 `DouyinWorkInput`，并兼容无版本/v2.10.1 payload。
- 同一作品在单个事务中写入 `creator_content_items` 与 `douyin_works`，通过 `content_id` 关联。
- 同步日志增加契约、采集模式、快照和统计摘要字段；`snapshot_id` 支持幂等提交。
- 历史直接删除逻辑改为只读污染候选报告，本阶段不清理历史数据。

## 2.10.2-agent - 2026-07-24

- Agent 增加安全 JSON 解析、超长 ID 字符串保真、严格作品识别、cursor 分页及 v2.10.2 上传契约。
- 修复编辑器右键菜单定位和 BubbleMenu 互斥问题，保留多人协作光标链路。

## 2.10.1 - 2026-07-24

- 新增标准 `douyin_*` 账号、作品、日快照、作品快照、分析和同步日志模型。
- Creator Center 运营分析与趋势改为读取标准抖音真实表。

## 2.10.0 - 2026-07-23

- Creator Data Center 升级为独立账号数据分析中心，新增数据驾驶舱、作品库、作品复盘、趋势分析、粉丝分析与运营报告。
- 新增数据库规则驱动的 `CreatorAnalyticsService`，提供账号健康度、作品透明评分、评论关键词、流量结构与周期趋势计算。
- 新增日报、周报、月报数据分析报告，以及 `creator:report:view`、`creator:report:manage` 权限。
- 保持 Creator Agent、真实 Chrome CDP、Network Collector、Page Explorer、AES-256-GCM、HMAC-SHA256 与 `/data-sync` 协议不变。

## 2.9.1 - 2026-07-23

### 稳定性与治理

- Agent 新增本地同步任务账本，记录运行、成功、部分成功和失败状态及模块计数。
- 上传层按 `platform_item_id` 增量发送新作品，指标继续按 `snapshot_time` 保存历史。
- 服务端改为模块级独立事务，作品、指标、画像、原始数据或页面知识库单模块失败不再回滚其他模块。
- 原始 API 响应新增 SHA-256 哈希去重与 gzip 压缩，降低长期存储增长。
- Page Explorer 增加响应字段路径提取并同步至 `creator_page_schema` 页面知识库。

### 分析、权限与协作

- 新增 `creator_insights` 与本地规则分析服务，生成日、周、月、作品和粉丝洞察。
- 新增作品详情路由 `/analytics/creator-center/work/:id`，展示基础指标、趋势、标签和表现评级。
- 新增 `creator:data:view`、`creator:data:manage` 及账号授权范围表。
- 远程光标标签支持平滑移动、淡入淡出、最多显示最近活跃三人，其余以头像列表收纳。

## 2.9.0 - 2026-07-23

### Creator Data Center

- 新增平台无关的创作者账号、内容资产、指标快照、趋势、账号经营、粉丝画像和原始 API 数据模型。
- 新增 `POST /api/creator-agent/data-sync`，沿用 AES-256-GCM 加密与 HMAC-SHA256 签名，服务端统一完成身份校验、解密、事务入库、去重和快照创建。
- Creator Agent 上传层将真实采集快照映射为统一协议；保留旧 `/report` 服务端接口用于兼容既有客户端。
- 新增真实 Page Explorer，扫描创作者中心按钮和 Tab，记录点击后新增的 XHR/fetch 到 `page-capability-map.json`。
- 新增 `/analytics/creator-center` 运营数据中心，包含账号驾驶舱、作品库、作品分析、粉丝画像和历史复盘。

### 多人协作编辑

- 远程光标用户名改为编辑区行侧动态标签，不再覆盖正文。
- 标签仅在远程光标活跃时短暂显示，支持多人光标、滚动与窗口尺寸变化，并保持 pointer-events 隔离。
- 保持既有 Yjs 同步、断线重连、版本历史与撤销链路不变。
## 2.20.0 - 2026-08-18

### 新增

- Creator Collector 切换为 Scrapling First 本地 Worker，增加脱敏 XHR 与能力清单。

### 技术升级

- Creator Agent 升级为 2.12.0-agent；移除旧 Node Playwright Collector 和已提交构建产物。
