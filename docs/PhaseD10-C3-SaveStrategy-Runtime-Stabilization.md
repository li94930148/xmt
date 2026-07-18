# Phase D10-C3 SaveStrategy Runtime Stabilization

## 1. 验收范围与边界

本阶段只验证 `autosave | manual | external` 策略分流的稳定性；未接入 Topic，未修改 Adapter、AutosaveCoordinator、Yjs、Socket.IO、数据库或业务保存逻辑。

测试对象：Production fixture `85` 与 Shooting fixture `35`。测试中写入的临时标记均已恢复：Production 恢复到测试前内容，Shooting 恢复为 `D7 Shooting Graceful Dispose Fixture Content`。

## 2. 浏览器验证

| 范围 | 用例 | 结果 | 证据/说明 |
| --- | --- | --- | --- |
| Production | 正常编辑、连续输入、autosave、刷新恢复 | 通过 | 最后一版连续输入标记在刷新后存在；随后恢复原内容并再次确认。 |
| Production | 基础双用户协作 | 通过 | 两个独立已登录浏览器会话同时进入 `production:85`；一端输入的唯一标记实时出现在另一端，撤销标记也实时同步，并在刷新后保持恢复状态。 |
| Production | 正常返回创作管理 | 通过 | 未处于待保存状态时，受控返回正常导航至 `/production`。 |
| Production | 输入后立即受控离开 | 未完全通过 | 最后输入经刷新确认已持久化，但两次观察中受控返回未在 2.2 秒观察窗口内完成导航。该现象不应被解释为保存成功后的正常离开；本阶段只记录，不现场修复。 |
| Shooting | `script_content` 编辑、autosave、刷新恢复 | 通过 | 保存标记刷新后仍存在。 |
| Shooting | 快速离开、重新进入恢复 | 通过 | 输入后立即受控返回成功导航至 `/shooting`；重新进入后最新 `script_content` 存在。 |

Production 与 Shooting 的页面控制台均未采集到 XMT 应用 error/warn。验收工具本身曾出现外部 Statsig 网络请求失败；它不来自 XMT 页面，且未伴随页面控制台错误或功能失败。

请求数量未使用侵入式网络拦截统计；从保存行为观察，连续输入只以最终内容完成持久化，未看到页面侧重复保存或重复导航迹象。该项如需精确基线对比，应在独立网络计数验收任务中完成。

## 3. Mock / Contract 验证

以下命令均通过：

```text
npx tsx src/editor/contracts/SaveStrategy.contract.test.ts
npx tsx src/editor/runtime/ManualSaveController.test.ts
npx tsx src/editor/runtime/SaveStrategyDispatch.test.ts
npx tsx src/editor/runtime/GracefulDisposeController.test.ts
npx tsx src/editor/runtime/RuntimeHandleBridge.test.ts
npm run check
```

覆盖结果：

- 无 Adapter 解析为 `external`，不会调用 `persist`。
- `external` 策略不调度 Runtime 保存，`manualSave()` 返回 `not_applicable`。
- `manual` 策略的输入只更新编辑状态，不创建 autosave；显式 `manualSave()` 才以 `reason: 'manual'` 调用 `adapter.persist()`。
- ManualSaveController 覆盖成功、失败、重复 revision、过期 revision 与 destroy。
- `autosave` 分流维持原调度路径；graceful-dispose 聚合与 handle bridge 回归通过。

## 4. 回归结论

SaveStrategy 的 mock/contract 行为通过；Shooting 的真实浏览器回归通过；Production 的编辑、保存、刷新与基础协作通过。

但是，Production 在存在待保存输入时的受控离开导航未完成浏览器闭环验证。尽管内容 durability 已得到确认，导航未完成意味着仍可能存在 LeaveGuard、页面 continuation 或 UI 状态的回归。该问题不在本阶段允许的修复范围内。

## 5. 风险与下一步建议

当前**不建议进入 Topic 页面接入**。先创建一个窄范围的 Production graceful-dispose 导航观察/诊断任务，复现“内容已保存但导航未完成”的条件，并只确认其是否为 SaveStrategy 相关回归。完成并通过后，再按 D10-B/D10-C 的设计进入 TopicDetail manual-save bridge；AddTopic 仍保持创建型保存链路。

