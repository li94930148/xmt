# Phase D10-J First Real Topic Controlled Migration

## 1. 文档状态

状态：**Migration written — observation window active**。

本记录对应一条真实 Topic 的单条受控迁移。禁止将本记录用于 cohort 扩展或批量迁移。

## 2. Migration record（创建于写入前）

| 字段 | 值 |
| --- | --- |
| topicId | `99` |
| 标题 | `济南和泰安：同城不同命` |
| HTML 类型 | `THTML-01`（普通段落） |
| 当前状态 | `pending` |
| 操作人 | Codex（按本任务指令执行） |
| 审核/人工批准 | 本任务请求者的明确 Phase D10-J 指令；未声明独立第二审核人 |
| 迁移范围 | 仅该 Topic 的 `outline` renderer/save round-trip |
| 禁止范围 | 不修改标题、描述、详情、权限、流程、版本、Runtime、schema、SaveStrategy 或其他 Topic |

## 3. Admission 与备份

### 3.1 Admission 结果

- 类型已由 D10-I 授权为 **Approve**；
- 原内容只包含八个普通 `<p>` 段落；
- 未检测到 annotation、`data-*`、`font`、`span`、`style`、颜色/背景色、列表、表格、图片或未知 HTML；
- Topic 不在 production、shooting、publishing 或 completed 状态；
- 页面以既有权限模型开放编辑。

### 3.2 原始 outline 备份

原始 outline（也是本次 THTML-01 candidate HTML）：

```html
<p>开头点出济南和泰安的关系很近，如今却有不同的发展命运</p><p>正文</p><p>从地理关系（两地都紧挨泰山，共享同一套地下水系统——泰山蓄水，济南的泉水出水【这点也是现在两地关系的隐喻】）</p><p>和历史方面（泰安州曾是济南府的附属地）两方面点出济南和泰安曾经的”兄弟城市“关系</p><p>通过经济发展、人口增减等方面对比两地现在的发展现状</p><p>引出”济泰一体化“的概念，进而引出爆点话题——现在的济南对包括泰安在内的周边城市，仍是”虹吸作用“大于”带动作用“</p><p>末尾往回圆一句：虹吸是现状，带动是未来趋势或目标</p><p>引导济南、泰安两地的观众讨论该话题</p>
```

| 数据 | SHA-256 | UTF-8 bytes |
| --- | --- | --- |
| original outline | `18804df4c971260dd5e7cfbca3a18bd70b3e40e40d2279fae89e470a6682dda5` | `791` |
| candidate runtime HTML | `18804df4c971260dd5e7cfbca3a18bd70b3e40e40d2279fae89e470a6682dda5` | `791` |

## 4. 执行与回滚计划

### 执行路径

```text
TopicDetail runtime renderer
  -> ContentEditor manualSave
  -> TopicDetail aggregate save gate
  -> updateTopic 完整六字段 payload
```

不直接修改数据库，不调用独立迁移 API。

### 回滚

若任一验收项失败，使用 TopicDetail 正常编辑和保存流程，将第 3.2 节的原始 outline 原样写回；刷新后确认 SHA-256 与原始值一致，并恢复该 Topic 的既有 renderer mode。

## 5. 执行结果

- 已通过 TopicDetail 进入 `runtime` renderer；编辑态仅存在一个 `.ProseMirror`。
- 已使用标准 UI 将 THTML-01 candidate HTML 粘贴至 ContentEditor，并点击页面“保存”。
- 保存路径为 `manualSave -> aggregate save gate -> updateTopic`；未直接写入数据库，也未调用独立迁移 API。
- 保存后预览、刷新后预览与第 3.2 节 candidate HTML 完全一致。
- 数据库读取复核：存储 outline SHA-256 为 `18804df4c971260dd5e7cfbca3a18bd70b3e40e40d2279fae89e470a6682dda5`，字节数为 `791`，与原始备份完全相同。

本类型在当前 Runtime/Tiptap 配置下无需 canonicalization；因此本次受控迁移是一次 **字节级不变的 renderer/manual-save round-trip**，而非内容语义或结构改写。

## 6. 浏览器验收

| 验收项 | 结果 |
| --- | --- |
| 打开/runtime renderer | 通过：`data-topic-editor-mode=runtime` |
| 单编辑器实例 | 通过：编辑态 `.ProseMirror=1` |
| manual save / aggregate save | 通过：页面保存成功并返回预览态 |
| 刷新恢复 | 通过：刷新后八个段落仍完整存在 |
| clean leave | 通过：未修改时一次跳转至 `/topics` |
| dirty leave | 通过：未保存临时 marker 后停留在 `/topics/99`，出现“继续编辑”“放弃离开” |
| discard | 通过：放弃离开后 marker 不存在，原 outline 保持完整 |

浏览器控制台只有既有 `TopicDetail` 原生 `select` 的 `value=null` React warning；未观察到本次 renderer、保存、刷新或离开链路的异常。

## 7. Rollback 演练

本次 candidate 与原始 outline 字节完全相同，不能通过人为加入临时业务文本来制造差异（那会扩大真实业务数据的写入风险）。因此采用安全的 **idempotent rollback** 演练：重新通过 TopicDetail 标准编辑/保存链路写入第 3.2 节原始 outline，然后刷新和数据库哈希复核。

结果：恢复后 SHA-256、字节数和完整 HTML 都与原始备份一致。该演练验证了回退所需的页面保存路径和可验证恢复条件，同时未改变业务语义。

## 8. 观察窗口

开始：`2026-07-18 09:30:00`（数据库北京时间记录）。

最低观察期：下一完整业务日或下一次已知编辑窗口（取较长者）。建议最早复核日为 `2026-07-20`。观察项为保存失败、刷新恢复、dirty leave、渲染异常和用户反馈。

本阶段仅启动观察窗口，**不宣告观察期完成，也不扩大任何类型或 Topic 的迁移范围**。
