# XMT Auth 灰度运行手册

## 适用范围

本手册用于 Web Auth 内部灰度的上线前检查、观察、停止和配置回滚。当前正式登录仍使用 `/api/auth/login`，生产 v1-web 未开放。本手册不授权修改 Login、Socket/Yjs、Caddy、Cookie 安全属性或数据库结构。

## 一、上线前检查

- [ ] 本次灰度账号均为明确的内部用户 ID，不使用用户名、角色或临时随机比例代替名单。
- [ ] 技术负责人、安全负责人、业务负责人和值班执行人均已确认姓名、联系方式和当班时间。
- [ ] `XMT_AUTH_ROLLOUT_MODE` 默认保持 `legacy`，目标 allowlist 已经双人复核。
- [ ] v1/Web 双开关、Refresh Pepper、CSRF Secret、受信 Origin 和 Secure Cookie 配置已在非生产验证。
- [ ] `npm run test:auth`、Rollout、Runtime、Cookie、浏览器、API Contract 和构建均通过。
- [ ] 管理员可访问 `/admin/auth-rollout`，且页面没有配置修改入口。
- [ ] legacy 登录、退出和 JWT 验证已经抽样验证。
- [ ] 回滚配置、发布方式和最近一次备份状态已核对。
- [ ] Socket/Yjs 未迁移的业务限制已经向测试账号说明。

任一项目未完成，不得开始内部账号灰度。

## 二、灰度步骤

1. 保持模式为 `legacy`，记录上线前 60 分钟基线指标。
2. 将目标内部普通账号 ID 写入 allowlist，由第二位负责人复核配置差异。
3. 仅在批准的非生产或后续明确授权环境将模式设为 `allowlist`；不得使用 `percentage`。
4. 重启后在只读页面核对当前模式、名单数量和目标用户命中原因。
5. 测试账号依次验证登录、页面刷新、并发请求、主动退出和重新登录。
6. 观察至少一个完整业务时段；期间不得扩大名单。
7. 观察窗口结束后由技术、安全、业务负责人共同决定继续、回滚或延长观察。

## 三、观察指标

重点观察最近 60 分钟与 24 小时：

- legacy 与 v1 登录次数及成功趋势。
- Refresh 成功、失败和失败率。
- CSRF 失败次数。
- Token reuse 检测次数。
- Logout 成功次数。
- Expired 次数及重复登录反馈。

进程内指标会在重启时清零。正式灰度前必须接入外部聚合与告警，不能只依赖当前页面。

## 四、停止条件

任一安全高风险事件立即停止新准入：Token 泄露、跨用户会话、CSRF 绕过、Refresh 一次性消费失效或协作数据异常。

配置阈值包括：

- Refresh 失败率高于 `XMT_AUTH_ROLLOUT_MAX_REFRESH_FAILURE_RATE`。
- CSRF 失败次数高于 `XMT_AUTH_ROLLOUT_MAX_CSRF_FAILURES`。
- Token reuse 次数高于 `XMT_AUTH_ROLLOUT_MAX_TOKEN_REUSE`。
- Expired 次数高于 `XMT_AUTH_ROLLOUT_MAX_EXPIRED`。

风险事件只提示，不自动改配置。值班执行人必须立即通知责任人并启动回滚判断。

## 五、回滚流程

1. 将 `XMT_AUTH_ROLLOUT_MODE` 切回 `legacy`；安全紧急情况可使用 `disabled`。
2. 双人确认配置差异并重新部署或重启服务。
3. 在只读页面确认 mode、enabled 和目标用户诊断均已回到 legacy。
4. 验证 `/api/auth/login`、legacy JWT 和关键只读业务接口继续可用。
5. 保留 `auth_sessions` 与 `auth_refresh_tokens`，不得删表或清除安全审计事实。
6. 根据风险类型决定既有 v1 Session 自然到期或显式撤销；不要静默重放用户密码。
7. 记录 actor、before、after、reason、created_at，并保存相关 requestId 和外部监控证据。
8. 在复盘完成并重新批准前，不得恢复或扩大灰度。

## 六、责任人清单

| 角色 | 职责 | 上线前必须填写 |
| --- | --- | --- |
| 技术负责人 | 版本、配置、部署和回滚决策 | 姓名、电话、在线时段 |
| 安全负责人 | CSRF、Token reuse、泄露与停止判断 | 姓名、电话、在线时段 |
| 业务负责人 | 测试账号、业务窗口和用户沟通 | 姓名、电话、在线时段 |
| 值班执行人 | 指标观察、事件升级和操作记录 | 姓名、电话、值班时间 |
| 复核人 | allowlist 与回滚配置双人复核 | 姓名、电话 |

责任人信息未填写完整时，灰度状态必须保持 legacy。
