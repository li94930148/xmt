# Destroy Persistence Strategy

## 1 问题描述

Phase C1.2 在 Shooting `34` 验证到以下可复现风险：用户 A 输入 `SHOOTING_DESTROY_A` 后立即离开详情页，用户 B 保持编辑不受影响、也能继续保存；但 A 的最后输入既未到达 B，也没有在重新打开页面后恢复。

这不是工作流、Publishing 或版本问题，而是“本地最后变更”在页面销毁路径上没有可靠交接的问题。它同时影响：

- 数据库持久化：最后一次变更仍在 Runtime 的 autosave debounce 窗口。
- 协作传播：最后一次 Yjs update 仍在 provider 的短暂合并窗口。
- 页面生命周期：React unmount cleanup 不能等待异步 Promise 完成。

目标是降低**已编辑、尚未持久化或尚未发送的内容**在路由离开、刷新和关闭页签时丢失的概率；不改变 Production/Shooting 的业务规则，不让保存产生版本，也不把业务类型放入 Runtime。

## 2 当前生命周期分析

### 2.1 Runtime 与 AutosaveCoordinator

当前调用链为：

```text
Editor onUpdate
  -> ContentEditor.handleEditorChange
  -> RuntimeHandle.scheduleSave(content, localRevision)
  -> RuntimeAutosaveCoordinator pending (2500ms)
  -> adapter.persist(content, { reason: 'autosave', contentRevision })

React unmount
  -> ContentEditorRuntime cleanup
  -> void handle.destroy()
  -> coordinator.destroy()
  -> clear timer + pending = null
```

`destroy()` 当前语义是“立即停止本实例后续保存”，因此它会有意丢弃尚未发出的 pending request。对重建、切换 document、取消编辑器实例而言，这一语义合理；但它不能同时承担“用户主动离开前确保最后内容落盘”的语义。

`flush()` 虽能立即启动 pending save 并等待 in-flight request，但现有实现有两个限制：

1. Runtime 在 destroy 前未调用 `flush()`。
2. `startNextSave()` 吞掉 persist rejection 并只更新状态，因此 `flush()` 目前不能把失败可靠地交给调用方决策。

### 2.2 Yjs provider

`SocketYjsProvider` 对本地 Yjs update 采用 50ms 批量合并：

```text
Y.Doc update
  -> pendingUpdates.push(update)
  -> updateFlushTimer (50ms)
  -> Socket.IO collaboration:update
```

而 `SocketYjsProvider.destroy()` 会清除 `updateFlushTimer`，不会发送 `pendingUpdates`。因此 C1.2 的立即离开还可能在 autosave 之前就切断协作传播。当前 Socket 服务是协作传输通道，不是已验证的 CRDT 持久化层；不能把“Yjs 已在本地 doc 中存在”视为数据库已保存。

### 2.3 Adapter、业务与版本边界

Runtime 只持有不透明的 `adapter.persist(content, context)`。Production Adapter 继续以 `version_action: 'none'` 调用既有保存；Shooting Adapter 继续以 `updateShooting(id, { script_content })` 保存。可靠销毁策略必须复用这些已有 persist 行为，不能：

- 让 Runtime 判断 Production/Shooting；
- 调用 major/minor 版本动作；
- 触发 Shooting 完成、workflow 或 Publishing；
- 直接写数据库或改 Socket.IO/Yjs 协议。

## 3 方案A flush before destroy

### 3.1 方案

把“立即销毁”与“优雅离开”拆成两个明确命令：

```text
route transition intent
  -> stop accepting new local edits
  -> capture latest editor document + revision
  -> flush collaboration outbound queue
  -> await runtime persistence flush (bounded timeout)
  -> dispose editor/provider/runtime
  -> navigate

forced teardown
  -> destroy immediately
```

推荐未来的 Runtime API 以通用的、无业务语义的名称表达该区别，例如 `gracefulDispose()` 与 `destroy()`；不在本阶段添加接口或实现。

### 3.2 销毁前是否应 flush

对**应用内路由切换、返回列表、显式关闭编辑面板**：应当先 flush，再销毁。此类动作由应用控制，可以等待有限时间并让用户决定失败后的行为。

对**组件因 documentId 改变而被替换**：应先对旧 document 执行同样的 graceful dispose；不能让新实例覆盖旧实例的 pending 状态。

对**程序性强制卸载或已知无效 document**：保留当前立即 `destroy()`，避免把旧 document 的请求发往新页面。

### 3.3 flush 顺序与超时

推荐顺序：

1. 固化当前编辑器内容和本地 revision，阻止 teardown 期间新增本地编辑。
2. 请求协作层立即发送已缓冲的本地 update（不改变事件名称或 Socket.IO 协议）。
3. 调用 Runtime persistence flush，等待最新 revision 的 adapter.persist 完成。
4. 仅在成功、用户确认放弃、或到达明确超时策略后，再销毁 provider 与 Runtime。

超时应短且可解释（例如 1–2 秒的应用内导航预算），不能无限阻塞路由。保存成功后才显示“已保存”；超时不是成功。

### 3.4 flush 失败如何处理

现有 `flush(): Promise<void>` 不足以表达失败。未来应使其返回明确的结果，或在失败时 reject；推荐包含：

```ts
type FlushResult = {
  latestRevision: number;
  persistedRevision: number;
  status: 'synced' | 'failed' | 'timed_out' | 'cancelled';
  error?: unknown;
};
```

应用内导航失败时应提供明确选择：

- **继续留在页面并重试**（默认、安全）；
- **仍然离开**（明确标记可能丢失最后改动）；
- 不允许 Runtime 静默把失败解释为 `synced`。

该反馈由 ContentEditor 的通用状态层提供；Adapter 仅报告 persist 成功或失败，业务页面不应收到版本/工作流特殊分支。

## 4 方案B pagehide/beforeunload

### 4.1 页面关闭、刷新与路由切换必须区分

|场景|可等待异步 flush|推荐处理|
|-|-|-|
|应用内路由切换|可以有限等待|使用方案A的 graceful dispose；失败时由用户决定是否离开。|
|浏览器刷新|不能依赖 React cleanup await|尽早触发 opportunistic flush；页面重建后从数据库/Yjs 恢复。|
|关闭页签/浏览器、进程终止|不能可靠等待|仅做最佳努力 checkpoint，不能声称强一致。|
|bfcache/pagehide|生命周期可能被冻结|用 `pagehide` 记录或发送最佳努力 checkpoint；不要把它当作唯一保存机制。|

### 4.2 beforeunload 与 pagehide 的定位

- `beforeunload` 不能承载普通异步 `fetch`/Promise 保存；现代浏览器也限制自定义提示。它只适合作为“仍有未确认保存”的最后提示机制，不能作为数据写入主路径。
- `pagehide`/`visibilitychange` 可用于尽早触发无阻塞的 best-effort checkpoint，但不能保证网络完成。
- 若未来使用 `fetch(..., { keepalive: true })` 或 `sendBeacon`，必须先确认现有鉴权头、请求体大小、服务端幂等性、错误回传和审计要求。`sendBeacon` 不能携带当前 Bearer header，因此不能在不改变认证/API 前提下直接替代 adapter.persist。

结论：生命周期事件是方案A的补充，而不是替代。对“刷新/关闭一定不丢”的承诺，需要持久化能力和服务端协议支持，不能仅靠前端 hook。

## 5 方案C Yjs checkpoint

### 5.1 概念

可将本地尚未发送的 Yjs update 作为 checkpoint 保存，再在下次进入同一 room 时重放或由服务端合并：

```text
local Yjs update
  -> immediate provider outbound flush
  -> optional durable checkpoint
  -> reconnect / reopen merge
```

### 5.2 适用性

Yjs 擅长协作合并，适合作为“其他在线用户能尽快收到最后输入”的通道；但当前 XMT 没有已验证的 CRDT 持久化或离线更新日志。因此它不能单独保证：

- 所有人都离线时仍可恢复；
- 数据库 `content` / `script_content` 最终已写入；
- 刷新或关闭后的本地 update 一定存在。

### 5.3 建议

短期不要为修复 C1.2 风险引入 CRDT 持久化、修改 Socket.IO 协议或新增数据库表。先采用方案A，额外让现有 provider 在**优雅离开**路径上立即排空已存在的 outbound queue。

若未来需要离线优先或崩溃恢复，再单开架构决策：定义服务端 update 日志、压缩/快照、重放顺序、权限、保留期限和数据库迁移。该方向明确超出当前 Stabilization 范围。

## 6 推荐方案

采用“**应用内优雅销毁 + 生命周期最佳努力 + 不引入 Yjs 持久化**”的分层策略。

```text
Route change (controllable)
  -> graceful dispose
     -> provider outbound flush
     -> Runtime flush latest revision
     -> success: destroy + navigate
     -> failure/timeout: retry or explicit discard

Refresh / page close (uncontrollable)
  -> visibility/pagehide best-effort signal
  -> optional unload-safe checkpoint only after auth/API feasibility review
  -> immediate destroy remains fallback
```

关键决策：

1. `destroy()` 保持为同步、幂等、立即停止的低层原语；当前语义本身合理。
2. 不将 `destroy()` 悄悄改为无超时 `await flush()`，因为 React cleanup 不会等待它，且会导致销毁顺序不确定。
3. 新增的 graceful 路径必须在路由意图发生时调用，而不是等 unmount 后才调用。
4. Runtime 不知道业务类型；是否可保存、如何保存仍完全由 Adapter 提供的通用 persist 能力决定。
5. 优雅路径中的保存继续走已有 Production `version_action: 'none'` 和 Shooting `script_content` 保存，禁止版本/工作流副作用。

## 7 风险分析

|风险|影响|缓解措施|
|-|-|-|
|flush 无限等待|路由卡死、用户无法离开|固定超时；提供留在页面重试或明确放弃。|
|flush rejection 被吞掉|错误地显示已保存|让 flush 显式返回失败；状态不能由 destroy 重置为成功。|
|provider 在 autosave 前销毁|远端用户看不到最后输入（C1.2 已发生）|优雅路径先排空 provider outbound queue，再 destroy。|
|两端同时 autosave|旧内容或重复请求风险|继续以 revision 去重；只确认最新 revision 的 persist 结果。|
|刷新/关闭不保证异步完成|最后输入仍可能丢失|区分可控路由和不可控卸载；仅做 best effort，不夸大保证。|
|unload-safe 请求鉴权不兼容|请求失败或安全绕过|先做认证/API 可行性审查；不绕过现有鉴权。|
|把 Yjs 当数据库|重开后内容缺失、审计不一致|Yjs 只作协作传输；数据库 persist 仍是业务内容真源。|
|误触业务动作|产生版本、workflow 或 Publishing 副作用|复用 Adapter.persist 的 autosave 路径，禁止调用业务命令。|

## 8 实施步骤

本阶段不实施。后续如获得单独授权，建议采用可回滚的小步骤：

1. **Phase D0 — Contract 设计评审**：补齐 `flush` 成功/失败语义和通用 graceful-dispose contract；不接 Production/Shooting。
2. **Phase D1 — Runtime 单元测试**：覆盖 pending revision、in-flight、flush success、flush failure、timeout、destroy 后不再保存；使用 mock adapter。
3. **Phase D2 — 路由离开接入试点**：只选择一个测试文档入口，在导航意图时调用 graceful 路径；保持原 API、版本和权限行为。
4. **Phase D3 — Provider outbound 排空评审**：在不变更 Socket.IO 事件/协议的前提下，验证是否可安全发送已缓冲 Yjs update；必须覆盖双用户、断线和重复 provider 回归。
5. **Phase D4 — Refresh/关闭最佳努力策略**：仅在鉴权与 API 可行性经独立评审后考虑；不得以 `beforeunload` Promise 作为可靠性承诺。
6. **Phase D5 — C1 回归**：复跑 Production 与 Shooting 的 Destroy 场景，验收“立即离开”在可控路由下不丢最后输入；同时确认没有新增版本、workflow 或 Publishing 副作用。

任何一步发现 Yjs 协议、Socket.IO、数据库或 API 必须改变时，应停止当前实现并另开架构/迁移决策，不能在 Runtime Stabilization 中顺带扩大范围。
