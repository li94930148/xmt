# Phase B1-A：Runtime Shell 实施报告

## 1. 新增文件

|文件|用途|
|-|-|
|`src/editor/runtime/ContentEditorRuntime.tsx`|ContentEditor Runtime 的未接入空壳。|
|`docs/PhaseB1-A-Runtime-Shell-Implementation.md`|本阶段实施范围与验证记录。|

## 2. Runtime 职责

`ContentEditorRuntime` 只消费 `ContentEditorAdapter` contract，并以 render-prop context 透传：

- `documentId` 与 `collaborationRoom`（opaque identity）；
- `readonly`；
- `capabilities`；
- 当前保存状态（本阶段固定为 `idle`）；
- `isDestroyed` 生命周期状态。

它通过 ref 和 `onReady` 提供 `ContentEditorRuntimeHandle`。Runtime 不解释资源类型，因此没有 Production、Shooting、API、权限或版本字段/分支。

## 3. 生命周期实现

- mount：登记 mounted 状态、重置 destroy 标识、调用可选 `onReady(handle)`。
- destroy：幂等地标记已销毁并更新 shell 生命周期状态。
- unmount：调用同一个幂等 `destroy()`。

当前 Shell 不创建 Tiptap editor、Yjs provider、awareness、socket listener 或 autosave timer，因此 `destroy()` 也不会断开全局 socket 或修改协作状态。后续阶段只能在 Runtime 实际拥有这些资源后，按架构计划扩展对应清理步骤。

## 4. 未接入能力

本阶段刻意未接入：

- `adapter.validate()` 的执行；
- `adapter.persist()` 与 `adapter.onManualSave()`；
- `AutosaveCoordinator`；
- Tiptap、`ContentEditor`、`Editor`；
- `useCollaborativeDocument`、Yjs、Socket.IO、presence；
- Production/Shooting adapter；
- 权限、版本、数据库或 API。

`scheduleSave`、`flush` 与 `cancel` 仅为满足 Phase A handle contract 的无副作用占位实现，绝不发起保存请求。

## 5. 类型检查结果

执行：`npm run check`

结果：通过（`tsc --noEmit`，退出码 0）。

## 6. git diff 摘要

本阶段实施代码仅新增 `ContentEditorRuntime.tsx`（97 行）及本报告。没有修改任何已有业务、编辑器、协作、数据库、接口、权限或版本文件；Runtime 尚未被现有页面导入。未进入 B1-B。
