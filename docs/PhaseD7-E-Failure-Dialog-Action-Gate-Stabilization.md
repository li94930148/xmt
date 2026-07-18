# Phase D7-E Failure Dialog Action Gate Stabilization

## 修改范围

- `src/components/editor/EditorLeaveFailureDialog.tsx`
- `src/components/editor/EditorLeaveFailureDialog.test.ts`

未修改 Production/Shooting 页面、Runtime、AutosaveCoordinator、LeaveGuard、Adapter、API、Yjs、Socket.IO 或数据库。

## 修复方案

失败对话框的 `EditorLeaveFailureActionGate` 现在分为两个明确阶段：

1. 在当前点击事件内同步写入 `action_pending` 与 winner；任何随后的 retry/discard 立即被拒绝。
2. winner 的实际回调放到下一事件循环执行。这样失败 dispose 的 `finally` 有机会先清除其 in-flight 标记，避免 retry 重新取得已完成的旧流程而成为空操作。

winner 回调开始后状态为 `action_running`；成功后保持 `action_completed`，失败后才回到 `idle`，允许用户重新选择一次操作。

## 组件测试

`src/components/editor/EditorLeaveFailureDialog.test.ts` 已覆盖：

- retry 后 discard：retry 是唯一 winner；
- discard 后 retry：discard 是唯一 winner；
- retry/retry、discard/discard：只执行一次；
- 异步失败与同步异常：gate 都会恢复 idle，下一次动作可以执行；
- winner 在 callback 尚未开始前已经被同步锁定。

执行结果：

```text
npx tsx src/components/editor/EditorLeaveFailureDialog.test.ts
EditorLeaveFailureDialog tests passed

npm run check
tsc --noEmit 通过
```

## 浏览器级验证

- 使用本地 Shooting fixture `35`、localhost failure proxy 与独立登录会话。
- 代理自检：`shooting_reject_once` 对 `PUT /api/workflow/shooting/35` 返回预期 503。
- 浏览器中成功打开 failure dialog，并复现快速 `retry/discard` 与 `discard/retry` 的原始问题。

修复后完整的两组浏览器竞态回归**未完成**：使用真实键入生成编辑变更时，debounce autosave 会先于离开动作消费 `reject_once`，使随后的 graceful dispose 正常导航，无法再次构造同一失败对话框路径。该行为不改变组件测试结论，但不足以作为浏览器闭环通过的证据。

fixture 已通过正常编辑与 autosave 恢复为：

```text
D7 Shooting Graceful Dispose Fixture Content
```

## 结论与后续

代码与组件级竞态测试完成，类型检查通过；但浏览器级 case 6/7 尚未获得新的通过证据。因此本阶段应视为**实现已完成、浏览器验收待补**，不进入 D8。

后续应使用不会被普通 autosave 提前消费的单次失败控制方式（例如在页面已产生 pending revision 后再激活代理）重新执行：

- 快速 retry/discard：retry winner；
- 快速 discard/retry：discard winner；
- 每个场景仅一次 navigation。
