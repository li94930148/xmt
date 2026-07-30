# 当前认证体系分析

## 文档边界

本文记录 2026-07-29 仓库代码中的真实认证行为，作为 Phase 2-C1 设计基线。本文只做审计，不改变登录、权限、JWT、Socket、数据库或前端行为。

容易混淆的事实：当前 legacy 登录入口实际是 `POST /api/auth/login`，并不存在 `POST /api/login`。后续文档均以真实路径为准。

## 1. 登录流程

### 1.1 数据流

```text
Login.tsx 收集 username/password/remember
  -> src/api/auth.ts: login()
  -> POST /api/auth/login
  -> loginIpLimiter + loginAccountLimiter
  -> api/routes/auth.ts 查询 users
  -> enabled 检查
  -> bcrypt.compare() 验证密码
  -> api/utils/jwt.ts: signToken()
  -> 写入 activity_log(login)
  -> 返回 legacy user/token/forceChangePassword
  -> Zustand 保存 user/token
  -> 后续 HTTP 请求携带 Authorization: Bearer <token>
```

### 1.2 后端处理

- 路由挂载：`api/app.ts` 将 `api/routes/auth.ts` 挂载到 `/api/auth`。
- 登录函数：`api/routes/auth.ts` 中的 `router.post('/login', ...)`。
- 限流：先按 IP、再按规范化用户名摘要限流；成功请求不计入账号失败次数。
- 用户查询：直接通过 `api/database/utils.ts` 查询 `users.username`。
- 状态判断：密码校验前先判断 `enabled === 1`。
- 密码校验：使用 `bcrypt.compare()` 比较明文密码和数据库密码哈希。
- 令牌签发：`signToken({ userId, username, role })`。
- 审计：登录成功后向 `activity_log` 写入 `action = login`。
- 返回值：legacy 裸对象，包含 `user`、`token`、`forceChangePassword`，不使用 Phase 2-B v1 envelope。

### 1.3 后续 HTTP 认证

`api/middleware/auth.ts` 的 `authenticate`：

1. 从 `Authorization: Bearer <token>` 读取 JWT。
2. 调用 `verifyToken()` 验证签名和有效期。
3. 使用 payload 中的 `userId` 重新查询 `users`。
4. 再次检查用户存在且 `enabled === 1`。
5. 使用数据库当前值填充 `req.user`，包括当前 `role`，而不是直接信任 JWT 内角色。

因此，账号禁用和角色修改会在下一次 HTTP 请求时生效；已建立的 Socket 连接不在这条检查链路中。

### 1.4 密码修改与退出

- `POST /api/auth/change-password`：校验旧密码、新密码至少 6 位，使用 bcrypt 重新哈希，清除 `force_change_password`，并写入 `activity_log`。
- 修改密码不会撤销已签发 JWT。
- `POST /api/auth/logout`：只返回成功消息，不记录或撤销服务端令牌。
- Web 当前退出按钮不调用该接口，只清理 Zustand 和浏览器存储后跳转登录页。

## 2. JWT 设计

| 项目 | 当前实现 |
|---|---|
| 类型 | 自包含 Bearer JWT，作为单一 access token 使用 |
| 库 | `jsonwebtoken` |
| 密钥 | 环境变量 `JWT_SECRET`；缺失时服务启动退出 |
| payload | `userId`、`username`、`role`，以及库生成的 `iat`、`exp` |
| 有效期 | 固定 `7d` |
| 签名算法 | 未在调用处显式指定，由当前库默认值决定 |
| issuer / audience | 未设置 |
| jti / session id | 不存在 |
| token type / version | 不存在 |
| 刷新机制 | 不存在 |
| 服务端会话 | 不存在 |
| 主动撤销 | 不存在 |
| 密钥轮换 | 未设计 |

`role` 虽然进入 JWT，但 HTTP 与 Socket 握手都会查询数据库并使用当前数据库角色。JWT 中的 `username` 和 `role` 主要是冗余声明，不能视为权限事实来源。

## 3. 用户状态

### 3.1 users 表相关字段

当前认证直接依赖：

- `id`：JWT 用户标识和请求身份主键。
- `username`：唯一登录名。
- `password`：bcrypt 密码哈希。
- `email`、`name`：登录响应中的用户资料。
- `role`：单值 legacy 角色字段，默认 `member`。
- `enabled`：账号启停开关；登录、HTTP 认证和新 Socket 握手均检查。
- `force_change_password`：运行时兼容字段；首次或管理员重置后的强制改密标记。
- `created_at`、`updated_at`：用户记录时间。

当前没有登录失败计数、锁定截止时间、密码更新时间、会话版本或 token 撤销时间等认证字段。

### 3.2 角色与权限关系

系统同时存在两条角色事实：

1. `users.role`：登录响应、`req.user.role`、`requireRole`、Socket 管理员房间判断使用。
2. `roles`、`permissions`、`role_permissions`、`user_roles`：`requirePermission` 查询使用。

用户创建和修改角色时，`api/routes/users.ts` 会在事务中同步 `users.role` 与 `user_roles`。权限查询有进程内 5 分钟缓存；管理员在 `requirePermission` 中有直接放行逻辑。Auth 模块化不得改变这套双轨结果或缓存语义。

### 3.3 状态变更生效范围

- 禁用用户：后续 HTTP 请求和新 Socket 握手会失败。
- 修改角色：后续 HTTP 请求和新 Socket 握手使用数据库新角色。
- 已连接 Socket：连接建立后不持续回查用户状态；禁用、角色变化或退出不会自动断开现有连接。
- 修改密码：现有 JWT 和现有 Socket 不失效。

## 4. 前端 Token 管理

### 4.1 保存位置

`src/store/index.ts` 使用 Zustand 管理认证状态：

- 勾选“记住登录”时，`xmt_user` 与 `xmt_token` 保存到 `localStorage`。
- 未勾选时保存到 `sessionStorage`。
- 启动时优先读取 `sessionStorage`，再读取 `localStorage`。
- access token 始终可被页面 JavaScript 读取。

### 4.2 请求附加方式

当前没有统一 api-client 全量接管：

- `src/api/auth.ts` 等 API 文件从 store 获取 token，并手工设置 Bearer header。
- `packages/api-client` 已有 `getAccessToken`、401 后刷新回调和单实例并发互斥骨架，但 Web 尚未切换，也没有实际 refresh API。
- `src/utils/apiInterceptor.ts` 提供全局请求拦截辅助，但认证请求和各业务 API 仍保留历史实现。

### 4.3 失效处理

- `ProtectedRoute` 只判断本地是否存在 token，不预先验证过期时间。
- `Layout` 启动后调用 `GET /api/auth/me`；失败则清理本地状态并返回登录页。
- 各 API 的 401 处理尚未完全统一。
- 没有静默刷新、跨标签刷新协调或统一重试队列。

### 4.4 记住密码

`src/utils/rememberedCredentials.ts` 优先尝试浏览器 Credential Management API；回退方案会：

1. 用 AES-GCM 加密密码。
2. 将密码密文保存到 localStorage。
3. 将对应 AES 密钥也保存到同一 localStorage。

该方案只能降低随手查看明文的概率，不能抵御 XSS、恶意扩展或本机存储读取，因为密文和解密材料位于同一信任边界。它与 token 持久化是两件事，但都扩大了浏览器侧凭据暴露面。

### 4.5 退出流程

UI 的退出流程仅执行 store `logout()`：删除 localStorage/sessionStorage 中的用户和 token、清空状态、跳转登录页。服务端 JWT 仍可使用至 7 天有效期结束。

## 5. Socket 认证

### 5.1 连接阶段

服务端 `api/app.ts` 的 `io.use`：

1. 优先从 `socket.handshake.auth.token` 读取 token，也兼容 Authorization header。
2. 调用与 HTTP 相同的 `verifyToken()`。
3. 查询 `users`，检查存在且启用。
4. 用数据库当前用户信息写入 `socket.data.user`。
5. 连接后加入 `user_<id>`；admin/director 加入管理房间。

认证只发生在握手阶段。连接存活期间没有 token 到期复检、session 撤销订阅或角色重载。

### 5.2 客户端连接与重连

`src/hooks/useSocket.ts` 维护全局 Socket 单例，以用户 ID 和 token 为身份键：

- 创建连接时通过 `auth: { token }` 发送 JWT。
- Socket.IO 启用自动重连，当前最多尝试 5 次。
- token 变化时会断开旧实例并创建新实例。
- 本地退出后会断开连接。

这为未来 access token 刷新后的重新握手提供了基础，但目前不存在刷新流程，也没有“先暂停业务事件、恢复全部房间、同步完成后再继续”的统一协调器。

### 5.3 协作与 Yjs

协作 provider 在 Socket `connect` 后重新发送协作房间 JOIN，并通过状态同步恢复文档。当前 Y.Doc 生命周期独立于一次短暂断线，因此普通重连可保留本地状态；但未来主动换 token 时仍需验证：

- 重连期间未确认更新不丢失、不重复。
- 协作房间、awareness、typing、锁状态正确恢复。
- 身份切换不会复用前一用户的连接或文档上下文。

## 6. 当前问题

以下分级描述风险和设计优先级，不代表本阶段修改范围。

### 6.1 严重

1. **记住密码的密文与密钥同存 localStorage。** 一旦同源脚本或本地存储被读取，攻击者可恢复真实密码；密码的复用影响还可能超出 XMT。
2. **7 天 Bearer JWT 无服务端撤销。** token 泄露、用户退出或密码修改后，令牌仍可使用到自然过期；只能通过禁用账号或更换全局密钥间接阻断。
3. **现有 Socket 不响应账号禁用和会话退出。** 已建立连接持有握手时身份，可能继续收发允许的实时事件，直至断线或服务端重启。

### 6.2 中等

1. JWT 未显式约束算法、issuer、audience、jti、token type/version，不利于未来多客户端、密钥轮换和 access/refresh 类型隔离。
2. 没有设备会话、刷新链、最近使用时间和主动撤销记录，无法回答“哪些设备在线”或只退出某一设备。
3. 登录限流使用进程内状态；多实例部署、进程重启或代理 IP 配置不当时，防护效果会变化。
4. 权限同时依赖 `users.role` 与 RBAC 表，权限缓存又有最长约 5 分钟窗口；模块化时若误选单一来源，可能改变现有权限结果。
5. API 文件分散管理 Bearer token 和 401，未来刷新容易出现并发重复刷新、循环重试和不同页面行为不一致。
6. Socket 没有长连接认证续期和会话级强制断开机制。

### 6.3 轻微

1. legacy 认证成功和错误响应不符合 Phase 2-B v1 envelope，requestId 的客户端消费方式不统一。
2. JWT payload 携带 `username`、`role`，但服务端又回查数据库，增加了声明漂移和误用可能。
3. Web 退出未调用现有 logout 接口，虽然该接口当前也不会撤销 token，但流程语义不完整。
4. 认证事件主要复用通用 `activity_log`，尚未形成设备、会话、刷新复用和异常登录的结构化审计模型。

## 7. 现状冻结结论

进入 Auth 实施前，必须冻结并用测试记录以下行为：

- legacy `POST /api/auth/login` 的状态码、消息和响应字段。
- disabled、错误密码、限流、强制改密的当前结果。
- `authenticate` 对用户存在、enabled 和当前数据库角色的回查。
- `users.role`、RBAC 表及权限缓存的当前关系。
- legacy logout、改密后旧 JWT 仍有效的现状。
- Socket 握手 token 来源、用户回查、房间加入和重连行为。

这些行为中的安全缺口应通过后续显式迁移阶段治理，不能在“只做模块拆分”的提交中被顺手改变。
