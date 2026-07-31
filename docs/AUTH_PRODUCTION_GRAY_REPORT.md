# XMT Auth 生产环境受控灰度测试报告

## 一、测试时间

- 执行日期：2026-07-31
- 实际灰度开始：13:53（Asia/Shanghai）
- 观察结束：14:26（Asia/Shanghai），实际持续约 33 分钟
- 责任人：技术、安全、业务和值班执行均由李庆确认
- allowlist 复核：李庆、刘启超

## 二、生产版本

- 版本：`v2.13.12`
- 提交：`eaeb694`
- 部署前数据库备份：`xmt-20260731-133914.db`
- 账号操作前数据库备份：`xmt-auth-gray-20260731-1342.db`，约 240 MB

## 三、测试账号数量

共 3 个隔离的普通 member 测试账号，用户 ID 为 25、26、27。账号均为 enabled，不具备 admin 或 director 角色；随机密码仅保存在生产 root-only 临时记录中，未提交 Git、未写入本报告。

## 四、灰度配置

- 模式：`allowlist`
- 独立批准：开启
- allowlist：仅用户 ID 25、26、27
- `internal` 与 `percentage`：生产硬门禁禁止
- 非名单抽样：不命中 v1-web
- 正式 Login、legacy JWT、Socket/Yjs：未切换

## 五、浏览器验证结果

三个账号均通过真实生产域名、无头 Chrome 验证：v1 登录、页面刷新、新标签页、关闭上下文后恢复、并发刷新单飞、Session 查询、主动退出、撤销后拒绝访问及重新登录。

## 六、Cookie 验证结果

- Refresh Cookie：HttpOnly、Secure、SameSite=Lax、Path=/ 均符合冻结契约。
- CSRF Cookie：可用于 double-submit 校验且不是 HttpOnly。
- Logout 后 Refresh 与 CSRF Cookie 均被清除。
- 登录、刷新响应均使用 `Cache-Control: no-store`。

## 七、Refresh 结果

- 页面刷新、新标签页和浏览器上下文重建后的 Cookie Refresh 均成功。
- 五个并发恢复请求通过单飞锁只触发一次 Refresh。
- 未主动制造生产 Token reuse 或 CSRF 攻击事件。

## 八、Logout 结果

- 三个账号各执行两次登录与退出。
- 共 6 个 Session 均已撤销。
- Logout 后旧 Access Token 查询 Session 返回 401。
- 认证数据与审计记录保留，未删除 Session 或 Refresh Token 记录。

## 九、指标数据

- v1 成功登录：6 次（3 个账号各登录、重新登录一次）。
- Refresh 成功：12 次。
- Refresh 失败：0 次。
- CSRF 失败：0 次。
- Token reuse：0 次。
- Logout 成功：6 次。
- Expired/Session revoked 验证：3 次，均为 Logout 后主动使用旧 Access Token 的预期 401 探针。
- 健康观察：31 个连续样本，内部 `/api/health` 与外部 HTTPS 首页均为 200，PM2 全程 online。
- 错误扫描：Socket connection error、SQLite、未处理异常、Yjs 新错误均为 0。

## 十、异常记录

- 浏览器闭环阶段未发现登录、Cookie、Refresh、Logout 或 Session 异常。
- 结构化日志统计到 8 条 login 事件，而浏览器成功登录及新增 Session 均为 6 次；这反映当前不同认证层的日志事件口径可能重复。功能结果不受影响，但扩大灰度前应统一指标去重口径。
- Socket/Yjs 未迁移，本轮只观察副作用，不进行协作数据写入。
- 依赖审计的既有漏洞不属于本轮灰度新增问题，仍需单独安全治理。

## 十一、最终结论

本轮三个隔离 member 账号的生产 Auth v1-web 灰度验证通过。测试结束后已恢复 `legacy`、关闭批准及 v1/Web 开关，v1 路由恢复 404；三个测试账号已标记 disabled。6 个 Session 全部撤销，认证表与审计记录保留。当前不扩大名单、不进入 percentage。

## 十二、下一阶段建议

在正式用户迁移前补齐外部持久指标与告警、独立值班责任、生产 Login 准入策略和 Socket/Yjs 会话迁移；不得直接扩大为 percentage。
