# Phase D10-F Topic Controlled HTML Migration Pilot Design

## 1. 文档状态与边界

状态：Architecture Proposal / Pilot Runbook。本文只定义未来单条 Topic 的受控迁移流程，不执行真实迁移。

允许的候选类别仅来自 D10-E：THTML-01（普通文本）、THTML-04（列表）、THTML-05（表格）、THTML-07（空 HTML）。

明确禁止：批量修改 Topic、直接写数据库或历史 `outline`、删除 `RichTextEditor`、修改 `CommentExtension`、Runtime、SaveStrategy、数据库 schema、Yjs 或 Socket.IO。

## 2. 试点目标与非目标

目标是在一条人工选择、可立即回滚的 Topic 上，证明当前 TopicDetail 的 rich editor、manual aggregate save、刷新和 dirty leave guard 能安全承载已准入的 HTML 语义。

非目标：建立自动转换服务、重写历史内容、支持 legacy 批注、扩展样式 schema、迁移 AddTopic，或将试点结论外推为全量迁移授权。

## 3. 单条迁移流程

```text
候选选择
  -> 只读备份原 outline 与元信息
  -> 离线 fixture / admission 检查
  -> 生成候选转换结果（不写入）
  -> 双人或指定责任人视觉验收
  -> TopicDetail 标准 manual save 提交
  -> 刷新、离开、重新进入验证
  -> 观察窗口
  -> 保留或单条回滚
```

### 3.1 候选选择

候选记录必须同时满足：

1. 有明确 Topic ID、负责人和试点责任人；不得选择线上重要业务记录。
2. 当前用户具备既有 Topic 编辑权限；不新增权限绕过或临时角色。
3. `outline` 明确属于 THTML-01、04、05 或 07；无法分类即拒绝。
4. 不包含 `annotation-text`、`data-annotation-id`、`data-comment`、`font`、`font-size`、`font-family`、`background-color` 或未审核异常标签。
5. 记录没有并发编辑者，且试点窗口内不进入审批、Production、Shooting 或 Publishing 的业务转换。

### 3.2 备份

在任何转换或保存前，试点操作者必须创建**单条、只读、可核对**的迁移记录，至少包含：

- Topic ID；
- 原始 `outline` 的完整值；
- 原始值 hash；
- 记录的 `updated_at`、操作者、开始时间；
- 预期 fixture 类型；
- 回滚责任人和观察窗口。

该备份是试点运行记录，不是新的数据库字段，也不得覆盖原 Topic。原始值必须保存在受控的试点工单/加密附件中，不写入浏览器日志、console 或通用测试输出。

### 3.3 离线准入检查

用原始 `outline` 的副本执行与 D10-E 相同的管线：parse、serialize、模拟保存、reload。检查必须记录：

- 原始与 reload 的语义结构；
- 预期文本、列表项或表格单元格是否存在；
- 是否出现 style/attribute 丢失；
- 是否有 script 或未知标签被处理；
- 是否命中 legacy annotation。

任何丢失信号、解析异常或批注命中均为失败：不进入页面保存。

### 3.4 转换与人工验收

转换仅在内存或离线候选值中完成。人工验收人必须将原始 HTML 的渲染结果与候选 rich 渲染结果进行并排确认，并明确签字确认：

- 阅读顺序和文本内容；
- 列表层级、表格行列及标题语义；
- 允许的规范化差异（例如表格 colgroup、列表段落包装）；
- 没有颜色、字体、背景色或批注意义被遗漏。

未获确认不得将候选内容提交到 TopicDetail。

### 3.5 提交保存

保存必须走既有页面链路：

```text
TopicDetail manualSave
  -> TopicDetail aggregate save command
  -> TopicDetailAggregateSaveGate
  -> 既有 updateTopic 六字段 payload
```

不得调用新 API、脚本直连 API、数据库 SQL 或批量工具。保存前再次确认 `aggregateRevision` 是当前 revision；保存后仅在页面确认 dirty 清除时进入下一步。

### 3.6 刷新、离开与观察

保存成功后依次验证刷新、重新进入、一次实际编辑再保存、以及 Topic dirty leave guard：

- 无修改离开直接导航；
- 有修改时“继续编辑”不导航；
- “保存并离开”仅在保存成功后导航；
- “放弃离开”不保存新的修改；
- 刷新后内容与确认版本一致。

观察窗口建议覆盖一个正常业务班次；只观察保存失败、渲染异常、评论/样式缺失、权限异常和刷新恢复异常。任何异常立即停止扩大范围并按第 5 节回滚。

## 4. 试点准入检查表

| 检查项 | 通过标准 | 不通过动作 |
|---|---|---|
| HTML 分类 | 仅 THTML-01/04/05/07 | 拒绝试点 |
| 样式/批注扫描 | 无阻断属性 | 拒绝试点 |
| 离线 round-trip | 无缺失信号、无解析异常 | 拒绝试点 |
| 原始值备份 | 完整值和 hash 可核对 | 不开始 |
| 人工验收 | 指定责任人确认 | 不保存 |
| 权限与业务状态 | 使用既有权限，可编辑且无并发/流程转换 | 延后 |
| 回滚可用性 | 原始值与 legacy fallback 已准备 | 不开始 |

## 5. 回滚设计

### 5.1 内容回滚

回滚是单条 Topic 操作：用已核对的原始 `outline` 通过正常、受审计的 Topic 更新流程恢复，再刷新确认 hash/内容一致。不得用全库脚本或“+/- 偏移”式转换。

### 5.2 旧编辑模式回滚

当前 TopicDetail 没有已实现的 per-topic legacy 编辑器开关。因此，**在真正试点前必须先有独立、可审计、默认关闭的 scoped legacy fallback 方案**；否则“恢复旧编辑模式”不可执行，试点不得开始。

该 fallback 的未来实现必须是单独任务，至少限定到单条 Topic 或显式试点 cohort，并且：

- 不删除 `RichTextEditor`；
- 不修改已迁移以外的 Topic；
- 不改变 Production/Shooting/Runtime；
- 可在恢复原 `outline` 后立即切回 legacy renderer；
- 有独立浏览器验证和移除计划。

在 fallback 未准备前，D10-F 仅是设计，不能获得真实数据写入授权。

## 6. 试点验收矩阵

| 维度 | 验收操作 | 通过标准 |
|---|---|---|
| 视觉 | 原始/候选并排人工检查 | 文本、列表、表格语义和排版可接受 |
| 结构 | 离线 parse/serialize/reload | 无预期信号丢失；仅允许已声明的规范化 |
| 编辑 | 修改文本、列表、表格 | 可编辑且不出现重复、空白或节点异常 |
| 保存 | 点击标准保存 | 六字段 aggregate payload 成功，dirty 清除 |
| 刷新 | 保存后刷新与重新进入 | 内容与确认版本一致 |
| 离开 | clean/dirty/save/discard 四种路径 | 行为符合 D10-D3，不误导航或误保存 |
| 回滚 | 恢复原 outline 与 legacy fallback | 单条恢复可验证，无相邻记录影响 |
| 观察 | 试点窗口内记录异常 | 无 P0/P1 内容丢失、结构损坏或权限异常 |

## 7. Legacy 批注 mapping 的独立边界

批注不是 D10-F 的转换范围。任何以下工作都必须另开任务：

- `annotation-text` 到 `CommentExtension` 属性的 normalizer；
- `data-annotation-id`、`data-comment`、缺失 `data-created-at` 的 provenance 规则；
- 批注文本范围、编辑、删除、导出及 reload 验收；
- 无法映射批注的展示与回滚策略。

禁止为让试点通过而伪造创建时间、丢弃批注元数据，或修改 CommentExtension 的解析规则。

## 8. Go / No-Go 决策

Go 仅在所有准入检查、人工确认、单条备份和 scoped legacy fallback 均准备完毕后，由业务负责人显式授权。

No-Go 条件包括：任何阻断 HTML、无法确认视觉、缺少原始值、缺少可用 fallback、页面保存/刷新异常、或观察窗口出现内容损失。No-Go 时保留原 HTML，不执行写入。

## 9. 本阶段结果

本阶段没有选择候选 Topic、没有创建备份、没有运行转换，也没有保存或修改任何历史 `outline`。本文是未来独立实施任务的准入与回滚依据；D10-F 在此停止。
