# Phase D7-C.5 Production Failure UI Implementation

## 1. 修改文件

- `src/components/editor/EditorLeaveFailureDialog.tsx`
  - 新增通用的 Production 页面 leave-failure dialog。
  - 仅依赖 `useEditorLeaveGuard` 的通用状态和结果类型，不依赖 Production API、Adapter、Yjs、Socket.IO 或 Runtime 实现。
- `src/components/editor/EditorLeaveFailureDialog.test.ts`
  - 新增对话框视图与 action gate 测试。
- `src/pages/ProductionDetail.tsx`
  - 消费 `useEditorLeaveGuard` 的 `state`、`result`、`retry`、`discardAndLeave`。
  - 在 `waiting_confirmation` 时显示失败对话框。
- `docs/PhaseD7-C5-Production-Failure-UI-Implementation.md`
  - 本报告。

未修改 Runtime、AutosaveCoordinator、DisposeController、ContentEditorRuntime、Adapter、API、数据库、权限、版本、workflow、Yjs 或 Socket.IO。

## 2. 页面行为

| Guard 结果 | Production 页面行为 |
| --- | --- |
| `durable` | 保持原行为：执行既有 navigation，不显示失败 dialog。|
| `durable + degraded` | 保持原行为：执行 navigation，并保留已有协作交接未确认通知。|
| `not_durable` | 停留当前页，显示“未能确认保存”或“保存确认超时” dialog。|
| `interrupted` | 停留当前页，显示“保存过程已中断” dialog。|

`not_durable` dialog 提供：

- **继续编辑**：关闭 dialog，继续保留页面和编辑器；
- **重试保存**：调用现有 `retry()`；
- **放弃离开**：调用现有 `discardAndLeave()`。

`interrupted` 不展示 retry，避免对已取消或已销毁的 handle 发起不可执行操作；保留“继续编辑”和“放弃离开”。

## 3. 重复操作保护

`EditorLeaveFailureActionGate` 保证在 React 完成禁用按钮重渲染前，同一时刻只有一个 retry 或 discard action 会执行。dialog 在 `leaving`、`disposing` 或 action in-flight 时禁用所有操作，避免重复 retry、重复 destroy 或重复 navigation。

Production 页面把“继续编辑”实现为仅关闭 dialog。下次用户发起受控导航时，会重新打开失败 dialog（若仍得到 `waiting_confirmation`），不会隐式丢弃内容。

## 4. 测试结果

执行：

```text
npx tsx src/components/editor/EditorLeaveFailureDialog.test.ts
npm run check
```

结果：均通过。

覆盖：

1. `not_durable` 生成 dialog 视图，并渲染“未能确认保存”“重试保存”“放弃离开”；
2. retry action 被调用；
3. discard action 被调用；
4. `interrupted` 显示中断文案且隐藏 retry；
5. `durable` 不生成失败 dialog 视图；
6. 连续 retry 调用复用同一个 in-flight action，只执行一次 callback。

## 5. 兼容性与后续验证

- 正常页面导航仍经现有 `handleGuardedNavigate` 和 `useEditorLeaveGuard`；未改保存 payload、`version_action`、版本历史、权限或协作房间。
- 无 Runtime handle 时仍由 `useEditorLeaveGuard` 直接执行 continuation；本阶段未改变该分支。
- D7-C.4 的 failure injection proxy 尚未在本阶段接入浏览器验收。后续应使用 `reject_once`、`timeout_once` 和 `passthrough` 验证 `not_durable` dialog、retry 成功后一次导航与 discard 行为。
- 本阶段不进入 Shooting。
