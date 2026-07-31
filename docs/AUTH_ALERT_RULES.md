# XMT Auth 生产告警规则

## 适用范围

本规则以统一 Auth Event 派生的 Prometheus/OpenTelemetry 指标为准，不使用日志行数反推认证次数。规则仅用于告警和人工停止判断，不自动修改灰度配置。当前正式 Login 与生产灰度仍保持 legacy。

## 指标口径

- `xmt_auth_login_total{mode}`：成功认证次数，一次成功认证只增加一次。
- `xmt_auth_refresh_total`：Refresh 成功次数。
- `xmt_auth_refresh_failed_total`：Refresh 失败次数。
- `xmt_auth_logout_total`：成功退出次数。
- `xmt_auth_security_events_total{eventType,reason}`：CSRF、Token reuse、登录/Refresh 失败和异常过期等安全事件。
- `xmt_auth_active_sessions`：当前进程观测到的活跃 v1 Session；多实例需由监控端按实例处理，不能直接求和作为全局唯一会话数。
- `xmt_auth_refresh_duration_seconds`：Refresh 处理耗时直方图。

指标标签禁止包含用户 ID、Session ID、Token、密码、Cookie 或其他高基数敏感值。

## 建议告警规则

### Refresh 失败率

- 计算：`rate(xmt_auth_refresh_failed_total[5m]) / (rate(xmt_auth_refresh_total[5m]) + rate(xmt_auth_refresh_failed_total[5m]))`
- Warning：5 分钟请求量至少 20 次且失败率持续 5 分钟超过 5%。
- Critical：失败率持续 5 分钟超过 15%，或连续三个观察窗口上升。
- 动作：暂停扩大名单；Critical 时按运行手册切回 legacy。

### Token reuse

- 条件：`increase(xmt_auth_security_events_total{eventType="auth.token.reuse_detected"}[5m]) > 0`
- 等级：Critical，单次即告警。
- 动作：停止灰度、保存 requestId 对应日志、检查 Session 撤销链；禁止输出 Refresh Token。

### CSRF 异常

- Warning：`increase(xmt_auth_security_events_total{eventType="auth.csrf.failed"}[5m]) >= 3`。
- Critical：5 分钟达到 10 次，或多个实例同时出现明显上升。
- 动作：检查 Origin、CSRF Cookie/Header 契约和代理转发，不允许降级为跳过校验。

### Expired 异常

- 条件：`increase(xmt_auth_security_events_total{eventType="auth.session.revoked",reason!="logout"}[10m])` 超过运行基线。
- 初始 Warning 阈值：10 分钟 10 次；正式准入前按实际基线校准。
- 动作：检查 Session 过期、时钟、Refresh 轮换和撤销原因，区分主动 Logout 探针。

## 告警上线检查

1. Prometheus 或 OTel 后端能跨实例聚合，且实例标签可定位来源。
2. 抓取间隔、数据保留期、告警接收人和值班窗口已配置。
3. 使用测试事件验证 Warning/Critical 通知链，不制造生产 Token reuse。
4. 告警恢复条件、静默审批和回滚操作均记录 requestId 与责任人。
5. 外部监控中不出现 Token、密码、Cookie、用户 ID 或 Session ID。
