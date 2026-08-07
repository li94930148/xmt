# Auth Production Build Artifact Runtime Diagnosis（v2.14.5）

诊断时间：2026-08-03（Asia/Shanghai）
生产状态：保持 legacy；本阶段未开启 Auth v1、Login Rollout、Socket Bridge，也未创建账号、修改 allowlist、数据库或 Socket/Yjs。

## 诊断结论

分类：**E. 其他（上一轮真实灰度的前端观测证据不足）**。

以下类别已排除：

- **A. 生产部署产物不一致**：服务器 commit、版本、构建时间、公网 Login 动态块摘要均一致，详见 [前端产物核验](AUTH_PRODUCTION_FRONTEND_ARTIFACT_VERIFY_V2.14.5.md)。
- **B. 浏览器缓存/静态资源问题**：内容哈希动态块在全新 Chromium 上下文中与生产服务器文件一致。
- **C. Runtime 写入问题**：真实生产域名加载的 v2.14.5 bundle，在本地拦截的合法 v1 envelope 下已完成 Runtime 内存令牌写入。
- **D. Router 跳转问题**：同一测试完成首页跳转，并确认未调用 legacy `GET /api/auth/me`。

上一轮 C3.9 仅证明服务端为两个 allowlist 账号创建 Session 并返回成功；当时没有采集可关联的前端网络状态、适配器选择、运行态和路由跳转证据。因此“服务端成功而浏览器仍在 `/login`”不能再归因于生产 bundle 或现有 v2.14.5 Runtime/Router 代码。

## 新增无敏感 Trace

仅开发和测试环境输出以下事件；生产构建会移除输出：

1. `auth.response.received`
2. `auth.adapter.selected`
3. `auth.runtime.before`
4. `auth.runtime.after`
5. `auth.redirect.start`
6. `auth.redirect.end`

事件只包含响应类别、模式、状态与布尔值；不包含 access token、refresh token、Cookie、密码或 Session secret。

## 浏览器验证

使用项目自带 Playwright Chromium 访问生产真实域名。为保持只读，所有 `/api/*` 与 `/socket.io/*` 请求都在本机拦截；仅静态 HTML、主入口和 Login 动态块来自生产。

拦截返回与 v1 Login Gateway 相同的标准 envelope 后，验证通过：

- v1 response 被适配为统一登录结果；
- Auth Runtime 创建且含内存 access token；
- 页面从 `/login` 跳转至 `/`；
- 未请求 legacy `/api/auth/me`。

Cookie 的实际写入和 Refresh 轮换不在本次生产只读测试中执行；该项继续由 Auth Web Cookie 回归和下一次获批灰度验证。

## 本地 Trace 回归

本地 Vite/Chromium 回归已断言六个 trace 按 v1 登录调用顺序出现，并验证 legacy 与 v1 路径共存。测试中的后续业务 API 代理警告来自未启动的本地业务后端，不影响登录、Runtime 或路由断言。

## 下一步方案

进入 C3.11 前，应只增加灰度浏览器夹具的非敏感观测采集：为每次登录关联 requestId、HTTP 状态、响应类别、适配器模式、Runtime 状态和最终 pathname。该夹具在任一登录未进入首页时必须立即停止，不允许继续 Socket/Yjs 验证或扩大灰度。
