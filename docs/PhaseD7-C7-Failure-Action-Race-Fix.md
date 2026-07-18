# Phase D7-C.7 Failure Action Race Fix

## 1. 修改文件

- `src/components/editor/EditorLeaveFailureDialog.tsx`
  - 将原有单 Promise gate 改为显式 first-action-wins action state machine。
- `src/components/editor/EditorLeaveFailureDialog.test.ts`
  - 扩展竞态、重复、失败恢复与正常继续编辑测试。
- `docs/PhaseD7-C7-Failure-Action-Race-Fix.md`
  - 本报告。

本阶段未修改 ProductionDetail、Runtime、AutosaveCoordinator、DisposeController、useEditorLeaveGuard contract、Adapter、API、数据库、权限、版本、workflow、Yjs 或 Socket.IO。

## 2. First Action Wins 规则

`EditorLeaveFailureActionGate` 在首次点击的同步路径立即保存 winner，不等待 React 完成按钮 disabled 状态渲染。

| 首次动作 | 随后动作 | 行为 |
| --- | --- | --- |
| retry | discard 或 retry | 忽略随后动作；仅执行 retry |
| discard | retry 或 discard | 忽略随后动作；仅执行 discard |
| 任一 winner 失败 | 任一后续动作 | 不自动切换；winner settle 后释放 gate，用户可再次明确操作 |

后续动作返回 `{ accepted: false, winner }`，不调用 callback，因此不能创建第二个保存、destroy 或 navigation 流程。

## 3. 状态机

```text
idle
  -> action_pending   (同步锁定 retry 或 discard)
  -> action_running   (调用 winner callback)
  -> action_completed (winner 成功 settle)
  -> idle             (释放 gate)

action_running
  -> idle             (winner 失败；不执行备用动作)
```

组件根据 action state 与 LeaveGuard 的 `leaving` / `disposing` 状态禁用按钮。即使旧 React 闭包仍收到第二个点击，gate 的同步锁也会拒绝它。

## 4. 测试结果

执行：

```text
npx tsx src/components/editor/EditorLeaveFailureDialog.test.ts
npm run check
```

结果：均通过。

覆盖：

1. retry 后快速 discard：retry 是唯一 winner；
2. discard 后快速 retry：discard 是唯一 winner；
3. retry 后 retry：只执行一次；
4. discard 后 discard：只执行一次；
5. winner callback 失败后 gate 返回 `idle`，且不会自动触发另一动作；
6. 继续编辑不进入 action gate，保持原有关闭 dialog 行为；
7. 对话框仍在 `not_durable`、`interrupted` 与 `durable` 的既有显示规则下工作。

## 5. 回滚

回滚仅需还原 `EditorLeaveFailureDialog.tsx` 的 action gate 与对应测试。不会涉及 Runtime、数据、API、版本、协作协议或 Production 业务规则。

本阶段未进入 Shooting。
