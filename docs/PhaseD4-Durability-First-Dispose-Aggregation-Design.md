# Durability First Dispose Aggregation

## 1 当前问题

当前 `GracefulDisposeController` 使用单一失败模型：先顺序执行 `barriers`，任一 barrier 返回 `failed`、`timed_out` 或 `cancelled` 就立即结束；只有全部 barrier 成功后才调用 Autosave `flush()`。

该模型不适合将来的协作交接：

- Autosave `persist()` 是业务内容进入既有 API/数据库路径的唯一 durability 信号；
- Collaboration barrier 最多只能确认 Yjs update 已从 Provider 本地队列交给 Socket.IO 客户端；
- 协作断线、local emit 失败或超时不应阻止最后内容走 Autosave；
- 把两者压缩为单一 `GracefulDisposeStatus` 会丢失“内容已保存，但协作交接未确认”的关键信息。

因此后续设计应以 **Autosave durability 为主结果、协作交接为独立附属结果**。Runtime 仍只认识抽象 participant，不认识 Yjs、Socket.IO、Production 或 Shooting。

## 2 单失败模型限制

| 当前行为 | 问题 |
| --- | --- |
| barrier 在 autosave 之前顺序执行 | 协作失败会阻断业务内容保存 |
| 最终只有一个 `synced/failed/timed_out/...` 状态 | 无法表达 durability 与协作结果分别为何 |
| `barriers` 是附加数组 | 不携带 participant 重要级别、执行策略或对最终导航的影响 |
| 成功即整体 `synced` | 容易把 local outbound flush 误称为远端/服务端确认 |

现有 D1/D2 的 Autosave 生命周期仍保持有效：进入 graceful dispose 后冻结新 revision；Autosave 成功才进入 `disposed`；失败或超时恢复 `active` 并可 retry。D4 只重新定义未来的结果聚合，不改变该原则。

## 3 Participant 模型

未来替换单一 `barriers` 数组时，建议建立通用 participant contract。以下为设计草案，非本阶段实现：

```ts
type DisposeParticipantRole = 'durability' | 'best_effort';

type DisposeParticipantStatus =
  | 'synced'
  | 'failed'
  | 'timed_out'
  | 'skipped'
  | 'cancelled'
  | 'already_disposed';

interface DisposeParticipantContext {
  reason: GracefulDisposeReason;
  deadlineAt: number;
  timeoutMs: number;
}

interface DisposeParticipantResult {
  id: string;
  role: DisposeParticipantRole;
  status: DisposeParticipantStatus;
  error?: unknown;
  detail?: 'database_persisted' | 'local_outbound_flushed' | 'not_applicable';
}

interface DisposeParticipant {
  id: string;
  role: DisposeParticipantRole;
  dispose(context: DisposeParticipantContext): Promise<DisposeParticipantResult>;
}
```

约束如下：

1. 至少且只能有一个 `durability` participant；D4 中它是 Autosave 的 `flush()` 包装，不能是 Yjs 或 Socket。
2. `best_effort` participant 可以有零到多个；协作 outbound flush 是其中之一。
3. participant 不得解释文档业务类型、权限、版本、workflow 或 API payload。
4. participant 结果必须自描述来源，不能仅返回布尔值。
5. 所有 participant 使用同一绝对 deadline；不能每个 participant 各自取得完整 timeout，避免总等待时间无限叠加。

Autosave 并不需要改成 Adapter。Controller 可在未来内部把 `AutosaveCoordinator.flush()` 适配为唯一的 durability participant；协作层则独立提供 `ContentEditorDisposeBarrier`/participant factory。

## 4 Result 模型

建议对外返回新的聚合结果，明确分离 durability 和附属交接：

```ts
type AggregateDisposeOutcome = 'durable' | 'not_durable' | 'interrupted';

interface AggregateDisposeResult {
  outcome: AggregateDisposeOutcome;
  reason: GracefulDisposeReason;
  durability: DisposeParticipantResult;
  bestEffort: readonly DisposeParticipantResult[];
  latestRevision: number;
  persistedRevision: number;
  degraded: boolean;
}
```

结果判定：

| `outcome` | durability 结果 | 是否允许受控路由离开 |
| --- | --- | --- |
| `durable` | `synced` 或无待保存的 `skipped` | 可以；即使 best-effort 失败，也标记 `degraded: true` |
| `not_durable` | `failed` 或 `timed_out` | 默认不自动离开；允许用户选择 retry 或明确放弃 |
| `interrupted` | `cancelled`、已 immediate destroy、或未能开始 durability | 不承诺持久化；不得显示“已保存” |

`bestEffort` 的 `synced` 必须由 participant 的 `detail` 限定。对于协作 participant，detail 只能为 `local_outbound_flushed`，绝不能表示 server ack、remote received 或 database persisted。

为兼容旧 handle，可在未来保留 `GracefulDisposeResult` 作为内部/过渡类型，并新增一个单独的 aggregate 方法或升级同名方法的返回类型。该变更需要单独的 contract compatibility review；本阶段不更改类型。

## 5 Autosave 策略

### 执行顺序

1. 创建绝对 deadline。
2. 立即执行 durability participant（Autosave `beginGracefulDispose()` + `flush()`）；它不得等待 collaboration participant。
3. 在 durability 已启动后，可并发启动 best-effort participants。
4. 在 deadline 前收集所有已完成结果；deadline 后未完成的 participant 独立标记 `timed_out`。
5. 聚合结果始终由 durability result 决定；best-effort 不得把 `durable` 降为 `not_durable`。

并发启动协作是为了尽早排空 Provider 的 50ms update 队列；durability-first 指的是 **结果优先级和不得被阻断**，不是必须串行等待 collaboration 后才写数据库。

### Autosave 失败、超时与 retry

- `failed`：返回 `not_durable`；保持 D2 的失败请求与 `active` 生命周期，允许调用方重试。
- `timed_out`：返回 `not_durable`；不将仍在运行的请求误标记为成功；允许调用方重试或继续等待。
- `cancelled/already_destroyed`：返回 `interrupted`；不尝试伪造 durability 状态。
- `synced`：调用 `completeGracefulDispose()`，使 Autosave 进入 `disposed`；后续页面才可执行 immediate `destroy()`。

如果用户明确选择“仍然离开”，页面可以调用 immediate `destroy()`，但该选择必须被作为放弃未持久化输入处理，而不是被 Runtime 静默执行。

## 6 Collaboration 策略

协作 participant 的 role 固定为 `best_effort`。

| 协作结果 | 聚合影响 | 含义 |
| --- | --- | --- |
| `synced` / `local_outbound_flushed` | 无降级 | 已从 Provider 本地队列提交至连接中的 Socket.IO client |
| `skipped` / `not_applicable` | 无降级 | 未启用协作或没有待交接的 document update |
| `failed` | `durable` + `degraded: true`（若 Autosave 成功） | 未能完成 local outbound 交接；内容 durability 仍以 Autosave 为准 |
| `timed_out` | `durable` + `degraded: true`（若 Autosave 成功） | 本地交接未在预算内结束；不表示数据库失败 |
| `cancelled` | `durable` + `degraded: true`（若 Autosave 成功） | 受控离开过程中协作交接被取消 |

协作的失败不应触发 API 重试、Production history、Shooting workflow、Publishing 或版本动作。若未来需要“server accepted”，必须另开协议变更任务，引入明确 ack；D4 不修改 Socket.IO 协议。

## 7 页面交互建议

页面仅应在 **应用内可控路由切换/文档切换** 时使用聚合结果。React unmount cleanup、刷新、`pagehide` 和浏览器关闭仍不能提供同等网络完成保证。

建议交互：

| 聚合结果 | 用户提示 | 默认动作 |
| --- | --- | --- |
| `durable`, `degraded: false` | 无阻塞提示，可显示“已保存” | 继续离开 |
| `durable`, `degraded: true` | “内容已保存；协作交接未确认。” | 继续离开，不显示为保存失败 |
| `not_durable` | “最后修改尚未保存。”提供“重试 / 留在页面 / 仍然离开” | 默认留在页面 |
| `interrupted` | “保存过程已中断，无法确认最后修改。” | 不显示成功；由页面决定恢复/离开 |

提示不得暴露技术词（Yjs、Socket、ack），也不得把 local outbound flush 宣传为“已同步到所有协作者”。可选的开发诊断可保留 participant `id/status`，但生产 UI 只使用上述业务语言。

## 8 实施计划

后续须新开实现任务，并按以下最小顺序进行：

1. 扩展 contract，增加 participant/aggregate types，同时为旧 `GracefulDisposeResult` 制定过渡兼容策略。
2. 修改 `GracefulDisposeController`：先启动 Autosave durability，再并发运行 best-effort participant；以绝对 deadline 收集独立结果。
3. 新增 runtime mock 测试：协作失败但 autosave 成功、协作超时但 autosave 成功、autosave 失败且协作成功、双 participant 超时、重复 dispose 复用 in-flight、失败后 retry。
4. 在没有页面接入的条件下，验证 lifecycle：只有 durability 成功才进入 `disposed`；durability 失败/超时仍保持可 retry。
5. 在 D3 的 Provider flush capability 与 barrier factory 完成后，再将它作为 best-effort participant 接入隔离验证环境。
6. 最后才评审 Production/Shooting 受控导航接入；不触及 Yjs/Socket 协议、业务 API、版本、权限或 workflow。

本阶段仅完成设计文档，不修改 Runtime、页面、Adapter、Yjs、Socket.IO、数据库或 API。

