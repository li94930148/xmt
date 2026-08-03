# Web Login Gateway v1 响应适配设计

## 问题与现状

`POST /api/auth/login` 仍是唯一 Web 登录入口。未命中灰度的用户收到 legacy 响应：`{ user, token }`；命中 allowlist 的普通成员经 Login Gateway 进入 v1 Web，收到 API Contract envelope：`{ success, data: { user, accessToken, session }, requestId }`。

此前 `src/api/auth.ts` 直接将响应交给 `Login.tsx`，而页面始终读取 `result.token`。因此 v1 响应虽已成功，页面却将其当作异常，无法建立前端登录态。

## 适配策略

`src/auth/web/login-response-adapter.ts` 是唯一的响应识别层：

| 输入契约 | 统一输出 | 存储策略 |
| --- | --- | --- |
| legacy `{ user, token }` | `AuthLoginResult(authMode: legacy, accessToken)` | 保持原有 localStorage / sessionStorage 行为 |
| v1 `{ success, data, requestId }` | `AuthLoginResult(authMode: v1-web, accessToken, session)` | Access Token 仅进入 Auth Runtime 与 Zustand 内存状态 |

适配器严格校验用户、Access Token 和会话摘要；格式不完整时拒绝登录，不做 legacy 降级猜测。Refresh Token 不读取、不返回、不写入任何浏览器存储。

## 登录链路

1. `src/api/auth.ts` 请求不变的 `/api/auth/login` 并调用适配器。
2. `Login.tsx` 按 `authMode` 分支：legacy 继续使用原 `authStore.login`；v1 调用 `webAuthRuntime.authenticate` 与内存登录态。
3. v1 Runtime 的刷新请求只通过 HttpOnly Refresh Cookie 与可读 CSRF Cookie 请求 `/api/v1/auth/refresh`。
4. Socket Coordinator 所需的 Runtime 只暴露 Access Token、刷新动作和到期时间；不会暴露 Refresh Token。

## 兼容与门禁

- legacy JWT payload、7 天有效期、错误提示、remember-me、存储与登出行为不改变。
- v1 仅在既有 Login Gateway allowlist 命中且全部灰度门禁已启用时产生；本阶段不改变任何门禁或生产配置。
- 页面重载后的 v1 恢复仍以 Refresh Cookie 为唯一凭据，Access Token 不持久化。

## 验证与回滚

单元测试覆盖两种成功契约、无效响应、缺少 token 与错误地把 refresh 响应作为登录响应的场景。现有浏览器 Auth 测试继续验证 Cookie、刷新、内存令牌和恢复。

回滚只需关闭既有 Login Rollout / Auth v1 门禁；未命中的用户和所有 legacy 用户始终使用原登录链路。
