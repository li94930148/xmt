# Phase D7-E.5 Same-Action Browser Regression

## 1. 测试环境

- Shooting fixture：`35`；页面：`/shooting/35`。
- Failure proxy：本地 `shooting_hold_once`，监听 `127.0.0.1:5175`。
- manifest：`tests/fixtures/shooting-graceful-dispose.manifest.local.json`，白名单为 `PUT /api/workflow/shooting/35`。
- 使用独立登录浏览器会话；未记录凭据、Authorization、Cookie 或请求正文。
- 本阶段未修改代码。

## 2. hold / release 方法

每个用例均：重启 proxy、输入与当前内容不同的唯一文本、等待 autosave delay、点击受控返回，并调用：

```text
POST /__failure-injection/release/reject
```

两次 release 都返回 `204`；随后页面显示 failure dialog。这是 hold 请求确实命中的证据。

## 3. retry -> retry

唯一文本：

```text
D7E5_RETRY_RETRY_UNIQUE_01
```

步骤：建立 held 保存 -> release/reject -> failure dialog -> 快速双击“重试保存”。

结果：

- 只发生一次可观察 navigation：`/shooting/35` -> `/shooting`；
- failure dialog 未残留，编辑器已卸载；
- 未观察到重复 navigation；
- 重新打开 Shooting 35 后，内容为 `D7E5_RETRY_RETRY_UNIQUE_01`，证明有效 retry 已持久化。

## 4. discard -> discard

唯一文本：

```text
D7E5_DISCARD_DISCARD_UNIQUE_02
```

步骤：重新建立 held 保存 -> release/reject -> failure dialog -> 快速双击“放弃离开”。

结果：

- 只发生一次可观察 navigation：`/shooting/35` -> `/shooting`；
- failure dialog 未残留，编辑器已卸载；
- 未观察到重复 navigation；
- 本用例按 discard 语义执行，未将该唯一文本视为已保存成功。

## 5. Console / Network

- 两个 proxy release 控制请求均返回 `204`。
- 未观察到 XMT 页面应用异常、保存重复或导航重复。
- 浏览器自动化环境出现过与本地应用无关的 Statsig 外部分析请求 timeout；不对应 Shooting 保存请求，未影响上述结果。

## 6. fixture 恢复

已通过正常编辑与 autosave 恢复，刷新后确认：

```text
D7 Shooting Graceful Dispose Fixture Content
```

## 7. 是否建议进入 D8

同动作回归通过：retry/retry 与 discard/discard 均只有一次可观察的有效副作用和一次 navigation，且无 dialog 锁死或重复导航。

结合 D7-E.4 的交叉动作结果，建议**可以进入 D8 评估**；本阶段不执行 D8。
