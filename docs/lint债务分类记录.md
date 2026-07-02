# lint 债务分类记录

## 当前结果

- 本轮执行 `npm run lint`：未通过。
- 当前总数：238 problems。
- 当前错误/警告：210 errors，28 warnings。
- 上一轮记录：248 problems。
- 是否减少：是，减少 10 个问题。

## 主要类型

- `@typescript-eslint/no-explicit-any`
  - 集中在 `api/routes/*`、`src/api/*`、hooks、timeline 等。
- `@typescript-eslint/no-unused-vars`
  - 集中在后端 catch 参数、页面未用 import、未使用状态变量。
- `no-empty`
  - 集中在数据库初始化、路由兼容空 catch、少量页面逻辑。
- `no-irregular-whitespace`
  - 集中在 `api/database/db.ts`、`api/routes/topics.ts`、`api/routes/workflow.ts`。
- React Hooks warnings
  - 多个页面缺少 effect/callback 依赖。
- 其他
  - `src/utils/markdown.ts` 的 `no-useless-escape`。
  - `react-refresh/only-export-components`。

## 本轮处理原则

- 只修和编辑器主题、历史 HTML、中文乱码、明显编辑器无用变量相关的小范围问题。
- 不做全仓 lint 大清理。
- 不修改后端接口、数据库、日报或复盘业务。

## 本轮已减少的代表项

- `RichTextEditor` 中本轮触碰区域的无用变量和 catch 参数。
- `Toolbar`、`BubbleMenu`、`ContextMenu` 中明显无行为影响的编辑器 lint。
- `WorkflowDesigner` 中真实乱码文案。

## 不全量修复原因

- 范围太大，涉及后端、多个页面、hooks、API 类型定义。
- 一次性替换 `any` 或 hook 依赖容易引入回归。
- 应拆成独立 5 小时任务，并配合回归测试和 CI。

## 后续建议

1. 先修 irregular whitespace 和明显未使用变量。
2. 再收口后端 `any`，优先从 route request/response 类型开始。
3. 然后修 React Hook 依赖，逐页验证行为。
4. 最后接入 CI，把 `check`、`build`、lint 分阶段变为必过。
