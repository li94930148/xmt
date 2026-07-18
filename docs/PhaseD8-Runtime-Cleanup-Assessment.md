# Phase D8 Runtime Cleanup Assessment

## 1. 当前架构状态

```text
ProductionDetail                     ShootingDetail
  createProductionEditorAdapter        createShootingEditorAdapter
              \                         /
                       ContentEditor
                            |
                 ContentEditorRuntime
                    |             |
       RuntimeAutosaveCoordinator  RuntimeHandleBridge
                    |             |
              adapter.persist     useEditorLeaveGuard
                    |             |
           existing page/API      gracefulDispose / destroy

ContentEditor -> useCollaborativeDocument -> Editor -> syncToYjs -> Yjs/provider/socket
```

Runtime 的职责已稳定在 Adapter 驱动的保存协调、revision、graceful dispose 和通用 handle 上。协作初始化仍在既有 `ContentEditor` / `Editor` / collaboration 层。

## 2. 活跃调用链

### Production

```text
ProductionDetail
-> createProductionEditorAdapter
-> ContentEditor(adapter, onRuntimeHandleChange)
-> ContentEditorRuntime
-> RuntimeAutosaveCoordinator
-> adapter.persist(existing Production save path, version_action: none)
```

页面通过 `useEditorLeaveGuard` 在受控导航前调用 Runtime handle 的 `gracefulDispose()`；失败 UI 使用同一个共享 Dialog。版本、审批、权限与协作 room 仍由 Production 页面/既有层管理。

### Shooting

```text
ShootingDetail
-> createShootingEditorAdapter
-> ContentEditor(adapter, onRuntimeHandleChange)
-> ContentEditorRuntime
-> RuntimeAutosaveCoordinator
-> adapter.persist(updateShooting(...script_content))
```

Shooting 也通过 `useEditorLeaveGuard` 使用 Runtime handle。D7-E 的浏览器验收已覆盖双用户协作、autosave、失败、retry、discard 和同动作重复点击。

### Runtime 与 handle bridge

- `ContentEditorRuntime.tsx` 创建 `RuntimeAutosaveCoordinator` 与 `GracefulDisposeController`；
- `ContentEditor.tsx` 在 adapter 存在时递增本地 revision 并调用 `handle.scheduleSave()`；
- `RuntimeHandleBridge.ts` 将 opaque `ContentEditorRuntimeHandle` 传给页面，不暴露 editor、Y.Doc、provider 或 socket；
- `useEditorLeaveGuard` 只调用该 handle，不依赖业务类型或路由实现。

## 3. 旧逻辑与 dead-code 审计

| 项目 | 发现 | 状态 | 清理判断 |
| --- | --- | --- | --- |
| `syncToDatabase` | 仅在 `writeConsistency.ts` 定义及由 `cancelDatabaseSync` 内部调用；无 `src/` 页面调用 | 非活跃 | B |
| `cancelDatabaseSync` | 同上；无 `src/` 页面调用 | 非活跃 | B |
| `syncToYjs` | `src/components/editor/Editor.tsx` 仍活跃调用，用于既有协作初始化/seed 保护 | 活跃 | C |
| `writeConsistency.ts` | 同时包含非活跃 database primitive 与活跃 Yjs primitive | 混合 | C（文件整体） |
| 页面级旧 debounce/ref | Production/Shooting 不再引用 `syncToDatabase`、`cancelDatabaseSync` 或旧 autosave refs | 已迁移 | 无单独残留可删 |
| `RichTextEditor` / `mode="legacy"` | `ContentEditor` 内部引用；`AddTopic.tsx` 仍明确使用 legacy mode | 活跃兼容 | C |
| `ContentEditor` fallback runtime adapter | 无 adapter 的 rich/legacy 页面仍需要兼容 façade 与 handle 生命周期 | 活跃兼容 | C |
| `syncToYjs` collaboration logic | 不属于数据库 debounce；受 Yjs 初始化规则保护 | 活跃 | C |

静态扫描还确认 `src/editor/runtime/` 与 `src/editor/contracts/` 没有导入 Yjs、`SocketYjsProvider`、Socket.IO client 或 `useCollaborativeDocument`。

## 4. 删除风险

### `syncToDatabase` / `cancelDatabaseSync`

虽然当前源码没有调用者，直接删除仍有风险：历史文档仍将其描述为写入一致性 primitive，且它与 `syncToYjs` 共处同一文件。一次粗粒度删除可能误伤协作初始化，或使未来仍在维护分支的 legacy 调用点失去兼容入口。

### RichTextEditor

不能删除。AddTopic 明确运行在 `mode="legacy"`，且旧 HTML 内容兼容与主题规范仍引用该组件。删除会改变现有业务页面行为，超出 D8 范围。

### ContentEditor / Editor / collaboration

不能删除或下沉到 Runtime。它们仍承载 Tiptap、toolbar、Yjs provider、presence、Socket 连接和 `syncToYjs` 初始内容保护；Runtime 保持不依赖这些实现是既定边界。

## 5. 分阶段清理计划

| 分级 | 项目 | 建议 | 前置验证 |
| --- | --- | --- |
| A：可立即删除 | 无 | 本轮没有零风险的生产代码删除项 | 不适用 |
| B：迁移后删除 | `syncToDatabase`、`cancelDatabaseSync` | 新开独立 cleanup task：先增加/执行静态 import 检查与 legacy 页面回归，再仅删除这两个 database debounce export 和相关死辅助代码 | 全仓引用为零；Production/Shooting/AddTopic/Publishing 编辑回归；`syncToYjs` 单测与双用户协作回归 |
| C：暂不能删除 | `syncToYjs`、`writeConsistency.ts` 文件、`Editor.tsx` 协作初始化、RichTextEditor、ContentEditor fallback adapter/legacy 分支 | 保留 | 需先完成 legacy 页面迁移、Yjs 初始化专项设计与完整协作协议回归 |

建议执行顺序：

1. 将 `syncToDatabase` / `cancelDatabaseSync` 标记 deprecated（不改行为）；
2. 在独立任务中建立对其零调用的 CI 静态检查；
3. 对 legacy/rich 页面运行编辑、保存、协作回归；
4. 仅删除两个 database debounce primitive，绝不删除/重写 `syncToYjs`；
5. RichTextEditor 仅在 AddTopic 等 legacy 调用点全部迁移并经过一个发布周期后再评估。

## 6. 回滚方案

本 D8 为评估，无运行时代码变更，因而无需代码回滚。

未来 B 级清理的回滚应是独立、小提交：恢复 `writeConsistency.ts` 中的两个 database primitive 及其测试，不触碰 Runtime、Adapter、Yjs、Socket.IO、Production/Shooting API 或数据库。任何协作异常均应停止清理任务并回滚该独立提交。
