# Phase 2 Auth 模块化与 Refresh Token 设计

## 1. 文档状态与约束

本文是 Phase 2-C1 设计产物，不代表功能已经实现。

本阶段不创建目录、不修改代码、不创建 `refresh_tokens` 表、不运行迁移、不改变 7 天 JWT、不改变 legacy 登录/权限/Socket/前端流程。当前产品版本保持 `v2.12.0`。

设计原则：

1. legacy `POST /api/auth/login` 保持现状，新能力只进入 `/api/v1/auth/*`。
2. 先建立模块边界和行为冻结测试，再引入持久化会话。
3. Access Token 短期、Refresh Token 可轮换且可撤销。
4. 服务端只保存 Refresh Token 哈希，客户端只持有原值。
5. Web 与 Mobile 使用不同安全存储，但共享 api-client 调用语义。
6. 任何权限、账号状态或 Socket 行为变化都必须独立评审。

## 2. 目标架构

```text
Web / Expo
   -> /api/v1/auth/*
   -> auth.routes.ts
   -> auth.controller.ts
   -> auth.service.ts
      -> auth.policy.ts
      -> token.service.ts
      -> session.service.ts
      -> auth.repository.ts
   -> SQLite repository implementation（实施阶段再确定文件）
```

规划目录：

```text
api/modules/auth/
├── index.ts
├── auth.routes.ts
├── auth.controller.ts
├── auth.service.ts
├── auth.repository.ts
├── auth.schema.ts
├── auth.policy.ts
├── token.service.ts
└── session.service.ts
```

### 2.1 文件职责

| 文件 | 责任 | 禁止承担 |
|---|---|---|
| `index.ts` | 组装 repository/service/controller/router，对外导出模块入口 | 业务判断、SQL |
| `auth.routes.ts` | 注册 v1 路由、认证中间件、限流器和 Schema 校验 | 密码验证、token 生成 |
| `auth.controller.ts` | HTTP 参数与 cookie/header 适配，调用 Service，返回 Phase 2-B envelope | SQL、权限与会话流程 |
| `auth.service.ts` | 登录、刷新、退出、全部退出、会话列表的业务编排与事务边界 | `req`、`res`、HTTP 状态码、SQL |
| `auth.repository.ts` | 定义用户认证查询、refresh session 增删改查、撤销和审计接口 | JWT、HTTP、前端存储判断 |
| `auth.schema.ts` | v1 请求、响应和内部 DTO 的 Zod Schema | legacy 请求收紧 |
| `auth.policy.ts` | 账号可登录、可刷新、可查看/撤销会话等策略；首阶段复刻当前 enabled 结果 | 重构 RBAC 或改变角色模型 |
| `token.service.ts` | access JWT 签发/验证；refresh 随机值、哈希、有效期与声明规则 | 数据库访问、HTTP cookie |
| `session.service.ts` | refresh token 轮换、复用检测、单会话/全会话撤销、设备元数据处理 | 直接读取 `req` 或返回 HTTP 响应 |

SQLite 实施时应增加独立的 repository 实现文件，即使首版目录清单未列出，也不能让 Service 直接依赖 `api/database/utils.ts`。

### 2.2 业务边界

- Auth 负责“你是谁、会话是否有效、如何签发和撤销令牌”。
- `middleware/authenticate` 负责把已认证身份适配到 HTTP 请求。
- RBAC 继续由现有 permissions 中间件负责；Auth 不重写权限模型。
- User 模块负责用户资料、启停、角色维护；这些操作触发会话撤销属于后续明确集成点。
- Socket 只消费 Auth 产生的可验证 access token，并在重新握手时使用当前用户/会话状态。

## 3. Token 模型

### 3.1 Access Token

用途：短期访问 HTTP API 和建立 Socket 连接。

建议设计：

- JWT，有效期目标值 15 分钟；最终数值须结合部署时钟、移动网络和业务操作时长评审。
- payload 最小化：`sub`（user id）、`sid`（session id）、`type=access`、`iat`、`exp`、`jti`、`iss`、`aud`。
- 不把 `username`、`role` 当作授权事实；权限和账号状态仍按既定策略读取当前服务端事实。
- 显式固定允许的签名算法、issuer、audience，并支持按 key id 轮换密钥。
- 不持久化 access token 本体；依靠短生命周期降低泄露窗口。

迁移期必须继续验证旧 payload 和 7 天有效期 token，新旧验证器应通过 token version/claims 明确分流，不能用模糊异常回退。

### 3.2 Refresh Token

用途：在不重新输入密码的情况下换取新的 access token。

建议设计：

- 使用 CSPRNG 生成至少 256 bit 的不可预测随机值，不使用 JWT。
- 原值只发送给客户端一次；不得写入数据库、日志、错误、分析事件或 URL。
- 服务端保存确定性哈希。建议使用带独立服务端 pepper 的 HMAC-SHA-256，以降低数据库单独泄露时的离线利用价值；pepper 进入密钥管理，不进入数据库。
- 每次成功刷新都轮换原值，旧 token 立即标记已撤销，并保留替换关系用于重放检测。
- 建议绝对有效期 30 天，并另设不活跃过期策略；最终数值需要安全与产品共同确认。
- Refresh Token 绑定用户、会话/设备和客户端通道，不承载权限。

### 3.3 Access 与 Refresh 的关系

```text
一个设备会话（sid）
  └── 一条 refresh 轮换链
       ├── refresh A（已替换）
       ├── refresh B（已替换）
       └── refresh C（当前有效）

每次刷新产生新的短期 access JWT，JWT 的 sid 指向该设备会话。
```

## 4. 数据模型设计

本节只定义候选模型，不创建表。

### 4.1 refresh_tokens

| 字段 | 建议类型/约束 | 用途 |
|---|---|---|
| `id` | UUID/ULID 或稳定不可猜标识，主键 | refresh 记录和 access `sid` 的关联基础；若一条记录代表一次轮换，另需稳定 session/family 标识 |
| `user_id` | users 外键，非空 | 所属用户 |
| `token_hash` | 固定长度二进制或字符串，唯一、非空 | 原始 refresh token 的 HMAC/哈希，用于精确查找 |
| `expire_at` | UTC 时间，非空 | 绝对过期时间 |
| `device_info` | 最小化 JSON/Text | 展示平台、设备名称、客户端版本等；不可作为可信认证因素 |
| `created_at` | UTC 时间，非空 | 签发时间 |
| `revoked_at` | UTC 时间，可空 | 主动撤销、轮换或安全事件失效时间 |
| `last_used_at` | UTC 时间，可空 | 最近一次成功刷新时间 |
| `replaced_by_id` | 自关联，可空 | 指向下一枚 refresh token，形成轮换链和复用证据 |

### 4.2 必须在迁移评审中补齐的语义

仅有上述字段时，`id` 同时承担 token 记录和稳定设备会话标识会产生歧义。实施前必须二选一并固定：

1. 增加稳定的 `session_id`/`family_id`，每次轮换新增 token 记录；这是推荐方案。
2. 每个设备只保留一行并覆盖 hash；实现简单，但无法完整保留替换链，不满足强复用检测。

推荐新增稳定 family/session 标识，并规划索引：

- `UNIQUE(token_hash)`。
- `(user_id, revoked_at, expire_at)` 支持会话列表和全部撤销。
- `(session_id, created_at)` 支持轮换链审计。
- `replaced_by_id` 自关联索引。

外键删除策略、时间格式、SQLite 并发事务和历史保留期限必须在数据库迁移设计中单独确认，不在本阶段落地。

### 4.3 device_info

建议仅保存：客户端通道（web/ios/android）、用户自定义或规范化设备名、OS、应用版本、浏览器大类、首次 IP 摘要/最近 IP 摘要。要求：

- User-Agent 和 IP 只能用于展示与风险信号，不能作为 token 验证的硬绑定依据。
- IP 应按隐私政策最小化或截断，并定义保留期。
- 客户端提供的设备名不可信，输出前必须转义和限长。

## 5. Token 轮换流程

### 5.1 登录

```text
验证账号密码与 enabled
  -> 创建稳定设备会话/family
  -> 生成 access token
  -> 生成 refresh token 原值
  -> 保存 refresh token hash 与设备信息
  -> 写登录/会话审计
  -> 事务提交
  -> 按 Web/Mobile 通道安全交付 token
```

密码检查、enabled 结果、强制改密和权限行为在兼容阶段必须保持现状。

### 5.2 正常刷新

必须在一个数据库事务中：

1. 接收 refresh 原值，计算 hash。
2. 查询并锁定/原子占用对应记录。
3. 校验未过期、未撤销、用户存在且 enabled、会话仍有效。
4. 生成新的 refresh 原值和 hash。
5. 将旧记录标记 `revoked_at`、`last_used_at`，写入 `replaced_by_id`。
6. 创建同一 family 下的新记录。
7. 写刷新审计并提交。
8. 返回新 access token，并通过对应通道交付新 refresh token。

只有事务成功后才能向客户端交付新 token。客户端网络中断可能造成“服务端已轮换、客户端未收到”的可恢复性问题，需用明确重新登录提示处理，不能让旧 token 长期保持有效。

### 5.3 重放检测

如果提交的 token 已被替换/撤销且属于轮换链：

1. 视为可能的 refresh token 复用。
2. 原子撤销该 family 当前及后续有效 token。
3. 记录高优先级安全事件，不记录 token 原文。
4. 返回统一 `REFRESH_TOKEN_REUSED`，客户端清空认证状态并要求重新登录。
5. 可按风险策略通知用户或管理员。

同一用户多设备使用不同 family，单个 family 的复用默认不应退出其他可信设备；若命中高风险策略，可升级为全部会话撤销。

### 5.4 并发刷新

`packages/api-client` 当前互斥只覆盖单个 ApiAuth 实例，不能覆盖多个标签页或多个进程。未来需要：

- 单页面内继续使用 promise mutex，最多重试原请求一次。
- Web 跨标签页使用 Web Locks 或 BroadcastChannel 协调刷新结果。
- 服务端以事务和唯一约束保证只有一个轮换成功。
- 不把普通并发和攻击静默混同；如果采用极短的幂等恢复窗口，必须完成威胁评审且不得再次使用旧 token 生成多个链分支。

## 6. API v1 契约设计

所有响应遵守 `docs/API_CONTRACT.md`：成功 `{ success: true, data, meta? }`，失败 `{ success: false, error: { code, message, requestId, details? } }`。认证响应应设置 `Cache-Control: no-store`。

### 6.1 POST /api/v1/auth/login

请求：

```json
{
  "username": "alice",
  "password": "******",
  "device": {
    "name": "Alice 的 Mac",
    "platform": "web",
    "appVersion": "2.13.0"
  }
}
```

成功 `200`：

```json
{
  "success": true,
  "data": {
    "user": { "id": 1, "username": "alice", "name": "Alice", "role": "member", "forceChangePassword": false },
    "accessToken": "<access-token>",
    "expiresIn": 900,
    "session": { "id": "<session-id>", "current": true }
  }
}
```

Web 的 refresh token 只通过 `Set-Cookie` 返回，不进入 JSON。Mobile 是否在 JSON 返回 refresh token，必须通过受控客户端通道设计确认，不能只信任请求体里的 `platform=mobile`。

### 6.2 POST /api/v1/auth/refresh

- Web：无业务请求体，从受限 cookie 读取 refresh token。
- Mobile：从 api-client 的安全 token provider 提供 refresh token；最终承载位置需在移动端实现评审中冻结。
- 成功 `200`：返回新的 `accessToken`、`expiresIn`、session 摘要；Web 同时轮换 cookie，Mobile 返回新的 refresh 原值。
- 失败不得回退到旧 access token，也不得无限循环重试。

### 6.3 POST /api/v1/auth/logout

- 需要当前 refresh 会话身份。
- 撤销当前 family/session，写审计。
- Web 清除 refresh cookie；Mobile 收到成功后清除 SecureStore。
- 幂等：已撤销会话再次退出仍可返回成功，但必须避免泄露会话是否属于他人。

### 6.4 POST /api/v1/auth/logout-all

- 需要有效用户身份，敏感场景可要求重新验证密码。
- 撤销该用户所有 refresh family，包括当前会话。
- 返回撤销会话数量；Web 清 cookie。
- 未来应联动断开该用户的 Socket 连接。

### 6.5 GET /api/v1/auth/sessions

返回当前用户未删除的设备会话摘要：session id、设备名称、平台、创建时间、最近使用时间、到期时间、当前会话标记、撤销状态。永不返回 token hash、替换链内部 id、完整 IP 或 User-Agent。

后续可增加 `DELETE /api/v1/auth/sessions/:id`，但不在本阶段要求的五个入口中。

### 6.6 错误码建议

| code | HTTP | 场景 |
|---|---:|---|
| `VALIDATION_ERROR` | 400 | v1 Schema 校验失败 |
| `INVALID_CREDENTIALS` | 401 | 用户名或密码不正确；避免枚举账号 |
| `ACCOUNT_DISABLED` | 403 | 保持当前产品是否显式提示禁用，实施前需兼容评审 |
| `AUTH_REQUIRED` | 401 | 缺少有效 access 身份 |
| `REFRESH_TOKEN_INVALID` | 401 | refresh 缺失、格式错误或未知 |
| `REFRESH_TOKEN_EXPIRED` | 401 | refresh 已过期 |
| `REFRESH_TOKEN_REVOKED` | 401 | 会话已撤销 |
| `REFRESH_TOKEN_REUSED` | 401 | 检测到轮换链复用并已撤销 family |
| `SESSION_NOT_FOUND` | 404 | 用户管理指定会话但不存在 |
| `RATE_LIMITED` | 429 | 登录或刷新限流 |
| `INTERNAL_ERROR` | 500 | 未预期错误 |

这些 auth 专用 code 目前不在 Phase 2-B 公共枚举中。实施前必须先更新 Schema/OpenAPI，再启用接口；不得以自由字符串绕过契约。

## 7. Web 兼容方案

### 7.1 目标存储

- Refresh Token：`HttpOnly; Secure; SameSite=Lax/Strict` cookie，限定最窄 Domain/Path，优先使用 `__Host-` 前缀；生产环境只允许 HTTPS。
- Access Token：优先仅保存在内存中，页面刷新时通过 refresh cookie 换取；不再长期保存 localStorage。
- 用户展示资料可缓存，但不得被当作认证依据。
- 登录和刷新响应 `no-store`。

cookie 建议路径为 `/api/v1/auth`，使其不会附带到普通业务请求。若部署需要跨站 cookie，必须另做 CORS、SameSite=None、Secure 和 CSRF 威胁评审。

### 7.2 CSRF 与 XSS

- HttpOnly 防止 JavaScript 读取 refresh 原值，但不能单独防止 XSS 代发请求。
- SameSite 只是纵深防御；refresh/logout 等 cookie 认证接口还应校验 Origin/Referer，并按部署形态采用 CSRF token 或等价机制。
- CORS 必须使用显式 origin allowlist 和 `credentials: true`，不能与通配符组合。
- 当前记住密码 fallback 应在独立安全迁移中移除；不能把 refresh token 放入相同 localStorage 方案。

### 7.3 兼容阶段

1. 旧 `/api/auth/login`、7 天 JWT、前端存储全部不变。
2. 新 `/api/v1/auth/*` 默认关闭，仅契约和测试可见。
3. Web 通过单点 api-client 开关试用 v1；失败可回到 legacy 登录页。
4. 观察刷新、跨标签、退出和 Socket 后再扩大用户范围。
5. legacy 只在观测窗口、回滚演练和用户迁移完成后标记 deprecated；本阶段不删除。

## 8. React Native + Expo 兼容方案

- Refresh Token 保存到 Expo SecureStore；不得保存到 AsyncStorage、日志、崩溃报告或深链。
- Access Token 仅保存在应用内存；冷启动时从 SecureStore 读取 refresh token 并刷新。
- 设备被恢复/迁移、卸载重装、系统生物识别设置变化都可能导致安全存储不可用，客户端必须回到可理解的重新登录流程。
- api-client 对上层暴露统一 `getAccessToken()`、`refreshAccessToken()`、`logout()`；Web adapter 使用 cookie，Mobile adapter 使用 SecureStore。
- App 进入前台、收到 401、网络恢复时可以触发刷新，但必须复用同一互斥队列且最多重试一次。
- 设备名称和 platform 只是展示元数据，服务端不能据此信任“这是官方 App”。若 Mobile 需要响应体交付 refresh token，应另行设计可验证客户端通道、证书绑定或应用证明能力。

## 9. Socket 认证与协作恢复设计

### 9.1 token 更新

当前 Socket.IO 在握手阶段读取 access token，未来短期 JWT 不能在现有连接上无限使用。推荐流程：

```text
HTTP access token 即将过期/收到可刷新 401
  -> api-client 单次刷新
  -> 发布 tokenUpdated(newToken)
  -> Socket coordinator 暂停新的业务发送
  -> 更新 socket.auth.token
  -> 主动断开并重新连接
  -> 服务端重新验证 access + user + session
  -> 重入用户/公共/协作房间
  -> Yjs 状态向量同步 + awareness 重发
  -> 恢复业务发送
```

不要尝试在原连接上只替换客户端变量而跳过服务端握手。

### 9.2 房间恢复

- 系统房间 `user_<id>` 和管理房间由服务端连接逻辑重建。
- 客户端显式加入的公共房间由 Socket coordinator 保存订阅清单并幂等恢复。
- 协作房间继续由 provider 的 `connect -> JOIN` 恢复，但需加入“同步完成”门闩。
- awareness、typing 等短暂状态应重新发布，不应持久化为文档更新。

### 9.3 Yjs 状态

- token 重连不得销毁当前 Y.Doc。
- 重连期间本地编辑继续进入 Yjs 本地更新队列；连接恢复后通过状态向量同步补齐。
- 服务端 JOIN/SYNC 和 update handler 必须支持幂等，避免重复更新产生业务副作用。
- 身份真正切换（用户 A 退出、用户 B 登录）必须销毁前一用户 provider/Y.Doc 上下文，不能按普通 token 刷新处理。

### 9.4 撤销与长连接

要实现立即退出，需要服务端建立 `session_id/user_id -> socket ids` 的可查询映射。logout、logout-all、账号禁用和 refresh reuse 事件发布后，服务端断开目标连接。多实例部署时该映射和事件需通过共享基础设施传播；单进程内存映射只能作为首阶段能力，不能被描述为集群级保证。

## 10. 安全设计

### 10.1 token 泄露

- 全链路 TLS，生产启用 HSTS。
- refresh cookie 使用 HttpOnly/Secure/SameSite/最窄 Path。
- access 短时、refresh 只存 hash、响应 no-store。
- 日志中屏蔽 Authorization、Cookie、token query/body 和哈希。
- 明确密钥轮换、泄露应急和全会话撤销手册。

### 10.2 refresh 重放

- 每次使用即轮换。
- 原子更新与唯一约束阻止并发双成功。
- 保留替换关系；旧 token 再出现时撤销整条 family。
- 安全事件包含 requestId、user/session、时间、IP/UA 摘要和处置结果，不含凭据。

### 10.3 暴力登录

- 保持现有 IP + 账号双限流语义，未来将存储切换为共享后端以支持多实例。
- 账号维度使用不可逆摘要，避免在限流日志暴露用户名。
- 对错误响应做账号枚举评审；连续异常可增加渐进延迟、验证码或管理员告警。
- 信任代理配置必须与真实部署拓扑一起验证，防止伪造 IP。

### 10.4 多设备登录与设备管理

- 每台设备独立 session/family，可单独撤销。
- sessions API 显示最近活动和当前会话，但设备指纹不作为硬认证。
- 设置合理的单用户活跃会话上限；超限策略应明确提示，不静默踢出。
- 密码修改、账号禁用、管理员重置和高风险事件的撤销范围需产品/安全确认。

### 10.5 异常登录与风控接口

规划内部风险信号：新设备、新地区/异常 IP、短时多地、refresh reuse、大量失败、禁用账号尝试。首阶段仅记录和告警，不自动改变权限。

可规划只读/处置接口：

- 用户端：查看会话、撤销指定会话、全部退出。
- 管理端：查看用户认证事件、撤销用户会话；必须接入现有明确权限点，不用 `role` 临时判断。
- 系统端：接收账号禁用、密码修改、安全事件并执行撤销。

任何风控自动阻断都应单独立项，包含误报、申诉和回滚设计。

## 11. 迁移方案

### 11.1 分阶段计划

| 阶段 | 主要动作 | 风险 | 回滚 |
|---|---|---|---|
| C1 设计 | 现状审计、契约和安全设计 | 文档与代码理解偏差 | 评审修订文档，无运行影响 |
| C2 模块边界 | 建立 Auth Module，legacy 委托新 Service，行为冻结测试 | 重构改变错误、限流或审计顺序 | 路由开关切回原 handler；无 DB 变更 |
| C3 会话存储 | 经审批创建 refresh/session 数据模型和 repository | SQLite 事务、索引、迁移失败 | 迁移前备份；新表不被 legacy 使用；关闭新功能 |
| C4 v1 暗启 | 实现 v1 login/refresh/logout/sessions，默认关闭 | 契约、cookie、轮换并发错误 | 关闭 v1 auth 开关，legacy 不变 |
| C5 Web 灰度 | api-client 单点接入，内存 access + cookie refresh | 跨标签、CSRF、刷新风暴、用户掉线 | 用户级/环境级开关退回 legacy，清理新 cookie |
| C6 Socket 协同 | token 更新重连、房间/Yjs 恢复、撤销断连 | 协作丢更新、重复事件、房间未恢复 | 关闭短 token Socket 协同，灰度用户退回 legacy |
| C7 Mobile | Expo SecureStore adapter、冷启动刷新、设备会话 | 安全存储丢失、后台网络、交付通道错误 | 禁用 Mobile refresh，要求重新登录；不影响 Web |
| C8 弃用 | 标记并最终停用 legacy | 遗留客户端仍使用旧接口 | 延长兼容窗口；停用必须有调用量为零证据 |

### 11.2 兼容要求

- 新旧令牌在迁移窗口内有显式验证分支。
- legacy 用户不被强制退出；旧 token 自然过期前保持当前行为，除非发生原有账号禁用。
- v1 失败不能自动把 refresh token 发送给 legacy 接口。
- 新会话表不能成为旧权限逻辑的隐式依赖。
- 每阶段都要有独立开关、指标、审计和回滚演练。

### 11.3 实施门禁

进入编码前必须确认：

1. `session_id/family_id` 的数据语义与 SQLite 事务方案。
2. access/refresh 有效期、不活跃过期和会话上限。
3. Web 正式域名、HTTPS、反向代理、cookie Path/SameSite 与 CORS allowlist。
4. Mobile refresh token 的可信交付通道。
5. JWT signing key 与 refresh hash pepper 的生成、保存和轮换责任。
6. 密码修改、账号禁用、角色变化分别撤销哪些会话。
7. v1 错误码加入公共 Schema/OpenAPI。
8. login/refresh/logout 的限流与安全事件保留策略。
9. Socket/Yjs 重连验收清单和丢包测试环境。
10. legacy 调用量观测和功能开关回滚路径。

## 12. 测试方案

### 12.1 Unit

- Token Service：access claims、算法/issuer/audience、过期、错误类型、随机值长度、hash 确定性和密钥隔离。
- Session Service：正常轮换、过期、撤销、替换链、复用检测、family 撤销、用户禁用。
- Policy：逐项复刻当前 enabled 与权限结果。
- Schema：未知字段、边界长度、设备字段转义和错误 envelope。

### 12.2 Integration

- login：成功、错误密码、未知用户、禁用、强制改密、限流、审计。
- refresh：成功轮换、旧 token 失效、事务回滚、并发只成功一次。
- logout：当前会话撤销、幂等、cookie 清除。
- logout-all：多设备全部撤销，其他用户不受影响。
- sessions：只返回当前用户且不泄露 hash/IP 原值。
- legacy 回归：原路径、状态、响应、7 天 JWT 和权限结果不变。

所有数据库测试必须使用临时 SQLite 数据库，不连接生产。

### 12.3 Security

- refresh token reuse/replay，验证 family 撤销和告警。
- token/hash/cookie 不进入日志、URL、错误 details。
- CSRF：跨站 refresh/logout 被拒绝，合法同源可用。
- XSS 风险：Web JavaScript 无法读取 HttpOnly refresh cookie。
- JWT algorithm confusion、issuer/audience 错误、access/refresh 类型混用被拒绝。
- IP/账号限流在共享存储和代理配置下有效。
- 用户枚举、会话越权撤销、device_info 注入。

### 12.4 E2E

- Web：登录、页面刷新、access 静默刷新、退出、重新登录。
- 多标签：同时 401 只形成一条有效轮换链，所有标签获得一致结果。
- 多设备：退出单设备不影响其他设备；logout-all 全部失效。
- Mobile：首次登录、冷启动、前后台切换、SecureStore 丢失后的重新登录。
- Socket/Yjs：编辑中刷新 token，自动重连、恢复房间、无丢失/重复更新；退出后连接立即失效。

## 13. 可观测性与上线指标

上线前定义但不记录敏感 token：

- 登录成功/失败/限流率。
- refresh 成功率、错误码分布、延迟、并发冲突率。
- reuse 检测次数和 family 撤销次数。
- 活跃会话数、单用户设备数、logout/logout-all 成功率。
- access 401 后刷新成功率、重新登录率、刷新循环保护触发数。
- Socket token 重连成功率、房间恢复耗时、协作重同步失败率。

所有事件携带 requestId 和内部 session id；禁止携带 access token、refresh 原值、密码、cookie 或完整 Authorization header。

## 14. 安全依据

- [RFC 9700：OAuth 2.0 Security Best Current Practice](https://www.rfc-editor.org/rfc/rfc9700.html)：refresh token 应保密存储；公共客户端应使用发送者约束或轮换检测重放；安全事件可触发撤销。
- [OWASP Session Management Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html)：会话标识需要足够熵、TLS 保护、安全 cookie 属性和完整生命周期管理。
- [OWASP HTML5 Security Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/HTML5_Security_Cheat_Sheet.html)：不应把会话标识存入可被 JavaScript 读取的 localStorage。
- [OWASP CSRF Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html)：SameSite 是纵深防御，不能替代适合部署形态的 CSRF 防护。
- [Expo SecureStore 文档](https://docs.expo.dev/versions/latest/sdk/securestore/)：移动端敏感键值应使用平台安全存储，并处理存储不可用或失效场景。

## 15. Phase 2-C1 结论

当前系统适合先做兼容式 Auth 模块拆分，不适合直接把 legacy 登录改成 refresh token。推荐下一阶段是 C2：只建立模块边界、repository/service/controller 和行为冻结测试，不增加表、不缩短 JWT、不切换 Web。Refresh Token 数据库迁移应在 C2 验证完成并通过上述实施门禁后单独进行。
