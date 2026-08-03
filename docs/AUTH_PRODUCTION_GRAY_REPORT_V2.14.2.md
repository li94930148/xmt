# Auth 生产 Member Allowlist 灰度报告（v2.14.2）

## 结论

Phase 2-C3-8-C3.3 在首个生产浏览器登录验证时触发停止条件并已安全回滚。未进入 60 分钟观察窗口，未执行 Socket、Yjs 或版本同步验证，未向正式用户开放。

## 执行范围

- 时间：2026-08-03 08:50–08:53 CST
- 生产版本：`v2.14.2`
- 生产提交：`d5b1e3d`
- 测试账号：2 个新建的隔离 member 账号（ID：33、34）；不含 admin、director 或正式业务账号。
- 凭据：仅用于本次浏览器登录；未写入 Git 或报告，已从生产与本机删除。

## 门禁与运行态证明

受控重启后，实际 PM2 运行态、内部端点和 readiness 一致：

| 项目 | 结果 |
| --- | --- |
| Auth v1 / Auth Web | enabled |
| Login Gateway | enabled，`allowlist` |
| Socket Bridge | enabled 且已审批 |
| allowlist | 2 个 member（ID 33、34） |
| 观察窗口 | 60 分钟 |
| `auth:gray-readiness` | `READY` |

## 浏览器验证与停止原因

第一个 allowlist member 在生产登录页提交正确凭据后，页面显示“当前服务暂时不可用”，因此立即停止。

代码审计确认根因：Login Gateway 将 allowlist 用户交给 v1 Web Controller 后，响应为 v1 API Contract envelope（`success`、`data`、`requestId`）；当前 `src/api/auth.ts` 与 `Login.tsx` 仍按 legacy `{ user, token }` 格式处理 `/api/auth/login` 的响应。前端随后无法取得预期字段并将异常归类为服务不可用。

这说明 Login Gateway 的服务端分流已生效，但 Web 登录入口尚未完成 v1 响应适配；在此修复前，不允许再次开启生产 allowlist。

## 未执行范围

- Refresh Cookie、页面刷新与新标签恢复。
- Socket Bridge、Socket Coordinator、Room 恢复。
- Yjs 同步与恢复。
- `version:superseded`、旧版本锁定和 409 写入保护验证。
- 60 分钟指标观察与主动回滚演练（停止条件触发后直接回滚）。

## 回滚结果

- 已关闭 Auth v1、Auth Web、生产审批、Login Rollout、Socket Bridge 及其审批。
- PM2 已受控重启；内部运行态确认 `legacy`、allowlist 为 0、所有有效门禁为 `false`。
- 两个测试账号均已 disabled，并写入 activity_log；Session、Refresh、Auth Event 审计记录保留。
- SQLite `quick_check = ok`，生产健康接口正常。

## 下一步建议

先实施 Web Login Gateway v1 响应适配：在前端按灰度模式识别并处理 v1 Contract，使用内存 Access Token 与 Auth Runtime；legacy 用户继续保持 `{ user, token }`、local/session storage 与 7 天 JWT 行为不变。完成本地与真实浏览器回归、部署和新的审批后，再重新申请 C3.3 灰度窗口。
