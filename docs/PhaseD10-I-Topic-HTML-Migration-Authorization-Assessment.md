# Phase D10-I Topic HTML Migration Authorization Assessment

## 1. 文档状态与边界

状态：Architecture Governance / Migration Authorization Assessment。

本文件只给出下一阶段的迁移准入与授权边界，不执行迁移，也不改变任何 Topic 数据、编辑器 schema、Runtime、SaveStrategy、RichTextEditor 或 annotation mapping。

所有结论均是 **按单条 Topic 授权**，不是 cohort、批量或历史数据迁移授权。

## 2. 当前 HTML 类型授权矩阵

| HTML 类型 | 已有证据 | 当前授权 | 可做事项 | 明确禁止 |
| --- | --- | --- | --- | --- |
| THTML-01 普通文本 | 首条受控试点已完成 admission、runtime renderer、manual save、刷新、leave guard 与 rollback | **Approve** | 按本文件前置条件申请单条受控迁移 | 批量迁移、自动 cohort 扩容 |
| THTML-07 空 HTML | Topic 117 浏览器闭环通过；空值稳定规范化为 `<p></p>`，保存、刷新、leave guard、discard、rollback 均通过 | **Approve** | 按本文件前置条件申请单条受控迁移 | 将所有空 outline 批量改写为 runtime HTML |
| THTML-04 列表 | runtime/单实例、结构保存刷新、嵌套解析、Enter、Backspace、Shift+Tab、leave/discard/rollback 通过；Tab 缩进未通过 | **Pilot Only** | 仅新建专用 fixture 或经单独批准的单条试点 | 扩大到真实业务 Topic、批量迁移、将 Tab 缺陷视为已解决 |
| THTML-05 表格 | runtime/单实例、表格结构、列宽 canonicalization、单元格编辑、保存刷新、leave/discard/rollback 通过 | **Pilot Only** | 仅新建专用 fixture 或经单独批准的单条试点 | cohort/批量迁移或默认启用 |
| THTML-02 `font`/`span` 历史格式 | 历史样式兼容风险未解除 | **Blocked** | 仅 fixture/转换规则研究 | 任何迁移写入 |
| THTML-03 颜色与 `background-color` | 样式语义与 canonicalization 未验证 | **Blocked** | 仅 fixture/转换规则研究 | 任何迁移写入 |
| THTML-06 批注/annotation | legacy annotation 与 Tiptap CommentExtension mapping 未定义 | **Blocked** | 独立 mapping 设计与 fixture 验证 | 任何迁移写入或删除 annotation |
| THTML-08 异常或未知 HTML | 来源、语义、解析安全性均不可判定 | **Blocked** | 人工分类与独立 fixture | 自动转换、自动保存、批量处理 |

## 3. THTML-04 的 Tab 缺陷是否阻断数据迁移

结论：**阻断列表类型的授权扩展，但不证明当前已验证列表 HTML 会在保存时丢失数据。**

已完成的结构与持久化证据表明，当前 fixture 中的无序列表、有序列表和嵌套列表可以被 Runtime renderer 解析、编辑态渲染、保存和刷新恢复。Enter、Backspace、Shift+Tab 也已获得实际浏览器行为证据。

但 Tab 未能在真实浏览器中验证为“当前列表项缩进并形成嵌套列表”。这意味着列表的常用编辑交互仍有功能缺口或焦点定位不确定性。若在未解决前迁移真实列表 Topic，用户可能在后续编辑时遇到预期外行为。因此：

- 不将其判定为历史数据损坏风险；
- 不授予真实业务 Topic 或批量迁移权限；
- 保持 **Pilot Only**；
- 如需要继续，应另开仅针对列表 Tab 快捷键与焦点定位的诊断/修复任务，并在修复后重新完成同一浏览器矩阵。

## 4. 受控迁移的强制前置条件

以下条件必须全部满足，才可对一个已明确授权类型的单条 Topic 提交受控迁移申请。

### 4.1 选择与权限

1. 目标 HTML 已人工分类为矩阵中的 `Approve`，或已获得针对 `Pilot Only` 的单条书面批准。
2. 目标不是正在协作、审批、发布或其他关键业务流程中的文档。
3. 操作人具备该 Topic 的正常编辑权限；权限判断继续由既有业务层执行，不通过 Runtime 绕过。
4. 迁移窗口内明确一名操作人和一名验收人；没有第二人确认不得扩大范围。

### 4.2 Backup 与 migration record

迁移前必须创建一条不可覆盖的 migration record，至少包含：

- `topicId`、标题、当前 renderer mode；
- 原始 outline 原文及 SHA-256；
- HTML 分类、candidate runtime HTML 及 SHA-256；
- 操作人、验收人、计划时间；
- 当前权限与页面状态摘要；
- 回滚 HTML、回滚步骤和验证标准；
- 观察窗口的开始/结束时间。

原始 outline 必须保存在迁移记录或已批准的受控备份中；不能仅依赖浏览器缓存、历史记录或“重新生成 candidate”。

### 4.3 执行与验收

1. 先在 legacy 与 runtime renderer 之间进行人工视觉和结构对照。
2. 只通过标准 TopicDetail 路径执行：`ContentEditor -> manualSave -> aggregate save -> updateTopic`。
3. 验证保存成功后刷新；检查结构、主要文本、可编辑性与 renderer 单实例。
4. 验证 clean leave、dirty leave、discard；对表格/列表还需覆盖其类型特有交互矩阵。
5. 立即执行一次 rollback 演练，且刷新确认已恢复原 outline。
6. 通过验收后，才可再次按同一记录重新执行最终迁移写入；rollback 演练本身不等同于已迁移。

### 4.4 Observation window

最终迁移完成后进入观察期：

- 最低观察窗口：一个完整业务日或下一次已知编辑窗口，以较长者为准；
- 观察保存失败、刷新恢复、dirty leave、渲染错误和用户反馈；
- 任何结构缺失、样式关键差异、无法编辑、保存异常或回滚需求均触发 No-Go；
- 观察期结束只关闭该条 migration record，不自动为同类 Topic 扩容。

## 5. 下一阶段的受控迁移范围

### 可申请进入 controlled migration

- **THTML-01**：可申请单条真实 Topic 受控迁移，前提是满足第 4 节全部条件。
- **THTML-07**：可申请单条真实 Topic 受控迁移，接受 Runtime 的 `<p></p>` canonical form，前提是满足第 4 节全部条件。

### 只可继续试点，不可授权真实业务迁移

- **THTML-04**：可继续在 fixture 或经独立审批的低风险单条试点中验证；Tab 缩进问题未关闭前不得扩大。
- **THTML-05**：浏览器闭环已完成，但 canonicalized `colgroup`/列宽与真实业务表格的视觉风险仍需逐条人工确认；保持 Pilot Only。

### 继续阻断

- annotation、`font`/`font-size`/`font-family`、颜色和 `background-color`、异常或未知 HTML。
- 任何混合了阻断类型和已授权类型的 HTML；按最严格成分处理。

## 6. 最终 D10 迁移准入建议

1. **不启动批量迁移。** 当前证据只支持单条、可回滚、人工验收的操作。
2. 将 THTML-01 与 THTML-07 作为唯一可申请真实 Topic 受控迁移的类型；每条都需独立 migration record、备份、回滚和观察窗口。
3. THTML-04 与 THTML-05 不得因 fixture 成功自动升级。THTML-04 先解决/复验 Tab 缩进；THTML-05 继续保持逐条视觉验收。
4. 将 annotation mapping、历史字体/颜色样式和异常 HTML 作为独立架构/兼容性任务，不与本轮迁移绑定，也不得为了迁移而删改历史语义。
5. 任一迁移发生异常时，立即按 migration record 回滚原 outline 并将相应类型降为 Blocked，直至完成独立根因分析。

## 7. 非目标

- 不新增或修改 Topic 数据；
- 不切换真实 Topic 的 renderer mode；
- 不创建 cohort policy 或真实 legacy fallback 配置；
- 不修改 Runtime、SaveStrategy、schema、RichTextEditor、CommentExtension、Yjs、Socket.IO 或数据库；
- 不执行部署、提交或批量操作。
