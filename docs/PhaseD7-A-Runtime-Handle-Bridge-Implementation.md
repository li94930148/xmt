# Phase D7-A Runtime Handle Bridge Implementation

## 1. 修改文件

- `src/components/ContentEditor.tsx`
- `src/editor/runtime/ContentEditorRuntime.tsx`
- `src/editor/runtime/RuntimeHandleBridge.ts`（新增）
- `src/editor/runtime/RuntimeHandleBridge.test.ts`（新增）
- `docs/PhaseD7-A-Runtime-Handle-Bridge-Implementation.md`（新增）

未修改 ProductionDetail、ShootingDetail、leave guard、Yjs、Socket.IO、Adapter、API、数据库、权限、版本或 workflow。

## 2. Handle bridge

`ContentEditorProps` 新增可选回调：

```ts
onRuntimeHandleChange?: (handle: ContentEditorRuntimeHandle | null) => void;
```

它只传递既有的 `ContentEditorRuntimeHandle` contract。未暴露 Tiptap instance、Yjs document、SocketYjsProvider、Socket、Adapter 或任何业务对象。

新增的 `RuntimeHandleBridge` 负责：

- Runtime ready 时发布当前 handle；
- Runtime dispose 或 ContentEditor unmount 时发布 `null`；
- 旧 handle 释放时只会清空它自己，不能清空已发布的新 handle；
- 回调替换时先向旧回调发布 `null`，再向新回调发布当前 handle，避免调用方保留陈旧引用；
- 没有 callback 时保持静默且不影响现有行为。

## 3. 生命周期实现

`ContentEditorRuntime` 增加内部通用 `onDisposed(handle)` 回调。在 Runtime effect cleanup 中，它先通知 ContentEditor 当前 handle 已失效，再执行既有立即释放的 `destroy()`。

ContentEditor 将 Runtime 的 `onReady` 与 `onDisposed` 接到 bridge：

```text
Runtime ready      -> ContentEditor runtime ref -> bridge(handle)
document switch    -> old Runtime onDisposed -> bridge(null) -> new Runtime ready -> bridge(new handle)
component unmount  -> bridge(null) + existing Runtime immediate destroy
```

这不是页面导航接入，也不调用 `gracefulDispose()`；D7-A 仅建立页面未来获取通用 handle 的能力。现有调用方不传 `onRuntimeHandleChange` 时，编辑、自动保存、协作与卸载行为不变。

## 4. 测试结果

执行成功：

```text
npm run check
npx tsx src/editor/runtime/RuntimeHandleBridge.test.ts
npx tsx src/editor/runtime/GracefulDisposeController.test.ts
```

RuntimeHandleBridge mock 测试覆盖：

1. Runtime ready 发布 handle；
2. `dispose()`（对应 unmount）发布 `null`；
3. 未设置 callback 时 publish/release/dispose 均安全；
4. document/editor 切换后，旧 handle 的延迟 release 不会清空新 handle；
5. 替换 listener 时，旧 listener 接收 `null`，新 listener 接收当前 handle。

## 5. 兼容性与后续边界

- 回调为可选 prop，所有现有 ContentEditor 调用无需变更。
- Runtime handle 仍然是唯一外部能力边界；页面不得直接访问协作 Provider 或 editor instance。
- 下一阶段如需实现 leave guard，应通过该 callback 存储 handle ref，并仅在受控导航前调用 `gracefulDispose()`。

