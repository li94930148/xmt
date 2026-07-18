# Phase D10-H1 Topic Legacy Renderer Test Fixture

## 1. 范围与安全边界

本阶段只创建可识别、可回滚的 Topic renderer fixture，并验证 `policy -> TopicDetail -> renderer` 分支。没有迁移任何既有 Topic 的 `outline`，没有修改 Production、Shooting、Runtime、SaveStrategy、CommentExtension 或生产 fallback 配置。

测试 scope 仅由本地开发进程的 `VITE_TOPIC_LEGACY_FIXTURE_IDS` 提供；生产构建和未设置该变量的开发进程始终使用空的 runtime policy。验收后该进程已关闭。

## 2. Fixture

|角色|Topic ID|标题|初始内容|预期模式|
|-|-|-|-|-|
|Legacy fixture|115|`[D10-H1 TEST] Topic Legacy Renderer`|`D10-H1 Legacy Renderer Fixture Content`|legacy|
|Runtime control fixture|116|`[D10-H1 TEST] Topic Runtime Renderer`|`D10-H1 Runtime Renderer Fixture Content`|runtime|

两条记录均通过现有“新增选题 -> 保存草稿”业务流程创建，未直接写 SQLite。对应本地 manifest 为 `tests/fixtures/topic-legacy-renderer.manifest.local.json`；它是本阶段的本地验收工件，应与代码分开管理，且不应进入生产部署配置。

## 3. Scoped policy

新增 `resolveTopicEditorModeFixturePolicy()` 与 `getCurrentTopicEditorModePolicy()`：

- 仅 `import.meta.env.DEV === true` 时读取 `VITE_TOPIC_LEGACY_FIXTURE_IDS`；
- 值必须是逗号分隔、正整数、无重复的显式 Topic ID；
- 缺失、生产环境、空值或无效值均返回 `DEFAULT_TOPIC_EDITOR_MODE_POLICY`；
- TopicDetail 在进入页面时读取一次 policy 并冻结 renderer branch，因此 dirty 编辑期间不会热切换。

浏览器验收使用独立本地 Vite 进程，只设置 `VITE_TOPIC_LEGACY_FIXTURE_IDS=115`。因此 115 命中 legacy，而 116 在同一会话中仍证明默认 runtime 行为。

## 4. 验收结果

|验证项|Legacy 115|Runtime 116|
|-|-|-|
|resolver / branch|`legacy`|`runtime`|
|编辑器实例|1 个 `.rich-text-editor`，0 个 Tiptap|1 个 `.ProseMirror`，0 个 legacy|
|Runtime handle|`unavailable`|`ready`（manualSave 可用）|
|页面 aggregate 保存|通过|通过|
|刷新恢复|通过|通过|
|clean leave|直接返回 `/topics`|直接返回 `/topics`|
|dirty leave|停留原页并显示继续编辑入口|停留原页并显示继续编辑入口|

保存验证期间曾使用临时测试标记；结束前均通过各自 editor 的正常保存恢复为表中初始内容，并刷新确认。Legacy fixture 的内容是合法的纯文本 HTML fragment；本阶段不涉及受阻的 font、annotation、背景色或 CommentExtension 转换。

## 5. 自动化验证

通过：

- `npx tsx src/editor/topic/topicEditorModePolicy.test.ts`
- `npx tsx src/pages/topicDetailEditorBranch.test.ts`
- `npm run check`

policy 测试补充覆盖了 development fixture ID 命中、生产环境忽略、重复 ID 与无效 ID fail-safe。浏览器测试未记录账号凭据、Cookie、Authorization 或请求正文。

## 6. 修改文件

- `src/editor/topic/topicEditorModePolicy.ts`：受控、默认关闭的开发 fixture policy resolver。
- `src/editor/topic/topicEditorModePolicy.test.ts`：fixture policy 的成功和 fail-safe 覆盖。
- `src/pages/TopicDetail.tsx`：在页面入口冻结当前环境 policy，再用于既有 branch resolver。
- `tests/fixtures/topic-legacy-renderer.manifest.local.json`：本地 fixture ID 和回滚信息（忽略文件）。

## 7. 回滚与清理

1. 立即禁用 legacy scope：不设置 `VITE_TOPIC_LEGACY_FIXTURE_IDS` 并重启本地开发服务；当前已处于该状态。
2. 删除 fixture：通过正常 Topic 管理流程删除 **仅** Topic 115 与 116。
3. 如不再需要 browser fixture 能力，可在独立清理任务中移除环境 resolver 与其测试；不要删除 `TopicDetail` 的 renderer branch 或变更生产 policy。

## 8. 结论

Phase D10-H1 通过。已获得同一 scoped 本地会话中 Legacy 与 Runtime 两条 renderer 链路的真实浏览器证据，且默认行为、保存边界和离开保护均保持不变。没有进入真实 Topic HTML 迁移。
