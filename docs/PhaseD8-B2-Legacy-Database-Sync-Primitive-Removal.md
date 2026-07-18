# Phase D8-B2 Legacy Database Sync Primitive Removal

## 1. 删除文件范围

仅修改 `src/collaboration/core/writeConsistency.ts`，删除已确认无运行源码引用的 legacy database debounce primitive：

- `SyncToDatabaseOptions`
- `databaseTimers`
- `cancelDatabaseSync()`
- `syncToDatabase()`
- 仅供上述类型使用的 `EditorPersistenceState` type import

未移动文件、未拆分模块、未修改 export 路径。

## 2. 删除前后 diff

`git diff --stat -- src/collaboration/core/writeConsistency.ts`：

```text
src/collaboration/core/writeConsistency.ts | 59 ------------------------------
1 file changed, 59 deletions(-)
```

变更为纯删除：移除了旧的 database timer/debounce 保存实现及其专用类型。保留的活跃协同导出保持不变：

- `defineWriteSource`
- `syncToYjs`
- `CollaborationWriteSource`
- `WriteSourceState`

现有 import 路径仍保持不变：

- `src/components/editor/Editor.tsx` 继续从 `../../collaboration/core/writeConsistency` 导入 `syncToYjs`。
- `src/collaboration/yjs/useCollaborativeDocument.ts` 继续从 `../core/writeConsistency` 导入 `defineWriteSource`。

## 3. 静态与类型检查结果

执行：

```text
npm run check
```

结果：通过（`tsc --noEmit`）。

执行运行源码扫描（排除 `node_modules` 与文档）：

```text
rg -n --glob '!node_modules/**' --glob '!docs/**' --glob '!*.md' 'syncToDatabase|cancelDatabaseSync' .
```

结果：无匹配。`syncToDatabase` 与 `cancelDatabaseSync` 均不存在运行源码定义、import 或调用。

`git diff --check` 未发现本次变更的空白错误；命令显示的 CRLF 提示来自既有工作树文件，不属于本次删除范围。

## 4. 回归结果

本地开发环境下完成以下最小真实页面回归：

|范围|操作|结果|
|-|-|-|
|Production 85|编辑、等待 Runtime autosave、刷新验证，再恢复原测试内容并刷新确认|通过|
|Shooting 35|更新 `script_content`、等待 Runtime autosave、刷新验证，再恢复 `D7 Shooting Graceful Dispose Fixture Content` 并刷新确认|通过|
|AddTopic legacy|打开 `/topics/add` 的 legacy editor、填写测试标题与内容、执行“保存草稿”|通过；页面正常返回选题列表|

AddTopic 回归产生的临时草稿 `[D8 B2 TEST] Legacy Save Regression` 已通过页面“删除”操作清理，列表搜索确认不存在该记录。

浏览器运行期间出现一次外部 Statsig 请求超时；它未影响本地 XMT 页面保存或刷新验证，也未产生应用内错误。

## 5. 是否建议进入观察阶段

建议进入观察阶段，而不是继续清理 Yjs 相关代码。Production 与 Shooting 的业务保存仍由 Runtime AutosaveCoordinator 承担；`syncToYjs`、`defineWriteSource`、Yjs 初始化与 Socket 协作链路仍为活跃边界，均未改动。

回滚方式：恢复本文件改动即可完整恢复 legacy database primitive；本阶段未涉及数据库结构、API、Runtime、Adapter、Yjs 或 Socket.IO 协议。
