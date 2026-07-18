# Phase D8-B3 Legacy Database Sync Cleanup Observation

## 1. 删除后状态

Phase D8-B2 已从 `src/collaboration/core/writeConsistency.ts` 删除 legacy database debounce primitive：

- `SyncToDatabaseOptions`
- `databaseTimers`
- `syncToDatabase()`
- `cancelDatabaseSync()`

本观察阶段未修改任何代码。`syncToYjs`、`defineWriteSource` 以及其既有 import 路径保持不变。

## 2. 静态检查结果

执行：

```text
rg -n --glob '!node_modules/**' --glob '!docs/**' --glob '!*.md' 'syncToDatabase|cancelDatabaseSync' .
```

结果：运行源码零匹配。两项 legacy database primitive 均不存在定义、import 或调用。

## 3. 页面回归结果

|范围|验证|结果|
|-|-|-|
|Production 85|长文本编辑、连续两次修改、等待 autosave、刷新恢复|通过：最终修改持久化；测试内容随后恢复并再次刷新确认|
|Production 85|两个独立登录会话进入同一文档；一端修改、另一端不刷新观察|通过：第二会话的协同标记实时出现；还原后两端及刷新内容均无标记|
|Shooting 35|编辑 `script_content`、受控快速离开、重新进入验证|通过：快速离开前的最后内容已持久化；页面正常返回列表|
|Shooting 35|恢复 fixture 内容并刷新确认|通过：恢复为 `D7 Shooting Graceful Dispose Fixture Content`|
|AddTopic legacy|打开 legacy 编辑器、编辑、保存草稿、打开详情并刷新确认|通过：保存内容在刷新后的详情页可见|

AddTopic 回归创建的临时草稿 `[D8 B3 TEST] Legacy Refresh Observation` 已通过正常页面删除流程清理；列表筛选确认无残留。

## 4. 异常观察

- 应用 console：两个测试会话均未捕获 XMT console error 或 warning。
- Network：未观察到影响本地业务保存、刷新或协同的请求异常。
- Yjs seed：未出现重复初始化或重复内容；双用户标记只出现一次，并能在还原后消失。
- 外部环境：浏览器控制环境曾输出外部 Statsig 网络超时；该请求与本地 XMT 应用无关，且未影响本阶段业务验证。

## 5. 是否建议进入 D9

建议进入 D9 的**评估/观察准备**，但不建议继续对 `writeConsistency.ts`、Yjs 或 Socket.IO 做清理。D8-B3 已确认 Runtime Autosave 是 Production/Shooting 的业务保存入口，legacy database primitive 删除后页面功能与基础协同链路稳定。

本阶段未修改 Runtime、AutosaveCoordinator、Adapter、Production/Shooting 页面、数据库结构或 Yjs/Socket.IO 协议。
