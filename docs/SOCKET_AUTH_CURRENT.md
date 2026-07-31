# XMT Socket/Yjs 当前认证审计

## 文档边界

本文基于 `v2.13.15` 代码审计当前 Socket.IO 与 Yjs 认证链路，仅记录事实，不修改生产 Socket、Yjs 协议、正式 Login、数据库或灰度配置。

## 一、当前 Socket Handshake

```text
useAuthStore.token（legacy JWT）
  -> useSocket()
  -> socket.io-client auth.token
  -> polling /socket.io（withCredentials=true）
  -> Socket.IO allowRequest 校验 Origin
  -> io.use 认证 middleware
  -> verifyToken（legacy JWT）
  -> SELECT users by payload.userId
  -> 检查 enabled，读取当前 role/name
  -> socket.data.user
  -> user/admin/public/collaboration rooms
```

- 客户端主来源是 `socket.handshake.auth.token`；服务端兼容读取 `Authorization: Bearer` Header。
- Token 由 Zustand legacy Auth Store 提供，来自 localStorage 或 sessionStorage 恢复链。
- 客户端当前只启用 polling、禁用 transport upgrade，自动重连最多 5 次，间隔 1 秒。
- Socket 创建条件是 `isLoggedIn && user && token`；用户或 Token 改变时销毁旧全局 Socket 并创建新连接。
- Refresh Cookie 虽因 `withCredentials` 随请求发送，但服务端 Socket 认证不读取 Cookie，也不允许 Cookie充当握手凭据。

## 二、服务端认证 Middleware

`api/app.ts` 的 `io.use`：

1. 从 `auth.token` 或 Authorization Header 读取字符串。
2. 调用 legacy `verifyToken()`，只验证现有 JWT 签名/有效期。
3. 使用 payload 的 `userId` 重新查询 `users`。
4. 拒绝不存在或 `enabled != 1` 的用户。
5. 将数据库最新 `id/username/role/name` 写入 `socket.data.user`。

优点是握手不直接信任 JWT 中的 role，并能在新连接时发现禁用用户。限制是认证只发生在 handshake：长连接期间不复验 JWT 到期、Session 撤销、用户禁用或角色变化。

v1 Access Token 使用 `sub/sid/jti/type/iss/aud/iat/exp`，没有 legacy `userId` 字段。当前 middleware 不调用 `verifyAccessTokenV1()`，因此不能建立 v1 Socket 身份。

## 三、连接后的 Room

- 连接成功自动加入 `user_{userId}`。
- admin/director 自动加入管理员 Room。
- 通用 `join/leave` 只接受 `PUBLIC_SOCKET_ROOMS`。
- Collaboration 使用独立 `collaboration:join/leave/heartbeat/update/...` 事件。
- 断开时 `leaveAllRooms()` 清理服务器运行时 presence。

当前 Collaboration JOIN 接受客户端 payload 中的 `roomId` 和 `user`。Presence 的用户资料没有与 `socket.data.user` 强制覆盖，Room 加入也未在该函数内校验文档权限；文档更新的 userId 则来自 `socket.data.user`。因此当前存在“认证身份与展示身份/Room 准入边界不完全一致”的 legacy 依赖点，Bridge 实施必须收口，不能把它带入 v1。

## 四、Yjs 认证关系与恢复

Yjs 没有独立认证协议，完全依赖已认证 Socket：

1. `useCollaborativeDocument` 创建 `SocketYjsProvider`。
2. Provider 创建本地 `Y.Doc` 与 Awareness，并发出 `collaboration:join`。
3. 服务端返回当前运行时文档的 `Y.encodeStateAsUpdate()` 全量状态。
4. Provider 应用 SYNC 后标记 synced，再向编辑器暴露 Provider。
5. Socket `connect` 事件触发 Provider 重新 JOIN；同一 Provider/Y.Doc 在网络重连时保留。
6. Awareness、typing、lock 通过独立事件恢复，heartbeat 每 15 秒维持 presence。

服务端 Yjs 文档、更新日志、presence 与 snapshot 主要为进程内状态。重连会以服务端当前状态覆盖同步缺口，但客户端待发送队列没有应用级 ACK；更新在 emit 后即从 pending 队列移除，恰逢断线时需要通过 CRDT 状态交换验证是否真正补齐。

## 五、Legacy 依赖点

- `useSocket` 只读取 legacy Zustand token，不读取 v1 Memory Token Store。
- `verifyToken` 只负责 legacy payload，Socket 不识别 `sid/type/iss/aud`。
- 长连接没有 Access Token 更新、临期刷新或服务端 re-auth 事件。
- Logout/Session revoke 不会主动断开现有 Socket。
- 自动重连会继续使用 Socket 实例创建时的旧 token，除非 React token 依赖变化重建连接。
- 多标签页各自拥有 JS Realm 内的 global Socket，没有跨标签统一 Refresh/重连协调。
- Collaboration presence 信任客户端 user payload，未冻结为认证身份。
- Socket/Yjs 可用不等于 HTTP Runtime 已恢复；两条状态机当前相互独立。

## 六、当前结论

Legacy Socket 在“握手验证 + 数据库用户复查”范围内可用，但不足以承载短期 v1 Access Token、Session 撤销和 Refresh 后重连。正式 Login 迁移前必须先落地显式 Bridge，绑定身份、会话与房间恢复，并对断线期间 Yjs 更新做契约测试。
