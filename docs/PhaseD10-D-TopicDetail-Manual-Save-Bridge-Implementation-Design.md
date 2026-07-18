# Phase D10-D TopicDetail Manual Save Bridge Implementation Design

## 1. 文档状态与执行边界

状态：Architecture Proposal。

本文只定义 TopicDetail 接入 `manual` save strategy 的实施边界和验收条件。本文不修改 TopicDetail、AddTopic、Runtime、Adapter、API、数据库、Yjs 或 Socket.IO。任何实现必须另开任务，且先完成 D10-A 的 HTML fixture 准入。

冻结前提：TopicDetail 不引入协作 room、Yjs、Socket.IO、版本历史、审批版本语义或 Production/Shooting 保存规则；AddTopic 不在本方案范围内。

## 2. 当前 TopicDetail 基线

当前 `TopicDetail.tsx` 在进入编辑状态时同时打开 title、details、description、outline 四个编辑区。`handleSave()` 构造并提交一次既有 `updateTopic(id, payload)`：

```ts
{
  title,
  description: descriptionFromParsedFields,
  outline: scriptContent,
  platform: details.platform,
  deadline: details.deadline,
  assignee_id: details.assignee_id,
}
```

因此 `outline` 不是可独立 autosave 的资源；它属于 Topic aggregate payload 的一个字段。当前返回列表直接 `navigate('/topics')`，还没有 form dirty guard。权限仍由 `topic:update` 加上角色/创建者/负责人归属共同决定。

## 3. 接入边界

| 层级 | 负责 | 不负责 |
| --- | --- | --- |
| ContentEditor Runtime | rich editor 生命周期、readonly/capabilities 透传、`manualSave(content, revision)`、handle 生命周期和 `destroy()` | Topic 字段、dirty、权限、API、保存按钮、取消、路由决策 |
| Manual adapter | 为 Runtime 提供 opaque document context、`manual` 策略与转发 `persist()` callback | 拼装 Topic payload、调用权限判断、选择 API、业务状态流转 |
| TopicDetail | draft/baseline、aggregate revision、完整 payload、`updateTopic()`、保存/取消、页面级离开确认 | Tiptap、Yjs、provider、timer autosave |

Runtime 对 Topic 的 `gracefulDispose()` 不能证明表单已保存：manual 策略没有 pending autosave，返回 `not_applicable`。Topic 的受控离开必须由 Topic form dirty guard 决定，而不能复用 Production/Shooting 的 `useEditorLeaveGuard` 作为放行条件。

## 4. Adapter 决策

推荐：实施时新增一个**薄的 TopicDetail manual adapter factory**，而不是 external bridge。

理由：`external` 会保持当前页面自己直接调用 API，无法让 `ContentEditorRuntimeHandle.manualSave()` 成为唯一的显式编辑器保存命令；这样只获得 Runtime 外壳，不能完成本阶段目标。Adapter 是 `manualSave()` 能受控调用页面 aggregate command 的必要桥梁。

拟议形态（仅设计，非本阶段代码）：

```ts
interface TopicDetailManualAdapterOptions {
  documentId: string;             // topic:<id>
  initialContent: string;         // loaded topic.outline
  readonly: boolean;              // 页面已计算的 !canEditTopic || !editOutline
  persist(content: string, context: ContentEditorSaveContext): Promise<void>;
}

createTopicDetailManualAdapter(options): ContentEditorAdapter
```

它应固定提供：

```ts
{
  documentId: `topic:${topic.id}`,
  collaborationRoom: '',
  initialContent: topic.outline || '',
  readonly,
  capabilities: {
    collaboration: false,
    manualSave: true,
    immersive: false,
    pageScroll: false,
  },
  saveStrategy: 'manual',
  persist: pageOwnedAggregatePersist,
}
```

`TopicDetailManualAdapter` 不得 import `updateTopic`，不得接收 title/details/description，不得判断 `topic:update`，不得知道 Topic workflow。它只是 Runtime contract 的适配器；业务仍留在页面 aggregate command。

## 5. 保存设计

### 5.1 单一保存 owner

页面必须收敛为一个 `saveTopicAggregate()` command；保存按钮、未来 Ctrl/Cmd+S、以及“保存后离开”都只能走它。不得出现“先 `updateTopic()`，再 `manualSave()`”或反向双写。

```text
任一 Topic draft 字段变更
  -> 更新 page draft
  -> aggregateRevision += 1
  -> isTopicDirty = draft !== baseline

点击保存
  -> page gate: 已有 aggregate save 则复用同一 Promise
  -> runtimeHandle.manualSave(draft.outline, aggregateRevision)
  -> adapter.persist(_, context)
  -> pageOwnedAggregatePersist(snapshot, revision)
  -> updateTopic(id, existing complete payload)
  -> 成功：更新 baseline；仅当 draft 未在期间变化时退出编辑态
  -> 失败：保留 draft、dirty、编辑态与失败信息
```

### 5.2 Aggregate revision 是强制要求

不能仅使用 ContentEditor 的 outline revision。ManualSaveController 对已持久化 revision 返回成功而不会再调用 `persist()`；若用户先保存大纲，再只改标题，沿用 outline revision 会错误跳过第二次 `updateTopic()`。

所以 TopicDetail 必须维护单独的、单调递增的 `aggregateRevision`：title、details、parsed description fields 和 outline 的每一次本地变更都递增。它是传给 `manualSave()` 的 revision，即使 `content` 参数仍是当前 outline。

### 5.3 快照、并发与刷新

- 点击保存时由页面捕获 `draftSnapshot + aggregateRevision`；adapter 的 `persist()` 从稳定 ref 读取同一快照，避免 React closure 过期。
- 页面设置一个跨 revision 的 aggregate in-flight gate。ManualSaveController 仅按相同 revision 去重，不足以阻止用户在第一个请求未完成时改字段并发起第二个 aggregate PUT。
- 保存按钮与键盘保存入口在 in-flight 期间禁用；重复动作复用原 Promise。
- 成功后只把 **已提交快照** 写入 baseline；若当前 draft 已有新变更，则保持编辑态和 dirty，不能用 `getTopic()` 回读覆盖用户的新输入。
- 失败不更新 baseline，不关闭任一编辑区，不调用 `destroy()`。
- 可继续保留成功后的 `getTopic()` 校验，但只能在 `currentRevision === savedRevision` 时回填；否则仅更新已保存 baseline 或延后重载。

### 5.4 description 与 cancel 前置修正

当前保存从 `parsedFields` 重建 description，而 `handleCancel()` 只恢复 `description` 和其他字段，没有重新恢复 `parsedFields`。实施前应先定义唯一 `topic -> draft` / `topic -> parsedFields` 初始化器，并让 load、save success、cancel 全部使用它。否则取消后再次保存可能提交错误的 description。这是接入前必须覆盖的现有状态一致性项，不是 Runtime 职责。

## 6. 离开设计

只保护明确可控路径，例如“返回列表”和未来页面内部导航；不在本阶段承诺 refresh、关闭浏览器或 `beforeunload` 的 aggregate durability。

| 场景 | 页面行为 | Runtime 行为 |
| --- | --- | --- |
| 无修改离开 | `destroy()` 后一次 `navigate()` | 立即释放，无网络保存 |
| 有修改，选择保存并离开 | `saveTopicAggregate()` 成功后 `destroy()`，再一次 `navigate()` | 只通过 `manualSave()` 触发一次 aggregate persist |
| 有修改，保存失败 | 保持当前页面、dirty 和编辑态；提供继续编辑/重试/放弃离开 | 不 destroy，不导航 |
| 有修改，放弃离开 | 不调用 API；`destroy()` 后一次 `navigate()` | 立即释放 |
| 取消编辑 | 从 baseline 恢复所有 draft/parsed fields；清除 dirty；不调用 API | `cancel()` 只能清内部状态，不触发保存 |

Topic 必须使用 Topic-specific dirty dialog/guard。它可在后续抽取成通用 form leave guard，但不能把 Production autosave 的 durable 结果当作 Topic aggregate save 的 proof。

## 7. 建议实施拆分

1. **D10-D1：页面状态准备。** 在 TopicDetail 中建立稳定 draft、baseline、aggregate revision、aggregate in-flight gate 和完整 cancel 初始化；仍使用当前 external ContentEditor，不接 Runtime manual persist。
2. **D10-D2：薄 adapter 与 manual bridge。** 新增 TopicDetail manual adapter factory；将 outline 的 ContentEditor 显式接到 `saveStrategy: 'manual'`、handle bridge 和 `saveTopicAggregate()`，但不接 Yjs、不改 API payload。
3. **D10-D3：受控离开。** 仅拦截返回列表/页面内部 Topic 导航，接入 Topic dirty dialog；不修改浏览器 unload 行为。
4. **D10-D4：浏览器回归。** 在可回滚 Topic fixture 上验证 payload、失败恢复、HTML fixture 和权限；通过后才考虑长期治理。

每一步可通过移除 TopicDetail 的 adapter/handle bridge 回到当前 external ContentEditor + 原 `handleSave()`；不需要数据库迁移、API 修改或影响 Production/Shooting。

## 8. 测试矩阵

| 类别 | 用例 | 通过标准 |
| --- | --- | --- |
| Manual strategy | 多次输入 outline | 0 autosave timer、0 `persist()`，直至明确保存 |
| Aggregate revision | 保存 outline 后只改 title / details / description 再保存 | 两次均触发一次完整 `updateTopic()`；第二次不被旧 revision 跳过 |
| Payload | 同时修改全部字段 | 单请求保留当前既有六字段 payload，outline 与 description 无覆盖丢失 |
| Concurrency | 连续点击保存、Ctrl/Cmd+S 与按钮并发 | 单 aggregate in-flight、无重复 PUT |
| Stale completion | 保存中继续编辑 | 旧成功不清除新 dirty，不回填覆盖新 draft |
| Failure | `updateTopic()` reject/timeout | 保留页面、编辑态与 draft；可 retry；不显示成功、不导航 |
| Cancel | 修改 title/details/parsed fields/outline 后取消 | 所有字段恢复 baseline；0 保存请求 |
| Leave | clean / save-and-leave / failed-save / discard | 各自只出现预期 API 与一次导航 |
| Permission | 无 `topic:update`、无归属、可编辑角色/归属 | 保持现有 readonly 和进入编辑限制；Runtime 不越权 |
| HTML | D10-A 的普通、font/span、颜色、列表、表格、批注、空/异常 HTML | 达到既定解析-保存-刷新准入标准；批注 fixture 不通过则 bridge 继续 blocked |
| Regression | Production / Shooting | 既有 autosave、协作、graceful dispose 行为不变 |

## 9. 风险与回滚

主要风险是把 aggregate Topic 保存错误降级为 outline-only 保存、把 Runtime `not_applicable` 误当作 Topic durability、以及保存成功回读覆盖用户并发输入。上述 revision、page-level gate、baseline 规则和 dirty guard 是必要防线。

本阶段没有任何实现修改，无需回滚。后续每一步都应保持可回滚：移除仅 TopicDetail 的 manual adapter/handle bridge，恢复到当前 external ContentEditor 与既有 `handleSave()`；禁止修改历史数据、数据库结构、Yjs/Socket.IO 和 Production/Shooting 路径。

