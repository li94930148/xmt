# Phase D8-B1 Legacy Database Sync Zero-Reference Verification

## 1. 扫描命令

以下命令在 `D:\xmt` 执行；扫描运行源码与测试，排除 `node_modules` 和历史文档，避免 docs 中的设计/历史描述被误认为调用：

```powershell
rg -n --glob '!node_modules/**' --glob '!docs/**' --glob '!*.md' syncToDatabase .
rg -n --glob '!node_modules/**' --glob '!docs/**' --glob '!*.md' cancelDatabaseSync .
rg -n '^export (function|type|interface)' src/collaboration/core/writeConsistency.ts
rg -n 'createProductionEditorAdapter|createShootingEditorAdapter|adapter=\{.*Adapter|onRuntimeHandleChange' src/pages/ProductionDetail.tsx src/pages/ShootingDetail.tsx
rg -n 'RuntimeAutosaveCoordinator|scheduleSave\(|adapterRef\.current\.persist|adapter\.persist' src/components/ContentEditor.tsx src/editor/runtime/ContentEditorRuntime.tsx src/editor/runtime/AutosaveCoordinator.ts
```

## 2. 扫描结果

### `syncToDatabase`

| 项目 | 结果 |
| --- | --- |
| 定义位置 | `src/collaboration/core/writeConsistency.ts:59` |
| 源码/测试 import 数 | 0 |
| 定义外调用数 | 0 |
| 源码/测试总匹配 | 1（仅定义） |

### `cancelDatabaseSync`

| 项目 | 结果 |
| --- | --- |
| 定义位置 | `src/collaboration/core/writeConsistency.ts:52` |
| 源码/测试 import 数 | 0 |
| 外部调用数 | 0 |
| 文件内调用数 | 1，仅 `syncToDatabase()` 在第 75 行调用 |
| 源码/测试总匹配 | 2（定义 + 上述内部调用） |

结论：两个 database debounce primitive 没有活跃 import 或外部调用。`cancelDatabaseSync` 不是独立活跃功能，它仅是待删除 `syncToDatabase` 的内部辅助函数。

## 3. 删除范围确认（供 B2 使用）

未来 B2 的最小删除范围只能包括 `writeConsistency.ts` 中与 database debounce 直接相关的内容：

- `SyncToDatabaseOptions`；
- `databaseTimers`；
- `cancelDatabaseSync()`；
- `syncToDatabase()`；
- 仅被上述代码使用的 database persistence callbacks/imports（若删除后成为未使用项）。

本次没有执行删除。

## 4. 保留范围确认

`writeConsistency.ts` 中必须原样保留的活跃边界：

- `CollaborationWriteSource`、`CollaborationDocKind`、`WriteSourceState`；
- `defineWriteSource()`：由 `useCollaborativeDocument.ts` 使用；
- `SyncToYjsOptions`；
- `syncToYjs()`：由 `src/components/editor/Editor.tsx` 使用；
- 其 Yjs、Schema、SocketYjsProvider 相关 import 与 `emitEditorState('yjs:update', ...)` 行为。

这些内容维持 Yjs snapshot 应用、首次内容 seed 与“非空文档不覆盖”的协作初始化链路。B2 不得移动文件、改名 export、调整 `Editor.tsx` import，或修改 provider/socket 行为。

## 5. Runtime autosave 入口确认

Production 与 Shooting 均已接入 Runtime：

- `ProductionDetail.tsx` import/创建 `createProductionEditorAdapter()`，并传入 `ContentEditor adapter={productionEditorAdapter}`；
- `ShootingDetail.tsx` import/创建 `createShootingEditorAdapter()`，并传入 `ContentEditor adapter={shootingEditorAdapter}`；
- `ContentEditor` 内容变更时递增 revision，调用 `runtimeHandle.scheduleSave()`；
- `ContentEditorRuntime` 创建 `RuntimeAutosaveCoordinator`，其 persist 委托给 `adapterRef.current.persist(...)`。

因此 Production/Shooting 的业务 autosave 入口是 Runtime -> Adapter persist，而不是 legacy database primitive。

## 6. B2 实施风险

静态零引用满足删除前置条件，但 B2 仍有以下风险：

1. `writeConsistency.ts` 是混合文件；误删/import 整理可能破坏 `syncToYjs` 或 `defineWriteSource`；
2. 历史 docs 仍描述旧 primitive，删除后需要更新规范，避免未来页面重新引入它；
3. AddTopic legacy、Topic/Publishing 非 adapter 页面虽然不调用该 primitive，仍需回归，以防共享 ContentEditor 或状态事件的误改；
4. 静态零引用不能替代 Production/Shooting 双用户协作与 Yjs 初始化回归。

建议 B2 保持单一小提交：只删除明确 database primitive，执行 `npm run check`、Production/Shooting 保存与双用户协作、AddTopic legacy 编辑回归；发现协作 seed、保存状态或 legacy 行为异常即回滚该提交。 
