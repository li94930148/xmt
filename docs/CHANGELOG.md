# XMT 系统更新日志

## v2.20.21 - 2026-09-10

### 新增

- 无。

### 优化

- 删除 Auth Web Runtime 中没有生产调用点的认证模式解析函数，保留当前双轨运行仍依赖的模式类型。
- 对代码精简清单中的 Social Review、JWT 兼容入口、数据库兼容表、认证灰度、Topics 双轨和脚本逐项执行引用核验，避免按静态结论误删仍在使用的能力。

### 修复

- 从共享用户模型、请求认证用户和 Legacy/v1 登录响应适配结果中移除 `password` 字段。即使服务端历史响应意外携带该字段，客户端用户状态也不会接收或持久化。
- Creator Agent 升级至 v2.13.9-agent：macOS 封面来源检查改为单 Worker 浏览器会话，专用 Chrome 禁止后台驻留并等待 Profile 锁释放；Renderer 只显示固定错误分类，不显示浏览器原始异常。

### 技术升级

- 无。

### 数据库变化

- 无 schema 迁移，不修改业务数据、用户密码哈希、角色、权限或 Auth Session。

### 测试情况

- 登录响应适配合同新增 Legacy/v1 均不含 `password` 的断言。
- 执行 Login Response Adapter、Auth Web Runtime、Legacy Auth 冻结测试、类型检查、测试入口、版本检查、依赖审计和生产构建。

## v2.20.20 - 2026-09-09

### 安全

- 休眠的 Social Review 路由统一要求 `analytics:view`，账号、采集任务、错误记录与指标端点不再依赖逐路由手工挂载权限；登录会话、删除和计划管理继续要求管理员。
- Social Review 与总结归档的未知异常统一返回固定 `INTERNAL_ERROR` 和安全提示，内部异常仅记录错误类型；明确的参数、账号和凭据业务错误仍保留可读提示。
- 用户权限缓存 TTL 从 5 分钟缩短到 60 秒，权限和角色写路径原有的主动失效保持不变。

### 修复

- 用户、操作日志和活动日志分页统一校验正整数，页码最小为 1，每页最多 200 条，非法输入回退到安全默认值。
- 修复 4 处工作流通知把选题标题显示为 `?{topic.title}` 的模板插值错误。

### 数据库变化

- 无 schema 迁移，不修改业务数据、角色、权限分配或认证协议。

### 测试情况

- 新增代码审查整改合同，覆盖 Social Review 权限、未知异常脱敏、分页上限及通知模板。
- 执行既有错误响应 HTTP/纯函数合同、总结归档合同、日报权限合同、类型检查、版本检查、生产依赖审计与生产构建。

## v2.20.19 - 2026-09-09

### 新增

- 新增 Creator 封面受控资产表和登录态图片读取接口。

### 优化

- Creator Agent 从已认证浏览器响应中提取通过 MIME、魔数、哈希和体积校验的封面字节，并随加密作品包同步。
- 官方导出与常规作品同步改为两个独立幂等步骤，下载到官方文件时不再跳过作品与封面包。

### 修复

- 修复生产端直接访问抖音防盗链或过期签名地址导致封面无法显示的问题。
- 修复同一账号下标题和精确发布时间相同、但采集 ID 不同的作品重复展示与重复计入驾驶舱的问题。
- 修复作品库追加分页时相同记录重复进入前端状态的问题。

### 技术升级

- Creator Agent 升级至 v2.13.8-agent。

### 数据库变化

- 新增 `creator_cover_assets` 表；按账号和平台作品 ID 幂等保存受限封面，不改写或删除历史作品数据。

### 测试情况

- 执行 canonical 合并、封面资产校验、存储可见性与权限、Collector Python、Root/Agent 类型检查和生产构建。

## v2.20.18 - 2026-09-08

### 新增

- 新增认证态亮色模式对比度浏览器回归，覆盖选题列表与详情页。

### 优化

- 增加深色与亮色独立的品牌语义前景色令牌，共享状态和操作控件不再依赖固定浅色文字。

### 修复

- 修复 React Bits SpotlightCard 默认固定黑底，导致亮色模式下选题统计卡背景与文字不可读的问题。
- 修复选题详情关联资料列表的固定白色边框、灰白文字和悬停底色。
- 修复选题、创作、成片、发布、日报、日历、用户、资料中心及通用错误/确认提示中的同类亮色对比度问题。

### 技术升级

- 无。

### 数据库变化

- 无 schema 迁移，不修改业务数据、权限或 API 语义。

### 测试情况

- 执行亮色对比度浏览器回归、类型检查、生产构建、版本一致性与发布安全门禁。

## v2.20.17 - 2026-09-08

### 新增

- 无

### 优化

- 无

### 修复

- 修复新建账号未填写姓名时，认证成功后前端误报“当前服务暂时不可用”的问题。
- Legacy 与 v1 Web 登录响应在显示名为空或只有空白时统一回退到用户名。
- 修复生产构建丢失主题颜色变量，导致首页卡片变黑、控件和区域出现异常深色框线的问题。

### 技术升级

- 无

### 数据库变化

- 无 schema 迁移；生产目标账号的空姓名已在在线备份和完整性检查后回填为用户名，密码、角色、权限及启用状态未变。

### 测试情况

- 增加 Legacy 与 v1 Web 空显示名适配回归；执行认证定向测试、类型检查、版本一致性检查与生产构建，并核对构建产物包含主题变量定义。

## v2.20.16 - 2026-09-07

### 新增

- CI 增加测试入口存在性检查与全量依赖 high/critical 安全门禁。

### 优化

- 动画统一从 motion/react 导入，移除重复直接依赖；Vercel 转发入口使用 Node HTTP 类型，移除仅用于类型的构建工具依赖。
- ESLint 排除打包副本与 Python 虚拟环境，保留真实源码规则。

### 修复

- 修复 HTTP 脱敏测试脚本路径错误造成 PR #41 CI 失败；测试使用独立临时数据库并在 finally 关闭连接与服务。

### 技术升级

- 定向更新 Vite 6 补丁、tsx、PostCSS 与受影响开发工具链；xcode 单独覆盖 uuid 11.1.1，保留 CommonJS v4 调用兼容性。

### 数据库变化

- 无 schema、权限或业务数据变更。

### 测试情况

- HTTP 脱敏与 xcode UUID 实际调用通过；全量 npm audit 为 0。完整回归结果见 docs/MAINTENANCE_2026-09-07.md。

## v2.20.15 - 2026-09-07

### 安全

- 升级 `@tiptap/*` 全家桶到 ^3.31.0，修复 `mergeAttributes()` 在 `__proto__` 上把自有键变为可继承可执行 DOM 属性的中危漏洞。
- `package.json#overrides` 把 `qs` 锁定到 6.16.0，修复 express / body-parser 链路上的 `qs` 数组上限绕过与 `isBuffer` DoS 中危漏洞。
- 新增 HTTP 级错误脱敏拦截器回归测试 `tests/security/error-response-http-contract.test.ts`，直接起真实 app、注入探针路由触发 5xx，断言响应不含 SQL 与绑定参数；任何后续改动若误删 `api/app.ts:267` 拦截器本体会立即失败。

### 修复 / 改进

- 新增 `api/utils/limits.ts` 统一请求体与同步包体积常量：`HTTP_JSON_BODY_LIMIT` / `CREATOR_SYNC_MAX_PAYLOAD_BYTES`。`api/app.ts` 全局 413 文案与 `creatorSyncV291.ts` 同步包 413 文案均改为引用该模块，消除魔法数字与"12MB / 16MB"两种提示并存的不一致。
- 抖音官方导出 xlsx 解析改用 `sheet['!ref']` 在展开前判断行 / 列数（20000 行 / 200 列），命中限制直接抛错，避免把整张表展开为内存数组后才校验。
- 移除 `api/services/creatorDataCenter.ts` 中未被引用的 `acceptCreatorDataSync` 死代码副本（长期与 `creatorSyncV291.ts` 同名函数并存），以及随之失效的辅助函数 / 导入。
- 成就进度接口按 `condition_type`（`login_streak` 额外按时间窗）聚合缓存查询，消除成就列表增长后的 N+1 计数。
- 新增 `deploy/linux/HTTPS_REQUIRED.md`，明确 `upgrade-insecure-requests` CSP 指令下 XMT 必须部署在 HTTPS 站点之后；`docs/上线前检查清单.md` 同步补充对应章节。

### 数据库变化

- 无迁移、无破坏性 schema 变更。

### 版本与兼容性

- XMT 升级至 v2.20.15；不影响 RBAC、Session、Creator Agent 上传协议、Scrapling Collector 合同或任何对外 API。
- `package-lock.json` 同步更新后，请运行 `npm ci` 刷新本地 `node_modules`。
- Creator Agent 桌面端版本保持 v2.13.0-agent 不变。

## v2.20.14 - 2026-09-04

### 修复

- 月报、年报归档列表新增明确"查看详情"入口，点击条目也可打开详情。
- 月报详情分别展示工作总结、重点项目、问题与计划；年报详情分别展示年度总结、主要成果、经验不足、下一年度计划。
- 详情读取保持管理员权限边界，并对非法参数、无权限和记录不存在分别返回正确状态。

### 数据库变化

- 无 schema 或 migration 变更，不改写历史月报、年报数据。

### 测试情况

- 覆盖归档详情全字段、403、404、历史兼容、组件完整渲染与日报权限回归。

## v2.20.13 - 2026-09-04

### 修复

- 修复月报、年报表单以 snake_case 发送正文而服务端仅读取 camelCase，导致提交后归档正文为空的问题。
- 归档接口统一输出 `display_content_md`，优先使用月报/年报规范正文，并兼容旧 `content_md` 历史数据。
- 空值、纯空白与空 HTML 节点才显示"未填写内容"；日报归档路径与权限规则保持不变。

### 数据库变化

- 无 schema 或迁移变更；生产中已确认正文两字段均为空的历史记录不能由代码恢复或伪造。

### 测试情况

- 新增月报、年报写入、归档显示、历史兼容、空正文、成员筛选和访问控制合同测试。

## v2.20.12 - 2026-09-02

### 修复

- 增加封面候选 403 的有限脱敏诊断矩阵，区分 HEAD 兼容性、防盗链、远端拒绝及不安全网络目标。

### 测试情况

- 覆盖请求头白名单、Referer 对照与无认证信息合同；无数据库变化。

## v2.20.11 - 2026-09-02

### 修复

- 修复 Creator 内容页 XHR 双重转义导致 metadata-only 未捕获来源却显示作品 0 的问题。
- Main、Bridge、Preload 与 Renderer 仅投影固定错误码和阶段聚合；Agent 为 `v2.13.6-agent`，无迁移和生产数据变更。

## v2.20.10 - 2026-09-02

### 修复

- 将 Creator Agent 的 Main-only HMAC 身份投影与 Preload/Renderer 的纯浏览器安全状态契约拆分，避免 sandboxed Preload 导入 Node 内置模块。
- Preload API 缺失时 Renderer 显示固定脱敏错误页；最终 macOS arm64 打包制品验证 contextBridge 与非空界面。

### 技术升级

- Agent 升级至 `v2.13.5-agent`；不新增迁移，不改变普通同步或 metadata-only 的 Main 权威门禁。

## v2.20.9 - 2026-09-01

### 安全修复

- Creator Agent Renderer 不再接收完整绑定配置、账号 ID、设备绑定 ID 或完整昵称；仅显示 Main 生成的短审计标识与范围状态。
- `agent:get-state` 与 `agent:state` 经 preload 运行时白名单投影；未知字段、历史日志和原始异常上下文不会进入 Renderer、DOM 或可访问性树。

### 技术升级

- Agent 升级至 `v2.13.4-agent`。普通同步和 metadata-only 继续由 Main 内部解析当前绑定账号。

### 安全

- 升级 `@tiptap/*` 全家桶到 ^3.31.0，修复 `mergeAttributes()` 在 `__proto__` 上把自有键变为可继承可执行 DOM 属性的中危漏洞。
- `package.json#overrides` 把 `qs` 锁定到 6.16.0，修复 express / body-parser 链路上的 `qs` 数组上限绕过与 `isBuffer` DoS 中危漏洞。
- 新增 HTTP 级错误脱敏拦截器回归测试 `tests/security/error-response-sanitization-http.test.ts`，直接起真实 app、注入探针路由触发 5xx，断言响应不含 SQL 与绑定参数；任何后续改动若误删 `api/app.ts:267` 拦截器本体会立即失败。

### 修复 / 改进

- 新增 `api/utils/limits.ts` 统一请求体与同步包体积常量：`HTTP_JSON_BODY_LIMIT` / `CREATOR_SYNC_MAX_PAYLOAD_BYTES`。`api/app.ts` 全局 413 文案与 `creatorSyncV291.ts` 同步包 413 文案均改为引用该模块，消除魔法数字与"12MB / 16MB"两种提示并存的不一致。
- 抖音官方导出 xlsx 解析改用 `sheet['!ref']` 在展开前判断行 / 列数（20000 行 / 200 列），命中限制直接抛错，避免把整张表展开为内存数组后才校验。
- 移除 `api/services/creatorDataCenter.ts` 中未被引用的 `acceptCreatorDataSync` 死代码副本（长期与 `creatorSyncV291.ts` 同名函数并存），以及随之失效的辅助函数 / 导入。
- 成就进度接口按 `condition_type`（`login_streak` 额外按时间窗）聚合缓存查询，消除成就列表增长后的 N+1 计数。
- 新增 `deploy/linux/HTTPS_REQUIRED.md`，明确 `upgrade-insecure-requests` CSP 指令下 XMT 必须部署在 HTTPS 站点之后；`docs/上线前检查清单.md` 同步补充对应章节。

### 数据库变化

- 无迁移、无破坏性 schema 变更。

### 版本与兼容性

- XMT 升级至 v2.20.15；不影响 RBAC、Session、Creator Agent 上传协议、Scrapling Collector 合同或任何对外 API。
- `package-lock.json` 同步更新后，请运行 `npm ci` 刷新本地 `node_modules`。
- Creator Agent 桌面端版本保持 v2.13.0-agent 不变。

## v2.20.8 - 2026-09-01

### 新增

- Creator Agent 增加"检查最新封面来源（仅本地）"能力，只返回脱敏统计摘要。

### 优化

- 封面候选检测加入公网、重定向、响应大小、Content-Type 与图片魔数限制。

### 技术升级

- Agent 升级至 `v2.13.3-agent`；检查调用图与同步、队列和上传完全隔离。

### 数据库变化

- 无。

## v2.20.7 - 2026-08-31

### 修复

- Creator 作品封面兼容同步路径不再写入相对 URL；仅保存可加载的 HTTP(S) URL，并保留已有有效封面。
- 历史读取自动使用既有 raw 数据回退恢复可解析封面；缺少可信来源时显示正常占位，不生成虚假封面。

## v2.20.6 - 2026-08-31

### 修复

- 认证事实、登录窗口状态和同步能力由 Main 分别维护；已认证 Profile 在窗口关闭或 Main 恢复后仍会重新检测，不再被窗口状态误清除。
- Renderer 只消费 `canSync` 和 `loginAction` 快照，无法伪造可同步状态；失败前置检查不会入队或发起 HTTP 请求。

## v2.20.5 - 2026-08-31

### 修复

- Creator Agent 的登录窗口、确认按钮和 Profile 登录结果统一由 Electron Main 状态机提供；Renderer 刷新不会沿用旧窗口状态。
- 无存活登录窗口时 `agent:login-complete` 返回稳定代码 `LOGIN_WINDOW_NOT_OPEN`；界面只显示脱敏中文提示。
- 浏览器显示使用实际解析的 session / driver，未解析到受支持浏览器时登录和同步均禁用。

### 测试情况

- 覆盖登录窗口关闭、Main 重启、Renderer 刷新、已登录 Profile、无可用浏览器、SQLite 队列与包内 arm64 driver 回归。

## v2.20.5 - 2026-08-28

### 修复

- API 的 500 响应不再序列化底层异常对象，避免泄露 SQL、绑定参数和驱动内部字段。
- 拍摄计划与发布管理列表改为上限为 100 的分页查询，前端可翻页访问后续数据。
- 修正请求体超过 16MB 时仍提示 12MB 的不一致文案。

### 技术升级

- `react-router-dom` 升至 7.18.2；锁定 Socket.IO、`ws`、`ip-address` 等传递依赖的修复版本。
- 官方 Excel 解析改用 SheetJS 官方 CDN 的 0.20.3，并限制文件大小、行数和列数。
- 增加 Helmet 响应头与 Socket.IO 单包 1MB、20 秒心跳超时限制。

### 数据库变化

- 无。

### 测试情况

- 新增错误响应脱敏和 Workflow 分页合同；完整校验见本次验证记录。

## v2.20.4 - 2026-08-28

### 修复

- Creator Agent 队列 payload 使用稳定 JSON TEXT，拒绝未定义值、对象数组和非有限数直接绑定 SQLite。
- 旧本地数据库启动时幂等创建 upload_queue，并在同步前完成数据库就绪校验。

### 测试情况

- SQLite 类型边界、旧库迁移、真实 Electron IPC、队列与 loopback HTTP 回归纳入本地门禁。

## v2.20.3 - 2026-08-28

### 新增

- Creator Agent 本地官方 Excel 标准化解析、质量摘要与 v2 加密上传。

### 优化

- 以文件哈希、稳定批次、业务键和值比较防止重复写入和重复累计。

### 修复

- 无。

### 技术升级

- 服务端在既有 AES-256-GCM、HMAC-SHA256、五分钟时间窗、nonce 防重放和账号绑定校验之后，事务处理新版数据包；旧 v1 协议保持兼容。

### 数据库变化

- 新增官方导出批次、文件审计和指标表；不保存原始 Excel。

### 测试情况

- Agent/root typecheck、Agent build、v1 安全与契约测试、v2 官方导出契约测试通过；真实文件解析通过。

## v2.20.2 - 2026-08-27

- 补回 Android Native Auth 真实登录后的显式生命周期绑定、连续 refresh 重排和恢复补偿，并纳入核心安全 CI。
- XMT / Android 版本统一为 2.20.2 / 22002；Creator Agent 保持 2.12.1-agent，无数据库迁移。
- 归档 v2.17.2 Socket 业务时段只读观察报告，不重复迁移已进入主线的日报布局代码。

## v2.20.1 - 2026-08-26

- 修复 works SQLite 非标量字段持久化，新增无 UI CLI E2E 入口与官方双导出验收。

## v2.20.0 - 2026-08-18

- Creator Collector 切换为 Scrapling First Python Worker，使用独立 Profile 和脱敏能力清单。
- Creator Agent 升级至 v2.12.0-agent，移除旧 Node Collector 与已提交构建产物。

## v2.19.11 - 2026-08-20

- Creator Agent `/data-sync` 固定要求 V1 信封，HMAC 覆盖 timestamp、nonce 与业务字段；有效签名后才原子预留 `(agent_id, nonce)`。
- 已退役旧 `/api/creator-agent/report` 上传入口，返回 410；无数据库迁移、无 Creator 业务数据删除。
## v2.19.10 - 2026-08-20

- v2.19.9 安全补充：Legacy 401 Recovery 改用精确 URL Origin，拒绝伪同源、错误端口与 HTTP 降级，防止新 Bearer Token 泄漏。
- `/api/roles/user/:userId` 在事务前完整验证所有角色；角色创建和修改的 `permission_ids` 受调用者有效权限上限约束。
- 新增认证 Origin、角色授予与角色权限上限回归测试，并纳入核心安全 CI 门禁。

## v2.19.9 - 2026-08-20

- 修复用户管理的角色提权边界：非管理员不能授予 admin 或超过自身有效权限集合的角色。
- 富文本与 Markdown 预览新增统一 HTML 安全净化；畸形协作 Yjs update 被拒绝且不会影响 API 进程。
- Webhook 采用 fail-closed 验签；账号禁用立即撤销 Auth V1 会话并断开在线 Socket。
- Legacy Web / Android HTTP 401 接入既有 refresh runtime；安全回归合同进入 CI。

## v2.19.8 - 2026-08-17

- 修复 clean Android build 未确定性注入生产 API / Socket 地址的问题；新增独立 Production Build Profile 与 APK 构建元数据。
- Native Production endpoint 缺失、相对 `/api`、localhost 或 HTTP 地址均 fail-closed；HTTP 200 HTML 不再被接受为移动 API 健康响应。

## v2.19.7 - 2026-08-17

- 修复 Android Native Auth 在 access token 临期时没有独立自动续期的问题；登录、冷启动、前后台恢复和网络恢复均由 Native Runtime 自主检查。
- 保持 refresh single-flight；瞬时网络失败保留 Keystore 凭据并受限重试，终态认证失败才清理会话。

## v2.19.6 - 2026-08-14

- 修复 Android Capacitor WebView `https://localhost` 的精确 CORS Origin 兼容，同时拒绝任意端口、局域网地址与伪造域名。
- 新增 HTTPS localhost 的真实 HTTP GET / OPTIONS CORS 合同测试，验证 credentials 与恶意 Origin 不反射。

## v2.19.5 - 2026-08-14

- 新增编辑器 Word 式格式刷：支持单次与连续应用、Esc 退出、字符级与段落级格式复制，以及独立撤销。
- 格式刷保留 Tiptap / ProseMirror、Yjs 协作、自动保存和历史快照链路；链接、批注和业务元数据不会复制。

## v2.19.4 - 2026-08-14

- 修复正式部署的公网 Internal Exposure 检查未读取权威运行时文件的问题，并为服务重启后的健康检查加入有界重试。

## v2.19.3 - 2026-08-14

- 修复日报页面在 Glass Surface 外观下的宽屏布局，表单区块恢复纵向全宽排列。

## v2.19.2 - 2026-08-13

- 修复 Internal Runtime 接口可经反向代理访问的问题，统一保护全部 `/internal/*`。
- 建立确定性的 Production Runtime Env 加载、PM2 回读与部署安全门禁。

## v2.19.1 - 2026-08-13

### 安全

- 新增 Android Mobile Auth/Mobile Socket 独立生产 allowlist 准入，并关闭 Generic V1 Login 灰度旁路。

## v2.19.0 - 2026-08-13

### 新增

- 新增 Android 移动办公客户端基础工程、平台运行时与安全认证合同。

## v2.18.4 - 2026-08-13

### 修复

- 正式部署入口在服务重启前强制执行版本一致性 Gate。

## v2.18.3 - 2026-08-13

### 修复

- 正式部署入口强制校验精确目标 SHA，并在 PM2 重启前验证本次部署备份可进行非破坏恢复演练。

## v2.18.2 - 2026-08-12

### 新增

- 非破坏性 SQLite 备份恢复演练与迁移兼容性检查。

### 优化

- 备份入口使用统一锁协议，部署前检查迁移是否可安全回退应用代码。
- 版本一致性检查覆盖工程、页面与发布文档。

### 修复

- 无。

### 技术升级

- 无数据库 schema 变化。

### 数据库变化

- 无。

### 测试情况

- 运维脚本、迁移 Gate、版本校验与核心安全回归待 CI 验证。

## v2.18.1 - 2026-08-12

### 新增

- 协作文档服务端访问策略、只读参与者边界与真实 Socket.IO/Yjs 房间授权黑盒测试。
- GitHub Actions 核心安全契约门禁。
- 逐项 PASS/FAIL/UNKNOWN 的只读 Auth 生产准入检查，以及 Creator Agent v1 协议退役开关与遥测。

### 优化

- SQLite 部署备份强制使用在线备份并校验副本可读性，部署失败自动恢复上一应用提交。

### 修复

- 拒绝未授权协作房间、未加入房间的更新与 awareness 事件。
- 角色分配拒绝空角色、重复角色和不存在角色，并在同一事务内同步主角色。
- 备份下载与删除拒绝非法文件名。

### 数据库变化

- 无数据库 schema 变化。

### 测试情况

- 协作访问策略、真实 Socket.IO 授权黑盒、Auth readiness、Auth、Socket、Yjs、API Contract、Topic、类型检查和安全部署脚本语法检查通过。

## v2.18.0 - 2026-08-12

### 新增

- React Bits Scene 场景化页面编排体系与页面级视觉应用范围。
- 岚曜极光、深空科技、丝绸创意、线性协作、极简无扰、自由搭配六套视觉方案。
- Settings Scene Preview、配置导入导出、恢复默认与持久化能力。
- Persistent-Off、Guard-Only 与关键场景浏览器自动化回归。

### 优化

- Home、Topics、Daily Report、Creator、Analytics、Workflow、Editor 页面视觉表现、响应式体验、字号、深浅主题与 motionMode。
- Canvas owner/lifecycle 管理与 Appearance Center 信息架构。

### 修复

- Silk / React Three Fiber 生命周期兼容问题与动效关闭后的 Canvas 残留风险。
- Settings 主题 select accessible name、React Bits locator、A11Y 与视觉裁切问题。

### 技术说明

- Workflow Engine、Backend、API、permissions、Socket.IO、Yjs 与 Database 未修改。

## v2.17.3 - 2026-08-10

### 新增

- 新增开发环境 Socket 客户端生命周期诊断与 polling SID 调查回归。

### 优化

- 浏览器 Socket 测试改用本地真实 Socket.IO polling 连接，覆盖刷新、断网恢复和重新登录。

### 修复

- 明确生产 allowlist 审批不会替代显式 Auth v1 开关。

### 数据库变化

- 无。

### 测试情况

- Socket 生命周期、客户端诊断、Chromium 恢复、Coordinator、Yjs 恢复、类型检查、构建与版本检查通过。

## v2.15.5 - 2026-08-06

### 新增

- 新增 Socket 生命周期安全观测、Session ID unknown 分类和仅本机可访问的运行摘要。

### 优化

- Socket 重连仅上报安全次数，不携带认证信息或协作内容。

### 修复

- 停止在 Engine.IO 异常日志中输出原始 sid。

### 数据库变化

- 无。

### 测试情况

- Socket 生命周期、Coordinator、Yjs 恢复、类型检查、构建与版本检查通过。

## v2.15.4 - 2026-08-06

### XMTCard 应用补全

- Dashboard 数据指标、Topics 统计与列表容器、Workflow 模板与节点、Creator 指标卡统一接入 XMTCard。
- Dashboard 继续使用 AnimatedNumber 和 ProgressBar，数据请求与业务逻辑保持不变。
- 保留现有权限过滤、Workflow 状态机、API、数据库、Socket.IO、Yjs 和 Creator Agent。

## v2.15.3 - 2026-08-05

### React Bits 风格 UI 体验升级

- 新增 `src/design-system/`，集中管理 XMTTheme、AnimatedNumber、ProgressBar 和 XMTCard。
- 首页指标卡支持轻量数字递增、完成率进度动画和克制的 hover 浮动。
- 通用 EmptyState、LoadingState、FormModal、ConfirmModal 和页面切换接入统一动效规范。
- Sidebar 展开收缩增加平滑过渡，并继续沿用原权限过滤和移动端逻辑。
- 不涉及后端 API、数据库、权限、Workflow Engine、Socket.IO、Yjs、Creator Agent。

## v2.15.2 - 2026-08-05

### 修复

- 修复成就与番茄钟排行榜读取不存在的用户头像字段导致的 SQLite 兼容错误。
- 修复发布类成就仍读取旧 publishing 指标字段的问题，改用选题最新数据统计。

### 技术升级

- 新增旧 schema 兼容专项测试，覆盖无头像字段及发布指标字段的历史数据库结构。

### 数据库变化

- 无。未新增 migration、表或字段。

### 测试情况

- Schema 兼容、Auth、Socket Bridge、Socket Coordinator、Yjs 恢复、Topic、类型检查、构建和版本检查通过。

## v2.15.1 - 2026-08-04

### 日报填写体验调整

- 我的日报固定加载当天，不再选择历史日期。
- 移除保存草稿按钮，日报填写后直接提交。
- 输入区改为可直接输入的文本框；本人可修改已提交日报并再次提交。
- 月报、年报合并到我的日报，通过记录类型切换，默认显示日报。
- 总结归档增加日报、月报、年报筛选按钮，并支持成员和日期/年份筛选。
- 保留既有日报、月报、年报及审计数据，不删除历史记录。

## v2.15.0 - 2026-08-04

### 日报系统轻量化重构

- 日报页面收敛为“我的日报、团队日报、总结归档”三个入口。
- 我的日报改为“今日工作、明日计划、需要协调事项”三项表单。
- 新增月报和年报表单，支持保存个人总结；管理员可查看全部月报、年报和日报归档。
- 团队日报仅展示成员、日期和日报内容。

### 删除展示

- 移除日报统计、趋势分析、工作量排名、风险等级、关键数据、自动草稿、日历和复杂驾驶舱展示。
- 保留原有日报及总结数据表和历史数据，不删除数据库记录。

### 权限与验证

- 成员可创建和修改自己的日报、月报、年报，并查看团队公开日报。
- 管理员可查看全部日报、月报和年报；权限隔离继续由服务端校验。
- 类型检查、生产构建、日报接口回归和权限隔离验证通过。

## v2.14.7 - 2026-08-04

### 日报工作台 V2

- 正式发布日报工作台 V2：新增日报日历、月度总结、年度总结、团队统计与数据分析页面及 API。
- 新增数据库迁移 `006_daily_workspace_v2`，支持月度/年度总结 UPSERT、日报模板归属与排序字段。
- 日报编辑器接入 Tiptap 富文本、模板 CRUD 与权限控制；草稿支持 30 秒自动保存，自动保存不递增版本、不写审计日志。
- 新增路由：`/daily-report/calendar`、`/daily-report/monthly`、`/daily-report/yearly`、`/daily-report/team`、`/daily-report/analytics`。

### 发布验证

- 类型检查、生产构建、数据库迁移与 API 健康检查通过。

## v2.14.6 - 2026-08-03

### 新增

- 新增一次性 Auth 灰度浏览器观测夹具：关联登录 requestId、浏览器尝试 ID、响应类别、适配器、运行态与最终路径。

### 优化

- 登录请求统一携带可关联的 requestId；标准 v1 envelope 从 `meta.requestId` 读取关联 ID。

### 修复

- 无。

### 技术升级

- 仅在开发、测试或浏览器夹具显式开启时输出无敏感 Auth Trace；登录成功但未进入首页将立即停止后续 Refresh、Socket、Yjs 与版本同步验证。

### 数据库变化

- 无。

### 测试情况

- Auth、Login Gateway、浏览器登录导航与灰度观测夹具、Socket 浏览器恢复、类型检查和构建通过。

## v2.14.5 - 2026-08-03

- 日报系统升级为 Daily Workspace：新增月报、年报、日历、团队统计和数据分析页面。
- 新增月度/年度总结存储、日报统计 API，以及只更新草稿的 30 秒自动保存接口。
- 日报编辑器增加 Bold、列表、任务列表与 Placeholder，保留原有提交、审核和审计流程。
- 新增日报工作台权限，并通过 006 号兼容迁移扩展模板字段。

## v2.14.4 - 2026-08-03

### 修复
- 修复本地 Auth 浏览器回归对系统 Chrome 的回退依赖，改为强制使用项目 Playwright Chromium。

### 技术升级
- 在受控浏览器运行环境中验证项目 Chromium 的启动与 Auth 浏览器回归链路。

### 数据库变化
- 无。

### 测试情况
- Auth 浏览器、Socket/Yjs 浏览器恢复、完整链路、legacy Auth、Login Gateway、Rollout、类型检查、构建和版本一致性检查通过。

## v2.14.3 - 2026-08-03

### 修复
- 修复 Login Gateway 为 allowlist 用户返回 v1 Web 响应时，前端仍按 legacy token 字段解析而无法完成登录的问题。

### 技术升级
- 新增统一登录响应适配层；v1 Access Token 仅进入内存运行态，Refresh Token 继续不进入 JSON、日志或浏览器存储。

### 数据库变化
- 无。

### 测试情况
- 新增 legacy / v1 响应、缺失字段和 refresh 响应隔离测试；认证、Socket、Yjs、类型检查和构建通过。
- 本机 Playwright Chromium 环境不匹配，浏览器回归待修复环境后复跑。

## v2.14.2 - 2026-08-01

### 优化
- 统一 Auth 灰度门禁的运行态配置来源，避免 `.env` 修改与 PM2 实际进程状态不一致。

### 技术升级
- 增加仅本机可访问的运行态诊断与基于运行态的灰度 readiness 校验。

### 数据库变化
- 无。

### 测试情况
- 新增 Auth 运行态配置回归测试。

## v2.14.1 - 2026-08-01

### 优化
- 增加 Auth 生产灰度只读准入检查、浏览器夹具和观察模板。

### 测试情况
- 灰度 readiness 单元测试通过。

## v2.14.0 - 2026-08-01

### 新增
- 创作大版本同步状态与强制切换提示。
### 优化
- 版本历史展示当前生效、历史版本与已替代状态。
### 修复
- 旧版本页面无法继续提交写入。
### 技术升级
- 协作层新增 `version:superseded` 事件。
### 数据库变化
- production_history 增加版本生命周期字段。
### 测试情况
- 类型检查和构建通过。

## v2.13.23 - 2026-08-01

### 新增

- 新增生产 Socket Bridge 三重门禁、只读诊断字段与生产预检查脚本。

### 优化

- 生产 v1 Socket 仅允许已审批的 Login allowlist 普通账号；非名单和受保护角色保持 legacy。

### 修复

- 移除生产环境对 Socket Bridge 的一刀切关闭，改为可审计的受控准入。

### 技术升级

- 预检查覆盖版本、commit、SQLite 健康、备份、Login Rollout 与 Socket Bridge 状态。

### 数据库变化

- 无数据库变化。

### 测试情况

- 新增生产 Socket Gate 测试，覆盖关闭、审批、allowlist、非名单与管理员保护。

## v2.13.22 - 2026-08-01

### 新增

- `/api/auth/login` 新增默认关闭的 Login Gateway 双轨准入能力。
- 新增 Gateway 专项测试，覆盖关闭、legacy、allowlist、非名单、受保护角色和 v1 适配器不可用回退。

### 优化

- allowlist 命中的普通账号可由 Gateway 交给 v1-web 适配器；其余请求继续进入原 legacy Controller。

### 修复

- 防止 v1 适配器缺失或不符合准入条件时误切换认证路径。

### 技术升级

- Gateway 不重复登录、Session 创建、activity_log 或指标计数；legacy/v1 各自保留原有处理链。

### 数据库变化

- 无数据库变化。

### 测试情况

- Login Gateway、Auth、Rollout、Socket、Coordinator、Yjs 与浏览器恢复回归通过。

## v2.13.21 - 2026-08-01

### 新增

- 新增正式 Login 双轨灰度策略文档与 `LoginRolloutPolicy` 准入层。
- 新增 `XMT_LOGIN_ROLLOUT_ENABLED`，默认关闭。

### 优化

- 明确 legacy 与 v1-web 并行、管理员保护、allowlist 优先和一键回滚边界。

### 修复

- 防止未审批的 percentage 模式或受保护角色进入 v1-web。

### 技术升级

- Login Policy 只负责决策，不改写 `/api/auth/login`、JWT、数据库或 Socket/Yjs 协议。

### 数据库变化

- 无数据库变化。

### 测试情况

- 新增 Login Rollout Policy 测试，覆盖关闭、legacy、allowlist、管理员保护、percentage 审批和生产回滚。

## v2.13.20 - 2026-08-01

### 新增

- 恢复本地 Playwright Chromium 执行环境，新增真实浏览器 Auth → Socket → Room → Yjs 闭环测试。
- 覆盖 Cookie 恢复、页面刷新、Socket 重握手、Room/Yjs 状态恢复和多标签 logout 同步。

### 优化

- 浏览器测试自动使用本机实际缓存的 Chromium 版本，避免 Playwright 版本与缓存版本不一致。

### 修复

- 修复多标签浏览器测试使用 opaque `about:blank` 页面导致 BroadcastChannel 无法互通的问题。

### 技术升级

- 增加真实 Socket.IO 测试服务器与浏览器端 Refresh/重连验证夹具。

### 数据库变化

- 无数据库变化。

### 测试情况

- Playwright 真实浏览器闭环、浏览器恢复回归、Auth/Socket/Yjs 测试均通过。

## v2.13.19 - 2026-08-01

### 新增

- 新增 `XMT_SOCKET_COORDINATOR_ENABLED` 前端受控开关，默认关闭。
- 新增 BroadcastChannel 多标签认证信号，只广播状态事件，不广播任何 Token。
- 新增浏览器 Socket Auth Recovery 契约测试。

### 优化

- Coordinator 可在 Auth Runtime 提供时接管 Socket 创建、Token 临期刷新和重连。
- 增加标准生命周期原因：`AUTH_EXPIRED`、`SESSION_REVOKED`、`USER_DISABLED`。

### 修复

- 避免多标签间传递 Access Token 或 Refresh Token。

### 技术升级

- 受控开关关闭时继续使用现有 legacy Socket 创建逻辑。

### 数据库变化

- 无数据库变化。

### 测试情况

- Coordinator、Yjs 恢复、Auth 回归和类型构建通过；Playwright 浏览器执行受本机浏览器运行环境限制时明确跳过并记录。

## v2.13.18 - 2026-08-01

### 新增

- 新增 Socket Coordinator，协调 Access Token 临期刷新、重新握手和受控重连。
- 新增 Room 恢复顺序与 Yjs Recovery Bridge，保留同一 Y.Doc 并在同步完成前冻结发送。

### 优化

- 断线恢复按 JOIN、Yjs SYNC、Awareness、typing、lock 的固定顺序执行，重复加入保持幂等边界。

### 修复

- 避免 Socket 重连期间提前发送 CRDT/协作状态，降低恢复窗口内的状态竞争风险。

### 技术升级

- 增加 Socket Coordinator 状态机：idle、connecting、authenticated、refreshing、reconnecting、expired。

### 数据库变化

- 无数据库表、字段、索引或 migration 变化。

### 测试情况

- 新增 Coordinator 与 Yjs 恢复契约测试，结果见 `UPGRADE_PROGRESS.md`。

## v2.13.17 - 2026-08-01

### 新增

- 新增 Socket Auth Bridge 基础模块，支持旧认证和新 Web 会话认证的独立校验路径。
- 新增 Socket Auth 契约与 Bridge 专项测试。

### 优化

- 协作加入房间时以服务端登录身份为准，避免客户端伪造展示身份。

### 修复

- 修复协作 presence 身份未与 Socket 认证身份绑定的基础风险。

### 技术升级

- 增加默认关闭的 Socket Bridge 开关和 Session ACTIVE 校验。

### 数据库变化

- 无数据库表、字段、索引或 migration 变化。

### 测试情况

- `test:auth-socket-contract` 与 `test:auth-socket-bridge` 通过，完整结果见 `UPGRADE_PROGRESS.md`。

## v2.13.16 - 2026-07-31

### 新增

- 新增 Socket/Yjs 当前认证审计、Auth Bridge 迁移设计和专项测试计划。

### 优化

- 明确短期 Access Token 刷新后的 Socket 重连、Room 恢复和 Yjs 状态恢复顺序。

### 修复

- 本阶段未修改代码；设计中识别并冻结 collaboration 展示身份与认证身份绑定风险。

### 技术升级

- 定义 `SocketAuthContext` 以及 Legacy → Bridge → v1 Socket 可回滚迁移契约。

### 数据库变化

- 无数据库表、字段、索引或 migration 变化。

### 测试情况

- 完成文档、版本和差异检查；本阶段不运行生产 Socket 变更测试。

## v2.13.15 - 2026-07-31

### 新增

- 新增受内网访问控制的 Auth Prometheus 指标端点。
- 新增 Prometheus、OTel Collector、告警规则配置样例及正式 Login 迁移计划。

### 优化

- 指标增加稳定实例标识，支持多实例定位和聚合治理。
- 明确活跃会话指标的实例语义，避免错误求和。

### 修复

- 无认证业务行为修复；本阶段只建设观测接入与迁移设计。

### 技术升级

- 新增模拟 Prometheus scrape、OTel Collector、告警规则和敏感标签检查的集成测试。

### 数据库变化

- 无数据库表、字段、索引或 migration 变化。

### 测试情况

- 完整验证结果见 `UPGRADE_PROGRESS.md`。

## v2.13.14 - 2026-07-31

### 新增

- 新增 Auth Metrics Registry、Prometheus Exporter 与厂商无关 OpenTelemetry 适配。
- 新增 Refresh 失败率、Token reuse、CSRF 与 Expired 告警规则基础。

### 优化

- 认证指标支持同时分发到 Memory、Prometheus 和 OTel，管理诊断可查看来源、状态及最近导出时间。
- 增加活跃 Session Gauge 与 Refresh 耗时 Histogram。

### 修复

- 多 Exporter 复用同一个 Auth Event 事实，避免因输出目标增加而重复计数。

### 技术升级

- Prometheus 输出标准 Counter、Gauge、Histogram；OTel 适配不绑定具体厂商。

### 数据库变化

- 无数据库表、字段、索引或 migration 变化。

### 测试情况

- 新增 Auth Metrics Exporter 专项测试，完整验证结果见 `UPGRADE_PROGRESS.md`。

## v2.13.13 - 2026-07-31

### 新增

- 新增统一 Auth Event 模型、事件服务、mapper、指标服务与 Memory Exporter。
- 管理诊断新增最近 5 分钟事件统计，并继续提供 60 分钟、24 小时窗口。

### 优化

- 登录、Refresh、Logout、CSRF、Token reuse 和 Session 事件统一由事件事实派生指标，不再按日志行统计。

### 修复

- 修复生产灰度中单次成功认证被不同观测层重复计数的问题。

### 技术升级

- 新增 `AuthMetricsExporter` 的 `increment/observe/gauge` 抽象，为 Prometheus 与 OpenTelemetry 预留适配边界。

### 数据库变化

- 无数据库表、字段、索引或 migration 变化。

### 测试情况

- 新增 Auth Event 与生产灰度回归测试，完整验证结果见 `UPGRADE_PROGRESS.md`。

## v2.13.12 - 2026-07-31

### 新增

- 新增生产 Auth v1-web 独立批准门禁，仅允许经过复核的用户 ID allowlist。

### 优化

- 生产环境仅在 `XMT_AUTH_ROLLOUT_APPROVED=true` 且模式为 `allowlist` 时挂载 v1 Auth；`internal` 与 `percentage` 继续强制回落 legacy。

### 修复

- 无。

### 技术升级

- 增加生产门禁自动测试，覆盖未批准、批准 allowlist、非名单用户及禁止模式。

### 数据库变化

- 无数据库结构变化；生产灰度仅使用既有 Session 与 Refresh Token 表。

### 测试情况

- 本地验证全部通过；三个隔离 member 账号完成约 33 分钟生产灰度，浏览器闭环和 31 个连续健康样本通过，结束后已恢复 legacy。详细结果见 `AUTH_PRODUCTION_GRAY_REPORT.md`。

## v2.13.11 - 2026-07-31

### 新增

- 新增管理员只读认证迁移状态页面，可查看灰度模式、用户准入原因、运行指标、停止风险和配置审计。
- 新增 Auth Rollout Status、时间指标聚合、配置审计、阈值配置和风险判断服务。
- 新增认证灰度运行手册。

### 优化

- 登录、刷新、退出和失败指标支持按最近 60 分钟及 24 小时聚合。
- 停止条件达到阈值后生成只读风险事件，便于人工评估回滚。

### 修复

- 无。

### 技术升级

- 新增标准 `/api/v1/auth-rollout/status` 管理员诊断契约，并同步 OpenAPI。

### 数据库变化

- 无表、字段、索引或 migration 变化；指标和审计当前使用有界进程内记录。

### 测试情况

- 新增治理专项测试，并完成桌面、移动端真实浏览器检查；完整结果见 `UPGRADE_PROGRESS.md`。

## v2.13.10 - 2026-07-31

### 新增

- 新增统一认证灰度配置，支持关闭、旧认证、内部账号、白名单和稳定比例五种模式。
- 新增认证迁移指标与结构化事件，为后续灰度判断和问题回滚提供观测依据。

### 优化

- 现有双开关与用户 ID 白名单自动映射到新配置，避免升级时改变原有暗启范围。
- 同一用户使用稳定哈希分桶，多次登录和多实例判断结果保持一致。

### 修复

- 无。

### 技术升级

- 认证事件统一携带 requestId、可用时的 userId、认证模式和结果，禁止记录 Token 原文。

### 数据库变化

- 无表、字段、索引、migration 或业务数据变化。

### 测试情况

- 新增灰度治理专项测试，并完成 legacy Auth、Web Runtime、Cookie、API Contract、类型检查、范围 lint 与生产构建验证。

## v2.13.9 - 2026-07-31

### 新增

- 新增 Web Auth 真实浏览器暗启夹具与自动化契约测试。

### 优化

- 并发请求共享单次刷新；已获得新 Token 后到达的旧 401 直接使用新 Token 重试。

### 修复

- 修复 api-client 默认 fetch 在真实浏览器中失去调用上下文的问题。
- Refresh 失败时 Runtime 同步清除内存 Token 与用户状态并进入 expired。

### 技术升级

- 覆盖 F5、新标签页、关闭重开、Cookie 恢复、Refresh 失败、重放、CSRF、注销和 Feature Flag 门禁。

### 数据库变化

- 无表、字段、索引、migration 或生产数据变化；测试使用临时 SQLite。

### 测试情况

- 浏览器契约使用本机无界面 Chrome 执行；全量验证结果详见 `UPGRADE_PROGRESS.md`。

## v2.13.8 - 2026-07-31

### 新增

- 新增 v1 Web Auth 的 HttpOnly Refresh Cookie、Origin 与 CSRF HTTP 适配。
- 新增 Web 登录原子事务 Repository 和 Cookie 专项集成测试。

### 优化

- Web login/refresh 响应不再包含 Refresh Token 原文，refresh 只接受 Cookie 并在轮换后覆盖新 Cookie。
- Web logout 在 Access/Session 与 CSRF 验证后撤销当前会话并清除 Refresh/CSRF Cookie。

### 修复

- 无。

### 技术升级

- OpenAPI 与 Auth v1 Client 同步 Web Cookie 契约；专项测试覆盖 Cookie 属性、body 降级拒绝、CSRF、轮换、重放、退出和事务回滚。

### 数据库变化

- 无表、字段、索引或 migration 变化；只将现有三类登录写入纳入单一事务。

### 测试情况

- Auth、Session、v1、Web Runtime、Web Cookie、API Contract、类型检查、Auth 范围 lint、版本检查和生产构建按要求执行；详见 `UPGRADE_PROGRESS.md`。

## v2.13.7 - 2026-07-31

### 新增

- 新增未接入登录页面的 Web Auth Runtime、内存 Access Token Store 和认证状态机。
- 新增 Auth v1 客户端封装、Refresh Cookie 配置、CSRF 签名服务及用户 ID 白名单解析能力。

### 优化

- api-client 支持携带 Cookie、显式 v1 模式下单飞刷新，并将 401 原请求重试限制为一次。
- Web Auth 独立开关默认关闭，生产环境强制不可启用，只有白名单用户具备未来测试资格。

### 修复

- 无。

### 技术升级

- 新增 Web Auth Runtime 专项测试，覆盖模式、内存 Token、刷新单飞、401 重试上限、过期状态、Cookie、CSRF 和白名单。

### 数据库变化

- 无。未新增表、字段、索引、migration 或业务数据。

### 测试情况

- 版本、Auth 全链路、Web Runtime、API Contract、类型检查、Auth 范围 lint 和生产构建按要求执行；详细结果见 `UPGRADE_PROGRESS.md`。

## v2.13.6 - 2026-07-30

### 新增

- 新增默认关闭的实验性 Auth v1 登录、刷新、退出和会话查询接口。
- 新增 Auth v1 请求、响应与会话 Zod Schema，并加入 OpenAPI 实验标记。

### 优化

- v1 Auth 响应统一使用 success/data/meta/requestId 契约及稳定认证错误码。
- Feature Flag 在生产环境强制关闭，避免实验性 Refresh Token 响应体交付触达生产用户。

### 修复

- 无。

### 技术升级

- 新增 Auth v1 HTTP 集成测试，覆盖开关关闭、登录、刷新、复用检测、退出、会话列表及 legacy 登录兼容。

### 数据库变化

- 无新增表、字段、索引或 migration；继续复用现有认证会话基础表。

### 测试情况

- Auth v1、legacy Auth、Session migration/Service、API Contract、类型检查、Auth 范围 lint、版本检查和生产构建均按要求执行；详细结果见 `UPGRADE_PROGRESS.md`。

## v2.13.5 - 2026-07-30

### 新增

- 新增 Session Service，提供会话创建、状态判断、单会话撤销和用户全部会话撤销基础能力。
- 新增 Refresh Token 内核，提供安全随机值、分版本 HMAC hash、单次轮换和复用检测。
- 新增独立 v1 Access Token 创建与验证方法，支持完整会话声明。

### 优化

- Refresh Token 轮换在一个 SQLite 写事务内完成旧记录校验、消费、替换记录创建和会话活动更新。

### 修复

- 无。

### 技术升级

- 新增 Auth Session Service 专项测试，覆盖会话、token hash、单次消费、替换链、复用检测和 legacy JWT 隔离。
- 新内核未接入 Auth Service、路由、前端或 Socket。

### 数据库变化

- 无新增表或字段；继续使用 v2.13.4 已创建的 `auth_sessions` 与 `auth_refresh_tokens`。

### 测试情况

- Session migration、Session Service、legacy Auth、Topic、API Contract、类型检查、Auth 范围 lint、版本检查和生产构建均按要求执行；详细结果见 `UPGRADE_PROGRESS.md`。

## v2.13.4 - 2026-07-30

### 新增

- 新增认证会话与 Refresh Token 轮换记录的数据库基础表。
- 新增 Session Repository 基础接口和 SQLite 实现，为后续认证升级提供隔离的数据访问层。

### 优化

- 将 Auth Session 数据库变化纳入正式 migration 机制，支持事务执行、幂等检查和迁移状态记录。

### 修复

- 无。

### 技术升级

- 新增会话 migration 专项测试，校验表、字段、索引、外键和既有用户数据完整性。
- legacy `/api/auth/*`、JWT、前端和 Socket 认证行为保持不变。

### 数据库变化

- 新增 `auth_sessions` 表及用户、绝对到期、空闲到期索引。
- 新增 `auth_refresh_tokens` 表及 token hash 唯一索引、session generation 唯一索引和查询/清理索引。
- 未修改 `users` 或其他已有表结构与数据。

### 测试情况

- Session migration 专项测试、Auth 行为冻结测试、Topic 测试、API Contract 测试、类型检查、定向 lint、版本检查和生产构建均按本阶段要求执行；详细结果见 `UPGRADE_PROGRESS.md`。

## v2.13.3 - 2026-07-30

### 新增

- 新增当前用户、修改密码和退出登录的认证行为冻结测试。

### 优化

- 完成认证模块第一阶段收口，统一登录、当前用户、修改密码和退出登录的内部处理边界。

### 修复

- 无。

### 技术升级

- 认证接口统一通过 Route、Controller、Service 和 Repository 分层处理。
- 旧接口路径、返回格式、错误消息和中间件顺序保持不变。

### 数据库变化

- 无。未新增或修改任何表、字段、索引、数据和迁移脚本。

### 测试情况

- Auth 行为冻结测试、Topic 测试、API Contract 测试、类型检查、Auth 范围 lint、版本一致性检查和生产构建均已执行；详细结果见 `UPGRADE_PROGRESS.md`。
## v2.20.0 - 2026-08-18

### 新增

- 新增 Scrapling First Python Collector、JSON Lines Worker Bridge、能力 Manifest 与敏感字段脱敏。

### 优化

- Creator Agent 采集链路改为独立 Python Worker 与真实 Chrome 专用 Profile。

### 修复

- 无。

### 技术升级

- Creator Agent 升级至 v2.12.0-agent，锁定 Scrapling 0.4.14。

### 数据库变化

- 无。

### 测试情况

- Python 单测、Agent check/build、Worker Bridge 合同测试通过；正式账号登录及导出待人工扫码验证。
## v2.20.1 - 2026-08-26

- 修复 works SQLite 非标量字段持久化；新增无 UI CLI E2E 入口与官方双导出验收。
