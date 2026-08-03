# Auth 生产 Member Allowlist 灰度审批记录（v2.14.2）

> 阶段：Phase 2-C3-8-C3.3  
> 开始时间：2026-08-03 08:50 CST  
> 实际结束时间：2026-08-03 08:53 CST（登录停止条件触发后回滚）  
> 观察窗口：60 分钟。

| 角色 | 确认人 | 状态 |
| --- | --- | --- |
| 技术负责人 | 李庆 | 已确认 |
| 安全负责人 | 李庆 | 已确认 |
| 业务负责人 | 李庆 | 已确认 |
| 值班执行人 | 李庆 | 已确认 |
| allowlist 复核人 1 | 李庆 | 已确认 |
| allowlist 复核人 2 | 刘启超 | 已确认 |

## 灰度范围与停止条件

- 仅使用 2 个新建、隔离的 member 测试账号；禁止 admin、director 和正式业务账号。
- 仅 allowlist；禁止 percentage，禁止名单扩展。
- Refresh、CSRF、Token reuse、Socket/Yjs 协作、版本同步写入、服务健康或登录任一异常时，立即关闭全部门禁、重启至 legacy 并禁用测试账号。
- 观察窗口结束后主动回滚，保留 Auth Event、Session、Refresh 与 activity_log 审计记录。
- 执行结论：首个 allowlist 测试账号登录出现前端认证异常，未进入观察窗口；已按停止条件恢复 legacy。
