# Phase D10 Topic Editor Runtime Integration Design

## 1. 当前 Topic 架构

### 1.1 TopicDetail

`src/pages/TopicDetail.tsx` 将选题内容拆成多段本地状态：标题、负责人/截止日期/平台、项目背景/目标受众以及 `scriptContent`（映射到 `topic.outline`）。

大纲编辑使用：

```tsx
<ContentEditor
  value={scriptContent}
  onChange={setScriptContent}
  mode="rich"
  collaborationEnabled={false}
/>
```

保存不是大纲独立保存，而是页面“保存”按钮一次性调用 `updateTopic(id, { title, description, outline, platform, deadline, assignee_id })`。取消会把全部本地编辑状态回退到已加载的 `topic` 数据。编辑权限由以下两层共同决定：

1. `topic:update` 权限；
2. 管理角色/允许编辑角色，或当前用户为创建者、负责人。

因此，当前 TopicDetail 是**页面聚合显式保存**模型，不是文档级 autosave 模型。

### 1.2 AddTopic

`src/pages/AddTopic.tsx` 的 `outline` 使用：

```tsx
<ContentEditor mode="legacy" ... />
```

其保存语义与 TopicDetail 不同：

- “提报选题”调用 `createTopic()`；标题为空时阻止提交。
- “保存草稿”也调用 `createTopic()`；标题可为空并使用默认未命名标题。
- 两条路径均在成功后导航至 `/topics`。

这不是可更新的 server-side draft，而是一次创建记录的表单操作。创建前没有稳定的 Topic ID、documentId 或协同 room。

### 1.3 API 与内容格式

`createTopic()` 接受 `outline?: string`；`updateTopic()` 接受 `Partial<Topic>`。当前 API 未提供只更新大纲的专用接口，也没有 Topic history、version_action 或协同 room 约定。

TopicDetail 的 rich 编辑器和 AddTopic 的 legacy 编辑器均按 HTML 字符串保存 `outline`。只读预览通过 `normalizeLegacyEditorHtmlTheme()` 处理历史 HTML 样式。

## 2. 与 Production/Shooting 的关键差异

|维度|TopicDetail|AddTopic|Production/Shooting|
|-|-|-|-|
|资源是否已存在|是|否（保存草稿即创建）|是|
|保存粒度|整页聚合 payload|整表单创建 payload|单一内容字段|
|当前保存语义|显式保存/取消|显式创建草稿或提交|Runtime autosave|
|协同需求|当前关闭|当前不存在|已启用 Yjs room|
|版本|无|无|Production 有领域版本；Shooting 无版本|
|离开保护范围|应覆盖整页 dirty state|应覆盖整张创建表单|可由单文档 Runtime durability 覆盖|

结论：Topic 不得复制 Production Adapter。尤其不能把 `updateTopic()` 的整页 payload 拆成仅大纲 autosave 后，错误地宣称整页已保存；也不能让 AddTopic 的输入事件隐式创建草稿记录。

## 3. TopicDetail 接入方案

### 3.1 推荐目标：先保持 explicit save

TopicDetail 应保留页面“保存”和“取消”作为唯一业务提交/回退语义。第一阶段的 Runtime 接入目标应是提供**编辑器生命周期与可观察性**，而不是改变保存节奏。

建议未来定义 `TopicDetailEditorAdapter`，但仅在具备 explicit-save bridge 后接入：

- `documentId`: `topic:<id>`，仅用作 Runtime 标识；
- `collaborationRoom`: 空字符串；不创建或假定 Topic Yjs room；
- `initialContent`: 已加载的 `topic.outline`；
- `readonly`: 由既有 `canEditTopic` 和页面编辑状态共同计算；
- `capabilities`: `collaboration: false`、`manualSave: true`、`immersive/pageScroll` 按页面实际 UI 决定；
- `persist` / `onManualSave`: 不能单独调用 `updateTopic({ outline })`，必须委托页面已组装的完整 `handleSave` 领域操作，或使用一个明确的 aggregate-save callback。

当前 Runtime 的 `onChange` 会在存在 Adapter 时调度 autosave。因此在未增加“manual-only Runtime bridge”前，**不得给 TopicDetail 传入会持久化的 Adapter**；否则会无意中把显式保存改成 autosave。未来实现任务必须先冻结该 bridge 的契约与测试，再接入页面。

### 3.2 未保存离开策略

TopicDetail 不能直接复用当前 Production/Shooting 的 `useEditorLeaveGuard` 行为，因为该 guard 只能证明 Runtime 中单一内容的 durability，不能证明标题、描述、负责人等同页字段已保存。

推荐设计为页面级 `TopicDirtyGuard`：

1. 以加载快照为 baseline，比较所有可编辑 Topic 字段；
2. 受控导航时，若未 dirty，正常离开；
3. 若 dirty，提供“保存并离开 / 继续编辑 / 放弃离开”；
4. “保存并离开”调用原有 aggregate `handleSave`，成功后才导航；
5. 不处理浏览器关闭、刷新或 unload，除非另行设计 form-level reliability contract。

Runtime handle 可以作为未来编辑器子能力的一部分，但不能取代页面级 dirty 状态。

### 3.3 TopicDetail 不在本阶段引入的能力

- 不引入 autosave；
- 不引入 Yjs、Socket.IO 或 `topic:<id>` collaboration room；
- 不引入 Production version_action、history 或审批语义；
- 不修改 `topic:update`、资源归属判断或状态流转。

## 4. AddTopic 接入方案

### 4.1 推荐目标：先保留 legacy 与提交式创建

AddTopic 是创建表单，不能直接创建 `TopicEditorAdapter`。在 Topic 尚未存在时，任何稳定的 `documentId` 都是虚构的；如果把 Adapter 的 `persist()` 接到 `createTopic()`，每次输入都可能产生重复 Topic 记录，风险不可接受。

因此建议顺序为：

1. 保留 `ContentEditor mode="legacy"`；
2. 保留“保存草稿”和“提报选题”的显式创建时机；
3. 先设计表单级临时草稿策略，再决定是否将创建页切换为 rich 编辑器；
4. 只有在记录创建成功并获得 ID 后，后续编辑才可按 TopicDetail 路径评估 Runtime。

### 4.2 未来草稿策略选项

|方案|说明|建议|
|-|-|-|
|A. 维持当前创建型草稿|点击按钮才创建 Topic|短期推荐；无新增状态模型|
|B. 浏览器本地临时草稿|仅本地恢复输入，提交/保存草稿时再创建|可单独设计；需明确清除、隐私和多 tab 规则|
|C. 服务端预创建草稿|先显式创建 draft Topic，之后通过更新保存|长期可选；需要 API/数据库/权限/清理策略的独立任务|

方案 C 才可能形成稳定 `topic:<id>` Adapter，但不属于本阶段，也不能通过前端隐式调用 `createTopic()` 替代。

### 4.3 AddTopic 未保存离开策略

创建页需使用表单级 dirty guard，而不是 Runtime gracefulDispose。用户离开时应明确选择继续编辑、放弃表单，或先点击现有“保存草稿”；不应为大纲字段单独 flush 后放行导航，因为标题、平台、截止日期和其他字段仍可能丢失。

## 5. HTML 兼容方案

### 5.1 现有风险

RichTextEditor 处理历史 HTML（如 `font`、`span`、inline style、批注 data attributes），并通过 `normalizeLegacyEditorHtmlTheme()` 处理主题样式。Tiptap rich 编辑器会解析输入并重新序列化 HTML，可能导致：

- 不受 schema 支持的节点或属性被删除/降级；
- 旧字体、颜色、对齐、标注和嵌套 span 格式变化；
- 空内容、`<p><br></p>`、纯文本与 HTML 的等价性变化；
- 预览结果与编辑后持久化结果不一致。

### 5.2 迁移原则

1. 不做全库 HTML 批量转换；
2. 不在 AddTopic 迁移前删除 RichTextEditor；
3. 先建立代表性 HTML fixture 集（字体、颜色、列表、表格、批注、空内容、异常 HTML）；
4. 分别比较 legacy 预览、Tiptap 编辑后保存、刷新后预览；
5. 对无法无损承载的标记，明确降级规则或继续 legacy，而不是静默丢失；
6. 新创建内容与历史内容的格式策略可不同，但必须在 UI 与数据契约中明确。

## 6. 风险

|风险|后果|控制措施|
|-|-|-|
|将 TopicDetail 误接 autosave|取消语义和整页原子保存被破坏|先实现 manual-only/aggregate-save bridge；不直接传 persistence Adapter|
|将 AddTopic 输入接到 `createTopic()`|重复业务记录、脏草稿|创建前禁止 Adapter persist|
|仅 flush outline 后允许离开|同页其他字段丢失|使用 form-level dirty guard|
|HTML 迁移不兼容|历史样式/批注丢失|fixture、双渲染比对、按页面渐进迁移|
|擅自打开 Topic 协同|Yjs room/权限/初始化风险|本设计明确保持 `collaboration: false`|
|复用 Production 版本或审批|领域污染|Topic 不引入 `version_action`、history 或 Production API|

## 7. 分阶段实施计划

### Phase D10-A — 只补设计与测试样本

- 定义 TopicDetail aggregate-save 与 dirty-state 边界；
- 建立 HTML fixture 和兼容性验收矩阵；
- 不创建 Adapter、不修改页面、不改 API。

### Phase D10-B — TopicDetail manual-save bridge（独立实现任务）

- 仅在契约评审后，为 explicit save 建立 Runtime/页面连接；
- 保持现有 `updateTopic()` 完整 payload、取消行为、权限和协同关闭状态；
- 增加保存失败与离开提示测试；
- 不改变 AddTopic。

### Phase D10-C — AddTopic 草稿策略决策

- 在 A/B/C 草稿策略中做产品与数据决策；
- 若选择 B 或 C，另开实施任务并完成隐私、权限、清理和回滚评审；
- 在此之前继续 legacy。

### Phase D10-D — HTML 受控迁移评估

- 使用 fixture 按内容类别验证 Tiptap；
- 仅在兼容矩阵通过的类别中试点 rich；
- 保留 legacy 回退路径。

## 8. 回滚方案

本阶段仅产生设计文档，无运行时变更。后续每个实施阶段均应独立可回滚：

- TopicDetail bridge：移除该页面的 Runtime/guard 接入并恢复既有显式 `handleSave`；
- AddTopic：保持 legacy 分支可独立切回；
- HTML 迁移：以原始 `outline` 字符串为基准，禁止写入前批量转换；
- 草稿策略：如涉及 API 或数据库，必须设计独立迁移与清理回滚，不能与编辑器接入绑定发布。

## 9. 结论

Topic 的下一步不是直接创建 Adapter，而是先把页面聚合保存、创建草稿和历史 HTML 三个边界固定下来。TopicDetail 可以在未来接入 explicit-save Runtime bridge；AddTopic 在记录创建前应继续使用 legacy 和提交式保存。两条路径必须分阶段、分任务验证。
