# Phase D10-E Topic HTML Compatibility & Migration Admission

## 1. 结论

**不批准对现有 Topic `outline` 执行全量 Rich/Tiptap 迁移。**

TopicDetail 的 aggregate draft、manual save、revision 保护和 dirty leave guard 已就绪，但保存边界不等于历史 HTML 保真。离线验证证明旧字体格式、背景色和 legacy 批注会丢失或降级；其中批注是硬阻断项。

未来仅可考虑受控试点：记录必须通过 fixture 的语义保真检查，且不含 legacy annotation、`font`、font-size、font-family 或 background-color 依赖。不得批量写回历史数据。

## 2. Fixture 与验证管线

新增的非生产文件：

- `tests/fixtures/topic-html-compatibility.fixture.ts`
- `scripts/topic-html-compatibility-admission.ts`

脚本使用当前生产扩展工厂 `createEditorExtensions()`：

```text
legacy HTML
  -> generateJSON (Tiptap parse)
  -> generateHTML (serialize)
  -> simulated saved HTML
  -> generateJSON (reload parse)
  -> generateHTML (reload serialize)
```

不会读取或写入 Topic 数据库记录，也没有修改页面、Runtime、Yjs、Socket.IO 或编辑器扩展。

运行命令：`npx tsx scripts/topic-html-compatibility-admission.ts`。

## 3. 兼容矩阵

“可逆”指保存并 reload 后能稳定继续编辑的 HTML 语义，不是字节级 HTML 相同。

“视觉”来自 serialize/reload 后可见结构与样式信号的静态判定，不是截图像素比对；任何后续试点仍必须做人工作为最终视觉验收。

| Fixture | 视觉 | 结构 | 可编辑 | 可逆 | 结果 |
|---|---|---|---|---|---|
| THTML-01 普通文本 | 是 | 是 | 是 | 是 | 通过 |
| THTML-02 `font` / `span` | 否：color、font-size、font-family 丢失 | 否：reload 后 span 合并 | 是 | 否 | 阻断样式依赖内容 |
| THTML-03 颜色样式 | 部分：文字 color 保留，background-color 丢失 | 部分 | 是 | 否 | 阻断高亮/背景色依赖内容 |
| THTML-04 列表 | 是 | 是；规范化 `li` 内段落 | 是 | 是（语义） | 通过 |
| THTML-05 表格 | 是 | 是；自动增加 colgroup、宽度、span 属性 | 是 | 是（语义） | 通过 |
| THTML-06 legacy 批注 | 否：批注提示消失 | 否：annotation 属性被移除 | 正文可编辑 | 否 | **硬阻断** |
| THTML-07 空 HTML | 是 | 是：归一为 `<p></p>` | 是 | 是 | 通过 |
| THTML-08 异常 HTML | 文本保留；未知/脚本不保留 | 部分：补全标签并丢弃危险/未知标签 | 是 | 否（原始输入） | 需 sanitize 准入 |

THTML-08 额外验证：serialize 与 reload HTML 中均不含 `<script>`。

## 4. Legacy Comment 与 CommentExtension

Legacy `RichTextEditor` 写入：

```html
<span class="annotation-text" data-annotation-id="legacy-comment-1"
  data-comment="历史批注">带批注文本</span>
```

当前 `CommentExtension` 只解析：

```html
<span data-comment-id="comment-1" data-comment-text="批注内容"
  data-created-at="...">带批注文本</span>
```

所以 THTML-06 的正文保留，但 `annotation-text`、`data-annotation-id`、`data-comment` 都不会进入 CommentExtension，serialize 后成为普通文本。

未来批注 mapping 必须另开任务，并满足：

1. parse 前 normalizer 明确映射 `data-annotation-id -> data-comment-id`、`data-comment -> data-comment-text`、`annotation-text -> comment-mark`；
2. 缺失的 `data-created-at` 不得伪造历史时间，必须定义 null/provenance 表达或提供已知来源；
3. mapping fixture 必须验证 id、文本范围、comment text、编辑/删除命令和 reload；
4. 无法映射的 annotation 保留原 HTML 并排除试点，禁止静默删除元数据。

## 5. 迁移准入规则

可作为后续人工确认试点候选：THTML-01、THTML-04、THTML-05、THTML-07。每条记录都需预先备份原 `outline`、离线运行管线、人工确认视觉结果，并支持单条回滚。

当前必须排除：所有 legacy annotation、`font`/字体尺寸/字体家族/背景色依赖、未通过明确 sanitize 规则的异常 HTML，以及无法人工确认视觉等价的内容。

## 6. 测试结果

已通过：

- `npx tsx scripts/topic-html-compatibility-admission.ts`
- `npm run check`
- `git diff --check`

脚本确认 THTML-01、04、05、07 的语义 round-trip 稳定；THTML-02、03、06 会报告缺失信号，未被误判为通过。

## 7. 回滚与后续

本阶段只新增 fixture、离线验证脚本和本报告，没有业务数据或页面行为变更，无运行时回滚需求。

后续试点的回滚单位必须是一条 Topic：恢复已备份的原始 `outline`，而不是全局转换。批注 mapping 与样式保真问题解决前，继续禁止全量迁移。
