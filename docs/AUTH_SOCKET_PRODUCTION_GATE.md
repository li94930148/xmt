# XMT Production Socket Bridge 受控门禁

## 开启条件

生产 v1 Socket 只在以下条件同时满足时允许：

1. `XMT_SOCKET_AUTH_BRIDGE_ENABLED=true`。
2. `XMT_SOCKET_BRIDGE_APPROVED=true`。
3. Login Rollout 已开启、模式为 `allowlist`、并已完成生产审批。
4. 当前用户是 allowlist 中的 enabled 普通 member；`admin` 与 `director` 固定走 legacy。

任一条件不满足时，Socket middleware 强制走 legacy。v1 Access Token 不会降级解释为 legacy JWT，避免凭据混淆。

## 诊断

管理员通过 `/api/v1/auth-rollout/status` 查看：

- `socketBridgeEnabled`
- `socketBridgeApproval`
- `socketV1EligibleUserCount`
- `currentMode`

其中名单计数来自 Login allowlist 配置；实际连接仍会复查用户角色、enabled 状态、v1 Session 和 Token。

## 上线前检查

部署服务器执行 `npm run auth:production-preflight`，必须确认版本、commit、SQLite `quick_check`、最近备份、Login Rollout 和 Socket Bridge 门禁均符合预期。脚本只读，不输出密码、Token、Cookie 或 Pepper。

## 回滚

将 `XMT_SOCKET_AUTH_BRIDGE_ENABLED=false` 或 `XMT_SOCKET_BRIDGE_APPROVED=false`，随后重启服务。新连接立即回 legacy；已存在 v1 Socket 按断线重连策略重新握手。保留 Session、Refresh Token、事件和审计记录，不执行删除或数据库回滚。

## 观察窗口

首批只允许经批准的少量 member 测试账号，固定观察 30–60 分钟；不得使用 percentage 或扩大名单。观察登录/刷新、Socket 错误、Room 重连、Yjs 状态向量、Awareness、Lock、Logout 与 Token reuse。异常立即关闭 Bridge 与 Login Rollout，验证 legacy 登录及 Socket。
