# Editor-to-FinishedProduction Research

> 研究日期：2026-07-15。本文仅基于现有代码作静态架构研究；未修改应用代码、数据库、接口、权限、Yjs、Socket.IO 或版本规则。
>
> 名称澄清：代码库中没有名为 `FinishedProduction` / `finished_production` 的领域实体。产品文案“成片制作”对应现有的 **shooting** 模块：`shooting` 表、`/api/workflow/shooting`、`/shooting/:id` 与 `ShootingDetail`。下文将“Finished Production”指代该模块，避免在实施时新建平行实体。

## 1. 当前架构分析

```text
ProductionDetail / ShootingDetail
  -> ContentEditor（当前已是共用入口）
    -> useSocket（认证后的全局 Socket 单例）
    -> useCollaborativeDocument(roomId)
      -> SocketYjsProvider -> Y.Doc / XmlFragment("content")
      -> Tiptap Editor + TiptapCollaboration + 通用 extensions
    -> syncToDatabase（2.5 秒 debounce）
      -> workflow REST API -> SQLite
```

前端路由为 `/production/:id`（`ProductionDetail`）和 `/shooting/:id`（`ShootingDetail`）；导航将后者标为“成片制作”。`src/collaboration/core/events.ts` 已将文档类型限定为 `production | shooting`，并用 `getCollaborationRoomId(type, id)` 生成 `production:<id>` 与 `shooting:<id>`。这两个前缀已提供隔离，迁移不应引入第三个 socket channel。

后端使用同一个已认证 Socket.IO 服务，而非 namespace：认证后 socket 加入用户房间；协作事件由 `api/app.ts` 注册到 room manager。`socket.io` 客户端采用 token、全局单例、polling、最多 5 次重连；`SocketYjsProvider` 在 `connect` 时重新 JOIN、每 15 秒 heartbeat，因此重连后会再次取回该 room 的运行时 Yjs state。

Yjs 运行链路为：Tiptap update -> `ySyncPlugin` -> 浏览器端 provider 批量 50ms 发 `collaboration:update` -> 后端内存 Y.Doc -> room 内其他客户端。awareness 300ms 合并，typing 100ms 节流。服务端以 Yjs CRDT 合并更新；只读锁会拒绝 update 并发送 conflict/lock 事件。用户进入、离开、断连由 room manager 管理。

重要存储事实：协作文档、update log、snapshot 均为 **Node 进程内存**；没有 `yjs_*` SQLite 表。活动文档每 30 秒产生内存 snapshot，单文档最多 20 个；空闲超过 5 分钟会清理。应用重启或清理后，持久化恢复源是业务表中的 HTML 内容，而不是长期保存的 Yjs snapshot。

时间是既定基础设施，不在本研究中重新设计。未来若新增保存、版本或协作事件的持久化时间，必须使用 `shared/time` 的既有契约（数据库 `YYYY-MM-DD HH:mm:ss`，API 显式 `+08:00`）。协作内存事件当前以 epoch milliseconds 表示，应保留为运行时技术时间；不得复制 `datetime('now', '+8 hours')`。

## 2. Production 编辑器实现分析

### 2.1 页面、状态和数据流

入口为 `src/pages/ProductionDetail.tsx`。加载时读取 Production、Topic 与 `production_history`，把 `production.content` 置入 `editData.content`，并把 `production:<id>` 注册为当前内容文档。当前版本且有编辑资格时渲染：

```tsx
<ContentEditor
  value={editData.content}
  onChange={...}
  mode="rich"
  collaborationKey={getCollaborationRoomId('production', production.id)}
  persistenceStatus={syncStatus}
  immersive
  pageScroll
/>
```

历史版本不进入编辑器，仅以 HTML 只读预览。页面本身拥有 Production 专属 state：topic/production/history、当前版本选择、`editMode`、状态流转、删除、侧栏和 `lastAutoSavedContentRef`。

内容变更由 `syncToDatabase` 去抖 2.5 秒后调用 `PUT /api/workflow/production/:id`，使用 `version_action: 'none'`，因此普通自动保存不会创建版本。保存失败进入冲突状态，但当前实现没有网络重试队列；下一次编辑会重新触发保存。Ctrl/Cmd+S 是 Editor 层的可选回调，但 Production 调用点没有传入 `onSave`，实际主保存机制仍是页面的自动保存。

### 2.2 通用编辑器能力

`src/components/ContentEditor.tsx` 是现有通用 façade，而非仅 Production 组件。它管理：只读/legacy/rich 模式、socket 可用性、presence、协作状态提示、编辑 telemetry、状态事件和对下层 Editor 的装配。`mode="legacy"` 才会走旧的 `RichTextEditor`（contentEditable）；Production 与 Shooting 都走 `mode="rich"`。

`src/components/editor/Editor.tsx` 承担 Tiptap 生命周期：初始化、外部 value 同步、只读切换、字数、全屏、目录、右键菜单、BubbleMenu、评论 UI、Ctrl/Cmd+S 与 typing 标记。它把数据库 HTML/Markdown 转为 editor 内容；有 provider 时，初始数据库内容以 JSON 仅在 Yjs fragment 为空时写入，避免覆盖已同步的远端状态。

`createEditorExtensions()` 是可复用 schema 工厂，包含 StarterKit（H1-H6）、首行缩进 Paragraph、表格、图片、任务列表、链接、Placeholder、Underline、可多色 Highlight、Typography、对齐、TextStyle、Color、CommentExtension。Toolbar/BubbleMenu/ContextMenu 提供格式化、标题、颜色、链接、图片、表格、任务、撤销重做、打印、HTML/Markdown/JSON 导出、注释与全屏；其中 toolbar 的“下载/打印”等是纯 UI 能力，可直接复用。

`TiptapCollaboration` 注入 y-prosemirror 的 `ySyncPlugin`、`yCursorPlugin`、`yUndoPlugin`。这是可复用协作内核；其输入仅为 fragment、awareness 和用户 presence，不包含 Production 业务字段。

### 2.3 Production 专属能力

- `production`、`production_history`、审核状态与从 approved 流转为 shooting。
- 版本规则：更新前将旧当前值写入 history；`minor` 在当前 major 内递增，`major` 递增 major 且 minor 归零。`cleanupProductionHistoryToLatestMinor` 会每个 major 只保留最新 minor；`GET history` 同样只返回每个 major 的最新项。故示例 `v4.0/v4.1/v4.3` 只显示/保留 v4.3；major 后为 v5.0。
- Production 页面自己的版本选择、history 预览、提交审核/审核通过、删除，以及角色/拥有者/选题归属的 UI 判定。
- Production 数据库三份内容表示：`content`、`content_markdown`、`content_json`；写入接口会分别接收/回退填充。当前富文本自动保存只传 `content`，接口将另外两者回退为该值。

因此，Tiptap/Yjs/toolbar/状态显示/去抖机制可复用；Production 的版本与工作流绝不能作为“编辑器通用能力”直接复制给 Finished Production。

## 3. Finished Production 现状分析

### 3.1 页面、模型与接口

- 入口：`src/pages/Shooting.tsx` 列表，`src/pages/ShootingDetail.tsx` 详情；`src/App.tsx` 路由 `/shooting`、`/shooting/:id`；`src/config/navigation.ts` 的 `workflow:shooting` 导航项。
- 类型：`shared/types/index.ts` 的 `Shooting`，字段为 `id`、`topic_id`、`plan_date`、`location`、`equipment`、`status`、`operator_id`、`script_content`、创建/更新时间及关联 approved production 摘要。
- 表：`shooting` 原生字段加运行时迁移补充的 `script_content TEXT`。没有 shooting 的 JSON/Markdown 内容列，也没有 shooting history 表。
- API：`GET /api/workflow/shooting`、`POST /api/workflow/shooting`、`GET /api/workflow/shooting/:id`、`PUT /api/workflow/shooting/:id`、`DELETE /api/workflow/shooting/:id`。GET detail 额外返回同 topic 最新 approved Production 摘要；PUT 可写 `topic_id/plan_date/location/equipment/status/script_content`。

它不是“无编辑”或 textarea：`ShootingDetail` 已使用与 Production 同样的 `ContentEditor mode="rich"`，room 为 `shooting:<id>`，并将 `scriptContent` 用 `syncToDatabase` 自动保存到 `shooting.script_content`。首次内容优先级是 `script_content`，否则 approved Production 的 `content`，再否则 `content_markdown`。这保证成片阶段本地编辑不会回写 Production。

Shooting 当前没有成片专属版本历史；侧栏展示的是只读的关联 Production 版本，并跳转到 Production 查看历史。完成制作会把 `script_content` 复制到 Publishing 的 `script_content`（仅在本地有内容时），然后流转 topic 状态。

### 3.2 权限和保存边界

服务端 `PUT/POST/DELETE shooting` 要求 `workflow:shooting`，且在目标 topic 上继续走 `canEditProduction` 范围判定；GET 也按 topic 可见性收敛。Production 使用自己的 `canEditProduction` 与删除权限。两者不能因为共用 runtime 而合并或放宽。

Shooting 当前页面未把服务端权限结果映射为 `readOnly`，主要依赖服务端拒绝写入；这不是本轮应改的问题，但接入计划必须保持现状直到权限专项确认。不要把 Production 的 `CONTENT_EDIT_ROLES` 或 delete 权限复制到 Shooting。

## 4. 能力差异矩阵

|能力|Production|Finished Production（shooting）|迁移需求|
|-|-|-|-|
|Tiptap|已通过 `ContentEditor`/`Editor` 使用完整 schema 和 toolbar|已使用同一入口、同一 schema|无需复制；保持共享|
|Yjs|`production:<id>` 独立文档|`shooting:<id>` 独立文档|无需新 channel；严禁复用 production ID|
|Socket.IO|全局认证 socket，同一协作事件协议|完全相同|复用现有 socket，不增加 namespace/channel|
|自动保存|2.5s -> `production.content`，普通保存不建版本|2.5s -> `shooting.script_content`|可抽象调度器，持久化回调保留业务 adapter|
|版本历史|production_history、major/minor、每 major 保留最新 minor|无本地 history，仅引用 Production 版本|不得复用 Production history；是否新增须独立产品决策|
|权限控制|Production 范围/角色/删除权限|`workflow:shooting` + topic 范围|运行时不拥有权限；adapter/路由继续负责|
|时间系统|页面展示走 `formatBeijingTime`；数据库写入受现有时间层约束|同上|新增持久化时间仅调用 `shared/time`|
|数据库存储|HTML + markdown + JSON + history|单一 `script_content`，无历史/JSON|不能假设字段同构；先定义内容契约|

## 5. ContentEditor Runtime 可行性分析

结论：**应做有限抽象，但不应现在重写或复制编辑器。** 现有 `ContentEditor` 已实质上是 runtime façade，且两个目标页面已经消费它。合理目标是把其隐式契约正式化为“小而稳定的 runtime + 业务 adapter”，不是抽出一个同时知道 Production 版本、Shooting 流程和权限的超级组件。

建议的目标边界：

|层|责任|不得承担|
|-|-|-|
|ContentEditorRuntime（可由当前 ContentEditor 演进）|Tiptap 初始化、extensions、Yjs provider 绑定、presence、状态事件、typing、通用 UI、初始内容只写一次|资源 API、权限判定、状态流转、版本号|
|Autosave coordinator|按 docId 去抖、保存状态、取消、失败回调|决定写哪张表或是否创建版本|
|ProductionEditorAdapter|装载 Production、保存 `content/content_markdown/content_json`、版本动作、历史、只读规则|更改 runtime/Yjs 协议|
|FinishedProductionEditorAdapter|装载 Shooting、保存 `script_content`、本地稿优先级、成片状态流转边界|使用 production_history 或 production room|

推荐先把 adapter 定义为 TypeScript 接口/测试设计，而非立即大规模迁移：`docId`、`initialContent`、`readOnly`、`persist(content)`、`onManualSave?`、`persistenceStatus`。其中 `docId` 必须由 `getCollaborationRoomId('production'|'shooting', id)` 构造，不能由页面拼接任意字符串。保留页面持有的权限与 workflow action，避免 runtime 成为越权入口。

需要注意的现有技术债务：Editor 的新增 comment 属性当前以 `new Date().toISOString()` 生成时间；它不写数据库且不应在本轮修改，但后续若该时间进入 API/持久化，必须改接 `shared/time`。同时内容系统目前 HTML 为事实存储形式，JSON/Markdown 只在 Production 存在；runtime 不应自行选择或转换持久化格式。

## 6. 迁移风险

1. **直接复制代码**：会复制 socket 生命周期、Yjs 初始化和 autosave timer，造成双连接、双写或互相覆盖。缓解：以现有 `ContentEditor` 为唯一 façade。
2. **过度抽象**：把版本、权限、流转塞入 runtime，会使一个小需求改动 Production 稳定路径。缓解：runtime 只处理编辑协议，业务 adapter 保持薄且资源专属。
3. **Production 稳定性**：改动共享 extensions、initial-content 或 `syncToDatabase` 会同时影响 Production、Shooting、Topic、Publishing。缓解：先为现有调用建立契约测试，Production 先不改调用点。
4. **Yjs 文档 ID 冲突**：若成片使用 `production:<id>`，会把两个业务阶段写入同一 Y.Doc。缓解：固定 `shooting:<shooting.id>`；不以 `topic_id` 作为 room ID。
5. **版本历史污染**：把 Shooting autosave 接到 Production 的 `PUT` 或 history 会制造 minor 版本、污染审核稿。缓解：Finished adapter 只能写 `shooting.script_content`；版本需求另立模型。
6. **权限绕过**：共享组件若接受未经验证的 editable 标志，会与路由权限脱节。缓解：保持服务端 `workflow:shooting` / topic scope 为权威，不因 runtime 改动而迁移权限判断。
7. **时间字段混乱**：新增保存、history 或协作持久化时采用本地时区、ISO UTC 或 SQL `now` 会破坏 Phase 2 契约。缓解：持久化/响应仅引用 `shared/time`；未知历史值不迁移。
8. **内存协作误解**：当前 snapshot/Yjs 状态不跨重启保存。缓解：不得把它宣传为长期版本历史；若未来需要持久 CRDT，单独设计数据恢复与备份方案。

## 7. 推荐方案

推荐“**先确认现有共享，再最小化提纯**”的方案：

1. 以现有 `ContentEditor -> Editor -> useCollaborativeDocument` 为唯一编辑器内核，不复制 Production 代码，也不新增 socket channel。
2. 将 Production 与 Shooting 的已有页面逻辑视为两个 adapter 原型：二者只提供资源 ID、文档 ID、初始内容、持久化函数、状态与只读策略。
3. 先定义 content persistence contract：Production 的三种表示与 Shooting 单一 HTML `script_content` 如何兼容。未作产品决策前，Shooting 不新增 `production_history`，不把本地稿回写 Production。
4. 仅在 runtime 契约和回归测试稳定后，才把两页重复的“加载/初始内容/lastSaved/autosave”小范围下沉；保留工作流按钮、权限、版本 UI 在页面层。

由于 Shooting 已经使用完整 editor，Phase 3 的目标不是“把编辑器装进去”，而是消除实现重复、固定 adapter 边界、补齐必要的契约测试。任何“统一内容编辑平台”都必须在这两个资源的隔离与数据契约验证后才开始。

## 8. 分阶段实施计划

|阶段|修改范围与文件|主要风险|回滚方式|
|-|-|-|-|
|Phase 1：纯研究（当前）|仅本文；核验 `ProductionDetail`、`ShootingDetail`、协作和 API|结论与实际部署不一致|无代码变更，删除报告即可|
|Phase 2：抽取 runtime|预期 `src/components/ContentEditor.tsx`、`src/components/editor/*`、`src/collaboration/*`，新增 runtime/adapter contract 测试；不改变 API/DB/权限|共享组件回归、Yjs 初始内容覆盖|保留现有 ContentEditor façade；feature flag 或逐页回退旧调用|
|Phase 3：Finished Production 接入|预期 `src/pages/ShootingDetail.tsx`、`src/api/workflow.ts` 的调用适配、`shared/types`（仅在类型契约需要时）|误写 Production、room 冲突、状态流转回归|按页面回退为当前 `scriptContent + syncToDatabase`；数据仍在 `shooting.script_content`|
|Phase 4：统一内容编辑平台|在已验证 adapter 上扩展 Topic/Publishing 等；单独评审长期 snapshot/版本产品需求|抽象扩大、权限和存储语义混淆|资源逐个 opt-in；不得一次替换所有调用|

每阶段开始前均需跑：Production 与 Shooting 的富文本编辑、断线/重连、双用户协作、2.5 秒保存失败与恢复、跨阶段内容不回写、版本显示，以及现有 `npm run test:time`。Phase 2/3 不创建 migration，不调整 `production_history` 规则，不修改 Yjs/Socket 服务端协议。

## 9. 涉及文件清单

|文件|当前作用|迁移建议|
|-|-|-|
|`src/pages/ProductionDetail.tsx`|Production 加载、权限 UI、版本、autosave、编辑器调用|作为基准回归面；后续只替换为 Production adapter，不改版本规则|
|`src/pages/ShootingDetail.tsx`|Finished Production 页面、`script_content` autosave、状态流转|作为接入面；保持 `shooting:<id>` 和本地稿优先级|
|`src/components/ContentEditor.tsx`|当前共享 editor façade|优先演进为 runtime 外观，保持兼容 props|
|`src/components/editor/Editor.tsx`|Tiptap 生命周期、菜单、评论、协作接入|只抽通用能力；清理/重构前需 editor regression tests|
|`src/components/editor/extensions/editorExtensions.ts`|共享 Tiptap schema/extensions|作为单一 schema 源，避免资源各自维护 extensions|
|`src/components/RichTextEditor.tsx`|legacy contentEditable 模式|不作为 Finished Production 新实现基础|
|`src/collaboration/yjs/useCollaborativeDocument.ts`|provider 生命周期/presence|复用；不改协议或 room 生成规则|
|`src/collaboration/yjs/SocketYjsProvider.ts`|Yjs/socket 批量、重连、awareness|复用；不复制 provider|
|`src/collaboration/core/writeConsistency.ts`|共享 debounce/persistence 状态|可抽 autosave contract，保留资源 persist 回调|
|`src/collaboration/core/events.ts`|文档类型及 room ID|保持 production/shooting 双前缀；无需新 channel|
|`src/hooks/useSocket.ts`|认证 socket 单例和重连|复用；不得为 Finished Production 新建 socket|
|`api/routes/workflow.ts`|Production 版本、Shooting CRUD/权限/流转|Phase 2 不改；Phase 3 仅在经批准的 adapter/API 契约需要时小改|
|`api/database/db.ts`|production/history/shooting 定义及旧迁移|本研究不改；Shooting history/JSON 属于未来独立数据设计|
|`shared/types/index.ts`|Production/History/Shooting 共享模型|以当前 `script_content` 契约为基线；不虚构 FinishedProduction 类型|
|`shared/time/index.ts`、`src/lib/utils.ts`、`api/database/utils.ts`|既定北京时间基础设施|只引用，不重新设计，不复制 SQL 时间表达式|

## 10. 结论

“将 Production 编辑器迁移到 Finished Production”在编辑器内核层面已部分完成：两页已共用 `ContentEditor`、Tiptap schema、Yjs provider、Socket.IO 连接和 autosave coordinator。缺失的不是第二份编辑器，而是明确的 adapter 边界与成片阶段的版本产品决策。

因此不建议复制 ProductionDetail 或把 `production_history` 直接套给 Shooting。建议以当前共享组件为基础，先验证并提纯 ContentEditor Runtime，再以 `shooting:<id>` / `shooting.script_content` 的隔离契约接入 Finished Production。Production 版本、Shooting 权限和工作流、现有北京时间层均应保持各自权威边界。
