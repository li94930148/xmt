# Editor Long Text Wrap Fix

## 1. 问题

无空格的超长文本会按不可断开的最小内容宽度参与 flex 布局计算，可能把编辑区横向撑开，并挤压 Production 页面右侧的版本历史面板。

受影响的编辑面为共享 `ContentEditor -> Editor -> .editor-content/.ProseMirror` 渲染路径：Production、Shooting 和 Topic Runtime editor。

## 2. 修复

修改共享样式文件 `src/index.css`，为 `.editor-content` 及其 `.ProseMirror` 编辑根节点统一增加：

```css
min-width: 0;
max-width: 100%;
overflow-wrap: anywhere;
word-break: break-word;
```

这四项共同确保：

- flex child 可以小于其无空格内容的固有宽度；
- 编辑根节点不会超过父容器宽度；
- URL、连续英文、测试 ID 和连续字符可在任意安全断点换行；
- 不涉及 Runtime、Autosave、Yjs、Socket.IO、Adapter 或保存逻辑。

## 3. 统一覆盖范围

| 页面 | 编辑路径 | 验证结果 |
| --- | --- | --- |
| Production 85 | Runtime `ContentEditor` / Tiptap | 通过：现有超长连续 `x` 内容下 editor `scrollWidth=clientWidth=657`，版本历史仍可见 |
| Shooting 35 | Runtime `ContentEditor` / Tiptap | 通过：editor `scrollWidth=clientWidth=1000` |
| Topic 99 | Runtime `ContentEditor` / Tiptap manual strategy | 通过：editor `scrollWidth=clientWidth=956`；取消测试内容，未写入 Topic |

三处页面均读取到共享约束的计算结果：`min-width: 0px`、`max-width: 100%`、`word-break: break-word`。浏览器对 `word-break: break-word` 的计算值会将 `overflow-wrap:anywhere` 显示为等价的断词行为；源码仍显式声明 `overflow-wrap:anywhere`。

## 4. 内容验证

在 Topic Runtime 编辑器中以正常粘贴流程注入以下五类内容，并在不保存的情况下测量容器：

| 内容 | 结果 |
| --- | --- |
| 普通中文 | 正常显示与换行 |
| 无空格超长英文 | 换行，未产生横向溢出 |
| 连续 `x` 字符（2400 个） | 换行，未产生横向溢出 |
| 长 URL | 换行，未产生横向溢出 |
| 大段文本粘贴（20 段） | 正常渲染，未产生横向溢出 |

测试后点击“取消”，确认测试 token 未保存在 Topic 99 中。

## 5. 验证

- `npm run check`：通过。
- 浏览器页面测量：三处 Runtime 编辑器均满足 `scrollWidth <= clientWidth`。
- 未修改业务数据、保存请求数量、协作连接、版本面板逻辑或 Runtime Contract。

## 6. 风险与回滚

风险仅限显示层：超长不可断开文本会在更早位置换行。代码块的既有 `overflow-x: auto` 行为未改动。

回滚仅需移除 `src/index.css` 中共享 `.editor-content` / `.ProseMirror` 的四条断行与尺寸约束；不需要数据迁移或后端回滚。
