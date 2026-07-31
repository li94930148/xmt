# XMT 正式 Login 迁移计划

## 一、Legacy Login 现状

正式入口仍为 `/api/auth/login`。成功后返回 7 天 JWT，payload 保持 `userId/username/role`，前端继续使用既有持久 Token；Logout 只返回成功且不撤销 JWT。Socket/Yjs 仍使用 legacy Token。本阶段不改变上述行为。

## 二、v1-web 目标状态

目标 Web 登录使用 `/api/v1/auth/login`：Access Token 只保存在内存，Refresh Token 仅存在 HttpOnly Secure Cookie；Refresh 一次性轮换并受 Origin、CSRF、Session 与 reuse 检测保护。Logout 撤销当前 Session 并清除 Cookie。Auth Event 统一进入外部指标与告警链。

## 三、正式准入前置条件

1. Prometheus 或 OTel Collector 在生产连续运行至少一个完整业务周期，跨实例数据完整。
2. Warning/Critical 使用合成的普通失败与隔离测试流量完成通知联通；禁止在生产制造 Token reuse。
3. 值班、责任人、停止阈值、配置回滚和 legacy 抽样验证均完成双人复核。
4. v1 allowlist 普通账号完成第二轮真实浏览器验证，刷新、重开、退出与业务只读路径无异常。
5. Socket/Yjs 未迁移影响已明确：进入 v1-web 的用户如果业务依赖协作连接，必须继续使用兼容桥接方案或暂不准入。

## 四、迁移步骤

### 阶段 0：保持 Legacy

- 正式 Login 不变，建立 24 小时基线并验证抓取、Collector、告警和回滚。
- 管理员、director 和协作高频用户不进入首批名单。

### 阶段 1：显式普通账号 Allowlist

- 仅由登录入口的准入层对已批准用户选择 v1-web，不修改 `/api/auth/login` 本身。
- 每批名单固定一个业务观察窗口，不使用 percentage，不在窗口内扩大。
- Session 创建后冻结认证模式，避免同一浏览器在请求间漂移。

### 阶段 2：内部角色扩展

- 普通账号连续通过后，单独评估管理员与 director；权限不作为自动准入依据。
- 验证密码修改、账号禁用、Logout-all 和多设备 Session 管理。

### 阶段 3：正式入口切换评审

- 只有外部指标、告警、Socket/Yjs 方案和回滚演练均通过后，才提交新的实施指令。
- percentage 只能在明确批准后启用，且每档比例必须有停止阈值和观察窗口。

## 五、灰度策略

- 默认 `legacy`，首批仅 `allowlist`。
- 使用稳定用户 ID，不按用户名、角色或请求随机值决定。
- 管理员不作为首批；每次名单变化双人复核并保留审计。
- 重点观察 Refresh 失败率、CSRF、Token reuse、Expired、登录成功和业务错误。

## 六、回滚方案

1. 将 Rollout 模式切回 `legacy` 并关闭批准开关，新登录立即回到旧入口。
2. 保留 `auth_sessions`、Refresh 记录和审计，不删除安全事实。
3. 已签发的 legacy JWT 继续有效；现有 v1 Session 按风险决定自然到期或显式撤销。
4. 验证 `/api/auth/login`、关键只读业务接口与 Socket/Yjs legacy 握手。
5. 保存外部指标、告警通知、requestId 和配置差异，复盘批准前不得恢复灰度。

## 七、Socket/Yjs 影响评估

Socket 当前不理解 v1 `sid/type/iss/aud` 语义，也不会通过 Refresh Cookie 自动续期。页面 HTTP 已恢复认证并不代表 Socket/Yjs 会话已恢复。正式扩大准入前必须设计握手 Token、Access Token 更新、断线刷新、重连和 Yjs 文档状态恢复；在该方案实施前，依赖实时协作的用户不应迁移。

## 八、风险清单

- Collector 或抓取失败造成盲区，但不得阻断认证业务。
- 多实例 Counter 重置、重复抓取或 instance 不稳定导致误判。
- `active_sessions` 被错误求和，当作数据库唯一会话数。
- Cookie Domain/Path、Origin 或 CSRF 代理头配置与真实域名不一致。
- 前端冷启动刷新成功但 Socket/Yjs 仍持有旧 Token。
- 回滚后残留 v1 Session 未按风险策略处理。
- 告警未绑定明确值班人，或阈值未按生产基线校准。
