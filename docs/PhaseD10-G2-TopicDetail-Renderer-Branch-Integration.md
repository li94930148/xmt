# Phase D10-G2 TopicDetail Renderer Branch Integration

## 1. 修改文件

- `src/pages/TopicDetail.tsx`
  - 页面加载 Topic 后一次性解析并捕获 editor branch；root 增加仅供验收的 `data-topic-editor-mode`。
  - runtime branch 保持原 `ContentEditor mode="rich"`、TopicDetail manual adapter、runtime handle 与 manualSave 链路。
  - legacy branch 仅渲染既有 `ContentEditor mode="legacy"`（其内部是既有 `RichTextEditor`），不传 adapter、不注册 runtime handle。
  - 两条分支继续使用同一 aggregate draft、baseline、revision、save gate、leave guard 和六字段 `updateTopic` payload；legacy 直接调用页面 aggregate save，runtime 仍经 manual handle 进入同一 aggregate save command。
- `src/pages/topicDetailEditorBranch.ts`：新增无 React/业务 I/O 的纯 branch selector。
- `src/pages/topicDetailEditorBranch.test.ts`：新增 branch selector 测试。

## 2. 渲染与生命周期

`TopicDetail` 在 fetch 到当前 Topic 后用空的 `DEFAULT_TOPIC_EDITOR_MODE_POLICY` 解析 mode 并存入页面 state。默认值和现有空 policy 都是 `runtime`；该 state 在页面生命周期内不重新按 policy 计算。dirty 编辑期间仅派生 readonly，不能热卸载一种编辑器再挂载另一种。

每次 render 使用互斥 ternary，只挂载一个 `ContentEditor`：

```text
runtime -> ContentEditor rich + manual adapter + runtime handle
legacy  -> ContentEditor legacy + page-owned aggregate save
```

legacy branch 不创建 Runtime 组件实例、不会收到 `onRuntimeHandleChange`，也不会调用 `manualSave`。两种分支都复用既有 `canEditTopic`，因此不改变 readonly 或权限判断。

## 3. 保存边界

保存 owner 始终是 `TopicDetail`：

- runtime：`manualSave -> adapter.persist -> aggregate save command -> TopicDetailAggregateSaveGate -> updateTopic`；
- legacy：`handleSave / leave guard -> aggregate save command -> TopicDetailAggregateSaveGate -> updateTopic`。

两条路径使用同一保存 snapshot 和 `aggregateRevision`，只有当前 revision 的响应才会更新 baseline、清除 dirty 并关闭编辑状态。没有新增 API、autosave、Yjs、Socket.IO、版本或权限逻辑。

## 4. 验证结果

静态测试：

```text
npx tsx src/editor/topic/topicEditorModePolicy.test.ts
npx tsx src/pages/topicDetailEditorBranch.test.ts
npm run check
```

均通过。测试覆盖默认 runtime、mock legacy Topic、两模式 readonly 一致、页面捕获的 branch 不会因后续 policy 解析结果而被热切换，以及两模式均由 page aggregate 保存 owner 负责。

浏览器验收仅使用现有测试 fixture Topic 112，未配置任何真实 `legacyTopicIds`，未输入或迁移 `outline`：

- 初始页面 `data-topic-editor-mode=runtime`、dirty 为 false；
- 点击“编辑选题”后 runtime handle 为 ready；DOM 中只有一个 `.ProseMirror[contenteditable=true]`，没有 legacy-only contenteditable editor；
- 未改变内容的标准保存成功，页面仍解析为 runtime；
- 刷新后保持 `/topics/112`、mode 为 runtime、dirty 为 false。

因此真实浏览器只验证了默认 runtime 分支。legacy renderer 只能在未来受控 scope 配置任务中用专门 fixture 启用；本阶段的 mock branch 测试已确认它不连接 Runtime handle 且保留 page aggregate save owner。

## 5. 范围与回滚

没有添加真实 legacy Topic ID、没有修改任何真实 `outline`、没有执行 HTML 迁移，也没有修改 RichTextEditor、CommentExtension、Runtime、SaveStrategy、Production 或 Shooting。

回滚本阶段代码只需移除 TopicDetail 的 branch selector 引用和新增 selector 文件；由于默认 policy 为空，发布前后没有任何 Topic 被实际切换到 legacy。D10-F 真实试点仍被 D10-G 的备份、HTML 准入、scope 配置、浏览器验收与业务授权条件阻断。
