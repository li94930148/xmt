# Auth 生产 Member Allowlist 灰度审批记录（v2.14.4）

## 审批信息

| 角色 | 人员 | 状态 |
| --- | --- | --- |
| 技术负责人 | 李庆 | 已确认 |
| 安全负责人 | 刘启超 | 已确认 |
| 业务负责人 | 李庆 | 已确认 |
| 值班执行人 | 李庆 | 已确认，今天全天值班 |
| allowlist 复核人 1 | 李庆 | 已确认 |
| allowlist 复核人 2 | 刘启超 | 已确认 |

## 观察窗口

- 开始时间：2026-08-03 当前执行时刻。
- 窗口长度：30 分钟。
- 范围：仅 2 个隔离、非正式业务 member 测试账号；固定用户 ID allowlist。

## 停止条件

任一条件出现即停止并切回 legacy：登录成功率异常下降、Refresh 失败异常、持续 CSRF 失败、Token reuse、Socket 连接异常、Yjs 同步失败、版本同步异常、SQLite 异常，或 PM2 / Caddy / API 健康异常。

## 强制边界

- 禁止 percentage 模式、admin/director 与正式用户进入灰度。
- 禁止扩大用户范围、修改数据库结构或修改 Yjs 协议。
- 结束后必须关闭全部 Auth 门禁、禁用测试账号、删除临时凭据并保留 Auth Event、Session 与活动审计。
