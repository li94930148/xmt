# Phase D10-B TopicDetail Manual Save Bridge Design

## 1. 文档状态与执行边界

状态：Architecture Proposal。

本文件仅定义未来 TopicDetail manual-save bridge 的契约、页面接入与验证方式。未修改 TopicDetail、AddTopic、ContentEditor、Runtime、Adapter、API、数据库或权限。

冻结原则：

- Topic 保持 `collaboration: false`，不引入 Yjs、Socket.IO 或 room；
- Topic 不复用 Production 的版本、history、approval 或 `version_action`；
- TopicDetail 继续以一次 aggregate `updateTopic()` 作为唯一业务保存；
- AddTopic 不属于本 bridge；创建前不调用 Runtime `persist()`。

## 2. 当前 Runtime 限制

### 2.1 autosave 的耦合位置

当前 `ContentEditor` 在 `handleEditorChange` 内执行：

```text
onChange(content)
if (adapter) runtimeHandle.scheduleSave(content, revision)
```

`ContentEditorRuntime` 固定创建 `RuntimeAutosaveCoordinator`，其 `persist()` 直接调用 `adapter.persist()`。因此只要把一个可持久化 Topic Adapter 传入现有 ContentEditor，输入就会成为 2.5 秒 debounce autosave。

这与 TopicDetail 的当前模型冲突：`outline` 不是独立资源，它与标题、description、负责人、平台和截止日期共同组成一次 `updateTopic()` payload。

### 2.2 当前 adapter / handle 可用能力

- Adapter 已提供 opaque `documentId`、`readonly`、`capabilities`、`persist()` 和可选 `onManualSave()`；
- `onManualSave()` 当前尚未被 Runtime 或 ContentEditor 调用；
- Runtime handle 能提供状态、`destroy()`、`flush()`、`gracefulDispose()`；
- handle bridge 已可安全把 Runtime contract 交给页面，但不会暴露 Tiptap、Yjs、provider 或 socket。

### 2.3 当前 gracefulDispose 不可直接用于 Topic dirty guard

GracefulDisposeController 将 autosave flush 作为唯一 durability participant。对于未调度的 manual Topic 编辑，flush 会返回“无 pending work 的 synced”，这只能说明 Runtime 没有 autosave 请求，**不能说明 Topic 表单已保存**。

因此 TopicDetail 不得直接使用 `useEditorLeaveGuard` 作为 dirty 表单的离开通行条件。否则未保存的标题/description/outline 可能被错误放行。

## 3. Manual Save 需求

### 3.1 行为目标

Manual Save Bridge 应同时满足：

1. ContentEditor 继续获得 Runtime 生命周期、readonly/capabilities 透传、handle bridge 与安全 destroy；
2. `onChange` 永不自动调用 `persist()`；
3. 只有页面明确触发“保存”或编辑器明确 Ctrl/Cmd+S 时，才调用一次 domain-provided aggregate save；
4. `persist` 成功的语义是“完整 Topic 表单已由页面保存”，而不是“仅 outline 已保存”；
5. 保存失败不得清除 dirty state，不得离开页面；
6. cancel 保持原有全字段恢复，不调用 Runtime 持久化。

### 3.2 不在需求内

- 不能将 manual save 偷换为延迟 autosave；
- 不能只提交 `{ outline }`；
- 不能新增 Topic API、数据库字段或后台草稿；
- 不能让 Runtime 读取标题、description 或权限；
- 不能把 Runtime `gracefulDispose()` 的 autosave outcome 解释为 Topic aggregate durability。

## 4. 推荐契约

### 4.1 保存策略类型

未来独立实现任务应在 contracts 层引入通用策略，而不是 `if (documentType === 'topic')`：

```ts
type ContentEditorSaveStrategy =
  | 'autosave'   // 当前 Production / Shooting
  | 'manual'     // 明确调用 handle.manualSave()
  | 'external';  // 当前没有 adapter 的显式页面保存兼容模式
```

兼容规则：

- 已存在 Production/Shooting Adapter 未显式指定时，行为默认仍为 `autosave`；
- ContentEditor fallback adapter 为 `external`，确保 Topic/Publishing 等现有无 Adapter 调用不发生改变；
- TopicDetail 未来 Adapter 显式声明 `manual`；
- AddTopic 在创建前继续不用 Adapter，不声明任何策略。

### 4.2 Adapter 契约演进

推荐将策略与持久化回调关系明确化：

```ts
interface ContentEditorAdapter {
  documentId: string;
  collaborationRoom: string;
  initialContent: string;
  readonly: boolean;
  capabilities: ContentEditorCapabilities;
  saveStrategy?: ContentEditorSaveStrategy;
  persist(content: string, context: ContentEditorSaveContext): Promise<void>;
}
```

约束：

- `autosave`：Runtime 可以从 `onChange` 调用 `scheduleSave()`，`context.reason === 'autosave'`；
- `manual`：Runtime 绝不从 `onChange` 调用 `scheduleSave()`；只有 `manualSave()` 调用 `persist()`，`context.reason === 'manual'`；
- `external`：Runtime 不调用 `persist()`；页面继续使用既有 `onSave`/按钮处理。

不建议继续以未使用的 `onManualSave?()` 表达三套不同语义；一个 callback 既无法阻止 autosave，也无法表达保存策略。若未来要保留该字段，应将其弃用并用上述策略/handle 收敛。

### 4.3 Runtime handle 演进

建议新增明确的 manual 命令，且不复用 `flush()`：

```ts
interface ContentEditorManualSaveResult {
  status: 'saved' | 'failed' | 'cancelled' | 'already_destroyed';
  revision: number;
  error?: unknown;
}

interface ContentEditorRuntimeHandle {
  // existing methods
  manualSave(content: string, revision: number): Promise<ContentEditorManualSaveResult>;
}
```

语义：

- 只在 `saveStrategy: 'manual'` 时实际持久化；在其他策略上返回明确 `cancelled` 或由类型/API 约束不暴露；
- 同一 revision 的并发 manualSave 复用同一 in-flight result；
- 较旧 revision 不得覆盖较新的成功状态；
- `destroy()` 后返回 `already_destroyed`；
- `manualSave` 不调度 timer，不创建 autosave pending 状态；
- Runtime 只把 `content` 和 revision 传给 Adapter；页面 closure 负责以当前完整表单构造 aggregate `updateTopic()`。

### 4.4 Runtime 状态语义

`ContentEditorSaveStatus` 仍可用于编辑器级状态展示：

```text
idle → saving → synced
             └→ conflicted
```

但页面不得用它作为 Topic aggregate 是否 dirty 的唯一依据。页面另行维护 `isTopicDirty` 和 aggregate-save 状态；Runtime `synced` 只代表最近一次明确 manual save 成功完成。

## 5. TopicDetail 页面接入方案

### 5.1 Adapter 的职责

未来 `TopicDetailEditorAdapter`（本阶段不创建）只提供：

```text
documentId          topic:<id>
collaborationRoom   ''
initialContent      loaded topic.outline
readonly            !canEditTopic || !editOutline
capabilities        { collaboration: false, manualSave: true, immersive: false, pageScroll: <current UI> }
saveStrategy        manual
persist             delegate to page aggregate-save callback
```

`persist` 的调用必须委托页面的完整保存命令，而不是封装 Topic API 子集：

```text
ContentEditor handle.manualSave(outline, revision)
  → TopicDetail aggregate save callback
  → existing payload builder
  → updateTopic(id, full payload)
```

Adapter 不得拥有 title、description 拼装、角色判断、状态转换或 API 选择逻辑。

### 5.2 保存路径

推荐把页面保存入口收敛为一个带防重门的 aggregate command：

```text
页面“保存” / Editor Ctrl+S
  ↓
TopicDetail saveAggregate()
  ↓
若由编辑器触发：handle.manualSave(currentOutline, revision)
  ↓
Adapter.persist → page aggregate updateTopic(full payload)
  ↓
成功：reload snapshot、更新 baseline、退出编辑态
失败：保留 local state 与 dirty、显示失败
```

实现时必须避免循环：页面“保存”不能同时先调用 `updateTopic()` 又调用 `manualSave()`；应由一个明确 owner 统一发出一次请求。推荐由 `manualSave()` 触发 Adapter 回调，页面按钮在 manual strategy 下只调用 handle；但 aggregate callback 必须从稳定 ref 读取最新的全表单状态，以避免 React closure 过期。

### 5.3 取消与只读

- `handleCancel` 保持恢复 title、details、description、outline 的加载快照；调用 `cancel()` 只可清理 Runtime 内部状态，不能触发网络；
- `readonly` 仍由 `canEditTopic` 和当前编辑状态计算；Runtime 不重新解释 `topic:update`、角色或资源归属；
- `pageScroll`、布局和非协同 Tiptap toolbar 保持现有配置；
- manual strategy 的 `collaborationRoom` 为空，不创建 Yjs provider。

## 6. Topic form dirty guard 与 Runtime 的协作

### 6.1 职责划分

|问题|唯一责任方|原因|
|-|-|-|
|outline 是否修改|Topic form dirty tracker|须与其余表单字段共同判定|
|标题/description/metadata 是否修改|Topic form dirty tracker|Runtime 不知道这些字段|
|aggregate `updateTopic()` 保存|TopicDetail domain/page command|payload 与权限属于页面/领域|
|编辑器内部生命周期和销毁|ContentEditor Runtime|不暴露 Tiptap/Yjs|
|受控离开前的保存决定|Topic form dirty guard|只有它能证明全表单 durability|
|受控离开后的资源释放|Runtime `destroy()`|立即释放，不等待网络|

### 6.2 受控导航流程

```text
用户点击返回/内部 Topic 导航
  ↓
isTopicDirty?
  ├─ 否：runtime.destroy() → navigate
  └─ 是：Topic form dirty dialog
            ├─ 保存并离开：aggregate manual save 成功 → runtime.destroy() → navigate
            ├─ 继续编辑：停留
            └─ 放弃离开：runtime.destroy() → navigate
```

这里不调用 `useEditorLeaveGuard.requestLeave()` 作为 dirty 表单 gate；也不将 `gracefulDispose()` 的“空 autosave synced”视为允许导航。若未来 Topic 另有真正的 Runtime participant，须另行设计 aggregate form guard 的 participant 聚合，而非复用 Production/Shooting 结论。

### 6.3 refresh / unload

本 bridge 只保护明确可控的路由/页面按钮导航。浏览器刷新、关闭、`beforeunload` 与 `pagehide` 仍不承诺 aggregate Topic 表单持久化，必须在未来 form-draft 任务中单独设计。

## 7. 测试矩阵

|类别|场景|验收|
|-|-|-|
|策略隔离|manual strategy 输入多次|零 timer autosave、零 `persist`，直到明确 manual save|
|策略隔离|Production/Shooting autosave|既有 debounce/revision 行为不变|
|aggregate 保存|仅改 outline 后保存|一次完整 `updateTopic` payload，reason 为 manual|
|aggregate 保存|同时改全部字段|一次请求包含所有新值，无字段覆盖|
|保存失败|Adapter/page aggregate callback reject|Runtime conflicted；dirty 保留；不退出编辑/不导航|
|revision|旧 manual result 晚返回|不得覆盖新 revision 状态或 baseline|
|防重|页面保存与 Ctrl+S 并发|唯一 in-flight aggregate command，最多一个请求|
|取消|多字段修改后取消|全字段恢复 baseline；零持久化请求|
|离开 clean|返回列表|无保存请求，destroy 后导航一次|
|离开 dirty|保存并离开|aggregate 保存成功后导航一次|
|离开失败|保存并离开失败|保持页面与 dialog；可继续编辑/重试/放弃|
|权限|无 `topic:update` 或非归属用户|保持现有只读/拦截；Runtime 不绕过|
|协同|TopicDetail 编辑|零 Yjs provider、socket room、presence 请求|
|HTML|D10-A fixture matrix|满足准入结果后才启用 rich/manual bridge 试点|

## 8. 迁移风险

|风险|控制措施|
|-|-|
|manual strategy 被遗漏，仍在 onChange 调度|策略隔离单测；ContentEditor 只在 `autosave` 明确调用 scheduleSave|
|aggregate callback 捕获旧表单 closure|使用页面最新值 ref 或单一 command owner；增加多字段回归|
|保存按钮与 Ctrl+S 双写|共享 in-flight action gate|
|gracefulDispose 被误判 durable|Topic 只使用 form dirty guard；禁止用 generic LeaveGuard 放行|
|富文本格式丢失|先完成 D10-A fixture 准入；批注 fixture 保持 blocked|
|影响 Production/Shooting|保持默认 autosave 策略和现有 Adapter contract；独立回归|

## 9. 回滚方案

本阶段无实现改动。后续实施应按可回滚小步骤发布：

1. 先仅增加契约与 Runtime manual strategy 测试，不接 Topic 页面；
2. 再以 feature-scoped TopicDetail 接入，保留原 aggregate `handleSave` 作为单一保存实现；
3. 若发生问题，移除 TopicDetail 的 Adapter/handle 使用并恢复现有无 Adapter ContentEditor 调用；
4. 不改写历史 `outline`，不修改 AddTopic，不影响 Production/Shooting/Yjs。

## 10. 结论

TopicDetail 可以获得 Runtime 生命周期能力，但 manual-save bridge 的正确性取决于策略隔离和 form-level aggregate durability。推荐的 bridge 是“Runtime 负责编辑器生命周期与显式 manual command，页面负责完整 Topic 保存与 dirty guard”；它不是 Production autosave 的变体，也不应由 generic gracefulDispose 替代。
