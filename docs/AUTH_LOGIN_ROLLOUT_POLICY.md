# XMT 正式 Login 双轨灰度准入策略

## 一、目标与边界

正式入口 `/api/auth/login` 保持兼容；本策略只提供准入决策，不直接改变 legacy 登录实现。legacy JWT、旧客户端持久化 Token、Socket/Yjs legacy 链路继续有效。

## 二、灰度模式

- `disabled`：关闭所有迁移决策，全部 legacy。
- `legacy`：明确保持 legacy，作为默认和回滚模式。
- `allowlist`：只允许经过双人复核的普通用户 ID。
- `percentage`：仅在单独批准、稳定分桶和完整观察窗口下使用；不会自动开启。

开关 `XMT_LOGIN_ROLLOUT_ENABLED` 默认 `false`。即使已有 Auth Web Rollout 配置，Login 未显式开启时仍全部 legacy。

## 三、用户准入规则

1. 只使用稳定 `userId`，不使用用户名、请求随机数或客户端声明。
2. 首批只允许普通 `member` 用户；`admin`、`director` 默认保护并保持 legacy。
3. allowlist 用户必须同时满足 v1 Auth、Web Auth 与 Login Rollout 开关及审批条件。
4. 每次名单变更必须双人复核、记录原因、固定观察窗口，不在窗口内自动扩大。
5. 登录后认证模式应在 Session 生命周期内保持稳定，避免请求间漂移。

## 四、Login Gateway 设计

逻辑入口保持：

`POST /api/auth/login` → Login Rollout Policy → legacy 或 v1-web 适配器。

当前阶段只实现 Policy 与 Gateway 接入准备；未改写 `/api/auth/login`，旧客户端仍得到原 JWT 结构和错误行为。

## 五、管理员保护

`admin`、`director` 默认不进入 v1-web；管理员诊断和灰度操作仍通过只读治理页面与审批流程完成，不因角色自动获得迁移资格。

## 六、回滚条件与观察窗口

出现登录失败、Refresh 失败率超阈值、CSRF 异常、Token reuse、Session 异常、Socket/Yjs 业务异常时，立即切换 `legacy` 并关闭 Login Rollout 开关。每批至少观察一个完整业务时段，正式扩大前保留 24 小时基线。

## 七、回滚结果

- 新登录立即回到 legacy。
- 已有 legacy JWT 继续有效。
- Session 数据保留，停止新的 v1-web Refresh 签发。
- Socket 继续使用 legacy 握手。
- 不删除 Session、Refresh、Auth Event 或审计记录。

## 八、责任人

技术负责人、安全负责人、业务负责人、值班执行人和 allowlist 双人复核人必须在上线前明确并留痕。未完成审批时，生产保持 legacy。

## 九、浏览器验证准备

测试矩阵包含：legacy 用户、allowlist v1 用户、混合标签页、Refresh 后 Socket 重握手、Room/Yjs 恢复、Logout 同步和回滚后 legacy 抽样。真实用户扩大前必须通过浏览器闭环与指标停止条件检查。
