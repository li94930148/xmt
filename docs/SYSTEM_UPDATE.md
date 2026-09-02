# XMT 系统升级说明

## 当前版本

v2.20.10

## v2.20.10 Creator Agent Preload 浏览器安全契约

- Main-only 身份投影保留设备键控 HMAC；Preload 与 Renderer 不再运行时导入 `node:crypto` 或绑定配置。
- sandboxed Preload 未建立 contextBridge 时，Renderer 显示固定脱敏错误页而不再空白。

## v2.20.9 Creator Agent Renderer 账号标识脱敏

- Renderer 仅显示 Main 生成的短审计标识、绑定状态和范围状态；不再接收完整账号配置、账号 ID、设备 ID 或昵称。
- 状态 IPC 在 preload 执行运行时白名单投影，未知字段、历史日志和原始异常上下文不会进入界面或可访问性树。

## v2.20.8 本地封面来源安全检查

- Creator Agent 可单独检查当前绑定账号的作品封面来源，不上传业务数据、不下载 Excel，也不会修改服务器数据。
- 检查结果只展示作品数量、候选数量、图片可用性与有效期汇总，不展示封面链接、作品编号或登录资料。

## v2.20.7 Creator 作品封面 URL 完整性

- 兼容同步和读取路径统一复用受限的封面 URL 解析器，仅允许 HTTP(S) URL。
- 相对路径或无效值不会覆盖已有封面；既有 raw 数据中的可解析封面会在读取时恢复。

## v2.20.6 Agent 认证事实与窗口交互解耦

- Main 将 `profile_authenticated`、`login_window_state`、浏览器、绑定、Token 和数据库就绪状态汇总为只读 `canSync` 能力快照。
- 已认证受管 Profile 显示“重新登录”且可同步；临时窗口关闭只重置窗口状态，不会抹除认证事实。

## v2.20.5 Creator Agent 登录状态一致性

- 登录流程由 Electron Main 维护 `idle`、`opening`、`awaiting_confirmation`、`authenticated`、`closed`、`error` 状态；Renderer 仅消费 Main 状态。
- 已认证受管 Profile 显示“登录正常 / 重新登录”；无存活登录窗口不会显示“我已完成登录”。
- 未解析浏览器时登录和同步禁用；正式包内 Playwright driver 与用户选择的系统 Chromium 均由 Main 的实际解析结果展示。

## v2.20.4 Creator Agent SQLite 队列修复

- Agent v2.13.0-agent 在启用同步前完成本地队列表迁移与检查。
- canonical payload 仅以 JSON TEXT 保存，读取时校验 SHA-256；错误提示不暴露底层 SQL 或参数。
- 本轮未开始 macOS 正式打包、发布或生产同步。

## v2.20.3 本地官方导出安全同步

- 现在可在本机清洗抖音官方导出表，只上传用于驾驶舱的标准化数据与审计摘要。
- 原始 Excel、Cookie、浏览器 Profile 和登录信息继续只保留在本机。
- 同一批次或未变化数据重复上传不会重复累计。
- 当前已确认两类下载样本；抖音页面入口完整覆盖仍需用户提供脱敏页面结构确认。

## v2.20.2 主线收口与 Android Native Auth 续期修复

- V1 登录响应保留服务端 `expiresIn`；Android 真实登录完成后显式通知 Native Runtime 安排 refresh。
- refresh 成功后按新 Token 生命周期重新调度，并保留 JWT `exp` 回退、前后台/网络恢复补偿、single-flight 和旧定时器代际保护。
- 新增真实 Auth Store 的登录到连续两轮 refresh 集成合同，并进入核心安全 CI。
- XMT / Android 统一为 2.20.2 / 22002；Creator Agent 仍为 2.12.1-agent，无数据库迁移或生产配置变更。
- 归档 v2.17.2 Socket 业务时段只读观察报告；已由 v2.19.3 合入的日报布局不重复迁移。

## v2.20.1 Creator Collector 验收完善

- 修复 works SQLite 非标量字段持久化，并保持对象状态以 JSON 字符串安全保存。
- 增加本机 Creator Collector 无 UI CLI E2E 入口，复用正式任务 Runner。
- 增加官方导出阶段结构化观测与 XLSX workbook 校验，支持连续双导出稳定性验收。

## v2.19.11 Creator Agent 上传协议安全收口

v2.19.11 不是重新实现 Creator Agent 上传链路。`/data-sync` 原已具备 V1 timestamp 与 nonce 防重放；本版关闭 legacy protocol fallback，并退役无现行调用者的 `/report` 上传入口。

- `/data-sync` 永久要求 `protocol_version=1`，不再受 runtime flag 控制。
- HMAC 继续按显式字段顺序覆盖 protocol、Agent 绑定、timestamp、nonce、采集时间与密文数据；时间窗、严格 UUID nonce 与签名均通过后，才原子预留 nonce。
- `/api/creator-agent/report` 返回 410，提示客户端使用 `/data-sync`；无数据库迁移、无 Creator 业务数据删除。

## v2.19.10 安全补充

v2.19.10 是 v2.19.9 的安全补充版本，用于关闭代码审查发现的认证 Origin 与角色权限绕过问题。

- Legacy 401 自动续期仅接受精确可信 Origin，伪同源、错端口和 HTTP 降级请求不会触发续期或携带新凭据。
- 角色分配与角色权限定义均在写入前执行调用者有效权限上限检查，拒绝混合角色的部分写入和自举提权。
- 不包含数据库迁移、生产配置变更或 Agent 协议修改。

## 安全边界修复

- 用户管理不再允许非管理员将账号设为管理员；账号禁用后，现有登录会话和实时连接立即失效。
- 编辑器与 Markdown 预览会阻止危险 HTML 和链接，协作异常数据不会造成服务退出。
- 登录短暂过期时会尝试既有安全续期流程；续期失败才要求重新登录。

## Android Production Endpoint Build Contract

- 正式 Android 构建固定注入 `https://lanyaomedia.com/api` 与 `https://lanyaomedia.com`，不依赖 shell export、个人 `.env` 或历史工作目录。
- 构建产物与 APK 均包含非敏感 build manifest；CI 验证 dist、Capacitor assets 与 APK 的实际 endpoint。
- Native Production endpoint 缺失、relative `/api`、localhost、局域网或 HTTP 均 fail-closed；HTTP 200 HTML 不再可被作为 API Health / 移动认证成功响应。
- Web Production 与 Web Development 继续使用 same-origin `/api`，不受 Android 构建合同影响。

## Android Native Auth 自动续期修复

- Native Runtime 自己在 access token 临期前刷新，不依赖可选 Socket Coordinator。
- 前后台恢复与网络恢复会补偿检查；瞬时网络错误保留 Android Keystore 中的 refresh credential，并使用有界重试。

## Android HTTPS localhost Origin 兼容

- Android Capacitor/WebView 的 `https://localhost` 以精确 CORS allowlist 支持；不使用 wildcard，不允许任意 localhost 端口、局域网 IP 或 lookalike 域名。
- 增加真实 HTTP GET / OPTIONS CORS 合同测试，确认 ACAO、credentials 及恶意 Origin 拒绝。

## 编辑器格式刷

- 新增编辑器格式刷功能：支持单次及连续格式刷，可复制文字样式、颜色、高亮、标题、对齐和缩进等格式。
- 支持 Esc 或再次点击退出；每次应用均为独立 ProseMirror transaction，可正常撤销、重做并同步到协作用户。
- 格式刷不复制正文、链接 href、批注数据或其他业务 metadata。

## 部署门禁可靠性修复

- 公网 Internal Exposure 检查从权威运行时环境文件读取公开基址，避免与 PM2 进程环境脱节。
- 服务重启和回滚后的健康检查采用受限重试，避免服务尚未就绪时误报恢复失败。

## 日报布局修复

- Glass Surface 外观下的日报卡片改为全宽纵向内容流，避免宽屏表单被横向挤压。

## Android 移动办公升级

- 增加 Mobile Auth 独立 allowlist、刷新持续准入检查和 Mobile Socket 独立授权；不改变 Legacy Web 登录。

- 新增 Capacitor Android Runtime、移动导航和安全网络配置。
- 新增 Android Keystore 刷新凭据保护，以及复用 Auth V1 会话与轮换机制的移动认证合同。

## 安全与发布可靠性升级

- 正式部署在重启服务前执行 `npm run version:check`；版本事实源不一致时只恢复工作树，不重启在线旧服务。

- 正式部署必须提供精确目标 SHA；脚本校验远端、检出结果一致后才允许继续，并在服务重启前对本次备份执行非破坏 Restore Drill。

- 备份、恢复演练、迁移兼容与版本记录增加了发布前自动检查；本版本不部署生产，也不改变认证灰度状态。

- 协作文档现在会在服务器确认访问范围后才允许进入和同步，猜测文档编号不再能取得协作状态；非特权的仅查看参与者无法写入实时文档。
- 角色调整会完整校验并一次性生效，避免权限状态前后不一致。
- 发布前数据库备份会使用 SQLite 的安全备份方式并检查副本可用性；新版本健康检查失败时自动恢复上一应用版本。
- 核心认证、Socket、协作恢复和真实协作授权黑盒测试进入合并门禁。
- 新增只读运行状态检查，逐项解释运行数据通过、失败或缺失，帮助发布前确认实时连接、内存和数据库是否具备准入条件；它不会改变任何线上设置。

## React Bits 场景化视觉编排与全系统体验升级

- 建立 React Bits 官方组件、Typed Adapter、Semantic Slot 与 Page Scene 的统一视觉架构，页面视觉与业务逻辑进一步解耦。
- 首页、选题、日报、Creator、Analytics、Workflow、Editor 与 Settings / Appearance Center 完成场景化视觉升级。
- 提供岚曜极光、深空科技、丝绸创意、线性协作、极简无扰、自由搭配六套视觉方案，支持页面应用范围、动效级别、深浅主题、界面字号与高级参数。
- Appearance Center 完成 Scene Preview、配置导入导出、恢复默认、持久化与页面范围控制；高级设置默认折叠。
- 完善表单 accessible name、preset aria-pressed 与折叠语义，修复主题 select 的可访问名称问题。
- 优化 Silk 动态背景生命周期与 React Three Fiber 兼容处理，动效关闭、路由切换和 reload 后不残留背景 Canvas。
- Editor 接入轻量 Scene 外壳，编辑区域保持无 WebGL 干扰，不改变编辑、选区、保存与协作逻辑。
- Workflow 完成安全视觉升级，strict control 与 Workflow Engine 原有业务判定保持不变。
- 增加场景浏览器自动化回归，覆盖 Canvas 生命周期、路由切换、动效开关、配置恢复及桌面、平板、移动端视口。

影响范围：前端视觉、Appearance Center 与浏览器回归验证；不修改 Backend、API、权限、Workflow Engine、Socket.IO、Yjs 或 Database。

## 实时连接排查增强

- 系统新增仅用于开发排查的连接生命周期记录，帮助定位网络切换、刷新页面后的偶发连接中断。
- 这些记录不包含账号信息、登录凭据或协作内容；生产用户登录方式不变。

## React Bits 认证态兼容测试补充

- 认证态测试仅通过临时 `XMT_E2E_*` 环境变量取得专用测试账号，不写入代码或配置。
- 覆盖登录后主题、预设、字号、视口、按钮与外观配置持久化验证；测试目标仅限本地地址。

## 实时连接稳定性观察

- 系统增加了实时连接的安全运行记录，用于定位偶发的连接中断原因。
- 记录不包含账号密码、登录凭据、浏览器 Cookie 或协作内容。
- 本次不改变用户登录方式，所有认证灰度开关继续保持关闭。

## 认证灰度观测准备

- 新增受控浏览器验证记录，可确认登录响应是否到达、页面是否完成进入系统。
- 一旦发现登录成功但页面没有进入首页，测试会立即停止，避免继续影响后续协作验证。

## 日报系统轻量化重构

- 日报页面保留我的日报、团队日报、总结归档三个入口。
- 我的日报固定填写当天，仅保留今日工作、明日计划、需要协调事项，填写后直接提交。
- 月报、年报合并到我的日报，通过记录类型切换，默认显示日报。
- 总结归档支持日报、月报、年报筛选；管理员可按成员和日期/年份查看全部记录。
- 团队日报仅展示成员、日期和日报内容，不展示统计、趋势、排名或风险等级。
## 本次升级内容

- 浏览器自动验证已固定使用项目自带的测试浏览器，避免不同电脑上的浏览器差异影响认证与协作回归结果。

- 新认证方式的短期访问凭据只保留在当前页面运行期间，刷新凭据继续由浏览器安全机制保护。

- 新大版本创建后，旧稿件会自动变为只读历史记录，并提示协作者进入最新版本继续工作。

- 增加实时连接认证的兼容准备能力。
- 新旧认证方式分别校验，避免认证凭据混用。
- 协作房间使用服务端确认的用户身份，提升协作安全性。
- 增强网络波动后的实时协作恢复，降低页面重连时编辑状态丢失或过早发送的风险。
- 增加受控的多标签认证状态同步和浏览器恢复验证能力。
- 完成真实浏览器下登录、实时连接、协作房间和编辑状态恢复验证。
- 增加正式登录双轨灰度准入准备，支持逐批验证与快速回退。
- 增加受控登录网关，支持少量测试账号在新旧认证间安全分流。
- 增加生产实时连接的受控准入，保障测试账号可完成完整认证与协作恢复验证。

## 使用影响

本次升级新增默认关闭的生产 Socket Bridge 门禁；未审批或未命中名单时，用户继续使用 legacy。

## 数据影响

本次升级新增并执行数据库迁移 `007_daily_lightweight_refactor`，为月报和年报增加结构化总结字段，并为成员补充团队日报查看权限。现有日报、月报、年报、用户、会话和业务数据保持兼容，不删除历史记录。
