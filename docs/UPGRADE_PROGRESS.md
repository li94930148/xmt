# XMT 升级阶段记录

## 2026-10-26 清单 B4/B5：修复移动端验收夹具连接（v9.4.2）

- **改造内容**：移动工作区浏览器夹具不再用 Express 对所有 Socket.IO 请求重复返回 Engine.IO 握手；改为仓库依赖的本地内存 Socket.IO 服务，仅接受隔离连接、不发业务事件。
- **验证结果**：目标文件 ESLint、`npm run check -- --pretty false`、`npm run version:check`、版本/更新说明/测试入口治理、部署安全合同测试、内部暴露门禁测试、`npm run build` 与 `git diff --check` 通过；生产构建保留既有 843.50 kB Silk 分包提示。`npm run test:mobile-work-center-browser` 已尝试，但 Chromium 在 macOS `bootstrap_check_in … Permission denied (1100)` 启动失败，未进入任何测试断言。Chrome DevTools MCP 内存夹具显示首页“正在整理今日任务…”和“正在读取灵感数量…”均为 `role=status`/`aria-live=polite`；释放两个延迟 GET 后状态提示消失。Socket.IO 资源请求 8 秒内保持 4 次，页面无错误或警告；当时页面视口 500 CSS px，文档宽度 492px，无横向溢出。320/390px 本轮未由 Chrome 窗口缩放工具成功模拟。
- **VoiceOver 边界**：已临时开启系统 VoiceOver，确认字幕面板设置原为开启且语音效果未静音；验收结束后已将 VoiceOver 恢复关闭。页面辅助功能树能识别加载状态，但窗口工具未显示实际播报文本，故真实语音仍未确认。
- **影响边界**：只改浏览器测试夹具和版本/说明文件；无产品 API、权限、数据库、真实业务数据或 Android 原生界面变化。Android 元数据同步至 90402；GitHub CI 生成并上传 debug 验收 APK artifact，未发布 Android 安装包。
- **部署结果**：PR #84 合并至 main，目标 SHA `957b0a7c0b8b74183c225dc2e89c1bf3108f7f9d`；该合并 SHA 的六项 CI 全部通过。受保护部署完成在线 SQLite 备份、Restore Drill PASS、65 项迁移检查 GO、运行环境读回 PASS、内部路由暴露检查 PASS，之后 PM2 运行 v9.4.2、Caddy active。公网健康接口和首页均为 HTTP 200；部署后 SQLite `quick_check=ok`、外键违规 0。生产依赖审计 `npm audit --omit=dev` 为 0 漏洞，无数据库迁移或业务数据写入。
- **下一步**：继续推进 B4/B5 页面与辅助技术验收、B8 剩余写入恢复链路；匿名意见首次响应丢失仍需明确匿名范围与回执保留期，Android 原生专项后置。

## 2026-10-26 清单 B8：桌面与移动通知偏好结果核实（v9.4.1）

- **改造内容**：通知偏好写入遇到网络中断、HTTP 408/429 或 5xx 时改为只读核实；服务器状态与提交草稿匹配时恢复成功结果，不自动重复 PUT。服务端值不匹配时保留草稿并锁定开关与普通保存，提供载入服务器设置或用户明确确认覆盖；核实读取失败时保留草稿并仅开放只读重新核实。
- **影响边界**：桌面系统设置与移动通知设置共用恢复合同；无 API、权限、数据库或真实业务数据变化。Android 仅同步版本元数据至 90401，未构建 APK。
- **验证结果**：`npm run test:notification-settings-load`、`npm run test:system-settings`、`npm run test:mobile-notification-settings-browser`（390px）、`npm run check`、`npm run version:check`、版本治理、更新说明治理（516 个版本）、测试入口检查（287 个文件）、Android runtime / mobile production gate、生产依赖审计（0 漏洞）、目标 ESLint 和 `npm run build` 通过；构建保留既有 Silk 843.50 kB 大分包提示，目标 ESLint 0 错误、2 条 Hook 依赖警告。Playwright MCP 内存夹具在桌面 1440px 与移动 390px 验证 503 冲突、明确覆盖、提交后响应丢失、核实读取失败后锁定写入和只读重核；每个页面均观察到 4 次 PUT / 4 次 GET，最后的只读重核未增加 PUT，页面运行时错误为 0，移动文档宽度为 390px。注入的 503 与响应中断产生预期网络控制台错误。桌面完整 `npm run test:system-settings-browser` 已启动并通过通知恢复断言，之后在外观设置的 ReactBits 预览可见性断言失败，故整套桌面 suite 不计通过；该失败发生在通知偏好测试段之后。
- **修改文件**：通知偏好 API helper、桌面系统设置、移动通知设置、对应单元/浏览器回归，以及版本、系统更新、升级阶段和改造清单文档。
- **下一步**：继续改造清单尚未完成的 B8 写入结果恢复和 B4/B5 页面验收；Android 原生专项后置。

## 2026-10-26 清单 B8 + B4/B5：备份恢复与内容洞察验收（v9.4.0）

- **改造内容**：备份创建新增 UUID 请求关联。服务端在现有备份锁内查找同一操作者/请求编号的原备份并返回原结果；文件名仅含请求编号摘要，不增加数据库回执。新增只读状态接口，返回已创建、处理中或未找到，不暴露绝对路径，所有响应禁止缓存。旧客户端不带编号的创建请求保持原响应和行为。
- **前端恢复**：备份管理与系统设置共用账号隔离的 sessionStorage 恢复标记；创建前先持久化编号，响应不明后只读查询。刷新会自动恢复核实；请求处理中或查询不可用时保持写锁，明确未找到后才允许用户使用同一编号重试。
- **权限与数据**：新状态读取继续要求 `system:backup`，不扩大查看/创建权限；没有数据库迁移。幂等回归只在临时 SQLite 库创建备份，未访问或写入真实业务数据库。
- **接口文档**：同步 API 合同与 OpenAPI，说明旧客户端兼容、文件保留期间的幂等范围、状态读取和 no-store。
- **B4/B5 内容洞察**：协作文档选择框增加可访问名称；表格固定列宽比例并允许单元格换行，320/390px 内部滚动后可完整显示“判断”列，1440px 桌面所有列直接可见，页面本身不横向溢出。新增 320/390px 双主题和桌面 1440px 浏览器回归。Chrome DevTools MCP 的内存夹具手工复核通过，仅有读取请求且控制台无错误。自动化浏览器 suite 未运行，Playwright MCP 返回 `Transport closed`。
- **B4/B5 团队日报首读**：初次读取且还没有日报时，用 `role="status"`/`aria-live="polite"` 播报“正在加载团队日报…”，只在成功返回空列表后显示真实空态。回归夹具挂起首个 GET 后检查加载播报与空文案互斥，再释放为空结果。Chrome DevTools MCP 手工复核通过，控制台无错误；自动化浏览器套件在 Chromium 启动阶段遇到 macOS `bootstrap_check_in` Permission denied (1100)，未进入断言。
- **报表日期口径**：用户于 2026-10-26 确认缺失/无效官方周期文件时所有周期的发布数回退窗口都包含报告当天（北京时间），日报/周报/月报为 1/7/30 日；完整官方日报仍使用平台“昨天”文件窗口。补充隔离回归覆盖无效日报文件回退到报告当天。
- **验证**：`npm run test:backup-create-recovery`、`npm run test:creator-report-publish-window`、`npm run check`、`npm run version:check`、`git diff --check`、目标 ESLint 与生产构建通过。目标 lint 0 错误、2 条 NotificationSettings hook 依赖警告；生产构建保留既有 843.50 kB Silk 分包提示。自动化浏览器与 MCP API 套件未运行。
- **依赖安全**：修复 body-parser、happy-dom、ip-address、sanitize-html、Zod/OpenAPI 与 Vite 6.x 的当前安全告警；生产依赖安全审计为零漏洞。完整依赖树剩余 3 项 Tailwind 3/PostCSS 开发工具链中危提示，自动修复需要 Tailwind 主版本升级。
- **合并批次迁移**：包含 SAFE_EXPAND 迁移 032–065，均在隔离 SQLite 测试；生产迁移受部署备份、恢复演练与迁移门禁保护。
- **影响范围**：Android 仅同步版本元数据至 90400，未构建 APK。
- **修改文件**：备份路由/锁、前端 API/恢复 hook/两个备份入口、OpenAPI、API 合同、内容洞察表格与协作文档选择器、移动工作台浏览器回归、报表回归及版本说明。
- **下一步**：继续 B8 其余结果恢复缺口与 B4/B5 全站页面验收；Android 原生专项后置。

## 2026-10-26 清单 B4/B5：移动端加载状态播报（v9.3.70）

- **改造内容**：移动首页“今日任务”和灵感数量、移动选题列表首读提示统一增加 `status`/`aria-live="polite"`，让读屏用户在数据返回前知道页面正在读取。加载完成后提示随状态消失。
- **验证**：全局类型检查、目标 ESLint、生产构建、版本一致性、更新说明治理（514 个版本）、测试入口治理（285 个文件）、Android runtime 合同与差异格式检查通过；构建保留既有 843.50 kB Silk 分包提示。Chrome DevTools MCP 的本地内存夹具延迟首页关注事项/灵感 GET 与选题 GET，辅助功能树均显示礼貌播报状态；释放请求后状态提示消失，数据正常出现。移动选题 320px 深色布局的文档宽度为 320px，控制台无错误；无业务写入。
- **浏览器套件边界**：`npm run test:mobile-work-center-browser` 在 macOS Chromium `bootstrap_check_in … Permission denied (1100)` 启动阶段退出，未进入断言；MCP 隔离页手测不计自动套件通过。真实 VoiceOver 语音仍待验收。
- **影响范围**：无 API、权限、数据库或真实业务数据变化；Android 仅同步版本元数据至 90370，未构建 APK；本地不提交、推送或部署。
- **修改文件**：`src/pages/mobile/MobileHome.tsx`、`src/pages/mobile/MobileTopics.tsx`、`tests/browser/mobile-work-center-responsive.spec.ts` 及版本/更新说明文件。
- **下一步**：继续 B4/B5 全站窄屏、主题和辅助技术验收，并收敛 B8 剩余写入恢复路径；匿名意见首次响应丢失的匿名范围与回执保留期仍等待业务规则，Android 原生专项后置。

## 2026-10-26 清单 B4/B5 续项：移动消息状态与作品详情操作（v9.3.69）

- **B5 移动消息加载状态**：首次消息读取时的提示增加礼貌播报状态语义，屏幕阅读器可识别正在同步消息。
- **B4 作品详情窄屏**：封面由固定 288px 改为小屏按内容宽度收缩，避免 320px 详情页横向溢出；正常与错误详情的“返回作品库”按钮均至少 40px 高，并沿用 Studio 圆角与色彩令牌。
- **报表日期口径补充**：用户于 2026-10-26 再次确认，缺失/无效官方周期文件时所有周期的发布数回退窗口都包含报告当天（北京时间）；日报/周报/月报分别为 1/7/30 个自然日。有效官方日报仍以平台“昨天”文件为准。隔离回归覆盖报告当天边界及无效日报文件回退。
- **验证**：`npm run check`、`npm run build`、目标 ESLint、`npm run version:check`、更新说明治理（513 个版本）、测试入口治理（285 个文件）、Android runtime 合同及 `tests/creator/douyin-report-publish-window.test.ts` 通过；构建保留既有 843.50 kB Silk 分包提示。Playwright MCP 隔离夹具在 390px 确认消息加载提示为 `role=status`/`aria-live=polite`，释放延迟 GET 后消息出现且状态消失。创作者作品详情在 320/390/1440px 的页面宽度分别为 312/382/1440px；320px 封面收缩到 238px 且不越出内容区，返回按钮 110×40px，固定导航从 y=675px 开始；错误详情触控入口 110×40px 并可返回作品库。夹具仅使用内存 API。
- **验证边界**：`npm run test:mobile-work-center-browser` 与 `npm run test:creator-works-browser` 均在 Chromium 启动阶段因 macOS `bootstrap_check_in` Permission denied (1100) 退出，未进入断言；不计自动套件通过。真实 VoiceOver 语音仍未验收。无数据库或真实业务数据写入；Android 仅同步 90369 元数据、未构建 APK；本地不提交、推送或部署。
- **下一步**：继续处理 B4/B5 剩余窄屏与辅助技术缺口，随后收敛 B8 未完成写入链路；匿名意见首次响应丢失的回执范围/保留期仍待业务口径，Android 原生专项继续后置。

## 2026-10-26 清单 B4/B5 续验：资料归档详情与创作者卡片（v9.3.68）

- **B4 资料归档详情**：只读隔离夹具在 Chrome DevTools 的 625/555/500/454/400 CSS px 视口下复核；页面无水平溢出，顶部返回入口与固定移动导航可见，400px 下正文结束后与底部导航之间留有间距。此项是 CSS 视口模拟，不代表原生浏览器缩放验收。
- **B5 创作者账号卡片**：浅/深主题截图发现窄屏下“查看作品”标签会被挤成两行。按钮现在禁止换行并保持自然宽度，玻璃信息条内缩距随视口收窄，文字区允许收缩；浏览器回归覆盖 320/390/1440 CSS px。Playwright MCP 在 320/390px 浅/深主题及 1440px 桌面视口确认标签单行、按钮留在卡片内、页面无水平溢出；截图保存在 `.playwright-mcp/creator-profile-card-fixed-{320,390}-{light,dark}.png`。隔离页面业务请求仅 GET，控制台错误/警告为 0。
- **验证与边界**：`npm run check`、目标 ESLint、`npm run build` 通过；构建仍提示既有大分包。仓库自动 Chromium suite 本轮未运行，MCP 手工页面复核不等同自动套件通过；实际 VoiceOver 播报仍未验收。本地修改，不提交、推送或部署。

## 2026-10-26 清单 B8 / B4 / B5：业务写入恢复、可访问性与报表响应式验收（v9.3.68）

- **B8 写入结果恢复**：在选题与资料创建/编辑的 058–060 基础上，新增 SAFE_EXPAND 迁移 061–065：审批流模板更新、资料分类变更、匿名意见管理的状态/回复、旧选题模板增删改、月报/年报摘要更新。各路径按操作者与请求编号记录结果，提交和回执按业务事务处理；前端在结果不明时保留原内容并先只读核实，只有确认未处理后才允许用户用同一请求编号明确重试。月/年报冲突时保留本地草稿并锁定覆盖写入。
- **B4 / B5 可访问性与主题验收**：日历日期格为有事件日期提供包含日期、事件类型和标题的屏幕阅读器描述，空日期不引用缺失描述；六类事件在 320/390/1440 CSS px 的浅/深主题下已手工检查。编辑器上下文菜单支持 Shift+F10 与 Context Menu 键，焦点可用 Tab/方向键/Escape 在操作项和颜色选项间移动。
- **报表日期口径**：用户确认所有周期都包含报告当天；缺少或无效官方周期文件时，发布作品数按北京时间自然日回退为日报 1 日、周报 7 日、月报 30 日。完整官方日报仍按平台“昨天”文件窗口；有效官方文件决定正式窗口。已采集作品数不会替代缺失的流量指标。
- **验证**：迁移 061–065 的隔离 SQLite、API/事务与恢复测试，报表窗口/统一报告回归、全局类型检查和目标 ESLint 通过。Playwright MCP 月报/年报内存夹具覆盖未提交后的同 UUID 显式重试、提交后响应丢失与刷新只读恢复、并发冲突保留草稿；年报表单在 320/390/1440 CSS px、浅/深主题检查无横向溢出。键盘流程和日历描述也通过隔离页面交互核对，未触发业务写入。完整自动 Chromium suite 未运行；实际 VoiceOver 语音播报仍待验收。
- **B4 #4 发布详情与编辑器工具栏**：隔离 Playwright/Chrome DevTools 页面在发布详情 320/390/1024/1366/1440/1920 CSS px 检查无水平溢出；桌面编辑器工具栏在 320/390/819/1024/1152/1536 CSS px 无水平溢出，窄屏保存/取消操作可见可达。1024×768 下“更多操作”菜单完整处于视口范围内。另在 Google Chrome 实际浏览器缩放 80/90/100/110/125% 验收，页面 CSS 视口约 625/555/500/454/400px，均无水平溢出，页头返回和滚动可达的“编辑剧本”可操作；125% 下保存、大小版本保存、撤销/重做与格式工具均位于视口内。取消编辑返回只读详情，夹具发布剧本写入计数为 0，应用 API 仅 GET、控制台错误为 0；原生缩放已恢复 100%。自动 Chromium suite 未运行，实际 VoiceOver 语音仍未验收。匿名用户首次提交的响应丢失恢复仍需明确匿名范围和回执保留期限。Android 原生专项后置，仅同步 90368 元数据、未构建 APK。所有迁移仅临时 SQLite 验证，无真实业务数据写入；本地修改，不提交、推送或部署。
- **B4 #4 选题列表表格**：MCP 隔离夹具在 320/390 CSS px、浅/深主题和 1440 CSS px 检查页面无横向溢出。320/390px 横向滚到表格末端时，固定操作列仍在视口内，“查看/删除”按钮均为 40×40px。320px 从固定操作列打开只读选题详情并返回成功；控制台无错误，夹具仅发起列表/详情读取请求。
- **B4 #4 复盘详情窄屏**：Chrome DevTools MCP 隔离内存夹具实测 320/390 CSS px 移动视口、浅/深主题，页面宽度均与视口一致；页头操作在 320px 浅/深及 390px 深主题可达。行动项表格滚至最右端时，固定操作列及“详情”按钮仍在视口内。详情抽屉在 320px 浅/深主题及 390px 深主题可在内容区滚到底部，操作按钮保持可见；仅打开/关闭并读取字段，没有改字段或保存。应用 API 请求为 GET、控制台错误为 0；另有 Socket.IO 轮询 POST，不属于业务写入。自动 Chromium suite 未运行。
- **B4 #4 成片制作详情原生缩放**：Chrome DevTools MCP 隔离内存夹具中使用 Google Chrome 实际 80/90/100/110/125% 浏览器缩放，均无水平溢出；返回、复制、来源大纲和批注/建议入口可在页面内到达。125% 下批注/建议滚动后可见，未遮挡固定底部导航；只读版本标识可见。应用 API 仅 GET、控制台错误为 0；Chrome 已恢复 100%，无业务写入。
- **B4 #4 拍摄详情窄屏信息栏**：Google Chrome 原生 125%（约 400 CSS px）下信息栏可展开并显示完整设备清单，位于编辑器上方且与阅读顺序一致；隔离 Chrome DevTools 页另在 320 CSS px 浅主题、390 CSS px 深主题复核该顺序，均无横向溢出；1440 CSS px 下编辑器在左、信息栏在右。收起后信息栏从可访问树移除。业务请求仅为成片详情/版本历史 GET，控制台无错误或警告；另有 Socket.IO 轮询 POST，不属于业务写入，原生缩放已恢复 100%。`npm run check`、目标 ESLint 与 `npm run build` 通过，构建保留既有 500 kB 分包提示；`npm run test:workflow-details-responsive-browser` 在 Chromium 启动前被 macOS `bootstrap_check_in` Permission denied (1100) 阻断，未进入断言。
- **B5 公告主按钮悬停**：1440 CSS px 隔离内存夹具下，“发布”按钮在浅/深主题均有悬停状态变化；白字对渐变两端对比度分别为 4.96:1/5.67:1 与 5.22:1/5.99:1。只填写未提交本地表单，应用 API 仅 GET、控制台错误为 0。
- **下一步**：继续收口 B4 剩余页面、B5 未验收交互与真实 VoiceOver 语音验收；匿名反馈首次提交响应丢失仍需明确匿名范围与回执保留期限。B4 全站审查、清单其它事项继续，Android 原生专项后置。

## 2026-10-24 清单 B8：桌面消息批量已读结果恢复（v9.3.67）

- **写入恢复**：桌面“全部已读”调用既有服务端幂等回执接口；写前按操作者保存 UUID。POST 结果不明时只读查状态；只有服务端明确 `not_found` 后，才向用户提供同 UUID 显式重试。`processed` 仅清除该操作者恢复标记并重读权威消息列表；核实失败时保留标记并锁住写入。账号切换后忽略旧请求的结果和通知。服务端仍以写入时事务实际命中的未读消息为准，因此提交后到达的新消息不被旧请求误标。
- **边界**：桌面沿用移动端既有合同、`message_read_all_request_keys` 与 `GET /messages/read-all-requests/:requestId`；没有新增 API、迁移或权限扩张。没有真实账号、生产 API 或业务数据库写入；Android 仅同步 90367 元数据，未构建 APK。本地不提交、推送或部署。
- **验证**：`npm run test:message-pagination`、目标 ESLint、`npm run check -- --pretty false`、`npm run version:check`、`npm run test:version-governance`、`npm run test:changelog-governance`（511 个版本）、`npm run test:entrypoints`（271 个文件）、`npm run test:android-runtime`、`npm run build` 和 `git diff --check` 均通过。构建保留既有 843.50 kB Silk 分包提示。桌面 Playwright 回归新增失败、显式同编号重试、提交后响应丢失、恢复读取失败、刷新恢复和账号切换迟到响应隔离场景；`npm run test:mobile-work-center-browser` 在 Chromium 启动阶段因 macOS `bootstrap_check_in … Permission denied (1100)` 退出，未进入任何测试断言。Playwright MCP 本地内存夹具手工验证了 POST 提交后响应丢失、首次状态 GET 失败、刷新后状态 GET 返回 `processed`，两条原消息已读且提交后新消息保持未读；夹具注入的 503 是预期故障，不等于完整 suite 通过。
- **下一步**：继续审计并补齐 B8 未完成写入路径，同时推进 B4/B5 全站验收和依赖业务口径的 G 项；Android 原生专项后置。

## 2026-10-24 清单 P2-1 / B5 / B8 / 创作者报告：覆盖摘要、语义色、删除恢复与北京时间发布数（v9.3.66）

- **P2-1 主题资产覆盖摘要**：`GET /api/resource-center/content-topics` 返回当前账号可见选题总数，以及城市/人物/项目各自有明确登记的去重选题数。统计使用现有可见范围，不受主题维度或关键词筛选影响；多条同类值只计一次，不把未登记等同错误/质量分。前端显示只读摘要，账号切换时丢弃迟到响应。隔离 API 覆盖重复值、隐藏选题、未登记主题和筛选稳定性。
- **B5 日历事件语义**：月格“会议”使用 primary 语义色，“其他”保持中性色；手机端六种事件标记使用已有高对比令牌。静态契约覆盖六种映射和浅/深主题前景对比度；发现并修复浅色主题发布标记低于 3:1。浏览器夹具增加 320/390/桌面及双主题检查，但本机 Chromium 未能启动，不能称该矩阵已实测。
- **B8 公告删除恢复**：删除前把操作者与公告 ID 持久化到会话存储；网络、408、429、5xx 或响应解析不明时仅执行 no-store 公告列表 GET。公告仍存在时要求用户重新确认，缺席时不归因于本次请求且不自动重试；核实失败/恢复标记异常时继续锁定写入，刷新后仍只读核实。未改服务端 DELETE 行为或权限。
- **抖音报告发布数**：有效官方窗口仍以其已校验的文件日期为准；窗口缺失或无效时，日报计昨天，周报/月报计含当前北京时间日期的连续 7/30 个自然日。发布数来自已采集并去重作品，公开窗口首尾；官方流量数据仍标记缺失，不使用发布数代替。统一报告生成时刻作为窗口锚点；作品发布时间去重键与窗口筛选均使用共享 BJT 解析。隔离 SQLite 覆盖窗口边界、旧快照不锚定、naive 时间和 UTC/纽约/东京 TZ 一致。
- **口径确认**：用户于 2026-10-24 明确确认，缺少有效官方周期文件时，发布数仍按对应报告周期的北京时间自然日统计；日报使用昨天，周报/月报包含当天。既有隔离 SQLite 回归已覆盖该规则，因此本次只补记决策，不改变实现。
- **验证结果**：`test:content-topic-assets`、日历静态对比度契约、公告客户端合同、发布数隔离 SQLite、canonical 去重、官方日指标（3/3）、统一抖音报告、`npm run check`、目标 ESLint、`npm run version:check`、版本治理、更新说明治理（510 个版本）、测试入口治理（271 个文件）、Android runtime 合同和 `npm run build` 通过；目标 ESLint 0 错误，canonical 测试有 5 条既有 `any` 警告；构建保留既有 843.50 kB Silk 分包提示。公告/日历 Playwright suite 在 macOS Chromium `bootstrap_check_in` Permission denied (1100) 处退出，未进入断言；MCP profile 被占用未操作共享浏览器，浏览器断言不计通过。
- **影响边界**：无数据库迁移、无持久业务数据写入、无 Android APK 构建；Android 仅同步版本元数据 90366。本地修改，不提交、推送或部署。P2-1、B5、B8及清单其它事项仍继续，Android 原生专项后置。

## 2026-10-24 清单 P2-1 / B8 / B5：稿件来源资产、创作交接核实与日历语义色（v9.3.65）

- **P2-1 主题资产**：资产 API 读取当前选题最新正式稿件正文，仅识别编辑器标准格式的 `/asset-center/resources/{id}` 且链接文字以“来源：”开头的引用；合并去重后仍按当前用户资料权限过滤，并排除删除资料。主题卡片单列“当前稿件正文引用”，可直达资料详情。没有解析资料草稿、普通链接或历史稿件内容；历史记录缺少可证明的当时选题归属，因此不从历史版本猜测关联。
- **B8 开始创作交接**：获批选题执行阶段变更前先 GET 核对服务端状态；POST 结果异常后只读核实，确认服务端已进入创作才继续查找或创建稿件。若仍为已通过，则本次不查/建，要求用户明确重试；若核实不可用或状态发生变化则停止，不自动重放变更。桌面和移动详情均接入该只读核实依赖。
- **B8 成片剧本保存**：写版本前持久化本次正文、版本动作和服务端基线；PUT 结果不明时并行只读核对成片详情与版本历史。确认已提交则读回服务器内容且不重复建版；确认未变化则保留原草稿并要求用户明确重试；读取失败期间锁定编辑、版本、状态和归档写入，刷新后继续核实。
- **P2-1 主题维度结果恢复**：主题资产卡片和选题详情面板对网络、408、429、5xx 结果不明只发 GET 核实，不自动重发。先持久化账号/选题/操作恢复标记；主题资产卡片的写锁跨搜索筛选卸载与页面刷新保留，核实 GET 失败时只提供只读核实，确认缺席后才允许用户明确重新操作。当前已有复合唯一索引，未改服务端写路径。
- **B5 日历语义色**：新增静态契约测试，锁定六类事件与 StatusPill / 桌面 token 映射，并将 CSS 颜色合成后计算浅、深主题多种候选表面上的文本对比度（至少 4.5:1）。这仅验证当前令牌映射，不代替浏览器逐类主题/视口实测；会议与“其他”当前使用中性徽标，语义区分仍是后续评估项。
- **测试结果**：主题资产隔离 API 聚合/权限/去重测试、维度恢复组件测试、`tests/topics/topic-production-handoff.test.ts` 7/7、日历语义色契约、全局类型、相关文件 ESLint、`npm run build` 与 `git diff --check` 通过。生产构建保留既有 843.50 kB Silk 分包提示。隔离 Playwright MCP 对主题维度模拟“服务端提交、POST 响应丢失、首次 GET 失败、筛选卸载、刷新恢复、手动 GET”流程通过，写请求计数为 1；成片剧本专用恢复场景也通过。仓库 Chromium `bootstrap_check_in` Permission denied (1100) 阻止独立浏览器套件启动，完整响应式矩阵和日历六类徽标实际视口矩阵仍未完成。
- **版本/发布**：Android runtime 合同通过。Android build-output endpoint 检查因缺少专用构建生成的 `dist/xmt-mobile-build.json` 未能执行；按 Android 专项后置约定未启动移动构建，也未构建 APK，仅同步版本元数据至 90365。无数据库迁移或真实业务数据写入。仅本地修改，不提交、推送或部署。
- **下一步**：补齐日历六类徽标在浅/深主题与 320/390/桌面下的浏览器实测；继续 B8 其它业务写入结果恢复链路与 P2-1 结构化资料覆盖/数据质量审查；按改造清单推进其余未关闭项，Android 原生专项后置。

## 2026-10-24 清单 B4 #4 / B5 / 抖音逐条编辑范围：窄栏表单与关联默认值收口（v9.3.64）

- **B4 #4 复盘行动项表单**：原 `lg:` 五列根据视口宽度启用，但实际表单位于较窄的复盘内容列，导致标题/说明输入区只剩约 29px。改为 `repeat(auto-fit,minmax(12rem,1fr))` 随真实容器宽度排列，并增加标题/说明至少 160px 的响应式回归断言。原生 Chrome 在本机 100% 缩放下目视确认布局已恢复；隔离 Chrome DevTools MCP 在 1440 CSS px 测得两个字段各 221px，在 1024 CSS px 测得各 209px，两个视口均无页面横向溢出。只聚焦空字段，未新增或保存行动项。
- **抖音逐条编辑权限**：只读审计确认批量刷新路由与两种 Agent 同步入口当前都按记录范围筛选，但服务函数参数缺省时默认为全库。现在服务必须显式指定 `scope: 'all'` 或 `scope: 'editable'`；逐条范围同时限制选题创建人、负责人或发布操作人。全局编辑角色由路由显式传全库范围；legacy 与 contract 同步入口显式传绑定 Agent 用户。调用者遗漏范围时服务层立即拒绝。测试增加缺范围 fail-closed 断言，现有 director 范围/越权/管理员全库断言保留。
- **官方日期规则**：审计确认已实现 Asia/Shanghai 自然日，昨天为采集日前一日，近 7/30 天包含采集日；边界、日期连续性、未来日和报告周期测试已覆盖。用户确认的日期口径与现有实现一致。本轮没有改动日期算法。另有一项报告发布数量在缺少官方周期/存在旧快照时的回退口径尚未从数据合同确认，本版保持现有行为，不作假设性改写。
- **B5 hover 验收**：此前尚未单独确认的六个主操作已在浅/深主题 Chrome 页面手工悬停验收；没有点击或提交业务操作。
- **测试结果**：`npm run test:publishing-douyin-link`、`npx tsx tests/creator/official-daily-calculation.test.ts`（3/3）、`npm run test:creator-unified-reports` 和 `npm run test:official-export-v2` 通过；目标 ESLint 0 错误，`workflow.ts` 有 12 条既有警告。`npm run check`、`npm run version:check`、更新说明治理（508 个版本）、测试入口检查（270 个文件）、Android runtime contract、`npm run build` 与 `git diff --check` 均通过，构建保留既有大分包提示。仓库 Playwright 浏览器测试本轮实际尝试启动，但 Chromium 在 `bootstrap_check_in` 遇 Permission denied (1100)，未进入断言；DevTools/原生 Chrome 是独立的隔离页面实测。
- 无数据库迁移或持久业务数据写入；测试使用隔离临时数据库/内存夹具。Android 仅同步 90364 元数据、未构建 APK；本地不提交、推送或部署。

## 2026-10-24 清单 B4 #4 / B5：复盘详情响应式与全站主操作 hover（v9.3.63）

- **B4 #4 PublishingDetail**：隔离内存夹具在 1024/1366/1440/1920 CSS px 宽度下均无页面横向溢出。1024px 下进入剧本编辑后，编辑器、取消/保存/小版本/大版本操作均可见；只点“编辑剧本”与“取消”，前后脚本写入计数均为 0。Chrome 控制台 error/warning 均为 0。
- **B4 #4 RetrospectiveDetail**：Chrome DevTools MCP 在隔离内存夹具下检查 1024/1366/1440/1920 CSS px。四档 `documentElement.scrollWidth === clientWidth`；页头返回/导出/打印/刷新按钮均位于主内容内且不重叠；1024px 为单栏，1366px 起为主内容 + 360px 发布/归档侧栏。行动项表格保持内部横向滚动，操作列在 scrollLeft=0 和最大 scrollLeft 时均保持 sticky 并位于滚动视口边界内。视觉截图确认 1024px 页头自然换行、1440px 右侧发布/归档卡片完整可见。控制台 error/warning 为 0；网络仅读取夹具 API，另有 Socket.IO 传输握手，没有业务 API 写入。只调整视口并对表格容器执行程序化滚动，未填写、保存、发布、归档或编辑。
- **B5 hover 同色**：11 个主操作使用 `.xmt-btn-primary` token 规则替代默认/hover 同色 Tailwind 类：内容实验室五项、NotFound、AccessDeniedState、AnnouncementBoard、TopicDetail 两项及 AddTopic；保留原生按钮结构、handlers、权限和只读语义。Chrome DevTools MCP 的隔离内存夹具在浅/深主题逐项悬停核验覆盖内容实验室五项，均观察到渐变背景变化；另外六项沿用同一 token，未单独浏览器验收。未点击业务操作，未观察到控制台错误。
- **回归和边界**：仓库浏览器测试增加五面板 × 双主题 hover 背景差异断言，并监听 POST/PUT/PATCH/DELETE 确认 hover 不发业务写请求；复盘详情测试矩阵扩展到 320/390/1024/1366/1440/1920，断言页头动作、单双栏、无横向溢出和 sticky 操作列两端可视。实际执行 `npm run test:retro-action-table-responsive-browser` 时，`chromium.launch()` 在 macOS `bootstrap_check_in … Permission denied (1100)` 退出，新增断言未运行、不计自动化通过；Chrome DevTools 手工复核为独立证据。无数据库变更或业务 API 写入；Android 仅同步 90363 元数据、未构建 APK；本地不提交、推送或部署。
- **门禁**：定向 ESLint、`npm run check`、`npm run version:check`、版本治理、更新说明治理（507 个版本）、测试入口治理（270 个文件）、Android runtime 合同、`npm run build`、`git diff --check` 均通过；构建保留既有大分包提示。仓库 Playwright 浏览器测试因 Chromium 启动权限未进入断言，不计通过。
- **下一步**：继续清单 B4 #4 其它页面；补做另外六处主操作的双主题 hover 实测，并继续 B5 全站主题/无障碍审查；当前 B4/B5 均未关闭，Android 原生专项仍后置。

## 2026-10-24 清单 B4/B5：日历月份播报与 Chrome 原生缩放复核（v9.3.62）

- **日历无障碍**：日历可视月份改为单一 `role="status"`、`aria-live="polite"`、`aria-atomic="true"` 区域。月份切换仍由原按钮驱动，不移动焦点；只播报新的月份标签，不把整段页面标题或日程列表设为 live region。月份请求、权限、日程和写入逻辑均未改变。
- **回归覆盖**：日历浏览器脚本已补充初始月份语义、上一月/当前月更新和唯一播报区域断言，并添加进入 12 月、跨到次年 1 月、返回 12 月后恢复初始月份的执行路径；因浏览器启动权限阻断，新增仓库断言未实际运行。
- **B4 #4 原生 Chrome 缩放验收**：续测选题列表 80%/90%/100%/110%/125%，固定“查看/删除”操作保持可见，125% 查看能进入隔离详情、删除确认可取消。创作详情页在真实 Chrome 原生缩放 80%/90%/100%/110%/125% 全档检查主操作按钮、编辑工具栏、文字颜色弹层、版本历史和版本操作区：110%/125% 主操作换行但仍完整可见；125% 下滚后工具栏/版本操作均可达，调色板留在编辑内容区；100% 下重开调色板亦完整落在内容区，没有被固定侧栏遮挡。未选择颜色、未保存/提交/删除。
- **B4 #4 物理视口矩阵补测**：ProductionDetail 与 TopicDetail 均在独立内存 QA 页以 1024/1366/1440/1920 CSS px 初始宽度重新挂载。页面、正文及主滚动区没有横向溢出；TopicDetail 的返回、进入创作、编辑选题、关联资料、维度登记、补齐阶段记录和查看资料等操作滚动后都完整落在主内容边界内。真实 Chrome 中另将 TopicDetail 原生缩放调到 80%/90%/100%/110%/125%：各档操作区均可滚动到达并保持完整；125% 的维度选择菜单列出“城市/人物/项目”，以 Esc 关闭且值仍为“城市”。只读检查，没有点写入/编辑/阶段操作；隔离夹具完全在内存中。Chrome 100% 已恢复，本轮临时页已关闭，原抖音标签保留。
- **B4 #4 成片制作详情视口补测**：独立内存夹具在 1024/1366/1440/1920 CSS px 宽度下均无页面横向溢出；1024px 下编辑工具栏自然分两行，仍可见，返回/小版本保存/大版本保存/信息栏/完成制作操作均未被裁切。Playwright MCP 在 `http://127.0.0.1:58126/shooting/9832` 确认页面非空、1024×768 下文档与正文宽度均为 1024、主操作处于视口内，控制台 error/warning 均为 0；信息栏展开后可正常收起复位。截图保存在本机临时 Playwright 输出目录。只切换界面信息栏状态，未触发保存或完成操作；关闭临时页并停止内存夹具。
- **验证与限制**：目标 ESLint、`npm run check`、日历权限测试、日历幂等迁移隔离库测试、版本检查/治理、更新说明唯一性（506 个版本）、测试入口治理（270 个文件）、Android runtime 合同及 `npm run build` 通过；日历 DB 测试仅使用各自临时目录中的隔离 SQLite。构建保留既有大分包提示。Chrome DevTools MCP 连接本机隔离内存日历夹具，辅助功能树显示 `status atomic live="polite"`，并实际观察 2026 年 10 月→11 月→12 月→2027 年 1 月状态文本更新。仓库 `npm run test:calendar-month-race-browser`、Topics suite 和本轮 `npm run test:production-review-browser` 均在断言前因 macOS Chromium `bootstrap_check_in … Permission denied (1100)` 无法启动，未执行测试体；MCP/原生 Chrome 手工检查不计作 Playwright suite 通过，也没有完成 VoiceOver 语音验收。
- **文件/数据/发布**：更新 `src/pages/Calendar.tsx`、`tests/browser/calendar-month-request-race.spec.ts` 及版本、更新说明和阶段文档。无迁移、无真实 API/业务数据库和业务数据写入。Android 仅同步版本元数据 90362，未构建 APK。本地修改，不提交、推送或部署。
- **下一步**：继续 B4 #4 其它优先页面的真实窗口/缩放矩阵，补做日历 VoiceOver 实际播报验收，并继续清单 B4/B5 其它全站主题/无障碍项目；Android 原生专项仍后置。

## 2026-10-24 清单 B4/B5：日报审核只读与移动端恢复闭环（v9.3.61）

- **日报状态**：提交态在审核完成前只读，编辑器、草稿保存和再次提交均禁用；草稿/退回状态仍可编辑。按较新的桌面/移动 UI 验收基线收口，不改变旧服务端接口兼容合同。
- **工作流反馈**：成片制作完成请求先失败、只读核实后若用户明确重新确认，清除过期的上一轮状态提示；确认结果未知时仍保留锁定和只读核实路径，不自动重放。
- **浏览器验收与夹具**：移动工作台完整 Playwright 浏览器回归在 320px、390px 均通过，并覆盖桌面消息分页/读写恢复、清空恢复、账号隔离、人员删除显式同编号重试、主题内容资产及成片制作状态处理。日报提交恢复专用 Playwright 浏览器套件也通过，覆盖已提交只读、写入等待期间禁用刷新/核实、响应丢失后的状态恢复、账号切换迟到成功/失败隔离，以及桌面/移动日报归档详情。修正了测试夹具中 actor ID、状态查询路径、资源关联字段、分页总量、动态按钮名称和受控并发响应对当前接口契约的偏差。
- **B4 #4 原生 Chrome 缩放验收（选题列表）**：使用 Chrome 桌面菜单/快捷键原生缩放，在当前桌面窗口依次实测 80%、90%、100%、110%、125%。各档固定“查看/删除”操作列均留在可视区；110%/125% 下“进入创作”不与固定列重叠，125% 下查看操作可打开详情、删除操作可打开确认框，取消后隔离选题仍存在。表格其余字段在窄有效视口内可横向滚动，固定操作列仍可见。该手工检查未更改 Chrome 缩放，最后恢复至 100%。测试仅访问本机内存 Express/Vite 夹具，不访问生产 API 或业务数据库。夹具没有 `production_id`，故“进入创作”虽能命中但落到 `/production/undefined` 并显示“创作记录不存在”；该流转不计通过，也不判为产品缺陷。
- **验证**：日报状态单测、日报提交恢复浏览器套件、目标 ESLint、320px/390px 移动工作台全流程、`npm run check`、版本检查/治理、变更日志治理（505 个版本）、测试入口检查（270 个文件）、Android runtime 合同及 `npm run build` 均通过。构建保留既有大分包提示；`git diff --check` 通过。
- **浏览器执行边界**：本轮额外尝试 `npm run test:topics-responsive-browser`，Playwright Chromium 在启动阶段因 macOS `bootstrap_check_in org.chromium.Chromium.MachPortRendezvousServer … Permission denied (1100)` 退出，未进入测试断言。原生 Chrome 手工验收是独立证据，不替代该自动套件；当前 B4 #4 其余优先页面和完整跨物理窗口宽度矩阵仍未关闭。
- **数据库/发布**：无数据库迁移或业务数据写入。Android 仅同步版本元数据 90361，未构建 APK；本地保留修改，不提交、推送或部署。
- **下一步**：继续 B4/B5 全站主题与无障碍验收及改造清单剩余项；Android 原生专项后置。

## 2026-10-24 清单 B8：幂等回执保留证据盘点（v9.3.60）

- **评估结论**：当前请求恢复标记没有最长期限；不同服务写入的 `created_at` 可能分别采用 SQLite UTC 默认值或北京时间无时区文本。若删掉已处理回执，状态查询会把旧请求误报为 `not_found`，前端因此开放同编号重试；不能在缺少期限与统一时区语义的情况下自行设定 TTL。
- **本地工具**：新增 `node scripts/idempotency-receipt-inventory.mjs --db <existing-local-database-file>`，必须显式指定已存在的本地 DB 文件，并通过 `sqlite3 -readonly` 打开。仅扫描 `*_request_keys` 表及 `inspiration_comments` 中非空 `client_request_id` 行，输出表名、数量和 `created_at` 原始最小/最大值；不输出请求键、账号、指纹、评论或业务正文。异常表结构 fail-closed，不含任何 DELETE/迁移操作。
- **验证**：`npm run test:idempotency-receipt-inventory` 使用临时隔离 DB 验证表范围、统计值、业务字段脱敏、显式路径、异常结构拒绝和盘点前后数据库文件字节一致。`npm run check`、目标 ESLint、`npm run test:entrypoints`、版本检查/治理、`git diff --check` 和 `npm run build` 通过；构建保留既有大分包提示。没有对真实 DB 运行盘点。
- **数据库/风险**：无 migration、无业务数据变更、无自动清理。时间原值故意不换算成“年龄”，避免混合时区误导；盘点数据只能用于容量观察，不足以证明客户端最大延迟重试窗口。Android 仅同步 9.3.60/90360 元数据，未构建 APK。本地不提交、推送或部署。
- **下一步**：继续观测回执数量趋势，并收集客户端恢复标记的真实最长存活与旧客户端支持边界；确定时间统一/恢复期限之前保持回执不删。然后继续 B4/B5 全站验收及清单剩余项，Android 原生专项后置。

## 2026-10-24 清单 B8/B4/B5：复盘标题与结论的原子更新恢复（v9.3.59）

- **服务端写入合同**：`PUT /api/retrospectives/:id` 继续兼容不带请求编号的旧客户端；新客户端附带 UUID `X-Idempotency-Key` 与写前版本。回执按操作者/复盘/请求编号隔离，指纹根据实际提供字段和版本生成，因此字段缺省的相同请求不会受后续数据变化影响。版本比较、复盘更新、审计事件和 `processed/conflict` 回执在同一事务内完成；陈旧版本不覆盖新数据并返回 `409 VERSION_CONFLICT`。
- **只读核实与前端恢复**：新增 `GET /api/retrospectives/:id/update-requests/:requestId`，认证后仅返回 `processed/not_found/conflict`，按操作者与复盘隔离，使用 `Cache-Control: no-store`，不返回复盘正文。请求前先在 sessionStorage 保存原请求；响应未知/刷新后只读核实且绝不自动重放。只有明确 `not_found` 才显示同编号显式重试。确认冲突时并列保留本地提交内容与服务器当前内容；用户确认修改后以新 UUID 保存。冲突草稿的本地记录写入失败时可点击“重试保存恢复记录”，成功后才解锁编辑。
- **B8/B4/B5 相邻修复**：日报风险转行动项将“数据读取中”与“写入锁定”分开，创建结果待确认时保留但禁用风险来源及表单；失败时草稿保留，明确同编号重试成功后清空。风险来源、行动项标题、负责人、截止日期控件提供稳定可访问名称；成功重试也清除来源选择。
- **迁移与保留**：新增 SAFE_EXPAND 迁移 057，仅增加 `retrospective_update_request_keys` 回执表；列、非空/default、主键和 outcome CHECK 都经验证。只在临时隔离数据库测试，真实数据库未迁移。回执暂未配置自动清理策略，后续应基于延迟重试证据确定保留期限。
- **通过**：`npm run test:retrospective-update-idempotency`、`npm run test:retrospective-update-idempotency-migration`、`npm run test:migration-readiness`、`npm run check`、目标 ESLint、`npm run test:retro-action-table-responsive-browser`、`npm run build` 与版本/变更说明治理均通过。浏览器回归覆盖 503 前提交后的同 key 重试、提交成功但响应丢失后的刷新只读核实、409 冲突草稿/新 key、sessionStorage 失败恢复、原有行动项与日报风险转化响应式流程。构建保留既有大分包提示。
- 无真实数据库、业务账号或业务数据写入。Android 仅同步 `versionName 9.3.59` / `versionCode 90359`，未构建 APK。本地不提交、推送或部署。B8 回执保留策略、B4/B5 全站审计及清单其它剩余项继续；Android 原生专项仍后置。

## 2026-10-24 清单 B8：复盘行动项更新的并发保护与结果恢复（v9.3.58）

- **服务端写入合同**：新客户端为每次编辑生成 UUID；服务端按操作者、行动项与请求编号隔离回执，并以状态、标题、说明、负责人、截止日、结果和关闭时间组成的完整写前快照执行 compare-and-swap。行动项、审计事件和成功回执同事务提交。若整行已变化，服务端保留已处理的冲突回执并返回 409，不覆盖他人内容、不伪写成功审计/通知；旧客户端省略编号仍兼容，但并发陈旧写现在同样收到 409。
- **前端结果恢复**：发送前先在 sessionStorage 保存原请求标记；响应未知/刷新后只读核实，不自动重放。只有状态端点明确返回 `not_found` 时，用户才可用同一编号、同一载荷显式重试。确定冲突时保留草稿与服务器最新值供比较，用户再次确认编辑保存时使用新 UUID。会话存储不可用时阻止发送写请求。
- **迁移与保留**：新增 SAFE_EXPAND 迁移 055（请求回执）和 056（processed/conflict 最终结果）；保留 055 原校验和，仅添加后续迁移。两者的 schema/readiness 行为在隔离临时数据库检查，真实数据库未迁移、未回填。回执目前没有自动清理策略，需监控长期增长并在后续决定有证据支持的保留窗口。
- **通过**：`npx tsx tests/analytics/retro-action-update-idempotency-http.test.ts`、`npx tsx tests/database/retro-action-update-outcome-migration.test.ts`、`npm run test:migration-readiness`；UI 报告 `npm run check`、目标 ESLint、`npm run build`、版本/变更记录治理通过。核心浏览器路径由 Playwright MCP/Chrome DevTools MCP 隔离夹具实测：409 后本地草稿与服务器当前值同时显示；刷新仅发 detail/risk/status 等 GET、没有 PATCH；用户显式确认后生成新 UUID 并只发一次 PATCH。390px 无横向溢出，1440×900 冲突对照可读；截图证据保存在 `.playwright-mcp/page-2026-10-24T03-14-16-466Z.png`。
- **未通过/未闭环**：此前一次 `npm run test:retro-action-table-responsive-browser` 执行了行动项 PATCH/结果恢复断言，但在 `tests/browser/retro-action-table-responsive.spec.ts:1294` 的“离开未保存复盘结论时应同时提示未保存与复制保留”断言失败。最新复跑在 Playwright Chromium 启动阶段退出：`bootstrap_check_in org.chromium.Chromium.MachPortRendezvousServer … Permission denied (1100)`，没有进入测试体。Chrome DevTools MCP 独立手工夹具中，改变结论后点返回能看到完整警告并留在原页面；这尚未解释此前 suite 未匹配到两段文字，也不能宣告自动化全绿。Browser 插件不可用，按现有授权使用 Playwright MCP 和 Chrome DevTools MCP。
- 无真实数据库、业务账号或数据写入；无生产配置改动。Android 仅同步 versionName `9.3.58` / versionCode `90358`，未构建 APK。仅本地修改，不提交、推送或部署；B8、B4/B5 与改造清单剩余项继续，Android 原生专项后置。

## 2026-10-24 清单 B4/B5：移动改密标签可访问性（v9.3.57）

- 移动“我的”→“账号安全”面板为当前密码和新密码增加持续可见的 HTML 标签并显式关联输入框；placeholder 仍保留为输入提示。密码长度校验、服务端请求与确定失败后的显式重试逻辑没有改变。
- 更新现有移动工作台浏览器回归，改用可访问名称识别两个密码输入框，并保留“无效输入不发请求、503 双击只发一次、用户明确重试后第二次成功”的断言。
- `npm run check`、目标 ESLint、`npm run version:check` 和 `git diff --check` 通过；仓库移动浏览器 suite 在启动 Chromium 时遇 macOS `bootstrap_check_in … Permission denied (1100)`，未进入断言体。Chrome DevTools MCP 独立合成夹具实测 390px 浅色与 320px 深色，辅助功能树均将两字段暴露为具名文本框，DOM `labels` 关联成立且页面无横向溢出；空字段/不足 6 位均提示校验错误、密码更新请求数为 0。未测试有效密码提交。无真实账号、数据库或业务数据访问；Android 仅同步 90357 元数据，未构建 APK。本地不提交、推送或部署。

## 2026-10-24 清单 F/H/P2-1/B8：选题交接、只读权限、内容资产与数据恢复（v9.3.56）

- **F 成片制作交接**：创作详情的“成片制作”入口携带 `topicId`；成片页只读核实选题后打开原有创建表单并预填，不在跳转时创建记录。无可关联选题时不触发写入，原服务端创建权限保持不变。
- **H 创作只读说明**：正文编辑入口统一要求 API 返回 `can_edit`、`production:update`、当前版本且未被协作新版本替代。只读详情依据当前权限/范围/历史版本说明原因；保存方式不再将只读稿件描述为协同自动保存。API 不以 `approved` 或 `review` 状态本身禁止编辑，因此未自行增加状态限制。
- **P2-1 主题内容资产**：主题卡片新增当前账号可访问、去重后的正式关联资料列表与详情链接。继续沿用既有资源可见范围，排除私密越权项和已删除项；未推断历史关联、不新增写入或迁移。
- **Creator Analytics 日期边界**：旧 `/api/creator-agent/data` 与作品趋势路径统一使用 7/30/90 个完整北京时间自然日闭区间（含当天、排除未来日）；发布计数、账号快照和作品趋势都遵循相同边界。没有两条窗口内可比较的有效粉丝观测时 `fan_growth_rate` 为 `null`，缺失历史不补零或外推。官方导入与抖音逐条编辑权限仅复核，沿用用户确认规则。
- **B8 日报草稿恢复**：网络/超时/5xx 后保存原请求和写前快照，锁定编辑及重复提交，通过当前用户、北京时间日期的只读 `/me` 读取核实。服务器状态匹配本次完整草稿时确认已保存；仍与写前快照一致才允许同载荷显式重试；不同内容继续锁定并保留本地输入。确定的 400/401/403/409 保留原错误，不伪装成成功。未改日报服务端契约或旧客户端。
- 隔离回归通过：主题资产聚合/权限、Creator Analytics 北京日期窗口与 TZ 不变性、日报权限/审计原子性/恢复逻辑、选题交接流程、稿件审核线程/只读动作合同、灵感投票事务与迁移、官方数据窗口/统一报告、抖音关联权限；全局 `npm run check` 通过。目标 ESLint 和差异格式检查通过。
- 浏览器脚本已补充选题预填/零写入、主题资料直达/窄屏、日报响应丢失刷新恢复、只读稿件权限与保存说明用例；本轮仓库 Chromium 都在启动阶段因 macOS `bootstrap_check_in … Permission denied (1100)` 退出，未进入断言体。Playwright MCP 与 Chrome DevTools MCP 默认 profile 均被其他进程占用，本轮未抢占或关闭共享实例，不计浏览器验收通过。
- 本轮无数据库迁移、无真实业务数据/账号读写。Android 仅同步 90356 Gradle 版本元数据、未构建 APK；本地不提交、推送或部署。后续继续清单剩余 B8 写入恢复、B4/B5 全站视觉/无障碍验收与 P2-1 历史资料/真实覆盖率边界；Android 原生专项后置。

## 2026-10-24 清单 B8：灵感点赞结果安全恢复（v9.3.55）

- 灵感点赞/取消点赞改为新客户端携带操作者隔离 UUID 与明确目标状态；服务端投票和请求回执原子提交，重复请求不再切换状态。保留无请求体旧客户端 toggle 路径。
- 新增 SAFE_EXPAND 迁移 054。结果查询按当前操作者隔离并设置 `no-store`；前端在 sessionStorage 按账号/灵感保存请求编号，刷新后只读核实，明确未提交且详情可读取时才允许沿用同编号安全重试。迟到的旧账号响应不会污染当前账号。迁移不回填历史数据；回执暂不自动清理以避免延迟重试重新执行。
- 通过：`npm run test:inspiration-mutations-atomic`（同键并发、后续状态变化、跨操作者隔离、事务回滚、删除墓碑）、`npm run test:inspiration-vote-idempotency-migration`、`npm run test:migration-readiness`、`npm run check`、目标 ESLint、`npm run build`、`npm run version:check`、版本/changelog 治理、测试入口、Studio token、Android runtime 合同检查与 `git diff --check`。全仓 `npm run lint` 为 0 errors、286 warnings；本次触及文件的定向 ESLint 无告警。构建保留既有 >500 kB 分包提示。仓库 `npm run test:inspiration-theme-contrast-browser` 在 Chromium 启动阶段因 macOS `bootstrap_check_in … Permission denied (1100)` 退出，未进入测试断言，不计通过；Playwright MCP 只读打开的已有 localhost 应用来自旧/不同源码状态，缺少新导出并显示模块错误；确认服务返回旧模块后关闭新增标签页，未点点赞、未触发业务写入。刷新恢复 UI 用例已加入但仍需在与当前工作区一致且可用的浏览器环境执行。生产数据库/真实业务账号未触及。
- Android 仅同步 Gradle 版本元数据至 9.3.55/90355，未构建 APK；本地不提交、推送或部署。继续 B8 其余写入结果恢复、B4/B5 全站验收和清单其他未完成项；Android 原生专项后置。

## 2026-10-24 清单 B8：Creator Agent 绑定凭据响应恢复（v9.3.54）

- `/api/creator-agent/bind` 新客户端提交 UUID 与独立 32 字节恢复能力；两者均须匹配请求载荷，只有 UUID、错误 secret 或变更设备信息均不能取回 token。服务端以 AES-256-GCM 暂存最多 24 小时并为 bind/ack 返回 `no-store`。旧客户端省略字段时保持原合同。
- Electron 在网络请求前先用 safeStorage 加密落盘服务器、一次性绑定码、设备与恢复能力；同一绑定操作重试复用原编号和 secret。凭据及配置持久化后，本地标记移除绑定码并只保留确认材料。确认可幂等重试，确认后服务端清除密文；过期回执按终态拒绝恢复。
- 已有设备重绑采用 staged credential：提交时保留原 token 与原账号；客户端确认新 token 和配置已经写入后，服务端才原子更新账号、设备信息及 token。结果账本写入失败会回滚绑定码消费和 Agent 变更；旧客户端仍走原路径。
- 新增 SAFE_EXPAND 迁移 053。通过：`npm run test:creator-agent:binding`、`npm run test:creator-agent:binding-recovery`、`npm run test:creator-agent:bind-result-recovery-migration`、`npm run test:migration-readiness`、Agent safeStorage store/client 合同测试、Agent renderer security、根/Agent 类型检查、`npm run version:check`、`npm run test:changelog-governance`、根/Agent build。定向 ESLint 0 errors、1 warning（`agent/desktop/main.ts` 中既有未使用变量）；`git diff --check` 通过。
- 测试为临时隔离数据库和本地加密 mock；没有真实 Electron safeStorage UI 流程、生产数据库或生产密钥验收。Agent v2.14.7-agent 未打包/发布。Android 仅同步 90354 元数据，未构建 APK；本地不提交、推送或部署。
- 下一步：继续清单 B8 的其他写入结果恢复及 B4/B5 全站验收；Android 原生专项仍后置。

## 2026-10-24 清单 B8：Creator Agent 绑定码结果安全恢复（v9.3.53）

- 绑定码创建增加可选 UUID `request_id` 幂等路径和 `no-store` 只读恢复端点。只在操作者、可管理抖音账号、有效期与规范化请求号一致时返回原码；空/非法请求号显式拒绝，UUID 大小写归一避免绕过幂等。旧客户端未提供字段时仍兼容原创建路径。路由复用当前 Creator 管理角色与逐账号管理范围校验。
- SAFE_EXPAND 迁移 052 新增独立恢复台账，保存请求号摘要、绑定码记录关系及 AES-256-GCM 密文；绑定码仍只存 SHA-256 摘要。专用密钥 `XMT_CREATOR_AGENT_BINDING_KEY_V1` 必须为规范 Base64 编码的 32 字节，缺失/错误/不匹配时 fail closed；不读取运行环境配置，不回退至 JWT 密钥。过期或消费时清除恢复密文，同时保留终态摘要阻止旧请求编号重新签发。
- 绑定完成改为一个数据库事务：一次性码消费、Agent 注册、账号与设备元数据更新同进退；账本写入失败会回滚消费。前端恢复标记仅存 sessionStorage，按操作者与账号分别隔离，不存绑定码；相同请求号可安全重试，刷新后先 GET 核实。账号切换/登录变更使旧请求失效，迟到响应不能污染新范围或释放新操作锁。
- 通过：`npm run test:creator-agent:binding`、`npm run test:creator-agent:binding-recovery`、`npm run test:creator-agent:binding-recovery-migration`、`npm run test:migration-readiness`、`npm run check -- --pretty false`、目标 ESLint；官方日期窗口单测（3/3）、`test:official-export-v2`、`test:creator-unified-reports`、`test:creator-dashboard-freshness`、`test:publishing-douyin-link` 通过。Playwright MCP localhost 隔离夹具中服务端先提交 POST、浏览器丢弃成功响应，再刷新经 `GET /binding-codes/requests/...` 恢复同一码；检查到 POST 只一次、sessionStorage 仅有 actor/account/request id/TTL，无明文绑定码。仓库 `npm run test:creator-topic-suggestions-browser` 在 Chromium `bootstrap_check_in … Permission denied (1100)` 处退出，未进入测试断言，不计自动化通过。
- 修改文件包括 `api/services/creatorAgent.ts`、`api/routes/creator-agent.ts`、新增 `api/database/migrations/052_creator_agent_binding_code_recovery.ts`、迁移登记、`src/api/creatorCenter.ts`、`src/pages/creator-center/CreatorDashboard.tsx`、绑定恢复与浏览器测试、Creator 数据中心说明及版本说明。迁移只跑在隔离临时数据库；未读写真实业务库、未部署或提交。
- 用户重新确认官方日期窗口统一为北京时间自然日且包含当天，抖音批量关联严格遵循逐条编辑范围；本阶段复核现有实现并重跑对应专项，未改动这两条规则。Android 仅同步 90353 Gradle 版本元数据，未构建 APK。
- 风险与下一步：真实服务启用恢复前，部署方需在受控运行时为所有 API 实例配置相同且稳定的专用密钥；v1 密钥轮换/多版本解密尚未实现，因此不得在仍有有效回执时直接轮换。`/bind` 如果设备绑定已提交但 Agent 未收到返回凭据，其凭据恢复不属于本阶段，需要独立协议/客户端改造后验证。B4/B5 全站可访问性与响应式验收、B8 其他写入边界及清单剩余项继续；Android 原生专项后置。

## 2026-10-23 清单 J2：移动 Web 创作列表服务端分页（v9.3.52）

- 移动创作列表改用既有 `getProduction({ page, limit })` 分页接口，每页 20 条，显示总数和页码，避免一次读取全部稿件。账号切换时清空旧账号列表并回到第一页；请求序号会丢弃切换前的迟到响应。当前页读取失败保留上次成功页并标出实际显示页，允许重试目标页；若列表总数缩减导致当前页越界，会在同一读取流程内重新读取最后有效页，只有新页成功后才同步页码和内容，失败则保留匹配的上次成功页，避免旧内容与新页码错配或重复读取。服务端权限范围、稿件写入和 API 均未改变。
- 新增回归覆盖 41 条合成稿件的首次分页、第二页失败与同页重试、末页只剩 1 条、总数缩减后修正页失败/重试、账号切换迟到响应及新账号请求等待期间清空旧账号内容。隔离浏览器使用本地内存 mock，不访问真实账号、API 或业务数据。
- 通过：`npm run check -- --pretty false`、定向 ESLint（0 warnings）、`npm run test:production-list-update`、`npm run version:check`、`npm run test:version-governance`、`npm run test:changelog-governance`（496 个版本）、`npm run test:entrypoints`（263 个文件）、`npm run test:android-runtime`、`npm run build` 与 `git diff --check`。生产构建保留既有大分包提示：Tiptap 555.12 kB、主入口 716.71 kB、Silk 背景适配器 843.50 kB。
- 仓库浏览器套件 `npm run test:mobile-work-center-browser` 在 Chromium `bootstrap_check_in … Permission denied (1100)` 启动错误处退出，未进入断言，不计自动化通过。Chrome DevTools MCP 独立上下文手测 320×844：合成列表 page1 首次仅返回 20/41 条；page2 首次注入 503 后保留 page1 且标明真实显示页，显式重试后 page2 返回 20 条，page3 返回最后 1 条并禁用“下一页”；请求序列为 page 1、page 2、page 2、page 3，均为只读 GET。另延迟账号甲 page2 响应并切换账号乙，乙的 page1 和页码仍保持，迟到的甲数据不显示。补充 390×844 隔离手测：末页总数从 41 缩至 20 后先读取 page 3、再校正 page 1；校正页 503 时继续显示旧 page 3 和原总数，重试成功后显示 20 条新 page 1；请求序列为 page 1、2、3、3、1、3、1，没有重复 GET；页面宽度等于 390px 视口，控制台无错误。两次 MCP 手测均不替代仓库 Playwright suite。
- 修改文件：`src/pages/mobile/MobileProduction.tsx`、`tests/browser/mobile-work-center-responsive.spec.ts` 和版本/更新说明文件；无数据库变化。Android 仅同步 Gradle 版本元数据至 9.3.52/90352，未构建 APK。保持本地修改，不提交、推送或部署。
- 下一步：继续清单 B8 尚未完成的写入结果恢复边界，并推进 B4/B5 全站响应式与主题验收；安卓原生仍留待专项。

## 2026-10-23 清单 B8：稿件批注状态安全恢复（v9.3.51）

- 稿件批注/建议的接受、拒绝和结束讨论现在支持客户端请求 UUID。SAFE_EXPAND 迁移 051 记录操作者、稿件、线程和目标状态；状态变更与回执同事务提交，同请求返回幂等成功，不同操作者/稿件/状态冲突。原权限校验、线程范围和不带 UUID 的旧客户端路径保持不变。
- 新增禁用缓存的状态核实接口。浏览器在写入前保存会话恢复标记；响应不确定时先只读核实，确认未写入后才可同编号重试。接受建议的重试只补交状态，不会再次替换正文；正文保存未确认时要求人工核对后再继续。账号/稿件切换通过恢复键隔离。
- HTTP 回归通过：并发同编号仅一条回执、相同请求重放、跨操作者隔离、目标状态冲突、原权限不被请求编号绕过、账本写入失败时状态变更回滚及同编号恢复、旧客户端不带请求编号兼容。`npm run test:migration-readiness` 与 `npm run check -- --pretty false` 通过；定向 ESLint 0 errors，workflow 路由保留 12 条既有 warnings。
- 浏览器隔离夹具由 Chrome DevTools MCP 实测两条路径：结束讨论写入后模拟响应丢失且首次状态读取失败，手动核实后显示“已结束”，状态写入 1 次、读取 2 次、恢复标记清除；接受建议同样模拟写入后响应丢失与一次读取失败，核实后显示“已采纳”，状态写入 1 次，正文保存始终 1 次，建议替换只执行一次。夹具为 localhost 进程内存 mock，没有访问真实 API、账号或数据库；注入的 503 是预期故障。
- `npm run test:production-review-browser` 因 macOS Chromium `bootstrap_check_in … Permission denied (1100)` 在启动阶段退出，未进入测试体，不计自动化 suite 通过；Chrome DevTools MCP 手测不能替代完整 Playwright 套件。迁移仅由临时隔离 HTTP 测试数据库执行，未迁移真实库；Android 仅同步 9.3.51/90351 元数据，未构建 APK。本地修改，不提交、推送或部署。
- 本阶段文件：`api/database/migrations/051_production_review_status_idempotency.ts`、迁移索引/策略、`api/services/productionReview.ts`、`api/routes/workflow.ts`、`src/api/workflow.ts`、`src/components/production/ProductionReviewPanel.tsx`、生产批注 HTTP/浏览器与迁移 readiness 测试，以及版本/更新说明文件。
- 下一步：继续清单 B8 剩余写入结果恢复边界，并处理 J2 中移动 Web 创作列表尚未接入既有分页 API 的问题；Android 原生仍按用户要求后置。

## 2026-10-23 清单 B5：活动日志动作对比度矩阵（v9.3.50）

- 扩展 `tests/browser/activity-log-read-recovery.spec.ts`：用隔离合成记录一次覆盖创建、更新、删除、登录、发布、审核、状态变更和未知动作，并验证浅色/深色主题下每个徽标的前景文字与全部祖先背景叠层组合后不低于 4.5:1。矩阵只测静态徽标，不把 hover 混入结论；未发现令牌缺陷，因此不改业务 UI 颜色。
- 通过：DevTools MCP 在独立上下文连接本地 mock 页面，直接从浏览器 computed styles 测量 8 类动作；浅色最小 6.63:1（未知动作），深色最小 11.47:1（更新）。`npm run check -- --pretty false`、目标文件 ESLint、`git diff --check`。
- 未通过/未完成：`npm run test:activity-log-browser` 在 Chromium 启动时因 macOS `bootstrap_check_in … Permission denied (1100)` 退出，测试体未运行，不能算自动化 suite 通过。DevTools 实测是隔离 mock 手测，不替代完整套件；需在 Chromium 可运行环境重跑。
- 补充 B4 工作流设计器手动验收：Chrome DevTools MCP 独立上下文连接本地内存 mock（500×824 CSS px），创建“DevTools隔离回归模板”及 1 个“内容负责人审核”节点；创建成功后的列表重新查询仍展示该模板，模板列表数据来自 mock 进程内存。页面无空白/框架错误，控制台无应用错误，文档宽度等于视口宽度；唯一业务写入是发往 localhost mock 的 `POST /api/workflow-templates` 并返回 200，未触及真实 API、账号、数据库。该操作级手测不替代 `test:workflow-designer-language-browser` 完整 Playwright 套件。
- 活动日志矩阵只读合成记录且无写操作；工作流创建仅改动隔离 mock 的进程内存，不访问真实业务 API、账号或数据库。Android 仅同步 Gradle 元数据至 9.3.50/90350，未构建 APK。本地修改，不提交、推送或部署。

## 2026-10-23 清单 B8：稿件批注/建议创建安全恢复（v9.3.49）

- `POST /workflow/production/:id/review-threads` 新增可选 UUID；线程和操作者/稿件/载荷指纹账本同事务提交。相同请求重放返回原线程，跨账号/稿件/载荷冲突拒绝；未带 UUID 的旧客户端保持兼容。SAFE_EXPAND 迁移 050 只新增账本表。
- 新增 `no-store` 状态查询。前端在当前会话保存原内容与请求号；创建结果不确定时锁定原内容，刷新后只读核实；仅确认 `not_found` 才允许同编号、同载荷显式重试。
- 通过：`npm run test:production-review`（并发同编号仅落一条、跨操作者/稿件/内容冲突、状态查询隔离和 `no-store`、账本故障时事务回滚、回滚后安全重试、版本推进后的结果重放）、`npm run test:migration-readiness`、`npm run check -- --pretty false`、相关文件 ESLint（0 errors）、`npm run version:check`、`npm run test:version-governance`、`npm run test:changelog-governance`（493 个版本）、`npm run test:entrypoints`（263 个文件）、`npm run test:android-runtime`、`npm run build` 与 `git diff --check`。构建成功；保留既有大分包提示（主入口 715.12 kB、Tiptap 555.12 kB、Silk 背景适配器 843.50 kB）。workflow 路由 lint 的 12 条 warning 是既有基线，0 errors。
- 浏览器自动化 `npm run test:production-review-browser` 未进入测试体：Chromium 在本机 `bootstrap_check_in … Permission denied (1100)` 时退出，不计 suite 通过。改用 Chrome DevTools MCP 的独立上下文访问本地 mock 夹具，手测“服务端已写入、创建响应丢失、状态查询暂时失败、刷新”路径：原文保持锁定，刷新只读核实并清除恢复标记，mock 只收到 1 次创建请求且只有 1 条线程。该验证未登录真实账号、未连接业务 API/数据库；夹具仅使用进程内存数据。
- 迁移仅由隔离 HTTP 测试运行在临时数据库中；未执行真实数据库迁移或更改业务数据。Android 仅同步 Gradle 元数据至 9.3.49/90349，未构建 APK。本地修改，不提交、推送或部署。

## 2026-10-23 清单 J6：React Bits 默认轻量（v9.3.48）

- 首次使用及“恢复默认”不再启用装饰背景和 React Bits 动效：背景、标题/数字动效、卡片效果、按钮交互与页面入场均为静态/标准配置，页面应用范围默认全关，避免默认挂载 OGL/Particles。Aurora、深空、Silk、Linear 等显式预设为原有组件、强度、动效模式和页面范围补足明确配置；保留现有 localStorage schema 和已有保存偏好，不自动迁移或覆盖。
- 新增 `tests/features/reactbits-appearance-defaults.test.ts`，覆盖首次配置、恢复默认、预设显式启用、以及从本地保存配置 hydration 时保留用户偏好。
- 通过：`npm run test:reactbits-appearance-defaults`（3 项）、`npm run check -- --pretty false`、相关文件 ESLint、`npm run version:check`、版本治理、更新说明唯一性（492 个版本）、测试入口（263 个文件）、Android runtime 合同、`npm run build` 与 `git diff --check`。构建成功；保留仓库大分包提示（主入口 714.47 kB、Tiptap 555.12 kB、Silk 背景适配器 843.50 kB）。
- Playwright MCP 在新建本地源 `http://localhost:4179/login`（该源无外观偏好存储）确认标题/登录表单正常、无 React 错误边界、Canvas=0、未加载 Aurora/Particles/OGL 背景模块；密码显隐控件切换后仍无 Canvas。截图：`.playwright-mcp/page-2026-10-23T08-17-00-544Z.png`。控制台无 warning；仅有 2 条 `/api/system-settings/public` 500，因为本次仅启动 Vite、未启动其 API 代理目标 `localhost:3001`，不是默认外观相关错误。Chrome DevTools MCP 未能创建隔离页（已存在运行中的共享浏览器），故没有用它读取已有页面或账号状态；本轮未登录、未访问业务数据。需要登录的完整 React Bits 场景 suite 尚未运行。
- 未改数据库或业务数据。Android 仅同步 Gradle 元数据至 9.3.48/90348，未构建 APK。本地修改，不提交、推送或部署；后续继续推进 B4/B5 尚未取得完整浏览器通过证据的本地闭环，并继续清点 B8 其余写入边界；Android 原生专项后置。

## 2026-10-23 清单 B8：稿件批注回复安全恢复（v9.3.47）

- 为稿件批注回复增加客户端 UUID。SAFE_EXPAND 迁移 049 以操作者、稿件、线程及 SHA-256 内容指纹保存结果账本，回复和账本同事务提交；未带编号的旧客户端保持原行为。相同编号/载荷重放返回原回复，跨操作者、线程或载荷返回冲突。
- 新增 `no-store` 只读状态查询，结果按操作者、稿件、线程和内容指纹隔离。前端在 sessionStorage 保存同一会话内的原回复和 UUID；结果不确定时锁定文本，确认 `not_found` 后才显示同编号、同内容的显式重试。查询不可用、内容冲突或恢复数据损坏时持续锁定，不自动重发。
- 通过：`npm run test:production-review`（并发同编号仅落一条、跨账号/线程/内容冲突、状态读取隔离与 `no-store`、账本插入故障后回复回滚及原编号重试）、`npm run test:migration-readiness`、`npm run check -- --pretty false`、`npm run version:check`、版本治理、更新说明治理（491 个版本）、Studio token 使用（38 类）、Android runtime 合同、测试入口（262 个文件）、`npm run build` 与 `git diff --check`。定向 ESLint 0 errors；workflow 路由 12 条 warning 与 HEAD 基线一致。生产构建成功，保留既有分包提示（Tiptap 555.12 kB、主入口 713.39 kB、Silk 背景适配器 843.50 kB）。
- 未通过/未完成：`npm run test:production-review-browser` 在 Chromium `bootstrap_check_in … Permission denied (1100)` 启动错误处退出；`npm run test:production-review-webkit-browser` 在 WebKit 引擎进程启动 abort。两者均未进入断言，不计浏览器通过。上一项工作流详情 `waitForResponse` 监听调整已让断言匹配 200 并在释放闸门前挂起等待，但本轮未运行工作流详情套件，仍待可启动浏览器环境验证。Playwright MCP 当前连接页仅确认存在本地应用标签，未对其业务数据执行读写验收。
- 迁移仅由隔离 HTTP 测试运行在临时数据库中；没有真实数据库迁移或业务数据变更。Android 只同步至 9.3.47/90347 元数据，未构建 APK。本地不提交、推送或部署。下一步继续 B8 其他用户写操作及 B4/B5 全站验收，Android 原生专项后置。

## 2026-10-23 清单 B4/B8：改密结果安全恢复与工作流操作（v9.3.46）

- B8：改密绕过会刷新/重放请求的全局 fetch 401 恢复器，使用请求原始状态判定结果。旧密码精确错误等确定拒绝可纠正后重试；网络断开、超时、泛化 401、5xx 和无效成功响应都视为结果未确认，清空密码并锁定表单，避免第二次写入。浏览器夹具覆盖服务器已提交但连接中断、单次请求以及确定拒绝后的纠正重试。
- B4：WorkflowDesigner 常用节点操作改用共享 ActionButton，补充 320/390/1440px 视口、触控命中和键盘激活回归。工作流详情测试将真实右键事件作为触发方式，检查自动滚动后的剪贴板菜单锚点/视口边界以及复制、剪切、粘贴反馈和服务端写入计数不变。
- 新增 [Workflow Engine 操作手册](./WORKFLOW_ENGINE_OPERATIONS.md)：基于当前检出代码说明 `v2_strict` 编译期常量、Shadow/Analytics/Decision/Strict 边界、只读诊断入口，以及回到 non-strict 需要独立代码评审和前后端发布；不声称生产模式已核实。
- 通过：`npm run test:system-settings-browser`、`npm run check -- --pretty false`、`npm run version:check`、版本/更新说明治理（490 个版本）、Studio token 使用（38 类）、Android runtime 合同、生产构建和目标差异检查。涉及页面与浏览器测试的定向 ESLint 无错误，报告 3 条未由本轮改动引入的 React effect 依赖警告。构建保留既有大分包提示（Tiptap 555.12 kB、主入口 712.76 kB、Silk 背景适配器 843.50 kB）。工作流详情响应式套件中真实右键/剪贴板菜单视口断言通过，但后续“完成成片”用例等待 PUT response 在 10 秒后超时；隔离 Chrome DevTools 夹具中同一动作返回 200 并正确刷新，尚未解释 Playwright 监听差异，整套不计通过。WorkflowDesigner 浏览器 suite 因 macOS Chromium 启动权限错误退出，未进入断言体。
- 无数据库结构或业务数据变化；未访问真实账号、生产环境或数据库。Android 仅同步 Gradle 版本元数据至 9.3.46/90346，未构建 APK。本地不提交、推送或部署。下一步继续查明详情套件响应监听差异，并推进 B4/B5 全站剩余验收与 B8 全量用户操作清点；清单中需业务选择的审批责任分配问题仍不擅自假设，Android 原生专项继续后置。

## 2026-10-23 清单 B4/B5/B8：交互语义、主题对比与创建安全恢复（v9.3.45）

- B4：审批流模板编辑/删除和节点删除入口统一到 40×40px；模板卡片改为窄屏可换行布局，按钮保持在卡片边界内。Playwright MCP 隔离页面实测 320/390/1440px 的模板按钮，以及 320px 编辑弹层节点删除按钮。灵感卡片改为 `article`，标题使用统一 `ActionButton` 提供独立、可键盘访问的详情入口；点赞、评论等操作保持为同级控件。仓库 Chromium 用例已在授权环境进入断言体；320px 浅色核心语义、Enter/Space、40×40px 命中区域通过，随后在删除恢复夹具刷新后未找到记录的等待处失败，其他视口/主题组合尚未完成。
- B5：拍摄、发布详情的剧本历史错误提示使用主题安全文字色；Playwright MCP 按最终合成背景实测亮/暗主题对比度均至少 6.26:1，重试入口可见且无业务写入。侧栏登出 hover 改用安全前景色；自动化补充亮/暗主题、展开/收起对比度及无 API 写入断言。角色创建/更新结果不明时，核实与恢复按钮移入当前模态框，避免被遮罩挡住；创建未创建恢复、更新读回旧状态后显式重试等角色回归已通过。设计器与权限管理完整 Chromium 套件最终通过，覆盖角色/模板创建、更新与删除恢复；预期 HTTP 错误按精确 method、pathname、status 和次数匹配，其他浏览器错误仍会失败。详情响应式浏览器套件仍在剪贴板上下文菜单第二次打开后失败：按钮被报告在 844px 视口外，但当时 DOM 锚点和定位样式与源码预期不一致，尚不能据此确认生产界面回归。
- B8：复盘行动项创建新增 SAFE_EXPAND 迁移 047；行动项、审计与操作者/复盘范围隔离结果账本同事务提交。刷新后只 GET 核实，只有明确 `not_found` 才允许复用原编号和载荷显式重试。公告创建新增 SAFE_EXPAND 迁移 048；公告和操作者隔离请求账本同事务，刷新/响应不明后只读核实，状态冲突、权限失败或未知继续锁定，只有确认未创建允许显式同编号重试；删除公告后保留墓碑，重放不会重建。
- 通过：行动项与公告幂等 HTTP、迁移 047/048、迁移 readiness、复盘审计原子性、公告板响应丢失/刷新浏览器回归、设计器与权限管理完整浏览器 suite、API 契约、类型检查、生产构建、定向 ESLint、版本治理、更新说明治理和 `git diff --check`。灵感 320px 浅色核心语义/键盘/触控断言通过但后续删除恢复夹具等待失败；详情响应式套件仍有剪贴板菜单越界失败；二者不计整套通过。Playwright MCP 隔离页手测与自动化执行分开记录。
- 未访问真实账号或业务库，未执行真实数据库迁移；Android 原生专项继续后置，本轮仅同步 Gradle 版本元数据至 9.3.45/90345，未构建 APK。保持本地修改，不提交、推送或部署；B4/B5 全站审计、B8 全量操作清点及清单其它开放事项仍继续推进。

## 2026-10-23 清单 B4/B8：待办终态过滤、复盘风险表单与匿名意见安全删除（v9.3.44）

- G：首页待办的逾期与即将到期查询都排除 `completed` 和 `rejected`；新增已退回且已过期、已退回且临近截止的选题夹具，验证卡片计数与明细不会将终态事项列为待处理。
- B4：复盘日报风险联动的风险选择、标题、负责人、截止日期提供与控件关联的可访问名称。Playwright MCP 隔离页面确认 390px 手机视口的表单可读、控件可识别；浏览器自动化代码检查精确标签和至少 40px 控件高度。
- B8：新增 SAFE_EXPAND 迁移 046（仅追加请求结果账本及索引，不回填旧反馈）。keyed DELETE 与账本写入同一事务；结果状态按操作者、请求编号和目标隔离。状态核实 API 及浏览器 fetch 均禁用缓存。旧客户端先删除目标时，后续同请求 DELETE 仍 404，不报成功；状态 GET 返回 `target_missing`，前端清理过期 marker、明确“本次操作未确认删除成功”、解除写锁。账号/目标冲突仍 fail-closed；状态未知、401/403 或读取失败时仍保留锁定。
- API 测试覆盖同请求重放、跨操作者/目标冲突、账本写入回滚、旧版无编号兼容和目标缺失终态；浏览器回归覆盖不发送第二次 DELETE、marker 清除与后续写入恢复。
- 通过：`npm run test:home-dashboard`、`npm run test:anonymous-feedback-delete-recovery`（包括禁用缓存头断言）、`npm run test:anonymous-feedback-delete-recovery-migration`、`npm run test:migration-readiness`、`npm run check -- --pretty false`、目标 ESLint、`npm run version:check`、版本治理、更新说明治理（488 个版本）、测试入口检查（262 个文件）、Android runtime、Studio token 使用、`npm run build` 与 `git diff --check`。生产构建成功，保留既有大分包提示（Tiptap 555.12 kB、主入口 710.39 kB、Silk 背景适配器 843.50 kB）。Playwright MCP 对隔离 mock 手验：target_missing 显示未确认成功、marker 被移除、删除请求计数为 0，复位后状态 PATCH 成功；复盘风险表单控件名称及手机布局可见。没有访问真实账号或业务数据库。
- 仓库 Chromium 自动化受 macOS `bootstrap_check_in … Permission denied (1100)` 启动限制，本轮未进入断言体，不计自动化通过。Android 仅同步 Gradle 版本元数据至 9.3.44/90344，未构建 APK；没有对真实数据库执行迁移。本地不提交、推送或部署。下一步继续 B4/B5/B8 未完成项，Android 原生专项后置。

## 2026-10-23 清单 B8：审批流模板创建安全恢复（v9.3.43）

- 服务端新增 SAFE_EXPAND 迁移 045，将操作者、请求 UUID、载荷指纹、模板 ID 和创建时间写入结果账本；模板、节点及账本在同一事务内提交。相同操作者/同一编号/同一载荷重放会返回原模板；跨账号或载荷不同返回冲突；删除模板后保留墓碑，状态读取需提供并匹配 SHA-256 载荷指纹，按操作者隔离并设置 `no-store`。未带编号的旧客户端仍兼容。
- 前端在 POST 前按账号保存原请求和 UUID；响应不明或刷新后先只读核实，确认不存在才允许使用同编号、同载荷显式重试。查询不可用或冲突时保留锁定；410 清理恢复标记并说明不会重建。补充刷新、账号隔离、丢失响应、同编号重试与删除墓碑浏览器回归代码。
- 通过：`npm run check -- --pretty false`、模板创建幂等 API（含并发同键/事务回滚/显式 null 拒绝/状态指纹不匹配）、迁移 045、API 契约、迁移 readiness、审批流阶段 CRUD、版本检查/治理、更新说明治理（487 个版本）、Android runtime、测试入口（259 个文件）、定向 ESLint（0 错误，1 条既有 `useEffect` 依赖警告）、`npm run build`、`git diff --check`。生产构建成功，仍有大分包提示（Tiptap 555.12 kB、主入口 709.68 kB、Silk 背景适配器 843.50 kB）。
- 工作流创建恢复及活动日志 819×480 CSS 视口浏览器回归代码已补充；本轮未运行 Chromium，受此前记录的 macOS 浏览器启动权限问题限制，不计自动化通过。没有对真实业务数据库执行迁移或写入。
- Android 仅同步 Gradle 版本元数据至 9.3.43/90343，未构建 APK；本地修改，不提交、推送或部署。下一步继续剩余 B4/B5/B8 项，Android 原生专项后置。

## 2026-10-23 清单 B4/B5/B8：移动消息已读安全恢复与账号隔离（v9.3.42）

- B8：移动消息中心“全部标记已读”请求先以操作者与 UUID 保存会话恢复标记；刷新、网络断开或响应不明时调用按账号隔离的只读状态接口。确认已提交则重新读取消息与摘要；确认未找到时仅提供同编号显式重试；状态不可用时保留标记并锁定该写入口。服务端以单一事务更新当前账号未读消息并写入结果账本，同编号重放返回首次更新数，不会触碰随后到达的新消息；提供旧客户端不带编号的兼容路径。新增 SAFE_EXPAND 迁移 044，无历史回填或既有消息变更。
- 同步修复移动端单条已读的账号竞态：旧账号请求在切换后成功或失败返回时，不更新新账号消息、未读摘要、共享状态、提示或导航；按账号维护忙碌消息 ID，旧请求的 `finally` 不会清除新账号同 ID 操作状态。新增账号迟到成功/失败浏览器回归。
- B4/B5：活动日志成员筛选器补齐可访问名称，暗色 320/390px 活动日志成功态验证实际叠层背景对比度；320px 额外覆盖读取失败、保留旧记录、只读重试恢复和零 API 写入。CreatorReports 删除主操作点击区统一到至少 40×40px，新增窄屏、明暗主题、悬停与取消无写入回归。
- 通过：`npm run test:message-pagination`、`npm run test:message-read-all-idempotency-migration`、`npm run test:migration-readiness`、`npm run test:activity-log`、`npm run test:time`、`npm run test:entrypoints`（257 个文件）、`npm run check -- --pretty false`、目标 ESLint、`npm run version:check`、版本治理（486 个版本）、更新说明治理、`npm run build` 与 `git diff --check`。构建保留大分包提示（Tiptap 555.12 kB、主入口 709.11 kB、Silk 背景适配器 843.50 kB）。
- 移动消息、CreatorReports 与活动日志 Chromium 浏览器回归代码已补齐，但仓库 Chromium 在 macOS `bootstrap_check_in … Permission denied (1100)` 阶段受阻、未进入断言体，不计自动化通过；未重试。暗色对比度为静态 alpha 合成计算（13.03:1），还需可用浏览器环境完成真实渲染复核。
- Android 仅同步 Gradle 版本元数据至 9.3.42/90342，未构建 APK。没有写入真实业务数据；仅本地修改，不提交、推送或部署。下一步继续 B4/B5 全站验收及 B8 剩余写入边界；审核责任规则、播放骤降可信阈值与完整团队概览仍需业务依据；Android 原生专项后置。

## 2026-10-23 清单 B4/B5/B8：全局选区、日历列宽与复盘创建安全恢复（v9.3.41）

- B5：全局选择文字原先使用 28% 透明主色，叠在不同背景时可读性不稳定。现新增浅/深主题选区令牌，正文、表格与编辑器共用实色配色；深色前景复用 Studio 深色文字令牌，亮色复用浅色文字令牌。静态合同按 WCAG 相对亮度验证两种主题分别为 5.64:1 与 5.17:1。
- B4：月历网格移除固定 820px 最小宽度，防止常见桌面视口横向溢出。Playwright MCP 隔离页面覆盖 768、1024、1280、1366、1440px，均为 42 个日期单元、七列且无单元裁切。
- B8：复盘创建加入操作者隔离的幂等账本和刷新后结果核实。SAFE_EXPAND 迁移 043 记录请求键、操作者、目标复盘及载荷指纹；同键同载荷返回原记录，不同操作者或载荷冲突。写入、审计与请求账本同事务提交，状态读取只读且按当前操作者隔离。前端在请求前持久化会话恢复标记，结果不确定时锁定原载荷，只允许核实或沿用原编号安全重试；切换账号不会把记录恢复到其他用户。
- 通过：复盘幂等迁移、HTTP、审计原子性、迁移 readiness 测试；`npm run test:editor-selection-style`、`npm run test:entrypoints`（256 个文件）、`npm run check -- --pretty false`、`npm run build`、`npm run version:check` 与 `git diff --check`。定向 TS ESLint 0 errors。Playwright MCP 与 Chrome DevTools MCP 实际选择普通正文、表格和编辑器文字，亮/暗主题各为 5.17:1 / 5.64:1。
- `npm run test:global-selection-contrast-browser`、`npm run test:calendar-month-race-browser` 与 `npm run test:retrospective-list-responsive-browser` 均因本机 Chromium 在测试体前触发 macOS `bootstrap_check_in … Permission denied (1100)` 而无法完成，不计自动化通过。复盘流程另以 Playwright MCP/Chrome DevTools MCP 隔离 API 实测：首次写入后模拟响应丢失与一次状态读取失败，再核实为已创建并进入详情；服务端只收到一个 POST。Vite-only 手测有预期 Socket.IO 500，因为未启动 API 服务。
- 生产构建保留既有大分包提示；Android 仅同步 Gradle 版本元数据至 9.3.41/90341，未构建 APK。没有写入真实业务数据；仅本地修改，不提交、推送或部署。下一步继续 B4/B5 全站验收和 B8 写入路径盘点；G 中稿件审核责任规则、播放骤降可信阈值和完整跨模块团队概览仍需业务依据；Android 原生专项后置。

## 2026-10-23 清单 B2/B4/B5：抖音关联留痕、归档弹窗键盘访问与移动错误态对比度（v9.3.40）

- B2：手动、批量和自动同步产生的抖音作品关联变化，在 `topic_history` 使用独立 `publishing_douyin_link_changed` 事件并写入活动日志；活动类型按“更新”归类。新增、更换、解除仅在关系实际变化时留痕，历史记录和关系在同一事务中提交，写入失败则一起回滚。自动批量/同步仍按逐条编辑范围过滤；任一平台发布即完成的既有逻辑不变，解除关联不回退已完成选题。未新增数据库结构或回填。
- B4：补齐日报月报、年报真实详情弹窗的边界、40×40 关闭按钮、初始焦点、Tab/Shift+Tab 圈定、关闭后焦点恢复、背景隔离、窄视口内部滚动和只读请求断言。Playwright MCP 手测覆盖 1440×960 月报、320×480 月报、390×480 年报；焦点和滚动符合预期，无横向溢出或业务写入。没有把摘要弹窗的既有 Escape 默认策略认作缺陷。
- B5：移动创作列表错误和本机草稿存储错误提示改用 `text-studio-coral-contrast`。Chrome DevTools MCP 隔离页模拟真实列表 503，390×844 浅色约 6.88:1、深色约 14.43:1，仍保留旧数据、仅触发读取且无横向溢出；浏览器回归也覆盖浅/深主题的实际状态和零写入。
- 共享模态生命周期抽取为独立钩子，供 `BaseModal`、日报详情抽屉、选题审核和灵感详情使用；回归覆盖初始聚焦、Tab 圈定、嵌套模态、Escape 守卫、背景 `inert`/`aria-hidden` 恢复及关闭焦点归还。日报抽屉实测桌面与 320×800，浅/暗主题详情均无溢出；Escape 返回触发按钮。
- 通过：`npm run test:base-modal-accessibility`（2/2）、`npm run test:publishing-douyin-link`（含故障注入验证历史与关联一起回滚）、`npm run check -- --pretty false`、目标文件 ESLint（0 错误，TopicDetail 保留 5 条既有警告）、`npm run build`、`npm run version:check`、版本治理、更新说明治理（484 个版本）、测试入口检查（255 个文件）、Android runtime、Studio token 使用（38 类）与 `git diff --check`。生产构建成功，保留既有大分包提示（Tiptap 555.12 kB、主入口 707.67 kB、Silk 背景适配器 843.50 kB）。
- 仓库 `test:daily-report-submit-recovery-browser` 与 `test:mobile-work-center-browser` 已尝试，但 Chromium 在断言体启动前因 macOS `bootstrap_check_in org.chromium.Chromium.MachPortRendezvousServer … Permission denied (1100)` 退出，不计自动化通过；上文隔离 MCP 手测单独记录。
- Android 仅同步 Gradle 版本元数据至 9.3.40/90340，未构建 APK。仅本地修改，不提交、推送或部署。下一步继续清单 B2/B4/B5 中尚未覆盖的核对项和 B8 写入边界；Android 原生专项按用户要求后置。

## 2026-10-23 清单 B8：消息清空结果安全恢复（v9.3.39）

- 桌面消息中心先将操作者与 UUID 保存至 sessionStorage，再用同一请求号提交清空；刷新后自动调用只读状态接口。核实为已提交时清除恢复标记并重新读取列表；暂时无法核实时保留编号并禁止二次删除；确认未找到时仅允许用户显式沿用原编号重试。
- 服务端在一个写事务内检查请求账本、按当前账号删除消息并记录首次删除数。同编号重放只返回账本结果，不会再次触碰之后到达的新消息；状态读取只返回当前操作者对应记录。无请求编号的空旧客户端调用仍走兼容路径；格式错误载荷拒绝。新增 SAFE_EXPAND 迁移 042。
- API 隔离 SQLite 测试覆盖成功提交后 503、插入后来到达的新消息、同编号重放后保留新消息；同时验证状态查询只读、跨操作者结果隔离、重复键冲突、账本失败时事务回滚、畸形编号拒绝与旧客户端兼容。迁移重复执行保持幂等并保留既有消息数据。
- 通过：`npm run test:message-pagination`、`npm run test:message-clear-idempotency-migration`、`npm run test:migration-readiness`、`npm run check -- --pretty false`、本项目标 ESLint、`npm run build`、`npm run version:check`、版本治理、更新说明治理（483 个版本）、测试入口（255 个文件）、Android runtime 合同、Studio token 使用（38 类）与 `git diff --check`。生产构建保留既有大分包提示（Tiptap 555.12 kB、主入口 707.10 kB、Silk 背景适配器 843.50 kB）。
- 仓库消息页浏览器回归已运行，但 macOS Chromium 在测试体启动前因 `bootstrap_check_in org.chromium.Chromium.MachPortRendezvousServer … Permission denied (1100)` 退出，不能记作自动化通过；隔离 UI 场景仍需在支持的浏览器运行环境复验。
- Android 仅同步 Gradle 版本元数据至 9.3.39/90339，未构建 APK。仅本地修改，不提交、推送或部署。B8 其它写入边界、B4/B5 全站审计和 Android 原生专项仍开放。

## 2026-10-22 清单 B5：编辑器颜色菜单标题对比度（v9.3.38）

- 桌面 `Toolbar` 的文字颜色、高亮颜色弹层标题移除 `opacity-60`，使用 Studio `text-studio-text-secondary` 语义令牌，降低主题之间的可读性差异。
- `tests/browser/production-review.spec.ts` 增加亮色/暗色下两个实际 Toolbar 菜单标题的计算对比度断言（至少 4.5:1）及令牌使用断言；既有 1024px/125% 与 320px 菜单边界/色块命中回归保持不变。
- Chrome DevTools MCP 隔离夹具实测：文字颜色与高亮颜色标题在亮色主题均为 7.58:1，在暗色主题均为 7.52:1；四次查看均未点击色块或写入稿件。
- 通过：`npm run check -- --pretty false`、目标 ESLint、`npm run build`、`npm run version:check`、版本/更新说明治理、Studio token 使用与 `git diff --check`。生产构建保留既有大分包提示（Tiptap 555.12 kB、主入口 706.41 kB、Silk 背景适配器 843.50 kB）。
- `npm run test:production-review-browser` 已尝试，但 macOS Chromium 在测试体前因 `bootstrap_check_in … Permission denied (1100)` 退出，不计自动化通过；Chrome DevTools MCP 手工验收独立记录。
- 无 API、权限、数据库或真实业务数据变化；Android 仅同步 Gradle 版本元数据至 9.3.38/90338，未构建 APK。仅本地修改，不提交、推送或部署。下一步优先继续 B8 通知“清空全部消息”的结果不确定恢复，并推进 B4/B5 全站其余主题与响应式验收；Android 原生专项后置。

## 2026-10-22 清单 B8：人员创建撤权后的只读恢复（v9.3.37）

- 创建请求结果不确定后，状态查询路由仍要求登录，但不再要求 `user:create`；数据库读取继续限定当前操作者与原请求编号，不返回其他人的请求。创建写接口仍保留 `user:create` 权限校验。
- 前端在撤权后继续只读核实，不因 401/403 清除恢复标记或推断原写入未发生；无创建权限时锁定创建表单和重试入口。仅服务端确认 `not_found` 且当前权限已恢复后，用户可显式以同一请求编号重试。修复权限状态加载与恢复查询竞态。
- 隔离 SQLite/API 回归验证：移除创建权限后，已提交请求仍可返回本操作者的 `created` 状态，另一个写入仍被 403 拒绝；跨操作者仍返回通用 `not_found`。`npm run test:user-mutation-audit-atomic`、`npm run check -- --pretty false`、目标 ESLint、`npm run version:check`、版本/更新说明治理（481 个版本）、测试入口检查（254 个文件）、Android runtime 合同、Studio token 使用（38 类）、`npm run build` 与 `git diff --check` 均通过。构建保留既有大分包提示（Tiptap 555.12 kB、主入口 705.99 kB、Silk 背景适配器 843.50 kB）。
- Chrome DevTools MCP 隔离夹具手工覆盖已提交后撤权刷新、未提交请求在 403 后刷新保留标记与禁用写入、恢复权限后以同一 UUID 显式重试且只创建一次。仓库 Playwright 自动化实际尝试，但 Chromium 在测试体启动前因 macOS `bootstrap_check_in … Permission denied (1100)` 退出，不计自动化通过。
- 无数据库结构或真实业务数据变化；Android 仅同步 Gradle 版本元数据至 9.3.37/90337，未构建 APK。仅本地修改，不提交、推送或部署。下一步继续按清单核对 B8 其它用户操作边界，并推进 B4/B5 全站验收；Android 原生专项仍按用户要求后置。

## 2026-10-22 清单 B4：Chrome 原生高缩放下编辑器下拉菜单避让侧栏（v9.3.36）

- 真实 Chrome 原生缩放验收发现，ProductionDetail 的文字颜色菜单在 1366px 物理宽度、125% 缩放时左移进入导航侧栏；侧栏和编辑面板处于不同堆叠上下文，单纯提高弹层 z-index 无法解决。现将共享编辑器下拉的水平定位限制在工具栏列范围内，并按可用列宽收缩菜单。
- `tests/browser/production-review.spec.ts` 增加下拉菜单工具栏列边界断言，以及文字色板每个按钮中心点的 `elementFromPoint` 命中断言，覆盖 1024px/125% 与 320px 窄屏夹具。
- Chrome DevTools MCP 原生手工验收：Chrome 窗口宽 1366 时，显示菜单确认原生 125%（DPR 2.5、CSS 视口 1093×659），导航侧栏右边界 x=240，工具栏左边界及色板左边界 x=264.8；8 个颜色按钮中心均命中对应色块，真实点击“默认”后菜单关闭。窗口宽 1024 时，同为原生 125%（CSS 视口 819×480），文字与高亮色板均位于工具栏列内且全部色块可命中。页面无横向溢出，隔离稿件保存次数为 0、内容未变。
- 通过：`npm run check -- --pretty false`、目标 ESLint、`npm run version:check`（v9.3.36）、版本治理、更新说明治理（480 个版本）、测试入口检查（254 个文件）、Studio token 使用（38 类）、Android runtime 合同、创作审阅 API 测试、`npm run build` 与 `git diff --check`。生产构建保留既有大分包提示（Tiptap 555.12 kB、主入口 705.57 kB、Silk 背景适配器 843.50 kB）。
- `npm run test:production-review-browser` 已尝试，但 Chromium 在测试体前因 macOS `bootstrap_check_in org.chromium.Chromium.MachPortRendezvousServer … Permission denied (1100)` 退出，不计自动化通过。原生 Chrome DevTools MCP 手工交互验收单独记载；自动回归代码已补，仍待运行环境允许后实际执行。
- 无 API、权限、数据库或业务数据变化；Android 仅同步 Gradle 版本元数据至 9.3.36/90336，未构建 APK。仅本地修改，不提交、推送或部署。下一步继续 B4 其它优先页面的原生缩放/溢出验收与 B5 明暗主题、悬停和空/错状态盘点；Android 原生专项按用户要求后置。

## 2026-10-22 清单 B8：人员启停安全恢复与共享弹窗可访问性（v9.3.35）

- 完成人员启停跨刷新恢复：浏览器仅保存操作者、目标账号、目标状态和请求编号；每次结果不确定时只读查询原请求状态。`updated` 后清理标记并刷新；`not_found` 继续锁定，只有 `user:update` 权限仍有效时才提供明确的同编号重试；查询错误或权限撤销时维持全局写锁，不按目标账号当前状态猜测旧请求是否提交。
- 隔离浏览器手工验收：模拟提交前失败及只读状态查询失败后，刷新只发状态 GET 并保留标记/全局锁；只读核实确认未提交后显式重试，两个 PUT 复用同一 UUID，服务端夹具仅执行一次写入。并发删除场景中，其他管理员先移除目标后，本次 DELETE 返回 404，再通过目标状态只读核实确认已不存在；界面移除失效行并明确说明本次请求未执行删除，写入计数为 0。
- 修复自禁用校验类型旁路：`enabled` 若存在只接受布尔值，`0`、`null`、字符串等畸形值返回 400；自禁用只按严格 `false` 判定。用户删除/资料更新幂等重放也保持权限缓存与目标 Socket 会话撤销补偿。
- 共享 `BaseModal` 现在将初始焦点、Tab 焦点圈定、关闭后焦点恢复、嵌套弹窗顶层独占交互、Escape 守卫及背景 `inert`/`aria-hidden` 隔离集中管理，并精确恢复打开前背景状态。
- 通过：`npm run check -- --pretty false`、`npm run version:check`（v9.3.35）、`npm run test:version-governance`、`npm run test:changelog-governance`（479 个版本）、`npm run test:entrypoints`（254 个文件）、`npm run test:android-runtime`、`npm run test:studio-token-usage`（38 类）、`npm run test:migration-readiness`、`npm run test:user-session-revocation`（含自禁用畸形值）、`npm run test:user-mutation-audit-atomic`、`npm run test:user-delete-idempotency-migration`、`npm run test:base-modal-accessibility`、`npm run test:publishing-douyin-link`、目标 ESLint、`npm run build` 与 `git diff --check`。生产构建成功，仍提示既有大分包：Tiptap 555.12 kB、主入口 705.12 kB、Silk 背景适配器 843.50 kB。
- `npm run test:users-refresh-query-race-browser` 因 macOS Chromium `bootstrap_check_in org.chromium.Chromium.MachPortRendezvousServer … Permission denied (1100)` 在测试体前退出，不计仓库自动化通过；隔离 MCP 手工互动验收单独记录。已停止临时夹具服务。
- 无新增迁移或业务数据修改；Android 仅同步版本元数据至 90335，未构建 APK。仅本地修改，不提交、推送或部署。下一步继续 B4/B5 未完成的全站审计；Android 原生专项后置。

## 2026-10-22 清单 B8：人员资料更新刷新后安全恢复（v9.3.33）

- 完成人员更新请求结果不确定时的整页刷新恢复。状态 API 只读查询 `requestId + actorId + targetUserId`，只需已认证，不要求 `user:update`，以便权限变化或重新登录后继续核实；不存在记录仅返回通用 `not_found`，不泄露其它操作者/目标的记录。
- 浏览器 sessionStorage 只保存操作者、请求编号、目标账号、原非密码字段及 `hasPassword` 布尔标记，不保存密码、令牌或指纹。已更新则清理标记并刷新列表；未找到时锁定原载荷，只要求重新输入密码，再以同一请求编号重试。读取不可用时继续锁定并提供只读重查。只对路由首次加载时已存在的恢复标记自动查询，避免同页刚提交的新请求抢先触发恢复 GET。
- 阻止当前登录用户禁用自身，确保安全恢复路径仍可用；API 回归覆盖自禁用拒绝、请求操作者隔离、目标账号隔离、无需 `user:update` 的只读核实。
- Playwright MCP 隔离交互通过：同页模拟提交后 503，核实 GET 数仍为 0；刷新后状态查询 503 时表单锁定、取消和重试禁用；点击“只读重新核实”确认已提交，状态 GET 总数为 2、写入 PUT 仍为 1、恢复标记清除。此前提交前失败重载也验证了非密码字段恢复、密码重新输入与同 UUID 安全重试；已提交后刷新通过 GET-only 确认。
- 通过：`npm run test:user-mutation-audit-atomic`、`npm run test:user-update-idempotency-migration`、`npm run test:user-create-idempotency-migration`、`npm run test:migration-readiness`、`npm run test:publishing-douyin-link`、类型检查、目标 ESLint、版本治理、更新说明唯一性（477 个版本）、测试入口（252 个文件）、Android runtime 合同、Studio token（38 类）、版本检查和生产构建。构建保留既有大分包提示。
- `npm run test:users-refresh-query-race-browser` 已实际运行，但 macOS Chromium 在测试体前因 `bootstrap_check_in org.chromium.Chromium.MachPortRendezvousServer … Permission denied (1100)` 退出，不计仓库自动化通过；隔离 MCP 手工交互验收单独记录。
- 复用迁移 039，无新增数据库结构。版本递增至 9.3.33；Android 仅同步 90333 元数据，未构建 APK。仅本地修改，不提交、推送或部署。下一步继续 B8 其余用户写入闭环与 B4/B5 全站审计；Android 原生专项后置。

## 2026-10-22 清单 B8：人员创建刷新后安全恢复（v9.3.32）

- 补齐人员创建提交结果不确定后的整页刷新恢复。当前操作者刷新后按原请求编号执行只读核实；已创建时清理会话恢复标记、关闭窗口并刷新列表，不重复提交；未找到时恢复非密码字段、锁定原载荷，仅开放密码重新输入并以同一编号安全重试。请求状态查询同时限制操作者与请求编号。
- 会话恢复记录仅包含版本、请求编号、用户名、邮箱、角色和姓名，不保存密码、认证令牌或其他敏感凭证；服务端复用迁移 040 的请求记录，无新增数据库结构。
- 补充状态文案区分“正在核实”“服务器未找到”和“暂时无法核实”，避免请求完成前或读取失败时把结果描述成已确认。API 测试验证创建结果只对原操作者可见，其他管理员查询得到 `not_found`；缺失编号返回 `not_found`，畸形编号返回 400。
- 浏览器隔离验证覆盖提交已完成但返回 503 后刷新、只读 GET 确认并避免第二次 POST；以及提交前 503 后刷新、非密码字段恢复/密码清空/其它字段和取消入口锁定、重新输入密码后同 UUID 重试且最终只创建一个账号。Chrome DevTools MCP 另验证当前 500px 视口下无页面横向溢出、提示与锁定状态正确，控制台无错误/警告。
- 通过：`npm run test:user-mutation-audit-atomic`、`npm run test:user-create-idempotency-migration`、`npm run test:user-update-idempotency-migration`、`npm run test:migration-readiness`、`npm run test:publishing-douyin-link`、`npm run check -- --pretty false`、目标 ESLint、`npm run version:check`（v9.3.32）、`npm run test:version-governance`、`npm run test:changelog-governance`（476 个版本）、`npm run test:entrypoints`（252 个文件）、`npm run test:android-runtime`、`npm run test:studio-token-usage`（38 类 token）、`npm run build` 与 `git diff --check`。生产构建保留既有大分包提示（Tiptap 555.12 kB、主入口 703.68 kB、SilkBackgroundAdapter 843.50 kB）。
- `npm run test:users-refresh-query-race-browser` 已重新运行，但 macOS Chromium 在测试体前因 `bootstrap_check_in org.chromium.Chromium.MachPortRendezvousServer … Permission denied (1100)` 退出，不能记为仓库自动化通过；隔离 MCP 手工交互核验单独记录。
- 修改涉及人员 API/客户端、`Users.tsx`/`FormModal`、API 与浏览器回归，以及版本/进度/更新说明。版本递增至 9.3.32，Android 仅同步 90332 元数据，未构建 APK。仅本地修改，不提交、推送或部署。下一项继续 B8 人员资料更新刷新恢复；B4/B5 全站审计与 Android 原生专项继续开放。

## 2026-10-22 清单 B8：人员创建幂等重试（v9.3.31）

- 核验发现：用户创建请求服务端可能已提交但响应丢失时，页面会将其当作普通创建失败，用户再点保存会因用户名占用无法判断先前请求是否成功。
- 新增迁移 040 `user_create_request_keys`（SAFE_EXPAND）；服务端以 JWT 密钥计算请求 HMAC 指纹，将新账号、角色关系、活动日志及请求键原子提交。密码不写入记录；同一操作者/请求键/请求内容重放返回原用户 ID，不重复创建；键用于不同操作者或载荷返回 409。旧客户端不带键时保持原兼容路径。
- `Users.tsx` 在网络错误或 5xx 后冻结添加用户表单及其他人员修改入口，仅允许复用相同请求键安全重试；已知 4xx 拒绝后清除待重试状态，可修正后再提交。密码仅保留在当前页面内存，未存储在数据库或浏览器持久存储。
- API 隔离测试模拟提交事务后 503，随后重放同键：账号、角色关系和操作日志分别只存在一份；HMAC 不包含密码明文；同键不同载荷返回 409。`npm run test:user-mutation-audit-atomic`、`npm run test:user-create-idempotency-migration`、`npm run test:migration-readiness` 与类型检查已通过。
- 浏览器回归新增提交后 503、冻结字段/取消入口、同键安全重试与单次语义写入场景。Playwright MCP 手工隔离验收：第一次 POST 已模拟提交后 503，用户名/密码/姓名/邮箱/角色均禁用、取消禁用；第二次 POST 复用同一 UUID，夹具收到 2 次 POST 但只有 1 次创建，随后弹窗关闭并只发列表 GET。页面 URL/标题正确、主界面非空、无框架覆盖层，视口无横向溢出；控制台仅有预期注入 503，warning 为 0。仓库自动化 `npm run test:users-refresh-query-race-browser` 实际尝试，但 Chromium 在测试体之前因 `bootstrap_check_in org.chromium.Chromium.MachPortRendezvousServer … Permission denied (1100)` 退出，不计自动化通过。
- `npm run test:user-mutation-audit-atomic`、`npm run test:user-create-idempotency-migration`、`npm run test:user-update-idempotency-migration`、`npm run test:migration-readiness`、`npm run test:publishing-douyin-link`、`npm run check -- --pretty false`、目标 ESLint、`npm run version:check`、版本治理、更新说明唯一性（475 个版本）、测试入口（252 个）、Studio token（38 类）、Android runtime 合同及 `git diff --check` 均通过。`npm run build` 通过，保留既有 >500 kB 分包提示（Tiptap 555.12 kB、主入口 703.29 kB、SilkBackgroundAdapter 843.50 kB）。按用户确认，抖音批量关联仍严格遵循逐条编辑范围，全局查看权限不扩写。
- Android 仅同步到 9.3.31 / 90331 元数据，未构建 APK。本地修改，不提交、推送或部署。B8 删除/启停及刷新恢复、B4/B5 全站审计与 Android 原生专项仍开放。

## 2026-10-22 清单 B8：人员资料更新幂等重试（v9.3.30）

- 核验发现：用户编辑请求超时/返回 5xx 后，服务端可能已提交密码、角色或启停变更，而前端仍允许直接重复保存；密码不可通过资料 GET 只读核实。
- 新增迁移 039 `user_update_request_keys`（SAFE_EXPAND），将用户更新请求键、操作者/目标账号与服务端 HMAC 指纹和资料/角色/会话撤销/活动日志原子保存。密码原文不写入请求表；相同键与相同请求体返回已提交结果，不重复执行写入；相同键不同请求体返回 409。
- `Users.tsx` 在网络错误/5xx 后锁定原始表单和其他人员修改，只提供“安全重试上次保存”，确保重用同一请求键；4xx 拒绝后可正常修正再提交。`FormModal` 支持锁定字段并单独开放安全重试按钮。
- API 隔离测试在事务提交后将响应伪装为 503，随后以原请求键重试：`auth_version` 仅递增一次，会话仅撤销一次，活动日志仅写一次，HMAC 摘要不包含密码明文；不同载荷重用键返回 409。`npm run test:user-mutation-audit-atomic`、`npm run test:user-update-idempotency-migration`、`npm run test:migration-readiness` 通过。
- Playwright MCP 手工隔离验证：第一次编辑 PUT 注入提交后 503，弹窗冻结原始密码/资料/角色，取消关闭不可用；安全重试复用 UUID，夹具共收到 2 次 PUT，但只提交 1 次状态变更和 1 次密码更新，随后窗口关闭。当前页只有预期注入的 503 控制台错误，warning 为 0。
- `npm run test:users-refresh-query-race-browser` 已实际尝试，但 Chromium 在测试体之前因 `bootstrap_check_in org.chromium.Chromium.MachPortRendezvousServer … Permission denied (1100)` 退出，不计自动化通过；Playwright MCP 手工验收与仓库自动化分别记录。
- `npm run check -- --pretty false`、目标 ESLint、`npm run version:check`、版本治理、更新说明唯一性（474 个版本）、测试入口检查（251 个文件）、Studio token（38 类）、Android runtime 合同及 `git diff --check` 通过。`npm run build` 通过，保留既有 >500 kB 分包提示（Tiptap 555.12 kB、主入口 702.93 kB、SilkBackgroundAdapter 843.50 kB）。
- 按用户确认复核抖音批量关联遵循逐条编辑范围，`npm run test:publishing-douyin-link` 通过；范围外记录不写入/不计结果，全局编辑者既有全量范围不变。
- Android 仅同步至 9.3.30 / 90330 元数据，未构建 APK。修改仅本地，不提交、推送或部署。B8 其余创建/删除/启停路径、B4/B5 全站审计和 Android 原生专项仍开放。

## 2026-10-22 清单 B4/B5：选题列表与看板触控目标（v9.3.29）

- 选题列表视图切换、全选/行选、排序、标题打开与下一步操作，及看板标题打开、阶段推进均统一提供至少 40×40px 点击区；共享分页改用 Studio 控件，手机保留上一页、当前/相邻页与下一页，首末页快捷入口和远端页码在窄屏隐藏。服务端分页状态及用户权限未变。
- Playwright MCP 合成夹具实测列表/看板在 320/390/1440px 下页面不横向溢出、所有可见主按钮达到 40×40px；另核对 390px 深色列表/看板。看板阶段列自身仍可横向滚动，这是预期行为。控制台无错误，出现 1 条既有 React Bits `magic-bento` 安全回退提示；未触发业务写入。截图证据保存在 `.playwright-mcp/page-2026-10-22T05-20-12-750Z.png` 与 `.playwright-mcp/page-2026-10-22T05-22-53-361Z.png`。
- 共享分页的另一个调用页「人员管理」也补入 `users-refresh-query-race` 隔离回归：夹具扩展为 51 人，覆盖 320/390/1440px 可见按钮尺寸与无横向溢出，以及 320px 前后翻页、`aria-current` 和结果替换。Playwright MCP 手动实测文档宽度为 312/320、382/390、1440/1440px，所有可见分页按钮均 40×40px；翻页请求仅为 `GET /api/users?page=1|2&limit=50`，创建/更新/删除计数均为 0，控制台 0 错误/警告。
- B8 补充核验人员启停与删除结果恢复：隔离页注入已提交后的 PUT 503 和状态 GET 503，所有用户修改入口暂停；点“只读核实用户状态”后确认服务端已禁用，PUT 计数仍为 1。另注入 DELETE 200 后列表 GET 503，已删除行立即消失并明确提示“不要重复操作”；点“重新加载列表”只发 GET、空态恢复，DELETE 计数仍为 1。仅 3 条预期注入 503 出现在浏览器控制台，无 warning。用户状态/删除界面由 Playwright MCP 和 Chrome DevTools MCP 隔离夹具手动核对。
- `npm run test:user-mutation-audit-atomic` 与 `npm run test:user-session-revocation` 通过，分别验证用户创建/更新/删除与活动日志的事务原子性，以及会话和 Socket 撤销。
- `npm run check -- --pretty false`、目标 ESLint、`git diff --check`、`npm run version:check`、版本治理、更新说明唯一性（473 个版本）、测试入口（250 个文件）、Studio token（38 类）及 Android runtime 合同通过。`npm run build` 通过；仍有既有 >500 kB 分包提示（Tiptap 555.12 kB、主入口 702.36 kB、SilkBackgroundAdapter 843.50 kB）。
- 按用户确认复核官方数据窗为北京时间自然日：昨天取前一日，近 7 天和近 30 天均包含当天；`npm run test:official-export-v2` 与 `npm run test:creator-unified-reports` 通过。抖音批量关联按逐条编辑范围；`npm run test:publishing-douyin-link` 通过，未越权关联或推进范围外选题；全局编辑权限保留原有范围。本版本不改日期或抖音权限语义。
- `npm run test:topics-responsive-browser` 在测试体前无法启动仓库 Chromium，macOS 返回 `bootstrap_check_in … Permission denied (1100)`；该自动化不计通过。Playwright MCP 隔离页面人工验收独立通过。
- `npm run test:users-refresh-query-race-browser` 同样在 Chromium 启动前受 macOS `bootstrap_check_in … Permission denied (1100)` 阻断，未进入测试体；Playwright MCP 人工隔离验收不能记为该仓库自动化通过。
- 无 API、权限定义、数据库或真实业务数据变化；Android 仅同步 90329 元数据，未构建 APK。本地不提交、推送或部署。

## 2026-10-22 清单 B4/B5：资料中心触控目标（v9.3.28）

- Playwright MCP 合成资料库夹具实测查看/编辑/删除入口 32×32px、上一页/下一页 34×34px、共享 `BaseModal` 关闭按钮 36×36px；现列表五类操作与通用对话框关闭按钮统一为 40×40px Studio 命中区。分类管理弹窗字段、提交和行内编辑/删除本已达到 40px，现将尺寸条件加入 `resource-category-management` 回归。保持现有图标语义、权限控制、悬停反馈和资料业务行为。
- Playwright MCP 隔离实测浅/深主题下资料列表 320/390/1440px 与分类管理弹窗 320/390/1440px，页面文档宽度分别为 312/320、382/390、1440/1440px，无横向溢出；资料列表五类操作和弹窗关闭/行内操作均 ≥40×40px，分类输入项 ≥40px；控制台错误/警告为 0，API 记录只有认证、未读消息、资料/分类读取 GET。本轮未触发资料或分类写入。
- 按用户刚确认的范围复核 `npm run test:publishing-douyin-link` 通过：批量关联遵循逐条编辑范围，范围外记录不关联、不进入摘要；全局编辑许可维持既有全量处理行为，本轮无权限代码变化。
- `npm run check -- --pretty false`、定向 ESLint、`npm run version:check`、版本治理、更新说明唯一性（472 个版本）、测试入口（250 个）、Studio token 门禁（38 类）、Android runtime 合同、`npm run build`、`git diff --check` 通过。生产构建仍提示大分包：Tiptap 555.12 kB、主入口 702.04 kB、SilkBackgroundAdapter 843.50 kB。
- 仓库 `npm run test:resource-hover-contrast-browser` 与 `npm run test:resource-categories-browser` 均在 Chromium 启动时因 macOS `bootstrap_check_in … Permission denied (1100)` 于测试体前退出，不计自动化通过；Playwright MCP 手动隔离验收单独记录。
- 无 API、权限定义、数据库或业务数据变化；Android 仅同步 90328 元数据，未构建 APK。本地不提交、推送或部署。

## 2026-10-22 清单 B4/B5：番茄钟触控目标与固定导航可达性（v9.3.27）

- 当前 Playwright MCP 320×720 移动夹具发现完整番茄钟重置按钮仅 38×38px。现完整页与紧凑卡片的重置按钮统一使用 40×40px Studio secondary 控件；统计读取重试与完成记录重试操作也统一采用至少 40px Studio 按钮。没有改变业务操作、API 或权限。
- 浏览器回归覆盖 320×720、390×844、1440×900，并在 320px 统计首读模拟 503、显式点击重试且只发 GET；完整/紧凑模式测量重置和统计重试命中区，重置保持 25:00。320×720 滚动到底时排行榜下缘 y=608、固定导航上缘 y=655，间距 47px；390px 深色与 1440px 浅色均无横向溢出。Playwright MCP 隔离实测：完整页统计重试 138×60px、重置 40×40px；紧凑卡片统计重试 126×40px、重置 40×40px；无非预期控制台错误/警告。
- `npm run check -- --pretty false`、定向 ESLint、`npm run version:check`、`npm run test:version-governance`、`npm run test:changelog-governance`（471 个版本）、`npm run test:entrypoints`（250 个入口）、`npm run test:studio-token-usage`（38 类 token）、`npm run test:android-runtime`、`npm run build`、`git diff --check` 均通过。构建保留大分包提醒：Tiptap 555.12 kB、主入口 701.69 kB、SilkBackgroundAdapter 843.50 kB。Playwright MCP 手工隔离验收通过；仓库 `test:pomodoro-amber-contrast-browser` 和 `test:pomodoro-notification-browser` 均因 Chromium 在 macOS `bootstrap_check_in … Permission denied (1100)` 于测试体前失败，不能记为自动化通过。
- 无 API、权限、业务数据或数据库变化；Android 仅同步 90327 元数据，未构建 APK。本地不提交、推送或部署。

## 2026-10-22 清单 B4/B5：番茄钟窄屏重复返回入口（v9.3.26）

- `src/pages/PomodoroPage.tsx` 在 768px 以下隐藏内容区重复的“返回首页”，保留移动壳层的 44×44 返回入口；桌面布局继续显示内容区入口。`tests/browser/pomodoro-amber-icon-contrast.spec.ts` 加入 320/390/1440px 唯一性回归、窄屏计时器重置后的 25:00 状态及测试服务的安全关闭保护。
- Playwright MCP / Chrome DevTools MCP 隔离实测 320×720 深色、390×844 浅色、1440×900 桌面，页面身份正确、无横向溢出、控制台无错误/警告；重置操作后计时器仍为 25:00，网络仅 GET。仓库 Chromium 自动化在测试体前因 `bootstrap_check_in org.chromium.Chromium.MachPortRendezvousServer` 权限错误失败，不计自动化通过。
- `npm run check -- --pretty false`、定向 ESLint、版本检查/治理、更新说明治理（470 个版本）、测试入口（250 个文件）、Studio token 门禁（38 类）、Android runtime 合同、抖音权限范围、官方导出 v3、创作者新鲜度/统一报表、生产构建与 `git diff --check` 通过。构建保留既有大分包提示（Tiptap 555.12 kB、主入口 701.33 kB、Silk 843.50 kB）。
- 不改变 API、权限、业务数据或数据库；Android 仅同步版本元数据至 9.3.26/90326，未构建 APK。本地不提交、推送或部署。

## 2026-10-22 清单 B2：创作子状态枚举边界校验（v9.3.25）

- 创作记录新增与更新接口此前接受任意字符串；成片和发布接口还会将单元素数组强制转成合法状态文本；模板审批只检查结果非空，审批模板写入口也未按共享状态矩阵校验；阶段顺序比较还维护着并行的本地映射。本轮以各自状态文案表作为子状态枚举来源，将审批结果限定为“通过/驳回”，在模板创建/更新时拒绝非法状态转换，并把阶段先后比较迁入共享状态机：六个子状态创建/更新入口只接收合法字符串，非法载荷返回 400，不改变任何有效转换。
- `test:workflow-stage-crud` 新增非法模板转换/更新、非法审批结果、创作非法状态及成片/发布数组状态创建/更新回归：拒绝后模板原节点、子记录、选题阶段及历史均保持不变。`test:production-access`、`npm run check -- --pretty false` 通过；`api/routes/workflow.ts` 当前 lint 12 条警告，逐条与 HEAD 基线相同，无新增告警。
- 版本检查/治理、更新说明治理、测试入口检查、Studio token 门禁、生产构建与 `git diff --check` 通过。本轮无数据库结构变化、不改变合法流转、不批量回填历史；Android 仅同步版本元数据到 9.3.25/90325，未构建 APK。仅本地修改，不提交、推送或部署。

## 2026-10-22 清单 B4：窄屏桌面页动画安全可见（v9.3.24）

- `src/components/studio/motion.ts` 将全站页面过渡初始透明度设为 1，只保留轻微位移；动画调度暂停或失败时页面仍可读，不再停在 opacity 0。Analytics 浏览器回归从 1440px 桌面布局启动后收窄至 320px，检查页面过渡容器与标题可见；真实移动壳层单独检查标题，不错误要求桌面动画容器。
- Chrome DevTools MCP 隔离页面在 `prefers-reduced-motion: no-preference` 下实测：1440px 初始可见，缩至 320px 后 opacity 1、标题可见、文档无横向溢出；统计读取故障时点击“重新加载统计”后恢复到 6 条，无写入。另验证本轮确认的抖音批量关联逐条编辑范围：创建人/负责人/发布参与者关联范围内记录可匹配，范围外记录既未写入也未进入返回统计；具备全局编辑权限的管理员仍可按既有权限全量处理。`npm run test:publishing-douyin-link` 通过。
- `npm run check -- --pretty false`、目标 ESLint、版本治理、更新说明治理、测试入口检查、生产构建与 `git diff --check` 均通过；仓库 `npm run test:analytics-browser` 在 Chromium 启动时因 macOS `bootstrap_check_in … Permission denied (1100)` 失败，未进入测试体；Chrome DevTools MCP 手动隔离验收已覆盖实际界面与只读重试。无 API、权限定义、数据库结构或真实业务数据变化。Android 仅同步版本元数据至 9.3.24/90324，未构建 APK。本地不提交、推送或部署。

## 2026-10-22 清单 P0/B2：选题阶段转换矩阵单一来源（v9.3.23）

- 当前代码中手动推进（`api/utils/workflow.ts`）与严格审批策略（`shared/workflow/policy.ts`）曾各自维护相同的阶段转换表。新增共享状态机 `shared/workflow/topic-state-machine.ts`，手动推进、严格审批、审核动作、自动交接、发布完成及选题仓储层条件状态更新均复用同一矩阵；普通资料更新类型不再接受 `status`，非法跳级和未知状态 fail-closed。合法转换没有改变，无数据库结构或历史记录变更。
- `test:topic-state-machine` 穷举所有状态对并比对共享规则、API guard 和严格工作流策略，并校验审核动作；仓储回归验证拒绝 pending→production 且不改阶段时间。隔离审批测试验证 pending→shooting 越级及 pending→archived 未知目标均返回 400，Topic 维持 pending，未创建阶段记录或审批记录。`test:workflow-stage-crud`、`test:topic-production-handoff`、`test:topics` 和工作流业务文案测试通过。
- 类型检查、目标 ESLint、版本一致性/治理、更新说明治理（467 个版本）、测试入口治理（250 个文件）、生产构建及 `git diff --check` 均通过；目标文件无新增 lint 警告；`api/routes/workflow.ts` 的 12 条警告与 HEAD 基线一致。构建仍提示既有 >500 kB 分包。此项仅收敛状态写入规则，不关闭 B2 全项：其它子记录状态语义和历史不一致仍需继续逐项核对；不根据现状推测或批量回填历史。Android 仅同步版本元数据至 9.3.23/90323，未构建 APK；本地不提交、推送或部署。

## 2026-10-22 清单 B4/B5：人员管理操作触控目标（v9.3.22）

- 人员管理列表的启用/禁用、编辑和删除按钮原有 56×34px / 28×28px；统一提升至至少 40×40px Studio 触控区，保持操作权限及业务行为不变。新增隔离浏览器断言覆盖 320/390/1440px 尺寸、视口边界和横向溢出。
- Playwright MCP / Chrome DevTools MCP 手动核验三种宽度：320px 下为 56×40、40×40、40×40px；390px 与 1440px 下三项均不小于 40×40px，页面无横向溢出。编辑弹窗打开并取消，隔离服务端 create/update/delete 写入计数均为 0；Chrome DevTools 当前页控制台无错误/警告。
- 类型检查、目标 ESLint、版本一致性/治理、更新说明治理（466 个版本）、Studio token 门禁、抖音逐条编辑范围专项、生产构建与 `git diff --check` 均通过；构建保留既有 >500 kB 分包提示。`npm run test:users-refresh-query-race-browser` 在 Chromium 启动时因 macOS `bootstrap_check_in … Permission denied (1100)` 失败，未进入测试体，不计自动化通过。无 API、权限、数据库或真实业务数据变化；Android 仅同步版本元数据至 9.3.22/90322，未构建 APK。本地不提交、推送或部署。

## 2026-10-22 清单 B4：窄屏编辑器弹层边界（v9.3.21）

- 320px Playwright MCP 隔离页实测发现编辑器“更多操作”菜单右边界超出 40px，文字颜色菜单超出 55px。现将标题、文字颜色、高亮、文件和更多菜单统一按弹层宽度及视口边界计算水平位置，并在更窄视口限宽；响应式回归覆盖标题、文字颜色、高亮和“更多操作”四种菜单在 320×812px 及 1024×600px/125% 缩放下的边界。
- Playwright MCP 复测浅色 320px：标题/文字颜色/高亮/更多菜单分别完整落入 x=89–217、63–239、105–281、8–232px；Chrome DevTools MCP 复核暗色 390px，文字颜色菜单 x=63–239px、“更多操作”x=115–339px。文档宽度分别 312/320px、382/390px，无横向溢出，开关菜单不写入稿件。`npm run check -- --pretty false`、目标 ESLint、版本检查/治理、更新说明治理、Studio token 门禁、测试入口检查、生产构建和 `git diff --check` 通过；本轮未运行仓库 Chromium 自动化套件。
- 无 API、权限、数据库或业务数据变化；保持 v9.3.21，不部署、不提交或推送。

## 2026-10-22 清单 B4/B5：公共壳层触控目标（v9.3.21）

- 全站窄屏检查发现公共顶部栏消息中心/主题切换为 38×38px、侧栏关闭按钮为 36×36px。现将其统一为 Studio `.xmt-btn-ghost` 40×40px；响应式回归区分真实移动壳层与窄屏桌面壳层，并检查消息/主题、导航打开/关闭与辅助技术可见状态。
- Playwright MCP / Chrome DevTools MCP 隔离页面复核：1440px 桌面消息/主题 40×40px；窄屏桌面导航开/关均 40×40px，关闭后 `aria-hidden=true`；真实 320px 移动壳层的返回/退出为 44×44px。页面无横向溢出；DevTools 只有 reduced-motion 模拟提示，无页面错误。
- `npm run check`、定向 ESLint、版本检查/治理、更新说明治理（465 个唯一版本）、Studio token 门禁、生产构建和 `git diff --check` 通过。构建保留既有 >500 kB 分包提醒（Tiptap 555.12 kB、主入口 699.59 kB、SilkBackgroundAdapter 843.50 kB）；仓库浏览器自动化因 macOS `bootstrap_check_in … Permission denied (1100)` 未进入测试体，不计通过。无 API、权限、数据库或业务数据变化；本地不提交、推送或部署。

## 2026-10-22 清单 B4/B5：复盘行动项详情触控（v9.3.21）

- 按清单继续复盘详情窄屏验收：详情抽屉标题、负责人、截止日期、状态、说明和处理结果均使用 Studio `.xmt-field`；单行控件为 40/42px，文本区为 112/128px，并允许垂直调整。响应式回归增加六字段名称、可见性、尺寸和抽屉边界断言；无业务行为、权限或数据规则变化。
- Playwright MCP 隔离页面测量浅色 320/390/1440px、Chrome DevTools MCP 测量深色 320/390px；抽屉留在视口内，文档无横向溢出，字段尺寸达标，控制台 0 错误/警告。仓库 `test:retro-action-table-responsive-browser` 在 macOS Chromium `bootstrap_check_in … Permission denied (1100)` 启动阶段失败，未进入测试体，不计自动化通过。
- 按用户确认复核抖音批量关联遵循逐条编辑范围；现有隔离专项测试通过，创建人/负责人/发布参与者范围外记录不写入且不进入统计，管理员全量编辑能力保持。无需重复变更权限代码。
- `npm run check`、目标 ESLint、版本检查/治理、更新说明治理（465 个唯一版本）、`npm run test:publishing-douyin-link`、`npm run build` 及 `git diff --check` 通过；生产构建仍提示 Tiptap、主入口和 SilkBackgroundAdapter 分包大于 500 kB。未连接真实业务账号或写入业务数据；Android 原生专项未开展，版本元数据不变。本地不提交、推送或部署。

## 2026-10-22 清单 B4/B5：复盘中心筛选与短标题触控（v9.3.21）

- 复盘中心移动页面实测发现状态/类型筛选只有 37px，且筛选控件没有可访问名称；短标题的列表详情按钮实测会缩至 20px。筛选改为 Studio `.xmt-field`、补充状态/类型/起止日期读屏名称；标题入口使用 Studio `ActionButton`，保持至少 40px 命中区。
- 浏览器交互还暴露了筛选触发不一致：修改控件会先触发自动读取，点击“应用筛选”又立即读取一次。现将编辑条件与已应用条件分离，多个条件只在显式点击后合并读取一次；加载中允许应用更新条件，已有请求序号/账号范围保护迟到结果。回归覆盖修改状态/类型/日期不发请求、一次应用恰好一个 GET、请求参数完整和旧响应不能覆盖新筛选。
- 响应式回归覆盖浅/深主题及 320/390/1440px，为四个筛选控件断言可见、可读名称和最小高度，并用短标题夹具防止详情入口退化。Playwright MCP 隔离页手动测量浅/深主题 × 320/390/1440px：字段 40/42px、短标题入口 40px、无页面横向溢出或应用内告警；并验证待应用条件零读取、一次应用一个带完整参数的 GET、迟到成功和 503 不覆盖/报错。仓库 Chromium 自动化在启动阶段因 macOS `bootstrap_check_in … Permission denied (1100)` 未进入测试体。截图保存在 `.playwright-mcp/xmt-retro-filter-320-light.png`、`.playwright-mcp/xmt-retro-filter-390-dark.png`、`.playwright-mcp/xmt-retro-filter-1440-dark.png`。权限和数据库规则未变。
- Android 仅同步 Gradle 元数据至 9.3.21/90321，未构建 APK；本地修改，不提交、推送或部署。B4/B5 全站审查、B8 其他读写闭环及清单 G 未闭合项仍继续推进。

## 2026-10-22 清单 B4/B5：复盘行动项表单触控尺寸（v9.3.20）

- 复盘行动项新增表单、行内状态选择和日报风险联动的风险/标题/负责人/日期字段中，原有多个原生控件低于 40px。统一改用 Studio `.xmt-field` 并设最小 40px 高；新增响应式断言覆盖创建字段、行状态与风险转换字段。没有改变提交、权限或数据行为。
- Chrome DevTools MCP 隔离合成页面在 320px 浅色、390px 深色与 1440px 桌面检查字段高度及页面宽度：可见字段均不低于 40px、文档无横向溢出、控制台无错误，桌面操作列仍为 sticky。仓库浏览器自动化在启动 Chromium 时因 macOS `bootstrap_check_in … Permission denied (1100)` 失败，未进入测试体；不能据此记为自动化通过。
- 抖音逐条编辑范围与官方数据窗口口径按用户确认再次核查：关联权限依据选题创建人/负责人/发布参与人，自动同步及批量刷新受同一范围约束；北京时间窗口专项测试覆盖当天端点。专项权限测试和日期测试通过。无 API、权限定义或数据库变更；Android 仅同步 Gradle 元数据至 9.3.20/90320，未构建 APK。本地不提交、推送或部署。

## 2026-10-22 清单 B4/B5：数据复盘筛选触控尺寸与 17 视口验收（v9.3.19）

- 失败态下数据复盘会按设计隐藏依赖完整团队统计的协作热力图；原浏览器用例在显式重试前就要求热力图存在，导致矩阵场景与错误恢复流程互相矛盾。保留初次 503、错误提示和只读恢复检查，将完整 17 视口矩阵移至成功重试后；未修改页面布局、业务逻辑或权限。
- 数据复盘年/月/选题筛选最小尺寸统一为 40×40px；移动端选题筛选增加滚动预留，避免聚焦后落入固定底栏遮挡区。Playwright MCP 本地隔离夹具实测 320/390px，以及 1366×768、1440×900、1920×1080 各自等效 80/90/100/110/125% 的 17 个 CSS 视口：报告中心/发布入口、年/月/选题筛选可见且可聚焦、无中心遮挡、排名和热力图可用左右方向键滚至尾部、页面无横向溢出。移动端壳层单独复核筛选控件尺寸和底栏避让。初次模拟 503 后显式 GET 重试恢复为 200；仅产生分析 GET，无业务写入。Chrome DevTools MCP 隔离页辅助树确认桌面卡片和热力图正常，截图验证深色移动及浅色桌面布局。Playwright MCP 截图层未绘出主内容，因此视觉截图采用 Chrome DevTools MCP；不影响 Playwright 页面交互与几何检查结果。
- 仓库 `npm run test:analytics-browser` 本轮复跑仍在 Chromium 启动阶段因 macOS `bootstrap_check_in … Permission denied (1100)` 失败，未进入测试体，不计自动化通过。本轮未提交、推送或部署；Android 只同步版本号至 9.3.19/90319，未构建 APK。B4/B5 全站审查、B8 其他读写闭环、G 指标口径/阈值与 Android 原生专项继续开放。

## 2026-10-22 清单 B4/B5：移动个人页与选题资料恢复触控尺寸（v9.3.18）

- 手机“我的”页三档字号按钮及移动选题详情“重新加载资料”提升至至少 40×40px；浏览器回归覆盖 320px 浅色、390px 深色、字号切换后布局、资源读取失败后的只读重试，并新增选题详情返回、编辑保存、审核展开/选择/确认的 40px 尺寸断言。偏好、权限和业务数据规则不变。
- Playwright MCP / Chrome DevTools MCP 隔离夹具已实测字号按钮尺寸、18px 偏好保存与窄屏布局；320px 资源 503 后重试按钮为至少 40px，点击仅重发 GET 并成功恢复。通知偏好页在 390×844 浅色、320×844 深色测得返回/开关/保存目标分别为 44×44、64px 高和 44px 高，无横向溢出；控制台 0 error/warning，网络只有偏好/渠道/事件三条 GET。未访问或写入真实业务数据。仓库浏览器自动化在 macOS Chromium `bootstrap_check_in … Permission denied (1100)` 启动阶段失败，未进入测试体，不计自动化通过。
- 按用户确认复核官方数据窗口：统一北京时间，近 7/30 天包含当天，昨天为前一自然日；`tests/creator/official-daily-calculation.test.ts` 3/3 通过。复核抖音批量关联遵循逐条编辑范围：普通编辑者只影响本人创建、负责或作为发布参与者的记录，范围外不写入、不计入汇总；旧格式与标准协议自动同步均使用账号所属用户范围，全局编辑者仍可处理剩余记录。`npm run test:publishing-douyin-link` 通过，均使用隔离数据库。
- `npm run check -- --pretty false`、目标 ESLint、`npm run test:mobile-layout`、版本/更新说明治理、Studio token 门禁、`git diff --check` 与 `npm run build` 通过；生产构建保留既有大分包提示（Tiptap 555.12 kB、主入口 698.32 kB、SilkBackgroundAdapter 843.50 kB）。Android 仅同步 Gradle 元数据至 9.3.18/90318，未构建 APK。本地不提交、推送或部署。

## 2026-10-22 清单 B4/B5：工作流列表与灵感卡片触控尺寸（v9.3.17）

- 发布管理表格的抖音关联、编辑、打开链接与删除操作，创作管理列表的查看/编辑，以及灵感卡片的投票、评论、转选题和删除操作，统一提升至至少 40×40px；图标按钮复用 Studio `ActionButton`，外链遵循 `.xmt-btn`。发布操作区桌面同排、窄屏可换行；创作列表在不加宽 104px sticky 操作列的前提下收紧间距，双按钮同排；灵感卡片窄屏主操作自动换行。状态核实入口同样达到 40px。回归增加亮/暗主题 320px 下目标尺寸、可视范围、固定列和桌面同行检查。
- Playwright MCP 隔离夹具实测发布列表 320px 亮/暗主题四个入口均为 40×40px、视口内可达且页面无横向溢出；固定操作列仍为 sticky，选题标题可读宽度 118px。1440px 亮色下四项同排。创作列表隔离夹具实测 320×568 浅色与 390×844 深色页面无横向溢出；查看/编辑均 40×40px、sticky 操作列可达且深色背景匹配令牌。灵感卡片在 320×900 浅色、390×844 深色及 1440×900 深色下四个主操作均至少 40×40px、视口内可达，页面无横向溢出。Chrome DevTools MCP 独立复核创作列表 320×568 深色标题可读宽度 150px、1440px 深色双按钮同排；发布列表 320×844 深色四项可达、标题宽 126px，1440px 亮/暗同排；灵感卡片 320×900 深色下标题区域宽 312px，1440×900 下操作目标尺寸达标。三个隔离页面控制台均无 error/warning。
- `npm run check -- --pretty false`、目标 ESLint、抖音关联范围、创作列表更新合同、灵感 topic-link/atomicity 回归、版本检查/治理、更新说明唯一性（461 个版本）、Studio token 门禁、`git diff --check` 和最终生产构建通过；构建保留既有大分包提示（Tiptap 555.12 kB、主入口 697.98 kB、SilkBackgroundAdapter 843.50 kB）。三项仓库浏览器自动化均在 Chromium 启动前受 macOS `bootstrap_check_in … Permission denied (1100)` 阻断，未进入测试体，不计自动化通过。无 API、权限或数据库变化，未触发业务写入。Android 仅同步 Gradle 元数据至 9.3.17/90317，未构建 APK。本地不提交、推送或部署。

## 2026-10-22 清单 B4/B5：选题表格操作区命中尺寸与响应式可达性（v9.3.16）

- 桌面选题表格“查看/删除”原为绕过共享控件的 32×32px 按钮；改用 Studio `ActionButton` 图标变体并设为 40×40px，不改变操作、权限或数据规则。`tests/browser/topics-list-responsive.spec.ts` 在既有 1366/1440/1920px、80%–125% 等效布局视口检查中新增最小目标尺寸断言。
- Playwright MCP 隔离合成夹具手验：1440px、1093px（125% 等效窄布局）与 1920px 操作按钮均为 40×40px；1093px 表格横向滚至末端后查看/删除仍在视口内。320/390px 移动列表无横向溢出，搜索标签区域高 44px、筛选按钮至少 40px；320px 看板横向滚动可到达全部 7 个阶段，文档宽 312px，不被阶段列撑宽。亮/暗 hover 未见新可读性问题；console 无 error，有 1 条 React Bits 为 topic-card 使用安全官方映射的 warning。
- `npm run test:topics`、`npm run check`、定向 ESLint、`npm run build`、版本/更新说明治理通过；构建保留既有大分包提示。仓库 `npm run test:topics-responsive-browser` 在测试体前因 Chromium `bootstrap_check_in … Permission denied (1100)` 失败，不计自动化通过。未触发选题业务写入；无 API、权限或数据库变化。Android 仅同步 Gradle 元数据至 9.3.16/90316，未构建 APK。本地不提交、推送或部署。

## 2026-10-22 清单 B4/B5：创作、拍摄与发布详情手机触控尺寸

- 在 v9.3.15 同一批次补齐三类详情页：拍摄详情的“返回制作列表”“展开信息栏”和共享编辑器“复制全文”设为至少 40px；发布详情“返回发布管理”从 22px 提至 40px，版本历史来源稿入口从 36px 提至 40px；创作详情返回、两处关联选题、历史侧栏开关及分页“查看更多历史版本”增加 40px 最小高度/宽度。响应式浏览器回归新增创作详情返回/关联/侧栏、发布页返回/编辑/保存/取消/复制/来源稿和拍摄页返回/信息栏/复制操作的最小触控尺寸断言，未改 API、权限、状态流转或保存规则。
- Chrome DevTools MCP 隔离合成夹具手验发布详情：320×844 浅色下返回入口 288×40、当前来源稿入口 140×40，编辑态复制全文 70×40；390×844 深色下返回 358×40、来源稿 140×40；1440×900 深色下返回 112×40、来源稿 140×40。三种视口页面宽度均与视口一致，无横向溢出。另在 Playwright MCP 的本地隔离夹具中保存一条合成小版本，验证历史来源入口 147×40、点击准确打开只读创作 v1.0；当前稿来源入口也准确打开相同版本。320px 下文档宽 312/320、控制台 0 error/warning。该次模拟 PUT 只写入本机夹具。仓库浏览器套件仍因 Chromium 启动权限失败而未进入测试体，故不计自动化通过。
- Playwright MCP 隔离合成夹具验收创作详情：先以桌面布局打开 `/production/content/77`，再缩至 320×812、390×844 和 1440×900；返回键、顶部关联选题、侧栏关联选题、历史侧栏开关均为至少 40×40px，文档宽度分别为 312/320、382/390、1440/1440，无横向溢出。控制台 error/warning 均为 0，业务请求只有详情、选题、历史、资料 GET 和 Socket.IO 握手。夹具没有下一页历史数据，因此“查看更多历史版本”本轮未渲染；只验证其源码已增加 `min-h-10`。
- 上述新增触控操作统一改用共享 `ActionButton`，保留轻量次级/幽灵按钮语义，并为图标入口补齐明确辅助名称；不新增组件或按钮样式。
- 共享按钮更新后用 Playwright MCP/Chrome DevTools MCP 复验：创作详情 320px 返回/侧栏开关 40×40、复制全文 70×40；390px 页面宽 382/390、1440px 为 1440/1440，历史侧栏收起/展开及辅助名称切换正常。发布详情 320px 返回 114×42、编辑 106×40，编辑后取消恢复；点击返回可打开列表。拍摄详情 320px 返回/信息栏开关 40×40、复制全文 70×40，信息栏开关来回切换正常。发布与拍摄列表 320px 可见操作/搜索框均至少 40px 高，页面宽 312/320；上述交互未产生业务写入。测试夹具的通用 API 空响应原先漏掉发布列表 `summary`，从详情返回会触发测试环境错误覆盖；已补齐空汇总字段并重启夹具验证返回列表正常。该错误只来自测试夹具，不是产品页面故障。
- 拍摄详情此前在 320×844 浅色、390×844 深色、1440×900 深色的 Chrome DevTools MCP 合成夹具验收也通过：返回、信息栏开关及编辑器复制全文均为至少 40px，无横向溢出；开关可用，控制台无错误/警告。早期探索时曾误点一次“完成制作”，仅向本机隔离夹具发模拟 PUT；随即停止并重启夹具，模拟状态已丢弃，未触及真实业务系统；最终验收没有业务写入。
- 按用户确认的范围复核抖音批量关联：普通 director 即使可全局查看，也只匹配本人创建、负责或作为发布参与者的记录；范围外不写入、不进入结果统计，后台账号同步也按该账号的逐条编辑范围过滤。管理员/可全局编辑角色仍可全量刷新。`npm run test:publishing-douyin-link` 通过，未扩大权限。
- 本轮复验：`npm run check`、详情组件与两项浏览器用例定向 ESLint、`npm run version:check`、抖音关联 API 回归、`npm run test:changelog-governance`（459 个版本）、`npm run test:version-governance`、Android runtime/endpoint contract 和 `npm run build` 通过。构建仍提示既有大分包：tiptap 555.12kB、主包 697.29kB、SilkBackgroundAdapter 843.50kB。两项仓库响应式 Playwright 自动化在 Chromium 启动阶段因 macOS `bootstrap_check_in … Permission denied (1100)` 失败，未进入测试体；不计自动化通过。`npm run test:android-build-endpoints` 因本机未生成 `dist/xmt-mobile-build.json` 而无法执行该清单；按用户“安卓端放在以后的专项”约定，不构建 APK。
- B4/B5 的全站尺寸、主题、悬停与对比度审计仍未完成；本项只关闭三类详情页的这些移动触控子项。本地不提交、推送或部署。

## 2026-10-21 清单数据日期窗口：按用户确认补齐边界合同

- 用户确认官方数据日期均按北京时间；近 7 天/近 30 天包含采集日，昨天仍严格指采集日的前一自然日。扩展 `tests/creator/official-daily-calculation.test.ts`，覆盖三种窗口完整性、昨天不含当天、缺日/重复日/未来日拒绝，以及北京时间零点切日。
- 逐日计算测试、`npm run test:creator-sync-v2102`、`npm run test:integrity:workflow` 和 `npm run check` 通过；不涉及真实数据写入。数据窗口已有服务端校验，本轮补强回归，不改业务算法。

## 2026-10-21 清单 B1：创作重复候选只读复核

- 对本地 `data/xmt.db` 以 SQLite immutable read-only 模式检查；该文件最后修改于 2026-09-27，本轮未发现 WAL/SHM 旁文件。共 48 条创作记录、47 个选题；同选题/同版本/同操作人仅有 1 组双记录（topic_id 135），两条正文不同；完全一致的重复组为 0。
- 旧本地快照且正文差异不能证明记录应合并；只比较正文是否完全相同，未回显、记录或披露正文内容，也未修改数据库。该候选继续人工核对，不据此声称生产数据已复核。

## 2026-10-21 清单 B2：本机提报草稿子项复核

- `AddTopic` 已提供账号隔离的多份本机草稿、切换/新建/删除和存储失败反馈；只有提交审核成功后才创建正式选题。`npm run test:mobile-safe-draft` 通过。
- 这符合清单“真实草稿或本地草稿 + 续写列表”的备选方案，但不会跨设备同步；不关闭 B2，其余阶段真源、副表语义及历史错位仍未收敛。

## 2026-10-21 清单 B8：品牌 Logo 操作反馈复核

- 当前选择图片时明确提示“Logo 已选择”且说明仅更新本页预览；只有“保存品牌设置”接口成功回执后才提示保存成功，失败保留当前输入并明确报错。`npm run test:system-settings` 通过；本项为源码与 API 调用顺序复核，非真实账号浏览器验收。

## 2026-10-21 清单 B4/B5：创作者数据趋势页与隔离浏览器夹具

- Playwright 插件不在本会话工具列表；仓库 `npm run test:creator-trends-browser` 在 Chromium 启动前因 macOS `bootstrap_check_in … Permission denied (1100)` 失败，未进入断言。改用仓库 `--mcp-fixture` 隔离服务，经 Playwright MCP/Chrome DevTools MCP 操作合成账号；1440px 暗色、390px 亮色和 320px 暗色均未见横向溢出，路由/页面身份正确、无空白页/框架覆盖或应用 console error。
- 手动切换 7 天看到合计 300；90 天缺少完整连续日期时只显示“趋势数据不完整”，未渲染指标卡片/合计。注入一次夹具专用 503 后，页面明确显示当前周期读取失败且不残留上一周期数据；点击“重新读取”后仅重试趋势 GET 并恢复指标。
- 发现原浏览器夹具的硬编码 Socket.IO 握手会造成无限重连；`tests/browser/creator-trends-official-daily.spec.ts` 已改用真实本机 Socket.IO 服务。修正后 DevTools 确认 Socket.IO 成功连接，XHR/fetch 请求稳定在 10 条而非此前累计 1000 条轮询；趋势数据请求为 GET，唯一测试 POST 是 `/__test__` 故障注入，不涉及业务写入。
- `npm run check` 与官方逐日计算测试（3/3）通过。趋势截图保存在 `/private/tmp/xmt-creator-trends-qa-20261021.EIseVb/`。本项为合成数据人工浏览器验收，不代表仓库 Chromium 自动化套件已通过，也不关闭 B4/B5 全站审查。

## 2026-10-21 清单 B9：登录安全升级管理员明细复核

- Playwright MCP 在 `XMT_AUTH_ROLLOUT_THEME_QA_SERVE=1` 本机隔离合成夹具中复核 `/admin/auth-rollout`：深色 320px 及浅色 1440px，页面均无横向溢出；管理员技术明细默认收起，展开后“状态生成时间”仅出现一次。页面身份和业务状态文案可见，过程只做读取/视口检查，没有触发业务写入。
- 这是人工隔离验收，不计仓库浏览器自动化通过；未发现需修改的代码问题。上一轮怀疑的重复字段是相邻输出边界重复显示同一源码行，并非产品缺陷。

## 2026-10-21 清单 B9：设置中心信息与权限边界复核

- 代码路径复核确认：设置页需登录；系统/品牌/登录配置只在 `system:settings` 权限下加载，备份仅在 `system:backup` 权限下展示/读取；对应系统配置与备份 API 也逐路由强制同一权限。所有账号可见的“关于系统”只包含已配置的产品/品牌说明、用户角色与应用版本，不再展示 Express、SQLite、Socket.IO 等实现栈信息。
- `npm run test:system-settings` 通过（默认配置与主题优先级）。本项是路由、前后端权限条件和内容映射代码审查，未使用真实账号；浏览器角色切换验收未执行。未发现需修改的产品代码问题，本项不代表 B9 全部关闭。

## 2026-10-21 清单 G：首页关注事项与多平台发布回归复核

- 服务端首页摘要用北京时间当前日期/时刻，阶段停留阈值为严格超过 2 天；关注事项和在进行总数排除已完成/已退回记录，空/无效阶段时间单列为“待确认”而不推断为卡点，关注总数用选题 ID 去重。普通发布任务范围包含发布操作人；选题范围按创建人/负责人或全局查看权限计算。
- `npm run test:home-dashboard` 通过：覆盖逾期、截止临近、两天阈值前后 30 秒、未知/无效阶段时间、成员范围、全量计数、今日多平台任务以及已有平台发布/全部异常后的任务处理规则。只写入临时测试库，无真实业务数据变更；本项是 API/规则回归，不代表桌面或移动首页本轮浏览器验收。
- 未改产品代码。清单 G 的自审/审核责任边界、播放骤降阈值及跨模块可信指标源仍需产品规则/可靠数据口径，不在本轮臆造；B4/B5 与 B8 其余范围继续开放。

## v9.3.14 清单 B4/B5：发布平台标识显示为业务名称

- `src/platform/platform-labels.ts`：以 `PLATFORMS` 为唯一已知平台名称来源，按大小写不敏感方式映射代码，保留已本地化和自定义名称，空值交由调用处使用各自占位语义。
- `src/components/studio/PlatformBadge.tsx`、发布/选题列表、看板、详情预览、工作台任务、周报、模板列表、内容资料与历史归档视图：所有已知平台代码统一显示业务名称，筛选仍使用原值，编辑输入不被格式化后回写；自定义名称原样保留，历史资料别名仍兼容。小红书和微信视频号继续使用已有 Studio 语义色。
- `tests/platform/platform-labels.test.ts`：覆盖六种平台代码、自定义/本地化/空值以及徽标名称与语义色；`tests/browser/publishing-hover-contrast.spec.ts` 增加列表、详情不泄漏 `douyin` 的回归。
- Codex Browser 插件不在本会话工具列表中，按用户已授权路径使用 Playwright MCP。隔离合成数据实测从发布列表进入详情：320×844 浅/深主题及 1440×900 深色桌面均呈现“抖音”，页面正文未出现 `douyin`，页面宽度分别为 312/320 与 1440/1440，无空白页或错误覆盖层。当前页控制台 error/warning 为 0；业务 API 请求均为 GET，未触发业务写入。页面身份及标题匹配；截图证据保存于 `/private/tmp/xmt-publishing-platform-labels-320-dark.png` 与 `/private/tmp/xmt-publishing-platform-labels-1440-dark.png`。
- 通过：`npm run test:platform-labels`（3/3）、`npm run test:entrypoints`（248 个文件）、`npm run check`、版本/更新说明治理、Android runtime 合同、Studio 令牌门禁、`git diff --check` 与生产构建（仍提示若干既有分包超过 500kB）。定向 ESLint 0 错误、11 条现存警告（Kanban/TopicDetail 的未使用符号及既有依赖数组提示）。`npm run test:publishing-hover-contrast-browser` 实际运行后因 macOS Chromium 启动阶段 `bootstrap_check_in org.chromium.Chromium.MachPortRendezvousServer … Permission denied (1100)` 失败，未进入测试体，不计自动化通过；Playwright MCP 结果单独记录为手工验收。
- 无 API、权限、数据库、颜色令牌或真实业务数据变化；Android 仅同步 Gradle 元数据至 9.3.14/90314，未运行 Capacitor sync 或构建 APK。本地不提交、推送或部署；B4/B5 全站审查及其他 G/B8 项继续。

## v9.3.13 清单 B4/B5：活动日志窄屏布局与触控目标

- `src/pages/ActivityLog.tsx`：手机端将标题和成员筛选分层排列，时间戳不再挤压活动内容；窄屏分页改为上下布局。成员筛选、上一页/下一页、页码和只读恢复按钮统一达到至少 40px 高，并使用既有 Studio/XMT 按钮令牌。
- `tests/browser/activity-log-read-recovery.spec.ts`：增加 320px 错误态布局、标题/筛选不重叠、筛选/恢复/分页 40px 触控尺寸、分页控件不越界和 1440px 桌面溢出回归；窄屏切换后先等待布局稳定，再检查溢出。
- Playwright MCP 隔离合成数据人工验收：`http://127.0.0.1:4173/activity` 的 320×844 浅/深主题、390×844、1440×900；实测初次成员筛选及日志 503 错误下三种控件均为 40px，标题、筛选和错误操作分层且无横向溢出。重试仅发 GET，恢复后记录可见；页码按钮及上一页键盘 Enter 可在第 1/2/3 页间切换，`aria-current` 唯一且正确。确认写入数为 0、无框架错误覆盖；通过本地 Socket.IO 空夹具后，控制台没有非预期错误/警告，页面特意注入的两次 503 除外。截图：`/private/tmp/xmt-activity-log-320-light.png`、`/private/tmp/xmt-activity-log-320-dark.png`、`/private/tmp/xmt-activity-log-320-error.png`、`/private/tmp/xmt-activity-log-1440-light.png`。
- Browser 插件不在当前会话工具列表中，按用户已授权路径使用 Playwright MCP；仓库自动化 `npm run test:activity-log-browser` 因 macOS Chromium `bootstrap_check_in … Permission denied (1100)` 在测试体前失败，不计自动化通过。通过：`npm run check`、目标 ESLint、`npm run test:activity-log`、版本检查/治理、更新说明治理（457 个唯一版本）、Android runtime 合同、Studio 令牌门禁（38 类）、`git diff --check` 和生产构建；构建仍有既有 >500kB 分包提示。
- 另按用户确认的规则复核抖音批量关联：遵循逐条编辑权限范围，范围外不关联、不计入结果，全局编辑者仍可全量刷新；`npx tsx tests/publishing/publishing-douyin-link.test.ts` 通过，未扩大权限。
- 无 API、权限模型、数据库或真实业务数据变化；Android 仅同步 Gradle 元数据至 9.3.13/90313，未运行 Capacitor sync、未构建 APK。本地不提交、推送或部署；B4/B5 全站验收及其他 G/B8 项继续。

## v9.3.12 清单 B4/B5：内容动态移动触控目标

- `src/pages/ContentTimelineView.tsx`：文档选择框、“查看”和“重新读取内容动态”按钮统一设为 40px 高，保留现有流程、主题令牌和只读恢复逻辑。
- `tests/browser/content-timeline-read-recovery.spec.ts`：增加 320/390px 浅/深主题和 1440px 桌面溢出检查，以及选择框、查看和错误恢复控件的 40px 尺寸断言；读取错误状态也覆盖移动触控尺寸。
- Playwright MCP 本地隔离夹具人工验证详情读取 503→显式 GET 重试恢复，历史读取 503 保留上次成功动态并标明可能过期→重试恢复；延迟 A 文档响应后切换 B，A 的迟到响应未污染 B 的确认空态，最近更新时间/版本数/参与人数显示“暂无记录/0/0”。320/390px 两种主题与 1440px 桌面无横向溢出，目标入口实际高度均为 40px，业务写入数为 0。控制台错误仅为夹具故意注入的 503，未见其他警告；无框架错误覆盖层。
- 通过：`npm run check`、目标 ESLint、`npm run build`、版本/更新说明/Android runtime 治理与 `git diff --check`。`npm run test:content-timeline-read-recovery-browser` 因 macOS Chromium `bootstrap_check_in … Permission denied (1100)` 在浏览器启动阶段失败，未进入测试体，不计自动化通过。构建仍提示既有 >500kB 分包（最大 SilkBackgroundAdapter 843.50kB）。
- 无 API、权限、数据库或真实业务数据变化；Android 仅同步版本元数据至 9.3.12/90312，未运行 Capacitor sync、未构建 APK。本地不提交、推送或部署。B4/B5 全站审查及其他 G/B8 项继续。

## v9.3.11 清单 B4/B5：移动资料中心子页返回路径

- `src/platform/mobile-layout.ts`、`src/components/mobile/MobileShell.tsx`：移动端从资料中心打开资料库子页后，默认返回目标为资料中心总览；移动应用栏显示“资料中心”。有效的一次性移动返回目标继续优先，不改变桌面导航。
- `tests/mobile/mobile-layout.test.ts` 与 `tests/browser/asset-center-partial-read.spec.ts`：覆盖资料中心子路由回退目标；320/390px 隔离浏览器逐一打开项目、内容档案、知识库和素材归档，再通过顶栏返回总览，断言标题、路由、移动壳层与无横向溢出。
- Playwright MCP 四条入口/返回路径人工复核通过；Chrome DevTools MCP 390×844 浅色复核项目资料库页面与“资料中心”顶栏。合成账号/数据，全程无业务写入，页面只有夹具初次故意注入的 503 错误，无警告。
- 通过：`npm run test:mobile-layout`、`npm run check`、目标 ESLint、`npm run version:check`（v9.3.11）、版本/更新说明治理、Android runtime 合同与 `git diff --check`。`npm run test:asset-center-partial-read-browser` 在本机 Chromium 启动阶段因 `bootstrap_check_in … Permission denied (1100)` 失败，未进入测试体；不计自动化套件通过。此轮没有改 API、权限、数据库或真实业务数据。
- Android 仅同步 Gradle 元数据至 9.3.11/90311，未运行 Capacitor sync、未构建 APK；本地不提交、推送或部署。B4/B5 全站验收及其他 G/B8 项继续。

## v9.3.10 清单 B4/B5：资料中心总览主题、窄屏与键盘验收

- `tests/browser/asset-center-partial-read.spec.ts`：保留资料库局部读取失败与显式重试回归，增加 390px 浅色、320px 深色和 1440px 桌面的无横向溢出/卡片边界检查；验证 Tab 焦点可见、资料库卡片导航正确且未触发资源写入。夹具提供 `XMT_ASSET_CENTER_QA_SERVE=1` 服务模式，供已连接浏览器工具手工验收。
- Playwright MCP 本地隔离页面实测资料中心 1440px 浅色局部失败提示→重试恢复，390px 浅色及 320px 深色全部卡片完整可见，无横向溢出；键盘 Tab 有可见焦点。桌面壳层在 1440px 重载后，依次通过四张卡片打开项目资料库、内容档案库、知识库及素材归档库，页面标题和侧栏选中项均匹配；全程合成用户和数据，资源请求为 GET。控制台仅有夹具注入的预期 503 错误，无其他错误/警告。
- 通过：`npm run check`、目标 ESLint、`npm run version:check`（v9.3.10）、`npm run test:version-governance`、`npm run test:changelog-governance`（454 个版本）、`npm run test:android-runtime`、`git diff --check` 与 `npm run build`。`npm run test:asset-center-partial-read-browser` 因 macOS Chromium `bootstrap_check_in … Permission denied (1100)` 在启动阶段失败，未进入测试体，不计为自动化套件通过。
- 未发现需要改产品界面的缺陷；除验收回归/夹具和版本记录外，无产品代码、API、权限、数据库或真实业务数据变化。Android 仅同步 Gradle 元数据至 9.3.10/90310，未运行 Capacitor sync、未构建 APK。本地不提交、推送或部署。B4/B5 全站验收与未闭合 G/B8 项继续。

## v9.3.9 清单 B8：发布剧本手动保存等待结果

- `src/components/editor/Editor.tsx`、`src/components/ContentEditor.tsx`：手动保存回调允许异步返回；编辑器保持“保存中”直至回调完成，只在确认成功后显示同步完成，显式未确认或失败显示异常状态，并阻止同一编辑器重复触发保存。Meta/Ctrl+S 通过最新回调引用执行，避免 Tiptap 保留旧闭包、把初始稿误当最新稿提交。
- `src/pages/PublishingDetail.tsx`：剧本保存回调返回明确结果；HTTP 成功响应或后续只读核实确认目标内容/版本后才判定保存成功，仍为原内容、冲突或核实失败均不冒充成功，也不自动重发写请求。
- `tests/editor/manual-save-confirmation.test.ts`：覆盖异步确认前不完成、明确未确认、回调失败及同步 `void` 回调兼容；新增 `npm run test:editor-manual-save`。`tests/browser/publishing-hover-contrast.spec.ts` 补充 Meta+S 最新稿、延迟回执期间不提前显示成功、503 未提交保留草稿且不自动重试的隔离回归。
- 抖音批量关联遵循本轮确认的逐条编辑范围。`npm run test:publishing-douyin-link` 通过：创建人、负责人及发布负责人范围内记录可关联；范围外不写入、不计入摘要；管理员仍可全量刷新。抖音测试中的归档故障为隔离库注入并按预期确认部分完成，不涉及真实数据。
- 通过：`npm run test:editor-manual-save`（3/3）、`npm run test:publishing-douyin-link`、`npm run version:check`（v9.3.9）、`npm run test:version-governance`、`npm run test:changelog-governance`（453 个版本）、`npm run test:android-runtime`、`npm run check`、目标 ESLint、`git diff --check` 与 `npm run build`。Playwright MCP 在本机隔离页面实际验证：延迟成功期间显示“保存中”、确认后只写入一次最新稿；注入 503 未提交后保留草稿并显示“存在冲突”，只发生一次 PUT 和一次只读 GET。预期控制台错误仅为夹具注入的 503。仓库 `npm run test:publishing-hover-contrast-browser` 因 macOS Chromium `bootstrap_check_in … Permission denied (1100)` 在启动阶段失败，未进入测试体，不计自动化套件通过。构建保留既有大分包提醒（主入口 694.95 kB、Tiptap 555.12 kB、Silk 843.50 kB）。
- 无 API、权限、数据库或真实业务数据变化；Android 仅同步 Gradle 版本元数据至 9.3.9/90309，未运行 Capacitor sync、未构建 APK。本地不提交、推送或部署。继续 B4/B5 其余页面验收及未闭合 G/B8 项。

## v9.3.8 清单 B4/B5：桌面及移动选题详情读取状态

- `src/pages/TopicDetail.tsx` 与 `src/pages/mobile/MobileTopicDetail.tsx`：区分确认 404 与网络/服务暂时不可用。暂时失败展示不含接口响应内容的页面级错误说明和 GET-only“重新加载选题详情”；确认 404 说明记录不存在或不可访问，不提供无意义重试。切换详情 ID 后清空旧记录，避免新详情读取失败时继续显示上一条。
- `tests/browser/topics-list-responsive.spec.ts`：增加桌面、320px 移动路由隔离回归。分别验证初次 GET 503、错误内容不泄漏、明确重试恢复、请求方法始终为 GET、真正 404、同组件切换选题 ID 后失败不残留旧记录与无横向溢出；移动恢复状态核对标题字段值。
- Playwright MCP 隔离合成页手工复核桌面和 320×812 移动端的 503→错误→明确重试→详情恢复及 404；移动页无横向溢出，并实测同组件切换 ID 后 503 不残留旧内容。控制台只记录夹具故意返回的 HTTP 503/404；手工 history 注入产生一条 React Router 测试警告，不属于应用交互，自动化夹具携带 router history state 避免该告警。截图保存在 `/private/tmp/xmt-topic-detail-qa-2026-10-21/`。仓库 `npm run test:topics-responsive-browser` 在 macOS Chromium `bootstrap_check_in … Permission denied (1100)` 启动阶段失败，未进入测试体，不计为自动化套件通过。
- 通过：`npm run check`、`npm run test:topics`、`npm run test:topic-production-handoff`（4/4）、`npm run test:topics-list-notify`、`npm run test:topic-stage-timestamp`、选题聚合草稿与编辑器分支单测、`npm run version:check`（v9.3.8）、版本治理、更新说明治理（452 个唯一版本）、Android runtime 合同、目标 ESLint（0 错误；选题桌面文件保留 5 条既有 warning）、`git diff --check` 与 `npm run build`。生产构建通过；大分包提醒仍在（主入口 694.69 kB、Tiptap 555.12 kB、Silk 843.50 kB）。
- 无 API、权限、数据库或真实业务数据变化；Android 仅同步 Gradle 元数据至 9.3.8/90308，未运行 Capacitor sync、未构建 APK。本地不提交、推送或部署。继续 B4/B5 其余全站状态验收及未闭合 G/B8 项。

## 2026-10-21 清单 B4/B5：排期日历状态与窄屏复核

- 在 `tests/browser/calendar-month-request-race.spec.ts` 的本机隔离合成夹具中复核 1440px 桌面及 390px/320px 窄屏；浅/深主题的页面宽度均未超过视口，窄屏上月/下月按钮保持 40px 高，未见错误覆盖层。浅色主题 390px/320px 均显示“近期暂无排期事项”空态；1440px 上普通文字采样通过现有对比度算法测得浅色 6.52:1–7.45:1、深色 7.00:1–8.29:1，均高于 4.5:1。
- 人工延迟前一月份响应后切回当前月份：旧成功响应与旧 503 均不覆盖当前月份、不触发当前月错误态。另对当前月注入一次性 503，页面明确显示“日历加载失败”与“重试加载”；用户触发重试后恢复正常，业务读请求为 GET。全程仅使用本地合成数据。
- 这是隔离浏览器人工复核，不计为 Playwright 自动化套件通过；未修改产品代码、API、权限或数据。本轮 `npm run test:publishing-douyin-link` 另行通过，确认抖音批量关联继续遵循逐条编辑范围：范围外记录不写入/不进入统计，全局编辑者保留全量刷新。B4/B5 全站审计及 G/B8 未闭合项继续开放。

## 2026-10-21 清单 B4/B5：发布管理窄屏操作列复核

- 以 `tests/browser/publishing-hover-contrast.spec.ts` 的本机隔离合成夹具检查 1440px 浅色、390px 浅色及 320px 明/暗主题。页面宽度未超过视口（390px 下为 382px；320px 下为 312px）；320px 表格保留内部横向滚动，操作列 `position: sticky` 固定在滚动区右侧，编辑/关联/删除操作在视口内，标题仍留出 118px 可见宽度；深色固定操作面使用当前 `--xmt-surface` 令牌。页面无错误覆盖层，控制台 0 error / 0 warning。
- 只做隔离页面读取、滚动与主题切换，没有触发关联、删除、编辑或真实业务写入；这是 MCP 人工验收，不计为仓库 Playwright 自动化套件通过。未发现需要修改的裁切/暗色残留问题，未改产品代码、API、权限或业务数据；B4/B5 全站审计继续开放。

## v9.3.7 清单 B4/B5：编辑器窄屏选区工具栏

- `src/components/editor/BubbleMenu.tsx`：窄屏工具栏允许换行并限制为视口宽度；触控按钮/色块最小 40×40px。文字颜色和高亮弹层最小宽度调整为 216px，容纳 4 列 40px 色块及 10px 间距；在 640px 以下锚定触发按钮右缘，桌面仍单行居中。
- `tests/browser/production-review.spec.ts`：新增 320px/390px、浅/深主题选区工具栏回归，覆盖控件边界/命中区域、悬停文字对比度、文字色/高亮弹层边界与色块尺寸，并核对夹具正文及已保存内容未变化。
- `src/pages/mobile/MobileProductionEditor.tsx` 与 `src/components/editor/WritingMetrics.tsx`：为关联选题选择框和写作目标数字输入补充 `name`，保留既有 label/aria-label 及受控状态逻辑；`tests/editor/writing-metrics.test.ts` 增加字段名与可访问名称回归。
- Chrome DevTools MCP 在 390px 深色隔离页复核两个字段现都有 `name`，字段标识 Issue 消失，控制台无 error/warning；只查看合成页面，没有业务写入。
- Chrome DevTools MCP 与 Playwright MCP 在隔离合成页手工验收 320px 浅色、390px 深色：菜单分别为 304px/374px 宽；两种弹层为 216px 宽且均在视口内，40px 色块保留 10px 间距，页面无横向溢出；浏览器中未触发保存或修改正文。仓库 `npm run test:production-review-browser` 在 Chromium 启动阶段因 macOS `bootstrap_check_in … Permission denied (1100)` 失败，未运行到测试体，不计为自动化通过。
- 按用户确认复核官方数据日期口径：北京时间自然日，近 7/30 天包含当天，昨天为前一自然日；既有校验拒绝缺日、重复日期、无效日期及窗口外日期。`npx tsx --test tests/creator/official-daily-calculation.test.ts`（3/3）、`npm run test:creator-unified-reports`、`npm run test:creator-sync-v2102`、`npm run test:creator-agent-export-quality` 通过；现有逻辑符合已确认规则，无需另改。
- 按用户确认复核抖音批量关联遵循逐条编辑范围；`npm run test:publishing-douyin-link` 通过，已有路由/服务仅处理本人创建、负责或参与发布的选题，范围外不写入，全局编辑权限仍保留全量能力；本轮无需重复改动权限实现。
- 通过：`npm run check`、目标 ESLint（无错误/警告）、`npm run test:editor-writing-metrics`、`npm run version:check`（v9.3.7）、版本治理、更新说明治理（451 个唯一版本）、Android runtime 合同、`git diff --check` 与 `npm run build`。构建通过，保留既有大分包提醒（主入口 694.33 kB、Tiptap 555.12 kB、Silk 843.50 kB）。无产品 API、权限、数据库或业务数据变化；Android 仅同步 Gradle 元数据至 9.3.7/90307，未重生成 assets、未运行 Capacitor sync、未构建 APK。本地不提交、推送或部署。B4/B5 全站验收仍开放。

## v9.3.6 清单 B5：登录主题验收入口

- `tests/browser/login-theme-contrast.spec.ts`：新增 `XMT_LOGIN_THEME_QA_SERVE=1` 本机服务模式，仅启动使用合成 API 的 Vite/Express 夹具；默认模式仍运行原有自动化测试。
- Playwright MCP 在隔离夹具检查 style1/style2/style3 三种布局、浅/深主题及 320px/390px 视口；各页面无横向溢出、可见操作控件均在视口内，密码显隐按钮为 40×40px。style3 在深色系统主题下维持设计规定的浅色画布。320px 浅色登录失败状态的错误文字对比度为 6.86:1，提交按钮仍完整可见且页面无横向溢出；唯一控制台错误来自夹具预期的 401 拒绝。
- 合成首次改密交互确认：弹窗打开时背景设为 `inert` 且从辅助技术树隐藏；Shift+Tab / Tab 在首末焦点间循环；退出登录后弹窗关闭、背景恢复交互，焦点回到登录按钮。Chrome DevTools MCP 在隔离上下文复核 style2 深色 320×844，控件未越界，控制台 0 错误/警告。只提交本地合成登录请求，不使用真实账号或业务数据。
- `npm run test:login-theme-contrast-browser` 仍在 Playwright Chromium 启动前失败：macOS `bootstrap_check_in org.chromium.Chromium.MachPortRendezvousServer … Permission denied (1100)`；不计自动化套件通过。通过本机服务模式完成的 MCP 交互验收是单独的手工检查。
- 通过：`npm run check`、登录测试文件定向 ESLint（0 errors/0 warnings）、`npm run version:check`（v9.3.6）、版本治理、更新说明治理（450 个唯一版本）、Android runtime 合同、`git diff --check` 与 `npm run build`。构建保留既有大分包提醒（主入口 693.97 kB、Tiptap 555.12 kB、Silk 843.50 kB）。无产品 API、权限或数据库变化；Android 仅同步 Gradle 元数据至 9.3.6/90306，未运行 Capacitor sync 或 APK 构建。本地不提交、推送或部署。B5 全站审计仍开放，下一步继续检查清单中其余页面的浅/深主题、悬停与空/错状态。

## 清单 B4/B5 继续复核（v9.3.5）：全局搜索与创作详情

- 全局命令面板：Playwright MCP 隔离合成页在 320×812 浅/深主题复核，面板宽 248px、内容宽 246px 与可用宽度一致且未越界，页面无横向溢出；测得样本文字均未低于 4.5:1（浅色为初始导航状态、深色包括 `needle` 结果），占位符浅色 7.58:1、深色 8.01:1。单字符 `n` 未新增全文搜索请求；输入 `needle` 后六类来源均有 GET 结果，键盘移至第 4 项日报并回车，正确打开 `daily-report/summary?date=2026-09-29&userId=91`；Escape 恢复焦点至打开前控件。业务请求只读；控制台 0 错误、1 条既有 ReactBits 映射安全回退警告。
- 创作详情/编辑器：Playwright MCP 与 Chrome DevTools MCP 分别在合成创作记录 77 的 320×812 浅/深主题下交叉检查，正文无横向溢出，所有工具栏按钮 40×40 且命中测试通过；保存/提交按钮完整位于视口内，底边 739px，移动主导航从 747px 开始，间距 8px。可见普通文字最低对比度浅色 5.69:1、深色 5.97:1；提交按钮渐变两端白字最低分别为 4.8:1、5.01:1。桌面及缩放等效视口 1366/1440/1920/1708/1600/1309/1152px 全部没有横向溢出、工具栏或可见按钮越界；控制台 0 错误/警告。只检查，不点保存/提交。
- `npm run test:global-search-browser` 本轮尝试仍在 Chromium 启动阶段被 macOS `bootstrap_check_in org.chromium.Chromium.MachPortRendezvousServer … Permission denied (1100)` 阻断，未进入测试体；上面的 MCP 隔离页手工验证不记作自动化套件通过。无业务代码/API/权限/数据库变化，不升版本；本地不提交、推送或部署。B4/B5 全站审计仍开放，下一步继续检查其他状态与页面。

## v9.3.5 清单 B4：移动选题筛选按钮窄屏可见

- `src/pages/mobile/MobileTopics.tsx`：选题筛选由单行横向滚动改为自动换行，五个选项在窄屏均可直接看到；补充可访问的“选题筛选”分组名称，不改变筛选状态、查询参数或数据读取。
- `tests/browser/topics-list-responsive.spec.ts`：新增 390px 与 320px 移动视口回归，逐项检查五个筛选按钮在视口内、容器无需隐藏横向内容且页面无横向溢出。
- Chrome DevTools MCP 本地合成夹具浅色与深色 320×844/390×844 实测：五个筛选按钮全部在视口内，容器宽度分别为 288/358px 且 scrollWidth 等于 clientWidth，页面宽度等于视口；浅色 320px 文本/背景对比度为 5.13:1（选中）、7.58:1（未选中），深色 390px 为 5.44:1、8.01:1。点击“进行中”后 `topic_filter=active` 更新且按钮保持选中。业务 API 均为只读 GET；网络中唯一 POST 是 Socket.IO transport polling，不涉及业务写入；控制台无错误或警告。
- 本轮用户确认抖音批量关联遵循逐条编辑范围。复核现有路由与服务：非全局编辑账号仅匹配本人创建、负责或担任发布操作人的选题；范围外记录不写关联、不推进状态，也不计入摘要；全局编辑者仍可全量刷新。`npm run test:publishing-douyin-link` 覆盖这些边界并通过；该权限行为已在此前版本实现，本轮无需重复改写。
- 同一隔离夹具继续检查移动选题看板与真实选题详情 `/topics/951`：320px/390px 下看板列容器保留预期的横向滚动，滚到末尾可完整看到“已完成”，页面本身仍与视口同宽；320px 亮/暗主题详情操作按钮和字段均在视口内，页面无横向溢出，文字对比度至少 5.13:1（亮色）/5.44:1（暗色），没有点击保存或开工。
- 桌面看板在 1366/1440/1920px 及等效缩放视口 1708/1600/1309/1152px 检查：列滚动容器可到达“已完成”，审核按钮均留在列卡片内，页面宽度始终等于视口；深色文字最低对比度 8.29:1、亮色 7.45:1，亮/暗 hover 审核按钮分别为 15.89:1/15.23:1。直接加载看板时控制台无消息；仅在测试夹具缺少生产记录时点入 `/production/951` 曾产生 `/api/topics/undefined` 的 404，因此不将该无效合成路由纳入看板结果。
- 类型检查、定向 ESLint、`npm run test:topics`、`npm run version:check`（v9.3.5）、版本治理、Android runtime 合同、`git diff --check` 与 `npm run build` 通过；构建仍有既有大分包提醒。仓库 `npm run test:topics-responsive-browser` 本轮复跑时 Chromium 在测试体前以 `bootstrap_check_in … Permission denied (1100)` 退出；另外用手工隔离验收夹具和 Chrome DevTools MCP 完成浏览器检查，不把自动化套件记为通过。
- 无 API、权限、数据库或真实业务数据变化；Android 仅同步 Gradle 元数据至 9.3.5/90305，未重生成 assets、未运行 Capacitor sync、未构建 APK。本地不提交、推送或部署。B4/B5 全站验收继续，下一步检查其他状态的裁切及剩余亮色/暗色对比度。

## v9.3.4 清单 B4/B5：创作状态/焦点提示与选题页标题层级

- `src/components/editor/Editor.tsx`：关闭“查找替换”后把焦点送回原触发按钮；通过 Meta/Ctrl+F 打开时返回正文，关闭面板不触发正文保存或修改。
- `tests/browser/production-review.spec.ts`：增加按钮 Escape、关闭按钮、正文快捷键三条焦点回归，并断言合成稿件无保存记录。
- `src/components/ContentEditor.tsx`：协作连接但无人正在输入时显示“当前没有协作者正在编辑正文”，不再将空闲态说成系统正在同步；亮暗主题对比度回归同时检查这一状态文案。
- `src/components/studio/EmptyState.tsx` 与 `src/pages/Topics.tsx`：共享空态保留默认三级标题，只让选题管理的空结果/读取失败标题使用二级标题，修复页面一级标题后直接跳三级的语义缺口。
- `tests/browser/topics-list-responsive.spec.ts`：在隔离删除夹具最终呈现空选题列表时断言标题为二级标题。
- Chrome DevTools MCP 隔离合成页在深色 1440×900 桌面验证 Escape、关闭按钮和 Meta+F 三条焦点路径，在深色 390×844 移动视口验证 Escape；合成正文保持原样、保存计数为 0、页面宽度分别为 1440/390px。工具栏与查找面板在移动端正常换行，所有可操作控件均有读屏名称；选题页空态在桌面与手机均无横向溢出。编辑器桌面/手机和选题页 Lighthouse 的可访问性、最佳实践和 SEO 均 100；Agentic Browsing 的 `llms.txt` 格式建议与本次 UI 范围无关，未改动。
- Chrome DevTools MCP 在本地隔离选题夹具中通过实际 UI 删除合成选题后确认空态标题为二级标题、列表宽度无溢出；该页 Lighthouse 可访问性/最佳实践/SEO 均 100，Agentic Browsing 50 的唯一提示是既有 `llms.txt` 格式建议。正文编辑器深色 1440×900 与浅色 390×844 页的 Lighthouse 可访问性、最佳实践及 SEO 也均为 100。
- 通过：`npm run check`、目标 ESLint、`npm run version:check`（v9.3.4）、`npm run test:version-governance`、`npm run test:android-runtime`、`git diff --check` 与 `npm run build`。构建保留既有 >500 kB 分包提醒。`npm run test:production-review-browser` 和选题响应式浏览器套件在测试体前均因 macOS Chromium `bootstrap_check_in … Permission denied (1100)` 无法启动，不计自动化套件通过；Playwright MCP 为 `Transport closed`，Chrome DevTools MCP 手动隔离交互不替代自动化套件。
- 无 API 路由、权限、数据库或真实业务数据变化；Android 仅同步 Gradle 版本元数据至 9.3.4/90304，未重生成 assets、未运行 Capacitor sync、未构建 APK。本地不提交、推送或部署。B4/B5 全站验收仍开放，下一项继续检查编辑器工具栏与其余选题页面状态。

## v9.3.3 清单 G：移动首页关注选题展开完整

- `src/pages/mobile/MobileHome.tsx`：今日任务组装不再提前对关注选题 `slice(0, 3)`。复用既有角色优先级与 6 项总上限，首页默认仍显示前三条；任务数不足时，展开可看到后续关注选题，8 条服务端预览不会挤出既有其他分类的优先任务。
- `tests/browser/topic-stage-record-repair.spec.ts`：增加 8 条合成关注事项且无其他任务分类的隔离场景，断言默认显示 3 条、展开后显示 6 条、第 4–6 条可见并且第 7 条仍不超出移动端 6 项上限。
- Chrome DevTools MCP 在隔离上下文以 390×844 点验：默认前三项可见，点击“查看剩余 3 项”后列出第 4–6 项；页面 scrollWidth 与 viewport 均为 390px，控制台无错误或警告；仅使用合成数据且网络只有摘要只读 GET，无写请求。
- 通过：类型检查、目标 ESLint、`npm run test:home-dashboard`、`npm run version:check`（v9.3.3）、版本治理、更新说明治理（447 个唯一版本）、测试入口（246 个）、Android runtime 合同、`git diff --check` 与 `npm run build`。构建保留既有大分包提醒（主入口 692.67 kB、Tiptap 555.12 kB、Silk 843.50 kB）。`npm run test:topic-stage-record-repair-browser` 在测试体前启动失败：macOS Chromium `bootstrap_check_in … Permission denied (1100)`，不计自动化通过；MCP 手动交互核对不替代自动化套件。本项无 API 路由、权限、数据库或真实业务数据变化；Android 仅同步 Gradle 版本元数据至 9.3.3/90303，未重生成 assets、未运行 Capacitor sync、未构建 APK。本地不提交、推送或部署。

## v9.3.2 清单 B8：移动端选题内容保存结果安全恢复

- `src/pages/mobile/MobileTopicDetail.tsx`：标题/说明 PUT 前保存账号和选题限定的恢复标记；成功响应正常结束，响应不明则通过现有选题详情 GET 核实。服务器已是目标值时清除草稿、不重复写入；仍为基线时保留草稿并等用户明确重试；并发变化时同步服务端快照、保留本地草稿并要求用户选取服务端版本或继续本地修改。读回失败会锁定内容编辑、保存、审核、阶段推进、开始创作和补齐阶段记录；重开页面通过只读 GET 恢复。
- `src/pages/mobile/mobileTopicEditRecovery.ts`：新增账号/选题隔离的恢复标记校验与清理；恢复信息在写入前落入本机存储，无法保存恢复标记时不会发送 PUT。
- `src/api/topics.ts`：选题更新错误保留 HTTP 状态，用于区分明确拒绝和结果不明；没有改 API 路由、权限或数据库。
- `tests/browser/topic-stage-record-repair.spec.ts`：新增响应丢失、基线未变化时只允许显式重试、读回失败后刷新只读恢复、服务端并发变化并要求用户选择四类隔离场景，按 PUT/GET/实际写入次数与草稿状态断言安全边界。
- Chrome DevTools MCP 隔离夹具在 390×844 复核：已提交但响应 503 后顺序为一次 PUT 与只读 GET，并确认成功；确认基线未变后没有自动 PUT，第二次 PUT 仅在再次点击后发生；首次 GET 也 503 时保存/流程操作锁定，刷新只发 GET 并确认，不多发 PUT；并发冲突显示服务端标题/说明，保留本地表单并阻止覆盖，用户显式选择继续本地编辑后解除冲突锁。只使用合成选题。
- 通过：`npm run check -- --pretty false`、目标 ESLint（0 错误/警告）、`npm run test:topics`、`npm run test:topic-production-handoff`、`npm run test:publishing-douyin-link`、`npm run version:check`（v9.3.2）、版本治理、更新说明治理（446 个唯一版本）、测试入口检查（246 个）、Android runtime 合同、`git diff --check` 与 `npm run build`。构建保留既有大分包提醒（Tiptap 555.12 kB、入口 692.32 kB、Silk 843.50 kB）。仓库 `npm run test:topic-stage-record-repair-browser` 因 macOS Chromium `bootstrap_check_in … Permission denied (1100)` 在测试体前无法启动，不计自动化通过；Playwright MCP 返回 `Transport closed`，不计通过，使用 Chrome DevTools MCP 完成手动隔离交互核对。无真实账号/业务数据读写；Android 仅同步 Gradle 版本元数据至 9.3.2/90302，未重生成 assets、未运行 Capacitor sync、未构建 APK。本地不提交、推送或部署。
- 用户确认的日期合同为北京时间自然日并包含当天（昨天为前一自然日；近 7/30 天含今天）；抖音批量刷新遵循逐条编辑范围。复核现有官方导出合同与抖音链接权限测试均通过，本项未扩大权限或改变数据口径。

## v9.3.1 清单 B8：移动端已有稿件写入结果安全恢复

- `src/pages/mobile/MobileProductionEditor.tsx`：移动端已有稿件自动保存、手动保存/提交审核、审核通过在超时、网络错误或 5xx 后通过现有详情 GET 只读核实版本、选题、状态与正文指纹。服务端已应用则确认成功且不重复写入；服务器仍为原状态时保留本机正文和请求范围，只有用户明确操作才重试；已被并发操作修改则采用服务端最新稿件并保留本机草稿；回读失败时锁定编辑和后续写入，使用账号/稿件隔离的最小会话标记，刷新后只读恢复。明确 4xx 拒绝不自动重试。
- `src/pages/mobile/mobileProductionRecovery.ts`：新增严格校验的已有稿件写入恢复标记，不存储正文；校验账号、稿件、操作、状态、版本和目标/基线内容指纹，损坏或跨账号标记失败关闭。
- `tests/browser/mobile-work-center-responsive.spec.ts`：覆盖自动保存已提交但响应丢失、写入/首轮 GET 均失败后刷新只读核实并由用户明确重试、审核通过已生效但响应丢失；按请求与实际写入计数确保不会重复写入。
- Chrome DevTools MCP 本地隔离 fixture 实测上述三条路径；提交后响应丢失仅一条实际写入，无法核实时刷新只执行 GET，只有用户明确操作才发送一次重试；无真实账号或业务数据读写。`npm run check -- --pretty false`、目标 ESLint、`npm run test:production-review`、`npm run test:production-create-idempotency` 与生产构建通过，构建保留既有 >500 kB 分包警告。仓库 Playwright 自动化在测试体前因 macOS Chromium `bootstrap_check_in … Permission denied (1100)` 失败，不计自动化通过。无 API 路由、权限或数据库变化；Android 仅同步 Gradle 元数据至 9.3.1/90301，未运行 Capacitor sync 或构建 APK。本地不提交、推送或部署。

## v9.3.0 清单 B8：移动网页新建创作结果安全恢复

- `src/pages/mobile/MobileProductionEditor.tsx`：新建稿发送前将正文写入账号隔离的安全草稿，并以 SHA-256 指纹、目标状态、选题 ID 和 UUID 在标签页会话保存最小恢复标记。请求失败/超时后只读查询账号限定的创建状态；已创建直接进入原稿，不重复 POST；确认未创建时仅呈现同 UUID 的用户显式重试；无法核实时锁定编辑/新建，保留正文、标记并在刷新后 GET-only 恢复。识别为确定性拒绝的 4xx 不盲目重读或重发。确认成功后同时清理安全草稿和恢复标记。
- `tests/browser/mobile-work-center-responsive.spec.ts`：新增提交后响应丢失、首次提交与状态读取均失败、刷新只读恢复和同请求号显式重试断言；fixture 提供隔离计数端点，核对 POST 尝试、实际写入、GET 次数及 UUID 一致。
- Chrome DevTools MCP 本地隔离验收：已创建后响应丢失分支最终只有 1 次 POST / 1 条写入；未创建且第一次 GET 失败分支刷新后只增加 GET，不自动写入；用户明确重试后累计 2 次 POST 尝试但仅 1 条写入，两次 UUID 一致，正文恢复且成功后安全草稿/会话标记清理。仅使用隔离用户、合成选题和测试 fixture，不访问真实业务数据。
- 验证通过：`npm run check -- --pretty false`、目标 ESLint、`npm run test:production-create-idempotency`、`npm run version:check`、版本治理、更新说明治理（444 个唯一版本）、测试入口检查（246 个文件）、Android runtime 合同、`git diff --check` 与 `npm run build`；MobileProductionEditor 生产分包 20.52 kB。生产构建保留既有大分包提醒（主入口 691.51 kB、Tiptap 555.12 kB、Silk 843.50 kB）。`npm run test:mobile-work-center-browser` 在浏览器启动、测试体前失败：macOS Chromium `bootstrap_check_in … Permission denied (1100)`，且 WebSocket 端口 24678 已被占用，不计自动化通过；Chrome DevTools MCP 已完成人工隔离交互验收。
- 无 API 路由、权限或数据库变化；Android 原生专项后置，仅更新 Gradle 元数据到 9.3.0/90300，未同步原生 assets、未运行 Capacitor sync、未构建 APK。本地不提交、推送或部署；接续 B8 其他待闭合写入、B4/B5 全站验收及 G 未闭合项。

## v9.2.99 清单 B8：移动网页选题状态写入安全核实

- `src/pages/mobile/MobileTopics.tsx`：移动看板的审核/状态变更遇到超时、网络错误或 5xx 后通过现有详情 GET 核实。目标状态已生效即确认且不重发；仍为原状态时解除锁定并仅允许用户再次明确点击；并发变更按服务器状态刷新；404 清理过期选题；读回失败时锁住该卡片操作并提供只读核实入口。明确拒绝类 4xx 不重复读取/写入。
- `src/pages/mobile/MobileTopicDetail.tsx`：移动详情审核与阶段推进复用同一规则。状态未知期间暂停审核、阶段推进和开始创作；审核意见与表单保留。只读核实确认原状态后才恢复用户明确重试，目标/并发状态以服务端详情为准；404 不再保留错误选题。
- `tests/browser/topics-list-responsive.spec.ts` 新增移动看板审核、移动详情审核、移动详情阶段推进共六条隔离场景，覆盖提交后响应丢失、写入及首次 GET 均失败、只读恢复与显式重试，并按请求/写入计数断言无自动重发。
- Chrome DevTools MCP 隔离 fixture 手动验证：移动看板审核响应丢失不重发；写入及首个回读均失败时操作禁用，GET-only 核实仍待审核后明确重试，服务端计数为 2 次 POST 尝试 / 1 次实际写入。移动详情审核意见在恢复前后保持不变；详情审核和阶段推进均覆盖响应丢失、锁定、只读恢复及显式重试，没有真实业务账号或选题写入。
- 门禁通过：`npm run check`、`npm run test:topics`、`npm run test:topics-list-notify`、`npm run test:batch-mutation-feedback`、目标 ESLint（无错误/警告）、`npm run version:check`（v9.2.99）、版本治理、更新说明治理（443 个唯一版本）、Android runtime 合同、`git diff --check` 与 `npm run build`。构建中 MobileTopics 21.34 kB、MobileTopicDetail 23.08 kB；保留既有主入口 691.13 kB、Tiptap 555.12 kB、Silk 843.50 kB 的大分包提示。`npm run test:topics-responsive-browser` 受本机 Chromium `bootstrap_check_in … Permission denied (1100)` 阻挡，未进入测试体，不计自动化通过；已使用 Chrome DevTools MCP 隔离 fixture 人工核对交互与写入计数。无后端路由、权限、数据库或真实业务数据变化；Android 原生专项后置，仅同步版本元数据至 9.2.99/90299，未运行 Capacitor sync 或 APK 构建。本地不提交、推送或部署；继续 B8 其它写入/读回、B4/B5 全站验收和 G 未闭合项。

## v9.2.98 清单 B8：批量审核与看板状态响应安全核实

- `src/api/topics.ts` 让状态更新错误保留 HTTP 状态，前端可将明确拒绝和网络/超时/5xx 的不确定写入区分处理。
- `src/pages/Topics.tsx`：批量审核失败后通过已有受权限保护的选题 GET 回读。目标状态已生效则计为成功且不重发；仍为原状态时保留选择，只有用户明确点击才可重试；若状态已由其他操作改变，采用服务端快照并移出过期选择。回读失败时锁定该选题的批量审核、删除和看板状态更新，页面提供只读核实入口。删除确认和看板卡片也按单条记录锁定；未改动权限范围、服务端路由或数据库。
- `tests/browser/topics-list-responsive.spec.ts` 增加批量审核、看板审核各两条隔离场景：服务端已写入但返回 503 后通过 GET 确认；POST 与首个 GET 均失败时锁定，后续只读 GET 恢复原状态，再由用户显式重试。
- Playwright MCP 隔离页面实测两类入口：批量审核和看板审核各自均验证目标状态已提交但响应丢失时只发一次 POST；首次写入和 GET 回读均失败后操作变为禁用，点击只读核实不产生 POST，确认仍为原状态后显式点击才增加一次 POST 并成功。页面控制台错误仅为夹具注入的预期 503；无真实业务账号或记录写入。
- 门禁通过：`npm run check`、`npm run test:topics`、`npm run test:topics-list-notify`、`npm run test:batch-mutation-feedback`、目标 ESLint（0 错误/警告）、`git diff --check` 与 `npm run build`；Topics 分包 33.08 kB。构建仍提示主入口 690.42 kB、Tiptap 555.12 kB、Silk 843.50 kB 的既有大分包。`npm run test:topics-responsive-browser` 因 macOS Chromium `bootstrap_check_in … Permission denied (1100)` 在启动浏览器时失败，未进入测试体，不计自动化通过；Playwright MCP 用于隔离交互验收。Android runtime 合同通过；production build-endpoints 因未生成 `dist/xmt-mobile-build.json` 前置失败，没有运行 Android 构建或 Capacitor sync（专项后置）。仅同步 Gradle 版本号至 9.2.98/90298，未重生成 Android assets、未构建 APK。本地不提交、推送或部署；继续处理 B8 其它未闭合写入/读回、B4/B5 全站验收与 G 未闭合项，Android 原生专项后置。

## v9.2.97 清单 B8：选题详情审核响应安全核实

- `src/api/topics.ts` 的审核错误保留 HTTP 状态，便于区分明确拒绝与响应结果不明。
- `src/pages/TopicDetail.tsx`：审核异常后先通过现有受权限保护的选题详情 GET 核实。目标状态已生效则提示已核实并关闭审核窗，不重复 POST；服务器仍待审核时保留表单并要求用户检查后再次明确确认；第三种状态以服务端最新记录为准并提示未重复提交；详情回读失败时锁定审核结果、负责人、意见、取消及提交控件，仅保留只读核实入口。
- `tests/browser/topic-stage-record-repair.spec.ts` 增加两条隔离回归：审核已提交但响应返回 503，由详情 GET 确认且仅一次 POST；审核失败及首次详情 GET 均 503 时锁定，再只读 GET 确认仍待审核，不自动 POST，用户明确再次确认后才写入。
- Playwright MCP 隔离页面实际交互：响应丢失分支网络顺序为 GET 200 → POST 503 → GET 200，显示“审核状态已核实”；待核实分支为 POST 503 → GET 503，审核表单锁定，点击只读核实产生 GET 200 而没有 POST，用户再次确认后才出现 POST 200 → GET 200。控制台仅两个夹具注入 503，无其它浏览器错误/警告。仓库浏览器回归因 macOS Chromium `bootstrap_check_in … Permission denied (1100)` 在测试体前失败，不计自动化通过。
- 最终门禁：`npm run check -- --pretty false`、`npm run test:topics`、`npm run version:check`（v9.2.97）、版本治理、更新说明唯一性（441 个版本）、测试入口（246 个）、Android runtime 合同、`git diff --check` 与 `npm run build` 均通过；目标 ESLint 0 错误、5 条 warning（未使用导入及 Hook 依赖）。TopicDetail 分包 47.25 kB；构建保留既有主入口 690.42 kB、Tiptap 555.12 kB、Silk 843.50 kB 大分包提示。无 API 路由、权限或数据库变化；Android 仅同步 9.2.97/90297 元数据，未构建 APK。本地不提交、推送或部署；继续 B8 其它未闭合写入、B4/B5 全站验收及 G 未闭合项，Android 原生专项后置。

## v9.2.96 清单 B8：选题删除响应安全核实

- `src/api/topics.ts` 为 DELETE 错误保留 HTTP 状态，并通过已有受权限保护的单条 GET 提供只读状态核实；不增加后端路由、权限或数据库改动。
- `src/pages/Topics.tsx` 对单条和批量删除统一处理已删除/仍存在/状态未知：404、成功响应或实时删除事件确认删除后同步移除；GET 仍返回该选题时说明本次未删除、等待用户明确再次确认；DELETE 和 GET 都失败时锁住这条记录，页面提供只读核实，待核实选题不得重复删除、批量删除、批量审核或看板改状态。`ConfirmModal` 增加可选的确认按钮禁用属性。
- `tests/browser/topics-list-responsive.spec.ts` 覆盖失败后读回仍存在、删除已提交但响应丢失并读回 404、DELETE 与首次 GET 都失败后锁定/只读核实/显式重试。Playwright MCP 隔离页面手动实测：请求数依次为 1（失败后读回仍存在）、2（第二次用户确认后服务端提交并返回 503，GET 404 判定完成）、3（再次请求与 GET 均 503，锁定期间核实请求数不变）、4（只读核实确认仍存在后用户再次确认删除）；无真实业务库写入。页面无框架错误；失败分支产生的 HTTP 503/404 为预期夹具响应，另有一条现存 React Bits 安全映射警告。
- 验证通过：`npm run test:topics`、`npm run test:topics-list-notify`、`npm run test:batch-mutation-feedback`、`npm run check -- --pretty false`、目标 ESLint（0 错误/警告）、`npm run version:check`（v9.2.96）、版本治理、更新说明唯一性（440 个版本）、测试入口（246 个）、Android runtime 合同、Studio token 使用（38 项）及 `git diff --check`。`npm run build` 通过，选题页分包 28.36 kB；保留既有大分包提示（主入口 690.09 kB、Tiptap 555.12 kB、Silk 843.50 kB）。仓库 `npm run test:topics-responsive-browser` 因 macOS Chromium `bootstrap_check_in … Permission denied (1100)` 在测试体前失败，不计自动化通过；Playwright MCP 已实际交互验证关键流程。
- Android 仅同步版本元数据至 9.2.96/90296，未构建 APK；本地不提交、推送或部署。继续清单 B8 其他写入/读回路径、B4/B5 全站验收及 G 未闭合项；Android 原生专项后置。

## v9.2.95 清单 B8：灵感删除响应安全核实

- `src/api/inspirations.ts` 为删除响应保留 HTTP 状态并新增只读状态读取；现有 GET 详情对已删除灵感返回 404，DELETE 的权限拒绝为 403，服务端在拒绝前不会执行删除。
- `src/pages/Inspirations.tsx`：删除响应异常后检查实时删除确认并只读回查。回读 404 时移除记录且不重发；仍存在时保留记录、提示未删除并要求用户重新确认；回读失败时锁定该条删除，展示只读核实入口。被实时删除事件确认时同步解除不确定状态。
- `tests/browser/inspiration-theme-contrast.spec.ts` 覆盖失败后仍存在、提交后响应丢失并回读 404、首次回读失败后锁定/核实仍存在/仅显式确认重试。Playwright MCP 隔离页人工复核：提交后响应丢失由 GET 404 确认；GET 暂时失败显示锁定入口，后续 GET 200 解除锁定，用户确认后才发生一次 DELETE。仅合成资料，无真实业务数据。
- 验证通过：`npm run test:inspiration-mutations-atomic`、`npm run check -- --pretty false`、目标 ESLint（0 错误/警告）、`npm run version:check`（v9.2.95）、版本治理、更新说明唯一性（439 个版本）、测试入口检查（246 个）、Android runtime 合同、Studio 令牌门禁、`git diff --check` 与 `npm run build`。生产构建灵感分包 35.67 kB；保留既有大分包提示（主入口 689.76 kB、Tiptap 555.12 kB、Silk 843.50 kB）。仓库 `npm run test:inspiration-theme-contrast-browser` 因 macOS Chromium 启动权限 `bootstrap_check_in … Permission denied (1100)` 未进入测试体，不计自动化通过；隔离 Playwright MCP 页面人工核验了提交后响应丢失→只读 404、读回失败→锁定→只读确认仍存在→用户确认重试的关键分支。
- 无后端路由、权限或数据库变化；Android 仅同步版本元数据至 9.2.95/90295，未构建 APK。本地不提交、推送或部署；继续 B8 其他写入/读回路径、B4/B5 全站验收和 G 未闭合项，Android 原生专项后置。

## v9.2.94 清单 B4/B5：资料详情普通文字可读性

- `tests/browser/resource-archive-detail.spec.ts` 为普通资料详情新增实际背景合成对比度断言，检查共享 Studio muted 文本在透明玻璃面板、导航和基础表面上的 WCAG 4.5:1 下限；对每个主题覆盖 1440×900、390×844、320×740 的真实 CSS 视口，并检查页面无横向溢出。当前实现使用的 Studio 文字令牌已经达标，本项只加回归防止全站 token 漂移，不改页面业务/视觉源码。
- Chrome DevTools MCP 合成资料归档账号（只读 API 夹具）实测六种视口/主题组合：浅色 1440px 所有可见 muted 文案最低 5.35:1，浅色 390/320px 最低 5.69:1，深色三种视口最低 5.97:1；每组页面宽度等于视口，元数据、正文、空标签/文件/关联/审计均正常渲染。该工具的模拟 viewport 能正确设置 320/390 CSS px；早先窗口 resize 的最小宽度不作为证据。
- `npm run test:legacy-resource-archive-detail` 中的 10 个纯逻辑归档测试全部通过；之后 Playwright Chromium 在启动前因 macOS `bootstrap_check_in … Permission denied (1100)` 退出，浏览器用例未进入测试体，不计自动化通过。Chrome DevTools MCP 页面正常，Socket.IO fixture 已连接，无应用错误；单条 Motion reduced-motion 提示由测试的减弱动态设置触发。数据来自只读隔离 fixture，不触碰真实资料或写接口。
- 最终验证：`npm run check -- --pretty false`、定向 ESLint（本回归 0 错误/警告）、`npm run version:check`（v9.2.94）、版本治理、更新说明唯一性（438 个版本）、测试入口（246 个）、Android runtime 合同、`npm run test:studio-token-usage`、`git diff --check` 与 `npm run build` 通过。生产构建资料详情分包 26.37 kB；保留既有大分包提示（主入口 689.45 kB、Tiptap 555.12 kB、Silk 843.50 kB）。Android 仅同步元数据至 9.2.94/90294，未构建 APK；不提交、推送或部署。继续 B4/B5 其余页面、B8 其他写入/读回路径与 G 未闭合项，Android 原生专项后置。

## v9.2.93 清单 B8：日历事件创建结果安全核实

- `api/database/migrations/038_calendar_event_create_idempotency.ts` 新增 SAFE_EXPAND 请求账本；事件与账号、UUID、载荷指纹同事务提交，已删除事件保留墓碑。`api/routes/calendar.ts` 增加仅请求账号可读的状态查询；相同账号/请求号/载荷幂等返回原事件，不同载荷或账号冲突，未带请求号的旧客户端兼容。
- `src/pages/Calendar.tsx` 按账号在当前标签页会话保存原表单和请求编号。创建响应不明时先只读核实，已创建则更新页面且不重发；明确未找到后仅允许用户沿用同编号显式重试；查询失败时锁住新建并支持刷新后继续核实。成功确认后清除恢复标记。
- `tests/calendar/calendar-permissions.test.ts` 覆盖账号范围、同请求重放、载荷冲突、删除墓碑与状态查询；`tests/database/calendar-event-create-idempotency-migration.test.ts` 覆盖迁移重复执行、旧行保留、主键唯一与墓碑；`tests/ops/migration-readiness.test.ts` 确认 038 为 SAFE_EXPAND。API 和迁移只在隔离测试库验证，未对真实数据库运行迁移。
- Chrome DevTools MCP 隔离页面 `http://127.0.0.1:5174/calendar`（合成账号 9831、1440px）模拟 POST 已提交但响应丢失；页面通过同一请求编号只读核实，事件出现在日历且今日计数为 1，待确认标记清除。页面非空、无 Vite 错误覆盖层、无横向溢出。截图见本轮交付；浏览器控制台的 500/警告来自未启动本地 API 的 Socket.IO 轮询，日历业务请求由隔离夹具拦截，没有触碰真实业务数据。仓库 `npm run test:mobile-work-center-browser` 受 macOS Chromium `bootstrap_check_in … Permission denied (1100)` 阻挡，未进入测试体，新增自动化场景不计套件通过。
- 验证通过：`npm run test:calendar-permissions`、`npm run test:calendar-create-idempotency-migration`、`npm run test:migration-readiness`、`npm run check -- --pretty false`、定向 ESLint（11 个文件，0 错误/警告）、`npm run version:check`（v9.2.93）、版本治理、更新说明唯一性（437 个版本）、测试入口（246 个）、Android runtime 合同、`git diff --check` 与 `npm run build`。生产构建日历分包 17.40 kB；保留既有大分包提示（主入口 689.15 kB、Tiptap 555.12 kB、Silk 843.50 kB）。Android 仅同步元数据至 9.2.93/90293，未构建 APK；不提交、推送或部署。继续 B8 其它写入结果恢复、B4/B5 全站验收与 G 未闭合项，Android 原生专项后置。

## v9.2.92 清单 B4/B5：Studio 深色弱化文字对比度

- `src/styles/tokens.css` 将深色 `--xmt-text-muted` 从 `#6B7A93` 提升到 `#8594AD`，并同步 Tailwind RGB 通道；浅色令牌保持不变。`DESIGN.md` 更新唯一视觉规范，明确弱化文字仍须满足可读性要求。
- `tests/ops/studio-token-usage.test.mjs` 校验明暗主题 muted 色与 RGB 通道一致，并分别在五种基础表面上达到 4.5:1；`tests/browser/production-review.spec.ts` 覆盖品牌字标、未激活侧栏、编辑器分组、审阅说明和关联选题标题的明暗主题合成对比度，同时支持现代 `color(srgb …)` 样式解析。
- Chrome DevTools MCP 隔离创作详情 1440px 实测：五处代表文案浅色 5.69–5.79:1、深色 5.42–5.97:1；页面其余可见普通文字的暗色扫描均达到 4.5:1。两处关联选题链接悬停在浅色分别为 10.36:1/7.27:1、深色分别为 12.28:1/14.78:1。320px 与 390px 移动页面在明暗主题均无横向溢出；移动浅色 320px 可见普通文案扫描无低于 4.5:1 项。页面控制台错误/警告为 0，业务 API 请求只有 GET；未触发业务写入。
- `npm run test:production-review-browser` 因本机 Chromium `bootstrap_check_in … Permission denied (1100)` 在测试体启动前退出，不计自动化通过；Chrome DevTools MCP 隔离页用于人工验收。
- 验证通过：`npm run check -- --pretty false`、目标 ESLint（0 错误）、`npm run version:check`（v9.2.92）、版本治理、更新说明治理（436 个唯一版本）、测试入口（245 个）、`npm run test:studio-token-usage`、`npm run test:android-runtime`、`git diff --check` 与 `npm run build`。生产构建保留大分包警告（主入口 688.73 kB、Tiptap 555.12 kB、Silk 843.50 kB）。无 API、权限或数据库变化；Android 仅同步 9.2.92/90292 元数据，未构建 APK。本地不提交、推送或部署。

## v9.2.91 清单 B4/B5：成就主题可读性

- `src/pages/Achievements.tsx`：积分摘要、统计标签、成就分类、进度/日期、排行榜和空状态普通文字改用 `styles.textSecondary`；仅图标控件和装饰图标继续保留 muted 色。
- `tests/browser/achievements-leaderboard-empty-state.spec.ts`：增加亮/暗主题普通文字至少 4.5:1 的断言、成就视图选择语义与键盘切换回归、390px 暗色无横向溢出检查。
- Playwright MCP 隔离页在 390px 暗色验证统计和排行榜说明对比度 8.29:1，点击“排行榜/动态”后分别验证说明和“暂无人获得成就”为 8.29:1；未见页面控制台错误或横向溢出。Chrome DevTools MCP 独立在 1440px 明色验证统计说明、排行榜说明、动态空态均为 7.45:1，页面宽度与视口相同。
- 按用户本轮确认，抖音批量关联沿用逐条发布记录编辑范围；复核服务端创建人、负责人、发布参与者和范围外隔离逻辑，`npm run test:publishing-douyin-link` 通过。已有全局编辑角色继续遵循其现有全量编辑许可，本轮无额外权限变更。
- `npm run test:achievements-leaderboard-browser` 未进入测试体：本机 Playwright Chromium 启动时 `bootstrap_check_in org.chromium.Chromium.MachPortRendezvousServer … Permission denied (1100)` 后退出；新增自动化断言不计通过，MCP 隔离页仅作为人工复核证据。
- 验证通过：`npm run check -- --pretty false`、目标 ESLint（0 错误/警告）、`npm run version:check`（v9.2.91）、版本治理、更新说明治理（435 个唯一版本）、测试入口检查（245 个文件）、`npm run test:android-runtime`、`git diff --check` 和 `npm run build`。生产构建成就分包 20.54 kB；保留既有大分包提示（主入口 688.44 kB、Tiptap 555.12 kB、Silk 843.50 kB）。无 API、权限或数据库变化；Android 仅同步元数据到 9.2.91/90291，未构建 APK；本地不提交、推送或部署。

## v9.2.90 清单 B4/B5：日历主题对比度

- `src/pages/Calendar.tsx`：星期标题、跨月日期、事件计数及“更多”提示改用 Studio 次级文字令牌，修复普通文字对比度不足；未改动 API、权限或数据库。
- `tests/browser/calendar-month-request-race.spec.ts`：增加暗/亮主题、桌面和移动视口下周标题、跨月日期、事件数与溢出提示的 4.5:1 最低对比度断言，并覆盖日历月份请求回包与布局回归。
- Playwright MCP 隔离夹具实测 1440px 暗/亮、390px 暗/亮、320px 暗色，页面内容正常且无横向溢出；采样暗色对比度为周标题/跨月日期 7.52:1、事件数 7.00:1、“更多” 8.01:1，亮色样例最低 6.52:1。Chrome DevTools MCP 独立复核 1440px 与 320px 暗色，宽度分别等于视口，采样均不低于 7.00:1。
- `npm run test:calendar-month-race-browser`：未通过，Playwright Chromium 启动阶段因 macOS `bootstrap_check_in … Permission denied (1100)` 退出，未进入测试体；新增自动化断言不计通过。MCP 页面验证为人工隔离验收。
- 验证通过：`npm run check -- --pretty false`、目标 ESLint（0 错误/警告）、`npm run version:check`（v9.2.90）、`npm run test:version-governance`、`npm run test:changelog-governance`（434 个版本）、`npm run test:entrypoints`（245 个文件）、`npm run test:android-runtime`、`git diff --check` 和 `npm run build`。生产构建日历分包 13.00 kB；保留既有大分包警告（主入口 688.14 kB、Tiptap 555.12 kB、Silk 843.50 kB）。`npm run test:calendar-month-race-browser` 因本机 Chromium `bootstrap_check_in … Permission denied (1100)` 在启动阶段失败，未进入测试体，不计自动化通过。Android 仅同步元数据至 9.2.90/90290，未构建 APK；本地不提交、推送或部署。

## v9.2.89 清单 B8：创作列表新建结果安全核实

- `api/database/migrations/037_production_create_idempotency.ts`：新增 SAFE_EXPAND 幂等账本，保留删除墓碑；旧客户端不带请求编号时沿用旧创建行为。
- `api/routes/workflow.ts`、`src/api/workflow.ts`、`src/api/index.ts`：创建记录和请求编号在同一事务提交；相同编号/载荷重放返回原记录，不同载荷冲突；增加仅请求创建者、且仍有选题查看权限时可读的状态接口。
- `src/pages/Production.tsx`：会话内按账号保存原始表单、请求编号和版本化恢复状态。创建响应不明后先 GET 核实，已创建不重发，未找到仅提供同编号显式重试；读回失败暂停本页其他写入，刷新后只读恢复。恢复信息只保存在当前标签页会话，成功或确认已删除后清理。
- `tests/production/production-create-idempotency.test.ts`、`tests/database/production-create-idempotency-migration.test.ts`、`tests/browser/production-list-feedback.spec.ts`：增加 API/迁移合同以及已提交但响应丢失、未提交后用户显式同编号重试、首轮回查失败后刷新只读恢复覆盖。Playwright MCP 隔离夹具实测三条路径；仓库自动化脚本因本机 Chromium `bootstrap_check_in … Permission denied (1100)` 在浏览器启动阶段失败，未进入测试体，不计自动化通过。
- 验证：`npm run test:production-create-idempotency`、`npm run test:production-create-idempotency-migration`、`npm run test:migration-readiness`、`npm run test:android-runtime`、`npm run check -- --pretty false`、`npm run version:check`（v9.2.89）、`npm run test:changelog-governance`（433 个唯一版本）、`npm run test:entrypoints`（245 个文件）、`git diff --check` 和 `npm run build` 通过。定向 ESLint 无错误、12 条警告。生产构建创作列表分包 23.49 kB、主入口 687.84 kB；保留既有大分包提示（Tiptap 555.12 kB、Silk 843.50 kB）。Playwright MCP 隔离夹具手动验证三条恢复流程并核对请求次数；仓库浏览器自动化因本机 Chromium `bootstrap_check_in … Permission denied (1100)` 在启动阶段失败，未进入测试体，不计自动化通过。迁移只在临时测试库验证，未对真实数据库执行。Android 仅同步版本元数据至 9.2.89/90289，未构建 APK；本地不提交、推送或部署。

## v9.2.88 清单 B8：创作删除结果安全核实

- `src/pages/ProductionDetail.tsx`：创作记录删除前确认正文已同步，并按账号/稿件保存仅含状态、版本和正文 SHA-256 摘要的会话标记。DELETE 响应不明后只读 GET：404 视为已删除且不重发；记录仍存在且版本、状态、正文吻合时只提供明确确认后的重试；记录已变化时采用当前服务端记录并取消重试。回查失败锁定本稿件写入，刷新后继续 GET-only 核实。
- `src/api/workflow.ts`：详情读取和删除错误保留 HTTP 状态，以区分确认删除的 404、确定拒绝和结果不明；无新增 API 路由、迁移或权限规则。
- `tests/browser/production-review.spec.ts`：新增删除已提交后响应丢失、删除未提交后用户明确重试、首次回查失败后刷新恢复三条隔离自动化回归。Playwright MCP 手动实测三条路径，断言删除请求次数及 marker 清理。
- `npm run check`、目标 ESLint（0 错误/警告）、`npm run test:production-review`、`npm run test:integrity:workflow`、`npm run test:publishing-douyin-link`、`npm run version:check`、版本治理、更新说明唯一性（432 个版本）、243 个测试入口、Android runtime 合同、`git diff --check` 和 `npm run build` 均通过。生产构建创作详情分包 61.56 kB；既有大分包提示仍在（Tiptap 555.12 kB、主入口 687.38 kB、Silk 843.50 kB）。Playwright MCP 隔离页面实测 DELETE 已生效但响应 503 后 GET 404 确认且仅一次写入、未删除时明确确认后才执行第二次 DELETE、首次回查失败后刷新只读确认删除且只写一次；仓库 `npm run test:production-review-browser` 因本机 Chromium `bootstrap_check_in … Permission denied (1100)` 在测试体启动前失败，新自动化断言不计为自动化通过。无新增路由、迁移或权限规则。Android 仅同步元数据至 9.2.88/90288，未构建 APK；本地不提交、推送或部署。

## v9.2.87 清单 B8：创作版本保存结果安全核实

- `src/pages/ProductionDetail.tsx`：小修保存/另开新版前确认正文已同步，并保存仅含账号、稿件、基准状态/版本、动作和正文 SHA-256 摘要的会话标记。写入结果不明后只读回查：读到新版本时采用服务器结果且不重复建版；仍为原版本且正文一致时只提供明确确认后的重试；其它状态/正文变化时采用服务器状态并取消重试。首次回查失败锁定创作写入，刷新后恢复 GET-only 核实。
- `src/api/workflow.ts`：创作更新错误保留 HTTP 状态，支持区分确定拒绝与结果不明；无新增 API 路由、迁移或权限规则。
- `tests/browser/production-review.spec.ts`：增加服务端建版后返回 503、不提交后明确重试、读回失败后刷新恢复三条隔离回归，并断言版本号及写请求次数。
- `npm run check`、目标 ESLint（0 错误/警告）、`npm run test:production-review`、`npm run test:integrity:workflow`、`npm run test:publishing-douyin-link`、`npm run version:check`、版本治理、更新说明唯一性（431 个版本）、243 个测试入口、Android runtime 合同、`git diff --check` 和 `npm run build` 均通过。生产构建创作详情分包 58.43 kB；既有大分包提示仍在（Tiptap 555.12 kB、主入口 686.94 kB、Silk 843.50 kB）。Playwright MCP 隔离页面实测已建版但 PUT 返回 503 后只写一次、未建版后明确确认才创建第二版、首次回查失败后刷新只读恢复且只写一次；仓库 `npm run test:production-review-browser` 因本机 Chromium `bootstrap_check_in … Permission denied (1100)` 在测试体启动前失败，不计自动化通过。无新增路由、迁移、权限规则。Android 仅同步元数据至 9.2.87/90287，未构建 APK；本地不提交、推送或部署。

## v9.2.86 清单 B8：创作详情状态写入安全核实

- `src/pages/ProductionDetail.tsx`：提交审核与状态更新前先确认编辑器正文同步完成，并按账号/稿件保存不含正文的 SHA-256 核实标记。写请求超时、网络错误或服务端异常后只读 GET：状态和正文摘要均匹配目标则确认且不重发；仍为原状态且正文匹配时保留只供用户明确确认的重试；其它状态/正文以服务器为准并取消重试；回查失败锁定编辑、版本、删除和状态写入，刷新后恢复核实。
- `src/api/workflow.ts`：创作更新错误保留 HTTP 状态，区分确定拒绝与结果不明；无新增路由、迁移或权限规则。
- `tests/browser/production-review.spec.ts`：补充已提交但 PUT 返回 503、未提交且不自动重试、明确确认后重试、读回失败后刷新恢复，以及状态更新已生效的隔离场景。
- `npm run check`、目标 ESLint（0 错误/警告）、`npm run test:production-review`、`npm run test:integrity:workflow`、`npm run test:publishing-douyin-link`、`npm run version:check`、版本治理、更新说明唯一性（430 个版本）、243 个测试入口、Android runtime 合同、`git diff --check` 和 `npm run build` 通过。生产构建新创作详情分包 55.85 kB；既有大分包提示仍在（Tiptap 555.12 kB、主入口 686.48 kB、Silk 843.50 kB）。Playwright MCP 隔离页面实测审核已提交但 PUT 返回 503 后仅一次写入、未提交时必须用户明确重试、首次回查失败后刷新只读恢复，以及驳回稿状态更新已生效后的核实。仓库 `npm run test:production-review-browser` 因本机 Chromium `bootstrap_check_in … Permission denied (1100)` 在测试体启动前失败，不计自动化通过；停止隔离夹具后出现的本地 socket 断开属于测试环境关闭，不代表应用路径异常。Android 仅同步元数据至 9.2.86/90286，未构建 APK；本地不提交、推送或部署。

## v9.2.85 清单 B8：成片详情状态更新安全核实

- `src/pages/ShootingDetail.tsx`：状态切换前先确认剧本自动保存；请求前保存按账号与成片 ID 隔离的恢复标记。响应不明时只读读取详情：目标状态已生效则确认且不重发；仍为原状态时仅允许用户明确确认后重试；其它状态采用服务端最新值；读回失败时锁定状态、剧本、版本与归档写入，刷新后用初次详情 GET 恢复。无 API、数据库或权限变化。
- `tests/browser/shooting-delete-result-recovery.spec.ts`：扩展成片详情状态回归，覆盖已生效、保持原状态且明确重试、首次读回失败后刷新只读恢复，并断言 GET/PUT 次数与写入锁。
- `npm run check`、目标 ESLint（0 错误）、`npm run test:integrity:workflow`、`npm run test:publishing-douyin-link`、`npm run version:check`、版本治理、更新说明唯一性（429 个版本）、243 个测试入口、Android runtime 合同、`git diff --check` 和生产构建通过。构建保留既有大分包提示（Tiptap 555.12 kB、主入口 685.96 kB、Silk 843.50 kB）；成片详情分包 28.05 kB。Playwright MCP 隔离页面验证已生效、仍为原状态并由用户明确重试、详情读取失败后刷新只读恢复三个分支；Chrome DevTools MCP 独立确认已生效分支只发一条 PUT。夹具注入的 503 为预期响应，无应用运行时错误。仓库 `npm run test:shooting-delete-recovery-browser` 因 macOS Chromium `bootstrap_check_in … Permission denied (1100)` 在浏览器启动前失败，未进入断言体，不计自动化通过。无新增 API 路由、数据库或权限变化。Android 仅同步元数据至 9.2.85/90285，未构建 APK。本地不提交、推送或部署。

## v9.2.84 清单 B8：制作计划创建防重复与安全恢复

- `api/database/migrations/036_shooting_create_idempotency.ts`：添加 SAFE_EXPAND 幂等账本，保留删除墓碑；同请求编号、同载荷重放返回原记录，载荷冲突或已删除请求不重新创建。
- `api/routes/workflow.ts`、`src/api/workflow.ts`：新增创建者范围内只读状态查询；服务端在事务中原子写入制作记录与请求账本。
- `src/pages/Shooting.tsx`：发送前按账号保存原始表单与请求编号；结果不明时只读核实，确认缺失后仅使用同一编号显式重试，读取失败时暂停成片制作页写入并在刷新后恢复。
- `npm run test:shooting-create-idempotency`、`npm run test:shooting-create-idempotency-migration`、`npm run test:migration-readiness`、`npm run test:integrity:workflow`、`npm run test:publishing-douyin-link`、类型检查、目标 ESLint、版本检查/治理、更新说明唯一性（428 个版本）、测试入口（243 个）、Android runtime 合同、`git diff --check` 与生产构建通过。目标 ESLint 0 错误、12 条警告；构建保留既有大分包提示（Tiptap 555.12 kB、主入口 685.40 kB、Silk 843.50 kB）。
- Playwright MCP 隔离页面验证服务端已创建后 GET 确认且只发一次创建请求、未创建时保留原表单并仅以同一编号显式重试（最终一条记录）、状态 GET 失败后刷新只读恢复（创建 POST 仍为一次）；Chrome DevTools MCP 另行验证创建后回查。夹具 503 和未找到记录 404 为预期响应，无应用运行时错误。仓库 `npm run test:shooting-create-recovery-browser` 因 macOS Chromium `bootstrap_check_in … Permission denied (1100)` 在浏览器启动时失败，未进入断言体，不计自动化通过。迁移测试仅在临时数据库执行，未运行真实环境迁移。Android 仅同步元数据至 9.2.84/90284，未构建 APK。本地不提交、推送或部署。

## v9.2.83 清单 B8：制作计划完成结果安全核实

- `src/api/workflow.ts`：复用带原有查看权限的制作计划详情端点读取最新状态；完成 PUT 错误携带 HTTP 状态，便于区分确定拒绝和结果不明。
- `src/pages/Shooting.tsx`：响应不明时保存账号/记录/页码恢复标记并只读回查；确认已完成则更新列表且不重发，仍未完成则呈现服务端状态并交由用户重新确认，详情不可读时暂停本页写入并在刷新后恢复核实。
- `tests/browser/shooting-delete-result-recovery.spec.ts`：扩展隔离回归，覆盖完成已生效、仍处于制作中、首次回查失败后刷新只读恢复，断言完成 PUT 仅一次。
- `npm run check -- --pretty false`、目标 ESLint、`npm run version:check`、`npm run test:version-governance`、`npm run test:changelog-governance`（427 个唯一版本）、`npm run test:entrypoints`（240 个文件）、`npm run test:android-runtime`、`git diff --check` 和生产构建通过。构建保留既有大分包提示（Tiptap 555.12 kB、主入口 684.91 kB、Silk 843.50 kB）。
- Playwright MCP 隔离夹具实测三个完成结果分支：状态已完成时只发一条 PUT，状态仍为制作中时不自动重发，首次 PUT/详情回查均异常时写入锁定且刷新后仅 GET 恢复；测试注入的 503 是预期错误，未观察到其他页面运行时错误。仓库 Playwright 脚本因 macOS Chromium `bootstrap_check_in … Permission denied (1100)` 在测试体前启动失败，新增自动化断言未计为套件通过。
- 无新增 API 路由、数据库迁移或权限规则。Android 仅同步元数据至 9.2.83/90283，未构建 APK。本地不提交、推送或部署。

## v9.2.82 清单 B8：制作计划删除结果安全核实

- `src/api/workflow.ts`：复用现有制作计划详情读取端点；仅以 HTTP 404 确认记录已删除，读取失败继续保持不确定，不新增服务端路由。
- `src/pages/Shooting.tsx`：删除写入响应不明时保存当前账号/记录/页码恢复标记并只读核实；确认删除后移除行且不重发，记录仍存在时明确告知并由用户决定是否重新确认，详情也不可读时锁定本页写入，刷新后继续核实。删除按钮新增具名可访问标签。
- `tests/browser/shooting-delete-result-recovery.spec.ts`：覆盖已删除、仍存在、删除与首次核实均失败后刷新只读恢复三条隔离流程；验证请求只发送一次及核实期间写入锁定。
- `npm run check -- --pretty false`、目标 ESLint、`npm run version:check`、`npm run test:version-governance`、`npm run test:changelog-governance`（426 个唯一版本）、`npm run test:entrypoints`（240 个文件）、`npm run test:android-runtime`、`git diff --check` 和生产构建通过。构建保留既有大分包提示（Tiptap 555.12 kB、主入口 684.58 kB、Silk 843.50 kB）。Playwright MCP 隔离夹具验证 DELETE 仅一次、已删除 404 核实、记录仍存在不自动重试，以及首次详情读取失败后刷新只读恢复；Chrome DevTools MCP 独立复核不确定结果锁写和刷新恢复。仓库自动化因 macOS Chromium `bootstrap_check_in … Permission denied (1100)` 未启动，未进入测试体。无新增 API 路由、数据库迁移或权限规则。Android 仅同步元数据至 9.2.82/90282，未构建 APK。本地不提交、推送或部署。

## v9.2.81 清单 B8：Creator Agent 自动关联权限边界

- `api/services/douyinDataCenter.ts`：旧格式与标准协议两条同步完成后的自动匹配，均传入账号所属用户 ID，由关联服务只筛选其本人创建、负责或参与的发布稿件；范围外稿件不会被链接或推进选题状态。
- `tests/publishing/publishing-douyin-link.test.ts`：新增两种同步路径的越权隔离回归；批量刷新仍按用户确认的逐条编辑范围执行，全局编辑者仍可处理剩余记录。`npm run test:publishing-douyin-link`、类型检查、目标 ESLint（0 错误）、版本检查/治理、更新说明治理（425 个版本）、Android runtime 合同、239 个测试入口、`git diff --check` 与生产构建通过；构建保留既有 >500 kB 分包警告。无新增 API 路由、数据库迁移或权限授予。Android 仅同步元数据至 9.2.81/90281，未构建 APK。本地不提交、推送或部署。

## v9.2.80 清单 B8/H：编辑器剪贴板操作反馈

- `src/components/editor/ContextMenu.tsx`：右键菜单复制、剪切、粘贴根据浏览器命令的实际返回显示成功/失败通知；失败时说明剪贴板权限限制和替代操作，剪切失败明确正文变更未确认。
- `tests/browser/workflow-details-responsive.spec.ts`：隔离浏览器注入剪贴板命令成功/失败，覆盖通知、菜单关闭、单次命令调用及不产生稿件保存。
- 类型检查、定向 ESLint（0 错误、12 条既有警告）、`npm run test:publishing-douyin-link`、版本检查/治理、更新说明治理（424 个版本）、Android runtime 合同、239 个测试入口、`git diff --check` 与生产构建通过。Playwright MCP 和 Chrome DevTools MCP 在隔离页面验证剪贴板成功/失败反馈、菜单关闭及无稿件写入；仓库自动化因 macOS Chromium `bootstrap_check_in … Permission denied (1100)` 未进入测试体。构建保留既有 >500 kB 分包警告。无 API、权限或数据库变化；Android 仅同步元数据至 9.2.80/90280，未构建 APK。本地不提交、推送或部署。

## v9.2.79 清单 B4/B8：键盘焦点恢复与自动关联范围收敛

- `src/components/CommandPalette.tsx`：面板打开后聚焦搜索框；关闭时在原控件仍连接页面的前提下恢复焦点。
- `tests/browser/global-search.spec.ts`：覆盖焦点进入、上下键首尾边界、Enter 进入日报归档，以及 Escape/Ctrl+K 打开关闭后的焦点恢复。
- `api/routes/workflow.ts`、`api/services/publishingDouyinLink.ts`：抖音自动关联仅处理调用者可逐条编辑的记录；本人创建、负责或作为发布参与者均可编辑，范围外记录不写入且不进入统计，全局编辑者仍可全量刷新。
- `tests/publishing/publishing-douyin-link.test.ts`：director 三种编辑关系均可匹配；无关系的范围外精准匹配记录保持未关联且统计不泄漏；管理员仍可全批次处理。
- 验证：发布关联 API、类型、目标 ESLint、版本治理、更新说明治理、239 个测试入口、Android runtime 合同、差异检查和生产构建通过。Chrome DevTools MCP 在 1440px 实测上下键边界、日报 Enter 直达、2px 焦点环、Escape/Ctrl+K 焦点恢复，控制台无错误。仓库浏览器测试受 macOS `bootstrap_check_in … Permission denied (1100)` 阻止，未进入测试体。无新增路由、数据库结构或权限授予；Android 仅同步元数据至 9.2.79/90279，未构建 APK。本地不提交、推送或部署。

## v9.2.78 清单 G/B8：摘要与归档部分失败恢复

- `src/pages/mobile/MobileHome.tsx`：摘要读取失败时仍展示“复盘”阶段及未知数量；阶段预览明确说明无法确认是否有记录，并提供单独的只读重试。成功后恢复摘要数量和预览；正常空列表仍显示真实空状态。
- `api/routes/workflow.ts`、`src/api/workflow.ts`、`src/pages/Publishing.tsx`：抖音关联事务完成但归档同步失败时返回待同步数量并显示明确的部分完成提示；保留详情页已有重试，避免用户误以为关联未完成而重复操作。
- `tests/browser/topic-stage-record-repair.spec.ts`、`tests/publishing/publishing-douyin-link.test.ts`、`tests/browser/publishing-hover-contrast.spec.ts`：分别覆盖移动首页复盘失败恢复、数据库注入归档失败后状态提示/显式补齐，以及发布页部分完成反馈。
- `npm run check -- --pretty false`、首页和抖音关联 API 测试、目标 ESLint、版本检查/治理、更新说明治理（422 个版本）、239 个测试入口、Android runtime 合同、`git diff --check` 与生产构建通过；构建保留既有 >500 kB 分包提示。Playwright MCP 与 Chrome DevTools MCP 在 390×844 实测首页失败提示→只读重试→预览恢复；Playwright MCP 在 1200px 发布页实测归档部分失败提示。重试为 GET、页面无横向溢出且控制台无错误。仓库 Playwright 自动化受 macOS `bootstrap_check_in … Permission denied (1100)` 阻止，未进入测试体。无数据库/API 路由/权限变化；Android 仅同步版本元数据至 9.2.78/90278，未构建 APK。本地不提交、推送或部署。

## v9.2.77 清单 B8：抖音关联异常结果核实

- `src/api/workflow.ts`：新增发布详情关联状态只读核实，并保留 PUT HTTP 状态码以区分确定拒绝与结果不明；无新路由/迁移。
- `src/pages/Publishing.tsx`：关联或解除结果不明时保存账号/记录限定的标签会话状态；服务端已应用则只刷新、不重发，原状态仍在则恢复给用户手动重试，其他变化按服务器现状刷新。读回失败后暂停发布页写入、关闭选择框并提供只读核实入口；刷新后自动恢复。
- `tests/browser/publishing-hover-contrast.spec.ts`：覆盖提交后 PUT 与首次详情 GET 均异常、刷新恢复不重复写入，以及未提交后仅显式重试的分支。Chrome DevTools MCP 隔离 390×844 视口两支实测通过；仓库 Chromium 自动化受 macOS 启动权限阻挡，未进入测试体。
- `npm run check -- --pretty false`、目标 ESLint、发布抖音关联 API 测试、版本检查/治理、更新说明治理（421 个版本）、239 个测试入口、Android runtime 合同、只读迁移检查（GO）、`git diff --check` 与生产构建均通过；构建保留 >500 kB 分包提示（Tiptap 555.12 kB、主入口 681.83 kB、Silk 843.50 kB）。Chrome DevTools MCP 隔离 390×844 手动验证已提交但 PUT/首次 GET 均异常后刷新只读恢复、无重复 PUT，以及未提交后明确手动重试。仓库 Chromium 自动化受 macOS `bootstrap_check_in … Permission denied (1100)` 阻止，未进入测试体。Android 仅同步元数据至 9.2.77/90277，不构建 APK。本地修改，不提交、推送或部署。

## v9.2.76 清单 B8：发布详情剧本保存异常恢复

- `src/pages/PublishingDetail.tsx`：保存发布剧本及显式小/大版本前保存账号和发布记录限定的最小会话快照。响应不明时只读获取当前剧本及版本历史；成功版本仅确认一次，不重发；确认原状态不变时恢复编辑草稿并等待用户手动重试；发现其他变化时保留服务器现状与用户草稿。
- 状态读取失败时继续锁定剧本编辑、保存、归档同步和离开；刷新后自动 GET 恢复，仍失败则提供只读核实入口。版本操作在发送前读取基线版本 ID，验证新版本确实在本次后产生，避免相同内容或重复提交时误建版本。
- `tests/browser/workflow-details-responsive.spec.ts`：补充已提交但 PUT/首个详情 GET 异常后的刷新只读恢复、版本单条/不重复 PUT，以及未提交后保留草稿并由用户手动重试的分支。Chrome DevTools MCP 隔离页在 390×844 手验两种恢复分支通过；仓库 Chromium 自动化受 macOS `bootstrap_check_in … Permission denied (1100)` 阻止，未进入测试体。
- `npm run check -- --pretty false`、目标 ESLint、剧本来源集成/迁移测试、官方日期窗口（3 项）与统一报告、版本检查/治理、更新说明治理（420 个版本）、239 个测试入口、Android runtime 合同、迁移就绪检查（只读 GO）、`git diff --check` 和生产构建通过。官方日期窗口按北京时间且包含当天复验通过。构建保留 >500 kB 分包提示（Tiptap 555.12 kB、主入口 681.33 kB、Silk 843.50 kB）。Chrome DevTools MCP 390×844 隔离页手动恢复验证通过；仓库 Chromium 自动化受 macOS `bootstrap_check_in … Permission denied (1100)` 阻挡，未进入测试体。Android 仅同步版本元数据至 9.2.76/90276，不构建 APK。本地修改，不提交、推送或部署。

## v9.2.75 清单 B8：发布记录更新结果核实与日期恢复

- `src/api/workflow.ts`：增加发布记录更新状态只读核实，按拟提交值与写入前原值区分已更新、未更新和服务器另有变化；保留 HTTP 状态以区分确定拒绝和结果不明。
- `src/pages/Publishing.tsx`：更新结果不明确时先 GET 核实；结果读取失败则将当前账号的最小恢复快照放在标签会话并暂停本页写入，刷新后继续 GET。确认已应用后刷新列表、不再 PUT；确认未应用时恢复原编辑草稿但只允许用户手动重试；若服务器状态已变化则同时保留最新服务端值和用户草稿。
- 日期控件从发布记录时间戳读取 `YYYY-MM-DD` 自然日，不再将完整时间戳直接写入 `type=date` 导致日期变空。用户明确官方周期口径为北京时间且近 7/30 天包含当天；既有日期计算与跨日边界回归复验通过，本项未改周期算法。
- Chrome DevTools MCP 390×844 合成数据验证：服务端已更新但 PUT 与首个 GET 均失败，刷新只发 GET 后确认成功且没有重复 PUT；未提交的更新恢复编辑内容/日期，只有明确手动操作才重发。仓库 Playwright 自动化受 macOS Chromium `bootstrap_check_in … Permission denied (1100)` 阻挡，未进入测试体。
- `npm run check -- --pretty false`、目标 ESLint、发布创建幂等/迁移、发布关联/指标、官方日期窗口/统一报告、版本检查与治理、更新说明治理（419 个版本）、239 个测试入口、Android runtime 合同、迁移就绪检查（GO）、`git diff --check` 和 `npm run build` 均通过。构建保留既有 >500 kB 分包提示（Tiptap 555.12 kB、主入口 680.79 kB、Silk 843.50 kB）。Chrome DevTools MCP 390×844 隔离页面恢复实测通过；仓库 Chromium 自动化受 macOS `bootstrap_check_in … Permission denied (1100)` 阻止，未进入测试体。Android 仅同步版本元数据至 9.2.75/90275，不构建 APK。本地修改，不提交、推送或部署。

## v9.2.74 清单 B8：发布记录创建幂等与异常恢复

- `api/database/migrations/035_publishing_create_idempotency.ts`：新增 `SAFE_EXPAND` 请求账本，原子记录客户端请求编号、创建者、发布记录与规范化载荷指纹；保留墓碑，不因发布记录删除而丢失幂等状态。
- `api/routes/workflow.ts`：创建请求在同一编号、同一账号、同一载荷下回放原发布记录；跨账号或载荷不一致返回冲突，已删除记录返回 410；新增只读创建状态查询。既有不带编号客户端保持兼容。
- `src/pages/Publishing.tsx`：创建响应不明时先只读核实；读回也失败则把原请求编号和载荷保存在当前标签会话并暂停本页写入，刷新后继续 GET。确认尚未创建时仅允许用原编号安全重试，不自动重发；已删除请求不会复活。
- `tests/publishing/publishing-create-idempotency.test.ts`、迁移测试及浏览器回归覆盖原子回放、跨账号/载荷冲突、墓碑和 POST/GET 响应不明后的刷新恢复。Chrome DevTools MCP 合成页面在 390×844 验证服务端已提交、POST 与首次 GET 均失败后刷新只 GET 即找回记录，单次 POST、无横向溢出。仓库 Chromium 自动化受 macOS `bootstrap_check_in … Permission denied (1100)` 阻挡，未进入测试体。
- `npm run check -- --pretty false`、定向 ESLint（0 错误，`workflow.ts` 保留 12 条既有警告）、创建幂等/迁移/发布关联/指标测试、版本检查/治理、更新说明治理（418 个版本）、239 个测试入口、Android runtime 合同、`npm run migration:check`（GO）、`git diff --check` 和 `npm run build` 均通过；构建保留既有 >500 kB 分包警告。
- 日期窗口继续按用户确认的北京时间且包含当天，本项不改日期算法；Android 仅同步版本元数据至 9.2.74/90274，不构建 APK。本地修改，不提交、推送或部署。

## v9.2.73 清单 B8：发布记录删除结果只读恢复

- `src/api/workflow.ts`：新增发布记录按 ID 查询删除状态的只读方法；删除 API 错误保留 HTTP 状态以区分确定拒绝与结果不明。
- `src/pages/Publishing.tsx`：删除结果不明时关闭旧确认框并按 ID 核实；记录仍存在时不自动重删，提示用户检查后再明确确认；读回失败时将账号、记录 ID 与原页码保存在当前标签会话，刷新后继续 GET 核实。待核实期间禁用发布列表的新增、编辑、关联、删除和记录详情入口。
- `tests/browser/publishing-hover-contrast.spec.ts`：覆盖服务端仍有记录时的手动二次确认，以及 DELETE 已提交但响应与首次 GET 均失败后刷新只读 404 恢复；验证恢复期间控件锁、无第二次 DELETE 和清除会话标记。
- Playwright MCP 390×844 合成数据实测两条恢复分支通过；版本同步至 9.2.73/90273，未改数据库/API 路由/权限/真实数据，Android 只同步元数据，不构建 APK。类型检查、目标 ESLint、版本检查/治理、更新说明治理（417 个版本）、237 个测试入口、Android runtime 合同、差异检查和生产构建通过。仓库 Chromium 自动化受 `bootstrap_check_in … Permission denied (1100)` 阻挡，未进入测试体。本地不提交、推送或部署。
- 日期规则按用户确认的北京时间且包含当天，本项不涉及日期算法。B8 其它写入闭环、B4/B5 全站验收和 G 未闭合范围继续推进；Android 原生专项后置。

## v9.2.72 清单 B4/B5/G：移动首页全宽按钮验收

- `src/features/reactbits-appearance/ReactBitsButtonSlot.tsx`：动效/外观包装按按钮解析后的宽度类继承 `w-full` 或 `w-fit`，避免 Magnet、ClickSpark、GlareHover、BorderGlow 和 ElectricBorder 的包裹尺寸覆盖按钮本身的布局要求；StarBorder 仍直接使用按钮尺寸类。
- `src/pages/mobile/MobileHome.tsx` 与 `tests/browser/topic-stage-record-repair.spec.ts`：为首页快捷操作补 390px/320px 宽度与无横向溢出回归，验证布局结果而非只验证类名。
- 本项不改 API、权限、数据或 Android 原生界面；Android 仅同步版本元数据至 9.2.72/90272，不构建 APK。后续仍继续 B8 其余写入路径、B4/B5 全站主题/响应式验收以及 G 未闭合项。
- `npm run check -- --pretty false`、目标 ESLint、`npm run test:home-dashboard`、`npm run version:check`、版本/更新说明治理（416 个版本）、237 个测试入口、Android runtime 合同、`git diff --check` 和 `npm run build` 通过；构建保留既有 >500 kB 分包警告。Chrome DevTools MCP 合成账号在 390×844 和 320×844 暗色视口验证首页四个快捷操作分别填满 173px/138px 两列单元、无横向溢出，展开最近变化和进入灵感池成功且未写入数据。仓库 Playwright 在 Chromium 启动时因 `bootstrap_check_in … Permission denied (1100)` 未进入测试体；隔离页控制台连接错误由未启动的 Socket.IO 后端产生。未提交、推送或部署。

## v9.2.71 清单 B8：角色创建/删除异常结果只读核实

- `src/pages/PermissionManagement.tsx`：角色创建网络异常、408/425/429 或 5xx 后保存原表单最小快照并暂停所有角色写入；以角色编码只读读取服务端列表，按名称、描述、权限集合比对。读回失败或发现同编码资料不一致时继续锁定；刷新后恢复待核实状态；确认已创建则清理恢复凭据并关闭表单；确认缺失时只恢复原表单，由用户明确点击创建，不自动重发。角色删除结果不明时按角色编号只读读取详情，404 即确认删除，仍存在时必须由用户明确重新发起；读取失败维持写入锁定。数据库已有角色编码唯一约束，无迁移/API/权限变化。
- `tests/browser/workflow-designer-language.spec.ts`：覆盖创建确定未写入后的人工恢复与重试、服务端已提交但 POST 与首次读回失败后的刷新恢复（不重复 POST），以及删除已提交但 DELETE 与首次读回失败后的刷新确认（不重复 DELETE）；也覆盖删除确定未完成时明确接受当前服务器状态后再手动发起。
- 日期规则使用用户确认的北京时间自然日，近 7/30 天包含当天；本项不调整日期逻辑。Android 仅同步元数据至 9.2.71/90271，不构建 APK。
- 类型检查、目标 ESLint、版本检查/治理、更新说明唯一性（415 个版本）、237 个测试入口、Android runtime 合同、`git diff --check` 及生产构建通过，保留既有 >500 kB 分包提示。Chrome DevTools MCP 本地隔离页面在 390×844 实测创建和删除读回、刷新恢复及显式重试；页面无横向溢出。仓库 Chromium 自动化仍因 macOS `bootstrap_check_in … Permission denied (1100)` 未进入测试体；隔离前端无 Socket.IO 服务，控制台记录测试环境连接错误。未提交、推送或部署。
- 下一步继续 B8 其余写入结果恢复路径，并推进 B4/B5 全站视口、主题与可读性验收及清单 G 未闭合项；Android 原生专项按用户要求后置。

## v9.2.70 清单 B8/B4/B5：角色更新只读核实、剧本历史可读性与视口回归校正

- `src/pages/PermissionManagement.tsx`：角色更新响应为网络错误或 5xx 时，保存当前标签页的待核实状态并暂停所有角色写入；用户通过角色详情 GET 只读比对服务端资料，失败时保持锁定，刷新后恢复，确认时清除恢复状态且绝不重发 PUT。
- `tests/browser/workflow-designer-language.spec.ts`：新增服务端已提交但 PUT 返回 503、详情 GET 首次失败、刷新恢复、只读核实成功的回归；确认全过程仅一次 PUT 且完成后清除会话恢复凭据。
- `src/pages/ShootingDetail.tsx` 与 `tests/browser/workflow-details-responsive.spec.ts`：提升拍摄剧本历史辅助文本的 Studio 次级文字对比度；测试涵盖浅色/深色空状态、保存后操作人/时间及缺失创作来源。
- `tests/browser/workflow-details-responsive.spec.ts`、`published-archives.spec.ts`、`topic-stage-record-repair.spec.ts`、`production-review-webkit.spec.ts`：把相关缩放场景改用真实等效 CSS 布局视口，避免根元素 `zoom` 未触发响应式断点；新增/保留实际视口和横向溢出断言。
- 官方日期口径按用户确认的北京时间自然日（近 7/30 天包含当天），本阶段未修改日期实现或接口；无数据库变化。Android 仅同步版本元数据至 9.2.70/90270，未构建 APK。
- 验证：`npm run check -- --pretty false`、目标 ESLint、`npm run version:check`、版本治理、更新说明唯一性（414 个版本）、237 个测试入口、Android runtime 合同、`git diff --check` 与 `npm run build` 通过，构建保留既有 843.50 kB SilkBackgroundAdapter 分包提示。Chrome DevTools MCP 隔离夹具验证角色 PUT 503、只读 GET 首次 503、刷新后状态锁恢复、随后 GET 确认；仅有 1 次 PUT。剧本历史明暗主题空态及保存版本文字对比度最低约 7.02:1；390×844 手机和 1440×900 桌面无横向溢出，控制台 0 警告/错误。Chromium 自动化两项在 `bootstrap_check_in … Permission denied (1100)` 阻止下未进测试体；WebKit 自动化于引擎启动时 abort，同样未进测试体。未提交、推送或部署。
- 下一阶段继续 B8 其余写入结果恢复路径、B4/B5 页面级响应式/对比度验收及清单 G 可安全补齐项；安卓原生专项仍按用户要求后置。

## v9.2.69 清单 B8/B4/G：用户启停结果恢复、真实阶段停留与布局视口验收

- `src/api/users.ts` 增加按用户编号只读读取；用户启停请求返回异常时先核实服务端状态，若核实也失败则暂停新增、编辑、删除和再次切换，提供只读核实入口。核实已生效后刷新当前列表；所有恢复读取只发 GET，不重发 PUT。
- 桌面与手机首页的创作阶段预览，为“已通过 · 待开始创作”同时显示可信阶段停留时间；时间缺失、非法或在未来时明确显示“阶段时间待确认”，不使用普通更新时间补推。浏览器回归补充正常、缺失、非法和未来时间场景。
- `production-review.spec.ts` 移除根元素 CSS `zoom` 假缩放，按 1366/1440/1920 物理视口和 80%–125% 比例换算 CSS 布局视口，再检查操作按钮、编辑器工具栏和菜单。此为响应式重排模拟，不代表已直接验收 Chrome 原生缩放。
- 用户确认官方数据窗口统一按北京时间自然日：“昨天”取采集日前一天，近 7 天/近 30 天均包含采集当天；官方导出与统一报表边界测试通过，本轮未改变日期算法。
- 类型检查、目标 ESLint、首页摘要、官方导出 v3、统一报表、237 个测试入口、版本治理和生产构建通过；构建保留既有 843.50 kB SilkBackgroundAdapter 分包提示。Chrome DevTools MCP 隔离夹具实测启停 PUT 与首次状态 GET 分别返回 503 后，只读重试恢复为已禁用，网络证据为 1 次 PUT、2 次详情 GET、1 次列表 GET；同工具在 819×720 和 819×480 等效 CSS 视口验证编辑器操作/菜单未溢出，并检查桌面、移动首页均展示“已通过”和阶段停留时间。仓库 Playwright 三项浏览器回归均在测试体前因 macOS Chromium `bootstrap_check_in … Permission denied (1100)` 失败，不计自动化通过；原生 Chrome 缩放仍待单独验收。
- Android 仅同步版本元数据至 9.2.69/90269，未构建 APK。本地修改，不提交、推送或部署。
- 下一步继续 B4/B5 其余页面、B8 未闭合写入路径与清单 G 可安全补齐项；Android 原生专项仍后置。

## v9.2.68 清单 B8：灵感创建幂等与跨刷新恢复

- `api/database/migrations/034_inspiration_create_idempotency.ts` 新建独立请求账本，以唯一客户端编号绑定创建者、原灵感 ID 与载荷摘要；请求账本和灵感行在同一事务写入，避免内部编号暴露到业务实体。重复同内容返回原记录，不同载荷共用编号返回冲突；删除灵感不会删除请求墓碑，迟到重试返回已删除而不复活记录。
- `api/routes/inspirations.ts` 增加创建状态只读查询。前端在写入前将编号和原表单存入当前标签会话；异常时查询原请求状态，读回不可用则锁定编辑与再次提交；刷新后恢复并只读核实。确认尚未创建后，安全重试仍复用原编号。
- 创建 API 合同覆盖旧客户端兼容、成功/重复/并发四路重放、载荷冲突、单行持久化、删除墓碑和 410 读回；迁移重复执行保留既有记录、唯一键、SAFE_EXPAND 门禁回归通过。既有灵感评论迁移与原子写入回归同时通过。
- 日期口径按用户确认的北京时间自然日：昨天为采集日前一天；近 7 天、近 30 天包含采集当天。新增跨 UTC 午夜边界、完整端点和未来日拒绝回归，既有规则未变。
- 类型检查、目标 ESLint、灵感创建/评论迁移及 API 测试、迁移门禁、官方日期边界、版本治理（412 个版本）、测试入口（237 个文件）、Android runtime、生产构建及差异检查通过；构建保留既有 >500 kB 分包提示，SilkBackgroundAdapter 843.50 kB。Chrome DevTools MCP 隔离夹具验证已保存但 POST/首次只读 GET 均为 503，刷新恢复并只读取得一条记录，sessionStorage 清空且没有第二次 POST。仓库 Playwright 因 macOS Chromium `bootstrap_check_in … Permission denied (1100)` 在测试体前失败，不计自动化通过。
- Android 仅同步版本元数据至 9.2.68/90268，未构建 APK；本地修改，不提交、推送或部署。
- 下一步继续审计 B8 其它写入/读回闭环，并推进 B4/B5 全站验收及清单 G 未闭合项；Android 原生专项仍后置。

## v9.2.67 清单 B8：灵感评论幂等与跨刷新恢复

- `src/pages/Inspirations.tsx`：每条待提交评论预生成客户端请求编号，并在当前标签会话中暂存编号、草稿和是否需要核实；页面刷新或重新打开灵感详情时恢复草稿。异常响应后按编号只读查找；已保存则清空草稿与会话凭据，确认未保存则允许以原编号重试，状态不可读则锁住提交直到只读核实。确认删除的灵感会清理该条恢复状态。
- `api/routes/inspirations.ts`、迁移 `033`：评论表新增 nullable request ID 与唯一索引，历史评论保留 NULL；服务端对相同用户/灵感/内容的相同编号返回原评论且不重复广播，对不同载荷返回 409。旧客户端可继续不传编号。
- `tests/database/inspiration-comment-idempotency-migration.test.ts`、`tests/production/inspiration-mutations-atomic.test.ts`：覆盖旧数据兼容、迁移重复执行、请求编号唯一性、原子写入、重试回放和编号冲突。`tests/browser/inspiration-theme-contrast.spec.ts` 补充确定失败复用编号、响应和首读均失败、刷新后锁住重复提交、只读恢复及单条呈现。
- 评论迁移、灵感接口原子性、迁移门禁、`npm run check -- --pretty false`、目标 ESLint、生产构建、版本/更新说明治理、测试入口、Android runtime 与差异检查通过；构建保留既有最大分包提示。Chrome DevTools MCP 两轮隔离夹具分别验证确定失败后的同编号安全重试，以及已提交但 POST/首个 GET 均为 503 后刷新恢复；刷新只触发详情 GET、不再发送 POST，随后只读核实恢复为单条评论并清除 sessionStorage 凭据。刷新后的页面无应用控制台错误，故障注入产生的 503 为预期。仓库 Playwright 因 macOS Chromium `bootstrap_check_in … Permission denied (1100)` 在测试体前失败，不计自动化通过。
- 官方数据日期继续按北京时间且包含当天，本项未改日期处理。Android 仅同步元数据至 9.2.67/90267，未构建 APK。本地修改，不提交、推送或部署。
- 下一步继续审计 B8 剩余写入与读回路径，并持续补齐 B4/B5 全站验收及清单 G 未闭合范围；Android 原生专项仍后置。

## v9.2.66 清单 B8：灵感点赞与转选题结果只读核实

- `src/pages/Inspirations.tsx`：点赞/取消点赞是切换式写入，异常响应后先读取详情并按服务端 `voted` 与计数同步；确认没有生效后才允许安全重试。转选题响应异常时读取服务器关联编号；已建立关联则同步页面并打开目标，状态读回失败时暂停再次转化。两种路径均提供只读核实入口，实时删除事件会清理对应的待确认标记。
- `tests/browser/inspiration-theme-contrast.spec.ts`：模拟点赞与转选题已在服务器提交但返回 503、首次状态 GET 也返回 503，再分别只读恢复；断言没有额外点赞/转化写入。既有确定失败安全重试、延迟重复触发、评论和删除回归继续保留。
- 门禁通过：`npm run check -- --pretty false`、目标 ESLint、生产构建、Android runtime 合同、灵感 mutation/create-response/topic-link 服务端合同、版本检查/治理、更新说明唯一性（410 个版本）、测试入口（235 个文件）与 `git diff --check`。构建保留既有 >500 kB 分包提示，最大 SilkBackgroundAdapter 843.50 kB。
- Chrome DevTools MCP 隔离页面分别验证点赞写入已提交但响应丢失、连续核实读取失败与恢复，以及转选题已创建但响应丢失、只读读回失败、随后读取到关联选题 #990 并打开目标；整个恢复过程未重复点赞或转化。仓库 Playwright `test:inspiration-theme-contrast-browser` 因 macOS Chromium `bootstrap_check_in … Permission denied (1100)` 在测试体前退出，不计自动化通过。
- 日期口径按用户确认统一为北京时间：“昨天”为采集日的前一自然日，近 7 天/近 30 天均包含采集当天。复核官方导入契约与实现，已有完整自然日、连续性、未来/错窗拒绝规则符合口径；`test:official-export-v2`、`test:creator-dashboard-freshness`、`test:creator-unified-reports` 均通过，本轮无需改日期逻辑。Android 仅同步元数据至 9.2.66/90266，未构建 APK。本地修改，不提交、推送或部署。
- 下一步继续审计 B8 剩余写入与读回路径，并持续补齐 B4/B5 全站验收、清单 G 尚未闭合范围；Android 原生专项仍后置。

## v9.2.65 清单 B8：人员删除后的列表读取恢复

- `src/pages/Users.tsx`：删除得到服务端确认后立即从当前结果移除该用户和相应总数，再按当前筛选条件读取列表；读取失败时将“删除已成功”与“列表刷新失败”分开说明，重新加载只发起 GET，不重复删除。
- `tests/browser/users-refresh-query-race.spec.ts`：覆盖过滤后删除、服务端读取注入一次 503、确认操作已关闭、失败提示、防重复删除，以及只读重试后空结果和提示清除；已有列表请求乱序/过期响应用例继续保留。
- `npm run check`、目标 ESLint、`npm run build`、`npm run test:android-runtime`、版本检查/治理、更新说明唯一性（409 个版本）、235 个测试入口与 `git diff --check` 通过；构建保留既有 SilkBackgroundAdapter 843.50 kB 分包提示。Playwright MCP 隔离页面确认删除请求一次，刷新失败显示恢复说明，重新加载后删除记录不再出现且删除请求仍为一次；唯一控制台错误为夹具预期的 503。仓库 Playwright 因 macOS Chromium `bootstrap_check_in … Permission denied (1100)` 在测试体前失败，不能计为自动套件通过。
- B4 选题列表缩放回归不再用 `document.documentElement.style.zoom` 放大 CSS 树，而按桌面物理窗口尺寸除以缩放比例设置真实 Chromium CSS 视口，覆盖对应的媒体查询重排；增加按钮滚入可视区、页面无横向溢出和下一步/固定操作列不重叠断言。Chrome DevTools MCP 隔离页实测 1366×768、1440×900、1920×1080 各自对应 80%–125% 的 15 组视口，查看/删除/进入创作操作与流程标签全部通过；截图所示 1366×768/125% 等效视口为 1093×614，表格内可横向滚动，固定操作按钮仍可见。页面无错误，仅有已有 React Bits `magic-bento` 安全映射 warning。自动套件仍因相同 Chromium 启动权限未进入测试体；原生 Chrome 浏览器菜单缩放尚未直接操作，因此不据此关闭 B4/B5 全站审计。
- 官方日期窗口统一按北京时间并包含当天，本项未改日期处理。Android 仅同步元数据至 9.2.65/90265，未构建 APK；本地修改，不提交、推送或部署。
- 下一步继续核查 B8 未闭合读写路径，B4/B5 全站主题/响应式/可见性审计与清单 G 尚未完成口径仍开放；Android 原生专项按用户要求后置。

## v9.2.64 清单 G：手机首页进行中选题准确总数

- 手机工作台此前只把首页摘要的最多三条选题预览显示为“最近选题”，未展示 `active_topics.total`，用户无法区分预览数与真实总数。现改为按摘要范围显示“团队进行中的选题”或“我的进行中的选题”，并明确“共 N 项 · 展示最近 M 项”；若总数非零而预览暂缺，不再呈现“当前没有进行中的选题”。不改服务端统计、账号范围、API/权限或数据库。
- 最近选题条目和“查看全部”改用共享 `ActionButton`，保持导航状态并遵循 Studio 文字令牌。浏览器回归增加个人 2/1、团队 47/3 的总量与预览断言；另以团队总数 47、预览 0 覆盖摘要预览缺失时仍展示真实总量、提示预览暂不可用且不误报空数据。
- `npm run check -- --pretty false`、目标 ESLint、`npm run test:home-dashboard`、`npm run version:check`、`npm run test:version-governance`、`npm run test:changelog-governance`（408 个版本）、`npm run test:entrypoints`（235 个文件）、`npm run test:android-runtime`、`npm run build` 与 `git diff --check` 通过；构建保留既有 SilkBackgroundAdapter 843.50 kB 分包提示。Chrome DevTools MCP 隔离夹具在 390×844 浅色与 320×844 暗色验证页面身份、非空页面、无错误浮层、团队准确总数、`/topics` 跳转与控制台无错误；320px 页面无横向溢出。个人隔离账号显示 2 项总数/1 条预览且只呈现个人数据。仓库 Playwright 自动化未运行，不将手工 MCP 验收等同自动化通过。
- 用户确认所有官方日期窗口使用北京时间且包含当天；本项不涉及日期逻辑。Android 仅同步版本元数据至 9.2.64/90264，未构建 APK；本地修改，不提交、推送或部署。
- 下一阶段继续清单 G 中待产品口径的审核责任/自审规则、可信播放异常阈值及跨模块团队概览，同时持续处理 B4/B5 全站验收与 B8 读写闭环；Android 原生专项按用户既定安排后置。

## v9.2.63 清单 G：桌面首页审核待办直达

- 桌面首页“审核稿件”带一次性 `action=review` 直达稿件详情；当前版本仍待审、权限已确认且服务端 `can_edit` 允许时，自动把键盘焦点移至“审核通过”，随后移除参数。打开任务不自动审批；无权、过期或历史版本不呈现审批按钮。
- 桌面稿件详情把正文编辑能力与审核动作分开。只读审核者沿用当前服务器正文，携带 `expected_content` 显式提交状态更新；若正文已变化，服务端冲突保护仍拒绝过期写入。
- `npm run check -- --pretty false`、定向 ESLint、`npm run test:home-dashboard`、`npm run test:production-review`、版本检查/治理、更新说明唯一性（407 个版本）、235 个测试入口、Android runtime 合同、生产构建与差异检查通过；构建保留既有 843.50 kB Silk 分包提示。仓库 Playwright 因 macOS Chromium `bootstrap_check_in … Permission denied (1100)` 在测试体前失败；Playwright MCP/Chrome DevTools 隔离夹具 1440×960 验证授权直达/参数清除/焦点/只读正文/无自动写入/显式单次审批，另验证只读账号无审批动作且无写入，页面控制台错误为 0。Android 仅同步元数据至 9.2.63/90263，未构建 APK。本地修改，不提交、推送或部署；G 其它角色任务/卡点、B4/B5 全站验收、B8 剩余项及 Android 原生专项继续开放。

## v9.2.62 清单 G：筛选地址与页面状态一致

- 桌面选题状态筛选变更后写入 `status` 查询参数，清除状态时删除参数；保留列表/看板等其它查询状态并用 replace 更新，避免把每次选择都塞进浏览器返回历史。
- 手机网页选题筛选现用 `status=pending|creation` 与 `topic_filter=mine|active` 保存视图；“全部”清除两者。筛选按钮补充 `aria-pressed`，读屏可获知当前选择。
- `npm run check -- --pretty false`、目标 ESLint、选题 API 测试与 `git diff --check` 通过。仓库 Playwright 因 macOS Chromium `bootstrap_check_in … Permission denied (1100)` 在测试体前失败；Playwright MCP/Chrome DevTools 隔离夹具实测 1440×960/390×844 状态切换、刷新恢复和清除，手机页面无横向溢出。Android 仅同步元数据至 9.2.62/90262，未构建 APK。本地修改，不提交、推送或部署。清单 G 角色任务/卡点、B4/B5 全站验收、B8 剩余项及 Android 原生专项继续开放。

## v9.2.61 清单 G：补齐工作台创作阶段中的已通过选题

- 工作台的创作阶段统计/预览同时包含 `approved` 与 `production`；每条预览保留真实状态并为已通过项标出“待开始创作”。点击阶段进入 `status=creation` 联合筛选；服务端选题列表、桌面列表/看板、移动网页均使用既有权限范围，不改变状态流转。
- 新增摘要统计/预览、API联合筛选、状态合同及浏览器回归。类型检查、目标 ESLint、首页/选题/筛选/OpenAPI 合同、版本/更新说明治理、235 个测试入口、Android runtime、生产构建及差异检查通过；构建保留既有 843.50 kB Silk 分包提示。Playwright MCP 隔离夹具在 1440×960 / 390×844 实测阶段预览、联合筛选和看板，控制台 0 错误、1 条现存 React Bits `magic-bento` 安全回退提示；仓库浏览器自动化本轮未执行。Android 仅同步元数据至 9.2.61/90261，未构建 APK。本地修改，不提交、推送或部署。清单 G 其它角色任务/卡点、B4/B5 全站验收、B8 剩余项及 Android 原生专项继续开放。

## v9.2.60 清单 G：创作者桌面首页稿件保存状态

- 桌面工作台稿件待办新增保存状态提示，与手机网页提取共享组件。按当前账号匹配最近编辑事件，仅 `writeConsistency:saved` 显示“本次会话已确认保存”；其它账号事件、仅协作同步、历史时间戳均不声称已保存。
- 组件订阅完整事件快照，而非只订阅归约后的状态字符串；浏览器实测发现并覆盖连续保存事件归约为相同状态时，旧实现无法重绘的边界。
- `npm run check -- --pretty false`、定向 ESLint、`npm run test:home-dashboard` 与 `git diff --check` 通过。仓库 Playwright 因 macOS Chromium `bootstrap_check_in … Permission denied (1100)` 在测试体前退出；Playwright MCP 隔离夹具验证 1440×960 / 390×844、账号隔离、明确保存确认、手机无横向溢出及当前页面控制台 0 错误/警告。Android 仅同步元数据至 9.2.60/90260，未构建 APK。本地修改，不提交、推送或部署。G 其它角色任务/卡点、B4/B5 全站验收、B8 剩余项及 Android 原生专项继续开放。

## v9.2.59 清单 G：创作者首页“写两句”

- 桌面工作台新增“写两句”入口，路由到既有创作管理页并通过一次性 `action=write` 在权限确认后打开现有“添加创作记录”弹窗；无 `production:update` 时不会打开。手机网页入口直达现有新稿编辑器，并限制于网页运行时；未改变原生 Android 首页。
- 浏览器回归覆盖桌面弹窗与关联选题、手机 390px 编辑器跳转，以及账号切换/迟到权限回包后不显示写稿入口。Chrome DevTools MCP 隔离夹具 390×844 / 1440×960 实测跳转和弹窗，未提交创作写入。
- `npm run check -- --pretty false`、目标 ESLint、`npm run test:home-dashboard` 通过。仓库浏览器脚本因 macOS Chromium `bootstrap_check_in … Permission denied (1100)` 在测试体前失败，不计自动化通过。Android 仅同步元数据至 9.2.59/90259，未构建 APK。仅本地修改，未提交、推送或部署。G 其他角色任务/卡点、B4/B5 全站验收、B8 剩余项及 Android 原生专项继续开放。

## v9.2.58 清单 G：手机首页待审核稿件一步审批

- 手机网页首页待审核稿件现在带 `action=review` 直达稿件当前版本；固定操作区针对 `review` 状态显示“保存修改 / 审核通过”，审批先等待协作编辑器保存确认，并将已确认正文、当前版本和 `expected_content` 一并发给既有工作流接口。
- 继续使用现有 `production:update` 与服务端选题范围 ACL，不新增角色或权限规则。离线、正文保存失败/冲突/超时时不发审批；首页待办已过期时显示真实状态、页面只读且隐藏提交/审批按钮；成功响应后本地状态转为已通过，防止重复点击。
- 自动化回归扩展手机工作台待办：验证 `action=review`、实际一次 `PUT status=approved`、成功后按钮隐藏及只读、无权限直链拒绝。类型检查、全仓 lint（0 错误/290 警告）、生产构建、版本治理、更新说明治理（402 个版本）和 Android 生产端点契约通过；保留既有 843.50 kB Silk 分包提示。仓库 Playwright 在 Chromium 启动阶段因 macOS `bootstrap_check_in … Permission denied (1100)` 失败，未进入测试体；Chrome DevTools MCP 手动验证 390×844 页面与隔离 API 夹具，包含单次审批 payload、已通过状态、过期任务只读、无权限拒绝和 390px 无横向溢出。
- Android 构建产物集成测试因缺少 Android 专用 `dist/xmt-mobile-build.json` 未完成；未执行 Android 构建/Capacitor 同步。Android 仅同步元数据至 9.2.58/90258，未构建 APK；本地修改，不提交、推送或部署。G 其他角色任务/卡点规则、B4/B5 全站验收、B8 剩余路径及 Android 原生专项仍开放。

## v9.2.57 清单 G：手机网页首页审核待办直达

- 桌面首页的“开始审核”已带 `action=audit` 直达并展开审核界面，手机详情此前忽略参数，导致用户必须二次点击。现在手机页在选题与权限加载完成后，只对仍待审且具备审核权限的用户展开审核面板，并移除一次性参数。
- 直达不会自动提交审核；无权限用户、选题状态已变化或只读版本仍不出现审核控件。新增手机有权限/无权限直达回归，同时保留审核提交防双击用例。
- `npm run check -- --pretty false`、全仓 lint（0 错误/290 警告）、生产构建、版本检查/治理、更新说明唯一性（401 个版本）、测试入口（235 个文件）、Studio token（38 类）、Android endpoint 合同及官方导出/日期窗口/统一报表测试通过；构建保留既有 843.50 kB Silk 分包提示。Chrome DevTools MCP 390×844 隔离夹具确认有权时面板自动展开、URL 参数清除且未触发提交；无权限时仅显示只读详情。仓库 Playwright 在 Chromium 启动阶段因 macOS `bootstrap_check_in … Permission denied (1100)` 失败，未进入测试体，不计自动化通过。
- 用户确认官方数据窗口统一使用北京时间并包含当天；现有导出契约和日期边界回归已符合，昨天仍为采集日前一日。Android 仅同步元数据至 9.2.57/90257，未构建 APK。本地修改，不提交、推送或部署。

## v9.2.56 清单 G：手机网页创作者灵感入口

- 对照角色化首页要求，发现桌面端已有“记灵感”，手机网页首页却没有同等快捷操作。新增首页入口直接进入现有 `/inspirations`，不改数据、接口或权限。
- 入口明确限定于响应式网页，原生 Android 首页不受影响；Home 浏览器回归增加 390px 可见性断言。
- 类型检查、全仓 lint（0 错误/290 警告）、版本同步与治理、更新说明唯一性（400 个版本）、Studio token（38 类）、Android runtime 合同及生产构建通过；构建保留既有最大 843.50 kB Silk 分包提示。Playwright Home 回归因 macOS Chromium `bootstrap_check_in … Permission denied (1100)` 在测试体前失败，不计自动化通过；Chrome DevTools MCP 390×844 实际网页夹具确认“记灵感”可见并能打开灵感页。
- Android 仅同步版本元数据至 9.2.56/90256，未构建 APK；本地修改，不提交、推送或部署。

## v9.2.55 清单 G：首页顶部公告条

- 现有 `AnnouncementBoard` 与公告 API 原先均未挂载到产品界面。首页布局现显示紧凑的置顶/最新公告条，并可展开原公告板，沿用 `system:announcement` 权限、服务端确认及删除二次确认，不改变 API、权限或数据库。
- 桌面与响应式手机网页首页均显示公告条；原生 Android 使用同一移动首页组件但明确不挂载该网页入口，Android 专项行为保持不变。首页浏览器回归增加 390px 移动网页呈现断言。
- 公告条读取失败明确提示并提供只读重试；新增浏览器回归覆盖错误恢复、置顶内容、展开/收起、320px 无横向溢出及只读用户。
- 首页任务队列卡点摘要同时显示负责人或待认领及截止日；Chrome DevTools MCP 在 1440px 隔离页实测亮色 7.45:1、暗色 8.29:1，回归新增对应断言。
- 本轮新增后的 `npm run check -- --pretty false`、全仓 lint（0 错误/290 警告）、目标 ESLint、版本治理、更新说明唯一性（399 个版本）、Studio token（38 类）、Android runtime 合同与生产构建均通过；保留既有最大 843.50 kB Silk 分包提示。仓库 Home 浏览器测试因 macOS Chromium `bootstrap_check_in … Permission denied (1100)` 在测试体前退出，不计自动化通过。Chrome DevTools MCP 实际 Home 隔离夹具验证 390×844 手机网页可见公告条、可展开原公告板、文档宽度 390px 无横向溢出；另有既有 320px 隔离夹具覆盖公告错误重试、展开/收起及编辑者无管理按钮。
- Android 仅同步元数据至 9.2.55/90255，未构建 APK；本地修改，不提交、推送或部署。

## v9.2.54 清单 G/B4/B5：工作台近 7 天指标日期口径与文字可读性

- 工作台可选抖音指标原显示近 7 天播放变化、来源与观测日期，但未说明统计自然日口径；现在明确写出北京时间自然日、包含当天，不改后端统计或统计数据。
- 近 7 天指标标签及来源说明从 muted 改用 Studio 次级文字；浏览器回归增加窗口口径和亮/暗主题 4.5:1 对比断言，并覆盖 390px 暗色负责人首页。
- `npm run check -- --pretty false`、`npm run test:home-dashboard`、创作者数据新鲜度/官方导出/统一报表测试、版本与更新说明治理、测试入口、Studio token、Android runtime 合同通过；全仓 lint 0 错误/290 警告，生产构建通过并保留既有最大 843.50 kB Silk 分包提示。`npm run test:topic-stage-record-repair-browser` 因 macOS Chromium `bootstrap_check_in … Permission denied (1100)` 在浏览器启动阶段退出，未进入测试体，不计自动化通过；Playwright MCP 当前会话连接已关闭，无法进行 MCP 浏览器补验。
- 无 API、权限、数据库或真实业务数据变化；Android 仅同步版本元数据至 9.2.54/90254，未构建 APK。本地修改，不提交、推送或部署。
- 下一步继续核对首页 G 尚未闭合的角色任务和“每条任务可点下一步”规则，再持续推进 B4/B5 全站验收与 B8 其余读写闭环；Android 原生专项继续后置。

## v9.2.53 清单 B4/B5：报告中心周报与数据导出可读性

- 暗色 320px Lighthouse 在周报摘要指标、负责人/平台说明处发现普通文字对比度最低 3.82:1；导出页另发现说明文字最低 3.82:1、另有 4.23:1。现将周报指标标签、加载状态、选题负责人、平台徽标、导出类型/格式说明与报告卡片描述统一改用 Studio 次级文字。
- 报告中心原为 h1→h3→h4；现周报标题为 h2、周报内容分区为 h3，数据导出标题与 JSON 导出标题均为 h2，文件卡片为 h3。
- `tests/browser/analytics-read-recovery.spec.ts`：标题层级和旧 muted 文字令牌检查覆盖数据复盘、周报失败/成功态及导出页；继续覆盖真实只读读取重试行为。
- Chrome DevTools MCP 隔离内存样例复核 320px 暗色周报失败态与导出页、390px 亮色周报成功态与导出页：Lighthouse Accessibility、Best Practices、SEO 均 100，文档宽度等于视口宽度，未下载文件、无业务写入。
- `npm run check -- --pretty false`、全仓 lint（0 错误/290 警告）、`npm run build`、版本治理、更新说明唯一性（397 个版本）、测试入口（234 个文件）、Studio token（38 类）、Android runtime、analytics 写范围、创作者新鲜度/官方导出/统一报表及 `git diff --check` 通过；构建保留既有最大 843.50 kB Silk 分包提示。
- `npm run test:analytics-browser` 因 macOS Chromium `bootstrap_check_in … Permission denied (1100)` 在浏览器启动时退出，未进入测试体，新增自动断言不计通过；MCP 手动验收不替代仓库自动化。
- Android 仅同步元数据至 90253，未构建 APK；无 API、权限、数据库或真实业务数据变化。本地修改，不提交、推送或部署。日期口径已确认为北京时间并包含当天；继续 B4/B5 其他页、B8 闭环和 G 未完成项，Android 原生专项后置。

## v9.2.52 清单 B4/B5：数据复盘与协作热力图可读性

- 暗色 320px Lighthouse 标记数据复盘指标标签及协作热力图说明/刻度的普通文字对比度不足；将统计加载提示、指标标签、周期说明、作品来源说明及热力图说明/刻度改用 `text-studio-text-secondary`。
- 数据概览、作品表现与历史数据、个人统计排行、协作热力图从 h3 改为 h2，消除页面 h1 后直接跳到 h3 的标题层级问题。
- `tests/browser/analytics-read-recovery.spec.ts` 新增主内容标题顺序与普通文本令牌断言，覆盖初次读取失败和成功数据状态；页面视口矩阵沿用现有键盘/窄屏验证。
- Chrome DevTools MCP 隔离内存样例复核 320px 暗色、390px 亮色及 1440px 亮色：Lighthouse Accessibility、Best Practices、SEO 均 100；文档宽度分别等于视口宽度，控制台错误为 0。全局 llms.txt Agentic Browsing 提示不属于本页回归。
- `npm run check -- --pretty false`、全仓 lint（0 错误/290 警告）、`npm run build`、版本/更新说明治理（396 个版本）、测试入口（234 个文件）、Studio token（38 类）、Android runtime、analytics 写范围、创作者新鲜度/官方导出/统一报表及 `git diff --check` 通过。构建保留既有最大 843.50 kB Silk 分包提示。
- `npm run test:analytics-browser` 因 macOS Chromium `bootstrap_check_in … Permission denied (1100)` 在浏览器启动阶段退出，未进入测试体，新增自动断言不计通过；MCP 手工验收不替代仓库自动化。
- Android 仅同步元数据至 90252，未构建 APK；无 API、权限、数据库或真实业务数据改动。本地修改，不提交、推送或部署。后续继续 B4/B5 其他页面、B8 读写闭环、G 未完成项；日期窗口按北京时间并包含当天，Android 原生专项继续后置。

## v9.2.51 清单 B4/B5：创作者作品库、详情与运营概览可读性

- 只读审查发现 `CreatorWorks.tsx` 在 320px 暗色存在 6 处普通文字 4.07:1，作品评分在 390px 亮色仅 3.68:1；`CreatorWorkDetail.tsx` 在 320px 暗色存在 9 处普通说明低于 4.5:1。现将普通说明改为 Studio 次级文字，作品评分改用 `text-studio-cyan-contrast`。
- 运营概览 320px 暗色 Lighthouse 发现 12 处普通文字低于 4.5:1（最低 3.82:1），另发现 ProfileCard 装饰名称跳过 h2 直接生成 h3，且“查看作品”按钮的 aria-label 与可见文案不匹配。现普通说明统一改用 Studio 次级文字，装饰标题从语义标题树移除，按钮名称与可见文本一致。
- `tests/browser/creator-works-read-recovery.spec.ts`：增加作品库、作品详情与运营概览的普通说明对比度、作品评分、标题层级与 320px 溢出回归；隔离内存夹具仅提供脱敏样例数据。
- Chrome DevTools MCP 隔离夹具复测运营概览 320px 暗色、390px 亮色及 1440px 亮色 Lighthouse Accessibility / Best Practices / SEO 均 100；作品详情 320px 暗色也均 100；运营概览文档宽度与视口一致。Agentic Browsing 仅保留全站 llms.txt 建议，不影响页面无障碍得分。未执行创建绑定码等写操作。
- `test:creator-dashboard-freshness`、`test:official-export-v2`、`test:creator-unified-reports`、`npm run check -- --pretty false`、版本检查/治理、更新说明唯一性（395 个版本）、入口检查（234 个文件）、Studio token（38 类）、Android runtime 合同、`git diff --check` 通过。定向 ESLint 复跑通过；全仓 `npm run lint` 通过（0 错误/291 警告），目标 React Bits 文件清理 1 条未使用导入警告。
- `npm run build` 通过，保留既有 >500 kB 分包提示，最大 Silk 背景包 843.50 kB。仓库 Playwright 自动化因 macOS Chromium `bootstrap_check_in … Permission denied (1100)` 在浏览器启动时退出，测试体未执行，不计通过。
- Android 仅同步元数据至 90251，未构建 APK；无 API、权限、数据库或真实业务数据改动。本地修改，不提交、推送或部署。
- 下一步继续 B4/B5 其他页面、B8 其他读写闭环及 G 未完成项；日期窗口按北京时间且包含当天，Android 原生专项继续后置。

## v9.2.50 清单 B4/B5：创作者趋势页暗色对比度

- Chrome DevTools MCP 隔离浏览器在 320×740px 暗色主题发现 6 处普通文字对比度不足，未选周期按钮/周期合计最低 4.23:1；`CreatorTrends.tsx` 中周期按钮、周期合计、来源说明、加载/空/数据不完整状态改用 Studio 次级文字令牌。
- `tests/browser/creator-trends-official-daily.spec.ts`：增加本地 MCP 内存样例夹具模式；普通趋势文字对比度断言覆盖 1440px 桌面、390px/320px 移动暗色、390px 亮色，以及官方 90 天不完整状态。原有周期切换/失败恢复行为不变。
- Chrome DevTools MCP 修复后复测 320px 暗色与 390px 亮色 Lighthouse Accessibility / Best Practices / SEO 均 100；视口和文档宽度一致，无横向溢出，控制台错误/警告为 0。只读趋势样例，无真实账号、业务数据写入或操作。
- 仓库 Playwright 自动化因 macOS Chromium `bootstrap_check_in … Permission denied (1100)` 在浏览器启动阶段退出，未进入测试体，不计通过；MCP 人工验收不替代自动化。
- 类型检查、定向 lint、全仓 lint（0 错误/292 警告）、生产构建、版本/更新说明治理、测试入口、Studio token、Android runtime 及 `git diff --check` 通过；构建保留既有最大 843.50 kB Silk 分包提示。Android 仅同步元数据至 90250，未构建 APK。本地修改，不提交、推送或部署。
- 下一步继续 B4/B5 其他页面主题/响应式验收，B8 其余读写闭环和 G 未完成项；Android 原生专项按用户要求延期。

## v9.2.49 清单 B4/B5：创作者运营报告暗色对比度

- 首次只读浏览发现创作者报告页在 320×740px 暗色主题有 22 处普通文案低于 4.5:1，最低 3.87:1；包括报告历史时间、指标标签、共享页头/面板说明、数据完整度说明、异常状态与作品元信息。
- `src/pages/creator-center/CreatorReports.tsx` 与 `shared.tsx`：普通文字改用 Studio `text-studio-text-secondary`，装饰图标继续使用 muted 令牌。`tests/browser/creator-reports-auth-readiness.spec.ts` 新增普通报告文案对比度断言，覆盖桌面深色、移动 390/320px 暗色，以及旧口径报告亮暗主题。
- Chrome DevTools MCP 隔离内存夹具实测：320px 暗色与 390px 亮色 Lighthouse Accessibility / Best Practices / SEO 均 100；页面无横向溢出，控制台错误/警告为 0。390px 暗色 25 个普通说明/标签实测最低 7.57:1。没有点击生成/删除，不涉及真实账号或报告数据。
- 类型检查通过；定向 ESLint 0 错误、8 条 shared.tsx React Fast Refresh 规则警告；全仓 lint 0 错误/292 警告；生产构建通过，保留既有最大 843.50 kB Silk 分包提示。版本检查/治理、更新说明唯一性（393 个版本）、测试入口（234 个文件）、Studio token（38 类）、Android runtime、创作者统一报表/新鲜度/官方导出合同测试及 `git diff --check` 均通过。`npm run test:creator-reports-browser` 因 macOS Chromium `bootstrap_check_in … Permission denied (1100)` 在浏览器启动阶段退出，未进入测试体，不计通过；MCP 人工验收不替代自动化。
- 无 API、权限或数据库变化。Android 仅同步版本元数据至 90249，未构建 APK。本地修改，不提交、推送或部署。
- 下一步继续 B4/B5 其他页面的主题/响应式审计、B8 其余读写闭环及 G 未完成项；Android 原生专项按用户要求延期。

## v9.2.48 清单 G：创作者报告周期日期边界

- `api/services/douyinDataCenter.ts`：日报、周报、月报的作品发布日期按对应窗口的北京时间自然日闭区间筛选；日报锚定昨天，周报/月报使用官方近 7/30 天文件的日期端点，窗口前一日继续作为期初快照基线，窗口结束后的记录不再计入。没有有效官方端点时沿用最近真实快照日期，并将未来锚点夹到北京时间当天。
- `tests/creator/douyin-unified-reports.test.ts`：隔离临时数据库为日报、周报、月报分别加入北京时间午夜前后边界，验证窗口前一日排除、起止自然日包含、窗口后一日排除；修复前周报错误计为 10 条，窗口内应为 8 条，修复后日报为 2 条、周报为 8 条、月报为 10 条。
- `docs/Creator-Official-Export-Data-Contract-v3.0.0.md`：明确发布作品数量与日报昨天、周报近 7 天、月报近 30 天官方日指标采用相同的北京时间闭区间。
- 相关测试（通过）：`npm run test:creator-unified-reports`、`npm run test:creator-dashboard-freshness`、`npm run test:official-export-v2`、目标 ESLint。
- 全量门禁（通过）：`npm run check -- --pretty false`；`npm run lint`（0 错误/292 警告）；`npm run build`（保留既有 >500 kB 分包提示，最大 843.50 kB）；`version:check`、`test:version-governance`、`test:changelog-governance`（392 个版本唯一）、`test:entrypoints`（234 个文件）、`test:studio-token-usage`（38 类）、`test:android-runtime`、`git diff --check`。
- 无数据库结构变化、无真实账号或业务数据读写。Android 仅同步元数据至 90248，未构建 APK。本地修改，不提交、推送或部署。
- 下一步继续改造清单 B4/B5 全站覆盖、B8 其他读写闭环和 G 中仍未完成的首页/指标规则；Android 原生专项按用户要求延期。

## v9.2.47 清单 B4/B5：选题移动/桌面对比度与表单识别

- `src/pages/mobile/MobileTopics.tsx`、`MobileTopicDetail.tsx`、`src/components/topics/TopicAssetDimensionsPanel.tsx`：列表负责人/截止日期及加载/空结果态，详情状态、创建人、更新时间、负责人、截止日期、关联资料及主题维度说明/空状态、协作动态备注统一使用 Studio 次级文字。标题、说明输入框增加稳定 `id/name`，维持原交互和保存行为。
- `tests/browser/mobile-work-center-responsive.spec.ts`：覆盖 320/390px 明暗主题下列表及详情元信息、空结果对比度、无横向溢出和表单字段标识；`tests/browser/topics-list-responsive.spec.ts` 增加详情页只读 API 夹具支持。
- `src/pages/Topics.tsx`、`src/components/Pagination.tsx`：桌面指标标签、视图提示、表格表头、行内元信息和分页文字改用 Studio 次级文字；新增明暗主题对比度回归。Chrome DevTools MCP 在 1440×900 暗色实测 7.52–8.29:1（修复前 3.83–4.22:1），1366×768 亮色实测 6.74–7.58:1；操作入口可见、无横向溢出。桌面控制台无错误，仅有 reduced-motion 模拟器与 React Bits 安全 fallback 提示。
- `src/components/topics/TopicsBoardView.tsx`：修复暗色看板总量、列计数、负责人/截止日期与空列提示低对比；Chrome DevTools MCP 修复前暗色实测为 3.83–4.22:1，现用 Studio 次级文字并同步更新加载提示。修复后 390×844px 移动明/暗主题均实测无横向溢出；次级文字最低对比度分别为 6.74:1（亮）和 7.52:1（暗），没有低于 4.5:1 的看板普通文案。`tests/browser/topics-list-responsive.spec.ts` 新增桌面亮/暗及移动看板断言，但自动脚本仍因 Chromium 权限未进入测试体。
- Chrome DevTools MCP 隔离页面实测 320px 亮色列表/详情与 390px 暗色列表/详情；暗色列表文字 8.01:1（修复前 4.08:1），详情所有可见普通文字 8.01–8.89:1；亮色列表 7.58:1、详情 7.00–7.58:1。页面身份、列表→详情交互、关联资料/主题维度空状态、协作动态备注、输入控件、320/390px 无溢出通过，字段 `id/name` 齐全，移动端最终控制台错误/警告为 0。未保存或写入数据。
- `npm run check -- --pretty false`、`npm run test:mobile-layout`、全仓 `npm run lint`（0 错误/292 条既有警告）、`npm run build`、目标 ESLint 通过。生产构建保留既有最大 843.50 kB Silk 分包提示。
- 版本/文档治理通过：`version:check`、`test:version-governance`、更新说明唯一性（391 个版本）、测试入口（234 个文件）、Studio token（38 类）、Android runtime 合同和 `git diff --check`。
- `test:mobile-work-center-browser`、`test:topics-responsive-browser` 在测试体前因 macOS Chromium `bootstrap_check_in … Permission denied (1100)` 失败，不计浏览器自动化通过；MCP 手工复核作为单独证据记录。
- 无 API、权限、数据库或真实业务数据变化。Android 仅同步元数据至 90247，未构建 APK；本地修改，不提交、推送或部署。下一阶段继续 B4/B5 全站验收、B8 其余写入/读取闭环和 G 未完成项；Android 原生专项按用户要求延期。

## v9.2.46 清单 B8：资料删除状态核实与回收只读保护

- `src/pages/ResourceDetail.tsx`：删除请求未获响应确认时立即只读读取当前资料状态。若状态已为“已移入回收站”，按服务端状态反馈并返回所属资料库；若仍有效，提示已核实且可安全重新确认；若读取失败，锁定编辑/删除，仅提供只读重试。不会对未知结果自动重发 DELETE。
- `src/pages/ResourceLibrary.tsx`、`src/components/resource-center/ResourceTable.tsx`：列表删除遇到未知响应时同样只读核实，核实期间暂停所有删除入口；软删除状态在列表清楚标出，隐藏编辑/删除操作。已回收详情页转为只读。
- `tests/browser/resource-category-management.spec.ts`：隔离夹具覆盖列表 DELETE 失败且未提交、首次只读 GET 失败后核实仍有效，以及详情 DELETE 已提交但响应 503、首次只读 GET 失败后核实已回收；检查没有在恢复时再次 DELETE。
- 质量门禁（通过）：类型检查、目标 ESLint、`test:resource-center-mutations`、`test:resource-categories`、全仓 lint（0 错误/292 条警告）、生产构建、版本检查/治理、更新说明唯一性（390 个版本）、测试入口（234 个文件）、Studio token（38 类）、Android runtime 和 `git diff --check`。构建保留既有最大 843.50 kB Silk 分包提示。
- 日期口径复核：用户确认统一按北京时间；“昨天”为前一自然日，近 7/30 天包含当天。`test:official-export-v2`、`test:creator-unified-reports`、`test:creator-dashboard-freshness` 均通过，现有导入与趋势规则和该口径一致，无需变更代码。
- 仓库浏览器脚本因 macOS Chromium `bootstrap_check_in ... Permission denied (1100)` 在测试体前失败，不计自动化通过。Chrome DevTools MCP 隔离页面实测通过：列表失败后只读核实并恢复安全重试；详情服务端删除后响应 503、首次状态读取 503，随后只读重试确认“已移入回收站”，返回列表显示回收状态且无编辑/删除入口，详情同样只读。320×800 窄屏下视口、文档和正文宽度均为 320px。
- 无 API、权限、数据库或真实资料变化。Android 仅同步版本元数据至 90246，未构建 APK；本地修改，不提交、推送或部署。
- 下一阶段：继续 B4/B5 全站主题/响应式审查、B8 其他写入/读取路径及 G 责任/可信来源范围；日期统一按北京时间，昨天为前一自然日、近 7/30 天包含当天；Android 原生专项继续后置。

## v9.2.45 清单 B8：运营报告写入结果核实与重复操作保护

- `src/pages/creator-center/CreatorReports.tsx`：生成或删除请求未收到成功响应时先只读重读报告列表；列表读取也失败则锁定全部报告写入并只显示一个可操作提示。待核实标记按运营账号保存在本机，页面刷新后仍保持锁定，兼容此前尚未核实的生成标记。生成读回后不擅自将新报告归因于本次请求；删除读回后展示目标报告当前是否仍在列表。两者均需用户核对并明确解除保护。写入已确认但列表刷新失败时也按账号持久化等待读回状态，跨页面刷新保持锁定，直至只读重读成功后自动解除。
- `tests/browser/creator-reports-auth-readiness.spec.ts`：隔离夹具新增生成/删除后响应丢失、首次列表核实失败、后续只读恢复、已确认写入读回失败后的重载锁定/自动恢复，以及待核实状态重载持久化与用户确认清除断言；添加 `--mcp-fixture` 启动模式供已连接浏览器复核。覆盖恢复流程不重复写入及 320px 无横向溢出。
- 类型检查（通过）：`npm run check -- --pretty false`；生产构建（通过）：`npm run build`。构建保留既有 >500 kB 分包提示，最大 Silk 背景分包 843.50 kB。目标 ESLint 通过；全仓 lint 0 错误、292 条既有警告。
- 版本与治理（均通过）：`npm run version:check`（9.2.45 一致）、`npm run test:version-governance`、`npm run test:changelog-governance`（389 个版本唯一）、`npm run test:entrypoints`（234 个文件）、`npm run test:studio-token-usage`（38 类）、`npm run test:android-runtime`、`npm run test:creator-unified-reports`、`git diff --check`。
- `npm run test:creator-reports-browser` 因 macOS Chromium `bootstrap_check_in ... Permission denied (1100)` 在测试体前失败，不计自动化通过。Playwright MCP 曾验证生成响应丢失、首次只读核实失败、恢复与确认路径；随后 Chrome DevTools MCP 对最终生成未知、删除未知及已确认生成等待读回三条路径手测。320px 视口/文档宽度均为 320px：未知结果在响应 503、首次列表读取 503 后仅一条提示并锁定全部写入；只读恢复显示当前服务器列表，页面刷新后锁与状态保留；用户核对后解除。已确认写入场景在首次读回 503、页面重载再遇 503 后仍只有一条操作提示并保持锁定；只读重读成功后显示最新列表、自动解除并清除标记。各恢复/确认动作均未额外生成或删除；前两条路径的隔离计数仍为生成 1/删除 0/列表读取 4，以及生成 0/删除 1/列表读取 5。
- 所有手测仅在内存模拟 API 中进行；未连接真实账号、未写入真实报告；无 API、权限或数据库变化。Android 仅同步元数据至 90245，未构建 APK。本地修改，不提交、推送或部署。
- 下一阶段：继续 B4/B5 其他页面与 B8 其他写入闭环；G 的阈值、团队总览及其他可信数据源规则仍开放（日期窗口已确认为北京时间自然日且包含当天）；Android 原生专项继续按用户要求延期。

## v9.2.44 清单 B4/B5/B8：备份页 Studio 统一与读回保护

- `BackupPage.tsx`：使用共享 PageShell/PageHeader、MetricCard、GlassPanel、ActionButton、StatusPill、Loading/Empty/Error 状态及 Studio 文字令牌；继续只显示来源、文件名、大小和北京时间，不呈现数据库引擎或目录绝对路径。
- 备份创建获服务端确认但随后清单读取失败时，显示一条恢复提示并锁定再次创建；清单成功重新读取后清除提示、恢复操作。清单错误状态不再与恢复提示重复发出两个 alert，空状态入口名称也与顶部主操作区分。
- `backup-inventory-request-race.spec.ts`：覆盖创建/刷新迟到结果、一次性创建、确认写入后的禁用与恢复、单一可操作提示、320/390/768/1440px 双主题及内部路径隐私。类型检查、目标 ESLint、全仓 lint（0 错误/292 警告）、生产构建、版本检查/治理、更新说明唯一性（388 个版本）、测试入口（234 个文件）、Studio token（38 类）、`npm run test:backup-inventory` 和 `git diff --check` 均通过。构建保留既有最大 843.50 kB Silk 分包提示。
- Chrome DevTools MCP 隔离夹具复核 Studio 页面；Playwright MCP 实测 320/390/768/1440px 明暗主题均无横向溢出，仿真创建成功/读回 503 后按钮禁用、单提示，重新读取后记录出现并恢复按钮。390px Lighthouse Accessibility / Best Practices / SEO 均为 100；Agentic Browsing 50 的唯一失败为全站 `llms.txt` 缺 H1。仓库自动浏览器测试因 macOS Chromium `bootstrap_check_in ... Permission denied (1100)` 在测试体前失败，不计自动化通过；模拟的 503 是预期注入错误，不代表页面异常。
- 仅内存虚构夹具发生一次模拟创建，无真实备份读写；无 API、权限、数据库变化。Android 仅同步元数据至 90244，未构建 APK；本地修改，不提交、推送或部署。

## v9.2.43 清单 B4/B5：设置中心正文对比度与颜色回归

- `NotificationSettings.tsx`：“关于系统”的品牌说明是普通正文，改用 Studio 次级文字令牌；隔离页面实测暗色对比度 4.53:1→8.89:1、亮色为 7.00:1。
- `system-settings-default-theme.spec.ts`：颜色解析器兼容 Chromium 返回的 CSS Color 4 `color(srgb …)`；增加品牌说明明暗主题与 320/390px 无横向溢出回归。Chrome DevTools MCP 隔离页复核 1440px 明暗主题、390px 明暗主题、320px 暗色主题；均无横向溢出，页面身份、版本 v9.2.43、设置分类和 About 正文正常，控制台错误/警告为 0。品牌说明实测暗色 8.89:1、亮色 7.00:1；390px 亮色 Lighthouse Accessibility / Best Practices / SEO 均 100，Agentic Browsing 50 是全站 `llms.txt` 缺 H1 的既有建议，与本页无关。Playwright MCP 另实测从设置分类进入 About，标题、版本和说明均正确。
- `npm run check -- --pretty false`、`npm run build`、全量 `npm run lint`（0 错误、292 警告）、目标 ESLint（0 错误，2 条既有 Hook 依赖警告）、版本检查/治理、更新说明唯一性（387 个版本）、测试入口（234 个文件）、Studio token（38 类）、Android runtime 合同、官方导出周期与首页新鲜度、`git diff --check` 均通过。生产构建保留既有最大 843.50 kB 分包提示。仓库 `test:system-settings-browser` 因 macOS Chromium `bootstrap_check_in ... Permission denied (1100)` 在测试体前失败，不计自动化通过。
- 本地后端/真实系统设置均未触碰。北京时间日期规则已与现有官方导入合约复核一致：昨天为前一自然日，近 7/30 天含当天，不需重复改动。Android 仅同步元数据至 90243，未构建 APK；无 API、权限、数据库或真实业务数据变化。本地修改，不提交、推送或部署。
- Android 仅同步元数据至 90243，未构建 APK；无 API、权限、数据库或真实业务数据变化。本地修改，不提交、推送或部署。

## v9.2.42 清单 B8：日报提交异常后的状态恢复

- `DailyReportPage.tsx`：提交请求返回异常后，以只读接口核实服务端终态。若服务端已提交则提示成功；仍为草稿/退回时保留已保存内容并允许检查后重试；状态读取失败或缺失时锁定正文和再次提交，显示中性“状态待确认”，提供只读核实入口，避免重复写入。
- `DailyReportComposer.tsx` 与 `MobileDaily.tsx`：桌面和移动网页仅草稿/退回可编辑，已提交、已审核、已归档等状态保持只读；移动网页提交失败后也会只读核实，结果不明时显示中性待确认状态、锁定输入和再次提交并提供恢复入口。未来未知状态同样只读。个人日报读取及提交后回读绑定账号身份，切换账号后旧回包不可污染新页面。
- `tests/browser/daily-report-submit-recovery.spec.ts` 覆盖账号切换迟到读取、提交已在服务端完成但响应异常、首次核实读取失败后只读恢复、移动网页恢复，以及日报写入仅一次。Playwright MCP 隔离页实测桌面和移动网页均进入待核实锁定态并通过只读恢复；移动视口 390/320px 均无横向溢出，夹具最终状态为草稿写入 1 次、提交 1 次、日报状态读取 3 次。浏览器回归自动入口因 macOS Chromium `bootstrap_check_in ... Permission denied (1100)` 在测试体前失败，不计自动化通过；其余质量门禁以本节终验结果为准。
- 终验：`npm run check -- --pretty false`、`npm run build`、全量 `npm run lint`（0 错误、292 警告）、目标 ESLint、版本一致性/治理、更新说明唯一性（386 个版本）、测试入口（234 个文件）、Studio token（38 类）、Android runtime 合同、日报权限/审计事务、官方导入周期与首页新鲜度、移动日报状态、`git diff --check` 均通过。生产构建保留既有最大 843.50 kB 分包警告。
- 无 API、权限、数据库或真实业务数据变化。Android 仅同步元数据至 90242，未构建 APK。本地修改，不提交、推送或部署。B4/B5 其他页面、B8 其余读写路径、G 未确认的业务规则及 Android 原生专项仍开放。

## v9.2.41 清单 B4：登录页触控与主内容无障碍

- `src/pages/Login.tsx`：两种登录布局的密码显隐按钮由 16×16px 增至 40×40px，保留 16px 图标；同步输入留白并补 Studio 语义焦点环；统一添加唯一 `<main>` 主内容地标，不影响强制改密弹窗焦点逻辑。
- `tests/browser/login-theme-contrast.spec.ts`：新增唯一主内容地标、320/390px 下按钮最小触控区及密码字段 `password → text → password` 交互断言，覆盖两种含显隐按钮的布局及主题组合。
- Playwright MCP 隔离本地页面 `/login` 实测：320×740 下按钮 40×40、显隐生效且无横向溢出；390×844 下按钮 40×40、未覆盖密码标签且无溢出。Chrome DevTools MCP 移动 Lighthouse Accessibility 98→100；Best Practices 96 是本地后端未启动导致公开设置 API 500，SEO 63 是登录页禁止索引，Agentic Browsing 67 的全站 `llms.txt` H1 建议为独立文档项。页面身份与主要控件正常，登录提交未测。仓库浏览器自动化与其他质量门禁以本节终验更新为准。
- Android 仅同步版本元数据至 90241，未构建 APK；无 API、权限、数据库或真实业务数据变化。本地修改，不提交、推送或部署。继续开放 B4/B5 其他页面、B8 其余读写路径、G 规则与 Android 原生专项。

## v9.2.40 清单 B4/B5：移动工作中心说明对比度

- Chrome Lighthouse 在 390px 暗色移动工作中心发现四处 muted 普通文案（工作中心说明与日历、看板、灵感入口副标题）仅 4.07:1；`src/pages/mobile/MobileWorkHub.tsx` 改用 `text-studio-text-secondary`。
- `tests/browser/mobile-work-center-responsive.spec.ts` 增加 390px 明暗主题上述四项文字对比度与横向溢出断言。
- 修复后 Chrome DevTools MCP 隔离页复测 390px 明/暗主题 Lighthouse Accessibility、Best Practices、SEO 均 100，窄屏无横向溢出；320px 两主题下 document/body/main 均为 320px。仓库 `npm run test:mobile-work-center-browser` 在 Chromium 启动时因 macOS `bootstrap_check_in ... Permission denied (1100)` 退出，未进入测试体，不计通过；MCP 隔离验收不替代自动化。本项为移动网页，不涉及 Android 原生专项。
- 最终门禁：`npm run check -- --pretty false`、目标 ESLint、`npm run build`、版本一致性/治理、更新说明唯一性（384 个版本）、Studio token（38 类）、测试入口（234 个文件）、Android runtime 合同、`npm run test:production-review` 和 `git diff --check` 均通过。构建保留既有 843.50 kB Silk 背景分包提示。
- 无 API、权限、数据库或业务数据变化。Android 仅同步元数据至 90240，未构建 APK；本地修改，不提交、推送或部署。继续开放 B4/B5 其他页面、B8 其余读写路径、G 规则与 Android 原生专项。

## v9.2.39 清单 B4/B5：协作编辑器同步状态对比度

- Chrome Lighthouse 在 390px 暗色创作详情发现共用编辑器的“系统正在同步文档状态”仅 4.07:1；`src/components/ContentEditor.tsx` 将普通同步提示和协作者编辑提示由 muted 改为 `text-studio-text-secondary`，同步错误和实时连接状态的语义令牌保持原样。
- `tests/browser/production-review.spec.ts` 增加共享编辑器同步状态在亮暗主题下均至少 4.5:1 的回归断言。
- Chrome DevTools MCP 隔离页复测：创作、拍摄、发布详情 390px 明暗主题 Lighthouse Accessibility、Best Practices、SEO 均为 100；页面无横向溢出。同步提示暗色对比度由 4.07:1 提升到 8.89:1。仓库 `npm run test:production-review-browser` 尝试启动时因 macOS Chromium `bootstrap_check_in ... Permission denied (1100)` 退出，未进入测试体，不计通过；MCP 隔离验收不替代自动化。
- 最终门禁：`npm run check -- --pretty false`、目标 ESLint、`npm run build`、版本一致性/治理、更新说明唯一性（383 个版本）、Studio token（38 类）、测试入口（234 个文件）、Android runtime 合同、`npm run test:production-review` 和 `git diff --check` 均通过。构建保留既有 843.50 kB Silk 背景分包提示。
- 无 API、权限、数据库或业务数据变化。Android 仅同步元数据至 90239，未构建 APK；本地修改，不提交、推送或部署。继续开放 B4/B5 其他页面、B8 其余读写路径、G 规则与 Android 原生专项。
- 额外只读交叉验收发布管理列表：390px 明暗主题 Lighthouse Accessibility、Best Practices、SEO 均为 100；320px 文档宽度为 320px，宽表由内层滚动承载。滚至最右后抖音关联、编辑、删除三个操作在屏幕内且指针命中正确；无横向页面溢出或业务写入。该 MCP 人工验收不计仓库自动化通过。

## v9.2.38 清单 B4/B5：成片与发布详情文字对比度

- Chrome Lighthouse 在 390px 暗色成片详情中发现 `WritingMetrics` 三处普通辅助文字（当前字数、目标、预计阅读时间）均为 4.26:1，未达到 4.5:1。共享统计行改用 `text-studio-text-secondary`，暗色提升至 8.38:1、亮色为 7.58:1。
- 扩查发布详情后，普通字段/元信息另有 19 处 muted 文字未达对比度要求；同时发现浅色当前工作流步骤标签不足。`src/pages/PublishingDetail.tsx` 将可读文案统一改用 Studio 次级/高对比语义令牌，保留 muted 令牌仅用于装饰图标/连接线。
- `tests/browser/workflow-details-responsive.spec.ts` 增加 390px 明暗主题统计项、发布字段与当前步骤对比度和页面横向溢出断言。
- Chrome DevTools MCP 隔离页面复核：成片与发布详情 390px 明暗主题的 Lighthouse Accessibility、Best Practices、SEO 均为 100，页面无横向溢出。成片/拍摄主要操作另在 320px、390px 和 1024×600/125% 下可见且真实命中。仓库浏览器自动化本轮未运行，不计通过。
- 验证：本轮最终状态下的完整类型检查、目标 ESLint、生产构建、版本/更新说明治理、Studio token、测试入口、Android runtime 合同和差异检查结果见本节终验更新；构建保留既有 843.50 kB Silk 背景分包提示。
- 选题表格独立人工交叉验收见 v9.2.37 的清单/阶段记录。Android 仅同步版本元数据至 90238，未构建 APK；无 API、权限、数据库或真实业务数据变化。本地修改，不提交、推送或部署。B4/B5 其余页面、B8 其余读写路径、G 规则与 Android 原生专项继续开放。
- Chrome DevTools MCP 隔离拍摄详情只读复核：320px/390px 明暗主题 Lighthouse Accessibility、Best Practices、SEO 均为 100；320px 无横向溢出，滚至底部时写作统计位于固定导航上方。1024×600 下小版本保存、大版本保存、完成制作均在视口内且指针命中正确，控制台错误为 0。未触发状态、保存或版本写入；该项是 MCP 人工验收，不记为仓库自动化通过。

## v9.2.37 清单 B4/B5：编辑器工具栏避让应用顶栏

- `src/lib/app-header-offset.ts`：增加顶栏高度观察器，按实际渲染高度同步 `--xmt-app-topbar-height`，并兼容浏览器缩放和无 `ResizeObserver` 环境。
- `src/components/Layout.tsx`、`src/components/mobile/MobileShell.tsx`：桌面及移动壳层分别观察其顶栏尺寸；`src/components/editor/Editor.tsx` 令正文工具栏贴合测得的顶栏下缘，全屏编辑保持 `top: 0`。
- `tests/browser/production-review.spec.ts`：添加桌面 125% 缩放与 320px 移动端的顶栏遮挡/真实指针命中断言；原有移动操作区和横向溢出检查保留。
- Chrome DevTools MCP 隔离页面实测：创作详情 `/production/content/77`；1024×600、125% 桌面下顶栏底边 93px，工具栏起点 94.25px，更多操作按钮命中自身；320×740/390×844 移动下顶栏 56px，工具栏起点 57px，撤销按钮命中自身。320/390 宽度无横向溢出，控制台错误为 0，模拟 API 写入计数为 0。只打开/关闭工具菜单，无保存、审核或版本写入。
- 终验：`npm run check -- --pretty false`、目标 ESLint、`npm run build`、`npm run version:check`、`test:version-governance`、`test:changelog-governance`（381 个版本）、`test:studio-token-usage`（38 类）、`test:entrypoints`（234 个文件）、`test:android-runtime` 和 `git diff --check` 均通过；构建保留既有 843.50 kB Silk 背景分包提示。`npm run test:production-review-webkit-browser` 在 macOS 启动 WebKit 子进程时 `Abort trap: 6`，未进入测试体，不计通过。
- 无 API、权限、数据库或业务数据变化。Android 仅同步元数据至 90237，未构建 APK；本地修改，不提交、推送或部署。继续开放 B4/B5 其他主题与页面、B8 其他读写路径、G 需产品确认事项及 Android 原生专项。
- Chrome DevTools MCP 对清单优先页面 Topics 做独立只读交叉验收：320px 移动卡片无页面横向溢出；768px 桌面内容区的宽表可内层滚动，滚至最右后固定操作列仍可见、查看按钮真实命中；1366/1440/1920px 桌面各 80%–125% 共 15 组视口/缩放中查看、删除、进入创作按钮均在视口内且可命中，下一步不与固定操作列重叠。控制台错误为 0，未点击删除/阶段操作或发起业务写入。此为 MCP 人工验收，不替代仓库自动化；未发现需修复的布局缺陷，故不改代码、不升版本。

## v9.2.36 清单 B4/B5/B8：资料搜索重复提交与导航状态

- `src/pages/ResourceSearch.tsx`：搜索入口增加同步互斥，React 忙碌态尚未刷新时的同周期重复提交也只发送一个 GET。关键词/筛选变化会使旧请求失效、立即允许新搜索；迟到旧结果不覆盖新查询。搜索中禁用提交并标注 `aria-busy`，关键词仍可编辑。
- `src/config/navigation.ts`、`src/components/Sidebar.tsx`、`src/components/Layout.tsx`：为 `/asset-center/search` 增加独立“资料搜索”侧栏项，并让路由解析出的选中态和面包屑显示正确页面，不再继承资料中心概览及“详情”。新增导航路由合同回归。
- `tests/browser/resource-search-submit-lock.spec.ts`：加入纯本地 HTTP/Vite 隔离夹具，覆盖同周期双提交只发一个 GET、修改关键词后新请求可开始、旧新响应逆序完成后仅展示最新结果及 320px 无横溢；夹具只返回模拟数据。Playwright MCP 实测通过：在途时按钮禁用、表单忙碌、关键词可编辑；请求数为 1→2；先完成新请求再完成旧请求，页面仍只显示新结果；320px 下 `scrollWidth` 与 `clientWidth` 均为 312，无控制台错误。
- 验证：导航路由合同、资料搜索片段（2/2）、官方导出日期/窗口合同、目标 ESLint、Studio token、版本/更新说明治理、`npm run check -- --pretty false` 与 `npm run build` 通过。仓库 Playwright 自动化因 macOS Chromium `bootstrap_check_in ... Permission denied (1100)` 在启动时失败，未进入测试体；不计自动化通过。生产构建保留既有 843.50 kB 背景分包警告。
- 无 API、权限、数据库或真实业务数据变化。Android 仅同步版本元数据至 90236，未构建 APK；本地修改，不提交、推送或部署。继续开放 B4/B5 其他页面验收、B8 其他读写闭环、G 需产品确认的指标口径及 Android 原生专项。

## v9.2.35 清单 B2/B4/B5/B8/G：归档安全、键盘操作与指标来源

- 后续核验补齐 7/30 天核心指标闭环：每个日期均须具备有效投稿、播放、点赞、评论、分享数值；导入端在事务前拒绝缺项、NULL、空白、布尔/数组/对象等畸形值，旧历史读端不把缺项补零，dashboard、trend、周/月报告均关闭不完整汇总。比例/时长可选 NULL 保持缺失，负评论修正保留。
- `src/pages/BackupPage.tsx` 与 `src/pages/AnonymousFeedback.tsx`：读取请求增加代次隔离，旧备份清单不能覆盖创建确认后的读回/提示/加载态，匿名意见首屏旧快照不能隐藏已确认提交。两个独立浏览器夹具覆盖迟到响应，写入仅发生在本地 mock。
- `src/pages/PomodoroPage.tsx`：排行榜奖杯前景改用 Studio 彩色底前景令牌；计算对比度由暗色 1.57:1 改善为 11.35:1，亮色 3.56:1。新增亮/暗与 320/390/1440 视口断言。
- `src/pages/AssetCenter.tsx`：资料库计数独立收集结果，某库读取失败时保留其他成功计数、明确标记失败项并提供只读重试；请求代次避免旧结果覆盖新状态。
- `src/pages/AuthRolloutStatus.tsx`：状态页次要文字和管理员明细改用 Studio 次级文字令牌；静态计算超过 4.5:1 的正文对比要求，并新增明暗主题与 320/390/1440 视口断言。
- `src/components/topic/TopicResourcesPanel.tsx`：选题详情的“关联资料”和“搜索”按钮统一使用 Studio 主按钮；搜索请求期间显示“搜索中…”并锁定输入与提交，同步互斥阻止重复 GET，避免关键词与迟到结果错配。扩展隔离浏览器回归覆盖同一待处理搜索重复提交只发一次请求、输入请求中锁定且完成后恢复；仓库 Chromium 测试未进入测试体，Playwright/Chrome DevTools MCP 隔离夹具已人工复核按钮状态、查询恢复、关联成功及 320px 移动详情无横向溢出。
- 后续验证通过：`test:creator-dashboard-freshness`、`test:creator-unified-reports`、`test:official-export-v2`（含坏值在任何批次写入前拒绝、可选 NULL 保留，以及旧批次重放不覆盖重叠日期的较新值/采集时间/来源文件）、`test:creator-sync-v2102`、`test:activity-log`、版本/更新说明治理、Android runtime、Studio token（38 类）、测试入口（含新增隔离脚本）及 `git diff --check`；最终类型检查、目标 ESLint 和生产构建见本节终验结果。
- 新增的资料中心、登录状态页、备份、匿名意见、番茄钟、选题详情资料搜索及先前列表/趋势浏览器用例均未进入仓库 Chromium 测试体：macOS MachPort 权限拒绝。Playwright/Chrome DevTools MCP 新建隔离本地页完成人工复核；不得记为仓库浏览器自动化通过。
- 本轮最终总门禁：`npm run check -- --pretty false` 与 `npm run build` 通过；全量 `npm run lint` 0 错误、292 条警告（未在本轮扩大整改范围）；构建保留最大 843.50 kB Silk 背景分包警告。版本 v9.2.35 一致，版本/更新说明治理、测试入口 233 项、Studio token 38 类、Android runtime 和 `git diff --check` 均通过。

- `src/components/resource-center/parseLegacyPublishedArchive.ts`、`ArchiveSnapshotView.tsx`：旧版归档的 nullable 字段按缺失处理，非字符串畸形值 fail-closed，未知平台使用中性标签；发布异常改用珊瑚语义色。解析/视图测试覆盖多平台、旧单平台、null 字段、损坏 JSON、畸形结构和纯文本。
- `src/pages/Analytics.tsx`、`src/components/CollaborationHeatmap.tsx`：排名区和热力图补充可访问区域名称及键盘横向滚动路径，末尾内容可聚焦/可见。仓库 Playwright 测试受 Chromium 启动权限阻断；MCP 隔离页实测 320/390/1440 CSS 视口及键盘尾部可达，不将手工实测记作仓库自动化通过。
- `src/pages/DailyReportPage.tsx`：按账号身份隔离团队日报的 `/me` 读取；切换/卸载后，旧账号迟到成功或失败均不可覆盖新账号。后端本人范围与权限不变，浏览器回归已加入 A→B 两种迟到结果。
- `api/services/douyinDataCenter.ts`、`src/api/creatorCenter.ts`、`src/pages/Home.tsx`：首页指标携带自己的来源/观测日期；官方采集时间只使用该数据集 `collected_at`，快照仅显示可确认日期，粉丝数使用最近一次有观测值的日期；无可信精确时间时显示未知。独立隔离 SQLite 回归不连接真实数据库。
- `src/pages/ResourceSearch.tsx`：搜索提交按钮统一为共享 `ActionButton`，维持原查询/表单行为。MCP 隔离页检查亮暗主题、320/390/1440 视口、键盘焦点、40px 控件高度及实际 GET；此项属于规范一致性与回归补充，不代表本轮确认曾存在触控故障。
- `src/components/retrospectives/RetroActionTable.tsx`：新增行动项表单四个字段增加可见标签；行内状态/结果控件的可访问名称包含行动项标题。仓库浏览器回归受 Chromium 权限阻断；Playwright MCP 实测 320/390/1440px 页面宽度不溢出，标签显示且可点到对应输入聚焦，页面身份正确、无控制台错误/警告。
- `src/pages/Messages.tsx`：单条标记已读仅在原查询仍有效时使用本地更新；切换筛选/页码或已有新读取请求时，保持新查询有效并在确认写入后只读重载当前视图。浏览器回归覆盖筛选 GET 先于 PUT 与分页 GET 迟于 PUT 两种顺序，均核验结果归属正确且只有一次 PUT。
- `src/pages/Login.tsx`：首次强制改密时将焦点移入密码框，Tab/Shift+Tab 在对话框内循环，并通过 `inert`/`aria-hidden` 暂停背景；关闭或成功后恢复背景和触发焦点。浏览器回归已加入取消、校验失败、成功及焦点边界场景，但 Chromium 启动权限导致测试体未执行。
- `src/pages/mobile/MobileNotificationSettings.tsx`：用户在保存成功后再次改通知选项时清除过期成功提示；保留错误反馈与显式重试，编辑不触发 PUT。隔离回归已加，但本轮没有取得空闲的 Playwright/Chrome DevTools 浏览器配置，仓库 Chromium 测试也受 macOS 启动权限阻断。
- `src/pages/TemplateManagement.tsx`：初始模板 GET 未完成前锁定表单，`save()` 也拒绝加载期间提交；隔离测试挂起首次 GET，确认不发 POST，放行后仅创建一次且成功提示/模板行保留。仓库 Chromium 测试受 macOS 启动权限阻断，断言已加入但尚未执行。
- `src/pages/Users.tsx`：按标签、页码和搜索词为用户/日志读取建立查询身份与请求代次；切换查询、分页或标签后，迟到成功/失败/finally 均不得改写当前行、总数、错误和加载状态。服务端确认写入后的列表回读若属于旧查询，会在发请求前失效，不 bump 代次或取消新列表读取。隔离回归覆盖旧回读迟到及写入确认晚于新查询两种顺序，并检查列表 `aria-busy` 恢复。
- `src/pages/Achievements.tsx`：卡片、排行榜、动态三个视图按钮加入命名分组、稳定可访问名称与 `aria-pressed`，仅一个按钮选中并与当前内容对应；隔离断言覆盖鼠标与键盘切换。
- `src/pages/ActivityLog.tsx`：活动日志上一页/下一页按钮有明确名称，当前页码使用 `aria-current="page"`；隔离多页回归覆盖 Enter 键翻页、数字页直达、记录更新及只读行为。
- `api/services/douyinDataCenter.ts`、`src/pages/creator-center/CreatorTrends.tsx`：90 天官方趋势按截至北京时间当天的 90 个连续自然日校验日期及每天的投稿/播放/点赞/评论/分享指标。已有官方历史缺日、日期非法或缺指标时返回 `partial`，页面不展示趋势和周期合计、也不把缺失视作 0；没有官方 30 天历史时保留旧快照来源，并对 7/30/90 天快照统一使用含当天、排除未来日期的精确北京时间窗口。只校验当前物化序列，不声称能证明每个历史批次完整或还原已被 upsert 覆盖的版本；不设置最大离线年龄。
- `docs/Creator-Official-Export-Data-Contract-v3.0.0.md`：补记用户确认的日期窗口语义、90 天严格完整性/回退边界和当前历史模型限制。
- G 官方导出边界按用户确认统一为北京时间自然日：“昨天”为采集日前一日，7/30 天均包含采集当天；以签名采集时间而非服务器接收时间锚定，离线重放保留原采集时间，当前未设最大离线年龄。导入严格验证真实公历日期、连续天数和窗口，在批次数据表写入前拒绝缺日、重复、未来或窗口错配；仪表盘/报告/7、30 天趋势对无效历史 hash 不产出周期值。90 天趋势的多批次历史重建能力仍未覆盖，另列为独立数据模型问题。隔离回归 `test:official-export-v2`、`test:creator-dashboard-freshness`、`test:creator-unified-reports` 通过；没有访问或写入真实数据。
- 已通过：归档解析 10/10、创作者数据新鲜度（含 90 天连续/缺失指标/快照回退）、官方导出契约/日期窗口、创作者统一报告、首页摘要、日报权限、移动日报状态、消息分页 API、移动端已读契约、资料搜索命中片段 2/2、人员查询竞态隔离、版本一致性、版本治理、更新说明唯一性、测试入口、Android runtime、Studio token 和 `git diff --check`。类型检查、生产构建、最终治理数与目标 ESLint 在本轮最后复跑后记录；构建保留既有最大 843.50 kB 大分包提示。
- 浏览器边界：Playwright MCP 在本地隔离页完成人工验证：归档多形态、Analytics 键盘与视口、Resource Search 明暗/提交、首页官方采集时间、复盘行动项标签/可见性和控件焦点；仓库相关 Playwright Chromium 套件在 macOS `bootstrap_check_in ... Permission denied (1100)` 时于测试体启动前失败，不计浏览器自动化通过。消息筛选/分页竞态的断言已新增，但其仓库浏览器套件未能运行。所有模拟业务写入仅限隔离夹具；本轮无真实业务数据写入。
- 浏览器边界：本轮新增/扩展的用户列表竞态、成就视图、活动日志分页、90 天趋势、登录强制改密、移动通知偏好和模板初始加载仓库 Chromium 套件均因 macOS `bootstrap_check_in ... Permission denied (1100)` 未进入测试体，不计自动化通过；既有 Playwright MCP 隔离页人工验收单独标记，不替代仓库断言。
- Android 仅同步版本元数据至 90235，未构建 APK；未应用数据库迁移、未修改 API 权限范围；本地修改，不提交、推送或部署。仍开放：B4/B5 全站主题/响应式审查、B8 其他模块读写闭环、G 异常阈值/团队概览与需产品定义的指标口径，以及未来 Android 原生专项。90 天当前序列完整性已做检查，但历史批次级重建仍无法从现有 upsert 模型证明。

## v9.2.34 清单 B8/B4：读写一致性、空态恢复与视口覆盖

- `api/routes/achievements.ts`：预设成就的存在性检查及整组初始化纳入同一写事务；中间写入失败完整回滚，并发/重复初始化保持单组且可安全重试。新增 HTTP 回归覆盖权限拒绝、注入中段失败、回滚后重试、重复和并发调用。
- `api/routes/pomodoro.ts`、`api/database/migrations/032_pomodoro_cancellation_state.ts`：番茄钟开始、完成、取消增加用户范围内的事务/并发及幂等保护。迁移以 `(user_id, session_id)` 唯一键记录取消终态；取消后仍按旧版查询语义从 `pomodoro_sessions` 消失，旧版不会把取消算作活动或完成；回滚旧版后再次取消因无法读取新账本仍会按旧语义返回 404。032 标为 `SAFE_EXPAND`，本轮未应用任何真实数据库迁移。
- `src/hooks/useRealtimeSync.ts`、`src/pages/Production.tsx`：实时订阅回调读取最新处理器、重连幂等并按监听器清理；创作列表避免新增 socket 与 POST 回应交错时重复加总数，删除末页最后一条后校正到有效页。保留服务端确认后刷新失败的显式只读恢复。
- `src/pages/ContentTimelineView.tsx`：读取失败与成功空结果分开呈现，详情/历史请求有代次隔离；上次成功内容可标记为可能过期并重试 GET。只在持久更新时间/创建时间有效时构造保存事件，避免缺失时间被归一化成当前时间。`DailyReportTeamBoard.tsx` 日期控件补齐显式可访问名称。
- `tests/browser/analytics-read-recovery.spec.ts`：数据复盘增加 17 个 CSS 视口场景（320/390px；1366×768、1440×900、1920×1080 分别等效 80/90/100/110/125%），检查报告中心/发布入口、年/月/选题筛选的可见边界、中心遮挡、键盘焦点与页面横溢；团队日报日期筛选回归改为按可访问标签定位。没有浏览器实测证据前未改 Analytics 页面布局。
- 通过：`npm run check -- --pretty false`、`npm run build`、`npm run version:check`、`npm run test:version-governance`、`npm run test:changelog-governance`（378 个版本）、`npm run test:integrity:resources-pomodoro`、成就初始化 HTTP 回归、`npm run test:socket-realtime-sync`、`npm run test:production-list-update`、`npm run test:migration-readiness`、只读 `npm run migration:check`（`GO`, `readOnly: true`）、`npm run test:android-runtime`、`npm run test:studio-token-usage`（38 类）、`npm run test:entrypoints`（222 个文件）和 `git diff --check`。目标 ESLint 0 错误；成就路由有 20 条 `no-explicit-any` 警告，基线为 21 条。
- 构建通过，保留既有 >500 kB 分包提示，最大 chunk 843.50 kB。隔离 MCP 手工实测创作列表 POST/socket 交错不重复计数、末页删除后页码有效，以及内容动态失败提示/只读恢复、空时间轴和 A→B 迟到响应隔离；均未触及真实业务数据。内容动态验收只读（写入数为 0），创作列表创建/删除仅作用于隔离模拟 API。以上不计为仓库自动浏览器套件通过。
- 仓库 Chromium 测试在 macOS `bootstrap_check_in ... Permission denied (1100)` 时于测试体前失败；数据复盘 17 视口矩阵、团队日报标签浏览器断言及相关仓库套件尚未执行。Playwright/Chrome DevTools MCP 未能为 Analytics 取得可执行隔离页（连接报告 profile 占用；只读页面列表仅显示既有番茄钟隔离验收页），未关闭或抢占已有浏览器。没有观察到真实的 Analytics 布局故障，也不能宣称其已排除。
- Android 仅同步版本元数据至 90234，未构建 APK；本地修改，不提交、推送或部署。仍开放：B4/B5 全站主题/响应式审查、B8 其他模块读写闭环、G 可信规则及指标口径、后续专项 Android 原生验收。

## v9.2.33 清单 B8：创作版本保存确认与读取恢复

- `src/pages/ProductionDetail.tsx`：服务端确认小修/另开新版后，立即用响应版本号和已提交正文更新本地稿件、编辑器及协作文档；后续详情读取失败不回滚为旧版本，也不显示为写入失败。
- 详情或历史读取未完成时显示持久提示，明确保存已经确认，提供“只重试读取详情”，并提醒不要重复创建版本。重试复用现有 GET，不触发保存。
- `tests/browser/production-review.spec.ts`：隔离夹具可让版本 PUT 成功后下一次详情 GET 返回 503；新增断言验证版本只写入一次、页面立即保留新版本、显式恢复仅触发读取。
- API、权限、数据库和版本规则变化：无。Android 仅同步版本元数据至 90233，未构建 APK；本地修改，不提交、推送或部署。
- 验证：`npm run version:check`、`npm run test:changelog-governance`（377 个版本）、`npm run test:entrypoints`（219 个文件）、`npm run check -- --pretty false`、目标 ESLint、`npm run test:android-runtime`、`npm run test:production-review` 和 `npm run build` 均通过；生产构建仍有既有大分包提示，最大 chunk 为 843.50 kB；`git diff --check` 通过。
- 浏览器自动化边界：`npm run test:production-review-browser` 在 macOS Chromium `bootstrap_check_in org.chromium.Chromium.MachPortRendezvousServer: Permission denied (1100)` 时于测试体启动前失败，不计为自动化套件通过。
- Playwright MCP 隔离夹具人工实测：版本 PUT 返回成功并确认 v1.1 后注入详情 GET 503，页面仍显示 v1.1 和已提交正文，并出现持久提示及“只重试读取详情”；点击后详情 GET 增加一次，版本 PUT 与其他正文 PUT 计数均不增加，提示消失且正文保留。控制台唯一错误为夹具主动注入的 GET 503。
- 风险/下一步：本轮仅验证创作详情版本保存后的详情刷新恢复；B8 其他写入/读取路径、B4/B5 全站视口与主题审查、G 可信规则/指标口径和延期的 Android 原生专项仍未完成。无 API、权限或数据库变化；Android 仅同步版本元数据至 90233，未构建 APK。本地修改，不提交、推送或部署。

## v9.2.32 清单 B8/B4：发布候选请求隔离与业务表单可访问性

- `src/pages/Publishing.tsx`：抖音候选读取按请求序号、当前发布记录 ID 和搜索词校验；关闭、改词或切换记录会使旧请求失效，提交候选前再次确认它仍属于当前列表。响应中的发布记录 ID 不符时安全拒绝。本次不改关联 API、权限或人工确认规则。
- `src/pages/WorkflowDesigner.tsx`：为模板名称/描述、节点名称、审批类型、起止状态和审批人值关联显式标签；模板/节点图标操作增加目标名称，节点增删按钮明确为非提交按钮，静态分区标题使用标题语义。审批策略和保存流程不变。
- `src/pages/AnonymousFeedbackAdmin.tsx`：查看、处理中、完成、隐藏、回复和删除六项图标操作增加包含意见摘要的可访问名称。
- 回归文件：`tests/browser/publishing-hover-contrast.spec.ts`、`tests/browser/workflow-designer-language.spec.ts`、`tests/browser/anonymous-feedback-admin-responsive.spec.ts`。发布隔离夹具支持按目标挂起、逆序释放候选响应，并在 Chromium 启动失败时清理本地服务。
- 数据库、API 契约、权限、审批规则及真实业务数据变化：无。Android 仅同步版本元数据至 90232，未构建 APK；本地修改，不提交、推送或部署。
- 浏览器人工验收：Chrome DevTools MCP 使用本地隔离数据验证发布记录 A 的候选请求挂起后关闭并打开 B，先释放 B 再释放 A，界面仍只显示 B 的候选；提交实际只写入 `964 → 966`。同一记录关闭后重开，再逆序释放两次请求，旧响应不能覆盖新窗口；夹具挂起响应队列最终为空。追查原 9 条表单标签/自动填充 issue 后，为新增/编辑发布记录的选题、平台、链接、日期、状态和四项指标补齐 `id`/`name` 及显式标签关联；Chrome DevTools MCP 打开表单确认 9 项均可按标签定位，控制台不再报告表单标签/自动填充 issue。工作流编辑器快照确认 7 个字段、必审复选框、节点删除按钮名称和分区标题可访问。匿名意见管理在 320/390/1440px、明暗主题人工复核无横向溢出，Lighthouse Accessibility/Best Practices/SEO 均为 100（Agentic Browsing 50 为无关文档建议）。隔离页无应用运行时错误。
- 自动化与静态验证：`test:publishing-hover-contrast-browser`、`test:workflow-designer-language-browser`、`test:anonymous-feedback-admin-responsive-browser` 均在 Chromium `bootstrap_check_in ... Permission denied (1100)` 时启动失败，测试体没有运行，不计自动化通过。`npm run check`、`npm run build`、目标 ESLint、`npm run version:check`、`test:publishing-douyin-link`、`test:anonymous-feedback`、`test:workflow-ui-language` 和 `test:android-runtime` 通过；ESLint 0 错误、1 条 `WorkflowDesigner.tsx:90` 既有 Hook 依赖警告。版本治理、更新说明唯一性（376 个版本）、测试入口检查（219 个文件）、Studio 令牌（38 个颜色工具）和 `git diff --check` 均通过。生产构建保留既有大分包提示，最大 chunk 843.50 kB。
- 风险/下一步：B4/B5 全站视口与主题验收、B8 其余读写路径、G 中待产品确认的规则/可信指标来源和延期的 Android 原生专项仍未完成。

## v9.2.31 清单 B8：排期日历月份读取竞态隔离

- `src/pages/Calendar.tsx` 为月份/选题并行读取增加请求代次；仅最新请求可更新事件、截止选题、错误及加载状态。路由或月份变更后清理的旧请求失效，不会用迟到回包覆盖当前日历；创建事件表单四个字段补齐显式标签关联。
- 新增 `tests/browser/calendar-month-request-race.spec.ts`，挂起上月成功/失败响应，加载当前月后再释放旧响应，并覆盖当前月份数据/状态不变、创建表单标签和 1440px/390px 无横向溢出。
- Playwright MCP 本地隔离夹具实测通过：9月30日迟到事件未进入10月日历、旧月 503 不把当前日历切成错误态，10月事项仍在；390px 文档宽度 382px。控制台仅有主动注入的 503，无应用运行时错误。仓库 `test:calendar-month-race-browser` 因 macOS Chromium `bootstrap_check_in ... Permission denied (1100)` 在测试体前失败，不记为自动化套件通过。
- 类型检查、目标 ESLint、日历权限/API 回归、Studio 令牌、版本/更新说明治理、测试入口检查和生产构建通过。无 API、权限、数据库或真实业务数据变化；Android 仅同步元数据至 90231，未构建 APK。本地修改，不提交、推送或部署。B4/B5 全站审计、B8 其他写入/读取路径、G 可信业务规则/统计源和延期的 Android 原生专项仍开放。

## v9.2.30 清单 B8：成片列表确认操作同步锁

- `src/pages/Shooting.tsx`：完成/删除确认处理器增加同步锁；同一事件周期再次进入时直接返回，不提前清除第一次请求的处理中状态。底层创建/完成/删除写入仍共用原业务互斥锁。
- `tests/browser/workflow-details-responsive.spec.ts`：新增延迟完成状态更新期间同任务双触发断言，核对 PUT 仅一次、确认按钮持续禁用、服务端确认后关闭弹窗并显示已完成。
- Playwright MCP 本地隔离页人工实测通过：注入延迟后同任务双触发，夹具计数为 1，按钮保持禁用并显示处理中；释放响应后弹窗关闭且状态完成。仓库 `npm run test:workflow-details-responsive-browser` 因 macOS Chromium `bootstrap_check_in ... Permission denied (1100)` 在测试体前失败，回归断言未计为自动化通过。
- 类型检查、目标 ESLint、生产构建、版本/更新说明治理及 `git diff --check` 通过。无 API、权限、数据库或真实业务数据变化；Android 仅同步元数据至 90230，未构建 APK。本地修改，不提交、推送或部署。B4/B5 全站审计、B8 其他入口、G 可信规则/数据源及 Android 原生专项仍开放。

## v9.2.29 清单 B8：灵感池删除、评论与转选题写入闭环

- `src/pages/Inspirations.tsx`：删除、评论和转选题增加按灵感 ID 的同步互斥，React 禁用态更新前的重复触发会被拒绝；对应按钮/输入在途锁定。评论失败保留文本，删除失败保留记录，转选题失败保留原入口；确认成功后再清理输入、移除记录或跳转。评论成功增加“评论已发布”反馈；切换/关闭详情时不会让旧评论响应覆盖当前输入。
- `tests/browser/inspiration-theme-contrast.spec.ts`：加入评论、删除、转选题的隔离 API 失败→重试回归与快速重复触发断言；保留原创建、投票、亮暗主题和 320/390/1440px 布局检查。修复浏览器启动失败时 fixture Vite/HTTP/Socket.IO 未清理，确保 Playwright Chromium 启动受阻也能退出。
- Playwright MCP 本地隔离夹具人工实测：评论 503 后输入保留，双触发重试只产生一条 POST 并显示评论；删除 503 后行仍显示，重试 200 后移除；转选题 503 后原入口保留，双触发重试只发一条 POST 并导航到新选题。320px 实测 `scrollWidth 312 <= 320`，提交入口可见。所有流量只到本地模拟 API，不连接真实账号/业务数据。
- 仓库 `npm run test:inspiration-theme-contrast-browser` 因 macOS Chromium `bootstrap_check_in ... Permission denied (1100)` 在测试体前失败；这次确认脚本退出码为 1 且 fixture 会自行清理。故新回归断言尚未由仓库 Playwright 实际执行，不将其计为自动化通过。
- 类型检查、目标 ESLint、灵感 mutation 原子性/创建响应合同测试、版本治理、更新说明唯一性、测试入口检查、生产构建及 `git diff --check` 通过。无 API、权限、数据库或真实业务数据变化。Android 仅同步元数据至 90229，未构建 APK；本地修改，不提交、推送或部署。B4/B5 全站审计、B8 其他写入路径、G 产品规则/可信来源范围及延期的 Android 原生专项仍未完成。

## v9.2.28 清单 B4/B5：复盘模块暗色文字对比度修复

- 复盘中心列表、个人行动项卡片，以及详情页元数据、指标快照/结论/日报风险说明、行动项表头、发布归档说明与详情抽屉字段标签/历史信息统一改用 Studio 次级文字令牌；令牌源未改，装饰图标继续使用 muted。
- 浏览器回归覆盖暗色列表/详情可见 muted 文本、9 个列表表头、7 个详情表头、发布归档说明、列表与个人行动项空状态和详情抽屉；按 4.5:1 普通文字对比度阈值断言。
- Chrome DevTools MCP 重启后的本地隔离夹具实测：列表/详情暗色正文无可见 muted 文本；列表 9 个表头最低 7.52:1、详情 7 个表头最低 7.52:1、发布/归档说明 8.29:1、抽屉字段标签 8.01:1/信息区 7.52:1。列表与详情的 320/390/1440px 明暗主题均无溢出，320px 列表空状态和详情抽屉正常；控制台无应用错误，只有 reduced-motion 模拟器提示。先前旧缓存页面不计验收。
- 验证：类型检查、目标 ESLint、版本一致性/版本治理、更新说明唯一性（372 个版本）、测试入口检查（218 个）、生产构建及差异检查通过；生产构建保留既有大分包警告，最大 chunk 843.50 kB。仓库浏览器套件因 macOS Chromium 在 bootstrap_check_in 注册时 Permission denied (1100)，于测试体启动前失败，不计自动化通过。
- 无 API、权限、数据库或真实业务数据变化；Android 仅同步元数据至 90228，未构建 APK。本地修改，不提交、推送或部署。继续 B4/B5 其他页面审查、B8 其余写入路径与延期的 Android 原生专项。

## v9.2.27 清单 B8：成片状态写入保护与资源分类回归

- `src/pages/ShootingDetail.tsx`：状态更新加入同步互斥，状态按钮在途禁用并显示处理中；服务端确认后立即保留新状态，即使后续详情 GET 失败也不回滚已确认写入，并提示只读重载。`tests/browser/workflow-details-responsive.spec.ts` 增加延迟 PUT、同任务双触发、刷新失败和重载确认覆盖。
- Playwright MCP 隔离页实测成片状态同任务双触发仅一条 PUT，按钮在途禁用，注入 GET 503 后仍显示“已完成”，重新加载从服务端读回该状态。仓库 `test:workflow-details-responsive-browser` 因 macOS Chromium `bootstrap_check_in ... Permission denied (1100)` 在测试体前失败；不记自动化套件通过。
- 补充 Playwright MCP 隔离页人工复核：成片与发布“小版本保存”延迟期间同任务双触发，各仅产生一条脚本写入和一个版本记录；两页“重试同步归档”同任务双触发也各仅发起一次重试，在途按钮禁用。注入 503 后原提示与重试入口保留，显式重试 200 后提示消失；夹具计数确认归档重试未再次提交脚本。此为隔离夹具人工验收，不计作仓库 Playwright 套件通过；错误日志只有预期注入的归档 503。
- 代码边界：前端仅成片状态流程增加同步互斥与确认反馈；资源分类业务实现不变，仅新增回归。未改服务端 API、权限、数据库或真实业务数据。

- 现状复核：`ResourceCategoryManagementModal` 的新增、编辑、删除已在发请求前同步设置 `busyRef`；本次未改业务实现，只补齐此前缺少的分类新增、删除在途重复触发测试。
- `tests/browser/resource-category-management.spec.ts`：新增失败后同一 JS 任务双提交，仅允许一次重试；空分类删除确认同任务双触发，在延迟回包期间只允许一条 DELETE，成功回包后移除该行。夹具增加显式闸门、状态与释放入口，仅用于本地隔离验收。
- `npm run test:resource-categories`、`npm run test:resource-center-mutations`、`npm run check -- --pretty false`、目标 ESLint、`npm run version:check`、更新说明唯一性（371 个版本）、测试入口治理（218 个）及 `git diff --check` 通过；`npm run build` 成功，保留既有超过 500 kB 的分包提示。Playwright MCP 在 `http://127.0.0.1:59407/asset-center/knowledge`、1440×900 隔离页实测：新增计数为 2（首次预置失败 + 一次重试），删除计数为 2（受资料保护的拒绝 + 空分类一次成功）；按钮等待期间禁用，服务端确认后分类行移除。控制台错误仅为夹具预置 503/409。仓库 Playwright Chromium 因 macOS `bootstrap_check_in ... Permission denied (1100)` 启动失败，测试体未运行。
- 无生产业务代码、API、权限、数据库或真实业务数据变化；Android 仅同步版本元数据至 90227，未构建 APK。本地修改，不提交、推送或部署。下一步继续 B8 其他真实写入入口及 B4/B5 全站审查。

## v9.2.26 清单 B8：选题单条删除同步互斥

- `src/pages/Topics.tsx`：单条删除确认在设置 React 忙碌态前同步上锁；请求失败仍保留原确认窗口，成功后才关闭确认并从列表移除。未调整删除 API、服务端权限或批量删除路径。
- `tests/browser/topics-list-responsive.spec.ts`：加入延迟 DELETE 夹具；覆盖首次失败保留确认、重试期间同任务双触发仅一个 DELETE，以及服务端确认后移除选题。
- `npm run test:topics`、`npm run test:topics-list-notify`、`npm run test:batch-action-feedback`、`npm run test:batch-mutation-feedback`、类型检查与定向 ESLint 通过。Chrome DevTools MCP 1440×900 隔离页面同任务双触发仅发一条 DELETE，确认后成功提示出现且列表为空。仓库 Playwright 自动化体受 macOS Chromium `bootstrap_check_in ... Permission denied (1100)` 阻断，未执行测试体。
- 无 API、权限或数据库变化；Android 仅同步元数据至 90226，未构建 APK。本地修改，不提交、推送或部署。下一步继续 B8 其他写入入口盘点及 B4/B5 全站审查。

## v9.2.25 清单 B8：成片/发布写入同步互斥

- `src/pages/PublishingDetail.tsx`：普通保存、小版本、大版本和发布归档重试使用同步互斥锁；`src/pages/ShootingDetail.tsx`：小版本、大版本及归档重试在等待协作编辑器或 React 状态刷新前加锁，避免重复写入/建版/重试。
- `tests/browser/workflow-details-responsive.spec.ts`：隔离夹具为成片/发布的小版本保存及两处归档重试提供延迟回包，并测试同一 JavaScript 任务双触发只产生一个在途请求；浏览器测试体尚未执行，不能将这些断言记为已通过。
- 仓库 Playwright Chromium 受 macOS `bootstrap_check_in ... Permission denied (1100)` 阻断，测试体未运行。隔离 Chrome DevTools 手动验证仅确认发布详情小版本重复保存只发送一次请求，成片保存和归档重试尚未实测；其余类型、目标 lint、版本治理和构建结果以本轮命令为准。
- 无 API、权限或数据库变化；Android 仅同步版本元数据至 90225，未构建 APK。本地修改，不提交、推送或部署。B8 其他写入路径、B4/B5 全站审查及 Android 原生专项仍开放。

## v9.2.24 清单 B8：内容维度快速重复提交保护

- `src/components/topics/TopicAssetDimensionsPanel.tsx` 与 `src/pages/ContentTopicAssets.tsx`：选题详情和主题内容资产页的城市、人物、项目维度登记/移除改用 `useRef` 同步互斥，在 React 状态刷新前即可拦截同一事件周期的重复写入；原失败反馈、输入保留、成功回显及 Studio 样式不变。
- `tests/browser/topic-mutation-feedback.spec.ts`：加入两个入口在同一 JS 任务触发两次表单提交、服务端延迟回包的回归，断言每个入口只产生一次写入并显示成功状态。
- Chrome DevTools MCP 隔离页面逐一验证：选题详情“城市·杭州”和主题内容资产“人物·李明”在服务端确认后正确回显；两处同任务双提交各仅发一条写入。自动 Playwright 脚本未能启动：macOS Chromium `bootstrap_check_in ... Permission denied (1100)`。Vite-only 页面的 Socket.IO 轮询 500 来自夹具未提供实时服务；没有真实账号或业务写入。
- 类型检查、定向 ESLint、`npm run test:content-topic-assets`、版本检查/治理、更新说明治理、测试入口治理、Studio token 门禁、生产构建和 `git diff --check` 通过；构建保留既有大分包提示。
- 无 API、权限或数据库变化；Android 仅同步版本元数据至 90224，未构建 APK。本地修改，不提交、推送或部署。B4/B5 全站审查、B8 其它写入路径和 Android 原生专项仍开放。

## v9.2.23 清单 B4/B5：移动首页辅助名称一致性

- `src/pages/mobile/MobileHome.tsx`：删除阶段按钮与稿件保存状态中覆盖/重复可见文字的辅助名称；可访问名称直接由屏幕内容构成，阶段数量不可用时仍有屏幕阅读器说明，并将说明限制在对应按钮内避免异常状态扩宽页面。
- `tests/browser/topic-stage-record-repair.spec.ts`：验证 7 个阶段按钮名称精确匹配可见计数和标签，并精确验证稿件任务名称没有重复的“保存状态”前缀。
- 隔离 Chrome 移动页 390×844 检查：Lighthouse Accessibility、Best Practices、SEO 均为 100；阶段名称不再触发 `label-content-name-mismatch`；仅有与当前页面无关的 `llms.txt` Agentic Browsing 建议。截图：`.playwright-mcp/audit-b4b5-home-status-final-390.png`。浏览器控制台无错误/警告，当前页面网络记录为本地测试夹具的只读 GET。
- 首次首页浏览器套件暴露异常摘要状态下的 390px 横向溢出；将隐藏计数说明移入所属按钮后，`XMT_HOME_DASHBOARD_ONLY=1 npm run test:topic-stage-record-repair-browser` 完整通过，包含已确认保存状态、账号隔离、阶段名称、错误重试与移动布局回归。
- B4/B5 扩展复核负责人角色首页：320×720 亮/暗主题 document width 均为 320px；1440×900 桌面无横向溢出，Lighthouse Accessibility、Best Practices、SEO 均为 100。控制台无应用错误；桌面 reduced-motion 提示为模拟器预期警告。业务 API 均为本地 GET；另有本地 Socket.IO 握手/轮询，不涉及业务写接口。
- B4/B5 后续审查移动消息中心：320×720 亮/暗主题 Lighthouse Accessibility、Best Practices、SEO 均为 100，无页面横向溢出；“系统”空结果与“工作流”消息筛选均正确，筛选条可横向触达。未触发“全部已读”；业务 API 仅本地 GET，Socket.IO 是本地握手/轮询，控制台无错误/警告。
- 边界：无 API、权限、数据库或业务数据变化；Android 仅同步元数据至 90223，未构建 APK。本地修改，不提交、推送或部署。B4/B5 全站审查、B8 其余写入路径和 Android 原生专项仍开放。

## v9.2.22 清单 G：移动创作者稿件保存状态

- `src/pages/mobile/MobileHome.tsx`：个人稿件任务增加状态提示；只有本次浏览器会话中当前账号收到 `writeConsistency:saved` 事件时，显示“本次会话已确认保存”。保存中、待保存修改、同步中和冲突分别提示；无事件、其他账号事件或非持久化同步事件一律显示“保存状态未确认”，不把 `updated_at` 当作当前保存证据。
- `src/components/ContentEditor.tsx`：在现有内存编辑状态事件上补充当前用户 ID；没有修改编辑器保存/重试逻辑、服务端接口、权限或数据库。使用现有文档 ID 精确匹配创作稿件版本。
- `tests/browser/topic-stage-record-repair.spec.ts`：移动首页隔离 Chrome 回归验证初始未知状态、其他账号保存事件隔离、协作同步不冒充持久化、待保存修改、同步中、保存中、明确保存成功及冲突状态；事件模拟不发起业务写入。
- 验证：`npm run check -- --pretty false`、定向 ESLint、`npm run test:home-dashboard`、`XMT_HOME_DASHBOARD_ONLY=1 npm run test:topic-stage-record-repair-browser`、版本检查/治理、更新说明治理（366 个版本）、测试入口（218 个）、Studio token（38 类）、Android runtime 合同、生产构建和 `git diff --check` 通过。构建保留既有大分包提示，最大 chunk 843.50 kB。
- 边界：Android 仅同步版本元数据至 90222，未构建 APK；本地修改，不提交、推送或部署。G 创作者保存状态已完成；B4/B5 全站审查、B8 其余写入路径、Android 原生专项仍开放。

## v9.2.21 清单 G：移动首页阶段最新内容预览

- `src/pages/mobile/MobileHome.tsx`：在阶段计数条下新增默认折叠的“各阶段最新内容”，展示灵感池、待审、创作中、成片、待发、已发、复盘各阶段最多 3 条。沿用既有阶段直达，预览标题可进入选题/复盘；选题额外显示当前阶段停留时长。
- 灵感条目复用已有灵感列表请求并限制为 3 条；其余预览来自服务端首页摘要本已提供的角色/负责人可见范围，不增发全量选题请求。
- `tests/browser/topic-stage-record-repair.spec.ts`：覆盖预览默认折叠、各阶段预览上限、灵感限量、阶段时长、站内跳转、未触发列表请求及展开后 390px 无横向溢出。
- 移动首页专属隔离浏览器回归、类型检查、定向 ESLint、首页摘要 API 测试、版本/说明治理、Studio token、Android runtime 合同和生产构建通过；完整选题阶段浏览器套件未运行。
- Android 仅同步版本元数据至 90221，未构建 APK；本地修改，不提交、推送或部署。

## 当前仍开放

- G：创作者保存状态；B4/B5 全站审查；B8 其余写入路径；Android 原生专项。

## v9.2.20 清单 G：移动首页最近变化

- `src/pages/mobile/MobileHome.tsx`：首页新增默认折叠的“最近变化”，展开后显示最近最多 5 条稿件版本、批注回复与选题状态变化；活动条目可直达对应内容，沿用服务端个人/团队可见范围。
- `src/api/homeDashboard.ts`：给现有只读活动请求补充取消信号，页面收起或账号身份变化时中止旧请求；失败可重试，刷新失败保留最近成功快照。
- `tests/browser/topic-stage-record-repair.spec.ts`：新增移动端回归，证明默认折叠不发请求、所有活动请求均为 GET、初次失败可恢复、刷新失败不丢旧数据、活动可直达创作记录，390px 页面无横向溢出。
- 定向隔离浏览器验收通过；完整选题阶段浏览器套件未运行。未新增 API 契约、权限、数据库字段或业务数据写入。
- Android 仅同步版本元数据至 90220，未构建 APK；本地修改，不提交、推送或部署。

## 当前仍开放

- G：创作者保存状态和阶段最新内容预览；B4/B5 全站审查；B8 其余写入路径；Android 原生专项。

## v9.2.19 清单 G：角色化首页任务与移动阶段概览

- `src/lib/homeTaskOrdering.ts`：抽取桌面与移动首页共用的任务排序；在审核角色的 6 项上限内，重复审核任务不再挤掉个人退回稿。
- `src/pages/Home.tsx`、`src/pages/mobile/MobileHome.tsx`：桌面首页加入现有摘要可见范围内的选题卡点任务；移动首页改为默认 3 项、最多展开 6 项的优先任务列表，并新增灵感池至复盘的 7 阶段计数条。移动灵感计数仅额外限量读取既有 `/api/inspirations` 列表接口。没有编造当前摘要未提供的“保存状态”，所有任务沿用现有权限与直达路径。
- Chrome DevTools MCP 隔离验收覆盖负责人、审核者、创作者；390×844 与 320×720 视口页面无横向溢出，前三条任务完整位于固定底栏上方，浏览器控制台无错误。浏览器脚本已完成全部首页断言并进入原有选题阶段交互；在不相关的后续等待中超过 10 分钟无输出后停止，因此整套 Playwright 脚本不记为通过。
- `npm run check -- --pretty false`、定向 ESLint、`npm run test:home-dashboard`、版本/更新说明治理、测试入口、Studio token、Android runtime 合同、生产构建和 `git diff --check` 通过。构建仍有既有 >500 kB 分包警告，最大 chunk 843.50 kB。
- Android 仅同步版本元数据至 90219，未构建 APK；本地修改，不提交、推送或部署。G 的创作者保存状态、阶段最新内容预览、移动最近变化/协作记录、B4/B5 全站审查、B8 其余写入路径和 Android 原生专项仍开放。

## v9.2.18 清单 G：移动工作台个人稿件任务

- `src/pages/mobile/MobileHome.tsx`：移动首页此前没有消费 `/api/dashboard/home-attention` 已返回的 `my_drafts.tasks`。现新增“我的稿件”卡片，显示服务端当前账号范围内的草稿与退回稿，并分别提供“继续写稿”“处理退回”入口直达对应创作记录；没有新增读取/写入请求、权限规则或数据库字段。
- `tests/browser/topic-stage-record-repair.spec.ts`：覆盖草稿、退回稿可见性、明暗主题文字对比度 ≥4.5:1 和原稿直达。另修复该回归脚本既有的同名词法变量遮蔽，以及负责人用户菜单定位与同步异常任务重名的问题，避免测试在页面验收前抛错。
- `npm run test:topic-stage-record-repair-browser` 本机隔离浏览器完整通过，覆盖首页摘要失败/重试、桌面/手机权限和跳转、消息读取恢复、近期变化、内容流与阶段/历史流程；Chrome 测试页没有意外浏览器错误。`npm run check -- --pretty false`、定向 ESLint、`npm run test:home-dashboard`、`npm run version:check`、版本治理、更新说明治理（362 个版本）、测试入口（218 个）、Studio token（38 类）、Android runtime 合同、生产构建和 `git diff --check` 通过。构建保留既有 >500 kB 分包提示（最大 843.50 kB）。手机截图：`/tmp/xmt-home-attention-390.png`。
- Android 仅同步版本元数据至 90218，未构建 APK；本地修改，不提交、推送或部署。G 的其它首页/责任口径、B4/B5 全站审查、B8 其余写入路径和 Android 原生专项仍开放。

## v9.2.17 清单 B4/B5：选题看板首屏布局

- `src/pages/Topics.tsx`：看板模式隐藏与阶段计数重复的顶部概览和重点选题卡片，列表模式继续显示原摘要；没有新配色或令牌，遵循 Studio Atelier 设计系统。
- `tests/browser/topics-list-responsive.spec.ts`：覆盖列表摘要、看板摘要隐藏及 1440×960 看板首列标题首屏可见。
- Chrome DevTools MCP 隔离页面确认：桌面看板首列标题从原 y≈1002 提升至 y≈571，并完整落在 1440×900 首屏；列表模式概览保留，看板模式概览和重点卡片隐藏。手机 390×844 通过列表/看板切换、平台筛选与恢复，页面级无横向溢出，底部导航未遮挡首列操作。只读 GET 与本机隔离夹具交互，未触发业务写入。
- 继续全站审查时尝试打开首页，但当前通用隔离夹具对 `/api/creator-agent/douyin/dashboard` 返回的是不符合业务契约的空结构，首页因此出现 Creator 数据字段缺失错误。此结果属于夹具缺项，不作为生产缺陷或视觉验收结论；后续应先补契约完整的只读响应，再继续首页审查。网络没有业务写入。
- `npm run check`、目标 ESLint、`npm run version:check`、版本治理、更新说明唯一性（361 个版本）、测试入口（218 个）、Studio token（38 类）、Android runtime 合同、`npm run build` 和 `git diff --check` 通过。构建保留既有 >500 kB 分包提示（最大 843.50 kB）。`npm run test:topics-responsive-browser` 在受限 sandbox 内首次因 macOS Chromium `bootstrap_check_in ... Permission denied (1100)` 未能启动；在本机浏览器运行许可范围内重跑后完整通过，包括新增首列首屏断言、桌面/手机审核互斥、列表操作列及缩放矩阵。Chrome DevTools MCP 的手工实测另行记录。
- 无 API、权限、数据库或业务数据变化；Android 仅同步版本元数据至 90217，未构建 APK。本地修改，不提交、推送或部署。B4/B5 全站审查、B8 其余写入路径、G 责任规则/可信指标及 Android 原生专项继续开放。

## v9.2.16 清单：资料全文搜索筛选、排序与无结果恢复

- `src/pages/ResourceSearch.tsx` 新增资料库、分类、标签筛选及相关度/最近更新/标题排序；筛选变化会丢弃旧结果，防止短暂显示与新条件不符的资料。无结果时提供调整建议，并可清除条件后保留关键词重搜。
- `src/api/resourceCenter.ts` 将筛选和排序条件明确传入请求；`api/routes/resource-center.ts` 对资料库、正整数分类 ID 和排序白名单进行校验，标签通过绑定参数与规范化名称匹配。查询继续先应用既有资源访问范围，不暴露无权资料，不引入数据库迁移或写入。
- `tests/search/global-search-http.test.ts` 覆盖复合条件、访问范围、标签规范化、标题/更新时间排序和无效排序拒绝；`tests/browser/resource-table-hover-contrast.spec.ts` 增加控件组合与空结果恢复回归。
- Playwright MCP 与 Chrome DevTools MCP 隔离夹具实际验证 `knowledge + category 81 + tag 内容 规划 + title_asc` 命中预置资料，未命中时显示建议；清筛后关键词保留且其它筛选重置。390px 暗色页无横向溢出，高亮文字实测对比度 11.92:1；390px 亮色页高亮对比度 7.81:1。浏览器控制台没有错误/警告。仓库自动浏览器脚本因 Chromium 启动时 `bootstrap_check_in ... Permission denied (1100)` 退出，测试体未执行；不将 MCP 手工复核表述为自动化通过。
- 无权限规则、数据库结构或业务资料变化；Android 仅同步版本元数据至 90216，未构建 APK。本地修改，不提交、推送或部署。资料搜索的这一项已完成；B4/B5 全站审查、B8 其余写入路径、G 责任规则/可信指标及 Android 原生专项继续开放。

## v9.2.15 清单：资料全文搜索关键词高亮

- `api/routes/resource-center.ts` 已用 SQLite FTS `snippet(..., '<mark>', '</mark>', ...)` 返回命中标记；基线 `src/pages/ResourceSearch.tsx` 会删除这些标记，所以用户无法从正文片段快速定位命中词。本版本新增 `src/components/resource-center/ResourceSearchSnippet.tsx`，只把成对 FTS 标记解析为语义 `<mark>`，普通片段按 React 文本节点输出；采用 Studio amber 令牌，不使用 `dangerouslySetInnerHTML`。
- `tests/resource-center/search-snippet.test.tsx` 覆盖 FTS 高亮、危险 HTML 文本转义、未闭合标记安全回退，SSR 单测 2/2 通过。`tests/browser/resource-table-hover-contrast.spec.ts` 已增加亮暗主题命中词可见性及对比度断言。
- `npm run check -- --pretty false`、目标 ESLint、`npm run build`、`npm run version:check`、`npm run test:version-governance`、`npm run test:changelog-governance`（359 个版本）、`npm run test:entrypoints`（218 个）、`npm run test:studio-token-usage`（38 类）、`npm run test:android-runtime`、`git diff --check` 通过；构建保留既有 >500 kB 分包提示。
- `npm run test:resource-hover-contrast-browser` 因 macOS Chromium 启动错误 `bootstrap_check_in ... Permission denied (1100)` 在测试体前退出。之后 Playwright MCP 与 Chrome DevTools MCP 隔离页确认亮暗主题命中词可见，浏览器人工验收与自动化未执行分别记录。
- 无 API、权限、数据库和业务数据变化；Android 仅同步版本元数据至 90215，未构建 APK。本地修改，不提交、推送或部署。搜索筛选/排序/空结果恢复于 v9.2.16 继续并完成；B4/B5 全站审查、B8 其余写入路径、G 责任规则/可信指标及 Android 原生专项继续开放。

## v9.2.14 清单 B4/B5：资料搜索可访问名称与窄屏回归

- `src/pages/ResourceSearch.tsx`：为搜索关键词框补充明确的“搜索资料关键词”可访问名称；搜索结果分类文字改用 Studio 次级文字令牌，提升暗色磨砂卡片上的辨识度；保持可见文案与搜索行为不变。
- `src/pages/ResourceLibrary.tsx`：为上一页/下一页图标按钮补充明确名称，并标明非当前可用页的状态。
- `tests/browser/resource-table-hover-contrast.spec.ts`：扩展隔离搜索结果，覆盖输入框名称、分类标签亮暗主题实际对比度、分页名称/禁用态及 320/390px 横向溢出。
- 基线浏览器确认此前搜索框在辅助树中没有名称，分页按钮也只有图标；分类标签从 Studio muted 文字改为 secondary 令牌。Playwright MCP 隔离页验证关键词输入名称、搜索结果和资料分页名称/禁用态；分类文字亮/暗主题实际对比度为 7.00:1 / 8.89:1，320/390px 无横向溢出。Chrome DevTools MCP 在 1440×900 暗色页独立验证搜索结果、无框架覆盖层，控制台只有测试主动启用减少动效产生的说明，无页面错误。仓库自动化 `npm run test:resource-hover-contrast-browser` 在 Chromium 启动前被 macOS `bootstrap_check_in ... Permission denied (1100)` 阻断，未执行测试体。`npm run check -- --pretty false`、目标 ESLint、版本检查/治理、更新说明唯一性（358 个版本）、入口（217 个）、Studio token（38 类）、生产构建和 `git diff --check` 通过；构建保留既有 >500 kB 分包警告（最大 843.50 kB）。`test:android-runtime` 通过；`test:android-build-endpoints` 因本地未生成 `dist/xmt-mobile-build.json` 失败，移动生产构建/原生资源仍留待 Android 专项。Android 仅同步元数据至 90214，未构建 APK；无 API、权限或数据库变化。本地修改，不提交、推送或部署。

## v9.2.13 清单 B4/B5：知识库分类树操作可辨识

- `src/pages/KnowledgeLibrary.tsx`：仅父分类展示展开/收起按钮；名称加入分类标题，叶子分类以装饰间距代替无效按钮。
- `tests/browser/resource-table-hover-contrast.spec.ts`：扩充隔离目录为父/叶子两层，覆盖父节点折叠/展开、子项显隐、叶子无无效控件及可辨识名称。
- Playwright MCP 隔离页验证父分类折叠隐藏子项、展开恢复、读屏名称包含分类名、叶子不提供无效按钮；320px 亮/暗、390px 亮色无横向溢出，分类面板 142px；1440px 保留 620px。仓库浏览器套件受 macOS Chromium `bootstrap_check_in ... Permission denied (1100)` 阻止，测试体未执行；MCP 手工交互代验。类型检查、目标 ESLint、版本治理、更新说明治理（357 个版本）、217 个测试入口、38 类 Studio token 门禁、构建及差异检查通过；构建保留既有 >500 kB 分包提示（最大 843.50 kB）。无 API、权限或数据库变化；Android 仅同步元数据至 90213，未构建 APK；本地修改，不提交、推送或部署。

## v9.2.12 清单 B5：知识库暗色分类计数对比度

- `src/pages/KnowledgeLibrary.tsx`：分类计数改用 Studio 次级文字令牌，避免暗色玻璃面板下小字号对比度低于 4.5:1。
- `tests/browser/resource-table-hover-contrast.spec.ts`：用含半透明祖先层合成的实际渲染对比度测量器，断言知识库分类计数亮/暗主题均至少 4.5:1。
- Playwright MCP 隔离页实测改动前暗色为 4.22:1、亮色为 5.69:1；修复后分别达到 8.29:1、7.45:1。`npm run test:resource-hover-contrast-browser` 因 macOS Chromium `bootstrap_check_in ... Permission denied (1100)` 在测试体启动前失败；以 Playwright MCP 隔离页按透明祖先层合成复核。类型检查、目标 ESLint、版本/更新说明治理（356 个版本）、217 个测试入口、38 类 Studio token 门禁、生产构建及差异检查通过；构建有既有 >500 kB 分包提示（最大 843.50 kB）。

## v9.2.11 清单 B4/B5：知识库移动布局收紧

- `src/pages/KnowledgeLibrary.tsx`：分类面板的 620px 最小高度改为仅桌面断点生效；窄屏不再因桌面布局规则留下大块空白。
- `tests/browser/resource-table-hover-contrast.spec.ts`：在亮/暗主题分别验证 320/390px 分类面板高度与横向溢出，并保留类别筛选与对比度覆盖。
- Playwright MCP 隔离夹具在亮暗主题 320/390px 验证分类面板按内容收缩且无横向溢出；320px 高度由 269.5px 降到 106px、搜索框上移约 163px；1440px 桌面仍为 620px。分类筛选仅产生业务 GET、无资料写入，控制台错误/警告为 0。`npm run test:resource-hover-contrast-browser` 因 macOS Chromium `bootstrap_check_in ... Permission denied (1100)` 在测试体启动前失败；Playwright MCP 手工隔离页实测代验。类型检查、目标 ESLint、版本检查/治理、更新说明治理（355 个版本）、入口（217 个）、Studio token（38 类）、生产构建和 `git diff --check` 通过；构建保留既有 >500 kB 分包提示（最大 843.50 kB）。
- 无 API、权限或数据库变化；Android 仅同步元数据至 90211，未构建 APK；本地修改，不提交、推送或部署。B4/B5 全站其余页面及 B8/G 未完成范围继续开放。

## v9.2.10 清单 B5：消息中心桌面计数对比度与移动布局回归

- 1440px 暗色消息中心隔离页发现桌面列表计数“本页 N 条，共 N 条”沿用 `text-muted`，与磨砂面板合成后的对比度仅 4.22:1；改为 Studio `text-secondary`，亮色/暗色实测分别为 7.45:1/8.29:1。
- 扩展 `tests/browser/messages-clear-hover.spec.ts`：检查桌面计数与危险按钮亮暗主题对比度、清空确认取消不会产生写入请求，并改为以独立 320×844 页面验证移动消息壳层，避免把移动路由当作桌面缩放后继续检查桌面按钮。
- Playwright MCP 隔离夹具确认桌面“清空→取消”后确认框关闭、API 仅有 GET、控制台错误/警告 0；320×844 移动亮/暗主题均无横向溢出，首屏可见文字最低对比度分别为 5.13:1/4.53:1。页面只使用空消息夹具，未触碰真实账号或业务数据。
- 自动化 `npm run test:messages-clear-hover-browser` 因 macOS Chromium `bootstrap_check_in ... Permission denied (1100)` 在启动阶段失败，测试体未执行；Playwright MCP 手工验收与自动脚本分开记录。`npm run check`、目标文件 ESLint、`npm run build`、版本检查/治理、更新说明治理（354 个版本）、测试入口（217 项）、Studio token（38 类）及 `git diff --check` 通过；构建保留既有超过 500 kB 分包警告。
- 无 API、权限或数据库变化；Android 仅同步版本元数据至 90210，未构建 APK。本地修改，不提交、推送或部署；B4/B5 其他页面、B8 其余写入路径、G 责任规则/可信指标及 Android 原生专项仍开放。

## v9.2.9 清单 B5：发布管理暗色文字对比度

- 暗色主题 Lighthouse 在发布管理页发现表格表头和负责人副标题对比度分别只有 3.82:1、4.23:1；进一步按磨砂卡片透明度与页面背景合成，发现四张统计卡片标题仅 4.22:1。
- 表格表头、负责人副标题以及共享 `MetricCard` 的标题/单位均改用 Studio `text-secondary` 主题令牌；浏览器回归检查全部表头、负责人文字和四个统计标题。
- Playwright MCP 与 Chrome DevTools MCP 在隔离页面验证 320px 暗色主题，Lighthouse Accessibility、Best Practices、SEO 均为 100；七个表头 7.52:1，卡片标签与负责人文字均达到 4.5:1。添加发布记录后取消，网络只有列表 GET，控制台错误/警告 0。Lighthouse 仅报告与页面体验无关的 `llms.txt` 建议。
- 类型检查、定向 ESLint、生产构建、版本/更新说明治理、测试入口（217 项）、Studio token 门禁（38 类）通过；仓库浏览器脚本因 macOS Chromium `bootstrap_check_in ... Permission denied (1100)` 未启动，测试体未执行。构建保留既有 >500 kB 分包提示。
- 无 API、权限或数据库变化；Android 仅同步元数据至 90209，未构建 APK。本地修改，不提交、推送或部署；B4/B5 全站其他页面、B8 其余写入路径、G 责任规则/可信指标及 Android 原生专项仍开放。

## v9.2.8 清单 B5：协作成员颜色对比度闭环

- 代码审计确认编辑器协作头像、Yjs 光标名称和溢出头像全部将白字直接叠在用户色板上；其中绿色、橙色和青色的实际对比度只有 3.30–3.68:1。
- 新增协作公共颜色模块，集中八种成员色板并按 WCAG 对比度选择浅/深文字令牌；无效颜色回退到可读默认色。工具栏头像、光标标签及溢出头像共用该配对逻辑。
- `tests/collaboration/collaborator-colors.test.ts` 覆盖八种色板与无效色回退；`tests/browser/production-review.spec.ts` 注入协作成员色板并断言亮暗主题下可见头像的实际渲染对比度 ≥4.5:1。
- `npm run check -- --pretty false`、协作色板单测、创作审阅 HTTP 合同、目标文件 ESLint、生产构建、版本/更新说明治理、测试入口（217 项）、Studio token 门禁（38 类）及 `git diff --check` 通过。Playwright MCP 在真实隔离创作详情页验证五个可见头像的亮/暗主题对比均 ≥4.5:1，控制台错误/警告为 0；暗色截图已保存。`npm run test:production-review-browser` 因 macOS Chromium `bootstrap_check_in ... Permission denied (1100)` 在启动阶段失败，未执行测试体；手工 MCP 验收与该自动套件分开记录。构建保留既有 >500 kB 分包提示。
- 无 API、权限或数据库变化；Android 仅同步元数据至 90208，未构建 APK。本地修改，不提交、推送或部署；B4/B5 全站其他页面状态、B8 其余写入路径、G 责任规则/可信指标及 Android 原生专项仍开放。

## v9.2.7 清单 B4/B5：导航隐藏状态与移动抽屉键盘闭环

- 桌面隔离页中，“内容生产”分组收起时高度为 0，但其子按钮仍在辅助树和 Tab 顺序中；关闭的窄窗抽屉也缺少焦点隔离。这是实际缺陷，并非先前过期快照造成的点击失败。
- 复核还发现，图标模式点击“内容生产”原先只更新隐藏分组状态、界面无反馈；现在点击会同步展开侧栏并打开所选分组。
- 侧栏现以实际显示状态同步 `aria-expanded` 和 `aria-hidden`，隐藏列表使用原生 inert 阻断焦点/交互，折叠时子按钮退出 Tab 顺序；图标模式下分组按钮仍具有明确的可访问名称；关闭的窄窗抽屉同样 inert。
- 窄窗抽屉打开时使用 modal dialog 语义，将初始焦点移入关闭按钮，Tab/Shift+Tab 在抽屉内循环，Escape 和关闭按钮均关闭并将焦点归还触发按钮。
- `tests/browser/published-archives.spec.ts` 增加分组收起/展开、ARIA、inert、Tab、“选题管理”存在性、图标模式分组名称与点击展开及窄窗抽屉焦点圈定/恢复回归。
- Playwright MCP/Chrome DevTools MCP 隔离页手工复核折叠后子项从 AX 树消失、展开后恢复、Tab 进入展开项，图标点击后侧栏从 72px 展开至 240px 且所选分组打开；窄窗抽屉打开后焦点进入菜单、键盘焦点留在抽屉，Escape/关闭按钮都恢复触发按钮焦点。`npm run check -- --pretty false`、定向 ESLint、导航路由测试、`npm run build`、版本检查/治理、更新说明治理（351 个版本）、Studio token 门禁（38 类）及 `git diff --check` 通过；构建保留既有 >500 kB 分包提示。仓库浏览器自动脚本因 macOS Chromium `bootstrap_check_in ... Permission denied (1100)` 在启动阶段失败，未执行测试体；由 MCP 隔离浏览器实测代验。
- 同步继续 B4 #4：Playwright MCP 隔离页对选题列表及创作详情分别检查 1366×768、1440×900、1920×1080 与 80%–125% 五档缩放。选题查看/删除操作均在视口内且未被祖先裁切，“进入创作”不与固定操作列重叠，六个流程阶段保持单行；创作详情的当前版本查看/编辑、小修保存、另开新版、提交审核及撤销/重做/格式刷/标题工具均在视口内。1024×900、125% 下“更多操作”菜单位于触发按钮上方并完整落在视口中。页面错误 0；选题页有 1 条 React Bits `magic-bento` 不支持 `topic-card`、回退到安全映射的既有警告，与布局无关，留待全站日志审查。以上为隔离页 MCP 实测，不等同于自动浏览器脚本通过。
- 本地修改，不提交、推送或部署；B4/B5 全站审查、B8 其他 mutation、G 责任规则/可信指标和 Android 原生专项仍开放。

## v9.2.6 清单 B4/B5：桌面工作台任务名称可区分

- 桌面工作台隔离页的可访问树暴露重复名称：“开始审核”“审核稿件”“去发布”等操作只播报动作，不包含任务标题；多个选题因此无法靠按钮名称区分。
- 操作按钮现使用“可见动作：任务类型 · 任务内容”作为可访问名称，保留原按钮文案和路由，不触碰 API、权限或业务数据。
- `tests/browser/topic-stage-record-repair.spec.ts` 增加编辑者与负责人工作台名称断言，并调整现有任务定位器以适配更具体名称。
- Playwright MCP/Chrome DevTools MCP 1440px 隔离页确认编辑者和负责人按钮名称均包含可见动作及具体稿件/选题/账号；桌面 Lighthouse Accessibility、Best Practices、SEO 均为 100，唯一未过项仍是与页面无关的 `llms.txt` 建议。无横向溢出、页面错误为 0；控制台只出现 reduced-motion 模拟提示。
- `npm run test:topic-stage-record-repair-browser` 尝试启动失败：Playwright Chromium 在 macOS `bootstrap_check_in ... Permission denied (1100)`，完整自动浏览器脚本未通过。`npm run test:home-dashboard`、`npm run check -- --pretty false`、定向 ESLint、`npm run build`、版本检查/治理、更新说明唯一性（350 个版本）、测试入口（216 个）、Studio 令牌门禁（38 类）与 `git diff --check` 通过；构建保留既有 >500 kB 分包提示。
- Android 仅同步版本元数据至 90206，未构建 APK；本地修改，不提交、推送或部署。全站 B4/B5 页面审查、B8 其他写入路径、G 责任规则/可信指标和 Android 原生专项仍开放。

## v9.2.5 清单 B4/B5：移动首页可读性与任务卡片名称

- 隔离首页首次 Lighthouse 审计发现：关注选题、待审稿件、今日发布、负责人数据同步异常卡片的自定义 aria-label 未包含卡片内可见内容；“查看全部”对比度为 3.4:1，暗色主题多个说明文字为 3.7–4.07:1。
- 移除与显示内容不一致的任务卡自定义名称，保留浏览器从可见标题/状态/负责人或平台/时间/同步结果形成的自然名称；链接改用 Studio cyan 对比令牌，普通辅助文字改用 Studio 次级文字令牌，错误提示改用语义错误令牌。
- `tests/browser/topic-stage-record-repair.spec.ts` 加入亮/暗主题名称和对比度断言；Chrome DevTools Lighthouse 在编辑视角 320px 与负责人视角 390px 的亮/暗主题 Accessibility、Best Practices、SEO 均为 100；唯一失败项为外部规范提示 `llms-txt`，与页面体验无关。
- Playwright MCP 320×800 编辑视角及 390×844 负责人视角隔离页可访问树确认关注选题、待审稿件、今日发布及同步异常按钮名称含完整可见内容；无横向溢出，控制台错误/警告为 0。`npm run test:topic-stage-record-repair-browser` 未能启动 Playwright Chromium（macOS `bootstrap_check_in ... Permission denied (1100)`），不能把完整自动浏览器脚本记作通过。
- `npm run check -- --pretty false`、定向 ESLint、`npm run build`、`npm run version:check`、版本治理、更新说明唯一性（349 个版本）、测试入口（216 个）、Studio 令牌门禁（38 类）和 `git diff --check` 均通过；构建保留既有 >500 kB 分包提示。
- 无 API、权限或数据库变化；Android 仅同步版本元数据至 90205，未构建 APK；本地未提交、推送或部署。下一步继续清单 B4/B5 的其他页面/主题/断点审查；B8 其它写入路径、G 责任规则/可信指标和 Android 原生专项仍开放。

## v9.2.4 清单 B4/B5：移动创作操作栏与协作光标无障碍

- 复核移动创作详情时发现 320px 视口下固定保存/提交栏与底部导航重叠；现按底部导航安全高度及系统键盘占位动态调整操作栏位置。
- 协作光标“其他协作者”溢出头像组补齐 `group` 语义和稳定名称，空组对辅助技术隐藏；每个头像提供协作者姓名。
- `tests/browser/production-review.spec.ts` 增加 320/390px 操作按钮与移动导航不相交检查。
- Playwright MCP 隔离页在 320×800 与 390×844 验证按钮可见、导航不遮挡且没有横向溢出；模拟 300px 键盘占位后操作栏仍在键盘上方。Chrome DevTools Lighthouse：Accessibility 100、Best Practices 100、SEO 100；剩余唯一失败为与页面 UI 无关的 `llms-txt` 文件检查。页面错误和警告均为 0。
- `npm run check -- --pretty false`、定向 ESLint 与 `npm run test:production-review` 通过。未运行完整 Playwright 启动器（macOS Chromium 启动权限限制）；由 MCP 隔离浏览器手动验证。本轮无 API、权限或数据库变化；Android 仅同步版本元数据至 90204，未构建 APK；本地未提交、推送或部署。
- 范围限制：仅审查移动创作详情流程，不代表 B4/B5 全站审计完成。下一阶段继续对照清单覆盖其他桌面/移动页面与状态；B8 其它写入路径、G 责任规则/可信指标及 Android 原生专项仍开放。

## v9.2.3 清单 B5：匿名意见回复输入可访问性

- 复核发现管理员回复弹窗的文本框仅依赖 placeholder，没有与可见标签关联；读屏和语音输入不易辨认字段用途。
- 回复窗新增“回复内容”可见标签，输入框改用 Studio `.xmt-field` 令牌并支持纵向调整；后台回复写入和权限行为不变。
- `tests/browser/anonymous-feedback-admin-responsive.spec.ts` 在两主题 × 320/390/1440px 检查文本框具有名称“回复内容”，并保留弹窗打开/取消交互。
- Playwright MCP 隔离页手动核对回复弹窗的可访问树显示 `textbox "回复内容"`，打开/取消正常。截图：`.playwright-mcp/anonymous-feedback-reply-label-v9.2.3.png`。完整 Playwright 脚本受 macOS Chromium `bootstrap_check_in ... Permission denied (1100)` 限制未能启动。
- 类型检查、定向 ESLint、生产构建、版本检查/治理、更新说明治理（347 个版本）、测试入口（216 个文件）、Studio 令牌门禁（38 类）及差异检查通过；构建保留既有 >500 kB 分包提示。
- 无 API、权限或数据库变化；Android 仅同步元数据至 90203，未构建 APK；仅本地修改，不提交、推送或部署。

## v9.2.2 清单 B8：匿名意见管理列表并发保护

- 复核发现：列表刷新失败后用户可重试；重试读取在途时行操作仍可用。若旧 GET 在较新的状态/公开/回复/删除写入及刷新之后才返回，它可能以旧快照覆盖已确认的新状态。
- 列表读取采用递增请求代次，只允许最新请求更新列表、选中详情、错误态与初次加载状态；状态、公开、回复、删除写入确认后会使更早的列表读取失效。正常的列表重试仍是只读 GET。
- `tests/browser/anonymous-feedback-admin-responsive.spec.ts` 加入延迟旧 GET 与状态更新交错回归，并保留现有写入成功/列表 503、只读恢复及主题/窄屏覆盖。
- Playwright MCP 使用本地隔离 Express/Vite 夹具复现“重试 GET 挂起 → 状态 PATCH 成功并完成新 GET → 旧 GET 最后返回”；页面在旧快照释放后仍显示“已完成”。仅出现夹具预期注入的 1 条 GET 503，浏览器警告为 0；截图：`.playwright-mcp/anonymous-feedback-admin-race-v9.2.2.png`。自动运行整套 Playwright 时 Chromium 在 macOS 因 `bootstrap_check_in ... Permission denied (1100)` 无法启动。
- `npm run check -- --pretty false`、定向 ESLint、`npm run build`、版本检查/治理、更新说明治理（346 个版本）、测试入口（216 个文件）、Studio 令牌门禁（38 类）及 `git diff --check` 均通过；构建保留既有 >500 kB 分包提示。
- 无 API、权限或数据库变化；Android 仅同步元数据至 90202，未构建 APK；仅本地修改，不提交、推送或部署。

## v9.2.1 清单 B8：匿名意见提交确认与重复请求保护

- 盘点发现匿名意见的 POST 成功后仍等待组件列表读取和父页面刷新；慢读期间表单继续显示“提交中”，若后续联动读取抛错还可能把已确认写入误报为失败。原提交入口只依赖 React loading 状态，同事件周期缺少同步互斥。
- 现写入确认后立即解除表单忙碌、清空已提交内容并给出成功提示；列表刷新和父页面刷新与写入分离，读取失败只显示列表读取问题。写入失败保留类型和正文供重试；请求代次防止过期列表回包覆盖更新列表，同步锁阻止重复 POST。输入框使用 Studio `.xmt-field`。
- `tests/browser/anonymous-feedback-theme-contrast.spec.ts` 增加独立回归：同一事件周期双击只发一条 POST、在途表单锁定、503 写入保留内容及显式重试，以及确认写入后两路列表 GET 503 时仍保持“已提交”且不新增“提交失败”。
- Playwright MCP 在本地 Vite 320×800 隔离页面使用模拟账号和 mock API 完成上述交互，3 次已确认写入各只保存一条；应用 JavaScript 错误 0、非预期警告 0、无错误边界，另有 3 条 `socket.connect_failed` 警告来自未连接 API/Socket.IO 的隔离环境，503 日志为本轮注入的失败回包。页面文档宽度 312px，小于 320px 视口。截图：`/tmp/xmt-anonymous-feedback-submit-v9.2.1.png`。仓库 Playwright Chromium 启动仍受 macOS `bootstrap_check_in ... Permission denied (1100)` 限制，未能执行自动浏览器脚本。
- 无 API、权限或数据库变化；Android 仅同步版本元数据至 90201，未构建 APK。仅本地修改，不提交、推送或部署；继续 B8 其它写入路径及 B4/B5 全站主题/响应式审计，G 可信指标/责任规则仍需业务口径或可靠来源，Android 原生专项按既定计划延期。

## v9.2.0 清单 B4/B8：资料详情在线编辑

- 按 B4“资料正文直接可读可改可粘贴”继续：接通详情页原本无行为的编辑入口，支持编辑标题、摘要、分类、可见范围和正文，沿用现有 `PUT /resources/:id` 及其 `resource:update`、资料范围校验与事务审计；无 API 路由、权限规则或数据库结构变化。
- 编辑窗读取当前资料库分类；分类读取失败时仍保留现有分类并允许修改其他字段。保存使用同步互斥，服务端确认前锁定输入与关闭入口；写入失败保留表单，确认成功立即更新详情，再独立读取服务端详情。刷新失败说明已保存并只提供读取重试，不重复写入。
- `tests/browser/resource-category-management.spec.ts` 扩展覆盖保存失败后保留输入、快速重复提交仅一条写入、等待期间字段与关闭锁定、Esc 无法关闭、确认后回显，以及注入详情读取失败后只重试 GET。资源服务端更新/审计事务、创建原子性和分类权限测试通过；Playwright MCP 本地 mock 实测写入失败后重试、在途锁定、成功回显和详情 GET 单独恢复，快速双提仅增加一条 PUT。
- 类型检查、定向 ESLint、生产构建、`version:check`、版本治理、更新说明治理（344 个版本）、测试入口（215 个）和 `git diff --check` 通过。仓库浏览器脚本仍因 macOS Chromium `bootstrap_check_in ... Permission denied (1100)` 无法启动，改由 Playwright MCP 完成隔离交互验收；1366px/320px 页面无横向溢出，运行时异常为 0，写入失败恢复流中的两条控制台错误是夹具注入的 503；构建后重新加载详情并打开/关闭编辑窗后控制台错误为 0。构建保留既有最大 843.50 kB 分包警告。
- 当前仅完成资料文本/元数据编辑入口；文件上传仍无真实文件存储链路，因此不宣称已完成。无数据库迁移；Android 仅同步元数据至 90200，未构建 APK。
- 本地修改，不提交、推送或部署；下一步继续 B8 写入路径与 B4/B5 全站主题/响应式审计，G 的责任规则/可信指标及 Android 原生专项仍开放。

## v9.1.47 清单 B8/B4：资料写入保护与未接入入口说明

- 资料创建弹窗此前仅依赖异步 React 状态禁用按钮；同一事件周期可重复触发提交，且服务端响应前仍能修改表单或关闭弹窗。
- 新增同步互斥锁，并在请求期间锁定所有提交字段、取消/关闭入口和遮罩/Esc 关闭；失败保留输入并恢复明确重试，成功仍由服务端确认后进入详情。
- 资料详情有权限时仍展示的在线编辑按钮无处理器，上传也尚未接入；两者现明确显示“暂未开放”并禁用，减少误点。
- `tests/browser/resource-category-management.spec.ts` 加入延迟创建夹具，连续同步触发表单提交，检查仅一个 POST、请求中字段与关闭禁用、确认后跳转和未接入入口状态。
- `npm run test:resource-create-atomic`、`npm run test:resource-center-mutations`、`npm run test:resource-categories`、`npm run check -- --pretty false`、定向 ESLint、版本/更新说明治理（343 个版本）、测试入口（215 个）、`npm run build` 与 `git diff --check` 通过。仓库 Playwright 脚本受 macOS Chromium `bootstrap_check_in` 权限限制未能启动；Playwright MCP 隔离页面实测同事件周期双提交只发一条 POST、请求中表单/关闭入口锁定、Esc 不关闭，服务端确认后进入带 `library_type=knowledge` 的详情，并核对编辑/上传状态说明。1366px 与 320px 视口确认页面无横向溢出、操作按钮均在视口内。Vite-only 实测页的 Socket.IO polling 错误源于未连接实时服务，不影响本次写入路径验证。无 API、权限或数据库变化；Android 仅同步元数据至 90147，未构建 APK。
- 本地修改，不提交、推送或部署；继续 B8 其他写入路径和 B4/B5 全站主题/响应式审计，G 待产品规则/可信指标来源，Android 原生专项按既定安排延期。

## v9.1.46 清单 B4/B5：资料库查询路由导航状态

- 从资料中心概览进入“项目资料库”时，页面标题为“项目资料库”，但同一 pathname 的查询路由未被区分，导致侧栏错误高亮“内容档案库”、面包屑也显示错误名称；旧详情链接同样丢失资料库来源。
- 导航匹配现在在列表和详情路由校验/保留 `library_type`，将项目、内容档案、知识、素材分别关联至正确导航项；详情页返回所属资料库，旧无参数详情会按服务端资料类型补齐查询参数。保留旧项目/素材路由别名，并在 query 变化时更新侧栏展开分组。
- 新增导航路由合同测试和资料浏览器回归断言，覆盖四种详情类型、列表路由及旧路径。Playwright MCP 隔离浏览器从资料中心入口打开项目库并核对标题/高亮/面包屑；旧详情 URL 自动归一、所属返回路径正确；内容档案/素材查询路由逐一核验。项目路由亮/暗主题通过、当前页控制台错误为 0；未连接真实账号或业务数据。
- `npm run test:navigation-routes`、`npm run check -- --pretty false`、定向 ESLint、`npm run test:entrypoints`（215 个文件）、版本/更新说明治理与 `npm run build` 通过；构建保留既有 >500 kB 分包提示。完整浏览器脚本未运行；隔离 UI 交互使用 MCP 验收。
- Patch v9.1.46，Android 仅同步版本元数据至 90146，未构建 APK；无 API、权限或数据库变化。本地修改，不提交、推送或部署。继续 B8 其他 mutation 盘点及 B4/B5 全站主题/响应式验收；G 责任规则/可信指标待明确口径和可靠来源，Android 原生专项延期。

## v9.1.45 清单 B8：系统设置写入防重复

- 盘点发现通知偏好、个人资料和密码修改已有同步写锁，而系统、品牌、登录页共用的保存函数只依赖异步 React 状态与按钮禁用，快速重复触发仍可能并发提交；同时保存期间字段未锁定，晚到的成功回包可能覆盖等待期间的新输入。
- 为三类系统设置保存入口增加同步互斥；请求期间锁定对应文本/选择/Logo 控件，失败释放锁并保留原数据和重试入口，成功再使用服务端确认值更新状态。
- `tests/browser/system-settings-default-theme.spec.ts` 增加延迟服务端回包，在 Logo 保存失败后快速双击重试并断言只多一次写入，同时检查保存中字段和 Logo 输入禁用。Playwright MCP 隔离实测品牌保存双击仅一条 PUT、成功提示可见、设置页正确渲染且控制台无错误；完整仓库浏览器脚本启动受 macOS Chromium `bootstrap_check_in` 权限限制。
- `npm run check -- --pretty false`、定向 ESLint（0 error，保留原有两个 Hook 依赖 warning）、`npm run test:system-settings`、版本检查/治理、更新说明唯一性、测试入口、生产构建和 `git diff --check` 通过；完整仓库 Playwright 脚本尝试启动时受 macOS Chromium `bootstrap_check_in` 权限限制，隔离页面交互改用 Playwright MCP 实测。构建保留既有 >500 kB 分包提示。
- Patch v9.1.45，Android 仅同步元数据至 90145，未构建 APK；无 API、权限、数据库或真实设置变化。本地修改，不提交、推送或部署。继续 B8 其他 mutation 盘点及 B4/B5 全站主题/响应式验收；G 责任规则/可信指标仍待明确口径和可靠来源，Android 原生专项延期。

## v9.1.44 清单 B8：批注写入与建议采纳互斥

- 批注、回复曾在请求等待期间继续允许编辑或取消，成功回包可能覆盖等待时的新输入；现有写入锁禁用表单、关闭与状态操作，失败保留输入并释放重试，成功后仅清理已提交的草稿。
- 接受修改建议时桌面稿件已需保护；现将建议保存纳入共享稿件互斥，移动端同步锁定正文/其它建议动作和保存/提交，并拦截离页，直到正文与建议状态获得确认。
- Chrome DevTools MCP 隔离实测桌面批注/回复失败保留草稿及延迟请求锁定；桌面建议保存期间正文只读、版本操作禁用；移动端正文只读、保存和审核禁用、导航拦截，放行后状态变为已采纳。自动回归更新至 `tests/browser/production-review.spec.ts`；完整 Playwright 启动受 macOS Chromium 子进程权限限制，本轮用 MCP 实测。
- `npm run check -- --pretty false`、4 个改动文件定向 ESLint、`npm run test:production-review`、`npm run version:check`、`npm run test:version-governance`、更新说明唯一性（340 个版本）、测试入口（214 个）、`npm run build` 与 `git diff --check` 均通过；构建保留既有 >500 kB 分包提示。Playwright 浏览器脚本在隔离服务模式编译通过但未完整启动，交互验收由 Chrome DevTools MCP 完成。
- Patch v9.1.44，Android 仅同步元数据至 90144，未构建 APK；本地修改，不提交、推送或部署。继续 B8 剩余操作盘点及 B4/B5 全站主题/响应式验收；G 责任规则/可信指标仍需可靠来源，Android 原生专项延期。

## v9.1.43 清单 B8：自动保存与稿件变更互斥

- 盘点发现创作详情审核已等待自动保存，但小修/另开版本与一般状态变更直接调用同一更新接口；在正文自动保存请求仍在途时存在并发写入窗口。
- 版本保存和状态变更现在先设置统一互斥、锁定正文与其它稿件操作，再等待编辑器自动保存确认；确认后使用最新编辑器正文，失败/超时/中断则不发起后续写入并允许重试。状态成功后本地正文与状态一起更新。
- 隔离浏览器回归覆盖挂起自动保存后触发状态变更/小修保存：保存未确认前无状态/版本写入，编辑器及操作入口锁定；放行后后续写入携带新正文。Chrome DevTools MCP 实测状态与版本两条路径；标准 Playwright 脚本因 macOS Chromium `bootstrap_check_in` 权限限制无法启动。
- `npm run check -- --pretty false`、定向 ESLint、`npm run test:production-review`、版本检查、更新说明治理（339 个版本）、测试入口（214 个）、版本治理、`npm run build` 与 `git diff --check` 通过；构建保留既有 >500 kB 分包提示。
- Patch v9.1.43，Android 仅同步元数据至 90143，未构建 APK；本地修改，不提交、推送或部署。继续 B8 剩余 mutation 盘点及 B4/B5 主题/响应式验收；G 责任规则/可信指标仍需可靠来源，Android 原生专项延期。

## v9.1.42 清单 B8：审核在途期间稿件操作互斥

- 创作详情此前只锁定了两个“提交审核”入口和正文；审核请求在途时，版本保存/切换、状态更新或删除仍可能并发操作同一稿件。
- 现将审核、状态更新、版本保存和删除纳入同一同步互斥；提交等待期间锁定正文、版本切换、保存和删除入口，并明确禁用状态；所有处理失败后释放锁并保留重试路径。
- Playwright MCP 隔离实测延迟审核期间两个提交入口、正文、小修/另开版本、当前稿切换及删除均锁定；同一事件周期双入口触发仅产生一次写入，服务端确认后状态更新且提交入口消失。浏览器回归脚本同步纠正为定位正式正文编辑器，并等待失败后重试入口恢复。截图：`/tmp/xmt-production-review-global-lock.png`。
- 类型检查、定向 ESLint、`npm run test:production-review`、版本检查、更新说明治理、测试入口、版本治理、生产构建和差异检查通过；仓库浏览器脚本受 macOS Chromium 子进程权限限制，改用已授权 Playwright MCP 实测；构建保留既有 >500 kB 分包提示。
- Patch v9.1.42，Android 仅同步元数据至 90142，未构建 APK；本地修改，不提交、推送或部署。继续 B8 其余 mutation 盘点及 B4/B5 全站主题/响应式验收；G 责任规则与可信指标仍需可靠口径/来源，Android 原生专项按计划延期。

## v9.1.41 清单 B8：创作详情审核提交闭环

- 审核提交现在先等待编辑器自动保存结果；保存失败、超时或中断时阻止审核状态写入并提示处理方式。
- 请求处理中使用同步互斥，锁定提交按钮与正文；服务端确认后立即在当前页更新为“审核中”，后续详情读取失败也不会把已确认写入误报成提交失败。
- Playwright MCP 本地隔离验证连续两次正文保存 503 时审核写入为 0、草稿保留且两个入口可重试；审核接口失败保留草稿；延迟审核请求期间两个入口锁定、正文只读、快速双入口触发仅一次写入，确认后状态变为“审核中”且提交按钮消失。回归已加入 `tests/browser/production-review.spec.ts`。
- `npm run test:production-review`、`npm run check -- --pretty false`、定向 ESLint、`npm run version:check`、更新说明治理、测试入口、版本治理、`npm run build` 与 `git diff --check` 均通过。仓库浏览器脚本因 macOS Chromium 子进程 `bootstrap_check_in` 权限限制未能启动，改用已授权 Playwright MCP 实测；构建保留既有 >500 kB 分包提示。
- Patch v9.1.41，Android 仅同步元数据至 90141，未构建 APK；本地修改，不提交、推送或部署。后续继续 B8 其余 mutation 盘点及 B4/B5 全站主题/响应式验收；G 责任规则与可信指标仍受产品口径/来源限制，Android 原生专项按计划延期。

## v9.1.40 改造清单 B8 / B4-B5：工作台摘要异常回包恢复

- 新鲜隔离浏览器复现 HTTP 200 `{}` 会令移动首页在 `.slice()` 处落入 React 错误页；这不是当前服务端路由的正常响应，当前路由仍返回完整摘要结构。客户端 API 现在在写入页面状态前校验必需的列表/计数结构，缺失时显示“工作台摘要数据格式暂不兼容”并允许只读重试，不把未知数据默认为空。
- `tests/browser/topic-stage-record-repair.spec.ts` 增加 390px 异常摘要回包回归：错误提示位于页面内、无框架错误、无横向溢出；重试返回有效摘要后页面恢复。Playwright MCP 另在 390px 与 1440px 本地隔离回包验证恢复交互。
- `npm run check -- --pretty false`、定向 ESLint、`npm run test:home-dashboard`、`npm run test:api-contract` 与版本一致性检查通过。仓库浏览器测试因 macOS 拒绝 Chromium 子进程 `bootstrap_check_in` 未能启动；采用已授权 Playwright MCP 完成隔离浏览器验证。开发页未连接 API 服务，Socket.IO 代理 500 属预期环境限制，不是工作台摘要错误。
- 无 API、权限、数据库、真实业务数据或 Android 原生代码变化；Patch v9.1.40，Android 仅同步元数据至 90140，未构建 APK。本地修改，不提交、推送或部署。
- 下一步继续 B8 剩余页面反馈与 B4/B5 主题、响应式验收；G 责任规则/可信指标仍需产品口径或可靠来源，Android 专项依计划延期。

## v9.1.39 改造清单 G：官方导出部分解析拒绝透明化

- v3 官方导出此前只拒绝整份解析失败；部分行因无效日期/身份被采集器跳过时，服务端依然成功入库有效行，但同步页面不显示拒绝行数。现服务端在批次回执中保存经过格式校验、文案映射的采集器质量摘要；摘要不改变服务端接受的数据和指标计算。
- Agent 从本地持久上传队列回执中读取质量摘要，在“最近同步”展示读取、接受、拒绝、重复数量和安全提示；只在有拒绝/重复/提示时显示，干净批次不增加噪声。
- `npm run test:official-export-v2` 覆盖整批失败关闭、正常回执、部分拒绝提示和持久化；Agent `test:official-export-quality` 4 项覆盖安全回执解析、部分拒绝提示与干净批次静默。主项目/Agent 类型检查、生产构建、版本检查、更新说明唯一性（335 个版本）、测试入口（214 个文件）通过；全仓 ESLint 0 errors、294 warnings，构建保留既有最大 843.50 kB 分包提示。
- Playwright MCP 用本地模拟 preload 验证 Creator Agent Dashboard：小范围同步后显示 43/40/3/0 行质量状态，干净同步不显示；390px 视口文档宽度与视口一致，无横向溢出；页面无框架错误覆盖。Vite 独立启动本身因没有 Electron preload 会显示安全接口失败，验收桥接完全本地模拟、未连接账号；Browser 插件不可用，按已授权 Playwright MCP 回退。Python 解析器在 v9.1.38 已测 4 项，本版本未改解析器；当前环境未安装 pytest/Scrapling，未重复运行。
- Patch v9.1.39，Creator Agent v2.14.6-agent；Android 仅同步元数据至 90139，未构建 APK；仅本地修改，不提交、推送或部署。
- 继续 B8 页面反馈、B4/B5 全站主题与响应式验收、G 可信指标/责任规则；外部及 Android 原生专项仍开放。

## v9.1.38 改造清单 B8 / G：修复成就检查挂起与官方导出静默漏收

- `/api/achievements/check` 遇到已获得成就时原先结束整个请求且不返回响应；现只跳过当前项，并继续检查后续成就。真实 HTTP 回归验证正常返回、后续符合条件项授予及重复检查不重复写入。
- 抖音官方导出 v3 原先忽略质量告警，表头无法识别仍可能把账号日指标部分入库并报告成功。服务端现校验解析告警，在创建批次和写入任何业务数据前拒绝解析失败；采集器对全行拒绝增加明确告警。服务合同覆盖表头未识别、全行拒绝、解析异常三类情况。
- `npm run test:achievements-check`、`npm run test:official-export-v2`、采集器 Python 解析测试（4 项）、`npm run check -- --pretty false`、`npm run build`、版本检查、更新说明治理、测试入口及 `git diff --check` 均通过；构建保留既有 >500 kB 分包提示，定向 ESLint 0 errors、保留成就路由既有警告。
- Patch v9.1.38；Android 仅同步元数据至 90138，未构建 APK；仅本地修改，不提交、推送或部署。
- 后续继续 B8 其它页面反馈、B4/B5 主题及响应式验收、G 可信指标/责任规则；外部与 Android 专项仍开放。

## v9.1.37 改造清单 B8：选题详情操作防重复提交

- `TopicDetail` 桌面阶段推进增加同步互斥、请求中禁用和“阶段处理中…”反馈；移动端保存、阶段推进、补齐当前阶段记录及审核增加同步互斥，并在请求期间锁定操作和显示处理中状态，避免 React 完成重绘前的快速连点产生重复写入。
- 登录页三个布局的账号/密码标签与输入框显式关联，备案链接改用满足普通文本对比度的主题令牌；`tests/auth/auth-login-navigation.spec.ts` 覆盖标签、对比度和登录导航。选题浏览器回归通过；登录测试首页请求的本机 API 未启动时会产生预期连接拒绝日志，不影响断言。
- 浏览器回归、类型检查、生产构建、版本治理、更新说明治理、测试入口和差异检查通过。定向 ESLint 0 errors，保留既有警告；构建保留既有 >500 kB 分包提示。
- 无 API、权限、数据库或真实业务数据变化；Android 仅同步元数据至 90137，未构建 APK。本地修改，不提交、推送或部署。
- 下一步继续 B8 剩余页面写入/读取反馈与 B4/B5 全站验收；G 可信指标/责任规则及外部/Android 专项仍开放。

## v9.1.36 改造清单 B8：选题审核与看板阶段操作防重复提交

- 桌面选题详情的审核入口此前没有在请求期间锁定，慢网或快速重复点击可能重复写入审核结果。现新增同步互斥；审核结果、负责人、意见、取消和提交控件在服务器确认期间均锁定。桌面/移动共用的选题看板也按选题同步互斥并显示处理中，防止多个阶段操作同时提交。
- `npm run test:topic-stage-record-repair-browser` 与 `npm run test:topics-responsive-browser` 通过：审核 503→显式重试只成功写入一次；延迟审核回包期间表单不可变更/取消；桌面及 390px 移动看板延迟期间同一选题的全部阶段操作禁用且每端仅写入一次。既有首页、权限、工作台及移动布局回归同时通过。
- `npm run check -- --pretty false`、`npm run build`、版本检查、更新说明治理、测试入口和 `git diff --check` 通过；定向 ESLint 0 errors，保留页面既有 warning。构建保留既有 >500 kB 分包提示。无 API、权限、数据库或业务数据变化；Android 仅同步元数据至 90136，未构建 APK。本地修改，不提交、推送或部署。
- 下一步继续 B8 其余页面写入/读取反馈与 B4/B5 全站验收；G 可信指标/责任规则和外部/Android 专项仍开放。

## v9.1.35 改造清单 B8：移动消息中心分页与全账号已读

- 移动端原来只请求默认第一页 20 条，未读数也按这一页计算；“全部已读”逐条处理已加载消息，可能漏掉其它页面。现分页追加历史消息、使用服务端全账号未读摘要，并调用现有账号级批量已读接口。
- 更多消息加载失败时已加载内容保持可见，可重试同一页且按 ID 去重；账号级全部已读失败时不改变已读状态，成功后同步归零未读数。筛选为未读时单条标读后重新读取第一页，避免分页位移造成跳项。
- `npm run check -- --pretty false` 与定向 ESLint 通过。Playwright MCP 390px 实测 45 条消息跨三页加载、第二页 503 后保留首屏并重试、全局未读数保持 30、单条已读后未读分页回到第一页且不跳项；批量已读 503 后保持未读并成功原子重试，批量操作没有向每条消息发送单独写请求，页面运行时无错误。仓库 Playwright 脚本因 macOS 拒绝 Chromium 子进程启动未能运行。
- Patch v9.1.35；Android 仅同步版本元数据至 90135，未构建 APK。复用现有 API，无接口/权限/数据库或真实业务数据变化。本地修改，不提交、推送或部署。
- 下一步继续 B8 剩余页面反馈与 B4/B5 全站验收；G 可信指标/责任规则及外部/Android 专项仍开放。

## v9.1.34 改造清单 B8：首页待处理消息读取状态

- 首页若没有其它待办，待处理消息首次读取尚未完成时此前会短暂显示“今天没有必须处理的任务”；读取失败后点击重试会提前清除错误提示，产生同样的误导。现请求未确认期间显示“正在确认是否有待处理消息…”，失败提示持续到重试成功后才显示真正的空任务状态。
- `npm run test:topic-stage-record-repair-browser` 隔离注入延迟 503，覆盖消息读取中、错误保持、按钮重试中状态及恢复后确认空任务；并回归既有首页/选题审核和 390px 手机路径。类型检查、定向 ESLint、生产构建、版本/更新说明治理、测试入口和差异检查通过；构建保留既有 >500 kB 分包提示。Android 仅同步版本元数据至 90134，未构建 APK；无 API、权限、数据库或真实业务数据变化。本地修改，不提交、推送或部署。
- 下一步继续 B8 逐页读取/写入反馈盘点，并推进 B4/B5 全站验收；G 可信指标/责任规则及外部/Android 专项仍开放。

## v9.1.33 改造清单 B8：选题模板保存期间保护表单

- 选题模板创建/更新请求获服务端确认前，原有表单字段仍可继续编辑；成功后清空表单会丢弃等待期间新输入。现整个表单字段组在写入期间禁用，并通过 `aria-busy` 和明确的处理中提示暴露等待状态；取消编辑也一起锁定。服务端拒绝时现有输入保留、请求退出忙碌状态并可重试。删除和列表只读重试也显示处理中说明。
- `tests/browser/template-management-responsive.spec.ts` 注入写入 503 验证表单保留和显式重试只创建一条记录；再用延迟响应分别覆盖新建/更新字段锁定到回包、处理中提示、更新期间不可取消、确认后正常清理；同时回归写后列表读取失败的只读恢复和 320/390/1440px 多主题页面可读性。
- `npm run test:template-management-browser`、`npm run check -- --pretty false`、定向 ESLint、`npm run build`、`npm run version:check`、版本/更新说明治理、测试入口、Android runtime 契约、模板 API/权限合同及 `git diff --check` 均通过；生产构建保留既有 >500 kB 分包提示。Android 仅同步版本元数据至 90133，未构建 APK；无 API、权限、数据库或业务数据变化。本地修改，不提交、推送或部署。
- 下一步继续逐页盘点 B8 剩余写入/读取反馈，并推进 B4/B5 全站验收；G 可信指标/责任规则及外部/Android 专项仍开放。

## v9.1.32 改造清单 B8：知识库分类与资料独立读取恢复

- 知识库分类树与资料结果此前由同一个 `Promise.all` 绑定；分类 GET 失败会误报资料结果整体不可用，搜索/筛选变化也会重复读取分类。现两路独立加载，筛选变化只重读资料。
- 分类错误会明确说明右侧结果仍可查看、当前筛选保留，并提供只重读分类的恢复入口；目录加载/失败期间禁用分类管理，防止基于缺失列表编辑/删除。请求代次隔离旧分类回包。
- `npm run test:resource-hover-contrast-browser` 通过：隔离分类 GET 503 后资料继续显示，重试只请求分类；恢复前后分类管理正确禁用/启用。320/390px 无页面横向溢出，资源库、详情审计与原有删除/创建反馈回归通过。
- Patch v9.1.32；Android 仅同步元数据至 90132，未构建 APK。无 API、权限模型、数据库或业务数据变化。本地修改，未提交、推送或部署。
- 下一步继续 B8 其余读取/写入反馈盘点，并推进 B4/B5 全站验收；G 待明确规则/可信指标及外部/Android 专项仍开放。

## v9.1.31 改造清单 B8：资料分类列表读取恢复

- 资料列表与分类目录原先使用同一个 `Promise.all` 失败路径，分类 GET 暂时失败会把已成功的资料列表整体替换为错误页；现两者独立读取，分类加载/错误不会遮挡资料内容。
- 分类失败时明确说明资料仍可继续查看，提供仅重读分类的操作；URL 中已有分类筛选会以“名称待确认”保留，不会误显示成“全部分类”。请求代次隔离不同资料库类型的迟到响应。
- `npm run test:resource-hover-contrast-browser` 通过：隔离注入分类 GET 503，确认资料仍展示、分类可只读恢复且不重读资料；同时覆盖 320/390px 提示无溢出与 v9.1.30 审计读取恢复。
- Patch v9.1.31；Android 仅同步元数据至 90131，未构建 APK。无 API、权限模型、数据库或业务数据变化。本地修改，未提交、推送或部署。
- 下一步继续 B8 其他附属读取/写入反馈盘点，并推进 B4/B5 全站验收；G 待明确规则/可信指标及外部/Android 专项仍开放。

## v9.1.30 改造清单 B8：资料详情审计记录读取恢复

- 资料主记录和附属审计记录此前处于同一失败路径，审计接口暂时不可用会把已经成功读取的详情误报为整页失败；现先展示资料详情，审计记录使用独立加载/错误状态。
- 审计读取失败会明确说明详情仍可查看、记录可能不完整，并提供只重试审计 GET 的入口；请求代次与当前资料 ID 校验阻止迟到响应污染新详情。
- `npm run test:resource-hover-contrast-browser` 通过：隔离注入审计 GET 503，确认详情仍显示、审计错误可重试，且重试不重复详情读取、创建或删除。
- Patch v9.1.30；Android 仅同步元数据至 90130，未构建 APK。无 API、权限模型、数据库或业务数据变化。本地修改，未提交、推送或部署。
- 下一步继续 B8 其他附属读取/写入反馈盘点，并推进 B4/B5 全站验收；G 待明确规则/可信指标及外部/Android 专项仍开放。

## v9.1.29 改造清单 B8：选题提报负责人名单失败恢复

- 选题提报页负责人名单读取失败此前只记安全类别日志，没有页面反馈，容易被误认为没有可选负责人或已加载完整；现提供加载/失败说明和只读重试。
- 重试只请求成员目录；表单、现有本机草稿和已保存负责人 ID 均保留。未知姓名不伪造，预览中明确说明无法确认。
- `npm run test:creator-topic-suggestions-browser` 通过：覆盖 1440/390/320px，注入负责人目录 503，确认错误态、只读恢复、无重复提报；提报失败、创作依据权限及原移动布局回归通过。
- Patch v9.1.29；Android 仅同步元数据至 90129，未构建 APK。无 API、权限模型、数据库或业务数据变化。本地修改，未提交、推送或部署。
- 下一步继续 B8 其他页面读取/写入反馈清点，并推进 B4/B5 全站验收；G 待明确规则/可信指标及外部/Android 专项仍开放。

## v9.1.28 改造清单 B8：选题详情负责人名单读取故障隔离

- 选题详情主记录、版本历史和负责人目录原先串行放在同一个失败路径中；成员目录短暂失败会被误报为整个详情读取失败，且可能中断选题编辑草稿初始化。现负责人目录独立读取，主详情和大纲状态不受名单故障影响。
- 名单失败显示负责人信息可能不完整并提供只读重试；已有负责人姓名和选择尽量保留。审核弹窗也显示名单故障状态，重试只重新请求名单，不重复提交审核/选题写入。
- `npm run test:topic-stage-record-repair-browser` 通过：注入 `/api/users` 503，确认详情仍完整呈现、提示可见、名单重试恢复，并且没有选题写入；全套已有首页、审核、状态、离页保护和移动布局用例通过，无意外浏览器错误。
- Patch v9.1.28；Android 仅同步元数据至 90128，未构建 APK。无 API、权限模型、数据库或业务数据变化。本地修改，未提交、推送或部署。
- 下一步继续 B8 其余名单/附属读取及写入反馈盘点，并推进 B4/B5 全站验收；G 的业务规则/可信指标和外部/Android 专项仍开放。

## v9.1.27 改造清单 B8：发布/成片剧本历史读取恢复

- 发布与成片详情初始读取剧本版本历史失败时不再吞掉错误并误显示空历史；以独立加载/失败状态展示说明与只读重试，主记录先完成加载，不受历史请求失败阻断。
- 版本保存成功后的历史 GET 复用同一读取器；如果刷新失败仍保留服务端已确认的保存结果，并提供只重新读取历史的入口，避免重复创建版本。请求代次和记录 ID 校验阻止旧历史回包覆盖当前详情。
- `npm run test:workflow-details-responsive-browser` 通过：覆盖两页初始历史 GET 503→错误提示→只读重试→真实空历史；完整回归覆盖 320/390px、桌面缩放、亮暗主题、版本创建与历史来源跳转。`npm run check`、`npm run build`、`npm run version:check`、版本/更新说明治理、测试入口、Android runtime 契约及 `git diff --check` 通过；构建保留既有 >500 KB 分包提示。相关文件定向 ESLint 0 errors/0 warnings。
- Patch v9.1.27；Android 仅同步元数据至 90127，未构建 APK。无 API、权限、数据库或业务数据变化。本地修改，未提交、推送或部署。
- 下一步继续 B8 其他历史/目录读取与操作反馈盘点，推进 B4/B5 全站验收；G 的业务规则/可信指标及外部/Android 专项仍开放。

## v9.1.26 改造清单 B8：日报归档成员名单读取恢复与账号范围隔离

- 日报总结归档成员目录读取失败时，从静默空选项改为明确提示“筛选选项可能不完整”，提供独立重试；重试只调用成员名单 GET，不重复查询/提交日报。
- 归档子页面按当前账号、归档查看权限与日报归档能力重建，避免账号/权限变化后复用先前的成员筛选状态；请求代次确保迟到响应不能改写新一轮名单。
- `npm run test:daily-report-submit-recovery-browser` 通过，覆盖名单 GET 503→提示→重试、成功选项恢复、日报写入计数不变、归档状态与月/年报详情以及 390px；`npm run check`、定向 ESLint、`npm run build`、`npm run version:check`、`npm run test:version-governance`、`npm run test:changelog-governance`、测试入口检查、Android runtime 契约与 `git diff --check` 通过。构建保留既有 >500 KB 分包提示。
- Patch v9.1.26；Android 仅同步元数据至 90126，未构建 APK。无 API、权限模型、数据库或业务数据变化。本地修改，未提交、推送或部署。
- 下一步继续 B8 其余读取/写入路径与 B4/B5 全站验收；G 中需产品口径或可信数据源的部分，以及外部/Android 专项仍开放。

## v9.1.25 改造清单 B8：复盘负责人目录权限反馈与账号隔离

- 复盘新建和详情共用负责人目录读取；按当前账号与 `user:view` 权限决定是否读取。无查看权限时不发送用户目录请求，仅保留当前用户选项，并明确说明范围。
- 成员目录读取失败时保留当前用户/默认选择，显示数据不完整提示和显式重试；成功重试后更新选项。账号或凭证变化后，旧请求不得覆盖当前账号名单。
- `npm run test:retrospective-list-responsive-browser` 覆盖新建/详情读取失败与重试、受限权限不发请求、账号切换后旧回包隔离；`npm run check`、定向 ESLint、生产构建、版本治理和差异检查通过。无 API、权限规则、数据库或真实业务数据变化。
- Patch v9.1.25；Android 仅同步版本元数据至 90125，未构建 APK。本地修改，未提交、推送或部署。
- 下一步继续 B8 其他页面/写入路径盘点及 B4/B5 全站可见性、主题与响应式验收；G 待定产品规则/可信指标和外部/Android 专项仍开放。

## v9.1.24 改造清单 B8：消息刷新恢复与未知状态纠正

- 桌面消息中心按账号、筛选及页码界定数据范围；同范围刷新失败时保留最近成功列表和汇总，提示内容可能不是最新并支持重试。不同账号/筛选/页码的请求失败不复用旧结果，避免错误归属。
- 工作台选题关注中的未知状态从模糊的“进行中”改为“状态待确认”；隔离浏览器夹具同步当前 dashboard 摘要合同，恢复有效的首页状态验收。
- `npm run test:mobile-work-center-browser` 全套隔离浏览器回归通过，覆盖 1440px 消息 503→保留/重试、查询范围变化失败隔离、未知状态映射和 320/390px 布局；类型检查、定向 ESLint、生产构建、版本检查/治理与差异格式检查通过。
- Patch v9.1.24；Android 仅同步版本元数据至 90124，未构建 APK；无 API、权限、数据库或真实业务数据变化。本地修改，未提交、推送或部署。
- 下一步继续 B8 其他页面与写入路径盘点，并推进 B4/B5 全站可见性、主题及响应式验收；G 待定产品规则与可信指标，以及外部/Android 专项仍开放。

## v9.1.23 改造清单 B8：团队日报刷新结果保护

- 团队日报相同日期和结果状态刷新失败时保留最近一次成功内容，显示错误及“可能不是最新”提示，并可只读重新加载；切换日期或结果状态时隐藏之前查询的日报，不将旧结果冒充新范围内容。
- 请求代次保护确保日期快速切换期间只有最新读取可以更新结果、错误和加载状态；旧日期的迟到回包不会覆盖当前日报列表。
- Playwright MCP/Chrome DevTools MCP 独立复核桌面 1440px 错误/旧内容共存状态与成功后清除提示，页面宽度无溢出。独立 Vite 页未启动 API/Socket 服务，浏览器控制台因此有预期的 `/socket.io` 代理 500；隔离 Playwright 回归使用本地 Socket.IO 夹具，不依赖真实后端。
- 隔离浏览器覆盖无权限不发请求、成功读取、同范围刷新 503 后保留/提示/只读重试恢复、切换日期失败不串数据及再重试成功。类型检查、目标 ESLint 与差异格式检查通过。
- Patch v9.1.23；Android 仅同步版本元数据至 90123，未构建 APK；无 API、权限、数据库或真实业务数据变化。本地修改，未提交、推送或部署。
- 下一步继续 B8 其他页面与写入路径盘点，并推进 B4/B5 全站可见性、主题及响应式验收；G 待定产品规则与可信指标，以及外部/Android 专项仍开放。

## v9.1.22 改造清单 B8：工作台最近变化刷新保留

- 现状核对发现首页最近变化初次读取失败后可重试，但已成功加载后再次读取失败会清除旧结果；同时成功状态没有主动刷新入口。
- 增加“刷新最近变化”操作；刷新期间仍可查看旧内容。失败时保留最近成功结果，明确提示数据可能不是最新，并提供只读重新加载；成功后清除错误并以新结果替换旧内容。
- 浏览器回归覆盖初次读取 503→重试恢复、已有结果手动刷新 503→错误与旧结果共存→再次读取成功；同时保留 390px 独立移动工作台布局回归。最近变化区当前仅挂载于桌面 `Home`，本批未将它扩展到另一套 `MobileHome`。`npm run test:topic-stage-record-repair-browser`、`npm run check`、`npm run build`、版本检查/治理、目标 ESLint（0 errors/0 warnings）及 `git diff --check` 通过。
- Patch v9.1.22；Android 仅同步版本元数据至 90122，未构建 APK；无 API、权限、数据库或真实业务数据变化。本地修改，未提交、推送或部署。
- 下一步继续处理 B8 其他已加载数据的刷新保留和 B4/B5 全站可见状态/布局验收；G 的自审/审核责任和可信播放骤降阈值仍需产品规则，外部/Android 专项依赖相应环境。

## v9.1.21 改造清单 B8：全站侧栏/浏览器后退未保存保护

- 新增应用级 React Router 阻塞入口；选题、创作稿、拍摄/成片、发布剧本及复盘详情交由页面自己的离开处理器，保留聚合保存、协作交接、放弃/继续编辑与复盘确认语义。
- 站内侧栏、面包屑、详情内导航、浏览器后退和退出登录均经过守卫。登出改为跳转到受保护的 `/logout` 路由，确认离开后才注销并执行 Android 会话清理；取消不会提前清掉会话。窄屏网页的选题/创作编辑也纳入保护，刷新/关闭提醒保留。
- `npm run test:topic-stage-record-repair-browser` 通过：覆盖浏览器后退、侧栏跳转、退出登录取消、亮暗主题及 390px 移动选题修改；取消后留在详情并保留输入，且无意外浏览器错误。`npm run check`、`npm run build`、版本治理和差异格式检查通过；定向 ESLint 0 errors，保留既有 warnings。Chrome DevTools MCP 确认新版路由入口能加载登录页。
- Patch v9.1.21；Android 仅同步版本元数据至 90121，未构建 APK；无 API、权限模型、数据库或真实业务数据变化。本地修改，未提交、推送或部署。
- B8 其他实际页面/流程、B4/B5 全站验收、G 待定产品规则/可信指标、外部和 Android 专项仍未完成；本条只关闭本批已验证路径，不代表全清单完成。

## v9.1.20 PR 评审整改：同步 claim 租约、协作重试与续租结果

- 根据 PR #81 自动评审核实并修复四处运行可靠性风险：Creator Agent 单账号同步以数据库时钟记录 claim 租约，30 分钟过期后将 abandoned `running` 行标记为失败再允许接管；Yjs 对 `COORDINATION_UNAVAILABLE` 和 `COORDINATION_CONFLICT` 保留原批次并指数退避；创作建议中的无时区数据库时间按北京时间读取，明确时区 ISO 时间保持绝对时间；分布式任务等待在途续租结束后再判定结果。
- 新增迁移 031 `creator_sync_claim_lease`，采用 `SAFE_EXPAND`，新增 `claimed_at_ms` 并为迁移时已运行的旧行重新赋予一次宽限期；无业务记录删除或回填。
- Creator 单飞并发、Yjs provider ACK、Creator topic suggestion、新增分布式续租竞争用例及既有分布式租约专项回归通过；分布式租约回归连续三次通过。`npm run check`、`npm run build`、全仓 ESLint（0 errors/299 warnings）、`version:check`、版本治理、迁移就绪、安全部署静态门禁、测试入口（213 文件）及 `git diff --check` 通过。PR CI 初次暴露防重放测试夹具未写入迁移 031 新增的活跃 claim 时间；夹具已补齐数据库时钟 claim，Creator Agent 防重放及单飞测试复跑通过。
- Patch v9.1.20；Android 仅同步版本元数据至 90120，未发布 APK。PR #81 已按 squash 合并，精确合并提交 `242008c45486684045f6cdf985e0714dd5ccb4cd` 的 GitHub Actions run 38693849890 六项检查（fast-gate、core-security-contract、Android debug APK、Creator Agent 两个平台包契约、collector-contract）全部通过。2026-10-15 已按该 SHA 部署：数据库备份恢复演练、迁移 001–031 就绪检查、运行环境检查、类型检查和生产构建通过；PM2 `xmt-api` 在线版本 v9.1.20，Caddy 正常，内网/公网健康检查及数据库 quick_check 通过，主页 HTTP 200，未授权选题接口 HTTP 401。未创建版本标签；后续改造只保留本地修改，等待用户另行授权部署。

## v9.1.19 改造清单 B8：详情读取与写后回包归属

- 详情页首屏请求曾无代次/记录 ID 校验，附属历史、审计、日报风险读取也可能在路由切换后晚回并覆盖当前详情；现为选题、成片、发布、资料、复盘的首屏及附属读取加入请求代次与当前 ID 双重校验。创作详情已有同类代次保护，写后复查继续沿用。
- 选题审核/状态/保存、成片状态/剧本版本、发布剧本版本的刷新结果只写回发起操作的当前记录；服务端已确认但用户已切换页面时保留正确成功提示，不把旧记录数据落到新页面。复盘快照、行动项等回执经 `applyDetail` 校验复盘 ID。
- 风险读取竞争测试首次发现手动刷新失败会清空最后成功内容；现只在复盘 ID 切换时清空，手动刷新失败继续展示最近成功结果。
- `test:resource-hover-contrast-browser`（含旧资料延迟回包→切换当前资料→确认旧值未覆盖）、`test:workflow-details-responsive-browser`、`test:topic-stage-record-repair-browser`、`test:retro-action-table-responsive-browser` 通过；类型检查、定向 ESLint（0 errors，保留 11 条既有 warning）及 `git diff --check` 通过。无 API、权限模型、数据库或真实业务数据变化。
- PR CI 曾因完整依赖审计将开发工具告警作为发布阻断项。核对部署入口发现 API 启动命令使用 `tsx`，原先虽列为开发依赖却会留在服务器；现将其归入运行依赖，安全部署在全部构建/运行检查成功后再执行 `npm prune --omit=dev`，CI 阻断审计仅针对生产运行依赖。全量开发依赖审计仍有上游未修复的 `braces` 高危与 PostCSS 解析器中危告警，已记录清单并作为工具链迁移待办。
- Patch v9.1.19；Android 仅同步 90119，未构建 APK。生产发布仍须通过 PR 必需检查、数据库备份/恢复演练及精确提交 SHA 核验。B8 全站侧栏/浏览器后退未保存拦截、B4/B5 全站验收、G 指派/自审与可信指标规则、外部/Android 专项仍开放。

## v9.1.18 改造清单 G/B8：首页摘要与复盘离页成批收尾

- 核对发现手机首页用前 30 条分页记录推算进行中总数，遗漏更早记录与摘要未列入阶段条的已通过选题；手机摘要及共用权限请求未隔离账号归属。服务端原范围保持不变，不改成仅本人统计。
- 现有摘要增加 `active_topics`：全范围准确数量与最多三条最新 `id/title/status`，包含已通过，排除已完成/驳回；同创建时间按 id 倒序稳定预览。手机删去选题分页请求，失败保持未知，范围标记与接口一致。
- 手机读取绑定账号/角色/凭证和请求代次，旧值立即隐藏，迟到读回拒绝覆盖；权限共用 hook 同样隔离并在确认前按无权限显示。浏览器首轮发现加载空数组引用导致命令面板循环，改用稳定常量后复跑通过；运输竞争夹具安装在认证启动后，实际覆盖不可取消旧请求。
- 桌面首页新建入口和空态下一步按实际 `topic:create` 显示，灵感预览为三条。复盘返回列表先确认未保存结论，取消保留文字，写入期间不可返回；刷新/关闭有原生未保存提醒，保存成功解除，放弃不写服务器。
- 首页/API/OpenAPI 合同与首页/选题、复盘行动项完整浏览器回归通过，覆盖 >30 条、已通过、稳定排序、元数据上限、范围隔离、失败重试、390/1440px 账号迟到响应，以及复盘编辑/只读离页保护。
- Patch v9.1.18；Android 仅同步 90118，未构建 APK；仅本地修改，不提交、推送或部署。G 指派/自审规则、可信播放骤降阈值，B8 全站侧栏/浏览器后退拦截与详情其他读取归属、B4/B5 全站验收及外部/Android 专项仍开放，不把本批称为全清单完成。
- 最终类型检查、全仓 ESLint（0 errors、299 warnings）、生产构建、版本一致性、更新说明治理（314 个版本）、测试入口（211 个文件）、Studio 令牌、Android runtime 契约及 `git diff --check` 通过；保留既有大分包提示。Chrome DevTools MCP 独立复核隔离手机首页：47 项、三条最近预览、正确跳转、无横向溢出/框架覆盖层和异常日志；关闭本轮标签并停止夹具服务，不影响用户原标签。

## v9.1.17 改造清单 B8/H：提报、复盘与创作资料的内容保护

- 并行只读核对当前页面与调用链后确认三组真实风险：提报等待仍可改内容/切换草稿；复盘行动项/快照回包无条件覆盖未保存结论，行内旧草稿又可覆盖详情新结果；创作资料尚未读取时可基于空值添加并被迟到 GET 覆盖。
- `AddTopic.tsx`、`MobileAddTopic.tsx`：同步提报锁覆盖相似标题检查和写入，fieldset 保护原生字段/草稿操作，桌面富文本在途只读；失败解锁并保留内容。`safe-draft.ts`、`topicDraft.ts`、`useTopicDraftCollection.ts`：最后一份已提交草稿和遗留键的清理结果逐层传递，清理失败保留可恢复状态并显示已提报提醒。
- `RetrospectiveDetailPage.tsx`：已保存基线与提交快照分别同步，快照/行动项/刷新保留脏结论，保存回执保留在途新输入；发布/归档前要求处理未保存结论。转为只读仍保留文字，并提供带确认的本地“使用已保存结论”恢复，不写服务器。`RetroActionTable.tsx` 清除已保存旧草稿并保留真正未保存编辑；`RetrospectivesPage.tsx` 隔离请求代次、筛选及账号，个人行动项同步隔离旧响应。
- `ProductionResourcesPanel.tsx`：首次读取成功且编辑器句柄就绪后才允许添加，移除空基线回退；插入/引用同步锁定搜索、选择、取消/Escape/关闭，返回后再确认就绪和权限，失败保留原草稿/正文/选择。
- 完整 `test:mobile-work-center-browser`、`test:production-review-browser`、`test:retro-action-table-responsive-browser`、`test:retrospective-list-responsive-browser` 通过。安全草稿/多草稿合同通过；覆盖 320/390/1440px、亮暗主题、双击、延迟/失败、内容保留、跨入口同步与筛选/账号迟到响应。生产审阅资料定向模式也通过；完整套件保留原批注、菜单几何及协作恢复。截图：`/tmp/xmt-topic-submit-locked-mobile-320.png`、`/tmp/xmt-topic-draft-cleanup-failure-desktop.png`、`/tmp/xmt-material-insertion-in-flight-390.png`、`/tmp/xmt-retro-unsaved-conclusion-390.png`。
- 类型检查、各责任文件定向 ESLint、全仓 ESLint（0 errors、299 warnings）、生产构建、版本/更新说明治理、测试入口、Studio 令牌、Android runtime 契约及 `git diff --check` 通过；保留既有 >500KB chunk 提示。Chromium 初次受 sandbox MachPort 限制，后经已有本地测试授权自动审批启动；开发期间热更新使个别测试导航失效，源码定稿后完整重跑通过。
- 无 API、数据库迁移、权限模型或真实业务数据变化；版本 v9.1.17，Android 仅同步元数据至 90117、未构建 APK。保留全部现有修改，不提交、推送或部署。
- Browser skill 当前未列出，采用仓库 Playwright；另通过 Chrome DevTools MCP 在隔离 `production/content/77` 页面完成桌面 1440px → 添加资料 → 搜索 → 选择 → 390px → 取消的独立交互复核，确认三个操作按钮可见、取消后弹窗关闭、无控制台 error/warn 或框架错误遮罩。截图由 MCP 内联返回；本次页面和隔离服务已关闭。
- 下一阶段：G 手机首页精确进行中数量/账号归属，以及桌面创建入口和三条灵感预览；B8 复盘离页未保存确认继续核查。B4/B5 全站审计、稿件审核责任/自审规则、播放骤降可信口径、多实例生产验收与 Android 专项仍未完成，不缩减全清单目标。

## v9.1.16 改造清单 P0/B4/B8：日报权限、导出反馈与批注菜单

- 当前个人日报接口恒返回 `canCreate:true`，而提交接口依据 `report:daily:submit` 拒绝未授权用户；页面与报告中心也通过角色名称旁路展示团队入口。现复用已有权限查询返回正确能力，页面同时确认权限与接口能力；已有日报无提交权限时只读，空记录说明原因，未授权团队直达不发团队请求。管理员沿用原权限通配，个人月报/年报仍遵循既有登录与本人范围，不扩张日报权限规则。
- `ExportPage.tsx` 仅订阅通知动作，日报入口按权限生成；默认周报，无可用日报入口时隐藏日报页签。JSON 卡片准确说明模块范围，不再称完整备份，反馈文件已生成并开始下载；`DataExport.tsx` 的 CSV 使用中文状态/平台，JSON 内容代码和 API 格式不变。
- MiMo 只读复核已完成。批注点击菜单缺少根层挂载，经浏览器先复现失败后修复；`Editor.tsx` 以实际尺寸限制位置，并在外部滚动、视口变化、Escape 时关闭。MiMo 的另一项 FloatingMenu 子菜单建议经调用检索确认当前未挂载，保留为重新启用前事项，未改无用户路径的代码。
- `test:daily-report-permissions`、`test:daily-report-submit-recovery-browser`、`test:analytics-browser`、`test:production-review-browser` 及 `menuBehavior.test.ts` 通过；覆盖未授权管理层、只读已有/空记录、授权团队入口、CSV/JSON 内容、失败重试、320px 菜单边界/关闭和协作恢复。创作浏览器一次重跑出现既有文字几何就绪时序问题，完整复跑通过，未修改产品行为掩盖错误。
- 同批复核月报/年报：原保存请求仍允许编辑内容/年份/月别选择，存在回执覆盖新输入和双击多个写请求的风险。保存期间现统一锁定字段与年月选择，同步锁防重复；失败解锁并保留内容。真实浏览器以 400ms 延迟、双击和一次 503 覆盖锁定、单次写入、失败后重试及内容保留；`test:daily-report-submit-recovery-browser` 通过。
- 修改范围：日报能力服务、日报页面/填写组件、报告中心/导出组件、编辑器菜单和对应既有测试/文档；无新权限、迁移或真实数据写入。版本 v9.1.16，Android 仅同步元数据至 90116，未构建 APK；仅本地修改，不提交、推送或部署。
- 类型检查、定向 ESLint、生产构建、版本治理、更新说明治理、测试入口、Studio 令牌、Android runtime 契约及 `git diff --check` 通过；构建保留既有 >500KB chunk 警告。B4/B5 全站审计、B8 其余操作、G 产品规则/可信指标未完范围与 Android 专项继续开放。

## v9.1.15 改造清单 J4/B4：全局浮层层级与编辑器菜单定位

- 现状核查确认五个层级令牌原已定义，但消费者仍写独立数字；浏览器实测共享弹窗实际为 50，修改 `--xmt-z-modal` 不生效。命令面板也未使用独立命令层。
- Tailwind 新增层级语义类；统一弹窗 CSS 消费 modal 令牌，移除共享弹窗的冲突值。壳层/工具栏 30、页面浮层 80、弹窗 200、通知为弹窗层 +10、命令面板 300、编辑器菜单 400、关闭遮罩为菜单层 -1。当前页面根弹窗、抽屉、通知和编辑器菜单均接入；表格单元与装饰的局部先后顺序保留。
- Bubble/Floating 菜单挂到 `document.body`，使用 fixed、flip/shift 视口约束；祖先滚动以单个动画帧发送无正文变更的菜单定位元数据。定位后重新计算高亮/文字颜色面板的方向和高度，修复迁出卡片后滚动越界。
- 资源浏览器把 modal 令牌改到 250，确认弹窗为 250、通知为 260、命令面板为 300；实际点击输入后 Escape 关闭命令面板、原确认窗口保持。编辑器把菜单令牌改到 450，确认遮罩 449，并回归选区滚动、高亮/文字色子菜单、亮暗主题、窄屏及协作恢复。
- 资源、创作审阅、全局搜索、日报提交/详情、320/390px 移动工作台、三种登录布局/亮暗主题与灵感浏览器回归通过。截图：`/tmp/xmt-layer-command-over-modal.png`、`/tmp/xmt-editor-context-submenu-390.png`。
- 类型检查、定向 ESLint（0 errors，12 条既有 warnings）、生产构建、版本一致性、更新说明治理、测试入口、Studio 令牌门禁、Android runtime 契约和 `git diff --check` 通过；保留已有大分包提示。无 API、权限、数据库或业务数据变化；v9.1.15，Android 仅同步元数据至 90115，未构建 APK。仅本地修改，不提交、推送或部署。
- 此项完成当前共享交互浮层的令牌接入与回归；B4/B5 全站审计、B8 其余操作、G 未完项与 Android 专项继续开放。
- 清单口径复核：A 节仍把成片/发布独立正文历史标为未实现，与 v9.0.0 代码不符。当前 `test:workflow-document-versions`、`test:workflow-script-source`、`test:workflow-details-responsive-browser` 重新验证快照、并发基线、来源/权限、桌面和 320/390px 历史查看；已修正该子项为本地完成。浏览器用例补齐“返回制作列表”真实页面到达等待后才重新进入详情，避免保存响应与路由完成时序相互干扰。仅文档/测试同步，不额外升级版本。

## v9.1.14 改造清单 P0/B8：日报归档状态与重试反馈

- 现状核实发现日报归档把所有非草稿状态显示为“已提交”，另一处列表把已退回和未知值显示为“草稿”；提交失败还同时发出全局失败通知，快速重试成功后会短暂与成功提示并存。
- 新增日报状态共用映射，明确显示“草稿/已提交/已审核/已退回/已归档”；未知或缺失值显示“状态待确认”。修复实际挂载的总结归档，并同步维护另一归档列表和状态徽标，未改变日报状态机。
- 草稿已确认保存但正式提交失败时，仅保留页面内持续重试说明；重试成功后清除说明并显示单一成功通知，避免错误反馈残留。
- 延迟写入实测发现桌面日报正文和刷新在提交期间仍可操作，而成功响应会重置正文。现增加同步提交锁、锁定正文和刷新，失败后解锁并保留草稿；快速双击仅完成一次草稿写入和一次正式提交。
- 资料、创作、选题和日报状态映射仅接受对象自有登记项，`constructor`/`__proto__` 等未知值也返回中性文案；业务语言合同及真实归档渲染通过。
- `npm run test:daily-report-submit-recovery-browser` 覆盖提交失败→同一日报版本安全重试→成功、全局失败提示不重复/不残留，以及六类状态在桌面和 390px 的实际显示与无横向溢出。截图：`/tmp/xmt-daily-report-archive-status-labels.png`、`/tmp/xmt-daily-report-archive-status-labels-390.png`。
- 总结 API 合同原有弹窗静态渲染因共用弹窗使用浏览器 portal 而失败；完整字段断言迁到上述浏览器套件，覆盖月报三段、年报四段、空字段、关闭操作及只读写入次数。API 合同保留权限和数据断言，复跑通过；移动日报状态与业务语言合同通过。
- 类型检查、定向 ESLint、生产构建、版本一致性、更新说明治理、测试入口、Android runtime 契约和 `git diff --check` 通过。无 API、权限、数据库或日报数据变化；版本 v9.1.14，Android 仅同步元数据至 90114，未构建 APK。仅本地修改，不提交、推送或部署。
- P0/B4/B5/B8 其余范围、G 中依赖产品规则/可信数据的范围以及 Android 专项仍未完成。

## v9.1.13 改造清单 P0：资料详情枚举使用业务用语

- Chrome DevTools MCP 对隔离资料详情页快照发现“可见范围 team / 状态 active”直接显示服务端枚举。
- 新增资料详情标签映射：`private/project/team/company` 分别显示“私有/项目关联/团队/企业”；`active/published/deleted` 显示“可用/已发布/已移入回收站”。创作详情审核状态改用“草稿/审核中/已通过/已驳回”；选题列表与批量操作反馈共用七个现有阶段中文标签。未知值统一显示待确认提示，不把新枚举原样暴露给用户。
- `npm run test:resource-hover-contrast-browser` 覆盖资料映射及未知值回退、实际详情呈现、亮暗主题、320/390/1440px，以及删除失败、提示关闭、单次重试和只读刷新恢复。`npm run test:production-review-browser` 覆盖创作状态的已知/未知映射和实际详情文案，并回归协作审阅流程；`npm run test:topics-responsive-browser` 覆盖选题列表状态映射和响应式操作。1440px 隔离截图确认资料详情布局与文本清晰。
- 无 API、权限、数据库或数据变化；版本 v9.1.13，Android 元数据同步至 90113，未构建 APK。仅本地修改，不提交、推送或部署。
- P0/B4/B5/B8 其余范围、G 中依赖产品规则/可信数据的范围以及 Android 专项仍未完成。

## v9.1.12 改造清单 B8/B4：确认弹窗期间的操作提示层级

- 资料详情删除失败时，确认弹窗继续保持打开以供重试，但全局通知此前处于 `.xmt-overlay`（层级 200）下方，提示和关闭按钮会被遮罩挡住。
- 桌面/移动通知容器统一提升到层级 210；桌面容器增加 `role="status"` 与 `aria-live="polite"`，失败、成功提示在弹窗期间仍可见、可关闭并可播报。
- `npm run test:resource-hover-contrast-browser` 实际复现失败提示被弹窗拦截，再验证提示可关闭且显式重试只执行一次并成功；确认资料保留/删除结果与列表/详情只读恢复合同通过。另复跑选题批量反馈、发布反馈、选题响应式、设置、灵感主题、复盘列表/行动项、匿名意见管理浏览器套件，以及 Studio 令牌门禁。
- 无 API、权限、数据库或业务状态规则变化；版本 v9.1.12，Android 元数据同步至 90112，未构建 APK。仅本地修改，不提交、推送或部署。
- 其余 P0/B4/B5/B8、G 中依赖产品规则/可信数据的范围，以及 Android 专项仍未完成。

## v9.1.11 改造清单 P0/B4/B5：登录页移除无效登录入口并补移动验收

- 当前挂载的 style1 登录页曾显示微信、企微和邮箱三个按钮，但没有任何提交处理器；点击无作用，容易被误认为可用登录方式。当前没有对应的登录服务配置，因此先隐藏这些未接通入口，不改变认证能力或权限。
- 将重复的英文系统尾注改为中文业务说明；主登录表单、账号记忆、密码显示及受保护的首次改密流程保持不变。
- `tests/browser/login-theme-contrast.spec.ts` 按前景透明度与真实合成背景计算对比度；扩展三种布局 × 亮暗主题，并逐一验证 320px/390px 下账号、密码、主操作可见且页面无横向溢出。浏览器还确认无效的社交/邮箱按钮不再出现。
- Playwright MCP 与 Chrome DevTools MCP 复核当前登录页可访问性快照及 320px 实际页面；独立 Playwright 夹具测试无异常浏览器错误。类型检查、定向 ESLint、生产构建、版本检查、更新说明治理、测试入口、Studio 令牌门禁、Android runtime 契约和 `git diff --check` 通过。
- 无 API、权限、数据库或真实账号变化；版本 v9.1.11，Android 元数据同步至 90111，未构建 APK。仅本地修改，不提交、推送或部署。
- 下一步继续处理 P0/B4/B5/B8 与 G 的未完成安全范围；改造清单和 Android 专项均未完成。

## v9.1.10 改造清单 G：首页阶段与个人稿件服务端聚合

- 首页原先分别请求灵感、5 组阶段选题列表和 12 条创作稿件，再在浏览器端取总数/预览并筛本人草稿；分页窗口会让较早的本人草稿被其他记录挤出，也增加了请求数。
- `/api/dashboard/home-attention` 现沿用选题列表的全量/本人创建或负责可见范围，一次返回 5 个选题阶段的精确计数及每阶段最多 3 条标题/创建者/负责人/阶段时间预览；个人稿件摘要只返回当前 `operator_id` 下草稿/退回稿，最多 12 条，只含跳转需要的元数据，不包含稿件正文。
- 首页删除 5 次按状态选题请求和分页生产稿件请求，改用服务端摘要；灵感列表保留原独立短列表。读取失败时阶段数量保持未知，展示一条可重试提示；点击重试恢复阶段/任务，不再重复叠加整页错误横幅，也不误报为空清单。
- 首页阶段预览标题和停留时间改用 Studio 次级文字令牌，隔离浏览器实测亮/暗主题均达到 4.5:1 对比度。
- OpenAPI 与前端类型同步；隔离 SQLite/API 覆盖权限范围、准确总数、3 条阶段预览上限、无正文、操作人草稿隔离及“新近他人稿件超过 12 条仍返回本人稿件”；隔离浏览器确认主页不再请求阶段列表/分页稿件、任务和阶段预览可见、亮暗主题阶段摘要对比度、单一错误提示与重试，并覆盖 1440px/390px。
- 同轮闭合成就页一个空配置无效入口：只有存在可检查成就时才显示“检查新成就”。`npm run test:home-dashboard`、`npm run test:api-contract`、`npm run test:topic-stage-record-repair-browser`、`npm run check`、定向 ESLint 与生产构建通过；构建保留既有大分包提示。
- 无数据库迁移、权限规则变化、真实数据读写或 Android 原生行为变化；版本 v9.1.10，Android 元数据同步至 90110，未构建 APK。仅本地修改，不提交、推送或部署。
- 下一步继续核对改造清单 P0/B4/B5/B8 与 G 未完范围；全量改造和 Android 专项均未完成。

## v9.1.9 改造清单 P0/B5：成就页空状态、可访问性与页面元数据

- 当前挂载的 `/achievements` 页面在积分榜为空时仅显示“暂无数据”；排行榜 API 返回启用成员的积分排序，空列表应说明没有可参与排行的成员，而不是暴露无上下文的空值。
- 成就列表为空时，按 `system:achievement` 管理权限分别说明下一步，避免普通成员被引导寻找不可见的管理员按钮；管理员操作文案改为“启用预设成就”，且只有存在可检查的成就时才显示“检查新成就”，不在空配置中暴露无效操作。积分榜改为“当前没有可显示的成员积分排行”及“启用成员后，这里会显示成就积分排行。”，并将空态标记为可读状态。未改变权限规则或成就计算。
- 同页补齐两个筛选器的辅助名称和稳定 `id/name`、标题级别顺序及计分文本对比度（亮/暗主题均至少 4.5:1）；不改变筛选行为。
- Lighthouse 复核还发现根文档错误标为英文且缺产品描述；`index.html` 改为 `zh-CN` 并加入准确描述。该系统需登录，不面向公开搜索；新增 `public/robots.txt` 禁止爬虫收录（此规则不代替认证和服务端授权）。
- `npm run test:achievements-leaderboard-browser` 以普通成员/管理员两种隔离权限态覆盖空态和操作可见性；同时覆盖路由、亮/暗主题、筛选名称及字段标识、文本对比度、标题层级、文档元数据、robots、390px 无横向溢出、无页面错误和零业务写入。截图：`/tmp/xmt-achievements-no-config-member-dark-1440.png`、`/tmp/xmt-achievements-no-config-manager-dark-1440.png`、`/tmp/xmt-achievements-no-config-member-dark-390.png`、`/tmp/xmt-achievements-leaderboard-empty-dark-1440.png`、`/tmp/xmt-achievements-leaderboard-empty-dark-390.png`。Chrome DevTools Lighthouse 无障碍/最佳实践/SEO 均为 100；Agentic Browsing 仍报告缺少 `llms.txt`，内部认证系统不新增公开 AI 索引说明文件。
- 验证：定向 ESLint（0 errors/0 warnings）、`npm run check`、`npm run build`、`npm run version:check`、版本/更新说明治理、测试入口、Studio 令牌门禁和 `git diff --check` 通过；构建保留既有大分包提示。
- 同轮完成 B7 现状复核：灵感转选题成功后写入 `topic_id` 并直达选题，后续可从灵感回链；SQLite/API 合同确认重试复用既有选题、历史已转化记录不猜测关联、事务失败不留孤儿。标题相似度和灵感主题对比回归通过；移动工作台完整套件复跑通过 320px/390px，状态映射、灵感→选题导航与草稿场景均纳入覆盖。测试中的拍摄“已完成”断言现限定在对应任务卡，避开统计卡片同名文本。
- 数据与交付边界：仅前端、静态元数据和回归测试；无 API、权限、数据库或真实成就/成员数据变化。Android 仅同步版本元数据至 90109，未构建 APK；不提交、不推送、不部署。
- 下一步：继续核对 P0/B4/B5/B8 全站剩余范围；当前只关闭成就页这组空态/可访问性及通用文档元数据检查点。

## v9.1.8 改造清单 B5：全局顶栏与移动导航文字对比度

- Chrome Lighthouse 在已挂载的全局顶栏检测到“Ctrl K”快捷键文字只有 3.82:1，对比度低于普通文字 4.5:1 要求。
- 系统设置页审查还发现移动端标题文字对比度为 4.11:1、未选中的底部导航标签为 4.07:1；`src/components/Layout.tsx` 与 `src/components/mobile/MobileShell.tsx` 统一改用 `text-studio-text-secondary`，仍遵循 Studio 令牌。
- `tests/browser/creator-reports-auth-readiness.spec.ts` 覆盖桌面全局快捷键亮/暗主题；`tests/browser/system-settings-default-theme.spec.ts` 覆盖移动端标题和五个导航标签的亮/暗主题，均要求至少 4.5:1。
- `npm run test:creator-reports-browser` 与 `npm run test:system-settings-browser`、Chrome DevTools MCP / Lighthouse 桌面及移动复核通过；移动 390px 无水平溢出。`npm run check`、`npm run build`、`npm run version:check`、版本治理、Android runtime 契约、Studio 令牌门禁和 `git diff --check` 通过；构建保留既有大分包提示。
- 数据库/API/权限：无变化；Android 仅同步元数据至 90108，未构建 APK；仅本地修改，不提交、推送或部署。
- 边界：关闭本轮实测的全局顶栏及移动端壳层对比度问题，不代表 B5 全站审计完成；P0 其他用户文案、B4/B5 其余页面、B8 全量操作反馈、G 未完项及 Android 专项仍开放。

## v9.1.7 改造清单 P0/B8：选题非大纲保存与编辑器就绪保护

- 仅编辑标题、描述等非大纲信息时走页面聚合保存，不再依赖没有挂载的大纲编辑器运行时句柄；编辑大纲时，页面保存和版本留档会在句柄就绪后才可用，等待期间显示明确状态。
- 逻辑合同覆盖 runtime 大纲未就绪/就绪、非大纲编辑以及 legacy 分支；隔离浏览器验证标题单独保存成功，并回归大纲手动保存失败保留输入、显式重试及小版本留档。
- 另核对 Layout 当前实际挂载的 `UpdateNotification` 使用“版本更新”业务文案；旧用例中的“系统更新”选择器与当前 UI 结构不符，不作为真实页面问题或改写产品文案的依据。
- B2 提报草稿复核确认已采用清单允许的本机多草稿+续写列表方案：桌面/移动均可自动保存、手动保存、切换续写及新建/删除，只有显式提交才创建服务端选题。`npx tsx tests/platform/topic-draft-collection.test.ts` 与 `npm run test:mobile-work-center-browser` 通过；明确保留仅当前设备可恢复的边界。
- 验证：`npx tsx src/pages/topicDetailEditorBranch.test.ts`、`npm run test:topic-stage-record-repair-browser` 及定向 ESLint 通过；页面文件保留 6 条既有 ESLint warning。
- 数据库/权限：无 API、权限、数据库或真实数据变化；Android 仅同步元数据至 90107，未构建 APK；仅本地修改，不提交、推送或部署。
- 风险与下一步：仅闭合选题详情的一类保存路径，不代表全站 P0 文案或 B8 写入反馈盘点完成；B4/B5 全站审计、G 未完项和 Android 专项继续开放。

## v9.1.5 改造清单 B10：移动个人页角色名称规范化

- 移动个人页复用统一角色名称映射：`director`/`editor`/`member` 分别展示“管理层”/“通用编辑”/“普通人员”，其余内置角色按数据库规范中文名显示；未知或未分配角色显示明确中文，不泄露原始角色代码，也不误标为普通人员。
- 回归覆盖全部内置角色、未知/缺失角色，并在隔离移动浏览器个人页验证 `member` 显示为“普通人员”；工作台与拍摄/发布移动流程在 320px/390px 继续回归。
- 数据库/权限：无 API、权限、数据库或业务规则变化；Android 仅同步元数据至 90105，未构建 APK；仅本地修改，不提交、推送或部署。
- 风险与下一步：自定义角色只显示通用中文名称，不代表具体权限名称；B10 的移动状态/角色其他路径、P0 全站业务语言、B4/B5 全站审计、B8 全量操作反馈、G 未完项及 Android 专项仍开放。

## v9.1.4 改造清单 B4/B8：发布管理可访问性与写入防重复

- 发布记录删除、抖音数据关联刷新、人工作品关联加入同步单飞锁；关联写入时阻止关闭或切换关联弹窗。失败仍保留可理解的重试路径。
- 发布列表及抖音候选搜索补充可访问名称和稳定控件标识，修复 Chrome DevTools 发现的无名称表单项。
- 隔离浏览器注入延迟 DELETE/POST/PUT 并快速双击，验证只发出一次请求；覆盖搜索名称、删除失败重试及写入确认后列表刷新失败只提供只读恢复。
- 验证：`npm run test:publishing-hover-contrast-browser`、`npm run check`、目标 ESLint、生产构建、`npm run version:check`、版本/更新说明治理、Android runtime 契约、测试入口检查及 `git diff --check` 通过。构建保留既有 >500kB 分包提示。
- 数据库/权限：无 API、权限、数据库或业务规则变化；Android 仅同步元数据至 90104，未构建 APK；未提交、推送或部署。
- 风险与下一步：仅覆盖发布管理页面内的已审查操作，不代表 B8 全站写入/删除操作完成；P0 全站业务语言、B4/B5 全站审计、G 未完项和 Android 专项仍开放。

## v9.1.3 改造清单 P0/B8：编辑离开提示与发布写入去重

- 编辑器保存未确认时，离开提示不再使用“保存协调”等内部术语，改为说明离开后最后一处未确认修改可能无法恢复；重试、继续编辑和放弃离开的逻辑不变。
- 发布记录新增/更新在等待服务端确认时使用同步单飞锁，并禁用提交、取消和字段编辑；失败保留表单，成功后列表读取失败仍只提供只读重试。
- 修改文件：`src/components/editor/EditorLeaveFailureDialog.tsx`、`src/pages/Publishing.tsx`、`src/components/common/FormModal.tsx`、两组隔离浏览器测试及版本说明文件。
- 验证：`npm run test:workflow-details-responsive-browser`、`npm run test:publishing-hover-contrast-browser`、`npm run check`、定向 ESLint 通过。ESLint 保留对话框源文件既有 1 条 Fast Refresh warning。
- 数据库/权限：无 API、权限、数据库或业务数据变化；Android 仅同步版本元数据至 90103，未构建 APK。
- 风险与下一步：本轮只覆盖编辑离开提示和发布记录表单，不代表 P0 用户文案全站清理或 B8 全量写入反馈盘点结束；B4/B5 全站审计、G 未完项和 Android 专项继续开放。仅本地修改，不提交、推送或部署。

## v9.1.2 改造清单 G/B4：任务入口与桌面/移动选题控件可访问性

- 首页任务区原“查看全部任务”实际只进入 `/topics`，无法查看消息、稿件审核、发布和同步任务；现将入口准确改为“进入选题管理”。
- 桌面选题列表/看板筛选及移动搜索补充稳定 `id/name` 和 ARIA 名称；全局用户菜单辅助技术名称纳入可见账号与角色；动画标题保留静态读屏文本并隐藏装饰副本。
- 隔离浏览器回归验证按钮打开 `/topics`；该文案调整不改变首页任务筛选、数据范围、权限或任何写入行为。
- `npm run test:topic-stage-record-repair-browser`、`npm run test:topics-responsive-browser`、`npm run test:mobile-work-center-browser`、`npm run check`、定向 ESLint、生产构建、版本检查/治理、更新说明治理、Android runtime 契约与 `git diff --check` 均通过。Playwright MCP 1200×839 与 Chrome DevTools MCP 复核首页入口跳转 `/topics`；选题列表/看板可访问性与最佳实践 Lighthouse 快照均为 100。桌面及 390px 移动筛选控件可按名称和稳定标识定位；页面无错误，保留一条既有 React Bits 安全映射警告。ESLint 在 SplitText 文件保留 4 条既有 warning，生产构建保留 >500kB 分包提示。Android 仅同步版本元数据至 90102，未构建 APK；仅本地修改，不提交、推送或部署。
- G 的可信播放骤降口径、专属稿件审核责任规则及完整跨模块团队任务清单仍开放；B4/B5 全站审计、B8 全量写入反馈盘点、Android 专项和其他改造项继续。

## v9.1.1 改造清单 G：首页可选运营数据

- 完成内容：桌面首页“最近变化”在已有 `creator:data:view` 权限且数据可用时显示近 7 天播放变化与最近一次观测的粉丝总数；明确说明播放统计窗口、粉丝是总量而非新增及同步时间。无权限、无已同步账号或指标缺失时不显示虚假数字；读取失败独立提示并支持只读重试。
- 修改文件：`src/pages/Home.tsx`、`tests/browser/topic-stage-record-repair.spec.ts`、版本与升级说明文件。
- 数据库/权限：无数据库迁移；复用既有 Creator Center 接口和 `creator:data:view` 权限，不改变账号范围或授权规则。独立移动工作台保持原样。
- 测试结果：`npm run test:topic-stage-record-repair-browser`、`npm run check`、定向 ESLint 通过；隔离浏览器覆盖有权展示、无权限不请求、无数据不展示、503 后明确的一次只读重试，以及 390px 独立移动首页兼容。
- 风险与下一步：不提供播放骤降阈值或告警，也不把当前粉丝总量解释为周期增长；G 的阈值、审核责任模型和完整跨模块团队概览仍开放。未部署、提交或推送；Android 仅同步版本元数据至 90101，未构建 APK。

## v9.1.0 改造清单 G：首页最近变化可信摘要

- 首页“最近变化”由新增只读 `/api/dashboard/home-activity` 汇总显式稿件版本、批注/回复和选题状态历史，返回最多 12 条有界摘要。
- 版本/评论/选题事件沿用现有内容可见范围；只返回 allowlist 元数据，不返回稿件、批注、回复和历史备注正文。普通更新时间、当前状态和发布记录不再被包装成最近事件；不再为此额外请求发布列表。
- 最近变化 API 错误单独提示并可只读重试，保持今日任务、关注事项和阶段内容可用。
- 验证：`npm run test:home-dashboard`、`npm run test:api-contract`、`npm run test:topic-stage-record-repair-browser`、`npm run check`、目标 ESLint 通过；无数据库迁移或权限规则变化。Android 仅同步元数据至 90100，未构建 APK；未部署、提交或推送。
- G 中播放骤降可信阈值、专属稿件审核责任/权限模型和跨模块团队概览仍未完成；B4/B5 全站审计、B8 全量操作盘点、Android 专项及其余清单项目继续开放。

## v9.0.7 改造清单 B9：内容复盘导航与页面权限统一

- 复盘导航入口改为使用目标路由的 `analytics:retro:view`；此前菜单只要求 `analytics:view`，导致部分账号能看到入口却无法进入页面。
- 新增前端挂载合同断言覆盖入口和路由使用同一查看权限；没有改变服务端授权策略、API 或数据库。
- Android 仅同步工程元数据至 90007，未构建 APK；没有部署、提交或推送。

## v9.0.6 改造清单 G：首页复盘阶段显示真实数据

- 首页复盘阶段显示可见复盘的精确总数及最多三条真实报告摘要，不再使用已发布记录数和占位文案。
- 服务端共用复盘列表可见范围，只返回标题、周期、状态、更新时间；读取失败时单独标为不可用，不阻断工作台其他模块。
- 验证：`npm run test:home-dashboard`、`npm run test:api-contract`、`npm run test:topic-stage-record-repair-browser`、`npm run test:mobile-work-center-browser`、`npm run check`、生产构建、版本/更新说明治理和 Android runtime 契约通过；桌面浏览器覆盖真实卡片、跳转及摘要失败隔离，移动工作台 320px/390px 回归验证接口兼容和无溢出。
- 无数据库迁移、权限规则变化或真实业务写入；Android 仅同步元数据至 90006，未构建 APK；未部署，仅本地修改。
- G 中播放骤降的可信阈值/指标口径、专属稿件审核责任/权限模型、完整跨模块团队概览仍开放；B4/B5 全站审计、B8 全量操作盘点、Android 专项及其余改造继续。

## v9.0.5 改造清单 B6：发布归档来源创作版本可追溯

- 发布归档详情可回到来源选题，并呈现归档时保存的成片/发布剧本来源关系；具备对应查看权限时可直达精确创作历史版本，并展开只读查看该版本的归档正文快照。
- 来源版本不可用、阶段稿来源未记录或旧归档没有来源字段时明确说明；不从当前稿件推断。只有具备 `production:view` 才提供原稿链接；没有该权限仍可查看归档中已有的来源快照。历史快照由既有归档 API 返回，本轮不新增接口、权限或数据库迁移。
- 验证：`npm run test:published-archives-browser` 覆盖来源版本精确链接、归档快照、不可用来源、旧归档不推断、无原稿查看权限及 320px/390px 无溢出；`npm run test:workflow-script-source`、`npm run check` 通过。Android 仅同步元数据至 90005，未构建 APK；未部署。
- 下一步：B6 其余稿件来源闭环仍需核对；B4/B5 全站响应式/主题审计、B8 全量操作盘点、G 首页未完成项及 Android 专项仍开放。

## v9.0.4 改造清单 B6：创作初稿来源大纲版本直达

- `ProductionOriginPanel` 对存在唯一明确版本的大纲来源提供回链至 `/topics/:id?outlineVersion=...`；桌面选题详情自动展开并滚动到该准确历史卡，移动网页渲染相同历史版本的只读快照。
- 缺少来源版本、版本读取失败或历史行无法定位时明确说明，不用当前大纲替代；来源查看期间隐藏选题编辑、审核及推进操作。读取失败支持显式重试。
- 验证：`npm run test:workflow-details-responsive-browser` 覆盖创作来源→选题准确版本跳转、1440px 桌面和 320px/390px 移动正文、缺失版本、只读动作与无横向/控制台错误；`npm run check` 通过，目标 ESLint 无错误（保留 TopicDetail 原有 6 条告警）。无数据库迁移、权限规则变化或真实业务写入。Android 仅同步元数据至 90004，未构建 APK；未部署。
- 下一步：B6 其他跨模块历史关系仍需核查；B4/B5 全站响应式/主题审计、B8 全量操作盘点、G 未完项及 Android 专项仍开放。

## v9.0.3 改造清单 B6：保护历史剧本所引用的创作来源

- 创作版本清理现在综合检查创作当前来源和成片/发布文稿的逐版本历史来源；只有仍被任何历史卡引用的创作历史版本才跳过清理。
- 删除创作记录也检查工作流文稿历史来源引用；仅被历史版本引用时仍拒绝删除，避免留下失效的来源跳转。
- 验证：`npm run test:workflow-script-source` 覆盖历史卡来源字段 API 回读、来源历史版本被保留、精确历史仍可读取及仅由历史卡引用时拒绝删除；`npm run check` 通过。无数据库迁移、权限变化或真实业务写入；未部署。Android 仅同步元数据至 90003，未构建 APK。
- 下一步：B6 其他跨模块历史关系仍需核查；B4/B5 全站响应式/主题审计、B8 全量操作盘点、G 未完项及 Android 专项仍开放。

## v9.0.2 改造清单 B6：成片/发布历史版本来源直达

- 成片和发布剧本历史版本卡按该历史行存储的 `source_production_id + source_production_version` 展示来源，并打开对应的创作当前稿或准确历史版本。
- 来源缺少 ID 或版本号时显示“该版本的创作来源未记录”；不从当前阶段稿关系补猜旧历史。成片跳转经过编辑器离开保护；发布在编辑或保存期间禁用来源跳转。
- 隔离浏览器验证显式版本请求包含来源关系、桌面/移动历史卡显示、来源跳转、基线未记录及窄屏可达。无数据库迁移或权限变化；未部署。Android 仅同步元数据至 90002，未构建 APK。
- B6 其他跨模块历史流转、B4/B5 全站审计、B8 全量操作盘点、G 未完项及 Android 专项仍开放。

## v9.0.1 改造清单 B6：创作初稿来源大纲版本溯源

- migration 030 SAFE_EXPAND 为 `production_origin_snapshots` 新增可空 `source_outline_version`；不回填旧快照。
- 新建初稿仅在快照正文与唯一一条非基线显式大纲版本完全一致时记录版本号；基线、无记录或重复正文版本保持 NULL，不猜测。
- 创作 API 返回来源版本，桌面及移动来源卡显示确切版本；缺少唯一对应关系时保留来源正文并说明未推断。
- 验证：隔离迁移幂等/旧行 NULL、API 精确唯一匹配/基线排除/歧义拒绝、桌面和移动浏览器回归；生产迁移、部署、提交和推送均未执行。Android 仅同步元数据至 90001，未构建 APK。
- B6 其他跨模块历史流转、B4/B5 全站审计、B8 全量操作盘点、G 未完项及 Android 专项仍开放。

## v9.0.0 改造清单 B6：选题/拍摄/发布文稿独立版本历史

- `api/database/migrations/029_workflow_document_versions.ts`：SAFE_EXPAND 新增版本快照表；无旧数据回填，不修改 canonical 文稿。
- `api/services/workflowDocumentVersions.ts`、`api/routes/workflow.ts`、选题模块路由：显式小/大版本写入、准确正文冲突校验、来源创作版本追溯和删除事务清理。
- `src/pages/TopicDetail.tsx`、`src/pages/ShootingDetail.tsx`、`src/pages/PublishingDetail.tsx`：增加历史列表与可展开的安全只读正文预览；普通保存不生成版本。
- 验证：版本迁移/递增/并发过期拒绝/删除清理、选题 API、剧本来源和浏览器响应式回归通过；Playwright 与 Chrome DevTools MCP 在隔离环境验证显式版本保存和历史内容展开，控制台无错误或警告。生产构建保留既有大分包提示。
- 数据边界：历史基线无法证明的时间与操作人保持 NULL；不执行生产迁移。Android 仅同步版本元数据至 90000，未构建 APK。仅本地修改，不提交、推送或部署。
- 归档一致性：继续核验已发布记录的最新归档是可更新快照而非不可变版本历史；新增回归覆盖显式发布小版本写入后归档同步成功、线上正文与归档一致且漂移标记清除。逐版本历史仍从独立文稿历史读取。
- 下一步：继续按改造清单处理 B6 其他跨模块历史流转与 B8 全量操作盘点；B4/B5 全站响应式/主题验收、G 首页未完成项及 Android 专项仍开放。

## v8.5.23 改造清单 B4/B5：桌面选题流程阶段标签可读性

- `src/components/studio/StageProgress.tsx`：统一流程节点为不换行的横向排列，保留 Studio 令牌与现有共享组件样式。
- `tests/browser/topics-list-responsive.spec.ts`：在 1366px/1440px/1920px、80%–125% 缩放矩阵中断言六个阶段标签均单行显示；Playwright MCP 1440px 画面复核确认页面宽度和操作列正常。
- 隔离浏览器覆盖，不连接真实业务账号或执行写入。无 API、权限、数据库变化；Android 仅同步元数据至 80523，未构建 APK；仅本地修改，不提交、推送或部署。选题表格桌面流程标签这一检查点完成，B4/B5 全站审计及其他清单项仍开放。

## v8.5.22 改造清单 B4/B5/B10：移动选题详情操作可见与日期本地化

- `src/pages/mobile/MobileTopicDetail.tsx`：固定操作栏避开底部主导航；更新时间与截止日期统一按北京时间显示，更新时间只显示日期以适应窄栏。
- `src/pages/mobile/MobileTopics.tsx`：选题卡片截止日期改用统一北京时间格式，消除原始 ISO 时间戳。
- `tests/browser/mobile-work-center-responsive.spec.ts`：隔离浏览器覆盖 320px/390px 列表→详情、日期显示、底部按钮与固定导航边界及无横向溢出；完整移动工作台、拍摄与发布回归通过。
- 验证：`npm run test:mobile-work-center-browser`、`npm run check`、目标文件 ESLint、`npm run build`、版本检查、更新说明治理、测试入口、Studio 令牌门禁、Android runtime 契约及 `git diff --check` 通过；构建保留既有 >500kB 分包提示。Playwright MCP/Chrome DevTools MCP 的前序审查曾在隔离页面发现按钮重叠和 ISO 时间，本次自动化截图复核修复后的 320px/390px 实际页面。
- 无 API、权限、数据库或真实业务数据变化；Android 仅同步元数据至 80522，未构建 APK；仅本地修改，不提交、推送或部署。此移动选题路径局部完成；B4/B5 全站审计、B8 全量操作盘点及其他清单项仍开放。

## v8.5.21 改造清单 B8：移动创作写入期间编辑保护

- `src/pages/mobile/MobileProductionEditor.tsx`：草稿保存/审核提交在途期间暂时锁定正文和选题，防止用户继续编辑的内容被旧请求覆盖或随成功回调清除；两类写入入口仍共用同步互斥。
- `tests/browser/mobile-work-center-responsive.spec.ts`：延迟并注入保存失败，确认正文变只读、提交审核被禁用；失败后正文仍在且显式重试成功。完整移动工作台与拍摄/发布 320/390px 回归通过。
- 验证：`npm run test:mobile-work-center-browser`、`npm run check`、目标文件 ESLint（0 errors/0 warnings）、`npm run build`、`npm run version:check`、更新说明治理（285 个版本）、测试入口（209 个）、Studio 令牌门禁（37 类）、Android runtime 契约和 `git diff --check` 全部通过；构建保留既有 >500kB 分包提示。
- 无 API、权限、数据库或真实数据变化。Android 仅同步版本元数据至 80521，未构建 APK；仅本地修改，不提交、推送或部署。
- 后续：移动创作写入等待反馈局部完成；B8 全量操作盘点、B4/B5 全站主题/响应式审计、B6/G 与剩余清单项继续开放。

## v8.5.20 改造清单 B8/B10：移动创作新建与写入恢复

- `src/pages/mobile/MobileProductionEditor.tsx`：新建稿件按当前权限加载可关联选题；读取失败提供明确错误与只读重试。路由访问授权不再依赖编辑器数据加载完成，避免新建页误报 403。保存/提交添加同步单飞锁，避免 React 忙碌态渲染前的重复请求。
- `tests/browser/mobile-work-center-responsive.spec.ts`：390px 隔离页面验证选题列表 503→显式只读重试；延迟稿件创建期间双击只发送一次 POST，503 后编辑正文保留，明确重试后按相同内容创建成功。原有 320/390px 工作中心、日报、选题、拍摄与发布回归通过。
- 验证：`npm run test:mobile-work-center-browser`、`npm run check`、目标文件 ESLint、`npm run build`、`npm run version:check`、更新说明治理（284 个版本）、测试入口（209 个）、Studio 令牌门禁（37 类）、Android runtime 契约和 `git diff --check` 全部通过；构建保留既有 >500kB 分包提示。Playwright MCP 与 Chrome DevTools MCP 在 390px 隔离页面确认选题可选、正文可编辑并能进入稿件页；接口为本地 mock，实时同步离线提示符合未启动 Socket.IO 服务的测试环境，不代表真实账号/API 验收。
- 无 API、权限规则、数据库或真实业务数据变化。Android 仅同步版本元数据至 80520，未构建 APK；仅本地修改，不提交、推送或部署。
- 后续：移动创作新建及单一写入路径局部完成；B8 全量操作盘点、B4/B5 全站主题/响应式审计及其他 B6/G 项仍开放。

## v8.5.19 改造清单 B8：移动日报重复写入保护

- `src/pages/mobile/MobileDaily.tsx`：`saving` React 状态更新前增加同步单飞锁，防止快速双击或并发触发产生多个草稿保存/提交流程；身份切换边界沿用 v8.5.18 保护。
- `tests/browser/mobile-work-center-responsive.spec.ts`：延迟日报草稿 POST，在 320px/390px 场景对“提交日报”双击，断言每次只有一次草稿写入，原提交失败后显式重试仍沿用新版本并成功。
- 验证：`npm run test:mobile-work-center-browser`、`npm run check`、`npm run build`、定向 ESLint（0 errors/0 warnings）、`npm run version:check`、更新说明唯一性（283 个版本）、测试入口（209 个）、Studio 令牌门禁（37 类）、Android runtime 契约与 `git diff --check` 通过；构建保留既有 >500kB 分包提示。
- 无 API、权限、数据库或真实业务数据变化。Android 仅同步元数据至 80519，未构建 APK；仅本地修改，不提交、推送或部署。
- 后续：移动日报重复提交路径局部完成；B8 全量操作盘点、B4/B5 全站审计及其他 B6/G 项仍开放。

## v8.5.18 改造清单 B8：移动个人日报账号切换隔离

- `src/pages/mobile/MobileDaily.tsx`：以账号 ID 为日报视图生命周期边界；账号变化时卸载旧状态，清理未完成读取序号并忽略迟到结果。保存请求成功返回后若身份已变化，不继续执行提交，避免第二步使用新认证身份处理旧账号的日报。
- `tests/browser/mobile-work-center-responsive.spec.ts`：隔离 390px 浏览器挂起账号 A 的日报读取，切换到账号 B 并加载其专属日报，再释放 A 的迟到响应；确认 B 内容仍在、A 内容不可见且只发两次 GET。
- 验证：`npm run test:mobile-work-center-browser`、`npm run check`、`npm run build`、定向 ESLint（0 errors/0 warnings）、`npm run version:check`、更新说明唯一性（282 个版本）、测试入口（209 个）、Studio 令牌门禁（37 类）、Android runtime 契约与 `git diff --check` 通过；构建保留既有 >500kB 分包提示。
- 无 API、权限、数据库或真实业务数据变化。Android 仅同步元数据至 80518，未构建 APK；仅本地修改，不提交、推送或部署。
- 后续：移动个人日报读取身份切换路径局部完成；B8 全量操作盘点、B4/B5 全站审计及其他 B6/G 项仍开放。

## v8.5.17 改造清单 B8：移动选题列表读取失败恢复

- `src/pages/mobile/MobileTopics.tsx`：接入选题查询错误状态；没有成功数据时不渲染空列表/空看板，错误时显示明确提示并使数量标为暂不可用；保留旧数据时标明可能过期。刷新按钮在查询期间禁用并改为清晰的重试文案。
- `tests/browser/mobile-work-center-responsive.spec.ts`：隔离浏览器注入 React Query 一次自动重试中的连续两次 503，确认不误报没有符合条件的选题；点击明确重试后只读恢复并显示准确选题。
- 验证：`npm run test:mobile-work-center-browser`、`npm run check`、`npm run build`、定向 ESLint（0 errors/0 warnings）、`npm run version:check`、更新说明唯一性（281 个版本）、测试入口（209 个）、Studio 令牌门禁（37 类）及 `git diff --check` 通过；构建保留既有 >500kB 分包提示。
- 无 API、权限、数据库或业务数据变化。Android 仅同步元数据至 80517，未构建 APK；仅本地修改，不提交、推送或部署。
- 后续：移动选题列表该读取路径局部完成；B8 全量操作盘点、B4/B5 全站审计及其他 B6/G 项仍开放。

## v8.5.16 改造清单 B8：移动创作列表刷新状态和账号隔离

- `src/pages/mobile/MobileProduction.tsx`：刷新失败时明确说明仍显示上次成功读取列表，并提供“重新加载创作列表”；重试成功清除错误/过期提示。账号 ID 变化时清空旧列表，组件卸载或身份改变后忽略未完成请求。
- `tests/browser/mobile-work-center-responsive.spec.ts`：隔离浏览器覆盖读取成功→刷新 503→保留旧列表并明确标记→显式只读重试加载新结果；保留 320/390px 工作台、拍摄和发布详情回归。
- 验证：`npm run test:mobile-work-center-browser`、`npm run check`、`npm run build`、`npm run version:check`、更新说明唯一性（280 个版本）、测试入口（209 个）、Studio 令牌门禁（37 类）、定向 ESLint（0 errors/0 warnings）和 `git diff --check` 全部通过；构建保留 >500kB 分包提示。
- 无 API、权限、数据库或业务数据变化。Android 仅同步元数据至 80516，未构建 APK；仅本地修改，不提交、推送或部署。
- 后续：移动创作列表该刷新路径局部完成；B8 全量操作盘点、B4/B5 全站审计及其他 B6/G 项仍开放。

## v8.5.15 改造清单 B8：移动端选题资料读取失败恢复

- `src/pages/mobile/MobileTopicDetail.tsx`：将资料读取从权限初始化相关的选题加载流程中拆开，按选题 ID 独立加载并丢弃过期响应；失败不再误报“暂无关联资料”，改为明确错误提示与只读重试入口。
- `tests/browser/mobile-work-center-responsive.spec.ts`：隔离浏览器覆盖资料接口 503、失败态不显示空结果、显式 GET 重试恢复，以及 320/390px 移动工作台回归。
- 验证：`npm run test:mobile-work-center-browser` 在 320px/390px 移动工作台、拍摄/发布路径均通过；Playwright MCP 与 Chrome DevTools MCP 在 390×844 隔离页面分别确认首个资料 GET 503 后不误显示空列表，显式第二次 GET 恢复且无页面运行时异常。隔离 Vite 未启动 API 服务，Socket.IO 轮询产生预期 500，不计作页面代码异常。
- `npm run check`、`npm run build`、`npm run version:check`、更新说明唯一性（279 个版本）、测试入口（209 个）、Studio 令牌（37 类）及 `git diff --check` 通过；`MobileTopicDetail.tsx` 定向 ESLint 0 errors/0 warnings，构建保留 >500kB 分包提示。
- 无 API、权限、数据库或真实业务数据变化。Android 仅同步元数据至 80515，未构建 APK；仅本地修改，不提交、推送或部署。
- 后续：移动端该读取路径局部完成；B8 全量操作盘点、B4/B5 全站审计及其他 B6/G 项仍开放。

## v8.5.14 改造清单 B8：选题详情保存失败保留草稿并允许重试

- `src/pages/TopicDetail.tsx`：运行时手动保存失败时以页面内 `role="alert"` 持续说明保存未完成且草稿保留；服务端更新失败会释放保存中状态，避免按钮永久禁用。再次保存开始后清除旧错误。
- `tests/browser/topic-stage-record-repair.spec.ts`：隔离 API 注入一次 503，确认失败时服务端正文未变、编辑草稿仍可见、失败仅写入一次；再次明确点击后成功且总写入两次。
- 验证：`npm run test:topic-stage-record-repair-browser` 注入更新 503，确认失败后服务端记录不变、草稿保留且失败仅写入一次；再次点击后保存成功且总写入两次。`npm run check`、`npm run build`、`npm run version:check`、更新说明唯一性（278 个版本）、测试入口（209 个文件）、Studio 令牌门禁（37 类）和 `git diff --check` 通过。Playwright MCP 与 Chrome DevTools MCP 在 1440×960 隔离页面复核错误反馈、按钮恢复及重试；无页面运行时错误。定向 ESLint 0 errors、6 warnings；生产构建保留 >500kB 分包警告。
- 无 API、权限、数据库或真实业务数据变化。Android 仅同步元数据至 80514，未构建 APK；仅本地修改，不提交、推送或部署。
- 后续：此保存路径局部完成；B8 全量操作盘点、B4/B5 全站审计及其他 B6/G 项仍开放。

## v8.5.13 改造清单 B4：编辑器工具栏浮层滚动收起

- `src/components/editor/Toolbar.tsx`：标题、文字颜色、高亮、导出和“更多操作”等下拉浮层的触发锚点完全滚出可视区后自动关闭；浮层内容自身滚动、锚点仍在视口内时不关闭。
- `tests/browser/production-review.spec.ts`：新增 1200×839 隔离回归，打开“更多操作”后滚动页面内容，确认菜单收起；完整编辑器审阅、协作恢复、移动布局、批注和资料重试流程均通过。
- 验证：`npm run test:production-review-browser`、定向 ESLint、类型检查、生产构建、版本/更新说明治理、测试入口、Studio 令牌门禁及 `git diff --check` 均通过。Playwright MCP 与 Chrome DevTools MCP 独立复测 1200×839 页面滚动后菜单关闭，控制台无错误/警告；构建保留 >500kB 分包提示。
- 无 API、权限、数据库或业务数据变化。Android 仅同步元数据至 80513，未构建 APK；仅本地修改，不提交、推送或部署。
- 后续：本项本地完成；B4 全站剩余响应式/核心操作、B5 主题审计及其他 B6/B8 项仍开放。

## v8.5.12 改造清单 B4/B5：编辑器批注对话框可达性

- `src/components/editor/Editor.tsx`：新增/编辑批注迁移到 Studio `BaseModal`，为文本输入提供关联名称，Esc 可从任意焦点取消；遮罩点击不误丢正在输入的内容。
- `src/components/common/BaseModal.tsx`：对话框挂载到 `document.body` 页面根层，避免被编辑器动画/滚动容器裁切或偏移。
- `tests/browser/production-review.spec.ts`：隔离浏览器覆盖 320×568 浅色视口、对话框语义与可见边界、深色主题标题对比度、Escape 取消不写入以及批注新增/编辑；恢复内存测试夹具后继续完整审阅、协作恢复和资料重试流程。移动浏览器继续前等待服务端确认正文更新，避免夹具保存时序导致定位超时。
- 验证：`npm run test:production-review-browser`、相邻通用弹窗回归 `npm run test:production-list-feedback-browser`、定向 ESLint、`npm run check`、`npm run build`、版本/更新说明治理、测试入口与 Studio 令牌门禁、`git diff --check` 均通过；生产构建保留 >500kB 分包提示。
- 无 API、权限、数据库或真实业务数据变化。Android 仅同步元数据至 80512，未构建 APK；仅本地修改，不提交、推送或部署。
- 后续：本项本地完成；B4 全站剩余响应式/核心操作、B5 主题审计及其他 B6/B8 项仍开放。

## v8.5.11 改造清单第 9 项：登录安全准备说明

- `src/pages/AuthRolloutStatus.tsx`：将监控、实时协作及风险状态改写为业务人员可理解的下一步准备事项；原始风险原因和配置来源留在默认折叠的管理员技术明细中；加载失败统一显示安全且可重试的提示。
- `tests/browser/creator-reports-auth-readiness.spec.ts`：隔离夹具覆盖监控未确认、协作未审批、风险说明映射及展开后原始排查信息；保存桌面常态/风险明细截图 `/tmp/xmt-auth-rollout-copy/auth-readiness-desktop.png`、`/tmp/xmt-auth-rollout-copy/auth-readiness-risk-admin-details.png`。Playwright MCP 在 390px 检查无横向溢出；Chrome DevTools MCP 在 1440px 检查管理员明细默认折叠/展开及页面可访问内容。
- 验证：`npm run test:creator-reports-browser`、定向 ESLint、`npm run check`、`npm run build`、`npm run version:check`、版本/更新说明/测试入口/Studio 令牌门禁与 `git diff --check` 通过；全量 ESLint 0 errors、303 warnings；构建保留已有 >500kB 分包警告。无 API、权限或数据库变化；浏览器使用隔离账号夹具，没有访问真实账号或写入业务数据。
- Android 仅同步版本元数据至 80511，未构建 APK。仅本地修改，不提交、推送或部署。
- 后续：第 9 项经当前页面与权限链复核已本地完成；B4 全站剩余响应式/核心操作、B5 主题审计及其他 B6/B8 改造仍开放。

## v8.5.9 改造清单 B4：发布管理窄屏固定操作列

- `src/pages/Publishing.tsx`：发布管理横向表格的右侧操作单元固定在滚动视口，包括抖音关联、编辑、链接和删除；四个控件的辅助名称包含发布内容标题。
- `tests/browser/publishing-hover-contrast.spec.ts`：新增 320px 窄屏亮/暗主题契约，确认表格仍可横向滚动、操作单元 `position: sticky`、Studio 表面令牌准确、删除按钮边界完整位于视口且标题保留至少 110px 可见宽度；并保留已有创建/删除/关联反馈回归。截图：`/tmp/xmt-publishing-list-actions-light-320.png`、`/tmp/xmt-publishing-list-actions-dark-320.png`。
- Playwright MCP 与 Chrome DevTools MCP 320×844 隔离页面均确认发布列表身份、横向滚动、sticky 列和操作辅助名称；滚至记录行后，删除按钮范围为 x=259–291、可见标题宽度 118px。编辑入口可打开现有编辑弹窗；为避免写入仅用关闭按钮退出，未更改发布数据。Chrome 控制台无错误或警告。
- 验证：`npm run test:publishing-hover-contrast-browser`、定向 ESLint、`npm run check`、生产构建、版本/更新说明/测试入口/Studio 令牌门禁与 `git diff --check` 通过；构建保留已有 >500kB 分包警告。
- 无 API、权限、数据库或 Android 原生行为变化。Android 仅同步版本元数据至 80509，未构建 APK；仅本地修改，不提交、推送或部署。
- 后续：B4 全站剩余响应式/核心操作、B5 全站主题审计，以及 B6/B8 其他条目仍未完成。

## v8.5.8 改造清单 B4：创作列表窄屏固定操作列

- `src/pages/Production.tsx`：将创作记录表格迁入 `ResponsiveTableShell`；表格保留横向滚动，查看/编辑列 sticky 固定在右侧。误标为“操作”的负责人字段改为“负责人”，行操作按钮补充含选题标题的辅助名称。
- `tests/browser/production-list-feedback.spec.ts`：在 320px 验证表格仍需且允许横向滚动、行操作单元为 sticky、编辑按钮完整落在视口内；截图：`/tmp/xmt-production-list-actions-light-320.png`。编辑/创建反馈原有浏览器回归继续通过。
- Playwright MCP 与 Chrome DevTools MCP 在 320×568 桌面式窄视口交叉确认创作列表已渲染（以桌面宽度初始化后再收窄，避免测试路由进入移动工作中心）、sticky 操作列和可访问按钮名称；实际测得操作按钮范围 x=243.5–281.5，随后打开编辑弹窗并按 Escape 关闭。Chrome DevTools MCP 未发现错误或警告。
- 验证：`npm run test:production-list-feedback-browser`、定向 ESLint 与 `npm run check` 通过；随后连同版本更新运行生产构建、版本/更新说明/测试入口/Studio 令牌门禁及 `git diff --check`。构建保留已有 >500kB 分包警告。
- 无 API、权限、数据库或 Android 原生行为变化。Android 仅同步版本元数据至 80508，未构建 APK；仅本地修改，不提交、推送或部署。
- 后续：B4 全站剩余响应式/核心操作、B5 全站主题审计，以及 B6/B8 其他条目仍未完成。

## v8.5.7 改造清单 B4/B5：创作弹窗响应式与对话框闭环

- `src/components/common/BaseModal.tsx`：统一 Studio 对话框补充 `role="dialog"`、`aria-modal` 和标题关联；新增可配置的 Escape 关闭，并限制内容高度以便窄视口内部滚动。
- `src/pages/Production.tsx`：创作管理的新建与编辑弹窗迁移到共享对话框；保存期间锁定关闭入口，避免重复或中断处理中操作，沿用现有字段与写入反馈。
- `tests/browser/production-list-feedback.spec.ts`：隔离浏览器在 320×568 浅色新建和 390×844 深色编辑视口检查可访问名称、主题表面令牌、视口边界、内部滚动和 Escape；继续覆盖创建/更新以及写入成功而刷新失败时不误报的反馈。Chrome DevTools MCP 320×568 独立页面确认对话框可访问树、Escape 关闭和无错误/警告；隔离页面桌面 1200×783 可正常显示。截图：`/tmp/xmt-production-create-modal-light-320.png`、`/tmp/xmt-production-edit-modal-dark-390.png`。
- 验证：`npm run test:production-list-feedback-browser`、定向 ESLint、`npm run check`、`npm run build`、`npm run version:check`、版本治理、更新说明治理（272 个唯一版本）、测试入口（209 个文件）、Studio 令牌门禁（37 类）及 `git diff --check` 通过。生产构建保留已有 >500kB 分包警告。
- 本轮浏览器使用隔离验收夹具，不连接真实账号或生产 API；无 API、权限、数据库或 Android 原生行为变化。Android 仅同步版本元数据至 80507，未构建 APK；仅本地修改，不提交、推送或部署。
- `npm run test:android-build-endpoints` 未通过：该脚本要求先生成 `dist/xmt-mobile-build.json`；本次没有生成 Android/WebView 构建产物，按既定安排留待 Android 专项，不以本项 UI 检查替代。
- 后续：B4 全站剩余响应式/核心操作、B5 全站主题审计，以及 B6/B8 其他条目仍未完成。

## v8.5.6 改造清单 B5：首次登录改密主题与跳转闭环

- `src/pages/Login.tsx`：首次登录改密弹窗改用 Studio 表面、文字、边框和按钮令牌，并补充对话框可访问语义；认证态更新与 React 弹窗状态之间增加同步保护，避免强制改密用户被先行重定向离开弹窗。认证配置或登录准备失败时会清除保护状态，不会遗留拦截。
- `tests/browser/login-theme-contrast.spec.ts`：隔离模拟服务不使用真实账号，覆盖登录失败以及服务端要求首次改密的响应；三种登录布局的明暗主题均检查关键文字/输入框对比、主按钮渐变两端的对比度、弹窗打开后留在登录页并可退出，且无浏览器错误。截图：`/tmp/xmt-login-first-password-light.png`。
- 验证：`npm run test:login-theme-contrast-browser`、定向 ESLint、`npm run check`、`npm run build`、`npm run version:check`、版本治理、更新说明治理（271 个唯一版本）、测试入口（209 个文件）、Studio 令牌门禁（37 类）与 `git diff --check` 均通过；生产构建保留已有 >500kB 分包警告。
- 无 API、权限、数据库或 Android 原生行为变化。Android 仅同步版本元数据至 80506，未构建 APK；仅本地修改，不提交、推送或部署。
- 后续：B5 全站主题审计、B4 剩余响应式/核心操作审计、B6/B8 其他条目仍开放。

## v8.5.5 改造清单 B5：按钮动效主题令牌

## v8.5.5 改造清单 B5：按钮动效主题令牌

- `src/features/reactbits-appearance/ReactBitsButtonSlot.tsx`：AI 按钮及 Specular、Border Glow、Star Border、Electric Border、Click Spark、Glare Hover 使用 Studio 语义令牌；按钮颜色由最近的主题作用域解析，不再订阅全局 theme store。
- ReactBits Canvas 动效按当前令牌计算实际颜色；Border Glow 光晕通过 CSS 颜色混合生成，Glare Hover 直接用主题令牌并独立调节透明度。
- `tests/browser/system-settings-default-theme.spec.ts`：隔离设置页在 320px 分别验证亮暗主题下 AI 按钮实际文字色与对比度、边框/星光/电流/火花画布颜色、悬停光泽计算色与 Border Glow 有效阴影；预览不写入个人偏好。截图：`/tmp/xmt-reactbits-button-border-glow-320-dark.png`、`/tmp/xmt-reactbits-button-border-glow-320-light.png`。
- 验证：`npm run test:system-settings-browser`、`npm run check`、生产构建、`npm run version:check`、版本/更新说明/测试入口/Studio 令牌门禁、定向 ESLint 与 `git diff --check` 均通过；构建保留仓库已有 >500kB 分包警告。
- 无 API、权限、数据库、真实设置或 Android 原生行为变化。Android 仅同步版本元数据至 80505，未构建 APK；仅本地修改，不提交、推送或部署。
- 后续：B5 全站主题审计、B4 剩余响应式/核心操作审计、B6/B8 其他条目仍开放。

## v8.5.4 改造清单 B5：文字动效主题令牌

- `src/features/reactbits-appearance/ReactBitsTextSlot.tsx`：渐变文本的三段颜色、闪光文字及 True Focus 边框/光晕改用 `tokens.css` 亮暗令牌；移除对全局 theme store 的订阅，颜色由最近的 `.xmt-theme-scope[data-theme]` 解析。
- `tests/browser/system-settings-default-theme.spec.ts`：在隔离设置页通过高级设置选择渐变标题，验证 320px 下亮/暗预览中的 CSS 变量和实际渐变计算颜色逐项匹配；随后关闭未保存草稿的动效做静态表面检查，确认个人外观偏好仍未写入。截图：`/tmp/xmt-reactbits-gradient-text-320-dark.png`、`/tmp/xmt-reactbits-gradient-text-320-light.png`。
- 验证：`npm run test:system-settings-browser`、`npm run check` 和定向 ESLint 通过；ESLint 仍有 `ReactBitsTextSlot.tsx` 一条既有 `any` 警告。后续补齐版本、构建及差异门禁。
- 无 API、权限、数据库、真实设置或 Android 原生行为变化。Android 仅同步元数据至 80504，未构建 APK；仅本地修改，不提交、推送或部署。
- 后续：B5 全站主题审计、B4 剩余响应式/核心操作审计、B6/B8 其他条目仍开放。

## v8.5.3 改造清单 B5：外观预览主题令牌

- `src/features/reactbits-appearance/ReactBitsAppearancePanel.tsx`：亮/暗预览外壳及说明标签使用 Studio 主题令牌，不再用独立 slate/blue/cyan 色板覆盖作用域主题；渐变备用背景改为 Studio 网格背景。
- `src/features/reactbits-appearance/ReactBitsCompatibilityMatrix.tsx`：亮/暗主题容器、卡片边框及组合说明文字接回 Studio 令牌，移除低对比度的 `opacity-70` 标签。
- `tests/browser/system-settings-default-theme.spec.ts`：隔离设置页在 320×844 下切换亮/暗主题，核对预览背景/正文/边框/说明标签和矩阵容器/边框均解析到 Studio 变量，矩阵标签对比度 ≥4.5:1，卡片/指标可见且页面无横向溢出；草稿中关闭动效以便稳定目视，不保存个人偏好。截图：`/tmp/xmt-reactbits-appearance-preview-320-dark.png`、`/tmp/xmt-reactbits-appearance-preview-320-light.png`。
- 验证：`npm run test:system-settings-browser`、`npm run check`、`npm run build`、`npm run version:check`、版本/更新说明/测试入口/Studio 令牌门禁、定向 ESLint 和 `git diff --check` 通过；生产构建保留既有超过 500kB 的分包警告。
- 无 API、权限、数据库、真实设置或 Android 原生行为变化。Android 仅同步版本元数据至 80503，未构建 APK；仅本地修改，不提交、推送或部署。
- 后续：B5 全站主题审计、B4 剩余响应式/核心操作审计、B6/B8 其他条目仍开放。

## v8.5.2 改造清单 B6：手机浏览器历史资料快照

- `src/pages/mobile/MobileProductionEditor.tsx` 在手机浏览器的精确历史版本页展示该版本的只读资料草稿快照，复用现有 Studio 快照组件；历史版本仍不挂载当前资料编辑面板，也不会读取当前资料草稿。
- Web 环境才显示历史资料快照，Android 原生移动编辑器保持既有界面与行为，留待未来专项处理。隔离浏览器验证准确快照、旧记录“未记录”、明确空快照三种状态，以及历史视图只读和当前资料草稿 GET 次数为零。
- 无 API、权限、数据库、真实稿件或 Android 原生行为变化。Android 仅同步版本元数据至 80502，未构建 APK；仅本地修改，不提交、推送或部署。
- 后续：B6 其他跨模块主稿历史语义、B8 其他写入路径、B4/B5 全站审计仍开放。

## v8.5.1 改造清单 B6/B4：成片来源入口与窄窗口操作回归

- `src/pages/ShootingDetail.tsx`：来源创作版本此前只在 `xl` 以上才显示的信息栏内可达；现在小屏在编辑器上方显示 Studio 来源卡片，按钮仍通过既有安全离开检查进入精确历史版本。信息栏图标按钮增加明确的辅助技术名称；桌面侧栏入口与导航规则不变。
- `tests/browser/workflow-details-responsive.spec.ts`：验证桌面“成片→历史版本”与“发布→历史版本”均展示同一准确 v1.0 正文及资料快照；历史路径没有挂载当前资料面板，也不发送当前资料草稿 GET。390px 手机浏览器首次加载后可见成片来源卡片并打开精确只读正文；移动历史资料快照展示未扩入本项，留待未来 Android 专项。
- `tests/browser/topics-list-responsive.spec.ts`：320/390px 窄窗口选中选题后，检查底部批量操作条及通过/驳回/删除/取消按钮均完整位于视口内；取消后操作条消失。
- 无 API、权限或数据库变化。Android 仅同步版本元数据至 80501，未构建 APK；仅本地修改，不提交、推送或部署。
- 验证：`npm run test:workflow-details-responsive-browser`、`npm run test:topics-responsive-browser`、`npm run test:template-management-browser`、`npm run test:creator-works-browser`（串行）、`npm run test:system-settings-browser`、`npm run test:analytics-browser`、`npm run test:announcement-board-browser`、`npm run test:activity-log-browser`、生产审阅、全局搜索、首页/选题阶段、审批流、日报，以及灵感/资料/发布/匿名反馈/复盘的主题和响应式浏览器回归均通过。模板测试夹具现在明确提供期望的浏览器标题；并行运行 Creator Works 时曾出现额外 503 和 WebSocket 端口冲突，串行重跑通过。类型检查、生产构建、版本/更新说明/测试入口/Studio 门禁及差异检查通过。通用认证态 `test:light-theme-contrast` 因其配置的本机 `127.0.0.1:5175` 未运行而无法执行；为避免擅自启动可能触发本地数据库初始化/迁移的服务，本轮改用隔离页面测试。Browser 插件不可用，本轮使用仓库隔离 Playwright 回归。
- 后续：B6 跨大纲、正文、材料、成片和发布的完整历史语义仍未全部完成；B8 其他写入路径、B4/B5 全站审计仍开放。

## v8.5.0 改造清单 B6：创作资料历史快照

- `api/database/migrations/028_production_material_history_snapshot.ts` 为 `production_history` 增加可空 `material_draft_snapshot_html`；旧记录保留 NULL，明确空草稿写入空字符串，不做历史推断或回填。迁移注册为 SAFE_EXPAND。
- `api/routes/workflow.ts` 在同一创作版本事务中读取并保存该版本资料草稿；精确历史查询和含正文分页查询返回快照字段。
- `src/pages/ProductionDetail.tsx` 仅在当前版本挂载可编辑资料面板；历史版本改为只读历史快照，旧数据与明确空数据使用不同说明，不加载当前草稿。
- `tests/database/production-material-history-snapshot-migration.test.ts`、`tests/production/production-collaboration-http.test.ts`、`tests/browser/workflow-details-responsive.spec.ts` 覆盖迁移幂等/兼容、同事务准确快照、HTTP 返回、旧记录未知/显式空及桌面历史浏览。
- 迁移/API 与桌面浏览器回归、类型检查通过。Android 移动编辑器暂不纳入本项，继续留待未来 Android 专项；Android 仅同步元数据至 80500，未构建 APK。仅本地修改，不提交、推送或部署。B6 全链路、B8 其他写入路径、B4/B5 全站审计仍开放。

## v8.4.8 改造清单 B6：创作来源版本时间准确性

- `api/services/workflowScriptSource.ts` 与成片/发布详情接口返回独立的 `version_timestamp`：当前创作版本使用最近确认更新时间，历史版本使用对应历史快照创建时间；保留原 `created_at` 含义。
- `src/pages/ShootingDetail.tsx` 的来源版本时间线改用该字段；成片与发布详情均明确展示“创作版本时间”。没有可解析的来源时间时不伪造当前时间，也不回退到成片/发布记录更新时间。
- `ProductionDetail` 查看历史创作版本时，资料区明确标注其为该生产记录当前整理草稿，而非历史材料快照；该项只明确已有数据范围，完整版本化材料历史仍未完成。
- `npm run test:workflow-script-source` 在隔离 SQLite/API 环境验证当前版时间、历史版时间，以及成片更新时间变化不会移动历史来源时间；`npm run test:workflow-details-responsive-browser` 确认衍生稿来源时间和历史资料范围提示。
- 无数据库结构、权限或真实业务数据变化；Android 仅同步版本元数据至 80408，未构建 APK。仅本地修改，不提交、推送或部署。B6 的跨模块完整版本/材料草稿谱系、B8 其他写入路径、B4/B5 全站审计仍开放。

## v8.4.7 改造清单 B8/B6：创作资料面板生产记录边界

- `src/pages/ProductionDetail.tsx`：详情与历史分页读取按请求序号忽略旧路由响应；资料面板以生产记录 ID 为 React key，切换时旧面板卸载，待保存草稿仍由原生产记录回调提交。
- `src/components/production/ProductionResourcesPanel.tsx`：搜索和资料插入请求完成后确认原面板仍有效；离开旧稿后的迟到响应不再操作新稿。
- `tests/browser/workflow-details-responsive.spec.ts`：隔离浏览器覆盖延迟旧详情/历史分页/资料读取不能污染 304 页面、切换时待保存内容仅写回 303，以及来源查找晚回不插入 304 正文；既有工作流来源历史和响应式回归保留。
- 无 API、权限、数据库或真实业务资料变化；Android 仅同步版本元数据至 80407，未构建 APK。仅本地修改，不提交、推送或部署。B8 其他写入路径、B4/B5 全站主题/响应式审计及 B6 完整跨模块来源历史仍未完成。

## v8.4.6 改造清单 B8：Creator Agent 绑定码防重复与有效期反馈

- Creator Dashboard 的账号数据、同步记录和采集端状态读取按请求序号丢弃过期结果；账号范围改变后，在新账号数据确认之前隐藏旧范围卡片，避免慢响应覆盖新账号状态。
- 一次性设备绑定码创建在发出请求前取得同步锁，快速重复触发不会创建多份码；绑定成功提示使用服务端返回的 `expires_at`，不再显示固定相对时长。失败显示服务端错误并保留此前已确认的绑定码，显式重试可继续创建。
- `npm run test:creator-topic-suggestions-browser` 覆盖慢账号到快账号的反序响应、桌面快速双触发只产生一个 POST、账号 ID 范围、服务器返回截止时间、503 错误提示、保留旧确认结果及显式重试；既有 Creator 建议采用/不采用、样本过期、权限和 1440/390/320px 回归通过。`npm run test:creator-topic-suggestions` 验证反馈服务/API合同。
- 无 API、权限、数据库或真实绑定码/业务数据变化；Android 仅同步版本元数据至 80406，未构建 APK。仅本地修改，不提交、推送或部署。B8 其他 mutation、B4/B5 全站主题/响应式审计与 B6 完整来源历史仍未完成。

## v8.4.5 改造清单 B8：运营报告读取与写入互斥

- 运营报告列表重载期间禁用生成和删除，删除确认已打开时禁用列表重载，避免读请求与用户写入并行；所有报告列表读取按请求序号丢弃过期响应，生成/删除获服务端确认后也会使此前发出的读取失效。
- `npm run test:creator-reports-browser` 扩展覆盖生成刷新失败后删除确认与重载互斥、延迟只读重载时生成/删除保持禁用，重载不重发写操作；既有报告生成/删除确认、GET-only 恢复、亮暗主题对比度及 390px 布局回归通过。
- 无 API、权限、数据库或真实报告数据变化；Android 仅同步版本元数据至 80405，未构建 APK。仅本地修改，不提交、推送或部署。B8 其他 mutation、B4/B5 全站主题/响应式审计与 B6 完整来源历史仍未完成。

## v8.4.4 改造清单 B8：消息已读反馈与账号边界

- 单条已读改为同一条 SQL 按消息 ID 与当前用户限定更新；批量已读接口拒绝畸形/非法 ID 输入，避免错误参数落入“全部已读”，有效 ID 去重并在一个事务内限定当前用户。
- 响应区分请求数量、去重数量、当前用户实际匹配数量、真正由未读改为已读的数量及未匹配数量；“全部已读”也返回实际更新数，桌面成功反馈使用该数字。
- 清空成功后作废已发出的旧消息列表读取，避免竞态将旧汇总总数写回页面；单条已读与批量已读成功同样阻止旧读响应覆盖已确认状态。
- `tests/messages/message-pagination.test.ts` 隔离 SQLite 覆盖单条/批量账号边界、重复 ID、原已读记录、越权/不存在 ID、参数拒绝不写入、全部已读数量与账号隔离；桌面消息浏览器回归验证实际成功数量及清空 503 后保留确认框/数据、恢复重试成功和延迟旧读请求不复活汇总，移动工作台 320/390px 页面无横向溢出。
- 无数据库结构或权限规则变化；版本升至 8.4.4，Android 仅同步元数据至 80404，未构建 APK。仅本地修改，不提交、推送或部署。
- 后续：继续清点其他 B8 mutation，按页面推进 B4/B5 全站主题与响应式审计，并补齐 B6 来源历史全链路；整体改造仍未完成。

## v8.4.3 改造清单 B8：角色删除的完整性与权限缓存

- 自建角色的权限映射和角色主记录现在同事务删除；若权限映射已删但角色删除失败，事务回滚保留原角色和权限，避免接口失败后权限配置被静默清空。
- 是否为系统内置角色、是否仍分配给用户，在同一事务中读取并校验；拒绝删除仍在用户使用的角色，权限缓存只在提交成功后清理。
- 隔离 SQLite 创建临时角色及权限映射/用户关系，验证已分配角色仍返回拒绝；注入角色主记录删除失败，确认主记录与映射完整保留，故障解除后重试成功并均删除。无数据库结构或权限规则变化。
- 版本按小范围修复升至 8.4.3；Android 仅同步元数据至 80403，未构建 APK。仅本地修改，不提交、推送或部署。
- 后续：继续清点其他 B8 mutation，按页面推进 B4/B5 全站主题与响应式审计，并补齐 B6 来源历史全链路。本项不代表改造清单整体完成。

## v8.4.2 改造清单 B8：选题操作结果读回与主写入一致性

- 选题创建、普通编辑、审核、阶段记录补建时，为响应/实时事件/历史准备的详情与历史读取现在在对应事务内确认；读回缺失或失败会回滚选题、阶段稿件/记录和相关审计。
- 阶段变更的参与人查询前移到主写入之前，选题创建的负责人查询失败会安全记录且不让非关键提醒错误反转已确认写入；实时事件仅在事务提交后发送。
- 隔离 SQLite 临时重命名详情查询依赖表，覆盖创建、编辑、审核（含初始稿件）、阶段记录补建失败回滚；编辑恢复后重试只写入一次、只广播一次并携带准确详情。无数据库结构或权限规则变化。
- 版本按小范围修复升至 8.4.2；Android 仅同步版本元数据至 80402，未构建 APK。仅本地修改，不提交、推送或部署。
- 后续：继续清点其他 B8 mutation，按页面推进 B4/B5 全站主题与响应式审计，并补齐 B6 来源历史全链路。本项不代表改造清单整体完成。

## v8.4.1 改造清单 B8：灵感评论、投票和删除事务一致性

- 灵感评论新增、父记录更新时间及评论/计数响应读回现在同一事务完成；数据库中任一步失败都不会留下评论但返回失败。
- 投票记录与灵感投票数同事务更新，计数从实际投票记录计算；数据库变化和实时广播分离，只有事务提交后才广播。
- 删除灵感时，评论、投票和主记录清理纳入同一事务；删除权限在同一事务读取最新所有者及现有角色授权，未授权请求不产生写入。
- 隔离 SQLite 对评论更新时间、投票/取消投票计数更新及删除子记录清理注入失败；验证整组回滚、故障解除后可成功重试、未授权删除无副作用，且最终投票记录和计数一致。无数据库结构变化。
- 版本按小范围修复升至 8.4.1；Android 仅同步版本元数据至 80401，未构建 APK。仅本地修改，不提交、推送或部署。
- 后续：继续清点其他 B8 mutation，按页面推进 B4/B5 全站主题与响应式审计，并补齐 B6 来源历史全链路。此项不代表改造清单整体完成。

## v8.4.0 改造清单 B8：成片/发布保存成功后的归档同步恢复

- 成片或发布主记录更新已成功、后续发布归档刷新失败时，接口仍确认主写入成功，同时返回独立的 `archiveSync: pending`；不再让用户把归档故障误判为稿件保存失败。详情读取按已发布记录比对当前成片/发布脚本与归档快照，页面重载后仍显示待同步状态。
- 新增成片/发布归档重试 API，分别沿用 `workflow:shooting` / `workflow:publishing` 和既有选题编辑权限。重试只从已保存数据库内容重建归档，不再次写入主记录；失败保持待同步，成功清除状态。Studio 警示使用语义令牌，页面提供持续状态与显式重试。
- 隔离 SQLite 注入归档 UPDATE 失败：验证主剧本保持已保存、详情读回检测到脚本漂移、重试失败仍待处理、移除故障后归档准确刷新并且不会重复创建成片/发布记录。隔离浏览器验证成片自动保存与发布手工保存的分开反馈、刷新后状态保留、归档 POST 失败后安全重试、390px 页面无横向溢出；Playwright MCP 与 Chrome DevTools MCP 对实际隔离页面进行交叉检查。
- 无数据库结构或权限规则变化；新增重试 API，版本按规则升至 8.4.0。Android 仅同步元数据至 80400，未构建 APK。仅本地修改，不提交、推送或部署。B8 其他 mutation、B4/B5 全站审计及 B6 完整来源历史仍开放。

## v8.3.3 改造清单 B6/B8：创作版本与历史快照一致性

- 修复创作显式建新版本时当前稿和旧稿快照分开提交的问题；正文、版本号、旧版快照及大版本替代关系现在同一事务成功或回滚。历史保留清理属于提交后的维护步骤，失败会记安全类别日志，不再把已经提交的稿件误报为保存失败。
- 隔离 SQLite 触发 `production_history` 插入失败，复现旧行为下接口返回 500 但当前正文已改变；修复后验证正文、版本号和历史记录整体回滚，解除故障后重试只写入一个版本。另注入历史清理删除失败，确认新版本仍返回保存成功、旧快照保留并记录安全类别告警。`npm run test:production-access`、`npm run test:workflow-script-source`、`npm run test:integrity:workflow`、`npm run check`、`npm run build`、版本一致性/治理、更新说明治理（255 个唯一版本）、测试入口（207 个）、Studio 令牌门禁（37 类）、定向 ESLint 和 `git diff --check` 均通过。定向 ESLint 0 errors、11 warnings（既有 `workflow.ts` 规则警告）；构建成功并保留已有 >500kB 分包提示。
- 无数据库结构或权限变化；Android 仅将版本元数据同步至 80303，未构建 APK。仅本地修改，不提交、推送或部署。
- 后续：继续盘点 B8 其余 mutation 原子性/反馈，按页面推进 B4/B5 全站审计，并补齐 B6 历史来源谱系。该项不代表清单整体完成。

## v8.3.2 改造清单 B4/B5：通知偏好窄屏布局与主题对比

- 设置中心通知偏好在深色主题下发现“选题审核完成时提醒”仅 4.12:1，分类标题“我的设置”仅 4.22:1；辅助文字与分类标题均改用 Studio 次级文字令牌。320px 下权限申请按钮原会被挤成竖排，现改为窄屏上下布局；保存按钮和偏好状态不再拆行。
- `npm run test:system-settings-browser` 扩展覆盖通知偏好 320/390px 浅色和 320px 深色视口的无横向溢出、操作可达、状态标签单行；审核事件说明和设置分类标题在亮暗主题均至少 4.5:1。页面身份、非空内容、无框架错误层、控制台及保存交互均有断言。既有系统主题、偏好保存失败→明确重试、个人资料/密码重试、备份和 Logo 保存流程仍一并通过。隔离夹具截图：`/tmp/xmt-notification-settings-1440-light.png`、`/tmp/xmt-notification-settings-320-light.png`、`/tmp/xmt-notification-settings-320-dark.png`。
- 只改设置中心展示样式与隔离浏览器回归，无 API、权限、数据库或真实偏好数据变化；版本仍为 v8.3.2，仅本地修改，不提交、推送或部署。B4/B5 全站审计、B8 其他 mutation、B6 完整来源历史流转仍未完成。

## v8.3.2 改造清单 B8：用户与账户安全变更的操作记录原子提交

- 用户创建、资料/角色更新及删除现在将用户数据、角色关联和对应 `activity_log` 放入同一个数据库事务；停用账户时，启用状态、认证版本、活动日志及其活动会话撤销也在同一事务提交，避免接口失败但会话已部分撤销。登录密码更新、首次改密标记、认证版本提升及个人资料更新也分别与各自操作记录原子提交。日志或会话撤销失败时业务变更整体回滚，目标记录已并发消失时也不会写入孤立日志。
- `npm run test:user-mutation-audit-atomic` 在隔离 SQLite 分别注入用户创建、更新、删除审计失败，验证账户/角色状态回滚、错误不泄漏及故障解除后重试只提交一次；`npm run test:auth` 注入密码/资料日志失败，验证密码、认证版本、首次改密标记和资料字段回滚，再通过限流安全重试。`npm run test:user-session-revocation` 注入会话撤销失败，验证停用状态、认证版本、活动日志和会话一并回滚，且失败时不提前断开 socket；恢复后重试只撤销一次。另有用户分页、RBAC、测试入口、类型检查、定向 ESLint 与 `git diff --check` 回归。
- 不改变权限规则、数据库结构或真实用户数据；版本仍为 v8.3.2，仅本地修改，不提交、推送或部署。B8 其他 mutation、B4/B5 全站审计、B6 完整来源历史流转仍未完成。

## v8.3.2 改造清单 B8：资料变更与操作记录原子提交

- 资料创建、更新、回收/恢复、标签绑定/解绑、资料关联增删、文件元数据增删，以及选题详情中的资料关联/解除，现在均将业务写入与操作记录放入同一事务；任一步失败会整体回滚。唯一键冲突继续准确返回“已关联”，审计失败则返回安全的服务端错误，不再误报为重复。
- 隔离 SQLite 触发审计写入失败，验证上述路径回滚且不泄漏数据库错误文本；解除故障后重试成功，重复关联仍返回 409。`npm run test:resource-create-atomic`、`npm run test:resource-center-mutations`、`npm run test:content-topic-assets` 与定向 ESLint 通过。
- 无数据库结构、权限或真实业务数据变化；Android 仅同步元数据至 80302，未构建 APK；仅本地修改，不提交、推送或部署。资料相关写入的原子审计闭环已补齐，但 B8 其余模块、B4/B5 全站审计、B6 完整来源历史流转仍开放。

### v8.3.2 改造清单 B4/B5：内容资产页窄屏与主题可读性

- 内容资产卡片的平台/更新时间在深色主题对比度实测为 4.22:1；卡片统计标签、维度说明、来源信息和相关辅助文字统一改用现有 Studio 次级文字令牌，无新增硬编码颜色。
- 扩展 `npm run test:publishing-assets-browser`：搜索、城市维度筛选与恢复；亮/暗主题及 320/390/1440px 横向溢出回归；标题、更新时间、状态、统计标签和数据来源均要求对比度 ≥4.5:1。Playwright MCP 与 Chrome DevTools MCP 核对页面身份及控制台；DevTools 窗口缩放受浏览器最小窗口限制，320px 结论来自项目 Playwright 的 320px viewport 用例。
- 本页检查通过不代表 B4/B5 全站关闭；剩余页面继续逐区审计。无 API、权限、数据库或真实数据变化，版本仍为 v8.3.2；仅本地修改，不提交、推送或部署。

### v8.3.2 改造清单 B8：日报提交/审核与操作记录原子提交

- 日报提交和审核的状态、版本、审核人/意见更新，现在与对应操作记录在同一数据库事务内；并用原状态条件更新，避免并发状态变化被旧请求覆盖。草稿保存原已在事务内写操作记录。
- 隔离 SQLite 在提交与审核日志分别注入失败，验证 API 返回通用安全错误、状态/版本/审核字段全部回滚且没有孤立日志；移除故障后重试成功，每种动作只留下一个操作记录。`npm run test:daily-report-audit-atomic` 与 `npm run test:daily-report-permissions` 通过。
- 无数据库结构、权限或真实数据变化；版本仍为 v8.3.2；仅本地修改，不提交、推送或部署。日报写入记录原子性已补齐，但 B8 其他模块、B4/B5 全站审计、B6 完整来源历史仍开放。

### v8.3.2 改造清单 B8：复盘各项写入与操作记录原子提交

- 复盘创建、内容编辑、指标快照整组替换、发布、归档，以及行动项新增/更新，现在都把业务变更和对应操作记录放入一个事务；发布/归档与编辑另外校验读取时的状态/版本，行动项更新校验原状态，避免过期操作覆盖状态。
- 隔离 SQLite 分别注入创建、编辑、快照替换、行动项新增/更新、发布、归档的日志失败，验证业务值/版本/旧快照回滚、不留孤立日志；移除故障后重试成功，每个动作只记录一次。`npm run test:retrospective-audit-atomic`、复盘权限合同与发布指标来源回归通过。
- 无数据库结构、权限或真实数据变化；版本仍为 v8.3.2；仅本地修改，不提交、推送或部署。B8 尚有其它模块需要盘点，B4/B5 全站审计及 B6 完整来源历史仍开放。

### v8.3.2 改造清单 B4/B5：选题模板页辅助文字对比度与移动操作

- 暗色主题下模板平台/创建者辅助信息实测为 3.83:1；已改用 Studio 次级文字令牌，无新增硬编码颜色。
- 新增 `npm run test:template-management-browser`，覆盖 1440px 暗色、390px 浅色和 320px 暗色，验证页面身份、标题/说明/表单标签/模板辅助信息/结果提示的 ≥4.5:1 对比度、无横向溢出及 320px 表单校验可触达。另覆盖创建后注入列表 GET 503、明确显示“服务端已确认”、双击只发一次写请求、只读 GET 重试后恢复。浏览器插件不在当前可用技能中，按技能要求使用项目 Playwright；截图保存在 `/tmp/xmt-template-management-1440-dark.png`、`/tmp/xmt-template-management-390-light-refresh-warning.png`、`/tmp/xmt-template-management-390-light-recovered.png` 和 `/tmp/xmt-template-management-320-dark.png`。
- 无 API、权限、数据库或真实业务数据变化；版本仍为 v8.3.2，仅本地修改，不提交、推送或部署。本页审计不代表 B4/B5 全站关闭，仍须继续逐页核查。

## v8.3.1 改造清单 B8：创作资料保存确认与读回分离

- 创作资料草稿在事务中校验修订号并提交后，接口直接返回该事务已确认的内容、修订号、操作者与时间；移除提交后的额外数据库读取。读回偶发失败不再导致已保存内容被误报失败，或让前端用旧修订号重复重试。
- 回归：扩展 `tests/production/production-materials.test.ts`，隔离拦截并模拟保存后整行读回未命中，验证 PUT 仍准确返回已提交正文和修订号、不会发起独立读回，数据库内容确已持久。`npm run test:production-materials`、`npm run check`、定向 ESLint 通过。
- 无数据库结构、权限或真实业务数据变化；Android 仅同步元数据至 80301，未构建 APK；仅本地修改，不提交、推送或部署。B8 全量 mutation 盘点及 B4/B5 全站审计、B6 完整来源历史流转仍开放。

## v8.3.0 改造清单续进度：资料分类管理与知识库创建入口

- 资料库各分类页与知识库的“分类管理”入口现已可用：支持新增、改名、调整上级关系及删除。服务端继续执行既有 `resource:category_manage` 权限；有资料或子分类时拒绝删除并保留原因。写入失败保留表单；写入确认后的分类列表刷新失败会明确区分并只开放 GET 重试，刷新恢复前锁定新写入，避免重复操作。
- 新建子分类按 `parent_id` 关系生成路径；改名/移动在单一数据库事务内校验循环，并同步重建整棵后代路径，不依赖可能过期的 `path` 字符串作为关系真源。无数据库结构或新权限规则变化。
- 知识库“新增资料”接通现有 `ResourceCreateModal`，创建确认后进入刚创建的详情页；不新建第二套表单或设计组件。
- 验证：`npm run test:resource-categories` 覆盖权限边界、深层路径递归、循环拒绝、子类删除保护及隔离 SQLite 完整性；`npm run test:resource-categories-browser` 覆盖失败保留输入、写成功后 GET 503 只读恢复、改名/移动、删除拒绝与成功、知识库新增跳转、320px 无横向溢出与弹窗边界。Playwright MCP 与 Chrome DevTools MCP 在隔离夹具交叉确认页面身份、桌面与 320px 布局无横向溢出，控制台无错误/警告。`npm run check`、`npm run build`、版本检查及治理、更新说明唯一性（252 个版本）、测试入口检查（201 个）、Studio 令牌门禁（37 类）、Android 元数据合同、定向 ESLint 和 `git diff --check` 均通过；构建保留既有超过 500 kB 的大分包警告。截图保存在 `/tmp/xmt-resource-category-management-desktop.png` 与 `/tmp/xmt-resource-category-management-mobile-320.png`。
- 边界：仅隔离 API/浏览器夹具写入；未访问或修改真实业务数据。Android 仅同步版本元数据至 80300，未构建 APK；只在本地修改，不提交、推送或部署。B4/B5 全站审计、B6 完整来源历史流转及 B8 全量 mutation 盘点仍未完成，不能据本项关闭改造清单。

## v8.2.3 改造清单 B6：资料来源进入回收站后的内容边界

- 创作资料区现在明确说明：原资料更新或进入回收站后，已复制的资料内容仍保留；来源回收后可能无法打开。“加入草稿”和“引用到正文”仍是独立操作，未引入自动合并。
- 合同验证：扩展 `tests/production/production-materials.test.ts`，来源更新及软删除后，草稿中的已复制正文与来源链接不漂移；回收来源不能再次插入，失败不改变草稿或正式正文。`npm run test:production-materials` 通过。
- B6 来源历史补证：扩展 `tests/production/workflow-script-source.test.ts`，确认带有资料资源 ID 的精确创作历史版本在被成片/发布引用、版本清理和归档刷新后仍保留原来源链接及来源文字；`npm run test:workflow-script-source` 通过。仅增强隔离回归，不改变运行时代码或版本号。
- B4 浏览器交叉复核（不代表全站关闭）：Playwright MCP 与 Chrome DevTools MCP 在隔离工作流夹具检查拍摄详情桌面 1440px、手机 390/320px，以及发布详情 320px。文档宽度与视口一致；返回/完成制作/发布剧本编辑入口在 320px 可见，滚动到“编辑剧本”时避开固定底栏；打开后取消未写入业务数据。页面身份正确、非空、无框架错误，控制台无 error/warn。截图由浏览器直接展示，本地未保存到仓库；本轮无 UI/运行时改动，不触发版本升级。
- B5 测试稳健性：生产审阅文本选区改用实际鼠标拖选并等待稿件段落完成布局，避免主题切换后标题先出现导致空选区。`npm run test:production-review-browser` 连续两次通过，覆盖桌面/移动审阅、亮暗主题、窄屏右键子菜单和协作保存恢复。
- 验证：`npm run test:workflow-details-responsive-browser`、类型检查、生产构建、版本检查/治理、定向 ESLint、`git diff --check` 通过；构建保留既有超过 500 kB 的大分包警告。无 API、权限、数据库或真实业务数据变化；Android 仅同步元数据至 80203，未构建 APK；仅本地修改，不提交、推送或部署。
- 下一步：B6 继续审计创作正文各历史版本与成片/发布分支的来源保留；B4/B5 全站审计和 B8 全量操作清点仍未完成。

## v8.2.2 改造清单 B5：生产审阅窄屏右键回归校准

- 根因：测试先以桌面尺寸挂载应用，再缩窄视口后自行计算屏幕坐标；编辑器所在位置未同步滚入视口，曾让测试点击到屏外而漏开右键菜单。改为目标编辑器的定位式右键，由 Playwright 完成必要滚动。后续复跑还发现主题重载时 heading 早于正文几何出现；选区验收现等待正文实际布局并使用鼠标拖选。
- 验证：修复后 `npm run test:production-review-browser` 连续两次通过，覆盖生产审阅桌面/移动操作、协作保存失败恢复、亮暗主题工具栏以及窄屏右键菜单；选区文本断言与菜单几何用例均实际执行。
- 影响边界：仅修正自动化交互定位，不改变产品代码、用户操作、API、权限、schema 或真实数据。Android 仅同步版本元数据至 80202，未构建 APK。Browser 插件未在当前会话挂载，使用项目隔离 Playwright；仅本地修改，不提交、推送或部署。
- 下一步：B5 全站主题/对比度审计和 B4 全站响应式审计仍开放；B6 内容来源/历史流转也未完成。

## v8.2.1 改造清单 B6：区分资料草稿与正式稿来源状态

- 资料选择器分别识别资源来源链接是否已进入 `production_material_drafts.content_html` 或 `production.content`，显示“已加入资料草稿”“已引用到正文”“资料草稿与正文均有”或“待用”。状态仅由页面当前内容计算，既有“加入资料草稿”和“引用到正文”仍为不同操作。
- 验证：来源状态单元测试 6 项通过；`npm run test:production-materials` 通过；`npm run test:workflow-details-responsive-browser` 通过，隔离桌面浏览器验证加入资料草稿后显示“已加入资料草稿”，状态读取未触发正式正文写入。截图 `/tmp/xmt-material-source-lineage-desktop.png`。
- B6 来源失效契约补证：资料草稿已复制的正文与来源 ID 不随原资料更新而漂移；原资料进入回收状态后，已保存副本仍可读且链接身份保留，但再次从该来源插入会被拒绝，草稿与正式正文都不被失败请求改写。由隔离数据库/API 测试验证，不新增线上查询或改写存量链接。
- 验证补充：扩展 `tests/production/production-materials.test.ts`，`npm run test:production-materials` 通过，包含资料更新、回收、拒绝重新插入后的稳定内容、来源链接与正文隔离断言。
- 影响边界：无 API、权限、schema、真实数据或稿件变化；Android 仅同步版本元数据至 80201，未构建 APK。Browser 插件/技能不在当前会话可用项中，因此使用项目隔离 Playwright。仅本地修改，不提交、推送或部署。
- 下一步：B6 仍未完成；继续核对资料草稿、创作历史版本和成片/发布分支的历史保留与来源失效语义，不把来源链接误当成完整的结构化谱系。

## v8.2.0 改造清单 B6：创作资料来源保留与正文隔离

- “创作资料”界面明确它是独立整理草稿，不自动修改正式正文；“加入资料草稿”和“引用到正文”分别表示不同操作。
- 从资料库加入资料草稿时，每段复制内容保留 `/asset-center/resources/:id` 来源链接，方便回到原资料；正式稿仍须用户显式执行“引用到正文”。
- 验证：资料草稿 API 保存/过期版本冲突/来源链接净化、资料来源文本改变不漂移已复制草稿、正式正文保持原值；桌面浏览器实际完成搜索资料→加入草稿→读取已保存来源链接，并确认正式正文未发起写入；移动端历史来源路径仍由同一响应式浏览器回归覆盖。`test:production-materials`、`test:workflow-details-responsive-browser` 通过。
- 版本与影响边界：无 API、权限、schema 或真实数据变化；Android 仅同步版本元数据至 80200，未构建 APK。未应用真实数据库、不提交/推送/部署。B6 仍未完成：继续统一大纲、创作各版本、成片与发布衍生剧本的完整版本与来源历史。

## v8.1.0 改造清单 B6：创作初稿来源快照

- 追踪选题大纲实际进入创作正文的时点：选题审核、阶段工作流/补记录自动建稿，以及桌面/移动“开始创作”入口都把创建时复制的 `topics.outline` 原文写入 `production_origin_snapshots`；快照与 `production` 同事务提交。
- 手工创建只有显式标记 `topic_outline` 且服务端事务确认提交正文与当前大纲一致时才记录来源；页面加载后若大纲已经变化则返回 `TOPIC_OUTLINE_CHANGED`，不写入创作记录。后续大纲/正文修改不会更新初稿来源。
- 桌面与移动创作详情新增“创作来源”区块，可展开查看创建时的大纲；旧稿或手工起稿没有可信来源时明确提示未记录。`production.content` 仍是唯一正文真源。
- 数据库变化：迁移 027 为 SAFE_EXPAND，只新增追溯表，不回填历史、不更改稿件正文或权限。数据库冻结与语义规范已同步；Android 仅同步版本元数据至 80100，未构建 APK。
- 验证：迁移幂等/旧稿不回填/空白大纲保留/来源类型约束/FK 删除清理；HTTP 精确来源、过期大纲拒绝、无标记手工稿不误标；TopicService 和审批工作流自动建稿来源；一键开工契约；桌面及 390px 移动来源回看；`check`、`build`、版本治理、更新说明治理（246 个唯一版本）、测试入口（197 个）、Studio 令牌门禁（37 类）、版本操作权限回归、生产稿版本同步及 `git diff --check` 通过。定向 ESLint 0 error、11 条既有 warning；构建保留仓库已有 500 kB 以上分包警告。
- 风险与边界：迁移未应用于真实数据库，Android 未构建，未提交/推送/部署。B6 仍未完成：继续审计材料草稿、大纲到创作各版本及成片/发布衍生分支的完整历史和可见语义。

## v8.0.1 改造清单 B6：跨端精确历史版本追溯与安全切换

- Chrome DevTools 移动网页复核发现：发布详情保留引用版本 `v1.0` 并跳转到 `/production/:id?version=v1.0`，但移动创作页忽略查询参数，展示当前版本 `v2`。现桌面/移动均按精确版本读取和只读显示历史快照；未找到/无法读取时 fail-closed，不以当前正文冒充来源。返回当前版本期间，移动页先等待当前稿数据确认加载，再挂载当前版本编辑器，避免历史正文短暂进入当前协作文档。发布和成片来源跳转保留来源详情返回路径。
- 验证：`test:workflow-details-responsive-browser` 覆盖桌面/390px 移动端发布→v1.0→返回当前 v2→返回发布详情，以及历史缺失时不显示当前稿或写入入口；桌面历史视图的审核、小修、另开新版入口均隐藏。补齐隔离浏览器中的材料草稿读取响应，覆盖桌面当前稿加载；Playwright MCP 与 Chrome DevTools MCP 在隔离页面交叉复核，桌面和移动控制台无错误/警告。`npm run check`、`npm run build`、`npm run version:check`、版本治理、更新说明唯一性（246 个版本）、测试入口（197 个）、Studio 令牌门禁（37 类）、版本操作权限回归、生产稿版本同步、定向 ESLint（0 error/0 warning）及 `git diff --check` 均通过；生产构建仍有仓库既有 500 kB 以上分包警告。
- 数据库/API/权限：无变更。Android 仅同步版本元数据至 80001，未构建 APK；仅隔离夹具，无真实稿件写入；不提交、推送或部署。
- 下一步：B6 仍开放，继续梳理大纲、创作正文、材料草稿、成片剧本、发布剧本的内容真源与完整历史流转。

## v8.0.0 改造清单 B6：成片/发布剧本来源追溯（部分闭环）

- 完成内容：成片与发布首次保存独立剧本时记录所引用的已审核创作记录 ID 和版本；接口可反查当前或历史已审核快照，并拒绝跨选题来源、变更已记录来源及猜测补写旧剧本来源。读取时也按当前选题校验来源，异常存量关系 fail-closed。详情展示本地衍生来源与来源版本；发布归档加入 `script_sources` 和去重的精确来源文本快照，已发布/已关联内容在任一阶段确认改稿后刷新快照，来源版本保持不漂移。被阶段稿引用的创作历史不参与自动清理，仍有引用的创作记录不能删除。保留空字符串表示独立空白稿的既有语义。
- 数据库变化：迁移 026 按 `SAFE_EXPAND` 为 shooting/publishing 各增加两个可空字段，不回填历史、不改写剧本文本。Android 仅同步元数据至 80000，未构建 APK。
- 验证：`test:workflow-script-source`、`test:workflow-script-source-migration`、`test:workflow-details-responsive-browser`、`test:published-archives-browser`、`test:publishing-douyin-link`、`check`、`build`、`version:check`、`test:version-governance`、`test:changelog-governance`（245 个唯一版本）、`test:entrypoints`（197 个测试文件）、`test:studio-token-usage`（37 类）、`git diff --check` 均通过。集成回归覆盖被引用历史的保留、创作删除保护、跨选题存量关系拒绝曝光、准确归档来源文本和后续同步。Playwright MCP 与 Chrome DevTools MCP 在隔离页面交叉确认来源版本、空白稿状态和无控制台错误。定向 ESLint 0 errors、24 warnings；生产构建保留仓库既有 500 kB 以上分包警告。
- 风险与边界：历史本地稿来源无法可靠推断，故保持未记录；本迁移尚未应用到真实/开发业务数据库。仅本地修改，不提交、推送或部署。
- 下一步：B6 仍开放，继续梳理大纲、创作正文、材料草稿、成片剧本、发布剧本的内容真源与完整历史流转；当前阶段不合并数据表、不覆盖旧稿。

## v7.8.47 改造清单续进度：空白独立剧本不再回退创作原稿

- B6：成片/发布详情过去以 `script_content || production.content` 选择内容；当用户清空并保存独立剧本（空字符串）时，页面会误把它当作“没有本地稿”并重新显示创作原稿，与现有 `script_content !== null/undefined` 分支标识逻辑矛盾。现在只有 `null` / `undefined` 才回退引用创作稿，空字符串作为已保存的空白分支保留；未改动内容、接口、权限或数据库。
- 验证：`npm run test:workflow-details-responsive-browser` 注入成片及发布独立剧本为空，检查“本地编辑版”标识、不回退原稿，发布详情显示“暂无剧本内容”；原桌面缩放矩阵、320/390px 操作区和亮暗主题回归通过。Playwright MCP 与 Chrome DevTools MCP 在隔离夹具复核桌面成片与发布页；`npm run check`、`npm run build`、`npm run version:check`、`npm run test:version-governance`、更新说明唯一性（244 个版本）、测试入口（195 个）、Studio 令牌门禁（37 类）及 `git diff --check` 通过。定向 ESLint 0 errors，保留该页既有 5 条 unused import/hook dependency 警告；构建保留仓库既有超过 500 kB 的分包警告。
- API/权限/数据库变化：无，空白剧本仅置于隔离 fixture。Android 仅同步版本元数据至 70847，未构建 APK；仅本地修改，不提交、推送或部署。B6 的跨模块来源标记、快照反查等其余范围仍开放。

## v7.8.46 改造清单续进度：编辑器选区颜色面板标题对比度

- B5：隔离浏览器实测发现选区浮动菜单的“高亮颜色”面板标题在亮色主题受 `opacity-60` 影响仅 2.53:1；文字颜色面板标题使用相同写法。两处标题均改为 `text-studio-text-secondary`，遵循 Studio Atelier 令牌，不改变格式、调色板或稿件内容。
- 验证：`npm run test:production-review-browser` 将祖先透明度纳入实际文字合成对比度计算，亮/暗主题两种颜色面板标题均 ≥4.5:1；Playwright MCP 与 Chrome DevTools MCP 实测亮色 7.58:1、暗色 7.52:1。原桌面缩放、窄屏工具栏、浮层定位、批注和协作保存恢复回归通过。`npm run check`、定向 ESLint（0 errors/warnings）、生产构建、版本/版本治理、更新说明唯一性（243 个版本）、测试入口（195 个）、Studio 令牌门禁（37 类）及 `git diff --check` 通过；构建保留仓库既有超过 500 kB 的分包警告。
- API/权限/数据库变化：无，仅操作隔离稿件夹具。Android 仅同步版本元数据至 70846，未构建 APK；仅本地修改，不提交、推送或部署。B5 及 B4 全站审计仍开放。

## v7.8.45 改造清单续进度：CommandPalette 窄屏裁切与暗色可读性

- B4：320px 视口下命令面板输入行的 ESC 键帽超出玻璃面板右边缘；为输入框补 `min-w-0` 后，面板横向 `scrollWidth` 从 251px 收敛到可用的 246px，键帽回到面板内，页面无水平溢出。
- B5：暗色主题下搜索键帽、分类标签、页脚操作说明的实际文字对比度最低 3.69:1，分类/提示为 4.08:1。现改用 `text-studio-text-secondary`，同时覆盖输入占位符、搜索结果摘要及空态说明，维持 Studio Atelier 语义令牌体系。
- 验证：`npm run test:global-search-browser` 通过，注入 320px 亮/暗主题，覆盖初始导航列表与查询结果、内部水平溢出/裁切、面板所有文字与输入占位符的 4.5:1 对比度；原有 ⌘K、最短关键词、六类搜索与日报直达回归保持通过。Playwright MCP 与 Chrome DevTools MCP 交叉复核 320px 页面和 ESC 按键提示。`npm run check`、定向 ESLint（0 errors/warnings）、生产构建、`npm run version:check`、更新说明唯一性（242 个版本）、测试入口（195 个）、Studio 令牌门禁（37 类）及 `git diff --check` 均通过；构建保留仓库既有超过 500 kB 的分包警告。
- API/权限/数据库变化：无，搜索仅使用隔离 GET fixture。Android 仅同步版本元数据至 70845，未构建 APK；仅本地修改，不提交、推送或部署。B5 及 B4 全站审计继续开放。

## v7.8.44 改造清单续进度：创作详情窄屏操作与右键浮层回归

- B4/B5：新增 320px 亮色移动网页回归，检查“返回创作、加粗、保存草稿、提交审核”按钮可见、位于视口内且不被祖先裁切；`document` 与 `body` 均无横向溢出。实际渲染检查中主文案/提示文字对比度均 ≥4.5:1。
- 测试路径修正：桌面编辑器右键浮层场景先在桌面宽度加载，再收窄到 390×844；否则页面会按初次视口选择移动网页壳，而该壳不会挂载桌面右键菜单。移动 390px 文本标注回归使用键盘选区，避免依赖易受浏览器滚动影响的固定鼠标坐标。该调整仅修正测试，不改变 UI/业务行为。
- 验证：`npm run test:production-actions-responsive-browser`、`npm run check`、定向 ESLint、生产构建、`npm run version:check`、更新说明治理（241 个唯一版本）、测试入口（195 个）、Studio 令牌门禁（37 类）和 `git diff --check` 全部通过。回归覆盖桌面缩放矩阵、主工具栏/选区浮层、390px 右键子菜单、390px 移动批注与协作恢复、320px 核心操作可见性。Playwright MCP 与 Chrome DevTools MCP 使用隔离夹具交叉检查 320px 亮色页面；生产构建有仓库既有超过 500 kB 的大分包警告；无真实登录、API 写入或业务数据变化。
- API/权限/数据库变化：无。Android 仅同步版本元数据至 70844，未构建 APK/开展原生专项；仅本地修改，不提交、推送或部署。B4/B5 全站检查仍未关闭，本轮仅补创作详情与编辑器的上述视口/主题范围。

## v7.8.43 改造清单续进度：Creator Center 作品详情初次失败恢复

- B8：作品详情初次 GET 失败时提供持久错误说明、返回作品库入口和显式只读重试，不再仅呈现通用错误页。重试不会修改作品或复盘数据。
- 验证：`npm run test:creator-works-browser` 注入详情 GET 503，验证列表→详情失败、错误/返回入口、仅读重试成功显示详情和返回列表行为；测试请求计数确认详情读取两次、仅第一次失败。`npm run check`、定向 ESLint、生产构建、版本检查/治理、更新说明唯一性（240 个版本）、测试入口（195 个）、Studio 令牌门禁（37 类）和 `git diff --check` 通过；构建仍有仓库既有超过 500 kB 的大分包警告。
- API/权限/数据库变化：无；仅本机隔离浏览器夹具。
- 风险与边界：Android 仅同步版本元数据至 70843，未构建 APK；仅本地修改，不提交、推送或部署。此项仅完成作品详情错误恢复，不代表 B8、B4/B5 或整份清单完成。

## v7.8.42 改造清单续进度：Creator Center 作品列表初次/分页失败恢复

- B8：作品库首次 GET 失败时持续显示暂不可用说明，不再落入无重试的通用错误页或误示为空库；支持按列表重读恢复。已有作品刷新失败时保留当前数据；下一页读取失败可按失败游标重试，不丢失已加载记录。
- 窄屏采用作品卡片呈现关键指标，桌面保留原表格；排序控件补充可访问名称。Playwright MCP 与 Chrome DevTools MCP 对隔离数据做页面复核，390px 页面无横向溢出。DevTools 的 Socket 告警来自未启动的本地 Socket 后端，不影响隔离 API 读取。
- 验证：`npm run test:creator-works-browser` 在 390px 隔离浏览器分别注入初次列表、整表刷新和下一页 GET 503，验证初始空状态保护、数据保留、两个重试路径及预期请求数量。类型检查、定向 ESLint、生产构建、版本检查/治理、更新说明唯一性（239 个版本）、测试入口（195 个）、Studio 令牌门禁（37 类）和差异检查通过；构建仍有既有超过 500 kB 的大分包警告。
- API/权限/数据库变化：无；所有请求仅命中本机隔离夹具。
- 风险与边界：Android 仅同步版本元数据至 70842，未构建 APK；仅本地修改，不提交、推送或部署。此项仅完成作品库读取恢复，不代表 B8、B4/B5 或整份清单完成。

## v7.8.41 改造清单续进度：趋势中心读取失败恢复与周期数据隔离

- B8：趋势中心初次读取失败时持续显示不可用状态并可显式重试；同周期刷新失败时保留最近一次成功结果并说明；切换周期后只显示与当前周期匹配的数据，避免误用前一周期内容。并发读取使用请求序号，旧请求不能覆盖最新选择。
- 验证：`npm run test:creator-trends-browser` 注入初次、刷新和切换周期 GET 503，覆盖只读恢复、刷新失败保留数据、周期切换不误显旧图表、再次恢复和请求次数；旧逐日趋势回归覆盖桌面与 390px。`npm run check`、定向 ESLint、生产构建、版本检查/治理、更新说明唯一性（238 个版本）、测试入口（194 个）、Studio 令牌门禁（37 类）及差异检查通过。生产构建仍有仓库既有超过 500 kB 的大分包警告。
- API/权限/数据库变化：无；仅本机隔离浏览器夹具，无真实业务写入。
- 风险与边界：Android 仅同步版本元数据至 70841，未构建 APK；仅本地修改，不提交、推送或部署。此项只修复趋势中心读取恢复，不代表 B8、B4/B5 或整份清单完成。

## v7.8.40 改造清单续进度：Creator Center 驾驶舱分项读取恢复

- B8：驾驶舱核心数据、同步日志、采集端状态各自处理读取成功/失败；一项失败不再丢弃另外两项成功数据。已有驾驶舱数据刷新失败时保留最近一次成功内容并明确标记；首屏核心请求失败可显式重试。
- 采集端状态不可读时不再误示为离线；同步日志为空或不可读时采集数显示“—”，只有存在明确的最近同步记录才显示零值。
- 验证：`npm run test:topic-stage-record-repair-browser` 分别注入三类 GET 503，覆盖初次全失败和恢复、已有数据时分项失败/保留、完整恢复和 GET-only；`npm run check`、定向 ESLint、生产构建、版本检查/治理、更新说明唯一性（237 个版本）、测试入口（193 个）、Studio 令牌门禁（37 类）和 `git diff --check` 通过。生产构建保留仓库既有的大分包警告。
- API/权限/数据库变化：无；仅本机隔离浏览器夹具。
- 风险与边界：Android 仅同步版本元数据至 70840，未构建 APK；仅本地修改，不提交、推送或部署。此项只修复 Creator Center 驾驶舱读取可靠性，不代表 B8、B4/B5 或整份清单完成。

## v7.8.39 改造清单续进度：运营报告列表初次读取失败恢复

- B8：运营复盘报告列表初次 GET 失败时，页面不再同时显示“尚未生成报告”；改为明确的暂不可用空态，保留错误说明和显式只读重试。Creator Center 账号范围与报告列表分别应用成功结果，单接口失败不会丢弃另一个成功响应。
- 重试会重新读取账号范围和报告列表；报告列表读取成功但账号信息失败时，仍按真实数据成功/失败分别呈现；报告列表不可用时不允许空态暗示不存在报告。
- 验证：`npm run test:creator-reports-browser` 注入初次报告列表 GET 503，确认成功账号范围仍允许对应操作、空状态不误报，重试只增加两类 GET 且不生成/删除报告；Creator Reports/Auth readiness 及亮暗主题对比度回归通过。类型检查、定向 ESLint、`npm run build`、版本检查/治理、更新说明唯一性（236 个版本）和 `git diff --check` 通过。生产构建仍有仓库既有的大分包体积警告。
- API/权限/数据库变化：无；只使用本机隔离浏览器夹具。
- 风险与边界：Android 仅同步元数据至 70839，未构建 APK；仅本地修改，不提交、推送或部署。该项只完成 Creator Center 报告列表初次读取反馈，不代表 B8、B4/B5 或整份清单完成。

## v7.8.38 改造清单续进度：首页聚合读取失败不再伪装为空

- G/B8：工作台将接口失败与成功的零结果区分；失败阶段用“—”和暂不可读提示，不再把未知统计压成 0。失败分区列在全局提示，可显式重新读取；其它成功分区仍可用。
- 任务区和最近变化的数据源失败且无可显示结果时，显示“暂无法确认”，不再误报今天无任务/没有变化；关注事项保留原有独立错误和重试。
- 验证：`npm run test:topic-stage-record-repair-browser` 在隔离浏览器注入待审选题与关注事项 GET 503，覆盖失败状态、任务区非空误报保护、GET-only 重试和恢复；Playwright MCP 使用拦截 API 的本地模拟数据再次验证失败/恢复，390px 无横向溢出。`npm run test:home-dashboard`、`npm run check`、定向 ESLint、`npm run build`、版本检查/治理、更新说明唯一性（235 个版本）、测试入口（193 个文件）、Studio 令牌门禁（37 类）及 `git diff --check` 通过。构建仍有仓库既有的大分包提示；MCP 首次载入产生的 503 是测试主动注入，后续成功恢复页控制台无错误。
- 数据库/API 变化：无；没有更改服务端、接口、权限规则或真实业务数据。
- 边界：Android 仅同步版本元数据至 70838，未构建 APK；仅本地修改，不提交、推送或部署。G 首页工作台其它角色和产品规则仍需持续验收；B8、B4/B5 及改造清单其它范围均未因此关闭。

## v7.8.37 改造清单续进度：报告中心合并与导出契约修正

- E：报告中心改为单一的周报/导出入口；Analytics 移除重复的周报、导出页签，保留数据复盘，并仅在 `export:data` 可用时显示报告中心按钮。报告中心复用完整 `WeeklyReport` 与 CSV 导出，JSON 备份仍可用；移除只有“规划中”内容的月报/总结占位页。路由仍受既有 `export:data` 门禁保护。
- B8：复核后发现导出前端将 `/api/export/topics` 和 `/api/export/analytics` 误当数组，而服务端分别返回 `{ data, stats, exportTime }` 与四组统计对象；旧隔离夹具也错误模拟数组。现已强类型化响应、修正 CSV 映射：选题输出 `data` 明细，分析按选题状态/成员活动/每日趋势/平台分布生成同列 CSV，不再错误显示作品播放/点赞字段。JSON 备份保留响应包络。
- 验证：`npm run test:analytics-browser` 使用与服务端一致的响应结构，覆盖 CSV 文件内容、JSON 包络、双触发 JSON 仅一次 GET、503 失败后重试、剪贴板失败/恢复、无写请求以及只有 `analytics:view` 时拒绝报告中心；报告中心在 390px 下无横向溢出。`npm run test:mobile-work-center-browser` 320/390px 回归通过；类型检查、定向 ESLint（0 errors）、生产构建、版本检查/治理、更新说明唯一性（234 个版本）、测试入口（193 个文件）、Studio 令牌门禁（37 类）和 `git diff --check` 均通过。构建仍有既有超过 500 kB 的分包提示。
- 数据库/API 变化：无；没有修改接口实现或权限规则，数据导出只使用 GET 本机隔离夹具。
- 风险与边界：之前 v7.8.36 浏览器夹具错误地伪造数组，不能作为真实接口 CSV 下载通过的证据；本版本已更正夹具并通过真实响应结构回归。Android 仅同步元数据至 70837，未构建 APK；仅本地修改，不提交、推送或部署。此项仅完成清单 E 对应合并和 B8 导出契约修复，不代表 B8、B4/B5 或全清单完成。

## v7.8.36 改造清单续进度：数据导出失败恢复与防重复

- B8：数据导出失败从仅有自动消失通知改为页面内持续错误状态；错误清除后可重试，成功/空结果显示明确状态。请求期间锁定导出类型，并用同步 ref 拦截重复触发，避免重复 GET 与重复下载。
- 验证更正：初版浏览器夹具错误地把服务端对象响应模拟成数组，故当时“CSV 下载通过”没有覆盖真实 API 结构；真实结构的 CSV 内容、失败重试与下载已在 v7.8.37 修正并复测。v7.8.36 页面反馈和防重复行为保留。
- 修改文件：`src/components/DataExport.tsx`、`tests/browser/analytics-read-recovery.spec.ts` 及测试覆盖的版本/改造说明文档。
- 数据库/API 变化：无；导出仅 GET 本机隔离夹具，下载文件使用夹具记录。
- 风险与边界：无真实业务数据或文件导出；Android 仅同步版本元数据至 70836，未构建 APK；仅本地修改，不提交、推送或部署。Playwright MCP 当前仅 about:blank，Chrome DevTools MCP 的既有页面未触碰；此项使用项目隔离 Playwright。B8 其它路径、B4/B5 全站审计及 G 中依赖产品规则/可信统计源范围继续开放。

## v7.8.35 改造清单续进度：周报剪贴板反馈

- B8：周报复制的现代剪贴板写入失败后，旧式复制兜底现在必须返回成功才提示“复制成功”；失败时显示持续页面错误和全局失败通知，复制成功后清除错误。临时文本框在成功、失败或异常时都会清理。
- 验证：`npm run test:analytics-browser` 通过，覆盖现代剪贴板拒绝、兜底返回失败/成功、成功提示真实性、错误恢复及临时输入框清理；390px 数据复盘页面无横向溢出。`npm run check`、定向 ESLint（0 errors）、`npm run build`、`npm run version:check`、版本/更新说明治理（232 个唯一版本）、测试入口（193 个文件）、Studio 令牌门禁（37 类）与 `git diff --check` 均通过。构建保留既有超过 500 kB 的分包警告。Playwright MCP 当前仅有 about:blank 会话；Chrome DevTools MCP 发现已有本地页面但未导航/点击，避免触碰用户浏览上下文；功能验证使用项目的隔离 Playwright 夹具。
- 数据库/API 变化：无；复制仅访问本地隔离浏览器的系统剪贴板 mock。
- 风险与边界：不读写真实剪贴板内容；Android 仅同步版本元数据至 70835，未构建 APK；仅本地修改，不提交、推送或部署。B8 其它路径、B4/B5 全站审计及 G 中依赖产品规则/可信统计源的范围继续开放。

## v7.8.34 改造清单续进度：数据复盘统计读取状态与恢复

- B8：数据复盘总览读取失败由一次性通知改为持续页面状态和只读重载；初次失败显示未知而不是 0，周期刷新失败保留最近一次成功值并明确显示旧结果周期。未确认最新周期时禁用导出。选题明细失败不再冒充“未选择/暂无数据”，支持初次重试和已加载结果的单独刷新/恢复。
- B8：周报初次读取失败由一次性通知改为持续错误与只读重试；已有报告刷新失败时仍保留最近成功的周期/内容，并在恢复前暂停复制。
- 验证：`npm run test:analytics-browser` 通过；隔离夹具对团队统计初次/周期刷新、选题明细初次/刷新、周报初次/刷新分别注入 503，覆盖未知指标、旧值保留、周期标签、成功读取、已确认内容保留、导出/复制锁定与 GET-only；请求错误不因通知 store 更新重复触发，390px 无溢出。`npm run test:analytics-write-scope`、`npm run check`、定向 ESLint、`npm run build`、版本治理、更新说明唯一性、测试入口、Studio 令牌及 `git diff --check` 通过。构建保留既有超过 500 kB 的分包提示。截图：`/tmp/xmt-analytics-read-recovery-390.png`、`/tmp/xmt-weekly-report-read-recovery-390.png`。
- 修改文件：`src/pages/Analytics.tsx`、`src/components/WeeklyReport.tsx`、`tests/browser/analytics-read-recovery.spec.ts`、测试脚本与版本/改造说明文档。
- 数据库/API 变化：无；全部请求仅访问本机隔离内存夹具，指标口径与服务端计算保持不变。
- 风险与边界：未访问真实指标、账号或业务服务；Android 仅同步版本元数据至 70834，未构建 APK；仅本地修改，不提交、推送或部署。B8 其它路径、B4/B5 全站主题与响应式审计仍开放；G 中依赖明确产品规则/可信统计源的范围未关闭。Browser 插件不可用，使用项目 Playwright 进行隔离浏览器回归。
- 下一阶段：继续检查清单中尚未验收的反馈与全站体验路径；保留 G 中产品规则/可信数据的明确阻塞，不以默认值代替真实口径。

## v7.8.33 改造清单续进度：团队活动日志读取与独立重试

- B8：团队活动日志初次 GET 失败时不再误显示“暂无活动记录”；刷新失败时保留最近一次成功记录。成员筛选用户列表失败也由静默状态改为独立错误与只读重试，避免筛选不可用时无提示。
- 验证：`npm run test:activity-log-browser` 通过；隔离夹具分别注入活动日志和成员列表 GET 503，验证初次错误不进入空态、成员筛选可独立恢复、日志只读恢复且不发写请求，已有记录在刷新失败期间保留；390px 无横向溢出。`npm run test:activity-log`、`npm run check`、定向 ESLint、`npm run build`、版本治理、更新说明唯一性、测试入口、Studio 令牌和 `git diff --check` 通过。构建保留既有超过 500 kB 的分包提示。截图：`/tmp/xmt-activity-log-read-error-390.png`。
- 修改文件：`src/pages/ActivityLog.tsx`、`tests/browser/activity-log-read-recovery.spec.ts`、测试脚本与版本/改造说明文档。
- 数据库/API 变化：无；所有失败与恢复只访问本机隔离内存夹具。
- 风险与边界：未访问真实日志、用户或业务服务；Android 仅同步版本元数据至 70833，未构建 APK；仅本地修改，不提交、推送或部署。B8 其它路径、B4/B5 全站主题与响应式审计仍开放；G 中依赖明确产品规则/可信统计源的范围未关闭。Browser 插件不可用，按前端测试规范运行项目 Playwright。
- 下一阶段：继续从 B8 尚未验证的读取/写入入口及 B4/B5 全站体验检查中选择可隔离验证的闭环，不把模块级完成视为清单全部完成。

## v7.8.32 改造清单续进度：发布归档读取状态与只读恢复

- B8：发布归档列表读取失败不再只出现一次全局通知后落入空态；页面持续显示可恢复错误，提供只重读列表的入口。首次成功读取前不将未知总数显示成 0；后续刷新失败时保留最近一次成功读取的归档及数量。
- 验证：`npm run test:published-archives-browser` 通过；隔离夹具注入首次 GET 503，验证无空态、统计为暂不可用、GET-only 重载恢复；已有列表后搜索触发刷新并注入 503，验证错误持续、已知归档/数量保留、显式重试后恢复且无 DELETE。原多平台与旧版快照、权限、亮暗主题、桌面缩放和 390px 回归通过。`npm run check`、定向 ESLint、`npm run build`、版本检查/治理、更新说明唯一性（229 个版本）、测试入口（191 个文件）、Studio 令牌（37 类）和 `git diff --check` 通过；构建仍提示既有超过 500 kB 的分包。截图：`/tmp/xmt-published-archive-list-error-1440.png`。
- 修改文件：`src/pages/Resources.tsx`、`tests/browser/published-archives.spec.ts` 及版本/改造说明文档。
- 数据库/API 变化：无；所有操作仅针对本机隔离内存夹具，控制端点只安排一次预期读取失败。
- 风险与边界：真实归档、用户与服务端均未访问；Android 仅同步版本元数据至 70832，未构建 APK；仅本地修改，不提交、推送或部署。其它 B8 写入/读取路径与 B4/B5 全站主题/响应式审计继续开放，G 中依赖明确产品规则/可信统计源的范围未关闭。
- 下一阶段：继续按清单检查尚未验收的写入结果与页面读取空态，优先选择可在本机隔离验证的路径。

## v7.8.31 改造清单续进度：资料详情删除防重复与处理中保护

- B8：资料详情删除增加同步互斥，避免 React 忙碌状态生效前的快速连点重复写入。共用确认弹窗在服务端写入期间锁定确认、取消、关闭、Esc 和遮罩关闭入口；删除失败继续保留详情与确认窗口，供用户明确重试。
- 验证：`npm run test:resource-hover-contrast-browser` 通过；隔离 DELETE 首次 503 后保留确认，重试时对同一确认按钮快速派发两次仅产生一次请求，等待期间各关闭路径不起作用，成功后删除隔离记录并返回列表。资料列表删除失败与只读列表恢复仍在同一回归中覆盖。`npm run test:topics-batch-mutation-browser`、`npm run test:anonymous-feedback-admin-responsive-browser`、`npm run test:workflow-designer-language-browser`、`npm run test:mobile-work-center-browser`、`npm run check`、定向 ESLint、`npm run build`、版本检查、版本治理、更新说明唯一性（228 个版本）、测试入口（191 个文件）、Studio 令牌（37 类）和 `git diff --check` 通过。并发启动时 Topics 浏览器页曾超时，串行重跑通过；构建仍提示已有超过 500 kB 的分包。截图：`/tmp/xmt-resource-delete-inflight-390.png`。浏览器插件当前不可用，按前端测试流程使用 Playwright 项目回归，未连接真实账号或业务服务。
- 修改文件：`src/components/common/ConfirmModal.tsx`、`src/pages/ResourceDetail.tsx`、`tests/browser/resource-table-hover-contrast.spec.ts` 及版本/改造说明文档。
- 数据库/API 变化：无；测试仅操作本机隔离内存夹具。
- 风险与边界：未访问真实资料或用户账号；Android 仅同步版本元数据至 70831，未构建 APK；仅本地修改，不提交、推送或部署。其它 B8 写入路径与 B4/B5 全站主题/响应式审计仍开放；G 中依赖产品规则/可信统计源的范围不因本次关闭。
- 下一阶段：继续从清单尚未验收的写入路径与页面级主题/响应式风险中选择可本地隔离验证的项目，不把本轮局部完成视为全站闭环。

## v7.8.30 改造清单续进度：创作详情右键菜单越界修复

- B4/B5：创作详情编辑器右键菜单此前按窗口坐标计算，却作为内容节点放在带 `backdrop-filter`/裁切的玻璃卡片下，菜单实际位置被偏移且可能伸出视口；把菜单/遮罩放到 `document.body` 并在布局阶段绑定右键事件，保留现有定位与 Studio 色彩令牌。
- 验证：`npm run test:production-review-browser` 通过，覆盖菜单在 390px 右边缘、深色左边缘的定位/子菜单翻转、亮暗主题、缩放工具栏及协作恢复。Playwright MCP 实际右键确认 390×844 下菜单边界为 x=182..382、y=237..836 并挂在 body；Chrome DevTools MCP 交叉确认相同亮色结果及 320×844 深色无溢出；控制台无错误。`npm run test:topics-responsive-browser`、`npm run test:retro-action-table-responsive-browser`、`npm run test:production-review`、复盘权限测试、版本同步合同、版本检查、更新说明唯一性（227 个版本）、测试入口（191 个文件）、Studio 令牌（37 类）、类型检查、定向 ESLint、生产构建和 `git diff --check` 均通过。构建保留现有超过 500 kB 的分包提示。
- 修改文件：`src/components/editor/ContextMenu.tsx`、`tests/browser/production-review.spec.ts`、版本/更新说明与改造进度文档。
- 数据库/API 变化：无；没有写入稿件、权限或协作数据。
- 风险与边界：B4/B5 是全站审计；本次只关闭创作详情编辑器右键浮层这一局部问题。Android 仅同步版本元数据至 70830，未构建 APK；仅本地修改，不提交、推送或部署。
- 下一阶段：继续沿清单优先级检查其它详情页/编辑器工具栏、表格操作区的裁切与主题对比，并盘点尚未闭环的 B8 写入恢复；G 中待产品规则/可信数据范围继续保持开放。

## v7.8.29 改造清单续进度：复盘详情写入恢复覆盖

- B8：继续闭环复盘详情的结论保存、快照生成、发布与归档，验证页面级同步锁不仅防同一操作连点，也阻止不同写入口重叠；失败时保留当前内容/状态，重试须由用户明确发起。
- 验证：扩展 `npm run test:retro-action-table-responsive-browser`，隔离内存夹具对四类请求分别注入延迟 503 与成功重试；覆盖双击只发送一次、失败不提前改变内容/状态、重试后按服务端结果更新和其它写入口锁定。Playwright MCP 与 Chrome DevTools MCP 交叉核验结论保存失败保留/重试成功、快照生成失败保留/重试成功及 320px 无横向溢出。版本检查、更新说明唯一性（226 个版本）、类型检查、定向 ESLint、测试入口（191 个文件）、Studio 令牌（37 类）、版本同步合同、复盘权限测试、生产构建及 `git diff --check` 通过；`npm run test:retrospectives` 需要 `TOKEN`，本机未执行已认证 API 冒烟。构建保留仓库既有超过 500 kB 的分包提示。
- 修改文件：`tests/browser/retro-action-table-responsive.spec.ts`、版本/更新说明、改造清单进度与文档索引。
- 数据库变化：无；仅本机隔离内存夹具接受写入测试。
- 风险与边界：无 API、权限规则或真实复盘数据变化。Android 仅同步版本元数据至 70829，未构建 APK；仅本地修改，不提交、推送或部署。B8 其它模块写入路径、B4/B5 全站主题/响应式审计与 G 中仍待产品规则/可信数据范围继续开放。
- 下一阶段：继续改造清单中尚未闭环的写入操作反馈与恢复；并行核对 B4/B5 全站主题和窄屏覆盖，不把当前复盘模块进度视为 B8 完成。

## v7.8.28 改造清单续进度：复盘详情写入同步互斥

- B8：复盘详情页所有写入共用同步锁，涵盖生成快照、保存结论、发布、归档、新建行动项与更新行动项，防止 React 忙碌态更新前的重复点击以及不同写入相互覆盖。行动项列表、详情抽屉及结论编辑在写入期间锁定相关输入，失败后保留待重试内容，成功后按服务端响应更新；日报风险转行动项失败保留选择和表单，成功后清空当前转换入口。
- 验证：扩展 `npm run test:retro-action-table-responsive-browser`，隔离夹具覆盖行动项 PATCH 快速双击仅一次、503 后状态/结果保留、明确重试成功及详情抽屉快速双击仅一次；日报风险转行动项双击仅一次 POST、失败保留选择/输入、显式重试成功并清空当前入口；亮/暗主题 × 320/390/1440px 回归通过。Playwright MCP 与 Chrome DevTools MCP 在本机隔离夹具分别核对失败单次写入、失败内容保留、重试成功；Chrome DevTools MCP 控制台仅记录预期注入的 503。
- 修改文件：`src/pages/RetrospectiveDetailPage.tsx`、`src/components/retrospectives/RetroActionTable.tsx`、`RetroActionDetailDrawer.tsx`、`RetroSummaryEditor.tsx`、`RetroDailyRiskPanel.tsx`、`tests/browser/retro-action-table-responsive.spec.ts`、版本/更新说明及改造进度文档。
- 数据库变化：无；API 与权限规则不变，所有写入仅针对本机隔离内存夹具，未触及真实复盘数据。
- 风险与边界：Android 仅同步版本元数据至 70828，未构建 APK；仅本地修改，不提交、推送或部署。B8 其他模块写入路径、B4/B5 全站审计及 G 中仍待产品规则/可信数据的范围继续开放。
- 下一阶段：继续盘点改造清单内未闭环的写入反馈和全站主题/响应式审计；不将本轮复盘中心改进视为 B8 全项完成。

## v7.8.27 改造清单续进度：行动项创建结果与表单保留

- B8：行动项表单不再在创建请求开始时提前清空。服务端确认成功后才清空，失败保留标题/说明供重试；请求期间锁定所有表单字段并使用同步锁阻止重复创建。
- 验证：扩展 `npm run test:retro-action-table-responsive-browser`，隔离内存夹具覆盖双击仅一次 POST、503 后标题/说明保留、明确重试成功后行动项列表更新并清空已提交内容；亮/暗主题 × 320/390/1440px 回归通过。
- 边界：无 API、数据库、权限规则或真实复盘数据变化；行动项请求仅写入本机隔离内存夹具。Android 仅同步版本元数据至 70827，未构建 APK。仅本地修改，不提交、推送或部署；B8 其它写入路径、B4/B5 全站审计及 G 中待产品规则/可信数据的范围仍开放。

## v7.8.26 改造清单续进度：新建复盘防重与失败恢复

- B8：新建复盘除按钮加载态外增加同步互斥，快速重复触发不会并发创建；失败时保留窗口和表单输入以供明确重试，成功后仍以服务端返回详情导航。
- 验证：扩展 `npm run test:retrospective-list-responsive-browser`，隔离内存夹具覆盖双击仅一次 POST、首次 POST 503 后窗口和标题保留、明确重试成功进入详情；亮/暗主题 × 320/390/1440px 列表回归通过。
- 边界：无 API、数据库、权限规则或真实复盘数据变化；创建请求仅写入本机隔离内存夹具。Android 仅同步版本元数据至 70826，未构建 APK。仅本地修改，不提交、推送或部署；B8 其它写入路径、B4/B5 全站审计及 G 中待产品规则/可信数据的范围仍开放。

## v7.8.25 改造清单续进度：复盘详情与日报风险读取恢复

- B8：复盘详情 GET 失败不再误报“复盘不存在或当前账号不可访问”；已有详情刷新失败时保留上次成功内容。日报风险 GET 失败不再误示无风险，保留已有风险，读取不确定时禁用转行动项；两处均可只读重试。
- 验证：扩展 `npm run test:retro-action-table-responsive-browser`，隔离夹具覆盖详情/风险分别及连续 GET 503、独立恢复、旧详情/风险保留与风险转换禁用；亮/暗主题 × 320/390/1440px 回归通过。Playwright MCP 与 Chrome DevTools MCP 交叉验证初次失败/恢复；业务请求均为 GET，仅本地 QA 控制端点使用 POST。
- 边界：无 API、数据库、权限规则或真实复盘数据变化。Android 仅同步版本元数据至 70825，未构建 APK；仅本地修改，不提交、推送或部署。B8 其它操作路径、B4/B5 全站审计及 G 中待产品规则/可信数据的范围仍开放。

## v7.8.24 改造清单续进度：复盘中心读取错误与数据保留

- B8：复盘列表与个人行动项失败时显示各自的明确错误和只读重试，不再把故障伪装成空列表或静默清空；二次刷新失败时保留最近一次成功数据。
- 验证：扩展 `npm run test:retrospective-list-responsive-browser`，隔离夹具分别注入两类 GET 503、验证各自恢复，以及已加载数据在再次读取失败时继续显示。Playwright MCP 与 Chrome DevTools MCP 交叉验收错误态/恢复；亮暗主题 × 320/390/1440px 原有可见性回归通过。错误状态采用局部状态，避免全局通知引起重复加载。
- 边界：无 API、数据库、权限规则或真实复盘数据变化；业务请求均为读取，仅 QA 夹具通过本地控制端点安排一次性故障。Android 仅同步版本元数据至 70824，未构建 APK。仅本地修改，不提交、推送或部署；B8 其它操作路径、B4/B5 全站主题/响应式审计及 G 中仍需产品规则/可信数据的范围继续开放。

## v7.8.23 改造清单续进度：人员管理操作日志读取恢复

- B8：操作日志初次读取失败显示明确错误和只读重试，不再清空数据后误示“暂无操作日志”；已有日志在再次读取失败时继续保留。
- 验证：扩展 `npm run test:mobile-work-center-browser`，隔离夹具覆盖初次 GET 503→重载恢复，以及已有记录情况下重载 503→记录保留→再次只读恢复，四次日志请求均为 GET。
- 边界：无 API、数据库、权限规则或真实日志/用户数据变化。Android 仅同步版本元数据至 70823，未构建 APK。仅本地修改，不提交、推送或部署；B8 其它操作路径、B4/B5 全站主题/响应式审计及 G 中仍需产品规则/可信数据的范围继续开放。

## v7.8.22 改造清单续进度：人员管理删除与状态切换互斥

- B8：启用/禁用与创建、编辑、删除共用同步写入锁，防止快速重复切换或跨操作并发。删除取消不发请求；删除失败保留用户行与确认框，服务端确认后立即更新当前列表。
- 验证：扩展 `npm run test:mobile-work-center-browser`，覆盖启用/禁用双触发仅一个 PUT、删除取消无写入、延迟期间双确认仅一个 DELETE、503 失败保留确认状态和显式重试成功；移动工作流 320/390px 回归通过。
- 边界：无 API、数据库、权限规则或真实用户数据变化，写请求仅针对本机隔离内存夹具。Android 仅同步版本元数据至 70822，未构建 APK。仅本地修改，不提交、推送或部署；B8 其它写入路径、B4/B5 全站主题/响应式审计及 G 中仍需产品规则/可信数据的范围继续开放。

## v7.8.21 改造清单续进度：角色权限读写反馈与安全删除

- B8：角色列表/权限清单失败会显示不可用说明和只读重试，避免错误空态；角色创建/更新的服务端成功与后续 GET 失败拆分，已确认信息持续显示，恢复只重读列表。创建/更新/删除以同步锁防重复；删除增加确认框，失败保留行和确认入口，成功后从当前列表即时移除。
- 验证：扩展 `npm run test:workflow-designer-language-browser`，覆盖角色/权限清单分别读取 503→只读重试、创建双触发仅一个 POST、创建/更新成功后刷新失败→只读恢复、删除取消无写入及删除失败→重试成功。Playwright MCP 与 Chrome DevTools MCP 交叉复核删除确认保留和创建后只读恢复；Chrome DevTools MCP 在 390px 检查页面宽度/操作按钮。
- 边界：无 API、数据库、权限规则、权限选择内容或真实角色数据变化；所有变更请求仅写入隔离内存夹具。Android 仅同步版本元数据至 70821，未构建 APK。仅本地修改，不提交、推送或部署；B8 其它写入路径、B4/B5 全站主题/响应式审计及 G 中仍需产品规则/可信数据的范围继续开放。

## v7.8.20 改造清单续进度：首页公告板写入确认与列表恢复

- B8：公告板读取改用统一公告 API；初次 GET 失败提供只读重试，不再显示错误空态。创建成功不再本地伪造编号、时间或操作人；创建/删除使用同步锁。删除前确认且失败保留原行/窗口；写入成功后先更新确定状态。后续列表失败持续说明服务端已确认，重试仅 GET。创建/删除入口沿用 `system:announcement`，无权限者不显示写入控件。
- 验证：新增 `npm run test:announcement-board-browser`，隔离 390px 浏览器覆盖初始读取 503→只读恢复、创建双击只一次 POST→列表 503→只读恢复、删除取消/503 保留确认→重试成功→列表 503→只读恢复，以及无权限视图。Playwright MCP 复核创建确认/读取恢复和删除取消；Chrome DevTools MCP 在暗色 390px 确认页面无横向溢出且无权账号无写入入口。
- 边界：无 API、数据库或权限规则变化，仅复用现有 API/权限；全部写入仅针对本机隔离内存夹具，没有真实公告数据变化。Android 仅同步版本元数据至 70820，未构建 APK。仅本地修改，不提交、推送或部署；B8 其它写入路径、B4/B5 全站主题/响应式审计及 G 中待产品规则/可信数据的范围继续开放。

## v7.8.19 改造清单续进度：移动网页通知偏好安全保存

- B8：移动网页通知偏好保存增加同步互斥，快速重复触发只发送一次请求；在途保存期间暂时禁用偏好切换，保证 UI 选择与请求快照一致。服务端失败时保留选择和重试入口，只有成功响应才提示已保存；切换按钮补充 `aria-pressed` 语义。
- 验证：新增 `npm run test:mobile-notification-settings-browser`，390px 隔离浏览器验证开关状态、同步双击只写一次、保存期间禁用切换、注入 503 后服务端值不变/用户选择保留，以及显式重试成功；预期 503 与其他运行时错误分开计数。
- 边界：无 API、数据库或权限规则变化；仅使用本机隔离内存夹具，没有读取或写入真实通知偏好。Android 仅同步版本元数据至 70819，未构建 APK。仅本地修改，不提交、推送或部署；B8 其它写入路径、B4/B5 全站主题/响应式审计及 G 中仍待产品规则/可信数据的范围继续开放。

## v7.8.18 改造清单续进度：设置中心备份删除确认与安全恢复

- B8：设置中心旧备份入口的创建/删除使用同步互斥，刷新清单与写入期间互不竞争。删除前增加“不可恢复”的二次确认；写入失败保留原条目与确认窗口，可安全重试；服务端确认后先从当前列表移除并关闭确认，再刷新列表。若刷新失败，持续提示已确认结果，ErrorState 重试仅 GET。创建成功后列表 GET 失败也保留已创建的说明。
- 验证：扩展 `npm run test:system-settings-browser`；内存夹具覆盖创建快速双击→成功后列表 GET 503→只读恢复，删除弹窗取消不写入、删除双击只发一次、DELETE 503 后确认窗口/原行保留、重试成功后列表 GET 503→明确确认提示及只读恢复。沿用浅/深主题、品牌 Logo 和 390/1440px 设置回归。
- 边界：不访问或删除真实备份文件；无 API、数据库、权限或真实业务数据变化。Android 仅同步版本元数据至 70818，未构建 APK。仅本地修改，不提交、推送或部署；B8 其它写入点、B4/B5 全站主题/响应式审计及 G 中仍待产品规则/可信数据的范围继续开放。

## v7.8.17 改造清单续进度：桌面个人设置写入防重复提交

- B8：桌面通知偏好、个人资料和密码更新各增加同步互斥，阻止 React 忙碌态尚未渲染时的快速重复写入。服务端失败时通知偏好/资料/密码输入仍可重试；密码字段仅在服务端确认成功后清空。
- 验证：扩展 `npm run test:system-settings-browser`，隔离延迟 API 下对三类保存快速双击，确认每次仅有一条请求；再注入 503，确认持久值未改变、资料和密码仍保留并可显式重试，密码成功后才清空。保留原系统主题、品牌 Logo 和 390/1440px 设置回归。
- 边界：无 API、数据库、权限或真实业务数据变化；仅使用本机隔离夹具。Android 仅同步版本元数据至 70817，未构建 APK。仅本地修改，不提交、推送或部署；B8 其它写入点、B4/B5 全站主题/响应式审计及 G 中仍待产品规则/可信数据的范围继续开放。

## v7.8.16 改造清单续进度：移动网页个人资料重复请求保护

- B8：移动网页个人资料保存增加同步锁，在 React 忙碌态更新前也能拦截同一轮快速重复触发。失败后仍保留已编辑的姓名和邮箱，成功重试后显示保存确认并更新当前账号状态。
- 验证：扩展 `npm run test:mobile-work-center-browser`，隔离 API 延迟期间对保存按钮双击，确认仅一条 PUT；首次 503 后输入内容保留，第二次显式重试成功。整套 320/390px 工作台、选题、消息、日报与拍摄/发布流程通过。
- 边界：无 API、数据库、权限或真实业务数据变化，仅使用本机隔离夹具。Android 专项继续延期；版本号仅同步至 7.8.16/70816，未构建 APK。仅本地修改，不提交、推送或部署；B8 其它写入点、B4/B5 全站主题/响应式审计及 G 中仍待产品规则/可信数据的范围继续开放。

## v7.8.15 改造清单续进度：选题模板读取错误态与操作互斥

- B8：选题模板初次 GET 失败时区分“列表不可读”和“确实为空”，显示不可用说明及只读重载。创建/更新/删除与列表重载共用同步锁，写入处理中不允许重复提交或并发改动。
- 验证：扩展 `npm run test:workflow-designer-language-browser`，隔离首次模板 GET 503 后重试仅执行 GET；延迟创建期间连续提交两次，确认 POST 仅一次；写入成功后列表 GET 503 仍保留确认提示并只读恢复。类型、定向 lint 和审批流/权限页面原回归通过。
- 边界：无 API、数据库、权限或真实业务数据变化，仅使用本机隔离内存夹具。Android 仅同步版本元数据至 70815，未构建 APK；仅本地修改，不提交、推送或部署。B8 其它写入点、B4/B5 全站主题/响应式审计及 G 中仍待产品规则/可信数据的范围继续开放。

## v7.8.14 改造清单续进度：创作建议反馈防重复提交

- B8：数据创作建议的“暂不采用”与将依据加入选题草稿所触发的采纳反馈，按具体建议/证据加同步锁，避免反馈按钮状态尚未刷新时重复写入。忙碌状态改为按依据集合管理，互不覆盖其他建议；失败提示和显式重试保留。
- 验证：扩展 `npm run test:creator-topic-suggestions-browser`，隔离 API 延迟期间连续分发两次暂不采用和采纳事件，分别确认各只有一次反馈请求；原失败重试、权限/样本门槛、草稿保留和 1440/390/320px 回归通过。
- 边界：无 API、数据库、权限或真实业务数据变化，仅使用本机隔离内存夹具。Android 仅同步版本元数据至 70814，未构建 APK；仅本地修改，不提交、推送或部署。B8 其它写入点、B4/B5 全站主题/响应式审计及 G 中仍待产品规则/可信数据的范围继续开放。

## v7.8.13 改造清单续进度：资料创建确认与详情只读恢复

- B8：资料创建成功后以服务端响应为准立即关闭表单、提示已确认并导航至详情；若详情或审计读取失败，不再统一显示“资料不存在”，而是显示可重试的暂时读取错误。创建来源详情持续说明已成功创建和不要重复创建；重试只执行详情读取，成功后保留创建确认状态。
- 验证：扩展 `npm run test:resource-hover-contrast-browser` 覆盖 POST 成功后首个详情 GET 503、持续确认提示、只读重试恢复和内容渲染。Playwright MCP 与 Chrome DevTools MCP 分别验证 POST 仅一次，重试只发 GET，最终显示同一资料。
- 边界：无 API、数据库、权限或真实业务数据变化，仅使用本机隔离内存夹具。Android 仅同步版本元数据至 70813，未构建 APK；仅本地修改，不提交、推送或部署。B8 其它写入点、B4/B5 全站主题/响应式审计及 G 中仍待产品规则/可信数据的范围继续开放。

## v7.8.12 改造清单续进度：灵感投票快速重复操作保护

- B8：灵感点赞和取消点赞属于切换写入；现在每条灵感在请求未结束时用同步锁阻止第二次写入，按钮同时进入禁用状态并提供 `aria-pressed` 当前状态。失败仍回滚本地乐观计数和按压状态，提示失败后可重试。
- 验证：扩展 `npm run test:inspiration-theme-contrast-browser`，隔离夹具注入首次投票 503，确认计数回滚；重试成功后延迟响应期间连续触发两次，服务端请求只增加一次。原亮暗主题与 320/390/1440px 布局/对比度及创建灵感去重回归通过。
- 边界：无 API、数据库、权限或真实业务数据变化，仅使用本机内存夹具。Android 仅同步版本元数据至 70812，未构建 APK；仅本地修改，不提交、推送或部署。B8 其它写入点、B4/B5 全站主题/响应式审计及 G 中仍待产品规则/可信数据的范围继续开放。

## v7.8.11 改造清单续进度：资料库与发布归档删除确认

- B8：新资料库删除经服务端确认后立即从当前列表移除；若紧接着资源列表 GET 失败，页面持续说明删除已确认、避免重复删除，并提供只读重载。重载成功前不开放继续删除，降低旧列表状态下重复操作风险。旧发布归档删除确认后本地移除对应记录并更新总数，不再等待额外归档列表读取；同步锁阻止双击重复删除。
- 验证：扩展 `npm run test:resource-hover-contrast-browser`，隔离注入删除后的资源列表 GET 503，验证已确认行即时消失、提示持续展示、重载仅 GET 且写入计数不变；扩展 `npm run test:published-archives-browser`，验证归档写入仅一次、页面即时移除且不额外读取。类型检查、定向 ESLint、资源页面主题/移动回归通过。
- 边界：无 API、数据库、权限或真实业务数据变化，仅使用本机内存夹具。Android 仅同步版本元数据至 70811，未构建 APK；仅本地修改，不提交、推送或部署。B8 其它写入点、B4/B5 全站主题/响应式审计及 G 中仍待产品规则/可信数据的范围继续开放。

## v7.8.10 改造清单续进度：桌面日报部分提交安全恢复

- B8：桌面日报“先保存草稿、后提交”现在将草稿保存和正式提交作为两个可确认阶段。草稿写入成功后立即保存服务端返回的日报及版本；若提交失败，页面持续说明草稿已保存且尚未提交，可基于同一日报和最新版本重试，避免旧版本冲突或重复创建。
- 验证：新增 `npm run test:daily-report-submit-recovery-browser`，本机隔离夹具注入提交 503，检查日报 ID 与版本状态保留、重试携带最新版本并使用同一日报成功。Playwright MCP 与 Chrome DevTools MCP 分别复核；只使用内存测试夹具，不连接真实账号或生产 API。
- 边界：无 API、数据库、权限或真实业务数据变化。Android 仅同步版本元数据至 70810，未构建 APK；仅本地修改，不提交、推送或部署。B8 其它写入点、B4/B5 全站主题/响应式审计及 G 中仍待产品规则/可信数据的范围继续开放。

## v7.8.9 改造清单续进度：选题批量操作确认与列表刷新

- B8：选题批量审核/删除逐项记录服务端结果；成功项立即更新当前页面，失败项保持选中而不诱导整体重做。部分成功后若选题列表 GET 失败，持续展示已确认成功数量和失败项数量，并提供只读“重新加载列表”；重载不重复任何已确认写入。处理中禁用批量操作并用同步锁拦截重复提交。
- 验证：新增 `npm run test:topics-batch-mutation-browser`，隔离夹具分别覆盖删除和审核的单项失败、另一项成功后列表 GET 503；检查失败项仍选中、服务端已确认状态正确，以及重试只增加一次 GET、写请求计数不变。
- 边界：无 API、权限、数据库或真实业务数据变化；浏览器仅使用本机内存夹具。Android 仅同步版本元数据至 70809，未构建 APK；仅本地修改，不提交、推送或部署。B8 其余写入点、B4/B5 全站主题/响应式审计及 G 中待产品规则/可信数据的范围继续开放。

## v7.8.8 改造清单续进度：抖音关联操作确认与发布列表刷新

- B8：抖音自动关联与人工关联/解除经服务端确认后，随后发布列表 GET 失败时持续提示操作已完成，提供只读列表重载；重载不会再次执行 reconciliation 或关联写入。
- 验证：扩展 `npm run test:publishing-hover-contrast-browser`，隔离自动关联及人工关联的 GET 503 故障注入，确认写入各仅一次、当前列表错误提示可读、重试只 GET；亮暗对比度与 390px 原回归通过。Playwright MCP 在本机夹具复核自动/手工关联，Chrome DevTools MCP 独立复核自动关联。
- 边界：无 API、权限、数据库或真实业务数据变化；浏览器仅操作本机内存夹具。Android 仅同步版本元数据至 70808，未构建 APK；仅本地修改，不提交、推送或部署。B8 其它写入点继续盘点；B4/B5 全站主题/响应式审计及 G 中待产品规则/可信数据的范围继续开放。

## v7.8.7 改造清单续进度：备份创建确认与清单刷新

- B8：备份创建成功以服务端响应为准；后续服务器备份清单 GET 失败时持续说明备份已创建，提供只读“重新加载清单”，避免重复创建。没有可显示记录且清单加载失败时使用不可用状态，不误显示“没有发现备份文件”。同步提交锁防止快速重复创建。
- 验证：扩展 `npm run test:mobile-work-center-browser`，隔离 `/api/backup/create` 记录确认写入，并注入随后 `/api/backup/inventory` GET 503；验证持久提示、空态保护、GET-only 重试后文件出现且创建计数不变。`npm run check` 与定向 ESLint 通过。
- 边界：仅隔离夹具模拟备份，未创建真实备份文件；无 API、权限、数据库或真实业务数据变化。Android 仅同步版本元数据至 70807，未构建 APK；仅本地修改，不提交、推送或部署。B8 其它写入点继续逐项盘点；B4/B5 全站主题/响应式审计及 G 中仍待产品规则/可信数据的范围继续开放。

## v7.8.6 改造清单续进度：人员管理写入确认与列表刷新

- B8：人员创建/编辑成功以服务端响应为准；确认后关闭编辑窗口并即时保留已确认的本地编辑字段。后续用户列表读取失败时持续显示确认说明，提供只读“重新加载列表”，初始列表加载失败不伪装为空列表；重试不会重发写请求。同步提交锁和表单忙碌状态，字段标题与输入控件建立可访问名称关联。
- 验证：扩展 `npm run test:mobile-work-center-browser`，隔离创建与编辑成功后分别注入一次 `/api/users` GET 503；验证服务端确认提示、当前页面不呈现错误空态、只读重载恢复，以及创建/更新计数均不因重试增加。`npm run check` 和定向 ESLint 通过。
- 边界：无 API、权限、数据库或真实业务数据变化。Android 仅同步版本元数据至 70806，未构建 APK；仅本地修改，不提交、推送或部署。B8 其它写入点继续逐项盘点；B4/B5 全站主题/响应式审计及 G 中仍待产品规则/可信数据的范围继续开放。

## v7.8.5 改造清单续进度：成片制作操作确认与列表刷新

- B8：成片制作计划创建、删除和完成与后续列表读取分开处理；删除/完成经服务端确认后立即更新当前页，创建成功后关闭表单并显示已确认提示。读取失败时显示持续“已确认操作、列表未刷新”的说明，提供只读“重新加载列表”；初始列表读取失败也不再显示为“暂无制作计划”。统一同步锁、忙碌态和禁用状态防止重复/冲突写入；写入失败仍按原状态保留表单或确认框。
- 验证：扩展 `npm run test:mobile-work-center-browser`，在 320px 隔离移动浏览器验证完成写入成功→列表 GET 503→保留已完成状态、移除重复完成入口→只读重载恢复；重试仅增加列表 GET、完成 PUT 计数不变。既有 320/390px 移动工作台、选题、日报、流程状态回归通过。类型检查、定向 ESLint 及构建门禁继续执行。
- 边界：无 API、权限、数据库或真实业务数据变化。Android 仅同步版本元数据至 70805，未构建 APK；仅本地修改，不提交、推送或部署。B8 其它写入点继续逐项盘点；B4/B5 全站主题/响应式审计及 G 中仍待产品规则/可信数据的范围继续开放。

## v7.8.4 改造清单续进度：选题资料关联即时反馈

- B8：关联资料和解除关联经服务端确认后立即更新本地资料列表，不再通过后续列表 GET 才反映结果；搜索结果仅在关联确认后移除，解除确认弹窗仅在写入成功后关闭。同步写入锁、忙碌态和禁用状态避免快速重复或相互冲突的关联操作；初始资料列表未读成功前不开放关联入口。
- 验证：扩展 `npm run test:topic-stage-record-repair-browser`，隔离确认关联/解除关联各仅发一次 mutation，成功后页面即时显示/移除资料，且两类写入均不触发额外资料列表读取；保留现有桌面缩放、只读、移动及阶段记录修复回归。
- 边界：无 API、权限、数据库或真实业务数据变化。Android 仅同步版本元数据至 70804，未构建 APK；仅本地修改，不提交、推送或部署。B8 全量写入反馈盘点、B4/B5 全站主题/响应式审计及 G 中仍待产品规则/可信数据的范围继续开放。

## v7.8.3 改造清单续进度：匿名意见操作确认与列表刷新分离

- B8：状态更新、公开/隐藏切换、回复和删除在服务端确认后先更新当前行；回复确认后关闭编辑框，删除确认后立即移除行。后续列表读取失败时，页面明确写入已成功、保留当前状态并提供只读“重新加载列表”，重试不会重复操作；失败的写请求仍保留原状态/窗口。同步锁及忙碌状态防止重复操作。
- 验证：`npm run test:anonymous-feedback-admin-responsive-browser` 覆盖状态、公开、回复、删除各自写入成功后列表 GET 503，以及失败写入不乐观更新；核实各只写一次、重试只增加 GET、320px 提示无横向溢出，并保留亮暗主题 × 320/390/1440px 操作可见性与对比度回归。Playwright MCP 复核状态更新后只读重试，Chrome DevTools MCP 复核删除行即时移除及只读恢复；两边控制台仅记录预期注入的 503。
- 门禁：`npm run check`、`npm run build`、`npm run version:check`、`npm run test:changelog-governance`（200 个唯一版本）、`npm run test:studio-token-usage`（37 类令牌）、`npm run test:entrypoints`（187 个测试入口）、定向 ESLint 与 `git diff --check` 通过。构建仍提示既有大分包。
- 边界：无 API、权限、数据库或真实业务数据变化。Android 仅同步版本元数据至 70803，未构建 APK；仅本地修改，不提交、推送或部署。B8 全量写入反馈盘点、B4/B5 全站主题/响应式审计及 G 中仍待产品规则/可信数据的范围继续开放。

## v7.8.2 改造清单续进度：运营复盘报告写入与列表刷新分离

- B8：运营复盘报告生成/删除写操作与后续报告列表读取独立反馈。服务端确认生成后立即说明已生成；确认删除后先从当前列表移除并切换当前报告。若刷新失败，保留成功结果并显示只读“重新加载报告”入口，提示不要重复执行写操作。同步锁阻止快速重复写入。
- 验证：`npm run test:creator-reports-browser` 隔离注入报告生成/删除成功后的列表 GET 503，确认提示不误报写入失败、生成/删除各只请求一次、删除行立即移除，重试只发报告列表 GET 并能恢复；保留旧口径报告、亮暗主题与 390px 移动回归。Playwright MCP 与 Chrome DevTools MCP 在仅绑定本机的同一隔离夹具中独立复核生成确认、GET 503 提示、只读重试及写入计数；浏览器控制台仅有预期注入的 503。
- 门禁：`npm run check`、`npm run build`、`npm run version:check`、`npm run test:changelog-governance`（199 个唯一版本）、`npm run test:studio-token-usage`（37 类令牌）及定向 ESLint、`git diff --check` 通过。生产构建仍提示既有大分包。
- 边界：无 API、权限、数据库或真实业务数据变化。Android 仅同步版本元数据至 70802，未构建 APK；仅本地修改，不提交、推送或部署。B8 全量操作反馈盘点、B4/B5 全站主题/响应式审计，以及 G 中仍待产品规则/可信数据的范围继续开放。

## v7.8.1 改造清单续进度：灵感提交结果与重复操作保护

- B8：灵感创建接口返回服务端确认保存的记录，页面将其直接加入当前筛选结果并显示成功反馈，不依赖 Socket 广播；提交期间同步禁用按钮并用同步锁阻止快速重复调用。通知只订阅稳定动作，避免通知状态更新触发不必要的列表读取。
- 验证：扩展 `npm run test:inspiration-theme-contrast-browser`，隔离响应模拟实际新记录；确认创建后列表立即显示且没有附加 GET，重复触发只产生一次 POST，提交成功提示可见；原有投票失败回滚、灵感实时评论提示、亮暗主题及 320/390/1440px 响应检查继续通过。
- 边界：创建响应仅增加字段，无权限或数据库结构变化；测试均为隔离夹具，未写入真实业务数据。Android 仅同步元数据至 70801，未构建 APK；仅本地修改，不提交、推送或部署。B8 全量 mutation 反馈清点、B4/B5 全站审计及 G 中需产品规则/可信数据源的范围仍开放。

## v7.8.0 改造清单续进度：日历创建后的读取反馈

- B8：日历事件创建经服务端确认后，先关闭创建表单并显示成功；如果后续日历/选题读取失败，错误页持续标明具体事件已创建，说明“重新加载日历”只会重读数据、不应重复创建。失败的创建仍保留表单并可重试。
- 验证：扩展 `npm run test:mobile-work-center-browser`，在 320px 与 390px 隔离页面分别覆盖创建接口失败后表单保留、重试创建成功、随后日历 GET 503、已确认结果提示及 GET-only 重试恢复；断言重试不增加创建请求，恢复后能看到事件。页面无横向溢出。
- 边界：无 API、数据库、权限或真实业务数据变化；Android 仅同步版本元数据至 70800，未构建 APK。仅本地修改，不提交、推送或部署。B8 全量操作反馈清点与 B4/B5 全站主题/可见性审计仍开放；G 中尚待产品规则或数据定义的范围不变。

## v7.7.0 改造清单续进度：发布操作写入与列表刷新反馈

- B8：发布记录创建、更新、删除的服务端写入结果与后续列表 GET 分开反馈。成功写入后，列表读取失败会持续说明已确认操作并提示只重试读取、不重复提交；删除行先从当前状态移除，且说明汇总可能需重读。错误提示不再叠加临时通用通知。390px 下消息占满可读宽度，重试按钮位于消息下方。
- 验证：扩展 `npm run test:publishing-hover-contrast-browser`，覆盖删除 API 503 时确认框保留/重试、DELETE 成功后 GET 503 时移除该行，以及 POST 成功后 GET 503 时保留已确认结果；两类操作重试都仅发 GET。亮/暗主题关键发布数据对比度 ≥4.5:1，390px 告警排版与无横向溢出通过。Playwright MCP 与 Chrome DevTools MCP 分别核对桌面/390px 移动页面的确认、告警和恢复态。
- 其他：`npm run test:production-review-browser`、`npm run test:login-theme-contrast-browser` 通过。通用浅色对比脚本因默认依赖的本地 5175 服务未运行而无法执行，登录专用隔离测试通过；B4/B5 全站审计未因此关闭。
- 边界：无 API、数据库、权限或真实业务数据变化；Android 仅同步至 7.7.0/70700，未构建 APK。仅本地修改，不提交、推送或部署。B8 全量操作反馈盘点、B4/B5 全站审计仍开放；G 专属审稿人责任规则、播放骤降可信口径及完整跨模块团队概览仍待产品规则与数据边界。

## v7.6.0 改造清单续进度：创作写入成功与列表刷新反馈

- B8：创作管理列表创建/更新的服务端写入与后续列表刷新分开处理。写入成功后即关闭编辑并提示成功；若列表 GET 失败，顶部显示“已确认写入、列表未刷新”的具体记录与只读重试，不再错误提示创建/更新失败。编辑字段立即写回当前行，刷新失败保留该状态。
- 防重复：保存请求期间按钮禁用并由同步 ref 拦截重复点击；创建/更新均只提交一次，重试按钮只重新读取列表。实时新增触发列表刷新失败时显示明确的陈旧状态提示及相同重试入口。
- 验证：新增 `npm run test:production-list-feedback-browser`，隔离注入创建/更新成功后 GET 503，覆盖双击创建一次、成功/失败反馈区分、编辑字段保留和重试不重复写入；`npm run test:production-list-update`、`npm run check`、`npm run build`、定向 ESLint、`npm run version:check`、更新说明唯一性（195 版）、Studio 令牌门禁（37 类）及 `git diff --check` 均通过。项目 Playwright、Playwright MCP 与 Chrome DevTools MCP 桌面流程均显示明确告警；独立重试成功加载已确认新稿，控制台仅有夹具预期注入的 GET 503。
- 边界：无 API、数据库、权限、工作流或真实业务数据变化；Android 仅同步至 7.6.0/70600，未构建 APK。仅本地修改，不提交、推送或部署。B8 全量操作反馈盘点、B4/B5 全站审计仍开放；G 专属审稿人责任、播放骤降可信口径和完整跨模块团队概览仍待产品规则与数据边界。

## v7.5.0 改造清单续进度：首页待审核稿件任务

- G：首页关注事项接口增加待审核稿件精确计数与最多 8 条有界预览；桌面任务区和移动网页均可直达创作详情，任务按既有审核、消息、同步与发布优先级安排。
- 权限边界：仅具备 `production:update` 的账号收到任务；列表沿用 `canEditProduction` 的范围——管理员/内容生产角色可见全量，其他账号按选题创建者、负责人或当前创作记录操作人过滤。不返回稿件正文；已有审核状态、端点权限和审核通过行为不变。
- 责任边界：当前 schema 没有专属审核人字段；“待审核稿件”只表示当前账号有权限处理，不代表已经被指派。专属责任分配及是否禁止自审没有既定产品规则，因此本轮未新增字段、权限或限制。
- 验证：隔离 API 覆盖权限、创建者/负责人/当前创作操作人范围、越界记录过滤和正文不外泄；OpenAPI 合同覆盖响应；Playwright MCP 与 Chrome DevTools MCP 均验证首页任务次序及桌面/手机稿件直达。`npm run test:home-dashboard`、`npm run test:api-contract`、`npm run test:topic-stage-record-repair-browser`、`npm run check`、`npm run build`、`npm run version:check`、`npm run test:changelog-governance`（194 个唯一版本）、`npm run test:studio-token-usage` 与 `git diff --check` 通过；定向 ESLint 0 errors。生产构建仍有既有大分包警告。
- 边界：无数据库迁移、权限配置变化或真实业务数据写入；Android 仅同步至 7.5.0/70500，未构建 APK。仅本地修改，不提交、推送或部署。G 的专属审稿责任规则、可信播放骤降指标口径和完整跨模块团队概览仍未完成；B4/B5 全站审计及 B8 全量操作清点继续开放。

## v7.4.0 改造清单续进度：首页数据同步异常

- G：负责人首页新增各创作者账号同步异常摘要，按每个账号最新任务取值；最新已结束结果为失败/部分失败时展示，后续运行中任务暂时抑制旧异常，完整同步成功后自动移除。桌面与移动端提供有界列表、失败项状态/时间/负责人及账号定向直达；不返回底层错误原文。
- G：管理角色首页前六条任务优先保留消息、同步异常、审核、今日发布各一条，再补充其他事项，避免多条审核积压遮蔽发布安排。
- 范围：沿用 `creator_sync_tasks`、`creator:data:view` 和既有账号定向驾驶舱/同步记录接口。仅管理员/负责人且仍有创作者数据查看权限时返回；普通角色响应为空且不泄露汇总。播放骤降缺少阈值与可信统计口径，未新增告警。
- 验证：隔离 API 覆盖最新状态优先、失败/部分失败、运行中抑制、成功恢复、精确计数/最多 8 条预览、账号标签与负责人名称及非管理角色隔离；API 合同、桌面/390px Playwright 覆盖任务保留、对应账号跳转、手机无横向溢出通过。版本治理、类型检查、生产构建与差异门禁待本条验证后更新。
- 边界：无数据库迁移、权限配置变化或真实业务数据写入；Android 仅同步至 7.4.0/70400，未构建 APK。仅本地修改，不提交、推送或部署。G 中稿件审核责任/权限模型、播放骤降阈值与统计口径、完整团队跨模块概览仍未完成；B4/B5 全站审计和 B8 全量操作清点仍开放。

## v7.3.0 改造清单续进度：首页今日发布与待处理消息

- G：桌面与移动首页显示当前用户范围内当天待发布/已定时的平台安排，按发布时间排序；精确任务数与有界列表分开，桌面最多 8 项、移动最多 3 项。显示北京时间日期与时分；同一选题任一平台已发布后不再生成待办，“发布异常”视为已处理并排除。非全局角色范围按发布列表既有规则包含选题创建者、负责人或发布记录操作人。
- G：管理角色首页展示当前账号的未读、带站内业务链接消息，按账号 ID 隔离读取，任务跳转消息中心的“待处理”筛选；该筛选现在只取未读且带链接消息。加载失败提供独立重试，不改变消息已读状态。
- 验证：隔离 API 覆盖一个选题多平台待发计数、任一平台已发布排除整组、发布异常排除、未来排期排除和仅发布操作人可见；Playwright 桌面与 390px 页面覆盖排期、负责人任务优先级、今日发布跳转、消息筛选直达/查询口径、移动卡片、无横向溢出及原关注汇总失败→重试路径。类型检查、生产构建、版本治理及差异门禁已在后续收尾验证通过。
- 边界：无新路由、数据库迁移或权限规则；仅扩展现有首页汇总响应并沿用消息个人范围。Android 仅同步到 7.3.0/70300，未构建 APK。隔离数据，无真实消息写入/已读更改。仅本地修改，不提交、推送或部署。G 中稿件审核权限/责任模型、播放骤降阈值/口径及完整团队跨模块概览仍未完成；同步失败摘要后续在 v7.4.0 实施；B4/B5 全站审计和 B8 全量操作清点仍开放。

## v7.2.0 改造清单续进度：首页服务端关注事项汇总

- G：新增需登录的首页关注事项汇总接口；逾期、今天至两日内截止、当前阶段停留超过两日分别精确计数，类别可重叠而 `total` 按选题去重。完成和退回不进入阶段卡点统计；全部可见范围遵循现有 `canViewAllContent`，其他账号仅统计本人创建或负责的选题。
- 桌面首页展示最多 8 条优先事项，移动网页首页展示前三条并给出其余数量提示；两者计数查询覆盖授权的完整选题范围。汇总失败显示独立错误与重试，不让首页其他区块一起失败。OpenAPI 登记响应字段及有界列表合同。
- 验证：隔离测试覆盖未认证、管理者/个人范围、计数去重、严格两日边界、完成事项排除与预览上限；API 合同、桌面/390px 移动网页读取失败重试、无横向溢出、类型检查、生产构建和版本治理通过。
- 边界：无数据库迁移、权限规则变更或真实业务数据写入；Android 仅同步到 7.2.0/70200，未构建 APK。仅本地修改，不提交、推送或部署。待发布、待处理消息现于 v7.3.0 续做；G 中稿件审核、数据异常和完整团队跨模块概览仍未完成；B4/B5 全站审计和 B8 全量操作清点仍开放。

## v7.1.0 改造清单续进度：首页按职责组织“我的今日”

- G：工作台任务区不再对所有人显示同一标题和优先级；有审核职责的成员先看到待审事项，管理层显示“团队今日重点”，个人创作角色优先自己的稿件；发布任务只在已有 `workflow:publishing` 权限时出现。
- 验证：隔离浏览器检查编辑与负责人标题、待审事项在待发布任务之前；首页既有审核直达、权限保护、阶段停留时长和 3 条预览回归通过。类型检查、生产构建、版本/更新说明治理、测试入口及差异检查通过。
- 边界：仅本地改 UI 排序与说明，不新增 API、权限规则或数据库变更；Android 仅同步至 7.1.0/70100，未构建 APK。角色化任务范围仍受现有有界数据接口限制，团队完整卡点、稿件审核、临近截止和数据异常任务还需服务端聚合后才能可靠补齐；未把不完整数据描述成全团队统计。仅本地修改，不提交、推送或部署。

## v7.0.0 改造清单续进度：工作台阶段停留时间

- G：内容流阶段卡继续展示有界列表中最新三条选题，并显示各选题进入当前阶段后的停留时长。对缺少可信起点的存量数据显示“阶段时间待确认”。
- 数据与流程：新增 `topics.stage_entered_at` 可空字段，迁移 025 为 SAFE_EXPAND。常规创建与灵感转选题写入初始时间；审核、标准工作流、自定义审批流及多平台发布收敛时，在真实状态迁移事务内同时写阶段时间与更新时间。普通内容编辑不重置阶段时间。
- 历史边界：不使用 `topic_history.created_at` 或 `updated_at` 回填，因为已有来源存在混用/语义不等；不改变存量选题阶段，也不写入真实业务数据。
- 验证：旧 topics 表迁移可重复执行且既有行仍为 NULL；仓储回归覆盖创建、普通编辑、有效迁移和过期迁移；隔离 Playwright 覆盖首页三条预览与阶段时长。通过迁移就绪检查、类型检查、生产构建、版本/更新说明治理、Studio 令牌守卫及差异空白检查。版本与 Android 元数据同步到 7.0.0/70000，未构建 APK。
- 边界：仅本地修改；未提交、推送或部署。G 中角色化任务/团队卡点等、B4/B5 全站审计与 B8 全量操作清点仍开放。

## v6.1.25 改造清单续进度：首页审核待办直达

- G：工作台待审选题的“开始审核”现在携带一次性导航标记直达现有审核弹窗；详情加载后清除标记，不再要求用户在详情页二次寻找入口。内容流各阶段卡从两条扩为当前有界列表中按创建时间最新的三条选题。
- 权限与数据边界：只有当前账号仍有 `topic:audit` 且选题仍为待审时才打开弹窗；无权限/状态不符只显示普通详情；打开不自动提交审核，不改变现有意见、负责人和通过/驳回确认流程。
- 验证：`npm run test:topic-stage-record-repair-browser` 覆盖首页点击打开审核弹窗、无权限与非待审过期链接不显示弹窗、均无审核写入，以及阶段卡显示三条而不显示第四条；`npm run check`、生产构建及版本治理通过；定向 ESLint 0 errors，保留既有未使用变量/Hook 依赖警告。
- 边界：Topic 列表提供创建/更新时间，但不提供当前状态进入时间；因此本轮不把普通编辑时间伪称为阶段卡点时长，准确展示阶段停留时间仍待可靠数据源。无 API、权限规则、数据库或真实业务数据变化；Android 仅同步版本元数据至 60125，未构建 APK；仅本地修改，不提交、推送或部署。G 其他角色任务/团队卡点与 B4/B5 全站审计、B8 全量操作清点仍继续。

## v6.1.24 改造清单续进度：番茄钟通知去重与操作反馈收口

- B8：番茄钟到时根据页面前后台状态、桌面通知开关和浏览器权限在站内 toast 与系统通知间择一发送；前台不会与桌面通知重复，后台仅在用户启用且已授权时发出桌面通知。
- B8：延续补齐拍摄状态、选题模板/详情写入与随后刷新分离，以及灵感投票失败回滚，防止已确认写入被误报成失败或乐观状态静默残留。
- B8：系统默认配置、通知偏好及品牌设置补充真实浏览器保存反馈：注入 503 时服务端值不变、页面保留可重试选择，重试成功后再显示确认；Logo 选图仅本地预览，不伪装成即时上传。
- B8：品牌 Logo 明确是本页预览而非即时上传。隔离浏览器验证选图不改变服务端值、保存 503 时保留预览且不提示成功、明确重试成功后才持久化。
- B8：选题详情审核补充失败→重试浏览器验收；失败时保留审核弹窗且不改变状态，成功重试只写入一次并显示明确审核结果。
- B8：手机消息“全部已读”补充部分失败流程验收；一条成功、一条失败时显示数量，保留未读项并仅重试该项，重试后收敛为全部已读。
- B5：设置中心通知偏好表格不再使用固定白色 5% 分隔线，改为 Studio 边框令牌；浏览器实测浅/深主题的 tbody 分隔线均取值自主题令牌且保持 1px 可见。
- 验证：`npm run test:workflow-details-responsive-browser`、`npm run test:workflow-designer-language-browser`、`npm run test:inspiration-theme-contrast-browser`、`npm run test:pomodoro-notification-browser`、`npm run test:notification-routing`、`npm run test:system-settings-browser`、`npm run test:topic-stage-record-repair-browser`、`npm run test:mobile-work-center-browser` 通过；`npm run check`、`npm run build`、`npm run version:check`、版本治理、更新说明治理（187 个版本）、Studio 令牌守卫、`git diff --check` 通过。定向 ESLint 0 errors、1 条既有 `ShootingDetail.tsx` `appStore` hook 依赖警告；生产构建仍有既有大分包提示。
- 边界：无 API、权限、数据库或真实业务数据变化；Android 仅同步版本元数据，不构建 APK；仅本地修改，不提交、推送或部署。B8 全量 mutation 覆盖及 B4/B5 全站主题/可见性审计仍未完成。

### v6.1.23 后续推进：灵感投票失败反馈

- B8：灵感点赞 API 失败时不再静默吞错；撤销乐观点赞/计数变化后，显示投票未保存、状态已恢复及稍后重试提示。
- 验证：`npm run test:inspiration-theme-contrast-browser` 于隔离 320px 亮色夹具注入一次投票 503，验证计数回滚、错误提示可见、重试成功且总计仅两次投票请求（一次失败、一次成功）；亮/暗主题和 320/390/1440px 原有对比度/溢出回归通过，其它流程无写入。
- 边界：只改失败反馈与隔离浏览器回归，无 API、权限、数据库或真实业务数据变化；版本保持 6.1.23，仅本地修改，不提交、推送或部署。B8 全量 mutation 覆盖、B4/B5 全站审计仍未完成。

### v6.1.23 后续推进：选题模板 mutation 与列表刷新边界

- B8：选题模板新增/编辑/删除将服务端写入与随后列表刷新分开处理。写入确认后先按确认结果更新本地状态；刷新失败时明确提示不要重复保存/删除，并提供只重试列表读取的入口；写入失败仍保留原表单/记录和失败反馈。
- 验证：`npm run test:workflow-designer-language-browser` 隔离创建模板并注入一次列表 GET 503，验证创建已持久、用户收到不重复提交提示，点击“重新加载列表”后能看到模板且没有第二次 POST；审批流删除失败重试、权限页面及原有亮暗主题/窄屏回归继续通过。
- 边界：只改模板反馈与隔离浏览器回归，无 API、权限、数据库或真实业务数据变化；版本保持 6.1.23，仅本地修改，不提交、推送或部署。B8 全量 mutation 覆盖、B4/B5 全站审计仍未完成。

### v6.1.23 后续推进：拍摄状态写入与详情刷新边界

- B8：拍摄状态写入与后续详情读取分开处理。成片完成等状态已获服务端确认、但详情 GET 刷新失败时，保留已确认状态并警告用户重新加载确认、不要重复操作；写入本身失败仍显示原错误。
- 验证：`npm run test:workflow-details-responsive-browser` 隔离注入一次状态更新后 GET 503，断言 PUT 已成功、界面不再提供重复完成按钮、状态保留为已完成，重载后仍为已完成且写入仅一次；桌面缩放、移动布局和亮暗主题原回归通过。预期 HTTP 503 单独等待，其它页面/控制台错误仍须为零。
- 边界：只改状态反馈与隔离浏览器回归，无 API、权限、数据库或真实业务数据变化；版本保持 6.1.23，仅本地修改，不提交、推送或部署。B8 全量 mutation 覆盖、B4/B5 全站审计仍未完成。

### v6.1.23 后续推进：系统设置成功/失败反馈回归

- B8：扩展系统默认主题隔离浏览器回归，验证管理员保存成功后可见“系统设置已更新”；注入一次 503 后可见失败提示，持久值保持原值，重新加载仍应用已保存的默认主题。预期的 fixture 503 单独计数，其它页面异常和控制台错误仍须为零。
- 验证：`npm run test:system-settings-browser` 通过，覆盖 1440/390px、暗/亮默认主题、个人主题优先级及设置成功/失败反馈。
- 边界：仅扩充隔离回归与文档，无生产 API/数据库/真实账号写入；版本保持 6.1.23，仅本地修改，不提交、推送或部署。B8 全量 mutation 覆盖仍未完成。

### v6.1.23 后续推进：匿名意见与选题资料操作反馈

- B8：匿名意见管理的状态更新、公开/隐藏在服务端成功后增加明确成功提示；失败继续报错且不会乐观改写公开状态。选题资料解除关联成功后增加成功提示，并刷新关联列表；失败仍保留确认窗口与原关联。
- 资料删除：资料列表和详情补齐成功/失败反馈与重复提交保护；删除失败保留确认弹窗、数据和重试入口，详情只在服务端确认删除后导航离开。
- 确认框失败恢复：选题删除、发布记录删除、审批流模板删除、成片完成操作现在只有服务端成功才关闭确认框；失败提示可见、对话框保留，用户可在同一处重试。另核对消息清空、用户删除、创作稿删除和资源归档删除，失败路径会保留各自确认框。
- 验证：`npm run test:anonymous-feedback-admin-responsive-browser` 覆盖两主题 × 320/390/1440px、状态/公开成功、公开操作 503 失败及持久状态不变；`npm run test:topic-stage-record-repair-browser` 覆盖隔离选题详情中的解除关联成功和列表更新，同时既有桌面 80%–125% 缩放矩阵、只读与移动流程通过；`npm run test:resource-hover-contrast-browser` 覆盖资料列表与详情删除的 503 失败/成功重试及主题、窄屏对比回归；`npm run test:publishing-hover-contrast-browser`、`npm run test:workflow-designer-language-browser`、`npm run test:topics-responsive-browser` 和 `npm run test:mobile-work-center-browser` 覆盖本轮确认框失败→重试成功。仅注入的 503 被视为预期网络错误，其它浏览器错误仍须为零。
- 边界：只调整反馈与本地隔离浏览器夹具，无 API、权限、数据库或业务数据变化；版本保持 6.1.23，仅本地修改，不提交、推送或部署。B8 仍需逐项覆盖其它 mutation。

### v6.1.23 后续推进：选题详情写入成功与刷新失败边界

- B8：选题审核、阶段推进、阶段记录补齐和选题信息保存将服务端写入与详情重新读取分开处理。写入成功但页面刷新失败时，不再误报为操作失败或诱导重复提交；改为告知结果已保存并要求重新加载确认。选题信息保存同时将已确认快照设为新基线、保留写入期间出现的新编辑；写入本身失败仍保留原失败反馈。
- 验证：扩展 `npm run test:topic-stage-record-repair-browser`，隔离夹具分别让阶段记录补齐后 GET 和选题更新后 GET 各返回一次 503；断言写接口已持久化、页面提示“不要重复操作”、保存不再呈现未保存状态、重载后内容/阶段记录正确且没有重复 mutation。预期 HTTP/控制台 503 单独计数，其余网络/浏览器错误仍须为零；原桌面缩放、移动、只读及主题回归继续通过。
- B8：主题资产页与选题详情中的城市/人物/项目维度新增、移除均明确显示成功结果；主题资产页把成功提示保留在页面级状态，避免列表刷新时卡片卸载而丢失反馈。
- 验证：`npm run test:mobile-work-center-browser` 覆盖 320/390px 下选题详情维度新增与移除成功提示，以及主题资产页 503 失败后重试、成功提示跨列表刷新仍可见；`npm run test:publishing-assets-browser` 原资产归档页面回归通过。
- 门禁：`npm run test:topic-stage-record-repair-browser`、`npm run check`、`npm run build`、`npm run version:check`、版本/更新说明治理、Studio token 守卫及 `git diff --check` 通过。定向 ESLint 0 errors、6 warnings；构建仍提示已有多个大于 500KB 的 chunk。
- 边界：只改本地反馈边界与隔离回归，无 API、权限、数据库或真实业务数据变化；版本保持 6.1.23，不提交、推送或部署。B8 全量 mutation 覆盖、B4/B5 全站审计仍未完成。

### v6.1.23 后续推进：全局语义色透明度工具修复

- B5/C 设计系统：修正 `studio` 令牌的 Tailwind alpha 通道映射，补齐此前缺失的 `surface-elevated`，并保留 `*-soft` / 主按钮既有语义变量；另将遗留的 `studio-bg/card/border/text/danger/emerald` 类名接回对应 Studio token。此前部分透明度工具类与遗留语义类无法形成有效颜色。
- 编辑器体验：将选区工具栏、浮动工具栏和右键菜单中重复的内容高亮/文字色选项收敛到同一份稿件语义调色板；色值仍作为稿件内容格式保存，不随应用亮暗主题改变，也不改变既有正文格式。
- 验证：新增静态守卫确认源码引用的 37 种 Studio 色彩工具类全部已映射；`npm run test:production-review-browser` 通过，编辑器桌面/移动讨论、格式工具及协作恢复流程回归正常。灵感 alpha 及旧类名→规范 token 等值合同、选题列表、资料操作列、消息清空、发布列表五组隔离浏览器回归通过；移动工作中心/拍摄/发布列表回归在 320/390px 通过。亮暗主题下悬停表面真实生效，相关文字/图标对比断言通过，选题/资料窄屏操作仍可见，灵感状态页无溢出。Playwright MCP 与 Chrome DevTools MCP 独立隔离夹具复核 320px 深色徽标可见且页面未溢出，控制台无错误。
- 边界：只改设计令牌映射和验收记录，没有 API、权限、业务流程、数据库或业务数据变化；版本保持 6.1.23，仅本地修改，不提交、推送或部署。B4/B5 全站审计仍开放。

### v6.1.23 后续推进：灵感状态主题与表单可访问性

- B5：灵感卡片的“有新评论”状态改用 `studio-cyan-soft` 语义表面，与 `studio-cyan-contrast` 前景配对；不再借用普通表面色表达实时状态。
- B4/可访问性：灵感搜索和分类筛选补充可访问名称，提交灵感表单的标题、描述、分类显式关联标签；不改变筛选、提报或权限行为。
- 验证：`npm run test:inspiration-theme-contrast-browser` 通过，隔离浏览器通过 Socket.IO 真实事件触发“有新评论”，覆盖亮/暗主题 × 320/390/1440px，对比度均 ≥4.5:1、页面及提报弹窗无横向溢出、转化操作可见；表单只打开后取消，并断言没有业务写请求。Playwright MCP 在 320px 亮色实测徽标可见且页面宽 312px；Chrome DevTools MCP 在独立暗色会话复核事件徽标和零控制台错误。截图见 `/tmp/xmt-inspiration-comment-light-320.png` 与 `/tmp/xmt-inspiration-comment-dark-1440.png`。
- 边界：仅展示语义、表单名称和隔离回归变化；无 API、权限、数据库或业务数据变化。版本保持 6.1.23；仅本地修改，不提交、推送或部署。B4/B5 全站审计仍开放。

### v6.1.23 后续推进：复盘页面移动端表格操作可见

- B4：复盘列表详情按钮补充滚动底部避让距离；两个真实浏览器 MCP 交叉复核发现原测试的原生滚动没有避开固定导航，修正后在 320px 下直接测量按钮底边，确认高于导航顶边且无横向溢出。
- B4/B5：复盘详情行动项表的“详情/保存”列固定在横向滚动窗口右侧；手机上按钮纵向紧凑排列、桌面仍横排，详情页两列网格允许收缩，避免 1080px 表格撑宽整页。窄屏滚动到任一操作后均避开固定底栏，320px 下打开的行动项详情抽屉、关闭及保存控件均在视口内，外层卡片不裁切操作；“已逾期”徽标亮/暗主题文字对比度均实测 ≥4.5:1。
- 验证：`npm run test:retrospective-list-responsive-browser` 与 `npm run test:retro-action-table-responsive-browser` 通过，覆盖亮/暗主题 × 320/390/1440px；行动项详情仅打开后关闭，确认没有 POST/PATCH/PUT/DELETE 写入请求。Playwright MCP 与 Chrome DevTools MCP 对行动项详情在 320px 暗色与 1440px 桌面交叉检查通过，控制台无错误；未触碰原有浏览器标签。
- 视图记录：`/tmp/xmt-retro-action-table-light-320-viewport.png`、`/tmp/xmt-retro-action-drawer-light-320.png`；全页截图中固定导航位置可能随截图方式变化，底栏可达性以真实视口坐标断言和 MCP 测量为准。
- 最终门禁：匿名意见箱/管理回归、`npm run check`、`npm run build`、改动文件定向 ESLint、`npm run version:check`、版本/更新说明治理与 `git diff --check` 通过。构建仍有既有 >500KB 分包提示。
- 修改范围：`src/components/retrospectives/RetroList.tsx`、`src/components/retrospectives/RetroActionTable.tsx`、`src/pages/RetrospectiveDetailPage.tsx`、两项隔离浏览器回归和本地进度/更新说明。无 API、权限、数据库或业务数据变化；仅本地修改，不提交、推送或部署。
- 后续：B4 仍需继续审计更多详情操作、实际挂载浮层及不同系统/浏览器缩放；B5 仍需逐页复核全站浅色主题、悬停、徽标和错误/空状态。

### v6.1.23 后续推进：人员管理窄屏操作可见

- B4：人员管理用户表的启停、编辑和删除操作集中到响应式表格固定列；原状态列改为只读“已启用/已禁用”，并为图标操作补齐无障碍名称。操作列在 320px 下收窄，桌面保留舒适间距。
- 验证：`npm run test:mobile-work-center-browser` 通过。隔离 Playwright 覆盖 320px 亮色、390px 暗色及 1440px 桌面；横向滚动时操作列保持在视口内，页面不横向溢出，七种内置角色徽标、状态文字与启停操作文字在亮暗主题对比度均 ≥4.5:1。删除确认只打开后取消，断言没有发出 POST/PUT/PATCH/DELETE 用户请求。定向 ESLint、类型检查、`npm run build`、版本与更新说明治理、`git diff --check` 通过；全仓 ESLint 0 errors/315 warnings。
- MCP 边界：尝试用 Playwright MCP 打开本地验收地址时遇到 `ERR_CONNECTION_REFUSED`；Chrome DevTools MCP 仅保留旧测试页面，其本地服务端口已不再监听，因此没有用这两个 MCP 对本次新页面作交叉验收，也未触碰现有标签。此次以项目隔离 Playwright 为准。
- 边界：仅列表展示与浏览器回归变化，无 API、权限规则、数据库或业务数据改动；版本保持 6.1.23，仅本地修改，不提交、推送或部署。B4 其余详情操作/浮层及原生缩放、B5 全站浅色审计仍开放。

### v6.1.23 后续推进：权限管理角色卡片与图标操作

- B4/B5：将角色管理卡片验收从既有 390px 扩到 320px；编辑/删除图标按钮补充“角色名 + 操作”的无障碍名称。
- 验证：`npm run test:workflow-designer-language-browser` 通过，覆盖角色名称单行、编辑/删除操作位于 320/390px 视口内、两种主题默认/系统角色文字对比度 ≥4.5:1，以及自定义角色删除图标亮/暗主题 hover 对比度 ≥3:1。Playwright MCP 在 320px 实测页面无横向溢出、图标操作可达，浅色 hover 对比度 6.84:1；Chrome DevTools MCP 在深色主题交叉验证对比度 10.84:1，控制台无错误。MCP 检查发现旧 `hover:bg-studio-coral/10` 未生成有效背景，已改为 `hover:bg-studio-coral-soft`，并在回归中断言悬停背景确实变化。测试只悬停删除图标，未触发确认或删除；审批流编辑仅打开后取消。
- 边界：仅无障碍名称和隔离浏览器回归变化，无角色数据、权限规则、API 或数据库变动；版本保持 6.1.23。B4 的其他详情操作/浮层与原生缩放、B5 全站主题状态审计仍开放；不提交、推送或部署。

### v6.1.23 后续推进：选题列表窄屏操作与悬停对比

- B4：将既有选题列表固定操作列验收扩展到 320px/390px，横向滚动后查看/删除入口保持在视口内；原有 1366/1440/1920px × 80%–125% 缩放几何与裁切回归继续通过。
- B5：查看/删除图标按钮增加包含选题标题的无障碍名称；真实悬停复核发现旧 `hover:bg-studio-coral/10` 未生成背景，改用 `hover:bg-studio-coral-soft`，查看图标切换到 `studio-cyan-contrast`。隔离测试断言悬停背景非透明、两种主题图标对比 ≥3:1。
- 验证：`npm run test:topics-responsive-browser` 通过，覆盖桌面几何、窄屏固定操作列、标题/排序文字 hover 和两主题图标 hover。Playwright MCP 在 320px 测得页面内容宽 312px、删除入口位于 x=247 且宽 32px，浅色悬停背景 `rgba(159,18,57,0.08)`、对比 6.95:1；Chrome DevTools MCP 在 768px 深色复测操作位于视口内，悬停对比 10.40:1、控制台无错误。Playwright MCP 有 0 错误及 1 条既有 React Bits 兼容回退警告。
- 边界：仅样式、无障碍名称、隔离浏览器回归和说明变化；测试只悬停与测量，没有打开详情/删除或写入业务数据。版本保持 6.1.23；仅本地修改，不提交、推送或部署。B4 其他详情操作/浮层与 B5 全站主题状态审计继续。

### v6.1.23 续进度：选题批量操作主题对比

- B5：选题行选择控件公开 `aria-pressed` 状态；批量驳回改用珊瑚语义表面令牌，批量删除使用统一危险按钮，避免半透明旧色类不生效或按钮样式分叉。
- 验证：`npm run test:topics-responsive-browser` 覆盖亮/暗主题选择状态、批量驳回/删除悬停背景确实改变，以及操作文字对比 ≥4.5:1。Playwright MCP 隔离夹具复测：亮色驳回 7.12:1、删除 5.70:1；深色删除 9.57:1，选中状态均通过 `aria-pressed=true` 暴露。Chrome DevTools MCP 连接同一测试夹具时渲染为移动工作台，不包含桌面批量操作区，因此不将其记录为该控件的交叉验收；该夹具控制台无错误。
- 边界：只在隔离夹具勾选后悬停并取消选择，没有触发批量驳回、删除或业务数据写入；无 API、权限或数据库改动。版本保持 6.1.23，仅本地修改，不提交、推送或部署。B4 详情操作/浮层及 B5 全站主题状态审计继续。

### v6.1.23 续进度：资料表格操作可达与删除悬停

- B4：项目资料表格“操作”表头与单行操作固定在横向滚动视口右侧；320/390px 下查看/编辑/删除均无须先横向滚动即可触达。B5：删除图标改用 `studio-coral-soft` 悬停表面令牌，并为查看/编辑/删除名称附上资料标题，避免动作不可区分及浅色主题半透明悬停失效。
- 验证：`npm run test:resource-hover-contrast-browser` 通过；隔离夹具亮/暗主题 × 320/390px 覆盖核心操作可见和页面无横向溢出，并覆盖资料标题悬停、知识库选中分类及删除图标 hover。Playwright MCP 320px 量得操作图标 x=243、宽 32px，视口 278px、页面内容宽 312px；悬停图标对比亮色 6.73:1（背景 `rgba(159,18,57,0.08)`）、深色 10.67:1（背景 `rgba(255,122,147,0.14)`），hover 前透明、hover 后背景生效。控制台错误/警告均为 0；截图保存在 `/tmp/xmt-resource-table-actions-320-light.png`、`/tmp/xmt-resource-delete-hover-light.png` 与 `/tmp/xmt-resource-delete-hover-dark.png`。
- 边界：只悬停资料删除按钮，没有打开确认或发起删除；无 API、权限、数据库变化。版本保持 6.1.23，仅本地修改，不提交、推送或部署；B4/B5 全站覆盖仍继续。

### v6.1.23 续进度：消息中心危险操作主题对比

- B5：消息中心“清空”操作改用统一 `ActionButton variant="danger"`，移除不稳定的自定义珊瑚半透明边框/悬停类。
- 验证：`npm run test:messages-clear-hover-browser` 覆盖亮/暗主题下危险按钮 variant、悬停状态文字 ≥4.5:1/图标 ≥3:1，以及 320px 视口内可见和页面无横向溢出；断言没有业务 API 写入。Playwright MCP 浅色悬停实测文字与图标均 5.28:1，按钮背景正常变化，控制台错误/警告均为 0；截图 `/tmp/xmt-messages-clear-hover-light.png`。
- 边界：只悬停，没有打开清空确认或清除消息；无 API、权限、数据库变化。版本保持 6.1.23，仅本地修改，不提交、推送或部署；B4/B5 全站范围继续。

## v6.1.23 改造清单 P0 登录主题、操作可见性与浅色对比适配（本地推进，B4/B5 分阶段）

- 复核依据：清单列出登录页浅色主题仍显示深色固定渐变、不同布局文字对比不足的问题；布局二原先固定使用深色表单，布局三白色画布在系统深色主题下继承深色文字变量。与此同时，创作详情关联选题链接的悬停可读性此前没有亮暗主题浏览器回归。
- 实现：登录背景改用 `--xmt-ambient-*`、`--xmt-app-bg*` 主题令牌；布局二按当前系统主题选择表单色彩；布局三将自身明确限定为浅色主题作用域，并使用 surface/app 背景令牌；布局一页面文字继承主题主文字色。选题列表“下一步”操作从独立列移入标题行，减少横向占用并避开固定操作列。编辑器标题、文字颜色、高亮、导出及“更多操作”菜单统一依据视口上下可用空间选择方向，并限制高度、允许内部滚动。后续实测发现选区 BubbleMenu 的高亮/文字颜色调色板仍固定向下展开，现也按剩余空间翻转并限高滚动。知识库选中分类、Creator Center 指标/徽标、选题优先提示和发布候选匹配度等小字号彩色文字改用主题对比令牌。
- 验证：隔离 Playwright 登录夹具覆盖三种布局 × 浅/深主题的关键文字对比、背景令牌与浏览器错误；`npm run test:login-theme-contrast-browser` 通过。`npm run test:resource-hover-contrast-browser` 通过，在亮/暗主题实测资料标题悬停及知识库“全部分类/指定分类”的合成背景对比度均 ≥4.5:1。`npm run test:publishing-hover-contrast-browser`、`npm run test:published-archives-browser` 通过，覆盖发布标题/来源文字、归档多平台和旧数据、详情操作桌面缩放与 1024×600/125% 确认按钮、权限边界及移动布局。`npm run test:production-review-browser` 通过：工具栏控制覆盖 1366/1440/1920px × 80%–125%，低视口下主工具栏及选区高亮/文字颜色浮层均不越界；桌面讨论/回复、保存后采纳和协作 ACK 重试回归正常。Playwright MCP 与 Chrome DevTools MCP 此前核对过主工具栏及归档真实布局；本轮选区调色板另由项目 Playwright 实测。拍摄/发布详情操作和 Topics 按钮可见性矩阵沿用前述通过证据；移动工作中心 320/390px 与移动工作流 320/390px、Creator Center 建议页、版本治理、Android runtime 契约和类型检查通过。定向 ESLint 零错误，保留既有 Hooks/快速刷新警告。
- 数据边界：无 API、登录验证逻辑、权限、数据库或业务数据变化。Android 仅同步版本元数据至 60123，未构建 APK/开展原生专项。仅本地修改，未提交、推送或部署。B4 仍需覆盖更多详情操作、其余实际挂载浮层和不同操作系统/浏览器原生缩放；B5 仍需继续对全站其他业务页做浅色悬停、徽标与固定色审查，不能据本轮局部结果关闭全项。

### v6.1.23 后续推进：报告语义对比与窄屏详情操作

- B5：Creator Reports 旧口径警示改用主题琥珀对比令牌；报告生成入口使用统一主按钮样式，避免白字直接叠在青色数据色上。亮/暗主题实测旧口径提醒、异常说明及爆款/优秀/普通/低效徽标的前景与合成背景对比度均达到 4.5:1；拍摄完成操作与发布页“已通过”状态也改用高对比令牌，避免深色主题把白字放在浅色品牌底色上。
- B4：拍摄详情“完成制作”与发布详情“编辑剧本/取消/保存”操作继续覆盖 320px 和 390px 手机视口，检查可见边界、裁切和横向溢出；已有桌面分辨率与 80%–125% 缩放组合保持通过。项目 Playwright 浏览器和 Chrome DevTools MCP 分别确认移动视口真实布局/正文状态，无底栏遮挡；全页截图中的 fixed 元素偏移是截图模式表现，不是实际遮挡。
- 验证：`npm run test:creator-reports-browser`、`npm run test:workflow-details-responsive-browser` 与 `npm run check` 通过。无业务规则、API、权限或数据库变化；B4/B5 仍开放，仍需更多实际挂载浮层、业务页与原生浏览器缩放验证。仅本地修改，未提交、推送或部署。

### v6.1.23 后续推进：移动操作令牌与报告导航对比

- B5：移动端主操作、选中态统一使用 `primary-button` 主题令牌；消息未读徽标使用 coral-soft 对比令牌，覆盖移动日报提交入口和桌面/移动通知徽标的亮暗主题对比回归。报告中心与桌面日报当前标签改用 `primary-button`；共用确认弹窗危险操作改用 `xmt-btn-danger`，避免白字直接叠在珊瑚实色上。
- 验证：`npm run test:mobile-work-center-browser` 覆盖 320/390px 布局及亮/暗主题下的移动日报提交和桌面日报/周报标签，全部对比度断言 ≥4.5:1；`npm run test:creator-reports-browser` 验证亮/暗主题旧报告删除确认的对比度 ≥4.5:1，并取消而未删除数据；`npm run check` 通过。无业务流程、权限、API 或数据库变化；仅本地修改，不提交、推送或部署。
- B4/B5 仍开放：本轮只覆盖明确选取的移动与报告视图，不代表其他菜单、页面、悬停态或浮层已全部审计。

### v6.1.23 后续推进：全局主色文字对比扩展

- B5：数据复盘排行榜前三名、选题审核通过/驳回选择及确认操作、移动消息筛选、日历今日标记、日报归档类型与全局分页当前页统一使用适合亮暗主题的主按钮/语义对比令牌；共用危险确认改用 `xmt-btn-danger`。
- 验证：隔离浏览器分别测量报告导航、排行榜前三名、旧报告删除确认、选题审核按钮、消息筛选、日历日期与分页当前页前景/合成背景，对比度均 ≥4.5:1；日报/周报、移动工作区、Topics 列表响应式及选题详情浏览器回归通过。确认弹窗只打开后取消；审核未提交，未改业务数据。
- 数据边界：仅主题样式和隔离回归变化，无 API、权限、业务规则或数据库改动；维持 v6.1.23 本地修改，不提交、推送或部署。B4/B5 仍需继续全站逐页和实际环境覆盖。

### v6.1.23 后续推进：编辑器右键子菜单边缘翻转

- B4：实际挂载的编辑器右键菜单在靠近右侧时，文字颜色/高亮子菜单原本固定向右展开，会超出窄视口。现在按视口剩余空间选择左/右展开并同步箭头方向；普通菜单仍按鼠标位置避开视口边缘。
- 验证：纯逻辑测试覆盖左/右两种展开方向；`npm run test:production-review-browser` 在隔离稿件页面分别以浅色主题靠右展开文字颜色子菜单、深色主题靠左展开高亮子菜单，视口均为 390×844；主菜单及子菜单均留在视口内，Esc 可关闭。既有桌面工具栏、批注、保存确认和协作恢复流程通过。截图：`/tmp/xmt-editor-context-submenu-390.png`、`/tmp/xmt-editor-context-submenu-dark-390.png`。
- 最终门禁：本轮 `npm run check`、`npm run build`、`npm run lint` 与 `git diff --check` 通过；全量 lint 0 errors/315 warnings，构建保留既有 >500KB chunk 提示。旧报告、选题审核、Topics 响应式浏览器回归亦通过。
- 数据边界：仅编辑器菜单定位逻辑及隔离测试、文档变化，无 API、权限、数据库或业务数据改动；维持 v6.1.23 本地修改，不提交、推送或部署。B4 其他详情操作/浮层及原生缩放仍待审查；B5 全站逐页审计仍开放。

### v6.1.23 后续推进：匿名意见箱图标主题对比

- B5：匿名意见箱“提交意见”图标原先使用普通 cyan 前景叠在低透明度 primary 底色上；改用 cyan-soft 表面与 cyan-contrast 前景，两个主题均保持令牌语义。
- 验证：隔离浏览器覆盖亮/暗主题，实测图标与合成背景对比度达到非文本图形 3:1 要求，并保存两张页面截图；浏览器控制台无错误。
- 边界：仅展示令牌与隔离回归变化，无业务流程、API、权限、数据库或业务数据改动。B4/B5 全站审计仍开放；仅本地修改，不提交、推送或部署。

### v6.1.23 后续推进：匿名意见管理窄屏操作可见

- B4：匿名意见管理 1080px 宽表的回复/删除等操作原本在横向滚动最右端，移动端初始视口不可见。操作列现在固定在滚动窗口右侧，窄屏改为多行按钮布局；宽屏仍在一行显示。外层 GlassPanel 覆盖默认裁切，内层 ResponsiveTableShell 继续负责横滚与圆角裁边。
- 验证：隔离浏览器覆盖亮/暗主题 × 320px、390px 和 1440px，确认所有行操作可见、页面无横向溢出、外层卡片 overflow-visible、状态文字对比 ≥4.5:1、删除图标对比 ≥3:1，并点击“回复”后取消；没有提交、状态更新或删除。截图：`/tmp/xmt-anonymous-feedback-admin-light-320.png`、`/tmp/xmt-anonymous-feedback-admin-dark-390.png`、`/tmp/xmt-anonymous-feedback-admin-light-1440.png`。
- 质量门禁：`npm run check`、`npm run build`、`npm run version:check`、版本/更新说明治理和 `git diff --check` 通过；全量 ESLint 0 errors/315 warnings，定向 ESLint 通过。构建保留既有最大分包提示。
- 边界：仅表格布局与回归变化，无业务流程、API、权限或数据库改动。B4/B5 全站审计仍开放；仅本地修改，不提交、推送或部署。

### v6.1.23 后续推进：复盘列表详情入口窄屏可见

- B4：复盘列表的“详情”操作原本位于 980px 宽表最右侧，手机初始视口不可见。操作列现在固定于横向滚动视口右边缘，外层 GlassPanel 让位给内层横向滚动壳负责裁边。
- 验证：隔离浏览器覆盖亮/暗主题 × 320px、390px 和 1440px；确认详情按钮一直可见、页面无横向溢出。手机滚动到操作行后实测按钮位于固定底部导航上方。无浏览器错误；没有进入详情或更改业务数据。截图：`/tmp/xmt-retrospective-list-light-320.png`、`/tmp/xmt-retrospective-list-dark-390.png`、`/tmp/xmt-retrospective-list-light-1440.png`。
- 边界：仅布局及浏览器回归变化，无 API、权限或数据库变化。B4/B5 全站审计仍开放；版本保持 6.1.23，仅本地修改，不提交、推送或部署。

### v6.1.23 后续推进：B4/B5 扩展复核

- B5：拍摄指标卡片的浅色主题渐变改用对应深色语义令牌，避免亮色图标落在浅色数据底上对比不足；同时复核登录/关于页品牌标记、发布完成阶段图标、创作资料选择框、成就头像、选题阶段推进按钮与编辑器离开失败弹窗。离开弹窗主/危险按钮和错误文案统一到主题令牌，并给拍摄详情返回按钮增加无障碍名称。亮暗主题实际浏览器测量与令牌断言通过，所需文字/图标对比均达到 4.5:1。
- 验证：`npm run test:login-theme-contrast-browser`、`npm run test:workflow-details-responsive-browser`、`npm run test:topic-stage-record-repair-browser`、`npm run test:production-review-browser`、`npm run test:system-settings-browser` 均通过；另 `npx tsx src/components/editor/EditorLeaveFailureDialog.test.ts` 通过。覆盖双主题登录、拍摄指标、发布进度、离开失败弹窗、选题阶段主操作、创作资料选中态、排行榜/动态头像及关于页品牌标记。隔离资料搜索/选择后取消；离开失败模拟后选择“继续编辑”，未插入稿件或丢弃内容。
- 边界：仅主题令牌、展示样式、测试与文档变化，无 API、权限、业务规则或数据库改动。B4/B5 全站审计仍开放；版本保持 6.1.23，仅本地修改，不提交、推送或部署。
- B4：复测选区高亮/文字颜色菜单在低视口下翻转、限高和滚动时重算位置；`npm run test:production-review-browser` 串行复测通过。此前并发启动造成的页面加载超时未复现。
- B5：继续收敛看板逾期日期/阶段按钮、Creator Center 指标缺失/在线状态/错误提示/作品评级/趋势变化、登录品牌标签及旧版富文本批注的浅色前景令牌；修复富文本删除按钮 hover 在浅色主题中使用实色背景的风险。`npm run test:login-theme-contrast-browser`、`npm run test:resource-hover-contrast-browser`、`npm run test:creator-topic-suggestions-browser`、`npm run test:production-review-browser` 通过，`npm run check` 通过；定向 ESLint 0 errors，保留既有告警。
- 本轮只完成上述已核对视图，不代表全站色彩审计结束。B4 仍待更多详情页、实际挂载浮层及不同系统/浏览器缩放；B5 仍待其他业务页的悬停、徽标、固定色与错误/空状态逐页审查。维持本地修改，不提交、推送或部署。

### v6.1.23 后续推进：移动提示与业务错误态

- 再扩展 B5：看板逾期日期、移动端网络状态提示、创作依据采纳/反馈失败、资料创建/选题草稿/备份错误提示、备份来源与压缩徽标、番茄钟名次徽标及编辑器右键危险操作改用主题对比令牌。
- 验证：`npm run test:mobile-work-center-browser`（320/390px 工作区及拍摄/发布列表详情）通过；`npm run test:creator-topic-suggestions-browser`（含 Creator Center 离线状态亮/暗主题对比度 ≥4.5:1）通过；登录、资源/知识库和生产评审浏览器回归通过；类型检查、生产构建、版本检查、186 项更新说明唯一性和 `git diff --check` 通过。全量 ESLint 为 0 errors/315 warnings，保持既有告警基线范围。
- B5 仍未关闭：未逐页检查其余页面、悬停态、错误/空状态及硬编码色；B4 仍需扩展其他详情操作、已挂载浮层和原生系统/浏览器缩放覆盖。版本保持 6.1.23，本地修改，无提交、推送或部署。

### v6.1.23 后续推进：工作台、协作与编辑状态

- 再扩展 B5：工作台阶段图标色、协作事件/冲突文字、审批流风险标签、登录安全错误态、消息/通知状态、灵感筛选 hover、移动日报/编辑器入口、资源删除按钮、提报必填提示、周报数据与公告状态，以及保存中/冲突状态指示改用主题对比令牌；工作台补齐驳回阶段的语义色映射。
- 验证：审批流设计器语言浏览器回归、登录三布局亮/暗主题、Creator Reports/Auth Readiness、移动工作中心/拍摄/发布/资产浏览器回归通过；`npm run check`、`npm run build`、全量 lint、版本与更新说明治理、`git diff --check` 均通过。全量 lint 0 errors/315 warnings；生产构建仅有既有 >500KB chunk 提示。
- B5 仍未关闭：遗留页面仍有未审计的普通色值、hover、错误/空状态和 minified view；B4 仍有更多详情操作、浮层及原生缩放范围。继续只做本地修改，不提交、推送或部署。

### v6.1.23 后续推进：确认弹窗、角色徽标、发布指标、资料重试与窄屏布局

- B5：根据实际调用链核对 `ConfirmModal` 的 warning 用于拍摄计划“完成”确认、danger 用于删除/清空等不可逆操作。新增 `xmt-btn-warning`，使用 Studio amber 的亮暗主题对比令牌；默认确认按钮收敛到统一主按钮，保留既有危险按钮。审批流默认模板、管理员角色图标和系统内置徽标改用 primary 对比令牌；发布列表点赞/分享/评论数据与来源小字改用主题对比色，移除降低可读性的透明度处理；创作资料草稿失败后的重试入口使用高对比 cyan 令牌。
- B4：权限角色卡片改为窄屏纵向、宽屏横向布局，避免 390px 下角色名称被挤压成逐字换行。
- 验证：`npm run test:workflow-details-responsive-browser` 在亮/暗主题真实打开“确认完成”弹窗，核对语义颜色及文字对比度 ≥4.5:1，然后取消，未推进业务状态；`npm run test:workflow-designer-language-browser` 覆盖默认/角色徽标两主题对比度 ≥4.5:1，以及 390px 无横向溢出、角色名称单行；`npm run test:publishing-hover-contrast-browser` 覆盖发布列表标题、来源小字、互动指标与来源小字，亮/暗主题均 ≥4.5:1；`npm run test:production-review-browser` 用一次隔离 503 验证资料保存失败提示、重试按钮对比度及重试后恢复已保存。`npm run check` 和相关 ESLint 通过；定向 lint 保留已有 5 条 warning、0 error。截图保存在 `/tmp/xmt-confirm-modal-warning-{light,dark}.png`、`/tmp/xmt-permission-badges-{light,dark}.png`、`/tmp/xmt-permission-roles-390.png`、`/tmp/xmt-publishing-metrics-{light,dark}.png` 和 `/tmp/xmt-material-draft-retry-light.png`。
- 边界：仅样式、隔离浏览器回归和进度说明变化，无 API、权限规则、业务规则、数据库或业务数据变化。版本仍为 6.1.23；仅本地修改，不提交、推送或部署。B4/B5 全站审计继续开放。

## v6.1.22 改造清单 P0 核心操作响应式验收（本地完成，B4 分阶段）

- 复核依据：B4 要求用真实浏览器验证关键按钮在桌面分辨率和缩放变化时保持可见，并检查 `overflow-hidden` 容器是否裁掉操作。本轮选取选题详情与创作详情这两条高频链路，不将两个页面的通过结果扩写成全站验收。
- 实现：在既有隔离浏览器测试中增加几何检查，验证“补齐创作稿记录/编辑选题”和“当前版本查看/编辑、小修保存、另开新版、提交审核”按钮有可见布局框、位于视口内，且未被 `overflow-hidden/clip` 祖先裁切。
- 验证：桌面宽度 1366/1440/1920px × 浏览器缩放 80%/90%/100%/110%/125% 的组合全部通过；既有移动 390px 交互回归仍通过。`npm run test:production-review-browser` 与 `npm run test:topic-stage-record-repair-browser` 使用隔离 API/Vite/SQLite fixtures，不写业务库。
- 边界：本轮未全站扫描所有详情页、表格、编辑器浮层或所有浏览器/操作系统缩放，不改变产品代码与业务行为；不做全局 `GlassPanel` overflow 策略替换。B4 仍待对 Topics 表格、编辑器工具栏及其余详情操作补齐专项实测。仅本地修改，未提交、推送或部署；Android 仅同步版本元数据至 60122，未构建 APK/开展原生专项。

## v6.1.21 改造清单 P0 审批流提示中文化（本地完成）

- 复核依据：审批流设计器会把内部风险等级、规则标识、失败原因和建议直接显示给业务用户；同时风险徽标依赖运行时上下文，可能与本次阶段规则阻断结果不一致。
- 实现：将风险级别、规则类别、状态说明、静态原因及建议映射为中文；未知原因使用安全中文兜底。风险摘要与说明依据实际策略校验结果展示，不改变审批规则、模板数据或保存行为。
- 验证：纯映射单测和隔离 Playwright 浏览器回归通过，覆盖真实非法阶段组合、风险/原因中文、编辑/取消交互、桌面 1440px 与移动 390px 无横向溢出及浏览器错误。Playwright MCP 与 Chrome DevTools MCP 核对页面可访问文案；DevTools 未见 JavaScript 错误，仍报告既有 React Bits 安全映射提示及表单标签 issue。类型检查、生产构建、版本一致性、版本/更新说明唯一性和 Android runtime 契约通过；构建保留既有 500KB+ 分包提示。
- 数据边界：无 API、权限、数据库或审批策略变化。Android 仅同步版本元数据至 60121，未构建 APK/开展原生专项。仅本地修改，未提交、推送或部署。

## v6.1.20 改造清单 P0 选题只读提示（本地完成）

- 复核依据：选题详情对无编辑权限的账号显示“无编辑权限”样式的灰色操作项，未说明当前账号仍可查看；仅用于 UX 的措辞和视觉语义调整，不变更访问控制。
- 实现：改为普通说明“当前账号仅可查看此选题”；若权限状态变化后触发编辑拦截，提示联系负责人。原有编辑、补建、审核及权限规则不变。
- 验证：`npm run test:topic-stage-record-repair-browser` 覆盖只读说明、无编辑/补建入口、返回列表、阶段补建及完成态保护，并验证桌面 1440px、移动 390px、无横向溢出和浏览器错误。Playwright MCP 快照确认只读文案；Chrome DevTools MCP 快照确认移动只读页面和零错误/警告。`npm run version:check`、`npm run test:version-governance`、`npm run test:changelog-governance`、`npm run test:android-runtime`、`npm run check`、`npm run build`、定向 ESLint 与 `git diff --check` 均通过；构建仅有既有大分包提示。
- 数据边界：无 API、权限、数据库变化。Android 仅同步版本元数据至 60120，未构建 APK/开展原生专项。仅本地修改，未提交、推送或部署。

## v6.1.19 改造清单 B2 创作创建阶段一致性（本地完成）

- 复核依据：`POST /api/workflow/production` 创建已通过创作记录时，旧流程只使用事务外的选题状态判断。状态在预检后改变时，请求可能仍写入已通过稿件，且没有同步阶段交接和历史。
- 实现：事务内重新读取选题及阶段；阶段已变化时返回冲突，非法阶段拒绝创建。选题仍处于“已通过”时，使用状态条件更新推进至“创作中”，并与阶段历史、操作日志及创作记录同事务提交。
- 回归：隔离 SQLite/API 覆盖从“已通过”创建时同步推进、未通过阶段拒绝创建，以及创作记录插入失败时阶段、历史与创作记录整体回滚。
- 数据边界：无 schema migration、历史回填或业务库写入。Android 仅同步版本元数据至 60119，未构建 APK/开展原生专项。仅本地修改，未提交、推送或部署。
- 遗留：其他历史阶段错位仍不依据当前状态批量回填；B2 尚有其余清单事项继续逐项核验。

## v6.1.18 改造清单 B2 选题状态过期保护（本地完成）

- 复核依据：`TopicService.auditTopic` 与 `transitionTopic` 在事务外读取当前选题状态并校验后，事务中原先无条件更新。审核或阶段推进在短时间并发时，后提交请求可能覆盖先提交状态，并额外留下历史或阶段记录。
- 实现：新增 `updateTopicIfStatus`，通过 `UPDATE topics ... WHERE id=? AND status=?` 将预期旧状态作为原子条件。审核和手动推进仅在条件匹配时继续写历史、操作日志及阶段子记录；条件不匹配返回 `TOPIC_STAGE_CONFLICT`，由 API 返回冲突响应并提示刷新重试。
- 回归：隔离 SQLite 先提交一次审核/阶段交接，再让基于旧读取结果的请求进入事务；确认过期请求被拒绝，不增加第二条状态历史、不会留下重复创作记录。既有 Topics API 正常审核、阶段推进、发布完成门禁和失败回滚测试一并覆盖。
- 修改文件：`api/modules/topics/topics.repository.ts`、`api/modules/topics/topics.sqlite-repository.ts`、`api/modules/topics/topics.service.ts`、`tests/topics/topics.test.ts` 与版本/改造进度文档。
- 数据边界：无 schema migration、无历史回填或业务库写入；所有状态变更仅在隔离测试数据库中。Android 仅同步版本元数据至 60118，未构建 APK/开展原生专项。仅本地修改，未提交、推送或部署。
- 遗留：不能由当前阶段推断旧历史；B2 仍需逐条核验历史错位，不批量回填或自动更正。

## v6.1.17 改造清单 B2 创作子状态历史留痕（本地完成）

- 复核依据：创作页提交审核和状态更新均通过 `version_action: 'none'` 保存；服务端只在显式新建内容版本时写入 `production_history`，因此草稿→审核中、审核中→已通过等状态变化没有持久历史。v6.1.15 对“创作状态修改已有历史”的盘点范围不完整，本节更正该结论。
- 实现：仅在状态真实变化时，写入 `topic_history` 和 `activity_log`，记录创作记录编号、前后中文状态及操作者；移动端协作动态将创作/成片/发布状态调整显示为业务标签。
- 并发与事务：事务内复核创作记录当前选题与状态，拒绝基于过期状态继续写；创作状态、选题历史、操作日志以及审核通过时的选题阶段交接/成片记录同事务提交。重复或无状态变化保存不重复记账。
- 版本与权限边界：普通状态变更仍不创建内容版本；显式大/小版本流程保持原逻辑。沿用现有 `production:update`、选题归属编辑校验和阶段规则；无 schema migration，不回填历史。
- 修改文件：`api/routes/workflow.ts`、`src/pages/mobile/MobileTopicDetail.tsx`、`tests/production/production-collaboration-http.test.ts`、`tests/browser/topic-stage-record-repair.spec.ts` 与版本/改造进度文档。
- 验证：`npx tsx tests/production/production-collaboration-http.test.ts`、`npm run test:integrity:workflow`、`npm run test:topic-stage-record-repair-browser`、`npm run check`、`npm run build`、`npm run version:check`、`npm run test:version-governance`、`npm run test:changelog-governance`（180 个版本唯一）、`npx eslint api/routes/workflow.ts src/pages/mobile/MobileTopicDetail.tsx tests/production/production-collaboration-http.test.ts` 与 `git diff --check` 通过。隔离浏览器验证 390px 移动详情中的“创作状态调整”标签及历史正文、补建动作成功提示；控制台 0 errors/0 warnings。构建保留既有 500KB+ chunk 提示；定向 ESLint 0 errors、11 条既有 workflow warnings。
- 数据库变化：无 schema migration、无历史回填、无版本记录新增；所有写入只发生在隔离测试数据库。Android 仅同步版本元数据至 60117，未构建 APK/开展原生专项。仅本地修改，未提交、推送或部署。
- 遗留：此前没有记录的创作状态无法从当前状态推测补写；B2 整体仍未关闭，历史错位继续按可验证的逐条证据核查，不批量回填。

## v6.1.16 改造清单 B2 存量阶段记录核验与补建（本地完成）

- 复核依据：阶段推进通常会补建创作/成片/发布子记录，但历史存量选题可能停留在活动阶段却没有对应子记录；详情 API 原先不提供存在性，页面无法识别缺环节，也没有符合现有权限的一键补建入口。
- 实现：Topic 详情 API 返回创作稿、成片制作、发布记录存在性。详情页对当前活动阶段缺失记录显示提醒；有 `topic:update` 且通过选题归属编辑策略时可幂等补建当前阶段记录。已完成且缺发布记录时只提示先核对发布历史，不提供自动补建。
- 安全边界：服务端路由保留 `topic:update` 权限并复核选题所有权/可编辑策略；事务内重读阶段并检查竞争变化，创建子记录、选题历史和操作日志同事务提交。重复调用不重复创建或审计，选题阶段不改变；创作草稿沿用选题大纲，不覆盖已存在记录。
- 修改文件：`api/modules/topics/*`、`src/api/topics.ts`、`src/pages/TopicDetail.tsx`、`tests/topics/topics.test.ts`、`tests/browser/topic-stage-record-repair.spec.ts` 与版本/改造进度文档。
- 验证：`npm run test:topics` 覆盖全部活动阶段、完成态拒绝、重复请求、归属拒绝与审计事务回滚；`npm run test:topic-stage-record-repair-browser` 覆盖 1440/390px 的提醒、补建、历史刷新和完成态只核查。Playwright MCP 实际点击补建并看到历史与成功提示；Chrome DevTools MCP 确认完成态只有详情读取、无补建请求，控制台 0 error/0 warning。`npm run check`、`npm run build`、`npm run version:check`、`npm run test:version-governance`、`npm run test:changelog-governance`（179 个版本唯一）、定向 ESLint 与 `git diff --check` 均通过。定向 ESLint 0 errors、6 条 TopicDetail 既有 warnings；构建保留既有 500KB+ 分包提示。
- 数据库变化：无 schema migration、无历史回填或业务库写入；只在用户显式操作时补当前活动阶段的空子记录。Android 仅同步版本元数据至 60116，未构建 APK/开展原生专项。仅本地修改，未提交、推送或部署。
- 遗留：已完成记录缺失不自动造发布历史；更早发生的子状态变化不凭当前状态回填。存量异常仍需由有权限人员逐条核实，不做批量修复。

## v6.1.15 改造清单 B2 成片子状态历史留痕（本地完成）

- 复核依据：`PUT /api/workflow/shooting/:id` 在已有 `workflow:shooting` 和选题编辑权限校验后允许成片状态变化，但仅更新 `shooting`；TopicDetail 展示 `topic_history`，所以计划中/制作中/已取消更正无法从选题历史追溯。完成态只留存 Topic 阶段交接，没有记录成片子状态前后值。
- 实现：仅在状态真实变化时，于同一事务更新成片并写入选题历史与活动日志，记录成片记录编号、前后中文状态和操作者；完成交接一并记录。无状态变化的内容编辑及重复完成不重复写子状态审计。保留当前权限、状态枚举、Topic 阶段推进与多平台发布判定，不做历史回填。
- 其余写入盘点（后续补正）：选题阶段推进经 Topic service / 审批流事务写选题历史；发布状态更正已有选题历史和操作日志；分析接口只改手工指标，不改发布状态。创作状态部分使用 `version_action: 'none'`，并未进入 `production_history`；此漏项于 v6.1.17 补齐。此前未发现其他活跃的子状态直接更新缺少其对应持久化历史的路径。
- 修改文件：`api/routes/workflow.ts`、`tests/integrity/workflow-stage-crud.test.ts` 及版本、更新说明和改造进度文档。
- 验证：`npm run test:integrity:workflow` 覆盖权限拒绝、状态更正、无变化不重复审计、完成交接重复保护，并用隔离触发器模拟日志写入失败，确认状态和历史均回滚；`npm run test:topics`、`npm run test:production-access`、`npm run check`、`npm run build`、`npm run version:check`、`npm run test:version-governance`、`npm run test:changelog-governance`（178 个版本唯一）、改动文件定向 ESLint 与 `git diff --check` 均通过。定向 ESLint 0 errors、11 条既有 workflow lint warnings；构建保留既有 500KB+ 分包提示。
- 数据库变化：无 schema migration、历史回填或业务库写入；复用现有 `topic_history` 与 `activity_log`。Android 仅同步版本元数据至 60115，未构建 APK/开展原生专项。仅本地修改，未提交、推送或部署。
- 遗留：更早已发生的成片状态变化无法凭现有数据恢复，不自动补写；AddTopic 的本机多草稿替代方案已于 v6.1.14 完成，但草稿不跨设备同步。B2 的历史数据错位仍须按可验证数据单独审计，不从当前状态推测过去的操作者和变更过程。

## v6.1.14 改造清单 B2 多份本机草稿续写列表（本地完成）

- 复核依据：桌面与移动提报虽然已共用账号级本机单草稿，但每个账号只有一份，无法并行准备多个选题；清单允许使用本地草稿加续写列表替代服务端草稿。
- 实现：草稿存储升级为带 schema 版本的集合，列表按保存时间排序；支持新建、切换和逐条删除。打开提报页恢复最后选中的草稿；修改自动保存，手动保存即时落盘；提报成功只移除当前草稿，其他草稿保持。
- 兼容与权限：迁移旧版账号单草稿与旧桌面键；旧副本仅在新版集合成功写入后清理，存储失败不覆盖旧数据。草稿仍按账号隔离、只存于当前设备浏览器；提报权限确认前不会读取或展示草稿。无 API、数据库迁移或历史回填。
- 修改文件：`src/utils/topicDraft.ts`、`src/hooks/useTopicDraftCollection.ts`、`src/components/topics/TopicDraftPicker.tsx`、桌面/移动提报页、草稿单测和移动工作中心浏览器回归及版本文档。
- 验证：`npm run test:mobile-safe-draft`、`npm run test:mobile-work-center-browser`、`npm run check`、改动文件定向 ESLint（0 warning）、`npm run build`、`npm run version:check`、`npm run test:version-governance`、`npm run test:changelog-governance`（177 个版本唯一）与 `git diff --check` 均通过。浏览器覆盖桌面 1440px、移动 390px/320px、列表切换/删除/刷新和提报结果；构建仍显示既有 500KB+ 分包提示。
- Android 仅同步版本元数据至 60114，未构建 APK/开展原生专项。仅本地修改，未提交、推送或部署。
- 遗留：草稿不跨设备同步；B2 其他子状态语义及历史兼容继续按清单逐项核实。

## v6.1.13 改造清单 B2 自定义审批阶段交接一致性（本地完成）

- 复核依据：自定义审批流通过后直接更新 `topics.status`，没有事务性补齐目标阶段子记录或写入 `topic_history` / `activity_log`；进入发布阶段但发布记录缺失时，无法形成待发布任务。严格模式还把当前请求刚写入的 shadow log 立刻用于本次判定，成功决策被当作风险信号，阻断本次审批。
- 实现：保留现有审批人、节点、工作流策略和多平台完成规则；事务内重新读取并比较选题当前阶段后再推进。进入已通过/创作中、成片制作、发布中时幂等补建对应草稿/拍摄/待发布记录，已有内容不覆盖；阶段变化同步写入操作人、节点和前后阶段到选题历史与操作日志。完成仍只能由既有发布完成判定通过。审批策略只读取本次动作之前的 shadow log，正常通过记录不再作为异常信号影响同一节点的后续审批。
- 修改文件：`api/routes/workflow-templates.ts`、`tests/integrity/workflow-stage-crud.test.ts`、版本元数据及 `docs/` 版本/改造记录。
- 验证：`npm run test:integrity:workflow`、`npm run test:topics`、`npm run test:android-runtime`、`npm run check`、`npm run build`、`npm run version:check`、`npm run test:version-governance`、`npm run test:changelog-governance`（176 个版本唯一）、改动文件定向 ESLint 与 `git diff --check` 均通过。生产构建保留既有 500KB+ 分包提示。
- 数据库变化：无迁移、无历史回填或业务数据写入；隔离测试数据库覆盖审批拒绝、创作稿和既有稿保留、成片记录、待发布记录、未处理发布任务拦截及“发布异常计作已处理”。Android 仅同步版本元数据至 60113，未构建 APK/开展原生专项。
- 风险与遗留：其他工作流子状态直写和历史错位仍需继续盘点；不自动纠正既有不一致记录。仅本地修改，未提交、推送或部署。
- 下一阶段：继续盘点其余状态直写路径及 AddTopic 真正的服务端草稿生命周期；保持历史兼容，不做未经证据支持的批量回填。

## v6.1.12 改造清单 B2 发布归档入口与多平台详情（本地完成）

- 复核依据：旧 `/resources` 入口会重定向到资料中心，但承载自动发布快照的 `src/pages/Resources.tsx` 没有挂载路由；新“内容档案库”读取另一套 `resource-center` 数据。旧 `/api/resources/archives` 仍在使用，列表是管理员/主管看全部、其他账号仅看自己上传，详情继续由 `canManageOwnedResource` 控制。
- 实现：新增 `/asset-center/published-archives` 路由与资料中心导航/概览卡片，不合并两种资料数据。列表展示快照涵盖的平台和发布记录数；详情逐条展示平台、状态、发布时间、数据日期、独立指标及发布详情链接，并把平台内部代码转换成业务中文。
- 兼容与权限：含 `published_records` 的新快照按记录逐一展示；只有旧 `publishing`/`analytics` 字段的快照回退为单条展示。归档 API 的列表与详情可见范围保持原样；页面只有在具备 `resource:delete` 时显示删除按钮，确认文案明确只删除归档快照。
- 导航：修正嵌套路由同时高亮父/子菜单的问题；具体归档页显示自己的导航名称与面包屑。
- 修改文件：`src/App.tsx`、`src/config/navigation.ts`、`src/pages/AssetCenter.tsx`、旧归档页 `src/pages/Resources.tsx`、`api/routes/resources.ts` 与相关隔离测试、版本/产品文档。
- 验证：`npm run test:publishing-metric-sources`、`npm run test:publishing-douyin-link`、`npm run test:published-archives-browser`、`npm run check`、`npm run build`、`npm run version:check`、`npm run test:version-governance`、`npm run test:changelog-governance`（175 个版本唯一）、改动文件定向 ESLint 与 `git diff --check` 均通过。隔离 API 回归验证发布平台摘要、成员仅能列出自己的归档且不能读取他人快照。项目 Playwright 覆盖资料中心入口、双平台各自指标、发布记录链接、旧单条归档、无删除权限的普通成员、1440px/390px 和控制台 0 error；Playwright MCP 独立复核入口、中文平台名、逐条数据及 390px 无横向溢出，MCP 控制台 0 error/0 warning。当前会话未提供 Browser 插件工具，因此使用现有 Playwright MCP 与项目 Playwright。生产构建通过，保留仓库既有 500KB+ chunk 提示。
- 数据边界：无数据库迁移、历史回填或现有快照改写；不放宽旧 API 权限；不把发布快照并入通用资料中心库。Android 仅同步版本元数据至 60112，未构建 APK/开展原生专项。仅本地修改，未提交、推送或部署。
- 遗留：B2 仍有其他状态真源、草稿生命周期和历史错位治理事项；本次只完成发布归档入口与读取体验。

## v6.1.11 改造清单 B2 多平台指标与发布归档（本地完成）

- 复核依据：发布事实粒度是 `publishing_id`；已关联抖音作品在发布列表中显示为有效发布，但旧周报明细按原始 `publishing.status` 筛选，口径不一致。主题资产只显示一条最新指标而未说明平台/记录号；每个 topic 的已发布归档也只保留单条，遗漏其他平台。
- 实现：周报明细与统一指标解析器采用相同的有效发布口径；指标事实显式标注有效平台。归档 `published_records` 按 topic 收录每条有效已发布记录和独立指标，兼容保留顶层最近一条 `publishing`/`analytics` 字段；归档列表提供发布记录数，旧单条归档回退显示 1。手工或自动关联抖音作品后，按同一事务规则检查 Topic 完成状态，关联成功后刷新该 topic 归档。
- 主题资产：API 返回最新指标对应 `publishing_id` 和平台；页面用平台、记录编号和日期标识指标，并链接到确切发布详情。仍显示单条最近指标，不把不同平台数值相加。
- 修改文件：`api/services/publishingMetrics.ts`、`api/modules/topics/publishing-completion.ts`、`api/modules/topics/topics.sqlite-repository.ts`、`api/services/publishingDouyinLink.ts`、`api/services/publishedArchive.ts`、`api/routes/workflow.ts`、`api/routes/export.ts`、`api/routes/resources.ts`、`api/routes/resource-center.ts`、主题资产 API/UI、隔离回归测试及版本/产品文档。
- 验证：`npm run test:publishing-metric-sources`、`npm run test:publishing-douyin-link`、`npm run test:content-topic-assets`、`npm run test:publishing-assets-browser`、`npm run test:integrity:workflow`、`npm run test:analytics-write-scope`、`npm run check`、`npm run build`、`npm run version:check`、`npm run test:version-governance`、`npm run test:changelog-governance`（174 个版本唯一）与 `git diff --check` 均通过。定向 ESLint 0 errors，保留 14 条现存 workflow/export lint warning；构建有既有 500KB+ 分包提示。Playwright MCP 页面复核确认 `/publishing/501` 正确链接及微信视频号标签，验收时控制台 0 error/0 warning；截图经 reduced-motion 模式复核。
- 数据库与兼容性：无迁移、无历史回填或数据库改写。归档仍是一条 topic 最近快照而非不可变历史；存量归档不会批量回写数组，列表回退兼容单记录，新字段在下次相关发布/关联同步重建后体现全部记录。旧消费者可继续读顶层字段，完整多平台读取方应采用 `published_records`。
- Android 仅同步版本元数据至 60111，未构建 APK/开展原生端专项。仅本地修改，未提交、推送或部署。
- 遗留与下一阶段：B2 尚未整体关闭。已确认自动发布快照由 `/api/resources/archives` 提供，旧 `/resources` 页面已不挂载且重定向到 `/asset-center`；当前内容档案库则读取 `/api/resource-center/resources?library_type=content_archive`。下阶段需明确如何把旧 JSON 快照呈现在新档案详情中，避免只显示标题或原始 JSON；本版本不改写 `content_text`、不改变可见范围，也不批量回填历史归档。

## v6.1.10 改造清单 B2 多平台发布完成规则（本地完成）

- 规则确认：同一选题多平台发布时，任一平台已发布立即推进 Topic 到“已完成”；若没有成功发布，所有发布记录均为“发布异常”也按全部处理完成；只要仍有待发布/已定时记录，不能仅因某个平台异常提前完成。Topic 完成后不自动回退。
- 实现：在发布记录新增/更新、拍摄交接到发布、选题手动推进及审批流模板中使用统一判定；选题手动进入完成阶段时也执行同一条件校验。完成因全失败而发生时，向选题历史、操作日志和站内消息说明“发布异常计作已处理”。无数据库迁移，不改变已完成终态行为。
- 修改文件：`api/modules/topics/publishing-completion.ts`、Topic repository/service、`api/routes/workflow.ts`、`api/routes/workflow-templates.ts`、工作流/选题隔离测试、Phase 2 Topic 设计和版本/改造文档。
- 验证：`npm run test:integrity:workflow`、`npm run test:topics`、`npm run test:production-access`、`npm run check`、`npm run version:check`、`npm run test:version-governance`、`npm run test:changelog-governance`（173 个版本唯一）、定向 ESLint、`git diff --check` 与 `npm run build` 均通过。回归覆盖任一发布成功且兄弟平台仍待发布、异常与待处理并存、全异常完成、发布异常新增即完成、手动完成门禁及审计。定向 ESLint 0 errors/11 个既有告警；构建有既有 500KB+ 分包提示。
- 数据库变化：无迁移、无生产数据改写。Android 仅同步版本元数据至 60110，未构建 APK 或开展原生端专项。
- 归档边界：维持按 topic 保存最近一次已发布 JSON 快照，不因发布异常创建归档；多平台成功仍按既有服务只归档最近更新的一条已发布记录，不在本版本扩成多条聚合归档。
- 风险与遗留：Topic 一经完成仍不可自动回退；发布记录状态可按原有权限更正，但阶段不回退。发布归档不等于当前多平台发布总览。B2 尚未整体关闭。仅本地修改，未提交、推送或部署。
- 后续由 v6.1.11 接续核对多平台指标和归档粒度：周报、指标解析、主题资产与归档均已按发布记录收敛；旧归档兼容入口和有效历史快照更新边界仍待继续审计。

## v6.1.9 改造清单 B2 状态更正与阶段历史（本地完成）

- 复核确认：发布页和 API 均允许在待发布、已发布、发布异常、已定时之间按既有权限更正；选题阶段另有独立状态，发布记录由“已发布”改为其他子状态不会自动回退已完成选题。选题详情展示 `topic_history`，但发布状态更正与自动阶段交接之前没有对应历史记录；`activity_log` 仅保留 7 天，不适合作为唯一业务历史。
- 实现：保留原有状态更正入口和权限；在同一数据库事务记录更正前后状态、操作者到持久化 `topic_history`，同时写入辅助 `activity_log`。创作审核、成片完成、发布完成等 Topic 阶段自动交接也写入可见历史。Topic 阶段只沿既有方向推进，不随发布子状态更正倒退。无需数据库迁移。
- 修改文件：`api/routes/workflow.ts`、`tests/integrity/workflow-stage-crud.test.ts`，版本、更新说明、改造清单与文档索引。未改权限、归档删除、历史数据或数据库结构。
- 验证：`npm run test:integrity:workflow`、`npm run test:topics`、`npm run test:production-access`、`npm run version:check`、`npm run test:version-governance`、`npm run test:changelog-governance`（172 个版本唯一）、`npm run check`、`npm run build`、定向 ESLint 与 `git diff --check` 均通过。定向 ESLint 0 errors/11 个既有告警；构建保留既有 500KB 分包提示。
- 数据库变化：沿用既有 `topic_history` 与 `activity_log`；无迁移、无历史回填、无业务库清理。Android 仅同步版本元数据至 60109，未构建 APK 或开展原生端专项。
- 归档语义核对：发布成功会按选题写入一条 JSON 归档快照，详情显示归档时间和快照中的发布数据；归档由显式权限删除。状态更正为非已发布时不会删除或更新该快照，因此它表示最近一次生成的已发布快照，而不是当前发布记录的实时镜像。后续再次发布/同步会更新同一条选题归档，所以它也不是不可变的多版本历史。隔离回归确认状态更正保留原快照，状态更正本身可从选题历史追溯。
- 多平台一致性核对：数据库对 `publishing.topic_id` 只有普通索引，没有每选题唯一约束；发布页文案/表单允许同一选题添加多条不同平台记录。任意一条记录被登记为“已发布”时，当前 API 即将 Topic 推进到“已完成”；归档仅选该 topic 最近更新的一条已发布记录。发布页新增记录的选题下拉只列“成片制作/发布中”，已完成后不可从该入口追加。现有改造设计没有说明 Topic 完成应以“任一平台成功”还是“所有预设平台处理完”为准，也未界定发布异常是否为终态；本轮不改推进/选题筛选/归档规则，避免擅自变更多平台业务含义。
- 风险与遗留：归档以 topic 为粒度而非每条 publishing 记录分别保存；后续发布同步可覆盖同一选题的归档内容。当前 UI 显示归档时间及发布数据，但尚无“最近一次发布快照”的显式说明。此次不改归档结构、删除策略或 UI；不自动清理历史状态和归档。仅本地修改，未提交、推送或部署。
- 下一阶段：请产品确认多平台发布时 Topic 的完成条件（任一平台成功，还是所有预设平台均处理完且至少一条成功；并确认“发布异常”是否算处理完）。确认后再设计阶段推进及归档粒度；不扩建每发布记录独立归档或覆盖历史数据，除非改造清单和数据证据要求。

## v6.1.8 改造清单 B2 成片完成态保护（本地完成）

- 复核发现：成片记录完成并事务化推进选题到“发布中”后，拍摄 API 仍接受把状态写回“制作中”，也接受将已完成记录改挂到另一个选题；创建/更新接口均未校验成片状态枚举。当前页面没有撤销完成或重挂选题的操作，且改造清单将 Topic 阶段定义为唯一阶段真源。
- 实现：服务端只接受计划中、制作中、已完成、已取消四种成片状态；已完成记录保留文案等普通字段编辑，但拒绝退回状态或更换关联选题，避免已交接的子记录被静默改写。无权限模型变更。
- 修改文件：`api/routes/workflow.ts`、`tests/integrity/workflow-stage-crud.test.ts`，版本、更新说明、改造清单与文档索引。
- 回归：隔离 SQLite/API 测试覆盖已完成记录退回、无效状态创建/更新、完成记录更换选题均被拒绝且数据库保持原值；完成态文案编辑仍允许。`npm run test:integrity:workflow`、`npm run test:topics`、`npm run test:production-access`、`npm run check`、`npm run build`、`npm run version:check`、`npm run test:version-governance`、`npm run test:changelog-governance`（171 个版本唯一）与 `git diff --check` 均通过。定向 ESLint 0 errors、11 warnings，均为 `workflow.ts` 既有 BOM/any/未使用变量告警；构建保留既有大分包提示。
- 数据库变化：无迁移、无业务数据库写入或清理；Android 仅同步版本元数据至 60108，未构建 APK 或开展原生端专项。
- 风险与遗留：未改变发布记录的状态回退语义，因为当前 UI 允许更正发布状态，且资料未明确“已发布”是否可逆；历史错位数据不自动回填。仅本地修改，未提交、推送或部署。
- 下一阶段：继续核对发布状态修正与 Topic“已完成”之间的业务语义及审计留痕要求，再决定是否限制已发布记录回退；保持隔离回归，不批量修复历史数据。

## v6.1.7 改造清单 B2 选题提报草稿续写（本地完成）

- 问题：桌面提报页只在手动点击后保存，移动端会自动保存；两者使用不同本机键，跨桌面/手机布局不能续写，提交失败时未手动保存的桌面输入无法刷新恢复。
- 实现：桌面/移动端共用按账号隔离的本机草稿和统一字段模型；桌面输入自动保存，旧版桌面草稿迁移到新键，移动端修改保留桌面专属字段。提交请求前同步保底保存，提报成功后才清除本账号草稿；存储失败时仍允许提交但明确说明输入只在当前页面。`topic:create` 权限门禁仍在新增页面入口，未授权时不会读取/展示/清理其本机草稿。
- 修改文件：`src/utils/topicDraft.ts`、`src/pages/AddTopic.tsx`、`src/pages/mobile/MobileAddTopic.tsx`、`tests/browser/mobile-work-center-responsive.spec.ts`，版本、更新说明、改造清单与文档索引。未改服务端 API、数据库结构或业务数据。
- 验证：`npm run test:mobile-safe-draft`、`npm run test:mobile-work-center-browser`、`npm run check`、改动文件定向 ESLint、`npm run version:check`、`npm run test:version-governance`、`npm run build`、`git diff --check` 通过。隔离 Playwright 覆盖 390px/1440px、旧桌面草稿迁移、桌面自动保存、同账号手机续写并保留桌面字段、无权限拒绝显示草稿、存储写入失败告警、提交失败保留/重试及成功清理；页面身份/输入可见，控制台无非预期错误。浏览器插件未在当前会话提供，使用项目内 Playwright 和隔离 API 夹具；截图 `/tmp/xmt-topic-draft-mobile-shared-390.png`、`/tmp/xmt-topic-draft-desktop-restored-1440.png`、`/tmp/xmt-topic-draft-desktop-storage-error-1440.png`。构建保留既有大分包提示。
- 数据库变化：无迁移、无业务库写入或清理；Android 仅同步版本元数据到 60107，未构建 APK。
- 风险与遗留：草稿是当前浏览器/设备上的单份账号级提报草稿，不跨设备同步，也未新增服务器草稿列表；本地存储写入失败后刷新无法恢复最新输入。Android 版本运行时契约通过；依赖移动构建 manifest/APK 的契约未验证，因为本阶段按专项延期要求未生成对应产物。B2 仍未整体关闭：Topic 与创作/成片/发布子记录的状态真源和历史错位记录仍需继续盘点；不自动回填历史状态。仅本地修改，未提交、推送或部署。
- 下一阶段：继续审计工作流子记录状态直写路径及其调用者/权限边界，确认哪些字段是阶段真源、哪些是子状态，再补隔离数据库/API 回归；保留历史兼容，不做未经证据支持的批量回填。

## v6.1.6 改造清单 B2 后续阶段交接（本地完成）

- 问题：创作稿自动保存可能重复触发审核交接；成片已完成后再次提交会把选题阶段回退，并将已有发布记录重置为待发布、用成片稿覆盖发布侧文案；发布记录也能从前序选题阶段直接标记已发布。
- 实现：创作仅在首次由非通过转为通过时推进至成片阶段；成片完成必须从成片阶段或更后阶段提交，首次推进时补齐发布记录，已存在记录只在缺少文案时补齐、不改状态或已有文案；发布完成只允许从发布阶段推进，重复操作不回退选题。跨阶段写入使用事务，越级请求返回明确 409 阶段提示。
- 修改文件：`api/routes/workflow.ts`、`tests/integrity/workflow-stage-crud.test.ts`、版本与改造进度文档。
- 回归：隔离 SQLite/API 覆盖正常成片→发布→完成、重复成片提交保留排期状态与发布侧文案、越级成片/发布不写入、创作审批只推进一次且不重置已有成片记录；`npm run test:integrity:workflow`、`npm run test:topics`、`npm run test:production-access`、`npm run test:production-version-sync`、`npm run check`、`npm run build`、版本检查/治理、更新说明唯一性及 `git diff --check` 通过。构建提示既有大分包；定向 ESLint 0 errors，另有 11 条 warning 均位于本轮未修改的 `workflow.ts` 旧代码行（`any`、BOM 空白和未使用字段）。
- 数据库变化：无迁移、无业务数据库写入或清理。
- 风险与遗留：历史上已错位的选题状态不自动回填；状态顺序修复不会修复历史记录。B2 尚有 AddTopic 真实草稿生命周期待治理；Android 仅同步版本元数据至 60106，未构建 APK。仅本地修改，未提交、推送或部署。
- 下一阶段：按改造清单继续治理 AddTopic“保存草稿”与提交审核的生命周期差异，并在隔离数据库覆盖草稿恢复和权限边界。

## v6.1.5 改造清单 B2 选题到创作原子交接（本地完成）

- 问题：桌面和移动端原来先创建 Production 草稿，再请求选题阶段推进；若阶段更新失败，数据库会留下与选题阶段不一致的独立稿件。已有稿件时直接进入，也未把 `approved` 选题同步为 `production`。
- 实现：新增共享交接流程；`approved` 先走既有 Topic 阶段事务，由服务端补建或复用初始稿，再读取稿件进入编辑。推进失败不再另建稿；对已处于 `production` 但历史缺少稿件的选题，仍允许带入大纲补齐。桌面和移动端均增加页面内单飞保护，业务提示区分新建、补齐、推进并复用及继续编辑。
- 回归：交接合同覆盖已存在稿复用、阶段先于列表读取、阶段失败无孤儿写入、历史缺稿补齐和不支持阶段拒绝；现有选题 API/SQLite 集成回归通过。Playwright 实际浏览器覆盖移动 390px、桌面 1440px，真实点击「开始创作」并验证进入编辑页、阶段推进请求先于稿件查询、没有重复 POST 建稿、无浏览器错误或框架遮罩。
- 边界：无数据库迁移，未对本地业务数据库写入或清理；Android 仅同步版本元数据至 60105，未构建 APK。B2 尚未关闭：其他 workflow 子记录状态直写和 AddTopic 真草稿生命周期仍需继续治理。
- 仅本地修改，未提交、推送或部署。

## v6.1.4 改造清单 P0 用户提示去工程术语（本地完成）

- 复核范围：当前 `api/app.ts` 的活动兜底路径；旧 `DouyinCreatorDataCenter.tsx` 含 AES/HMAC 术语，但 App 路由未挂载该孤儿页，因此不为不可达页面改代码。当前 Creator Dashboard 已使用业务化空状态。
- 实现：旧版与新版接口的未知功能均提示“暂时找不到此功能，请刷新页面后重试”；超限请求提示精简文件或内容；一般服务失败提示稍后重试。保留 HTTP 状态码、错误码与响应结构，未改变业务处理、权限或数据库。
- 验证：HTTP 集成回归真实请求覆盖旧/新接口 404、超过 16 MiB 的 JSON 请求 413 与旧路由 500 错误脱敏；另有错误脱敏/API 契约、版本唯一性、`npm run version:check`、`npm run check`、`npm run build`、定向 ESLint 与 `git diff --check` 通过。构建仅有既有大分包提示（Silk 843.50 kB、Tiptap 554.72 kB）。
- 仅本地修改，未提交、推送或部署；Android 仅同步元数据至 60104，未构建 APK。

## v6.1.3 改造清单 B8 批量操作反馈（本地完成）

- 复核发现：选题批量审核和删除原来吞掉单项错误后，始终发出“完成”标题与 success 样式；即使 0/N 成功也可能被理解为成功。版本更新历史里 2.20.5 有两条记录，设置页稳定报重复 React key 警告。
- 实现：按总数与成功数计算反馈状态；全成功为成功提示，部分完成显示成功/失败数量并使用提醒样式，全失败显示错误并提示检查后重试。全屏更新弹窗改为 Topbar 下方的非阻断轻提示，完整说明仍由设置页更新说明承载。未改变单项操作、服务端 API、权限或数据库。
- 回归：新增合同测试覆盖全部成功、部分失败、全部失败及超范围计数归一化；更新说明版本唯一性测试确认 166 条记录无版本号重复。Chrome DevTools MCP 使用隔离浏览器与本地数据库副本实测：登录后轻提示可见且不遮挡页面，“查看更新说明”进入设置列表并关闭提示；版本已记录为已读。设置页只有一条 v2.20.5，复载后浏览器控制台无 error/warning；已截图检查轻提示的实际尺寸与层级。
- 修改范围：`src/pages/Topics.tsx`、批量反馈工具、`UpdateNotification`、更新历史、对应合同测试、版本与更新说明；无迁移。
- 验证：`npm run test:batch-action-feedback`、`npm run test:changelog-governance`、`npm run test:topics`、`npm run test:production-list-update`、`npm run test:topics-list-notify`、`npm run version:check`、`npm run test:version-governance`、`npm run check`、`npm run build` 与 `git diff --check` 通过。生产构建保留既有大分包提示（Silk 最大 843.50 kB、Tiptap 554.72 kB）；定向 ESLint 0 errors，NotificationSettings 有 2 条原有 Hook 依赖 warning。
- 仅本地修改，未提交、推送或部署；Android 仅同步元数据至 60103，未构建 APK。

## v6.1.2 改造清单 B1/B2 回归核对（本地完成）

- B1 核对：当前创作编辑保存使用更新接口，携带旧正文并明确不创建新版本；现有合同测试通过。对本地 `data/xmt.db` 做只读记录核对：48 条创作记录关联 47 个选题；未发现同选题、同版本、正文完全一致的组。另有一组同选题、同版本、同操作人且相隔 29 秒的记录，但去除 HTML/空白后的正文相似度为 0，证据不足以认定重复，列为人工复核候选；不记录正文，不自动合并或删除。
- B2 回归保护：在隔离 SQLite/API 测试中覆盖待审核选题非法推进时明确说明原因且不更改状态、阶段链合法推进时按需补建创作/拍摄/发布记录并从选题大纲初始化创作稿、已有稿件原样复用，以及补建失败后状态/历史/子记录整体回滚。没有改动运行逻辑、权限或数据库结构。
- P0 文案复核：更新弹窗已挂载到主应用，标题将“系统更新 · System Update”统一为“版本更新”。TopicDetail 离开提示当前已使用“有未保存的修改”等业务文案；带“AES/HMAC”的旧数据中心组件未挂入当前路由，当前 CreatorDashboard 空状态使用共享业务文案，故未改未挂载组件。
- 数据边界：业务记录未写入、改写或删除。首次检查时一次未带只读选项的 SQLite `SELECT` 连接在本地库目录留下 0 字节 WAL 和 32 KB SHM 边车文件；主数据库文件时间未变化，边车文件保留未清理。
- 修改范围：`tests/topics/topics.test.ts`、`src/components/UpdateNotification.tsx`、版本展示与说明文档、B1/B2/P0 改造进度；无迁移。
- 验证：`npm run test:topics`、`npm run test:production-list-update` 通过；前端提示实际渲染与浏览器截图证据在本阶段最终复验后补录。其余版本治理、类型检查、构建与差异检查见本阶段最终复验结果。
- 遗留边界：B1 候选仍需人工核对后才能决定是否存在重复；B2 的单一状态真源/副表语义治理不在本测试阶段关闭。仅本地修改，未提交、推送或部署。

## v6.1.1 Phase 4 Web 浏览器日志首阶段（本地完成）

- 问题与实现：v6.1.0 已完成 API 和 Creator Agent 日志统一，但活跃 Web 诊断仍有散落的普通控制台输出，可能包含动态错误文本、请求/Socket 标识或堆栈。本阶段新增统一客户端 logger，将登录 trace、Socket 生命周期、前端 API 错误、错误边界、权限、通知、编辑器及运行环境诊断改为 JSON 事件。
- 脱敏边界：事件名称与字段采用静态白名单；登录请求/尝试标识只保留存在性，Socket 断连原因限定为已知枚举，错误只记录安全类别；不输出令牌、用户/Socket 原始 ID、动态错误文本、堆栈、请求正文或 URL，也不发送外部遥测。已有 UI 错误处理、重试与业务逻辑保持不变。
- 修改范围：前端客户端 logger、活跃诊断调用点、字段合同测试、npm 测试脚本及版本/更新/改造进度文档。无 API 响应、权限、数据库或 Agent 行为变化；Agent 仍为 2.14.5-agent。
- 验证：日志白名单合同（2 项）、Socket 客户端生命周期、Web 登录运行时、401 恢复、Playwright 本地模拟登录观察、登录导航、版本治理、`npm run check` 与 `npm run build` 通过；全仓 lint 0 errors、324 warnings。构建有既有大分包提示（最大 Silk 分包 843.50 kB）。浏览器验收未访问线上账号；登录导航测试未启动 API 服务，其他首页初始化请求在 Vite 代理处被拒绝，但模拟登录与跳转断言通过。
- 未完成项：本地浏览器控制台结构化记录不等于外部错误采集；Sentry 仍需 DSN、用户/环境脱敏和采样策略，生产收集器、容量与保留期也未验收，Phase 4 未退出。
- 仅本地修改，未提交、推送或部署；Android 仅同步版本元数据至 60101，未构建 APK 或开展原生端专项。

## v6.1.0 Phase 4 API 与 Agent 结构化日志首阶段（本地完成）

- 问题与实现：请求 ID 已生成并回传，但 API 完成日志和登录限流日志不统一；旧限流日志还会写入完整 URL、客户端 IP、User-Agent 和可猜测的用户名哈希。本阶段引入 Pino 并将活跃 API 的认证、限流、Socket、协作、数据库、消息、日报、工作流和发布日志迁入结构化 logger；请求完成字段包括 requestId、数字 userId、模块、模板化 operation、状态码、耗时、错误码与 environment。Creator Agent 2.14.5-agent 将桌面/采集阶段日志迁为本地 NDJSON 白名单事件。
- 脱敏边界：请求操作只取 Express 路由模板，不记录真实路径参数；不序列化 request/response、查询串、正文、Cookie、Authorization 或令牌；不记录原始 SQL/异常消息、IP、UA、房间/用户标识或用户名/哈希；Origin 和 transport 经白名单规范化。Agent 日志仅保留静态事件、允许的阶段/状态/数量和错误类别，不写账号/设备标识、路径、URL、worker 原始消息或异常文本。活跃 API 路径无普通 `console.*`（保留 server/token 配置致命错误的直接输出；未挂载 legacy remote-browser/social-review 不改）。字段脱敏合同测试通过。
- 安全依赖：本轮 `npm audit --omit=dev` 发现 `ip-address@10.5.0` 两条中危告警、`engine.io@6.6.9` 高危告警；完整审计另发现开发树 `brace-expansion` 高危告警。分别将前两项更新到 10.7.2 与 6.6.11，并仅更新 `brace-expansion` 传递依赖到兼容范围内已修复版本；`npm audit` 与生产审计现均为 0 vulnerabilities。
- 修改范围：Pino logger、API 请求中间件、活跃 API 的错误/操作日志脱敏、Agent 桌面 NDJSON logger 与字段合同测试、Agent 版本元数据、package/lock 与版本/架构/更新文档。无业务 API 响应、权限、数据库结构或生产环境变化。
- 验证：API 请求/限流/5xx 脱敏、Socket、协作权限/协调/Redis 恢复与相关业务回归通过；Agent `runtimeLogger`/登录态测试和 TypeScript 检查通过。完整 `npm audit` 与 `npm audit --omit=dev` 为 0 漏洞，根包和 Agent 包构建/检查、`npm run version:check`、版本治理、全仓 lint（0 errors，323 warnings）和 `git diff --check` 通过。
- 未完成项：Sentry 需要 DSN、环境/用户脱敏及采样策略，本阶段没有连接外部服务；Web 浏览器错误采集仍待治理。生产日志容量、保留期和收集器也未验收，因此 Phase 4 未退出。
- 仅本地修改，未提交、推送或部署；Android 仅同步版本元数据至 60100，未构建 APK 或开展原生端专项。

## v6.0.3 P2-8 Redis AOF 强制终止恢复验收（本地完成）

- 问题与实现：v6.0.2 已覆盖 Redis 进程重启，但仍未区分正常停止与意外进程终止。本阶段仅在隔离集成测试中向本机临时 Redis（AOF `appendfsync always`）写入 Socket.IO stream 事件并记录 stream 长度，再对测试专用 Redis 子进程发送 `SIGKILL`，随后使用同一临时目录重启。
- 结果：重启后 stream 长度保持一致；Redis 不可用时 API 仍 fail-closed，恢复后双 API 进程重新就绪，并成功写入/广播后续 Yjs 更新。
- 边界：只验证当前主机上 Redis 进程被强制终止后的 AOF 恢复；未覆盖断电、主机/内核故障、磁盘损坏、AOF 损坏、备份恢复、故障切换或生产 Redis HA。该结果不允许横向扩容。
- 修改范围：`tests/collaboration/redis-streams-integration.test.ts` 与版本、升级说明和进度文档。无业务运行逻辑、数据库结构、生产 Redis/Caddy 配置变化。
- 验证：`npm run test:collaboration-redis-integration` 通过；版本闭环另行执行 `npm run check`、`npm run build`、`npm run version:check`、`npm run test:version-governance`、定向 ESLint 与 `git diff --check`。
- 下一阶段：真实 Caddy 粘性会话和生产等价 Redis 持久化/HA 仍需独立基础设施验收；本机没有 Caddy，可继续完成本地代码与测试审查，但不得据此打开生产多实例门禁。
- 仅本地修改，未提交、推送或部署；Android 仅同步版本元数据至 60003，未构建 APK 或开展原生端专项。

## v6.0.2 P2-8 Redis AOF 重启恢复验收（本地完成）

- 问题与实现：前一阶段的 Redis 集成测试关闭 AOF，不能证明 Redis 重启后 Socket.IO stream 记录仍保留。本阶段仅调整隔离集成测试：临时 Redis 绑定 `127.0.0.1`、数据写入临时目录、关闭 RDB、启用 AOF 与 `appendfsync always`；写入跨进程事件后停止并重启 Redis。
- 结果：Redis 重启后 stream 长度与重启前一致，两个完整 API 进程重新就绪并继续完成协作写入。只证明本地测试环境的 AOF 恢复路径，不代表生产 Redis 持久性、HA、备份或故障切换能力。
- 修改范围：`tests/collaboration/redis-streams-integration.test.ts` 与版本、升级说明和进度文档。无业务运行逻辑、数据库结构、生产 Redis/Caddy 配置变化。
- 验证：`npm run test:collaboration-redis-integration` 通过；版本闭环另行执行 `npm run check`、`npm run build`、`npm run version:check`、`npm run test:version-governance`、定向 ESLint 与 `git diff --check`。
- 风险与下一步：Caddy 可执行文件未安装，仓库仅有单后端示例，安全部署仍要求单 PM2 实例；生产代理粘性会话、Redis 持久化/HA 尚未验收。下一阶段需在独立基础设施验收中核对真实代理拓扑及 Redis 持久化/恢复策略；不放宽生产单实例门禁。
- 仅本地修改，未提交、推送或部署；Android 仅同步版本元数据至 60002，未构建 APK 或开展原生端专项。

## v6.0.1 P2-8 官方导出并发验收（本地完成，无运行逻辑变化）

- 问题与验证：已挂载的 Creator Agent 官方导出 schema v2 原有单进程契约覆盖顺序重放，但缺少两个 API 进程同时提交相同批次 ID 的验收。本阶段扩展隔离契约测试，并新增子进程 worker；两个请求使用各自新 nonce、相同已签名批次数据和共享 SQLite。
- 结果：一份批次最多提交一次；如 SQLite 争用使请求得到可重试 503，调用方使用新 nonce 重试相同批次后返回重复批次结果，不会二次记账。此处只验证已有事务/批次幂等合同，没有修改业务处理代码。
- 修改范围：`scripts/official-export-v2-contract-test.ts`、`scripts/official-export-v2-worker.ts`；版本与说明文档按项目规则同步。无数据库迁移、无生产配置或数据变化。
- 验证：`npm run test:official-export-v2`、`npm run test:creator-sync-single-flight`、`npm run test:creator-agent-replay-security`、`npm run test:collaboration-coordination`、`npm run test:collaboration-redis-integration`、`npm run check`、`npm run build`、`npm run version:check`、`npm run test:version-governance`、定向 ESLint 与 `git diff --check` 均通过。临时 Redis 仅绑定本机并关闭 RDB/AOF；构建仅有既有的大 chunk 提示；未运行全量测试/全仓 lint。
- 边界：Creator Agent 标准 schema v1 继续由迁移 023 的账号运行态唯一索引互斥；旧 `/api/douyin/sync*` 返回 410；Webhook 仅验签并去重入库，没有活动 worker；未发现当前挂载路径需要共享周期调度。因此没有注册通用租约任务，也没有恢复未挂载的 `social-review` 服务。代理侧只有单后端 `deploy/linux/Caddyfile.example`，当前环境无 Caddy 可执行文件；`deploy/xmt-safe-deploy.sh` 仍强制恰好一个 PM2 实例。真实 Caddy 粘性会话、Redis 持久化/HA 和生产代理验收仍未完成，保留单实例部署门禁。
- 仅本地修改，未提交、推送或部署；Android 仅同步版本元数据至 60001，未构建 APK 或开展原生端专项。

## v6.0.0 P2-8 分布式任务租约底座（本地完成，尚未接入生产任务）

- 问题与实现：已有 Creator Agent 账号唯一索引只约束该业务运行态，不支持一般长任务的租约续期或崩溃接管。本阶段增加共享数据库租约 runner：原子抢占、按数据库时钟续租/释放、到期恢复、递增 fencing token，以及失去租约时的 `AbortSignal` 和执行前复核接口。
- 数据库变化：SAFE_EXPAND 迁移 024 新增 `distributed_job_leases`；释放后保留该 job 记录，确保 fencing token 单调递增。无历史数据改写或删除。
- 修改范围：runner、SAFE_EXPAND 迁移 024、迁移索引/策略、双 Node 进程测试、package/lock 与系统/Android 版本元数据，以及根目录/`docs` 更新日志、系统升级说明、系统版本、文档索引、架构升级计划、产品改造清单和阶段进度。只同步 Android 版本元数据至 60000，不构建 APK。
- 验证：`npm run test:distributed-job-lease` 通过，隔离 SQLite + 双 Node 进程覆盖并发互斥、超过初始租期仍持有、主动释放后接手、租约过期后发出中止信号并拒绝报告成功、进程崩溃后过期接管、fencing token 递增、旧持有者无法续租/释放新租约；测试同时覆盖 SQLite 并发写锁的有界退避。`npm run test:migration-readiness` 与本地只读 `npm run migration:check`（GO）、`npm run check`、`npm run build`、`npm run version:check`、`npm run test:version-governance`、`npm run test:entrypoints`（157 个文件）、定向 ESLint、`git diff --check` 均通过。构建有超过 500 kB 的分包提示；未运行全量测试或全仓 lint，也未执行迁移。
- 风险边界：模块尚未注册或启动任何生产任务。任务处理器必须响应取消信号、在副作用前复核租约；非幂等外部效果仍需下游 fencing 或幂等键。生产 Caddy/负载均衡、Redis 持久性/HA、任务级崩溃恢复与端到端副作用验收未完成，生产仍为单实例。
- 后台任务接入盘点（本次仅更新文档，无行为变更）：

  | 候选项 | 当前事实 | 接入判断 |
  |---|---|---|
  | 协作房间清理 | 清理的是每个进程自己的内存房间 | 不应全局互斥；每个实例都要清理 |
  | Yjs 自动快照 | 快照只存在进程内，多实例模式已关闭 | 不应接入；数据库 checkpoint 才是共享恢复来源 |
  | 数据库备份 | 由 systemd/CLI 在 API 外调度，调用方共用文件锁 | 保留现有边界，不能改成依赖业务数据库的租约 |
  | 远程浏览器画面流 | 依附本机用户会话、页面和 Socket 房间 | 不是可迁移的全局定时任务 |
  | 短视频采集计划 | 15 分钟轮询仅在显式开关下启动，API 没有启动调用；`api/app.ts` 明确不挂载 legacy `social-review` 路由；采集会打开账号持久浏览器 Profile、逐次新增任务记录，完成后才推进计划时间 | 当前 API 不可达，不应给未挂载的 legacy 服务扩建调度能力；只有在产品决定恢复这条业务路径后，再补跨 API/手动采集的账号级互斥、稳定计划发生标识、崩溃记录收敛与采集中止约定 |

- 下一步：先在当前已挂载的抖音 OpenAPI / Creator Agent 数据路径中确认是否存在真正需要横向共享调度的活动任务；本轮代码检索仅发现实例本地协作清理与 API 外备份。不得为了使用通用租约而恢复 legacy `social-review` 路由或启动旧采集调度器。若产品后续明确恢复该路径，再按上表补任务级互斥、幂等、崩溃恢复与取消语义，并用假适配器做双进程验收。
- 本次仅更新任务盘点文档，无系统行为变化，不另升版本；未执行生产任务、迁移、部署、提交或推送。
- 交付状态：仅本地修改，未提交、推送或部署。

## v5.0.3 P2-8 站内消息 ID 与持久记录一致（本地完成）

- 发现问题：实时 `new_message` 载荷原先使用 `Date.now()` 作为 ID，而消息中心按数据库主键执行已读操作；推送消息与实际持久记录的 ID 不一致。
- 实现：消息写入改用 `executeInsert` 返回的数据库 ID，写入成功后再把同一 ID 传给实时通知；未增加迁移，没改消息结构与通知房间。
- 验证：`npm run test:collaboration-redis-integration` 已扩展到两 API 进程真实 `createMessage` 路径，验证跨实例 `new_message`/未读数事件、用户房间隔离、推送 ID 对应可读取并可标记已读的持久记录，以及断线期间消息和未读数通过重连后的 API 恢复；`npm run test:notification-routing` 验证桌面端与 Web/移动消息页在实时事件和重连时刷新。Playwright MCP 以隔离消息 API 夹具实测桌面与 390×844 移动页收到刷新事件后重新请求并显示新增记录；Chrome DevTools MCP 在本机隔离 API/Socket.IO 服务的 500×824 移动视口和 1440×824 桌面视口实测实时消息推送，以及网络离线期间新增记录后恢复连接并更新消息列表/未读数，控制台无 error/warn。`npm run check`、`npm run build`、`npm run version:check` 和 `git diff --check` 通过；构建保留既有 Silk/Tiptap 大分包提示。
- 边界：验收使用本机临时 Redis、隔离 SQLite 和隔离 sticky-session 代理，不证明生产 Caddy/负载均衡、Redis 持久性/HA或压力下的投递语义。
- 下一步：分布式租约底座已在 v6.0.0 完成；应先盘点可安全迁移的具体任务并定义其幂等、取消和重试契约，不直接启动当前未挂载的 social ingestion scheduler。
- 版本：5.0.3；Android 仅同步元数据至 50003，未构建 APK。仅本地修改，未提交、推送或部署。

## v5.0.2 P2-8 采集任务跨进程互斥（本地完成）

- 审计结果：Yjs 临时快照在多实例时关闭；房间清理仅回收当前进程内存；备份由 API 进程之外的系统任务调度并通过共享锁互斥。每日短视频采集调度器只有导出函数、没有 API 启动调用，本轮没有接通或启用定时器。真实接收 Creator Agent `/data-sync` 的 `creator_sync_tasks` 原先只按 `(agent_id, task_id)` 幂等，不阻止同一抖音账号通过两台已绑定 Agent 并行同步；旧版 `social-review` 路由未挂载。
- 实现范围：SAFE_EXPAND 迁移 023 在 `creator_sync_tasks(platform, account)` 增加运行态局部唯一索引，保护实际挂载的 Creator Agent 标准同步（schema v1）。建索引前检查历史重复任务，发现冲突即停止，不自动清理记录。并发占用返回 HTTP 503、`CREATOR_SYNC_BUSY` 与 `Retry-After: 5`，避免上传队列将 409 视为已接收。保留终态任务同编号重试；SQLite 暂时占用有界退避。官方导出 schema v2 保留原事务与批次幂等路径；未改动未挂载的旧采集服务，未启用每日定时器。
- 验证：`npm run test:creator-sync-single-flight` 通过独立 Node 进程共享隔离 SQLite 的竞态（不使用测试专用 busy timeout），覆盖同账号互斥、同编号失败重试、运行中拒绝重入、结束释放、不同账号独立、数据库锁定/恢复以及历史重复记录原样保留；真实 HTTP 路由测试验证账号忙与 nonce 写库锁定都返回可重试 503，原有 nonce 防重放仍返回 409。Creator Agent v2.10.2 与官方导出 v3 契约测试、`npm run check`、`npm run build`、`npm run version:check`、`npm run migration:check`（GO）和 `git diff --check` 均通过。构建存在既有大分包体积提示；未运行全量 lint 或全量测试。
- 边界：唯一性要求所有 API/Agent 接收实例使用同一受支持数据库；不保证跨主机私有 SQLite、远端 Playwright 浏览器会话路由、任务进程崩溃恢复。通知语义、生产 Caddy/负载均衡、Redis 持久化/HA 与完整 job runner 仍未验收，Phase 4 未退出。仅本地修改，未提交、推送或部署；Android 仅同步版本元数据至 50002，未构建 APK 或开展原生端专项。

## v5.0.1 P2-8 真实 Redis Streams 跨进程验收（本地完成）

- 验收夹具：新增 `npm run test:collaboration-redis-integration`，启动只监听 `127.0.0.1` 的临时 Redis（关闭 RDB/AOF）、两个真实 API 子进程及一个共享隔离 SQLite；每次使用独立 Redis channel 前缀，不读取生产配置。隔离代理模拟轮询请求轮转会因无 affinity 失败；按 sticky cookie 固定节点后，真实 Socket.IO polling 和 websocket upgrade 成功。
- 跨实例行为：真实 JWT 用户分别连接两个 API 实例、通过生产 JOIN 授权入房；生产 `broadcastUserList()` 调用 `fetchSockets()` 后列出两端成员。A 跨进程锁定文档，B 的 Yjs 写入获得 `DOCUMENT_LOCKED`；解锁后两个客户端并发更新，共享 SQLite 以 1/2 连续版本保存且广播到另一端，回读两条更新能还原两端内容。
- 故障恢复：停止临时 Redis 后，两个 API 进程 readiness 关闭，更新得到 `COORDINATION_UNAVAILABLE` 且不落库；重启 Redis 后进程恢复，后续更新获 ACK version 3 并跨实例广播。由于临时 Redis 显式关闭持久化，本测试不证明 Redis 服务进程重启后的 stream 数据保留。
- 验证：`npm run test:collaboration-redis-integration`、`npm run test:collaboration-coordination`、`npm run check`、`npm run build`、版本门禁、测试入口（155 个文件）、定向 ESLint 与 `git diff --check` 通过。生产 Caddy/负载均衡配置、生产等价 Redis 持久性/HA、通知及后台任务多实例语义仍需另行验收。
- 交付边界：本机用 Homebrew 安装 Redis 8.10.2，仅临时回环服务用于测试。sticky-session 测试代理是隔离夹具，不等同真实 Caddy/生产代理。版本 5.0.1，Android 仅同步元数据至 50001，未构建 APK。无数据库迁移、未读取或修改生产设置；仅本地修改，未提交、推送或部署。

## v5.0.0 协作跨实例协调准备（P2-8 第四阶段，本地实现）

- 完成范围：新增可选 Redis Streams Socket.IO adapter。默认继续 `single`；多实例必须显式设置 `XMT_WEB_INSTANCE_COUNT`、`XMT_SOCKET_ADAPTER=redis-streams` 和 `XMT_REDIS_URL`。配置不完整、初次 Redis 连接失败会在有界重试后拒绝启动，不会回退成本机广播；Redis 重连期间协作 join/update/lock 暂停并保留客户端重试能力。
- 一致性：Yjs 追加写在 SQLite 写事务中复查文档锁与已持久版本；并发版本冲突或 SQLite busy/locked 会有界退避、重载 checkpoint+日志后重试。首次加入房间先刷新持久状态；presence 列表从 Socket.IO adapter 查询房间内跨实例连接。多实例关闭进程内临时快照，数据库 checkpoint 仍然开启。
- 验证：`test:yjs-runtime-persistence` 通过两个独立 Node 子进程共享隔离 SQLite 的并发写入，确认版本顺序为 1/2 且最终恢复包含两端编辑；同测试还验证独立缓存的收敛、持久锁拒绝更新、失败写入不改变运行态。`test:collaboration-coordination` 验证默认单实例、无 Redis/错误实例配置拒绝，以及本机 Redis 不可达时有界失败、不降级；`test:collaboration-access`、`test:collaboration-socket-authorization` 通过。`npm run check`、`npm run build`、`npm run version:check`、`npm run test:version-governance`、`npm run test:entrypoints`（154 个文件）与 `git diff --check` 通过。全仓 `npm run lint` 为 0 errors / 324 warnings；本次协作实现文件的定向 ESLint 为 0 warning。构建保留超过 500 kB 的前端分包提示。`npm audit --omit=dev` 显示 2 个 moderate advisory，均由基线已有 `express-rate-limit → ip-address@10.5.0` 引入；本轮未改动该依赖链。
- 未完成验收：本机没有 Redis server/Docker，未做真实 Redis Streams adapter 的双服务进程 Socket 广播、跨进程 presence、Redis 断开/恢复或连接池压力演练。前端保留 polling fallback，生产负载均衡必须 sticky session；尚未改 Caddy 或部署配置。当前只证明同主机独立进程共享一个隔离 SQLite 文件的 Yjs 写入行为，不证明跨主机/独立数据库配置。
- 适用边界：此阶段只为 Yjs/Socket 房间协调提供可选实现，不代表其余进程内事件流、指标状态或后台任务都已支持横向扩展。本轮未读取生产运行实例数，且未修改任何生产配置；代码默认仍为单实例。真实 Redis、sticky session、故障恢复和重复任务审计完成前不得启用多实例。
- 交付：新增 Redis 客户端/adapter 运行依赖，无数据库迁移；系统版本 5.0.0，Android 仅同步元数据至 50000，未构建 APK。仅本地修改，未提交、推送或部署。

## v4.5.0 创作建议正式提报归因（P2-2，本地完成关联阶段）

- 完成范围：用户明确把建议加入项目背景并正式提交时，将新选题 `topic_id` 与创作账号、建议 ID、当时的证据版本关联；不保存样本标题。正式提交同时把同一证据的反馈更新为“已采纳”。
- 权限与事务：选题创建时服务端重新核验 `creator:data:view`、账号范围及最新建议证据；过期证据返回冲突且不创建选题。选题、反馈与关联使用同一 SQLite 事务；无来源字段的普通选题沿用原路径。迁移 022 为 SAFE_EXPAND。
- 验证：`test:creator-topic-suggestions` 覆盖有效关联、同事务反馈、过期证据拒绝、权限拒绝、普通提报兼容和注入失败后的事务回滚；`test:creator-topic-suggestions-browser` 覆盖 1440/390/320px 与失败后保留草稿。Playwright MCP 与 Chrome DevTools MCP 本地实测桌面/移动提报并检查 POST 负载，来源账号、建议 ID 与证据 ID 均准确传递；模拟服务端 503 后输入仍保留，无框架异常或页面空白。`test:topics`、`test:api-contract`、`test:migration-readiness`、`version:check`、`test:version-governance`、`check`、153 个入口检查、定向 ESLint 与生产构建通过；`git diff --check` 通过。定向 ESLint 有 3 条 `AddTopic.tsx` 警告（2 条未使用变量、1 条 `any`）；构建保留既有超 500 kB 分包提示。
- 数据边界：表仅记录 `topic_id` 与证据键，并以该选题 ID 连接现有拍摄/发布指标；此阶段没有宣称已有真实发布效果或提供效果预测。首次部署前的真实采纳/发布关联仍待积累。
- 交付：系统版本 4.5.0；Android 仅同步元数据至 40500，未构建 APK；仅本地修改，未提交、推送或部署。

## v4.4.0 创作建议采纳反馈（P2-2，本地完成反馈采集阶段）

- 完成范围：数据指导创作的每条建议增加“暂不采用”显式反馈；从建议进入选题后，只有用户确认将证据加入项目背景草稿时才记录“已用于选题草稿”。卡片展示本账号成员对当前证据版本的两类计数及当前用户状态。
- 数据边界：建议生成稳定证据指纹（账号、入选样本/对照样本 ID 与播放指标）；迁移 021 按 Creator 账号、用户、建议 ID 和证据指纹建立唯一反馈。仅存样本数、中位数、比值和反馈结果，不存样本标题/正文。提交时重新核验账号权限与当前建议证据；已过期或被篡改的证据返回冲突，不归因给新样本。反馈是使用者自报，不是系统验证的采纳或发布效果。
- 验证：`npm run test:creator-topic-suggestions` 覆盖 SAFE_EXPAND 迁移、反馈写入/改选幂等、状态汇总、账号授权、权限拒绝、非法和过期证据；`npm run test:creator-topic-suggestions-browser` 覆盖桌面、390px 与 320px 反馈交互、加入草稿后的采纳记录、失败重试、未采用反馈、刷新/草稿保留和无横向溢出。
- 交付：系统版本 4.4.0；Android 仅同步元数据至 40400，未构建 APK；仅本地修改，未提交、推送或部署。
- 后续边界：生产真实用户采纳覆盖与发布后表现关联仍未完成，不能以隔离夹具推断运营效果；需版本部署并积累真实使用数据后继续核验。P2-1 标签覆盖率/别名治理同样依赖真实使用数据。

## v4.3.0 客户端协作待确认队列（P2-8 第三阶段，本地完成）

- 完成范围：客户端将每条本机 Yjs 增量先写入浏览器 IndexedDB，再进入现有 ACK/退避发送队列；按登录账号 ID 与精确 `roomId` 隔离，只保存尚未确认的增量，不保存完整稿件或已同步文档。
- 恢复顺序：进入房间先应用服务端 SYNC，再按本机追加顺序恢复待确认增量并重发；收到服务端成功 ACK 后才删除对应本机记录。ACK 丢失仍可能重发同一幂等 Yjs 更新。
- 失败保护：无法读取本机队列时不开放实时协作，并将正式稿件编辑器暂时设为只读，避免自动保存覆盖尚未恢复的增量；本机暂存写入失败会明确告警，同时仍尝试既有服务端 ACK 路径并提醒保存正式正文。每账号/房间限制 5000 条或 32 MiB。
- 验证：`npm run test:yjs-provider-ack` 覆盖暂存后发送、ACK 后清理、provider 重建恢复、断线期间队列读取竞态、恢复读取失败门禁和写入失败告警；`npm run test:production-review-browser` 覆盖桌面 ACK 失败/恢复、390px 移动告警及本机恢复失败只读状态。Playwright MCP 与 Chrome DevTools MCP 在隔离本地浏览器中实测真实 IndexedDB 写入、整页重新加载、服务端 SYNC 后内容恢复、更新重发及 ACK 清理。`test:yjs-runtime-persistence`、`test:collaboration-access`、`test:collaboration-socket-authorization`、`test:migration-readiness`、`version:check`、版本治理、`check`、定向 ESLint、153 个测试入口检查、生产构建与 `git diff --check` 均通过；构建保留既有 Silk/Tiptap 大分包提示。
- 数据与风险：不新增服务器数据库迁移、API、Socket 事件或正文写入路径。浏览器 IndexedDB 属于本机明文站点存储；用户清理站点数据、浏览器禁用/清理存储或达到容量上限时不保证找回，恢复读取失败会保持只读提示。多实例房间协调未解决。
- 交付：系统版本 4.3.0；Android 仅同步元数据至 40300，未构建 APK；仅本地修改，未提交、推送或部署。

## v4.2.0 协作更新确认与重试（P2-8 第二阶段，本地完成）

- 完成范围：现有 `collaboration:update` 增加可选 Socket.IO ACK，不改事件名/更新负载、不新增迁移。服务端成功 ACK 只在持久化、应用到运行态并广播后返回；校验、授权、锁定、容量和持久化失败均返回明确负 ACK。旧客户端不传 ACK 时仍保留原冲突事件行为。
- 客户端可靠性：最多一个 Yjs 更新批次在途；收到成功 ACK 才出队，失败/确认超时会保留批次并指数退避重试，连续输入不能绕过退避。断线时保留在途/排队更新，重新 SYNC 后再补发；全部批次确认成功后才清除协作错误提示。
- 验证：`npm run test:collaboration-access` 覆盖服务端成功确认、未加入房间拒绝确认及拒绝事件不误广播房间锁；`npm run test:yjs-provider-ack` 覆盖锁定时保留批次并在解锁后重试；`npm run test:production-review-browser` 在桌面稿件编辑中注入两次持久化拒绝，验证告警可见、退避后确认成功并消除告警；390px 移动端同样覆盖告警可见、确认恢复及无横向溢出，并保留既有批注流程。`test:yjs-runtime-persistence`、`test:collaboration-socket-authorization`、`test:migration-readiness`、`npm run check`、定向 ESLint、`npm run version:check`、`npm run test:version-governance`、构建、153 个测试入口检查与 `git diff --check` 通过。
- 浏览器环境：仓库隔离 Playwright fixture 与 Chrome DevTools MCP 本地 fixture；桌面/移动失败告警截图分别为 `/tmp/xmt-yjs-persistence-error-message.png`、`/tmp/xmt-yjs-persistence-error-mobile-390.png`。此会话未提供 Browser 插件/skill，按已安装的本地 Playwright 与 Chrome DevTools MCP 验收。
- 边界：客户端未确认批次只在当前页面内存；页面关闭、浏览器崩溃或 50ms 批次提交前仍不保证离线恢复。ACK 丢失后可能重复追加同一幂等 Yjs update；checkpoint 会压缩旧日志。正式正文自动保存仍是业务真源；单实例假设与未部署迁移 020 不变。
- 交付：系统版本 4.2.0，Android 仅同步元数据至 40200；仅本地修改，未提交、推送、部署或运行生产迁移。

## v4.1.0 Yjs 运行态持久化（P2-8，本地完成首阶段）

- 完成范围：协作服务端仅在更新成功写入 SQLite 后才替换内存文档并广播；房间加入前先从 checkpoint 与追加日志恢复 Yjs 文档。恢复失败拒绝加入，持久化失败不广播，前端显示可理解的协作异常提示。
- 数据生命周期：新增 SAFE_EXPAND 迁移 020，按 `production` / `shooting` 文档身份存储快照和有序增量；每 100 次更新生成 checkpoint 并压缩旧日志。业务稿件/拍摄记录删除时同步清理协作副本；损坏快照、版本缺口和超 16 MiB 的文档均 fail closed。
- 正文与协作边界：正式稿件正文仍由原有自动保存、版本、审阅和时间线机制管理；Yjs 持久化是服务端已接收更新的运行态恢复能力，不替代正文保存。浏览器现有发送批次尚无服务端 ACK，断线期间尚未被服务端接受的尾部输入仍不在本阶段保证内；进程/SQLite 按单实例部署假设运行。
- 验证：`npm run test:yjs-runtime-persistence` 覆盖未 checkpoint 更新恢复、100 条 checkpoint/日志压缩、写入失败不变更内存、删除清理及损坏/缺口 fail-closed；`npm run test:yjs-invalid-update`、`npm run test:collaboration-socket-authorization`、`npm run test:migration-readiness`、`npm run version:check`、`npm run test:version-governance`、`npm run test:entrypoints`（152 个文件）、`npm run check`、`npm run build`、定向 ESLint 与 `git diff --check` 均通过。生产构建仅有既有 Silk/Tiptap 大 chunk 提示。
- 浏览器验收：`npm run test:production-review-browser` 通过桌面审阅/回复/建议保存流程与 390px 移动批注流程，无页面错误或横向溢出；在隔离本地 fixture 上通过 Chrome DevTools MCP 验证协作失败提示，500px 视口 `scrollWidth=492`，控制台无 error/warn。失败提示截图：`/tmp/xmt-yjs-persistence-error-message.png`。
- 交付与风险：系统版本 4.1.0，Android 仅同步版本元数据；只在本地修改，未提交、推送、部署或运行生产迁移。首次生产升级前需让编辑器完成现有正文自动保存；迁移不会回填部署前仅存在于内存的 Yjs 状态。
- 后续：v4.3.0 已为页面关闭前尚未获 ACK 的客户端更新增加 IndexedDB 暂存和重开恢复；多实例房间协调仍未解决。生产部署、迁移和真实多人重启演练需等用户明确下令后按安全发布流程进行。

## v4.0.0 指标单一真源与抖音优先口径（P2-7，本地完成）

- 完成范围：发布记录成为播放、点赞、分享、评论的统计归属；抖音官方导出对每项指标优先，手工值只补缺并按项标注来源。手工值明确为单条作品截至录入时的累计值，不是单日增量。
- 统一消费者：发布列表/编辑、月度与用户统计、周报、分析导出、主题资产卡片、发布归档和复盘周期快照共用发布级指标解析；每个指标分别选择来源，官方明确观测到的 0 也优先保留。
- 历史边界：旧 `analytics` 行未回填、删除或改写；只有选题和发布时间唯一匹配时，旧值才可用于对应发布记录。未关联或同日多发布的历史行保留可查看并计入未匹配/歧义说明，不进入发布级汇总。账号日流量不与作品累计值混算。
- 数据库与来源审计：新增 SAFE_EXPAND 迁移 019，记录发布级手工值/操作者/时间以及作品快照来源文件摘要和各指标存在标记；官方导入与创作者中心采集均保留来源语义。Android 只同步版本元数据，不做原生端专项或 APK 构建。
- 验证：`npm run test:publishing-metric-sources` 覆盖来源优先级、显式 0、旧记录唯一/歧义映射、月度和本周汇总、归档及复盘快照；`test:analytics-write-scope`、`test:publishing-douyin-link`、`test:content-topic-assets`、`test:official-export-v2`、`test:creator-sync-v2102`、`test:creator-agent-replay-security`、`test:creator-unified-reports` 和 `test:migration-readiness` 均通过。`npm run check`、`npm run version:check`、版本治理、151 个测试入口检查、`npm run build` 与 `git diff --check` 通过。定向 ESLint 为 0 errors；`api/routes/export.ts` 保留 3 条既有 `any` warning，未扩展修复范围。
- 浏览器验收：仓库 Playwright 隔离 fixture 验证主题资产页 320/390/1440px、路由与页面标识、来源文字、维度添加失败后显式重试、筛选、无水平溢出及无意外页面错误；Browser 插件未在当前会话提供，因此按前端测试规范使用仓库 Playwright。
- 交付边界：系统版本 4.0.0，仅本地修改；未提交、推送、部署或运行生产迁移，也未连接真实生产账号。
- 下一阶段：P2-8 Yjs 运行态持久化；先核对文档中所述 Node 内存运行态、HTML 恢复、房间/文档身份与现有持久化生命周期，再设计可兼容、可恢复的数据方案。

## v3.8.0 品牌化配置与默认主题（2026-09-29）

- 完成范围：P2-6。核对系统名称、品牌 Logo/文案和登录页配置已由统一系统设置管理；新增系统默认主题管理项，兼容旧版设置记录，默认沿用暗色主题。
- 生效边界：无本地主题选择的浏览器采用系统默认主题；浏览器已保存的个人选择优先，不会被管理员变更覆盖。管理员保存系统设置后，当前未设置个人主题的页面会同步更新。
- 修改范围：`src/lib/systemSettings.ts`、`api/routes/system-settings.ts`、`src/App.tsx`、`src/store/index.ts`、`src/pages/NotificationSettings.tsx`；补充系统设置单测和浏览器回归，并同步版本、更新说明与路线文档。
- 数据与权限：继续复用 `app_meta.system_settings` 和 `system:settings` 管理权限；默认主题随既有公开品牌配置读取，无新表、迁移或个人主题写入。
- 验证：系统配置规范化/旧值兼容/个人选择优先级单元测试、类型检查、版本一致性、构建与浏览器交互验收通过。
- 交付：系统版本 3.8.0 / Android 30800（版本元数据对齐，不含 Android 专项实现或 APK 构建）。仅本地修改，未提交、推送或部署。
- 后续：P2-7 发布级指标口径已在 v4.0.0 本地实现；未匹配的旧选题级数据仍保留原样，是否人工确认迁入单独评估。

## v3.7.0 移动端稿件批注（2026-09-29）

- 完成范围：P2-5 移动端首阶段；移动创作页复用协作批注面板，支持选中文字发起批注/建议、阅读回复、回复讨论、定位原文与结束讨论，不再只读稿件正文。
- 权限与版本：复用 `workflow:comment`、稿件参与范围与当前版本限制；修改建议是否可接受仍由 `production:update` 和稿件编辑归属控制；没有新增 API/权限/数据库迁移。
- 验证：`npm run test:production-review-browser` 覆盖桌面批注/回复/建议/保存后采纳及 390px 移动端批注创建，并断言页面无横向溢出、无页面错误；Playwright MCP 和 Chrome DevTools MCP 在 390×844 移动视口实测新建批注与讨论展示，Chrome 控制台无 error/warn，并检查首屏及滚动后布局。
- 推送边界：当前只看到 Android 设备登记、管理员 `XMT_ANDROID_PUSH_ENABLED` 门控和 Firebase 配置提示，没有已启用的 FCM 发送端/应用配置；未添加虚假开关、未请求或读取推送凭据，推送保持默认关闭。P2-5 的 Android 推送集成与真机推送验收仍待服务配置。
- 交付：系统版本 3.7.0 / Android 30700；本地修改，未提交、推送、部署或构建 APK。
- 后续边界：Android 原生端和推送服务按用户要求延期至未来专项；网页移动端批注首阶段已完成，P2-6 品牌化配置随后在 v3.8.0 本地完成。

## v3.6.0 协作批注与审阅建议（2026-09-29）

- 完成范围：P2-4 为生产稿件新增按稿件版本隔离的批注讨论和修改建议；支持批注回复、结束讨论、定位原文、建议接受或拒绝。新线程保存原文、前后上下文和位置，正文变动后仅在唯一匹配时允许接受建议。
- 权限与历史：读取复用稿件参与范围；新建/回复/处理沿用 `workflow:comment`，接受建议另需 `production:update` 和稿件归属编辑权限。只允许在当前版本新建或修改，已知历史版本可读、不可写；评论结束仅限作者或管理员处理。
- 保存安全：接受建议先精确替换原文并等待现有编辑器自动保存返回 synced，之后才将建议标记为已采纳；锚点不匹配或保存结果未确认时保持待处理并显示具体反馈。
- 验证：`npm run test:production-review`、`npm run test:migration-readiness`、`npm run test:production-review-browser`、`npm run version:check`、`npm run check`、`npm run build` 与定向 ESLint 通过；Playwright MCP 与 Chrome DevTools MCP 覆盖批注、回复、建议替换与保存后采纳，Chrome 控制台无错误。浏览器仅连接隔离内存/SQLite 测试夹具，不触及真实业务数据。
- 数据库与交付：新增 SAFE_EXPAND 迁移 018；系统版本 3.6.0 / Android 30600。仅本地修改，未提交、推送或部署；未运行生产迁移、未构建 APK。
- 下一步：P2-5 移动端审核/评论完整化（推送默认关闭，按需启用）。P2-2 真实账号样本、采纳反馈与效果跟踪仍需版本发布并积累使用后核实。

## v3.5.0 全局内容搜索（2026-09-29）

- 完成范围：全局命令面板支持稿件正文、资料全文、日报/条目、复盘摘要/行动项/指标，并保留选题、成员和页面搜索；输入至少 2 个字符后 250ms 防抖并行请求，按每源 8 条限制、取消过期请求，局部失败有重试入口。
- 权限边界：创作稿件沿用生产记录的创建者/负责人/操作者范围；资源复用资源中心 FTS 和 `resource:view`；日报搜索及日期归档服从本人/`report:daily:archive` 范围；复盘复用既有公开/负责人/授权规则；选题与用户继续使用现有 `topic:view` / `user:view`。稿件只返回最小元信息，不返回正文。
- 日报直达：仅有 `report:daily:submit` 时，归档接口和页面仅开放本人记录；有归档权限时可继续筛选成员。搜索结果携带日期和用户 ID 预选对应日报，不改变月报/年报权限。
- 验证：`npm run test:global-search` 隔离 SQLite/HTTP 覆盖稿件可见范围与最小响应、短词校验、日报本人隔离与日期归档、资源 FTS、复盘行动项全文；`npm run test:global-search-browser` 覆盖 Ctrl/⌘K、最短查询门槛、六来源并行命中及日报直达。Playwright MCP 与 Chrome DevTools MCP 均实测桌面快捷入口、六类结果和日报日期筛选；Chrome 控制台无 error。`npm run version:check`、`npm run check`、`npm run build`、`git diff --check` 均通过；定向 ESLint 为 0 errors，`api/routes/workflow.ts` 有 12 条既有 warning。构建保留 Vite 对 Tiptap/Silk 大 chunk 的既有提示。
- 数据库与交付：无数据库迁移、无生产读写；系统版本 3.5.0 / Android 30500。仅本地修改，未提交、推送或部署。
- 下一步：P2-4 协作编辑增强（批注线程、审阅建议模式）；P2-2 的真实账号样本、采纳反馈与效果跟踪仍需本地版本发布并积累使用后核实。

## v3.4.0 作品表现驱动选题构思（2026-09-28）

- 完成范围：P2-2 首阶段打通“运营概览 → 有依据的创作方向 → 桌面/移动提报页 → 用户确认追加项目背景”。不生成虚构标题、不自动提交；标题、平台与已有草稿均保留，重复追加按钮禁用。查看样本在新窗口打开，复盘与托管封面请求均保留账号范围。
- 计算口径：复用当前挂载的 Creator Agent 驾驶舱与 `canonicalizeDouyinWorks`，在单个授权账号内识别显式标签和问号标题。只纳入发布满 2–90 天、作品记录最近 7 天更新、播放量大于 0 的作品，按 2–7、8–30、31–90 天分组；同组特征/非特征各至少 3 条、累计播放中位数比值 ≥1.5 才展示，最多 3 条方向。显示样本数、两组中位数、比例、各最多 3 条样本与规则。只是观察性线索，不能解释为因果或效果保证，不混用官方账号汇总。
- 权限与数据：沿用 `creator:data:view` 和当前 Creator 查看范围（全站授权查看规则未改变，不擅自改为用户私有）；新建/应用还需 `topic:create`。URL 只传账号与建议 ID，进入提报页重新请求服务端；数据失败可显式重试，建议失效不套用旧内容。无新迁移、权限码、依赖或 AI 服务调用；不启用未挂载的 social-review 路由。
- 测试：`test:creator-topic-suggestions` 覆盖确定性结果、样本门槛、发布时间分组、过期/未来/异常指标、显式特征、去重及隔离 SQLite 驾驶舱集成；真实路由覆盖 401、403、账号不存在 404 与两账号样本隔离。`test:creator-unified-reports` 保持官方汇总、周期口径和报告隔离回归通过。`test:creator-topic-suggestions-browser` 覆盖两组样本→带账号范围的新窗口复盘→新建→本机草稿刷新恢复→手动追加→提报失败恢复、失败不反复请求、显式重试、建议失效、无创建/无分析权限；1440/390/320px 无横向溢出、无非预期控制台 error。
- MCP 验收：按用户指定使用 Playwright MCP（390px 进入、320px 核验）与 Chrome DevTools MCP（1440px），在本机独立内存 API + Socket.IO 测试服务实测建议入口、手动追加、原标题和背景保留及重复操作禁用。Playwright 页面 client/scroll 均 312px，Chrome 均 1440px。两套均无控制台 error，保留 2 条既有 React Bits `magic-bento` 安全映射 warning。截图 `/Users/youfeifei/Projects/xmt/.playwright-mcp/creator-topic-reference-mobile-320-panel.png`；完整表单自动回归截图 `/tmp/xmt-creator-topic-reference-{1440,390,320}.png`。Chrome 截图以工具内联返回，文件写入被 MCP 工作区限制拒绝，未宣称已保存。
- 工程检查：类型检查、定向 ESLint（0 error；AddTopic 3 条既有 warning）、版本一致性/治理、144 个测试入口与构建通过；构建仍有既有 Silk 843.50 kB / Tiptap 554.72 kB 大 chunk 提示。新增业务能力按开发规范 Minor +1，版本 3.4.0 / Android 30400。
- 后续边界：P2-2 真实账号覆盖、建议采纳反馈与后续效果追踪尚未完成；P2-1 真实标签覆盖/别名治理继续待发布后积累数据。当前不建立历史推测关系，不把本地模拟样本视为实际运营收益。
- 交付状态：仅本地修改，未提交、推送或部署；未连接生产数据库或测试账号，未同步 Android Web 资源或构建 APK。保留工作区中此前修改。

## v3.3.54 选题详情维度录入（2026-09-28）

- 完成内容：桌面、移动选题详情共用城市/人物/项目登记面板，支持读取既有标签、显式添加和移除；失败状态保留提示与重试，不吞掉 API 错误。
- 权限与审计：读取继续使用 `topic:view` 与 `canViewTopic`；写入入口以现有 `canEditTopic` 控制，服务端仍同时校验 `topic:update` 和选题归属；新增/移除仍写入原子化选题历史。
- 数据边界：无新增迁移、权限码或实体模型；只管理用户明确录入的选题级关系，不猜测历史文本、不改写正式资源关联。
- 验证：`npm run test:content-topic-assets` 隔离 SQLite 覆盖维度 GET、操作者信息、城市/人物/项目写入、重复冲突、筛选聚合、越权与历史；`npm run test:migration-readiness` 通过。`npm run test:mobile-work-center-browser` 覆盖移动详情新增/移除、桌面详情录入，并验证 320px、390px、1440px 与桌面详情缩窄至 320px 均无页面横向溢出；浏览器夹具无未预期错误。Playwright MCP 与 Chrome DevTools MCP 在本地 Vite 页面实测选题详情加载、城市/人物标签添加→立即显示→移除→空态恢复；Playwright 真实 320px 视口和 Chrome DevTools 可用的 500px 最窄窗口均无页面溢出。API 为浏览器内存夹具，未调用真实后端或数据库。`npm run check`、版本检查/治理、142 个测试入口、生产构建与 `git diff --check` 均通过；定向 ESLint 无错误，`TopicDetail.tsx` 保留 6 条既有 warning。生产构建保留既有 Silk（843.50 kB）与 Tiptap（554.72 kB）大 chunk 提示。
- MCP 运行边界：本机只启动 Vite 前端，后端未启动；匿名登录页公共系统设置请求及 Socket.IO 连接返回 500。登录页/API/Socket 噪音与维度夹具交互分开记录，不将整页控制台宣称为零错误。
- 截图：Playwright MCP 桌面视口 `/Users/youfeifei/Projects/xmt/.playwright-mcp/page-2026-09-28T08-32-13-486Z.png`、窄屏桌面详情 `/Users/youfeifei/Projects/xmt/.playwright-mcp/topic-dimensions-320-after-fix.png`；隔离套件桌面 `/tmp/xmt-topic-dimensions-desktop-1440.png`、移动 `/tmp/xmt-topic-dimensions-mobile-390.png`、窄屏 `/tmp/xmt-mobile-work-center-responsive-320-topic-dimensions.png`。
- 下一步：P2-1 的真实覆盖率、命名重复与别名治理仍待本地版本发布后观察；迁移 017 尚未部署，不建立自动合并规则或导入历史标签。P2-2 盘点发现：Creator Center 已有账号基线评分和高表现作品，但没有面向新选题的证据链建议；文档生成助手标题来自当前稿件演化，不是作品表现。另有标题特征报告服务，但在 `api/app.ts` 中对应的 social-review 路由明确未挂载，且特征词为静态集合。下一阶段应复用当前账号可见的 Creator Agent 数据，设置最小样本与账号基线对照，显示样本及指标依据，并仅在同时拥有 `topic:create` 时提供新建入口；不从文字自动推断历史主题。
- 风险说明：仅本地修改，不提交、推送或部署；未运行迁移、未读写生产数据库、未进行真实账号/服务端 API 验收。Android `versionName/versionCode` 随系统版本更新，未构建 APK 或同步生产 Web 资源。

## v3.3.53 选题内容资产维度登记与聚合（2026-09-28）

- 完成内容：在选题维度显式登记城市、人物和项目；主题内容资产支持筛选，并展示按维度聚合的主题、稿件、当前账号可见资料、拍摄与发布数量。跨选题的同一资料按资源 ID 去重。
- 数据边界：新增迁移 017（SAFE_EXPAND）创建唯一约束的维度表与查询索引；只写入用户明确登记的选题关系，不读取自由文本回填，不修改资源关联或历史指标。新增/删除及操作者写入选题历史，使用同一事务。
- 权限：API 同时执行 `topic:update` 和 `canEditTopic`；读取和筛选选项仅从当前账号可见选题生成，资料汇总继续应用资源权限，分析指标继续受 `analytics:view` 控制。
- 验证：`npm run test:content-topic-assets` 隔离 SQLite 覆盖迁移 017 安装、城市/人物/项目录入、标准化重复冲突、长度校验、按维度筛选/汇总、资源权限过滤、越权读取/写入及选题历史记录；`npm run test:mobile-work-center-browser` 覆盖维度登记 503 明确报错→用户显式重试、标签显示与筛选，320px/390px/1440px 无横向溢出且无非预期浏览器错误。`npm run check`、改动文件定向 ESLint（0 warning）、`npm run version:check`、`npm run test:version-governance`、`npm run test:migration-readiness`、`npm run test:entrypoints`（142 个文件）、Android runtime/production endpoint 契约、生产构建与 `npm run mobile:sync:production`、`git diff --check` 通过；Android Web manifest 为 `3.3.53 / 30353`。
- 截图：移动 390px `/tmp/xmt-topic-assets-mobile-390.png`；桌面 1440px `/tmp/xmt-topic-assets-desktop-1440.png`。
- 下一步：继续 P2-1，核实登记维度的实际覆盖与重复治理需求，再决定是否建立独立地点/人物/项目实体及历史资料的人工确认导入；不得从文本自动推断。
- 风险说明：Browser 插件未在当前会话工具中提供，按前端测试规范使用仓库 Playwright 与隔离 API/浏览器 fixture；未连接真实账号/生产 API，未执行生产迁移、未构建 APK/真机验收。仅本地修改，不提交、推送或部署；不触碰生产数据库。构建保留既有 Silk（843.50 kB）与 Tiptap（554.72 kB）大 chunk 警告。

## v3.3.52 主题内容资产按选题聚合（2026-09-28）

- 完成内容：资料中心新增“主题内容资产”视图，以选题为稳定锚点汇总创作稿件、关联资料、拍摄、发布和最近一次数据；支持按主题搜索、分页以及直达选题/最新稿件。
- 关联口径：资料只通过 `resource_relations` 的正式引用关联归入选题，并覆盖直接选题、稿件、拍摄、发布四种关联路径；跨路径重复资料去重。仅统计账号可见资料和可见选题，不通过标题/正文相似度猜测历史关系。
- 权限与数据：聚合 API 同时要求 `resource:view` 和 `topic:view`；私密资料继续按资源归属过滤；最近指标仅在 `analytics:view` 下返回。只读，无 API 写入、权限码变化或数据库迁移。
- 维度边界：当前没有城市、人物的结构化关联字段，也没有独立的内容项目实体；本阶段不把拍摄地点或文本标签冒充可靠维度。P2-1 仍未全部完成。
- 验证：`npm run test:content-topic-assets` 隔离 SQLite 覆盖账号范围、资料私密过滤、关联去重、分析权限、搜索和分页；`npm run test:mobile-work-center-browser` 在移动 320px/390px 与桌面 1440px 验证页面、搜索、平台中文映射、服务端错误显示、单次重试、无水平溢出和无浏览器错误。`npm run check`、改动文件定向 ESLint（0 warning）、`npm run version:check`、版本治理、`npm run test:entrypoints`（142 个文件）、Android runtime/production endpoint 契约、`npm run build`、`npm run mobile:sync:production` 与 `git diff --check` 通过；Android Web 资源 manifest 为 `3.3.52 / 30352`。
- 截图：移动 320px `/tmp/xmt-mobile-work-center-responsive-320-topic-assets.png`；移动 390px `/tmp/xmt-topic-assets-mobile-390.png`；桌面 1440px `/tmp/xmt-topic-assets-desktop-1440.png`。
- 风险说明：Browser 插件未在当前会话工具中提供，使用仓库 Playwright 与隔离 API/浏览器 fixture；未连接真实账号/生产 API，未构建 APK/真机验收，不提交、推送或部署。构建保留既有 Silk（843.50 kB）与 Tiptap（554.72 kB）大 chunk 警告。
- 下一步：继续 P2-1，确定城市/人物/项目需要的明确录入与关联模型，再增加可审计的结构化关系；不依据自由文本自动回填历史记录。

## v3.3.51 选题草稿续写与失败恢复（2026-09-28）

- 当前版本：v3.3.51；Creator Agent 版本保持不变。
- 完成内容：复核并覆盖桌面手动保存/刷新恢复、移动自动与手动保存/刷新恢复；两个端的提报 API 首次失败时保留表单和已存草稿，重试成功后才清理对应草稿。移动端现在检查自动/手动本机写入结果，存储不可用时显示错误提示，不再把失败静默当作保存成功。
- 数据与账号边界：桌面草稿 key 继续按登录用户区分，移动使用 `userSafeDraftKey`；旧版/其他账号草稿不跨账号恢复。只写浏览器本机存储，不写 API/数据库；无权限或 API 契约变化。
- 验证：`npm run test:mobile-safe-draft` 覆盖账号隔离与存储写入失败保持旧草稿；`npm run test:mobile-work-center-browser` 覆盖移动端 390px、桌面 1440px 保存→刷新恢复→提报 503 保留→重试成功清理，并模拟 localStorage 配额错误；完整工作中心 320px/390px 及桌面流程回归通过。`npm run check`、改动文件定向 ESLint（0 warning）、`npm run version:check`、版本治理、`npm run test:entrypoints`（141 个文件）、Android runtime/production endpoint 契约、生产构建、`npm run mobile:sync:production` 与 `git diff --check` 通过；manifest 为 `3.3.51 / 30351`。
- 截图：移动恢复 `/tmp/xmt-topic-draft-mobile-restored-390.png`；存储错误提示 `/tmp/xmt-topic-draft-storage-error-390.png`；桌面恢复 `/tmp/xmt-topic-draft-desktop-restored-1440.png`。
- 风险说明：Browser 插件未在当前工具中提供，使用仓库 Playwright 与隔离 API fixture；localStorage 故障由浏览器夹具模拟，未连接真实账号/生产 API，未构建 APK/真机验收，不提交、推送或部署。
- 下一步：进入改造清单 P2-1 内容资产库，先盘点现有稿件/资源/项目关联与检索能力，再确定按城市、人物、项目聚合的最小可信数据模型；不复制或猜测历史关联。

## v3.3.50 选题列表与看板合并（2026-09-28）

- 当前版本：v3.3.50；Creator Agent 版本保持不变。
- 完成内容：桌面与移动选题管理均支持 URL 可分享的列表/看板切换，共用标题搜索和阶段筛选；看板支持平台、负责人过滤，最多读取 200 条服务端数据，超出范围时明确提示。待审核按钮按 `topic:audit` 调审核接口，其它合法阶段转换按 `topic:update` 调状态接口。移动工作中心看板入口改为进入选题看板，旧 `/kanban` 在桌面和移动端均重定向到该视图，卡片返回会保留看板上下文；桌面移除重复的看板导航项。内容操作系统、内容智能、创作建议和两个协作分析页合并为“系统 → 内容实验室”五视图，旧五条路由按原页面定向兼容；番茄钟保留 `/pomodoro`，退出调试入口导航。
- 保留边界：日历包含独立排期事件，继续由排期日历管理，不并入只含 Topic 的看板；`/resources` 已有兼容重定向。无数据库迁移和业务数据写入。
- 验证：`npm run test:mobile-work-center-browser` 在 320px/390px 验证移动工作中心、日历、灵感、选题看板、旧 `/kanban` 跳转、日报和拍摄/发布流程，页面无水平溢出且夹具测试无未处理浏览器错误；同一套回归在桌面 1440px 验证选题列表/看板切换、待审核走审核 API、旧看板路由、内容实验室旧地址兼容及导航返回。`npm run check`、定向 ESLint（0 错误，Topics.tsx 有 2 条既有 `no-empty` 警告）、`npm run test:kanban-navigation`、`npm run test:topics`、`npm run test:entrypoints`（141 个文件）、`npm run version:check`、`npm run test:version-governance`、Android runtime/production endpoint 契约、`npm run build`、`npm run mobile:sync:production` 与 `git diff --check` 均通过；Android Web 资源 manifest 为 `3.3.50 / 30350`。
- 风险说明：Browser 插件未在当前可用工具中提供，按前端测试规范使用仓库 Playwright 与隔离 API fixture；未连接真实账号/生产 API，未构建 APK/真机验收，不提交、推送或部署。构建保留仓库既有 Silk（843.50 kB）与 Tiptap（554.72 kB）大 chunk 提示。
- 下一步：清单 P1-10 的选题提报与移动端已有按用户/设备隔离的本地草稿恢复能力；先复核桌面与移动覆盖及失败恢复测试，再进入 P2-1 内容资产库（按城市/人物/项目聚合历史稿、资料、数据）。日历继续保留独立排期事件能力。

## v3.3.49 消息与人员列表分页（2026-09-28）

- 当前版本：v3.3.49；Creator Agent 版本保持不变。
- 完成内容：消息中心按服务端页码加载；“全部/未读/待处理/系统”筛选与精确总数共用同一查询口径。未读、待处理、消息总量卡片显示当前账号全量汇总，不随页码变化；“全部已读”通过一次用户范围请求覆盖所有页，筛选后页码回到第 1 页，末页移除未读时自动回退有效页。人员管理改为每页 50 人，按用户名/姓名/邮箱在服务端搜索全部记录，搜索结果同样可分页。
- API 与数据边界：消息列表增加用户范围汇总及 `link=present|absent` 筛选；用户列表增加带权限保护的搜索并与总数共用同一过滤条件。分页参数使用安全默认值、限制上限，排序稳定；现有认证、本人消息和 `user:view` 权限约束不变，无数据库迁移或业务数据回填。
- 首页盘点：首页阶段数量已经使用服务端准确 `total`，仅加载每阶段 5 条样例与固定数量近期稿件；没有把样例条数作为全局指标。本次不新增会改变现有角色/数据范围的汇总接口。
- 验证：隔离 SQLite API 测试覆盖消息 45 条分页、read/link 组合筛选、汇总按账号隔离、全账号批量已读、人员管理跨页与服务端搜索（含 `%` 字面搜索）及 `user:view` 权限；`npm run test:mobile-work-center-browser` 在桌面 1440px 验证消息页码/筛选/全局汇总/跨页已读和人员管理 65 人翻页/跨页搜索，并保留移动端 320/390px 回归。`npm run check`、改动文件定向 ESLint（0 warning）、`npm run test:entrypoints`（141 个文件）、`npm run version:check`、版本治理、Android build-endpoint/runtime/production-endpoint 契约与 `git diff --check` 通过。`npm run mobile:sync:production` 的前端生产构建和 Android Web 资源同步通过，版本 manifest 为 `3.3.49 / 30349`。
- 风险说明：Browser 插件未在当前可用工具中提供，使用仓库 Playwright 隔离浏览器；未连接真实账号/生产 API，不提交、推送或部署。Android APK/真机本阶段不构建或验收；生产构建保留既有 Silk 分包超过 500 kB 提示。
- 下一步：继续按改造清单 P1-9 核对重复入口收敛；Home 当前汇总准确性已核实，无需改动。

## v3.3.48 移动端选题一键开工（2026-09-28）

- 当前版本：v3.3.48；Creator Agent 版本保持不变。
- 完成内容：移动选题详情对有创作权限且可编辑该选题的成员，在“已通过/创作中”阶段显示“开始创作/进入创作”。先按选题查找稿件，存在则直达复用；缺失时创建 `v1.0` 草稿并带入选题大纲、推进至创作阶段，打开移动编辑页后可返回原选题。阶段同步失败时保留稿件并给出警告。
- 范围边界：复用现有 workflow 查询/创建/选题状态 API；无数据库迁移或权限契约变化。按钮按 `production:update` 和服务端既有选题所有权规则显示；离线不发起创建。
- 验证：`npm run test:mobile-work-center-browser`、`npm run check`、改动文件定向 ESLint（0 错误；AddTopic 保留 3 条未触及的旧警告）、`npm run version:check`（v3.3.48）、`npm run test:version-governance`、`npm run test:entrypoints`（139 个文件）、Android build-endpoint/runtime 契约、`npm run mobile:sync:production` 和 `git diff --check` 通过。隔离 Playwright 在 390px 验证已有稿件复用不新增、缺失稿件带入大纲并只创建一次、状态同步及返回原选题；截图 `/tmp/xmt-mobile-topic-start-production-390.png`。
- 风险说明：`npm run test:apk-endpoint-artifact` 因磁盘上的旧 Debug APK 不含当前要求的 build manifest 未通过；Java/adb/Android SDK 不可用，APK/真机未构建或验收。真实账号/生产服务未连接；不提交、推送或部署。
- 下一步：补齐 P1 列表分页遗留。当前创作列表已有分页、首页使用有界请求；消息中心仍无页码切换且只读取接口默认 20 条，应先实现筛选与总数一致的服务端分页。

## v3.3.47 标题相似提醒（2026-09-28）

- 当前版本：v3.3.47；Creator Agent 版本保持不变。
- 完成内容：桌面和移动端选题提报、灵感转选题前，按标题少量检索当前账号可查看的选题并做相似度排序。命中时展示已有标题和状态，只有用户明确选择“仍然提报/仍然转为选题”后才执行；检查失败时也展示确认，不静默放行。失败后重试复用同一标题的用户确认，避免重复查重请求。
- 范围边界：只复用现有 `GET /topics` 查询及当前账号权限范围；无 API、权限、数据库或历史数据变化。相似结果是提醒而非重复判定，允许用户确认继续。
- 验证：`npm run test:topic-title-similarity`、`npm run test:inspiration-topic-link`、`npm run test:mobile-work-center-browser`、`npm run check`、`npm run version:check`（v3.3.47）、`npm run test:version-governance`、`npm run test:entrypoints`（139 个文件）、改动文件定向 ESLint（0 错误）、Android build-endpoint/runtime 契约、`npm run mobile:sync:production` 和 `git diff --check` 通过。Playwright 隔离 API fixture 在移动端 320px/390px 与桌面 1440px 验证相似提示先于写入、明确继续、查重不可用时要求明确选择，以及创建失败后重试不重复查重；灵感转选题也验证确认前无转化请求。截图保存在 `/tmp/xmt-topic-similarity-mobile-320.png`、`/tmp/xmt-inspiration-similarity-320.png`、`/tmp/xmt-topic-similarity-desktop.png`。Android Web 资源本地同步为 `3.3.47 / 30347`，构建仍有既有 Silk 分包超过 500 kB 提示。
- 风险说明：`npm run test:apk-endpoint-artifact` 未通过：磁盘上 8 月 14 日的旧 Debug APK 不含当前测试要求的 `assets/public/xmt-mobile-build.json`；`npm run mobile:doctor` 确认 Java、adb 与 Android SDK 不可用，因此没有重建 APK 或做真机验收。真实账号/生产服务未连接；不提交、推送或部署。
- 下一步：移动端选题一键开工及已有稿件复用已在 v3.3.48 覆盖。

## v3.3.46 灵感转选题关联持久化（2026-09-28）

- 当前版本：v3.3.46；Creator Agent 版本保持不变。
- 完成内容：新转化的灵感通过 `topic_id` 持久关联选题；创建选题、写入选题历史和更新灵感状态/关联在一个事务中提交，失败整体回滚；重试复用同一关联，避免重复创建。
- 数据库变化：新增迁移 016，为 `inspirations` 增加可空 `topic_id` 外键和索引，策略为 `SAFE_EXPAND`。既有“已转化”行不推测关联，也不改写业务数据。
- 验证：`npm run test:inspiration-topic-link`、`npm run test:migration-readiness`、`npm run test:api-contract`、`npm run test:rbac-invariant`、`npm run test:mobile-work-center-browser`（320px/390px）、`npm run check`、`npm run version:check`（v3.3.46）、`npm run test:version-governance`、`npm run test:entrypoints`（138 个文件）、改动文件定向 ESLint、Android build-endpoint/runtime 契约、`npm run mobile:sync:production` 和 `git diff --check` 通过。隔离 SQLite 覆盖迁移幂等、旧行保留未关联、转化持久关联、重试去重、历史记录冲突和失败整体回滚；浏览器覆盖移动端转化直达、返回灵感并再次打开关联选题。生产构建及 Android Web 资源同步完成，manifest 为 `3.3.46 / 30346`；构建仍提示既有 Silk 分包超过 500 kB。
- 风险说明：仅本地隔离 SQLite/浏览器夹具；生产迁移、真实账号、Android APK/真机未执行；不提交、推送或部署。
- 下一阶段：继续按 B7 实现选题详情「一键开工」预填创作，保留历史无关联记录的人工核对边界。

## v3.3.45 桌面消息已读失败恢复（2026-09-28）

- 当前版本：v3.3.45；Creator Agent 版本保持不变。
- 完成内容：桌面消息标记已读期间显示处理中并防止同一消息重复请求；失败后留在消息中心、保留未读状态和重试入口；成功标记后才打开关联内容。移动端现有失败恢复行为不变。
- 修改范围：`src/pages/Messages.tsx`、`tests/browser/mobile-work-center-responsive.spec.ts`、版本与 B8 进度文档。
- 数据库变化：无；消息 API、权限和持久化契约不变。
- 验证：`npm run test:mobile-work-center-browser`、`npm run check`、`npm run version:check`（v3.3.45）、`npm run test:version-governance`、`npm run test:entrypoints`（137 个文件）、改动文件定向 ESLint、`npm run test:android-build-endpoints`、`npm run test:android-runtime`、`npm run mobile:sync:production` 与 `git diff --check` 通过。隔离 Playwright 在 1440×844 桌面验证已读请求失败后留在消息中心、未读状态保留、重试成功后才跳转；320px/390px 移动回归通过。生产构建和 Capacitor Android Web 资源同步完成；构建仍有既有 Silk 分包超过 500 kB 的提示。
- 风险说明：本地隔离 fixture 验收，不连接生产服务或真实账号；不提交、推送或部署。
- 下一阶段：继续按改造清单核查剩余操作反馈和 B10 的受控移动端验收边界。

## v3.3.44 内容生产导航顺序优化（2026-09-28）

- 当前版本：v3.3.44；Creator Agent 版本保持不变。
- 完成内容：内容生产导航中“创作管理”和“成片制作”紧跟“选题管理”；其它入口顺序保持不变，导航路由与既有权限规则不变。
- 修改范围：`src/config/navigation.ts`、内容生产导航浏览器回归、版本与改造清单文档。
- 数据库变化：无；不涉及 API、权限、持久化或业务数据。
- 验证：`npm run test:mobile-work-center-browser` 通过；Playwright 在隔离桌面浏览器实际展开内容生产菜单，核对八项完整顺序，并点击“创作管理”确认进入 `/production` 且目标页有内容；同一回归中的移动工作流在 320px/390px 通过。`npm run check`、`npm run version:check`、`npm run test:version-governance`、`npm run test:entrypoints`（137 个文件）、Android runtime/endpoint 契约、定向 ESLint 与 `git diff --check` 通过。`npm run mobile:sync:production` 的生产构建和 Android Web 资源同步通过，版本清单为 `3.3.44 / 30344`。
- 风险说明：Browser 插件本轮不可用，使用仓库 Playwright 和本地隔离 API fixture；没有连接真实账号或生产服务。Android APK/真机未构建或验收；本阶段未提交、未推送、未部署。构建仍有既有 Silk 动画分包超过 500 kB 的提示。
- 下一阶段：继续按改造清单核对 B8 操作反馈与 B10 移动端验收剩余项。

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
