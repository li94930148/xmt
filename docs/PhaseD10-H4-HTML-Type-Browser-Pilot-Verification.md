# Phase D10-H4 HTML Type Browser Pilot Verification

## 1. 执行范围

本阶段只创建并测试三条专用 Topic fixture；未迁移任何既有业务 Topic，未执行批量操作，也没有修改 Runtime、SaveStrategy、Production、Shooting、annotation、字体或背景色规则。

|类型|Topic ID|标题|原始 outline|原始 SHA-256|
|-|-|-|-|-|
|THTML-07|117|`[D10-H4 TEST] THTML-07 Empty HTML`|空字符串|`e3b0c442…b855`|
|THTML-04|118|`[D10-H4 TEST] THTML-04 Nested List`|空字符串|`e3b0c442…b855`|
|THTML-05|119|`[D10-H4 TEST] THTML-05 Table`|空字符串|`e3b0c442…b855`|

三条记录均通过既有“新增选题 -> 保存草稿”页面流程创建，没有直接写数据库。原始值、candidate 和回滚值记录在 `tests/fixtures/topic-html-browser-pilots.local.json`。

## 2. 已完成浏览器证据

### THTML-04 列表（Topic 118）

- renderer：runtime；仅 1 个 `.ProseMirror`，无 legacy editor。
- 通过正常浏览器 HTML 粘贴生成无序列表、两项列表和有序列表；页面进入 dirty。
- 保存成功后 dirty 清除；刷新后 `ul`、`ol` 和三个文本信号均存在。
- 嵌套列表/缩进、Enter、Backspace 的定点键盘操作**未通过浏览器自动化复核**：在指定 list item 上的键盘事件没有改变 DOM。此项不能视为已通过。
- 页面级 clean leave、dirty leave、discard 和 rollback 在浏览器会话失稳前未完成。

### THTML-05 表格（Topic 119）

- renderer：runtime；仅 1 个 `.ProseMirror`，无 legacy editor。
- 通过正常浏览器 HTML 粘贴插入 1 张表，包含 2 个表头、2 个单元格与 2 个 colgroup columns。
- 表格 canonical style 为 `min-width: 50px`；colgroup 的两个列均存在，证明当前 Table extension 的列宽规范化路径可用。
- 通过单元格点击和键入修改内容，保存、刷新后修改文本仍存在，且表格、表头、单元格和最小宽度均存在。
- 页面级 clean leave、dirty leave、discard 和 rollback 在浏览器会话失稳前未完成。

### THTML-07 空 HTML（Topic 117）

- renderer：runtime；单编辑器初始状态已确认。
- 已进入编辑并写入临时文本，准备验证“保存后清空 -> `<p></p>` -> 刷新”。
- 后续保存按钮自动化查询超时，未能完成 empty save、refresh、leave guard、discard 与 rollback 的浏览器验收。

## 3. 浏览器会话阻断

后半段浏览器自动化出现两类非业务代码错误：

1. 指定 contenteditable 节点在键盘事件前发生焦点/目标失配；
2. 保存或编辑按钮的浏览器查询在页面仍可见时超时。

为避免在无法可靠确认页面状态时继续写入 fixture，已停止操作。未修改应用代码来规避该测试环境问题。

## 4. 当前判定

|类型|浏览器试点状态|是否可扩大范围|
|-|-|-|
|THTML-07|Blocked：完整保存/刷新/离开/回滚未完成|否|
|THTML-04|Blocked：键盘嵌套、Enter、Backspace、离开与回滚未完成|否|
|THTML-05|Pilot evidence partial：结构、列宽、单元格保存刷新通过；离开与回滚未完成|否|

**D10-H4 不产生任何扩大迁移范围的授权。**

## 5. 必须先完成的恢复工作

后续继续 H4 前需要在稳定、可重新登录的浏览器会话中，逐条完成：

1. THTML-04：验证 Tab/Shift+Tab 嵌套与反嵌套、Enter 新项、Backspace 合并/删除；再验证保存、刷新、clean/dirty leave、discard、回滚。
2. THTML-05：补 clean/dirty leave、discard、回滚；确认回滚后的原始空 outline。
3. THTML-07：完成临时文本保存、清空保存、刷新 `<p></p>`、clean/dirty leave、discard、回滚。
4. 所有未完成 fixture 必须通过正常 TopicDetail 页面保存恢复到 manifest 记录的空原始 outline，刷新确认后才可关闭本阶段。

## 6. 不做事项

- 不将 Topic 117/118/119 视为真实业务数据；
- 不把当前结果用于 THTML-04/05/07 批量迁移；
- 不调整任何编辑器、Runtime、保存策略或 schema 来让测试通过；
- 不触及 annotation、font、font-size、font-family、background-color 或未知 HTML。
