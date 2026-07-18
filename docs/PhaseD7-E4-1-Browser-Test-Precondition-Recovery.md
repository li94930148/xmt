# Phase D7-E.4.1 Browser Test Precondition Recovery

## 阻断原因

D7-E.4 重测时，页面重载后的 `script_content` 与输入文本相同，未形成新的编辑 revision。因此 autosave 没有发出新的目标保存请求，`shooting_hold_once` 没有 held request，调用 release endpoint 得到预期的 `409 Conflict`。随后离开动作按正常路径导航至列表。

这不是业务保存、权限、Runtime 或 failure proxy 白名单故障，而是测试输入不唯一造成的环境前置条件缺失。

## 恢复方式

未修改任何代码或数据结构。使用正常浏览器编辑流程完成恢复：

1. 校验 fixture manifest：Shooting `35`、Production `86`，允许路径为 `PUT /api/workflow/shooting/35`。
2. 重启 localhost-only `shooting_hold_once` proxy，清除旧 proxy / held 状态。
3. 登录后打开 `/shooting/35`，写入唯一文本 `E41_PRECONDITION_UNIQUE_REVISION`。
4. 等待 autosave 进入 hold，调用 `POST /__failure-injection/release/forward`，获得 `204`。
5. 刷新页面，确认唯一文本仍存在，证明新 revision 已产生、保存请求已出现并成功持久化。
6. 再次重启 hold proxy，写入第二个唯一文本，点击受控返回并调用 `release/reject`；浏览器稳定显示 failure dialog，URL 保持 `/shooting/35`，并出现“继续编辑 / 重试保存 / 放弃离开”控件。

## 当前状态

| 前置条件 | 结果 |
| --- | --- |
| Shooting 35 可编辑 | 通过 |
| `script_content` 读写 | 通过 |
| 唯一 revision 与 autosave 请求 | 通过 |
| manifest 白名单 | 有效 |
| hold 状态清理与 forward release | 通过（204） |
| reject release 后 failure dialog | 通过（204 后 dialog 出现） |
| 浏览器附着 | 通过 |

测试结束后，已通过正常 autosave 恢复 fixture 初始内容，并刷新确认：

```text
D7 Shooting Graceful Dispose Fixture Content
```

## 是否可继续 D7-E.4

可以继续。D7-E.4 后续每个 case 必须先使用与当前内容不同的唯一文本，确认 hold 已命中（release 返回 204），再进行离开或 race 操作。不得复用已有 `script_content` 作为“新编辑”。
