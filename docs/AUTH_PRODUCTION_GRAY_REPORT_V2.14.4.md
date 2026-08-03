# Auth 生产 Member Allowlist 灰度报告（v2.14.4）

## 结论

本次 Phase 2-C3-8-C3.6 灰度已按停止条件**安全中止并完成回滚**。未扩大用户范围，未影响正式用户、数据库结构或 Yjs 协议。

中止原因：服务端已将测试账号分流至 `v1-web` 并成功创建 Session，但真实 Chromium 登录页未完成进入系统的跳转，构成“用户无法登录”停止条件。因此未继续 Refresh、Socket、Yjs 与版本同步验证。

## 时间窗口

- 开始：2026-08-03 13:38（Asia/Shanghai）
- 结束：2026-08-03 13:40（Asia/Shanghai，提前中止）
- 计划观察窗口：30 分钟

## 审批与范围

- 技术负责人：李庆（已确认）
- 安全负责人：刘启超（已确认）
- 业务负责人：李庆（已确认）
- 值班执行人：李庆
- Allowlist 复核：李庆、刘启超（均已确认）
- 测试账号 ID：35、36（均为隔离 member，非正式业务账号）
- 灰度模式：固定 allowlist；未启用 percentage；未包含 admin / director。

## 运行态证明

启用前，运行态端点与 Gray Readiness 一致确认以下门禁已生效：

- Auth v1 / Auth Web：启用
- Login Gateway：allowlist 模式启用
- Socket Bridge：开关与审批门禁启用
- Allowlist：仅账号 ID 35、36
- Gray Readiness：`READY`

中止后已完成受控重载，运行态恢复：

- Auth v1 / Auth Web：关闭
- Login Gateway：关闭，模式为 `legacy`
- Socket Bridge：关闭，审批门禁关闭
- Allowlist：空
- Gray Readiness：`NOT_READY`（符合灰度关闭预期）

## 浏览器验证结果

| 验证项 | 结果 | 说明 |
| --- | --- | --- |
| Login Gateway 分流 | 通过 | 服务端确认测试账号命中 allowlist 且模式为 `v1-web`。 |
| Auth v1 Session 创建 | 通过 | 服务端记录 Session 创建及一次 `auth.login.success`。 |
| Chromium 登录完成跳转 | 未通过 | 页面仍停留在登录页，未进入系统。 |
| Refresh Cookie / 页面恢复 | 未执行 | 因停止条件触发。 |
| Socket Bridge / Coordinator | 未通过（未继续） | 登录页未进入系统；服务端记录一次该测试流程的 Socket `auth_invalid`。 |
| Yjs Recovery | 未执行 | 因停止条件触发。 |
| Version Sync | 未执行 | 未访问或修改任何生产业务内容。 |

## 指标与异常

本次真实浏览器尝试范围内：

- `auth.login.success`：1
- Refresh 成功 / 失败：0 / 0（未进入刷新步骤）
- CSRF 失败：0
- Token reuse：0
- Socket 认证异常：1（`auth_invalid`，随登录页未完成跳转一并触发）
- Yjs 错误：0（未进入协作）
- `version:superseded`：0
- `PRODUCTION_VERSION_SUPERSEDED` 409：0

未观察到数据库健康、PM2、Caddy 或 API 健康异常。回滚后 API 健康检查成功，PM2 `xmt-api` 为 online。

## 回滚与清理

已执行：

1. 关闭 Auth v1、Auth Web、Login Rollout、Socket Bridge 及其审批门禁，并受控重载 PM2。
2. 确认运行态为 legacy，正式用户继续使用 legacy 登录。
3. 禁用测试账号 ID 35、36，并撤销其测试 Session；保留 Session、Refresh、Auth Event 与 activity_log 审计记录。
4. 删除本机与生产服务器上的临时凭据文件；关闭浏览器验证页并清理运行时凭据引用。

## 后续建议

在重新申请生产灰度前，先在与生产构建一致的浏览器环境中修复并验证“v1 登录成功后前端完成认证状态写入与页面跳转”的链路；随后复测 Socket 认证上下文传递，再恢复本报告中未执行的 Refresh、Yjs 与版本同步闭环。
