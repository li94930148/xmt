# Phase 2-C3-5-A Web 认证迁移前置设计

## 文档边界

本文基于 `v2.13.6` 真实代码，冻结 Web 从 legacy 7 天 JWT 迁移到 v1 Session 认证前的设计。本阶段只设计，不修改 `Login.tsx`、前端 Token 存储、Socket、Caddy、Cookie 线上策略、数据库或运行配置，也不启用生产 v1 Auth。

当前 `/api/v1/auth/*` 仍是默认关闭且生产强制禁用的 experimental 接口；其 Refresh Token JSON 交付仅用于非生产测试，不是 Web 最终契约。本文目标只能在后续阶段单独实施和灰度。

实施状态补充：Phase 2-C3-5-B 已在 `v2.13.7` 落地未接线的 Web Auth Runtime、api-client 刷新能力、Auth v1 客户端、Cookie/CSRF 服务和 Web allowlist 配置。现有 Login、持久 Token、legacy、Socket 与生产开关仍未切换。

HTTP 适配状态补充：Phase 2-C3-5-C 已在 `v2.13.8` 将非生产 allowlist Web 分支接入 HttpOnly Refresh Cookie、Origin/CSRF 校验和原子登录事务。现有 Login 尚未消费该分支，默认及生产开关继续关闭。

## 一、当前 Web 认证流程

### 1.1 登录入口与 API

```text
Login.tsx
  -> src/api/auth.ts: login(username, password)
  -> POST /api/auth/login
  -> legacy user + token + forceChangePassword
  -> useAuthStore.login(user, token, persistence)
  -> localStorage 或 sessionStorage
  -> 页面跳转
```

- `Login.tsx` 负责表单、错误展示、“记住登录”、强制改密和登录后跳转。
- `src/api/auth.ts` 直接调用 `/api/auth/login|me|change-password`，使用 legacy 裸响应。
- 强制改密成功后清理本地登录态并要求重新登录；迁移不得顺带改变该产品流程。
- 记住的账号密码由 `rememberedCredentials` 独立管理，不等同于 Token 持久化，应另立安全治理任务。

### 1.2 Token 存储

`src/store/index.ts` 的 Zustand Auth Store 保存 `user`、`token`、`isLoggedIn` 和 persistence：

- 勾选“记住登录”：`xmt_user`、`xmt_token` 写入 `localStorage`。
- 未勾选：写入 `sessionStorage`。
- 冷启动优先恢复 sessionStorage，再恢复 localStorage。
- Token 可被同源 JavaScript 读取，`ProtectedRoute` 也以本地 Token 是否存在判断登录。

### 1.3 请求附加与失效处理

- `src/api/auth.ts` 及大量 `src/api/*`、部分页面分别读取 Store，手工添加 Bearer Header。
- `src/utils/apiInterceptor.ts` 包装全局 fetch；除 login 外任意 401 都会删除两类浏览器存储，派发过期事件并跳转登录。
- 当前没有静默刷新、原请求重放、单飞锁或跨标签协调。
- `packages/api-client` 有 Access provider 和单实例 refresh promise 骨架，但尚未在 401 后刷新重试，Web 也未统一接入。
- `Layout` 启动后调用 legacy `/api/auth/me`；失败后清理登录态。

### 1.4 退出与 Socket

Web 退出只调用 Store `logout()` 并跳转，不调用服务端 logout，7 天 JWT 不撤销。`useSocket` 从同一 Store 取 Token，经 `auth.token` 握手；Token 变化会重建连接，本地退出会断开。当前只有握手认证，没有 Session 撤销或 Token 到期重认证。

## 二、目标 Web 认证流程

目标采用“内存 Access Token + HttpOnly Cookie Refresh Token”：

```text
登录
  -> POST /api/v1/auth/login（credentials: include）
  -> 事务创建 session + Refresh 记录
  -> Set-Cookie 交付 HttpOnly Refresh Token
  -> JSON 返回短期 Access Token + user + session
  -> Access Token 仅进入内存 Auth Runtime

业务请求
  -> 统一 api-client 附加 Access Bearer
  -> Access 失效进入单飞 refresh
  -> POST /api/v1/auth/refresh（Cookie + CSRF）
  -> Cookie 轮换 + 返回新 Access Token
  -> 原请求最多重试一次

页面重载
  -> 启动屏障调用 refresh 恢复会话
  -> 成功后加载用户与路由；失败进入未登录态
```

Refresh Token 不进入 JSON、localStorage、sessionStorage、URL、日志或前端状态。Access Token 只存模块内存；Zustand 可保存用户和认证状态机，但不得持久化 v1 Access Token。

迁移期显式记录 `legacy | v1-web` 模式。两类 Token 不能模糊回退：v1 Refresh Token 不得发送到 legacy，v1 Access 验证失败也不得尝试 legacy 验证器。

## 三、Cookie 设计

| 属性 | Web 目标值 | 说明 |
| --- | --- | --- |
| name | `__Host-xmt_refresh` | 防止子域覆盖 |
| Domain | 不设置 | host-only，满足 `__Host-` 约束 |
| Path | `/` | `__Host-` 强制要求；服务端仅在 Auth Controller 读取 |
| HttpOnly | `true` | JavaScript 无法读取 Refresh Token |
| Secure | 生产 `true` | 只走 HTTPS；开发采用隔离配置，不降低生产值 |
| SameSite | `Lax` | 适合同站首期，并叠加 Origin 与 CSRF 校验 |
| Max-Age | 按 remember 计算 | 不超过 session 绝对到期 |

- remember=false：不设置 `Max-Age`/`Expires`，使用会话 Cookie；服务端过期规则仍有效。
- remember=true：初始建议 `Max-Age=2592000`（30 天），实际取 session 绝对到期的剩余秒数，刷新不得滑动绝对上限。
- refresh 用完全相同属性覆盖 Cookie；logout 用相同 name/path 设置 `Max-Age=0`。Cookie 清除失败不阻止服务端撤销。
- login、refresh、logout 响应均 `Cache-Control: no-store`。

上线前必须核实真实 origin、HTTPS 终止、代理、CORS allowlist 和 Cookie 回传。本文不修改 Caddy，也不假设线上域名。跨站部署不得直接改 `SameSite=None`，必须重新评审 CORS、CSRF 和第三方 Cookie 可用性。

## 四、CSRF 方案

采用“可信 Origin 校验 + session 绑定的签名双提交 Token”。

### Token 来源

- v1 Web login 成功后生成独立 CSRF 随机值，签名绑定 `sid` 和版本。
- 通过非 HttpOnly 的 `__Host-xmt_csrf` Cookie 交付：`Secure; SameSite=Lax; Path=/`，无 Domain；它不是认证凭据。
- Auth Runtime 读取 CSRF Cookie，并发送 `X-XMT-CSRF` Header。
- CSRF 与 Refresh 必须独立随机、独立用途，不从 Refresh 派生。

### 校验方式

1. `Origin` 精确命中 Web origin allowlist；无 Origin 的浏览器写请求只在明确兼容评审后回退 Referer。
2. CSRF Cookie 与 Header 同时存在并恒定时间比较。
3. 验证签名、版本、有效期和 sid 绑定；sid 必须与 Refresh 定位的 session 一致。
4. 失败返回统一安全错误，不能进入 Refresh 消费事务。

### 接口范围

- refresh：必须校验 Origin + CSRF。
- logout 与未来 logout-all：只要允许 Cookie 定位会话，就必须校验 Origin + CSRF。
- login：无既有认证 Cookie，不要求 CSRF Token，但必须校验 Origin、执行限流，并在成功后轮换 CSRF Token 防 fixation。
- sessions 当前使用 Access Bearer 且只读，不要求 CSRF；未来状态修改接口必须保护。

CSRF 不能替代 XSS 防护；CSP、输出转义、依赖治理和记住密码 fallback 移除需独立实施。

## 五、Pepper 密钥管理

- C3-5-B 兼容当前 `XMT_AUTH_REFRESH_PEPPER` 作为 `pepper_version=1` 来源；值不得进入仓库、数据库、日志、构建或前端变量。
- 新版本采用后端 Secret，如 `XMT_AUTH_REFRESH_PEPPER_V2`，并以非敏感 `XMT_AUTH_REFRESH_PEPPER_ACTIVE_VERSION=2` 指定新签发版本。
- Pepper 不与 `JWT_SECRET`、CSRF 签名密钥或备份密钥复用；至少 32 字节高熵随机值。
- active version 缺失时 v1 Web 保持不可用并报警，不得使用默认值。

轮换步骤：先部署旧新双读；确认所有实例持有新 Secret；再切 active version；新签发用新版，旧记录按 `pepper_version` 验证并在正常轮换后自然迁移。旧密钥至少保留到对应 session 全部绝对过期并满足审计期限。怀疑泄露时停止新签发、撤销受影响版本会话并要求重新登录，不能重哈希数据库旧 hash 代替撤销。CSRF 签名密钥也要版本化且与 Pepper 分离。

## 六、灰度方案

### 开关与准入

1. `XMT_AUTH_V1_ENABLED`：服务端总开关，当前默认 false 且生产强制关闭；C3-5-B 不得直接取消生产硬门禁。
2. 未来 `XMT_AUTH_WEB_ENABLED`：仅控制 Web Cookie 适配与 Web 入口，不影响 Mobile、Socket、legacy。
3. `XMT_AUTH_WEB_ALLOWLIST_USER_IDS`：首轮明确内部用户 ID；不以用户名作稳定主键。
4. 后续比例按 user id 稳定 hash 分桶，不能每次登录随机切换。

放量顺序为 0% 自动化验证 → 显式 allowlist 内部管理员 → 内部普通账号 → 小比例稳定分桶。管理员必须同时在 allowlist 中，不能仅凭 role 自动进入。前端须在提交密码前依据非敏感 eligibility 或启动配置选择模式，不能 v1 失败后静默重放凭据到 legacy。已建立 session 的模式在生命周期内冻结。

观测 login/refresh 成功率、冷启动恢复率、401 恢复率、重复刷新、重新登录率、Cookie/CSRF 错误、事务回滚和 reuse。Token 泄露、跨用户会话、CSRF 绕过、轮换双成功或协作数据风险均触发停止新签发。

回滚时关闭新 Web 分配和 v1 登录；已签发 session 仍保留受控 refresh/logout 到自然到期，或明确撤销并引导重登，不能留下无法退出的 Cookie 会话。

## 七、登录事务设计

事务外完成 Schema、Origin、限流、密码验证和 Refresh/CSRF 随机材料生成，不持有 SQLite 写锁等待 bcrypt。

单个写事务内：

1. 重新读取用户并确认仍存在且 enabled，防止状态漂移。
2. 创建 `auth_sessions`。
3. 写 generation 0 Refresh hash、pepper_version 与绝对到期。
4. 写登录/会话审计；沿用 `activity_log` 时必须使用同一事务连接。
5. 任一步失败整体回滚，不留下孤立 session 或无首枚凭据的半成品。

提交后才签发/返回 Access Token 并设置 Refresh/CSRF Cookie。若 JWT 签发或响应适配在提交后失败，补偿撤销并记录安全事件；Cookie Header 只能在服务端状态成功后写入。

不变量：session 与 generation 0 Token 同时存在或同时不存在；数据库、事务错误和审计只有 hash、无原值；响应中断产生的客户端不可见 session 应补偿撤销或由短期孤儿清理识别，不能由 hash 恢复原值；登录重试创建新 session。C3-5-B 必须故障注入验证 session、token、审计任一写入失败均整体回滚。

## 八、Socket 迁移方案

Socket 是后续独立阶段，本阶段及 C3-5-B 都不修改现状。

### Handshake

- 只发送短期 v1 Access Token；Refresh 和 CSRF 永不进入 Socket handshake、query 或事件。
- 服务端验证签名、`type`、`iss`、`aud`、`exp`、`sid`，再检查 session 与当前用户 enabled/role。
- legacy 与 v1 显式分支，灰度期 legacy 用户保持原流程。

### Refresh 与 reconnect

HTTP Runtime 在 Access 临期或可刷新 401 时单次 refresh，成功后发布内存 `accessTokenUpdated`。Socket Coordinator 暂停业务发送，更新 `socket.auth.token`，主动断开并重新握手；不能只改客户端变量。失败按统一次数退避，不能循环 refresh。

### 房间与 Yjs 恢复

- 服务端重建用户和管理房间；客户端保存显式订阅并幂等重入。
- 同一用户 Token 重连不销毁 Y.Doc，本地未确认更新继续排队。
- Provider 先交换状态向量、补齐更新，再恢复 awareness、typing、锁；同步门闩打开后才恢复业务发送。
- 测试断网、响应丢失、连续编辑、重复 reconnect 与 JOIN 幂等，确保更新不丢失且无业务重复副作用。
- 用户切换必须销毁旧 Socket、Provider、Y.Doc 和订阅上下文。

## 九、前端迁移步骤

### 阶段 1：Auth Runtime 与契约准备，不切入口

- 建立独立 `v1-web` Runtime，管理内存 Access、状态机、单飞 refresh 和模式，不写现有 Token 存储。
- 扩展 api-client：`credentials: include`、可刷新 401 判断、最多一次重试、requestId 延续和 refresh/logout 调用。
- v1 请求由 Runtime 决策，解决其与全局 401 拦截器的竞争；legacy 保持原行为。
- 通过 BroadcastChannel/Web Locks 协调多标签，避免其他标签再次使用旧 Refresh。
- 后端先完成 Cookie、CSRF、登录事务和 allowlist，UI 仍走 legacy。

### 阶段 2：内部灰度登录与 HTTP 请求迁移

- 仅 allowlist 用户选择 v1；保持 Login 可见体验、错误、强制改密和跳转语义。
- 先迁移认证恢复和少量只读 API，再按模块收敛手写 Authorization，不一次替换全仓。
- ProtectedRoute 等待 bootstrapping，不能因内存尚无 Token 立即跳转。
- 页面重载先 refresh，再取当前用户；失败才进入未登录。
- v1 退出先服务端撤销和清 Cookie，再清内存；网络失败采用本地退出与明确提示。
- Socket 仍是 legacy；如无法安全维持，只能在不依赖实时协作的内部环境验证，不能宣称完整迁移。

### 阶段 3：扩大 HTTP 灰度并向 Socket 阶段交接

- 完成业务 API 的统一 provider 与 401 恢复，移除 v1 对持久 Token 的依赖。
- 验证单/多标签、刷新风暴、网络抖动、休眠恢复和退出幂等。
- 形成 Socket Coordinator 接口及房间/Yjs 测试夹具，但只有独立批准后才切换。
- 指标与回滚达标后扩大稳定分桶；legacy 最大 Token 窗口和调用量归零前不删除旧入口或存储兼容。

## 十、回滚方案

1. 关闭新 Web eligibility 与 v1 登录，未迁移用户继续 legacy。
2. 保留既有 v1 session 的 refresh/logout；安全紧急关闭时撤销 session、清 Cookie并要求重登。
3. 按 session 创建时冻结的模式回滚，禁止把 v1 Access 写入 `xmt_token` 或把 Refresh 发给 legacy。
4. v1 用户回 legacy 前撤销 v1 session、清 `__Host-xmt_refresh` 与 `__Host-xmt_csrf`，再展示 legacy 登录，不静默重放密码。
5. Cookie/CSRF 故障只停止新签发，不放宽 Secure、HttpOnly、SameSite、Origin 或 CSRF。
6. api-client 出现刷新循环时停止自动 refresh，原请求不再重试并提示重登。
7. 新表回滚时保留，继续用于审计与重放识别，不紧急删表。
8. Socket 未迁移，因此 C3-5-B 回滚不得修改 Socket；未来另做在线连接与 Yjs 演练。

## 实施门禁

C3-5-B 编码前必须确认真实生产 origin/HTTPS/代理事实、Cookie/CSRF 安全评审、SQLite 同事务连接方案、Pepper/CSRF Secret 双版本演练、allowlist 与停止责任人、Web JSON 无 Refresh 原值、敏感日志扫描、legacy/v1/CSRF/跨标签/回滚测试，以及 Socket 未迁移对灰度范围的限制。

## 本阶段结论

Phase 2-C3-5-A 只冻结 Web 迁移方案。版本保持 `v2.13.6`，Login、Token 存储、legacy API、experimental 开关、Cookie、Caddy 和 Socket 行为全部不变。下一步只能在 C3-5-B 指令下实施前置基础设施，不能直接切换 Web 登录入口。
