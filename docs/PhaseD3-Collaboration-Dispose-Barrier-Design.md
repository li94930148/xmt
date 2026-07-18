# Collaboration Dispose Barrier Design

## 1 当前 Yjs 生命周期

当前协作链路为：

```text
ContentEditor
  -> useCollaborativeDocument
  -> SocketYjsProvider
  -> Y.Doc / Awareness
  -> Socket.IO
  -> collaboration:update
```

`useCollaborativeDocument` 在 `enabled`、`roomId`、socket 和用户 presence 都存在时创建 `SocketYjsProvider`；effect cleanup 调用 `provider.destroy()`。Provider 销毁时会清除 update、awareness 与 typing 的定时器，发送 leave，并销毁 awareness/Y.Doc。

Provider 的本地 outbound 行为如下：

| 数据 | 本地缓冲 | 当前发送方式 | 销毁前风险 |
| --- | --- | --- | --- |
| Yjs document update | `pendingUpdates`，50ms 合并定时器 | `socket.emit(collaboration:update, payload)` | 定时器未触发时会被 `destroy()` 清除 |
| awareness | client id 集合，300ms 定时器 | `socket.emit(collaboration:awareness-update, payload)` | 可被清除；但它是临时 presence，不属于文档持久性 |
| typing | 100ms/即时节流 | `socket.emit(collaboration:typing, payload)` | 可被清除；不属于文档状态 |

服务端接收 `collaboration:update` 后将 update 写入运行时 CRDT 状态并广播给同房间其他 socket。当前协议没有 Socket.IO acknowledgement，发送端不会收到自己的 update 回显。

## 2 Runtime 边界

Runtime 只消费已存在的通用契约：

```ts
interface ContentEditorDisposeBarrier {
  name: string;
  flush(options: { timeoutMs: number }): Promise<GracefulDisposeBarrierResult>;
}
```

Runtime 不得 import Yjs、`SocketYjsProvider`、Socket.IO client 或任何 Production/Shooting 类型。协作层应在将来通过一个 provider-aware factory 创建 barrier，并把它作为 opaque `ContentEditorDisposeBarrier` 传给 `gracefulDispose()`。

建议 factory 位于协作层而非 Runtime 层，例如概念上的：

```ts
createCollaborationDisposeBarrier(provider): ContentEditorDisposeBarrier
```

该 factory 可以依赖 Provider；Runtime 不能依赖 factory 的实现。

## 3 Barrier 接口设计

现有接口已经足够承载 D3，不需要改变 Runtime contract 或 Socket.IO 事件协议。建议固定 barrier 名称为 `collaboration-outbound`，并为其 `flush()` 定义以下行为：

1. 拒绝新的 provider outbound 写入（仅在 barrier 自己的短暂执行窗口内）；
2. 立即合并并 emit 已排队的 Yjs document update；
3. 清理或 best-effort 发送 typing 的停止状态；
4. 不以 awareness 成功作为文档内容成功条件；
5. 返回本地 outbound 交接结果。

推荐结果映射：

| 结果 | 条件 |
| --- | --- |
| `synced` | 所有开始时已排队的 document update 已调用 `socket.emit`，本地 document 队列为空，且 transport 当时处于连接状态 |
| `skipped` | 无待发送 document update；或协作未启用/无 provider，因而无需交接 |
| `failed` | provider 已销毁、socket 未连接、emit 同步抛错，或 barrier 自身发现无法完成本地交接 |
| `timed_out` | 在传入时限内无法完成其有限的本地交接步骤 |
| `cancelled` | barrier 已被取消/销毁，或 immediate destroy 先于 flush 完成 |

`synced` 在此仅表示 **local outbound flush**，不是“服务器已接收”、不是“运行时 CRDT 已落盘”、也不是“另一位用户已收到”。报告、UI 和未来调用方不得扩大该含义。

## 4 flush 语义

### 成功条件

在不改协议的约束下，最高可验证保证是：

```text
Yjs update 已从 Provider 的 pendingUpdates 移除
  且已调用 Socket.IO 客户端的 emit
  且 emit 时 socket.connected 为 true
```

这是一种本地交接保证。它能消除 50ms Provider 定时器尚未触发就被 destroy 清除的确定性丢失窗口，但不能确认网络传输或服务端应用。

### 不纳入成功条件的状态

- 远端 awareness、光标、selection、typing；它们是短生命周期 UI 状态；
- 远端浏览器是否已渲染更新；
- 服务端是否已调用 `applyRuntimeDocumentUpdate`；
- CRDT snapshot 或业务数据库是否已持久化。

业务内容的最终持久化仍由 D2 AutosaveCoordinator/Adapter `persist()` 负责，不能改由 awareness 或 Yjs 发送完成来认定。

### 顺序约束

现有 `GracefulDisposeController` 按 barrier 顺序执行，任意 barrier 失败会在 autosave flush 前返回。若直接把“socket 不连接即 failed”的协作 barrier 接入，会错误地阻断数据库 autosave，反而降低持久化可靠性。

因此在本阶段的结论是：**不得把协作 barrier 直接接到页面或默认 gracefulDispose 调用中。** 后续实现任务必须先定义 durability-first 聚合策略：无论协作交接失败、超时或取消，都必须继续尝试 autosave；最终结果同时报告 autosave 与 barrier 的独立状态。该调整属于后续 Runtime lifecycle task，不属于 D3。

## 5 Socket/Yjs 限制

1. `SocketYjsProvider` 没有公开的 `flushUpdates()` 或队列可见性 API；现有 flush 函数位于闭包内，不能由外部 barrier 安全调用。
2. `socket.emit` 未携带 acknowledgement callback；服务端 handler 也不回 ack。
3. Socket.IO 的离线缓冲与浏览器卸载期间网络是否发送，不能作为可靠交付承诺。
4. 当前服务端的运行时 CRDT 状态与业务数据库持久化是不同路径；收到协作 update 不代表 Adapter `persist()` 已成功。
5. 当前 `destroy()` 会直接清除 pending updates，故 provider 内部需要一个明确的“flush-before-destroy”能力，才能构造有价值的 barrier。

要实现“server accepted”的 barrier，必须新增带 correlation id 的 ack 或等效的服务端确认事件；这会修改 Socket.IO 协议，明确不属于 D3。

## 6 Production/Shooting 接入方式

Production 与 Shooting 都经由同一个 `useCollaborativeDocument` 和 `SocketYjsProvider`，仅 room 不同：

| 业务文档 | room | Barrier |
| --- | --- | --- |
| Production | `production:<id>` | 同一个 provider-based collaboration outbound barrier |
| Shooting | `shooting:<id>` | 同一个 provider-based collaboration outbound barrier |

因此不应创建 Production 或 Shooting 专属 barrier，也不应把 version、workflow、Publishing、权限或 API 保存逻辑放入 barrier。页面在未来只负责从当前 provider 得到通用 barrier，并在明确的 route transition 处交给 Runtime handle。

## 7 风险

| 风险 | 影响 | 控制方式 |
| --- | --- | --- |
| 将本地 emit 误解为远端确认 | 对协作可靠性做出错误承诺 | 固定 `synced` 为 local outbound flush 语义 |
| 协作失败提前中止 autosave | 最后业务内容未持久化 | 先实现 durability-first 聚合，再接页面 |
| 在 Provider 外部读取私有队列 | 破坏 Yjs/Socket 封装和时序 | 仅在协作层新增最小 provider API |
| browser close/pagehide 时间不足 | 网络发送不能保证完成 | 把 barrier 限定为应用内受控导航；关闭页仍依赖 autosave/Yjs 重连恢复 |
| flush 与 destroy 并发 | 可能二次 emit 或清空队列 | Provider 实现需有自身 active/flushing/destroyed 状态与幂等 Promise |

## 8 实施计划

后续必须另开实现任务，并按以下顺序进行：

1. 仅在 `SocketYjsProvider` 内部新增最小公开 outbound flush 能力：同步清空 document update 队列、暴露有限结果，不改事件名称、payload 或服务端协议。
2. 在协作层实现通用 `ContentEditorDisposeBarrier` factory；为“无 pending”“已销毁”“断线”“emit 失败”“重复 flush”编写 mock 测试。
3. 为 `GracefulDisposeController` 设计并测试 durability-first 结果聚合，确保 autosave 不受协作 barrier 失败阻断。
4. 先在隔离测试页面验证 provider flush 与 destroy 并发，再决定是否在 Production/Shooting 的受控 route transition 中接入。
5. 进行双用户 Production/Shooting 验证：最后 50ms 内编辑、路由离开、断线、刷新和双端内容收敛。

本阶段完成的是静态链路审计和 contract 可行性验证；没有实现 barrier、没有修改页面、Yjs、Socket.IO 或协议。

