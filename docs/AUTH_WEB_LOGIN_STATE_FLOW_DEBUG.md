# Auth v1 Web 登录完成态链路排查

## 结论

Phase 2-C3-8-C3.6 的生产浏览器灰度中，服务端已成功完成 v1 登录、Session 创建和 Cookie 下发，但页面随后回到登录页。

直接原因不在 Login Gateway 响应适配，而在登录后的布局初始化：Layout 无差别请求 legacy `GET /api/auth/me`。v1 Access Token 与 legacy JWT 的验证契约不同，该请求返回未认证，Layout 随即执行 logout 并导航回 `/login`。

## 修复前调用链

```text
POST /api/auth/login
  -> Login response adapter
  -> Auth Runtime.authenticate
  -> Zustand loginV1
  -> navigate('/')
  -> Layout hydrateSession
  -> GET /api/auth/me (legacy JWT verification)
  -> 401
  -> logout + navigate('/login')
```

## 修复后调用链

```text
POST /api/auth/login
  -> Login response adapter
  -> Auth Runtime: authenticating -> authenticated -> redirecting
  -> Zustand loginV1 (memory token + current user)
  -> original router navigation
  -> Layout detects v1-web mode and uses the verified login user
  -> skips legacy /api/auth/me validation
```

## 约束

- legacy 登录仍通过原有 `GET /api/auth/me` 完成会话刷新；
- v1 Access Token 和 Refresh Token 均不写入诊断日志；
- 浏览器诊断仅在开发或测试环境输出：
  `auth.login.received`、`auth.runtime.updated`、`auth.redirect.started`、`auth.redirect.completed`；
- Cookie 恢复、Socket 和业务 API 的 v1 兼容性仍按既有灰度计划分别验证，本次不改变其协议或生产配置。
