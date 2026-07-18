# Phase D10-G Topic Scoped Legacy Fallback Preparation Design

## 1. 文档状态与执行边界

状态：Architecture Proposal / Admission Preparation。本文件定义单 Topic 或显式试点 cohort 的 legacy/runtime 编辑器选择与回滚准入，不创建开关、不切换任何真实 Topic，也不迁移或保存历史 `outline`。

本阶段禁止批量转换、修改历史 Topic 数据、删除 `RichTextEditor`、修改 `CommentExtension`、ContentEditor Runtime、SaveStrategy、Production、Shooting、数据库 schema、Yjs 或 Socket.IO。任何实际接入必须另开实施任务，并先通过第 9 节的准入条件。

## 2. 当前事实与目标

当前 `TopicDetail` 的大纲编辑分支固定为 `ContentEditor mode="rich"`：它使用 TopicDetail manual adapter、manualSave 和页面拥有的 aggregate save。`ContentEditor` 同时仍支持 `mode="legacy"`，内部渲染 `RichTextEditor`；`AddTopic` 已在创建链路使用该 legacy 模式。两者目前没有按 Topic 选择模式的策略层。

目标是为 D10-F 的单条 HTML 受控试点补齐**可验证的 renderer 回退能力**：

- 默认行为保持当前 runtime/rich TopicDetail；
- 只有被显式列入 scope 的 Topic 才可以解析为 legacy；
- legacy 不获得任何额外权限、保存接口、协作或版本能力；
- 页面始终只挂载一个编辑器，切换不在 dirty 编辑过程中热发生；
- 回滚先恢复已备份的原始 `outline`，再让该 Topic 解析到 legacy renderer。

这不是全局编辑器开关，也不是把用户角色、URL 参数或浏览器本地存储当作切换来源。

## 3. 模式与 scope Contract（未来实施）

建议只引入页面策略类型，而不改变 Runtime contract：

```ts
type TopicEditorMode = 'runtime' | 'legacy';

interface TopicEditorModePolicy {
  defaultMode: 'runtime';
  legacyTopicIds: readonly number[];
  cohorts?: Readonly<Record<string, readonly number[]>>;
  changeReference: string;
}

function resolveTopicEditorMode(
  topicId: number,
  policy: TopicEditorModePolicy,
): TopicEditorMode;
```

解析规则是确定性的：Topic ID 位于 `legacyTopicIds`，或位于 policy 中某个**显式 ID 列表**的 cohort 时，结果为 `legacy`；其余所有 ID 均为 `runtime`。cohort 只是受版本控制的 ID 集合的可读名称，不能根据状态、角色、路由、用户输入或数据库查询动态扩张。

`defaultMode: 'runtime'` 使未配置、配置读取失败、无效 ID、重复配置或不在范围内的 Topic 均保持现有行为。策略解析器不做权限判断，也不传递权限结果；`TopicDetail` 已有的 `canEditTopic` / readonly 规则继续是唯一权限来源。

策略来源建议为受版本控制且随前端发布的试点配置模块（默认空名单），并要求变更关联工单和明确责任人。它不是数据库字段、API 返回值或客户端可写配置。紧急回退通过受审计的配置变更和发布完成，而不是 console、query string、localStorage 或普通用户 UI。

## 4. TopicDetail 的未来渲染决策

未来页面只在取得 Topic ID、数据与既有权限结果后解析模式：

```text
TopicDetail
  -> resolveTopicEditorMode(topic.id, policy)
  -> runtime: ContentEditor rich + TopicDetail manual adapter
  -> legacy:  ContentEditor legacy + 既有 page-owned aggregate draft
```

两条分支共同使用同一份 `scriptContent`、baseline/draft、`aggregateRevision`、`TopicDetailAggregateSaveGate`、`handleSave`、cancel 和 Topic dirty leave guard。保存所有字段时仍走既有六字段 `updateTopic` payload；legacy 分支不得新建 API、绕开 aggregate save，runtime 分支也不得新增 autosave。

legacy 分支不传 Topic runtime adapter、不请求 runtime handle，也不接入 Runtime 的 manualSave。runtime 分支保持现状：`mode="rich"`、`collaborationEnabled={false}`、TopicDetail manual adapter 与 handle bridge。两者都由同一 `canEditTopic` 决定 read-only，均不引入 Yjs、Socket.IO、版本或审批语义。

一次 render 只挂载一个编辑器。mode 改变只能发生于重新加载页面或导航后再次进入；不得在同一个 dirty draft 上卸载一种编辑器并热挂另一种编辑器，以避免未提交内容、selection 和 HTML 解析结果不确定。

## 5. 受控回滚流程

```text
runtime 试点发现异常
  -> 立即停止后续试点写入
  -> 用 D10-F 已核对的原始 outline 走正常 Topic aggregate update
  -> 刷新并确认原始值 hash / 视觉结果
  -> 将该 Topic 加入 scoped legacy policy
  -> 发布受控 policy，重新进入 TopicDetail
  -> 解析为 legacy renderer 并进行只读、编辑、保存、刷新确认
```

恢复内容与切换 renderer 必须分成两个可审计步骤。不能仅切 legacy 模式后保留已被 runtime 序列化的候选 HTML，也不能在未恢复原始值时宣称回滚完成。恢复写入失败时，保留当前页面和 dirty 状态，禁止继续切换 mode；按 TopicDetail 既有失败处理重试。

回退名单只能添加经备份和责任人确认的单条 Topic 或预先声明的 cohort。完成观察并获得业务确认后，移除该 Topic 的 legacy scope，并用相同的刷新/保存验收确认恢复默认 runtime；移除不是自动过期行为。

## 6. 试点操作与权限边界

模式策略仅决定 renderer，不能改变谁可读、可编辑、保存或发起流程：

- 管理 scope 配置的变更权与 Topic 编辑权限分离；scope 管理者不因此获得 Topic 内容权限；
- 现有角色、资源归属和 `canEditTopic` 继续控制两个模式；
- read-only Topic 在 runtime 和 legacy 下均不可编辑、不可保存；
- policy 不得携带内容、账号、token、密码或 HTML 原文；
- 试点时不允许同一 Topic 并发编辑，不允许在审批、Production、Shooting 或 Publishing 转换窗口切换模式。

## 7. 保存、刷新与离开语义

| 场景 | runtime | legacy | 不变的页面责任 |
|---|---|---|---|
| 输入 | 更新 aggregate draft；不 autosave | 更新 aggregate draft；不 autosave | dirty / aggregateRevision |
| 点击保存 | manualSave 进入页面 aggregate command | 直接复用页面 `handleSave` | 六字段 payload、in-flight gate、baseline 更新 |
| 保存失败 | dirty 保留，可重试 | dirty 保留，可重试 | 不导航、不覆盖新 draft |
| 刷新 | 读取已保存 Topic 数据 | 读取已保存 Topic 数据 | 不依赖浏览器模式缓存 |
| 有修改离开 | Topic dirty leave guard | Topic dirty leave guard | 保存并离开 / 放弃 / 继续编辑 |

Topic 的离开判断只基于 aggregate dirty 状态，不能用 Runtime gracefulDispose 判断成功，也不新增浏览器 `beforeunload` 行为。legacy 不需要模拟 Runtime handle；runtime 不因存在 fallback 而改变 manualSave 或 dispose 语义。

## 8. 实施拆分与测试矩阵

实际实现应拆成独立、可回滚的小任务：

1. **G1 Policy foundation**：新增纯 `TopicEditorModePolicy` 和 resolver，空名单默认 runtime；为 ID 命中、cohort 命中、无效/重复 ID、空 policy、非命中写单元测试。
2. **G2 TopicDetail branch**：在不改变 aggregate save 的前提下，根据 resolver 仅渲染 rich 或 legacy 分支；禁止双挂载和热切换；添加页面级 mock 测试。
3. **G3 Controlled fallback operations**：定义配置变更、发布、原 outline 恢复、复验与移除流程；先用非业务 fixture 浏览器验收。
4. **G4 D10-F pilot authorization**：只有 G1-G3 通过、D10-F HTML 准入通过并取得业务负责人授权后，才可选择单条真实试点。

| 测试项 | 断言 |
|---|---|
| 默认 Topic | 未命中 policy 时继续 runtime rich；manual adapter、保存、刷新不变 |
| scoped runtime Topic | 显式非 legacy 或默认结果不被 cohort 意外影响 |
| scoped legacy Topic | 仅命中 ID/cohort 使用 `ContentEditor mode="legacy"`，无 runtime handle / autosave |
| scope 隔离 | 不在名单的 Topic、Production、Shooting、AddTopic 均无行为变化 |
| 权限 | 两种模式均复用既有 readonly 与保存权限，不出现权限提升 |
| 保存 | 修改 title、description、details、outline 时仍为一次六字段 aggregate save；重复保存被 gate 阻止 |
| 刷新 | 两种模式保存后均按服务端数据恢复，未读取用户侧切换状态 |
| 回退 | 先恢复原 outline，再以 legacy 重新进入；恢复后编辑、保存、取消、dirty leave 正常 |
| HTML | 仅 D10-E 准入的 THTML-01/04/05/07；阻断类型不能加入 scope 作为迁移候选 |

浏览器验收需要分别覆盖 runtime fixture、legacy fallback fixture、只读用户、保存失败、刷新、dirty 的保存并离开/放弃离开/继续编辑。测试记录不得保存凭据、token、Cookie 或完整业务 HTML。

## 9. D10-F 试点准入与 No-Go

真实受控迁移开始前，必须同时具备：

1. G1-G3 已通过单元、页面和浏览器验证；
2. legacy policy 默认为空，且仅包含已授权的 Topic ID/cohort；
3. 该条 Topic 的原始 `outline` 完整备份、hash、恢复责任人和回滚窗口已经就绪；
4. D10-E fixture/admission 仅识别为 THTML-01、04、05 或 07，并已通过人工视觉验收；
5. 既有 Topic 编辑权限、无并发编辑和无业务流程转换已确认；
6. 业务负责人明确授权单条写入和观察窗口。

任一条件缺失即 No-Go。特别是 `annotation-text`、`data-annotation-id`、`data-comment`、`font`、font-size/font-family、background-color 或异常 HTML 命中时，必须保持 legacy 内容和模式；不得通过 fallback 掩盖 HTML 兼容问题。

批注 mapping 仍是独立任务：它需要定义 legacy annotation 到 `CommentExtension` 的属性转换、创建时间 provenance、范围编辑/删除/reload 测试及不可映射时的回滚规则。本设计不修改 `CommentExtension`，也不伪造或丢弃批注元数据。

## 10. 本阶段结果

本阶段只完成 scoped legacy fallback 的架构与准入设计：没有新增 policy、没有切换任何 Topic、没有修改 `outline`，也没有执行真实迁移。D10-G 在此停止，等待独立 G1 实施任务和后续 D10-F 授权。
