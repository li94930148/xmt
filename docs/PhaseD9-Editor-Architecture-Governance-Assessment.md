# Phase D9 Editor Architecture Governance Assessment

## 1. 当前编辑器架构

XMT 现有编辑体系可分为三类，不应将它们视为同一迁移对象：

|层级|实现|定位|当前边界|
|-|-|-|-|
|统一富文本入口|`src/components/ContentEditor.tsx`|页面级入口与模式路由|rich 模式下组合 Runtime、Tiptap Editor、协同生命周期；legacy 模式转交 RichTextEditor|
|富文本 Runtime|`src/editor/runtime/*` + `src/editor/contracts/*`|保存协调、revision、graceful dispose、handle bridge|不依赖 Production/Shooting/Yjs/Socket.IO；Production/Shooting 通过 Adapter 接入|
|富文本实现|`src/components/editor/Editor.tsx`|Tiptap、工具栏、扩展、Yjs provider props|继续拥有 Tiptap 与协同初始化，不承载业务保存与版本决策|
|legacy 富文本|`src/components/RichTextEditor.tsx`|历史 HTML / contentEditable 兼容|仅用于 `ContentEditor mode="legacy"`；无 Runtime、Yjs 或 autosave|
|结构化文本表单|日报、复盘组件的 `textarea`|Markdown/plain-text 业务表单|不是富文本编辑器，保持各自领域保存与权限边界|

`syncToDatabase` 与 `cancelDatabaseSync` 已删除。Production 与 Shooting 的业务保存由 Runtime AutosaveCoordinator 经 Adapter 的 `persist()` 完成；Yjs 仍仅由 `Editor.tsx` 与 `useCollaborativeDocument.ts` 所在协同边界使用。

## 2. 页面覆盖情况

### 2.1 富文本页面能力矩阵

|页面/字段|编辑器类型|保存方式|Autosave|协同|版本|Graceful dispose|权限|
|-|-|-|-|-|-|-|-|
|AddTopic / `outline`|ContentEditor legacy → RichTextEditor|`createTopic()` 提交或保存草稿|否|否|否|否|页面表单/创建权限|
|TopicDetail / `outline`|ContentEditor rich → Tiptap|页面“保存” → `updateTopic()`|否|否|否|否|`canEditTopic` 控制编辑入口|
|ProductionDetail / `content`|ContentEditor rich + Production Adapter|Runtime → Adapter → 既有 `updateProduction(... version_action: 'none')`|是|是|Production 领域的 minor/major 与 history|是，受控导航|既有 `canEditProduction` 与历史版本只读|
|ShootingDetail / `script_content`|ContentEditor rich + Shooting Adapter|Runtime → Adapter → `updateShooting({ script_content })`|是|是|无独立版本系统|是，受控导航|既有页面/workflow 可编辑范围|
|PublishingDetail / `script_content`|ContentEditor rich → Tiptap|显式保存 → `updatePublishing()`|否|否|否|否|既有 editMode / 页面权限|

### 2.2 非富文本内容编辑

|页面|编辑器类型|保存方式|治理结论|
|-|-|-|-|
|DailyReportPage / DailyReportComposer|多个 textarea，Markdown/plain-text|显式保存草稿/提交|保留领域表单，不接 ContentEditor Runtime|
|RetrospectiveDetailPage / RetroSummaryEditor|textarea，Markdown/plain-text|显式保存结论|保留领域表单，不接 ContentEditor Runtime|
|复盘行动、资源等|input/textarea 或只读 HTML 预览|各自领域 API / 无编辑|不属于富文本统一化范围|

## 3. 入口盘点与技术债

### 3.1 静态入口统计

- ContentEditor 业务页面调用：5 处（AddTopic、TopicDetail、ProductionDetail、ShootingDetail、PublishingDetail）。
- RichTextEditor 业务直接调用：0 处；仅由 ContentEditor 的 `legacy` 分支调用。
- legacy 模式业务使用：1 处（AddTopic 的 `outline`）。
- 自定义 contentEditable 富文本：1 个实现（RichTextEditor）。
- Tiptap 实现：1 个实现（`components/editor/Editor.tsx`），由 ContentEditor rich 模式统一承载。

### 3.2 主要技术债与治理含义

1. **ContentEditor 的 fallback adapter 注释已过时。** fallback adapter 仍以 noop `persist()` 提供生命周期外壳；它适用于 TopicDetail/Publishing 的显式保存场景，但源码注释仍提及已删除的 `writeConsistency` database persistence。此项仅记录，不能在本阶段顺手修订。
2. **rich 模式不等于 Runtime autosave。** Production/Shooting 传入 Adapter，才会将 `onChange` 接到 Runtime `scheduleSave()`；TopicDetail 与 Publishing 不传 Adapter，仍必须由页面显式保存。这是当前有意保留的语义差异。
3. **legacy 是 HTML 兼容边界。** RichTextEditor 包含 HTML 归一化、批注、样式与 `contentEditable` 行为，不能以“只剩一个入口”为由直接删除。
4. **版本不能被抽象为保存。** Production 的 `version_action`、minor/major、history 和审批保持在 Production 领域服务；Shooting/Topic/Publishing 不得复用或模拟 Production history。
5. **Yjs 不属于 Runtime 清理对象。** `syncToYjs` 和 `defineWriteSource` 仍为活跃协同初始化/来源判定能力，Runtime 只通过通用 handle 和 best-effort participant 与页面协作。

## 4. RichTextEditor legacy 治理方案

|等级|对象|治理决定|条件与限制|
|-|-|-|-|
|A 保留|AddTopic `outline` 的 legacy 模式|短期保留|承载历史 HTML 兼容与既有创建表单；继续执行保存/刷新回归|
|B 迁移|未来新建的长篇 HTML 富文本页面|禁止新接 RichTextEditor；优先 ContentEditor rich + 明确 Adapter/显式保存策略|先定义内容格式、保存语义、协同需求和权限边界；不直接复制 Production 代码|
|B 迁移|TopicDetail、PublishingDetail|仅在独立任务中评估是否接 Adapter / graceful dispose|不能将手动保存直接改成 autosave；须先确认业务版本、草稿、失败 UX 与离开语义|
|C 删除|当前无对象|不执行|只有 AddTopic 完成内容格式迁移、历史 HTML 兼容/回退方案和浏览器回归后，才可重新评估 RichTextEditor 删除|

## 5. Runtime 未来扩展边界

### Topic

适合成为下一个**设计候选**，但不是直接实施候选。TopicDetail 当前为显式 `updateTopic()` 保存，AddTopic 为创建/草稿表单；二者需分别设计 Adapter 或保持 explicit-save bridge。前提是确认 `outline` 的 HTML 兼容、草稿创建、权限与未保存离开行为，且不引入 Production 版本规则。

### Publishing

适合在 Topic 方案稳定后评估。Publishing 当前 `script_content` 独立于 Production，并以显式 `updatePublishing()` 保存；如接 Runtime，Adapter 只能持有 Publishing 文档上下文与 `persist()`，不得引入 Production history、approval 或 workflow 语义。

### 其他内容模块

Daily Report、Retrospective 结论及行动项是结构化 Markdown/plain-text 表单。它们可以共享“受控离开/可靠保存”的通用理念，但不应因名称中包含“编辑”就接入 Tiptap、Yjs 或 ContentEditor Runtime。

## 6. 迁移优先级与后续路线图

|优先级|建议阶段|范围|准入条件|禁止事项|
|-|-|-|-|-|
|P0|观察期|Production/Shooting|持续观察 Runtime autosave、graceful dispose、协同与重复保存指标|不重构 Yjs、Socket.IO、writeConsistency|
|P1|Topic Runtime 接入设计|TopicDetail / AddTopic 分开建模|确认 HTML 兼容、创建草稿、手动保存与离开 UX|不复用 Production 版本/审批|
|P2|Topic 小范围实现|先选一个明确资源与一条保存路径|独立设计评审、测试 fixture、回滚方案|不迁移 AddTopic 与 TopicDetail 于同一提交|
|P3|Publishing 接入设计|Publishing `script_content`|明确其独立保存/发布边界|不写 Production、不建 history|
|P4|legacy 删除评估|RichTextEditor|仅在 AddTopic migration、历史内容验证、回滚方案完成后|不以零直接 import 为唯一删除依据|

## 7. 结论

ContentEditor 已是 Production/Shooting 的统一内容编辑基础设施，并为其他业务提供统一 rich/legacy 入口；但它尚不是“所有文本输入”的通用替代品。下一步应保持治理节奏：先以 Topic 的保存语义和 HTML 兼容为独立设计任务，再决定是否形成 Adapter，而不是开展全站编辑器重写。

本阶段仅进行静态评估并新增本报告；未修改任何业务代码、Runtime、Adapter、Autosave、Yjs、Socket.IO 或数据库。
