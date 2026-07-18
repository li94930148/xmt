# Phase D2 Autosave Graceful Dispose Semantics

## 1. 生命周期状态

`RuntimeAutosaveCoordinator` 现在具有明确的三态生命周期：

| 状态 | `scheduleSave` | `flush` | 进入方式 |
| --- | --- | --- | --- |
| `active` | 接收新 revision | 允许 | 初始状态；失败或超时后恢复 |
| `disposing` | 拒绝并返回 `false` | 仅排空已接收的保存 | `gracefulDispose()` 开始 |
| `disposed` | 拒绝并返回 `false` | 返回 `cancelled` | graceful 保存成功或立即 `destroy()` |

`destroy()` 保持原有立即释放语义：不等待网络、不重试、清除排队/延迟保存。它不会取消已经发出的 HTTP 请求；但该请求完成后不会再更新 Runtime 状态，也不会触发下一次排队保存。

## 2. 新 revision 策略

开始 `gracefulDispose()` 时，Coordinator 先从 `active` 切换到 `disposing`。此后所有新的 `scheduleSave(content, revision)` 都被拒绝，已接收的最新 revision 则由 `flush()` 排空。

这避免了离开页面的有限时间窗口不断接收新输入、导致处置过程无法收敛。普通 `flush()` 不改变生命周期，因此仍可以处理 flush 期间抵达的更高 revision；旧 revision 的完成不会把 `persistedRevision` 回退。

## 3. timeout 策略

超时结果明确为 `timed_out`，不会被标记为 `synced`。超时时尚未完成的请求可以继续在底层运行；Runtime 不将其当作已持久化，也不会在其后启动新的排队请求。

如果页面随后立即 `destroy()`，Coordinator 进入 `disposed`，清理 pending/timer，并阻止任何后续 `scheduleSave`。该策略不声称能够撤销已发送的网络请求。

## 4. retry 策略

`persist()` 失败时，失败的最新请求会被保留供下一次 `flush()` 重试。`gracefulDispose()` 返回 `failed` 或 `timed_out` 后，Controller 和 Coordinator 都恢复至 `active`，因此可由调用方发起一次新的 `gracefulDispose()`。

成功后 Controller 缓存结果并进入 `disposed`；后续重复调用返回该成功结果，不会产生额外保存。

## 5. 重复调用策略

同一 Controller 在 `disposing` 阶段收到多个 `gracefulDispose()` 调用时，返回同一个 in-flight Promise。不会创建重复 flush、重复 persist 或竞争的生命周期转换。

## 6. 修改文件

- `src/editor/contracts/autosaveCoordinator.ts`
  - 新增 `AutosaveLifecycleState`，明确 `scheduleSave` 接收结果，并定义 graceful dispose 生命周期操作。
- `src/editor/runtime/AutosaveCoordinator.ts`
  - 实现 active / disposing / disposed 状态、失败请求保留与 retry、终态收口和状态安全保护。
- `src/editor/runtime/GracefulDisposeController.ts`
  - 在成功 flush 后完成 Coordinator 的 `disposed` 转换；失败或超时后恢复可重试状态。
- `src/editor/runtime/GracefulDisposeController.test.ts`
  - 扩展 mock 场景验证。

未修改页面、ContentEditor、Adapter、Yjs、Socket.IO、API、数据库、权限、版本或 workflow。

## 7. 测试结果

执行成功：

```text
npm run check
npx tsx src/editor/runtime/GracefulDisposeController.test.ts
```

运行时 mock 测试覆盖：

1. pending save graceful dispose 后同步完成；
2. persist 失败；
3. persist 超时且不误报 `synced`；
4. destroy 后调用；
5. 普通 flush 中旧 revision 不覆盖新 revision；
6. dispose 过程重复调用复用 in-flight 结果；
7. disposing 期间拒绝新 revision；
8. 慢 persist + timeout；
9. failed 后 retry 成功；
10. timeout 后 destroy 不再启动后续保存；
11. 成功 dispose 后拒绝新的 scheduleSave。

## 8. 回滚方式

本阶段仅为未接入页面的 Runtime/Contract 层调整。回滚时撤销本阶段四个文件中的 D2 生命周期语义即可；Production、Shooting 业务数据、API 协议与协作链路均不受影响。

