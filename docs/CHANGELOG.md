# XMT 系统更新日志

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
