# Phase D10-H4.2 THTML-04 List Browser Completion

## 1. 范围与环境

- 测试对象：Topic `118`（`[D10-H4 TEST] THTML-04 Nested List`）。
- 页面：`/topics/118`。
- 编辑模式：`runtime`；页面在编辑态仅存在一个 `.ProseMirror`，未挂载 legacy renderer。
- 方法：本地浏览器中的正常编辑、粘贴、保存、刷新、离开与放弃离开流程；未修改业务代码、编辑器 schema、Runtime 或保存逻辑。

## 2. 列表结构与保存刷新

以试点候选 HTML 写入编辑器后，Tiptap 保留了一个无序列表、一个有序列表及三个列表文本节点。点击页面“保存”后刷新：预览中仍有 `ul: 1`、`ol: 1`，且三个文本节点均存在。

另以嵌套无序列表进行编辑态验证：Tiptap DOM 中存在 `ul ul: 1`，嵌套子项可被解析和渲染。取消该未保存测试后，页面回到已持久化状态。

| 项目 | 结果 | 证据 |
| --- | --- | --- |
| runtime renderer | 通过 | `data-topic-editor-mode=runtime` |
| 单编辑器实例 | 通过 | 编辑态 `.ProseMirror=1` |
| 无序/有序列表结构保存 | 通过 | 保存、刷新后 `ul=1`、`ol=1` |
| 嵌套列表解析/编辑态渲染 | 通过 | 嵌套候选产生 `ul ul=1` |

## 3. 键盘行为

| 操作 | 实际结果 | 结论 |
| --- | --- | --- |
| Enter | 在列表内产生新的空列表项 | 通过 |
| Backspace | 在空列表项处执行列表提升/结构变换 | 通过 |
| Shift+Tab | 当前焦点列表被提升为普通段落 | 通过（outdent 行为） |
| Tab | 未观察到列表项缩进或形成嵌套列表 | 未通过 |

本轮通过真实浏览器的编辑器键盘事件验证，不以 DOM 直接写入替代键盘操作。`Tab` 在当前测试焦点下未改变列表结构，因此不能将“Tab 缩进”标记为已通过；这不是迁移放行结论，也未在本阶段修改 schema 或快捷键逻辑。

## 4. 离开与放弃离开

- **clean leave**：未修改时点击“返回列表”，一次跳转至 `/topics`。
- **dirty leave**：编辑唯一脏数据标记后点击“返回列表”，页面保持在 `/topics/118`，出现“继续编辑”和“放弃离开”入口。
- **discard**：点击“放弃离开”后跳转一次；重新进入 Topic 118，脏数据标记不存在，原已保存列表内容仍在。

## 5. Rollback

通过正常编辑和页面“保存”将 Topic 118 恢复为 manifest 的空 outline 语义：`<p></p>`。

刷新后确认：

- 预览 HTML：`<p></p>`；
- 预览文本为空；
- 不存在 `ul` 或 `ol`。

没有直接修改数据库，也没有改动其他 Topic fixture。

## 6. 结论

THTML-04 的 runtime renderer、单实例、列表结构保存/刷新、嵌套列表解析、Enter、Backspace、Shift+Tab、clean leave、dirty leave、discard 与 rollback 均获得浏览器证据。

由于 **Tab 缩进列表项未通过**，THTML-04 维持 **Pilot Only**，不得升级为 Approve 或扩大迁移范围。后续如需处理，应另开仅针对 Tiptap 列表 Tab 快捷键与焦点定位的诊断任务。
