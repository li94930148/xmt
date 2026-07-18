# Phase D5 Durability-first Dispose Aggregation Implementation

## 1. 修改文件

- `src/editor/contracts/contentEditorAdapter.ts`
- `src/editor/runtime/GracefulDisposeController.ts`
- `src/editor/runtime/GracefulDisposeController.test.ts`
- `docs/PhaseD5-Durability-First-Dispose-Implementation.md`

未修改 ContentEditor、Editor、Production、Shooting、Adapter、Yjs、SocketYjsProvider、Socket.IO、API、数据库、权限、版本或 workflow。

## 2. Participant 模型

新增通用 `DisposeParticipant` contract：

- `role: 'durability' | 'best_effort'`
- 统一的 deadline context
- 具名、可诊断的 participant result

Runtime 内部创建唯一的 `autosave` durability participant。外部注入的 participant 会被作为 best-effort 执行；若错误声明为 `durability`，Runtime 返回独立的 best-effort failure，且不允许其取代 Autosave 的 durability 地位。

Autosave 在 graceful dispose 开始时先启动，随后 best-effort participants 在同一绝对 deadline 下并发执行。Runtime 不依赖任何 Yjs、Socket.IO 或业务类型。

## 3. Result 模型

`gracefulDispose()` 现在返回 `AggregateDisposeResult`，不再压缩为单一保存状态：

```ts
{
  outcome: 'durable' | 'not_durable' | 'interrupted',
  durability: DisposeParticipantResult,
  bestEffort: DisposeParticipantResult[],
  degraded: boolean,
  latestRevision: number,
  persistedRevision: number,
}
```

规则：

- Autosave `synced`：`outcome: 'durable'`。
- Autosave `failed` 或 `timed_out`：`outcome: 'not_durable'`。
- Autosave `cancelled` / `already_disposed`：`outcome: 'interrupted'`。
- best-effort 的 `failed`、`timed_out`、`cancelled` 只会使 `degraded: true`，不会覆盖 Autosave 的 durability 结果。

协作 participant 未来只能将 `local_outbound_flushed` 作为 detail；该实现没有接入协作层，也不将其表示为 server acknowledgement。

## 4. 生命周期变化

`RuntimeAutosaveCoordinator` 的既有 D2 生命周期保持不变：

```text
active -> disposing -> disposed     (仅 Autosave 成功)
active -> disposing -> active       (Autosave failed / timed_out)
```

因此：

- collaboration 失败或超时且 Autosave 成功时，Autosave 仍会 `completeGracefulDispose()` 并进入 `disposed`；
- Autosave 失败或超时时，即使 collaboration 成功，Autosave 仍恢复 `active`，允许 retry；
- 已成功 dispose 后，新的 `scheduleSave()` 会被拒绝。

## 5. 测试结果

执行成功：

```text
npm run check
npx tsx src/editor/runtime/GracefulDisposeController.test.ts
```

覆盖的 mock 场景：

1. Autosave 成功 + collaboration 失败：`durable + degraded`；
2. Autosave 成功 + collaboration timeout：`durable + degraded`；
3. Autosave 失败 + collaboration 成功：`not_durable`；
4. Autosave 与 collaboration 同时 timeout：`not_durable`，两个 participant 都独立报告 timeout；
5. 重复 gracefulDispose 调用复用同一个 in-flight Promise；
6. 首次失败后 retry 成功，Autosave 进入 `disposed`；
7. 成功 dispose 后拒绝新的保存请求。

## 6. 回滚方案

本阶段只修改 Runtime contract/controller/test，尚未接入页面或协作 Provider。回滚时恢复 `contentEditorAdapter.ts` 的原 graceful dispose contract 与 `GracefulDisposeController.ts` 的单结果实现即可；不会影响 Production/Shooting 数据、Socket.IO 协议或现有业务 API。

