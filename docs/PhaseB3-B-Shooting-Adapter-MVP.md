# Phase B3-B：Shooting Adapter MVP

## 1. 修改文件

| 文件 | 修改 |
| --- | --- |
| `src/editor/adapters/shootingEditorAdapter.ts` | 新增 Shooting 到通用 `ContentEditorAdapter` 的薄映射工厂。 |
| `src/pages/ShootingDetail.tsx` | 移除页面级 `syncToDatabase` debounce 与 cleanup；创建 Shooting Adapter 并传给既有 `ContentEditor`。 |

未修改 Production 相关文件、`Editor.tsx`、`ContentEditor.tsx`、Yjs、Socket.IO、provider、workflow API、Publishing、数据库、API 结构、权限或版本系统。

## 2. Adapter 职责

`createShootingEditorAdapter()` 只承载通用编辑上下文：

- `documentId` 与 `collaborationRoom`：均为 `getCollaborationRoomId('shooting', shooting.id)`，即 `shooting:<id>`；
- `initialContent`：页面已经按原优先级解析的 `scriptContent`；
- `readonly: false`：维持 Shooting 当前无前端 workflow readonly 分支的行为；
- capabilities：协作开启、无手动保存命令、沉浸式开启、`pageScroll` 保持默认关闭；
- `persist(content)`：仅调用 `updateShooting(shooting.id, { script_content: content })`。

Adapter 不读取 Production、不创建版本、不使用 `version_action`，不处理 workflow、Publishing、权限、历史或审批。

## 3. 调用链变化

```text
ShootingDetail
  -> 既有 script_content / Production fallback 初始内容解析
  -> createShootingEditorAdapter
  -> ContentEditor
  -> ContentEditorRuntime
  -> RuntimeAutosaveCoordinator
  -> adapter.persist
  -> updateShooting(id, { script_content })
```

既有状态按钮仍直接调用 `handleStatusChange`；完成制作后 Publishing 的传递仍完全由现有 workflow 后端处理。ContentEditor 的 collaboration key、editor-state key 与 Adapter room 继续是同一个 `shooting:<id>` 值。

## 4. 保存链路变化

移除以下页面级保存 glue：

- `lastAutoSavedScriptRef`；
- `syncToDatabase(...)` effect；
- `cancelDatabaseSync(...)` cleanup。

现在同一 Shooting 文档只由 Runtime `AutosaveCoordinator` 调度：2.5 秒 debounce、最新 revision 优先、重复 revision 抑制以及 Runtime destroy 时清除未发出的 pending 保存。已发出的请求仍不取消，与 Runtime 已有生命周期语义一致。

保存 payload 保持最小且不变：

```ts
updateShooting(shooting.id, { script_content: content })
```

初始内容表达式未改变：

```ts
result.script_content || result.production?.content || result.production?.content_markdown || ''
```

## 5. 测试结果

| 验证 | 结果 |
| --- | --- |
| `npm run check` | 通过（`tsc --noEmit`）。 |
| Shooting Adapter + Runtime mock | 通过：room 维持 `shooting:42`，readonly 保持 `false`，两次 revision 调度只持久化最新内容。 |
| 保存 payload mock | 通过：只生成 `{ script_content: '<p>latest</p>' }`，没有额外字段。 |
| 静态代码核对 | 通过：初始内容优先级表达式、workflow 状态按钮、Publishing 相关调用和 `shooting:<id>` room 均未改动；页面已无 `syncToDatabase` / `cancelDatabaseSync` / `lastAutoSavedScriptRef`。 |
| 本地 UI smoke | 通过：`http://127.0.0.1:4173/login` 正常渲染、无 console warning/error；密码可见性控件从 `password` 切换到 `text`。 |
| `git diff --check` | 通过，无空白错误。 |

未在本阶段执行需要认证数据的双用户协作或完成制作到 Publishing 的端到端写入；本次不使用或猜测账号凭据，也未对数据库产生写入。

## 6. 回滚方案

若 Shooting Runtime 接入出现回归，只回滚本阶段的两个文件：

1. 移除 `shootingEditorAdapter.ts` 和 `ContentEditor` 的 `adapter` prop；
2. 在 `ShootingDetail` 恢复原 `lastAutoSavedScriptRef`、`syncToDatabase` effect 与 `cancelDatabaseSync` cleanup。

该回滚不会影响 Production、Runtime Contract、Yjs、Socket.IO、workflow API、Publishing、数据库或版本系统，也不需要数据迁移。
