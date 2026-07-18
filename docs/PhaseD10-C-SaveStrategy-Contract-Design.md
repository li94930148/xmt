# Phase D10-C ContentEditor SaveStrategy Contract Design

## 1. 文档状态与执行边界

状态：Architecture Proposal。

本阶段仅定义 Runtime Contract 的未来修改方案。未修改 ContentEditor、Runtime、AutosaveCoordinator、Adapter、TopicDetail、Production、Shooting、API 或数据库。

目标是在不改变 Production/Shooting autosave 的前提下，明确区分三种保存语义：

- `autosave`：文档字段级、Runtime 协调持久化；
- `manual`：页面明确触发的保存；
- `external`：编辑器不拥有任何持久化，页面沿用既有外部保存。

## 2. 当前问题

### 2.1 Adapter 存在即触发 autosave

当前 `ContentEditor` 的变更路径为：

```text
Editor onChange
  → ContentEditor onChange
  → 若 adapter 存在：runtimeHandle.scheduleSave(content, revision)
  → RuntimeAutosaveCoordinator
  → adapter.persist(content, { reason: 'autosave', ... })
```

因此 Adapter 既是业务上下文，也是 autosave 开关。这个耦合对 Production/Shooting 正确，但无法表达 TopicDetail 的 aggregate manual save。

### 2.2 fallback 语义未被显式表达

未传 Adapter 的页面由 ContentEditor 内部 fallback adapter 承载，它使用 noop `persist()`，但没有契约级方式说明“保存由页面外部负责”。这使 Publishing、TopicDetail 等显式保存页面的正确行为依赖隐式约定。

### 2.3 gracefulDispose 的 durability 仅适用于 autosave

GracefulDisposeController 的 durability participant 是 AutosaveCoordinator。manual/external 模式不存在 pending autosave 时，不能把 flush 的 `synced` 解释为页面业务数据已保存。

## 3. SaveStrategy Contract 设计

### 3.1 类型

```ts
export type ContentEditorSaveStrategy =
  | 'autosave'
  | 'manual'
  | 'external';
```

|策略|适用对象|Runtime 是否在 onChange 持久化|业务保存 owner|
|-|-|-|-|
|`autosave`|Production、Shooting|是|Adapter `persist()`|
|`manual`|未来 TopicDetail|否|页面明确调用 `handle.manualSave()`，Adapter `persist()` 仅由此路径调用|
|`external`|无 Adapter 的现有页面，如当前 TopicDetail/Publishing|否|页面既有 onSave/按钮/API 调用|

### 3.2 Adapter 最小演进

```ts
export interface ContentEditorAdapter {
  documentId: string;
  collaborationRoom: string;
  initialContent: string;
  readonly: boolean;
  validate?(): Promise<boolean>;
  capabilities: ContentEditorCapabilities;
  /** Omitted only for existing Adapter compatibility; it resolves to autosave. */
  saveStrategy?: ContentEditorSaveStrategy;
  persist(content: string, context: ContentEditorSaveContext): Promise<void>;
}
```

保持 `persist` 为必填可以避免把任何策略变成“可无声不保存”。策略决定谁及何时调用它：

- `autosave`：Runtime coordinator；
- `manual`：Runtime 的 explicit manual command；
- `external`：不调用；fallback 的 noop `persist` 仅为 Runtime shell 完整性存在。

不建议让 `onManualSave?` 成为新主契约：它当前未被调用，且不能解决 `onChange` 自动 schedule 的问题。未来可以在一次兼容性迁移中弃用该可选字段，或仅将其保留为旧调用方过渡层。

### 3.3 策略解析规则

```ts
function resolveSaveStrategy(adapter?: ContentEditorAdapter): ContentEditorSaveStrategy {
  if (!adapter) return 'external';
  return adapter.saveStrategy ?? 'autosave';
}
```

实际实现中，ContentEditor 的 fallback adapter 应显式标记 `external`，以便 Runtime context、telemetry 和测试均能观察到该语义。生产/成片 Adapter 不设置字段时仍解析为 `autosave`，从而实现零页面改动兼容。

## 4. Runtime 与 ContentEditor 行为

### 4.1 onChange 行为

|策略|onChange 后行为|
|-|-|
|`autosave`|更新受控 value，revision +1，调用 `scheduleSave()`|
|`manual`|只更新受控 value 与编辑状态；revision 可本地递增供后续 manualSave 使用，但不得调用 `scheduleSave()`|
|`external`|只更新受控 value；不调用 Runtime 保存命令|

ContentEditor 不得按 `documentId`、页面名或业务类型分支；只根据 resolved strategy 行为。

### 4.2 scheduleSave

`ContentEditorRuntimeHandle.scheduleSave()` 为避免破坏现有调用方，保留在 handle 上，但其有效性受策略限制：

- `autosave`：保留现有 coordinator 行为、revision 去重和 stale completion 防护；
- `manual`、`external`：拒绝/忽略调用，不排队、不启动 timer、不调用 `persist`；
- 未来若需暴露可观察结果，可新增非破坏性的 `ScheduleSaveResult`，但首个实现不应改变现有 `void` 签名。

这样 Production/Shooting 既有调用路径不变，同时保证任何误接 Topic manual Adapter 的 `scheduleSave` 都不会产生网络写入。

### 4.3 manualSave

建议为 Runtime handle 新增明确 command：

```ts
export interface ContentEditorManualSaveResult {
  status: 'saved' | 'failed' | 'cancelled' | 'already_destroyed';
  revision: number;
  error?: unknown;
}

export interface ContentEditorRuntimeHandle {
  // existing members
  manualSave(content: string, revision: number): Promise<ContentEditorManualSaveResult>;
}
```

语义：

1. 仅 `manual` 策略实际调用 `adapter.persist(content, { reason: 'manual', ... })`；
2. 不创建 debounce timer，不复用 `RuntimeAutosaveCoordinator` 的 pending 队列；
3. 相同 revision 的并发请求复用同一 in-flight Promise；
4. 旧 revision 的迟到完成不得覆盖较新 revision 的保存状态；
5. 保存成功更新 Runtime editor-level 状态为 `synced`，失败为 `conflicted`；
6. `external` 调用返回 `cancelled`，`destroy()` 后返回 `already_destroyed`；
7. Runtime 不知道 aggregate payload；Topic Adapter 的 `persist` 只是回调到页面拥有的完整 `updateTopic()` 命令。

建议独立 `ManualSaveController` 管理 in-flight/revision/status，避免把非 debounce 行为塞入 AutosaveCoordinator。后者保持 Production/Shooting 稳定性边界。

### 4.4 destroy

`destroy()` 保持现有语义：幂等、立即释放、不等待网络。

- `autosave`：取消 pending debounce，不中断已发出的请求；
- `manual`：不取消已经发出的 `manualSave` Promise，但拒绝新的保存；
- `external`：只释放 Runtime lifecycle；
- 三者都不调用业务 API，也不解释权限、版本或 workflow。

### 4.5 gracefulDispose

|策略|gracefulDispose 语义|页面准入|
|-|-|-|
|`autosave`|维持当前 autosave durability + best-effort participant 聚合|Production/Shooting 继续使用|
|`manual`|不能代表 aggregate form durability|Topic 不得以其作为离开放行条件|
|`external`|没有 Runtime durability|页面自行决定离开保护|

为消除 API 误用，建议 future contract 将 `AggregateDisposeOutcome` 扩展为：

```ts
type AggregateDisposeOutcome =
  | 'durable'
  | 'not_durable'
  | 'interrupted'
  | 'not_applicable';
```

manual/external 调用 gracefulDispose 时返回 `not_applicable`，且 durability participant 标记为 `skipped` + `detail: 'not_applicable'`。它表示 Runtime 没有可证明的 durability 工作，绝不能被 generic leave guard 视为成功。

Production/Shooting 的 outcome 不变。`useEditorLeaveGuard` 若未来接收到 `not_applicable`，必须保守地进入确认态，而不是自动导航；TopicDetail 则不使用它作为 form dirty guard。

### 4.6 Handle bridge

RuntimeHandleBridge 保持纯契约转发，不感知策略、业务页面、Tiptap 或协同对象。它只需要随 `ContentEditorRuntimeHandle` 的新增 `manualSave` 成员更新测试 mock；桥接发布/释放行为不变。

## 5. 兼容方案

### 5.1 Production / Shooting

|对象|变更要求|兼容保证|
|-|-|-|
|Production Adapter|无需页面改动；可暂不填写 `saveStrategy`|缺省解析为 `autosave`，现有 `persist`、revision、gracefulDispose 保持|
|Shooting Adapter|同上|`script_content` autosave 与 gracefulDispose 保持|
|AutosaveCoordinator|不承担 manual 保存|不修改现有 debounce/revision 逻辑|

### 5.2 无 Adapter 页面

ContentEditor fallback adapter 解析为 `external`：

- TopicDetail 当前显式 `updateTopic()` 保存不变；
- PublishingDetail 当前显式 `updatePublishing()` 保存不变；
- 不新增 autosave 请求；
- 不改变 Editor 工具栏 Ctrl/Cmd+S 的现有 `onSave` 回调行为。

### 5.3 未来 Topic

TopicDetail 只有在 D10-A 的 HTML/aggregate-save 准入条件满足后，才显式传入 `saveStrategy: 'manual'` Adapter。AddTopic 在创建前继续不传 Adapter；不可利用 `manualSave` 或 `external` 作为隐式 createTopic 草稿机制。

## 6. 测试方案

### 6.1 Contract / Runtime 单元测试

|用例|断言|
|-|-|
|autosave strategy|`scheduleSave` 调用一次 persist，原因为 `autosave`|
|manual strategy onChange|多次输入后 persist 调用数为 0，未产生 timer|
|manualSave success|只调用一次 persist，原因为 `manual`，状态为 `synced`|
|manualSave failure|返回 `failed`，状态为 `conflicted`，允许 retry|
|manual revision|旧 revision 迟到完成不覆盖新 revision 状态|
|manual duplicate|同 revision 并发 manualSave 复用 in-flight 请求|
|external strategy|onChange、scheduleSave、manualSave 都不调用 persist|
|destroy|三种策略拒绝后续保存；已发请求不被冒充已取消|
|gracefulDispose autosave|既有 durable/degraded/not_durable 测试不变|
|gracefulDispose manual/external|返回 `not_applicable`，不得表示 durable|

### 6.2 ContentEditor 路由测试

|用例|断言|
|-|-|
|Adapter 缺省策略|既有 adapter 仍调度 autosave|
|明确 autosave|输入 revision 进入 handle scheduleSave|
|明确 manual|输入不进入 scheduleSave；页面可获得 handle.manualSave|
|明确 external/fallback|输入不触发 runtime persist|
|readonly|三种策略均不绕过现有 readonly 透传|
|handle bridge|新增 handle API 后 ready/null/switch 无引用泄漏|

### 6.3 回归验证

- Production：自动保存请求数量、`version_action: 'none'`、快速离开、版本按钮、双用户协同；
- Shooting：`script_content` payload、刷新、快速离开、failure dialog；
- Topic mock：aggregate callback 接收 manual command，但不进行真实 Topic 页面接入；
- Publishing/现有 external page：显式保存与 Ctrl/Cmd+S 行为不变。

## 7. 实施拆分计划

### D10-C1 — Contract 类型与 resolver

- 只在 contracts 中新增 strategy、manual result、`not_applicable` outcome；
- 为现有 Adapter 缺省策略定义兼容规则；
- 更新纯类型测试/mock；
- 不接页面。

### D10-C2 — Runtime manual controller

- 新增独立 ManualSaveController；
- Runtime 根据策略创建/调用对应 controller；
- 不修改 AutosaveCoordinator；
- 单元测试覆盖 revision、失败、destroy 与 not_applicable dispose。

### D10-C3 — ContentEditor strategy routing

- 仅将 `handleEditorChange` 按策略路由；
- fallback 标记 external；
- 保持现有 props 与 Production/Shooting API 不变；
- 更新 handle bridge 测试。

### D10-C4 — Stabilization

- 先完成 Production/Shooting/Publishing 回归；
- 不接 Topic；
- 通过后才开启独立的 TopicDetail manual-save bridge 实施任务。

## 8. 回滚方案

每个实现阶段都应独立可回滚：

- C1：移除新增类型和 resolver，不影响现有运行路径；
- C2：不影响 AutosaveCoordinator，移除 ManualSaveController 即可回退；
- C3：恢复“有 Adapter 即 scheduleSave”的现状可完全回退，但只能在 Topic 尚未接入前执行；
- C4 后若发现 Production/Shooting 回归，回退 strategy routing，不修改业务 API、Yjs、Socket.IO 或数据库。

TopicDetail 接入不属于本设计阶段，不与 C1–C4 同一发布单元。

## 9. 结论

SaveStrategy 应成为 Runtime contract 的显式能力，而非通过“是否传 Adapter”间接推断。采用可选策略、现有 Adapter 默认 autosave、fallback 显式 external 的设计，可以零页面改动保护 Production/Shooting，并为 Topic 的 manual aggregate save 提供安全的后续入口。
