# Phase D7-E.4 Failure Dialog Browser Race Regression

## 1. 环境

- 本地 Shooting fixture：`35`；关联 Production：`86`。
- 页面：`http://127.0.0.1:5175/shooting/35`。
- 仅 localhost 的 `shooting_hold_once` proxy；manifest 白名单：`PUT /api/workflow/shooting/35`。
- 使用独立登录浏览器会话；未记录凭据。
- 本阶段未修改代码。

## 2. hold / release 过程

每次受控失败均使用新的内容，等待 autosave delay 后点击返回，再调用：

```text
POST /__failure-injection/release/reject
```

本次 Case 2 的 release 返回 `204`，随后 browser 显示 failure dialog，证明 hold 已命中、失败路径已建立。

## 3. 已有 retry -> discard 结果

沿用 D7-E.4 已完成结果：交叉点击后未发生重复 navigation，dialog 保持可操作；随后单次 retry 可正常完成 navigation。未观察到旧版 completed 锁死。

## 4. discard -> retry

唯一文本：

```text
D7E4_DISCARD_RETRY_UNIQUE
```

结果：

- hold/reject 受控失败建立成功（release `204`）；
- 以自动化并发方式触发 `discard -> retry` 后，URL 保持 `/shooting/35`，编辑器与 dialog 仍在；
- 没有重复 navigation；
- 对话框仍可继续操作：随后单次 retry 成功导航至 `/shooting`。

这说明 `waiting_confirmation` / cancelled 路径不会再把 dialog 锁成不可操作；但当前浏览器自动化并发 click 仍不能从 DOM 直接区分两个输入中哪一个成为逻辑 winner。

## 5. 成功 retry

在 Case 2 的受控失败后，proxy 的一次性 hold/reject 已消费，下一次保存正常转发。点击单次 retry 后：

- 页面仅导航一次至 `/shooting`；
- 重新打开 `/shooting/35`，内容仍为 `D7E4_DISCARD_RETRY_UNIQUE`；
- 因此 retry 路径完成 durable 保存并进入 proceeded/navigation 路径。

## 6. 重复点击

`retry/retry` 与 `discard/discard` 的本轮独立浏览器用例未完成。原因是剩余测试时间内优先完成了新的唯一 revision、hold/reject、交叉动作与成功 retry 持久化闭环；不能据此宣称同动作重复点击已通过。

## 7. navigation 次数

| 场景 | 可观察 navigation |
| --- | --- |
| retry -> discard（已有 D7-E.4） | 交叉动作 0；后续单次 retry 1 |
| discard -> retry | 交叉动作 0；后续单次 retry 1 |
| 成功 retry | 1 |

未观察到重复 navigation。

## 8. fixture 清理

验收结束后已恢复并刷新确认：

```text
D7 Shooting Graceful Dispose Fixture Content
```

## 9. 是否建议进入 D8

暂不建议进入 D8。

虽然跨动作后的 dialog 已可继续操作、成功 retry 具备单次 navigation 与持久化证据，但 `retry/retry`、`discard/discard` 仍需在独立新 revision + hold/release 条件下补完浏览器验收；此外并发自动化缺少可观测的 winner 标识，无法对 First Action Wins 的 winner 归属作最终断言。
