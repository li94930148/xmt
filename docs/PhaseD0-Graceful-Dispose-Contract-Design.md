# Graceful Dispose Contract Design

## 1 问题背景

Phase C1.2 证明了当前立即销毁路径会丢失“刚输入、尚未越过 debounce/协作发送窗口”的最后内容：A 离开 Shooting 页面后，B 可继续编辑，但 A 的最后标记既未到达 B，也未持久化。

根因是两个独立的待处理队列同时被销毁：

```text
Editor update
  -> Runtime AutosaveCoordinator pending save (2500ms)
  -> SocketYjsProvider pending Yjs update (50ms)

React unmount cleanup
  -> Runtime destroy(): clear autosave pending
  -> provider destroy(): clear Yjs outbound pending
```

目标是为**应用内可控离开**建立一个通用、无业务类型分支的可靠交接 contract。它不得改变 Production/Shooting 的保存 API、版本、workflow、Publishing、Yjs 协议或 Socket.IO 协议。

## 2 当前destroy语义

当前 Runtime handle：

```ts
interface ContentEditorRuntimeHandle {
  scheduleSave(content: string, revision: number): void;
  flush(): Promise<void>;
  cancel(): void;
  getStatus(): ContentEditorSaveStatus;
  destroy(): Promise<void>;
}
```

当前 `destroy()` 的实际语义是：幂等地停止该实例，清除 autosave timer 与 pending request，并将状态设为 idle。它适合以下情形：

- document 已失效；
- 强制替换编辑器实例；
- 用户明确放弃尚未保存的编辑；
- unmount 已经发生，无法再可靠等待网络。

因此 `destroy()` 本身应保留为**立即、不可等待、低层**的资源释放原语。问题不在于它“错误”，而在于它被当作了“用户主动离开前保存”的唯一入口。

`flush(): Promise<void>` 也不够：现有 AutosaveCoordinator 吞掉 persist rejection，只通过 save status 表达错误，因此调用者无法区分 synced、failed、timeout 或 cancelled。

## 3 gracefulDispose目标

`gracefulDispose()` 是一次**可等待的导航前协商**，而不是销毁实现的别名。它必须：

1. 在路由跳转意图发生时调用，早于 React unmount；
2. 固化当前本地内容与 revision，不允许 teardown 中继续排入新保存；
3. 在有限时间内完成协作 outbound 交接和最新 revision 持久化；
4. 将结果明确交给页面，而不是把失败静默改写成成功；
5. 仅在成功、超时后用户选择离开、或用户明确放弃时，才允许随后 `destroy()`；
6. 不解释 document 类型，不调用版本、审批、workflow 或 Publishing 命令。

建议生命周期：

```text
navigation intent
  -> requestGracefulLeave()
  -> freeze local scheduling for current document
  -> run generic collaboration barrier (if registered)
  -> flush latest persistence revision
  -> return result to page
  -> page: navigate / retry / explicit discard
  -> unmount: destroy() as final cleanup only
```

## 4 Runtime API设计

### 4.1 返回类型

不应复用 `void`。推荐在 contracts 层新增以下无业务语义类型（仅为设计，未创建代码）：

```ts
export type GracefulDisposeStatus =
  | 'synced'
  | 'failed'
  | 'timed_out'
  | 'cancelled'
  | 'already_destroyed';

export type GracefulDisposeReason =
  | 'route_transition'
  | 'document_switch'
  | 'explicit_leave';

export interface GracefulDisposeBarrierResult {
  name: string;
  status: 'synced' | 'failed' | 'timed_out' | 'skipped';
  error?: unknown;
}

export interface GracefulDisposeResult {
  status: GracefulDisposeStatus;
  reason: GracefulDisposeReason;
  latestRevision: number;
  persistedRevision: number;
  barriers: GracefulDisposeBarrierResult[];
  error?: unknown;
}

export interface GracefulDisposeOptions {
  reason: GracefulDisposeReason;
  timeoutMs: number;
}
```

`latestRevision` 和 `persistedRevision` 让调用方判断“最后内容是否已经落盘”；它们不能被 UI 的 `synced` 文案替代。

### 4.2 Handle 扩展

推荐未来在 `ContentEditorRuntimeHandle` 上增加：

```ts
gracefulDispose(options: GracefulDisposeOptions): Promise<GracefulDisposeResult>;
```

保留现有 `flush()`、`cancel()`、`destroy()`，但在后续实现阶段调整 `flush` 的内部/公开失败语义，使 gracefulDispose 能准确构造结果。避免直接将 `destroy()` 改成 `await flush()`：React 的 cleanup 不会等待 Promise，且会让资源释放顺序不确定。

### 4.3 幂等与并发

- 同一 document 同时收到多个 gracefulDispose 请求时，应复用同一个 in-flight result，不能重复发送持久化请求。
- 第一个请求确定 reason 与 timeout budget；后续调用只订阅结果。
- `destroy()` 一旦完成，gracefulDispose 返回 `already_destroyed`，不重启保存。
- `cancel()` 只适用于明确放弃 pending save 的路径，不能由普通导航自动调用。

## 5 Autosave交互

### 5.1 调用关系

```text
gracefulDispose
  -> block new scheduleSave for this lifecycle
  -> AutosaveCoordinator flush latest pending revision
  -> await adapter.persist(content, context)
  -> result: synced / failed / timed_out
```

AutosaveCoordinator 必须让 Runtime 得到可判断的保存结果，而不是仅更新 `ContentEditorSaveStatus`。失败不应被 destroy 重置为 idle 后消失。

### 5.2 保存约束

- 使用当前 Adapter 的已有 `persist()`；Runtime 不构造 Production/Shooting payload。
- 继续使用 `ContentEditorSaveContext.contentRevision` 进行本地陈旧保存保护。
- Production graceful 保存仍等价于 autosave，即 `version_action: 'none'`；不得生成 history、minor 或 major 版本。
- Shooting graceful 保存仍等价于 `script_content` 保存；不得写 Production，不得触发 workflow 或 Publishing。

### 5.3 超时

默认建议由调用方传入 1500–2000ms 的应用内导航预算，最终数值需在 D1 测试中校准。超过预算时：

- Runtime 返回 `timed_out`；
- 页面保持当前路由并提示用户重试或明确离开；
- 不把网络仍在进行中的请求称为已保存；
- 用户选择离开后，才执行立即 destroy。

## 6 Yjs交互边界

### 6.1 是否进入 contract

**进入 graceful dispose 的编排 contract，但不让 Runtime 依赖 Yjs。**

Runtime 不应该 import provider、读取 room、处理 awareness 或知道 Socket.IO。推荐把协作交接抽象成可选的通用 barrier：

```ts
export interface ContentEditorDisposeBarrier {
  name: string;
  flush(options: { timeoutMs: number }): Promise<GracefulDisposeBarrierResult>;
}
```

ContentEditor 组合层可注册名为 `collaboration-outbound` 的 barrier；它内部未来才决定是否调用 provider 的“排空已有待发送 update”能力。Runtime 只按通用 barrier 结果排序和汇总，不知道该 barrier 是 Yjs、离线缓存还是其他基础设施。

### 6.2 边界要求

- 仅发送已缓冲的现有 update；不创建新 Socket.IO event、不变更 payload 协议。
- barrier 必须在 provider.destroy 前执行。
- awareness/typing 不是内容可靠性确认条件，不能替代 document update。
- Yjs outbound 成功只说明协作交接完成，不等同于 adapter.persist 成功。
- 若 provider 无法在既有协议下给出可靠 flush 结果，barrier 必须返回 `failed` 或 `timed_out`，不能伪造 `synced`。

## 7 页面生命周期接入方式

### 7.1 应用内路由切换

页面或统一导航守卫应在调用 `navigate()` 前：

1. 询问 ContentEditor 是否 dirty/pending；
2. 调用 `handle.gracefulDispose({ reason: 'route_transition', timeoutMs })`；
3. `synced` 后执行导航；
4. `failed`/`timed_out` 显示通用确认 UI：重试、留在页面、仍然离开；
5. 只有“仍然离开”分支允许无等待导航，unmount 再调用普通 destroy。

不得依赖 `useEffect` cleanup 来启动这一流程：cleanup 的 Promise 不被 React 等待，已错过拦截导航的时机。

documentId 切换同样走 `reason: 'document_switch'`，确保旧 document 的未保存内容不会随着新实例覆盖而丢失。

### 7.2 refresh、pagehide、beforeunload

它们不属于同一可靠性 contract：

|生命周期|是否可等待 gracefulDispose|定位|
|-|-|-|
|应用内路由|是|主路径，结果可由用户决策。|
|刷新|否|尽早 best-effort flush，重开后恢复。|
|pagehide / bfcache|否|补充信号，不能承诺成功。|
|beforeunload / 关闭页签|否|最后提示或 best effort，不能作为主写入路径。|

未来可让页面在 `visibilitychange`/`pagehide` 尽早触发不阻塞的尝试，但不应调用并等待完整 gracefulDispose，更不能以 `beforeunload` 的 Promise 承诺可靠持久化。`sendBeacon` 与 `fetch keepalive` 需另行评估认证、请求体大小、幂等性和 API 支持；当前 Bearer 鉴权下不能直接替代 adapter.persist。

## 8 超时与失败策略

|结果|页面默认行为|是否允许 destroy|用户可选动作|
|-|-|-|-|
|`synced`|导航|允许|无额外操作。|
|`failed`|保留页面并显示保存失败|不自动允许|重试；明确放弃后离开。|
|`timed_out`|保留页面并显示仍在保存/超时|不自动允许|继续等待/重试；明确放弃后离开。|
|`cancelled`|停止导航流程|不允许作为成功理由|继续编辑。|
|`already_destroyed`|按当前实例状态处理|不重启保存|重新进入页面后再编辑。|

“明确放弃”必须只影响当前 document 的最后 pending 内容，并使用中立文案说明数据可能丢失；它不应触发版本、状态、审批或业务侧事件。

## 9 回滚方案

未来实现应以可回滚方式发布：

1. 首先仅增加 contract 类型与单元测试，不接入页面。
2. 使用 feature flag 或受控测试入口启用 graceful route leave；关闭 flag 即恢复当前立即导航 + unmount destroy 行为。
3. 保留原 `destroy()` 路径，禁止替换其语义。
4. 若 barrier、flush result 或导航阻断出现异常，禁用新入口，不修改 Adapter/API/数据库即可回退。
5. 回滚后保留 C1.2 测试记录和结果，用于复测，不通过生产业务数据验证。

## 10 实施路线

本阶段不实施。获得独立实现授权后，建议顺序如下：

1. **D1 Contract 类型与 Runtime 单元测试**：定义 result、timeout、失败传播、幂等和 destroy 后行为；mock adapter，不接页面。
2. **D2 Autosave 结果语义**：使 coordinator 能区分成功、失败、超时与已取消；验证旧 revision 不可覆盖新 revision。
3. **D3 Collaboration barrier 评审与测试**：仅评估发送当前 provider pending update 的能力，不改 Socket.IO 事件/协议；覆盖双用户与断线。
4. **D4 单一测试入口的路由试点**：在导航意图阶段接入，不在 unmount cleanup 中等待 Promise；验证 Production 与 Shooting 各自 persist payload 不变。
5. **D5 回归**：复跑 C1.1/C1.2 Destroy、刷新、断线、版本与 workflow/Publishing 无副作用测试。

在 D4/D5 全部通过之前，不进入 Runtime 清理，也不删除旧逻辑。
