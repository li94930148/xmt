# Phase D10-A Topic HTML Compatibility Fixture & Save Boundary Design

## 1. 文档状态与边界

状态：Architecture / Test Design Proposal。

本文件只定义未来测试样本、验收矩阵与迁移准入条件。不创建 fixture 文件、不修改 Topic 页面、ContentEditor、RichTextEditor、Runtime、Adapter、API、数据库或权限实现。

冻结前提：

- Topic 不接 Production Adapter；
- Topic 不引入 Yjs、Socket.IO、collaboration room、version history 或 approval；
- TopicDetail 保持页面聚合显式保存；
- AddTopic 保持创建型保存，创建前不接 Runtime `persist()`。

## 2. HTML Compatibility Fixture 设计

### 2.1 测试目标

目标不是要求 legacy HTML 与 Tiptap 输出字节级相同，而是识别哪些内容可在“legacy 渲染 → Tiptap 解析 → 保存 HTML → 刷新渲染”后保持可接受的语义、结构和视觉结果。

每个 fixture 应保存以下四份证据：

1. 输入 HTML 原文；
2. legacy RichTextEditor 的可视渲染快照与 DOM 摘要；
3. Tiptap 解析后的文档结构/可视渲染快照；
4. Tiptap 重新序列化保存、重新加载后的 HTML 与渲染快照。

测试数据必须独立于真实 Topic，不批量读取或改写现有 `topics.outline`。

### 2.2 Fixture 清单

|ID|类别|输入样例特征|核心断言|预期等级|
|-|-|-|-|-|
|THTML-01|普通文本|纯文本、段落、换行、空格|文本内容、段落顺序、换行语义不变|必须通过|
|THTML-02|历史 `font` / `span`|`font[color/face/size]`、嵌套 span、inline font-size|文本不丢失；支持的颜色/字号可映射，未支持样式须显式记录|需比对|
|THTML-03|颜色与主题样式|默认黑色、`var(--editor-fg)`、前景色、背景色、highlight|`normalizeLegacyEditorHtmlTheme()` 后主题可读；非默认颜色不被静默清空|必须通过颜色可读性；格式可规范化|
|THTML-04|列表|`ul`、`ol`、嵌套列表、空 list item|层级、顺序、文本语义不变|必须通过|
|THTML-05|表格|表头、行/列、空单元格、单元格内段落|行列数、单元格文本和表头语义不变|必须通过|
|THTML-06|批注 data 属性|legacy `data-annotation-id` / `data-comment` / `.annotation-text`；Tiptap `data-comment-id` / `data-comment-text` / `data-created-at`|不得静默丢失批注信息|当前阻断，除非先定义转换契约|
|THTML-07|空 HTML|空字符串、空白、`<p><br></p>`、空 paragraph|编辑器可加载、保存、刷新，不产生虚假正文或异常|必须通过|
|THTML-08|异常/脏 HTML|未闭合标签、非法嵌套、未知 tag、`script`/event attribute、无效 style|安全降级；正文可恢复或清晰阻断；不得执行脚本|必须通过安全性；内容差异需分类|

### 2.3 建议 fixture 元数据

未来 fixture 文件（仅在独立实现任务中创建）建议包含：

```ts
type TopicHtmlFixture = {
  id: string;
  category: 'text' | 'legacy_style' | 'color' | 'list' | 'table' | 'annotation' | 'empty' | 'malformed';
  sourceHtml: string;
  expectedText: string;
  expectedStructure: string[];
  allowedNormalizations: string[];
  migrationDisposition: 'pass' | 'conditional' | 'blocked';
};
```

`allowedNormalizations` 必须逐项声明，例如 `font → span`、样式属性排序、Tiptap 自动补充 `tbody`。它不能成为“任意差异均允许”的兜底字段。

## 3. 验收矩阵与差异判定

### 3.1 四阶段管线

```text
fixture source HTML
  ↓
legacy RichTextEditor render
  ↓
ContentEditor rich / Tiptap parse
  ↓
serialized saved HTML
  ↓
reload rich render + readonly preview
```

每个阶段记录：文本、块级结构、关键属性、视觉截图、控制台异常和持久化字符串。

### 3.2 判定规则

|维度|通过|条件通过|阻断|
|-|-|-|-|
|文本内容|可见正文完全保留|可解释的空白/实体规范化|正文、段落或单元格文本丢失/重复|
|结构|段落、列表层级、表格行列等价|tag 名或 `tbody` 等序列化规范化|列表层级、表格结构、块级语义丢失|
|格式|主题可读且关键业务样式保留|已声明的 `font`/span 规范化|颜色、标记或对齐被无声清除且影响阅读|
|批注|属性与可见标记均可恢复|有明确、可逆的属性转换契约|批注内容/标识无声丢失|
|安全|非法/危险属性不执行，页面可恢复|未知格式被清晰降级|脚本执行、编辑器崩溃或污染后续保存|
|刷新|保存后富文本与只读预览一致|仅存在声明的序列化差异|刷新后内容丢失、重复或预览不一致|

### 3.3 当前已知批注阻断

legacy RichTextEditor 产生/读取 `.annotation-text`、`data-annotation-id`、`data-comment`；Tiptap `CommentExtension` 解析的是 `span[data-comment-id]`，并使用 `data-comment-id`、`data-comment-text`、`data-created-at`。

两套属性模型当前不等价。因此 THTML-06 在未完成**显式、可逆、经评审的 annotation mapping 设计**前必须标记为 `blocked`。不得通过删除属性或静默转换来宣称 Topic HTML 迁移兼容。

## 4. TopicDetail 保存边界测试体系

### 4.1 保存模型

TopicDetail 的唯一业务提交是 aggregate `updateTopic()`，其中同时提交标题、description 的结构化拼装结果、outline、platform、deadline、assignee_id。保存测试必须以整页状态为对象，而不能只验证 `outline`。

### 4.2 Dirty state 基线

未来实现前须定义一个不可变加载快照：

```text
baseline = { title, projectBackground, targetAudience, outline, platform, deadline, assigneeId }
```

dirty 判定必须比较所有字段的规范化值，且满足：

- 初始加载：clean；
- 仅改 outline：dirty；
- 改 outline 后恢复原值：clean；
- 改任一非 outline 字段：dirty；
- aggregate save 成功并重新加载：更新 baseline，变为 clean；
- aggregate save 失败：保留所有本地值和 dirty；
- cancel：恢复 baseline 的全部字段，变为 clean。

### 4.3 Aggregate save 验收矩阵

|场景|操作|预期|
|-|-|-|
|仅改 outline 后保存|修改大纲并点击页面保存|一次 `updateTopic` 完整 payload；成功后 reload 与预览一致|
|多字段聚合保存|同时改标题、描述、outline、元数据|一次完整 payload；无字段被 outline 保存覆盖|
|保存失败|模拟 `updateTopic` 失败|不退出编辑态；dirty 保留；错误可见；不导航|
|取消编辑|修改多字段后取消|全部字段恢复加载快照；不会发更新请求|
|重复保存|快速触发两次保存|页面层应保证状态和提示一致；不得引入 Runtime autosave|
|受控离开且 clean|返回列表|直接导航|
|受控离开且 dirty|返回列表/内部跳转|先进入 form-level 确认；不得只 flush outline|
|保存并离开|dirty 后选择保存并离开|aggregate save 成功一次后导航一次|

### 4.4 明确不测试为 TopicDetail Runtime 成功的事项

- 不以 `scheduleSave`/revision 通过作为 Topic 保存成功；
- 不要求 Yjs presence、room 或 Socket provider；
- 不检查 Production version_action、history 或审批；
- 不把浏览器 unload 当作 aggregate form durability 的承诺。

## 5. AddTopic 保存边界测试体系

### 5.1 创建前状态

AddTopic 的表单在 `createTopic()` 成功前没有 Topic ID。测试应明确：输入标题、outline 和其他字段只改变本地 state，不能产生 Topic 写入、Runtime autosave、Yjs room 或后台草稿。

### 5.2 创建型保存验收矩阵

|场景|操作|预期|
|-|-|-|
|编辑但不保存|输入所有字段|零 `createTopic` 调用；刷新/返回的当前行为应如实记录|
|保存草稿|点击既有按钮|仅一次 `createTopic`；payload 包含当前 outline；成功后导航列表|
|提报选题|填写必填标题后提交|仅一次 `createTopic`；不额外创建草稿|
|草稿失败|模拟创建失败|保留表单输入；不导航；错误可见|
|重复点击|快速重复草稿/提交|不得产生多个记录；此项是页面提交防重测试，不是 Runtime 测试|
|离开创建页|已有输入后点击返回|当前无 guard；未来应先做 form-level 产品决策，不能接 gracefulDispose 伪造保存|

### 5.3 创建型草稿的判定

当前“保存草稿”创建一条 Topic。任何未来草稿系统必须先明确其类型：

- 本地临时草稿：不创建 Topic，需定义清除、恢复、隐私、多 tab 与用户切换规则；
- 服务端 draft：显式创建后获得 Topic ID，才可考虑后续更新和 documentId；
- 维持现状：按钮触发一次创建，不提供输入过程持久化。

在决策前，AddTopic 不具备 Adapter `persist()` 的准入条件。

## 6. 迁移准入条件

### 6.1 TopicDetail 进入 manual-save bridge 的必要条件

以下条件须全部满足：

1. aggregate/manual-save Runtime bridge 有独立接口设计，确保不触发 `onChange → autosave`；
2. 所有 TopicDetail 字段均纳入 dirty baseline 与 aggregate save；
3. `updateTopic()` 完整 payload、取消恢复、既有权限和 status 流程保持不变；
4. form-level controlled leave 的失败/重试/放弃 UX 已设计并具备测试计划；
5. THTML-01、03、04、05、07、08 均通过；THTML-02 有明确允许规范化清单；
6. THTML-06 批注要么被可逆 mapping 支持，要么在页面级明确保留 legacy；
7. 有独立 fixture、失败注入、回滚方案和最小浏览器回归。

任一条件不满足时，TopicDetail 保持当前 rich + 页面显式保存结构。

### 6.2 AddTopic 考虑草稿系统的必要条件

以下条件须全部满足：

1. 产品确认草稿是 local、server draft 还是维持当前创建型；
2. 若采用 server draft，API、权限、清理和重复创建语义已独立评审；
3. 若采用 local draft，用户/设备隔离、恢复提示、过期与清理规则已定义；
4. 创建前不调用 Adapter `persist()`；
5. legacy HTML fixture 已通过或 rich 仅用于明确的新内容格式；
6. 对返回、刷新、提交失败和重复点击具备回归矩阵。

## 7. 回滚方案

本阶段只有设计文档，因此无需运行时回滚。后续实施的回滚边界必须保持：

- TopicDetail：移除 manual bridge/guard 接入即可回到既有 aggregate `handleSave` 与 `handleCancel`；不得改写历史 outline；
- AddTopic：legacy 分支始终保留到 HTML 兼容矩阵与草稿策略完全通过；
- HTML：禁止批量数据迁移；每次试点写入前保留原始 `outline` 值和 fixture 对照；
- 草稿：任何服务端草稿引入必须有单独删除/清理/回滚方案，不能绑在编辑器发布中。

## 8. 结论

Topic 迁移的首要验证对象不是 Runtime autosave，而是 HTML 内容保真与页面聚合保存边界。先建立 fixture 和 dirty/aggregate-save 验收体系，才有资格设计 TopicDetail 的 manual-save bridge；AddTopic 则必须先完成草稿产品与数据模型决策。
