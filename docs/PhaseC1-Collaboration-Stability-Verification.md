# Phase C1 Collaboration Stability Verification

> 结果：**未完成 / 不建议进入 Runtime 结构清理评估**。本轮没有猜测任何协同、保存、粘贴、刷新、重连或 destroy 结果；未修改任何代码、协议、数据库结构或业务逻辑。

## 1 测试环境

| 项目 | 结果 |
| --- | --- |
| 本地地址 | `http://127.0.0.1:4173` |
| 浏览器 A | Codex In-app Browser，独立会话，账号 `yffa23`，角色：管理员。 |
| 浏览器 B | Chrome extension Browser，独立会话，账号 `1`，角色：管理员。 |
| 会话隔离 | A/B 使用不同浏览器绑定与独立登录会话；未读取、复制或共用 localStorage、cookie、session。 |
| 登录验证 | 两个账号均成功从 `/login` 进入工作台；登录时未发现 console warning/error。 |
| 凭据处理 | 密码只用于浏览器登录，未写入代码、报告、测试文件或日志。结束前两个会话均已退出登录并关闭。 |
| 测试文档 | 未能安全取得 Production 或 Shooting 的可回滚测试文档；因此没有 document id / room id 可记录。 |

## 2 Production测试结果

| 验证项 | 结果 | 证据 / 说明 |
| --- | --- | --- |
| 测试文档准备 | 未完成 | Production 列表可加载，但列表中没有明确标记为测试/可回滚的记录。为避免写入业务内容，未选择现有业务选题。 |
| 安全筛选 | 失败 | 在搜索框输入“测试”后，页面 ErrorBoundary 显示 `Cannot read properties of null (reading 'toLowerCase')`。浏览器 console 定位为 `src/pages/Production.tsx:187` 的列表过滤。 |
| room | 未执行 | 未获得可用 Production detail document id，不能确认 `production:<id>` 的真实双用户 room。 |
| 双用户同步 / presence / provider | 未执行 | 缺少安全测试文档。 |
| Autosave / `version_action: 'none'` | 未执行 | 未向任何 Production 记录输入内容，因此没有 PUT 请求或 payload 可验证。 |
| 粘贴、刷新、断线、destroy | 未执行 | 同上。 |

该 Production 列表筛选异常属于独立页面数据健壮性问题，不在本阶段允许修复范围内；未修改代码。

## 3 Shooting测试结果

| 验证项 | 结果 | 证据 / 说明 |
| --- | --- | --- |
| 测试文档准备 | 未完成 | Shooting 列表搜索“测试”后显示“暂无制作计划”，没有可识别的测试记录。 |
| room | 未执行 | 未获得可回滚 Shooting document id，不能确认 `shooting:<id>`。 |
| `script_content` 初始值 / 保存 | 未执行 | 未打开或编辑任何 Shooting detail。 |
| Autosave payload | 未执行 | 未产生 `updateShooting(..., { script_content })` 请求。 |
| workflow / Publishing 影响 | 未执行 | 未触发状态转换或 Publishing 流程，避免写入业务数据。 |
| 双用户同步 / presence / provider | 未执行 | 缺少安全测试文档。 |

## 4 粘贴重复问题结果

未执行。没有可回滚的 Production/Shooting 编辑文档，因此没有进行纯文本、HTML 富文本、大文本或多人同时粘贴测试。未观察或记录“通过”，也未向业务文档写入测试文本。

## 5 重连结果

未执行。断线与重连测试依赖已打开的同一协作文档和两端 provider；当前没有安全测试 document id，不能验证 `SocketYjsProvider`、awareness、presence 或内容恢复。

## 6 destroy结果

未执行。未进入 Runtime 实际编辑页，因此不能对 pending autosave 清理、离页后旧 document 不再写入、另一用户 session 不受影响作真实结论。

## 7 发现问题

1. **阻断：缺少标识明确的可回滚 Production/Shooting 测试文档。**
   - 影响：所有会写入内容的真实协同场景均不能安全开始。
   - 处理：未选择现有业务记录，未猜测其可回滚性。

2. **Production 列表筛选导致页面崩溃。**
   - 操作：管理员 A 在 `/production` 的“搜索选题标题或版本号...”输入“测试”。
   - 可见结果：ErrorBoundary 显示 `Cannot read properties of null (reading 'toLowerCase')`。
   - console 证据：`src/pages/Production.tsx:187` 的 `Array.filter` 调用。
   - 影响：无法通过列表安全筛选定位测试记录；此问题与 Runtime/Adapter/Yjs/Socket.IO 无直接证据关联。
   - 处理：按本阶段限制仅记录，未现场修复。

3. **无法验证 Runtime 真实行为。**
   - Production/Shooting 的 Runtime autosave、双用户 room、provider 数量、initial content、粘贴、刷新、重连、destroy 均没有实际测试证据。

## 8 是否建议进入结构清理

**不建议进入结构清理。**

重新执行 C1 前需具备：

1. 一条明确命名、可删除/可恢复的 Production 测试记录及其 id；
2. 一条明确命名、可删除/可恢复的 Shooting 测试记录及其 id；
3. 两个账号对这两条记录均有可编辑权限；
4. Production 列表筛选问题已由独立修复任务处理，或直接提供测试详情 URL/id 以绕过列表筛选；
5. 确认可在测试记录上写入并在结束后删除/恢复测试内容。

在这些条件满足前，不能输出“Phase C1 通过，可以进入后续 Runtime 清理评估”。
