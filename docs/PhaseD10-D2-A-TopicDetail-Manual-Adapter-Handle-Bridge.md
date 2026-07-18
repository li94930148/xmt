# Phase D10-D2-A TopicDetail Manual Adapter + Runtime Handle Bridge

## 1. 修改文件

- `src/editor/adapters/topicDetailManualAdapter.ts`
- `src/editor/adapters/topicDetailManualAdapter.test.ts`
- `src/pages/TopicDetail.tsx`

本阶段没有修改 `updateTopic()`、Topic payload、API、数据库、Runtime、SaveStrategy、ManualSaveController、Yjs、Socket.IO、Production、Shooting 或 AddTopic。

## 2. Adapter 职责

新增 `createTopicDetailManualAdapter()`，仅映射 Runtime 所需上下文：

```text
documentId        topic:<id>
collaborationRoom ''
initialContent    baseline outline
readonly          页面已计算的 !canEditTopic || !editOutline
capabilities      collaboration:false, manualSave:true
saveStrategy      manual
persist           调用方注入
```

adapter 不 import `updateTopic`，不构造 Topic payload，也不判断权限或 workflow。D10-D2-A 在 TopicDetail 注入无副作用 mock persist；没有 UI 路径调用 `handle.manualSave()`。真实 aggregate persist 仍明确留给后续 D10-D2-B。

## 3. Runtime 接入方式

TopicDetail 的 ContentEditor 已接收：

- `adapter={topicDetailManualAdapter}`
- `onRuntimeHandleChange={handleTopicRuntimeHandleChange}`

页面只保存 opaque `ContentEditorRuntimeHandle`，并以 `data-topic-manual-runtime="ready"` 提供验收可观察信号；不暴露 Tiptap、Yjs、provider 或 socket。

`handleSave()` 没有改动：它仍是 D10-D1 的 aggregate `updateTopic()` owner。本阶段没有让 manual handle 接管保存 API。

## 4. 验证结果

通过：

```text
npx tsx src/editor/adapters/topicDetailManualAdapter.test.ts
npx tsx src/editor/runtime/SaveStrategyDispatch.test.ts
npx tsx src/editor/runtime/ManualSaveController.test.ts
npx tsx src/editor/runtime/GracefulDisposeController.test.ts
npx tsx src/pages/topicDetailAggregateDraft.test.ts
npm run check
```

覆盖：

- manual adapter 解析为 `manual`；`shouldScheduleRuntimeAutosave()` 为 false；
- 输入本身不调用 mock persist；显式 `manualSave()` 调用 mock persist；destroy 后返回 `already_destroyed`；
- SaveStrategy autosave/manual/external 分流回归；
- ManualSaveController、GracefulDisposeController 与 Topic aggregate draft 回归。

浏览器使用可回滚 Topic fixture `112` 验证：

- 点击编辑后，Runtime handle bridge 状态为 `ready`，且只有一个 rich editor；
- 输入唯一标记，等待超过 autosave delay 后刷新；标记未持久化；
- 因此 TopicDetail manual strategy 没有启动 timer、`scheduleSave()` 或 autosave persist；fixture 未被该测试写入。

Production/Shooting 代码与 Adapter 未变更；其现有 SaveStrategy、ManualSave、graceful-dispose 测试均通过。D10-C3 的真实浏览器 Production/Shooting 回归继续有效。

## 5. 观察项与下一步

Topic fixture 的既有 `assignee_id: null` 仍会触发受控 `<select>` warning；本阶段未改变该数据归一化行为。

下一步 D10-D2-B 才可把 adapter 的 injected `persist()` 接到页面的 aggregate save command，并要求：只由 `manualSave()` 发出一次完整 `updateTopic()`；不改变 D10-D1 payload、revision 或 in-flight gate。

