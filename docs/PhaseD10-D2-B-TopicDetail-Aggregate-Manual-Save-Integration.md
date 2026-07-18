# Phase D10-D2-B TopicDetail Aggregate Manual Save Integration

## 1. 修改文件

- `src/pages/TopicDetail.tsx`
  - 将 D10-D2-A 的 Topic manual adapter mock `persist` 换为页面注入的 aggregate-save bridge。
  - 保存按钮通过 Runtime handle 的 `manualSave(outline, aggregateRevision)` 发起保存。
  - bridge 按 revision 读取保存快照，并将它交给页面拥有的 `TopicDetailAggregateSaveGate` 和既有 `updateTopic()` 调用。
- `src/pages/topicDetailManualSaveBridge.test.ts`
  - 新增桥接层测试，覆盖单字段、全字段、旧 revision、重复保存和失败重试。

未修改 Production、Shooting、AutosaveCoordinator、Yjs、Socket.IO、API 契约或数据库 schema。

## 2. 保存调用链

```text
TopicDetail 保存按钮
  -> runtimeHandle.manualSave(outline, aggregateRevision)
  -> TopicDetailManualAdapter.persist()
  -> 页面注入的 aggregate save command
  -> TopicDetailAggregateSaveGate
  -> updateTopic(id, 六字段 aggregate payload)
```

Adapter 只转发 `persist`，不导入 `updateTopic()`，不拼装 Topic payload，保持 TopicDetail 为聚合保存 owner。

## 3. Revision、draft 与失败语义

- 点击保存时先复制当前 aggregate draft，并按 `aggregateRevision` 保存快照；标题、描述、详情和大纲均在同一六字段 payload 中提交。
- API 成功后，只有保存 revision 仍等于当前 revision 才以服务端刷新结果更新 baseline、清除 dirty 并退出编辑态。
- 保存期间发生新编辑时，旧请求成功不会覆盖新 draft；页面保留新 draft 并保持 dirty。
- API 失败会让 `manualSave()` 返回失败结果，保留 dirty 和当前 draft；相同 revision 可再次执行 manual save。
- Manual strategy 不调用 AutosaveCoordinator，也不在输入时安排 timer 或 `persist()`。

## 4. 测试结果

### 自动化

以下命令均通过：

```powershell
npx tsx src/pages/topicDetailManualSaveBridge.test.ts
npx tsx src/editor/adapters/topicDetailManualAdapter.test.ts
npx tsx src/editor/runtime/ManualSaveController.test.ts
npx tsx src/editor/runtime/SaveStrategyDispatch.test.ts
npx tsx src/pages/topicDetailAggregateDraft.test.ts
npm run check
git diff --check
```

桥接测试覆盖：单字段 manual save、全字段六字段 payload、旧 snapshot 不覆盖后续 draft、同 revision 去重，以及失败后的 retry。

### 浏览器验收（Topic 112）

- 编辑大纲为唯一标记 `D10_D2_B_MANUAL_SAVE_MARKER` 后，页面显示 dirty；未点击“保存”前没有自动保存动作。
- Runtime handle 状态为 ready；点击“保存”后显示保存成功，刷新 `/topics/112` 后唯一标记仍存在。
- 使用正常编辑和显式保存将 fixture 大纲恢复为空，刷新确认唯一标记不存在。

浏览器仅观察到既有的 `select value=null` React warning；本阶段没有修改该无关问题。

## 5. 结论与边界

TopicDetail 已完成 manual runtime 到既有 aggregate save 的接入，且仍不使用 autosave、Yjs 或协作房间。下一阶段若要处理离开保护，应另开任务；本阶段在此停止。
