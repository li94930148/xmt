# Phase B1-B：Autosave Bridge 实施报告

## 1. 新增文件

|文件|用途|
|-|-|
|`src/editor/runtime/AutosaveCoordinator.ts`|Runtime 内部的 revision-aware autosave 协调器，实现 Phase A `AutosaveCoordinator` contract。|
|`docs/PhaseB1-B-Autosave-Bridge-Implementation.md`|本阶段实施范围与验证记录。|

## 2. Runtime 变化

`src/editor/runtime/ContentEditorRuntime.tsx` 现在为每个 opaque `adapter.documentId` 创建一个 `RuntimeAutosaveCoordinator`，并将 Runtime handle 的 `scheduleSave`、`flush`、`cancel`、`getStatus` 委托给它。

协调器唯一的业务出口是 `adapter.persist(content, context)`。传入的 context 固定包含 `reason: 'autosave'`、adapter document ID 与 revision。Runtime 仍不解释资源类型，不导入或调用 Production/Shooting API。

## 3. Autosave 生命周期

1. `scheduleSave(content, revision)` 保存最新未持久化 revision，并设置 `saving` 状态。
2. 默认 2500ms 后，或由 `flush()` 立即触发，协调器开始保存。
3. 同一时刻只允许一个 `adapter.persist()` in-flight；完成后才会发送更高 revision。
4. `cancel()` 清除尚未开始的 timer/pending 请求，不中止已发出的 Promise。
5. Runtime `destroy()` 调用 coordinator `destroy()`，清理 timer 和 pending 请求；已发出的 Promise 不会再更新 Runtime 状态。

## 4. revision 处理方式

- 低于当前最新 revision 或已成功持久化的 revision 会被忽略。
- 相同 revision 已排队或 in-flight 时不会重复保存。
- 保存按 revision 顺序串行执行，因此 revision 1 的延迟返回不会在 revision 3 发出后写回服务器。
- 旧 revision 的成功/失败不会把最新 revision 设为 `synced`/`conflicted`；只有当前最新且没有 pending 更新的请求可以改变最终状态。

## 5. 测试结果

- `npm run check`：通过（`tsc --noEmit`，退出码 0）。
- Mock adapter 验证：通过。验证流程为 revision 1 发起保存后排入 revision 3，并重复提交 revision 3；确认只发生 revision 1、3 两次 `adapter.persist()` 调用；revision 1 延迟完成后才开始 revision 3；revision 3 成功后状态为 `synced`；destroy 后 revision 4 不再入队。

未接入 `syncToDatabase`、实际 API、Yjs、Socket.IO、Tiptap、Production 或 Shooting 页面。

## 6. git diff 摘要

本阶段代码仅新增 `AutosaveCoordinator.ts`（150 行），并修改 Runtime Shell（由 97 行变为 106 行）以委托内部 coordinator；新增本报告。未修改 `ContentEditor.tsx`、`Editor.tsx`、`writeConsistency.ts`、页面、数据库、接口、权限或版本系统。未进入 Phase B2。
