# Phase D7-B useEditorLeaveGuard Implementation

## 1. 修改文件

- `src/hooks/useEditorLeaveGuard.ts`（新增）
- `src/hooks/useEditorLeaveGuard.test.ts`（新增）
- `docs/PhaseD7-B-useEditorLeaveGuard-Implementation.md`（新增）

未修改 ProductionDetail、ShootingDetail、ContentEditor、Runtime、Yjs、Socket.IO、Adapter、API、数据库、权限、版本或 workflow。

## 2. Hook 接口

```ts
const {
  requestLeave,
  retry,
  discardAndLeave,
  state,
  result,
} = useEditorLeaveGuard({ runtimeHandleRef, timeoutMs });
```

输入是只包含 `current: ContentEditorRuntimeHandle | null` 的通用 ref。Hook 不导入 Router、页面、Tiptap、Yjs、Socket、Adapter 或任何业务类型。

`requestLeave()` 接收离开原因和 navigation continuation。它在 Runtime 存在时调用 `gracefulDispose()`；无 handle 时直接执行 continuation，保留只读/未挂载 editor 场景的正常导航行为。

## 3. 状态与流程

实现的状态：

```text
idle -> leaving -> disposing -> completed
                         -> waiting_confirmation
```

规则：

- `durable`：自动执行 continuation，进入 `completed`。
- `durable + degraded`：自动执行 continuation，并返回 `collaboration_unconfirmed` warning。
- `not_durable` / `interrupted`：不执行 continuation，进入 `waiting_confirmation`。
- `retry()`：仅在 `waiting_confirmation` 时重用原离开请求，再次调用 gracefulDispose。
- `discardAndLeave()`：仅在等待确认时执行；先 `destroy()`，再执行原 continuation。

异步编排保存在 `EditorLeaveGuardController` 中，Hook 以稳定 ref 持有它并订阅状态。这避免 React 重渲染创建新的 in-flight 流程，也避免将频繁变化的 handle 放入 callback dependency。

## 4. 防重复导航

Controller 对 in-flight request 返回同一个 Promise。连续点击离开按钮不会创建第二个 gracefulDispose、第二个 destroy 或第二次 continuation。

一旦 continuation 已执行，Controller 进入 `completed` 并保留完成结果；后续 request 不会再次导航。

## 5. 测试结果

执行成功：

```text
npm run check
npx tsx src/hooks/useEditorLeaveGuard.test.ts
npx tsx src/editor/runtime/GracefulDisposeController.test.ts
npx tsx src/editor/runtime/RuntimeHandleBridge.test.ts
```

Leave guard mock 覆盖：

1. `durable` 自动离开；
2. `durable + degraded` 自动离开并返回 warning；
3. `not_durable` 阻止 continuation；
4. 首次失败后 retry 成功；
5. discard 先 destroy、后 continuation；
6. 连续 requestLeave 复用同一个 in-flight Promise；
7. 无 Runtime handle 时直接继续。

## 6. 回滚方式

本阶段只新增未接入的 hook 与 mock 测试。删除这两个新增文件即可回滚；现有页面导航、Runtime、协作与业务保存行为未改变。

## 7. 后续边界

下一阶段才可通过 D7-A 的 `onRuntimeHandleChange` 将 handle ref 交给此 hook，并先接入 Production 的明确页面按钮。该接入不属于 D7-B。

