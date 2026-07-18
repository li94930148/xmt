# Phase B0：ContentEditor Runtime Integration Plan

> 状态：Design Only / Pre-Implementation。本文基于已落地的 Phase A contracts 与现有源码制定 Phase B 的接入方案。它不是实现授权：本阶段只新增本文，不创建 Runtime/Adapter 实现，不修改现有组件、协作、保存、页面、接口、数据库、权限或版本逻辑，也不执行提交。

## 1. 目标与非目标

Phase B 的目标是将当前已经共享的编辑器装配逻辑，渐进收敛为一个内部 `ContentEditorRuntime`，由业务 adapter 提供资源上下文和持久化回调。它不是把 Production 编辑器迁移到另一套模块，也不是变更 Tiptap/Yjs/Socket.IO 协议。

非目标：重写 `ContentEditor` 或 `Editor`；改变 `syncToDatabase` 的 2.5 秒行为；给 Shooting 增加版本/history；移动权限判断；新增数据库字段/API；创建新的 socket channel；改变 `production:<id>` 或 `shooting:<id>` room 命名；把内存 Yjs snapshot 变为长期持久化。

## 2. 当前职责与集成约束

|文件|当前实际职责|Phase B 必须保留的行为|未来 Runtime 的关系|
|-|-|-|-|
|`src/components/ContentEditor.tsx`|当前 façade；决定 rich/legacy/readonly；调用 `useSocket` 与 `useCollaborativeDocument`；汇聚状态/presence；渲染 `Editor`|legacy mode、只读、离线降级、状态标签、existing props|Phase B 保留为兼容 façade，内部才可逐步委托 runtime|
|`src/components/editor/Editor.tsx`|Tiptap 创建/销毁、通用 extensions、toolbar/menus、外部 value 同步、空 Yjs 文档首次灌入内容、typing|schema、菜单、Ctrl/Cmd+S、非空 Yjs 不覆盖、provider 生命周期|继续作为 Runtime 的 editor UI core，不复制或重写|
|`src/collaboration/yjs/useCollaborativeDocument.ts`|按 room 和当前 user/socket 创建 `SocketYjsProvider`；维护 synced/presence；cleanup provider|room 绑定、JOIN/LEAVE、awareness、synced 前 provider 不可用|Runtime 直接复用，禁止修改 hook 或 provider|
|`src/collaboration/core/writeConsistency.ts`|以 docId 保存 2.5 秒 debounce；取消 timer；保存/冲突状态事件；`syncToYjs` 首次内容写入|timer key、默认 delay、成功/失败状态、取消语义|Phase B 只能以兼容方式包裹 `syncToDatabase`，不改其逻辑|
|`src/pages/ProductionDetail.tsx`|Production 加载、`lastAutoSavedContentRef`、自动保存 API 回调、版本/审批/权限 UI|`version_action: 'none'` autosave、history/审核/权限语义|未来由 Production adapter 提供编辑上下文，业务命令仍留页面/domain|
|`src/pages/ShootingDetail.tsx`|Shooting 初始内容优先级、`script_content` 保存、制作状态流转|本地稿优先级、只写 `script_content`、不回写 Production|未来由 Shooting adapter 提供编辑上下文，workflow 留页面/domain|

## 3. 目标 Runtime 形态

未来 Runtime 的唯一入口建议为内部组件：

```text
src/editor/runtime/ContentEditorRuntime.tsx
```

它接收一个 `ContentEditorAdapter`，不接收 Production/Shooting 类型，也不 import `src/api/workflow.ts`、页面组件或权限 store。`ContentEditor` 在 Phase B 初期仍是外部兼容入口：它把既有 props 转为通用 runtime 输入，避免 Topic/Publishing 等既有调用点被同时改动。

概念组件关系如下：

```text
ProductionDetail --creates--> Production adapter --┐
                                                   ├-> ContentEditorRuntime
ShootingDetail  --creates--> Shooting adapter  ----┘      |
                                                         |-> existing useSocket()
                                                         |-> existing useCollaborativeDocument(room)
                                                         |-> existing Editor
                                                         |-> Autosave bridge -> adapter.persist()
```

adapter 注入只允许用 `ContentEditorAdapter` 的字段：`documentId`、`collaborationRoom`、`initialContent`、`readonly`、`validate?`、capabilities、`persist`、`onManualSave?`。Runtime 不得根据 `documentId`/room 前缀判断资源类型；它将二者作为 opaque string 传递给现有基础设施。

## 4. Runtime 生命周期设计

### 4.1 Mount 与 validation

1. 页面完成资源加载与已有权限/版本判定，构造稳定的 adapter 实例；资源切换必须产生新的 `documentId` 与 room。
2. Runtime 首次以 adapter 的 `initialContent` 设置本地 editor value；不得自行请求资源。
3. 若 adapter 提供 `validate()`，Runtime 在进入可编辑协作状态前调用它。`false` 或异常应阻止新的持久化并转为安全的只读/不可用展示；它不能绕过或取代服务端授权。
4. collaboration 的 enable 条件为：adapter capability 开启、非 readonly、已有 socket、验证有效。Hook 仍以 `enabled: false` 的方式处理未就绪状态，保持 React hook 调用顺序稳定。

### 4.2 协作与编辑

1. Runtime 把 `adapter.collaborationRoom` 原样传给 `useCollaborativeDocument`。
2. 该 hook 继续创建既有 `SocketYjsProvider`；Runtime 不手动 emit JOIN/LEAVE，也不监听或重命名 Socket.IO 事件。
3. Runtime 将返回的 provider/users/connected 以现有 `Editor` collaboration props 传入；`Editor` 继续负责“仅在 fragment 为空时以数据库内容初始化 Yjs”。
4. 每次 Tiptap 内容变更只更新本地 revision 和安排 autosave；Yjs update、awareness、typing、cursor 完全由既有 provider 和 Tiptap collaboration extension 保持。

### 4.3 保存与显式保存

Runtime 的 coordinator 未来实现应符合 Phase A `AutosaveCoordinator` contract，但 Phase B 首次接入必须调用现有 `syncToDatabase` 作为 bridge：

```text
editor onChange(content, revision)
  -> Runtime scheduleSave(content, revision)
  -> existing syncToDatabase({ docId, content, previousContent, persist: adapter.persist })
  -> adapter.persist(content, { reason: 'autosave', documentId, contentRevision: revision })
```

实现接入时必须在页面旧 effect 与 Runtime coordinator 之间二选一；二者同时运行会造成重复保存。替换前应证明 bridge 的 delay、`cancelDatabaseSync(docId)`、状态事件、成功后更新的“最近已保存内容”与现状完全等价。

`flush()` 只针对当前 adapter 的最新 revision；同一 revision 的 in-flight Promise 必须复用。较旧请求完成不得把最新 revision 标记为已保存。`onManualSave` 是可选的 adapter 回调，绝不能默认生成 Production major/minor 版本。

### 4.4 Destroy 流程

资源切换和组件卸载都必须执行同一有序清理：

```text
1. 禁止接收新的编辑/保存请求
2. 按页面策略 flush，或 cancel 尚未开始的 autosave
3. 解除 Runtime 自己的状态/事件订阅
4. 卸载 Editor（由 React 生命周期销毁 Tiptap）
5. 卸载 useCollaborativeDocument（其 cleanup destroy provider、awareness，发 LEAVE）
6. 清除本 Runtime 的 revision/pending promise 引用
```

`ContentEditorRuntimeHandle.destroy()` 必须幂等。它只能释放该 runtime 产生的 Tiptap、provider/awareness 和 listeners；**绝不**调用全局 `useSocket` 的 disconnect。全局认证 socket 也服务消息及其他页面，所有权仍在既有 hook。

## 5. Production 行为不变性设计

|现有行为|Phase B 保持方式|禁止变化|
|-|-|-|
|自动保存|adapter `persist` 保留当前 `updateProduction` payload 和 `version_action: 'none'`；bridge 继续使用 2500ms `syncToDatabase`|不得把普通输入或 Ctrl+S 映射为 minor/major|
|版本/history|页面与 Production domain/API 继续处理 major/minor、history snapshot、每 major 只留最新 minor|Runtime/adapter 不调用 version cleanup 或 `production_history`|
|审批与状态流转|继续由 ProductionDetail 与后端 workflow route 调用|Runtime 不知道 approved/review/rejected|
|权限|页面/adapter 工厂计算 readonly；现有后端 `canEditProduction` 与 route 校验继续是权威|Runtime 不导入角色、权限 hook 或 `requirePermission`|
|协作|room 仍为 `production:<production.id>`；复用现有 hook/provider/editor integration|不得新建 room、namespace、event 或 provider|
|历史预览|历史版本继续只读 HTML preview；只允许 current + 可编辑资格时进入 runtime|不得让 history 版本加入 current Yjs room|

Production Adapter MVP 的最低边界仅为“当前 editable Production 的 editor context + 普通内容 persist”。版本按钮、保存版本命令、审核、删除和通知继续由 Production 业务层拥有。这样可以证明 Runtime 只是装配重构，而不是把“保存”等同于“创建版本”。

## 6. Shooting 接入设计

Shooting 应在 Production 运行稳定后单独接入，绝不与 Production 同一变更批次进行。Shooting adapter 的设计输入为：

- `documentId`：当前 shooting 资源的稳定 ID。
- `collaborationRoom`：只可使用 `getCollaborationRoomId('shooting', shooting.id)`。
- `initialContent`：保留现有优先级：`script_content`，其次 approved Production `content`，再其次 `content_markdown`，最后空字符串。
- `persist`：只映射为 `updateShooting(shooting.id, { script_content: content })`。
- `readonly` / `validate`：由 Shooting 页面现有状态和资源校验策略提供；服务端 `workflow:shooting`、topic scope 仍然权威。

Shooting Runtime 接入不得调用 Production API、`production_history` 或 Production room。planned/in_progress/completed/cancelled 流程、完成后 Publishing 传递和侧栏中的 Production 历史链接均继续留在 Shooting 页面/domain 层。Phase B 不为 Shooting 创建 history、approval 或版本系统。

## 7. Phase B 迁移文件清单

以下是**未来实施时**的最小候选清单，而非本阶段文件创建要求：

|阶段|候选文件|预期变更|不得变更|
|-|-|-|-|
|B1：Runtime 内部骨架|`src/editor/runtime/ContentEditorRuntime.tsx`（新）、`src/components/ContentEditor.tsx`|以 Phase A contract 接收通用上下文；ContentEditor 保持兼容 façade|`Editor.tsx`、Yjs/provider、socket、autosave primitive|
|B2：Production MVP|`src/editor/adapters/productionEditorAdapter.ts`（新）、`src/pages/ProductionDetail.tsx`、必要的 Runtime 测试|仅替换页面 editor/autosave glue；保留业务按钮和 domain 命令|workflow API、DB、版本/history、权限|
|B3：Shooting MVP|`src/editor/adapters/shootingEditorAdapter.ts`（新）、`src/pages/ShootingDetail.tsx`、必要测试|仅替换初始内容/autosave glue|Production 路径、DB、workflow、socket/Yjs|
|B4：重复清理|`ContentEditor.tsx`、Runtime/adapters、页面重复 refs/effects|在 B2/B3 稳定后逐项清理|legacy mode、外部 API、协议|

Phase B0 当前实际新增文件只有本文。`runtime/` 与 `adapters/` 目录在获得明确 Phase B Implementation Task 前不得创建。

## 8. 接入前验收与回滚设计

### 接入前测试基线

- Production：长文编辑、2.5 秒自动保存、保存失败后再次编辑、Ctrl/Cmd+S、minor/major 命令、history 折叠、审核流转、历史只读预览。
- Collaboration：两用户同 room 同步、不同 production/shooting room 隔离、断线重连、presence/typing 消失、Yjs 非空时不被初始内容覆盖。
- Shooting：本地 `script_content` 优先级、仅本地稿写入、完成后 Publishing 传递、状态流转。
- Contract：adapter 不携带资源特定字段；runtime 不含 resource-type 分支；revision 与 stale-save 语义有单测。

### 回滚

每个接入阶段独立提交并可单独回退。B2 回滚仅恢复 `ProductionDetail` 的当前 `ContentEditor + syncToDatabase` 调用；B3 同理恢复 Shooting 的当前 `scriptContent + syncToDatabase` 调用。因为 API、数据库、Yjs room、Socket protocol 和版本规则不变，回滚不需要数据修复或迁移。

## 9. Phase B 开始条件

只有满足以下条件才可另开 Phase B Implementation Task：

1. Phase A contract 已通过 TypeScript 检查（已完成）。
2. 本文经架构评审确认，特别是 destroy 所有权和“保存不等于版本”的边界。
3. Production MVP 与 Shooting MVP 分为独立任务，不允许同批改动。
4. 每项实现均有明确的文件白名单、回归用例和可回滚提交。
5. 若实现需要改 API、数据库、Socket.IO、Yjs、权限或版本系统，立即停止，另立 ADR。
