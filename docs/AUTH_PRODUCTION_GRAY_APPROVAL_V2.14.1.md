# Auth 生产 Member Allowlist 灰度审批记录（v2.14.1）

> 阶段：Phase 2-C3-8-C3  
> 计划观察窗口：30 分钟；实际窗口未开启（准入检查未通过后已安全中止）。

| 角色 | 确认人 | 状态 |
| --- | --- | --- |
| 技术负责人 | 李庆 | 已确认 |
| 安全负责人 | 李庆 | 已确认 |
| 业务负责人 | 李庆 | 已确认 |
| 值班执行人 | 李庆 | 已确认 |
| allowlist 复核人 1 | 李庆 | 已确认 |
| allowlist 复核人 2 | 刘启超 | 已确认 |

## 执行记录

- 开始时间：2026-08-01 21:39 CST
- 结束时间：2026-08-01 21:41 CST
- 计划范围：仅 2 个新建、隔离的 enabled member 测试账号；不使用 admin、director 或正式业务账号。
- 停止条件：Auth v1、Login Gateway、Socket Bridge、测试账号或观察窗口任一准入项未达到 READY；以及任何 Refresh、CSRF、Token reuse、Socket/Yjs、版本同步或登录异常。
- 最终决定：准入检查为 NOT_READY，未开启有效灰度窗口并已恢复 legacy。

