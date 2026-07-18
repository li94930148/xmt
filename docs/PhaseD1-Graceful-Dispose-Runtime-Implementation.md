# Phase D1 Graceful Dispose Runtime Implementation

## 1 修改文件

|文件|变更|
|-|-|
|`src/editor/contracts/contentEditorAdapter.ts`|新增 Graceful Dispose 类型、通用 barrier contract，并扩展 Runtime handle。|
|`src/editor/contracts/autosaveCoordinator.ts`|新增可表达结果的 autosave flush contract。|
|`src/editor/runtime/AutosaveCoordinator.ts`|实现显式 flush result、失败传播、超时结果和 revision 结果。|
|`src/editor/runtime/GracefulDisposeController.ts`|新增纯 Runtime 的 graceful dispose 编排器。|
|`src/editor/runtime/ContentEditorRuntime.tsx`|将 gracefulDispose 暴露到 Runtime handle；保留 destroy 语义。|
|`src/editor/runtime/GracefulDisposeController.test.ts`|新增不访问真实 API 的 mock 测试。|
|`docs/PhaseD1-Graceful-Dispose-Runtime-Implementation.md`|本实现报告。|

未修改 ProductionDetail、ShootingDetail、ContentEditor、Editor、Adapter、Yjs、Socket.IO、API、数据库、权限、版本或 workflow。

## 2 新增contract

新增以下运行时无业务语义的类型：

- `GracefulDisposeStatus`：`synced`、`failed`、`timed_out`、`cancelled`、`already_destroyed`。
- `GracefulDisposeReason`：`route_transition`、`document_switch`、`explicit_leave`。
- `GracefulDisposeResult`：包含 status、reason、latestRevision、persistedRevision、通用 barrier 结果及可选 error。
- `ContentEditorDisposeBarrier`：通用 `flush({ timeoutMs })` 协议；Runtime 不知道它是否由 Yjs、离线缓存或其他基础设施实现。
- `AutosaveFlushResult`：从 `flush()` 返回 `synced`、`failed`、`timed_out` 或 `cancelled`，附带 revision 与 error。

`ContentEditorRuntimeHandle` 现增加：

```ts
gracefulDispose(options: GracefulDisposeOptions): Promise<GracefulDisposeResult>;
```

同时，handle 的 `flush()` 更新为返回 `AutosaveFlushResult`，不再只返回 `void`。

## 3 Runtime生命周期变化

`GracefulDisposeController` 只编排 Runtime 自身的 autosave 与调用方传入的通用 barrier：

```text
gracefulDispose
  -> 同一实例复用 in-flight Promise
  -> 顺序执行 generic barriers
  -> 在剩余 timeout 内 flush 最新 autosave revision
  -> 返回明确结果
```

本阶段没有页面调用该方法，也没有接入任何 Yjs barrier。因此 React unmount 仍保持既有行为：`destroy()` 立即释放、清除 pending autosave、不会等待网络。

`destroy()` 仍幂等；调用后 gracefulDispose 返回 `already_destroyed`。若 destroy 发生在 graceful 流程中，流程返回 `cancelled`，不会恢复或重启任何保存。

## 4 Autosave错误传播变化

此前 persist rejection 被 Coordinator 吸收，只能间接从 UI 状态判断。现在：

- persist 成功返回 `AutosaveFlushResult { status: 'synced' }`；
- persist rejection 返回 `{ status: 'failed', error }`；
- 调用预算耗尽返回 `{ status: 'timed_out' }`；
- destroyed 状态返回 `{ status: 'cancelled' }`。

Coordinator 仍使用本地 revision 排序。若旧 revision 已 in-flight、期间排入较新 revision，flush 会继续处理新 revision，并以最终最新持久化 revision 作为结果；旧 completion 不会把状态误报为最终 synced。

## 5 测试结果

执行：

```text
npm run check
npx tsx src/editor/runtime/GracefulDisposeController.test.ts
```

结果：均通过。

Mock 测试覆盖：

1. pending save + gracefulDispose → `synced`；
2. mock persist rejection → `failed` 并带回错误；
3. 未完成 persist 超过 timeout → `timed_out`；
4. destroy 后调用 → `already_destroyed`；
5. 旧 revision in-flight 时排入新 revision → 最终持久化新 revision；
6. 重复 gracefulDispose → 返回同一个 in-flight Promise，避免重复保存。

测试没有调用 Production/Shooting API、没有数据库写入，也没有 Yjs 或 Socket.IO 实现接入。

## 6 回滚方式

D1 仍是 Runtime Contract 层，尚未被页面导航调用。若需回滚：

1. 移除 `GracefulDisposeController.ts` 与其 mock 测试；
2. 恢复 contracts 中新增的 graceful/flush result 类型；
3. 恢复 Runtime handle 的原 `flush(): Promise<void>` 形态及 Runtime 中 controller 引用。

不需要数据库迁移、API 回滚、Socket.IO 协议回滚或业务数据处理。由于尚未进入页面接入，回滚不会改变线上导航或编辑行为。

## 7 git diff摘要

- D1 的源码变更仅位于 `src/editor/contracts/` 和 `src/editor/runtime/`。
- 新增 Runtime controller 与 mock 测试；没有业务页面文件变更。
- `git diff --check` 通过。
- 工作区还包含先前阶段的未提交文件；本报告只描述本阶段 D1 范围。

Phase D1 到此结束，不进入 D2 或 Runtime 清理。
