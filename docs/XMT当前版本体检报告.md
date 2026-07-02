# XMT 当前版本体检报告

## 1. 当前最急需修复的问题

- 编辑器主题视觉不一致：主题切换直接覆盖 `document.documentElement.className`，可能误删 html 上已有 class；编辑器和富文本预览存在硬编码浅色面板、黑色/深灰正文，暗色模式下历史内容容易不可读。
- 旧版 `RichTextEditor` 仍保留默认黑色逻辑，历史 HTML 中的 `#000000`、`#333333`、`rgb(0, 0, 0)`、`rgb(51, 51, 51)` 会在暗色模式继续以黑字展示。
- Tiptap 历史版本/富文本预览依赖 `dangerouslySetInnerHTML`，如果历史内容带内联默认黑色，需要统一预览兼容层兜底。

## 2. 编辑器主题问题根因

- 主题状态入口分散在 `src/App.tsx` 和 `src/store/index.ts`，之前使用 `document.documentElement.className = theme` 覆盖整个 className。
- 编辑器正文、工具栏、下拉层和预览区混用了 Tailwind 灰阶、`bg-white`、硬编码黑色正文与局部 `prose-invert`，没有统一的编辑器语义 token。
- 历史富文本通过 `innerHTML` / `dangerouslySetInnerHTML` 渲染，内联样式优先级高，导致暗色模式下默认黑色无法自然继承主题文字色。

## 3. 日报系统当前完成程度

- 前端已有 `/daily-report` 路由和 `src/pages/DailyReportPage.tsx` 占位页。
- 首页、导航和报告中心已有日报入口或页签预留。
- `api/routes` 中未发现独立 daily report / 日报路由；本轮未新增接口、表结构或业务逻辑。

## 4. 数据复盘当前完成程度

- 已有 `api/routes/analytics.ts`，支持团队/月度/用户/单选题分析与分析数据创建。
- 已有 `api/routes/export.ts` 的 `/weekly-report`，前端 `WeeklyReport`、`Analytics`、`ExportPage` 已接入周报/导出能力。
- 已有协作复盘、内容生成、内容智能等偏过程复盘接口：`collaboration-dashboard`、`collaboration-ux`、`content-generation`、`content-intelligence`、`content-orchestrator`。
- 尚未形成完整“日报 + 数据复盘”闭环；本轮只体检，不扩展系统。

## 5. 本轮实际修改范围

- 修复主题切换逻辑：保留 html 其他 class，改用 `dataset.theme` 与 `classList.toggle('dark'/'light')`。
- 新增编辑器主题变量：`--editor-fg`、`--editor-muted`、`--editor-bg`、`--editor-panel`、`--editor-border`、`--editor-soft`、`--editor-hover`、`--editor-code-bg`。
- 修复旧版 `RichTextEditor` 默认黑色：默认色改为 `var(--editor-fg)`，并兼容清洗历史默认黑/深灰。
- 修复新版 Tiptap Editor 容器、正文、引用、表格、代码块的主题色来源。
- 为富文本预览区补充 `editor-content-preview`，覆盖历史 HTML 默认黑字在暗色模式不可读的问题。

## 6. 后续 5 小时任务建议

1. 先修复仓库中已有中文乱码/疑似编码损坏文本，尤其是编辑器提示、日报占位页、状态文案。
2. 用浏览器手动回归生产详情、发布详情、选题详情、新增选题预览、资源归档预览的亮/暗主题。
3. 梳理 Tiptap 工具栏、BubbleMenu、ContextMenu 的样式 token，进一步减少灰阶硬编码。
4. 为历史 HTML 兼容增加最小单测或组件渲染用例，覆盖默认黑色、强调色、表格、引用、代码块。
5. 下一轮再进入日报/复盘产品设计：先定义日报数据模型和权限流，再补接口和页面，不建议直接堆完整系统。
