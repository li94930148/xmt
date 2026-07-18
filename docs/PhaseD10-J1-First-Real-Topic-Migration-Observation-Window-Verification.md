# Phase D10-J1 First Real Topic Controlled Migration Observation Window Verification

## 1. 范围

- 观察对象：Topic `99`，`济南和泰安：同城不同命`。
- 基线迁移类型：THTML-01 普通文本。
- 本阶段不迁移新 Topic、不扩大 scope、不配置 cohort，也不修改 Runtime、SaveStrategy、ContentEditor、Topic 数据结构或数据库结构。
- 本轮的真实编辑仅用于验证保存稳定性；测试文本已在结束前通过正常 TopicDetail 保存流程恢复。

## 2. Runtime 与渲染器复核

重新打开 Topic 99 后：

| 验证项 | 结果 |
| --- | --- |
| editor mode | 通过：`runtime` |
| 编辑器实例 | 通过：编辑态 `.ProseMirror=1` |
| 预览结构 | 通过：八个普通段落完整显示 |
| legacy renderer | 未挂载 |

## 3. 真实编辑、保存与刷新

对第二段“正文”临时修改为“正文（D10-J1 观察验证）”，并通过标准页面路径保存：

```text
ContentEditor Runtime manual strategy
  -> manualSave
  -> TopicDetail aggregate save gate
  -> updateTopic
```

保存后刷新页面，临时修改仍存在，证明本次真实编辑的持久化和刷新恢复正常。未出现保存失败或 renderer 异常。

为避免在真实业务 Topic 中遗留验证文本，随后使用同一页面编辑/保存路径恢复 D10-J 原始 outline，并刷新确认临时文本已不存在。

## 4. 离开流程

| 场景 | 结果 |
| --- | --- |
| clean leave | 通过：未修改时一次跳转至 `/topics` |
| dirty leave | 通过：未保存临时内容后仍停留 `/topics/99`，显示“继续编辑”“放弃离开” |
| discard | 通过：放弃离开后未保存 dirty marker 不存在；此前已保存的观察验证文本仍存在 |
| 恢复后刷新 | 通过：最终预览恢复原始八段内容，观察验证文本不存在 |

## 5. 数据完整性

| 项目 | 值 |
| --- | --- |
| D10-J original hash | `18804df4c971260dd5e7cfbca3a18bd70b3e40e40d2279fae89e470a6682dda5` |
| 当前 outline hash | `18804df4c971260dd5e7cfbca3a18bd70b3e40e40d2279fae89e470a6682dda5` |
| 当前字节数 | `791` |
| 当前数据库更新时间 | `2026-07-18 09:48:20`（北京时间） |
| 与原始备份一致 | 是 |

迁移 record 当前状态：**observation active**。本次验证完成后 Topic 99 已回到 D10-J 原始内容；没有遗留测试标记。

## 6. 异常记录

- 未观察到保存失败、网络保存错误、Runtime renderer 异常、刷新丢失或 dirty-state 异常。
- 控制台持续存在既有的 React warning：`TopicDetail` 中原生 `select` 接收到 `value=null`。该 warning 与本次迁移、manual save、刷新和离开链路无直接关联；按本阶段限制仅记录，不修复。

## 7. 结论

Topic 99 在观察窗口内完成一次真实编辑保存、刷新恢复、clean leave、dirty leave、discard 及最终内容恢复验证，稳定性通过。

观察窗口仍按 D10-J 记录保持 active，建议最早在 `2026-07-20` 进行窗口结束复核。在此之前不得据此迁移第二个 Topic 或扩大任何 HTML 类型授权。
