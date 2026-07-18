# Phase D7-E.2 Failure Action Race Root Cause Analysis

## 1. 分析边界

本阶段仅阅读现有实现与 D7-E.1 的受控浏览器复现结果；没有修改代码、页面、Runtime、Adapter、API、数据库或协作链路。

分析对象：

- `src/components/editor/EditorLeaveFailureDialog.tsx`
- `src/hooks/useEditorLeaveGuard.ts`
- Production / Shooting 的 leave-guard 回调接线
- `GracefulDisposeController` 与 `RuntimeAutosaveCoordinator` 的失败后 retry 语义

## 2. 复现链路

受控 `shooting_hold_once` 将 Shooting 35 的 autosave 请求暂停；点击返回后通过 `release/reject` 以 503 释放。该流程稳定得到 `waiting_confirmation` failure dialog，排除了普通 debounce autosave 提前消费 failure profile 的干扰。

在该稳定 dialog 中并发注入两种顺序：

```text
retry -> discard
discard -> retry
```

观察结果均为：URL 仍为 `/shooting/35`，dialog 仍打开，未执行 continuation / navigation。这证明问题不依赖 Shooting 业务保存接口、Yjs 或 Socket.IO。

## 3. 当前状态机

```text
LeaveGuard

waiting_confirmation
  ├─ retry()
  │    └─ requestLeave(pendingRequest)
  │         ├─ inFlight ? 返回既有 promise
  │         └─ gracefulDispose()
  │              ├─ durable       -> proceed -> completed
  │              └─ not durable   -> waiting_confirmation
  │
  └─ discardAndLeave()
       ├─ inFlight / 非 waiting ? 返回 null
       └─ destroy -> proceed -> completed

Dialog action gate

idle -> action_pending -> action_running
  ├─ callback Promise fulfilled -> action_completed
  └─ callback Promise rejected  -> idle
```

`action_completed` 没有自动回到 `idle`；这是合理的前提是 callback fulfilled 必然代表离开动作已经成功结束。

## 4. 根因定位

### 4.1 主要根因：callback 完成语义与离开完成语义不一致

Production 与 Shooting 对 Dialog 传入的回调均为：

```ts
const handleRetryLeave = useCallback(async () => {
  await retryLeave();
}, [retryLeave]);
```

以及等价的 discard 包装。因此它们丢弃了 `EditorLeaveGuardResult | null`。

`EditorLeaveFailureActionGate` 只能将 callback Promise 的 **fulfilled** 解释为 action 成功。但 `retryLeave()` 即使返回：

- `{ decision: 'waiting_confirmation' }`（重试仍未 durable）；或
- `null`（Guard 拒绝本次动作）；

包装后的 async function 仍会正常 fulfilled。Dialog 随即进入 `action_completed`，而 LeaveGuard 仍是 `waiting_confirmation`，所以 dialog 继续可见却已被 action gate 锁住。此时既没有 continuation，也没有可观察的业务 winner。

这解释了“URL 不变、dialog 保持、无 navigation”的稳定现象。

### 4.2 次要根因：LeaveGuard 存在独立的二次动作阻断

`EditorLeaveGuardController` 还维护独立的 `inFlight`：

- `requestLeave()` 在 `inFlight` 非空时直接复用旧 Promise；
- `discardAndLeave()` 在 `inFlight` 非空时直接返回 `null`；
- `retry()` 只有在 `pendingRequest` 与 `waiting_confirmation` 均满足时才进入 requestLeave。

因此即使 Dialog 已经同步锁定 winner，winner 的 callback 仍可能因为 Guard 的 `inFlight` 或 state 检查返回旧结果/`null`。Dialog 当前没有接收该拒绝结果的方式，只会把 Promise fulfilled 当作 completed。

### 4.3 action gate 不是跨 render 丢失

`actionGateRef` 由 `useRef` 保存，组件重新 render 时不会重新实例化；仅首次渲染才创建 gate。gate 在 `run()` 的第一个同步语句中从 `idle` 写入 `action_pending`，第二个动作会看到非 idle snapshot 并返回 `{ accepted: false }`。

因此不存在“winner 因 props 变化或普通 render 被重置”的直接证据。问题在于 winner 的下游 callback 能否真正推进 LeaveGuard，而不是 Ref 锁是否跨 render 保持。

### 4.4 失败后 Autosave retry 不是本次直接根因

`GracefulDisposeController` 在 non-durable 结果后恢复 lifecycle 为 `active`，并调用 `resumeAfterGracefulDisposeFailure()`；`RuntimeAutosaveCoordinator.drain()` 会将 `failedRequest` 重新置为 pending 以供 flush retry。该层提供 retry 路径。

问题发生在此路径的结果返回给页面后：`waiting_confirmation`/`null` 被页面包装层和 Dialog 误判为 action fulfilled，而不是被转换成“本轮 action 未完成、允许用户再次操作”。

## 5. 完整调用链

### Retry

```text
retry button
-> Dialog.runAction('retry')
-> EditorLeaveFailureActionGate.run()
-> page handleRetryLeave()             // await 后丢弃结果
-> LeaveGuard.retry()
-> requestLeave(pendingRequest)
-> gracefulDispose()
-> durable ? proceed(continuation) : waiting_confirmation
-> callback Promise fulfilled
-> Dialog action_completed             // 即使仍是 waiting_confirmation
```

### Discard

```text
discard button
-> Dialog.runAction('discard')
-> EditorLeaveFailureActionGate.run()
-> page handleDiscardAndLeave()        // await 后丢弃 null / result
-> LeaveGuard.discardAndLeave()
-> inFlight ? null : destroy() -> proceed(continuation)
-> callback Promise fulfilled
-> Dialog action_completed             // null 也会被视为完成
```

## 6. 推荐修复位置

推荐在**通用 leave-action 结果边界**修复：`useEditorLeaveGuard` 暴露可判别的 action outcome，并由 `EditorLeaveFailureDialog` 基于该 outcome 管理 gate，而不是基于 Promise 是否 resolve。

建议的方向：

- `retry` / `discardAndLeave` 保留并返回显式结果；
- Dialog 将 `decision: 'proceeded'` 视为 terminal success；
- `waiting_confirmation` 或 `null` 视为未完成，释放 action gate 回到 `idle`；
- 仅 reject 代表技术异常；不将业务性“仍需确认”混同为异常。

这需要一个单独的实现任务，并增加 controller + dialog 的集成测试，再用 D7-E.1 hold/release 完成浏览器回归。

## 7. 不建议修改的位置

不建议为修复本问题而改动：

- `ProductionDetail.tsx` / `ShootingDetail.tsx` 的业务保存、版本、workflow 或导航规则；
- `GracefulDisposeController` 的 durability-first 聚合语义；
- `RuntimeAutosaveCoordinator` 的 revision 与失败重试机制；
- Adapter、API、数据库；
- Yjs、Socket.IO、provider 或协作协议。

这些层均不是 result 语义丢失的位置；将修复下沉到它们会扩大稳定化风险并混入业务逻辑。
