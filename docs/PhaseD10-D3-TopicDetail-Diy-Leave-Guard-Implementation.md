# Phase D10-D3 TopicDetail Aggregate Dirty Leave Guard Implementation

## 1. 实现范围

新增 `src/hooks/useTopicDetailLeaveGuard.ts` 和对应测试，并在 `src/pages/TopicDetail.tsx` 接入返回列表路径。

该 guard 的唯一保存安全判断是 TopicDetail aggregate draft 相对 baseline 的 dirty 状态。它不读取、调用或解释 ContentEditor Runtime 的 `gracefulDispose()` 结果。

未修改 Production、Shooting、AutosaveCoordinator、SaveStrategy、Yjs、Socket.IO 或数据库。

## 2. 状态与流程

状态：`clean`、`dirty`、`saving`、`failed`、`cancelled`。

```text
返回列表
  -> clean: 直接 navigate('/topics')
  -> dirty: 显示确认对话框
       -> 保存并离开: manualSave -> aggregate save -> dirty=false -> navigate
       -> 放弃离开: restore baseline / close draft -> navigate
       -> 继续编辑: 关闭对话框，保留 draft
```

保存失败会保持当前页面和 dirty 状态；保存期间若有新的编辑，保存响应不能继续导航，而是回到 dirty 确认状态。`TopicLeaveGuardController` 对保存并离开保存单一 in-flight promise，避免重复点击触发重复保存或重复导航。

## 3. 页面边界

- 页面继续拥有 aggregate draft、baseline、aggregateRevision、`manualSave()` 和六字段 `updateTopic()` payload。
- Guard 只接受三个页面能力：`isDirty()`、`save()`、`discard()`。
- `discard()` 复用 TopicDetail 的 baseline 恢复和编辑态关闭，不写入 API。
- 本阶段只保护明确的“返回列表”导航；不处理浏览器刷新、关闭窗口或未声明的路由路径。

## 4. 测试结果

### 单元测试

`src/hooks/useTopicDetailLeaveGuard.test.ts` 覆盖：

- clean leave 直接导航；
- dirty save-and-leave；
- dirty discard-and-leave；
- 保存失败后重试；
- 保存双击共用单一 in-flight；
- 保存期间继续编辑，阻止旧保存结果导航。

同时回归了 D10-D2-B bridge 测试与 TypeScript 检查。

### 浏览器验收（Topic 112）

- 无修改点击“返回列表”直接进入 `/topics`。
- 修改大纲为 `D10_D3_SAVE_AND_LEAVE_MARKER` 后点击返回，出现 Topic 专用确认对话框；选择“保存并离开”后仅发生一次导航，重新进入确认内容已持久化。
- 修改为 `D10_D3_DISCARD_MARKER` 后选择“放弃离开”，重新进入确认该标记未持久化。
- 测试结束后通过正常显式保存将 fixture 大纲恢复为空，刷新确认保存标记不存在。

浏览器仍存在既有的 `select value=null` React warning；该问题与本阶段无关，未修改。

## 5. 结论

TopicDetail 现在具有独立的 aggregate dirty leave guard，且没有把 Topic 的表单保存语义混入 Runtime 或 Production/Shooting 的 graceful-dispose 链路。本阶段在此停止，不进入 HTML 迁移。
