# Phase 2-C3-1 Auth Session / Refresh Token 架构设计

## 文档边界

本文是 XMT Phase 2-C3-1 的设计产物，基于当前 `v2.13.3` 认证实现，定义未来 Session + Refresh Token 的目标模型、API 契约、安全机制、迁移与回滚边界。

本阶段只设计，不创建表、不编写 migration、不修改 JWT、接口、前端存储、Socket 或任何业务代码。文中所有目标参数和表结构只有在后续实施任务单独评审、迁移、测试和灰度后才可生效。legacy `/api/auth/*` 的生产行为继续冻结。

实施状态补充：Phase 2-C3-2 已在 `v2.13.4` 按本文设计落地 `auth_sessions`、`auth_refresh_tokens`、指定索引和未接入业务的 Session Repository 基础层。Token 签发、刷新、JWT、前端、Socket 和 `/api/v1/auth/*` 仍未实施。

运行时状态补充：Phase 2-C3-3 已在 `v2.13.5` 实现未接线的 Session Service、Refresh Token Service、原子轮换 Repository 和 v1 Access Token 独立方法。上述能力只由专项测试调用，legacy、公开 API、前端和 Socket 仍未接入。

## 设计结论

选择 **`auth_sessions` 作为稳定会话主模型，并以 `auth_refresh_tokens` 作为单次轮换凭据子表**：一条 `auth_sessions` 代表一次登录形成的设备会话，一条 `auth_refresh_tokens` 只代表该会话轮换链中的一枚 Refresh Token。

不选择单表 `refresh_tokens` 作为完整会话模型，因为轮换凭据不是稳定的会话实体；不选择 `device_sessions` 作为主模型，因为设备名称、平台和指纹只能作为风险与展示元数据，不能成为可信认证因子。该双层模型可以同时支持原子轮换、重放检测、多设备列表、单会话退出、全部退出和审计，且不会把设备识别与认证边界混在一起。

---

## 一、当前认证模型总结

当前认证链路已经在 Phase 2-C2.5 完成模块化收口，但行为仍是 legacy 模型：

1. `POST /api/auth/login` 校验用户、`enabled` 和 bcrypt 密码后，签发固定 7 天 JWT。
2. JWT payload 包含 `userId`、`username`、`role`，没有 `sid`、`jti`、`type`、`issuer` 或 `audience`。
3. HTTP middleware 每次使用 JWT 中的 `userId` 重新查询 `users`，以数据库当前 `enabled` 和 `role` 为准。
4. 系统没有 Refresh Token、Session、设备会话、轮换链或服务端撤销记录。
5. `POST /api/auth/logout` 只返回成功；不会撤销 JWT。修改密码也不会使既有 JWT 失效。
6. Web 把 JWT 保存到 localStorage 或 sessionStorage，所有页面脚本均可读取。
7. Socket 只在握手阶段验证 JWT 和用户状态；连接建立后不会持续检查过期、禁用、角色变化或退出事件。
8. legacy `/api/auth/*` 使用现有裸响应和中文错误，不遵守 v1 envelope。

本设计不回写或“顺手修复”这些行为。未来 v1 与 legacy 必须在灰度期并行，旧客户端完成迁移前不得改变 legacy 契约。

## 二、未来认证目标架构

目标链路：

```text
Web / Mobile
  -> POST /api/v1/auth/login
  -> Auth Controller（HTTP、Cookie、envelope）
  -> Auth Service（登录流程）
  -> Session Service（创建、轮换、撤销、重放处置）
  -> Token Service（短期 Access JWT + 高熵 Refresh 原值）
  -> Auth Repository
  -> auth_sessions + auth_refresh_tokens + activity_log

业务 API / Socket
  -> 验证 Access JWT 签名、iss、aud、type、exp
  -> 使用 sid 检查 auth_sessions 是否有效
  -> 重新查询 users，检查 enabled 并取得当前 role/RBAC 事实
```

目标属性：

- Access Token 为短期 Bearer JWT，建议初始有效期 15 分钟，只用于访问 API 和 Socket 握手。
- Refresh Token 为至少 256 bit CSPRNG 生成的无意义 opaque 值，只使用一次；服务端只保存带独立 pepper 的 HMAC-SHA-256 摘要。
- 每次刷新都在同一数据库事务中消费旧 token、签发新 token 并连接轮换链。
- Access JWT 增加 `sub`、`sid`、`jti`、`type=access`、`iss`、`aud`、`iat`、`exp`；具体切换只能发生在未来 v1 实施阶段，不能影响 legacy JWT。
- v1 授权仍重新查询用户和现有权限事实，不把 JWT 中的角色当作最终权限来源。
- Session 建议绝对有效期 30 天、空闲有效期 7 天；Access 15 分钟。参数必须配置化并在实施前通过产品与安全评审。
- 认证响应统一 `Cache-Control: no-store`，日志、审计、错误和指标中不得出现密码、Access Token、Refresh Token、Cookie 或完整 Authorization header。

## 三、Session 模型设计

### 3.1 三种候选模型评估

| 候选 | 优点 | 主要问题 | 结论 |
| --- | --- | --- | --- |
| `refresh_tokens` 单表 | 最少表、可以快速实现刷新 | token 每次轮换，无法自然表达稳定会话；设备列表、单会话退出、会话级审计和轮换链会挤在一张表；容易把 token 行误当 session | 不选作完整模型 |
| `auth_sessions` 主表 | 认证语义明确；稳定承载登录实例、撤销、有效期和风险元数据；适合 session 列表和 Socket 关联 | 仍需子表记录每一枚可轮换凭据，否则难以检测旧 token 复用 | **选择为主模型** |
| `device_sessions` 主表 | 产品界面容易表达“设备管理” | 设备 ID、名称、UA、IP 都可能伪造或变化；一台设备可能有多个浏览器/账号；名称容易让实现错误地信任设备指纹 | 不选；设备仅作 session 元数据 |

### 3.2 选择理由

安全边界是“某用户的一次登录会话”，不是“某一枚 token”，也不是“某台可被可靠识别的设备”。因此：

- `auth_sessions.id` 是稳定安全边界，进入 Access JWT 的 `sid`，用于单会话撤销和 Socket 定位。
- `auth_refresh_tokens.session_id` 把一组轮换记录归入同一会话；旧 token 的使用可以定位并撤销整个 session。
- `client_type`、`device_name`、UA 摘要、App 版本和经过最小化处理的网络信息只帮助用户识别会话与安全审计，不授予信任。
- 不单独创建 `device_sessions`，避免设备与会话一对一的错误假设。未来若需要可信设备能力，应另建经过验证的设备凭据模型，而不是复用认证 session。

### 3.3 会话生命周期

```text
ACTIVE
  -> IDLE_EXPIRED       空闲超时
  -> ABSOLUTE_EXPIRED   绝对超时
  -> REVOKED            单设备退出、全部退出、密码/账号安全事件
  -> COMPROMISED        Refresh Token 重放
```

数据库无需保存可漂移的 `status` 字符串；状态由 `revoked_at/revoke_reason` 和两个到期时间推导。任何终态都不可恢复，重新登录必须创建新 session。

## 四、Refresh Token 模型设计

1. Refresh Token 使用 CSPRNG 生成 32 字节随机值，以 base64url 交付，不包含 user、session 或权限信息。
2. 原值只在签发响应中出现一次；数据库保存 `HMAC-SHA-256(pepper, token)`，不保存明文。pepper 由密钥管理配置提供，与数据库分离并支持版本化。
3. 每枚 token 只允许成功使用一次。使用后写入 `used_at` 并由 `replaced_by_id` 指向下一枚 token。
4. 一条 session 在正常状态下只允许一枚“未使用、未撤销、未过期”的当前 token。
5. 查找必须使用 token hash 的唯一索引；比较使用安全的固定时间策略，未知 token 与已失效 token 的外部错误不泄露内部状态。
6. Refresh Token 仅可提交给 `/api/v1/auth/refresh` 和认证撤销入口，绝不能作为 Bearer Access Token 调用业务 API，也不能传给 Socket。
7. 删除、过期清理只处理超过审计保留期的终态记录；不能立刻删除旧记录，否则无法识别重放。

## 五、数据库表设计方案

以下是 C3-1 冻结的 DDL 语义；Phase 2-C3-2 已按该语义实现 migration，认证行为仍未接入。

### 5.1 `auth_sessions`

| 字段 | 建议类型/约束 | 语义 |
| --- | --- | --- |
| `id` | TEXT PK | 随机 UUID/ULID；稳定 session id |
| `user_id` | INTEGER NOT NULL FK users(id) | 会话所属用户 |
| `client_type` | TEXT NOT NULL | `web`、`ios`、`android` 等受控枚举；只作策略与展示 |
| `device_name` | TEXT NULL | 用户可识别名称，限制长度并转义 |
| `user_agent_summary` | TEXT NULL | 最小化 UA 摘要，不保存为认证因子 |
| `app_version` | TEXT NULL | App/Web 客户端版本 |
| `created_at` | DATETIME NOT NULL | 首次登录时间 |
| `last_seen_at` | DATETIME NOT NULL | 成功刷新或受控节流后的最近活动时间 |
| `idle_expires_at` | DATETIME NOT NULL | 空闲到期时间，不能超过绝对到期 |
| `absolute_expires_at` | DATETIME NOT NULL | 不可滑动的绝对上限 |
| `revoked_at` | DATETIME NULL | 撤销时间 |
| `revoke_reason` | TEXT NULL | `logout`、`logout_all`、`password_changed`、`user_disabled`、`refresh_reuse`、`admin` 等 |
| `last_ip_prefix` | TEXT NULL | 可选、最小化网络提示；不保存完整 IP 作为长期设备标识 |

建议索引：

- `(user_id, revoked_at, absolute_expires_at)`：用户活跃会话与全量撤销。
- `(absolute_expires_at)`、`(idle_expires_at)`：过期清理。
- 不以设备元数据建立唯一约束；同一设备允许多个独立 session。

### 5.2 `auth_refresh_tokens`

| 字段 | 建议类型/约束 | 语义 |
| --- | --- | --- |
| `id` | TEXT PK | 单枚 token 记录 ID |
| `session_id` | TEXT NOT NULL FK auth_sessions(id) | 所属稳定会话 |
| `token_hash` | TEXT/BLOB UNIQUE NOT NULL | Refresh 原值的 HMAC 摘要 |
| `pepper_version` | INTEGER NOT NULL | 支持安全的 pepper 轮换 |
| `generation` | INTEGER NOT NULL | 从 0 递增的轮换代数 |
| `created_at` | DATETIME NOT NULL | 签发时间 |
| `expires_at` | DATETIME NOT NULL | 本枚 token 到期时间，不超过 session 绝对到期 |
| `used_at` | DATETIME NULL | 首次成功消费时间 |
| `replaced_by_id` | TEXT NULL FK auth_refresh_tokens(id) | 下一枚 token |
| `revoked_at` | DATETIME NULL | 单枚或全链撤销时间 |
| `revoke_reason` | TEXT NULL | 撤销原因 |

建议约束与索引：

- `UNIQUE(token_hash)`。
- `UNIQUE(session_id, generation)`。
- 索引 `(session_id, created_at)` 和 `(expires_at)`。
- 通过事务和条件更新保证同一 token 只能由 `used_at IS NULL AND revoked_at IS NULL` 变为已使用。
- SQLite 外键、事务模式、时间格式和清理策略必须在未来 migration 设计中与现有 `api/database/db.ts` 真实约束核验。

### 5.3 数据保留与隐私

- 活跃 session 与轮换链在线保留；终态记录建议保留 30～90 天用于重放识别和安全审计，具体期限需由隐私与运维评审。
- token hash 仍按敏感认证数据管理；不导出到普通分析系统。
- 日志只记录内部 `session_id`、事件、requestId、结果和最小化环境信息。
- 任何清理任务都必须以终态和保留期为条件，不能删除仍可能用于重放检测的记录。

## 六、Token 轮换机制

### 6.1 登录签发

1. 完成现有用户存在、enabled、bcrypt 和限流检查。
2. 创建一条 `auth_sessions`。
3. 生成 Refresh A 原值及 hash，写入 generation 0。
4. 签发带同一 `sid` 的短期 Access JWT。
5. Web 通过安全 Cookie、Mobile 通过 SecureStore 适配通道接收 Refresh A。
6. 写安全审计，响应不缓存。

### 6.2 刷新事务

一次刷新必须在单个事务中完成：

1. 计算提交 token 的 hash 并查找记录及所属 session。
2. 验证用户 enabled、session 未撤销、未超过 idle/absolute expiry、token 未过期。
3. 以条件更新原子消费旧 token：只有 `used_at IS NULL AND revoked_at IS NULL` 可成功。
4. 生成 Refresh B，插入下一 generation，并回写 A 的 `replaced_by_id`。
5. 更新 session 的 `last_seen_at` 和不超过绝对上限的 `idle_expires_at`。
6. 签发新的短期 Access JWT，事务提交后交付 Refresh B。

任何数据库步骤失败都整体回滚，不得出现旧 token 已消费但新 token 未保存的半完成状态。

### 6.3 并发刷新

- 服务端以事务条件更新实现“唯一赢家”；两个请求同时使用 A 时只能一个成功。
- Web api-client 使用单飞锁，并通过 `BroadcastChannel` 或 `navigator.locks` 协调多标签页；Mobile 在进程内序列化刷新。
- 默认采用严格策略：失败请求观察到 A 已使用即按重放处理，而不是盲目返回已签发的 B。
- 为避免正常网络重试被误判，客户端必须使用请求级超时与明确重新登录流程；第一阶段不设计“返回同一新 token”的宽限缓存，因为它会延长旧 token 可重复使用窗口并要求安全保存响应。
- 灰度数据显示大量误报时，才单独评审带幂等键、极短窗口和同客户端证明的方案，不能直接放宽单次使用规则。

## 七、Replay 攻击防护

### 7.1 检测与处置

当已使用的 Refresh A 再次出现：

1. 将所属 `auth_sessions` 标记为 `COMPROMISED`，`revoke_reason=refresh_reuse`。
2. 撤销该 session 下所有未使用 Refresh Token，包括 B。
3. 拒绝签发 Access Token，返回稳定错误 `AUTH_REFRESH_REUSED`（401）。
4. 发布会话撤销事件，断开关联 Socket。
5. 写安全审计和指标，但不记录 token 原值或 hash。
6. 通知用户该设备会话需要重新登录；不自动撤销其他设备，除非风险策略或用户选择 `logout-all`。

### 7.2 泄露面控制

- Access Token 短期化、限制 `aud`，降低泄露窗口。
- Refresh Token 轮换且只保存 hash；数据库泄露不直接产生可用 token。
- 全链路 TLS，不接受 URL、query string、日志或前端错误上报中的 token。
- Web Refresh Token 不暴露给 JavaScript；Mobile 使用系统安全存储。
- 对 login/refresh 实施 IP 与账号/session 维度限流，未知 token 错误保持一致。
- 第一阶段采用轮换检测；DPoP/mTLS 等 sender-constrained token 作为高安全级别后续选项，不与基础 C3 一次上线。

## 八、多设备登录设计

- 每次成功登录创建独立 `auth_sessions`，同一设备再次登录默认也是新 session。
- `GET /api/v1/auth/sessions` 按用户列出活跃 session：`id`、`clientType`、安全化设备名称、创建时间、最近活动时间、当前会话标记和近似网络提示；不返回 token、hash 或完整 IP。
- session 数量建议首期每用户上限 10。达到上限时优先提示用户管理会话，不默认静默踢掉最近活跃设备；最终产品策略在实施前冻结。
- 单会话 logout 只撤销当前 session，不影响其他设备。
- `logout-all` 撤销用户全部 session，包括当前会话。
- 设备元数据可以被伪造，只用于展示、审计和风险信号，不能替代密码、MFA 或权限检查。

## 九、主动退出设计

### 9.1 当前会话退出

`POST /api/v1/auth/logout`：

1. 根据当前 Access JWT 的 `sid` 或合法 Refresh Token 定位 session。
2. 幂等撤销 session 与所有未使用 Refresh Token。
3. Web 返回过期的同名 Cookie；Mobile 成功后删除 SecureStore 值。
4. 发布 `session.revoked` 事件，使当前 session 的 Socket 断开。
5. 返回 `200` 标准成功 envelope；重复退出不泄露 session 是否存在。

短期 Access JWT 本身不能从密码学上“收回”。v1 HTTP middleware 必须校验 `sid` 对应 session 仍有效，必要时使用短 TTL 缓存并通过撤销事件失效，才能达到主动退出的即时语义。

### 9.2 全部退出与用户安全事件

- `POST /api/v1/auth/logout-all` 原子撤销该用户全部 session 和 Refresh Token，并断开全部关联 Socket。
- 用户主动修改密码：建议撤销其他 session，并为当前 session 立即轮换 Refresh Token 与 Access Token；兼顾安全和完成操作后的可用性。
- 管理员重置密码、找回密码或确认凭据泄露：撤销包括当前会话在内的全部 session，要求重新登录。
- 用户被禁用：所有 v1 session 立即撤销；legacy token 仍按迁移期既有 middleware 的 enabled 回查处理。
- 上述策略只适用于未来 v1；legacy 改密后 JWT 仍有效的冻结测试不得在 C3 设计提交中改变。

## 十、Web Cookie 方案

### 10.1 存储与属性

- Refresh Token 使用 `__Host-xmt_refresh` Cookie：`Secure; HttpOnly; SameSite=Lax; Path=/`，不设置 `Domain`。
- `__Host-` 前缀要求 `Path=/`，因此不能同时用更窄 Path；服务端只在认证路由读取该 Cookie。
- Access Token 只放内存，不进入 localStorage/sessionStorage；页面重载时调用 refresh 恢复登录。
- “记住登录”关闭：Cookie 不设置持久 `Max-Age`，浏览器会话结束后删除；开启：`Max-Age` 不超过服务端 session 绝对有效期。
- 生产环境必须 HTTPS；本地开发使用独立安全配置，禁止把生产 Cookie 属性永久降级。

### 10.2 CSRF 与 XSS

- `SameSite=Lax` 是纵深防御，不是唯一 CSRF 防线。
- refresh、logout、logout-all 等 Cookie 认证写操作校验 `Origin`，必要时校验 `Referer`，并使用双提交或服务端 CSRF token；拒绝无可信来源的浏览器请求。
- CORS 仅允许明确来源并携带凭据，不能使用 `*`。
- HttpOnly 防止脚本读取 Refresh Token，但不能阻止 XSS 代表用户发请求；仍需 CSP、输出转义和前端供应链治理。
- 同站部署是首选。若未来必须跨站，`SameSite=None; Secure` 只能在经过单独威胁建模和 CSRF 验证后启用。

## 十一、Mobile SecureStore 方案

- iOS 使用 Keychain、Android 使用 Keystore 支持的 Expo SecureStore；Refresh Token 不得进入 AsyncStorage、日志、崩溃报告或剪贴板。
- Access Token 只保存在进程内存；冷启动或回到前台时通过 SecureStore 中的 Refresh Token 换取。
- 每次 refresh 成功后，先安全写入新 Refresh Token，再更新内存 Access Token；失败时清理不确定状态并要求重新登录。
- App 删除、系统安全存储清除或设备迁移导致 token 丢失时，按退出处理，不尝试从普通备份恢复。
- `device_name`、installation ID 和 platform 是展示/风控元数据，不是可信证明，也不能只凭请求体的 `clientType=mobile` 决定把 Refresh Token 返回给 JavaScript。
- v1 首次灰度只启用 Web Cookie。Mobile 响应体交付必须在独立阶段确认客户端注册、允许的分发渠道和可选 App Attestation；未完成该门禁时，服务端不得开放 Mobile Refresh Token 返回。

## 十二、Socket 重新认证方案

1. Socket 握手只提交短期 Access Token，服务端验证完整 v1 JWT 约束、session 状态、用户 enabled 和当前角色。
2. Refresh Token 永远不通过 Socket 传输，也不由 Socket 事件刷新。
3. Access Token 临近到期时，HTTP api-client 完成一次刷新；Socket 协调器暂停新业务操作、断开旧连接并用新 Access Token 重新握手。
4. 重连后恢复 `user_<id>`、管理房间和协作房间；Yjs provider 完成状态同步后再恢复业务操作，验证离线更新不丢失、不重复。
5. 服务端维护 `session_id -> socket ids` 映射。session revoke、logout-all、用户禁用或 refresh reuse 时主动断开目标连接。
6. 多实例部署必须通过共享 Pub/Sub/Socket adapter 传播撤销事件；单进程内存映射不能宣称集群级即时撤销。
7. 长连接必须处理 Access 到期：服务端定时复检或按过期时间断开，并可提前发出 `auth:expiring` 提示；不能仅依赖首次握手。
8. 身份切换必须销毁前一用户的 Socket 与协作上下文，禁止复用旧房间或 Y.Doc 权限状态。

## 十三、API v1 设计

所有接口遵守 `API_CONTRACT.md`：成功 `{ success: true, data, meta }`，错误 `{ success: false, error: { code, message, requestId, details? } }`；`meta.requestId` 和响应头 `X-Request-ID` 一致。

### 13.1 `POST /api/v1/auth/login`

- 请求：`username`、`password`、`remember`，以及长度受限的 `client` 展示元数据。
- 成功 `200`：返回 `user`、`accessToken`、`expiresIn`、`session`；Web 同时设置 Refresh Cookie。
- Mobile 在其独立交付门禁完成后才可在受控响应中接收 `refreshToken`。
- 保持现有密码、enabled、限流和 activity log 业务事实，但使用 v1 envelope 与错误码。

### 13.2 `POST /api/v1/auth/refresh`

- Web：无业务 body，从安全 Cookie 读取 Refresh Token。
- Mobile：未来从 SecureStore adapter 提交；该通道默认关闭直到 Mobile 阶段评审完成。
- 成功 `200`：返回新 `accessToken`、`expiresIn` 和 session 摘要，同时轮换 Refresh Token。
- 旧 token、过期 session、重放或账号禁用均不签发新 token。

### 13.3 `POST /api/v1/auth/logout`

- 撤销当前 session，清除客户端 Refresh Token，断开当前 session Socket。
- 结果幂等，成功 `200`，`data: null`。

### 13.4 `POST /api/v1/auth/logout-all`

- 撤销当前用户全部 session，包括当前 session，清除 Cookie/SecureStore 并断开全部 Socket。
- 成功 `200` 返回撤销数量的安全摘要或 `data: null`；具体返回 Schema 在实施前冻结。

### 13.5 `GET /api/v1/auth/sessions`

- 返回当前用户的活跃 session 列表和 `current` 标记。
- 不返回 Refresh Token、token hash、完整 IP、完整 UA 或其他用户 session。
- 后续单独设计撤销指定 session 的 endpoint；不在本阶段五个入口内扩张 API。

### 13.6 错误码

| 错误码 | HTTP | 含义 |
| --- | --- | --- |
| `AUTH_REQUIRED` | 401 | 缺少有效 Access 身份 |
| `AUTH_INVALID_CREDENTIALS` | 401 | 登录凭据错误；不区分用户不存在与密码错误 |
| `AUTH_SESSION_EXPIRED` | 401 | idle 或 absolute expiry 到期 |
| `AUTH_SESSION_REVOKED` | 401 | session 已撤销 |
| `AUTH_REFRESH_INVALID` | 401 | Refresh 缺失、格式错误、未知或已失效 |
| `AUTH_REFRESH_REUSED` | 401 | 检测到已使用 token 再次出现，session 已撤销 |
| `VALIDATION_ERROR` | 400/422 | 请求不符合 Zod Schema |
| `CONFLICT` | 409 | 可安全重试的事务或状态冲突；不得用于已确认的重放 |

外部消息不透露 token 是否曾有效、属于哪个用户或轮换链细节。内部日志通过 requestId 关联精确原因。

## 十四、迁移步骤

每一步必须独立提交、可观察、可回滚，且不得把数据库、接口、Web、Mobile 和 Socket 一次性切换。

1. **C3-2 数据模型评审与 migration**：在备份、回滚和 SQLite 事务验证后创建新表；功能开关默认关闭，legacy 不读写新表。
2. **C3-3 Session/Token 内核**：实现 Repository、Session Service、Token Service 和纯服务测试，不挂载公开路由。
3. **C3-4 v1 暗启**：实现五个 `/api/v1/auth/*` 路由、Zod/OpenAPI 和契约测试，只允许测试账号/环境使用。
4. **C3-5 Web 灰度**：统一 api-client，采用内存 Access + HttpOnly Cookie，先内部账号再小比例用户；legacy 登录仍可回退。
5. **C3-6 Socket 续期**：接入 `sid`、到期重连、撤销广播和 Yjs 恢复测试。
6. **C3-7 Mobile**：完成 SecureStore、交付通道和移动端生命周期验证后单独启用。
7. **C3-8 收敛**：观察至少一个 legacy 最大有效期窗口，再评审停止签发 legacy 7 天 JWT；历史接口删除属于新的破坏性阶段。

迁移期间 v1 和 legacy token 必须使用明确的验证分支，不能在失败后相互降级尝试。v1 `type/iss/aud` 与 legacy payload 的差异用于拒绝类型混用，但不能改变 legacy 验证器。

## 十五、灰度方案

### 15.1 开关与分组

- 环境级总开关：控制 v1 auth 是否可签发新 session。
- 用户 allowlist：仅内部/测试账号进入 v1。
- 稳定用户分桶：按 user id 确定灰度比例，避免每次登录随机切换。
- Web、Socket、Mobile 使用独立开关；Mobile 默认关闭。
- 已领取 v1 session 的客户端始终走 v1 refresh，不得因分桶变化退回 legacy 并携带 Refresh Token。

### 15.2 观测指标

- login/refresh 成功率、P95 延迟、401 与各错误码比例。
- 并发刷新冲突率、`AUTH_REFRESH_REUSED` 数量及误报调查结果。
- 活跃 session 数、每用户 session 数、logout/logout-all 成功率。
- Cookie 写入/读取失败、页面冷启动恢复率、跨标签刷新次数。
- Socket 重连成功率、撤销到断开的延迟、Yjs 重同步失败与未确认更新数量。
- 数据库锁等待、事务回滚、表增长与清理任务耗时。

### 15.3 放量门禁

只有在无 token 泄露日志、并发唯一性测试通过、重放处置正确、Web 冷启动稳定、Socket/Yjs 无数据丢失且回滚演练成功后才能扩大灰度。任何安全不变量失败都立即停止签发新 v1 session。

## 十六、回滚方案

1. 关闭 v1 新登录签发和新的灰度分配，Web 恢复 legacy 登录入口。
2. **已签发的 v1 session 不能被直接遗弃**：至少保留 v1 refresh/退出验证能力至其自然到期，或明确撤销并要求用户重新登录。
3. 清除 Web `__Host-xmt_refresh` Cookie；客户端不得把 Refresh Token 发送给 legacy 接口。
4. Socket 切回 legacy 前先断开 v1 session 连接并重新握手，避免同一连接混用两类 token。
5. 新表只追加使用，不在紧急回滚中删除；保留审计和重放证据。删除表必须是观察期后的独立 migration。
6. 若 v1 JWT 验证器故障但 session 数据正确，可停止签发、要求受影响 v1 用户重新登录 legacy；不得放宽签名、issuer、audience 或 session 检查。
7. 若数据库 migration 失败，按 migration 专属备份恢复方案处理；因为 legacy 不依赖新表，主认证链应继续可用。
8. 回滚演练必须覆盖“登录后回滚”“刷新中回滚”“Socket 在线时回滚”和“部分节点版本不一致”。

## 十七、测试方案

### 17.1 Schema 与 Service 单元测试

- v1 login/refresh/logout/logout-all/sessions 请求、成功、错误 envelope 和 requestId。
- Access JWT 的算法、`iss`、`aud`、`type`、`sid`、`jti`、过期和类型混用。
- 256 bit Refresh Token 随机性形状、只存 hash、pepper 版本和敏感值日志扫描。
- Session idle/absolute expiry、撤销状态和用户 enabled/当前角色回查。

### 17.2 Repository 与 SQLite 事务测试

- 创建 session 与 generation 0 token。
- 正常轮换 A→B，A 只能消费一次，链关系完整。
- 两个并发事务刷新 A 时恰好一个成功；另一请求触发既定重放策略。
- 插入或更新失败时整体回滚，不产生半链。
- logout、logout-all、密码安全事件的撤销范围正确且幂等。
- 索引、外键、时间边界、清理保留期和 SQLite 锁竞争验证。

### 17.3 API 集成与契约测试

- 五个 v1 endpoint 的状态码、Zod、envelope、`Cache-Control: no-store`、`X-Request-ID` 和 OpenAPI。
- Web login 设置 Cookie 的 `Secure`、`HttpOnly`、`SameSite`、`Path`、无 Domain；logout 正确过期 Cookie。
- Refresh Token 不出现在 Web JSON、URL、日志、错误、埋点或快照。
- legacy `/api/auth/*` 响应、7 天 JWT、logout 不撤销和改密不撤销行为冻结测试持续通过。
- v1 token 不能调用 legacy 模糊分支，Refresh Token 不能当 Access Token。

### 17.4 安全测试

- token 泄露模拟：Access 泄露窗口受限，Refresh 数据库摘要不可直接使用。
- 已使用 Refresh Token 重放：整个 session 撤销、新 token 失效、审计与 Socket 断开。
- CSRF：跨站 refresh/logout/logout-all 被拒绝；合法同源请求通过。
- XSS 边界：页面 JavaScript 无法读取 HttpOnly Refresh Cookie。
- session fixation、弱随机数、JWT algorithm confusion、错误 issuer/audience、篡改 sid、过期与时钟边界。
- login/refresh 限流、错误枚举、日志脱敏和 requestId 关联。

### 17.5 客户端与端到端测试

- Web 单标签、多标签、页面刷新、网络断开、丢失刷新响应和记住登录两种 Cookie 生命周期。
- Mobile SecureStore 写入/替换/删除、冷启动、前后台、系统清理和 App 重装。
- 多设备：单会话 logout 不影响其他会话；logout-all 全部失效；session 列表只显示当前用户。
- 密码修改：用户主动改密保留并轮换当前 session、撤销其他 session；管理员重置撤销全部。
- Socket：Access 临期刷新后重连、session 撤销立即断开、跨节点广播、房间恢复和身份切换。
- Yjs：刷新重连期间本地未确认更新不丢失、不重复，awareness 和协作状态正确恢复。

### 17.6 灰度与回滚验证

- 0%、allowlist、小比例和扩大灰度各阶段行为。
- legacy 与 v1 同时存在时互不接受对方凭据。
- 关闭签发后已存在 v1 session 仍可安全退出或完成受控刷新。
- 回滚不删除新表、不丢审计数据、不让 Refresh Token 落入 legacy 存储。
- 版本混合节点、数据库锁竞争、进程重启和密钥/pepper 版本轮换演练。

## 参考依据

- [OWASP Session Management Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html)：会话标识高熵与无意义、Cookie 传输、安全属性、服务端失效、空闲/绝对超时和会话续期。
- [OWASP OAuth2 Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/OAuth2_Cheat_Sheet.html)：短期 Access Token、Refresh Token 轮换或 sender constraint，以及重放防护。
- [OWASP WebSocket Security Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/WebSocket_Security_Cheat_Sheet.html)：长连接的服务端会话验证、过期处理和 SameSite/来源校验。
- `docs/AUTH_CURRENT.md`：XMT 当前认证真实行为与冻结边界。
- `docs/PHASE2_AUTH_DESIGN.md`：Auth Module 和早期 Refresh Token 候选设计。
- `docs/API_CONTRACT.md`：v1 envelope、错误码、requestId 与 Schema 约束。

## 本阶段结论

Phase 2-C3-1 在 `v2.13.3` 完成设计，C3-2 `v2.13.4` 落地数据库基础设施，C3-3 `v2.13.5` 落地未接线的 Session/Refresh/v1 Access Token 内核。API、legacy JWT、Web、Mobile 与 Socket 认证仍未切换，后续能力必须继续分阶段实施。
