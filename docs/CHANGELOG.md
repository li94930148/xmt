# XMT 系统更新日志

## v2.13.16 - 2026-07-31

### 新增

- 新增 Socket/Yjs 当前认证审计、Auth Bridge 迁移设计和专项测试计划。

### 优化

- 明确短期 Access Token 刷新后的 Socket 重连、Room 恢复和 Yjs 状态恢复顺序。

### 修复

- 本阶段未修改代码；设计中识别并冻结 collaboration 展示身份与认证身份绑定风险。

### 技术升级

- 定义 `SocketAuthContext` 以及 Legacy → Bridge → v1 Socket 可回滚迁移契约。

### 数据库变化

- 无数据库表、字段、索引或 migration 变化。

### 测试情况

- 完成文档、版本和差异检查；本阶段不运行生产 Socket 变更测试。

## v2.13.15 - 2026-07-31

### 新增

- 新增受内网访问控制的 Auth Prometheus 指标端点。
- 新增 Prometheus、OTel Collector、告警规则配置样例及正式 Login 迁移计划。

### 优化

- 指标增加稳定实例标识，支持多实例定位和聚合治理。
- 明确活跃会话指标的实例语义，避免错误求和。

### 修复

- 无认证业务行为修复；本阶段只建设观测接入与迁移设计。

### 技术升级

- 新增模拟 Prometheus scrape、OTel Collector、告警规则和敏感标签检查的集成测试。

### 数据库变化

- 无数据库表、字段、索引或 migration 变化。

### 测试情况

- 完整验证结果见 `UPGRADE_PROGRESS.md`。

## v2.13.14 - 2026-07-31

### 新增

- 新增 Auth Metrics Registry、Prometheus Exporter 与厂商无关 OpenTelemetry 适配。
- 新增 Refresh 失败率、Token reuse、CSRF 与 Expired 告警规则基础。

### 优化

- 认证指标支持同时分发到 Memory、Prometheus 和 OTel，管理诊断可查看来源、状态及最近导出时间。
- 增加活跃 Session Gauge 与 Refresh 耗时 Histogram。

### 修复

- 多 Exporter 复用同一个 Auth Event 事实，避免因输出目标增加而重复计数。

### 技术升级

- Prometheus 输出标准 Counter、Gauge、Histogram；OTel 适配不绑定具体厂商。

### 数据库变化

- 无数据库表、字段、索引或 migration 变化。

### 测试情况

- 新增 Auth Metrics Exporter 专项测试，完整验证结果见 `UPGRADE_PROGRESS.md`。

## v2.13.13 - 2026-07-31

### 新增

- 新增统一 Auth Event 模型、事件服务、mapper、指标服务与 Memory Exporter。
- 管理诊断新增最近 5 分钟事件统计，并继续提供 60 分钟、24 小时窗口。

### 优化

- 登录、Refresh、Logout、CSRF、Token reuse 和 Session 事件统一由事件事实派生指标，不再按日志行统计。

### 修复

- 修复生产灰度中单次成功认证被不同观测层重复计数的问题。

### 技术升级

- 新增 `AuthMetricsExporter` 的 `increment/observe/gauge` 抽象，为 Prometheus 与 OpenTelemetry 预留适配边界。

### 数据库变化

- 无数据库表、字段、索引或 migration 变化。

### 测试情况

- 新增 Auth Event 与生产灰度回归测试，完整验证结果见 `UPGRADE_PROGRESS.md`。

## v2.13.12 - 2026-07-31

### 新增

- 新增生产 Auth v1-web 独立批准门禁，仅允许经过复核的用户 ID allowlist。

### 优化

- 生产环境仅在 `XMT_AUTH_ROLLOUT_APPROVED=true` 且模式为 `allowlist` 时挂载 v1 Auth；`internal` 与 `percentage` 继续强制回落 legacy。

### 修复

- 无。

### 技术升级

- 增加生产门禁自动测试，覆盖未批准、批准 allowlist、非名单用户及禁止模式。

### 数据库变化

- 无数据库结构变化；生产灰度仅使用既有 Session 与 Refresh Token 表。

### 测试情况

- 本地验证全部通过；三个隔离 member 账号完成约 33 分钟生产灰度，浏览器闭环和 31 个连续健康样本通过，结束后已恢复 legacy。详细结果见 `AUTH_PRODUCTION_GRAY_REPORT.md`。

## v2.13.11 - 2026-07-31

### 新增

- 新增管理员只读认证迁移状态页面，可查看灰度模式、用户准入原因、运行指标、停止风险和配置审计。
- 新增 Auth Rollout Status、时间指标聚合、配置审计、阈值配置和风险判断服务。
- 新增认证灰度运行手册。

### 优化

- 登录、刷新、退出和失败指标支持按最近 60 分钟及 24 小时聚合。
- 停止条件达到阈值后生成只读风险事件，便于人工评估回滚。

### 修复

- 无。

### 技术升级

- 新增标准 `/api/v1/auth-rollout/status` 管理员诊断契约，并同步 OpenAPI。

### 数据库变化

- 无表、字段、索引或 migration 变化；指标和审计当前使用有界进程内记录。

### 测试情况

- 新增治理专项测试，并完成桌面、移动端真实浏览器检查；完整结果见 `UPGRADE_PROGRESS.md`。

## v2.13.10 - 2026-07-31

### 新增

- 新增统一认证灰度配置，支持关闭、旧认证、内部账号、白名单和稳定比例五种模式。
- 新增认证迁移指标与结构化事件，为后续灰度判断和问题回滚提供观测依据。

### 优化

- 现有双开关与用户 ID 白名单自动映射到新配置，避免升级时改变原有暗启范围。
- 同一用户使用稳定哈希分桶，多次登录和多实例判断结果保持一致。

### 修复

- 无。

### 技术升级

- 认证事件统一携带 requestId、可用时的 userId、认证模式和结果，禁止记录 Token 原文。

### 数据库变化

- 无表、字段、索引、migration 或业务数据变化。

### 测试情况

- 新增灰度治理专项测试，并完成 legacy Auth、Web Runtime、Cookie、API Contract、类型检查、范围 lint 与生产构建验证。

## v2.13.9 - 2026-07-31

### 新增

- 新增 Web Auth 真实浏览器暗启夹具与自动化契约测试。

### 优化

- 并发请求共享单次刷新；已获得新 Token 后到达的旧 401 直接使用新 Token 重试。

### 修复

- 修复 api-client 默认 fetch 在真实浏览器中失去调用上下文的问题。
- Refresh 失败时 Runtime 同步清除内存 Token 与用户状态并进入 expired。

### 技术升级

- 覆盖 F5、新标签页、关闭重开、Cookie 恢复、Refresh 失败、重放、CSRF、注销和 Feature Flag 门禁。

### 数据库变化

- 无表、字段、索引、migration 或生产数据变化；测试使用临时 SQLite。

### 测试情况

- 浏览器契约使用本机无界面 Chrome 执行；全量验证结果详见 `UPGRADE_PROGRESS.md`。

## v2.13.8 - 2026-07-31

### 新增

- 新增 v1 Web Auth 的 HttpOnly Refresh Cookie、Origin 与 CSRF HTTP 适配。
- 新增 Web 登录原子事务 Repository 和 Cookie 专项集成测试。

### 优化

- Web login/refresh 响应不再包含 Refresh Token 原文，refresh 只接受 Cookie 并在轮换后覆盖新 Cookie。
- Web logout 在 Access/Session 与 CSRF 验证后撤销当前会话并清除 Refresh/CSRF Cookie。

### 修复

- 无。

### 技术升级

- OpenAPI 与 Auth v1 Client 同步 Web Cookie 契约；专项测试覆盖 Cookie 属性、body 降级拒绝、CSRF、轮换、重放、退出和事务回滚。

### 数据库变化

- 无表、字段、索引或 migration 变化；只将现有三类登录写入纳入单一事务。

### 测试情况

- Auth、Session、v1、Web Runtime、Web Cookie、API Contract、类型检查、Auth 范围 lint、版本检查和生产构建按要求执行；详见 `UPGRADE_PROGRESS.md`。

## v2.13.7 - 2026-07-31

### 新增

- 新增未接入登录页面的 Web Auth Runtime、内存 Access Token Store 和认证状态机。
- 新增 Auth v1 客户端封装、Refresh Cookie 配置、CSRF 签名服务及用户 ID 白名单解析能力。

### 优化

- api-client 支持携带 Cookie、显式 v1 模式下单飞刷新，并将 401 原请求重试限制为一次。
- Web Auth 独立开关默认关闭，生产环境强制不可启用，只有白名单用户具备未来测试资格。

### 修复

- 无。

### 技术升级

- 新增 Web Auth Runtime 专项测试，覆盖模式、内存 Token、刷新单飞、401 重试上限、过期状态、Cookie、CSRF 和白名单。

### 数据库变化

- 无。未新增表、字段、索引、migration 或业务数据。

### 测试情况

- 版本、Auth 全链路、Web Runtime、API Contract、类型检查、Auth 范围 lint 和生产构建按要求执行；详细结果见 `UPGRADE_PROGRESS.md`。

## v2.13.6 - 2026-07-30

### 新增

- 新增默认关闭的实验性 Auth v1 登录、刷新、退出和会话查询接口。
- 新增 Auth v1 请求、响应与会话 Zod Schema，并加入 OpenAPI 实验标记。

### 优化

- v1 Auth 响应统一使用 success/data/meta/requestId 契约及稳定认证错误码。
- Feature Flag 在生产环境强制关闭，避免实验性 Refresh Token 响应体交付触达生产用户。

### 修复

- 无。

### 技术升级

- 新增 Auth v1 HTTP 集成测试，覆盖开关关闭、登录、刷新、复用检测、退出、会话列表及 legacy 登录兼容。

### 数据库变化

- 无新增表、字段、索引或 migration；继续复用现有认证会话基础表。

### 测试情况

- Auth v1、legacy Auth、Session migration/Service、API Contract、类型检查、Auth 范围 lint、版本检查和生产构建均按要求执行；详细结果见 `UPGRADE_PROGRESS.md`。

## v2.13.5 - 2026-07-30

### 新增

- 新增 Session Service，提供会话创建、状态判断、单会话撤销和用户全部会话撤销基础能力。
- 新增 Refresh Token 内核，提供安全随机值、分版本 HMAC hash、单次轮换和复用检测。
- 新增独立 v1 Access Token 创建与验证方法，支持完整会话声明。

### 优化

- Refresh Token 轮换在一个 SQLite 写事务内完成旧记录校验、消费、替换记录创建和会话活动更新。

### 修复

- 无。

### 技术升级

- 新增 Auth Session Service 专项测试，覆盖会话、token hash、单次消费、替换链、复用检测和 legacy JWT 隔离。
- 新内核未接入 Auth Service、路由、前端或 Socket。

### 数据库变化

- 无新增表或字段；继续使用 v2.13.4 已创建的 `auth_sessions` 与 `auth_refresh_tokens`。

### 测试情况

- Session migration、Session Service、legacy Auth、Topic、API Contract、类型检查、Auth 范围 lint、版本检查和生产构建均按要求执行；详细结果见 `UPGRADE_PROGRESS.md`。

## v2.13.4 - 2026-07-30

### 新增

- 新增认证会话与 Refresh Token 轮换记录的数据库基础表。
- 新增 Session Repository 基础接口和 SQLite 实现，为后续认证升级提供隔离的数据访问层。

### 优化

- 将 Auth Session 数据库变化纳入正式 migration 机制，支持事务执行、幂等检查和迁移状态记录。

### 修复

- 无。

### 技术升级

- 新增会话 migration 专项测试，校验表、字段、索引、外键和既有用户数据完整性。
- legacy `/api/auth/*`、JWT、前端和 Socket 认证行为保持不变。

### 数据库变化

- 新增 `auth_sessions` 表及用户、绝对到期、空闲到期索引。
- 新增 `auth_refresh_tokens` 表及 token hash 唯一索引、session generation 唯一索引和查询/清理索引。
- 未修改 `users` 或其他已有表结构与数据。

### 测试情况

- Session migration 专项测试、Auth 行为冻结测试、Topic 测试、API Contract 测试、类型检查、定向 lint、版本检查和生产构建均按本阶段要求执行；详细结果见 `UPGRADE_PROGRESS.md`。

## v2.13.3 - 2026-07-30

### 新增

- 新增当前用户、修改密码和退出登录的认证行为冻结测试。

### 优化

- 完成认证模块第一阶段收口，统一登录、当前用户、修改密码和退出登录的内部处理边界。

### 修复

- 无。

### 技术升级

- 认证接口统一通过 Route、Controller、Service 和 Repository 分层处理。
- 旧接口路径、返回格式、错误消息和中间件顺序保持不变。

### 数据库变化

- 无。未新增或修改任何表、字段、索引、数据和迁移脚本。

### 测试情况

- Auth 行为冻结测试、Topic 测试、API Contract 测试、类型检查、Auth 范围 lint、版本一致性检查和生产构建均已执行；详细结果见 `UPGRADE_PROGRESS.md`。
