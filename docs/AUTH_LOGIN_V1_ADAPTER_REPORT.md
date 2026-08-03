# Auth Login v1 响应适配报告

## 问题原因

Phase 2-C3-8-C3.3 中，allowlist 用户已被 Login Gateway 正确分流到 v1 Web 登录。服务端返回了标准 envelope，但现有 Web 页面仍按 legacy `{ user, token }` 读取，导致成功响应在浏览器端被误判为异常。

## 修改内容

- 新增 Login Response Adapter，统一识别 legacy 和 v1 Web 登录响应。
- v1 Access Token 进入 Auth Runtime 和内存登录态，不写入 localStorage 或 sessionStorage。
- legacy 分支继续使用原 token 字段、7 天 JWT 与既有持久化规则。
- v1 Runtime 刷新只使用 Cookie + CSRF；不处理或保存 Refresh Token。

## 兼容策略

服务端 `/api/auth/login`、数据库、JWT payload、Socket 协议和 Yjs 协议均未修改。灰度仍默认关闭；该变更只让前端能正确消费已存在的双轨登录响应。

## 生产灰度前置条件

1. 部署 v2.14.3 并确认 legacy 门禁仍关闭。
2. 在本地完成 legacy 与 allowlist 模拟登录、Cookie 刷新与浏览器恢复回归。
3. 重新完成 C3.3 的审批、运行态一致性和 readiness 检查后，才可申请新的生产观察窗口。

## 测试结果

- 通过：版本一致性、登录响应适配器、legacy Auth 冻结、Login Gateway、Auth Rollout、Web Runtime、Cookie/CSRF、Session、API Contract、Socket Bridge、Socket Coordinator、Yjs Recovery、类型检查、生产构建与 Auth 范围 lint（仅既有 Login 页面 1 条 Hook 依赖 warning）。
- 待环境修复后复跑：`test:auth-browser`。本机 Playwright 缺少与项目版本匹配的 Chromium，回退启动系统 Chrome 时被 macOS 以 `SIGABRT` 终止；未修改或绕过该浏览器测试。
