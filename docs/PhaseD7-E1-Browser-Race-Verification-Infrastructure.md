# Phase D7-E.1 Browser Race Verification Infrastructure

## 1. 变更范围

- `scripts/failure-injection-proxy.mjs`
- `tests/failure-injection-proxy.test.mjs`

未修改 EditorLeaveFailureDialog、业务页面、Runtime、AutosaveCoordinator、LeaveGuard、Adapter、API 或数据库。

## 2. `shooting_hold_once`

新增仅面向 Shooting fixture 的 `shooting_hold_once` profile：

- 仍要求 `NODE_ENV !== production`、localhost listener、local upstream 与合法 Shooting fixture manifest。
- 只匹配 manifest 白名单中的 `PUT /api/workflow/shooting/<fixtureId>`。
- 首次匹配请求被保存于 proxy 内，不转发、不返回，后续请求正常 passthrough。
- 只接受 localhost 上的测试控制端点：
  - `POST /__failure-injection/release/reject`：以 503 释放 held request；
  - `POST /__failure-injection/release/forward`：转发 held request。
- 不读取、记录或输出 Authorization、Cookie、密码或 `script_content` 正文。

## 3. Proxy 验证

`node tests/failure-injection-proxy.test.mjs` 通过，新增覆盖：

- held request 不进入 upstream；
- reject release 返回 503 且只能释放一次；
- forward release 只向 upstream 转发一次；
- 既有 Shooting/Production profile 隔离及 production fail-closed 测试保持通过。

`npm run check` 通过。

## 4. 浏览器验证结果

使用 Shooting fixture `35` 与本地 proxy：

1. 编辑 `script_content`，等待 autosave 请求进入 `shooting_hold_once`。
2. 点击返回，随后调用 `release/reject`。
3. 已稳定出现 failure dialog，解决普通 debounce autosave 提前消费 `reject_once` 的测试缺口。
4. 在该稳定 failure dialog 中，分别注入自动化并发点击：
   - `retry -> discard`
   - `discard -> retry`

两组结果均为：URL 保持 `/shooting/35`、编辑器与 failure dialog 仍在、没有 navigation。即基础设施已成功稳定复现 race，但 **First Action Wins 仍未通过**；本阶段不伪报为成功。

测试后已将 fixture 内容恢复并刷新确认：

```text
D7 Shooting Graceful Dispose Fixture Content
```

## 5. 结论

本阶段的测试控制基础设施完成，可确定地制造并释放 Shooting 保存失败，且未扩大测试范围。

当前 D7-E action gate 在真实浏览器受控 race 中仍未达标；因此不进入 D8。下一步应在单独修复任务中依据此 hold/release 基础设施继续定位共享 dialog 与 leave-guard 回调之间的交叉动作丢失原因。
