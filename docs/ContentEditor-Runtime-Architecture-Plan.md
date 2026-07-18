# ContentEditor Runtime Architecture Plan

> 决策性质：Architecture Decision / Design Document。本文只定义边界和渐进迁移路线，不改变现有实现。它以 [Editor-to-FinishedProduction-Research.md](Editor-to-FinishedProduction-Research.md) 的事实盘点为前提。

## 0. 文档状态与执行边界

**状态：Draft / Architecture Proposal。** 本文件仅作为后续开发任务的设计依据，不授权任何实现操作。

本阶段允许：阅读现有代码、输出架构分析、创建/维护设计文档。

本阶段禁止：修改业务代码或数据库；创建 migration；修改 Socket.IO 协议、Yjs provider、权限逻辑或版本逻辑；执行测试/构建/部署；创建 runtime、adapter 或 contracts 的实现文件。任何实现工作必须另开一个明确的 Implementation Task，并限定到本文件中的单一阶段。

特别地，本文出现的未来目录和文件名只是规划，不是创建指令。XMT 已进入生产阶段；不得因为“未来创建 `src/editor/runtime`”而顺手创建目录、移动文件或重构稳定链路。

## 1. 背景与目标

XMT 的 `ProductionDetail` 与“成片制作”（代码实体为 `shooting` / `ShootingDetail`）已经共同使用 `ContentEditor`、Tiptap、Yjs、认证后的 Socket.IO 单例和 `syncToDatabase`。因此目标不是迁移或重写第二套编辑器，而是把既有共用能力的边界正式收敛为：

```text
ContentEditor Runtime  <---- contract ----  Business Adapter
                                         ├─ Production adapter
                                         └─ Shooting adapter
```

最终希望未来的 Topic、Publishing、AI 生成内容、素材描述等资源只新增 adapter，而不是复制 `ContentEditor`、Yjs provider 或保存定时器。

本设计的硬约束：不改数据库结构；不改 Yjs 或 Socket.IO 协议；不改 Production 的版本规则、权限模型或线上流程；不引入新的时间体系；不让 runtime 以资源名称分支。

## 2. 当前架构分析

|文件|当前职责|应该归属|是否修改|
|-|-|-|-|
|`src/components/ContentEditor.tsx`|rich/legacy/readonly 分流；装配 socket、Yjs hook、presence、状态提示、telemetry，并渲染 Editor|Runtime façade|是，后续只做内部委托；保留兼容 props|
|`src/components/editor/Editor.tsx`|Tiptap 生命周期、schema 装配、菜单、comments、快捷键、Yjs extension 接入、外部内容同步|Runtime UI / editor core|是，后续仅接收通用 runtime 状态与命令|
|`src/collaboration/yjs/useCollaborativeDocument.ts`|按 room 创建 provider、presence、同步完成状态、释放资源|Runtime collaboration port|否，第一轮原样复用|
|`src/collaboration/core/writeConsistency.ts`|以 docId 为键的 2.5 秒保存去抖、取消、状态事件、失败回调|Autosave runtime primitive|是，先以兼容 façade 包装，后续再提纯|
|`src/pages/ProductionDetail.tsx`|加载 Production/Topic/history；版本选择；审核；权限 UI；调用 Production API；页面 autosave 回调|Production 业务层 + Production adapter|是，Phase B 仅替换编辑器接入胶水|
|`src/pages/ShootingDetail.tsx`|加载 Shooting；初始内容优先级；状态流转；调用 Shooting API；页面 autosave 回调|Shooting 业务层 + Shooting adapter|是，Phase C 仅替换编辑器接入胶水|

必须保持不动的事实：`getCollaborationRoomId('production', id)` 与 `getCollaborationRoomId('shooting', id)` 已隔离 Yjs 文档；`SocketYjsProvider` 的 join/reconnect/awareness/update 语义与服务端 room manager 已稳定；`syncToDatabase` 是当前落库的唯一去抖入口。运行时重构不得修改其协议、事件名或 room ID 规则。

## 3. Runtime 与业务边界

### Runtime 负责

- 初始化/销毁 Tiptap editor、通用 extensions、toolbar、BubbleMenu、ContextMenu、只读呈现和通用 UI 状态。
- 根据 adapter 给出的 opaque room 字符串装配既有 `useCollaborativeDocument`；处理 provider、presence、typing、同步状态和现有事件总线。
- 管理最新内容、单文档 autosave 去抖、flush/cancel、保存状态与失败通知。
- 在不包含业务语义的前提下调用 adapter 的 `persist` 和可选 `onManualSave`。

### Adapter 负责

- 将某个业务资源翻译为 runtime contract：资源 ID、room、初始内容、只读状态、持久化函数和能力开关。
- 将 runtime 的内容保存映射到资源 API：Production 写内容，Shooting 写 `script_content`。
- 向页面暴露业务状态，但不把页面组件传给 runtime。

### 必须留在业务层 / domain service

- Production 的 `major`/`minor` 版本计算、history 清理、审核及从 approved 流转 shooting。
- Shooting 的状态流转、向 Publishing 传递本地剧本、计划/设备/地点字段。
- `requirePermission`、资源归属与 topic scope 判定，以及所有后端授权。
- 数据加载、路由、页面侧栏、版本列表、通知、删除等业务交互。

Runtime 不得包含 `if (documentType === 'production')`、`shooting`、`publishing` 或具体 API import。它只消费 adapter 实例和通用 capability；document type 可用于 adapter 自己或 telemetry 标签，不能成为 runtime 分支条件。

## 4. ContentEditorAdapter Contract

建议先在 `src/editor/contracts/` 定义以下纯 TypeScript 契约；它描述现有行为，不要求立即替换组件。

```ts
export type ContentEditorPersistReason = 'autosave' | 'manual';

export type ContentEditorSaveStatus =
  | 'idle'
  | 'saving'
  | 'synced'
  | 'conflicted';

export interface ContentEditorSaveContext {
  reason: ContentEditorPersistReason;
  documentId: string;
  /** 单调递增的本地内容 revision；用于避免旧保存结果覆盖较新内容。 */
  contentRevision: number;
}

export interface ContentEditorCapabilities {
  collaboration: boolean;
  manualSave: boolean;
  immersive: boolean;
  pageScroll: boolean;
}

export interface ContentEditorAdapter {
  /** Opaque stable resource identity; runtime 不解释其领域含义。 */
  documentId: string;
  /** 已由 adapter 构造的协作 room；runtime 只原样传给协作层。 */
  collaborationRoom: string;
  /** 已完成业务加载、可直接进入编辑器的内容。 */
  initialContent: string;
  /** 业务层计算出的展示/编辑策略。 */
  readonly: boolean;
  /**
   * 进入编辑器、恢复前台或显式 flush 前的业务有效性检查。
   * 它不是 Runtime 的权限实现；adapter 背后的业务层决定资源、锁和授权是否仍有效。
   */
  validate?(): Promise<boolean>;
  /** 资源允许的通用编辑器能力，不能承载领域工作流。 */
  capabilities: ContentEditorCapabilities;
  /** 唯一的自动保存落点；必须返回成功/失败 Promise。 */
  persist(content: string, context: ContentEditorSaveContext): Promise<void>;
  /** 可选的显式保存语义；未提供时 Ctrl/Cmd+S 不改变现有 autosave 行为。 */
  onManualSave?(content: string, context: ContentEditorSaveContext): Promise<void>;
}

export interface ContentEditorRuntimeHandle {
  scheduleSave(content: string, revision: number): void;
  flush(): Promise<void>;
  cancel(): void;
  getStatus(): ContentEditorSaveStatus;
  /**
   * 有序释放 editor、awareness、provider 和所有 runtime listeners。
   * 该方法不关闭全局认证 Socket；全局 Socket 仍由 useSocket 生命周期拥有。
   */
  destroy(): Promise<void>;
}
```

字段说明：

|字段|提供者|Runtime 使用方式|边界|
|-|-|-|-|
|`documentId`|adapter|autosave 去重、状态/telemetry key|不可推断表名或权限|
|`collaborationRoom`|adapter|原样传给现有 Yjs hook|不可拼接/重写/转换|
|`initialContent`|adapter|仅用于 editor 初始内容和既有“Yjs 空文档才写入”逻辑|不可自行读取 API|
|`readonly`|adapter|决定 editor 是否 editable|不构成服务端授权|
|`validate`|adapter|进入、恢复或显式 flush 前确认当前上下文有效|runtime 不读取角色或资源字段|
|`capabilities`|adapter|控制通用 UI 行为|不得替代业务状态机|
|`persist`|adapter|由 autosave coordinator 调用|runtime 不知道 API、表或版本|
|`onManualSave`|adapter|仅在用户显式保存时调用|领域版本/审批含义由 adapter/页面决定|

调用关系：

```text
Business page / domain state
  -> createXxxEditorAdapter(resource, permissions, api)
  -> ContentEditorRuntime(adapter)
       -> adapter.validate?()
       -> useCollaborativeDocument(adapter.collaborationRoom)
       -> Tiptap Editor
       -> AutosaveCoordinator.persist(adapter.persist)
  <- status / handle (仅通用保存状态与 flush/cancel)

Runtime --calls--> adapter.persist / adapter.onManualSave
Adapter --controls--> initialContent, readonly, capabilities, room, persistence mapping
Runtime --never calls--> 页面、路由、具体 resource API、版本/审批/权限 service

Lifecycle（设计目标；不表示本阶段修改既有实现）：

```text
mount -> create runtime -> validate? -> connect existing collaboration
  -> editing -> schedule/flush saves -> destroy
  -> cancel pending autosave -> destroy editor -> destroy provider/awareness
  -> remove runtime listeners
```

`destroy()` 必须幂等，并且只释放本 runtime 创建的 editor/provider/listener。它不得断开 `useSocket` 所有者管理的全局认证 socket，避免其他页面或通知通道被误断开。
```

## 5. Production Adapter设计

`ProductionEditorAdapter` 的职责是把当前 Production 编辑器接入参数变成 contract：`documentId` 使用稳定 Production 资源 ID；`collaborationRoom` 必须来自 `getCollaborationRoomId('production', production.id)`；`initialContent` 为当前可编辑版本的 HTML；`readonly` 由页面已有编辑资格与所选版本是否 current 决定；`persist` 维持当前的 `updateProduction(..., version_action: 'none')` 行为。

Production adapter 不拥有版本能力；它只向 Runtime 提供当前编辑上下文与普通内容持久化映射。版本系统的最终归属必须是 **Production domain service**，不是通用 adapter，也不是 runtime：

- `version_action`、minor save、major new version、下一版本号和每 major 最新 minor 的 history 清理都属于 Production 领域规则。
- 任何 `minor save`、`major new version`、history snapshot 和 version cleanup 必须由 Production Domain Service 的明确命令调用；runtime 永远不知道一次保存是否产生版本。
- adapter 不得将 runtime 的 `onManualSave` 默认映射为 minor 或 major；该回调若被启用，也只能委托给页面显式选择的 domain command。
- 审批、删除、选题重新关联、approved -> shooting 仍由 `ProductionDetail` 与服务端 workflow route 负责。

这样可以保证自动保存仍不创建 history，保留线上 Production 的当前语义。若日后产品决定“手动保存即 minor”，该决定应先修改 Production domain contract 并独立回归，而不是在 runtime 中加入条件分支。

## 6. Shooting Adapter设计

`ShootingEditorAdapter` 的职责是映射 `shooting` 资源：room 固定为 `getCollaborationRoomId('shooting', shooting.id)`；初始内容保持当前优先级 `script_content -> approved production.content -> production.content_markdown -> ''`；autosave 的 `persist` 仅调用现有 `updateShooting(id, { script_content })`。

Shooting 的 workflow（planned/in_progress/completed/cancelled、完成后流转 Publishing）留在页面与后端 workflow domain。adapter 不得写 Production、不得使用 `production:<id>` room，且不得调用 `production_history`。

当前不建议为 Shooting 增加版本系统、history 或 approval：它已有“本地剧本与审核稿分离”的明确产品语义，且不存在已批准的成片版本规则。若未来确有需要，应先独立定义：成片版本的领域对象、不可变 snapshot、审批状态、保留策略、资源归属、回滚行为和存储方案；应使用独立的 `shooting_history`/成片版本模型，而不是复用 `production_history`。在该决策完成前，adapter 只负责 current `script_content`。

## 7. Autosave设计

应将 `syncToDatabase` 的调用协议抽象为轻量 `AutosaveCoordinator`，但首轮不重写其计时或 Yjs 逻辑。`syncToDatabase` 可先作为 coordinator 的内部兼容实现。

```ts
export interface AutosaveCoordinator {
  scheduleSave(content: string, revision: number): void;
  flush(): Promise<void>;
  cancel(): void;
  getStatus(): ContentEditorSaveStatus;
}
```

设计语义：

- `scheduleSave`：接收单调递增的本地 `revision`，仅当内容与最近成功持久化内容不同才排队；同 documentId 的旧 timer 必须取消，默认延迟仍为 2500ms。
- `flush`：取消 timer 并立即持久化最新 revision；同一 revision 已 in-flight 时复用该 Promise，避免重复写。较旧请求完成后不得把其结果标记为较新 revision 已保存。
- `cancel`：组件卸载、资源切换或只读切换时取消未开始的 timer；不得取消已发出的 HTTP 请求。
- `getStatus`：返回 `idle/saving/synced/conflicted`，继续映射现有 editor state event bus，不能创造第二套状态源。
- 失败：保留最新未成功内容与 `conflicted` 状态；下一次 `scheduleSave` 或显式 `flush` 才重试。首轮不得暗中加入无限重试或离线队列。

adapter 的 `persist` 是 coordinator 的唯一业务出口。Production 和 Shooting 共享 scheduling/cancel/status，但不共享 API payload、版本动作或成功后的 workflow 行为。

## 8. 权限设计

推荐 **方案 B：Adapter 提供 `readonly`，Runtime 消费而不自行判断权限**，并以服务端为最终权威。

|方案|评价|结论|
|-|-|-|
|A：Runtime 自己判断权限|会让 runtime 依赖 admin/director/editor/member、资源归属和页面数据；易绕过/重复|拒绝|
|B：Adapter 提供 readonly|业务页可复用当前 Production/Shooting 的角色、owner、topic scope 结果；runtime 只负责不可编辑 UI|推荐|
|C：Runtime 完全不知道权限|若连 readonly 都不消费，页面会重复 editor 选择和 UI 行为|不单独采用；作为服务端权威原则保留|

具体原则：

1. `admin/director/editor/member` 等角色解释，以及 Production 页面特有的角色/操作者/creator/assignee 判断，留在业务层或 adapter 工厂；`validate()` 可以向该业务层询问资源是否存在、用户是否仍可编辑、当前版本是否仍可编辑、是否已被锁定，但不在 runtime 中写角色条件。
2. Shooting 的 `workflow:shooting`、`requirePermission` 和 topic 资源归属判定仍由现有后端 route 强制执行；adapter 只把已计算的显示策略传为 `readonly`。
3. Runtime 即使收到 `readonly: false` 也不拥有授权能力；所有 `persist` 请求必须继续经过现有 API 的 `authenticate`、`requirePermission` 和资源范围检查。
4. 不将角色字符串、`requirePermission`、topic 查询或权限 store 导入 runtime；这也是未来新资源可接入的前提。

## 9. 时间系统约束

业务持久化时间继续由已有 `shared/time` 与 `api/database/utils.ts` 统一处理。Runtime 不应生成数据库/API 业务时间。

|时间|责任方|规则|
|-|-|-|
|`createdAt` / `updatedAt`（资源）|资源后端/domain API|使用既有北京时间数据库写入和 API 格式化契约|
|`saveAt`（若未来持久化）|adapter 调用的后端/domain API|使用 `nowBjt` + `formatBjtDatabase` / `formatBjtApi`，不在浏览器生成业务时间|
|版本/history 时间|Production domain service/后端|沿用 Phase 2 时间层；runtime 仅展示 API 值|
|协作 event timestamp|现有 Yjs/Socket runtime|可继续使用 epoch milliseconds 做内存排序、延迟和 heartbeat；不是业务存储时间|
|Yjs 内部时间|Yjs/运行态实现|无需转换为北京时间，也不得改协议；若未来写入审计/快照持久层，再在边界格式化|

禁止在 runtime/adapter 新增 `datetime('now')`、`datetime('now', '+8 hours')`，或以 `new Date()`/`toISOString()` 直接作为业务字段。现有 `Date.now()` 在 Yjs provider、room heartbeat、snapshot/telemetry 中是非持久化技术时钟，本设计不要求修改它。

## 10. 推荐目录结构

现有 `src/editor/` 已是正确根目录，不应创建平行的 `src/components/content-editor`。推荐的目标树：

```text
src/editor/
├── contracts/                         # Phase A：仅创建真实契约文件
│   ├── contentEditorAdapter.ts
│   └── autosaveCoordinator.ts
├── runtime/                           # Phase B：首次有 runtime 实现时创建
│   ├── ContentEditorRuntime.tsx
│   └── useAutosaveCoordinator.ts
├── adapters/                          # Phase B/C：随第一个 adapter 实现创建
│   ├── productionEditorAdapter.ts
│   └── shootingEditorAdapter.ts
├── state/                             # 已存在
├── telemetry/                         # 已存在
├── timeline/                          # 已存在
└── explain/                           # 已存在
```

立即创建的仅应是 `contracts/` 中实际被 TypeScript 引用的一个或两个文件；`runtime/` 和 `adapters/` 只在对应 Phase 有真实实现时创建。不要预先创建 hooks/utils/ports 之类空目录。现有 `src/components/ContentEditor.tsx` 先保留为兼容 façade；`src/collaboration/*` 和 `api/*` 不因目录调整而移动。

## 11. 渐进迁移路线

|阶段|内容与预期修改文件|数据库变化|前端发布 / 线上编辑影响|风险与验证|回滚|
|-|-|-|-|-|-|
|Phase A：只增加类型和接口|新增 `src/editor/contracts/contentEditorAdapter.ts`、可选 `autosaveCoordinator.ts`；新增纯 contract/unit tests；不改调用方|无|需要一次前端发布，但无行为变化；线上编辑不受影响|类型编译；用 mock adapter 验证 runtime 不含资源分支；确认产物无 API/Socket 改动|删除未使用契约文件或回退该小提交|
|Phase B：Production Adapter 接入|新增真实 `runtime/` 与 `adapters/productionEditorAdapter.ts`；`ContentEditor.tsx` 保持 façade；最小改 `ProductionDetail.tsx` 的 editor/autosave glue|无|前端发布；Production 是高风险回归面，先灰度/feature flag（若现有发布机制支持）|富文本、Ctrl+S、autosave 2.5s、minor/major、history 折叠、审批、双人协作、断线重连、失败后再次保存|ProductionDetail 切回当前 `ContentEditor + syncToDatabase` 调用；API/数据未变|
|Phase C：Shooting Adapter 接入|新增 `adapters/shootingEditorAdapter.ts`；最小改 `ShootingDetail.tsx` 的初始内容/autosave glue|无|前端发布；不影响 Production 代码路径|验证 `shooting:<id>` room、script_content 优先级、不会写 Production、状态流转与 Publishing 传递、双人协作和保存失败|ShootingDetail 切回当前 `scriptContent + syncToDatabase`；`script_content` 数据不变|
|Phase D：清理重复逻辑|仅在 B/C 长期稳定后，收敛 `lastAutoSaved...`、状态桥接和重复 cancel 代码；保留 legacy mode|无|前端发布；应分 PR/小提交逐项清理|性能 profile、bundle/diff review、Production/Shooting 全回归；不得改变协议或版本规则|逐小提交回退；始终可用 ContentEditor façade|

所有阶段都不需要 migration、后端接口改变、Socket.IO 协议改变或 Yjs 同步逻辑改变。若任何阶段要求这些变化，必须停止并另开设计决策，不得以 runtime 重构名义夹带实施。

## 12. 测试策略

|层级|测试对象|关键断言|
|-|-|-|
|单元测试|adapter contract、AutosaveCoordinator|相同内容不保存；同 docId 去抖只保留最新；flush 去重；cancel 不保存；状态准确|
|Adapter 测试|Production adapter、Shooting adapter|Production persist 固定 `version_action: none`；Shooting 只写 `script_content`；room 前缀正确；初始内容优先级正确|
|Editor/runtime 组件测试|ContentEditorRuntime + mock adapter|runtime 不 import/判断 Production/Shooting；readonly 禁止编辑；toolbar/placeholder/capabilities 不回归|
|协作测试|既有 SocketYjsProvider + 两个 runtime 实例|同 room 双向同步；不同 `production:<id>`/`shooting:<id>` 完全隔离；断线重连重新 sync；presence 清理；不修改事件协议|
|保存失败恢复|mock persist 拒绝后再成功|显示 conflicted；保留最新内容；下一次 schedule/flush 仅保存一次；没有重复 timer 或覆盖远端内容|
|权限测试|adapter readonly 与现有 API route|admin/director/editor/member 的页面策略按业务层结果；直接调用 API 仍由 `requirePermission`/资源归属拒绝；runtime 不成为权限来源|
|性能回归|长文编辑、连续输入、双人协作|输入不因 state 重建卡顿；2.5 秒去抖不重复保存；provider 不重复创建；Socket 断连不产生持续重连风暴|

阶段 B/C 的验收必须覆盖当前 Production 与 Shooting 的真实路径。抽象后的组件测试不能替代协作测试；尤其要监测 editor 初始化时“Yjs fragment 非空不覆盖”的现有行为。

## 13. 风险分析

- **共享层回归**：ContentEditor 服务多个页面，任何大改会扩大影响面。对策：兼容 façade、一个资源一阶段、小提交。
- **双 autosave**：页面旧 effect 与 coordinator 同时存在会双写。对策：每个接入阶段只能保留一个保存调度者。
- **初始内容覆盖**：adapter 改错 room 或在同步前强制 setContent 可能覆盖远端 Yjs state。对策：保留 `applyInitialContentOnce` 和既有空 fragment 条件。
- **领域泄漏**：在 runtime 中加入 documentType 条件会使未来资源继续复制分支。对策：lint/review 要求 runtime 不 import 业务 page/API/type。
- **版本污染**：把 manual save 默认映射 minor/major 会改变 Production 线上行为。对策：版本是 domain service，runtime 默认只通用保存。
- **权限错觉**：readonly 是 UX，不是认证。对策：保持服务端 `requirePermission`、topic scope 和所有现有资源校验。
- **时间倒退**：浏览器时间进入 API/DB 将破坏北京时区契约。对策：runtime 不生成业务时间，后端沿用 shared/time。

## 14. 后续扩展方向

稳定后，新资源应遵循“先定义 adapter、再接入 runtime”的顺序：Topic 可以提供 outline 的 adapter；Publishing 可以提供 script_content adapter；AI 生成内容可提供只读/可接受 suggestion 的 adapter；素材描述可提供轻量持久化 adapter。它们都必须自行拥有资源 API、权限、时间和版本策略，不能把这些策略塞进 runtime。

若未来要求跨重启的协作恢复、可审计 CRDT snapshot 或成片版本历史，那是独立的存储/协议/产品决策，应另立 ADR 与数据迁移方案。本计划不把内存 Yjs snapshot 误作业务历史，也不改变现有稳定协作链路。

## 15. Explicitly Out of Scope

本阶段明确不实现以下事项：

1. 多编辑器统一版本历史或 history 模型。
2. Yjs/CRDT 持久化、跨重启协作恢复或 snapshot 存储。
3. AI 实时改写、suggestion merge 或 AI 内容工作流。
4. 文档 ACL、资源级在线锁定或权限模型重构。
5. 评论系统、toolbar/schema 或发布流程重构。
6. Production/Shooting 工作流、版本规则、`production_history` 清理规则的调整。
7. 数据库 migration、表结构新增、历史数据回填或数据转换。
8. Socket.IO 事件、namespace、room 协议或 Yjs provider 同步逻辑变更。
9. 部署、构建、性能优化或“顺手”创建未来目录。

若其中任一需求被提出，必须建立独立 ADR 与 Implementation Task，重新评估数据、权限、时间系统、回滚和生产影响；不得将其夹带进 ContentEditor Runtime 的接口收敛工作。
