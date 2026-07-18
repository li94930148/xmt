# Phase D7-D1 Shooting Graceful Dispose Integration

## 1. 修改文件

- `src/pages/ShootingDetail.tsx`
  - 接收 `ContentEditor` 的 Runtime handle bridge。
  - 接入既有 `useEditorLeaveGuard`。
  - 对明确离开路径使用 guarded navigation。
  - 复用 `EditorLeaveFailureDialog`，不复制 Production 的失败 UI。
- `src/pages/ShootingLeaveFlow.test.ts`
  - 新增 Shooting leave-flow 契约测试。
- `docs/PhaseD7-D1-Shooting-Graceful-Dispose-Integration.md`
  - 本报告。

本阶段未修改 ProductionDetail、Runtime、AutosaveCoordinator、DisposeController、useEditorLeaveGuard contract、ProductionAdapter、ShootingAdapter、API、数据库结构、权限、Yjs 或 Socket.IO。

## 2. Shooting 调用链

```text
ShootingDetail
  -> ContentEditor onRuntimeHandleChange
  -> runtimeHandleRef
  -> useEditorLeaveGuard
  -> gracefulDispose
  -> Runtime AutosaveCoordinator
  -> Shooting adapter.persist
  -> updateShooting(shooting.id, { script_content })
```

Shooting 的 Adapter、`script_content` 初始优先级、保存 payload 和 `shooting:<id>` collaboration room 均未改变。接入不读取或写入 `version_action`、`production_history`、Production approval 或 Production workflow。

## 3. 保护的导航路径

| 路径 | 行为 |
| --- | --- |
| 顶部返回按钮 → `/shooting` | 先调用 `gracefulDispose`，durable 后继续原 navigation。|
| 侧栏“查看创作版本历史” → `/production/:id` | 同样先调用 guard；只负责离开 Shooting，不介入 Production 版本逻辑。|

未接入：浏览器关闭、刷新、unmount cleanup、全局 Layout 导航、浏览器前进/后退。Shooting workflow 状态按钮只更新当前记录而不离开页面，仍沿用既有逻辑；未接入 Publishing 逻辑。

## 4. 失败 UI 与结果处理

`not_durable` / `interrupted` 时，Shooting 停留当前页面并复用共享 `EditorLeaveFailureDialog`：

- 继续编辑：关闭 dialog，不离开；
- retry：调用现有 LeaveGuard `retry()`；
- discard：调用现有 `discardAndLeave()`；
- `interrupted` 时由共享 dialog 隐藏不可执行的 retry。

`durable + degraded` 继续原 navigation，并使用既有全局通知说明协作交接尚未确认。该提示不改变保存 durability 判断。

## 5. 测试结果

执行：

```text
npx tsx src/pages/ShootingLeaveFlow.test.ts
npx tsx src/components/editor/EditorLeaveFailureDialog.test.ts
npx tsx src/hooks/useEditorLeaveGuard.test.ts
npm run check
```

结果：均通过。

覆盖：

1. Shooting 正常离开：durable 后 continuation 只执行一次；
2. 快速离开：以已调度的最新 script revision 完成 durable dispose 后再继续；
3. 保存失败：`not_durable` 阻止 navigation，并映射到共享 failure dialog；
4. retry：首次失败后恢复 durable 保存，并执行原 continuation 一次；
5. discard：保持 `destroy` 先于 navigation 的既有 contract；
6. 连续离开请求：复用同一个 in-flight graceful dispose，避免重复 navigation。

## 6. 回滚方式

回滚仅需移除 ShootingDetail 的 Runtime handle ref、LeaveGuard 调用、guarded navigation、failure dialog 和本阶段测试文件。不会影响 `script_content` 数据、Production、Runtime contract、Yjs、Socket.IO、workflow、Publishing 或数据库迁移。

本阶段完成后停止；未修改 Production，未进入后续 Shooting 浏览器验收阶段。
