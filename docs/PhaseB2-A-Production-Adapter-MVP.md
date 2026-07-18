# Phase B2-A：Production Adapter MVP

## 1. 修改文件

| 文件 | 变更 |
| --- | --- |
| `src/editor/adapters/productionEditorAdapter.ts` | 新增 Production 到通用 `ContentEditorAdapter` 的无业务映射工厂。 |
| `src/pages/ProductionDetail.tsx` | 以 `ProductionEditorAdapter` 提供 Runtime 编辑上下文；将原有的内容自动保存回调作为 `persist()` 传入。 |
| `src/editor/runtime/ContentEditorRuntime.tsx` | 增加通用的保存状态回调出口，供既有编辑状态提示继续消费；不包含 Production 业务语义。 |
| `src/components/ContentEditor.tsx` | 接收可选 Adapter，在存在 Adapter 时向 Runtime autosave handle 提交本地 revision；未传 Adapter 的既有页面保持原写入路径。 |

未修改 `Editor.tsx`、Shooting 页面、Yjs、Socket.IO、`writeConsistency.ts`、数据库、API 结构、权限或版本系统。

## 2. Adapter 职责

`createProductionEditorAdapter()` 仅映射已由 `ProductionDetail` 解析的通用编辑上下文：

- `documentId`、`collaborationRoom`
- `initialContent`
- `readonly`
- `capabilities`
- `persist(content, context)`

它不判断权限、不读取或写入 history、不处理审批/工作流，也不拥有 major/minor 版本行为。Adapter 的 `persist()` 由页面传入，仍使用已有 `updateProduction()` 调用和 `version_action: 'none'`。

## 3. Production 调用链变化

```text
ProductionDetail
  -> createProductionEditorAdapter(已解析的页面上下文)
  -> ContentEditor
  -> ContentEditorRuntime
  -> RuntimeAutosaveCoordinator
  -> adapter.persist
  -> 原有 updateProduction(..., version_action: 'none')
```

协作房间仍通过 `getCollaborationRoomId('production', production.id)` 生成，值不变。版本按钮继续直接调用原有 `handleVersionedSave('minor' | 'major')`，未委托给 Adapter 或 Runtime。`canEditProduction` 和当前版本判断仍由页面计算，Adapter 仅消费其结果作为 `readonly`。

## 4. 保存链路变化

原页面内的 2500ms `syncToDatabase` 调度移入已存在的 Runtime `AutosaveCoordinator`。每次编辑递增本地 revision；协调器只保存最新排队 revision，且旧请求完成不会将较新 revision 标记为已同步。实际持久化 payload 未变：

```ts
updateProduction(production.id, {
  topic_id: production.topic_id,
  version: production.version,
  content,
  status: editData.status,
  version_action: 'none',
})
```

Runtime 的通用保存状态经现有 editor-state event bus 映射为原有保存/冲突提示，不增加 API 请求。Runtime 卸载会销毁协调器并清理尚未发出的防抖保存；已发出的请求不会被中断。

## 5. 风险与限制

- 此阶段未更改 Yjs、provider 或 Socket.IO；Production 的协作 props 与 room 均保持原值。
- Adapter 每次内容变更会更新其 `initialContent` 引用，但 Runtime coordinator 仅以 `documentId` 建立，持久化始终通过最新的 adapter ref 调用，不会因编辑重建 coordinator。
- 真实 Production 编辑页需要已认证的业务数据才能做端到端人工验证；本次未执行生产环境操作、部署或数据库变更。
- 未进入 Shooting Adapter 阶段。

## 6. 测试结果

| 验证 | 结果 |
| --- | --- |
| `npm run check` | 通过（`tsc --noEmit`）。 |
| Production Adapter mock contract | 通过：验证 document/room 透传及 `persist(content, autosave revision)` 回调参数。 |
| `git diff --check` | 通过，无空白错误。 |

## 7. git diff 摘要

- 新增一个通用、无 Production 领域字段的 Adapter 工厂。
- Production 页面不再直接创建数据库防抖任务，改为把原保存回调交给 Runtime contract。
- Runtime/ContentEditor 仅新增通用 adapter autosave 与状态桥接，未向编辑器或协作层加入 Production 判断。
- 本阶段未提交 Git，也未修改受限文件或系统。
