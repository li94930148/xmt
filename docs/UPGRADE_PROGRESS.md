# XMT 升级阶段记录

## v3.3.43 桌面消息聚合与业务直达（2026-09-28）

- 完成内容：桌面消息只对明确的 `/topics/:id` 且已知消息类型做五分钟分组；同组通知复用系统 tag，后续更新静音。通知点击只允许本站相对路径，选题通知直达关联页；无关联链接或不安全链接回到消息中心。消息数据库行、未读数及收件箱明细不做合并或改写。消息中心已有“待处理”筛选和列表级关联跳转，本阶段补上系统桌面通知的直达。
- 修改范围：`src/utils/message-notification.ts`、`src/hooks/useSocket.ts`、`src/utils/notification.ts`、通知契约测试和版本文档。无 API、权限、数据库或持久化行为变化。
- 验证：`npm run test:message-notification`、`npm run test:notification-routing`、`npm run test:notification-settings-load`、`npm run test:mobile-safe-draft`、`npm run test:mobile-work-center-browser`、Android runtime/endpoint/build-endpoint 契约、`npm run check`、`npm run version:check`、`git diff --check` 通过。定向 ESLint 0 错误，保留 `notification.ts` 既有 `any` 警告。`npm run mobile:sync:production` 内的生产构建及 Capacitor Android 同步通过，manifest 为 `3.3.43 / 30343`；构建有既有 Silk/Tiptap 大分包提示。隔离 Playwright 在 320px/390px 覆盖工作中心/工作流路径和 v3.3.42 消息/密码错误恢复，截图保存于 `/tmp/xmt-mobile-message-load-error-390.png`、`/tmp/xmt-mobile-password-retry-390.png`、`/tmp/xmt-mobile-password-success-390.png`。通知本身用契约测试验证，没有模拟真实操作系统通知权限。
- 风险说明：桌面通知仍需 HTTPS/localhost、安全上下文和用户授权；尚未做真实浏览器系统通知授权、多标签聚合或真实账号验收。认证态 ReactBits 主题浏览器测试本次因其配置的 `127.0.0.1:5175` 应用服务未运行而连接拒绝；浅色对比度浏览器测试未运行。两项会对认证账号保存偏好，无隔离后端时未对现有账号执行写入测试。`npm run mobile:doctor` 显示 Java、adb 和 Android SDK 不可用，因此 APK/真机无法在此环境完成。
- 下一阶段：继续核对 B8 尚未覆盖的 mutation 成功/失败反馈；B10 Android APK/真机及真实账号验收仍需要 JDK/Android SDK 和受控测试环境。

## v3.3.42 移动消息错误状态与密码操作保护（2026-09-28）

- 完成内容：移动消息无可用缓存且读取请求失败时显示错误和重试入口，只有成功读取的空结果才显示“暂无消息”；有缓存时继续展示缓存并说明数据可能较旧。未读标记失败或离线时留在消息页保留反馈和重试机会，成功标记后再打开关联内容。移动“我的”页修改密码增加当前密码必填、新密码至少 6 位校验，请求期间禁用输入、折叠和重复提交；成功后保留展开状态，让成功提示可见。
- 修改范围：`src/pages/mobile/MobileMessages.tsx`、`src/pages/mobile/MobileMe.tsx`、版本与改造清单文档。无 API、服务端密码规则、权限或数据库变化。
- 验证：`npm run test:mobile-work-center-browser`、`npm run test:mobile-safe-draft`、`npm run check`、`npm run version:check`、改动文件定向 ESLint、`npm run build` 和 `git diff --check` 通过。浏览器夹具覆盖无缓存加载 503→明确错误→重试空列表、未读标记 503 后留页并重试成功才跳转、改密码必填/长度校验、请求中双击只发一次及成功提示可见；既有移动工作流与共享设备隔离回归在 320px/390px 通过。生产构建仍提示 Silk 与 Tiptap 分包超过 500 kB。
- 风险说明：未验证真实账号、生产接口和 Android APK/真机。本轮不涉及数据迁移或业务写入。
- 下一阶段：继续核对 B8 桌面通知聚合和待处理消息直达边界；B10 的 APK/真机与真实账号验收仍需具备 JDK/Android SDK 和受控测试环境。

## v3.3.41 移动本机内容账号隔离（2026-09-27）

- 完成内容：移动消息最近缓存、选题提报/修改草稿、创作稿草稿及日报草稿改用当前账号专属本机键。共享设备切换账号后，页面不会恢复其他账号或旧版无归属内容。账号未确认时不读取或写入这些本机数据；旧数据不自动删除或迁移，以免误判归属。
- 修改范围：`src/platform/safe-draft.ts`、五个移动页面、共享设备浏览器回归、版本与改造清单文档。无数据库迁移、API 或服务端权限变化。
- 验证：`npm run test:mobile-safe-draft`、`npm run test:mobile-work-center-browser`、`npm run check`、`npm run version:check`、三个 Android runtime/endpoint 契约测试、改动文件定向 ESLint、`npm run mobile:sync:production` 与 `git diff --check` 通过；生产构建仅有既有大分包提示。浏览器覆盖 320px/390px 既有路径及第二个账号无法看见首个账号消息、选题和日报本机内容，第二账号日报截图 `/tmp/xmt-mobile-work-center-responsive-390-shared-device-account-isolation.png`。Android 同步资源 manifest 为 `3.3.41`，API/Socket 地址仍为 `https://lanyaomedia.com/api` / `https://lanyaomedia.com`。
- 风险说明：旧版无归属数据仍保存在本机，但无法安全自动分配给账号；如需找回，须在可信设备上由原账号持有人确认后手动处理。`npm run mobile:doctor` 仍显示缺 Java、adb 和 Android SDK；APK、真机、真实账号及生产服务未验收。本阶段未提交、未部署。
- 下一阶段：继续 B10 Android APK/JDK/真机和真实账号验收，并继续核对其他移动本机状态与权限边界。

## v3.3.40 移动工作流状态中文兜底（2026-09-27）

- 完成内容：移动首页、选题列表/详情、创作列表及拍摄/发布列表和详情对未知状态显示“状态待确认”；拍摄 `pending` 明确为“计划中”，避免列表泄漏英文状态码或详情留空。未知选题状态采用中性设计令牌样式，发布详情中的失败/定时文案与列表统一。Android 工程版本与 production endpoint manifest 同步至 `3.3.40 / 30340`。
- 文案核查：移动消息使用中文业务分类；页面不直接显示内部 `type`/severity 枚举，无需改消息分类或数据契约。
- 修改范围：`src/platform/workflow-status-labels.ts`、移动首页/选题/创作列表与选题详情、拍摄/发布列表与详情、状态映射测试、移动工作中心浏览器回归及版本文档。
- 数据库变化：无迁移、无业务数据写入；未更改权限、API、服务端状态机或写入规则。
- 验证：`npm run test:workflow-status-labels`、`npm run test:mobile-work-center-browser`、`npm run check`、`npm run version:check`、定向 ESLint、`npm run mobile:sync:production`、三个 Android runtime/endpoint 契约测试及 `git diff --check` 通过。Playwright 在 320px/390px 进入拍摄与发布详情，并在 320px 验证首页/选题/创作列表及选题详情未知状态、页面身份、无横向溢出且无页面/控制台错误；截图 `/tmp/xmt-mobile-work-center-responsive-320-home-unknown-status.png`、`/tmp/xmt-mobile-work-center-responsive-320-topics-unknown-status-list.png`、`/tmp/xmt-mobile-work-center-responsive-320-topic-unknown-status-detail.png`、`/tmp/xmt-mobile-work-center-responsive-320-production-unknown-status-list.png`、`/tmp/xmt-mobile-work-center-responsive-320-shooting-status-detail.png`、`/tmp/xmt-mobile-publishing-status-detail-320.png`。
- 风险说明：APK 未构建——`npm run mobile:doctor` 确认 Java、adb、Android SDK 均不可用；真机、真实账号和生产服务未验收。浏览器使用本地隔离 API fixture，没有调用生产 API；实时协作显示离线状态不影响本次只读状态展示。未使用独立 Browser 插件，使用仓库 Playwright 回归。
- 下一阶段：继续 B10 剩余的 Android APK/JDK/真机验收准备，并继续按页面核验移动端实际文案与写入入口。

## v3.3.39 移动日报状态与审核意见提示（2026-09-27）

- 完成内容：移动日报显示“未填写、草稿、审核中、已通过、已退回、已归档”中文状态及对应可操作说明；日报退回时展示服务端审核意见。只读日报始终展示服务端内容，不应用或覆盖本机未提交草稿。服务端契约中的草稿/已提交/已退回可编辑、已通过/已归档只读以纯函数状态映射和浏览器回归覆盖。
- 修改范围：`src/pages/mobile/MobileDaily.tsx`、`src/platform/mobile-daily-report-status.ts`、移动状态契约测试、移动工作中心浏览器回归、版本展示和 B10 文档。
- 数据库变化：无迁移、无业务数据写入；没有更改权限规则和服务端状态机。
- 验证：`npm run test:mobile-daily-report-status`、`npm run test:mobile-safe-draft`、`npm run test:mobile-work-center-browser`、`npm run check`、`npm run version:check`、定向 ESLint、`npm run build`、`git diff --check` 通过。Browser plugin 不可用，浏览器使用本地 Playwright 隔离 API 夹具，在 320px/390px 验收已提交、已退回意见、已通过只读及本机旧草稿不应用/不覆盖；没有调用真实账号或生产 API。
- 风险说明：移动日报真实账号、生产 API 和 Android 真机仍未验收；APK 构建仍受本机缺 Java Runtime 阻塞，未部署。
- 下一阶段：继续清单 B10，盘点拍摄/发布详情及消息中的剩余状态/角色文案，并在具备 JDK 的环境补验 APK 与真机流程。

## v3.3.38 移动岗位角色中文映射与 Android 版本同步（2026-09-27）

- 完成内容：移动“我的”账号页补齐 `copywriter`、`post_production`、`camera` 的中文名称（文案、后期、摄像），不再回退成“成员”。七种内置角色有映射回归；隔离浏览器实际打开账号页验证三个内容岗位显示。Android 工程版本同步至 `3.3.38 / 30338`，production endpoint manifest 已生成到前端与 Android 资源目录并通过契约验证。
- 修改范围：`src/constants/index.ts`、`tests/mobile/mobile-role-labels.test.ts`、移动端浏览器回归、`package.json` 和版本/改造清单文档；无权限规则或数据库变化。
- 验证：`npm run check`、`npm run test:mobile-role-labels`、`npm run test:mobile-work-center-browser`、`npm run test:android-build-endpoints`、`npm run test:android-runtime`、`npm run test:android-endpoint-contract`、`npm run version:check`、改动文件定向 ESLint、前端构建、`git diff --check` 通过；浏览器在 320px/390px 既有路径及角色场景通过。
- APK 状态：`npm run mobile:apk:debug:production` 的前端构建与 Capacitor 同步成功，但 Gradle 因系统无 Java Runtime 无法启动。检查 `/Library/Java/JavaVirtualMachines`、Homebrew 常见 JDK 目录均未发现 Java；没有安装系统依赖，也未安装到设备。旧 ignored APK 未覆盖，副本保留在 `/tmp/xmt-app-debug-before-v3.3.38.apk`（SHA-256 `097ec8fd690a74738ecc8d772f8294246536ed1b8abda0cf1fa330fd427b7a56`）。
- 风险说明：Android production endpoint 已在同步资源 manifest 核实为 `https://lanyaomedia.com/api` 与 `https://lanyaomedia.com`；但 APK、真机及真实账号仍待有 JDK 的环境单独验收。本阶段不安装、不上传、不部署。
- 下一阶段：继续清单 B10，逐页盘点剩余移动角色/状态文案和写入路径；Android 包构建需在具备 JDK 的环境补验。

## v3.3.37 移动选题权限加载与失败恢复（2026-09-27）

- 完成内容：移动选题详情加载逻辑改用稳定的权限状态作为回调依赖，避免状态更新后重复发起详情请求并反复卸载编辑控件；创建、审核 API 错误解析改为展示服务端消息。既有 `topic:create`、`topic:update`、`topic:audit` 和所有者范围检查不变。
- 失败恢复：提报失败保留表单并可重试；负责人保存失败后本地草稿可在刷新后恢复，成功重试后清除；仅有审核权限的角色不开放编辑，审核失败保留意见供重试。
- 修改范围：`src/pages/mobile/MobileTopicDetail.tsx`、`src/api/topics.ts`、`tests/topics/list-fetch-notify.test.ts`、`tests/browser/mobile-work-center-responsive.spec.ts`、版本与改造清单文档。
- 数据库变化：无迁移、无业务数据写入。
- 验证：`npm run check`、`npm run test:topics`、`npm run test:topics-list-notify`、`npm run test:mobile-work-center-browser`、`npm run version:check`、`npm run test:android-runtime`、`npm run test:android-endpoint-contract`、改动文件定向 ESLint、`npm run build`、`git diff --check` 均通过。全仓 `npm run lint` 未通过：10 个 error 全部位于既有嵌套 worktree `.worktrees/project-integrity-audit/`，不涉及本阶段文件；未修改这些文件。隔离 Playwright 覆盖上述三个移动选题角色流程和既有 320px/390px 工作中心路径；构建仅保留仓库既有 Silk 背景 chunk 超过 500 kB 提示。
- 浏览器限制：Browser plugin 不在当前可用列表，使用仓库 Playwright；页面数据由本地隔离 fixture 提供，不连接真实账号或生产 API。失败态截图：`/tmp/xmt-mobile-topic-audit-failure-390.png`。
- 风险说明：未修改角色授权、服务端所有者 ACL 或数据库；真实账号、生产服务端、Android 真机仍待单独验收，本阶段不提交、不部署。
- 下一阶段：继续清单 B10，按页面/角色检查剩余移动写入入口及窄屏错误恢复。

## v3.3.36 移动创作权限与稿件范围一致（2026-09-27）

- 完成内容：创作详情接口在完成查看范围校验后，用同一服务端 `canEditProduction` 规则计算并返回 `can_edit`。移动创作编辑页要求 `production:update` 和服务端稿件范围同时允许，才恢复本地编辑草稿、开放编辑器与保存/提交；可查看但不可编辑的角色保留只读内容。没有改变任何角色授权、数据范围或服务端写入门禁。
- 修改范围：`api/routes/workflow.ts`、`shared/types/index.ts`、`src/pages/mobile/MobileProductionEditor.tsx`、`tests/production/production-collaboration-http.test.ts`、`tests/browser/mobile-work-center-responsive.spec.ts`、`package.json` 和版本/权限说明。
- 数据库变化：无迁移、无业务数据写入；HTTP 角色测试使用临时 SQLite。
- 验证：`npm run test:production-access` 通过，确认 editor 明细 `can_edit=true`、director 在有查看和更新权限但不属于稿件范围时仍可查看且 `can_edit=false`，直接写入依旧返回 403。`npm run test:mobile-work-center-browser` 在 320px、390px 通过；另在 390px 验证 director 编辑器为只读、保存/提交按钮不存在，editor 保持可编辑；页面路由正确、标题非空、无框架错误遮罩/控制台错误/横向溢出。`npm run check`、`npm run version:check`、`npm run test:android-runtime`、定向 ESLint、`npm run build` 和 `git diff --check` 通过；定向 lint 0 error、12 条 workflow 路由文件既有 warning，构建有 Silk 背景 chunk 超过 500 kB 提示。
- 浏览器证据：本地隔离 Playwright，响应式视口 320×844、390×844；director 只读稿件截图 `/tmp/xmt-mobile-production-director-readonly-390.png`。Browser 插件/技能不在当前会话可用列表，使用仓库 Playwright 测试脚本；未连接真实账号或生产 API。
- 风险说明：该能力仅作为 UI 与服务端授权决策的同步提示，最终安全边界仍是写接口 `production:update` + `canEditProduction`；真实数据库角色配置、在线服务端与 Android 真机尚未验收，未部署。
- 下一阶段：继续逐角色核验移动选题提报、编辑和审核的授权及失败恢复；只修复有代码与服务端证据的落差，不推断或自动收紧既有自定义授权。

## v3.3.35 移动日报部分成功后安全重试（2026-09-27）

- 完成内容：移动日报先保存草稿再提交时，保存接口成功后立即将服务端返回的日报及版本写回页面状态。若随后的提交失败，已持久化草稿不再与客户端旧版本脱节；用户重试时携带新版本号，避免触发乐观并发冲突。
- 修改范围：`src/pages/mobile/MobileDaily.tsx`、`tests/browser/mobile-work-center-responsive.spec.ts`、版本与改造清单文档。
- 数据库变化：无迁移、无真实数据写入。权限契约使用临时 SQLite，浏览器 API 使用本地隔离夹具。
- 验证：`npm run test:mobile-work-center-browser` 在 320px、390px 通过；模拟首次提交 503，确认草稿使用版本 5 保存，重试使用服务端返回的版本 6 并提交成功，同时工作中心、日历、灵感、看板、日报均无横向溢出。`npm run test:daily-report-permissions`、`npm run check`、`npm run version:check`、`npm run test:android-runtime`、定向 ESLint、`npm run build` 和 `git diff --check` 均通过。构建保留 Silk 背景 chunk 超过 500 kB 的既有提示。
- 浏览器证据：本地隔离 Playwright，视口 320×844、390×844；日报恢复场景截图 `/tmp/xmt-mobile-daily-partial-success-320.png`。Browser 插件工具在本轮不可用，按前端测试规范使用仓库 Playwright 脚本；未连接真实账号或生产 API。
- 风险说明：仅验证客户端部分成功与重试合同，真实角色配置、在线服务端及 Android 真机尚未验收；未部署。
- 下一阶段：继续清单 B10，逐角色核对移动端各写入入口的实际权限和错误恢复，完成其余外场工作流验收。

## v3.3.34 移动日历失败恢复与权限核验（2026-09-27）

- 完成内容：日历加载失败改为明确错误页和重试入口；请求失败或切换月份加载期间隐藏旧月份统计，避免把过期汇总误当当前值。创建失败后保留表单并解锁重试，增加请求进行中保护。API 校验日历响应数据必须为数组。核验服务端日历需要认证、事件修改/删除遵循创建者/管理员边界，关联选题创建遵循现有选题访问权限；当前日历页面没有事件编辑/删除入口，本轮不新增未规划的管理交互。
- 修改范围：`src/api/calendar.ts`、`src/pages/Calendar.tsx`、`tests/browser/mobile-work-center-responsive.spec.ts`、`tests/calendar/calendar-permissions.test.ts`、`package.json`、版本与改造清单文档。
- 数据库变化：无迁移、无真实数据写入；权限测试使用临时 SQLite 数据库。
- 验证：`npm run test:mobile-work-center-browser` 在 320px、390px 通过；覆盖日历读取 503→错误态→重试恢复、创建 503→保留表单→重试成功且仅产生一次业务记录，并断言失败时不残留旧月份汇总。`npm run test:calendar-permissions` 通过，覆盖未登录拒绝、个人未关联事件创建、关联选题所有权、跨用户关联拒绝、个人事件更新/删除、越权拒绝和管理员管理，以及异常响应结构拒绝。更完整的类型、lint、版本和构建结果见本阶段最终记录。
- 浏览器证据：隔离 Playwright fixture；错误页 `/tmp/xmt-calendar-load-error-320.png`，创建失败后表单可重试 `/tmp/xmt-calendar-create-retry-320.png`。Browser plugin 未提供，使用仓库 Playwright 脚本；无真实认证/生产 API。
- 风险说明：创建失败回退与所有权规则已用本地夹具/临时库覆盖；真实角色配置、在线服务端状态、Android 真机未验收。事件编辑/删除 API 有保护，但移动日历页面尚无编辑/删除入口；未提交、未部署。
- 下一阶段：继续清单 B10 核实移动工作流的实际角色权限和 API 失败反馈，并优先确定是否需要规划日历事件编辑/删除的产品操作；测试账号与生产环境仍需单独验收。

## v3.3.33 移动日历与灵感关联选题闭环（2026-09-27）

- 完成内容：首页快捷入口进入日历后返回首页；工作中心进入子页后返回工作中心。日历排期和已转化灵感可打开关联选题；选题详情的返回操作回到来源日历或灵感页，普通选题入口仍返回选题列表。
- 修改范围：`src/components/mobile/MobileShell.tsx`、`src/pages/mobile/MobileHome.tsx`、`src/pages/mobile/MobileWorkHub.tsx`、`src/pages/mobile/MobileTopicDetail.tsx`、`src/pages/Calendar.tsx`、`src/pages/Inspirations.tsx`、`tests/browser/mobile-work-center-responsive.spec.ts`、版本与改造清单文档。
- 数据库变化：无迁移、无业务写入。
- 验证：`npm run test:mobile-work-center-browser` 使用本地隔离 API 夹具通过 320px、390px；覆盖工作中心→日历→关联选题→返回日历、首页→日历→返回首页、灵感关联选题→返回灵感，以及此前的日历切换月份、灵感提交取消、看板筛选与返回。页面文档/主体无横向溢出，浏览器 console、page error、HTTP 错误均为空。
- 风险说明：仅本地浏览器夹具验证，真实账号/服务端/Android 真机尚未验收；无业务写入，未部署。本轮浏览器插件不可用，按前端测试规范运行 Playwright。
- 下一阶段：继续清单 B10 的移动端日历创建/编辑权限及事件失败恢复核对，并复验关联选题的真实账号权限与 API 错误路径。

## v3.3.32 移动工作中心灵感与看板易用性（2026-09-27）

- 完成内容：修复灵感提交按钮与卡片操作区在窄屏下逐字换行；操作区手机改为纵向分组，创作者名称截断，触屏上删除按钮常驻并补充可访问名称。看板平台/负责人筛选标签在窄屏保持单行。
- 修改范围：`src/pages/Inspirations.tsx`、`src/pages/Kanban.tsx`、`tests/browser/mobile-work-center-responsive.spec.ts`、版本与改造清单文档。
- 数据库变化：无迁移、无业务写入。
- 验证：`npm run test:mobile-work-center-browser` 以本地隔离 API 夹具在 320px、390px 完成工作中心→日历→切换月份→返回，工作中心→灵感→打开/取消提交→返回，以及工作中心→看板→返回。四个页面文档、主体均无横向溢出，关键控件可见，浏览器控制台无错误。截图：`/tmp/xmt-mobile-work-center-responsive-320-{hub,calendar,inspirations,kanban}.png`、`/tmp/xmt-mobile-work-center-responsive-390-{hub,calendar,inspirations,kanban}.png`。真实账号/后端未接入。
- 风险说明：Browser plugin 未提供，按技能采用本地 Playwright；数据全部来自测试夹具，没有真实业务写入。Android 版本同步为 3.3.32 / 30332，APK 和真机未验收。
- 下一阶段：继续处理移动端详情返回和日历/灵感关联选题入口，检查流程路由使用的记录 ID 与 320px 操作可见性。

## v3.3.31 看板流程详情关联修正（2026-09-27）

- 完成内容：工作中心看板点击“拍摄中 / 发布中”选题，按 `topic_id` 查询对应流程记录并使用真实流程记录 ID 打开详情；缺少记录或查询失败时明确提示并安全回到选题详情。另修复看板操作区边框样式变量未插值。
- 修改范围：`src/platform/kanban-navigation.ts`、`src/pages/Kanban.tsx`、`tests/mobile/kanban-navigation.test.ts`、版本更新说明。
- 数据库变化：无迁移、无数据写入。
- 验证：`npm run test:kanban-navigation`、`npm run test:integrity:workflow`、`npm run test:mobile-layout`、`npm run check`、`npm run build`、`npm run version:check`、`npm run test:android-runtime`、`git diff --check` 通过；定向 ESLint 0 error、6 条该文件既有 warning。构建有仓库既有 Silk 背景 chunk >500 kB 提示。尚未用真实账号/浏览器连后端验证看板点击；Android 版本名称/版本码同步到 3.3.31 / 30331，未构建 APK。
- 下一阶段：继续核对手机工作中心的灵感、日历和返回路径，并对相关入口做窄屏浏览器验收。

## v3.3.30 移动编辑器轻工具栏与 Android 版本对齐（2026-09-27）

- 完成内容：手机宽度下拍摄、发布与移动创作编辑器统一使用基础富文本工具栏，保留撤销/重做、常用文字样式、列表和链接；桌面宽度继续使用完整工具栏。发布剧本栏标题与保存/取消操作在窄屏上下排布。Android `versionName` 与 Web `package.json` 同步为 3.3.30，`versionCode` 按 `major*10000+minor*100+patch` 递增为 30330，Android 版本契约测试改为从项目版本自动计算。
- 修改范围：`src/hooks/useCompactEditorToolbar.ts`、拍摄/发布详情、移动创作编辑器、`android/app/build.gradle`、Android 版本契约测试及版本说明。
- 数据库变化：无 schema 迁移、无业务数据写入。
- 验证：Playwright 使用本地隔离 API 响应实测发布详情编辑按钮交互与拍摄操作可见；320px、390px、1440px 下文档宽度均与视口一致，320/390 窄屏取消/保存按钮完整可见，移动端基础工具栏出现且桌面端隐藏。截图：`/tmp/xmt-mobile-v330-publishing.png`、`/tmp/xmt-mobile-v330-shooting.png`。`npm run check`、`npm run version:check`、`npm run test:android-runtime`、`npm run test:android-endpoint-contract`、`npm run test:mobile-layout`、`npm run test:topics`、`npm run test:topics-list-notify`、定向 ESLint 和 `npm run build` 通过；ESLint 0 error、5 条既有 warning，构建有 Silk 背景 chunk >500 kB 警告，`git diff --check` 通过。Android APK 未构建。
- 风险说明：本机后端未运行，Playwright 的 Socket.IO 请求返回 500，页面显示实时协作离线提示；普通编辑仍可用。浏览器验证使用本地 API 夹具，不代表真实账号、实时协作或生产验证。此次不改权限、数据接口、编辑器保存合同。
- 下一阶段：继续检查移动工作中心的其他工作流入口（看板、灵感、日历与详情返回路径），并在可用环境补全真实认证/Android 真机验收。

## v3.3.29 移动工作流详情窄屏适配（2026-09-27）

- 完成内容：拍摄详情顶部标题/阶段操作在手机宽度下改为纵向堆叠并允许操作换行；发布详情顶部状态区堆叠，四阶段进度在窄屏改为两列展示、宽屏保留横向流程。移动选题协作动态把审核动作显示为中文；选题详情遇到 401/403/404 时清除编辑草稿并清空详情，不回退展示可能已失权的本机旧数据。审核服务成功后在测试数据库确认状态、历史意见、通知内容和实时广播保持一致。
- 修改范围：`src/pages/ShootingDetail.tsx`、`src/pages/PublishingDetail.tsx`、`src/pages/mobile/MobileTopicDetail.tsx`、`src/api/topics.ts`、`src/api/index.ts`、选题 API/服务测试及版本说明。
- 数据库变化：无 schema 迁移；审核一致性验证仅在临时 SQLite 测试库内执行。
- 验证：`npm run test:topics`、`npm run test:topics-list-notify`、`npm run check`、`npm run version:check`、`git diff --check`、定向 ESLint 和 `npm run build` 通过。定向 ESLint 0 error、5 条 warning（PublishingDetail 既有未使用导入及 effect 依赖提示，ShootingDetail 既有 effect 依赖提示）；构建有仓库既有 Silk 背景 chunk >500 kB 提示。审核服务使用临时 SQLite 并确认数据库状态、审核历史、通知回调及广播 payload 一致。
- 浏览器限制：Browser plugin 不可用，按前端测试技能尝试 Playwright MCP。登录态/API 夹具先因权限响应形状触发 `permissions.includes is not a function`，调整后仍被宿主认证恢复至登录页；没有取得可信的目标详情截图和交互证据，因此不宣称窄屏浏览器验收通过。本机 Vite 可加载登录页，后端未运行。
- 风险说明：未用真实账号、生产 API 或真机验证拍摄/发布详情；测试中的服务端响应和选题审核均为本机/临时数据，无业务写入，未部署。
- 下一阶段：检查移动端拍摄、发布子页的其余编辑区域和横向溢出，并继续清单 B10 的剩余入口。

## v3.3.28 移动工作流权限与消息部分成功反馈（2026-09-27）

- 完成内容：移动选题提报要求 `topic:create`；选题详情编辑要求 `topic:update` 且遵循管理角色/创建者/负责人的访问边界。待审核选题增加独立的 `topic:audit` 通过/驳回与意见提交，不混用编辑权限；只有桌面已有同等规则支持的拍摄/发布阶段允许移动端推进。移动日报要求 `report:daily:submit`，权限确认前不读写本地草稿。
- 错误恢复：日报读取失败显示重试并禁用表单及保存，避免初始空表单覆盖已存在日报。移动消息“全部已读”逐条请求，仅成功项更新本地缓存/未读数，失败项保持未读并显示可重试数量；单条已读增加处理中保护。
- 修改范围：`MobileAddTopic.tsx`、`MobileTopicDetail.tsx`、`MobileDaily.tsx`、`MobileMessages.tsx`、`mobile-message-read.ts` 与契约测试、版本文档；无数据库变化。
- 验证：`npm run check`、定向 ESLint、`npm run test:mobile-layout`、`npm run test:mobile-message-category`、新增 `npm run test:mobile-message-read`、`npm run test:daily-report-permissions`、`npm run test:topics`、`npm run version:check`、`npm run build` 与 `git diff --check` 通过。构建只有仓库已有的大 chunk 提示。
- 浏览器限制：本地 Vite 登录页可加载；后端未运行导致公开系统配置/Socket 请求失败。临时隔离组件挂载夹具出现 Router/权限状态错配，未获得可信的目标页交互证据，因此不宣称本轮浏览器 UI 验收通过。
- 限制：未用真实账号或生产 API 验证角色权限、日报失败重试和多条消息部分失败；测试为服务/API 契约及构建检查，无业务写入，未部署。
- 下一步：继续核对移动日历、拍摄和发布详情入口在窄屏上的可用性，以及独立审核后的通知/历史状态一致性。

## v3.3.27 移动创作权限与通知加载保护（2026-09-27）

- 完成内容：移动创作列表按 `production:view` 或 `production:update` 决定是否显示；查看权只读打开稿件，不提供新建、修改、提交，也不读取/写入本地编辑草稿；新建和编辑要求 `production:update`。工作中心的创作入口对仅查看角色仍可用，且仅有修改权的成员可以直接开始写稿。
- 通知：移动通知页改用共享通知配置加载器，一并读取偏好、渠道、事件并校验 HTTP 与数组结构；完整成功后才开放保存，失败时展示服务端错误和重试。Android 的 `apiUrl` 来源保持正确，保存沿用已完整读取的全部渠道偏好。
- 修改范围：`src/pages/mobile/MobileWorkHub.tsx`、`MobileProduction.tsx`、`MobileProductionEditor.tsx`、`MobileNotificationSettings.tsx`、`src/api/notificationSettings.ts` 与版本文档；无数据库变化。
- 验证：隔离 Playwright 实测通知事件接口 503 时保存禁用，重试三项成功后能保存，原有偏好条目仍包含在 payload。创作只读角色可查看稿件、无“新建/保存草稿”；无查看权限显示拒绝状态；无修改权限直达 `/production/content/new` 被拒绝；修改权限显示新建。访问拒绝期间无额外列表请求，页面无框架遮罩、未触发业务写入。`npm run check`、移动布局/通知加载/Android 契约测试、版本检查、定向 ESLint、生产构建和 `git diff --check` 均通过；构建仅报告既有的大型 chunk 提示。
- 限制：测试使用响应夹具，未登录真实 Android 账号或调用生产 API；浏览器 MCP 的历史输出包含本地 Vite HMR WebSocket 被运行环境阻拦及早期错误夹具造成的 React 错误，修正夹具后交互通过且 DOM 无错误遮罩。
- 下一步：继续清单 B10，检查移动端其他带写入操作的流程（选题提报/审核、日历创建、日报提交）是否与对应权限一致，逐页将失败反馈和加载门禁补齐。

## v3.3.26 手机浏览器移动办公入口（2026-09-27）

- 完成内容：清单 B10 中手机浏览器仅显示桌面缩小版的问题，改为 App 首次挂载时依据小于 768px 的视口选择现有移动壳层和移动首页、选题、创作、消息、日报页面；Android 继续默认使用移动界面。选择结果通过 props 交给 Layout，窗口旋转或缩放期间不重新挂载编辑器；重新打开/刷新时按当前宽度选择。手机浏览器设置仍使用完整设置页，保留管理员配置能力。
- 导航与反馈：日历、看板、灵感、拍摄、发布、日报和创作子路由归属“工作”；子页有明确返回所属主导航入口，首页别名和设置页高亮正确；移动壳层保留全局通知呈现和写作上下文。
- 修改范围：`src/App.tsx`、`src/components/Layout.tsx`、`src/components/mobile/MobileShell.tsx`、`src/platform/mobile-layout.ts`、`tests/mobile/mobile-layout.test.ts` 及版本文档。原生身份判断、会话恢复、API 地址和原生插件门禁未改，无数据库迁移。
- 验证：TypeScript 检查、`test:mobile-layout`、`test:android-runtime`、`test:entrypoints`、版本检查、定向 ESLint、生产构建通过；定向 ESLint 有 Calendar 既有 effect 依赖 warning，无错误，构建保留既有大分包提示。Playwright MCP 在 `http://127.0.0.1:5174/__mobile-qa` 隔离挂载真实 MobileShell、MobileWorkHub、Calendar；390×844 下工作中心进入日历、切换月份、点选日期打开创建表单并返回成功，工作导航保持选中。Calendar 原先固定 820px 导致只露出 3 列，此次改为手机完整 7 列，七列合计 348px、单日宽约 50px，页面宽 382px、视口 390px；无写入请求或框架错误遮罩。截图 `/tmp/xmt-mobile-calendar-v3326.png`。Browser plugin not available，使用 Playwright MCP；隔离挂载期间测试夹具曾加载第二份 Router 模块而出现上下文报错，已通过使用应用同一模块实例修正，最终交互完成。
- 剩余范围：日历、看板、灵感和拍摄复用现有响应式页面；本轮未新建独立移动页面，也未完成全量页面、真实认证、真机编辑和 Android 打包验收。下一步优先检查移动创作的新建/查看权限、移动通知读取失败后的保存门禁，并验证移动布局下的真实表单交互。

## v3.3.25 个人设置与系统管理分组（2026-09-27）

- 完成内容：清单 B9 设置中心按“我的设置 / 系统管理 / 产品信息”分组，系统配置和备份仍分别受现有权限控制；当前分类失去权限后回到通知偏好。采用 PageShell、PageHeader 和 GlassPanel，窄屏导航两列排列。关于系统读取全局已保存品牌，避免普通成员看到默认品牌或管理者把草稿误认为已应用；移除未经检测的“运行正常 / 模块已启用”和固定每日备份承诺。
- 失败恢复：系统配置读取失败时显示重试，读取成功前不显示可提交的默认配置；备份列表失败显示错误，数量标为待确认；重试成功后才区分真实空列表。
- 修改范围：`src/pages/NotificationSettings.tsx`、版本文档及 `src/data/changelog.ts`。未更改权限规则、路由、API 或数据库结构。
- 验证：`npm run check`、`npm run version:check`、`npm run test:notification-settings-load`、定向 ESLint 和 `npm run build` 通过；ESLint 保留 2 条既有加载 effect 依赖 warning，构建保留大分包提示。Browser plugin not available，使用 Playwright MCP，在本地 `http://127.0.0.1:5174/__settings-qa` 隔离挂载真实组件并提供 API 夹具：普通成员无管理入口、管理员配置失败无保存入口及重试恢复、仅备份权限视图、未保存品牌不影响关于页、备份失败不作空记录、失去权限时自动回退全部通过；1366×900 和 390×844，窄屏无横向溢出；页面非空、无框架错误遮罩，组件阶段 0 console error，1 条减少动态效果的开发提示。
- 证据：桌面浅色 `/tmp/xmt-settings-member-v3325.png`，窄屏暗色 `/tmp/xmt-settings-backup-mobile-v3325.png`。所有 API 响应为测试夹具，写入请求为 0；未验证真实认证、备份创建/下载/删除或生产运行。
- 下一阶段：继续清单 B10，核实移动工作台跳转到桌面页的实际入口，优先完成手机浏览器轻操作的路由和布局闭环。AuthRolloutStatus 已有运维明细折叠，本轮保持现有管理员页面。

## v3.3.24 通知偏好与品牌 Logo 保存反馈（2026-09-27）

- 完成内容：通知偏好、通知渠道、事件类型三项数据必须全部成功读取且为数组，页面才允许编辑后保存；任一请求失败均显示错误与重试，并禁用保存，避免服务端先删后写接口收到空列表而清除原有偏好。Logo 文件选择后先检查类型、大小并实际解码，成功只更新当前页预览；选择/读取失败和服务端保存失败分别反馈，重复选择同一文件可再次触发。
- 修改范围：`src/api/notificationSettings.ts`、`src/pages/NotificationSettings.tsx`、`tests/notifications/notification-settings-load.test.ts` 与版本文档。
- 数据库变化：无迁移；没有执行真实账号偏好或品牌设置写入。
- 测试结果：`npm run test:notification-settings-load`、`npm run version:check`、`npm run check`、`npm run build`、定向 ESLint、`git diff --check` 通过。定向 ESLint 有 3 条 NotificationSettings 既有 effect 依赖 warning（通知加载、系统设置和备份加载函数），无 error；构建有仓库既有 Silk chunk >500 kB 提示。
- 风险说明：Playwright 仅打开本地登录页确认应用可渲染；没有登录测试账号，也未验证通知设置页中的真实交互或服务端写入。浏览器显示 1 条错误，本机后端 API 未运行导致登录页系统设置请求失败，不代表本次设置组件错误；未部署。
- 下一阶段：继续改造清单下一未完成项，先沿当前调用链核实服务端持久化和错误反馈边界。

## v3.3.23 实时通知去重与审核反馈核实（2026-09-27）

- 完成内容：确认选题创建时服务端会发房间广播 `topic:created`，并为创建者/审核人创建持久化个人消息；原前端两路都会触发桌面通知，导致同一操作重复弹系统通知。现 `RealtimeToast` 仅负责页面内提示，桌面通知由 `new_message` 个人消息事件统一触发。选题审核成功 toast 在 `TopicDetail` 已存在，清单所述“审核成功无反馈”在当前代码已不成立，未重复改造。
- 修改范围：`src/components/RealtimeToast.tsx`、`tests/notifications/realtime-toast-routing.test.ts`、通知路由测试脚本及版本文档。
- 数据库变化：无迁移、无业务数据写入。
- 测试结果：`npm run test:notification-routing`、`npm run version:check`、`npm run check`、定向 ESLint、`npm run build` 与 `git diff --check` 通过；定向 ESLint 有 1 条既有 `react-refresh/only-export-components` warning（RealtimeToast 既有同时导出组件和触发函数的结构），无 error。Playwright MCP 在 `http://127.0.0.1:5174/login` 隔离挂载真实 `RealtimeToast` 并模拟房间事件：页面 toast 可见，Notification spy 调用数为 0；截图 `.playwright-mcp/xmt-realtime-toast-v32323-live.png`。页面标题/身份正常，宿主登录页 API `/api/system-settings/public` 因本机后端 3001 未运行而拒绝连接，浏览器控制台还保留之前 HMR WS 拒连记录；这些不是本次组件交互错误，故不宣称整页零错误。
- 风险说明：实时房间事件仍显示页面内 toast；数据库个人消息仍保留桌面通知及用户偏好。未进行多账号真实 Socket 浏览器验收，生产未验收。
- 下一阶段：继续沿清单核对通知偏好保存、审核反馈和 Logo 选择/上传文案，按服务端实际持久化行为区分“保存成功”和本地预览。

## v3.3.22 日报、番茄钟与批量已读错误反馈（2026-09-27）

- 完成内容：个人日报加载失败独立显示错误与重试，不再把失败误作空表单；日报提交成功/失败都有明确反馈。月/年报及日报归档读取失败均显示错误与重试；月/年报提交结果有反馈。番茄钟统计和排行榜失败有可见错误与重试。批量消息已读并发处理后只将服务端成功项更新为已读，失败项保留未读并显示部分完成数量。
- 修改范围：`src/pages/DailyReportPage.tsx`、`src/components/daily-report/DailyReportSummaryForm.tsx`、`src/components/daily-report/DailyReportSummaryArchive.tsx`、`src/components/PomodoroTimer.tsx`、`src/pages/PomodoroPage.tsx`、`src/pages/Messages.tsx` 及版本文档。
- 数据库变化：无迁移、无业务数据写入。
- 测试结果：`npm run version:check`、`npm run check`、本次修改文件的定向 ESLint、`npm run build`、`git diff --check`、`npm run test:entrypoints`、`npm run test:daily-report-permissions`、`npm run test:report-summaries`、`npm run test:message-localization` 及 `npx tsx tests/integrity/resource-pomodoro.test.ts` 通过。构建保留既有 Silk 分包 >500 kB 提示。当前 Playwright MCP 仅连接到本地登录页；未使用测试账号进行认证或提交真实业务数据，因此未完成已认证页面交互回归。
- 风险说明：消息批量已读仍是逐条服务端请求，网络失败时可能部分成功；现在会呈现真实部分状态并可重试剩余未读。未连接生产数据，未部署。
- 下一阶段：继续审计改造清单中的审核成功反馈、通知双发和高频操作结果契约，按调用链逐项确认后成组修复。

## v3.3.21 业务加载失败与搜索竞态收口（2026-09-27）

- 完成内容：成就页不再将六个关键接口的失败各自吞成空数据；整组加载失败时显示明确错误与重试。资料搜索和资料列表均以请求序号隔离迟到响应，旧成功、旧失败和旧 `finally` 不得覆盖当前查询；空搜索会使先前搜索失效并清空旧结果。
- 修改范围：`src/pages/Achievements.tsx`、`src/pages/ResourceSearch.tsx`、`src/pages/ResourceLibrary.tsx` 及版本文档。
- 数据库变化：无迁移、无业务数据写入。
- 测试结果：Playwright MCP 的本地组件回归覆盖：成就六接口首轮失败显示错误且不展示“暂无成就”，点击重试后成功进入页面；资料搜索和资料列表先发 alpha（延迟）后发 beta（即时），再释放 alpha，界面仍保留 beta；页面身份分别为“成就系统”“资料搜索”“项目资料库”。`npm run version:check`、`npm run check`、定向 ESLint、`npm run test:topics-list-notify`、资源引用契约测试 5 项、`npm run build` 与 `git diff --check` 通过；定向 ESLint 0 error，Achievements 有 4 条未使用变量 warning；构建保留既有 Silk chunk >500 kB 提示。浏览器宿主页系统设置接口返回 500，另有 Vite HMR WebSocket 拒连和早期测试挂载错误，未将整页控制台声明为零错误；被测组件 API 使用隔离 mock，不连真实数据库。
- 风险说明：成就采用保守整页错误策略，只要关键数据组任一接口失败即提供整体重试；资料查询仍不主动中止网络请求，仅忽略已过期响应；生产未验收。
- 下一阶段：继续清查静默失败的可选数据与关键操作反馈，优先核对日报、通知已读、番茄钟统计和周报剩余入口，保留核心错误不被成功空态掩盖。

## v3.3.20 报告中心周报失败恢复（2026-09-27）

- 完成内容：周报接口错误与成功空数据分开呈现；失败显示明确说明和“重试加载”操作，重试过程继续显示加载态。
- 修改范围：`src/pages/ExportPage.tsx` 及版本文档。
- 数据库变化：无迁移、无业务数据写入。
- 测试结果：Playwright MCP 在本地 Vite 组件夹具中加载真实 `ExportPage`，周报 API 首次返回 503 后页面显示“周报加载失败”和“重试加载”，没有伪显示暂无数据；点击重试后第二次 API 成功，报告数值与周期出现，错误提示消失。另以成功返回空值验证原“暂无周报数据”状态仍保留。`npm run version:check`、`npm run check`、定向 ESLint、`npm run build` 和 `git diff --check` 通过；构建仍有既有 Silk chunk >500 kB 提示。测试用 API 响应为浏览器 mock，未连接真实数据库。宿主登录页 `system-settings/public` 返回 500，且 Playwright 进程有 HMR WebSocket 拒连日志，这些属于测试宿主页/工具连接，不是本次被测错误卡片。
- 风险说明：不改变周报 API、统计口径或成功数据展示；生产未验收。
- 下一阶段：继续沿清单检查其他业务页面失败反馈与重复请求恢复。

## v3.3.19 知识库过期请求保护（2026-09-27）

- 完成内容：分类或搜索词切换触发新查询后，忽略先前查询迟到的成功、失败和 finally 状态提交；分类首次展开使用函数式状态更新，避免闭包里的旧展开状态覆盖用户当前选择。
- 修改范围：`src/pages/KnowledgeLibrary.tsx` 及版本文档。
- 数据库变化：无迁移、无业务数据写入。
- 测试结果：Playwright MCP 从 Vite 实际加载并挂载知识库组件，以受控 API 响应复现竞态：`alpha` 查询保持 pending，随后 `beta` 返回“BETA CURRENT RESULT”，再释放迟到的 alpha 成功响应；最终仍显示 beta，旧结果未覆盖。卸载测试组件并恢复 fetch。`npm run version:check`、`npm run check`、定向 ESLint、知识库引用关联回归 5 项、`npm run build` 与 `git diff --check` 通过；构建保留既有 Silk chunk >500 kB 提示。浏览器验证使用 API 夹具而非真实数据库；宿主登录页公共系统设置请求返回 500，故不把宿主控制台描述为零错误。
- 风险说明：保留原 API、查询条件、错误重试和空结果显示；生产未验收。
- 下一阶段：继续核验业务页面加载/空态/失败恢复路径，优先补充真实页面的慢响应与失败重试浏览器回归。

## v3.3.18 全局崩溃回退双主题修复（2026-09-27）

- 完成内容：全局 `ErrorBoundary` 回退移除硬编码白字、`coral/20` 透明面板和重复写死按钮颜色，改用双主题文本/错误令牌、边框和 `.xmt-btn` 组件；重载、返回首页、复制诊断及错误详情脱敏逻辑不变。
- 修改范围：`src/components/ErrorBoundary.tsx` 及版本文档。
- 数据库变化：无迁移、无业务数据写入。
- 测试结果：Playwright MCP 加载本地页面及本次 Vite 生成样式，分别在暗/浅主题挂载错误回退所用类名读取实际计算样式：错误图标底分别为 coral-soft `rgba(255, 122, 147, 0.14)` / `rgba(159, 18, 57, 0.08)`，错误标题/正文分别为 `rgb(242, 245, 250)` / `rgb(15, 23, 42)` 与 `rgb(163, 175, 196)` / `rgb(71, 85, 105)`；按钮类生成并使用统一 secondary/primary 样式。`npm run version:check`、`npm run check`、定向 ESLint、`npm run build`、`git diff --check` 与 `tests/mobile/android-runtime-contract.test.ts` 通过；构建保留既有 Silk chunk >500 kB 提示。测试页公共设置接口返回 500，未登录真实业务页面触发 ErrorBoundary，因此不声称恢复按钮的真实错误现场已端到端验收。
- 风险说明：仅改全局错误回退呈现，不改变崩溃捕获和恢复动作；生产未验收。
- 下一阶段：继续检查业务页面的加载、空态与失败恢复路径，并以 Playwright MCP/Chrome DevTools MCP 对实页关键流程取证。

## v3.3.17 共用空状态图标底色（2026-09-27）

- 完成内容：共用空状态图标面板移除未生成 CSS 的 `studio-surface-soft/70` 透明度变体，改用现有不透明 `studio-surface-soft`；其他视觉和操作不变。
- 修改范围：`src/components/studio/EmptyState.tsx` 及版本文档。
- 数据库变化：无迁移、无业务数据写入。
- 测试结果：Playwright MCP 在真实资料库列表空结果 `/asset-center/resources?library_type=project` 验证；修复前暗色图标背景计算值为透明 `rgba(0, 0, 0, 0)` 且相应透明度 CSS 规则不存在。修复后暗/浅主题分别为 surface-soft `rgb(23, 30, 46)` / `rgb(238, 242, 248)`。390×844 无横向溢出；搜索无匹配关键词后 URL 更新且空态稳定保留。页面身份和内容正常，控制台错误 0。`npm run version:check`、`npm run check`、定向 ESLint、构建及 `git diff --check` 通过；构建仍有既有 Silk chunk >500 kB 提示。截图见 `.playwright-mcp/xmt-empty-state-*-390.png`。
- 风险说明：只调整共用图标面板背景，不改空态内容和页面数据；生产未验收。
- 下一阶段：继续检查共用错误提示和各业务页面的加载、空态、失败恢复路径。

## v3.3.16 共用 403 权限提示主题底色（2026-09-27）

- 完成内容：权限提示头部与锁图标面板移除依赖 CSS 变量透明度的渐变/透明底，改用 `studio-amber-soft` 和中性边框；403 文案、权限判断与导航行为不变。
- 修改范围：`src/components/AccessDeniedState.tsx` 及版本文档。
- 数据库变化：无迁移、无业务数据写入。
- 测试结果：Google Chrome 扩展连接中打开真实 `/admin/auth-rollout` 403 路由；暗/浅主题头部底色分别为 amber-soft `rgba(245, 200, 107, 0.14)` / `rgba(120, 53, 15, 0.08)`，文字对比正确。另用 Playwright 在 390×844 下复验，两主题 `scrollWidth` 均为 390；返回首页和进入设置中心均到达正确路由，页面错误与控制台错误为 0。`npm run version:check`、`npm run check`、`npm run build`、定向 ESLint 及 `git diff --check` 通过；构建有既有 Silk chunk >500 kB 非阻断提示。
- 风险说明：为触发角色受限路由，仅在临时隔离数据库副本中将测试账号角色设为 editor；原始数据库未改写，测试服务和副本随后清理。仅验收共用展示路由，不代表生产权限策略验证。
- 下一阶段：继续检查共用权限提示、空状态与错误状态的主题及交互覆盖。

## v3.3.15 确认弹窗主题底色（2026-09-27）

- 完成内容：共用确认弹窗 danger/warning/default 三种类型的图标面板采用双主题可见的语义柔和底色、中性边框和对比文字；按钮和操作逻辑不变。
- 修改范围：`src/components/common/ConfirmModal.tsx` 及版本文档。
- 数据库变化：无迁移、无业务数据写入。
- 测试结果：Playwright 在本机 Vite 登录页挂载真实 `ConfirmModal` React 组件，danger/warning/default 三种图标面板在暗色主题背景分别为 `rgba(255, 122, 147, 0.14)`、`rgba(245, 200, 107, 0.14)`、`rgba(107, 140, 255, 0.14)`；浅色分别为 `rgba(159, 18, 57, 0.08)`、`rgba(120, 53, 15, 0.08)`、`rgba(61, 90, 254, 0.08)`；各面板文字与中性边框正确。三种“继续”按钮各触发确认回调一次，“取消”按钮触发取消回调一次。390×844 下无横向溢出，页面/控制台错误 0。`npm run check`、`npm run version:check`、构建、定向 ESLint 与 `git diff --check` 通过；构建有已知 Silk chunk >500 kB 提示。
- 风险说明：通过真实组件挂载并触发回调验证，但未在业务页面触发真实删除/警告操作；生产未验收。
- 下一阶段：继续检查共用权限提示和确认/错误表面。

## v3.3.14 共用错误状态主题底色（2026-09-27）

- 完成内容：共享错误状态组件的失败、警告及未找到图标面板改为可见的双主题柔和底色与中性边框；状态含义、错误文案和重试入口不变。
- 修改范围：`src/components/common/ErrorState.tsx` 及版本文档。
- 数据库变化：无迁移、无业务数据写入。
- 测试结果：Playwright 在 `http://127.0.0.1:5174/login` 确认页面标题正确、登录表单可见；从 Vite 实际导入并挂载 `ErrorState` React 组件，渲染失败、警告、未找到三种状态并读取 production CSS 计算样式。暗色失败/警告/未找到面板背景为 coral soft `rgba(255, 122, 147, 0.14)`、amber soft `rgba(245, 200, 107, 0.14)`、surface soft `rgb(23, 30, 46)`；浅色为 `rgba(159, 18, 57, 0.08)`、`rgba(120, 53, 15, 0.08)`、`rgb(238, 242, 248)`，文字和中性边框均正确。实际 React “重试”按钮点击触发回调一次；390×844 无横向溢出，浏览器错误 0。`npm run check`、`npm run version:check`、`npm run build`、定向 ESLint 和 `git diff --check` 通过；构建存在既有 Silk chunk >500 kB 提示。
- 风险说明：验收渲染的是实际组件，但以登录页为容器挂载，不是某个业务页面的真实失败 API 状态；生产未验收。
- 下一阶段：继续检查剩余主题表面与业务状态提示。

## v3.3.13 组织权限徽标主题底色（2026-09-27）

- 完成内容：组织权限页七种角色标签和启用/禁用状态标签采用双主题语义柔和底色、中性边框和对比文字；启停按钮和角色含义不变。
- 修改范围：`Users.tsx` 角色色映射、启用状态可操作/只读徽标及版本文档。
- 数据库变化：无迁移、无业务数据写入。
- 测试结果：Playwright 在 `http://127.0.0.1:5174/login` 确认页面标题正确、登录表单可见；七类角色徽标和启用/禁用徽标在真实 production CSS 下暗/浅主题计算背景、文字和边框均匹配对应令牌；轻色截图显示所有标签清晰。测试夹具切换启用按钮后标签由“启用”变为“禁用”，源代码检查确认其仍调用原 `handleToggleEnable`。浏览器错误 0。`npm run check`、`npm run version:check`、`npm run build`、定向 ESLint 和 `git diff --check` 通过；构建存在既有 Silk chunk >500 kB 提示。
- 风险说明：未登录组织权限页，也未通过服务端接口实际修改账户状态；切换交互在 DOM 测试夹具中验证，生产未验收。
- 下一阶段：继续检查未覆盖的业务页面状态徽标和主题表面。

## v3.3.12 全局通知主题底色（2026-09-27）

- 完成内容：全局成功、失败、警告和提示通知卡片与图标改用对应语义柔和底色、中性边框和对比文字；内容、图标、关闭按钮及 5 秒自动关闭逻辑不变。
- 修改范围：`Layout.tsx` 全局通知类型样式及版本文档。
- 数据库变化：无迁移、无业务数据写入。
- 测试结果：Playwright 在 `http://127.0.0.1:5174/login` 确认页面标题正确、登录表单非空；以 v3.3.12 production CSS 检查四种通知类型的双主题计算样式。暗色成功/失败/警告/提示背景分别为 `rgba(61, 219, 160, 0.14)`、`rgba(255, 122, 147, 0.14)`、`rgba(245, 200, 107, 0.14)`、`rgba(107, 140, 255, 0.14)`；浅色分别为 `rgba(6, 95, 70, 0.08)`、`rgba(159, 18, 57, 0.08)`、`rgba(120, 53, 15, 0.08)`、`rgba(61, 90, 254, 0.08)`；四类文字、图标表面和中性边框均有正确计算样式。测试夹具点关闭后卡片由 4 张减为 3 张，源代码合同确认实际通知保留 5 秒超时和移除回调。浏览器错误 0。`npm run check`、`npm run version:check`、`npm run build`、定向 ESLint（0 error，既有警告）和 `git diff --check` 通过；构建存在既有 Silk chunk >500 kB 警告。
- 风险说明：页面集成只检查到登录页；通知本身由 Playwright DOM 夹具展示并测算 production CSS，关闭交互在夹具中验证且源代码回调合同未变，未从已认证业务页触发真实全局通知。测试使用隔离数据库副本，生产未验收。
- 下一阶段：继续排查剩余状态提示与全站主题表面。

## v3.3.11 成就稀有度标签主题底色（2026-09-27）

- 完成内容：普通、稀有、史诗、传说四档标签采用双主题可见的柔和底色和中性边框；分布卡片圆点继续使用各稀有度强调色；解锁、筛选、积分及统计逻辑不变。
- 修改范围：成就稀有度映射、成就徽标与稀有度分布显示，以及版本文档。
- 数据库变化：无迁移、无业务数据写入。
- 测试结果：React SSR 渲染四档真实 `RarityBadge`，Playwright 加载本次 production build CSS 并读取暗/浅主题计算样式：稀有/史诗/传说暗色背景分别为 `rgba(107, 140, 255, 0.14)`、`rgba(167, 139, 250, 0.14)`、`rgba(245, 200, 107, 0.14)`；浅色分别为 `rgba(61, 90, 254, 0.08)`、`rgba(91, 33, 182, 0.08)`、`rgba(120, 53, 15, 0.08)`；四档文字和边框均有实际样式。成就页测试账号登录 API 记录成功，但单页应用仍返回 `/login`，故筛选交互和真实成就页控制台状态未能验收。`npm run check`、`npm run version:check`、`npm run build`、定向 ESLint（0 error、5 warnings）和 `git diff --check` 通过；构建存在既有 Silk chunk >500 kB 警告。
- 风险说明：仅完成徽标组件渲染与真实 build CSS 的计算样式矩阵，不代表成就页整体 UI 和筛选已通过浏览器验收。Playwright 截图为组件级明暗主题预览；本地隔离账号认证后的路由仍跳回登录页；生产未验收。
- 下一阶段：继续排查其他状态/提示组件及全站主题表面。

## v3.3.10 移动端选题状态标签主题底色（2026-09-27）

- 完成内容：移动端选题列表与详情接入共享状态色映射；待审核、已通过、已驳回、创作中、拍摄中、发布中按语义显示不同的双主题柔和底色和中性边框；状态文案与流转不变。
- 修改范围：选题共享状态色常量、移动端选题列表/详情标签及版本、更新说明和索引。
- 数据库变化：无迁移，无业务数据写入。
- 测试结果：Playwright 在 390×844 本地页面载入 Vite 样式后，从真实 `STATUS_COLORS` 与 `STATUS_TEXT` 生成六类状态徽标并逐一读取计算样式。暗色底色分别为 amber `rgba(245, 200, 107, 0.14)`、success `rgba(61, 219, 160, 0.14)`、coral `rgba(255, 122, 147, 0.14)`、primary `rgba(107, 140, 255, 0.14)`、violet `rgba(167, 139, 250, 0.14)`、cyan `rgba(92, 225, 230, 0.14)`；浅色对应为 `rgba(120, 53, 15, 0.08)`、`rgba(6, 95, 70, 0.08)`、`rgba(159, 18, 57, 0.08)`、`rgba(61, 90, 254, 0.08)`、`rgba(91, 33, 182, 0.08)`、`rgba(21, 94, 117, 0.08)`。React SSR 逐项断言列表七种状态输出正确文案和颜色类。类型、版本、定向 ESLint、构建和 diff 检查通过；构建有既有 Silk 背景 chunk >500 kB 非阻断提示。
- 风险说明：尝试以 Android Development Runtime 进行 Playwright 页面验收时，本地服务的 `/v1/auth/mobile/login` 返回 404，未能进入真实移动列表/详情；本次仅完成状态徽标的组件 SSR 与实际 Tailwind 主题样式矩阵验证，移动端真实交互和生产仍未验收。
- 下一阶段：继续排查其他状态/提示组件以及全站主题表面。

## v3.3.9 复盘状态标签主题底色（2026-09-27）

- 完成内容：复盘的草稿/已发布状态及行动项的进行中/已完成状态改用双主题柔和底色和中性边框；状态与操作逻辑不变。
- 修改范围：复盘共用状态标签及版本、更新说明和索引。
- 数据库变化：无迁移，无业务数据写入。
- 测试结果：Playwright 本机隔离数据库副本打开 `/retrospectives/1`，1366×768 页面身份正确、正文非空。已发布标签暗色背景为 `rgba(61, 219, 160, 0.14)`、浅色为 `rgba(6, 95, 70, 0.08)`，两主题文字均为高对比 success 字色；390×844 下标签仍可见，控制台/页面错误为 0。服务端渲染逐项断言 draft/published/archived/todo/doing/done/cancelled 七种状态都使用预期的语义底色或中性表面与中性边框。`npm run check`、`npm run build`、`npm run version:check`、定向 ESLint 和 `git diff --check` 通过；构建有既有 Silk 背景 chunk >500 kB 非阻断提示。
- 风险说明：管理员详情页中行动项处于可编辑模式，未通过真实 UI 展示只读行动项状态徽标；七种行动/复盘状态映射另由 React SSR 合同断言覆盖。隔离副本复盘列表默认只查近 30 天；已存在记录的复盘周期为 2026-06-30 至 2026-07-06，超出默认时间范围，因此列表空态符合筛选条件。生产未验收。
- 下一阶段：继续排查其他共享状态标签和全站主题表面。

## v3.3.8 灵感标签主题底色（2026-09-27）

- 完成内容：灵感类别和“已转选题”标记改用双主题语义柔和底色；灵感转化、评论通知和数据均不变。
- 修改范围：灵感库标签样式及版本、更新说明和索引。
- 数据库变化：无迁移，无业务数据写入。
- 测试结果：Playwright 本机隔离数据库副本 `http://127.0.0.1:5174/inspirations`，1366×768：登录后收起更新提示、展开“内容生产”并点击“灵感库”，页面标题正确、正文非空；类别标签可见，已转选题标签存在。暗色状态标签背景为 `rgba(61, 219, 160, 0.14)`、文字为 `rgb(185, 245, 220)`；浅色背景为 `rgba(6, 95, 70, 0.08)`、文字为 `rgb(6, 95, 70)`。口播类别暗色背景为 `rgba(107, 140, 255, 0.14)`。页面错误与控制台错误均为 0。`npm run check`、`npm run build`、`npm run version:check`、定向 ESLint 和 `git diff --check` 均通过；构建有既有 Silk 背景 chunk >500 kB 的非阻断提示。
- 风险说明：使用隔离数据库进行页面验收，生产未验收。
- 下一阶段：继续按历史改造页面排查并修复仍使用 CSS 变量透明度工具类的状态标签。

## v3.3.7 发布详情状态标签主题底色（2026-09-27）

- 完成内容：发布详情的已发布、发布失败、已预定和待发布标签改用双主题语义柔和底色、高对比文字和中性边框；状态与流程不变。
- 修改范围：发布详情状态标签及版本、更新说明和索引。
- 数据库变化：无迁移，无业务数据写入。
- 测试结果：Google Chrome 扩展浏览器在 1200×720 本机隔离数据库副本中从发布列表打开“已发布”详情 `/publishing/30` 和“待发布”详情 `/publishing/34`；两条路由均正常渲染。已发布标签修复前无可见底色，修复后暗色、浅色均有 success 柔和底色；待发布标签浅色主题呈现 amber 柔和底色。明暗主题切换与返回列表交互正常，未修改状态或业务记录。`npm run check`、`npm run build`、`npm run version:check` 和 `git diff --check` 通过；定向 ESLint 0 错误、4 条警告（3 个未使用导入、1 个 Hook 依赖提示）；构建有已知 Silk 背景 chunk >500 kB 非阻断警告。
- 风险说明：使用隔离数据库副本，生产未验收。
- 下一阶段：继续按页面回归其余历史主题标签与表面，优先检查仍使用 CSS 变量色透明度工具类的状态标签。

## v3.3.6 成片制作详情标签主题底色（2026-09-27）

- 完成内容：计划中/制作中/已完成/已取消阶段标签、本地编辑版本提示和制作完成提示改用现有双主题语义柔和底色与高对比文字；状态与流程逻辑不变。
- 修改范围：成片制作详情样式及版本、更新说明和索引。
- 数据库变化：无迁移，无业务数据写入。
- 测试结果：Browser 插件不可用，改用 Playwright 在隔离数据库副本验收。成片详情 `/shooting/42` 的“计划中”暗色背景为 `rgba(245, 200, 107, 0.14)`、浅色为 `rgba(120, 53, 15, 0.08)`；“本地编辑版”暗色为 `rgba(107, 140, 255, 0.14)`、浅色为 `rgba(61, 90, 254, 0.08)`。此前改造的创作列表“草稿”和选题详情“已通过”仍有非透明底色；灵感库正常加载；浏览器页面错误 0。`npm run check`、`npm run build`、版本检查和 `git diff --check` 通过；定向 ESLint 0 错误、1 条既有 Hook 依赖警告；构建有已知 Silk 背景 chunk >500 kB 提示。
- 风险说明：测试使用隔离数据库副本，未写入原始业务数据；完成提示未用会推进状态的操作触发，生产未验收。
- 下一阶段：继续回归其余历史改造页面与主题标签。

## v3.3.5 选题详情阶段标签主题底色（2026-09-27）

- 完成内容：选题详情状态标签复用 v3.3.4 的 primary/cyan/violet/coral/amber/success 双主题语义柔和底色和中性边框；业务状态与流转不变。
- 修改范围：选题详情状态样式及版本、更新说明和索引。
- 数据库变化：无迁移，无业务数据写入。
- 测试结果：Browser 插件不可用，使用 Playwright 在 1440×900 隔离数据库页面从选题列表打开详情；浅色 `已通过` 背景 `rgba(6, 95, 70, 0.08)`，暗色背景 `rgba(61, 219, 160, 0.14)`，控制台错误为 0。`npm run check`、版本检查、构建和 diff 检查通过；定向 ESLint 零错误、6 条既有警告；构建有已知 Silk chunk >500 kB 非阻断提示。
- 风险说明：测试仅覆盖桌面选题详情，移动端使用独立页面未纳入；使用隔离数据库副本，未写入业务数据；生产未验收。
- 下一阶段：继续核验其他页面对 CSS 变量色透明度工具类的使用情况。

## v3.3.4 创作列表状态标签主题底色（2026-09-24）

- 完成内容：创作列表的选题状态和稿件状态标签改用显式双主题语义柔和底色与中性边框；新增 primary/cyan/violet/coral/amber/success 六种柔和底色令牌。
- 修改范围：Studio 主题令牌、Tailwind 令牌映射、创作列表状态标签及版本文档。
- 数据库变化：无迁移，无业务数据写入。
- 测试结果：Browser 插件当前不可用，改用 Playwright 在 `http://127.0.0.1:5174/production` 的 1440×900 页面验证 20 条创作记录及状态标签；暗色 `草稿` 背景 `rgba(245, 200, 107, 0.14)`，浅色 `rgba(120, 53, 15, 0.08)`，两主题均非透明，控制台错误为 0。`npm run check`、定向 ESLint、版本检查、构建和 diff 检查通过；构建有已知 Silk chunk >500 kB 非阻断提示。
- 风险说明：浏览器使用隔离数据库副本；截图仅包含标签，保存于 `/tmp/xmt-production-status-light.png` 和 `/tmp/xmt-production-status-dark.png`。移动端使用独立页面，未纳入本轮；生产未验收。
- 下一阶段：继续核验其他页面对 CSS 变量色透明度工具类的使用情况。

## v3.3.3 灵感新评论提示对比度（2026-09-24）

- 完成内容：灵感库“有新评论”标签由未生效的 cyan 半透明底和普通 cyan 字色改为主题柔和表面及高对比文字令牌；不改评论事件、通知逻辑或展示时长。
- 修改范围：灵感标签样式及版本、更新说明。
- 数据库变化：无迁移；真实业务记录不变。
- 测试结果：隔离数据库副本双会话 Playwright 由另一成员发表评论，接收页面真实收到 Socket 事件并显示标签；浅/暗主题计算样式均使用柔和表面，控制台错误为 0。`npm run version:check`、`npm run check`、定向 ESLint、`npm run build`、`git diff --check` 通过；构建有已知 Silk 背景 chunk >500 kB 非阻断警告。
- 风险说明：浏览器验收使用隔离副本及临时账号/灵感/评论，副本和测试服务已清理；生产未验收。
- 下一阶段：继续盘点全站剩余主题语义色和表面。

## v3.3.2 趋势周期主题对比度（2026-09-24）

- 当前版本：v3.3.2；Creator Agent 版本保持不变。
- 完成内容：数据趋势中心周期按钮移除低对比白字/cyan 实色及未生效的半透明底，改用可见主题柔和表面、cyan 对比字和强调边框。
- 修改范围：趋势中心组件及版本、更新说明和验证文档。
- 数据库变化：无迁移；趋势 API 用 Playwright 临时响应验证，不改真实趋势数据。
- 测试结果：浅/暗色 1440×900 浏览器均可切换至 7 天并发出对应请求，控制台错误为 0；选中文字对背景对比度 6.47:1 / 13.87:1。另在隔离数据库副本复测暗色批注添加、编辑和取消成功。`npm run check`、版本检查、定向 ESLint、构建和 diff 检查通过。
- 风险说明：Creator Trends 使用临时 API 响应验证周期交互；真实账号趋势权限与数据含义未在本轮重新验收。生产未验收。
- 下一阶段：继续盘点语义色低对比标签（含灵感“有新评论”状态）和全站剩余主题表面。

## v3.3.1 编辑器浅色主题批注输入修正（2026-09-24）

- 当前版本：v3.3.1；Creator Agent 版本保持不变。
- 完成内容：编辑器浅色模式下的批注输入框不再使用硬编码白底和灰色占位色，改用 Studio 表面与文本令牌。
- 修改范围：`src/components/editor/Editor.tsx` 及版本、更新说明和验证记录。
- 数据库变化：无迁移，无正式数据写入。
- 测试结果：`npm run version:check`、`npm run check`、定向 ESLint、`git diff --check`、`npm run build` 通过；隔离数据库副本上 1440×900 Playwright 打开并取消批注输入框，浅色表面、文字和占位色正确，控制台错误为 0。构建有已知 Silk 背景 chunk >500 kB 非阻断警告。
- 风险说明：仅验收浅色桌面添加批注入口；暗色主题及已有批注编辑状态未在本轮复测，生产未验收。
- 下一阶段：继续审查全站尚未检查的主题表面和关键表单控件；完成后再进入状态/正文真源改造。

## v3.3.0 选题草稿、窄屏列表与编辑器写作辅助（2026-09-24）

- 当前版本：v3.3.0；Creator Agent 版本保持不变。
- 完成内容：新增选题本机草稿可续写且不会创建服务端选题；提报成功直达详情；大纲迁出旧编辑器；选题表格与工具栏适配窄屏；编辑器销毁态访问增加保护；统一编辑器支持查找替换、目标字数、进度和预计阅读时长；创作详情支持专注写作、按大纲补入缺失小节、资料全文或经原文校验的选中片段引用，以及当前稿件“已用/待用”标记；选题详情不再向待审核项显示服务端禁止的通用推进动作；创作版本被替代时改用编辑器内提示并保持只读；手机创作页允许编辑器工具栏浮层溢出；本轮另统一侧栏、全局顶部栏、命令面板、选题表格、资料中心、日报、复盘、公告/匿名意见、编辑器菜单、导航外观及外观预览部分组件的浅色主题表面令牌，修正企业登录悬停文字对比和深色主按钮对比度，令双主题预览矩阵在各自令牌作用域内渲染，并收敛旧主题 hook 到应用 store。
- 修改范围：新增选题页、选题列表、响应式表格壳、应用布局、创作详情、编辑器生命周期与写作辅助及版本文档。
- 数据库变化：无迁移；不自动删除旧版“保存草稿”已生成的选题。
- 测试结果：见 `releases/v3.3.0-topic-drafts-responsive.md`。
- 风险说明：本机草稿仅在当前设备和账号可读，需手动点击保存；真实账号下旧 HTML 的格式保真仍需验收。
- 当前验证补充：认证网关单测、`npm run test:reactbits-theme`、`npm run check` 与 `npm run build` 通过；生产构建有 Silk 背景 chunk >500 kB 的非阻断提示。浏览器登录 500 已定位为测试 Vite 使用 5175，而本地 CORS 白名单只允许默认 5174；改用默认端口后认证和首页工作台可用。同步修正旧浏览器脚本的更新弹窗容器/首页文案定位，并检查深浅主题按钮矩阵渐变端点对比度及首页 1440px/390px 横向溢出。验证写入仅发生在隔离数据库副本，该副本与本地服务均已清理；原数据库只读完整性检查为 `ok`。
- 下一阶段：当前实际首页为“工作台”，已在明暗主题、1440px/390px 视口完成首屏与内容生产入口检查；旧 `DashboardBento` 未挂载到首页，需在后续清单项中确认是否重新接入，不能将该组件单独视为首页验收。之后逐项确认深色品牌区域、编辑器其余控件和全站剩余页面，再推进流程状态兼容改造；资料片段自动识别来源须先设计 provenance 契约，当前仅支持手动选源并校验原文。

继续修正选题预览“待审核”及灵感分类/“已转选题”的浅色语义文字，改用现有高对比 `*-contrast` token。Playwright 在 1440×900 浅色主题中确认目标标签可见且前景为高对比 token 颜色，控制台错误为 0；`npm run test:light-theme-contrast` 使用本地允许的 5174 地址通过。`npm run check`、`git diff --check` 通过；定向 ESLint 无错误但有 3 条警告。只使用隔离数据库副本，生产未验收。

本轮续做：编辑器颜色/高亮子菜单浅色表面与右键悬停前景已按主题令牌修正；查找替换、写作指标、大纲辅助专项测试和类型检查通过。独立真实浏览器交互验收仍待完成。

继续检查编辑器工具栏、块操作与批注控件：修正浅色首行缩进/标题菜单已启用态的同色叠字、白底硬编码及删除批注悬停同色问题。已用 测试账号 在隔离数据库副本通过 390×844 Playwright 登录浏览器检查首行缩进启用态、菜单表面与零控制台错误；生产验收不在本次范围内。

全站浅色主题继续发现当前富文本浮动格式栏的激活按钮同色叠字；已改为主色底白字。隔离数据库副本认证浏览器中实际选择文本并启用加粗，390×844 可见正确激活态且控制台错误为 0。

## v3.2.0 产品工作流全面改造（2026-09-23）

- 当前版本：v3.2.0；Creator Agent 版本保持不变。
- 完成内容：首页改为角色工作台；灵感转选题、选题转创作、创作更新链路闭环；列表分页、五组导航、命令面板、移动端中文化和业务化设置文案完成。
- 修改范围：首页与内容工作流页面、Workflow API、导航与命令面板、编辑器主题表面、移动端显示、专项回归及版本文档。
- 数据库变化：无迁移；不删除、不合并、不批量回填或改写已有业务数据。
- 测试结果：创作列表更新专项回归和 TypeScript 检查已通过；完整构建、版本门禁和浏览器验收记录在本次改造交付中。
- 风险说明：看板与日历仍保留兼容路由，尚未物理合并进选题页；状态模型、协作底座和数据迁移等高风险改造未在无生产迁移授权下扩展。
- 下一阶段：合并评审后按精确提交执行安全发布；正式环境需另行验证权限角色、真实数据分页和主要链路。

## v3.1.0 项目完整性整改（2026-09-22）

- 当前版本：v3.1.0；Creator Agent v2.14.4-agent。
- 完成内容：改密、RBAC、令牌吊销、资源与协作权限；旧运营入口收敛；模板与番茄钟闭环；生产历史分页；协作锁落库；Agent 有界采集与上传。
- 修改范围：认证、权限、资料、选题、生产、复盘、协作、番茄钟、模板、移动端、Agent/Collector、API 契约、CI 与版本文档。
- 数据库变化：新增迁移 015，保存用户令牌吊销版本、协作锁和锁事件；旧权限词条仅为旧版代码回滚保留，新版不再使用，不改写既有业务历史。
- 测试结果：见 `releases/v3.1.0-project-integrity-remediation.md`，正式环境与真实账号采集仍需单独验收。
- 风险说明：未使用真实账号复验抖音线上采集；lint 仍保留历史 warning 供后续清理。旧权限词条需等 v3.0.5 回滚窗口结束后再单独清理。
- 下一阶段：评审草稿 PR；如决定发布，再按精确提交与安全发布门禁执行正式环境验收。

## v3.0.5 抖音周期指标可用性修复（2026-09-22）

- 当前版本：v3.0.5；Creator Agent 保持 v2.14.3-agent。
- 完成内容：周期播放与互动按官方文件展示，缺少真实粉丝基线或周期文件时给出字段级原因；官方作品导出不再复制旧粉丝数为当日快照。
- 数据库变化：无迁移；不批量改写既有生产历史。
- 验收：官方导入与统一报告测试、页面渲染、版本检查、类型检查和构建通过；正式环境需在部署后复核。

## v3.0.4 协作编辑与版本记录修复（2026-09-21）

- 当前版本：v3.0.4；Creator Agent 保持 v2.14.3-agent。
- 完成内容：普通粘贴保持原版本；协作内容保存避免覆盖，旧版本房间停止写入；时间轴按真实快照、北京时间和操作人展示。
- 修改范围：创作 API、协作权限与编辑器、内容动态、回归测试及版本文档。
- 数据库变化：无迁移，不自动回填或覆盖现有稿件及历史。
- 测试结果：专项回归、类型检查和构建通过；双账号浏览器验收及正式发布门禁仍在执行。
- 风险说明：历史上未持久化的文字无法仅凭当前数据库确定恢复，需单独对照备份和当事人草稿。
- 下一阶段：完成双账号验收、合并后按精确提交发布，并在正式环境复核。

## v3.0.3 抖音定时官方导出稳定化（2026-09-21）

- 当前版本：v3.0.3；Creator Agent：v2.14.3-agent。
- 完成内容：每日与 12 小时自动任务改用真实验收通过的官方四文件采集路径，手动全量采集继续保留。
- 修改范围：Agent 调度策略、调度回归测试、版本与发布文档。
- 数据库变化：无迁移，不修改既有生产历史。
- 验收要求：安装后确认定时配置保持启用，自动路径与小范围同步均使用 `metrics_refresh`，四文件质量门和最新批次规则不变。

## v3.0.2 抖音作品状态标量兼容（2026-09-19）

- 当前版本：v3.0.2；Creator Agent：v2.14.2-agent。
- 完成内容：真实四文件同步已确认官方数据入库；修复作品状态对象无法写入 SQLite、导致普通作品快照部分成功的问题。
- 修改范围：抖音作品归一化、回归测试、Agent 与系统版本文档。
- 数据库变化：无迁移；不删除、合并或批量回填既有历史。
- 验收要求：新版 Agent 真实小范围同步需整体成功、官方周期日数为 1/7/30，且上传重试队列不得新增失败。

## v3.0.1 数据中心作品导出定位修复（2026-09-17）

- 当前版本：v3.0.1；Creator Agent：v2.14.1-agent。
- 完成内容：真实账号验收确认同页存在两个导出按钮；Agent 改为选择“作品数据”区域的第一个按钮，并保留错源失败关闭。
- 修改范围：抖音采集器导出控件定位、定向回归测试和版本文档。
- 数据库变化：无迁移，不覆盖或回填既有生产数据。
- 测试结果：真实 v2.14.0-agent 错误选择粉丝导出时被质量门槛拦截；修复后需由 v2.14.1-agent 再执行一次四文件同步验收。

## v3.0.0 抖音官方双导出与逐日口径（2026-09-17）

- 当前版本：v3.0.0；Creator Agent：v2.14.0-agent。
- 完成内容：后台下载作品列表和昨天、近 7 天、近 30 天数据；按最新文件清洗；精确周期汇总；趋势与报告使用官方逐日事实。
- 修改范围：本地 Agent 浏览器与解析器、官方上传契约、migration 014、抖音数据服务、趋势页、专项测试和版本文档。
- 数据库变化：新增官方账号日指标表及文件周期审计字段；不删除、合并、批量回填或伪造既有作品、快照和同步历史。
- 测试结果：附件 43/43 作品行与 30/30 日指标行解析通过；解析、计算、迁移、上传幂等、统一报告、Agent 无头门禁和 TypeScript 检查通过。
- 风险说明：真实账号四次后台下载尚未在本分支安装包上执行；Creator Center UI 若变更会失败关闭，不覆盖最后成功数据。
- 下一阶段：安装 v2.14.0-agent 后执行一次真实完整同步，核对四份本地回执、服务端 migration 014、概览 7/30 天值、趋势和日报/周报/月报。

## v2.22.3 抖音官方增长口径保护（2026-09-17）

- 当前版本：v2.22.3；Creator Agent 保持 v2.13.12-agent。
- 完成内容：官方累计指标启用时，播放与互动周期增长只在具备同口径官方基线后计算；当前不再展示旧采集快照产生的虚假负增长。
- 修改范围：抖音运营概览、统一复盘报告、数据完整度提示、类型与回归测试。
- 数据库变化：无 schema 迁移，不修改现有快照和官方指标历史。
- 风险说明：播放和互动周期增长暂显示暂无数据，待后续积累同口径官方历史快照后再恢复计算；真实粉丝变化可独立保留。

## v2.22.2 抖音官方作品计数校准（2026-09-17）

- 当前版本：v2.22.2；Creator Agent 保持 v2.13.12-agent。
- 完成内容：官方作品数按最新官方文件中的全部作品键统计，不再要求作品必须存在播放指标行。
- 修改范围：Douyin 官方汇总查询、统一报告回归测试与版本文档。
- 数据库变化：无 schema 迁移，不新增虚构的零值指标，不删除或合并历史数据。
- 测试结果：统一报告合同覆盖无播放指标行作品；完整版本、构建与发布门禁在发布闭环记录。
- 风险说明：作品数与指标覆盖行数不再强行相等；这是官方导出缺失字段的真实表现。
- 生产结果：最新官方导出已归一为 43 条作品，实时粉丝已校准为 2163；累计与互动汇总通过服务层复核。

## v2.22.1 抖音官方数据校准（2026-09-16）

- 当前版本：v2.22.1；Creator Agent：v2.13.12-agent。
- 完成内容：兼容创作者中心实时粉丝字段；运营概览与复盘报告统一采用最新官方作品导出；完全匹配的作品明细写入官方快照；不再使用过期快照计算周期增长。
- 修改范围：Douyin 采集归一、官方导出上传与服务端对账、运营数据服务、概览来源提示、专项合同测试及版本文档。
- 数据库变化：无 schema 迁移；不删除或合并生产历史。后续同步只对标题与发布日期完全一致的作品更新当前指标并追加快照，其余记录保留为官方汇总。
- 测试结果：粉丝字段归一、官方导出加密事务、幂等队列、最新导出口径、统一报告和 TypeScript 检查通过；完整构建、CI、Agent 安装与生产验证在发布闭环继续记录。
- 风险说明：创作者中心首页实时粉丝与数据中心按日结算粉丝可能因更新时间不同而短暂不一致；系统分别保留实时值与带日期快照，不把两者强行覆盖。官方导出无法可靠匹配的作品不会覆盖本地明细。
- 下一阶段：完成安全发布与 v2.13.12-agent 安装后执行真实同步，核对生产粉丝、最新官方导出累计值、数据库完整性和页面展示。

## v2.22.0 抖音运营数据统一与认证准入推进（2026-09-16）

- 当前版本：v2.22.0。
- 完成内容：抖音运营概览、作品、趋势和复盘报告统一使用标准化数据；累计播放与周期增长使用明确且不重复的口径；报告补齐指标并支持安全删除；下线无可用来源的粉丝画像模块；认证页只接受真实外部抓取作为监控证据。
- 修改范围：Douyin 数据服务、Creator 分析与报告 API、复盘报告页面、导航与路由、Auth Prometheus 状态、登录安全升级页、专项测试、CI 和版本文档。
- 数据库变化：无 schema 迁移，不删除或回填生产历史；既有旧报告和画像表数据继续保留。
- 测试结果：统一报告、抖音指标可用性、canonical 作品、Auth 指标出口/观测/准入、110 个测试入口、TypeScript、定向 ESLint、版本门禁、生产构建和桌面/390px 移动端浏览器回归通过；浏览器覆盖报告展示、删除确认、画像入口下线和认证阻塞说明。
- 风险说明：粉丝总量是否可用仍取决于 Creator Agent 实际采集；只有一个日快照时不会生成伪增长。生产当前缺少外部 Prometheus/Alertmanager 抓取和告警证据，也没有已审批的 2–3 人 Socket 灰度名单，因此本次不扩大认证灰度。
- 下一阶段：先接入外部指标抓取与告警接收并完成 2–3 个普通测试账号的双人审批，再运行认证灰度预检查；部署后用真实账号重新生成一份报告，核对累计播放、粉丝可用性和删除流程。

## v2.21.4 管理与运营入口收敛（2026-09-16）

- 当前版本：v2.21.4。
- 完成内容：内容时间轴改为内容动态并接入创作历史；认证页形成下一阶段准入判断；备份页覆盖三类服务器来源；抖音运营导航去除重复入口。
- 修改文件：内容动态、登录安全升级、备份页面与 API、备份清单服务、导航配置、共享类型、测试和版本文档。
- 数据库变化：无，不修改认证会话、业务数据或备份文件。
- 测试结果：备份清单、内容标题解析、认证治理与灰度准入、TypeScript、ESLint、版本门禁和生产构建通过；桌面及移动端浏览器页面回归通过。
- 风险说明：服务器进程仍需具备对应备份目录的读取权限；认证下一阶段仅提供准入结论，不自动修改生产灰度配置。
- 下一阶段：在生产发布后核对三类备份来源实际数量；仅在外部指标、告警、Socket Bridge 和双人复核全部就绪后执行小范围认证灰度。

## v2.21.3 日常体验优化（2026-09-15）

- 当前版本：v2.21.3。
- 完成内容：增强内容里程碑礼炮；统一主按钮跨浏览器表面；新日报通知使用中文并兼容历史英文记录；移除页面解释型副文案。
- 修改范围：共享按钮与页面标题组件、里程碑礼炮、日报消息生成与读取兼容、成片制作页面、专项测试和版本文档。
- 数据库变化：无 schema 迁移，不改写或删除历史消息；历史英文日报通知仅在读取时转换显示。
- 测试结果：消息中文兼容、106 个测试入口、TypeScript、版本一致性、生产构建、Chromium 主题矩阵与亮色对比度、WebKit 240 个按钮及减少动态效果下礼炮验证通过。
- 风险说明：礼炮按产品要求不遵循减少动态效果设置；页面业务流程、权限、审核、保存、版本与协同合同未改变。
- 下一阶段：完成 PR 与主线 CI 后，按精确合并 SHA 执行生产安全部署及只读健康验证。

## v2.21.2 放了些小惊喜（2026-09-15）

- 当前版本：v2.21.2。
- 完成内容：放了些小惊喜。
- 数据库变化：无。
- 测试结果：TypeScript、版本一致性、测试入口与生产构建通过。

## v2.21.1 发布与分析数据一致性修复（2026-09-15）

- 当前版本：v2.21.1。
- 完成内容：发布列表按最新旧分析快照一对一读取；发布指标按日期写入并保留未提交字段；抖音关联权威字段增加 API 锁定；分析录入补齐数据范围和输入校验；页面统计改为全量北京时间口径。
- 修改范围：Workflow 发布 API、Analytics 写入 API、发布页取数与统计、专项回归、版本与发布文档。
- 数据库变化：无 schema 迁移，不删除、合并或批量回填历史记录；只改变后续读写的确定性与原子性。
- 安全边界：`analytics:create` 仍是基础权限门禁，写入还必须通过选题数据范围；抖音关联记录禁止绕过页面修改权威字段。
- 测试结果：发布/抖音关联、分析写入范围、核心 API/权限/安全/时间/迁移/恢复演练合同、105 个测试入口、TypeScript、版本一致性、生产构建、依赖审计与 diff 检查通过；隔离临时数据库浏览器验收覆盖 51 条记录、跨页全量统计、搜索、编辑弹窗、桌面/390px 移动布局且控制台无错误。CI 与生产验证在发布闭环继续记录。
- 风险说明：既有同日重复分析行不会被自动删除；读取确定性选择最新日期、同日期最高 ID 的记录，避免破坏历史。
- 下一阶段：发布后使用生产只读检查核对版本、数据库完整性、PM2/Caddy、公开健康接口和发布列表基本可用性。

## v2.21.0 发布管理与抖音数据关联（2026-09-12）

- 当前版本：v2.21.0。
- 完成内容：发布记录与抖音作品持久化一对一关联；同步后自动匹配高置信标题；发布页支持候选搜索、人工绑定和解绑；关联数据以抖音运营中心为准。
- 修改范围：migration 013、关联与匹配服务、Creator 同步后置协调、Workflow API、发布管理页面、共享类型、专项测试和版本文档。
- 数据库变化：仅新增 `publishing_douyin_links` 和索引；不修改、删除或合并现有 `publishing`、`douyin_works`、正文或指标记录。
- 安全边界：自动匹配要求唯一高分结果和安全分差；候选与修改接口执行 Creator 数据权限、发布权限和选题范围检查；内部异常保持脱敏。
- 测试结果：专项 API/数据库与权限回归、104 个测试入口检查、TypeScript、版本一致性、migration readiness、生产构建和临时数据库桌面浏览器验收均通过。
- 风险说明：历史名称差异较大的记录需要人工确认；未关联记录保持原有发布数据，不伪造抖音指标。
- 下一阶段：由明确部署授权执行生产备份、migration 013、关联刷新和抽样核对；本轮未部署生产。

## v2.20.25 创作只读与首页数据联动（2026-09-12）

- 当前版本：v2.20.25。
- 完成内容：已审核创作资料严格只读；首页聚合选题、创作、发布和抖音驾驶舱真实数据；内容生产指数按最深链路阶段计算。
- 修改范围：创作资料自动保存边界、首页取数与聚合函数、驾驶舱文案、专项测试和版本文档。
- 数据库变化：无 schema 迁移，不写入或修补现有业务数据。
- 测试结果：创作资料 API/UI 合同、首页聚合计算、TypeScript、版本治理和生产构建通过。
- 风险说明：抖音播放量受 Creator 数据查看权限和账号同步状态约束；无权限或无数据时回退旧分析口径，不伪造播放数据。
- 下一阶段：部署后使用真实账号验证已审核稿件无 PUT 请求，并核对首页播放量与抖音运营中心一致。

## v2.20.24 北京时间与活动日志保留（2026-09-11）

- 当前版本：v2.20.24。
- 完成内容：活动日志历史 UTC 时间校正、后续北京时间显式写入、日志 API `+08:00` 序列化、7 天保留，以及跨页面日期展示与查询边界收口。
- 修改范围：共享时间前端调用、活动日志服务与两个查询接口、六个日志写入点、数据库运行时时钟兼容层、migration 012、专项测试和版本文档。
- 数据库变化：校正 `activity_log.created_at` 并删除 7 天前活动日志；新增插入触发器持续执行保留规则，并新增 `user_login_days` 日汇总维持连续登录成就，不修改其他业务数据。
- 测试结果：活动日志专项测试、时间合同、认证、Auth Web Cookie、选题、代码审查整改、TypeScript、版本治理和生产构建通过；临时数据库的桌面/移动活动日志页及用户筛选通过，日志 API 返回 `+08:00`。
- 风险说明：7 天前活动日志按需求不可恢复地删除，部署前仍需执行生产数据库备份与 migration readiness；不对来源不明确的其他历史时间字段做全库平移。
- 下一阶段：完成 CI 与精确 SHA 发布后，在生产系统管理页核对最新日志的北京时间与记录数量。

## v2.20.23 统一创作资料草稿（2026-09-11）

- 当前版本：v2.20.23。
- 完成内容：卡片式资料区收敛为单一 Tiptap 草稿；资料库正文可按光标直接插入，草稿支持直接输入、复制粘贴、自动保存和只读展示。
- 修改范围：创作资料前端、Tiptap 窄命令接口、资料草稿 API、migration 011、专项测试和版本文档。
- 数据库变化：新增 `production_material_drafts`，历史卡片正文按排序幂等合并；`production_materials` 及来源资料继续保留。
- 风险说明：不改变正式稿件协同文档、版本或审核流程；上线前必须备份并执行 migration readiness。
- 下一阶段：完成 PR/CI 后再由明确授权决定是否部署。

## v2.20.22 创作资料工作区（2026-09-10）

- 范围：内容生产 → 创作管理 → 详情页的资料正文整理、资料库快照、手动资料与区域高度偏好。
- 修改：资料正文直接显示；资料库支持多选添加并立即呈现；手动资料复用统一 Tiptap 入口；编辑采用 800ms 串行自动保存与 revision 乐观锁；逐条删除失败时恢复前端状态。
- 数据库：新增 `production_materials` 扩展表和索引；历史 production reference 关联幂等回填，空正文保持为空；知识库原文不被编辑或删除。
- 权限：查看沿用 `production:view` 与创作数据范围；添加、编辑、删除要求 `production:update` 与真实可编辑范围；资料库添加额外要求 `resource:view` 和资源 scope；已审核稿件后端返回只读锁定。
- 测试：定向 TypeScript、ESLint、资料 API/权限/清洗/migration/SQLite 和高度逻辑已通过；完整构建、版本门禁与浏览器验证在发布闭环执行。
- 风险：资料自动保存不加入正式稿件 Yjs，采用独立持久化和冲突提示；Safari 真实设备仍需单独验收。
- 下一阶段：部署前按精确 SHA 执行 migration readiness 与生产备份门禁；本轮不部署生产。

## v2.20.21 共享用户模型精简与清理核验（2026-09-10）

- 范围：共享 `User` DTO、认证中间件用户投影、Legacy/v1 登录响应适配、Auth Web Runtime 死函数及代码精简清单核验。
- 修改：移除共享用户对象的 `password` 字段和三处空值/历史响应映射；删除无生产调用的 `resolveAuthMode()` 及对应过时测试，保留 `AuthMode` 类型。
- 数据库：无 schema 迁移，不读取、导出或修改用户密码哈希及业务数据。
- 测试：Login Response Adapter、Auth Web Runtime、Legacy Auth 冻结测试和类型检查通过；发布闭环继续执行测试入口、版本检查、依赖审计、生产构建及 diff 检查。
- 风险：Social Review 仍有前端页面、API 客户端、Socket 会话和脚本依赖；JWT 转发入口有 20 个调用方；兼容表与迁移脚本有文档或数据链路依赖，因此均未删除。认证灰度和 Topics 双轨仍处保留期。
- 下一阶段：产品确认 Social Review 是正式退役还是恢复挂载后，再设计完整垂直切片清理或恢复方案；Auth v1 全量完成后单独收口灰度和 legacy JWT。

## v2.20.20 代码审查安全整改（2026-09-09）

- 范围：Social Review 休眠路由、统一错误响应、用户/日志分页、权限缓存与工作流通知文案。
- 修改：Social Review 增加 `analytics:view` 基础门禁并保留管理员二次门禁；Social Review 和总结归档未知异常返回固定 `INTERNAL_ERROR`；用户/日志分页限制为最多 200 条；权限缓存 TTL 改为 60 秒；修复 4 处选题标题插值。
- 数据库：无 schema 迁移，不修改业务数据、角色、权限分配或 Auth token 合同。
- 验证：新增授权、脱敏、分页与通知文案合同；既有错误响应、总结归档、日报权限、类型检查均通过；版本检查、依赖审计和生产构建在发布闭环执行。
- 风险：Social Review 旧路由当前未挂载，修复属于重新启用前的纵深防御；legacy JWT verifier 下线依赖 Auth v1 灰度完成，本次不改变认证协议；`req.user!` 经核验仍由认证中间件保护，未做无收益的全局类型重构。
- 下一阶段：若重新启用 Social Review 路由，需在正式挂载点补真实角色 HTTP 验收；Auth v1 完成迁移后按专项方案退役 legacy JWT。

## v2.20.19 Creator 托管封面与作品身份收口（2026-09-09）

- 范围：Creator Agent 浏览器采集、加密作品同步、服务端封面资产、作品库/驾驶舱/详情展示及 canonical 身份。
- 修改：认证浏览器响应中的图片经类型、魔数、哈希、单图 128 KiB 和总量 4 MiB 门禁后随作品包上传；生产端通过 Creator 查看权限读取；官方导出不再短路常规作品包。
- 数据库：新增 `creator_cover_assets`，按账号和平台作品 ID 幂等写入；不删除已有重复行，展示层按规范标题和精确发布时间合并，保留不同发布时间的合法同名作品。
- 验证：canonical、资产校验、存储权限、Collector Python、Root/Agent 类型检查和构建；正式账号同步与已认证生产页面验收需在部署新版 Agent/服务端后执行。
- 风险：历史作品必须由 v2.13.10-agent 再同步后才会获得托管封面；未加载到浏览器响应或超过体积上限的图片继续显示外链回退/占位。
- 下一阶段：发布新版 Agent 与服务端后执行真实同步，核对生产端托管封面覆盖率和 9 组重复作品的展示收口。

## v2.20.18 亮色主题对比度修复（2026-09-08）

- 范围：选题管理列表与详情、共享状态/平台/资源徽标、错误与确认提示，以及相邻创作、成片、发布、日报、日历、用户和资料中心界面。
- 改动：SpotlightCard 接入主题表面色；新增六类深浅主题语义前景色令牌；移除关联资料的固定深色样式。
- 数据库：无 schema 迁移，无业务数据写入。
- 验证：认证态亮色模式对比度浏览器回归、类型检查、生产构建、版本一致性和发布安全门禁。

## v2.20.17 登录与生产主题显示修复（2026-09-08）

- 范围：登录响应适配、目标生产账号的即时数据修复，以及生产构建主题变量缺失修复。
- 修改文件：`src/auth/web/login-response-adapter.ts`、`src/index.css`、对应认证回归测试及版本文档。
- 数据库：无 schema 迁移；目标账号在在线备份与 `quick_check` 通过后，仅将空姓名回填为用户名。
- 测试：Legacy 与 v1 Web 空显示名回退、认证定向测试、类型检查、版本一致性检查与生产构建；核对构建产物包含主题变量定义。
- 风险：未使用或记录账号密码做自动化端到端登录；需由账号持有人在页面重试确认完整业务会话。
- 下一阶段：完成精确 SHA 生产部署后，由账号持有人验证登录，并核对首页主题显示。

## v2.20.16 历史修复整合与依赖精简（2026-09-07）

- 范围：PR #41 CI 修复、依赖安全、重复工具精简、远端分支及本地工作区归档。
- 修改文件与验证详情：`MAINTENANCE_2026-09-07.md`。
- 数据库：无结构或权限变更，HTTP 回归使用临时数据库。
- 风险：真实源码仍有 lint 债务；未把所有静态问题或长期功能规划视为已修复 bug。
- 下一阶段：按模块处理剩余源码 lint 与需真实账号的业务验收；本轮未进行生产代码部署。

## v2.20.15 依赖安全与工程化收口（2026-09-07）

- 修复 `@tiptap/*` `mergeAttributes()` 在 `__proto__` 上的 DOM 属性污染中危漏洞：所有 `@tiptap/*` 包从 `^3.25.0` 提升到 `^3.31.0`（安装后为 3.31.3）。
- 修复 `qs` 在 express / body-parser 链路的数组上限绕过与 `isBuffer` DoS 中危漏洞：`package.json#overrides` 把 `qs` 锁定到 6.16.0。
- 新增 HTTP 级错误脱敏拦截器回归测试 `tests/security/error-response-http-contract.test.ts`，直接起真实 app、注入探针路由触发 5xx 并断言响应不含 SQL / 参数；任何后续改动若误删 `api/app.ts:267` 拦截器本体，本测试会立即失败。
- 新增 `api/utils/limits.ts` 统一请求体与同步包体积上限：`HTTP_JSON_BODY_LIMIT`、`HTTP_JSON_BODY_LIMIT_BYTES`、`HTTP_JSON_BODY_LIMIT_MB`、`CREATOR_SYNC_MAX_PAYLOAD_BYTES`、`CREATOR_SYNC_MAX_PAYLOAD_MB`。`api/app.ts:414` 全局 413 文案与 `creatorSyncV291.ts:87` 同步包 413 文案均改为引用，消除魔法数字与"12MB / 16MB"不一致。
- 抖音官方导出 xlsx 解析改用 `sheet['!ref']` 在展开前判断行 / 列数，命中限制直接抛错，避免把整张表展开为内存数组才校验。
- 删除 `api/services/creatorDataCenter.ts` 中未被引用的 `acceptCreatorDataSync` 死代码副本（以及随之失效的 `array` / `number` / `json` / `runInTransaction`），与 `creatorSyncV291.ts` 长期同名并存的隐患收敛。
- 成就进度接口 `api/routes/achievements.ts` 按 `condition_type`（`login_streak` 额外按时间窗）聚合缓存查询，消除成就数量增加后的 N+1。
- 新增 `deploy/linux/HTTPS_REQUIRED.md` 明确 `upgrade-insecure-requests` CSP 指令下 XMT 必须部署在 HTTPS 站点之后；`docs/上线前检查清单.md` 同步补充对应章节。
- 数据库变化：无迁移、无破坏性 schema 变更；不改变 RBAC、Session、Creator Agent 上传协议、Scrapling Collector 合同。
- 验证：`npm run check` 零错误；`npm audit --omit=dev` = 0 vulnerabilities；`npm run version:check` 通过；HTTP 级错误脱敏测试、`tests/topics`、`tests/api-contract` 全部通过。
- 生产状态：未部署；`package-lock.json` 同步更新后需 `npm ci` 刷新本地 `node_modules`。

## v2.20.14 总结归档详情完善（2026-09-04）

- 完成内容：月报、年报归档增加完整详情弹窗；列表展示摘要、更新时间与明确查看入口，详情按业务字段分区并支持长文本滚动。
- 权限：归档详情接口沿用管理员/主管范围，区分参数错误、无权和不存在记录；日报归档不变。
- 数据库变化：无 schema 或 migration，不改写历史数据。
- 测试：归档详情完整字段、403、404、历史兼容、组件渲染、日报权限、类型检查与构建通过。

## v2.20.13 总结归档正文显示修复（2026-09-04）

- 完成内容：统一月报、年报归档正文输出模型为 `display_content_md`；提交接口接收当前 snake_case 字段并继续兼容旧 camelCase / `content_md` 数据。
- 修改文件：`api/routes/report-summaries.ts`、日报总结 API/组件、归档合同测试与版本文档。
- 数据库变化：无 schema 或 migration；生产只读诊断显示 2026 年 8、9 月各 1 条月报的规范字段及旧字段均为空，不能凭代码恢复。
- 测试：月报/年报写入与归档兼容合同、日报权限合同、类型检查通过；发布前继续执行完整质量门禁。
- 风险：需要以已认证生产页面验证真实历史数据和新提交数据；不得伪造缺失正文。

## v2.20.9 Creator Agent Renderer 账号标识脱敏（2026-09-01）

- 完整绑定配置不再跨 Main/Renderer 边界；Renderer 仅接收短审计标识、绑定状态和范围状态。
- 数据库变化：无；普通同步与 metadata-only 仍由 Main 内部解析绑定账号。

## v2.20.8 Creator 封面 metadata-only（2026-09-01）

- 新增独立 Electron IPC、Bridge 与 Worker 白名单任务，只读检查内容管理页的封面候选并返回脱敏汇总。
- 数据库变化：无；任务不触发普通同步、上传、队列、batch、快照或官方 Excel 下载。

## v2.20.5 审计安全修复（2026-08-28）

- 收口 API 500 响应中的可枚举错误对象，新增统一响应脱敏层；现有路由契约保留业务提示并补 `INTERNAL_ERROR` 代码。
- 拍摄和发布列表增加有界 `LIMIT/OFFSET`、总数和页面翻页；资源列表计数不再依赖 SQL 正则截断。
- 生产依赖审计归零：升级 React Router、SheetJS 官方分发包及 Socket/网络解析传递依赖；加入 Helmet 和 Socket 单包限制。
- 数据库变化：无迁移、无数据操作。生产状态：未部署。
- 验证：错误响应/分页合同、Internal loopback、Socket 生命周期、角色权限安全、版本检查、类型检查、生产依赖审计与生产构建均通过；全量 lint 未纳入门禁，仍有既有历史规则错误。

## v2.19.11 Creator Agent 上传协议安全收口（2026-08-20）

- `/data-sync` 原有 V1 timestamp、nonce、HMAC 与 AES-GCM 防重放合同保持有效；本次关闭可选 legacy protocol fallback。
- 旧 `/report` 无现行客户端调用，已退役为 410；复用既有 `creator_agent_nonces`，无 schema migration、无业务数据删除。
- 验证：新增重放安全合同覆盖 nonce 原子性、时间窗、验签顺序、篡改与 `/report` 退役；等待 PR CI 与审查，未部署生产。

## v2.19.10 P1 安全补充（2026-08-20）

- 从 v2.19.9 main 基线移植 PR #22 遗留的认证 Origin 与角色权限边界 P1 修复。
- Legacy 401 Recovery 改为精确 URL Origin 校验；角色批量授予和角色 `permission_ids` 在事务前执行有效权限上限检查。
- 数据库变化：无 schema 或 migration 变化；生产未部署。
- 验证：认证、RBAC、Web/Native Auth、Android runtime 与 endpoint 合同按发布门禁执行。
- 风险：等待新 PR 的 CI 与代码审查；在 v2.19.10 合并前不得部署 v2.19.9。

## v2.18.4 版本 Gate 补齐（2026-08-13）

- 正式部署在 Restore Drill、迁移 Gate 和 PM2 restart 前执行 `npm run version:check`。
- 数据库变化：无 schema 或 migration 变化；生产尚未部署。

## v2.18.3 部署 Gate 修复（2026-08-13）

- 正式部署入口要求 `TARGET_SHA_EXPECTED`，避免将未知的后续 main 提交部署到生产。
- 在目标依赖安装后、迁移 gate 与 PM2 restart 前，对刚完成的在线 SQLite 备份执行非破坏 Restore Drill。
- 数据库变化：无 schema 或 migration 变化；生产尚未部署。

## v2.18.2 运维可靠性与仓库治理硬化（2026-08-12）

- 当前版本：v2.18.2。
- 增加备份跨进程互斥、默认非破坏恢复演练与迁移兼容 Gate。
- 扩展版本一致性检查，覆盖运行时、页面与发布文档。
- 数据库变化：无 schema 变化；未部署生产、未重启、未修改生产数据库或 Auth 灰度。
- 风险：Web/协作运行态仍以单实例为前提；GitHub main 强制门禁需以远端规则回读为准。
- GitHub：`main` 已回读为 PR-only 且严格要求 `fast-gate`、`core-security-contract`，管理员不可绕过，禁止 force push/删除；不强制批准人数以支持单维护者。

## v2.18.1 安全、权限与发布可靠性硬化（2026-08-12）

- 当前版本：v2.18.1。
- 协作文档房间改为服务器解析 production/shooting 资源范围；未授权、未知格式、未加入房间的同步事件被拒绝；非特权参与者可查看但不能写入实时文档。
- 角色分配和权限映射改为验证后事务提交，主角色与 `user_roles` 保持同步。
- 安全部署强制 SQLite 在线备份及校验，健康失败自动恢复上一应用提交；备份文件名不再接受任意路径。
- GitHub Actions 增加真实 Socket.IO 协作授权黑盒与核心安全契约门禁。
- Auth 准入只读脚本逐项输出 PASS / FAIL / UNKNOWN，并以 GO / NO-GO / INSUFFICIENT_DATA 三态结论；Creator Agent 旧协议保留默认兼容，并可用环境开关受控拒绝。
- 数据库变化：无 schema 变化。
- 验证：协作访问策略、真实 Socket.IO 授权黑盒、Auth readiness、Auth、Socket、Yjs、API Contract、Topic、版本、类型、构建、shell 语法和 Git whitespace 通过。
- 生产状态：未部署生产；Auth v1 与 Socket Bridge 继续保持 legacy，准入为 INSUFFICIENT_DATA。

## Phase 2-C3-8-C3.12-R1：Socket 生命周期观测

- 当前本地版本：v2.15.5；生产只读基线为 v2.15.3。
- 新增无敏感 Socket 生命周期事件、Session ID unknown A-E 分类和 loopback-only 运行摘要。
- 生产保持 legacy，Auth v1、Auth Web、Login Rollout、Socket Bridge 与 allowlist 均关闭。
- 本地 Socket、Coordinator、Yjs、类型、构建和版本检查通过。
- 生产旧日志仍有 52 条 `Session ID unknown`；观测代码尚未发布，当前不能做可信分类，因此继续阻塞 Auth 灰度。

## v2.15.1 日报填写与归档交互优化（2026-08-04）

- 我的日报固定当天填写，移除日期选择和保存草稿按钮，改为直接提交。
- 修复已提交日报本人无法输入的问题，允许本人修改后再次提交。
- 月报、年报并入我的日报，通过记录类型切换。
- 总结归档新增日报、月报、年报筛选及成员、日期/年份筛选。

### 验证结果

- `npm run version:check`、`npm run check`、`npm run build` 通过。
- 日报相关文件定向 lint 通过；全量 lint 的既有问题未纳入本次修改。

## Phase 2-C3-8-C3.11：Gray Browser Observability Fixture

- 当前版本：v2.15.1

### 完成内容

1. 新增灰度浏览器观测夹具，关联 requestId、loginAttemptId、响应类别、适配器模式、Runtime 快照与路由路径。
2. 登录请求携带安全 requestId，v1 响应适配器兼容标准 API Contract 的 `meta.requestId`。
3. 新增浏览器夹具显式观测开关；默认生产页面不记录前端认证 trace。
4. 实现停止规则：HTTP 登录成功但未进入 `/` 时立即结束，不继续 Refresh、Socket、Yjs 或 Version Sync。
### 数据库变化

无。

### 测试结果

- `test:auth-browser`、`test:auth-login-navigation`、`test:auth-gray-browser-observer`、`test:browser-auth-recovery`、`test:auth`、`test:login-gateway`、类型检查、构建与版本一致性检查通过。

### 风险与下一阶段

1. 该夹具只在 Playwright 显式启用时采集安全字段，不记录 token、cookie、密码或 Session secret。
2. 未开启生产灰度、未创建账号、未修改 Auth 配置、数据库、Socket 或 Yjs。
3. 下一阶段 C3.12 可在审批后使用固定测试账号执行真实灰度；若停止规则触发，立即回滚并以观测结果定位。

## v2.15.0 日报系统轻量化重构（2026-08-04）

- 日报系统重构为我的日报、团队日报、总结归档三个入口。
- 移除统计、趋势、排名、自动分析、风险等级、关键数据和日历展示。
- 新增月报、年报结构化表单；管理员可查看全部日报/月报/年报，成员可查看团队公开日报。
- 保留既有日报、日报条目、月报、年报和审计数据，新增迁移 `007_daily_lightweight_refactor`。

### 验证结果

- `npm run version:check`、`npm run check`、`npm run build` 通过。
- 日报保存、提交、修改、团队查看、管理员归档和权限隔离完成回归验证。

## v2.14.7 日报工作台 V2 发布（2026-08-04）

- 已将日报工作台 V2 的迁移、API、页面路由、Tiptap 编辑器、模板权限和 30 秒自动保存发布到生产。
- 生产数据库已执行 `006_daily_workspace_v2`，保留既有日报提交、审核和审计链路。
- 生产验证：`npm run check`、`npm run build`、数据库迁移、API 健康检查通过。

## v2.14.5 日报工作台 V2（2026-08-03）

- 已完成日报工作台数据迁移、统计/总结 API、自动保存、路由和基础页面接入。
- 保留 `daily_reports`、`daily_report_items`、`daily_report_templates`、`daily_report_audit_logs` 及既有提交审核链路。
### 下一阶段

发布稳定性补丁后，在 legacy 下完成至少 24 小时 Socket/PM2 观察，再申请 C3.12-A。

## Phase 2-C3-8-C3.5：Browser Auth Full Regression

- 当前版本：v2.14.4

### 完成内容

1. Auth 浏览器测试移除系统 Chrome 回退，强制使用项目 Playwright Chromium。
2. 浏览器回归覆盖 legacy / v1 Web、Refresh Cookie、页面恢复、Socket、Yjs 与版本同步链路。

### 数据库变化

无。

### 测试结果

- `test:auth-browser`、`test:browser-auth-recovery`、`test:auth-socket-yjs-e2e`、`test:auth`、`test:login-gateway`、`test:auth-rollout`、类型检查、构建和版本一致性检查均通过。

### 风险与下一阶段

1. 本阶段不启用生产灰度、不连接生产环境。
2. Chromium 回归已通过；重新申请 C3.3 前仍需新建审批记录、确认运行态与 readiness，不自动开启生产灰度。

## Phase 2-C3-8-C3.4：Web Login Gateway v1 Response Adapter

- 当前版本：v2.14.3

### 完成内容

1. 新增 Web 登录响应适配层，兼容 legacy `{ user, token }` 与 v1 Web API Contract envelope。
2. v1 Access Token 进入 Auth Runtime 与内存登录态，不写入 localStorage 或 sessionStorage；Refresh 继续依赖 HttpOnly Cookie 与 CSRF。
3. legacy 登录、JWT payload、7 天有效期、存储和错误行为保持不变。

### 数据库变化

无。

### 测试结果

- 版本一致性、登录响应适配器、legacy Auth、Login Gateway、Rollout、Web Runtime、Cookie/CSRF、Session、API Contract、Socket Bridge、Socket Coordinator、Yjs Recovery、类型检查和构建通过。
- `test:auth-browser` 因本机 Playwright 缺少匹配 Chromium 并在系统 Chrome 启动时收到 `SIGABRT` 未通过；未更改测试绕过该问题。

### 风险与下一阶段

1. 本阶段未开启生产灰度，未修改 Auth、Socket 或 Yjs 服务端契约。
2. 重新申请 C3.3 前，必须在部署后完成 legacy / allowlist 模拟浏览器回归、运行态一致性与审批检查。

## Phase 2-C3-8-C3.1：灰度配置来源统一与运行态门禁校验

- 当前版本：v2.14.2

### 完成内容

1. 新增 Auth 运行态配置快照，Login Gateway、Auth v1 Web、Socket Bridge 和管理诊断统一读取同一解析结果。
2. 新增仅本机访问的运行态诊断端点；灰度 readiness 通过实际 API 进程状态校验门禁和 allowlist 测试账号。
3. 明确 `.env` 仅为部署输入，变更后必须经 PM2 受控重启加载。

### 数据库变化

无。

### 测试结果

- 新增运行态配置回归测试；完整 Auth、Socket、Yjs、类型检查与构建将在提交前执行。

### 风险与下一阶段

1. 本阶段未开启生产灰度、未创建测试账号且未修改 allowlist。
2. 下一次 C3 必须先验证 PM2 配置更新流程能让运行态端点、预检与 readiness 三者一致，再申请新的观察窗口。

## Phase 2-C3-8-C2.5 灰度准备完善

- 当前版本：v2.14.1
- 完成内容：只读 readiness 检查、浏览器夹具、观察模板、准入清单与回滚准备。
- 数据库变化：无。

## Phase 2-C3-8-C 版本同步与大版本切换锁定

- 当前版本：v2.14.0
- 完成内容：大版本替代事件、旧版本只读锁定、版本历史状态标签与后端写入保护。
- 数据库变化：production_history 增加 version_state、superseded_by_version、superseded_at。
- 测试结果：版本同步事件契约、类型检查、构建通过。
- 风险说明：协作房间按 Production ID 复用，后端版本校验是写入最终防线。

## Phase 1：当前架构审计与长期升级规划

### 当前版本

`v2.10.2-storage`（仓库现有版本；该后缀格式不符合新版本规范，待首次有效代码升级时统一基线）

### 完成内容

1. 审计 Web 前端、Express API、共享代码、数据库、权限、实时协作和 Creator Agent。
2. 形成当前架构事实文档与分级问题列表。
3. 形成面向 Web、Android、iOS 的五阶段升级路线。
4. 明确 API v1、Zod/OpenAPI、Refresh Token、Repository、设计系统、Socket 拆分、测试、CI/CD 和监控方案。

### 修改文件

- `docs/ARCHITECTURE_CURRENT.md`
- `docs/ARCHITECTURE_UPGRADE_PLAN.md`
- `docs/UPGRADE_PROGRESS.md`
- `docs/文档索引.md`

### 数据库变化

无。本阶段只读分析，未创建 `refresh_tokens`，未修改表、字段、索引、数据或迁移脚本。

### 测试结果

- 未运行应用测试或构建：本阶段未修改业务代码、运行配置或依赖。
- 已执行 Markdown 差异与空白格式检查。

### 风险说明

1. 当前版本号带 `-storage` 后缀，后续代码升级前需确定纯 `X.Y.Z` 基线并同步根项目与 Agent。
2. 升级方案是目标设计，不代表对应能力已实现。
3. Phase 2 涉及 API 和后端边界，必须按单一垂直切片实施并保持旧接口兼容。

### 下一阶段计划

等待确认后进入 Phase 2 详细设计。建议以认证或选题模块为首个垂直切片，先明确文件级方案、兼容策略、测试、版本升级和回滚方式，不立即大规模移动目录。

## Phase 2：Topic 垂直切片设计

### 当前版本

`v2.10.2-storage`（本阶段仅设计，未触发产品版本升级）

### 完成内容

1. 核验 Topic 的七个现有接口、数据库关系、权限与数据范围。
2. 梳理 Topics、AddTopic、TopicDetail、Kanban 到 API、消息和 Socket 的调用链。
3. 设计 `api/modules/topics`、Repository、Service、Policy 与 Mapper 边界。
4. 设计共享 Zod Schema、`/api/v1/topics` 并行兼容方案。
5. 制定行为冻结、Repository、Service、API、前端和 E2E 测试方案。
6. 明确迁移风险、实施门禁和无数据库变更的回滚方案。

### 修改文件

- `docs/PHASE2_TOPIC_DESIGN.md`
- `docs/UPGRADE_PROGRESS.md`
- `docs/文档索引.md`

### 数据库变化

无。未修改表、字段、索引、数据或迁移脚本。

### 测试结果

- 未运行应用测试或构建：本阶段只新增和更新设计文档。
- 已执行 Markdown 差异与空白格式检查。

### 风险说明

1. 当前 Topic 权限和数据范围的真实代码与部分既有文档口径存在偏差；实施切片时必须先保持当前行为，权限调整另立任务。
2. 当前前端创建响应类型与后端真实 envelope 不一致，暂未修改。
3. Topic 删除存在非事务式兼容清理；本设计不扩大为数据库完整性治理。

### 下一阶段计划

等待实施指令。进入编码前先确认实施接口范围、v1 开关、测试数据库、依赖与版本基线；不得直接大规模移动目录。

## Phase 2-A：Topic 模块化基础落地

### 当前版本

`v2.11.0`。实施开始时根项目实际版本已是标准版本 `v2.10.3`，因此本次从该有效基线升级；早期文档中的 `v2.10.2-storage` 仅为设计阶段记录，未用于回退版本。

### 新增文件

- `api/modules/topics/index.ts`
- `api/modules/topics/topics.routes.ts`
- `api/modules/topics/topics.controller.ts`
- `api/modules/topics/topics.service.ts`
- `api/modules/topics/topics.repository.ts`
- `api/modules/topics/topics.sqlite-repository.ts`
- `api/modules/topics/topics.policy.ts`
- `api/modules/topics/topics.mapper.ts`
- `api/modules/topics/topics.types.ts`
- `shared/schema/topics.schema.ts`
- `tests/topics/topics.test.ts`
- `docs/releases/v2.11.0.md`

### 代码变化

1. Topic SQL 抽入 SQLite Repository，Service 不再直接依赖数据库工具。
2. 当前 `canViewTopic`、`canEditTopic` 与全量查看判断通过 Policy 复用，未改变角色或归属结果。
3. Service 统一编排创建、更新、删除、审核和状态流转，继续复用现有状态机、通知和 Socket 工具。
4. Controller 分离 legacy 与 v1 HTTP 适配；legacy 响应保持原 envelope。
5. `/api/topics` 继续可用；`/api/v1/topics` 由 `XMT_TOPICS_V1_ENABLED=true` 开启，默认关闭。
6. v1 使用严格 Zod Schema，legacy 继续宽松兼容。

### 数据库变化

无。未修改数据库结构、表、字段、索引、初始化逻辑或迁移脚本；测试只使用并清理系统临时目录中的 SQLite 数据库。

### 测试结果

- `npm run test:topics`：通过。
- `npm run check`：通过。
- `npx eslint api/modules/topics shared/schema/topics.schema.ts`：通过。
- `npm run build`：通过。
- `npm run lint`：未通过；全仓现有 259 个错误、38 个警告，Topic 新增文件中的问题已修复，未在本阶段扩大处理历史 lint 债务。

### 风险

1. legacy 行为虽然已由专项测试覆盖核心契约，后续仍需扩展七接口的完整角色与副作用矩阵。
2. v1 默认关闭；启用写接口前应增加更完整的集成观察与回滚验证。
3. 旧删除流程仍是逐项 best-effort 清理，本阶段按要求保持，不做事务化修复。
4. Repository 仍依赖 SQLite 语义，PostgreSQL 实现不在本阶段范围。

### 下一步计划

1. 扩充 Topic 行为冻结测试，覆盖审核、状态流转、通知和 Socket payload。
2. 在非生产环境只读启用 v1，观测分页、403 和错误 envelope。
3. 完成观察后再规划 Web 的单点 base path 切换；legacy 在观察窗口结束前不删除。
4. 权限模型、状态机和删除完整性如需调整，分别立项，不与模块迁移混合。

## Phase 2-B：API Contract 标准化建设

### 当前版本

`v2.12.0`

### 新增文件

- `docs/API_CONTRACT.md`
- `shared/schema/common.schema.ts`
- `shared/schema/error.schema.ts`
- `shared/schema/pagination.schema.ts`
- `api/middleware/request-id.ts`
- `api/openapi.ts`
- `packages/api-client/client.ts`
- `packages/api-client/error.ts`
- `packages/api-client/auth.ts`
- `packages/api-client/types.ts`
- `tests/api-contract/api-contract.test.ts`
- `docs/releases/v2.12.0.md`

### API 规范变化

1. 明确新接口使用 `/api/v1/*`，legacy `/api/*` 保持当前契约和业务行为。
2. v1 成功响应统一为 `{ success: true, data, meta }`，分页使用 `meta.page/limit/total`。
3. v1 错误响应统一为 `{ success: false, error: { code, message, requestId, details? } }`。
4. 增加公共错误码与 HTTP 状态映射；Topic 领域错误只在 HTTP 层映射，不改变 Service。
5. 全局生成或透传 `X-Request-ID`，v1 envelope 同时返回 requestId。
6. `/api/docs` 提供 Swagger UI，`/api/docs/openapi.json` 提供 OpenAPI 3.0.3 文档。

### Schema 变化

1. 新增 id、日期、requestId、分页和 meta 公共 Schema。
2. 新增公共成功/错误 Schema 与错误码 Schema。
3. Topic v1 与 OpenAPI 继续复用 `shared/schema/topics.schema.ts`，未为文档重复声明请求类型。
4. `packages/api-client` 直接复用共享 API 类型，本阶段未迁移 Web。

### 数据库变化

无。未修改数据库结构、表、字段、索引、数据、初始化代码或迁移脚本；所有 API Contract 集成测试使用系统临时目录中的 SQLite 数据库并在结束后清理。

### 测试结果

- `npm run test:topics`：通过。
- `npm run test:api-contract`：通过。
- `npm run check`：通过。
- API Contract 相关文件定向 lint：通过。
- `npm run build`：通过。
- `npm run lint`：未通过；全仓仍有既有 250 个错误、38 个警告，本阶段新增和修改的 Contract 文件已通过定向 lint。

### 风险

1. v1 Topic 仍由环境开关控制，默认关闭；OpenAPI 描述的是准备好的契约，不代表 Web 已切换。
2. legacy 认证和权限响应继续保持旧格式；只有 `/api/v1/*` 分支使用公共错误 envelope。
3. OpenAPI 首批只覆盖 Topic 列表、详情、创建和更新，其他模块不能被误认为已标准化。
4. api-client 目前是基础骨架，刷新 token 只有接口和并发互斥预留，尚未接入认证服务。

### 下一阶段计划

1. 按单模块垂直切片扩展 Auth 或 Production v1 Schema 与 OpenAPI，不批量迁移 legacy。
2. 为 OpenAPI 增加 CI 快照和破坏性差异检查。
3. 在非生产环境启用 Topic v1 观察后，再让 Web API 层通过单点配置试用 api-client。
4. requestId 后续接入结构化日志和错误监控，形成端到端查询链路。

## Phase 2-C1：Auth 模块化与 Refresh Token 基础设计

### 当前版本

`v2.12.0`。本阶段只有认证审计与设计文档，没有产品代码变化，因此不升级版本。

### 新增文档

- `docs/AUTH_CURRENT.md`
- `docs/PHASE2_AUTH_DESIGN.md`

### 文档变化

1. 完整审计 legacy `POST /api/auth/login`、7 天 JWT、用户状态回查、双轨角色/权限、前端 token 与记住密码存储、退出和 Socket 握手行为。
2. 明确当前没有 refresh token、设备会话、token 轮换、服务端撤销和长连接实时失效能力。
3. 设计 `api/modules/auth` 的 Route、Controller、Service、Repository、Policy、Token Service 与 Session Service 职责边界。
4. 设计 access/refresh token 模型、refresh hash 存储、轮换链、重放检测、并发刷新和会话撤销流程。
5. 设计 `/api/v1/auth/login|refresh|logout|logout-all|sessions` 的统一 envelope、错误码和 Web/Mobile 交付差异。
6. 设计 Web HttpOnly cookie、Expo SecureStore、统一 api-client，以及 access token 更新后的 Socket 重连、房间恢复和 Yjs 同步方案。
7. 制定 C2 至 C8 的兼容迁移、风险、回滚、实施门禁、测试和可观测性计划。
8. 同步 `docs/文档索引.md` 的认证文档入口与阅读路径。

### 代码变化

无。未创建 `api/modules/auth`，未修改后端、前端、Socket、权限、JWT 或 API 行为。

### 数据库变化

无。未创建 `refresh_tokens` 表，未修改表、字段、索引、数据、初始化逻辑或迁移脚本。设计中的字段和索引均为待评审规划。

### 验证结果

- 已按要求核对架构、升级计划、API Contract、升级进度和文档索引。
- 已审计后端 auth/users/middleware/utils/services、前端 Login/API/store、Socket 和 collaboration 认证链路。
- 已执行文档链接、Markdown 格式、差异范围和版本/代码未变检查。
- 未运行应用测试、类型检查、lint 或构建：本阶段明确只改文档，不改变可执行代码。

### 风险

1. 当前“记住密码”回退会把密码密文和解密密钥同时保存在 localStorage，不能抵御 XSS 或本地存储读取；本阶段只记录，不顺手修改。
2. 当前 7 天 Bearer JWT 不可主动撤销，退出和改密后仍可用到过期；已连接 Socket 也不会因账号或会话变化立即断开。
3. 候选 `refresh_tokens` 字段尚未明确稳定的 `session_id/family_id`；直接实施会妨碍完整轮换链和设备会话语义。
4. Web cookie 方案取决于正式域名、HTTPS、反向代理、CORS 与 CSRF 决策；Mobile refresh token 交付通道也尚需单独评审。
5. Socket 换 token 必须通过重新握手并恢复协作房间；未完成 Yjs 丢包/重复更新验证前不能缩短现有 JWT。

### 下一阶段建议

进入 Phase 2-C2：先建立 Auth Module 边界和 legacy 行为冻结测试，让旧 `/api/auth/*` 兼容委托新 Service；仍不创建 refresh token 表、不缩短 7 天 JWT、不切换前端。数据库会话模型、v1 暗启和 Web/Mobile 接入应分别作为后续可回滚阶段实施。

## Phase 2-C2：Auth Module 边界落地

### 当前版本

`v2.13.2`。任务说明基线为 `v2.12.0`，但实施时仓库已有 `v2.13.1` 有效版本，因此按真实基线升级 PATCH，未执行版本倒退。

### 新增目录与文件

- `api/modules/auth/index.ts`
- `api/modules/auth/auth.routes.ts`
- `api/modules/auth/auth.controller.ts`
- `api/modules/auth/auth.service.ts`
- `api/modules/auth/auth.repository.ts`
- `api/modules/auth/auth.sqlite-repository.ts`
- `api/modules/auth/auth.mapper.ts`
- `api/modules/auth/auth.types.ts`
- `api/modules/auth/auth.schema.ts`
- `api/modules/auth/token.service.ts`
- `api/modules/auth/password.service.ts`
- `tests/auth/auth.test.ts`
- `docs/releases/v2.13.2.md`

### 代码变化

1. legacy 登录的用户查询和登录日志写入迁入 SQLite Repository，Service 不直接依赖数据库工具。
2. Auth Service 编排参数存在性、用户存在、enabled、密码验证、JWT 签发和登录日志，内部不使用 Express 或 SQL。
3. Controller 只完成 legacy HTTP 输入输出和现有状态码/消息映射。
4. bcrypt compare 抽入 Password Service，算法和调用顺序保持不变。
5. 原 `signToken`/`verifyToken` 实现迁入 Token Service；`api/utils/jwt.ts` 保留兼容导出，因此 middleware 和 Socket 调用路径不变。
6. `api/routes/auth.ts` 保留，`POST /api/auth/login` 通过 module router 委托 Auth Controller；logout、me、change-password 保持原实现。
7. 新增 `npm run test:auth`，使用临时 SQLite 冻结 legacy 行为。

### 数据库变化

无。未创建 `refresh_tokens`，未修改 users 或其他表、字段、索引、初始化逻辑、数据和迁移脚本。

### 测试结果

- `npm run test:auth`：通过，覆盖登录成功、密码错误、用户不存在、禁用用户、JWT 验证、角色回查和 logout 不撤销 JWT。
- `npm run version:check`：通过，版本统一为 `v2.13.2`。
- `npm run check`：通过。
- `npm run build`：通过。
- Auth 新增/兼容文件及测试定向 lint：通过。
- `npm run test:topics`、`npm run test:api-contract`：通过，JWT 兼容导出未破坏既有模块测试。

### 风险

1. 当前只迁移 login；me、change-password 和 logout 仍在 legacy route，不能误认为 Auth 全量模块化完成。
2. logout 不撤销 JWT、7 天有效期和 Socket 仅握手认证等历史风险按要求保留。
3. legacy 输入没有切换严格 Zod 校验，`auth.schema.ts` 只记录当前宽松形状，避免改变错误行为。
4. Repository 继续绑定当前 SQLite SQL 语义；本阶段不提供其他数据库实现。
5. 工作区存在匿名反馈相关的并行未提交修改，本次提交必须排除这些文件。

### 下一阶段计划

先评审是否进入 Phase 2-C3。建议把 refresh/session 数据模型、数据库迁移和 v1 refresh 接口拆成独立可回滚任务；在此之前补充 Auth Service 单元测试和 me/change-password 的行为冻结矩阵，不缩短 JWT、不切换 Web 或 Socket。

## Phase 2-C2.5：Auth 完整收口

### 当前版本

`v2.13.3`。本阶段属于无数据库变化、无新 API 能力的模块收口，因此从 `v2.13.2` 升级 PATCH。

### 新增能力

1. Auth Controller 增加 `getMe`、`changePassword`、`logout` HTTP 适配。
2. Auth Service 增加 `getCurrentUser`、`changePassword`、`logout` 流程编排。
3. Auth Repository 增加按 ID 查询用户、更新密码、清除强制改密标记和写活动日志接口。
4. Password Service 增加 bcrypt hash，成本参数继续为 10。
5. Auth 行为冻结测试覆盖 current user、改密、退出和完整认证链路。

### 迁移接口

- `GET /api/auth/me`
- `POST /api/auth/change-password`
- `POST /api/auth/logout`

三个接口继续使用原路径、authenticate/password limiter 顺序、legacy 响应和中文错误消息，不新增 `/api/v1/auth/*`。

### 修改文件

- `api/modules/auth/auth.controller.ts`
- `api/modules/auth/auth.mapper.ts`
- `api/modules/auth/auth.repository.ts`
- `api/modules/auth/auth.routes.ts`
- `api/modules/auth/auth.service.ts`
- `api/modules/auth/auth.sqlite-repository.ts`
- `api/modules/auth/auth.types.ts`
- `api/modules/auth/password.service.ts`
- `api/routes/auth.ts`
- `tests/auth/auth.test.ts`
- `package.json`
- `package-lock.json`
- `CHANGELOG.md`
- `docs/CHANGELOG.md`
- `docs/SYSTEM_UPDATE.md`
- `docs/releases/v2.13.3.md`
- `docs/UPGRADE_PROGRESS.md`
- `docs/文档索引.md`

### 数据库变化

无。未创建 `refresh_tokens`、session 或其他表，未修改 `users` 表、字段、索引、初始化逻辑、迁移脚本和业务数据。

### 测试结果

- `npm run version:check`：通过，版本一致为 `v2.13.3`。
- `npm run test:auth`：通过。
- `npm run test:topics`：通过。
- `npm run test:api-contract`：通过。
- `npm run check`：通过。
- Auth 范围 lint：通过。
- `npm run build`：通过。

### 风险

1. logout 仍不撤销 JWT，修改密码后既有 JWT 仍有效；这是明确冻结的 legacy 行为。
2. JWT payload、7 天有效期、前端 token 存储和 Socket 握手认证均未升级。
3. 本阶段未增加密码复杂度、历史密码、强制退出或设备会话能力。
4. 工作区另有匿名反馈相关未提交改动，本阶段提交必须继续排除。

### 下一阶段计划

等待 Phase 2-C3 指令。不得在本阶段继续创建 Refresh Token、session、数据库迁移或修改前端/Socket 认证。

## Phase 2-C3-1：Auth Session / Refresh Token 架构设计

### 当前版本

`v2.13.3`。本阶段只完成架构设计，不修改代码和生产行为，因此版本号保持不变。

### 完成内容

1. 新增 `docs/PHASE2_AUTH_SESSION_DESIGN.md`，完成当前认证模型、目标架构、会话与 Refresh Token 生命周期设计。
2. 对比 `refresh_tokens`、`auth_sessions`、`device_sessions` 三种模型，选择 `auth_sessions` 作为稳定会话主模型，并使用 `auth_refresh_tokens` 保存单次轮换凭据。
3. 设计 token 单次轮换、SQLite 原子并发控制、Refresh Token 重放检测、泄露防护和会话撤销策略。
4. 设计多设备登录、当前会话退出、全部退出，以及用户改密、管理员重置和账号禁用后的会话策略。
5. 设计 Web HttpOnly Cookie、Mobile SecureStore、Socket 重新认证和 Yjs 重连恢复边界。
6. 规划 `/api/v1/auth/login|refresh|logout|logout-all|sessions`，遵守 v1 envelope、稳定错误码、requestId 和 Zod/OpenAPI 单一来源要求。
7. 定义分阶段迁移、用户灰度、观测指标、放量门禁、回滚和完整测试矩阵。

### 修改文件

- `docs/PHASE2_AUTH_SESSION_DESIGN.md`
- `docs/UPGRADE_PROGRESS.md`
- `docs/文档索引.md`

### 数据库变化

无。本阶段未创建 `auth_sessions`、`auth_refresh_tokens`、`refresh_tokens`、`device_sessions` 或其他表，未修改字段、索引、数据、初始化逻辑和 migration。文档中的表与索引仅为待评审设计。

### 测试结果

- 文档结构检查：通过，设计文档包含任务要求的十七个章节，Git whitespace 检查通过。
- `npm run version:check`：通过，版本一致并保持 `v2.13.3`。
- 未执行代码测试与构建：本阶段没有业务代码、配置、依赖或数据库变化；不会把未运行记录为通过。

### 风险

1. Access 15 分钟、Session 绝对 30 天/空闲 7 天是设计建议，实施前仍需产品、安全和运维评审。
2. SQLite 并发轮换、事务锁和清理性能必须用真实 migration 与并发测试证明，不能仅凭设计结论上线。
3. Web Cookie 依赖正式 HTTPS、同站部署、反向代理、CORS 和 CSRF 配置；部署事实未冻结前不能切换。
4. Mobile Refresh Token 响应体交付不能只信任客户端声明，必须在独立阶段完成受控交付门禁。
5. Session 即时撤销要求 v1 HTTP 检查 `sid`，Socket 多实例还要求共享撤销事件；缺少任一环节都不能宣称立即退出。
6. legacy 7 天 JWT、logout 不撤销和改密不撤销仍保持现状，灰度期会同时存在两种安全语义。

### 下一阶段计划

等待后续实施指令。建议下一阶段只处理数据模型与 migration 评审：先备份和验证 SQLite 原子性，再创建默认不被 legacy 使用的新表；不得把数据库、v1 接口、Web、Mobile 和 Socket 一次性切换。

## Phase 2-C3-2：Auth Session 数据库基础设施建设

### 当前版本

`v2.13.4`。本阶段新增认证会话数据库基础设施，从 `v2.13.3` 升级 PATCH；认证产品能力尚未开放。

### 完成内容

1. 新增正式 migration `005_auth_session_foundation`，在独立事务中幂等创建两张认证基础表和指定索引。
2. 新增 `auth_sessions`，承载用户、客户端展示元数据、会话活动、空闲/绝对到期和撤销信息。
3. 新增 `auth_refresh_tokens`，只保存未来 Refresh Token hash、pepper 版本、generation、替换关系和撤销信息，不保存明文。
4. 新增独立 Session Repository 接口、SQLite 实现和类型；未接入 Auth Service、Controller 或路由。
5. 新增 migration 专项测试，覆盖注册顺序、幂等执行、表、字段、索引唯一性、外键和既有 users 数据保护。
6. 同步认证设计、更新日志、业务升级说明、发布说明和文档索引。

### 修改文件

- `api/database/migrations/005_auth_session_foundation.ts`
- `api/database/migrations/index.ts`
- `api/modules/auth/session/session.repository.ts`
- `api/modules/auth/session/session.sqlite-repository.ts`
- `api/modules/auth/session/session.types.ts`
- `tests/auth/session-migration.test.ts`
- `package.json`
- `package-lock.json`
- `CHANGELOG.md`
- `docs/CHANGELOG.md`
- `docs/SYSTEM_UPDATE.md`
- `docs/PHASE2_AUTH_SESSION_DESIGN.md`
- `docs/UPGRADE_PROGRESS.md`
- `docs/文档索引.md`
- `docs/releases/v2.13.4.md`

### 数据库变化

1. 新增 `auth_sessions`，`user_id` 外键关联 `users(id)`；未修改 `users` 表。
2. 新增 `auth_refresh_tokens`，`session_id` 外键关联 `auth_sessions(id)`，`replaced_by_id` 自关联下一枚轮换记录。
3. 新增 `auth_sessions(user_id, revoked_at, absolute_expires_at)`、绝对到期和空闲到期索引。
4. 新增 Refresh Token hash 唯一索引、`(session_id, generation)` 唯一索引、session 创建时间和到期索引。
5. 未创建 token 生成或回填数据；新增表当前不被生产认证链路读写。

### 测试结果

- `npm run test:auth-session-migration`：通过。
- `npm run version:check`：通过，版本一致为 `v2.13.4`。
- `npm run test:auth`：通过，legacy 认证行为保持不变。
- `npm run test:topics`：通过。
- `npm run test:api-contract`：通过。
- `npm run check`：通过。
- Auth Session migration、Repository 与测试定向 lint：通过。
- `npm run build`：通过。

### 风险

1. 新表会在应用初始化时通过正式 migration 创建；上线前仍需按部署规范完成生产数据库备份。
2. Repository 目前提供原子消费的条件更新，但完整“消费旧 token + 创建新 token”事务编排不在本阶段，禁止直接接入生产刷新流程。
3. `client_type` 等设备信息只作未来展示与风险元数据，不是可信设备认证因子。
4. 新表当前没有清理任务；在真实签发前必须实现并验证保留期和清理策略。
5. legacy JWT 仍为 7 天且不可撤销，logout、前端和 Socket 安全语义没有变化。

### 下一阶段计划

等待下一步指令。建议 Phase 2-C3-3 只实现 Session/Token 内核事务与服务测试，继续不开放 `/api/v1/auth/*`、不切换 legacy、Web 或 Socket；必须先明确 pepper 密钥管理和并发刷新事务边界。

## Phase 2-C3-3：Auth Session 运行时服务建设

### 当前版本

`v2.13.5`。本阶段新增未接线的认证核心服务能力，从 `v2.13.4` 升级 PATCH。

### 完成内容

1. 新增 Session Service，支持创建稳定 session id、查询并区分有效/不存在/撤销/空闲过期/绝对过期状态。
2. 支持以 `logout`、`admin`、`security_event`、`logout_all`、`password_changed`、`user_disabled` 等原因撤销单会话或用户会话。
3. 新增 Refresh Token Service，使用 Node crypto 生成 32 字节随机值，并通过分版本 pepper 执行 HMAC-SHA256。
4. 新增独立 Refresh Token Repository 与 SQLite 实现；正常刷新在一个写事务中完成旧记录查询、session 校验、单次消费、替换记录插入和 session 活动更新。
5. 已使用 token 再次出现时返回内部安全事件，并在同一事务中撤销所属 session 与 token 链。
6. Token Service 增加 `createAccessTokenV1()`、`verifyAccessTokenV1()`，严格校验 HS256、issuer、audience 和 access 类型；legacy 方法保持原样。
7. 新增 Session Service 专项测试，覆盖会话生命周期、hash、单次消费、替换链、复用检测、撤销后不可用和新旧 JWT 隔离。

### 修改文件

- `api/modules/auth/index.ts`
- `api/modules/auth/token.service.ts`
- `api/modules/auth/session/session.repository.ts`
- `api/modules/auth/session/session.sqlite-repository.ts`
- `api/modules/auth/session/session.service.ts`
- `api/modules/auth/session/session.types.ts`
- `api/modules/auth/refresh/refresh-token.repository.ts`
- `api/modules/auth/refresh/refresh-token.sqlite-repository.ts`
- `api/modules/auth/refresh/refresh-token.service.ts`
- `tests/auth/session-service.test.ts`
- `package.json`
- `package-lock.json`
- `CHANGELOG.md`
- `docs/CHANGELOG.md`
- `docs/SYSTEM_UPDATE.md`
- `docs/PHASE2_AUTH_SESSION_DESIGN.md`
- `docs/UPGRADE_PROGRESS.md`
- `docs/文档索引.md`
- `docs/releases/v2.13.5.md`

### 数据库变化

无。未新增表、字段、索引或 migration；继续复用 `v2.13.4` 已创建的 `auth_sessions` 与 `auth_refresh_tokens`。测试只写入系统临时目录中的 SQLite 数据库。

### 测试结果

- `npm run test:auth-session-service`：通过。
- `npm run version:check`：通过，版本一致为 `v2.13.5`。
- `npm run test:auth-session-migration`：通过。
- `npm run test:auth`：通过，legacy JWT、登录、me、改密和 logout 行为保持不变。
- `npm run test:topics`：通过。
- `npm run test:api-contract`：通过。
- `npm run check`：通过。
- Auth 模块、相关 migration 与认证测试定向 lint：通过。
- `npm run build`：通过。

### 未接入范围

1. legacy `/api/auth/login|me|change-password|logout` 不调用 Session 或 Refresh Token Service。
2. `signToken()`、`verifyToken()`、旧 payload 和 7 天有效期不变。
3. 未挂载或开放 `/api/v1/auth/*`，没有 Controller、Cookie 或 HTTP 响应返回 Refresh Token。
4. 未修改 Web token 存储、api-client、Mobile SecureStore 或 Socket 认证。

### 风险

1. pepper 当前通过 Service 构造参数注入；正式接线前必须冻结环境密钥命名、加载、轮换和应急流程。
2. 复用检测采用严格策略，正常并发也可能触发 session 撤销；客户端单飞和跨标签协调必须在 Web 灰度前完成。
3. Refresh Token 内核内部会返回替换 token 原值供未来安全交付层使用；当前没有任何路由或日志接触该值。
4. session 与 token 清理任务、审计事件持久化和多实例撤销广播仍未实现。

### 下一阶段计划

等待 Phase 2-C3-4 指令。建议下一阶段只实现默认关闭的 v1 Auth HTTP 适配、Zod/OpenAPI 契约和暗启测试；在 pepper 密钥管理、Cookie/CSRF 和功能开关未冻结前不得对客户端开放。

## Phase 2-C3-4：Auth v1 HTTP 灰度适配

### 当前版本

`v2.13.6`。本阶段新增默认关闭的 Auth v1 实验接口，从 `v2.13.5` 升级 PATCH。

### 完成内容

1. 新增独立 Auth v1 Service、Controller、Router 和模块装配，不修改 legacy Auth Service 或路由。
2. 新增 `POST /api/v1/auth/login`：验证账号后创建 session、生成 Refresh Token 和 15 分钟 v1 Access Token，返回 v1 envelope。
3. 新增 `POST /api/v1/auth/refresh`：通过 C3-3 原子事务完成单次轮换，重复使用旧 token 时撤销 session 并返回稳定安全错误。
4. 新增 `POST /api/v1/auth/logout`：校验 v1 Access Token 和 session 后只撤销当前 session。
5. 新增 `GET /api/v1/auth/sessions`：只返回当前用户活跃 session 摘要，不返回 token hash、完整 UA 或 IP。
6. 新增 Auth Zod Schema 和稳定错误码，响应统一携带 requestId，登录与刷新设置 `Cache-Control: no-store`。
7. OpenAPI 增加四个 Auth v1 endpoint，并使用 `x-experimental: true` 标记。
8. `XMT_AUTH_V1_ENABLED` 默认关闭；即使误设为 true，`NODE_ENV=production` 仍强制不挂载。启用测试需要独立 pepper。
9. 新增临时 SQLite HTTP 测试，覆盖开关、登录、刷新、复用、退出、sessions 和 legacy 登录。

### 修改文件

- `.env.example`
- `api/app.ts`
- `api/openapi.ts`
- `api/modules/auth/refresh/refresh-token.service.ts`
- `api/modules/auth/session/session.service.ts`
- `api/modules/auth/v1/index.ts`
- `api/modules/auth/v1/auth.v1.service.ts`
- `api/modules/auth/v1/auth.v1.controller.ts`
- `api/modules/auth/v1/auth.v1.routes.ts`
- `shared/schema/auth.schema.ts`
- `shared/schema/error.schema.ts`
- `tests/auth/auth-v1.test.ts`
- `tests/api-contract/api-contract.test.ts`
- `package.json`
- `package-lock.json`
- `CHANGELOG.md`
- `docs/API_CONTRACT.md`
- `docs/CHANGELOG.md`
- `docs/SYSTEM_UPDATE.md`
- `docs/PHASE2_AUTH_SESSION_DESIGN.md`
- `docs/UPGRADE_PROGRESS.md`
- `docs/文档索引.md`
- `docs/releases/v2.13.6.md`

### 数据库变化

无。未新增表、字段、索引或 migration；继续复用 `auth_sessions` 与 `auth_refresh_tokens`。专项测试使用并清理系统临时目录中的 SQLite 数据库。

### Feature Flag

1. 默认 `XMT_AUTH_V1_ENABLED=false`，接口不挂载并进入标准 v1 404。
2. 仅非生产环境显式设为 `true` 时挂载。
3. `NODE_ENV=production` 强制关闭，确保本阶段不会向生产用户返回 Refresh Token。
4. `XMT_AUTH_REFRESH_PEPPER` 仅在实际启用时要求存在，不影响默认启动和 legacy。

### 测试结果

- `npm run test:auth-v1`：通过。
- `npm run test:api-contract`：通过，包含 Auth v1 OpenAPI experimental 标记。
- `npm run version:check`：通过，版本统一为 `v2.13.6`。
- `npm run test:auth`：通过，legacy 认证行为保持冻结。
- `npm run test:auth-session-migration`：通过。
- `npm run test:auth-session-service`：通过。
- `npm run check`：通过。
- Auth 范围 ESLint：通过。
- `npm run build`：通过。

### 未接入范围

1. legacy `/api/auth/*`、旧 JWT payload 和 7 天有效期不变。
2. Login 页面、store、api-client、Cookie、Mobile SecureStore 和 Socket 认证均未修改。
3. 没有生产灰度用户、用户 allowlist 或生产 Refresh Token 交付；生产环境强制不挂载。
4. 未实现 logout-all、指定设备撤销、CSRF/Cookie、跨标签刷新协调或 Socket 重认证。

### 风险

1. 实验接口在非生产启用时通过 JSON 传递 Refresh Token，只允许内部测试，不是最终 Web/Mobile 交付方案。
2. login 的 session 与首枚 Refresh Token 尚未封装为单一数据库事务；失败时会撤销已创建 session，但仍需在生产灰度前强化原子性。
3. 复用检测采用严格策略；客户端并发协调尚未实现。
4. session/token 清理、结构化安全审计、多实例撤销事件仍未实现。

### 下一阶段计划

等待 Phase 2-C3-5 指令。建议下一阶段先冻结生产 Cookie/CSRF、pepper 密钥管理、用户 allowlist 和登录原子事务，再进行 Web 内部账号灰度；不得直接全量切换现有 Login 或 Socket。

## Phase 2-C3-5-A：Web 认证迁移前置设计

### 当前版本

`v2.13.6`。本阶段只新增 Web 认证迁移设计，不改变已发布行为，因此版本保持不变。

### 完成内容

1. 基于 `Login.tsx`、`src/api/auth.ts`、Auth Store、全局 401 拦截器、Layout、ProtectedRoute、api-client 和 Socket hook 记录当前 Web 认证链路。
2. 冻结内存 Access Token + HttpOnly Refresh Cookie 的目标流程，以及冷启动恢复、单飞刷新、单次重试和新旧模式隔离。
3. 冻结 `__Host-xmt_refresh` 的 name、Domain、Path、Secure、HttpOnly、SameSite 和 Max-Age 语义。
4. 设计 Origin 校验与 session 绑定签名双提交 CSRF Token，明确来源、校验顺序和接口范围。
5. 设计 Refresh Pepper 的 Secret 来源、active version、双版本读取、自然轮换和泄露处置。
6. 设计总开关、Web 独立开关、用户 ID allowlist、管理员优先但显式准入、稳定分桶和回滚。
7. 冻结登录事务边界，要求 session、generation 0 Refresh 记录与审计同事务提交。
8. 设计后续 Socket handshake、Access 更新重连、房间恢复与 Yjs 同步，但本阶段不实施。
9. 将前端迁移拆为 Auth Runtime 准备、内部 HTTP 灰度、扩大灰度并向 Socket 阶段交接三个阶段。

### 修改文件

- `docs/PHASE2_AUTH_WEB_MIGRATION_DESIGN.md`
- `docs/UPGRADE_PROGRESS.md`
- `docs/文档索引.md`

### 数据库变化

无。未新增或修改表、字段、索引、migration 和数据；登录事务内容仅为设计。

### 测试结果

- 未运行代码测试或构建：本阶段仅修改 Markdown 设计文档，不改变代码、依赖、配置或运行行为。
- 已执行文档章节、版本、变更范围和 Git whitespace 检查。

### 风险说明

1. 当前 experimental v1 仍以 JSON 交付 Refresh Token，不能直接用于 Web；实施时必须切换为 Cookie 且确保 Web JSON 不含原值。
2. 请求分散且全局 401 拦截会与静默刷新竞争，必须按模块收敛而非一次性替换。
3. `__Host-` Cookie 要求 HTTPS、Path=/ 且无 Domain；线上 origin 与代理事实未确认前不能启用。
4. 严格单次轮换要求跨标签协调，否则正常并发可能触发 reuse 撤销。
5. Socket 尚未迁移，v1 Web 灰度不能被描述为完整认证迁移。

### 下一阶段计划

等待 Phase 2-C3-5-B 指令。建议下一阶段只实现后端 Web Cookie/CSRF、Pepper 版本加载、登录事务与 allowlist 基础设施，仍不修改 `Login.tsx`、前端 Token 存储、Socket、Caddy 或生产默认开关。

## Phase 2-C3-5-B：Web Auth Runtime 与迁移基础设施

### 当前版本

`v2.13.7`。本阶段新增 Web Auth 迁移基础能力，从 `v2.13.6` 升级 PATCH，但不切换现有登录入口。

### 完成内容

1. 新增 `src/auth/runtime`，提供 `legacy | v1-web` 模式、五态认证状态机、内存 Access Token Store、刷新协调和 Runtime。
2. Access Token Store 只使用类私有内存字段，不引用 localStorage/sessionStorage。
3. api-client 默认使用 `credentials: include`，仅在调用方明确允许 v1 refresh 时处理 401；刷新使用单飞锁，原请求最多重试一次。
4. 新增 Auth v1 Client，封装 login、refresh、logout 和 sessions，但未被现有页面或 API 引用。
5. 新增 `__Host-xmt_refresh` Cookie 设置/清除配置能力，固定 HttpOnly、SameSite=Lax、Path=/，不设置 Domain；尚未接入 Controller。
6. 新增 CSRF Service，支持 32 字节随机值、HMAC-SHA256 session 绑定签名、恒定时间验证和双提交校验；尚未接入接口。
7. 新增 `XMT_AUTH_WEB_ENABLED=false` 与数字用户 ID allowlist 解析；生产环境强制关闭，用户名不参与准入。
8. 新增专项测试，覆盖模式、开关、内存 Token、刷新单飞、401 单次重试、过期、清理、Auth Client、Cookie、CSRF 和 allowlist。

### 修改文件

- `src/auth/runtime/*`
- `packages/api-client/auth.ts`
- `packages/api-client/client.ts`
- `packages/api-client/types.ts`
- `packages/api-client/auth-client.ts`
- `api/modules/auth/web/*`
- `shared/schema/auth.schema.ts`
- `tests/auth/auth-web-runtime.test.ts`
- `.env.example`
- `package.json`
- `package-lock.json`
- `CHANGELOG.md`
- `docs/CHANGELOG.md`
- `docs/SYSTEM_UPDATE.md`
- `docs/PHASE2_AUTH_WEB_MIGRATION_DESIGN.md`
- `docs/UPGRADE_PROGRESS.md`
- `docs/文档索引.md`
- `docs/releases/v2.13.7.md`

### 数据库变化

无。未新增表、字段、索引、migration 或数据；现有 Auth Session/Refresh 表和 Repository 语义不变。

### 测试结果

- `npm run test:auth-web-runtime`：通过。
- `npm run version:check`：通过，版本统一为 `v2.13.7`。
- `npm run test:auth`：通过，legacy 登录、JWT、me、改密和 logout 行为保持冻结。
- `npm run test:auth-session-migration`：通过。
- `npm run test:auth-session-service`：通过。
- `npm run test:auth-v1`：通过。
- `npm run test:api-contract`：通过。
- `npm run check`：通过。
- Auth 相关 ESLint：通过。
- `npm run build`：通过。

### 当前未切换范围

1. `Login.tsx`、`src/api/auth.ts`、Auth Zustand Store 与现有持久 Token 逻辑未修改。
2. legacy `/api/auth/*`、旧 JWT payload、7 天有效期和生产登录行为不变。
3. Cookie/CSRF Service 未挂载到 v1 login/refresh/logout，experimental JSON Refresh Token 契约暂时不变。
4. `XMT_AUTH_WEB_ENABLED` 默认 false，生产强制关闭；没有真实灰度用户。
5. Socket、Yjs、Caddy 和线上 Cookie 策略未修改。

### 风险说明

1. 新 Runtime 尚无页面消费者，只有测试证明基础行为，不能宣称 Web 已完成迁移。
2. api-client 的单飞锁只覆盖同一实例；跨标签 BroadcastChannel/Web Locks 尚未实现。
3. Cookie/CSRF 未接线，因此还没有浏览器 Set-Cookie、Origin 或端到端 CSRF 保护验证。
4. 登录创建 session 与首枚 Refresh Token 的原子事务仍待下一阶段实现。

### 下一阶段计划

等待 Phase 2-C3-5-C 指令。建议只完成后端 Web Cookie/CSRF HTTP 适配、登录事务原子化和浏览器契约测试，继续不切换 `Login.tsx`、持久 Token、Socket、Caddy 或生产默认开关。

## Phase 2-C3-5-C：Web Cookie / CSRF HTTP 适配

### 当前版本

`v2.13.8`。本阶段完成默认关闭的 Web Cookie/CSRF HTTP 适配，从 `v2.13.7` 升级 PATCH。

### 完成内容

1. v1 Web login 使用 HttpOnly `__Host-xmt_refresh` Cookie 交付 Refresh Token，JSON 不再包含原值，并设置独立 CSRF Cookie。
2. Web refresh 只读取 Cookie，拒绝 body Refresh Token；依次完成空 body Schema、Origin、Cookie、Session、CSRF 和 Refresh hash/轮换校验。
3. refresh 成功后返回不含 Refresh Token 的标准 envelope，并覆盖新的 Refresh/CSRF Cookie。
4. Web logout 在 Access Token 与 session middleware 后校验 Origin/CSRF，撤销当前 session，并以同名同 Path、`Max-Age=0` 清除 Cookie。
5. 新增 Web 登录事务 Repository，将 `auth_sessions`、generation 0 Refresh hash 与 `activity_log` 纳入单个 SQLite 写事务。
6. Session/Refresh Service 新增记录准备能力，既有 create/rotate 行为与 legacy 路径保持不变。
7. OpenAPI、共享 Zod Schema 和 Auth v1 Client 更新为 Web Cookie 契约。
8. 新增 Cookie/CSRF HTTP 测试，覆盖 Cookie 属性、body 降级拒绝、CSRF 失败、轮换、重放、退出、no-store 和事务回滚。

### 修改文件

- `api/modules/auth/v1/*`
- `api/modules/auth/web/*`
- `api/modules/auth/session/session.service.ts`
- `api/modules/auth/refresh/refresh-token.service.ts`
- `api/openapi.ts`
- `shared/schema/auth.schema.ts`
- `packages/api-client/auth-client.ts`
- `tests/auth/auth-web-cookie.test.ts`
- `tests/auth/auth-web-runtime.test.ts`
- `.env.example`
- `package.json`
- `package-lock.json`
- `CHANGELOG.md`
- `docs/API_CONTRACT.md`
- `docs/CHANGELOG.md`
- `docs/SYSTEM_UPDATE.md`
- `docs/PHASE2_AUTH_WEB_MIGRATION_DESIGN.md`
- `docs/UPGRADE_PROGRESS.md`
- `docs/文档索引.md`
- `docs/releases/v2.13.8.md`

### 数据库变化

无。未新增表、字段、索引或 migration；只把现有 session、Refresh 记录和活动日志写入收口到单事务。

### 测试结果

- `npm run test:auth-web-cookie`：通过。
- `npm run version:check`：通过，版本统一为 `v2.13.8`。
- `npm run test:auth`：通过，legacy 行为保持冻结。
- `npm run test:auth-session-migration`：通过。
- `npm run test:auth-session-service`：通过。
- `npm run test:auth-v1`：通过，非 Web experimental 测试分支保持兼容。
- `npm run test:auth-web-runtime`：通过。
- `npm run test:api-contract`：通过。
- `npm run check`：通过。
- Auth 相关 ESLint：通过。
- `npm run build`：通过。

### 当前未切换范围

1. `Login.tsx`、legacy `/api/auth/*` 和现有前端登录入口不变。
2. localStorage/sessionStorage Token 逻辑、旧 JWT payload 和 7 天有效期不变。
3. Web Auth 仍要求 v1/Web 双开关、非生产环境和用户 ID allowlist；默认关闭且生产不可开启。
4. Socket、Yjs、Caddy 和线上 Cookie 配置不变。
5. Web Runtime 尚未被现有页面消费，普通用户不会进入 Cookie 流程。

### 风险说明

1. 当前 CSRF 来源使用非 HttpOnly Cookie + Header 双提交，仍依赖 CSP 和 XSS 治理，不能把 CSRF 视为 XSS 防护。
2. api-client 单飞仍是单实例范围，跨标签协调尚未实施。
3. Cookie Secure/Origin 的真实线上部署事实未验证，因此生产硬门禁继续保留。
4. Access Token 刷新后的 Socket 重认证和 Yjs 恢复尚未实施。

### 下一阶段计划

等待 Phase 2-C3-5-D 指令。建议只做非生产浏览器暗启测试入口或自动化夹具，验证 Runtime 冷启动、401 刷新和退出；仍不切正式 Login、持久 Token、Socket、Caddy 或生产开关。

## Phase 2-C3-5-D：Web Auth 暗启验证与浏览器契约测试

### 当前版本

`v2.13.9`。本阶段完成 Web Auth 非生产浏览器暗启验证基础，从 `v2.13.8` 升级 PATCH。

### 完成内容

1. 新增独立 Vite/Playwright 浏览器夹具，调用真实 Web Runtime、api-client 和 Auth v1 Cookie HTTP 接口，不接入正式页面。
2. 冻结 F5、新标签页、关闭重开后的 Cookie 冷启动恢复，确认 Access Token 只存在页面内存。
3. 覆盖多个并发 401 的单飞刷新，并处理刷新完成后迟到的旧 401，原请求最多重试一次。
4. 覆盖 Cookie 缺失、session 撤销、Refresh Token reuse 和 CSRF 失败，确认 Runtime 进入 expired 并清除 Token 与用户状态。
5. 覆盖 logout 后服务端 session 撤销、Cookie 清理、客户端清理及再次访问要求认证。
6. 冻结 v1/Web 双开关、用户 ID allowlist、非生产环境四重门禁。

### 修改文件

- `packages/api-client/client.ts`
- `src/auth/runtime/auth-runtime.ts`
- `tests/auth/auth-web-runtime.test.ts`
- `tests/auth/auth-browser.test.ts`
- `tests/auth/browser/fixture.html`
- `tests/auth/browser/fixture.ts`
- `package.json`
- `package-lock.json`
- `CHANGELOG.md`
- `docs/CHANGELOG.md`
- `docs/SYSTEM_UPDATE.md`
- `docs/UPGRADE_PROGRESS.md`
- `docs/文档索引.md`
- `docs/releases/v2.13.9.md`

### 数据库变化

无。未新增表、字段、索引或 migration；浏览器契约测试使用临时 SQLite，完成后关闭连接。

### 测试结果

- `npm run test:auth-browser`：通过，使用真实 Chromium 浏览器验证完整暗启闭环。
- `npm run version:check`：通过，版本统一为 `v2.13.9`。
- `npm run test:auth`：通过，legacy Auth 行为保持冻结。
- `npm run test:auth-v1`：通过。
- `npm run test:auth-web-runtime`：通过。
- `npm run test:auth-web-cookie`：通过。
- `npm run test:api-contract`：通过。
- `npm run check`：通过。
- Auth/Web Runtime/浏览器夹具范围 ESLint：通过。
- `npm run build`：通过。

### 当前未切换范围

1. `Login.tsx`、`src/api/auth.ts`、Zustand Auth Store 和正式页面登录入口未修改。
2. legacy `/api/auth/*`、浏览器持久 Token、旧 JWT payload 与 7 天有效期保持不变。
3. `XMT_AUTH_V1_ENABLED` 与 `XMT_AUTH_WEB_ENABLED` 默认关闭，生产环境硬门禁保持有效。
4. Socket、Yjs、Caddy 和线上 Cookie 策略未修改。

### 风险说明

1. 单飞刷新当前限定在单个页面 Runtime/api-client 实例，跨标签协调尚未实现。
2. 本阶段使用本地同源浏览器与临时数据库，不代表生产代理、域名和证书链已验证。
3. Web Runtime 仍未接入正式页面，测试通过不等于用户流量已迁移。

### 下一阶段计划

等待 Phase 2-C3-5-E 指令。建议先设计并验证跨标签刷新协调、暗启观测指标和灰度准入/退出清单，继续保持正式 Login、Socket、Caddy 与生产开关不变。

## Phase 2-C3-5-E1：Web Auth 灰度准入与观测体系建设

### 当前版本

`v2.13.10`。本阶段新增 Auth 灰度治理与迁移观测基础，从 `v2.13.9` 升级 PATCH。

### 完成内容

1. 新增统一 Auth Rollout Config，支持 `disabled`、`legacy`、`internal`、`allowlist`、`percentage` 五种模式。
2. 兼容旧 `XMT_AUTH_V1_ENABLED`、`XMT_AUTH_WEB_ENABLED` 和 `XMT_AUTH_WEB_ALLOWLIST_USER_IDS`；旧双开关同时为 true 时等价映射为 allowlist。
3. 新增 `AuthRolloutService.shouldUseWebAuth(user)`，按用户 ID 与非敏感 salt 执行 0–9999 稳定 SHA-256 分桶。
4. 新增八项 Auth Migration Metrics：legacy/v1 登录、refresh 成功/失败、CSRF 失败、Token reuse、logout 成功和 expired。
5. 新增 `auth.migration.login|refresh|logout|rollback` 结构化事件，携带 requestId、可用时的 userId、mode、outcome 和安全 reason，不记录 Token。
6. v1 Web Controller 与 legacy 登录接入观测；Cookie、CSRF、轮换、复用、注销和 session 失效均保持原响应契约。
7. 配置回滚为 `v1-web -> legacy`：停止新的 Web Auth 准入，不删除 Session 数据，不影响已签发 legacy JWT。

### 修改文件

- `api/modules/auth/rollout/*`
- `api/modules/auth/web/auth-web.config.ts`
- `api/modules/auth/v1/*`
- `api/modules/auth/auth.controller.ts`
- `api/modules/auth/index.ts`
- `tests/auth/auth-rollout.test.ts`
- `tests/auth/auth-web-cookie.test.ts`
- `.env.example`
- `package.json`
- `package-lock.json`
- `CHANGELOG.md`
- `docs/CHANGELOG.md`
- `docs/SYSTEM_UPDATE.md`
- `docs/UPGRADE_PROGRESS.md`
- `docs/文档索引.md`
- `docs/releases/v2.13.10.md`

### 数据库变化

无。未新增表、字段、索引或 migration；指标为进程内观测能力，Session 表只读验证回滚保留行为。

### 测试结果

- `npm run test:auth-rollout`：通过，覆盖五种模式、兼容配置、稳定分桶、回滚、指标和无 Token 日志。
- `npm run version:check`：通过，版本统一为 `v2.13.10`。
- `npm run test:auth`：通过，legacy 登录与 JWT 行为保持冻结。
- `npm run test:auth-v1`：通过，experimental v1 HTTP 行为保持兼容。
- `npm run test:auth-web-runtime`：通过。
- `npm run test:auth-web-cookie`：通过，包含迁移指标断言。
- `npm run test:api-contract`：通过。
- `npm run check`：通过。
- Auth/rollout 范围 ESLint：通过。
- `npm run build`：通过。

### 回滚与风险

1. 将 `XMT_AUTH_ROLLOUT_MODE` 设为 `legacy` 或 `disabled` 即停止新用户进入 v1-web；生产环境无条件归一为 legacy。
2. 回滚不清理 `auth_sessions` 或 `auth_refresh_tokens`，旧 JWT 验证路径继续工作。
3. 当前指标为单进程内存计数，重启会清零，多实例不会自动聚合；在正式灰度前需接入统一监控后端。
4. percentage 只决定准入，不会自动切换正式 Login；模式必须在后续入口接入阶段冻结到会话。

### 下一阶段计划

等待 Phase 2-C3-5-E2 指令。建议建设跨实例指标导出与告警阈值、灰度操作审计和准入决策只读诊断接口；继续不切正式 Login、Socket/Yjs、Caddy 或生产 Web Auth。

## Phase 2-C3-5-E2：Auth 灰度运行治理与上线准备

### 当前版本

`v2.13.11`。本阶段新增只读运行治理与上线准备能力，从 `v2.13.10` 升级 PATCH。

### 完成内容

1. 新增 Auth Rollout Status Service，返回当前 mode、enabled、用户 matchedRule 和安全 reason。
2. 新增时间指标事件与 Metrics Service，按 60 分钟、24 小时聚合 login、refresh、logout 和 failure。
3. 新增有界配置审计服务，字段包含 actor、action、before、after、reason、created_at；本阶段无写配置入口。
4. 新增 Threshold Config 与风险服务，覆盖 Refresh 失败率、CSRF 失败、Token reuse 和 expired 次数，超过阈值只生成风险事件。
5. 新增管理员只读 `GET /api/v1/auth-rollout/status`，继续接受 legacy JWT，并同步共享 Zod Schema 与 OpenAPI。
6. 新增 `/admin/auth-rollout` 认证迁移状态页，展示模式、指标、风险、用户准入原因和配置审计，不提供配置修改操作。
7. 新增 `AUTH_ROLLOUT_RUNBOOK.md`，冻结上线前检查、灰度步骤、观察指标、停止条件、回滚和责任人清单。

### 修改文件

- `api/modules/auth/rollout/*`
- `api/modules/auth/index.ts`
- `api/app.ts`
- `api/openapi.ts`
- `shared/schema/auth-rollout.schema.ts`
- `src/api/authRollout.ts`
- `src/pages/AuthRolloutStatus.tsx`
- `src/App.tsx`
- `src/config/navigation.ts`
- `tests/auth/auth-rollout-governance.test.ts`
- `tests/auth/browser/rollout-governance.html`
- `tests/auth/browser/rollout-governance.tsx`
- `.env.example`
- `package.json`
- `package-lock.json`
- `CHANGELOG.md`
- `docs/API_CONTRACT.md`
- `docs/AUTH_ROLLOUT_RUNBOOK.md`
- `docs/CHANGELOG.md`
- `docs/SYSTEM_UPDATE.md`
- `docs/UPGRADE_PROGRESS.md`
- `docs/文档索引.md`
- `docs/releases/v2.13.11.md`

### 数据库变化

无。未新增表、字段、索引或 migration；指标事件与配置审计为有界进程内数据。

### 测试结果

- `npm run test:auth-rollout-governance`：通过，覆盖诊断、时间指标、审计、阈值和回滚。
- 桌面 1440×900 和移动端 390×844 浏览器验证通过；用户诊断交互成功，无横向溢出或控制台错误。
- `npm run version:check`：通过，版本统一为 `v2.13.11`。
- `npm run test:auth`：通过，legacy 行为保持冻结。
- `npm run test:auth-rollout`：通过。
- `npm run test:auth-web-runtime`：通过。
- `npm run test:auth-web-cookie`：通过。
- `npm run test:api-contract`：通过。
- `npm run check`：通过。
- Auth Rollout/API/页面/浏览器夹具范围 ESLint：通过。
- `npm run build`：通过。

### 风险与未切换范围

1. 指标和审计为单进程有界内存记录，重启清零且多实例不聚合，不能替代正式监控和持久审计。
2. 阈值只生成风险事件，不自动修改灰度配置，停止动作仍需按运行手册人工执行和复核。
3. 正式 Login、默认 `/api/auth/login`、生产 v1-web、legacy JWT、Socket/Yjs、Caddy 和数据库结构均未修改。
4. 管理页只对 admin 开放且完全只读，本阶段不扩大或切换任何真实用户。

### 下一阶段计划

等待 E3 指令。建议只选择明确责任人的内部普通测试账号进入 allowlist，先完成值班、指标导出、报警通知和回滚演练；不要直接切换管理员、比例流量或依赖 Socket/Yjs 的工作流。

## Phase 2-C3-5-E3：生产 Auth v1-web 受控灰度准备

### 当前版本

`v2.13.12`。本阶段增加生产专用批准门禁，默认仍为 legacy。

### 完成内容

1. 生产环境只有同时满足独立批准开关和明确用户 ID allowlist 才可挂载 Auth v1。
2. `internal` 与 `percentage` 在生产继续强制回落 legacy，避免范围扩散。
3. 正式 Login、管理员账号、legacy JWT、Socket/Yjs 与 Caddy 不切换。
4. 灰度执行责任人由李庆承担，allowlist 由李庆与刘启超复核；观察窗口为 2026-07-31 12:00–13:00。

### 数据库变化

无数据库结构变化。生产执行阶段只新增三个隔离的 member 测试用户，并复用既有认证会话表。

### 测试结果

- `npm run version:check`：通过，版本统一为 `v2.13.12`。
- `npm run test:auth`、`test:auth-rollout`、`test:auth-v1`：通过。
- `npm run test:auth-web-runtime`、`test:auth-web-cookie`、`test:auth-browser`：通过。
- `npm run test:auth-rollout-governance`、`test:api-contract`：通过。
- `npm run check`、Auth 变更范围 ESLint、`npm run build`：通过。
- 生产真实浏览器与指标观察结果待执行后写入 `AUTH_PRODUCTION_GRAY_REPORT.md`。
- 生产真实浏览器验证通过：3 个隔离 member 账号完成登录、Cookie、Refresh、刷新/新标签页/重开、并发单飞、Logout、撤销与重新登录。
- 生产观察约 33 分钟，31 个连续健康样本全部正常；无新增 Socket、SQLite、未处理异常或 Yjs 错误。
- 测试结束后已恢复 legacy、关闭批准和 v1/Web 开关，并将测试账号标记 disabled；Session 与审计记录保留。

### 风险与回滚

1. 任一批准条件缺失即回落 legacy。
2. 生产禁止 `internal` 与 `percentage`。
3. 异常时将模式切回 legacy、关闭批准开关并重启；不删除会话和审计记录。
4. 结构化 login 日志事件数高于实际成功登录/Session 数，扩大灰度前需统一指标去重口径。

## Phase 2-C3-6-A：Auth 事件模型统一与外部指标基础

### 当前版本

`v2.13.13`。本阶段只治理认证观测，不扩大灰度或修改认证业务行为。

### 完成内容

1. 新增 `api/modules/auth/events/`，统一十类 Auth Event 与固定安全字段。
2. `AuthEventService` 成为认证指标唯一事实入口，日志只输出事件，不再作为计数来源。
3. 新增 `AuthMetricsService` 与 `AuthMetricsExporter`，当前使用有界 Memory Exporter，并为 Prometheus/OpenTelemetry 预留 `increment/observe/gauge`。
4. legacy 与 v1 登录成功均只产生一个 login success 计数；Session、Rollout 决策保持独立事件但不重复计入登录。
5. Refresh、CSRF、Token reuse、Logout、Session 撤销统一由 mapper 派生指标，移除 Controller/Route 的多点手工计数。
6. `/api/v1/auth-rollout/status` 增加 5 分钟窗口，连同 60 分钟、24 小时统一展示登录、刷新、失败和安全事件。

### 修改文件

- `api/modules/auth/events/*`
- `api/modules/auth/auth.controller.ts`
- `api/modules/auth/v1/*`
- `api/modules/auth/rollout/*`
- `shared/schema/auth-rollout.schema.ts`
- `src/api/authRollout.ts`
- `src/pages/AuthRolloutStatus.tsx`
- `tests/auth/*`
- `docs/*`
- `package.json`
- `package-lock.json`

### 数据库变化

无。未新增或修改任何认证表、字段、索引与 migration，旧日志也未删除。

### 测试结果

- `npm run version:check`：通过（v2.13.13）
- `npm run test:auth`：通过
- `npm run test:auth-rollout`：通过
- `npm run test:auth-events`：通过
- `npm run test:auth-web-runtime`：通过
- `npm run test:auth-web-cookie`：通过
- `npm run test:auth-browser`：通过
- `npm run test:api-contract`：通过
- `npm run test:auth-v1`：通过（补充回归）
- `npm run test:auth-rollout-governance`：通过（补充回归）
- `npm run check`：通过
- `npm run build`：通过
- Auth 相关范围 ESLint：通过

### 风险与下一阶段

1. Memory Exporter 在进程重启后清零，尚不能替代持久外部监控。
2. 旧 Migration Logger/Metrics 保留兼容导出，但生产 Auth 路径不再写入；后续确认无调用方后再单独弃用。
3. 正式 Login、legacy JWT、生产灰度、Socket/Yjs 和数据库结构保持不变。
4. 下一阶段应接入真实 Prometheus/OpenTelemetry Exporter 并冻结告警，再评估正式 Login 准入。

## Phase 2-C3-6-B：Auth 生产指标 Exporter 与告警基础

### 当前版本

`v2.13.14`。本阶段只建设认证观测基础，不扩大灰度或修改认证行为。

### 完成内容

1. 新增 `api/modules/auth/metrics/`，包含统一类型、Metrics Registry、Prometheus 与 OpenTelemetry 适配。
2. Registry 同时扇出 Memory 与 Prometheus；OTel 支持部署环境注入兼容 Meter，且不绑定具体厂商。
3. Prometheus 提供登录、Refresh、Refresh 失败、Logout、安全事件 Counter，活跃 Session Gauge 和 Refresh 耗时 Histogram。
4. Auth Event 继续作为唯一指标事实，多 Exporter 不会重复业务计数；安全指标只使用低基数事件类型与原因标签。
5. `/api/v1/auth-rollout/status` 增加 Exporter 状态、指标来源、最近事件时间和最近导出时间。
6. 新增 `AUTH_ALERT_RULES.md`，冻结 Refresh 失败率、Token reuse、CSRF、Expired 告警建议与停止动作。

### 修改文件

- `api/modules/auth/metrics/*`
- `api/modules/auth/events/*`
- `api/modules/auth/v1/auth.v1.controller.ts`
- `api/modules/auth/rollout/*`
- `shared/schema/auth-rollout.schema.ts`
- `src/api/authRollout.ts`
- `src/pages/AuthRolloutStatus.tsx`
- `tests/auth/auth-metrics-exporter.test.ts`
- `docs/*`
- `package.json`
- `package-lock.json`

### 数据库变化

无。未新增或修改表、字段、索引和 migration。

### 测试结果

- `npm run version:check`：通过（v2.13.14）
- `npm run test:auth`：通过
- `npm run test:auth-events`：通过
- `npm run test:auth-metrics-exporter`：通过
- `npm run test:auth-rollout`：通过
- `npm run test:auth-web-runtime`：通过
- `npm run test:auth-web-cookie`：通过
- `npm run test:api-contract`：通过
- `npm run check`：通过
- `npm run build`：通过
- Auth 相关范围 ESLint：通过

### 风险与下一阶段

1. Prometheus Exporter 需要部署侧接入抓取入口和持久监控后端；代码内聚合不能代替外部时序数据库。
2. OTel 默认不绑定 SDK 或厂商，需在部署组合根注入 Meter，并验证 Collector 与告警链路。
3. 活跃 Session Gauge 是单实例观测值，多实例应保留实例维度，不能简单求和当作全局唯一会话数。
4. 正式 Login 准入前需完成生产采集、跨实例聚合、告警通知、值班演练和基线校准；当前仍保持 legacy。

## Phase 2-C3-6-C：Auth 生产观测链路接入与正式 Login 准入设计

### 当前版本

`v2.13.15`。本阶段完成观测接入准备与设计，不切换生产 Login。

### 完成内容

1. 新增默认关闭的 `/internal/metrics/auth`，返回 Prometheus text format，并按配置 CIDR 校验来源。
2. 公网 Caddy 示例明确对内部指标路径返回 404；Prometheus 示例直接从私网 Node 地址抓取。
3. Prometheus/OTel 统一增加低基数 `instance` 标签，部署通过 `XMT_INSTANCE_ID` 提供稳定实例身份。
4. 新增 OTel Collector 配置样例，并用注入 Meter 模拟 Collector 验证 XMT → OTel Exporter → Collector 契约。
5. 新增 Warning/Critical 规则样例；Token reuse 只做离线规则验证，不在生产制造真实复用事件。
6. 新增多实例治理文档，明确 Counter/Histogram 聚合规则及 `active_sessions` 不可简单求和。
7. 新增正式 Login 迁移计划，冻结 legacy/v1 状态、准入前置、allowlist 阶段、回滚与 Socket/Yjs 风险。

### 修改文件

- `api/modules/auth/metrics/*`
- `api/modules/auth/events/*`
- `api/app.ts`
- `.env.example`
- `deploy/observability/*`
- `deploy/linux/Caddyfile.example`
- `tests/auth/auth-observability-integration.test.ts`
- `docs/*`
- `package.json`
- `package-lock.json`

### 数据库变化

无。未新增或修改表、字段、索引或 migration。

### 测试结果

- `npm run version:check`：通过（v2.13.15）
- `npm run test:auth`：通过
- `npm run test:auth-events`：通过
- `npm run test:auth-metrics-exporter`：通过
- `npm run test:auth-observability`：通过
- `npm run test:auth-rollout`：通过
- `npm run check`：通过
- `npm run build`：通过
- Auth 相关范围 ESLint：通过
- 本机无 OTel Collector 可执行文件；模拟 Collector Meter 与配置契约通过，真实 Collector 联通待部署环境验证。

### 风险与下一阶段

1. 本阶段验证的是本地 scrape 与模拟 Collector 契约，尚未连接真实生产 Prometheus、Collector 或通知平台。
2. Endpoint 必须同时受 Node CIDR、防火墙和反向代理保护；仅设置应用开关不足以授权公网访问。
3. instance 标识不稳定会导致时序膨胀；部署前必须冻结命名规则。
4. 正式 Login 仍不准入，下一阶段需完成真实监控联通、告警到达演练、24 小时基线和 Socket/Yjs 交接决策。

## Phase 2-C3-7-A：Socket/Yjs Auth Bridge 设计

### 当前版本

`v2.13.16`。本阶段只完成审计、设计和测试契约，不修改业务代码。

### 完成内容

1. 新增 `SOCKET_AUTH_CURRENT.md`，冻结 legacy handshake、Token 来源、用户复查、Room/Yjs 恢复与依赖点。
2. 新增 `AUTH_SOCKET_MIGRATION_DESIGN.md`，定义 `SocketAuthContext` 和显式 legacy/v1 验证分支。
3. 明确 v1 Socket 只传短期 Access Token，Refresh Token、Cookie 与 CSRF Token 永不进入 Socket。
4. 设计 HTTP 单飞 Refresh → Access 更新 → 新 handshake → Room/Yjs 恢复的固定顺序。
5. 规划 Legacy Socket → Bridge 暗启 → Bridge allowlist → v1 Socket 的可回滚阶段。
6. 新增 `AUTH_SOCKET_TEST_PLAN.md`，覆盖 Token 到期、Session 撤销、断网、Yjs 最终一致、多标签和回滚。
7. 审计识别 collaboration presence 依赖客户端 user payload、Room 准入未强绑定业务权限，列为 Bridge 实施前门禁。

### 修改文件

- `docs/SOCKET_AUTH_CURRENT.md`
- `docs/AUTH_SOCKET_MIGRATION_DESIGN.md`
- `docs/AUTH_SOCKET_TEST_PLAN.md`
- `docs/releases/v2.13.16.md`
- `docs/UPGRADE_PROGRESS.md`
- `docs/CHANGELOG.md`
- `docs/SYSTEM_UPDATE.md`
- `docs/文档索引.md`
- `CHANGELOG.md`
- `package.json`
- `package-lock.json`

### 数据库变化

无。未新增或修改数据库、migration、Socket/Yjs 协议或生产配置。

### 验证结果

- 三份核心设计文档与发布说明均存在、非空，章节结构检查通过。
- 文档索引、CHANGELOG、SYSTEM_UPDATE 与阶段记录引用检查通过。
- `npm run version:check`：通过（v2.13.16）。
- `git diff --check`：通过。
- 变更范围检查：仅文档、CHANGELOG 与版本元数据，无业务代码、数据库、Socket/Yjs 协议或生产配置变化。

### 风险与下一阶段

1. 当前 Socket 只在 handshake 验证 legacy JWT，长连接建立后不复验 Token 到期、Session 撤销或用户禁用。
2. v1 Access Token 当前无法通过 legacy `payload.userId` 链路建立身份。
3. Yjs 重连保留本地 Doc 并重发 JOIN，但待发送更新缺少应用级 ACK，必须以 CRDT 状态向量验证最终一致。
4. 下一阶段建议只实现纯 Auth Bridge middleware、Context mapper 和临时数据库契约测试，feature flag 默认关闭；不要同时切换前端或生产 Socket。

## Phase 2-C3-7-B：Socket Auth Bridge 基础设施实施

### 当前版本

`v2.13.17`。本阶段实现认证基础设施，Feature Flag 默认关闭，生产环境保持 legacy。

### 完成内容

1. 新增 `api/modules/auth/socket/`：types、Zod schema、mapper、service、middleware、errors。
2. 实现 `SocketAuthContext`，只允许 userId/sessionId/tokenType/authMode/issuedAt/expiresAt；不含 Token、Refresh、Cookie、密码或 role snapshot。
3. Bridge 关闭时走 legacy 分支；开启后按显式 mode 分支，legacy 使用旧 JWT，v1-web 使用 v1 Access Token + ACTIVE Session + enabled user。
4. 严格禁止 v1→legacy 或 legacy→v1 fallback，避免 token confusion。
5. 接入现有 Socket middleware，不重写 Socket 初始化、Room、消息、Heartbeat 或 Collaboration 事件。
6. Collaboration JOIN 使用服务端认证身份覆盖客户端 userId/name/role，新增 `authorizeSocketRoomJoin()` 预留入口但不改变业务权限规则。
7. 新增 legacy/v1、错误分支、Session revoked、disabled user、Feature Flag 和 no-fallback 测试。

### 修改文件

- `api/modules/auth/socket/*`
- `api/modules/auth/index.ts`
- `api/app.ts`
- `api/collaboration/core/roomManager.ts`
- `.env.example`
- `tests/auth/socket-auth-contract.test.ts`
- `tests/auth/socket-auth-bridge.test.ts`
- `docs/*`
- `package.json`
- `package-lock.json`

### 数据库变化

无。未新增或修改表、字段、索引或 migration。

### 测试结果

- `npm run version:check`：通过（v2.13.17）
- `npm run test:auth`：通过，legacy Auth 行为保持冻结
- `npm run test:auth-socket-contract`：通过
- `npm run test:auth-socket-bridge`：通过
- `npm run test:auth-events`：通过
- `npm run test:auth-rollout`：通过
- `npm run check`：通过
- `npm run build`：通过
- Auth 范围 ESLint：通过

### 风险与下一阶段

1. Bridge 当前只提供认证上下文；长连接到期主动断开、Access Refresh 后重连和 Yjs state-vector 恢复尚未实施。
2. Room 权限入口目前只做基础输入边界，未改变既有业务权限模型；下一阶段必须接入真实 owner/permission/scope 规则。
3. 生产 Flag 默认关闭且 NODE_ENV=production 硬性关闭；正式用户和 Socket 行为未切换。
4. 下一阶段建议实现 Socket Coordinator、Refresh 后重连、连接到期治理和 Yjs 恢复契约，继续保持灰度范围受控。

## Phase 2-C3-7-C：Socket Coordinator + Yjs Recovery Bridge 实施

### 当前版本

`v2.13.18`

### 完成内容

1. 新增 `src/auth/socket/` Coordinator、状态模型和 HTTP Auth Runtime Token Provider；Socket 内部不执行 Refresh。
2. 实现临期刷新、Access Token 写入 `socket.auth.token`、主动 disconnect/connect 重建 handshake，以及单飞 refresh 协调。
3. 固定恢复顺序：Socket handshake → Room JOIN → Yjs 恢复 → Awareness → typing → lock。
4. 新增 `YjsRecoveryBridge`，在重连期间冻结 outbound CRDT/awareness，保留同一 Y.Doc，并在服务端 SYNC 后恢复发送。
5. Session revoke/logout 会使 Coordinator 进入 expired 并销毁 Socket；默认不接入现有 legacy `useSocket`，生产 Bridge 仍关闭。

### 修改文件

- `src/auth/socket/socket-state.ts`
- `src/auth/socket/socket-token-provider.ts`
- `src/auth/socket/socket-coordinator.ts`
- `src/auth/socket/index.ts`
- `src/collaboration/yjs/SocketYjsProvider.ts`
- `tests/auth/socket-coordinator.test.ts`
- `tests/collaboration/yjs-auth-recovery.test.ts`
- `package.json`
- `docs/*`

### 数据库变化

无。未新增或修改数据库、migration、Socket/Yjs wire event、CRDT 协议或生产配置。

### 测试结果

- `npm run version:check`：通过（v2.13.18）
- `npm run test:socket-coordinator`：通过
- `npm run test:yjs-auth-recovery`：通过
- `npm run check`：通过
- `npm run build`：通过
- Auth/Socket/Yjs 范围 ESLint：通过

### 风险与下一阶段

1. Coordinator 尚未接入正式 Web 登录或现有 `useSocket`，不会改变生产默认连接。
2. Yjs 恢复仍复用现有 JOIN/SYNC/AWARENESS 事件，没有引入 wire event 或 ACK 协议；正式灰度前需做真实浏览器最终一致验证。
3. 下一阶段建议实施 Bridge Coordinator 的受控接入、连接过期服务端治理、logout/session revoke 主动断开和多标签协调，继续保持 allowlist 与可回滚。

## Phase 2-C3-7-D：Socket Coordinator 受控接入与真实浏览器一致性验证

### 当前版本

`v2.13.19`

### 完成内容

1. 新增 `VITE_XMT_SOCKET_COORDINATOR_ENABLED`，默认 `false`；关闭时完全保留现有 Socket 创建逻辑。
2. 开启且存在 Auth Runtime 时，使用 Runtime Token Provider → Socket Coordinator → Socket.IO；Coordinator 负责临期刷新、更新 handshake token 与重连。
3. 新增 BroadcastChannel 状态信号：`auth_changed`、`token_refreshed`、`logout`，严禁传递 Access/Refresh Token。
4. 新增标准生命周期原因常量和服务端 `auth:lifecycle` 关闭辅助能力：`AUTH_EXPIRED`、`SESSION_REVOKED`、`USER_DISABLED`。
5. 新增 Playwright 浏览器恢复契约，覆盖双标签信号、断线冻结、恢复同步与 logout 同步；本机 Playwright Chrome 无法启动时测试明确跳过并保留原因。

### 修改文件

- `src/auth/socket/socket-tab-coordinator.ts`
- `src/auth/socket/socket-coordinator.ts`
- `src/auth/socket/index.ts`
- `src/hooks/useSocket.ts`
- `api/modules/auth/socket/socket-auth.errors.ts`
- `api/modules/auth/socket/socket-auth.middleware.ts`
- `.env.example`
- `tests/browser/socket-auth-recovery.spec.ts`
- `tests/auth/socket-tab-coordinator.test.ts`
- `package.json`
- `package-lock.json`
- `docs/*`

### 数据库变化

无。未修改数据库、Yjs wire event、CRDT 协议或 legacy 登录行为。

### 测试结果

- `npm run version:check`：通过（v2.13.19）
- `npm run test:auth`：通过
- `npm run test:auth-socket-bridge`：通过
- `npm run test:socket-coordinator`：通过
- `npm run test:yjs-auth-recovery`：通过
- `npm run test:browser-auth-recovery`：浏览器运行环境不可启动，已安全跳过并记录，不伪造通过结果
- `npm run check`：通过
- `npm run build`：待最终提交前复跑

### 风险与下一阶段

1. Coordinator 接入仍由前端开关控制，生产默认关闭；正式 Web 用户和 legacy Socket 未切换。
2. 服务端生命周期辅助函数已提供，但本阶段未将撤销事件全量接入业务流程。
3. 下一阶段建议在具备可运行 Playwright 浏览器的 CI/验收机上完成真实 Socket/Yjs 端到端验证，再考虑 allowlist 灰度。

## Phase 2-C3-8-A：Auth + Socket + Yjs 真实浏览器闭环验证

### 当前版本

`v2.13.20`

### 完成内容

1. 诊断并修复 Playwright 浏览器环境：Playwright 1.60 期望缓存版本与本机缓存不一致，测试改为选择实际可用的 Chromium for Testing。
2. 修复浏览器测试使用 `about:blank` 导致 BroadcastChannel 跨标签不互通的问题，改用同源本地 HTTP fixture。
3. 新增 `tests/browser/auth-socket-yjs-e2e.spec.ts`，真实验证 v1-web 登录、HttpOnly Refresh Cookie、页面刷新恢复、Socket 重握手、Room JOIN、Yjs state vector、Awareness、Lock 和 Logout 同步。
4. 通过真实 Playwright 双页面验证：Access Token 仅在内存，Refresh 后 Socket 重连并恢复 Room/Yjs，多标签只传播 logout 状态信号。

### 修改文件

- `tests/browser/auth-socket-yjs-e2e.spec.ts`
- `tests/browser/socket-auth-recovery.spec.ts`
- `package.json`
- `package-lock.json`
- `docs/*`

### 数据库变化

无。未修改数据库、正式 Login、Yjs wire event 或生产配置。

### 测试结果

- `npm run version:check`：通过（v2.13.20）
- `npm run test:auth`：通过
- `npm run test:auth-socket-bridge`：通过
- `npm run test:socket-coordinator`：通过
- `npm run test:yjs-auth-recovery`：通过
- `npm run test:browser-auth-recovery`：通过
- `npm run test:auth-socket-yjs-e2e`：通过（真实 Chromium）
- `npm run check`：通过
- `npm run build`：通过

### 风险与下一阶段

1. 本阶段验证使用本地临时 Auth/Socket 测试服务器，不代表生产 Socket 已切换。
2. 生产仍保持 legacy，Coordinator 开关和 v1 Socket 继续关闭。
3. 下一阶段建议在 CI 固化 Chromium 版本与 Playwright 浏览器缓存，再进行 allowlist 用户的受控 Socket/Yjs 灰度。

## Phase 2-C3-8-B1：正式 Login 双轨灰度准入设计与实施准备

### 当前版本

`v2.13.21`

### 完成内容

1. 新增 `docs/AUTH_LOGIN_ROLLOUT_POLICY.md`，冻结 disabled、legacy、allowlist、percentage 模式和审批、观察、回滚规则。
2. 新增 `LoginRolloutPolicy`，提供统一入口前的纯准入决策；默认开关 `XMT_LOGIN_ROLLOUT_ENABLED=false`。
3. 强制管理员/director 保持 legacy；percentage 必须额外审批，生产必须显式批准，未批准自动回 legacy。
4. 新增 `tests/auth/login-rollout-policy.test.ts`，覆盖关闭、legacy、allowlist、管理员保护、非名单、percentage 和生产回滚。
5. 未修改 `/api/auth/login`、legacy JWT、数据库、Socket/Yjs 或生产灰度配置。

### 修改文件

- `api/modules/auth/rollout/login-rollout-policy.ts`
- `api/modules/auth/index.ts`
- `tests/auth/login-rollout-policy.test.ts`
- `.env.example`
- `package.json`
- `package-lock.json`
- `docs/AUTH_LOGIN_ROLLOUT_POLICY.md`
- `docs/*`

### 数据库变化

无。

### 测试结果

- Login Policy 专项测试通过；完整 Auth、Socket、Yjs、浏览器回归结果见提交前验证记录。

### 风险与下一阶段

1. Policy 尚未接入正式 `/api/auth/login`，生产行为保持 legacy。
2. 下一阶段应先实现可观测 Login Gateway 适配层，并以专用普通账号 allowlist 做受控演练，禁止自动扩大和 percentage 默认开启。

## Phase 2-C3-8-B2：Login Gateway 双轨接入与内部账号灰度准备

### 当前版本

`v2.13.22`

### 完成内容

1. 新增 `LoginGatewayController` 并接入 `POST /api/auth/login`。
2. Gateway 仅做用户身份预查和 Policy 决策：开关关闭、非名单、admin/director 或 v1 adapter 不可用时，委托原 legacy Controller。
3. allowlist 普通账号命中时，由 v1-web Controller 完成 Session、Refresh Cookie、CSRF、activity_log 和 v1-web 指标；Gateway 不重复计数。
4. legacy 分支继续沿用原 Controller，因此 JWT payload、7 天有效期、中文错误、限流中间件和 activity_log 保持原样。
5. 禁用 percentage 和自动名单扩大；生产默认开关关闭。
6. 新增 Login Gateway 专项测试；既有真实 Chromium Auth/Socket/Yjs 浏览器回归继续通过。

### 修改文件

- `api/modules/auth/rollout/login-gateway.controller.ts`
- `api/routes/auth.ts`
- `api/modules/auth/index.ts`
- `tests/auth/login-gateway.test.ts`
- `package.json`
- `package-lock.json`
- `docs/*`

### 数据库变化

无。

### 测试结果

- `npm run version:check`：通过（v2.13.22）
- `npm run test:login-gateway`：通过
- Auth、Rollout、Socket、Coordinator、Yjs、浏览器恢复、类型检查和构建：通过

### 风险与下一阶段

1. 生产 Flag 默认关闭，生产不会进入 v1-web；本阶段不自动添加 allowlist。
2. v1 分支依赖已有 v1 Auth Web 的 Origin、CSRF、Pepper 与审批配置；缺失 adapter 时安全回退 legacy。
3. 下一阶段建议由已审批的专用 member 测试账号，在固定观察窗口内验证 `/api/auth/login` Gateway 的真实 Cookie、Socket/Yjs 闭环，再决定是否扩大名单。

## Phase 2-C3-8-B3：Production Socket Bridge Controlled Enablement

### 当前版本

`v2.13.23`

### 完成内容

1. 生产 Socket Bridge 从环境硬关闭改为三重门禁：Bridge 开关、独立审批开关、Login allowlist 普通账号。
2. 非名单、admin、director、未审批、禁用 Bridge 或非 allowlist 模式均保留 legacy；v1 Token 不降级为 legacy JWT。
3. `/api/v1/auth-rollout/status` 增加 Socket Bridge 开启、审批、候选名单数量和当前模式。
4. 新增 `auth:production-preflight`，只读检查版本、commit、SQLite、备份、Rollout 与 Socket Bridge。
5. 新增生产 Gate 测试和生产门禁运行文档。

### 数据库变化

无。

### 测试结果

- `test:socket-production-gate` 通过；完整 Auth、Socket、Yjs、类型与构建结果见提交前验证。

### 风险与下一阶段

1. 代码只提供受控开启能力；生产变量仍默认关闭，未创建/启用测试账号，未扩大用户范围。
2. 真实生产灰度前必须确认 v2.13.23 部署、备份、审批、专用 member 账号和观察窗口。

## Phase 2-C3-12-R5：Socket Polling SID Lifecycle Investigation

### 当前版本

`v2.17.3`

### 完成内容

1. 审计客户端单例、页面刷新、StrictMode、logout/login 与 polling 参数链路。
2. 新增开发环境 Socket 生命周期诊断，不记录 token、Cookie、用户或 Socket ID。
3. Chromium 真实 Socket.IO polling 夹具覆盖刷新、关开标签、断网恢复、可见性与重新登录。

### 数据库变化

无。

### 测试结果

- Socket、客户端诊断、Chromium 恢复、Coordinator、Yjs 恢复、类型检查、构建与版本检查通过。

### 风险与下一阶段

1. B 类事件与旧 polling SID 的延迟请求相符，但生产频率仍需在 legacy 下继续观测。
2. 当前不进入 C3.12-A；禁止开启 Auth 灰度。
# v2.20.0 Creator Collector

- 已完成：Scrapling First Worker、独立 Profile、JSON Lines Bridge、脱敏 Manifest 与旧采集源码清理。
- 数据库变化：无。
- 验证：Python 单测、Agent check/build、Bridge health/shutdown 通过。
- 风险：真实账号登录、内容管理指标、数据中心指标与官方导出仍需用户在专用 Chrome 内扫码后完成 POC；禁止部署生产。
# v2.20.3 Creator 官方导出本地安全同步

- 完成内容：本地 XLSX 表头识别、字段归一、质量摘要和仅标准数据的加密上传；服务端新增批次、文件与业务指标幂等事务。
- 修改文件：Collector 导出解析器、Agent 上传构造、Creator sync 服务、数据库初始化、契约测试与数据契约文档。
- 数据库变化：新增 `creator_ingest_batches`、`creator_ingest_files`、`creator_official_metrics`，仅追加且不删除历史数据。
- 测试：Agent/root typecheck、Agent build、v1 安全与同步契约、v2 官方导出契约、真实样本本地解析均通过。
- 风险：仅确认两类实际下载文件，官方页面入口完整覆盖和异步任务流仍待用户提供脱敏截图或 URL；当前不部署生产。
## v2.20.10 Creator Agent Preload 浏览器安全契约（2026-09-02）

- 修复 sandboxed Preload 经状态契约间接导入 `node:crypto` 导致正式 Renderer 空白。
- 设备键控 HMAC 与真实绑定配置保留在 Main-only 模块；Preload/Renderer 仅消费已脱敏的纯浏览器白名单状态。
- 新增最终打包 arm64 制品的 sandbox/contextIsolation/nodeIntegration 冒烟门禁；仅使用临时 userData 与 loopback fixture。
- 无数据库迁移、无生产数据写入；正式安装和真实 Profile 验收需单独授权。
