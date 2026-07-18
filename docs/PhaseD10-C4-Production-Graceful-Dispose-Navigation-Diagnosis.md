# Phase D10-C4 Production Graceful Dispose Navigation Diagnosis

## 1. 复现步骤

测试对象为 Production fixture `85`，使用已登录本地浏览器会话；本次临时标记为 `D10_C4_NAV_DIAG_MARKER`，完成后已恢复并刷新确认不存在。

| Case | 操作 | 结果 |
| --- | --- | --- |
| A：无编辑直接返回 | 打开 `/production/85`，确认唯一“返回创作管理”按钮后点击。 | 300ms 后 URL 为 `/production`。 |
| B：输入后立即返回 | 打开 `/production/85`；输入唯一标记；重新读取 DOM、确认唯一“返回创作管理”按钮后立即点击；在 350ms、1550ms、2850ms 读取 URL 和确认对话框状态。 | 350ms 已到 `/production`；之后保持该 URL；未出现“未能确认保存 / 保存确认超时 / 保存过程已中断”对话框。 |

输入后重新进入并恢复原内容，等待 autosave 后刷新确认测试标记已移除。页面控制台未采集到 XMT 应用 error/warn。

## 2. 调用链

```text
ProductionDetail 的返回按钮
  -> handleGuardedNavigate('/production')
  -> requestLeave({ reason: 'route_transition', continuation: () => navigate(to) })
  -> EditorLeaveGuardController.requestLeave()
  -> runtimeHandle.gracefulDispose()
  -> GracefulDisposeController
  -> RuntimeAutosaveCoordinator.flush()
  -> durable AggregateDisposeResult
  -> EditorLeaveGuardController.proceed()
  -> await continuation() / navigate('/production')
  -> state = completed
```

如果 autosave 结果不是 `durable`，Guard 会进入 `waiting_confirmation`，页面才会展示 `EditorLeaveFailureDialog`；本次 Case B 没有进入该分支。

## 3. 状态变化与证据

| 层级 | 预期状态 | 本次证据 |
| --- | --- | --- |
| ContentEditor | Runtime handle 已经通过 bridge 写入 `runtimeHandleRef`。 | Production 页面传入 `onRuntimeHandleChange`；Case B 使用可编辑 Runtime 页面。 |
| LeaveGuard | `leaving -> disposing -> completed`。 | 结果表现为 350ms 已执行 continuation 并切换 URL；没有确认对话框。 |
| GracefulDispose | autosave flush 成功，返回 `durable`。 | 否则 Guard 会保持当前页面并展示确认对话框；实际已导航。 |
| Runtime autosave | flush 会清除 debounce 并串行保存最新 revision。 | Case B 的立即返回仍完成页面导航；测试标记后续被正常恢复。 |
| Navigation continuation | 单次 `navigate('/production')`。 | Case A/B 均观察到目标 URL；无对话框残留。 |

静态测试也通过：`useEditorLeaveGuard.test.ts` 覆盖 durable 自动 continuation、失败阻断、retry、discard、重复 request 复用及无 handle；`GracefulDisposeController.test.ts` 覆盖 durability 成功/失败、超时、重试和 in-flight 复用。

## 4. 根因判断

未发现 Production graceful-dispose、Promise、in-flight、waiting_confirmation、dialog 或 navigation continuation 的代码级阻塞证据。

D10-C3 的“内容已持久化但未在观察窗口导航”在本阶段无法复现。最可能原因是浏览器自动化测试时序：编辑器内容变更后 React/编辑器会重建可见 DOM 节点，旧的节点引用或 node id 不能作为后续返回按钮点击的有效证据。D10-C4 在编辑后重新采集 DOM，并以唯一可访问名称定位返回按钮，因此避免了该时序歧义。

这是一个**已排除、不可稳定复现的验收观察**，不是可确认的产品缺陷。仍不能从这一次诊断推断所有极端浏览器/网络条件下都不会超时；该情形由既有 failure-injection 验收覆盖。

## 5. 最小修复建议

当前不建议修改生产代码。

若未来再次复现，应先新增或使用仅测试环境的可观察信号（例如 guarded-navigation 的结果与 continuation 次数），并在一次交互后重新获取页面节点，再判断是否需要页面层修复。不要修改 Runtime、AutosaveCoordinator、Yjs 或 Adapter 来处理尚未复现的浏览器自动化时序。

## 6. 回滚方案

本阶段没有代码修改，无需代码回滚。测试数据已恢复；如需重跑，仅在 Production fixture `85` 上使用新的唯一标记，并在完成后通过正常编辑和 autosave 恢复原内容。

