# Phase D10-H2 First Topic HTML Migration Pilot

## 1. 试点范围与结论

本次只迁移 H1 创建的专用 fixture **Topic 115**（`[D10-H1 TEST] Topic Legacy Renderer`）。它不是既有业务 Topic，且仅包含普通文本，归类为 **THTML-01**。未批量迁移、未修改其他 Topic、未变更 Runtime、SaveStrategy、CommentExtension、Production 或 Shooting。

试点通过。最终 Topic 115 处于默认 **runtime** renderer，运行时编辑器结构为单一 `<p>` 段落；单条内容回滚演练与再次迁移均已完成。

## 2. Migration Record 与备份

迁移前先创建本地受控记录：`tests/fixtures/topic-html-migration-pilot.local.json`。

|字段|值|
|-|-|
|topicId|115|
|operator|`local-browser-test-account`（未记录凭据）|
|HTML 类型|THTML-01 / 普通文本|
|原始 outline|`D10-H1 Legacy Renderer Fixture Content`|
|原始 outline SHA-256|`3129429aa383cb6a70a8e31ae9564628142f1b14eacdeeea66916a3dd9d12b56`|
|候选 runtime HTML|`<p>D10-H1 Legacy Renderer Fixture Content</p>`|
|候选 SHA-256|`550e02443f96fd2463fc1c8c4166d5cd4c13450c4abde335f5e853f10fcd930d`|
|回滚内容|与原始 outline 相同，hash 已记录|

记录创建于任何页面写入之前。内容备份仅用于此本地 fixture 回滚，不涉及数据库 schema 或批量工具。

## 3. Admission 检查

|检查|结果|
|-|-|
|类别白名单|通过：THTML-01|
|annotation / comment 属性|未命中|
|`font` / `font-size` / `font-family`|未命中|
|`background-color`|未命中|
|未知或异常 HTML|未命中|
|离线 parse -> serialize -> reload|通过|
|候选生成|普通文本规范化为单一 `<p>`|

执行 `npx tsx scripts/topic-html-compatibility-admission.ts`，THTML-01 的文本与结构信号均保留。另以当前 extension factory 对本试点原始值运行 server-side parse/serialize，候选值精确为记录中的 `<p>…</p>`。

## 4. 页面迁移流程

1. 启动一个独立本地开发服务，**不设置** `VITE_TOPIC_LEGACY_FIXTURE_IDS`；Topic 115 因而按默认 policy 解析为 `runtime`。
2. 打开 TopicDetail，确认：mode 为 `runtime`、manual Runtime handle 为 `ready`、Tiptap editor 数量为 1、legacy editor 数量为 0。
3. 在 `ContentEditor` 中输入候选的相同文本，确认编辑器 DOM 为 `<p>D10-H1 Legacy Renderer Fixture Content</p>`。
4. 点击现有“保存”，走既有链路：

   ```text
   ContentEditor Runtime manualSave
     -> TopicDetail aggregate save command
     -> TopicDetailAggregateSaveGate
     -> updateTopic（既有六字段 payload）
   ```

5. 保存后 dirty 为 `false`；刷新并重新进入编辑，仍为 runtime、handle 为 `ready`，且单一 `<p>` 结构与文本一致。

没有新 API、直接 SQL、脚本直写或特殊迁移 endpoint。

## 5. 浏览器验收

|项目|结果|
|-|-|
|打开与 renderer 分支|通过：Topic 115 默认 runtime|
|视觉 / 文本|通过：普通文本显示与原 fixture 相同|
|结构|通过：1 个 `.ProseMirror`，HTML 为单一 `<p>`|
|编辑|通过：可编辑，无 legacy editor 双挂载|
|保存|通过：aggregate dirty 清除|
|刷新恢复|通过：文本与 runtime branch 保持|
|clean leave|通过：直接导航到 `/topics`|
|dirty leave|通过：保持 `/topics/115`，显示“继续编辑”与“放弃离开”|
|discard|通过：未保存标记未持久化，重开后仍为确认版本|

视觉、结构、编辑检查由本地浏览器测试会话完成；本次是隔离 fixture 试点，未把该检查替代为业务生产内容的人为验收签字。

## 6. Rollback 演练

1. 仅在独立本地开发进程设置 `VITE_TOPIC_LEGACY_FIXTURE_IDS=115`。
2. Topic 115 正确解析为 `legacy`。
3. 通过 Legacy renderer 的现有页面保存，将备份 outline 恢复为记录值；刷新确认文本与 hash 对应的原值一致。
4. 关闭 legacy scope，重新启动默认 runtime 本地服务。
5. 再次使用标准 TopicDetail manual save 写入候选内容；刷新确认最终回到 runtime，单一 `<p>` 结构保持。

因此，内容回滚与 renderer fallback 都仅作用于单条 fixture，且无需修改数据库、Runtime 或全局 policy。

## 7. 当前状态与回滚指令

- 当前数据状态：Topic 115 保留为 runtime 试点状态，显示文本与原值相同，runtime canonical DOM 为 `<p>…</p>`。
- 当前配置状态：没有运行中的 scoped legacy 开发服务；生产 policy 仍为空名单 runtime。
- 如需内容回滚：仅对 Topic 115 使用既有 TopicDetail 页面保存记录中的 `originalOutline`。
- 如需 renderer 回滚：仅在本地开发进程临时设置 `VITE_TOPIC_LEGACY_FIXTURE_IDS=115`；生产不得设置该变量。
- Fixture 删除：验收完成后，通过正常 Topic 管理流程删除 Topic 115；不得影响其他 Topic。

## 8. 验证命令

通过：

- `npx tsx scripts/topic-html-compatibility-admission.ts`
- `npx tsx src/editor/topic/topicEditorModePolicy.test.ts`
- `npx tsx src/pages/topicDetailEditorBranch.test.ts`
- `npm run check`
- `git diff --check`

## 9. 后续边界

此结果仅证明 THTML-01 在单条专用 fixture 上可执行。它不构成 THTML-04/05 的自动批准，也不解除 annotation、字体、背景色、异常 HTML 的阻断，更不授权批量迁移或删除 RichTextEditor。
