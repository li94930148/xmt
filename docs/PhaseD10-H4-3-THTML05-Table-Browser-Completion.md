# Phase D10-H4.3 THTML-05 Table Browser Completion

## 1. 范围与环境

- 测试对象：Topic `119`（`[D10-H4 TEST] THTML-05 Table`）。
- 页面：`/topics/119`。
- 本阶段仅完成已有表格试点的离开保护与回滚浏览器证据；未修改编辑器 schema、Runtime、SaveStrategy、Topic 保存逻辑或任何真实业务 Topic。

## 2. 已有表格状态复核

进入详情时可见 runtime 渲染的表格预览。复核结果为：

- 表格数：`1`；
- 行数：`2`；
- 单元格（`th`/`td`）数：`4`；
- DOM 保留 `colgroup` 与列宽 canonicalization 结果；
- 已保存的单元格编辑文本仍存在。

这与前序已通过的 runtime renderer、单编辑器、表格结构、列宽 canonicalization、单元格编辑及保存刷新结果一致。

## 3. Leave Guard 验证

| 场景 | 操作与证据 | 结果 |
| --- | --- | --- |
| clean leave | 未编辑时点击“返回列表” | 一次跳转至 `/topics` |
| dirty leave | 编辑唯一脏数据标记后点击“返回列表” | URL 保持 `/topics/119`，页面保留编辑器，并显示“继续编辑”与“放弃离开” |
| discard | 点击“放弃离开”后重新进入 Topic 119 | 一次离开；脏数据标记不存在；原表格仍为 `table=1`、`tr=2`、`th/td=4` |

上述流程证明 Topic 的 aggregate dirty leave guard 在 runtime 表格 renderer 下仍以页面 draft 状态为唯一离开依据；discard 没有触发保存。

## 4. Rollback

使用正常编辑和页面“保存”将 Topic 119 恢复为 manifest 原始空 outline 的语义表示：`<p></p>`。

刷新后确认：

- 预览 HTML 为 `<p></p>`；
- 预览文本为空；
- `table=0`。

未直接修改数据库、未改动其他 fixture，也没有迁移真实业务 Topic。

## 5. 结论

THTML-05 的浏览器补充验证完成：clean leave、dirty leave、discard 和 rollback 均通过。结合已有表格结构、列宽、单元格编辑、保存与刷新证据，THTML-05 维持既定 **Pilot Only** 结论；本阶段不扩大迁移范围。
