# Auth 生产 Member Allowlist 灰度报告（v2.14.5）

## 结论

Phase 2-C3-8-C3.9 已按停止条件安全中止并完成回滚。生产已恢复 legacy，未扩大用户范围，未影响正式用户、数据库结构或 Yjs 协议。

中止原因：服务端对两个隔离测试账号均完成了 v1-web allowlist 分流、Session 创建和 `auth.login.success`，但真实项目 Chromium 页面在登录后仍停留于 `/login`，且未观察到前端 Auth Runtime 完成态。该情况属于“用户无法进入系统”停止条件。

## 时间窗口与审批

- 计划观察窗口：2026-08-03 14:41 CST 起 30 分钟
- 实际执行：提前中止并回滚
- 技术负责人：李庆（已确认）
- 安全负责人：李庆（已确认）
- 业务负责人：李庆（已确认）
- 值班执行人：李庆（全天）
- Allowlist 复核：李庆、刘启超（均已确认）

## 测试范围与运行态

- 生产版本：v2.14.5
- 生产提交：`840be73`
- 测试账号 ID：37、38（隔离 member，非正式业务账号）
- 灰度模式：固定 allowlist；未启用 percentage；未包含 admin / director。
- 启用时：Runtime endpoint 与 Gray Readiness 均为 `READY`，Auth v1、Auth Web、Login Rollout、Socket Bridge 均已生效，allowlist 为 2。
- 管理诊断接口为 admin-only；本轮遵守禁止使用 admin 的约束，未绕过该权限。

## 真实 Chromium 验证

| 验证项 | 结果 | 说明 |
| --- | --- | --- |
| Login Gateway allowlist 分流 | 通过 | 两个测试账号均命中 `v1-web`。 |
| Auth v1 Session 创建 | 通过 | 服务端审计记录两个 Session 创建与两个 `auth.login.success`。 |
| 登录后首页导航 | 未通过 | 两个账号均停留在 `/login`。 |
| Auth Runtime 完成态 | 未通过 | 浏览器未观察到完成态。 |
| 页面刷新 / 新标签恢复 / Refresh | 未执行 | 登录完成态失败后立即停止。 |
| Socket / Yjs / Version Sync | 未执行 | 不在异常状态下继续扩展验证。 |

## 指标与风险

- `auth.login.success`：2（账号 ID 37、38 各 1）
- Refresh、CSRF、Token reuse：未进入验证步骤，未记录本轮业务结果
- Socket、Yjs、Version Sync：未执行
- 数据库快检：`ok`
- API 健康：正常
- PM2 / Caddy：回滚后正常

需要在重新申请灰度前定位：生产静态前端实际加载的 Login 完成态代码与 v2.14.5 构建产物是否一致，以及 v1 响应适配至 Runtime 写入之间是否存在浏览器运行时异常。

## 回滚与清理

已执行：

1. 关闭 Auth v1、Auth Web、Login Rollout、Socket Bridge 及其审批门禁，并受控 reload PM2。
2. Runtime endpoint 确认为 `legacy`，allowlist 为 0。
3. 禁用测试账号 ID 37、38，撤销其测试 Session，并保留 Auth Event、Session 和 activity_log 审计。
4. 删除本机与生产服务器上的临时凭据；浏览器上下文已关闭。

## 后续建议

在下一次生产灰度前，先新增“生产构建产物 + 真实 Chromium”的 v1 登录运行时诊断：记录无敏感的响应模式、适配结果、Runtime 状态和路由转换结果，以定位本轮服务端成功但前端完成态未出现的断点。
