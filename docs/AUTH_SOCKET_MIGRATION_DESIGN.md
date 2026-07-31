# XMT Auth Socket/Yjs Bridge 迁移设计

## 一、目标与非目标

目标是在不把 Refresh Token 交给 Socket 的前提下，让 legacy 与 v1-web 用户共享现有 Socket.IO/Yjs 业务协议，并可从 Bridge 安全迁移到纯 v1 Socket。本设计不修改当前生产行为、不改变 Yjs wire event、不切正式 Login、不扩大灰度、不修改数据库。

## 二、SocketAuthContext 契约

```ts
type SocketAuthContext = {
  userId: number;
  sessionId: string | null;
  tokenType: 'legacy' | 'access';
  authMode: 'legacy' | 'v1-web';
  issuedAt: number;
  expiresAt: number;
};
```

- `userId`：最终认证用户 ID，v1 来自 `sub`，legacy 来自 `userId`。
- `sessionId`：v1 必须为 `sid`；legacy 为 null，禁止伪造兼容 Session。
- `tokenType`：显式区分 legacy 与短期 Access，禁止验证失败后跨验证器降级。
- `authMode`：由已经冻结的登录/Session 模式确定，不按请求随机推断。
- `issuedAt/expiresAt`：来自已验证 JWT 的秒级时间，仅用于生命周期控制。

Context 仅保存在服务器 `socket.data.auth` 和客户端内存协调器；不写 URL、query、日志、localStorage、sessionStorage、Yjs update 或 Awareness。Refresh Token、Refresh Cookie、CSRF Token 永不进入 Socket handshake 或事件。

## 三、Access Token 传递与 Handshake

客户端只通过 Socket.IO `auth` 传递：

```ts
auth: {
  token: '<short-lived-access-token>',
  mode: 'v1-web',
  contractVersion: 1,
}
```

- 禁止 query string，避免代理、访问日志和浏览器历史泄露。
- Authorization Header 仅保留 legacy 非浏览器兼容，v1 Web 统一 `auth.token`。
- Origin allowRequest、HTTPS、Secure Cookie 策略继续适用，但 Cookie 不用于 Socket 身份认证。
- 错误只返回稳定类别：`AUTH_REQUIRED/AUTH_INVALID/AUTH_EXPIRED/SESSION_INACTIVE/USER_DISABLED`，不得泄露 Token 或 Session 细节。

Bridge middleware 按显式 `mode` 分支：

```text
legacy -> verifyToken -> users requery -> SocketAuthContext(legacy)
v1-web -> verifyAccessTokenV1 -> SessionService.getSession(ACTIVE)
       -> session.userId == token.sub -> users requery enabled/role
       -> SocketAuthContext(access)
```

禁止“先试 v1，失败再试 legacy”或反向 fallback。两类 Token 当前共用签名密钥，更必须依靠 payload contract、issuer/audience/type 和显式 mode 防止 token confusion。

## 四、Socket Coordinator

前端新增独立 Coordinator（后续实施阶段）：

- legacy 模式继续从 Zustand token 建连，行为不变。
- v1-web 模式只从 Auth Runtime 的内存 Access Token 建连。
- 维护连接状态 `idle/connecting/authenticated/refreshing/reconnecting/expired`。
- 记录显式业务订阅和 collaboration room 描述，不记录 Token 原文。
- Token 更新时先暂停新的业务 emit，设置 `socket.auth`，主动 disconnect/connect 完成新 handshake；只修改变量不算重新认证。
- 用户切换或 logout 必须销毁 Socket、订阅、Provider、Y.Doc、Awareness 与待发送上下文。

## 五、Token 刷新策略

1. Coordinator 根据 `expiresAt` 在到期前留出抖动窗口请求 HTTP Runtime 单飞 Refresh。
2. HTTP Refresh 使用 HttpOnly Cookie + CSRF；Socket 不参与 Refresh。
3. 成功后 Runtime 发布内存 `accessTokenUpdated`，Coordinator 执行受控重连。
4. 握手返回 AUTH_EXPIRED 时只允许触发一次单飞 Refresh；原连接不进行无限重试。
5. Refresh 失败进入 expired，停止业务发送、清除认证内存，并由统一 UI 要求重新登录。
6. 服务器不在长连接中接受“替换 token”事件，避免未经完整 middleware 的半认证状态。

服务端应根据 `expiresAt` 设置连接到期定时器，在短暂 grace 后主动断开 v1 Socket；Session revoke/logout-all/密码修改的主动断开可在后续通过 `sid -> socketId` 内存索引实现，不新增数据库结构。

## 六、断线重连与 Room 恢复

重连顺序必须固定：

```text
Runtime 确认 Access 可用
  -> Socket 新 handshake
  -> 自动 user/admin room
  -> Coordinator 重放业务 public rooms
  -> Provider 幂等重放 collaboration room
  -> 收到 Yjs SYNC
  -> 恢复 Awareness/typing/lock
  -> 打开业务发送门闩
```

- Room registry 使用稳定 room key 去重，JOIN/LEAVE 必须幂等。
- Collaboration JOIN 的 `user` 必须由服务端 `socket.data.user` 生成或覆盖；客户端只可提供颜色等非权限展示建议。
- 文档 Room 准入必须复用业务权限/数据归属判断，不能只检查 roomId 非空。
- 重连退避需带 jitter 和上限；Refresh 与 Socket reconnect 各自单飞，不形成互相触发的循环。

## 七、Yjs 状态恢复

- Auth 重连不得销毁同一用户、同一文档的 `Y.Doc`；先冻结发送，保留本地 CRDT 状态。
- 新连接 JOIN 后交换服务端状态，目标实现应升级为 state vector/diff；Bridge 首期可兼容当前全量 SYNC，但不改变事件名。
- SYNC 应用完成后，本地 Y.Doc 自动生成缺失差异，再恢复 update flush。
- 对已 emit 未 ACK 的 update，不依赖数组队列是否仍存在；通过 state vector 证明服务端最终包含本地状态。
- Awareness 为临时状态，认证重连后重新发布；不得作为文档事实恢复。
- 锁与只读状态由服务端重新下发，客户端重连期间默认不可写关键业务动作。
- 用户切换必须销毁旧 Y.Doc，防止跨用户内容和 Awareness 泄露。

## 八、多标签页

- 每个标签可保留独立 Socket/Y.Doc，但 Refresh Cookie 轮换必须复用既有 BroadcastChannel/Web Locks 协调方案。
- 一个标签 Refresh 后广播“Access 已更新”信号，而不广播 Token 原文；其他标签通过自己的 Runtime 恢复后重连。
- Logout 广播 session 失效，所有标签销毁 Socket/Provider。
- 同一文档多个标签产生不同 Yjs clientId，服务端 presence 必须按 socket/client 区分，业务用户统计需按 userId 去重。

## 九、Legacy → Bridge → v1 迁移

### 阶段 0：Legacy Socket

保持当前 middleware、useSocket 与 Yjs 行为，增加契约测试夹具但不挂生产分支。

### 阶段 1：Bridge 暗启

- 抽取纯函数 Token 分类与 `SocketAuthContext` mapper。
- 新 middleware 在 feature flag 关闭时只执行 legacy 分支。
- 测试环境显式启用 v1-web，验证 Session ACTIVE、用户 enabled 与 identity binding。
- v1 用户仅限不依赖关键协作写入的专用账号。

### 阶段 2：Bridge Allowlist

- 与 HTTP allowlist 使用同一冻结 authMode，不单独扩大 Socket 范围。
- 完成 Refresh 重连、Room/Yjs 恢复、logout 撤销与外部指标观察。
- 每个观察窗口内不扩大名单，异常立即回 legacy。

### 阶段 3：v1 Socket

只有 legacy Socket 使用量归零、正式 Login 已批准、Socket/Yjs 指标稳定后才讨论移除兼容分支；不得在本阶段删除 legacy。

## 十、回滚

1. 关闭 Socket Bridge v1 分支，新建连接只接受 legacy。
2. 停止新的 v1 Login 准入；已存在 v1 Socket 主动断开并提示用户重新走 legacy 登录，禁止静默重放密码。
3. 保留 Session、Refresh 与 Auth Event，不删除审计事实。
4. 旧 legacy JWT 与 Socket middleware 继续工作。
5. 同一用户回滚时销毁 v1 Provider/Y.Doc 后重新创建 legacy 上下文，避免跨模式复用内存状态。
6. Yjs 数据异常时停止协作写入、保留本地状态与 snapshot 证据，先恢复只读访问。

## 十一、观测建议

后续实施应增加不含 Token 的事件：handshake success/failed、reauth、disconnect auth_expired、session_inactive、room_restore、yjs_resync。标签只允许 authMode、tokenType、reason、instance；禁止 userId、sessionId、roomId 和 requestId 作为指标标签。

## 十二、实施门禁

- `SocketAuthContext` 共享类型与 Zod/运行时校验冻结。
- 服务端 v1 验证必须检查 token + ACTIVE Session + enabled user 三者一致。
- Collaboration identity binding 与 Room 权限检查先于 v1 协作灰度。
- Refresh/重连单飞、到期断开、logout 撤销和多标签测试全部通过。
- Yjs 断线连续编辑验证最终状态一致且无跨用户内存复用。
- 生产仍需明确负责人、allowlist 双人复核、停止阈值和 legacy 回滚演练。
