# ContentEditor Runtime Stabilization Audit

> 审计状态：Read-only。审计范围为当前工作区的 ContentEditor、Runtime、Adapter、autosave 与协作边界。本文件不授权任何实现改动。

## 1 当前 Runtime 架构图

```text
                         ContentEditorAdapter contract
                  (opaque ids, readonly, capabilities, persist)
                                      |
          +---------------------------+---------------------------+
          |                                                       |
 ProductionDetail                                      ShootingDetail
 createProductionEditorAdapter                         createShootingEditorAdapter
          |                                                       |
          +---------------------------+---------------------------+
                                      |
                                ContentEditor
                         /                         \
          existing collaboration facade              ContentEditorRuntime
          useSocket + useCollaborativeDocument       RuntimeAutosaveCoordinator
          collaborationKey / stateDocId                      |
                    |                                  adapter.persist
                    v                                      |
              existing Editor                    Production: updateProduction
              Tiptap + Yjs                       Shooting: updateShooting
                    |
        existing SocketYjsProvider / awareness / Socket.IO events
```

当前 Runtime 已集中持有通用的 adapter ref、保存 revision、pending autosave、状态和 destroy handle。它不导入 Production/Shooting 页面、API、权限、版本、workflow 或 Publishing 类型。

`ContentEditor` 仍是兼容 facade：它负责现有 props、socket、`useCollaborativeDocument`、presence 显示和 `Editor` props。对于已接入 Adapter 的 Production/Shooting，它会在 editor 内容变化时向 Runtime handle 提交 revision。对于未提供 Adapter 的调用点，它仍构造 fallback Runtime context，但不会 schedule 持久化；原页面自己的显式保存行为继续生效。

### 审计观察：room 双来源

Runtime context 中保存 `adapter.collaborationRoom`，但当前协作 hook、editor state 与 `Editor.stateDocId` 仍使用 `ContentEditor.collaborationKey`。Production 和 Shooting 都把两者构造成相同的 `production:<id>` / `shooting:<id>`，所以当前行为一致；但该重复是未来新增 Adapter 时需要保持的契约约束，而不是 Runtime 已完全接管协作 room 的证据。

## 2 Production 接入状态

| 项目 | 状态 | 审计结论 |
| --- | --- | --- |
| Adapter | 已迁移 | `createProductionEditorAdapter()` 仅映射通用 Contract。 |
| document / room | 已迁移 | 两者均由 `getCollaborationRoomId('production', production.id)` 得出。 |
| 初始内容 | 已迁移 | 使用页面的 `editData.content`；资源加载、历史预览仍在页面。 |
| readonly | 已迁移 | 页面仍计算 `!canEditProduction || selectedVersionId !== 'current'`，Adapter 只接收结果。 |
| autosave | 已迁移 | Runtime coordinator 调用现有 `updateProduction`，payload 保持 `version_action: 'none'`。 |
| minor / major | 未迁移（正确） | 保留在 `handleVersionedSave`，不进入 Adapter/Runtime。 |
| history / approval / permission | 未迁移（正确） | 仍由 Production 页面及既有 domain/API 处理。 |
| 旧页面 debounce | 已清除 | `ProductionDetail` 不再引用 `syncToDatabase`、`cancelDatabaseSync` 或页面 `lastAutoSavedContentRef`。 |

结论：Production 的“普通内容保存”已接入 Runtime；版本命令、审批、权限、历史和协作协议保持在原业务边界，符合计划。

## 3 Shooting 接入状态

| 项目 | 状态 | 审计结论 |
| --- | --- | --- |
| Adapter | 已迁移 | `createShootingEditorAdapter()` 是通用 Contract 薄映射。 |
| document / room | 已迁移 | 两者均为 `getCollaborationRoomId('shooting', shooting.id)`。 |
| 初始内容 | 已保留 | 页面仍按 `script_content → production.content → production.content_markdown → ''` 解析。 |
| readonly | 已保留 | 当前页面无 workflow/角色前端只读条件，Adapter 显式传入 `false`，不改变既有行为。 |
| autosave | 已迁移 | Runtime coordinator 通过 Adapter 调用 `updateShooting(id, { script_content })`。 |
| workflow / Publishing | 未迁移（正确） | 状态按钮仍调用原 `handleStatusChange`；完成后的 Publishing 传递仍在既有 workflow 后端。 |
| Production history / approval / version | 未迁移（正确） | 仅展示关联 Production 信息；未引入 `production_history` 或 `version_action`。 |
| 旧页面 debounce | 已清除 | `ShootingDetail` 不再引用 `syncToDatabase`、`cancelDatabaseSync` 或 `lastAutoSavedScriptRef`。 |

结论：Shooting 已完成“本地 script_content 自动保存”的 Runtime 接入，且没有把 Production、Publishing 或 workflow 业务泄漏到 Adapter。

## 4 Autosave 链路状态

### 已迁移链路

```text
Editor onChange
  -> ContentEditor.handleEditorChange
  -> Runtime handle.scheduleSave(content, local revision)
  -> RuntimeAutosaveCoordinator (2500ms debounce)
  -> adapter.persist(content, { reason, documentId, contentRevision })
  -> Production updateProduction / Shooting updateShooting
  -> generic status callback -> existing editor-state event bus
```

`RuntimeAutosaveCoordinator` 的当前语义：

- 以 `documentId` 创建实例，默认 2500ms debounce；
- 新 revision 覆盖等待中的旧 revision；
- 同 revision 的 pending/in-flight 请求不会重复发出；
- 保存按顺序执行；旧 revision 的完成不会把最新 revision 状态标记为 synced/conflicted；
- `destroy()` 清除等待中的 timer/pending，不中止已经发出的请求；
- Runtime unmount cleanup 调用其 destroy。

Production 与 Shooting 的页面级 database debounce 已移除，因此各自仅有一个 autosave 调度来源。

### 仍存在的 `writeConsistency` 代码

全仓扫描中，`syncToDatabase` 和 `cancelDatabaseSync` 只在 `src/collaboration/core/writeConsistency.ts` 中定义及互相调用，当前没有页面调用者。它们是待评估的旧 database-autosave primitive，不是 Production/Shooting 的活跃保存链路。

`writeConsistency.ts` 仍有活跃职责：`Editor.tsx` 使用其中的 `syncToYjs` 做既有初始内容写入保护。因此不得因为 `syncToDatabase` 无调用者而在未单独评审的任务中删除或重构整个文件。

## 5 遗留旧代码分析

| 区域 | 当前状态 | 是否为本阶段遗留风险 |
| --- | --- | --- |
| `syncToDatabase` / `cancelDatabaseSync` | 保留定义，无实际页面调用。 | 是：候选清理项，但需独立任务确认没有动态/未来调用者。 |
| `lastAutoSavedScriptRef` | 全仓无匹配。 | 否：Shooting 页面级 ref 已迁移完成。 |
| Production 页面级 last-saved ref | 已移除。 | 否：由 Runtime revision/coordinator 取代。 |
| `ContentEditor` fallback Runtime adapter | TopicDetail、AddTopic、PublishingDetail 等未接入页面仍使用它。其 persist 是 no-op，且不会被 schedule。 | 否：兼容层；但注释“通过 writeConsistency 持久化”对手动保存页并不精确，后续仅可在文案/结构清理任务中处理。 |
| TopicDetail | rich Editor、无协作、显式 `handleSave` 调用 `updateTopic`。 | 非 autosave 旧逻辑；未纳入本阶段。 |
| AddTopic | legacy Editor，表单提交/草稿时 `createTopic`。 | 非 Runtime autosave 范围。 |
| PublishingDetail | rich Editor，显式保存 `updatePublishing`。 | 非 Runtime autosave 范围；未来若接入必须先单独设计，不能复用 Shooting workflow。 |
| `syncToYjs` | Editor 的协作初始化辅助。 | 活跃且受保护；不是旧 database debounce。 |

## 6 Yjs/Socket.IO 边界分析

Runtime 与 Adapter 未改动以下既有协作链路：

```text
ContentEditor
  -> useSocket
  -> useCollaborativeDocument({ enabled, roomId, socket, user })
  -> SocketYjsProvider
  -> existing JOIN / LEAVE / SYNC / UPDATE / AWARENESS / TYPING events
  -> Tiptap collaboration extension in Editor
```

关键边界：

- Runtime 只协调数据库内容保存，不创建、销毁或重连 socket；
- `useCollaborativeDocument` 仍按既有 `enabled + roomId + socket + user` 生命周期创建 provider，并在 cleanup 中 `nextProvider.destroy()`；
- `SocketYjsProvider.destroy()` 仍自行发送 LEAVE、清理 listeners、awareness、Y.Doc 和 timer；
- `Editor` 仍通过 `syncToYjs` / `applyInitialContentOnce` 保持“Yjs fragment 非空时不覆盖”规则；
- Adapter 没有 Socket.IO event、Yjs update、awareness 或 provider 字段；
- Production/Shooting 的 room 字符串未改变，且没有新增 namespace 或协议 payload。

审计结论：当前 Runtime 接入不拥有协作协议，因此不会直接改变两用户同步语义；真实协作回归仍必须通过双用户环境验证，不能由 adapter/unit mock 替代。

## 7 双用户协同测试计划

### 前置条件

1. 使用两个独立、已授权的测试账号和一个可回滚的 Production、一个可回滚的 Shooting 记录；
2. 两个浏览器独立 session，禁止共用 local storage 或 socket；
3. 记录基线 room：`production:<id>` 与 `shooting:<id>`；
4. 允许读取网络请求、浏览器 console、当前 editor-state/presence UI；不改变 Socket.IO 或数据库结构。

### 每个文档类型均须执行的用例

| 用例 | 操作 | 通过条件 |
| --- | --- | --- |
| Room 隔离 | A 在 Production，B 在 Shooting；随后两人进入同一目标文档。 | 不同 room 不互见；同 room 只出现目标成员。 |
| 首次同步 | A、B 同时打开同一记录。 | 不重复 provider/user，不出现初始数据库内容覆盖已有 Yjs fragment。 |
| 双向编辑 | A 连续输入，B 随后编辑不同位置。 | 两端内容最终一致，光标/presence 合理更新，无 console error。 |
| Debounce | A 在小于 2.5 秒内连续三次修改。 | 每一轮只发出最新内容的一次数据库 PUT，状态从 saving 到 synced。 |
| 旧 revision | 延迟 A 的较早保存响应，再产生最新输入。 | 旧响应不把最新 revision 错标为 synced/conflicted，最终数据库为最新内容。 |
| 保存失败恢复 | 令一次保存返回失败后再次编辑。 | 显示 conflicted；下一 revision 可继续保存并恢复 synced。 |
| 重连 | A 断网/重连或刷新，B 继续编辑。 | A 重连后状态一致，presence 不残留，socket 不出现重复 listener/用户。 |
| 卸载 | A 离开详情页或切换记录。 | pending timer 被清理，不向旧 document 发送后续保存；B 的会话保持正常。 |

### 业务专属补充

- Production：autosave PUT 始终 `version_action: 'none'`；minor/major 按钮仍只走原版本命令；历史预览不加入 current room。
- Shooting：初始优先级不变；完成制作前后验证 Publishing 获得的 script_content 与既有基线一致。若“最后一次输入后立即完成制作”存在 flush 顺序需求，应作为 workflow 集成决策单独处理，不能由 Adapter 暗中处理。

## 8 后续 Phase 建议

1. **Phase C1：受控双用户稳定化验证（推荐，下一个）**。仅执行上一节的真实协作、失败恢复、重连和卸载验收，输出结果，不改变代码；以此作为 Runtime 进一步清理的门槛。
2. **Phase C2：旧 database-autosave primitive 决策**。在确认全仓无调用者、无动态引用且 C1 通过后，单独评审 `syncToDatabase` / `cancelDatabaseSync` 是否保留、弃用或移除。该任务不得连带修改 `syncToYjs`。
3. **Phase C3：未接入编辑器逐个设计**。Topic 与 Publishing 如需 Runtime Adapter，必须分别建立设计任务，先保留其显式保存和各自领域语义；不得将“已有 fallback wrapper”误认为已迁移。
4. **Phase C4：Contract 对齐评审（可选）**。评估是否让 `adapter.collaborationRoom` 成为协作 hook 的唯一来源。该项会触及 ContentEditor 协作接线，必须另开兼容性任务并先通过 C1，不属于本审计。

当前建议是不再进行自动化结构清理，先完成 C1 的真实双用户证据采集。
