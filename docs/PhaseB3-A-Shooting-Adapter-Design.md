# Shooting Adapter Design

> 状态：Design Only / Architecture Proposal。本文只定义 Shooting 接入 ContentEditor Runtime 的边界和后续实施条件；本阶段不创建 Adapter、不修改页面、API、数据库、Yjs、Socket.IO、权限或版本系统。

## 1 当前 Shooting 架构

`src/pages/ShootingDetail.tsx` 是成片制作记录的页面装配层，当前承担以下职责：

| 关注点 | 当前行为 | 未来归属 |
| --- | --- | --- |
| 资源加载 | 用 `getShootingById(id)` 获取 Shooting、选题、操作者与关联的已审批 Production。 | Shooting 页面 / API |
| 编辑内容 | 页面状态为 `scriptContent`。初始内容优先级为 `shooting.script_content` → `production.content` → `production.content_markdown` → 空字符串。 | 页面解析初始值；Adapter 只接收已解析结果 |
| 编辑器 | 以 rich mode 使用现有 `ContentEditor`，协作 key 为 `shooting:<id>`。 | ContentEditor / Runtime |
| 自动保存 | 页面用 `syncToDatabase` 以 2.5 秒 debounce 调用 `updateShooting(shooting.id, { script_content })`。 | 后续 Runtime coordinator + Adapter `persist` |
| 保存状态 | 页面以同一 `shooting:<id>` 订阅 editor-state，显示保存/冲突状态。 | 现有 event bus；Runtime 只产生通用状态 |
| Workflow | `planned → in_progress → completed`，亦可由 `cancelled` 回到 `planned`。状态更新仍由 `handleStatusChange` 调用既有 `updateShooting`。 | Shooting 页面 / workflow domain |
| Publishing 关联 | 后端在 Shooting 状态更新为 `completed` 时读取当前 `script_content`，创建或更新 Publishing 的 `script_content`，并将选题流转为 publishing。 | 既有 workflow API；不得进入 Adapter |
| Production 关联 | 页面仅展示关联 Production 的已审批版本，并提供跳转到 Production history 的入口。 | 页面展示 / Production domain |

### readonly 现状

当前 `ShootingDetail` 在记录加载后始终挂载 rich `ContentEditor`，没有基于 `planned`、`in_progress`、`completed` 或 `cancelled` 的前端 readonly 分支，也未在页面中直接判断角色。写入权限由既有后端 `requirePermission('workflow:shooting')` 与资源归属校验（`canEditProduction`）强制执行。

因此，后续 Adapter 接入的兼容基线是：页面传入当前既有的可编辑状态（第一版为 `readonly: false`），不得擅自根据 workflow 状态、角色或资源归属改为只读。若产品要引入 completed/cancelled 锁定，应另开权限/工作流决策与实施任务。

## 2 与 Production 差异

| 维度 | Production | Shooting |
| --- | --- | --- |
| 本地持久化字段 | Production 内容及相关版本语义 | 仅 `shooting.script_content` |
| 自动保存 | 必须固定 `version_action: 'none'` | `updateShooting(id, { script_content })`；没有 `version_action` |
| 版本体系 | 有 Production version/history，minor/major 属于 Production domain | 没有 Shooting history、版本号或版本命令 |
| 审批 | 有 Production 的审核状态与版本流程 | 只有制作 workflow 状态，不应被解释为编辑器审批能力 |
| 上游内容 | 自身为权威创作内容 | 只把已审批 Production 作为首次本地剧本的 fallback |
| 下游传播 | 审批通过后创建/复用 Shooting | 完成制作时将本地 `script_content` 传递给 Publishing |

以下内容不能从 Production 复用到 Shooting：

- `production_history`、Production 版本号、minor/major、`version_action` 及其清理规则；
- Production approval/review/rejected 业务语义；
- `production:<id>` 协作 room 或 Production API；
- 将 Production timeline 记录当作 Shooting 本地脚本历史。Shooting 时间线中的关联 Production 版本仅为只读的关联信息。

## 3 Adapter 边界

未来的 `ShootingEditorAdapter` 应是 `ContentEditorAdapter` 的薄映射，不增加 Shooting 专用字段，也不让 Runtime 识别 Shooting：

```ts
// 设计草图，非本阶段待创建代码
createShootingEditorAdapter({
  documentId: getCollaborationRoomId('shooting', shooting.id),
  collaborationRoom: getCollaborationRoomId('shooting', shooting.id),
  initialContent: resolvedScriptContent,
  readonly: false, // 保持当前页面行为；不在 Adapter 内推导权限或 workflow
  capabilities: {
    collaboration: true,
    manualSave: false,
    immersive: true,
    pageScroll: false,
  },
  persist: async (content) => {
    await updateShooting(shooting.id, { script_content: content });
  },
});
```

| Adapter 提供 | 不属于 Adapter |
| --- | --- |
| 不透明的 document/room 字符串、已解析初始内容、readonly 结果、通用 capabilities、`persist` 回调 | 读取 Shooting、角色/资源归属判断、workflow 按钮、完成制作、Publishing 写入、Production history、通知、路由跳转、timeline、版本和审批 |

`validate?` 在第一版不应为了抽象而接入。若后续页面已存在独立的资源有效性检查，可由页面/业务层提供该 callback；它也只能返回结果，不能让 Runtime 导入权限模型。

## 4 Runtime 接入方式

后续实施只替换 Shooting 页面的 editor/autosave glue，调用链应为：

```text
ShootingDetail
  ├─ 获取 Shooting 并按既有优先级解析 scriptContent
  ├─ 保留 workflow、Publishing、权限与 Production 关联 UI
  └─ createShootingEditorAdapter
       → ContentEditor（外部 props 保持兼容）
         → ContentEditorRuntime
           → RuntimeAutosaveCoordinator
             → adapter.persist(script_content)
               → 既有 updateShooting
```

接入时必须移除该页面的 `syncToDatabase` effect 与 `cancelDatabaseSync` cleanup，确保同一 `shooting:<id>` 只有一个 debounce 调度者。不得同时保留页面 autosave 和 Runtime coordinator，否则会产生重复 PUT 请求。

Runtime 继续通过现有 `ContentEditor` 调用既有协作 hook 和 `Editor`。它只透传 `collaborationRoom`、readonly、capabilities 与保存 handle；不创建 Socket、Yjs provider、事件或 room。

资源切换/卸载时，Runtime 的 `destroy()` 清理未发出的 autosave；React 现有协作 hook 继续销毁 provider、awareness 和监听器。不得由 Runtime 调用全局 socket disconnect。

## 5 保存设计

### 当前等价目标

未来 `persist` 必须严格复用当前最小 payload：

```ts
updateShooting(shooting.id, { script_content: content })
```

它不能携带 `status`、`topic_id`、计划信息、Production 版本信息或 Publishing 数据。Runtime coordinator 负责 2.5 秒防抖、revision 递增、重复 revision 抑制、旧 revision 完成不回退最新状态，以及卸载时取消未发出的请求。

### 初始内容与写入保护

`initialContent` 只来自页面已完成的优先级决策。接入不得把 fallback 的 Production 内容写回 `production` 表，也不得在已存在 `script_content` 时以关联 Production 内容覆盖本地剧本。协作初始化仍遵循现有 Editor/Yjs 的“仅在 fragment 为空时灌入初始内容”行为。

## 6 权限设计

推荐方案延续 Runtime 的 Adapter 提供 readonly 结果：

- Runtime 不导入 `admin`、`director`、`editor`、`member`，不调用 `requirePermission`，也不执行资源归属判断；
- Shooting 页面若未来已有前端可编辑性结果，只把布尔值传给 Adapter；
- 后端 `PUT /workflow/shooting/:id` 的 `requirePermission('workflow:shooting')` 与资源归属校验仍是唯一权威；
- 当前页面尚未做 workflow readonly，因此本次设计不建议以 `completed`/`cancelled` 自动锁定，避免静默改变线上行为。

readonly 是 UI 降级，不构成授权，也不能替代服务端校验。

## 7 协作设计

- 唯一 room：`getCollaborationRoomId('shooting', shooting.id)`，即 `shooting:<id>`；
- `documentId` 与 `collaborationRoom` 在本 MVP 都使用该值，与当前 `activeDocId`、ContentEditor `collaborationKey` 完全一致；
- 沿用现有 `useCollaborativeDocument`、`SocketYjsProvider`、presence、awareness、typing、断线重连与 Yjs 初始化逻辑；
- 不可复用 Production room，不新增 namespace、事件、payload 或 provider；
- Runtime autosave 是数据库 script_content 持久化协调，不能替代 CRDT/Yjs 同步，也不能把 Yjs 内部时间戳或 snapshot 解释为业务历史。

## 8 风险

| 风险 | 影响 | 约束/缓解 |
| --- | --- | --- |
| 双 debounce 共存 | 重复保存或状态抖动 | 接入时页面 `syncToDatabase` 与 Runtime coordinator 二选一。 |
| 初始内容优先级改变 | Production fallback 覆盖本地 `script_content` | 初始内容决策保留在页面；Adapter 只接收解析结果。 |
| 完成制作与未 flush 内容竞态 | Publishing 可能读取旧 `script_content` | 本阶段不改变 workflow；实施前需用既有行为建立基线，并明确状态按钮是否先 flush 的独立策略。不得在 Adapter 内完成 Publishing。 |
| 擅自 workflow readonly | 改变现有前端编辑体验 | 第一版保持 `readonly: false`，不从 status 推导。 |
| 领域泄漏 | Runtime 被迫知道 Publishing/Production | Adapter 只包含通用 contract 字段和 `persist`。 |
| 协作回归 | room/provider 重建、presence 异常 | room 文本不变；不改 Yjs、Socket.IO、hook 或 Editor。 |
| 时间边界 | 业务时间从浏览器或 Runtime 生成 | Adapter/Runtime 不生成 `createdAt`、`updatedAt` 或 workflow event 时间；现有 API 的时间治理保持独立于本任务。 |

## 9 实施计划

本节是未来独立 Implementation Task 的候选计划，不授权本阶段代码改动。

### Phase B3-B：Shooting Adapter MVP

允许的候选文件：

- 新增 `src/editor/adapters/shootingEditorAdapter.ts`；
- 修改 `src/pages/ShootingDetail.tsx`，仅接入 Adapter 并以 Runtime 替代该页 autosave effect；
- 必要的 Runtime/Adapter 测试文件。

验收：`npm run check`；script_content 优先级不变；只发出一次最新内容 PUT；payload 仅含 `script_content`；room 仍为 `shooting:<id>`；workflow/Pubishing 按钮行为不变；单人及双用户协作、presence、断线重连和保存失败恢复通过。

### Phase B3-C：稳定化

在受控测试账号和可回滚测试记录中，分别验证 `planned`、`in_progress`、`completed`、`cancelled`，并特别验证“最后一次输入 → 完成制作 → Publishing 获得的 script_content”的既有基线。若该场景需要 flush 顺序保证，应另开明确的 workflow 集成决策；不要把状态转换塞入 Adapter 或 Runtime。

### 回滚

若 Shooting 接入回归，仅恢复 `ShootingDetail` 原来的 `scriptContent`、`lastAutoSavedScriptRef`、`syncToDatabase` effect 和 cleanup，并移除该页 Adapter prop。Contract/Runtime/Production 保持不动；无需数据库、API、Yjs 或 Socket.IO 回滚。

### 版本系统结论

当前不需要 Shooting 独立版本系统。当前没有 Shooting history 数据模型、版本 API 或产品命令，且 Shooting 时间线只引用关联 Production 的版本。若未来确有“本地剧本可审计快照/恢复/审批”的产品需求，应新建独立 Shooting domain、数据模型、迁移策略和 ADR；它不得复用 `production_history`、Production `version_action` 或将普通 autosave 视为版本创建。Adapter 仍只提供当前可编辑文档与普通 `persist`。
