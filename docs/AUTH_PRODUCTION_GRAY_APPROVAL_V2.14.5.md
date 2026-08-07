# Auth 生产 Member Allowlist 灰度审批（v2.14.5）

## 灰度范围

- 版本：v2.14.5
- 提交：`840be73`
- 模式：固定 member allowlist（禁止 percentage）
- 账号数量：2 个隔离测试账号
- 观察窗口：30 分钟

## 审批记录

| 角色 | 姓名 | 状态 |
| --- | --- | --- |
| 技术负责人 | 李庆 | 已确认 |
| 安全负责人 | 李庆 | 已确认 |
| 业务负责人 | 李庆 | 已确认 |
| 值班执行人 | 李庆（全天） | 已确认 |
| Allowlist 复核人 1 | 李庆 | 已确认 |
| Allowlist 复核人 2 | 刘启超 | 已确认 |

- 开始时间：2026-08-03 14:41 CST
- 结束时间：开始后 30 分钟

## 停止条件

出现任一情况立即关闭 Auth v1、Auth Web、Login Rollout 与 Socket Bridge，并受控 reload 恢复 legacy：

- 登录失败或成功率异常下降；
- Refresh、CSRF 或 Token reuse 异常；
- Socket、Yjs 或版本同步异常；
- 数据库、PM2、Caddy 或 API 健康异常。

## 安全约束

- 仅允许专用、enabled 的 member 测试账号；
- 禁止 admin、director、正式业务账号和 percentage 模式；
- 禁止在报告、Git 或日志中记录明文密码、Token、Cookie 或 Session secret；
- 测试结束后恢复 legacy、禁用测试账号并删除临时凭据。
