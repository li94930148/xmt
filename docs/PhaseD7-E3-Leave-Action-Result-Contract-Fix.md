# Phase D7-E.3 Leave Action Result Contract Fix

## 修改文件

- `src/hooks/useEditorLeaveGuard.ts`
- `src/components/editor/EditorLeaveFailureDialog.tsx`
- `src/components/editor/EditorLeaveFailureDialog.test.ts`
- `src/pages/ProductionDetail.tsx`（仅回调结果透传）
- `src/pages/ShootingDetail.tsx`（仅回调结果透传）

未修改 Runtime、AutosaveCoordinator、DisposeController、Adapter、API、数据库、权限、workflow、Yjs 或 Socket.IO。

## 合同变更

新增 `LeaveActionResult`，明确区分：

- `proceeded`：continuation 已进入完成路径；
- `waiting_confirmation`：保存仍未 durable，dialog 保持可操作；
- `cancelled`：本次动作未被 Guard 接受；
- `failed`：调用异常。

`retry()` 与 `discardAndLeave()` 不再以 `null` 表达业务结果。Production/Shooting 回调直接返回 Guard 结果，不再 `await` 后丢弃。

## Dialog 行为

Action gate 现在按 `LeaveActionResult.decision` 判断：

- `proceeded` -> `action_completed`；
- `waiting_confirmation` / `cancelled` -> 回到 `idle`，dialog 保持打开；
- `failed` / callback 异常 -> 回到 `idle`，显示通用失败提示。

因此 Promise fulfilled 不再被误判为“已经离开”。

## 测试

已通过：

```text
npx tsx src/components/editor/EditorLeaveFailureDialog.test.ts
npx tsx src/hooks/useEditorLeaveGuard.test.ts
npx tsx src/pages/ShootingLeaveFlow.test.ts
npm run check
```

覆盖 proceeded、waiting_confirmation、cancelled、failed、失败后恢复 idle，以及 retry/discard gate 竞争。

## 浏览器回归状态

D7-E.1 的 hold/release 基础设施仍适用，但本轮未重新执行真实浏览器 `retry -> discard` 与 `discard -> retry` 回归；不得将其视为已通过。下一步应使用 Shooting 35 重新运行该两项并确认仅一次 navigation。

## 回滚

回滚本阶段仅需恢复上述五个文件；不涉及数据迁移、API 或协作协议。
