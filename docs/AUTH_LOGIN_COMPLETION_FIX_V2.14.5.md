# Auth v1 登录完成态修复报告（v2.14.5）

## 问题原因

登录响应已被正确识别为 v1，但登录后的 Layout 初始化仍把 v1 Access Token 发送到仅接受 legacy JWT 的 `/api/auth/me`。401 响应触发 logout，导致真实浏览器停留或返回登录页。

## 修复内容

- Auth Runtime 增加 `authenticating`、`redirecting` 与 `loginCompleted` 显式状态；
- v1 登录通过单一 `completeWebLogin()` 完成 Runtime 和应用认证状态写入；
- Layout 在 `v1-web` 模式使用已验证的登录用户，不再调用 legacy `/api/auth/me`；
- “记住密码”保存异常不再中断已完成的登录；
- 增加仅开发/测试环境的无敏感诊断事件；
- 增加项目 Playwright Chromium 的 legacy / v1 登录导航回归。

## 验证

- TypeScript 检查通过；
- Auth Web Runtime 测试通过；
- Login response adapter 测试通过；
- 真实项目 Playwright Chromium：legacy 登录与 v1 登录均完成首页导航；
- 测试还确认 v1 流程不会调用 legacy `/api/auth/me`。

## 重新灰度前置条件

1. 发布 v2.14.5 后，在生产仍保持 legacy 的前提下完成只读预检。
2. 使用项目 Playwright Chromium 复跑完整浏览器回归。
3. 重新审批后，仍仅以 member 固定 allowlist 开启灰度。
4. 本次未开启任何生产灰度开关，也未创建生产测试账号。
