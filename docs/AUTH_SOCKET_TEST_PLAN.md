# XMT Auth Socket/Yjs Bridge 测试计划

## 一、测试原则

测试分为纯契约、临时数据库集成、真实浏览器和受控灰度四层。所有自动测试使用临时数据库和专用用户；Refresh Token 不进入 Socket、日志或测试快照。生产禁止主动制造 Token reuse 或协作数据冲突。

## 二、认证契约测试

| 场景 | 预期 |
| --- | --- |
| legacy token + legacy mode | 连接成功，Context 的 sessionId=null、tokenType=legacy |
| v1 Access + v1-web mode + ACTIVE Session | 连接成功，sub/sid 与用户/Session 一致 |
| v1 Token 送 legacy mode | 拒绝，不 fallback |
| legacy Token 送 v1-web mode | 拒绝，不 fallback |
| Refresh Token/随机字符串 | 统一 AUTH_INVALID，不泄露原因细节 |
| Access 过期、Session revoked/expired、用户 disabled | 拒绝连接 |
| Session user 与 token sub 不同 | 拒绝并记录安全事件 |
| role 在 Token 与数据库不同 | 使用数据库当前 role |

断言 `SocketAuthContext` 仅包含 userId/sessionId/tokenType/authMode/issuedAt/expiresAt，不含 Token 原文、Refresh、Cookie、密码或 role 权限快照。

## 三、登录后 Socket 连接

1. legacy 登录后建立 legacy Socket，既有消息、公共 Room 与协作入口不变。
2. v1-web 登录后使用内存 Access 建立 Bridge Socket。
3. 验证 Origin、polling/websocket 允许矩阵和错误码。
4. 自动 user room 与 admin room 使用数据库当前身份；普通 member 不进入 admin room。
5. Collaboration presence 中 userId/name/role 由服务端认证身份决定，伪造 payload 无效。

## 四、Access Token 到期与 Refresh

- 临期刷新：仅一次 HTTP Refresh、仅一次新 handshake，业务 emit 在同步门闩前暂停。
- 握手 AUTH_EXPIRED：触发一次 Refresh；失败进入 expired，不循环。
- 连接期间 Token 到期：服务端 grace 后断开；客户端先刷新再重连。
- Refresh 成功但 Socket handshake 失败：保留 HTTP authenticated，Socket 独立显示 degraded 并有限退避。
- Session revoke/logout-all/password change：旧 Socket 被断开，新握手拒绝。

## 五、断网与 Room 恢复

覆盖短断网、长断网、服务端重启、标签页休眠/唤醒和网络切换：

1. 新 handshake 成功后才恢复 Room。
2. user/admin/public/collaboration Room 各自只 JOIN 一次，重复事件幂等。
3. disconnect 清理旧 socketId presence；重连不会出现幽灵用户。
4. 恢复期间 typing=false，锁和只读状态重新获取。
5. 超过重连上限后明确 degraded/expired，不产生刷新风暴。

## 六、Yjs 恢复与冲突测试

- 断网前 A/B 两端同步基线。
- A 断网连续编辑，B 在线编辑，A 恢复后通过状态向量/差异同步达到相同最终文档。
- 在 update emit 后立即断网，验证服务端最终仍包含该 CRDT 更新或客户端重新补发。
- 重复 JOIN/SYNC/UPDATE 不造成内容重复；CRDT 文档 hash/state vector 最终一致。
- Awareness、光标、typing 可丢弃并重建，不污染文档事实。
- 锁定期间离线编辑不得越过服务端只读判断；冲突进入明确恢复流程。
- 用户 logout/切换后旧 Y.Doc、Awareness、pending update 无法被新用户读取或发送。

## 七、多标签页

- 两个标签同一用户、同一文档：不同 Yjs clientId，内容最终一致。
- 一个标签 Refresh：其他标签不复用旧 Refresh，不广播 Access Token 原文。
- 一个标签 Logout：所有标签清理 Socket、Provider 和 Runtime。
- 两个标签同时遇到 Access 过期：跨标签 Refresh 协调不产生 token reuse。
- 一个标签关闭后 presence 正确清理，不影响另一个标签。

## 八、回滚测试

1. Bridge flag 关闭后 v1 Socket 拒绝、legacy Socket 仍连接。
2. HTTP Rollout 回 legacy 后新用户只获得 legacy Socket 模式。
3. 已有 v1 Socket 按策略断开，不转换或持久化 v1 Token。
4. legacy JWT、消息通知、公共 Room、Socket/Yjs 基础编辑回归通过。
5. 回滚不删除 Session、Refresh、Auth Event 或协作 snapshot。

## 九、观测与停止断言

- handshake、reauth、auth-expired、session-inactive、room-restore、yjs-resync 指标各行为只计一次。
- Token、Cookie、userId、sessionId、roomId 不作为外部指标标签。
- Refresh 失败、Session 身份不一致、跨用户 Y.Doc 或更新丢失立即停止灰度。
- Socket 错误率、重连次数、Yjs resync 延迟和最终一致性需形成基线。

## 十、建议自动测试文件

- `tests/auth/socket-auth-contract.test.ts`
- `tests/auth/socket-auth-bridge.test.ts`
- `tests/auth/socket-auth-browser.test.ts`
- `tests/collaboration/yjs-auth-recovery.test.ts`

本阶段只冻结测试计划，不创建或接入生产测试实现。
