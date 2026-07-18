# Phase D10-G1 Topic Editor Mode Policy Foundation

## 1. 修改文件

- `src/editor/topic/topicEditorModePolicy.ts`：新增无业务依赖的 Topic 编辑器模式 policy、默认空策略和 resolver。
- `src/editor/topic/topicEditorModePolicy.test.ts`：新增纯策略测试。

## 2. 策略 Contract

`TopicEditorMode` 只包含 `runtime | legacy`。`TopicEditorModePolicy` 固定 `defaultMode: 'runtime'`，可选 `legacyTopicIds` 与命名 `cohorts`；cohort 仍只是显式 Topic ID 列表，不按角色、状态、URL 或远端数据动态推导。

`DEFAULT_TOPIC_EDITOR_MODE_POLICY` 是空名单，不包含真实 Topic ID。`resolveTopicEditorMode()` 只有在 Topic ID 和整个 policy 都通过校验且命中显式 scope 时才返回 `legacy`；无 policy、无效 ID、重复 ID、错误 defaultMode 或异常 cohort 均 fail-safe 返回 `runtime`。

## 3. 兼容性与范围

本阶段没有接入 `TopicDetail`，没有启用任何 fallback，也没有新增真实 `legacyTopicIds`。没有修改 ContentEditor、Runtime、SaveStrategy、RichTextEditor、CommentExtension、Production、Shooting、API、数据库或 `outline` 数据。因此现有页面渲染和保存行为不变。

## 4. 测试

执行：

```text
npx tsx src/editor/topic/topicEditorModePolicy.test.ts
npm run check
```

覆盖 empty policy、显式 Topic 命中、cohort 命中、重复 ID、无效 ID 和 undefined/异常 policy。

## 5. 后续边界

下一步只能是独立的 G2 页面渲染分支实施：它必须先通过本 policy 的默认 runtime 与 scope 隔离测试，且不得热切换 dirty draft。真实 fallback 与 D10-F 单条试点仍需单独授权。
