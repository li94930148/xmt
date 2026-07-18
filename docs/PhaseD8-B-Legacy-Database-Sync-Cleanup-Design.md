# Phase D8-B Legacy Database Sync Primitive Cleanup Design

## 1. 文档边界

状态：设计与安全迁移准备。

本阶段只进行静态审计与未来清理设计。未删除 `syncToDatabase` / `cancelDatabaseSync`，未修改 Runtime、Yjs、Socket.IO、Production、Shooting、Adapter、Autosave 或数据库。

## 2. 全仓扫描结果

### `syncToDatabase`

| 类别 | 位置 | 结果 |
| --- | --- | --- |
| 定义 | `src/collaboration/core/writeConsistency.ts:59` | 活动 export，但没有业务调用者 |
| import | `src/` 源码无 import | 0 |
| 调用 | 仅在自身实现中调用 `cancelDatabaseSync(docId)` | 无页面/API/测试调用 |
| 测试覆盖 | 无直接针对该 primitive 的现行测试 | 需在删除前补“零引用”静态断言，而非为死代码补行为测试 |
| 文档引用 | 历史研究/设计/规范文件大量出现 | 不是运行调用，需在删除后逐步更新叙述 |

### `cancelDatabaseSync`

| 类别 | 位置 | 结果 |
| --- | --- | --- |
| 定义 | `src/collaboration/core/writeConsistency.ts:52` | 活动 export，但没有业务调用者 |
| import | `src/` 源码无 import | 0 |
| 调用 | 仅由 `syncToDatabase()` 内部使用 | 无页面/API/测试调用 |
| 测试覆盖 | 无直接现行测试 | 同上 |

结论：两个 database debounce primitive 已是非活跃生产代码；当前“无调用”结论基于 `src/` 静态扫描。历史文档不构成运行时依赖，但说明删除时需要同步更新规范，避免后续重新引入旧调用模式。

## 3. `writeConsistency.ts` 职责拆分

### 3.1 Database primitive（未来删除对象）

```text
SyncToDatabaseOptions
databaseTimers Map
cancelDatabaseSync(docId)
syncToDatabase(options)
```

职责为每 docId 的 2.5 秒 timer、保存/冲突状态事件、`persist(content)` 调用与回调通知。这些职责已由 `RuntimeAutosaveCoordinator` 在 Production/Shooting adapter 路径接管。

### 3.2 Yjs primitive（必须保持）

```text
CollaborationWriteSource / WriteSourceState
defineWriteSource()
SyncToYjsOptions
syncToYjs()
```

`useCollaborativeDocument.ts` 仍 import `defineWriteSource()`；`Editor.tsx` 仍 import `syncToYjs()`，用于：

- snapshot update 应用到目标 `Y.Doc`；
- provider/content/schema 满足时调用 `applyInitialContentOnce()`；
- 在初始内容真正被应用后发出 `yjs:update` 状态事件。

`SocketYjsProvider.applyInitialContentOnce()` 自身仍保障“已销毁、已初始化或 fragment 非空时不覆盖”。这是当前双用户协作、刷新恢复、初始 seed 不重复的边界，不能随 database cleanup 改动。

## 4. 未来拆分方案

目标不是立即移动文件，而是确保 database primitive 删除不影响 Yjs import 路径。

### 方案 A（推荐，最小风险）

1. 保持 `src/collaboration/core/writeConsistency.ts` 文件路径不变。
2. 在独立实施任务中先删除 database-only types、timer Map、`cancelDatabaseSync` 与 `syncToDatabase`。
3. 保留 `defineWriteSource`、Yjs types 与 `syncToYjs` 的导出名称、签名和全部实现字节级不变（除删除后的无关空行）。
4. 不修改 `Editor.tsx`、`useCollaborativeDocument.ts`、provider 或 socket。

优点：不会改变活跃 Yjs import 路径，不引入新的移动/循环依赖风险，回滚只恢复同一文件内的小块代码。

### 方案 B（未来可选，不属于本次 cleanup）

待方案 A 稳定一个发布周期后，再评估将活跃部分抽到 `yjsWriteInitialization.ts`。该工作属于 Yjs module-boundary 重构，必须另开设计与双用户回归；不能与 database primitive 删除合并。

## 5. 回归方案

### 静态门槛

- 生产源码（`src/`、`api/`、scripts 中会打包/执行的路径）对两个名称的 import/call 均为 0；
- 排除历史 docs 后，保留的唯一匹配不得是运行代码；
- TypeScript check 必须通过。

### Production rich editor

- 打开 Production 85，编辑、等待 runtime autosave、刷新确认；
- 验证 `version_action: 'none'` autosave 不新增 version/history；
- 两用户同 room 编辑、粘贴、刷新、断线重连与 graceful leave；
- 验证权限 readonly 和版本/审批按钮不变。

### Shooting rich editor

- 打开 Shooting 35，验证 `script_content` 保存、刷新恢复、room `shooting:35`；
- 两用户同步、粘贴、断线重连、graceful leave；
- 验证 workflow/Publishing 不被 autosave cleanup 影响。

### AddTopic legacy

- 打开 AddTopic，确认 `mode="legacy"` 可编辑、预览、保存与刷新；
- 此用例不是为了调用旧 database primitive，而是防止清理共享 façade/写入状态事件时意外破坏 legacy 兼容。

### 双用户协作 / Yjs 专项

- Production 与 Shooting 各两会话进入同 room；
- 初始内容仅 seed 一次，不能重复段落；
- 远端编辑、HTML 粘贴、刷新、重连后内容一致；
- 验证 `syncToYjs` 仍被 `Editor.tsx` 调用，且 `applyInitialContentOnce()` 的非空 Yjs 保护不变。

## 6. 实施批次与回滚

| 批次 | 内容 | 风险控制 | 回滚 |
| --- | --- | --- | --- |
| B1（准备） | 添加零引用 CI/静态检查、更新运行时规范为 Runtime autosave 权威 | 无行为改动 | 回退检查/文档提交 |
| B2（删除） | 仅删除 database type、timer Map、两个 export | 不移动/改名 Yjs primitive；执行完整回归 | 恢复 `writeConsistency.ts` 的小提交 |
| B3（观察） | 一个发布周期监测编辑保存、状态事件与协作错误 | 不做进一步重构 | 回退 B2 |

不应在 B2 中删除 `writeConsistency.ts` 文件、`syncToYjs`、`defineWriteSource`、RichTextEditor 或 ContentEditor legacy/fallback 分支。若回归出现协作初始化、重复 seed、presence 或保存异常，立即停止并回滚 B2；不得以修改 Socket/Yjs 协议作为修复手段。
