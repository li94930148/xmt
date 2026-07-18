# Phase D10-H3 Topic HTML Migration Scope Expansion Assessment

## 1. 范围

本阶段只评估 THTML-04（列表）、THTML-05（表格）和 THTML-07（空 HTML）的下一步试点资格。没有创建或迁移真实业务 Topic，没有运行页面保存，也没有修改 Runtime、SaveStrategy、RichTextEditor、CommentExtension、字体/背景色规则或 annotation。

独立、非生产 fixture 位于 `tests/fixtures/topic-html-migration-scope.fixture.ts`；它们未连接任何 Topic ID、API 或迁移命令。

## 2. 验证方法

每个 fixture 都使用当前生产 `createEditorExtensions('fixture')` 走同一离线管线：

```text
legacy HTML
  -> Tiptap parse (generateJSON)
  -> serialize (generateHTML，模拟保存值)
  -> reload parse
  -> reload serialize
```

检查项：

- 预期可见信号是否仍存在；
- 第一次序列化与 reload 后 HTML 是否稳定；
- 当前 schema 是否能表达其 JSON 内容，作为可编辑性准入证据；
- 模拟保存值是否能稳定刷新恢复。

这不是数据库写入或真实页面保存验收；真实单条 pilot 仍须按 D10-H2 创建 backup、人工视觉检查和 rollback record。

## 3. 独立 Fixture

|Fixture|内容|独立性|
|-|-|-|
|THTML-04|嵌套无序列表 + 有序列表|独立 legacy HTML，不引用 Topic|
|THTML-05|两行两列表格（含表头）|独立 legacy HTML，不引用 Topic|
|THTML-07|空字符串|独立 legacy HTML，不引用 Topic|

## 4. 兼容矩阵

|类型|视觉信号|结构|可编辑|模拟保存|模拟刷新|结论|
|-|-|-|-|-|-|-|
|THTML-04 列表|通过：全部列表文本、`ul`、`ol` 保留|通过且稳定；`li` 被规范化为包含 `p`|通过：当前 StarterKit 可表达嵌套列表|通过|通过|**Pilot Only**|
|THTML-05 表格|通过：表头、单元格、文本和数值保留|通过且稳定；新增 `colgroup`、最小宽度、`colspan`/`rowspan` 与单元格段落包装|通过：当前 Table extensions 可表达|通过|通过|**Pilot Only**|
|THTML-07 空 HTML|通过：无内容语义不变|通过且稳定；规范化为 `<p></p>`|通过：单一可编辑空段落|通过|通过|**Approve（仅进入单条受控 pilot）**|

### 4.1 THTML-04

列表序列化后的 canonical HTML 与 reload HTML 完全一致。嵌套层级、无序/有序语义和文本均保留。由于 `li` 的段落包装会改变历史 HTML 形状，且真实浏览器中仍需检查缩进、回车/退格、嵌套与 toolbar 行为，结论是 Pilot Only，而非直接扩大写入范围。

### 4.2 THTML-05

表格的行、列、表头、单元格和文本均保留，首次规范化后 reload 稳定。Tiptap 会增加 `colgroup`、最小宽度、单元格 span 属性与段落包装；这些是当前 schema 的预期 canonicalization，不是数据丢失。仍须在后续单条 fixture 上人工确认列宽、视觉布局、单元格编辑和保存后刷新，因此仅 Pilot Only。

### 4.3 THTML-07

空值稳定地规范化为 `<p></p>`，当前 schema 可编辑，保存与 reload 的模拟结果一致。该结论批准其**进入单条受控 pilot**；不表示可以批量将空 outline 写回历史 Topic。

## 5. 决策

|结果|类型|含义|
|-|-|-|
|Approve|THTML-07|可按 D10-H2 的单条流程选择专用 fixture 进行实际 pilot。|
|Pilot Only|THTML-04、THTML-05|可创建独立 fixture 并完成浏览器视觉/编辑/save/refresh/rollback 验收后，再判断单条真实写入。|
|Blocked|无新增类型|仅限本阶段候选；annotation、font/font-size/font-family、background-color、未知 HTML 仍维持原有 Blocked。|

所有 Approve/Pilot Only 都是 **single-topic admission**，不是 cohort 或批量授权。

## 6. 后续单条 Pilot 的最低准入

对于 THTML-04、THTML-05、THTML-07，进入真实页面写入前仍必须：

1. 使用专用 fixture Topic，不使用业务记录；
2. 创建 original outline、SHA-256、candidate HTML、operator 与 rollback record；
3. 在 legacy 与 runtime renderer 做人工视觉对照；
4. 走 TopicDetail manual aggregate save，并验证刷新与 dirty leave；
5. 进行单条 content + renderer fallback rollback 演练；
6. 任一结构、视觉或编辑异常即 No-Go，不扩大范围。

## 7. 验证结果

通过：

- `npx tsx scripts/topic-html-migration-scope-assessment.ts`
- `npm run check`

新增 assessment 输出确认三条 fixture 的 visual signals、结构稳定性、schema 可表达性和模拟保存/刷新稳定性均为 `true`。

## 8. 明确未做事项

- 未创建真实业务 Topic fixture；
- 未向任何 Topic 写入 HTML；
- 未执行浏览器级列表或表格编辑；
- 未执行批量迁移；
- 未放宽 annotation、字体、背景色或未知 HTML 的阻断规则。
