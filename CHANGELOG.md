# Changelog

## v9.4.7 - 2026-10-27

### User-facing language

- User-management API failures without a server message now use Chinese fallbacks for member lists/details, role lists, verification, writes, and logs. A server-provided message remains intact.

### Validation

- `npm run test:user-api-error-copy` covers every user-management API fallback with malformed responses and preserves server-provided errors. Type, lint, version-governance, build, and checklist browser results are recorded in `docs/UPGRADE_PROGRESS.md`.
- No API behavior, permissions, database, or business data changed. Android metadata is 9.4.7 / 90407; CI produced a debug validation APK artifact, but no Android release package was published. PR #88 merged and deployed as `e8897fc3594d94784c5845e8f79f37a69b406c18`, tagged `v9.4.7`; actual VoiceOver speech remains unverified.

## v9.4.6 - 2026-10-27

### Topic list recovery

- Mobile topic-list reads now stop after the first failure and wait for the user to choose “重试加载选题”, avoiding a hidden duplicate GET. During the initial read, the count stays unknown and the action says “正在加载…” instead of showing a false zero.
- Added desktop and 390px mobile regressions for the initial loading, failure, and explicit retry states; recovery performs one read-only request.

### Validation

- Playwright MCP in Google Chrome verified the mobile 503 error and explicit retry recovery at 390px. Type, version-governance, lint, build, and browser-suite status are recorded in `docs/UPGRADE_PROGRESS.md`.
- No API, permissions, database, or business data changed. Android metadata is 9.4.6 / 90406; this code was released together with v9.4.7 in PR #88 and was not built as a separate Android package.

## v9.4.5 - 2026-10-27

### Task feedback

- Mobile home now reports an unknown task state when attention or actionable-message reads fail; it shows an empty task state only after all required reads succeed.

### Validation

- Chrome MCP isolated 390px failure/retry checks and automated test status are recorded in `docs/UPGRADE_PROGRESS.md`.
- No API, permissions, database, or business data changed. Android metadata is 9.4.5 / 90405; PR CI produced a debug validation APK artifact, but no Android release package was published. PR #87 merged and deployed commit `7d58e9d067b4c6a71e8cf14e83b44996a4458df0`; actual VoiceOver speech remains unverified.

## v9.4.4 - 2026-10-27

### Mobile accessibility

- Mobile home attention loading now exposes a polite status announcement, matching the task and inspiration loading states.

### Validation

- Focused Chrome and VoiceOver verification, version governance, type checking, lint, and build results are recorded in `docs/UPGRADE_PROGRESS.md`.
- No API, permissions, database, or business data changed. Android metadata was 9.4.4 / 90404; this change was included in the v9.4.5 deployment through PR #87 at `7d58e9d067b4c6a71e8cf14e83b44996a4458df0` and was not built as a separate Android package.

## v9.4.3 - 2026-10-27

### Mobile accessibility fixture

- The local mobile-home fixture now keeps every duplicate initial read pending until explicitly released, so a second request cannot hide the loading statuses before accessibility checks finish.

### Validation

- Focused fixture and real VoiceOver checks, type and version governance, lint, and build results are recorded in `docs/UPGRADE_PROGRESS.md`.
- No product API, permissions, database, or business data changed. Android metadata is synchronized to 9.4.3 / 90403; no APK was built.

## v9.4.2 - 2026-10-26

### Mobile accessibility fixture

- Replaced the mobile browser fixture's invalid Socket.IO handshake stub with a real in-memory Socket.IO server. The fixture accepts its isolated test connection without emitting business events, preventing rapid polling reconnects during loading-status acceptance.

### Validation

- Targeted checks and Chrome DevTools MCP fixture results are recorded in `docs/UPGRADE_PROGRESS.md`. Actual VoiceOver speech output was not captured and remains unverified.
- No product API, permissions, database, or business data changed. Android metadata is synchronized to 9.4.2 / 90402; CI produced and uploaded an Android debug validation artifact only, and no Android release package was published.

## v9.4.1 - 2026-10-26

### Notification preference recovery

- Desktop and mobile notification preference saves now verify ambiguous network, HTTP 408/429, and server-error outcomes with a read-only request. A matching server value confirms success without a second write.
- A mismatch preserves the user's draft and locks further changes until the user loads server settings or explicitly confirms an overwrite. If verification is unavailable, the page keeps the draft and offers only another read-only check.

### Validation

- Focused unit tests, mobile browser automation, desktop/mobile Playwright MCP fixture checks, type checking, version governance, production dependency audit, and build are recorded in `docs/UPGRADE_PROGRESS.md`. The desktop settings suite reached and passed its notification recovery assertions, then failed later in the appearance ReactBits preview visibility assertion; it is not reported as a full-suite pass.
- No API, permission, database, or real business data changed. Android version metadata is synchronized to 9.4.1 / 90401; no APK was built.

## v9.4.0 - 2026-10-26

### Safe backup recovery

- Manual backup requests now accept an actor-scoped request ID and can be checked with a no-store read-only status endpoint after an ambiguous response. Replaying the same ID while its backup file remains available returns the original file; legacy clients may continue creating backups without an ID.
- The backup page and system settings share a session-scoped recovery flow that verifies before any explicit same-ID retry.

### Accessibility and reporting clarification

- Content Intelligence now labels its recent collaboration document field for assistive technology. Its impact table is checked at 320px and 390px in both themes for internal horizontal scrolling and access to the final “判断” column.
- Team Daily Reports now announces a first read with a polite loading status; it only says there are no reports after a successful empty response.
- For publication-count fallback when an official period file is missing or invalid, daily, weekly, and monthly reports all include the report date in Beijing time (1, 7, and 30 natural days). A complete official daily file still represents the platform's “yesterday” window.

### Dependency security

- Updated production dependencies `body-parser`, `happy-dom`, `ip-address`, `sanitize-html`, and Zod/OpenAPI tooling to patched compatible releases; upgraded Vite to its patched 6.x release. OpenAPI schemas now use Zod 4 metadata.

### Database compatibility

- The combined checklist release includes additive SAFE_EXPAND migrations 032–065. Each was exercised against isolated SQLite fixtures; production migration remains gated by the deployment backup and restore checks.

### Validation

- Production dependency audit (`npm audit --omit=dev --audit-level=high`) reports zero vulnerabilities. Full audit reports three moderate findings in the Tailwind 3/PostCSS development toolchain; the available fix requires a Tailwind major upgrade. Type checking, full lint (0 errors, 285 warnings), API/topic/recovery contracts, version and changelog governance, and production build passed; the build retains the existing 843.50 kB Silk chunk warning. The repository browser suite cannot start Chromium on this macOS session (`bootstrap_check_in`, Permission denied 1100) and did not reach assertions; Playwright MCP returned `Transport closed`. Chrome DevTools MCP manually checked Content Intelligence and team-report loading with isolated fixtures. Actual VoiceOver speech was not audible through the available tool, although its accessibility tree was inspected while VoiceOver was temporarily enabled and then restored off. No real business database or data was touched during local verification. Android metadata is synchronized to 9.4.0 / 90400; no APK was built.

## v9.3.70 - 2026-10-26

### Accessibility and mobile loading states

- Mobile Home task and inspiration summaries, and the initial Mobile Topics list read, now expose polite status messages while requests are pending and remove them when results arrive.

### Validation

- Type checking, focused ESLint, production build, version consistency, changelog governance (514 versions), test-entrypoint governance (285 files), and the Android runtime contract passed; the build retains the existing 843.50 kB Silk chunk advisory. Chrome DevTools MCP with in-memory delayed GET fixtures confirmed `status`/`polite` semantics, state removal after results render, and no horizontal overflow at 320px dark mode; no console errors. The repository mobile browser suite could not start Chromium (`bootstrap_check_in`, Permission denied 1100) and did not reach assertions; actual VoiceOver speech remains unverified. No API, permission, database, or real business data changed. Android metadata is synchronized to 9.3.70; no APK was built. Local changes only; no commit, push, or deployment.

## v9.3.69 - 2026-10-26

### Accessibility and mobile interactions

- Mobile Messages now exposes its initial synchronization message as a polite status for assistive technology.
- Creator Work Detail now sizes its cover image to the content width on narrow screens and provides a 40px minimum touch height for “Return to works” in normal and error states.

### Reporting window clarification

- Confirmed that fallback publication counts for daily, weekly, and monthly reports include the report day in Beijing time when the official period file is missing or invalid. A valid official daily file continues to use its “yesterday” window; the existing isolated regression already covers the fallback day boundary.

### Validation

- Type checking, focused ESLint, production build, version check, changelog/test-entrypoint governance, Android runtime contract, and the Beijing publication-window regression passed. Playwright MCP against in-memory fixtures confirmed polite loading status and 320/390/1440px Creator Work Detail layout, including the return action. The repository mobile and creator browser suites could not start Chromium (`bootstrap_check_in`, Permission denied 1100) and did not reach assertions; actual VoiceOver speech remains unverified. No database or real business data was changed. Android metadata is synchronized to 9.3.69; no APK was built. Local changes only; no commit, push, or deployment.

## v9.3.68 - 2026-10-26

### Safe write recovery

- Workflow template updates, resource category changes, anonymous feedback status/reply actions, legacy topic template mutations, and monthly/yearly report summaries now use actor-scoped request receipts through SAFE_EXPAND migrations 061–065.
- Ambiguous outcomes are checked with read-only requests before offering an explicit retry with the same request ID and payload. Monthly/yearly report conflicts preserve the local draft and prevent overwriting a newer server version.

### Accessibility and reporting

- Calendar event days now expose date, event type, and title descriptions; the editor context menu supports keyboard invocation and focus movement through its actions and color options.
- When no valid official Douyin period file is available, daily, weekly, and monthly published-work counts use Beijing natural-day windows of 1, 7, and 30 days including the report day. A complete official daily file still uses its “yesterday” window.

### Validation

- Isolated SQLite migration, API/transaction/recovery checks, report-window regressions, type checking, and focused ESLint passed. Playwright MCP fixtures covered monthly/yearly report recovery, explicit same-request retry, response loss after commit, refresh recovery, and conflict preservation. Calendar descriptions, editor keyboard flow, and annual-summary form layout were inspected in an isolated browser; 320/390/1440 CSS px in light and dark themes showed no horizontal overflow.
- Isolated Playwright/Chrome DevTools checks covered publishing detail at 320/390/1024/1366/1440/1920 CSS px, the editor toolbar at 320/390/819/1024/1152/1536 CSS px, and the Topics table at 320/390/1440 CSS px in light/dark themes. No page horizontal overflow was observed. The 1024×768 “More actions” menu fit the viewport; at 320/390px the Topics action column stayed visible after horizontal scrolling with 40×40px view/delete controls. Opening and returning from read-only topic detail generated only GET requests; console errors: 0. A 1024px case was added to the existing browser matrix. Native Chrome zoom and the automated Chromium suite were not verified in this turn; actual VoiceOver speech remains unverified. Migrations were tested only in temporary SQLite; no real business database or data was changed. Android metadata is synchronized to 9.3.68; no APK was built. Local changes only; no commit, push, or deployment.

## v9.3.67 - 2026-10-24

### Safe message recovery

- Desktop “mark all as read” now persists an actor-scoped request ID before writing and uses the existing read-only receipt endpoint after an ambiguous response. Only an explicit retry after `not_found` reuses the same ID; refresh recovery never repeats the write, account-switch responses stay isolated, and messages arriving after commit remain unread.
- Reused the existing server receipt contract and migration; no new database migration or persistent business-data write.

### Validation

- `npm run test:message-pagination`, targeted ESLint, global type check, version/changelog governance (511 versions), test-entrypoint governance (271 files), Android runtime contract, and `npm run build` passed; the build retains the existing 843.50 kB Silk chunk advisory. Playwright MCP against an isolated in-memory fixture verified commit-then-lost-response, a failed first status GET, GET-only recovery after reload, and the post-commit arrival remaining unread. The repository browser suite could not start Chromium on this macOS host (`bootstrap_check_in`, Permission denied 1100), before assertions; browser suite coverage is not counted as passed. Android metadata is synchronized to 9.3.67; no APK was built. Local changes only; no commit, push, or deployment.

## v9.3.66 - 2026-10-24

### Reporting and coverage

- Content-topic assets now summarize distinct visible topics with explicit city, person, and project registrations; hidden topics and active filters do not distort the counts, and the summary is not a completeness score.
- Creator reports keep the published-work count when an official period file is missing or invalid. They use the report's Beijing natural-day window, and deduplication no longer depends on the host timezone.

### Safe writes and calendar semantics

- Announcement deletion persists an actor/target recovery marker before sending the request. Ambiguous outcomes use read-only list verification, never an automatic DELETE retry, and unresolved results keep writes locked across refresh.
- Calendar events distinguish meeting from other with semantic tokens; six event types have static light/dark contrast coverage.

### Validation

- Content-topic asset API, calendar contrast contract, announcement client contract, report publication-window SQLite regression, canonical-work deduplication, official daily calculation (3/3), and unified report tests passed. Type check, version check/governance, changelog governance (510 versions), test-entrypoint governance (271 files), Android runtime contract, and production build passed; targeted ESLint had 0 errors and 5 existing `any` warnings in the canonical-work test. The build retains the existing 843.50 kB Silk chunk advisory.
- Repository browser suites could not start Chromium on this macOS host (`bootstrap_check_in`, Permission denied 1100), before assertions; browser coverage is not counted as passed. No database migration or persistent business-data write. Android metadata is synchronized to 9.3.66; no APK was built. Local changes only; no commit, push, or deployment.

## v9.3.65 - 2026-10-24

### Manuscript references and safe stage recovery

- Topic asset cards now include accessible resources cited by the current formal manuscript, while deduplicating directly linked items and excluding draft-only, deleted, private, or non-source links.
- Production handoff reads the current topic stage before transition and reconciles ambiguous transition failures; it continues only after the server confirms `production`, without blindly replaying the transition or creating a detached draft.
- Shooting script version saves now preserve the exact draft and verify server detail/history after an ambiguous response; confirmed commits are not duplicated, and unresolved results keep write controls locked until read-only verification.
- Topic asset dimension mutations persist a recovery marker before writing, reconcile uncertain outcomes with GET only, and retain the write lock across filtering and refresh until verification; no automatic retry is issued.
- Added a light/dark semantic-token contrast contract for all six calendar event types.

### Validation

- Content-topic asset API tests, dimension recovery component test, production-handoff tests (7/7), calendar contrast contract, type check, target ESLint, and production build passed; the build retains the existing 843.50 kB Silk chunk advisory. In-app Playwright MCP verified an isolated response-lost + failed-read + filter + refresh + manual-GET recovery flow with exactly one POST. The standalone Chromium suite remains blocked before assertions by macOS `bootstrap_check_in` Permission denied (1100); the full responsive browser matrix remains unverified.
- No database migrations or persistent business-data writes. Android metadata is synchronized to 9.3.65; no APK was built. Local changes only; no commit, push, or deployment.

## v9.3.64 - 2026-10-24

### Responsive form and record-level scope

- Retrospective action creation fields now use a minimum 12rem auto-fit grid instead of a viewport-only five-column breakpoint. This keeps title and description controls usable inside a narrow content column.
- Douyin batch-link reconciliation now requires an explicit `all` or `editable` scope. User-scoped callers filter publishing rows by topic creator, assignee, or publishing operator; global editors explicitly request full scope.
- The six previously unverified primary-action hover controls were manually checked in both themes without activating business actions.

### Validation

- Publishing Douyin-link integration test, official export contract, Beijing-time official-window test (3/3), unified Douyin report test, and target ESLint passed (0 errors; 12 existing warnings in `workflow.ts`). Chrome DevTools MCP measured title/description fields at 221px at 1440 CSS px and 209px at 1024 CSS px; native Chrome visually confirmed the repaired isolated form. The repository Playwright browser suite was attempted but stopped at Chromium launch (`bootstrap_check_in`, Permission denied 1100), before assertions.
- No database changes or business-data writes. Android metadata is synchronized to 9.3.64; no APK was built. Local changes only; no commit, push, or deployment.

## v9.3.63 - 2026-10-24

### UI feedback

- Eleven primary actions now use the shared Studio primary-button hover treatment: the five Content Lab panels plus NotFound, AccessDeniedState, AnnouncementBoard, two TopicDetail actions, and AddTopic. Existing handlers, permissions, and read-only semantics are unchanged. Chrome DevTools MCP manual hover checks covered the five Content Lab actions in both themes; the other six inherit the shared token style but were not individually browser-verified.

### Validation

- Chrome DevTools MCP verified RetrospectiveDetail at 1024/1366/1440/1920 CSS px: no document overflow, non-overlapping page actions, expected one/two-column layout, and the sticky action column remained visible at both ends of the table's horizontal scroll. No console errors/warnings or business API writes occurred. The RetrospectiveDetail Playwright matrix was expanded, but its run stopped before assertions because macOS denied Chromium `bootstrap_check_in` (Permission denied 1100). Targeted ESLint, `npm run check`, version check/governance, changelog governance (507 versions), test-entrypoint governance (270 files), Android runtime contract, `npm run build`, and `git diff --check` passed; the build retains existing large-chunk advisories. Content Lab hover checks covered five actions in both themes without activating them.
- No database changes or business-data writes. Android metadata is synchronized to 9.3.63; no APK was built. Local changes only; no commit, push, or deployment.

## v9.3.62 - 2026-10-24

### Accessibility and UI acceptance

- Calendar month navigation now exposes the visible month in a polite, atomic status region, including year-boundary updates.
- Continued native Chrome zoom acceptance: Topics was checked from 80% to 125%, and the ProductionDetail editor color palette/version controls were checked at 125%.

### Validation

- Targeted ESLint, `npm run check`, calendar permission and isolated migration tests, `npm run version:check`, version governance, changelog governance (506 versions), test-entrypoint governance (270 files), Android runtime contract, and `npm run build` passed; the calendar database tests used temporary SQLite files, and the build retains existing large-chunk advisories. Chrome DevTools MCP against the isolated in-memory calendar fixture exposed `status`, `aria-live="polite"`, and atomic month updates across October–December 2026 and January 2027. The repository calendar Playwright suite did not enter assertions because macOS denied Chromium `bootstrap_check_in` (Permission denied 1100); no VoiceOver audio acceptance was performed.
- No database changes or business-data writes. Android metadata is synchronized to 9.3.62; no APK was built. Local changes only; no commit, push, or deployment.

## v9.3.61 - 2026-10-24

### Product and mobile reliability

- Submitted daily reports stay read-only until review completes. After a read-only status check, an explicitly reconfirmed shooting completion clears the stale prior verification notice.
- Updated isolated browser fixtures to match current actor-scoped message recovery, paginated arrivals, user-delete status checks, and linked-resource response contracts.

### Validation

- The complete mobile browser flow passed at 320px and 390px, including desktop message recovery scenarios. The dedicated daily-report submit-recovery browser suite also passed, covering uncertain-write recovery, pending refresh lock, late identity responses, and archive details; daily-report status tests, targeted ESLint, global type check, version/changelog governance, 270 test-entry checks, Android runtime contract, and production build passed. The build retains the existing large-chunk advisory.
- No database changes or business-data writes. Android metadata is synchronized to 9.3.61; no APK was built. Local changes only; no commit, push, or deployment.

## v9.3.60 - 2026-10-24

### Operational safety

- Added a read-only receipt inventory command that requires an explicit local database path and reports only table names, row counts, and raw timestamp ranges. Request keys, actors, payload fingerprints, and business content are never returned.
- No automatic deletion policy was introduced: recovery markers have no proven maximum retry window, and stored receipt timestamps may mix UTC defaults with Beijing-time writes.

### Database and validation

- No schema change and no real database access. Isolated SQLite fixtures verify scope, redaction, fail-closed schema handling, explicit path requirements, and unchanged database bytes. Type check, entrypoint governance, diff checks, and production build passed; the build retains the existing large-chunk advisory.
- Android metadata is synchronized to 9.3.60; no APK was built. Local changes only; no commit, push, or deployment.

## v9.3.59 - 2026-10-24

### Data integrity and recovery

- Retrospective title and summary updates now support actor/retrospective-scoped idempotency receipts with version compare-and-swap; audit records and receipts commit atomically. Keyed requests require a stable version, and request fingerprints preserve which fields the caller actually supplied.
- When a save result is uncertain, the page checks the original request without replaying it. Only an explicit `not_found` result enables a same-key retry. Conflicts preserve both the submitted draft and current server content; a reviewed edit uses a new key. A failed local recovery-marker write can be retried before editing resumes.
- Daily-risk conversion now keeps its form visible but locked during an uncertain create, retains the selected risk and fields on failure, and clears them after a confirmed retry. Its controls expose stable accessible names.

### Database and validation

- Added SAFE_EXPAND migration 057, verified only against isolated temporary databases. Receipts currently have no automatic retention cleanup.
- API, migration, readiness, type-check, targeted ESLint, and the full retrospective browser regression passed. Production build passed with the repository's existing large-chunk advisory. No real database or business data was touched.
- Android version metadata is synchronized to 9.3.59; no APK was built. Local changes only; no commit, push, or deployment.

## v9.3.58 - 2026-10-24

### Data integrity and recovery

- Retrospective action updates now use a request UUID and actor/action-scoped receipts. Full-row compare-and-swap prevents a stale edit from overwriting newer values; processed and conflict outcomes are persisted with the audit event.
- When a response is uncertain, the UI verifies the original request without replaying it. Only an explicit `not_found` result enables a same-request retry. A confirmed conflict preserves the user's draft and the latest server value for review; a later deliberate save uses a new request UUID.
- Existing clients without an idempotency key remain supported. A stale concurrent update now receives HTTP 409 instead of silently overwriting a newer edit.

### Database and validation

- Added SAFE_EXPAND migrations 055 and 056. They were validated against isolated temporary databases only; no real database was migrated. Request receipts have no automatic retention cleanup yet.
- API, migration and readiness checks passed. The recovery-focused browser path passed in an isolated Playwright MCP fixture. One prior full-suite run reached all action-update recovery scenarios but failed the later unsaved-retrospective-summary leave-warning assertion; the latest rerun was blocked before assertions by macOS `bootstrap_check_in … Permission denied (1100)`. See `docs/UPGRADE_PROGRESS.md`.
- Android version metadata is synchronized to 9.3.58; no APK was built. Local changes only; no commit, push, or deployment.

## v9.3.57 - 2026-10-24

### Accessibility

- The mobile account-security password fields now have persistent, explicitly associated labels. Existing validation and retry behavior is unchanged.
- The mobile regression locates password fields by accessible name instead of placeholder text.

### Validation and scope

- No API, permission, database, or business-data change. Test results are recorded in `docs/UPGRADE_PROGRESS.md`.
- Android version metadata is synchronized to 9.3.57; no APK was built. Local changes only; no commit, push, or deployment.

## v9.3.56 - 2026-10-24

### 流程与数据可靠性

- 成片制作入口携带来源选题并预填现有表单；主题资产卡片展示当前账号可访问的关联资料直达链接。
- Creator Analytics 的 7/30/90 天统计改用北京时间自然日闭区间并排除未来数据；无足够粉丝观测时增长率保持未知。
- 日报草稿写入结果不明时锁定并只读核实，只有确认仍是写前状态才允许同载荷显式重试；只读创作详情说明真实权限原因并隐藏写入入口。

### 测试与边界

- 隔离 API、统计、权限与流程回归、类型检查通过。浏览器交互断言受本机 Chromium 启动权限及共享 MCP profile 占用影响，未进入测试体，不计通过。
- 无新数据库迁移；未访问真实业务数据。Android 仅同步 90356 元数据，未构建 APK；本地不提交、推送或部署。

## v9.3.55 - 2026-10-24

### 安全与可靠性

- 灵感点赞和取消点赞支持请求 UUID 与明确目标状态，写入结果和操作者隔离回执在同一事务提交；同键重放不再反转状态，旧客户端无请求编号时继续沿用 toggle 合同。
- 新增 `no-store` 只读结果查询。结果不明或刷新后恢复原请求；查明未提交时才可沿用原编号安全重试，账号切换不会把迟到结果写入当前账号。

### 数据库变化

- 新增 SAFE_EXPAND 迁移 054 `inspiration_vote_idempotency`。仅在隔离临时数据库测试，未迁移真实数据库；回执墓碑暂不自动清理，避免迟到重试再次执行。

### 测试与边界

- 投票 HTTP/事务测试覆盖幂等重放、后续状态变化、并发同键、跨操作者隔离、事务回滚和删除墓碑；迁移与 readiness 测试、类型检查通过。
- 仓库浏览器套件在 Chromium 启动阶段因 macOS `bootstrap_check_in … Permission denied (1100)` 退出，未进入断言体，不计自动化通过。真实数据库和业务账号未写入；Android 仅同步 90355 元数据，未构建 APK。本地不提交、推送或部署。

## v9.3.54 - 2026-10-24

### 安全与可靠性

- Creator Agent `/bind` 对新客户端增加 UUID + 高熵恢复能力；服务端提交后响应丢失可按同一请求找回原 token，仅请求编号不能恢复凭据，绑定/确认响应均 `no-store`。
- 设备重绑先暂存新凭据并保留原 token，客户端通过 Electron safeStorage 持久化新 token 与配置后再确认切换；确认接口幂等，确认/过期后立即清除回执密文。

### 数据库变化

- 新增 SAFE_EXPAND 迁移 053 `creator_agent_bind_result_recovery`。仅在隔离临时数据库验证，未执行真实数据库迁移。

### 测试与边界

- 服务/API、绑定结果迁移、migration readiness、客户端请求和 Electron safeStorage 隔离测试及 Agent/根项目类型检查通过。响应丢失/并发、恢复能力隔离、旧凭据保留至确认、确认后不可复活和事务回滚均有回归覆盖。
- Agent 版本提升至 v2.14.7-agent，尚未打包或发布；Android 仅同步 Gradle 元数据至 9.3.54/90354，未构建 APK。生产数据库和密钥配置未触及，本地不提交、推送或部署。

## v9.3.53 - 2026-10-24

### 安全与可靠性

- Creator Agent 绑定码创建支持按操作者、账号、有效期和规范化请求 UUID 幂等恢复；新增 `no-store` 状态查询。响应丢失或刷新后沿用原请求恢复同一码，不重复签发；账号切换不丢弃其他账号的待核实编号，也不展示旧账号迟到回包。
- 绑定码台账只保留 SHA-256 摘要与 AES-256-GCM 加密的短期恢复密文；过期/消费后清除密文，密钥缺失或不匹配时 fail closed。绑定码消费、Agent 注册和设备元数据写入改为同一事务。

### 数据库变化

- 新增 SAFE_EXPAND 迁移 052 `creator_agent_binding_code_recovery`；只在隔离临时数据库验证，未对真实数据库执行迁移。

### 测试情况

- 绑定服务、隔离 HTTP/API、迁移和 migration readiness 测试通过，覆盖同键并发/大小写归一、账号与操作者隔离、无效请求键、权限、no-store、事务回滚、密文清除、旧客户端兼容和密钥错误关闭；类型检查与定向 ESLint 通过。
- Playwright MCP 本地隔离夹具模拟服务端提交后客户端丢失响应，再刷新经 GET 恢复同一码；创建 POST 仅一次，会话存储只保留账号/操作者/请求键而无绑定码。仓库浏览器 suite 在 Chromium `bootstrap_check_in … Permission denied (1100)` 启动阶段退出，未进入断言体，不计自动化通过。
- 按用户确认复核官方日期窗口为北京时间自然日且包含当天、抖音批量关联遵循逐条编辑范围；对应隔离专项测试通过。Android 仅同步 Gradle 版本元数据至 9.3.53/90353，未构建 APK。本地不提交、推送或部署。

## v9.3.52 - 2026-10-23

### 移动端体验

- 移动端创作列表改用已有服务端分页，每页最多读取 20 条稿件并显示总数与页码；创作列表不再一次拉取全部记录。
- 账号切换回到第一页并隔离旧账号的迟到响应；翻页失败时保留上次成功页，明确标出页号并允许安全重试。

### 测试与边界

- 新增移动浏览器回归：41 条合成稿件分页、第二页失败后重试、末页边界、跨账号迟到响应与只读列表行为。类型检查和定向 ESLint 通过；仓库 Chromium suite 受 macOS 启动权限阻断，未进入测试体。Chrome DevTools MCP 隔离夹具在 320px 下实测分页与账号切换，详见 `docs/UPGRADE_PROGRESS.md`。无 API 权限或数据库变化；Android 仅同步 Gradle 版本元数据至 9.3.52/90352，未构建 APK。本地不提交、推送或部署。

## v9.3.51 - 2026-10-23

### 安全与可靠性

- 稿件批注、修改建议的接受/拒绝/结束讨论加入按操作者和目标状态幂等保护；服务端状态变更与请求回执同事务提交，旧客户端继续兼容。
- 处理结果不确定时先只读核实；仅确认未提交后才允许沿用原请求编号重试。接受建议的恢复只重试状态，不会重复替换或保存正文；正文未确认时要求先人工核对。

### 数据库变化

- 新增 SAFE_EXPAND 迁移 051 `production_review_status_idempotency`；只在隔离临时数据库测试，未执行真实数据库迁移。

### 测试与边界

- HTTP 并发、操作者隔离、权限、状态目标冲突、事务回滚和旧请求兼容通过；完整 Chromium 套件受 macOS 启动权限阻断，未进入测试体。Chrome DevTools MCP 隔离夹具实测回包丢失后的讨论状态恢复和建议接受恢复均无重复写入；详见 `docs/UPGRADE_PROGRESS.md`。Android 仅同步版本元数据至 9.3.51/90351，未构建 APK；本地不提交、推送或部署。

## v9.3.50 - 2026-10-23

### 可访问性与回归覆盖

- 活动日志新增对所有已知动作类别及未知动作的浅色/深色主题对比度矩阵，采样实际渲染前景色和复合叠层背景；现有颜色令牌均过 4.5:1，无需色值改动。

### 测试与边界

- DevTools MCP 独立 mock 页面实测浅色最低 6.63:1、深色最低 11.47:1。仓库 Chromium suite 受 macOS 启动权限阻断，未进入测试体，不计自动化通过；详见 `docs/UPGRADE_PROGRESS.md`。Android 仅同步 Gradle 元数据至 9.3.50/90350，未构建 APK；本地不提交、推送或部署。

## v9.3.49 - 2026-10-23

### 安全与可靠性

- 稿件批注/修改建议创建新增可选 UUID 和按操作者、稿件及载荷指纹隔离的同事务结果账本；同请求重放返回原线程，跨账号/稿件/载荷冲突拒绝，旧客户端继续兼容。
- 新增 `no-store` 状态查询和会话内原载荷恢复；仅确认 `not_found` 后才允许同编号、同内容显式重试，避免响应丢失造成重复线程。

### 数据库变化

- 新增 SAFE_EXPAND 迁移 050 `production_review_thread_idempotency`；仅在隔离临时测试数据库执行验证，未执行真实数据库迁移。

### 测试与边界

- 详细回归和浏览器自动化状态见 `docs/UPGRADE_PROGRESS.md`。Android 仅同步 Gradle 元数据至 9.3.49/90349，未构建 APK；本地不提交、推送或部署。

## v9.3.48 - 2026-10-23

### 优化

- React Bits 首次使用和恢复默认采用轻量、无动效配置，默认不加载 OGL/粒子装饰背景；显式选择 Aurora、Silk 等预设后仍保留预设效果。
- 已保存的用户外观偏好继续读取，不做覆盖或迁移。

### 数据库变化

- 无。

### 测试情况

- 默认配置、重置、预设启用和既有保存偏好的回归结果见 `docs/UPGRADE_PROGRESS.md`。

### 边界

- Android 仅同步 Gradle 元数据至 9.3.48/90348，未构建 APK；本地不提交、推送或部署。

## v9.3.47 - 2026-10-23

### 安全与可靠性

- 稿件批注回复加入请求编号幂等保护：回复与按操作者、稿件、线程及 SHA-256 载荷指纹索引的结果账本同事务提交；同编号重放返回原回复，跨账号、线程或载荷冲突拒绝。旧客户端仍兼容不带编号。
- 增加只读、`no-store` 回复结果查询。浏览器在会话存储中保留原回复和请求编号；结果未知时锁定原文，只有核实为 `not_found` 才允许同编号、同内容显式重试。已提交但响应丢失不会产生重复回复。

### 数据库变化

- 新增 SAFE_EXPAND 迁移 049 `production_review_reply_idempotency`。本轮仅在临时隔离 API 测试数据库中运行迁移，未对真实数据库执行迁移。

### 测试情况

- 稿件审阅 HTTP 回归覆盖并发同编号、跨账号/线程/内容冲突、状态读取隔离与缓存控制，以及账本写入失败时回复事务回滚；迁移就绪、TypeScript、版本/更新说明治理、Studio token、Android runtime、测试入口检查和生产构建通过。定向 ESLint 0 errors，12 条工作流路由警告与 HEAD 基线一致；`git diff --check` 通过。
- Chromium 浏览器 suite 在 macOS `bootstrap_check_in … Permission denied (1100)` 阶段失败；WebKit 进程启动时 abort。两套均未进入测试断言，不计浏览器通过。
- 工作流详情响应等待器已调整为在释放隔离请求闸门前注册并要求 HTTP 200，但本轮未能运行该浏览器 suite，仍待可用浏览器环境验证。

### 边界

- Android 仅同步 Gradle 元数据至 9.3.47/90347，未构建 APK；本地修改，不提交、推送或部署。B4/B5 全站验收、B8 其余写操作及改造清单其他开放项继续推进。

## v9.3.46 - 2026-10-23

### 新增

- 新增 Workflow Engine 操作手册，说明当前 strict enforcement、只读诊断入口和安全回退边界；明确本地代码状态不代表生产运行状态。

### 优化

- 工作流设计器的常用节点操作统一使用共享触控控件，并补充窄屏布局、触控尺寸及键盘操作回归。

### 修复

- 改密请求若服务器可能已提交但页面未收到确认，不再误报普通失败或依赖全局 401 自动刷新/重放；锁定表单并清空密码，只有明确的旧密码错误等确定拒绝允许纠正后重试。

### 技术升级

- 无

### 数据库变化

- 无；本版本未执行迁移或修改业务数据。

### 测试情况

- `npm run test:system-settings-browser`、`npm run check -- --pretty false`、`npm run version:check`、版本治理、更新说明治理（490 个版本）、Studio token 使用（38 类）和 Android runtime 合同通过；生产构建通过。
- 当前涉及页面与浏览器测试文件的定向 ESLint 无错误，有 3 条未由本轮改动引入的 React effect 依赖警告；目标差异空白检查通过。构建仍提示既有大分包（Tiptap 555.12 kB、主入口 712.76 kB、Silk 背景适配器 843.50 kB）。
- `npm run test:workflow-details-responsive-browser` 已运行；实际右键与剪贴板菜单视口断言通过，整套在成片状态更新的 `waitForResponse` 超时失败。隔离 Chrome DevTools 页面手工复现同一 PUT 返回 200，但尚未定位自动化监听差异，因此不计整套通过。
- `npm run test:workflow-designer-language-browser` 在 macOS Chromium `bootstrap_check_in … Permission denied (1100)` 启动阶段退出，未进入测试断言。

### 边界

- Android 仅同步 Gradle 元数据至 9.3.46/90346，未构建 APK；不访问真实账号、生产环境或业务数据库。仅本地修改，不提交、推送或部署；B4/B5 全站验收与改造清单其它开放项继续推进。

## v9.3.45 - 2026-10-23

### 修复

- 审批流模板编辑/删除和节点删除按钮统一达到 40×40px；窄屏下操作区换行，按钮保持在卡片边界内。
- 灵感卡片采用文章语义，详情入口成为可键盘访问的独立按钮，避免在按钮角色中嵌套点赞、评论等交互。
- 拍摄、发布详情的剧本历史读取错误提示及侧栏登出悬停文字改用主题安全色；剧本提示隔离页面实测最小对比度 6.26:1。

### 安全与可靠性

- 复盘行动项创建新增操作者隔离的 SAFE_EXPAND 迁移 047。行动项、审计记录和请求结果同事务提交；相同编号重放不会重复创建或通知。
- 响应不明或刷新后只读核实；仅明确确认未创建时，才允许沿用原编号和原载荷显式重试。状态查询保留权限范围并禁用缓存。
- 公告创建新增 SAFE_EXPAND 迁移 048；公告与操作者隔离的请求结果同事务提交，响应丢失或刷新后先只读核实，只有确认未创建才可用相同编号和内容显式重试。

### 测试情况

- 行动项与公告幂等 API、迁移 047/048、迁移 readiness、复盘审计原子性、公告板丢响应/刷新恢复浏览器测试、API 契约、类型检查、生产构建、定向 ESLint、版本治理及差异格式检查通过。
- Playwright MCP 隔离页面验证审批流操作在 320/390/1440px 下的点击区与卡片边界，以及详情错误提示亮/暗主题实测对比度；公告恢复浏览器用例通过。灵感 320px 浅色的文章语义、键盘详情入口和触控目标断言通过；角色创建/更新结果核实在弹窗内可达并完成显式恢复。
- 仓库设计器/权限管理 Chromium 套件已完整通过；预期 API 错误按精确 method、pathname、status 和次数识别。灵感测试已通过 320px 浅色核心语义/键盘/触控断言，但在后续删除恢复夹具等待处失败；详情响应式套件仍在剪贴板上下文菜单视口断言处失败。未将手动隔离页或局部断言通过表述为这两套完整自动化通过。

### 边界

- Android 仅同步 Gradle 版本元数据至 9.3.45/90345，未构建 APK；没有运行真实数据库迁移或触碰真实业务数据。本地修改，不提交、推送或部署；B4/B5/B8 全量审计和清单其它事项仍开放。

## v9.3.44 - 2026-10-23

### 修复

- 首页待办统计排除已退回选题，避免终态事项被误报为逾期或即将到期。
- 匿名意见删除结果不明后，如目标已被其他管理员或旧版页面先行删除，会明确提示“本次删除未确认成功”，清除过期恢复标记并解除写锁；不会重复发送删除，也不会冒充本次删除成功。

### 优化

- 复盘日报风险转行动项表单的风险选择、标题、负责人和截止日期补齐可访问名称；手机端表单保持清晰、可操作的布局。

### 技术升级

- 新增 SAFE_EXPAND 迁移 046，为匿名意见删除增加操作者隔离的请求结果账本。删除与账本同事务提交；状态 GET 与客户端 fetch 均禁用缓存，相同请求重放返回原结果，旧版不带请求编号的调用继续兼容。
- 补充并发/旧客户端先删除、请求冲突、事务回滚、删除结果核实及终态恢复回归。

### 测试情况

- 首页统计、匿名意见删除 API/迁移、迁移 readiness、类型检查、定向 ESLint、版本检查/治理、更新说明治理（488 个版本）、测试入口（262 个文件）、Android runtime、Studio token 使用与 `git diff --check` 通过；生产构建成功。
- Playwright MCP 使用独立 mock 页面手验匿名意见目标已不存在时的提示、恢复标记清除、零重复 DELETE 与后续写入恢复；并验收复盘风险表单手机视口可访问名称和布局。没有触碰真实账号或业务数据。
- 仓库 Chromium 自动化受 macOS 启动权限限制，本轮未运行，不计自动化通过。生产构建保留大分包提示（Tiptap 555.12 kB、主入口 710.39 kB、Silk 背景适配器 843.50 kB）。

### 边界

- Android 仅同步 Gradle 版本元数据至 9.3.44/90344，未构建 APK；没有对真实业务库执行迁移或写入。本地修改，不提交、推送或部署。

## v9.3.43 - 2026-10-23

### 新增

- 审批流模板创建加入操作者隔离的请求账本；响应不确定或刷新后会先只读核实，并比对原载荷指纹，只有确认未创建时才允许沿用相同请求编号和原内容重试。

### 修复

- 模板创建结果在响应丢失时不会盲目再次创建；已删除模板以墓碑状态结束恢复，不会被重建。
- 创建恢复标记按账号隔离，跨账号迟到响应不会替当前账号清理或改写恢复状态。

### 技术升级

- 新增 SAFE_EXPAND 迁移 045，原子记录模板创建请求编号、操作者、载荷指纹和模板 ID；只读状态核实需匹配载荷指纹，防止同账号同编号的异内容请求被误认作成功。保留旧客户端不带请求编号的兼容路径。
- 补充同编号并发创建、请求状态核实和 OpenAPI 参数契约覆盖；新增 819×480 CSS 视口浏览器回归代码。

### 数据库变化

- 新增审批流模板创建结果账本；不回填、不修改既有模板。

### 测试情况

- 类型检查、模板创建幂等 API/迁移、API 契约、迁移 readiness 和审批流阶段 CRUD 专项通过。
- `npm run check -- --pretty false`、模板创建幂等/API 契约测试（含本人错误指纹 409、缺失/非法指纹 400）、迁移 045、迁移 readiness、审批流阶段 CRUD、目标 ESLint（0 错误、1 条既有 effect 依赖警告）、版本检查/治理、更新说明治理、Android runtime、测试入口（259 个文件）、生产构建及 `git diff --check` 通过。
- 仓库 Chromium 浏览器回归代码已补齐，但本机启动权限限制导致本轮未运行、不计通过；不计为浏览器验收通过。

### 边界

- Android 仅同步 Gradle 版本元数据至 9.3.43/90343，未构建 APK；仅本地修改，不提交、推送或部署。

## v9.3.42 - 2026-10-23

### 新增

- 移动消息中心的“全部标记已读”现在支持结果不确定后的只读核实与同请求安全恢复。

### 修复

- 单条消息已读请求在账号切换后返回时，不再覆盖新账号的消息、未读数、提示或导航状态。
- 活动日志成员筛选器补齐可访问名称；CreatorReports 删除操作触控区域达到至少 40×40px。

### 技术升级

- 新增 SAFE_EXPAND 迁移 044，原子保存全量已读请求编号、操作者和首次更新数量；状态查询禁止缓存并按操作者隔离。
- 同编号重放返回原结果，不会改写之后到达的消息；旧版不带请求编号的接口继续兼容。

### 数据库变化

- 新增全量已读请求结果账本，不回填或修改既有消息。

### 测试情况

- 消息分页/批量已读、迁移 044、迁移 readiness、活动日志与时间契约、测试入口、类型检查、目标 ESLint、版本检查、版本/更新说明治理及生产构建通过。
- 移动账号切换与活动日志深色主题响应式浏览器回归已补充；仓库 Chromium 在测试体前受 macOS `bootstrap_check_in … Permission denied (1100)` 阻断，不计自动化通过。
- 生产构建保留大分包提示（Tiptap 555.12 kB、主入口 709.11 kB、Silk 背景适配器 843.50 kB）。

### 边界

- Android 仅同步 Gradle 版本元数据至 9.3.42/90342，未构建 APK；仅本地修改，不提交、推送或部署。

## v9.3.41 - 2026-10-23

### 新增

- 复盘创建增加操作者隔离的请求编号与结果核实；刷新或响应丢失后可以安全恢复，不会重复创建。

### 优化

- 日历月视图在常见桌面宽度下保持七列完整可见。
- 全站文字选区改用明暗主题专属的不透明颜色，正文、表格与编辑器选中文字都保持清晰。

### 修复

- 复盘创建结果未确认时先只读核实服务端状态；仅确认未创建后才允许复用原请求安全重试。
- 深色选区不再以白字叠加低对比蓝底，选中正文和表格文字对比度达到 5.64:1；亮色达到 5.17:1。

### 技术升级

- 新增 SAFE_EXPAND 迁移 043，原子记录复盘创建幂等键、操作者和载荷指纹；扩展全局选区主题契约与隔离浏览器回归。

### 数据库变化

- 新增复盘创建请求账本，不回填或更改既有复盘记录。

### 测试情况

- 复盘幂等/API/迁移专项、类型检查、生产构建、选区契约、测试入口与版本检查通过。
- Playwright MCP 与 Chrome DevTools MCP 隔离页面实测正文、表格、编辑器在两种主题的选区对比度达标；复盘创建也验证响应丢失后只发起一次写入并恢复详情。
- 仓库 Chromium 自动化在测试断言前因 macOS `bootstrap_check_in … Permission denied (1100)` 退出，不计自动化通过；构建保留既有大分包提示。

### 边界

- Android 仅同步 Gradle 版本元数据至 9.3.41/90341，未构建 APK；仅本地修改，不提交、推送或部署。

## v9.3.40 - 2026-10-23

### 新增

- 抖音作品关联的新增、更换和解除现在留下可追溯记录，操作历史与关联变更在同一事务内保存；重复设置同一关系不会制造重复记录。

### 优化

- 日报月报、年报详情以及选题审核、灵感详情弹层统一管理键盘焦点、背景隔离与关闭后的焦点恢复；日报详情支持 Escape 关闭。
- 抖音作品关联历史在移动端使用明确的“抖音作品关联调整”名称；活动日志将其归类为更新，不再混称状态变化。

### 修复

- 移动创作列表和选题草稿存储失败提示改用符合明暗主题的高对比度令牌，避免错误状态在浅色主题中难以辨认。

### 技术升级

- 抽取通用模态生命周期钩子，覆盖初始聚焦、Tab 圈定、嵌套弹层、Escape 守卫及原始背景状态恢复；扩充归档详情真实弹层回归。

### 数据库变化

- 无新增迁移或数据回填；继续复用现有选题历史与活动日志表，写入失败时关联变更回滚。

### 测试情况

- 共享弹窗专项 2/2、抖音关联 API/事务专项、类型检查、目标 ESLint、生产构建、版本/更新说明/入口治理、Android runtime、Studio token 与差异检查通过。
- Chrome DevTools MCP 隔离夹具实测：移动端 390px 浅色/深色错误提示对比度分别为 6.88:1 / 14.43:1；日报月报 1440px 与 320×480、年报 390×480 的焦点、边界、滚动和只读请求通过。
- 仓库 Chromium 自动化在测试断言前因 macOS `bootstrap_check_in … Permission denied (1100)` 退出，不计为通过。

### 边界

- Android 仅同步 90340 版本元数据，未构建 APK；仅本地修改，不提交、推送或部署。

## v9.3.39 - 2026-10-23

### 修复

- 消息清空遇到响应丢失、刷新或网络不确定时，先按当前操作者只读核实；同一请求编号重放返回原结果，不会再次删除后来到达的新消息。
- 保留不带请求编号的旧客户端兼容路径；消息清空记录与删除在同一事务内提交。

### 技术升级

- 新增迁移 042 `message_clear_idempotency`（SAFE_EXPAND），记录操作者、请求编号和首次删除数量。

### 测试情况

- 隔离 SQLite/API 回归覆盖提交后响应丢失、之后新消息保留、请求状态只读及操作者隔离、账本写入失败回滚和旧客户端兼容。
- 类型检查、目标 ESLint、生产构建、迁移 readiness、版本/更新说明/测试入口治理、Android runtime 与 Studio token 门禁通过。
- 消息页面自动化已尝试，但本机 Chromium 在测试体启动前因 macOS `bootstrap_check_in … Permission denied (1100)` 退出，不计为通过。

### 边界

- Android 仅同步 90339 元数据，未构建 APK；仅本地修改，不提交、推送或部署。

## v9.3.38 - 2026-10-22

### 改进

- 编辑器桌面工具栏文字颜色、高亮颜色弹层标题移除透明度压低，统一使用 Studio 次级文字令牌。
- 补充亮色/暗色主题下两个标题的实际渲染对比度回归，确保均不低于 4.5:1。

### 测试情况

- 类型检查、目标 ESLint、生产构建通过；Chrome DevTools MCP 隔离夹具测得亮色 7.58:1、暗色 7.52:1。
- `npm run test:production-review-browser` 因 macOS Chromium `bootstrap_check_in … Permission denied (1100)` 在测试体前退出，不计自动化通过。

### 边界

- 无 API、权限、数据库或业务数据变化；Android 仅同步 90338 元数据，未构建 APK。本地不提交、推送或部署。

## v9.3.37 - 2026-10-22

### 修复

- 人员创建请求结果不明时，即使创建权限被撤销，也可按操作者与请求编号只读核实；没有创建权限时保留恢复记录、锁定重试，不把 401/403 当作原请求未提交的证据。
- 修复人员创建权限加载与恢复状态查询竞态，避免恢复状态停留在“核实中”。

### 测试情况

- 人员写入原子性/API 测试、类型检查、目标 ESLint 通过；Chrome DevTools MCP 隔离夹具实测撤权后的已提交/未提交刷新恢复及恢复权限后同请求号安全重试。
- Playwright 自动化因 macOS Chromium `bootstrap_check_in … Permission denied (1100)` 在测试体前退出，不计通过。

### 边界

- 无数据库结构或真实业务数据变化；Android 仅同步 90337 元数据，未构建 APK。本地不提交、推送或部署。

## v9.3.36 - 2026-10-22

### 修复

- ProductionDetail 编辑器下拉菜单现限制在工具栏列内，避免原生 Chrome 高缩放时文字/高亮色板被左侧导航侧栏遮挡。

### 测试情况

- Chrome 原生 125% 缩放下，1366 与 1024 窗口宽度的菜单均位于侧栏右侧，全部色块中心均可命中且页面无横向溢出；类型检查、定向 ESLint、版本/更新说明/入口/Studio/Android runtime 治理、创作审阅 API 测试及生产构建通过。
- Playwright 自动化因 macOS Chromium `bootstrap_check_in … Permission denied (1100)` 在测试体前退出，不计通过；隔离 Chrome DevTools MCP 手工验收结果单独记录。

### 边界

- 仅本地修改，不提交、推送或部署；Android 仅同步 90336 元数据，未构建 APK。

## v9.3.35 - 2026-10-22

### 修复

- 人员启停结果不确定时，刷新后只读核实；未找到时仅允许在权限仍有效的情况下复用同一请求编号显式重试，不根据用户当前状态猜测原请求结果。
- 并发删除已被其他操作移除的账号时，先核实目标状态；确认目标已不存在后说明本次请求未执行删除，不虚报成功。
- 严格校验启用状态为布尔值，阻止使用 `0`、`null` 等非标准值绕过当前账号自禁用保护。
- 共享弹窗补齐初始焦点、焦点圈定与恢复、嵌套弹窗交互隔离及背景可访问性状态恢复。

### 测试情况

- 人员会话撤销/自禁用、写入审计原子性、用户删除幂等迁移、BaseModal 可访问性测试及类型/定向 lint 已通过；隔离浏览器手工验证了同编号安全重试和并发删除未执行语义。
- 仓库 Chromium 自动化因 macOS `bootstrap_check_in … Permission denied (1100)` 未进入测试体，不计自动化通过；其余集成门禁见升级阶段记录。

### 边界

- 仅本地修改，不提交、推送或部署；Android 仅同步 90335 元数据，未构建 APK。

## v9.3.34 - 2026-10-22

### 修复

- 人员删除结果不确定时，可按操作者、请求编号和目标账号只读核实；未找到时复用原请求键安全重试，避免重复删除和重复记录。

### 技术升级

- 新增 SAFE_EXPAND 迁移 041 保存删除请求结果，并将账号、角色、操作日志与删除请求键放在同一事务中；旧客户端仍可不带请求键删除。

### 边界

- 仅本地修改，不提交、推送或部署；Android 仅同步 90334 元数据，未构建 APK。

## v9.3.33 - 2026-10-22

### 新增

- 人员资料更新在刷新后可继续只读核实；恢复记录不保存密码，只保存是否曾提交密码的标记。

### 优化

- 已提交的更新经服务器确认后自动清理恢复标记并刷新列表；未找到时锁定原载荷，仅允许重新输入密码并用同一请求编号安全重试。
- 状态读取不可用时保留锁定状态，提供只读重新核实；同一页面新提交不会提前触发刷新恢复查询。

### 修复

- 状态查询按操作者、请求编号和目标用户隔离，且不要求用户编辑权限，避免重新登录后无法核实结果；阻止当前账号禁用自身以保留安全恢复能力。

### 技术升级

- 复用迁移 039 的用户更新请求记录，无新增数据库结构；补充刷新恢复与状态查询竞态回归。

### 测试情况

- API 原子性、操作者/目标隔离、类型检查、定向 ESLint及生产构建通过；Playwright MCP 隔离交互确认同页不提前查询、刷新后状态读取失败时保持锁定、只读重查确认并清理标记。仓库 Chromium 自动化启动受 macOS 权限限制，不计自动化通过。完整门禁见 `docs/UPGRADE_PROGRESS.md`。

### 边界

- 仅本地修改；不提交、推送或部署。Android 仅同步 90333 元数据，未构建 APK。B8 其他操作边界、B4/B5 全站审计与 Android 原生专项仍开放。

## v9.3.32 - 2026-10-22

### 新增

- 人员创建在刷新后可继续核实：安全恢复记录仅保留请求编号和非敏感表单字段，不保存密码。

### 优化

- 若服务端确认账号已创建，页面关闭待处理窗口并刷新人员列表；若未找到记录，则锁定原表单，只允许重新输入密码后以同一请求编号安全重试。

### 修复

- 明确区分正在核实、未找到记录和暂时无法核实，避免把“尚未核实”误显示为最终结果；请求状态查询限定当前操作者。

### 技术升级

- 新增人员创建状态只读查询和刷新恢复回归，覆盖已提交响应丢失、提交前失败、同请求编号重试及密码不持久化。

### 数据库变化

- 无新增数据库结构；复用迁移 040 创建的请求记录。

### 测试情况

- API 原子性/操作者隔离、创建/更新幂等迁移、迁移 readiness、抖音逐条编辑范围、类型检查与定向 ESLint 通过。Playwright MCP 隔离实测覆盖刷新后 GET-only 确认以及未创建时密码重输、同编号安全重试；仓库 Chromium 自动化在测试体前受 macOS `bootstrap_check_in … Permission denied (1100)` 阻断，不计通过。完整门禁见 `docs/UPGRADE_PROGRESS.md`。

### 边界

- 仅本地修改；不提交、推送或部署。Android 仅同步 90332 元数据，未构建 APK。人员资料更新刷新恢复、B8 其他操作边界、B4/B5 全站审计与 Android 原生专项仍开放。

## v9.3.31 - 2026-10-22

### 新增

- 无。

### 优化

- 人员创建遇到网络或服务端响应不确定时，锁定原表单并允许使用同一请求安全重试，避免重复创建账号。

### 修复

- 用户创建请求键、账号、角色关系和活动日志现在在同一事务内提交；服务端已创建但响应丢失时，重试返回原账号，不会再次创建或重复记录。

### 技术升级

- 新增安全扩展迁移 `040_user_create_idempotency`，并补充提交后响应丢失、载荷冲突、事务回滚、重复执行和浏览器锁定/重试回归。

### 数据库变化

- 新增 `user_create_request_keys` 记录请求键与 HMAC 指纹，不存密码明文；不改动既有用户行。

### 测试情况

- 隔离 API 测试模拟事务提交后 503，确认同键重试只创建一个账号、一条角色关系和一条活动日志；Playwright MCP 手工隔离验证确认表单锁定并复用请求键。仓库 Chromium 自动化在测试体前受 macOS `bootstrap_check_in … Permission denied (1100)` 阻断，不计通过；迁移、类型与完整门禁结果见 `docs/UPGRADE_PROGRESS.md`。

### 边界

- 仅本地修改；不提交、推送或部署。Android 只同步 90331 版本元数据，未构建 APK。人员资料刷新后请求恢复、B8 其他操作边界、B4/B5 全站审计及 Android 原生专项仍开放。

## v9.3.30 - 2026-10-22

### 新增

- 无。

### 优化

- 人员编辑遇到网络或服务端响应不确定时，锁定原表单并允许用同一请求安全重试，避免重复改密、改角色情况下重复撤销会话或写入操作日志。

### 修复

- 用户资料更新在事务内记录请求重放键；服务端已提交但响应丢失时，再次提交只返回原结果，不重复变更用户、角色、会话或审计记录。密码不会明文写入重放记录。

### 技术升级

- 新增安全扩展迁移 `039_user_update_idempotency`，并补充失败响应重放、载荷冲突、迁移可重复执行和浏览器锁定/重试回归。抖音批量关联继续按用户确认的逐条编辑范围处理；全局编辑权限保持原范围。

### 数据库变化

- 新增 `user_update_request_keys` 记录请求键与 HMAC 指纹，不存密码明文；不改动既有用户行。

### 测试情况

- 隔离 API 测试模拟提交后 503，确认安全重试只执行一次密码/角色更新、会话撤销和活动日志写入；浏览器 MCP 隔离夹具确认表单锁定且两次 PUT 复用同一请求键。迁移 readiness 和迁移测试通过。完整检查结果见 `docs/UPGRADE_PROGRESS.md`。

### 边界

- 仅本地修改；不提交、推送或部署。Android 只同步 90330 版本元数据，未构建 APK。清单 B4/B5 全站检查、B8 其它用户操作边界及 Android 原生专项仍开放。

## v9.3.29 - 2026-10-22

### 新增

- 无。

### 优化

- 选题列表与看板的选择、排序、打开、下一步及阶段操作统一达到至少 40×40px；共享分页控件也统一达到 40×40px，手机保留前后翻页及相邻页码，减少窄屏拥挤。

### 修复

- 无。

### 技术升级

- 选题列表浏览器回归新增桌面/看板/深色主题和 320/390px 手机的可见按钮尺寸及窄屏分页断言；共享分页另补人员管理 51 人夹具的 320/390/1440px 尺寸和前后翻页回归。Playwright MCP 隔离页面手动验收确认翻页仅发 GET、没有业务写入；并手动核验人员启停不确定结果的只读核实、删除确认后刷新失败的只读恢复，均未重复写入。用户审计原子性与会话撤销 API 回归通过；两项仓库 Chromium 自动化均在测试体前受 macOS 启动权限阻断。

### 数据库变化

- 无。

### 测试情况

- 类型检查、定向 ESLint、版本/更新说明/测试入口/Studio/Android runtime 治理、抖音逐条编辑范围和官方日期窗口合同测试、生产构建及差异格式检查通过；选题与人员管理仓库浏览器自动化在测试体前受本机 Chromium 权限阻断，详情见升级阶段记录。

### 边界

- 本轮只调整选题交互命中区、共享分页呈现和回归；不改 API、权限、数据库或业务数据。Android 仅同步 90329 元数据，未构建 APK。本地不提交、推送或部署。

## v9.3.28 - 2026-10-22

### 新增

- 无

### 优化

- 资料库列表的查看、编辑、删除和翻页入口统一达到至少 40×40px；共享对话框关闭按钮也提升到 40×40px Studio 触控区。资料操作与权限不变。

### 修复

- 无

### 技术升级

- 响应式回归覆盖资料库列表与分类管理弹窗的 320/390/1440px 操作尺寸。Playwright MCP 隔离夹具手动实测通过；仓库 Chromium 自动化因 macOS `bootstrap_check_in … Permission denied (1100)` 在测试体前受阻，不计自动化通过。

### 数据库变化

- 无。

### 测试情况

- 类型检查、定向 ESLint、版本治理、更新说明唯一性、测试入口、Studio token 门禁、Android runtime 合同、生产构建及差异检查结果见升级阶段记录；隔离页面无横向溢出，控制台无错误或警告。

### 边界

- 仅调整资料库列表触控样式与回归；无 API、权限、业务数据或数据库变化。Android 仅同步 90328 元数据，未构建 APK。本地不提交、推送或部署。

## v9.3.27 - 2026-10-22

### 新增

- 无

### 优化

- 番茄钟完整页与紧凑卡片中的重置、统计重试、完成记录重试等操作统一达到至少 40×40px，并使用 Studio 按钮规范；窄屏滚动到底时，排行榜与固定底栏保持可分离触达。

### 修复

- 无

### 技术升级

- 响应式回归覆盖 320×720、390×844 和 1440×900；补充完整/紧凑计时器重置与统计读取失败→重试恢复，不产生业务写入。自动 Chromium 在测试体前因 macOS `bootstrap_check_in … Permission denied (1100)` 阻断；Playwright MCP 隔离夹具完成运行态验收。

### 数据库变化

- 无。

### 测试情况

- `npm run check -- --pretty false`、定向 ESLint、版本检查/治理、更新说明唯一性（471 个版本）、测试入口（250 个）、Studio token 门禁（38 类）、Android runtime 合同、`npm run build` 和 `git diff --check` 通过。生产构建仍有大分包提示（Tiptap 555.12 kB、主入口 701.69 kB、Silk 843.50 kB）。Playwright MCP 隔离验收覆盖完整/紧凑模式触控尺寸、统计 503→只读重试恢复、25:00 重置和移动底栏避让；仓库 `test:pomodoro-amber-contrast-browser` 与 `test:pomodoro-notification-browser` 均因 macOS Chromium `bootstrap_check_in … Permission denied (1100)` 在测试体前失败，不计自动化通过。

### 边界

- 不改变番茄钟 API、权限、业务数据或数据库；Android 仅同步版本元数据至 9.3.27/90327，未构建 APK。本地不提交、推送或部署。

## v9.3.26 - 2026-10-22

### 新增

- 无

### 优化

- 窄屏番茄钟隐藏与移动壳层重复的“返回首页”入口；桌面端继续显示原页面入口。

### 修复

- 无

### 技术升级

- 番茄钟响应式浏览器回归增加 320/390/1440px 下返回入口唯一性断言，并在窄屏执行不触发服务端写入的重置交互。修正该专项在服务已由 Socket.IO 关闭时重复关闭 HTTP 服务、掩盖原始浏览器启动结果的清理路径。

### 数据库变化

- 无。

### 测试情况

- 类型检查、目标 ESLint、版本检查/治理、更新说明治理（470 个版本）、测试入口（250 个文件）、Studio token 门禁（38 类）、Android runtime 契约、抖音逐条权限范围、官方导出 v3、创作者日期/报表专项、生产构建与 `git diff --check` 通过。Playwright MCP / Chrome DevTools MCP 隔离夹具实测 320×720 深色、390×844 浅色及 1440×900 桌面：移动端只显示壳层的 44×44 返回按钮，桌面保留一处页面入口；页面无横向溢出，计时器重置后仍为 25:00，业务 API 仅 GET，控制台无错误或警告。仓库 Chromium 自动化未能启动，`bootstrap_check_in org.chromium.Chromium.MachPortRendezvousServer` 返回 Permission denied (1100)，不计套件通过。构建保留已有大分包提醒（Tiptap 555.12 kB、主入口 701.33 kB、Silk 843.50 kB）。

### 边界

- 不改变番茄钟服务端行为、权限、数据或数据库；Android 仅同步版本元数据至 9.3.26/90326，未构建 APK。本地不提交、推送或部署。

## v9.3.25 - 2026-10-22

### 新增

- 无

### 优化

- 审批模板新建/更新须符合共享选题状态转换矩阵，审批动作仅接受“通过/驳回”；创作、成片制作和发布的创建/更新接口均只接受字符串状态枚举。阶段先后判断也统一由共享状态机提供。包括单元素数组等可被强制转成合法文本的畸形输入也返回 400，不写入记录或历史。

### 修复

- 收紧工作流主/子状态 API 边界校验，防止 `completed` 等跨流程审批结果以及非字符串载荷写入工作流记录。

### 技术升级

- 创作、成片和发布的状态文案表同时作为 API 合法状态枚举来源；隔离回归覆盖转换矩阵/阶段排序一致、非法模板转换/更新、审批结果及各子记录创建/更新边界，确认拒绝时记录、选题阶段与历史保持不变。

### 数据库变化

- 无。

### 测试情况

- `npm run test:workflow-stage-crud`、`npm run test:production-access`、类型检查、版本治理、更新说明治理、测试入口检查、Studio token 门禁、生产构建与 `git diff --check` 通过；`api/routes/workflow.ts` 的 12 条 lint 警告与 HEAD 基线一致。本次仅校验创作状态枚举，不改变合法状态流转，不回填历史数据或新增数据库结构。Android 仅同步 Gradle 版本元数据至 9.3.25/90325，未重生成 assets、未运行 Capacitor sync、未构建 APK。本地修改，不提交、推送或部署。

## v9.3.24 - 2026-10-22

### 新增

- 无

### 优化

- 页面入场过渡从可见状态开始；即使动画没有被调度，窄屏页面也不会停留在透明空白。

### 修复

- 修正 Analytics 回归对真实移动壳层误要求桌面过渡容器的问题，并新增桌面启动后缩窄到 320px 的可见性检查。

### 技术升级

- 按用户确认的逐条编辑范围复核抖音批量关联：仅纳入调用者可编辑的发布记录；范围外不写入、不计入结果，全局编辑权限仍保持原有范围。

### 数据库变化

- 无。

### 测试情况

- `npm run check -- --pretty false`、目标 ESLint、`npm run test:publishing-douyin-link`、`npm run version:check`、版本治理、更新说明治理（468 个版本）、测试入口检查（250 个文件）、Studio token 门禁、生产构建与 `git diff --check` 通过；Chrome DevTools MCP 隔离页验证 320px 可见性、统计只读重载恢复及无横向溢出。构建保留 Tiptap 555.12 kB、主入口 700.74 kB、SilkBackgroundAdapter 843.50 kB 等既有大分包提示。`npm run test:analytics-browser` 在 macOS Chromium `bootstrap_check_in … Permission denied (1100)` 启动阶段失败，未进入测试体。
- Android 仅同步 Gradle 版本元数据至 9.3.24/90324，未重生成 assets、未运行 Capacitor sync、未构建 APK。仅本地修改，不提交、推送或部署。

## v9.3.23 - 2026-10-22

### 新增

- 无

### 优化

- 选题手动阶段推进、严格审批、审核动作、自动交接、发布完成与仓储层条件更新共用同一状态转换真源；普通资料更新不再接受状态字段。非法跳级和未知状态继续被拒绝，不改变现有合法转换。

### 修复

- 无

### 技术升级

- 新增状态转换矩阵全量比对测试、仓储层越级拒绝回归，并扩展隔离审批回归，验证跳级与未知目标不会改写选题、创建阶段记录或留审批结果。

### 数据库变化

- 无

### 测试情况

- `test:topic-state-machine`、`test:workflow-stage-crud`、`test:topic-production-handoff`、`test:topics`、`test:workflow-ui-language`、类型检查、目标 ESLint、版本/更新说明治理（467 个版本）、测试入口检查（250 个文件）、生产构建与 `git diff --check` 均通过；目标文件无新增 lint 警告，`api/routes/workflow.ts` 的 12 条警告与 HEAD 基线一致；构建保留既有 >500 kB 分包提示。
- 本版本只统一状态转换规则的代码来源，不关闭 B2 全项：历史错位和其它工作流副状态仍需继续核对；不批量回填或改写历史。仅本地修改，不提交、推送或部署。

## v9.3.22 - 2026-10-22

### 新增

- 无

### 优化

- 人员管理列表的启用/禁用、编辑和删除操作统一达到至少 40×40px Studio 触控目标；窄屏固定操作列仍可达，不改变账号管理行为与权限。

### 修复

- 无

### 技术升级

- 人员管理隔离浏览器回归覆盖 320/390/1440px 下的操作尺寸、视口边界和页面横向溢出。

### 数据库变化

- 无

### 测试情况

- Playwright MCP / Chrome DevTools MCP 隔离页面手动验证 320/390/1440px 三项操作均至少 40×40px；编辑弹窗打开后取消，隔离服务端写入计数为 0，控制台无错误。
- `npm run check`、目标 ESLint、版本/更新说明治理（466 个版本）、Studio token 门禁、抖音逐条编辑范围专项、生产构建与 `git diff --check` 通过；构建有既有 >500 kB 分包提示。仓库浏览器自动化未进入测试体，macOS Chromium 在 `bootstrap_check_in … Permission denied (1100)` 启动阶段失败；未计为自动化通过。Android 仅同步 Gradle 版本元数据至 9.3.22/90322，未构建 APK；本地不提交、推送或部署。

## v9.3.21 - 2026-10-22

### 新增

- 无

### 优化

- 复盘列表筛选字段补充读屏名称，并统一达到 40px 最小高度；短标题详情入口也保持足够触控区域。修改状态、类型和日期时先保留为待应用条件，点击“应用筛选”后合并发出一次读取；正在读取时仍可应用新条件，迟到的旧结果不会覆盖新筛选。
- 复盘行动项详情抽屉统一使用 Studio 输入控件，单行字段至少 40px，说明和处理结果保留足够的可编辑空间。
- 公共顶部栏的消息中心、主题切换、导航菜单与窄屏侧栏关闭按钮统一达到 40×40px Studio 触控目标。

### 修复

- 320px 窄屏下，编辑器折叠工具栏菜单及标题、文字颜色、高亮弹层原会超出视口并裁切；现按各菜单宽度、锚点和视口边界定位，窄视口时同步限宽。

### 技术升级

- 响应式回归加入筛选名称/尺寸、短标题点击区及多字段单次读取/迟到响应隔离断言，覆盖浅/深主题、320/390/1440px。
- 响应式回归加入详情抽屉六个字段的可访问名称、可见性和最小尺寸断言，并检查窄屏抽屉边界。
- 响应式回归补充公共壳层消息、主题、导航打开/关闭控件的触控尺寸检查，分别覆盖移动壳层与窄屏桌面壳层。
- 编辑器响应式浏览器回归覆盖标题、文字颜色、高亮和“更多操作”四种弹层在 320×812px 与 1024×600px/125% 缩放下的边界。

### 数据库变化

- 无

### 测试情况

- Playwright MCP 隔离夹具手动检查 320/390/1440px 明暗主题：四个筛选字段为 40/42px、短标题详情入口 40px、无页面横向溢出及应用内告警；验证修改条件不发请求、点击一次只发一条完整 GET，并验证旧成功/503 响应不覆盖新筛选。仓库 Chromium 自动化在启动时受 macOS `bootstrap_check_in … Permission denied (1100)` 阻断，未进入测试体。
- Playwright MCP 实测行动项详情抽屉 320/390/1440px 浅色及 320/390px 深色：四个单行字段为 40/42px、两段文本区为 112/128px，抽屉留在视口内且页面无横向溢出；Chrome DevTools MCP 复核移动暗色布局，隔离页控制台无错误/警告。抖音关联范围专项测试通过；仓库浏览器自动化仍在 Chromium 启动前受 macOS 权限阻断，不计通过。
- Playwright MCP 与 Chrome DevTools MCP 手验公共壳层：桌面消息/主题按钮与窄屏导航打开/关闭均为 40×40px，真实移动壳层返回/退出为 44×44px，页面无横向溢出；DevTools 唯一警告为 reduced-motion 模拟提示。完整自动化套件受 Chromium 启动权限阻断，不计通过。
- Playwright MCP 隔离审阅夹具验证窄屏桌面壳层编辑器弹层：320×812px 标题/文字颜色/高亮/更多菜单分别落在 x=89–217、63–239、105–281、8–232px；390×844px 暗色文字颜色菜单落在 x=63–239px、“更多操作”落在 x=115–339px。文档宽分别为 312/320px 和 382/390px，无横向溢出。只打开/关闭菜单，没有稿件或业务数据写入；仓库 Chromium 自动化未重跑。

---

## v9.3.20 - 2026-10-22

### 新增

- 无

### 优化

- 无

### 修复

- 复盘行动项创建、表格状态选择及日报风险联动字段统一达到至少 40px 高度，并复用 Studio `.xmt-field`。

### 技术升级

- 增加 320/390/1440px 的字段高度回归断言；Chrome DevTools MCP 隔离夹具确认 320px 浅色、390px 深色与 1440px 桌面无页面横向溢出。仓库 Playwright 自动化未进入测试体，受 macOS Chromium `bootstrap_check_in … Permission denied (1100)` 阻断。

### 数据库变化

- 无

### 测试情况

- `npm run test:publishing-douyin-link` 与北京时间官方数据窗口专项测试通过；复盘行动项控制在 Chrome DevTools MCP 320/390/1440px 隔离页实测达到 40px、控制台无错误。类型检查、版本门禁和构建结果见本轮验证。

---

## v9.3.19 - 2026-10-22

### 新增

- 无

### 优化

- 无

### 修复

- 数据复盘年/月/选题筛选提升至至少 40×40px；移动端选题筛选滚动时为固定底栏预留空间。
- 修正数据复盘浏览器回归顺序：读取恢复后再运行完整视口矩阵，不把失败态按预期隐藏的热力图误判为布局故障。

### 技术升级

- 保留失败态提示/重试检查；在成功数据态覆盖 17 种移动与桌面视口、键盘横向滚动及页面溢出，并实测移动导航避让。

### 数据库变化

- 无

### 测试情况

- Playwright MCP 隔离夹具按 17 种视口及键盘路径实测通过；移动端壳层 320/390px 下筛选控件尺寸、可达性与底栏避让通过；Chrome DevTools MCP 隔离页确认桌面及移动布局正常渲染。仓库 Chromium 自动化受 macOS `bootstrap_check_in … Permission denied (1100)` 阻断，未进入测试体，不计自动化通过。未触发业务写入。

## v9.3.18 - 2026-10-22

### 新增

- 无

### 优化

- 移动端“我的”字号选择和移动选题关联资料读取失败后的重试入口均达到至少 40×40px，320px 与 390px 下保持可见、可操作。

### 修复

- 修复两处移动网页操作入口低于统一触控尺寸的问题；不改变字号偏好、资料读取、权限或数据规则。

### 技术升级

- 移动端浏览器回归补充字号、选题详情和通知偏好主要操作的目标尺寸断言，并检查窄屏布局。

### 数据库变化

- 无

### 测试情况

- 类型检查、目标 ESLint、移动导航合同、版本/更新说明治理和生产构建通过；Playwright MCP 与 Chrome DevTools MCP 隔离夹具在 320px 浅色、390px 深色实测字号选项为 40×40px，点击 18px 后偏好更新且无溢出；320px 资料读取失败后的 40px 重试按钮可恢复，网络记录显示失败和重试均为 GET。通知偏好页在 390×844 浅色、320×844 深色实测返回/开关/保存尺寸分别为 44×44、64px 高、44px 高；页面无溢出、控制台 0 error/warning，网络仅有三条配置 GET。仓库移动浏览器自动化因 macOS Chromium `bootstrap_check_in … Permission denied (1100)` 在测试体前失败，不计自动化通过。Android 仅同步版本元数据至 90318，未构建 APK。本地不提交、推送或部署。

## v9.3.17 - 2026-10-22

### 新增

- 无

### 优化

- 发布管理、创作管理列表及灵感卡片主操作统一提升至至少 40×40px Studio 控件；发布操作列桌面同排、手机可换行，创作列表双按钮在固定列内同排，灵感卡片操作窄屏可换行。

### 修复

- 修复发布/创作列表及灵感卡片图标与紧凑按钮小于统一触控尺寸的问题；不改变现有操作行为或权限。

### 技术升级

- 发布、创作列表与灵感卡片浏览器回归增加操作目标 40×40px、桌面同排、320px 可达性、固定列和内容可读范围断言。

### 数据库变化

- 无

### 测试情况

- 类型检查、定向 ESLint、抖音关联范围、创作列表更新合同和灵感 mutation/API 回归、版本检查/治理、差异检查及生产构建通过；Playwright MCP 与 Chrome DevTools MCP 隔离夹具实测三个页面 320px 亮/暗主题及 1440px 桌面布局。三项仓库浏览器自动化均在 Chromium 启动前受 macOS `bootstrap_check_in … Permission denied (1100)` 阻断，未进入测试体。Android 仅更新 Gradle 元数据至 90317，未构建 APK。本地修改，不提交、推送或部署。

## v9.3.16 - 2026-10-22

### 新增

- 无

### 优化

- 选题管理桌面表格的“查看/删除”图标入口改用 Studio 共享按钮，点击区域从 32×32px 提升至 40×40px。

### 修复

- 修复选题操作列按钮绕过共享控件、触控命中区偏小的问题；保留原有查看、删除行为和权限规则。

### 技术升级

- 选题响应式浏览器回归新增操作列 40×40px 最小目标断言，覆盖 1366/1440/1920px 与 80%–125% 等效布局视口。

### 数据库变化

- 无

### 测试情况

- 选题 API 测试、类型检查、定向 ESLint、生产构建和版本治理通过；Playwright MCP 隔离夹具核对 320/390px 移动端、1093–1920px 桌面操作可达性。仓库 Playwright 自动化在 Chromium 启动前受 macOS `bootstrap_check_in … Permission denied (1100)` 阻断，未进入测试体；构建仍有既有大分包提示。Android 只更新 Gradle 元数据，未构建 APK。本地修改，不提交、推送或部署。

## v9.3.15 - 2026-10-22

### 新增

- 无

### 优化

- 创作、拍摄与发布详情的返回入口、关联选题/历史侧栏操作，以及拍摄信息栏、发布历史来源稿和编辑器“复制全文”操作均提升到至少 40px，便于手机触控。

### 修复

- 修复创作/拍摄/发布详情中多个返回、关联和历史操作，以及编辑器复制全文按钮低于统一触控尺寸要求的问题。

### 技术升级

- 为创作/拍摄/发布详情响应式浏览器回归增加返回、关联选题、编辑操作、历史侧栏/来源稿入口、信息栏开关及复制全文操作的 40×40px 最小尺寸断言。

### 数据库变化

- 无

### 测试情况

- 类型检查、定向 ESLint、生产构建及版本治理通过；Playwright MCP/Chrome DevTools MCP 隔离夹具累计检查 320/390px 手机与 1440px 桌面、明暗主题。仓库 Playwright 自动化因 Chromium 启动权限未进入测试体；具体结果及 Android 检查边界见 `docs/UPGRADE_PROGRESS.md`。

## v9.3.14 - 2026-10-21

### 修复

- 发布、选题列表/看板、工作台任务、周报、模板与资料中心统一把已知平台标识显示为平台名称，避免界面露出 `douyin` 等内部代码；过滤仍使用原值，编辑输入不改写数据，自定义名称保持不变。

### 验证

- 平台名称与语义标签单测 3/3、测试入口检查 248 个文件通过；Playwright MCP 在隔离合成数据下验证列表与详情、320px 亮/暗主题和 1440px 桌面。`npm run test:publishing-hover-contrast-browser` 因 macOS `bootstrap_check_in … Permission denied (1100)` 在 Chromium 启动阶段失败，未进入测试体，不计自动化通过。

## v9.3.13 - 2026-10-21

### 优化

- 活动日志移动页改为纵向标题与筛选布局，时间信息在窄屏下独立换行；筛选、分页与恢复操作统一达到 40px 触控高度。

### 验证

- Playwright MCP 合成数据复核 320px 明暗主题和 1440px 桌面；独立验证成员筛选/活动日志 503 后只读重试恢复，无横向溢出、无业务写入。仓库浏览器自动化因 macOS Chromium 启动权限未进入测试体。

## v9.3.12 - 2026-10-21

### 优化

- 内容动态页的文档选择框、“查看”和只读重试操作提升到 40px 高，手机上更容易触控。

### 验证

- Playwright MCP 隔离夹具验证详情/历史读取失败、显式只读重试、迟到响应隔离、320/390px 明暗主题及 1440px 桌面；自动化套件受本机 Chromium 启动权限阻断，未进入测试体。完整结果见 `docs/UPGRADE_PROGRESS.md`。

## v9.3.11 - 2026-10-21

### 修复

- 移动端从资料中心卡片打开任一资料库后，顶部返回操作现在回到资料中心；壳层标题也显示当前“资料中心”，不再误标为“工作台”。

### 验证

- 320/390px 隔离页面验证项目、内容档案、知识库、素材归档四个入口均可返回资料中心且无横向溢出；仅使用合成账号和数据。浏览器自动化因本机 Chromium 启动权限未进入测试体，详见 `docs/UPGRADE_PROGRESS.md`。本地修改，不提交、推送或部署。

## v9.3.10 - 2026-10-21

### 优化

- 资料中心总览的隔离浏览器回归覆盖桌面/窄屏、浅/深主题、可见键盘焦点与卡片导航，并确保仅只读访问。

### 验证

- Playwright MCP 隔离页面覆盖局部失败与显式重试、320/390/1440px、两种主题和四类资料库导航及桌面侧栏选中态；控制台仅有夹具注入的预期 503 错误，无其他错误/警告。自动化 Chromium 启动受本机 macOS 权限阻断，未进入测试体。详细门禁见 `docs/UPGRADE_PROGRESS.md`。本地修改，不提交、推送或部署。

## v9.3.9 - 2026-10-21

### 修复

- 编辑器手动保存会等待异步保存结果；Meta/Ctrl+S 使用当前最新稿回调，不再因旧闭包提交初始稿。失败或结果未确认时不提前显示保存成功。

### 验证

- 单测验证异步确认、未确认和失败分支；Playwright MCP 在隔离页面验证延迟成功、最新稿写入、503 后保留草稿且不重试。仓库浏览器套件受 macOS Chromium 权限限制未进入测试体；完整验证结果见 `docs/UPGRADE_PROGRESS.md`。

## v9.3.8 - 2026-10-21

### 修复

- 桌面及移动选题详情读取遇到网络错误或服务暂时不可用时，不再误报“选题不存在”或残留上一条内容；提供页面内只读重试，确认 404 时仍独立说明记录不可访问。

### 验证

- Playwright MCP 在隔离桌面及 320px 移动页面注入详情读取 503，确认错误提示不泄漏接口内容，明确重试后恢复详情且不产生业务写入；另验证 404 显示独立状态。仓库 Playwright 浏览器套件启动阶段受 macOS Chromium 权限限制，未进入测试体；其余验证详见 `docs/UPGRADE_PROGRESS.md`。

## v9.3.7 - 2026-10-21

### 修复

- 修复窄屏选中文字后 BubbleMenu 横向溢出、H1–H4 与“添加批注”被裁切的问题；移动端工具栏换行并提供 40×40px 操作区域，颜色/高亮面板靠右对齐且不越出视口，桌面仍保持单行与居中弹出。为关联选题和目标字数表单补充稳定字段名，消除浏览器表单标识提示，不改变保存行为。

### 验证

- Playwright MCP 与 Chrome DevTools MCP 隔离合成页实测 320px 浅色及 390px 深色：菜单、工具按钮和两类颜色面板均留在视口内，色块达到至少 40×40px，无页面横向溢出；不触发保存且夹具正文/保存记录不变。`npm run test:production-review-browser` 仍在 Chromium 启动阶段因 macOS `bootstrap_check_in … Permission denied (1100)` 失败，不计自动化通过。其余检查详见 `docs/UPGRADE_PROGRESS.md`。

## v9.3.6 - 2026-10-21

### 优化

- 登录主题浏览器验收增加可选的本机合成夹具服务模式，便于在自动化 Chromium 子进程受限时继续使用已连接的浏览器工具核对登录页。

### 验证

- Playwright MCP 覆盖三种登录布局、浅/深主题以及 320px/390px 窄屏显示；合成首次改密流程验证背景隔离、键盘焦点循环和取消后的焦点恢复。Chrome DevTools MCP 在独立上下文复核深色移动登录页，控制台无错误/警告。标准自动化入口仍在 Chromium 启动阶段被 macOS `bootstrap_check_in … Permission denied (1100)` 阻断，不计为通过。
- 类型检查、目标 ESLint、版本检查/治理、更新说明治理、差异检查与生产构建结果详见 `docs/UPGRADE_PROGRESS.md`。无产品 API、权限、数据库或业务数据变化；Android 仅同步 Gradle 元数据至 9.3.6/90306，未运行 Capacitor sync 或 APK 构建。本地不提交、推送或部署。

## v9.3.5 - 2026-10-21

### 修复

- 移动端选题管理的五个筛选按钮改为窄屏自动换行；320px 与 390px 下不再把末尾选项截在视口外，同时保留原筛选结果与地址栏状态。

### 验证

- Chrome DevTools MCP 使用本地合成选题夹具复验浅色 320×844 与 390×844：所有筛选按钮完整可见、筛选容器和页面均无横向溢出；点击“进行中”后筛选状态与 URL 正常更新，仅有只读 GET 请求，控制台无错误或警告。类型检查、目标 ESLint、选题模块测试、版本治理、差异检查与生产构建结果详见 `docs/UPGRADE_PROGRESS.md`。仓库 Playwright 浏览器套件因 macOS Chromium `bootstrap_check_in … Permission denied (1100)` 在测试体前无法启动，不计自动化套件通过。

## v9.3.4 - 2026-10-21

### 修复

- 正文编辑器关闭“查找替换”后恢复到原触发按钮；使用键盘快捷键打开时返回正文，避免焦点落到页面主体。
- 没有协作者正在输入时，编辑区说明当前无人编辑；不再把空闲状态误报为“系统正在同步”。
- 选题管理空结果和读取失败提示按页面标题层级呈现，不再从一级标题直接跳到三级标题。

### 验证

- Chrome DevTools MCP 在深色桌面 1440×900 隔离页验证 Escape、关闭按钮和 Meta+F 三条焦点路径，在浅色移动 390×844 页验证 Escape；合成正文保持原样、保存计数为 0，两种视口均无横向溢出。创作编辑器工具栏的按钮均有读屏名称；桌面和移动查找结果/关闭路径正常，手机 390px 不横向溢出。选题隔离夹具删除合成记录后确认“暂无选题”为二级标题，页面无横向溢出，Lighthouse 可访问性/最佳实践/SEO 均 100；编辑器桌面与移动三个类别也均 100。`llms.txt` Agentic Browsing 提示未通过且与本次 UI 无关。类型检查、定向 ESLint 和生产构建通过。仓库浏览器自动化因 macOS Chromium `bootstrap_check_in … Permission denied (1100)` 在测试体前无法启动，不计套件通过。无 API 路由、权限或数据库变化；Android 仅同步版本元数据至 9.3.4/90304，未运行 Capacitor sync 或 APK 构建。本地不提交、推送或部署。

## v9.3.3 - 2026-10-21

### 修复

- 移动首页关注选题不再在组装今日任务时提前截成 3 条；仍按既有优先级与总上限最多展示 6 项，展开后可看到第 4–6 条关注事项。

### 验证

- 类型检查、目标 ESLint、`npm run test:home-dashboard`、版本检查/治理、更新说明唯一性（447 个版本）、测试入口（246 个）、Android runtime 合同、`git diff --check` 和生产构建通过。Chrome DevTools MCP 隔离夹具在 390×844 实测服务端返回 8 条关注事项时默认显示 3 条，展开显示第 4–6 条且页面不横向溢出，仍遵守 6 项上限。`npm run test:topic-stage-record-repair-browser` 本轮启动失败：macOS Chromium 在测试体前 `bootstrap_check_in … Permission denied (1100)`，不计自动化套件通过。构建保留既有 >500 kB 分包提醒（主入口 692.67 kB、Tiptap 555.12 kB、Silk 843.50 kB）。无 API 路由、权限或数据库变化；Android 原生专项后置，仅同步 Gradle 元数据至 9.3.3/90303，未运行 Capacitor sync 或 APK 构建。本地不提交、推送或部署。

## v9.3.2 - 2026-10-21

### 修复

- 移动端选题标题/说明保存结果不明时先只读核实；已保存不重发，读回失败锁定编辑与相关写入并支持刷新后恢复，并发变化时展示服务端最新内容、保留本地草稿并要求用户明确选择。

### 验证

- `npm run check -- --pretty false`、目标 ESLint、选题/创作交接/抖音逐条范围回归、版本与更新说明治理、Android runtime 合同、差异检查和生产构建通过。Chrome DevTools MCP 隔离 fixture 覆盖响应丢失、明确重试、读回失败后刷新 GET-only 恢复及并发变化；仓库 Playwright 自动化未能启动（macOS Chromium `bootstrap_check_in … Permission denied (1100)`），Playwright MCP transport closed，均不计自动化套件通过。无 API 路由、权限、数据库或真实数据变化；Android 原生专项后置，仅同步 Gradle 元数据至 9.3.2/90302，未运行 Capacitor sync 或 APK 构建。本地不提交、推送或部署。

## v9.3.1 - 2026-10-21

### 修复

- 移动端已有创作稿的自动保存、保存/提交审核与审核通过，遇到响应不明时改为只读核实同一稿件；服务端已应用则确认且不重复写入，仍为原状态时要求用户明确重试，读回失败时保留本机正文并锁定后续编辑/写入，刷新后只读恢复。

### 验证

- `npm run check -- --pretty false`、目标 ESLint、`npm run test:production-review`、`npm run test:production-create-idempotency` 和 `npm run build` 通过。Chrome DevTools MCP 本地隔离 fixture 实测自动保存响应丢失、读回失败后刷新 GET-only/用户明确重试、审核通过响应丢失，均按计数确认最多一次实际写入；仓库 Playwright 自动化在测试体前因 macOS Chromium `bootstrap_check_in … Permission denied (1100)` 未能启动，不计套件通过。无 API 路由、权限、数据库或真实业务数据变化；Android 原生专项后置，仅同步 Gradle 元数据至 9.3.1/90301，未运行 Capacitor sync 或 APK 构建。本地不提交、推送或部署。

## v9.3.0 - 2026-10-21

### 修复

- 移动网页新建创作稿使用稳定请求编号；响应不明时先只读核实，已创建则打开原稿、不重发；确认未创建时才允许用户明确以同一编号重试。读回失败会暂停新建并保留正文，刷新后继续核实。

### 验证

- `npm run test:production-create-idempotency`、类型检查、目标 ESLint 和生产构建通过。Chrome DevTools MCP 在隔离 fixture 中实测“已创建但响应丢失”与“未创建且首轮读回失败→刷新 GET-only→同编号显式重试”：前者仅一次 POST/一次写入；后者核实期间无写入，明确重试后两次 POST 尝试共一次写入，两个请求 ID 完全相同；确认创建后安全草稿和恢复标记清理。仓库 Playwright 自动化因 macOS Chromium `bootstrap_check_in … Permission denied (1100)` 启动失败，且 WebSocket 端口 24678 已被占用，测试体未执行，不计通过。无 API 路由、权限、数据库或真实数据变化；Android 原生专项后置，仅同步 Gradle 版本至 9.3.0/90300，未运行 Capacitor sync 或 APK 构建。本地修改，不提交、推送或部署。

## v9.2.99 - 2026-10-21

### 修复

- 移动网页选题看板与详情审核/阶段推进在网络异常或 5xx 后先只读核实服务端状态；已生效不重发，仍为原状态时保留表单并要求用户明确重试，读回失败则锁定相关状态操作。

### 验证

- 增加移动看板、移动详情审核与阶段推进的隔离回归。Playwright MCP / Chrome DevTools MCP 实测已提交但响应丢失、写入与首轮读回均失败、只读恢复和明确重试，按请求计数确认没有自动重发。`npm run check`、选题测试、目标 ESLint、版本与 Android runtime 合同、`git diff --check` 和生产构建通过；仓库 Playwright 自动化因 macOS Chromium 启动权限在测试体前失败，不计套件通过。Android 原生专项后置，仅同步 Gradle 版本至 9.2.99/90299；未运行 Capacitor sync 或 APK 构建。本地修改，不提交、推送或部署。

## v9.2.98 - 2026-10-21

### 修复

- 选题批量审核与看板状态更新遇到超时或服务器异常时，先只读读取当前选题；目标状态已生效则确认成功且不重发，仍为原状态时只在用户明确操作后重试，其他状态按服务器最新记录展示。读回失败会锁住该条记录的审核、看板状态更新和删除。

### 验证

- 增加批量审核与看板审核的响应丢失、读回失败、只读恢复和明确重试隔离回归。Playwright MCP 隔离页面实测两类流程，服务端计数确认已提交的写入只发生一次，读回期间没有额外写入。`npm run check`、选题模块/通知/批量反馈测试、目标 ESLint、`git diff --check` 与生产构建通过；仓库浏览器自动化因 macOS Chromium `bootstrap_check_in … Permission denied (1100)` 在测试体前失败，不计套件通过。Android 原生专项后置，仅更新 Gradle 版本号至 9.2.98/90298；未重生成 Android assets、未运行 Capacitor sync、未构建 APK。本地修改，不提交、推送或部署。

## v9.2.97 - 2026-10-21

### 修复

- 选题详情审核遇到异常时只读核实服务端状态，避免审核成功但响应丢失时重复提交；读回失败会锁定审核操作，仍待审核时只允许用户明确重试。

### 验证

- 类型检查、选题 API 回归和 Playwright MCP 隔离页面实测通过；实测覆盖服务端已审核但响应返回 503，以及审核/首次状态读取均失败后锁定、只读恢复、用户明确重试。仓库 Playwright 自动化因 macOS Chromium 启动权限未进入测试体，不计通过。Android 仅同步元数据至 9.2.97/90297，未构建 APK；本地修改，不提交、推送或部署。

## v9.2.96 - 2026-10-21

### 修复

- 选题单条与批量删除遇到异常时先核实对应记录；已删除不重发，仍存在时仅允许用户再次确认，核实失败则锁住该记录的删除和批量修改，并提供只读核实。

### 验证

- Playwright MCP 隔离页面实测删除失败/读回仍存在、提交后响应丢失/读回 404、读回失败/锁定/只读核实/显式重试；核实期间 DELETE 次数不增加。类型、目标 ESLint、构建与治理结果见 `docs/UPGRADE_PROGRESS.md`。仓库 Playwright 自动化因 macOS Chromium 启动权限未进入测试体，不计通过。Android 仅同步元数据至 9.2.96/90296，未构建 APK；本地修改，不提交、推送或部署。

## v9.2.95 - 2026-10-21

### 修复

- 灵感删除响应不明时先只读核实；已删除不重复操作，仍存在时由用户确认后再重试，核实失败则暂停删除并提供只读核实入口。

### 验证

- 隔离浏览器夹具覆盖删除失败/回查仍存在、提交后响应丢失并回查 404、回查失败后锁定与显式恢复。类型、定向 ESLint、灵感事务测试、版本与文档治理及生产构建结果见 `docs/UPGRADE_PROGRESS.md`。Android 仅同步元数据至 9.2.95/90295，未构建 APK；本地修改，不提交、推送或部署。

## v9.2.94 - 2026-10-21

### 优化

- 为资料详情普通文字新增明暗主题、桌面与窄屏可读性回归；当前 Studio 令牌实测满足 WCAG 普通文字 4.5:1 对比度门槛，页面在 1440、390 和 320px 视口均无横向溢出。

### 验证

- Chrome DevTools MCP 在隔离资料档案页完成六种主题/视口组合的可读性与布局复核；资料详情回归的纯逻辑测试通过。仓库 Playwright 自动化因 macOS Chromium `bootstrap_check_in … Permission denied (1100)` 未进入测试体，不计自动化通过。Android 仅同步元数据至 9.2.94/90294，未构建 APK；本地修改，不提交、推送或部署。

## v9.2.93 - 2026-10-21

### 修复

- 日历创建请求增加账号范围内的幂等编号；同一编号重放只对应一条事件，载荷冲突拒绝，已删除事件保留墓碑且不会被延迟重试复活。
- 创建响应超时或丢失时先只读核实；确认已创建不重复写入，确认未找到后只允许用户沿用原编号显式重试，读回异常时锁定新建并支持刷新恢复。

### 技术升级

- 新增 SAFE_EXPAND 迁移 038 和账号限定的创建状态查询；未提供请求编号的旧客户端保持兼容。迁移仅在临时测试库验证，未对真实数据库执行。

### 验证

- API/迁移测试、迁移就绪、版本/更新说明治理、Android runtime 合同、类型、定向 ESLint、构建及隔离浏览器实测详见 `docs/UPGRADE_PROGRESS.md`。Android 仅同步元数据至 9.2.93/90293，未构建 APK；本地修改，不提交、推送或部署。

## v9.2.92 - 2026-10-20

### 修复

- 调亮 Studio 深色主题的弱化文字令牌，保证侧栏、编辑器分组、审阅说明等普通文字在系统基础表面上符合 4.5:1 对比度要求。

### 验证

- 为深浅主题的弱化文字与基础表面对比度增加静态令牌门禁，并扩展创作详情双主题浏览器回归。最终门禁与隔离页面实测见 `docs/UPGRADE_PROGRESS.md`。Android 仅同步元数据至 9.2.92/90292，未构建 APK；本地修改，不提交、推送或部署。

## v9.2.91 - 2026-10-20

### 修复

- 成就页的积分摘要、统计说明、进度/日期、排行和空状态文字改用 Studio 次级文字令牌，提升亮暗主题可读性。

### 验证

- 增加成就视图状态、键盘操作及普通文字对比度回归；Playwright MCP 与 Chrome DevTools MCP 隔离页复核。仓库 Chromium 自动化因本机 `bootstrap_check_in … Permission denied (1100)` 在测试体前失败，不计自动化通过。完整门禁见 `docs/UPGRADE_PROGRESS.md`。本地修改，不提交、推送或部署。

## v9.2.90 - 2026-10-20

### 修复

- 日历周标题、跨月日期、事件计数和溢出提示改用 Studio 次级文字令牌，满足普通文字对比度要求。

### 验证

- 隔离日历页在 Playwright MCP 与 Chrome DevTools MCP 下复核；仓库自动化因本机 Chromium `bootstrap_check_in … Permission denied (1100)` 在测试体前失败，不计自动化通过。最终类型、lint、版本/文档治理和构建结果见 `docs/UPGRADE_PROGRESS.md`。仅本地修改，不提交、推送或部署。

## v9.2.89 - 2026-10-20

### 修复

- 创作列表新增记录响应不明确时按请求编号只读核实；已创建不重发，确认尚未创建后才允许用同一编号显式安全重试。
- 回查失败时暂停创作列表其它写入，刷新后继续核实，避免重复创建。

### 技术升级

- 新增 SAFE_EXPAND 迁移 037 和创建者范围内的请求状态读取接口；兼容无请求编号的旧客户端。

### 验证

- API/迁移合同与 Playwright MCP 隔离路径验证、仓库自动化启动限制和最终治理/构建结果见 `docs/UPGRADE_PROGRESS.md`。本地不提交、推送或部署。

## v9.2.88 - 2026-10-20

### 修复

- 创作记录删除遇到超时或服务器异常时先只读核实：GET 404 确认删除完成并回到列表；记录仍存在且版本、状态、正文未变时，只在用户明确确认后重试。
- 记录状态暂不可读时保存会话恢复标记并锁定该稿件的后续写入；刷新后继续只读核实，防止重复删除。

### 技术升级

- 创作详情与删除 API 错误保留 HTTP 状态；无新增 API 路由、数据库迁移或权限授予。

### 验证

- 类型检查、目标 ESLint、创作审核 HTTP、成片工作流、抖音逐条编辑范围回归、版本/文档治理、测试入口、Android runtime 合同、差异检查和生产构建结果见 `docs/UPGRADE_PROGRESS.md`。Playwright MCP 隔离页面验证已删除、未删除后明确重试、读回失败后刷新三条路径；仓库浏览器自动化因本机 Chromium 启动权限未进入测试体，不计自动化通过。本地修改，不提交、推送或部署。

## v9.2.87 - 2026-10-20

### 修复

- 创作详情“小修保存/另开新版”响应不明确时先只读核实服务端版本与正文；已建版不重发，仍为原版本且正文一致时仅在用户明确确认后重试。
- 首次核实读取失败时保留会话恢复标记并锁定创作写入；刷新后继续核实，避免重复建版。

### 技术升级

- 无新增 API 路由、数据库迁移或权限授予。

### 验证

- 类型检查、目标 ESLint、创作审核 HTTP、成片工作流、抖音逐条编辑范围回归、版本/文档治理、测试入口、Android runtime 合同、差异检查和生产构建结果见 `docs/UPGRADE_PROGRESS.md`。Playwright MCP 隔离页面验证三种版本保存恢复路径；仓库浏览器自动化因本机 Chromium 启动权限未进入测试体，不计自动化通过。本地修改，不提交、推送或部署。

## v9.2.86 - 2026-10-20

### 修复

- 创作详情提交审核与状态更新遇到超时或服务器异常时，先只读核实服务端状态；已生效不重发，仍为原状态仅在用户明确确认后重试。
- 回查失败时保留账号/稿件范围的核实标记，并锁定编辑、版本保存、删除和状态写入；刷新后继续只读恢复。状态请求发送前先确认正文保存完成。

### 技术升级

- 更新创作详情 API 错误的 HTTP 状态保留；无新增 API 路由、数据库迁移或权限授予。

### 验证

- 类型检查、目标 ESLint、创作审核 HTTP、成片工作流、抖音逐条编辑范围回归、版本/文档治理与生产构建通过。Playwright MCP 隔离页面验证已提交但返回 503、未提交后明确确认重试、读回失败后刷新恢复及状态更新四条路径；仓库浏览器自动化因 macOS Chromium 启动权限未进入测试体，不计为自动化通过。本地修改，不提交、推送或部署。

## v9.2.85 - 2026-10-20

### 修复

- 成片详情状态更新结果不明确时，只读核实服务器状态；已更新不重发，仍为原状态时仅在用户明确确认后重试，若服务器状态已另行变化则采用最新状态。
- 状态结果暂不可读时按账号和成片记录保存恢复标记，锁定状态、剧本、版本及归档写入；刷新后继续只读核实。发起状态更新前会先确认剧本自动保存完成。

### 技术升级

- 无新增 API 路由、数据库迁移或权限授予。

### 验证

- 类型检查、目标 ESLint、成片工作流回归、抖音逐条编辑范围测试、版本/文档治理、测试入口、Android runtime 合同、差异检查及生产构建结果见 `docs/UPGRADE_PROGRESS.md`。Playwright MCP 与 Chrome DevTools MCP 隔离页面验证三种状态恢复路径；仓库浏览器自动化因 macOS Chromium 启动权限未进入测试体。本地修改，不提交、推送或部署。

## v9.2.84 - 2026-10-20

### 修复

- 成片制作计划创建使用服务端原子幂等请求编号；响应不明时先只读核实，明确未创建后只能用原编号安全重试，避免产生重复计划。
- 创建状态读取失败时保留原表单与请求编号、暂停本页写入，并在刷新后继续只读恢复；原计划删除后保留终止墓碑，迟到重试不会重新创建。

### 技术升级

- 新增 SAFE_EXPAND 数据库迁移 036 和仅创建者可读取的请求状态接口；无新增角色权限。

### 验证

- 创建幂等 API、迁移、迁移就绪、成片工作流回归、抖音逐条权限范围、类型检查、版本/更新说明治理（428 个版本）、243 个测试入口、Android runtime 合同、差异检查与生产构建通过。Playwright MCP 和 Chrome DevTools MCP 手动隔离验收通过；仓库 Playwright 自动化因 Chromium `bootstrap_check_in … Permission denied (1100)` 在测试体前启动失败，未计自动化通过。本地修改，不提交、推送或部署。

## v9.2.83 - 2026-10-20

### 修复

- 成片制作完成操作响应不明确时只读核实服务端状态；确认已完成不重发，仍未完成时由用户重新确认，暂时无法读取时暂停本页写入并支持刷新恢复。

### 技术升级

- 无新增 API 路由、数据库迁移或权限规则。

## v9.2.82 - 2026-10-20

### 修复

- 成片制作删除响应不明确时先只读核实服务器记录；已删除不重发，仍存在时由用户重新确认，详情读取失败会暂停本页写入并支持刷新恢复。

### 优化

- 制作计划的删除按钮增加具体记录名称，便于辅助技术识别操作对象。

### 验证

- `npm run check -- --pretty false`、目标 ESLint、版本检查/治理、更新说明治理（426 个版本）、Android runtime 合同、测试入口（240 个）、`git diff --check` 和生产构建通过。Playwright MCP 隔离夹具实测删除已确认、记录仍存在和刷新后只读恢复三条路径；Chrome DevTools MCP 复核不确定结果锁写与刷新恢复。仓库 Chromium 因 macOS `bootstrap_check_in … Permission denied (1100)` 未启动，未进入自动化测试体；构建保留既有 >500 kB 分包提示。本地修改，不提交、推送或部署。

## v9.2.81 - 2026-10-20

### 修复

- Creator Agent 的旧格式与标准协议同步后，抖音自动关联统一遵循账号所属用户的逐条编辑范围。
- 无权编辑的发布稿件不会被自动关联，也不会因此推进选题状态；手动全库刷新仍受全局编辑者权限约束。

### 验证

- 旧格式与 2.10.2 标准协议自动同步范围回归、`npm run test:publishing-douyin-link`、类型检查、目标 ESLint（0 错误）、版本/更新说明治理（425 个版本）、239 个测试入口、Android runtime 合同、`git diff --check` 及生产构建通过；构建保留既有 >500 kB 分包警告。本地修改，不提交、推送或部署。

## v9.2.80 - 2026-10-20

### 优化

- 编辑器右键菜单的复制、剪切和粘贴操作显示实际结果；成功给出确认，失败时提示浏览器限制和替代操作。
- 剪切失败明确说明正文变更未获确认，避免用户以为剪切已经完成。

### 验证

- 类型检查、`npm run test:publishing-douyin-link`、目标 ESLint（0 错误、12 条既有警告）、版本/更新说明治理（424 个版本）、239 个测试入口、Android runtime 合同、`git diff --check` 和生产构建通过。Playwright MCP 与 Chrome DevTools MCP 隔离页面验证剪贴板反馈成功/失败路径；仓库浏览器自动化受 macOS Chromium 权限限制，未进入测试体。构建保留既有 >500 kB 分包警告。Android 仅同步元数据至 9.2.80/90280，未构建 APK。本地不提交、推送或部署。

## v9.2.79 - 2026-10-20

### 修复与优化

- 抖音批量自动关联遵循逐条编辑范围：只匹配本人创建、负责或作为发布参与者的记录；范围外不写入、不计数，全局编辑者仍可全量刷新。
- 命令面板关闭后将焦点还给打开前仍有效的控件；保留打开时聚焦搜索框，并补键盘导航、激活和焦点恢复回归。

### 验证

- `npm run check -- --pretty false`、`npm run test:publishing-douyin-link`、目标 ESLint、版本/更新说明治理、测试入口、Android runtime 合同、`git diff --check` 与生产构建通过；Chrome DevTools MCP 实测 1440px 命令面板焦点可见、上下键边界、Enter 打开日报与 Ctrl+K/Escape 焦点恢复，控制台无错误。仓库 `npm run test:global-search-browser` 因 macOS Chromium `bootstrap_check_in … Permission denied (1100)` 未进入测试体。Android 仅同步元数据至 9.2.79/90279，未构建 APK。本地不提交、推送或部署。

## v9.2.78 - 2026-10-20

### 修复

- 移动首页复盘摘要读取失败时仍显示“复盘”阶段及未知数量，不再隐藏该阶段或误报为空。
- 复盘摘要提供单独的只读重试；成功后恢复准确数量与预览。
- 抖音关联成功但发布归档同步失败时返回待同步数量，发布页提示部分完成并引导到已有归档重试入口。

### 验证

- `npm run check -- --pretty false`、首页与抖音关联 API 测试、目标 ESLint、版本检查/治理、更新说明治理（422 个版本）、239 个测试入口、Android runtime 合同、`git diff --check` 与生产构建通过，构建保留 >500 kB 分包提示。Playwright MCP 与 Chrome DevTools MCP 在 390×844 隔离页面注入首页摘要失败，确认阶段保留、明确提示并可恢复；重试请求为 GET，恢复后显示复盘预览。Playwright MCP 在 1200px 隔离发布页确认归档部分失败警告与详情页重试指引。页面无横向溢出、控制台无错误；仓库 Playwright 因 macOS Chromium `bootstrap_check_in … Permission denied (1100)` 未进入测试体。Android 仅同步元数据至 9.2.78/90278，未构建 APK。本地不提交、推送或部署。

## v9.2.77 - 2026-10-20

### 修复

- 手工关联或解除抖音作品响应不明时，按发布记录详情只读核实真实绑定状态，避免已提交操作被重复发送。
- 状态读取失败时保存当前账号的标签会话恢复标记并暂停发布页写入；确认仍为原状态后仅由用户明确手动重试。

### 验证

- `npm run check -- --pretty false`、目标 ESLint、`npm run test:publishing-douyin-link`、版本检查/治理、更新说明治理（421 个版本）、239 个测试入口、Android runtime 合同、只读迁移检查（GO）、`git diff --check` 和生产构建通过。构建保留 >500 kB 分包提示（Tiptap 555.12 kB、主入口 681.83 kB、Silk 843.50 kB）。Chrome DevTools MCP 隔离页面 390×844 验证提交后异常的解除操作仅发送一次 PUT、刷新后只读确认；未提交关联需用户手动重试。仓库 Chromium 自动化因 macOS `bootstrap_check_in … Permission denied (1100)` 未进入测试体。本地不提交、推送或部署。

## v9.2.76 - 2026-10-20

### 修复

- 发布详情的剧本保存或小/大版本保存遇响应异常时，读取服务端正文与版本历史核实结果；已提交不会重复保存/创建版本，确认未提交则恢复原草稿供用户手动决定。
- 若状态读取失败，将恢复信息保存在当前账号的标签会话并锁定剧本编辑、保存和离开；刷新后继续只读核实。

### 验证

- `npm run check -- --pretty false`、目标 ESLint、剧本来源集成/迁移测试、官方日期窗口（3 项）与统一报告、版本检查/治理、更新说明治理（420 个版本）、239 个测试入口、Android runtime 合同、迁移就绪检查（只读 GO）、`git diff --check` 和生产构建通过。官方日期窗口已按北京时间及包含当天的规则复验。构建保留 >500 kB 分包提示（Tiptap 555.12 kB、主入口 681.33 kB、Silk 843.50 kB）。Chrome DevTools MCP 390×844 隔离页恢复实测通过；仓库 Chromium 自动化受 macOS `bootstrap_check_in … Permission denied (1100)` 阻挡，未进入测试体。本地不提交、推送或部署。

## v9.2.75 - 2026-10-20

### 修复

- 发布记录更新响应不明时先只读核实；服务器确认已更新不会再次提交，未更新则恢复原编辑草稿并要求用户明确手动重试。状态读取失败时保留恢复标记并暂停发布页写入，刷新后继续只读核实。
- 发布记录日期输入按数据库中的北京时间自然日恢复为 `YYYY-MM-DD`，避免服务端时间戳直接填入日期控件时出现空值。

### 口径

- 官方数据窗口按北京时间自然日；“昨天”为采集日前一日，近 7 天和近 30 天均包含采集当天。此既有口径经边界回归复验，本项不改日期算法。

### 验证

- `npm run check -- --pretty false`、目标 ESLint、发布创建幂等/迁移、抖音关联/发布指标、官方日期窗口/统一报告、版本检查与治理、更新说明治理（419 个版本）、239 个测试入口、Android runtime 合同、迁移就绪检查（GO）、差异检查和生产构建通过。生产构建保留既有 >500 kB 分包提示（Tiptap 555.12 kB、主入口 680.79 kB、Silk 843.50 kB）。Chrome DevTools MCP 390×844 隔离页面恢复流程通过；仓库 Chromium 自动化受 macOS `bootstrap_check_in … Permission denied (1100)` 阻挡，未进入测试体。本地修改，不提交、推送或部署。

## v9.2.74 - 2026-10-20

### 修复

- 发布记录创建通过同一请求编号实现服务端原子幂等；响应丢失后重试返回原记录，不会重复创建，已删除记录也不会被迟到重试复活。

### 优化

- 创建结果不明时先只读核实；核实也失败则在当前标签会话保留原请求并暂停发布页写入，刷新后继续 GET。确认尚未创建后，用户只能使用同一编号安全重试。

### 验证

- 类型检查、定向 ESLint（0 错误，`workflow.ts` 12 条既有警告）、定向 API 与迁移回归、现有发布关联/指标测试、版本检查/治理、更新说明治理（418 个版本）、239 个测试入口、Android runtime 合同、迁移就绪检查（GO）、差异检查和生产构建通过；构建保留既有 >500 kB 分包警告。Chrome DevTools MCP 390×844 合成页面恢复实测通过。仓库 Chromium 自动化因 macOS `bootstrap_check_in … Permission denied (1100)` 未进入测试体。本地修改，不提交、推送或部署。

## v9.2.73 - 2026-10-20

### 修复

- 发布记录删除返回异常或超时后，按记录编号只读核实服务器状态；服务端仍存在时不自动重删，服务端已删除时也不会重复发送 DELETE。
- 状态无法读取时将待核实编号保存在当前账号的标签会话中，刷新后继续只读核实，并暂停当前发布页面的写入操作。

### 验证

- 类型检查、目标 ESLint、版本检查/治理、更新说明治理（417 个版本）、237 个测试入口、Android runtime 合同、差异检查和生产构建通过；仓库 Playwright 自动化受 macOS Chromium 启动权限限制，未进入测试体。Chrome DevTools MCP 在 390×844 实测仍存在、服务端已删除但响应丢失、首次核实失败、刷新后 GET 404 恢复及不重复 DELETE；页面宽度 390px，无横向溢出。本地 API/Socket 后端未启动时的连接错误不代表业务 API 验收。本地修改，不提交、推送或部署。

## v9.2.72 - 2026-10-20

### 修复

- React Bits 外观/交互动效的包装层现在继承按钮明确声明的全宽尺寸；修复手机首页两列快捷操作被缩成文字宽度的问题。

### 验证

- `npm run check -- --pretty false`、目标 ESLint、`npm run test:home-dashboard`、版本检查/治理、更新说明唯一性（416 个版本）、237 个测试入口、Android runtime 合同、差异检查和生产构建通过；构建保留既有 >500 kB 分包提示（SilkBackgroundAdapter 843.50 kB）。Chrome DevTools MCP 合成账号在 390×844、320×844 暗色视口确认四个快捷操作分别铺满 173px/138px 网格单元、无横向溢出；展开“最近变化”及进入灵感池成功，无业务写入。仓库 Playwright 在 macOS Chromium `bootstrap_check_in … Permission denied (1100)` 时未进入测试体；本地控制台的错误/重试来自未启动的 Socket.IO 后端。Android 仅同步版本元数据至 9.2.72/90272，未构建 APK。本地修改，不提交、推送或部署。

## v9.2.71 - 2026-10-20

### 修复

- 角色创建遇到网络错误、超时、限流或服务端异常时进入只读核实并暂停所有角色写入；状态按当前账号保存在标签会话中，刷新后仍可恢复，不会自动重发。
- 按数据库已有唯一角色编码读取服务器列表：创建已确认时只更新页面；暂未找到时恢复原表单供用户手动重试；发现同编码但资料不同则保留锁定并展示服务器当前值。
- 角色删除遇到结果不明时按角色编号只读核实；服务端已删除则清理页面并结束恢复，仍存在则展示权威状态并要求用户明确重新发起，避免重复删除。

### 验证

- `npm run check -- --pretty false`、目标 ESLint、`npm run version:check`、版本治理、更新说明唯一性（415 个版本）、237 个测试入口、Android runtime 合同、`git diff --check` 及生产构建均通过；构建保留 >500 kB 分包提示（SilkBackgroundAdapter 843.50 kB）。Chrome DevTools MCP 本地隔离页面在 390×844 覆盖角色创建已提交但 POST/首次 GET 失败后刷新只读确认、确认缺失后恢复表单人工重试，以及角色删除已提交但 DELETE/首次 GET 失败后刷新读回 404；手动安全重试最多产生一条角色记录，未确认期间写操作锁定。仓库 Chromium 自动化在 `bootstrap_check_in … Permission denied (1100)` 下未进入测试体；隔离前端未启动 Socket.IO 后端，页面有该测试环境的连接错误。
- Android 仅同步版本元数据至 9.2.71/90271，未构建 APK。本地修改，不提交、推送或部署。

## v9.2.70 - 2026-10-20

### 修复

- 角色权限更新响应异常时按角色编号只读核实；服务端状态未确认前暂停全部角色写入，刷新后仍可恢复，确认过程不重复发送更新。

### 优化

- 提升拍摄剧本历史说明、空状态和版本信息的明暗主题可读性，并为历史文本补充 4.5:1 对比度回归。
- 将相关浏览器缩放回归改为设置等效 CSS 布局视口，覆盖工作流详情、发布归档、选题阶段与创作评审布局。

### 验证

- 类型检查、目标 ESLint、版本检查/治理、更新说明唯一性（414 个版本）、237 个测试入口、Android runtime 合同、差异检查及生产构建通过；构建保留既有 843.50 kB SilkBackgroundAdapter 分包提示。Chrome DevTools MCP 隔离页面验证角色更新响应丢失、只读读取失败、刷新恢复与最终确认，以及剧本历史明暗主题对比度（最低约 7:1）；390×844 手机、1440×900 桌面无横向溢出且控制台无警告/错误，手动保存后历史记录正确出现。Chromium 自动化因 macOS `bootstrap_check_in … Permission denied (1100)` 在测试体前无法启动；WebKit 自动化也在启动阶段异常退出，不计为通过。Android 仅同步版本元数据至 9.2.70/90270，未构建 APK。本地修改，不提交、推送或部署。

## v9.2.69 - 2026-10-20

- 人员启停结果不明确时增加按用户编号只读核实；核实不可用时暂停重复操作及其他人员修改，确认后刷新列表且不重发 PUT。
- 首页创作阶段为已通过待开工选题同时展示阶段停留时间；缺失、非法或未来时间保留“阶段时间待确认”。生产评审缩放回归改为测试等效 CSS 布局视口，不再通过根 CSS zoom 假装原生缩放。
- 用户确认官方日期窗口均按北京时间自然日；昨天取采集日前一日，近 7/30 天包含采集当天，相关官方导出/报表回归通过。类型检查、目标 ESLint、首页摘要、237 个测试入口、版本治理及生产构建通过；Chrome DevTools MCP 隔离夹具实测用户状态只读恢复、编辑器窄视口菜单及桌面/移动首页，仓库 Playwright 浏览器脚本被 macOS Chromium 权限拦截在测试体前。本地修改，不提交、推送或部署；Android 仅同步元数据至 90269，未构建 APK。

## v9.2.68 - 2026-10-20

- 灵感创建增加客户端请求编号和服务端原子幂等账本；提交结果不明确时先只读核实，刷新后可恢复原表单并核实，不会重复创建。原记录已删除时保留请求墓碑，防止延迟重试将其重新创建。
- 日期窗口按用户确认的北京时间自然日验证：“昨天”为采集日前一日，近 7 天/近 30 天包含当天；补充跨 UTC 午夜边界与未来日期拒绝测试。
- 迁移/接口与旧评论回归、类型检查、目标 ESLint、版本/文档治理、测试入口和生产构建通过；Chrome DevTools MCP 隔离夹具验证已写入但 POST/首读均失败、刷新后只读恢复，列表只有一条灵感且未重复 POST。仓库 Playwright 因 macOS Chromium `bootstrap_check_in … Permission denied (1100)` 在测试体前失败，不计自动化通过。本地修改，不提交、推送或部署；Android 仅同步元数据至 90268，未构建 APK。

## v9.2.67 - 2026-10-20

- 灵感评论新增客户端请求编号与服务端唯一约束；相同请求重放返回原评论，不会重复创建。评论已提交但响应丢失时先只读核实；核实暂不可用则锁住再次提交，并在当前浏览器会话保留请求编号和草稿，刷新/重开详情后继续恢复。
- 类型检查、目标 ESLint、评论幂等迁移与服务端原子性回归、迁移门禁、版本/文档治理、测试入口与生产构建通过；Chrome DevTools MCP 隔离夹具验证失败安全重试、请求编号复用、已提交但响应和首读均失败、刷新恢复及只读确认，确认恢复前没有第二次 POST。仓库 Playwright 因 macOS Chromium `bootstrap_check_in … Permission denied (1100)` 在测试体前失败，不计自动化通过。本地修改，不提交、推送或部署；Android 仅同步元数据至 90267，未构建 APK。

## v9.2.66 - 2026-10-20

- 灵感点赞和“转为选题”遇到异常响应时，先只读核实服务器结果；已成功的点赞同步状态，已创建的选题直接打开；结果仍不明时暂停重复操作并提供只读核实入口。
- 类型检查、目标 ESLint、生产构建、Android runtime 与灵感服务端合同测试、版本治理、410 个更新说明版本唯一性、235 个测试入口和差异检查通过；构建保留既有最大 843.50 kB 分包提示。Chrome DevTools MCP 隔离夹具验证点赞写入与选题转化已提交但响应丢失、首次读回失败、只读恢复；均未重复写入。仓库 Playwright 因 macOS Chromium `bootstrap_check_in … Permission denied (1100)` 在测试体前失败，不计自动化通过。本地修改，不提交、推送或部署；Android 仅同步元数据至 90266，未构建 APK。
- 官方导出契约、数据新鲜度及统一报表三套回归通过：昨天按北京时间采集日前一自然日计算；近 7/30 天为连续自然日并包含采集日；不合法、未来或错窗日期仍拒绝。本轮未改日期逻辑。

## v9.2.65 - 2026-10-20

- 用户删除成功后重新读取当前列表；若读取失败，明确提示删除已完成并提供仅重试读取的入口，避免重复提交删除。
- 类型检查、目标 ESLint、生产构建、Android runtime 合同、235 个测试入口及版本/更新说明治理（409 个版本）通过；构建保留既有 SilkBackgroundAdapter 843.50 kB 分包提示。Playwright MCP 隔离页面验证删除恢复和单次删除。仓库 Playwright 自动化因 macOS Chromium 启动权限在测试体前失败。官方日期窗口按北京时间且包含当天，本版本不改日期逻辑。本地修改，不提交、推送或部署；Android 仅同步元数据至 90265，未构建 APK。

## v9.2.64 - 2026-10-20

### 优化

- 手机工作台明确展示进行中选题总数与最近预览条数，并区分团队/个人权限范围；总数非零但预览缺失时不再误报没有选题。
- 最近选题入口统一使用共享按钮组件。

### 验证

- 类型检查、目标 ESLint、首页摘要 API 测试通过；Chrome DevTools MCP 在隔离数据中实测团队和个人范围的准确计数、总数非零但预览缺失时的提示，以及“查看全部”进入选题列表。
- `npm run build`、版本检查/治理、更新说明唯一性（408 个版本）、235 个测试入口、Android runtime 合同和差异检查通过；构建保留既有 SilkBackgroundAdapter 843.50 kB 分包提示。仓库 Playwright 自动化未运行，不能把手工 MCP 验收计作自动套件通过；Chrome DevTools MCP 隔离页在 390px 浅色、320px 暗色和个人/团队范围验证计数与选题跳转，页面无溢出、控制台无错误。本地修改，不提交、推送或部署；Android 仅同步元数据至 9.2.64/90264，未构建 APK。

## v9.2.63 - 2026-10-20

- 桌面首页“审核稿件”待办现在直达当前稿件审核动作；仅在服务端标记可操作、具备 `production:update` 且当前版本仍待审时聚焦“审核通过”。跳转参数只用一次，不会因打开任务自动审批。
- 桌面稿件详情区分正文编辑与稿件审核权限：只读审核者仍不能编辑正文，但可明确点击审批；审批使用已读取正文和 `expected_content`，并保留服务端权限及版本冲突保护。
- 类型检查、目标 ESLint、首页摘要 API、创作审核 API、版本治理、更新说明治理（407 个版本）、235 个测试入口、Android runtime 合同、版本检查、生产构建与差异检查通过；构建保留既有 843.50 kB Silk 分包提示。仓库 Playwright 因 macOS Chromium `bootstrap_check_in … Permission denied (1100)` 在测试体前退出；Playwright MCP/Chrome DevTools 隔离夹具 1440×960 实测授权直达、焦点、只读正文、无自动写入、单次审批及无权限边界，控制台错误为 0。Android 仅同步元数据至 9.2.63/90263，未构建 APK。本地修改，不提交、推送或部署。

## v9.2.62 - 2026-10-20

- 桌面端选题状态筛选变更后同步更新 `status` 地址参数，清除筛选会移除参数；列表/看板切换后刷新仍保留所选条件。
- 手机网页选题的待审核、创作阶段使用 `status` 参数；“我的”“进行中”通过 `topic_filter` 保留，切换“全部”会清除筛选参数；筛选按钮补充当前选中状态语义。
- 类型检查、目标 ESLint、选题 API 回归、版本/更新说明治理与差异检查通过。仓库 Playwright 因 macOS Chromium `bootstrap_check_in … Permission denied (1100)` 未进入测试体；Playwright MCP/Chrome DevTools 隔离夹具在 1440×960 与 390×844 实测筛选变更、刷新保持和清除条件，手机页面无横向溢出；控制台检查无应用错误。Android 仅同步元数据至 9.2.62/90262，未构建 APK。本地修改，不提交、推送或部署。

## v9.2.61 - 2026-10-20

- 清单 G 的内容流现在把“已通过、待开始创作”与“创作中”纳入同一个创作阶段，阶段数量与三条预览都覆盖两种真实状态，并清楚标注已通过选题。
- 工作台阶段入口使用联合筛选；桌面列表/看板、移动网页列表均可同时查看已通过与创作中选题，实际状态与状态操作保持原样。
- 类型检查、目标 ESLint、首页摘要 API、选题 API/查询合同、OpenAPI 合同、版本/更新说明治理、235 个测试入口检查、Android runtime 合同、生产构建及差异格式检查通过；构建保留既有 843.50 kB Silk 分包提示。Chrome Playwright MCP 隔离夹具在桌面和手机网页实测阶段预览、联合筛选及看板；控制台 0 错误、1 条既有 React Bits `magic-bento` 安全回退提示。本轮仓库自动化未执行；Android 仅同步元数据至 9.2.61/90261，未构建 APK。本地修改，不提交、推送或部署。

## v9.2.60 - 2026-10-20

- 补齐清单 G 创作者首页桌面端稿件保存状态：桌面与手机网页复用按账号隔离的保存提示，只有同账号的服务端保存确认才显示“本次会话已确认保存”；协作同步本身不会冒充保存成功。
- 将提示改为订阅最新编辑事件，连续保存事件即使归约到相同状态也会即时更新；浏览器回归覆盖跨账号事件、协作同步事件及保存确认。
- 类型检查、定向 ESLint、首页摘要 API 测试通过。Playwright MCP 隔离夹具手动验证 1440×960 桌面和 390×844 手机网页及真实渲染状态，控制台无错误/警告、手机无横向溢出；仓库自动化因 macOS Chromium `bootstrap_check_in … Permission denied (1100)` 未进入测试体。Android 仅同步元数据至 9.2.60/90260，未构建 APK；本地修改，不提交、推送或部署。

## v9.2.59 - 2026-10-19

- 清单 G 创作者首页补齐“写两句”快捷入口：桌面直达已有创作新建弹窗，手机网页直达新稿编辑器。
- 入口仅在已有 `production:update` 权限下显示；桌面一次性导航参数完成权限确认后清除，手机原生 Android 不增加此网页入口。
- 浏览器回归覆盖桌面弹窗、手机编辑器跳转及账号切换后的权限收敛；类型检查、定向 ESLint 和首页摘要 API 测试通过。仓库 Playwright 因 macOS Chromium 启动权限在测试体前失败，不计自动化通过；Chrome DevTools MCP 隔离夹具实测两端跳转。Android 仅同步元数据至 9.2.59/90259，未构建 APK。本地修改，不提交、推送或部署。

## v9.2.58 - 2026-10-19

- 手机网页首页“待审核稿件”现在直接打开当前稿件的审核动作，底部可执行“审核通过”，并可返回工作台。
- 审批前等待编辑器正文保存确认；离线、保存失败/冲突或超时不发送审批。任务已不再待审时显示当前状态、关闭编辑并隐藏可能误用的提交/审批操作。
- 浏览器回归覆盖首页直达、单次审批写入、完成后只读和无权限拒绝。类型检查、全仓 lint（0 错误/290 警告）、生产构建、版本治理、更新说明治理（402 个版本）和 Android 生产端点契约通过；保留既有 843.50 kB Silk 分包提示。
- Chrome DevTools MCP 390×844 隔离夹具确认审批 payload、已通过状态、待办过期后只读及无权限拒绝；仓库 Playwright 因 macOS Chromium `bootstrap_check_in … Permission denied (1100)` 在测试体前退出，不计自动化通过。Android 构建产物集成测试因缺少 Android 专用 `dist/xmt-mobile-build.json` 未完成；未执行 Android 构建/同步。
- Android 仅同步元数据至 9.2.58/90258，未构建 APK；本地修改，不提交、推送或部署。

## v9.2.57 - 2026-10-19

- 修复手机网页首页“开始审核”直达选题详情后仍要再次点击“开始审核”的问题；权限确认且选题仍待审时自动展开审核面板。
- 直达只展开操作区、不自动提交；权限不足或选题状态已变化时不显示审核操作，并移除一次性导航参数。
- 增加有权限直达与无权限手机页面回归。类型、全仓 lint（0 错误/290 警告）、版本与更新说明治理、测试入口、Studio token、Android runtime 合同、官方数据窗口测试及生产构建通过；保留既有 843.50 kB Silk 分包提示。仓库 Playwright 因 macOS Chromium 启动权限未进入测试体，Chrome DevTools MCP 已在 390×844 隔离夹具验证面板展开、参数清除及只读边界。
- Android 仅同步版本元数据至 9.2.57/90257，未构建 APK；本地修改，不提交、推送或部署。

## v9.2.56 - 2026-10-19

- 手机网页首页新增“记灵感”快捷入口，直接打开现有灵感页，减少记录想法的跳转步骤。
- 入口仅显示于响应式网页，原生 Android 首页保持不变；新增 390px Home 集成回归。
- 类型、全仓 lint、版本治理、更新说明治理、Studio token、Android runtime 合同与生产构建通过。Playwright 自动化受 macOS Chromium 启动权限阻断；Chrome DevTools MCP 实测手机网页首页快捷入口可见且可打开灵感页。
- Android 仅同步元数据至 9.2.56/90256，未构建 APK；本地修改，不提交、推送或部署。

## v9.2.55 - 2026-10-19

- 首页顶部新增紧凑公告条，显示置顶/最新公告；展开后复用现有公告板及原有权限、创建与删除确认流程。
- 公告条覆盖桌面与响应式手机网页首页；原生 Android 首页保持不变，并补充 390px 手机网页呈现回归。
- 公告读取失败提供独立只读重试，不再把失败误显示为空；新增 320px、扩展/收起和只读用户权限回归。
- 首页可执行卡点任务直接显示负责人或“待认领”和截止日期，负责信息使用次级文字令牌以满足亮/暗主题正文对比度。
- 类型检查、全仓 lint（0 错误/290 警告）、版本与更新说明治理（399 个版本）、Studio token（38 类）、Android runtime 合同及生产构建通过；保留既有最大 843.50 kB Silk 分包提示。Playwright 自动化因 macOS Chromium 启动权限未进入测试体；Chrome DevTools MCP 手动验证 320px 公告条重试、展开/收起及只读权限边界，以及 390×844 实际 Home 页面无横向溢出；真实 Home 隔离页明/暗主题对比度分别为 7.45:1 / 8.29:1。
- Android 仅同步元数据至 9.2.55/90255，未构建 APK；本地修改，不提交、推送或部署。

## v9.2.54 - 2026-10-19

- 工作台近 7 天播放变化标注按北京时间自然日统计并包含当天；指标标签与来源说明改用 Studio 次级文字。
- 首页回归覆盖统计窗口口径及亮/暗主题对比度；类型、首页摘要、创作者数据新鲜度/官方导出/统一报表、版本/更新说明治理、测试入口、Studio token 和 Android runtime 检查通过。全仓 lint 0 错误/290 警告，生产构建通过并保留既有 843.50 kB 分包提示。
- 仓库浏览器自动化因 macOS Chromium 启动权限未进入测试体，不计通过。
- Android 仅同步版本元数据至 9.2.54/90254，未构建 APK；无 API、权限、数据库或真实业务数据变化。本地修改，不提交、推送或部署。

## v9.2.53 - 2026-10-19

- 修复报告中心周报、数据导出页普通说明文字在暗色主题下的低对比问题，并将周报/导出分区标题整理为连续层级。
- 报告中心新增标题顺序和普通说明令牌回归断言；Chrome DevTools MCP 隔离样例复核 320px 暗色周报失败态与导出页、390px 亮色周报成功态与导出页，Lighthouse Accessibility、Best Practices、SEO 均 100，无横向溢出。
- Android 仅同步版本元数据至 9.2.53/90253，未构建 APK；无 API、权限、数据库或真实业务数据变化。本地修改，不提交、推送或部署。

## v9.2.52 - 2026-10-19

- 修复数据复盘及协作热力图 8 处暗色主题普通文字对比度不足，改用 Studio 次级文字令牌；分区标题从 h3 调整为 h2，页面标题层级连续。
- 新增数据复盘标题顺序与普通说明令牌回归断言。Chrome DevTools MCP 隔离样例下 320px 暗色、390px 亮色和 1440px 亮色 Lighthouse Accessibility、Best Practices、SEO 均 100，视口无横向溢出、控制台无错误。仓库 Playwright 因 macOS Chromium 权限在测试体前失败，不计自动化通过。
- Android 仅同步版本元数据至 9.2.52/90252，未构建 APK；无 API、权限、数据库或真实业务数据变化。本地修改，不提交、推送或部署。

## v9.2.51 - 2026-10-19

- 创作者作品库、作品详情和运营概览的普通说明统一使用 Studio 次级文字令牌，修复明暗主题下的低对比文字；作品评分在亮色主题达到正文对比要求。
- 修复运营概览资料卡跳级标题及按钮名称不匹配问题，补充作品库/详情/概览对比度、标题顺序和窄屏回归断言。
- Chrome DevTools MCP 隔离夹具实测运营概览 320px 暗色、390px 亮色和 1440px 亮色 Lighthouse Accessibility、Best Practices、SEO 均为 100；作品详情 320px 暗色同样为 100。仓库 Playwright 仍受 macOS Chromium 启动权限阻断，未进入测试体，不计自动化通过。本地修改，不提交、推送或部署；Android 仅同步元数据至 9.2.51/90251，未构建 APK。

## v9.2.50 - 2026-10-19

- 修复趋势页周期切换按钮、周期合计及趋势数据说明在暗色主题下的低对比度，全部普通说明改用 Studio 次级文字令牌。
- 趋势页回归增加普通文案对比度断言，覆盖 1440px 桌面、390/320px 移动暗色及 390px 亮色；Chrome DevTools MCP 隔离页复测 320px 暗色、390px 亮色 Lighthouse Accessibility、Best Practices、SEO 均为 100，无横向溢出或控制台错误。
- Playwright 自动化尝试因 macOS Chromium `bootstrap_check_in … Permission denied (1100)` 未进入测试体；MCP 手动交叉验收不计为自动化通过。Android 仅同步元数据至 9.2.50/90250，未构建 APK。本地修改，不提交、推送或部署。

## v9.2.49 - 2026-10-19

- 创作者报告页普通说明、指标标签、统计区间、异常状态及作品元信息统一使用 Studio 次级文字，修复暗色主题下 22 处 3.87–4.23:1 的低对比度。
- 新增普通报告文案明暗主题对比度断言；Chrome DevTools MCP 隔离页实测修复后暗色最小 7.57:1，320px 暗色与 390px 亮色 Lighthouse Accessibility、Best Practices、SEO 均为 100，无横向溢出或控制台错误。
- 类型检查、全仓 lint（0 错误/292 警告）、生产构建、版本/更新说明治理（393 个版本）、测试入口（234 个文件）、Studio token（38 类）、Android runtime 与官方数据回归均通过；构建保留既有最大 843.50 kB Silk 分包提示。仓库 Playwright 自动化尝试受 macOS Chromium `bootstrap_check_in … Permission denied (1100)` 阻断，未进入测试体；MCP 手动交叉验收不计为自动化通过。Android 仅同步元数据至 9.2.49/90249，未构建 APK。本地修改，不提交、推送或部署。

## v9.2.48 - 2026-10-19

- 创作者日报、周报、月报中的周期发布作品数现在按北京时间闭区间筛选；日报只包含昨天，近 7/30 天含窗口末日，窗口外及未来作品不再混入。
- 修复期初基线日被多计入发布作品的问题；新增跨北京时间午夜的日报、周报、月报起止边界回归。
- `test:creator-unified-reports`、`test:creator-dashboard-freshness`、`test:official-export-v2`、类型检查、全仓 lint（0 错误/292 警告）、生产构建与版本治理通过；构建保留既有 >500 kB 分包提示（最大 843.50 kB）。无数据库结构变化、无真实业务数据读写；Android 仅同步版本元数据至 9.2.48/90248，未构建 APK。本地修改，不提交、推送或部署。

## v9.2.47 - 2026-10-19

- 移动选题列表负责人、截止日期，以及详情页状态/资料/维度说明、空状态和协作备注改用 Studio 次级文字；暗色主题对比度由 4.08:1 提升到 8.01–8.89:1，亮色主题为 7.00–7.58:1。
- 移动选题标题/说明输入框补齐稳定的 `id/name`；列表加载/空结果态也改用次级文字，新增 320/390px 明暗主题空状态对比度与窄屏回归。
- 桌面选题页指标标签、筛选提示、表格表头、行内元信息和分页文字改用 Studio 次级文字；暗色实测由 3.83–4.22:1 提升至 7.52–8.29:1，亮色为 6.74–7.58:1，1366px 下操作入口可见且无横向溢出。
- 选题看板的显示总量、列计数、负责人、截止日期、空列和加载提示统一改为 Studio 次级文字；修复后 Chrome DevTools MCP 实测 390px 明暗主题普通文字最低 6.74:1/7.52:1、无横向溢出，暗色低对比项由 3.83–4.22:1 提升。增加桌面明暗主题与移动看板回归。
- Chrome DevTools MCP 隔离夹具实测列表→详情、明暗主题、表单字段和无横向溢出，最终页面控制台错误为 0。仓库 Playwright 自动化因 macOS Chromium `bootstrap_check_in … Permission denied (1100)` 未进入测试体。
- 桌面实测控制台无错误；仅有 reduced-motion 模拟器提示及 React Bits 安全 fallback 提示。
- 类型检查、移动布局测试、全仓 lint（0 错误/292 条既有警告）、生产构建通过；构建保留既有最大 843.50 kB Silk 分包提示。Android 仅同步元数据至 9.2.47/90247，未构建 APK；本地修改，不提交、推送或部署。

## v9.2.46 - 2026-10-19

- 资料删除响应不明时只读核对服务端状态；状态暂不可读时锁定编辑/删除入口，避免重复软删除。
- 已移入回收站的资料在列表中明确标记，在资料详情中保持只读；隔离浏览器回归覆盖列表删除未提交后的只读恢复，以及详情删除已提交但响应丢失、首次核实失败后的回收状态确认。320px 无横向溢出；仓库 Chromium 自动化在 macOS 启动权限检查处失败，未进入测试体。
- 类型检查、目标 ESLint、资源中心 mutation/category 测试、全仓 lint（0 错误/292 条警告）、生产构建及版本治理通过；构建保留既有最大 843.50 kB Silk 分包提示。
- 用户确认日期统一按北京时间；昨天为前一自然日，近 7/30 天包含当天。Android 仅同步版本元数据至 90246，未构建 APK；本地修改，不提交、推送或部署。

## v9.2.45 - 2026-10-19

- 创作者运营报告生成或删除响应异常时改为只读核对报告历史；按运营账号保存待核实状态，刷新页面后仍锁定生成和删除，用户核对并明确确认后才解除保护。
- 已确认报告生成但列表刷新失败时按账号持久化锁定后续报告写入，成功只读重读后自动解除；删除结果不明时也先核对当前列表，避免旧状态下重复操作。
- 隔离浏览器回归覆盖“服务端已生成、响应丢失、首次核实读取失败、只读恢复、页面重载保留锁定、用户确认”完整路径；无真实报告写入。
- Android 仅同步版本元数据至 90245，未构建 APK；本地修改，不提交、推送或部署。

## v9.2.44 - 2026-10-19

- 备份管理页改用 Studio Atelier 页面壳、指标卡、按钮与状态样式，补齐 320/390/768/1440px 和双主题响应式回归。
- 服务端已确认备份创建、但清单读回失败时，暂时锁定再次创建；成功重新读取后恢复操作，防止重复备份。
- 隔离浏览器检查确认页面不显示 SQLite 引擎或绝对目录路径；仅使用虚构备份样例，无真实备份读写。仓库 Chromium 自动化因 macOS 启动权限拒绝未进入测试体，不计通过。
- Android 仅同步版本元数据至 90244，未构建 APK；本地修改，不提交、推送或部署。

## v9.2.43 - 2026-10-19

- 设置中心“关于系统”品牌说明改用 Studio 次级正文令牌，暗色主题对比度由 4.53:1 提升至 8.89:1，亮色为 7.00:1。
- 设置中心浏览器回归覆盖 320/390px 明暗主题品牌说明和横向溢出；颜色解析兼容 Chromium 返回的 CSS Color 4 `color(srgb …)` 格式。
- Android 仅同步版本元数据至 90243，未构建 APK；本地修改，不提交、推送或部署。

## v9.2.42 - 2026-10-19

- 日报提交异常后只读核实服务端状态；若提交已成功则恢复为成功态，无法核实时显示“状态待确认”、锁定重复提交并提供只读重试。
- 桌面与移动网页统一为仅草稿/退回可编辑；移动网页提交结果不确定时锁定输入并提供只读核实。日报读取与回读按账号身份隔离，避免旧请求污染新账号。
- 增加提交后服务端已提交但响应报错、状态核实失败恢复及写入次数检查；Playwright MCP 隔离页实测状态保护。仓库浏览器自动化因 macOS Chromium `bootstrap_check_in ... Permission denied (1100)` 在测试体前失败，不计自动化通过。
- Android 仅同步版本元数据至 90242，未构建 APK；本地修改，不提交、推送或部署。

## v9.2.41 - 2026-10-19

- 登录页密码显隐按钮提供 40px 触控区和清晰键盘焦点环，保留原图标尺寸与输入文本留白。
- 登录页补齐唯一主内容地标；移动 Lighthouse Accessibility 从 98 提升至 100。
- 登录页回归新增 320/390px 窄屏下的触控尺寸、密码显隐交互和主内容地标检查；Playwright MCP 隔离页面手测通过，仓库自动化状态见终验记录。
- 本地后端未启动导致公开系统设置请求 500（Best Practices 96）；登录页禁止索引符合预期（SEO 63）；全站 `llms.txt` 缺少 H1 的 Agentic Browsing 建议为独立文档项（67），均非本次登录页修复目标。
- Android 仅同步版本元数据至 90241，未构建 APK；无 API、权限或数据库变化。本地修改，不提交、推送或部署。

## v9.2.40 - 2026-10-19

- 移动工作中心说明和常用入口副标题改用 Studio 次级文字令牌，提升暗色主题对比度。
- 增加 390px 明暗主题文字对比度与无横向溢出回归；Chrome DevTools MCP 隔离页复测 390px 明/暗主题 Accessibility、Best Practices、SEO 均为 100，320px 明暗主题无横向溢出。仓库浏览器自动化因 macOS Chromium `bootstrap_check_in ... Permission denied (1100)` 在测试体前退出，不计通过。
- Android 仅同步版本元数据至 90240，未构建 APK；无 API、权限或数据库变化。本地修改，不提交、推送或部署。

## v9.2.39 - 2026-10-19

- 协作编辑器的文档同步及协作者编辑状态提示改用 Studio 次级文字令牌，修复暗色主题 4.07:1 的低对比度；覆盖成片、拍摄和发布详情中的共用编辑器状态。
- 增加亮暗主题对比度回归；Chrome DevTools MCP 隔离页复测成片、拍摄、发布详情 390px 明暗主题 Lighthouse Accessibility、Best Practices、SEO 均为 100；同步提示暗色对比度为 8.89:1，窄屏无横向溢出。仓库浏览器自动化尝试启动时因 macOS Chromium `bootstrap_check_in ... Permission denied (1100)` 退出，未进入测试体，不计通过。
- Android 仅同步版本元数据至 90239，未构建 APK；无 API、权限或数据库变化。本地修改，不提交、推送或部署。

## v9.2.38 - 2026-10-19

- 修正成片与发布详情中的统计、普通字段及流程步骤标签对比度，改用 Studio 次级/高对比文字令牌。
- 增加 390px 移动端明暗主题文字对比度与无横向溢出回归；Chrome DevTools MCP 实页核验统计项暗色为 8.38:1、亮色为 7.58:1，成片与发布详情的 Lighthouse Accessibility 两主题均为 100。
- Android 仅同步版本元数据至 90238，未构建 APK；无 API、权限或数据库变化。本地修改，不提交、推送或部署。

## v9.2.37 - 2026-10-19

- 创作详情正文工具栏现在避让当前应用顶栏，桌面高缩放与移动网页滚动时不再被顶栏遮挡；全屏编辑仍贴合屏幕顶部。
- 顶栏高度通过 ResizeObserver 实时同步，适配窗口、响应式内容和系统缩放；补充桌面及 320px 移动端的工具栏命中目标回归。
- Chrome DevTools MCP 隔离页面实测 1024×600 桌面 125% 缩放及 320/390px 移动布局，工具栏可实际点击、页面无横向溢出、控制台错误为 0，夹具写入计数为 0。仓库 WebKit 自动化在浏览器启动时 Abort trap，未进入测试体，不计自动化通过。
- 类型检查、目标 ESLint、生产构建、版本/更新说明治理、Studio token、测试入口、Android runtime 合同和差异检查通过；构建保留既有 843.50 kB 分包提示。Android 仅同步版本元数据至 90237，未构建 APK；本地修改，不提交、推送或部署。

## v9.2.36 - 2026-10-19

- 资料搜索现在有独立侧栏入口和正确面包屑；同一搜索请求在途时同步拦截重复提交，修改关键词或筛选条件后可立即发起新查询。
- 旧搜索迟到回包不会覆盖新结果；搜索中仅锁定提交按钮并通过忙碌状态说明进度，关键词仍可编辑。
- 增加隔离浏览器回归。Playwright MCP 本地夹具实测同周期双提交只发一个 GET、反序释放旧新请求后保留最新结果，320px 窄屏无横向溢出且无浏览器错误；仓库 Chromium 自动化因 macOS MachPort 权限在测试体前失败，不计自动化通过。
- 类型检查、定向 ESLint、资料搜索/导航/官方日期合同测试、Studio token、版本/更新说明治理和生产构建通过；构建保留既有最大 843.50 kB 背景分包提示。无 API、权限、数据库或真实业务数据变化。
- Android 仅同步版本元数据至 90236，未构建 APK；本地修改，不提交、推送或部署。

## v9.2.35 - 2026-10-19

- 旧版发布归档对可空元数据按缺失值安全呈现；未知平台使用中性名称，畸形结构继续关闭解析，发布异常采用珊瑚语义色。
- 数据复盘的排名与热力图支持键盘横向滚动，并显式标注可滚动区域；资源搜索提交按钮统一使用共享主按钮样式，搜索行为保持不变。
- 复盘行动项新增表单补齐可见字段标签，行内状态/处理结果名称包含行动项标题，便于辅助技术区分目标。
- 团队日报切换账号后，前一账号迟到的读取成功或失败都不能覆盖当前账号内容；消息中心单条已读回包不会覆盖并发切换后的筛选/分页结果。
- 首页抖音指标分别标注各自数据来源、观测日期及可确认的官方采集时间；没有精确时间时不再用其他同步时间代替。
- 选题详情的“关联资料/搜索”入口统一使用共享主按钮；搜索中显示处理状态并锁定关键词和提交，同一待处理搜索不会重复发起请求，避免新关键词与旧结果错配。
- 官方昨天、近 7 天和近 30 天均按北京时间自然日校验：昨天取前一日，7/30 天包含采集当天；窗口锚定签名采集时间，上传迟到不改写窗口。无效、缺失、重复或未来日期窗口在批次数据入库前拒绝；无效历史窗口不产生可信周期汇总。
- 7/30 天官方逐日指标要求每天都具有有限数值的投稿、播放、点赞、评论和分享；缺失、NULL、空白、畸形标量或无效历史不再转换为零或生成周期汇总。可选比例/时长的 NULL 保持缺失，评论负数修正保留。
- 90 天趋势校验截至北京时间当天的 90 个连续自然日及每日必需指标；官方历史不完整时不补零、不展示周期合计，无官方数据时保留旧快照回退并严格按日期过滤。该校验仅针对当前物化序列，不证明每个历史批次完整。
- 强制改密对话框打开时接管键盘焦点并限制 Tab 顺序，关闭后恢复焦点；背景登录页在对话框期间不可聚焦且对辅助技术隐藏。
- 移动网页编辑通知偏好后清除过期“已保存”提示；失败提示保留，编辑本身不发起保存。
- 选题模板初始列表未读完前禁用编辑与保存；处理入口重复校验加载状态，避免初始 GET 迟到覆盖后续已确认创建。
- 成就视图切换补齐稳定名称与 `aria-pressed` 状态；活动日志分页补齐前后翻页名称和当前页状态。人员列表读取按标签、页码、搜索词隔离迟到响应，旧 mutation 回调不会取消当前查询。
- 备份清单和匿名意见公开列表只接受最新读取结果；旧请求不能覆盖备份创建后的确认列表、错误或加载状态，也不能让匿名意见首屏旧快照隐藏刚确认的提交。
- 资料中心概览在单个资料库读取失败时保留其他成功计数，失败项明确标为“暂不可用”并可只读重试；登录安全状态页次要文字改用 Studio 次级文字令牌。
- 番茄钟排行榜奖杯图标改用 Studio 彩色底前景令牌，暗色主题对比度由 1.57:1 提升至 11.35:1，亮色为 3.56:1；新增双主题窄屏断言，浏览器未启动，未记作实测通过。
- 增加归档、资料中心部分读取恢复、登录状态页主题对比度、数据复盘、日报、首页新鲜度、选题资料搜索重复请求保护、官方日期/7/30/90 天指标完整性与旧批次重叠窗口重放保护、消息读取、移动通知偏好、强制改密焦点、用户/备份/匿名意见列表竞态、分页无障碍及番茄钟主题对比度回归。类型检查、相关服务合同、目标 ESLint 和治理检查通过；相关仓库浏览器测试受 macOS Chromium 启动权限阻断，未进入测试体，不计浏览器自动化通过。
- Android 仅同步版本元数据至 90235，未构建 APK；本地修改，不提交、推送或部署。

## v9.2.34 - 2026-10-17

- 成就预设初始化改为原子事务，部分写入失败时完整回滚，并发重试只保留一组预设。
- 番茄钟取消状态改用独立的 032 取消账本；取消与完成并发、重复取消及用户隔离均按单一终态处理，同时保留旧版查询活动/完成记录的语义。迁移仅经只读就绪门禁核验，未应用到生产。
- 修复创作列表实时新增与 HTTP 响应交错时总数重复增加，以及删除最后一页唯一记录后页码越界的问题。
- 内容动态页区分读取失败与确认空结果，只使用有效存储时间生成保存事件；读取失败可只读重试，旧内容迟到响应不污染当前文档。
- 团队日报日期筛选补齐可访问标签；数据复盘页增加 17 个移动/桌面及缩放等效视口的可见性、遮挡、键盘聚焦与溢出回归矩阵。
- 类型检查、生产构建、番茄钟/成就/实时订阅/创作列表合同测试、迁移就绪与只读迁移门禁、Android runtime、Studio token 和测试入口检查通过。构建保留既有最大 843.50 kB 的大分包提示；目标 ESLint 0 错误，成就路由 20 条 `any` 警告（基线 21 条）。
- 内容动态及创作列表隔离浏览器关键路径经 MCP 人工实测，均未触及真实业务数据；内容动态验收仅读取，创作列表的模拟 POST/DELETE 只写本地隔离夹具。仓库浏览器自动化因 macOS Chromium `bootstrap_check_in ... Permission denied (1100)` 未进入测试体；数据复盘 17 视口矩阵尚未运行，不能据此声称响应式问题已排除。
- Android 仅同步版本元数据至 90234，未构建 APK；本地修改，不提交、推送或部署。

## v9.2.33 - 2026-10-17

- 修复创作版本保存成功后详情读取失败时页面仍展示旧版本的问题；页面立即保留服务端确认的新版本号和正文。
- 详情或版本历史读取失败时显示明确的“保存已确认、只重试读取、不要重复创建版本”提示，并提供只读重试入口。
- 新增隔离浏览器回归：详情 GET 503 后版本写入仅一次，恢复按钮只触发 GET。
- 无 API、权限、数据库或版本规则变化；Android 仅同步元数据至 90233，未构建 APK。本地修改，不提交、推送或部署。

## v9.2.32 - 2026-10-17

- 修复发布管理中旧抖音候选响应覆盖当前发布记录候选的问题，关闭或切换搜索条件后旧结果不再生效；提交时仅允许绑定当前记录实际展示的候选。
- 审批流设计器补齐字段标签关联，并为节点/模板图标操作提供明确名称，避免无障碍用户无法识别字段或操作目标。
- 发布记录新增/编辑弹窗的 9 个表单控件补齐可见标签关联和稳定字段标识。
- 匿名意见管理的六项图标操作增加包含意见摘要的可访问名称，便于辅助技术区分操作对象。
- 新增候选响应逆序回归、发布记录九字段标签回归、审批字段标签回归及匿名意见操作名称回归；仅本地修改，未提交、推送或部署。Android 仅同步版本元数据至 90232，未构建 APK。

## v9.2.31 - 2026-10-17

- 修复排期日历快速切换月份时，旧月份迟到回包覆盖当前月份事件的问题；旧月份错误也不会覆盖新月份的读取状态。
- 为日历创建事件表单的标题、描述、类型和关联选题补齐显式标签关联，键盘/辅助技术及自动化均可按字段名定位。
- 新增隔离浏览器竞态回归，覆盖挂起旧月请求、读取新月、释放迟到成功/失败响应后的数据归属；Playwright MCP 在本地模拟接口上人工复核通过。仓库 Chromium 因 macOS `bootstrap_check_in ... Permission denied (1100)` 未能启动测试体。
- 类型检查、定向 ESLint、日历权限/API 回归、生产构建、版本与更新说明治理通过；无 API、权限、数据库或真实业务数据变化。本地修改，不提交、推送或部署。
- Android 仅同步版本元数据至 90231，未构建 APK。

## v9.2.30 - 2026-10-17

- 成片列表的“完成/删除”确认处理器增加同步锁，快速重复确认不会抢先清除处理中状态；底层写操作继续保持单次执行。
- 延迟状态更新回归断言同一任务双触发仅一条 PUT、确认按钮在服务端响应前持续禁用，并在确认成功后关闭弹窗。Playwright MCP 本地隔离页面人工复核通过；仓库浏览器套件因 macOS Chromium bootstrap_check_in 权限拒绝未运行测试体。
- 类型检查、目标 ESLint、生产构建、版本与更新说明治理及差异检查通过。无 API、权限、数据库或真实业务数据变化。本地修改，不提交、推送或部署。
- Android 仅同步版本元数据至 90230，未构建 APK。

## v9.2.29 - 2026-10-17

- 灵感池删除、评论和转选题写入增加同步互斥，快速重复触发只发起一次请求；评论失败保留输入，删除失败保留记录，均可明确重试，成功后再更新界面。
- 评论成功后显示发布确认。隔离 Playwright MCP 夹具实测评论/删除/转选题各自失败后重试成功；评论与转选题的延迟重试双触发各只产生一次写入。删除双触发断言已加入仓库测试，但自动化测试体未运行，故不记为实测。320px 页面无横向溢出。仓库 Playwright 自动套件因 macOS Chromium bootstrap_check_in 权限拒绝未运行测试体；测试夹具现会在启动失败时关闭本地服务。
- 类型检查、目标 ESLint、灵感 API 原子性/创建合同测试、版本与更新说明治理、测试入口检查、生产构建和差异检查通过。无 API、权限、数据库或真实业务数据变化。本地修改，不提交、推送或部署。
- Android 仅同步版本元数据至 90229，未构建 APK。

## v9.2.28 - 2026-10-17

- 修复复盘中心列表、个人行动项和详情页暗色文字对比度不足；统一改用 Studio 次级文字令牌，装饰图标保留 muted 样式。
- 增加暗色列表/详情、空状态、9 个列表表头、7 个详情表头、发布归档说明和详情抽屉的对比度回归；Chrome DevTools MCP 使用重启后的本地隔离夹具人工复核，320/390/1440px 亮暗布局无横向溢出。
- 仓库 Playwright 自动化因 macOS Chromium bootstrap_check_in 权限拒绝在测试体前失败；类型检查、目标 lint、版本/文档治理、生产构建和差异检查通过。无 API、权限、数据库或真实业务数据变化。本地修改，不提交、推送或部署。
- Android 仅同步版本元数据至 90228，未构建 APK。

## v9.2.27 - 2026-10-17

- 成片详情状态更新增加同步互斥，请求期间禁用状态操作；服务端确认后即使详情刷新失败，也保留已确认状态并提示只读重载。延迟回包下同一任务快速双触发仅发一条状态更新。
- 补充资源分类新增失败重试与空分类删除的延迟回包回归：同任务双触发只产生一次重试/删除，服务端确认后才移除分类。
- 隔离 Playwright MCP 实测两条路径通过。仓库 Chromium 自动化测试体因 macOS `bootstrap_check_in ... Permission denied (1100)` 未启动；服务端 API、权限、数据库和真实业务数据未改。本地修改，不提交、推送或部署。
- Android 仅同步版本元数据至 90227，未构建 APK。

## v9.2.26 - 2026-10-17

- 选题管理单条删除确认增加同步互斥；服务端确认前重复触发只发送一个 DELETE，失败仍保留确认窗口并允许显式重试，不改删除 API 或权限。
- 补充隔离浏览器的延迟删除与同任务双触发回归。Chrome DevTools MCP 实测同一任务双触发只产生一条 DELETE，服务端确认后选题行移除；仓库 Playwright Chromium 的自动测试体因 macOS `bootstrap_check_in ... Permission denied (1100)` 未执行。
- 无 API、权限或数据库变化；Android 仅同步版本元数据至 90226，未构建 APK；本地修改，不提交、推送或部署。

## v9.2.25 - 2026-10-17

- 成片详情和发布详情的小版本、大版本保存增加同步互斥；发布详情普通保存与两处归档重试也共用同步锁。在 React 按钮禁用态刷新前，重复触发只会发送一个写入，避免重复创建剧本版本或并发重试归档。
- 增加延迟响应下成片/发布小版本保存及归档重试的同一事件周期双触发回归。仓库 Playwright Chromium 启动受 macOS `bootstrap_check_in ... Permission denied (1100)` 阻断，测试体未执行。
- 无 API、权限或数据库变化；Android 仅同步版本元数据至 90225，未构建 APK；本地修改，不提交、推送或部署。

## v9.2.24 - 2026-10-17

- 选题详情与主题内容资产页的城市、人物、项目标签写入和移除增加同步互斥，拦截同一事件内的重复提交；补充双提交回归。Chrome DevTools MCP 隔离页面在两个入口验证各仅一条写入，确认后标签和成功提示正常。仓库 Playwright 脚本因 macOS Chromium `bootstrap_check_in ... Permission denied (1100)` 无法启动。无 API、权限或数据库变化；Android 仅同步元数据至 90224，未构建 APK；本地修改，不提交、推送或部署。

## v9.2.23 - 2026-10-17

- 修复移动首页阶段按钮辅助名称与可见文字不一致，以及稿件保存状态在辅助名称中重复播报的问题；摘要不可用时的隐藏说明也不再撑宽 390px 页面。移动 Chrome Lighthouse 无障碍分数为 100，隔离首页浏览器回归通过。Android 仅同步版本元数据至 90223，未构建 APK；本地修改，不提交、推送或部署。

## v9.2.22 - 2026-10-17

- 移动首页个人稿件增加保存状态：仅当本次浏览器会话中的当前账号收到明确保存成功事件时显示已确认保存；保存中、待保存修改和冲突分别提示，缺少可信事件时显示未确认。更新时间不再被误认为保存成功；账号间不共享状态。无 API 契约、保存逻辑、权限或数据库变化。Android 仅同步版本元数据至 90222，未构建 APK；本地修改，不提交、推送或部署。

## v9.2.21 - 2026-10-17

- 移动首页阶段概览新增可折叠的各阶段最新内容，最多展示 7 个阶段各自最近 3 条及阶段停留时间；内容可直达对应选题/复盘，阶段数字原有筛选入口不变。复用现有首页摘要，灵感预览沿用限量 GET；无 API 契约、权限或数据库变化。Android 仅同步版本元数据至 90221，未构建 APK；本地修改，不提交、推送或部署。

## v9.2.20 - 2026-10-17

- 移动首页新增默认折叠的“最近变化”；展开后按现有可见范围读取最近 5 条稿件版本、批注回复和选题状态变化，并提供站内直达。读取失败可重试，刷新失败保留上次成功内容；收起时不发请求。沿用只读 GET 接口，无 API 契约、权限或数据库变化。Android 仅同步版本元数据至 90220，未构建 APK；本地修改，不提交、推送或部署。

## v9.2.19 - 2026-10-17

- 首页任务改为桌面与移动端共用的角色优先级；移动首屏集中展示 3 条可操作任务，可展开至 6 条，并加入灵感池至复盘的 7 阶段概览。负责人优先看到消息、同步异常和团队卡点，审核角色先处理待审内容与个人稿件，创作者先续写自己的稿件。沿用现有摘要/权限范围，仅增加对既有灵感列表接口的限量读取；无 API 契约、权限或数据库变化。Android 仅同步版本元数据至 90219，未构建 APK；本地修改，不提交、推送或部署。

## v9.2.18 - 2026-10-17

- 移动工作台展示当前账号可见的草稿和退回稿，支持继续写稿或直达处理退回内容；复用现有摘要接口和权限范围。无 API、权限或数据库变化；Android 仅同步版本元数据至 90218，未构建 APK；本地修改，不提交、推送或部署。

## v9.2.17 - 2026-10-17

- 选题看板模式隐藏仅列表需要的概览指标和重点选题卡片，让阶段列提前进入 1440×900 首屏；列表模式和手机页保持原行为，并补充首屏可见性回归。无 API、权限或数据库变化；Android 仅同步版本元数据至 90217，未构建 APK；本地修改，不提交、推送或部署。

## v9.2.16 - 2026-10-17

- 资料全文搜索新增资料库、分类、标签组合筛选与相关度/最近更新/标题排序；无结果时提供调整条件建议和保留关键词的清除筛选操作。搜索沿用现有权限可见范围，无权限、数据库或业务数据变化；Android 仅同步版本元数据至 90216，未构建 APK；本地修改，不提交、推送或部署。

## v9.2.15 - 2026-10-17

- 资料全文搜索结果重新显示 FTS 命中关键词，并通过 React 安全文本节点渲染，不把资料片段作为 HTML 注入；使用 Studio 主题令牌并增加安全回归。无 API、权限或数据库变化；Android 仅同步版本元数据至 90215，未构建 APK；本地修改，不提交、推送或部署。

## v9.2.14 - 2026-10-17

- 资料搜索关键词框新增明确的辅助技术名称，搜索结果分类文字改用 Studio 次级令牌以提升暗色卡片上的可读性；资料列表前后页按钮补充操作名称，并加入亮暗主题与 320/390px 回归。无 API、权限或数据库变化；Android 仅同步版本元数据至 90214，未构建 APK；本地修改，不提交、推送或部署。

## v9.2.13 - 2026-10-17

- 知识库分类树仅在有子分类时显示展开/收起操作，读屏名称包含分类名，叶子分类不再暴露无效按钮；补充分类树交互与可访问名称回归。无 API、权限或数据库变化。Android 仅同步版本元数据至 90213，未构建 APK；本地修改，不提交、推送或部署。

## v9.2.12 - 2026-10-17

- 修复知识库分类计数在暗色磨砂卡片上对比度仅 4.22:1 的问题，改用 Studio 次级文字令牌；新增亮暗主题实际合成对比度回归。无 API、权限或数据库变化。Android 仅同步版本元数据至 90212，未构建 APK；本地修改，不提交、推送或部署。

## v9.2.11 - 2026-10-17

- 知识库移动端分类面板不再继承桌面最小高度；在 320/390px 下按分类内容自然收缩，让搜索和资料列表更早进入首屏。增加亮暗主题与横向溢出回归；无 API、权限或数据库变化。Android 仅同步版本元数据至 90211，未构建 APK；本地修改，不提交、推送或部署。

## v9.2.10 - 2026-10-16

- 修复消息中心桌面列表计数在暗色主题对比度不足的问题，改用 Studio 次级文字令牌；补充亮暗主题回归，并独立验证 320px 移动消息页无横向溢出。“清空”确认取消后不发出写入请求。无 API、权限或数据库变化；Android 仅同步元数据至 90210，未构建 APK；本地修改，不提交、推送或部署。

## v9.2.9 - 2026-10-16

- 修复发布管理暗色主题下表头、负责人副标题和统计卡片标签文字对比度不足的问题，改用 Studio 次级文字令牌；共享统计卡片的可选单位文字同步提升对比度。
- 补充发布表格全部表头、负责人副标题及四张统计卡片标签的亮暗主题对比度回归。无 API、权限或数据库变化；Android 仅同步元数据至 90209，未构建 APK；本地修改，不提交、推送或部署。

## v9.2.8 - 2026-10-16

- 修复协作头像、光标标签在绿色/橙色等成员颜色上统一使用白字造成的低对比，按实际背景选择高对比文字色；无法识别的成员色回退到可读的默认色。
- 增加协作色板对比度单测和生产审阅页亮暗主题浏览器回归。无 API、权限或数据库变化；Android 仅同步元数据至 90208，未构建 APK；本地修改，不提交、推送或部署。

## v9.2.7 - 2026-10-16

- 修复侧栏折叠分组和关闭的窄窗导航抽屉仍接受读屏/键盘焦点的问题；隐藏时同步从辅助技术树与键盘交互中隔离，图标模式的分组按钮保留可访问名称，点击图标分组会展开侧栏并打开所选分组。窄窗抽屉打开后焦点进入并限制在菜单内，关闭后归还触发按钮。
- 新增浏览器回归，覆盖分组收起/展开、图标分组点击及窄窗抽屉关闭/打开。无 API、权限或数据库变化；Android 仅同步元数据至 90207，未构建 APK；本地修改，不提交、推送或部署。

## v9.2.6 - 2026-10-16

- 桌面工作台任务操作按钮的读屏名称加入任务标题和内容，区分重复的“开始审核”“审核稿件”等操作；可见文案、导航及业务行为不变。
- 新增桌面工作台任务名称浏览器回归断言。无 API、权限或数据库变化；Android 仅同步元数据至 90206，未构建 APK；本地修改，不提交、推送或部署。

## v9.2.5 - 2026-10-16

### 优化

- 移动首页辅助说明和“查看全部”链接使用通过亮暗主题对比度检查的 Studio 令牌。
- 关注选题、待审稿件、今日发布与数据同步异常任务卡片由其可见内容生成读屏名称。

### 验证

- Chrome DevTools Lighthouse 在 320px 编辑视角和 390px 负责人视角的亮/暗主题，Accessibility、Best Practices、SEO 均为 100；唯一失败为与页面无关的 `llms.txt` 文件建议。Playwright MCP 可访问树核对四类任务名称包含卡片可见内容，控制台错误/警告为 0。
- 类型检查、定向 ESLint、生产构建、版本检查/治理、更新说明治理（349 个版本）、测试入口（216 个）、Studio 令牌门禁（38 类）和差异检查通过；构建保留既有 >500 kB 分包警告。
- 完整 `test:topic-stage-record-repair-browser` 无法启动 macOS Playwright Chromium（`bootstrap_check_in ... Permission denied (1100)`）；由 Playwright MCP 与 Chrome DevTools MCP 在隔离页面复核。无 API、权限或数据库变化；Android 仅同步元数据至 90205，未构建 APK；本地修改，不提交、推送或部署。

## v9.2.4 - 2026-10-16

### 优化

- 手机创作页保存/提交操作栏会避开底部导航，并根据系统键盘高度调整位置。
- 协作光标的溢出头像组提供辅助技术语义与协作者名称，空组不再进入辅助技术树。

### 验证

- Playwright MCP 隔离页在 320×800、390×844 验证操作按钮不被导航遮挡、无横向溢出；模拟 300px 键盘占位后按钮仍位于键盘上方。Chrome DevTools Lighthouse Accessibility/Best Practices/SEO 均为 100，页面控制台错误和警告为 0；唯一失败项是无关页面交互的 `llms-txt` 文档检查。
- 类型检查、定向 ESLint、创作审阅 HTTP 回归通过。完整 Playwright 启动器未运行（macOS Chromium 启动权限受限）；本地隔离页面由 MCP 实测。无 API、权限或数据库变化；Android 仅同步元数据至 90204，未构建 APK；本地修改，不提交、推送或部署。

## v9.2.3 - 2026-10-16

### 优化

- 匿名意见管理回复框新增可见字段标签并采用 Studio `.xmt-field` 样式，提升键盘与辅助技术可辨识性。

### 验证

- 浏览器回归要求回复输入框具有“回复内容”可访问名称；Playwright MCP 在隔离后台页面验证标签与控件关联、正常打开/取消。可访问性截图保存在 `.playwright-mcp/anonymous-feedback-reply-label-v9.2.3.png`。
- 类型检查、定向 ESLint、生产构建、版本/更新说明治理（347 个版本）、测试入口检查（216 个）、Studio 令牌门禁（38 类）与差异检查通过；构建保留既有 >500 kB 分包提示。完整 Playwright 自动脚本受 macOS Chromium 启动权限限制；无 API、权限或数据库变化。Android 仅同步元数据至 90203，未构建 APK；本地修改，不提交、推送或部署。

## v9.2.2 - 2026-10-16

### 修复

- 匿名意见管理在列表重试与状态/公开/回复/删除等写入并发时忽略过期列表回包，避免旧状态覆盖已确认的新结果。

### 验证

- 新增延迟列表读取竞态回归：较旧 GET 延迟到写入确认后的新 GET 之后返回时，不得覆盖新状态；原有亮/暗主题 × 320/390/1440px、写入失败与只读重试覆盖保留。
- Playwright MCP 本地隔离夹具实测延迟旧 GET 在新状态写入及刷新后返回，页面仍保留“已完成”；控制台只有夹具预期的 1 条 GET 503、警告 0。完整 Playwright 脚本因 macOS Chromium `bootstrap_check_in` 权限限制未能启动。
- 类型检查、定向 ESLint、生产构建、版本/更新说明治理（346 个版本）、测试入口（216 个）、Studio 令牌门禁（38 类）和差异检查通过；构建保留既有 >500 kB 分包提示。无 API、权限或数据库变化；Android 仅同步元数据至 90202，未构建 APK；本地修改，不提交、推送或部署。

## v9.2.1 - 2026-10-16

### 修复

- 匿名意见写入确认与后续列表刷新分开处理；服务端确认后立即显示成功，不再因读取失败误报写入失败。
- 意见提交增加同步互斥；写入失败保留意见类型和内容，便于安全重试。

### 验证

- Playwright MCP 隔离页面覆盖同事件双提交仅一条 POST、写入中锁定、失败保留后重试，以及写入成功后列表 GET 失败仍显示提交成功；320px 无横向溢出、无应用运行时错误。仓库 Chromium 脚本受 macOS `bootstrap_check_in` 限制未能启动；模拟 Vite 页的 Socket.IO 代理请求因未连接 API 服务出现预期错误。
- 类型检查、定向 ESLint、版本治理、更新说明治理、测试入口和 `git diff --check` 通过；无 API、权限或数据库变化。Android 仅同步元数据至 90201，未构建 APK；本地修改，不提交、推送或部署。

## v9.2.0 - 2026-10-16

### 新增

- 资料详情支持在线编辑标题、摘要、分类、可见范围和正文，沿用现有服务端权限、资料范围校验及审计事务。

### 优化

- 保存失败保留输入；服务端确认后立即回显，详情刷新失败时可只重试读取，避免重复写入。
- 编辑期间锁定表单和关闭入口并防止快速重复提交；真实文件上传未接入前继续明确标记暂未开放。

### 验证

- 资源更新/审计事务、创建原子性、分类权限测试，类型检查、定向 ESLint、生产构建、版本治理（344 个版本）、测试入口（215 个）和 `git diff --check` 通过。Playwright MCP 本地 mock 验证失败保留、重复提交仅一条 PUT、在途锁定、确认后回显和只读刷新恢复；仓库 Chromium 脚本因 macOS `bootstrap_check_in` 权限未能启动。
- 无数据库迁移；Android 仅同步元数据至 90200，未构建 APK；本地修改，不提交、推送或部署。

## v9.1.47 - 2026-10-16

### 修复

- 新增资料在服务端确认前锁定表单和关闭入口，并以同步互斥阻止重复创建；失败保留输入以便重试。
- 资料详情中尚未接入的在线编辑与文件上传入口明确标为暂未开放并禁用，不再显示成可执行操作。

### 验证

- `npm run test:resource-create-atomic`、`npm run test:resource-center-mutations`、`npm run test:resource-categories`、类型检查、定向 ESLint、版本/更新说明治理（343 个版本）、测试入口（215 个）、生产构建和 `git diff --check` 通过。
- Playwright MCP 隔离页面验证同一事件周期双提交仅一条 POST、在途字段/关闭入口锁定、Esc 不关闭弹窗，确认后进入带 `library_type=knowledge` 的详情；编辑/上传入口正确说明暂未开放并禁用。1366px 和 320px 均无页面横向溢出、操作按钮不出视口。仓库 Playwright 脚本因 macOS Chromium `bootstrap_check_in` 权限限制未能启动；本地 Vite 无 Socket.IO 服务，页面有预期的 socket polling 失败提示。
- Android 仅同步版本元数据至 90147，未构建 APK；无 API、权限或数据库变化。本地修改，不提交、推送或部署。

## v9.1.46 - 2026-10-16

### 修复

- 资料中心列表及详情均按 `library_type` 显示正确的侧栏高亮、面包屑与返回位置；旧详情链接会在读取资料后补齐所属资料库，旧项目/素材入口继续可用。

### 验证

- Playwright MCP 隔离浏览器从资料中心概览进入项目资料库，确认页面标题、侧栏高亮和面包屑一致；内容档案库、素材库查询路由也指向对应导航。项目详情的旧无参数链接会补齐类型并返回项目库，亮/暗主题均正确，控制台错误为 0。
- 查询路由单测、类型检查、定向 ESLint、215 个测试入口检查、版本/更新说明治理与生产构建通过；构建保留既有 >500 kB 分包警告。完整浏览器脚本未运行，交互由 MCP 隔离浏览器人工复核。
- Android 仅同步版本元数据至 90146，未构建 APK；本地修改，不提交、推送或部署。

## v9.1.45 - 2026-10-16

### 修复

- 系统、品牌和登录页设置保存期间锁定字段并共用同步写入锁，避免等待中的回包覆盖新修改或快速重复提交；失败后仍可保留修改并重试。

### 验证

- Playwright MCP 隔离设置页验证品牌设置双击保存只产生一次写入，页面身份和内容正常、控制台无错误；另以成功 toast 截图留证。仓库 Playwright 浏览器测试因 macOS Chromium `bootstrap_check_in` 权限限制无法启动；自动回归已更新为注入延迟保存，检查表单禁用与请求次数。
- 类型检查、定向 ESLint、版本检查、版本/更新说明治理、测试入口、生产构建和差异检查通过；构建保留既有 >500 kB 分包提示。
- Android 仅同步版本元数据至 90145，未构建 APK；本地修改，不提交、推送或部署。

## v9.1.44 - 2026-10-16

### 修复

- 批注/回复请求处理中锁定表单与取消、状态操作；请求失败保留原输入，只有确认保存后才清空对应草稿。
- 接受修改建议期间统一锁定桌面与移动端正文和稿件变更；移动端同时阻止保存、提交审核及离页，避免建议保存与其它写入并发。

### 验证

- Chrome DevTools MCP 隔离实测批注/回复失败保留输入及请求中锁定；桌面、移动端接受建议时正文只读并阻止冲突操作，移动端离页被拦截，服务端确认后才显示已采纳。已补自动回归覆盖；脚本仅以隔离服务模式编译启动，完整 Playwright 启动仍受 macOS Chromium 子进程权限限制。
- 类型检查、定向 ESLint、创作审核 HTTP 回归、版本/说明/入口治理、生产构建及差异检查通过；构建保留既有 >500 kB 分包提示。

## v9.1.43 - 2026-10-16

### 修复

- 创作详情的小修/另开版本与状态变更现在先锁定编辑器并确认自动保存，再提交后续写入；保存未确认时不会变更状态或版本，成功后以最新正文继续写入。

### 验证

- Chrome DevTools MCP 隔离实测自动保存挂起期间状态变更和版本保存均等待服务端确认，编辑器及其它变更入口锁定；释放保存后状态/版本写入携带最新正文。浏览器回归已加入双场景；仓库 Playwright 脚本仍受 macOS Chromium 子进程权限限制，手动 MCP 实测。
- 类型检查、定向 ESLint、创作审核 HTTP 回归、版本/更新说明治理、测试入口、生产构建与差异检查通过；构建保留既有 >500 kB 分包提示。

## v9.1.42 - 2026-10-16

### 修复

- 创作审核提交期间以同步互斥保护整条稿件写入链：锁定正文、版本切换/保存、状态更新和删除，避免审核确认过程中另一项操作覆盖或移除稿件。

### 验证

- Playwright MCP 隔离验证审核等待期间两个提交入口、正文、小修/另开版本、切换当前稿与删除均锁定；快速重复触发只产生一个审核写入，确认后状态更新为审核中。浏览器自动化脚本受 macOS Chromium 子进程权限限制未能启动，改用 MCP 实测。
- 类型检查、定向 ESLint、创作审核 HTTP 回归、版本/更新说明治理、测试入口、版本治理、生产构建与差异检查通过；构建保留既有 >500 kB 分包提示。

## v9.1.41 - 2026-10-16

### 修复

- 创作详情提交审核前先确认编辑器自动保存完成；保存未确认时阻止提交。审核提交期间锁定按钮与正文，快速连点仅发起一次请求，失败可安全重试，确认成功后立即更新本地审核状态。

### 验证

- Playwright MCP 隔离验证连续两次正文保存 503 时审核写入为 0、草稿保留且两个入口可重试；延迟审核请求期间两个入口锁定、正文只读，双入口快速触发仍只有一次写入，确认后更新为“审核中”且不再显示提交按钮。审核接口失败后保留草稿也已验证。
- `npm run test:production-review`、`npm run check -- --pretty false`、定向 ESLint、版本检查、更新说明/测试入口/版本治理、`npm run build` 和 `git diff --check` 通过。仓库浏览器脚本因 macOS Chromium 子进程 `bootstrap_check_in` 权限限制未能启动，改用 Playwright MCP 实测；构建保留既有 >500 kB 分包提示。

## v9.1.40 - 2026-10-16

### 修复

- 移动首页摘要接口返回 HTTP 200 但缺少必需列表时，不再在渲染阶段调用缺失字段并崩溃；现在明确提示数据格式不兼容，可只读重试。

### 验证

- Playwright MCP 在 390px 与 1440px 隔离回包下验证异常提示、重试恢复和无框架错误页；`npm run check -- --pretty false`、定向 ESLint、`npm run test:home-dashboard` 与 `npm run test:api-contract` 通过。仓库浏览器脚本因 macOS Chromium 子进程权限限制未能启动；本地修改，不提交、推送或部署。

## v9.1.39 - 2026-10-16

### 修复

- 官方导出部分数据行被采集器拒绝时，服务端回执保留报告行数与安全提示；Creator Agent 最近同步区显示读取、接收、拒绝与重复数量，避免有效行入库却静默遗漏部分行。
- Agent 上传队列重试继续使用服务端持久回执；质量摘要只用于诊断提示，不覆盖服务端校验或改变指标计算。

### 验证

- `npm run test:official-export-v2`、Agent 质量回执/提示组件 4 项测试、主项目与 Agent 类型检查及生产构建通过；`npm run version:check`、更新说明唯一性（335 个版本）、测试入口（214 个文件）通过。全仓 ESLint 0 errors、294 warnings；构建保留既有最大 843.50 kB 分包提示。
- Playwright MCP 使用本地模拟 preload 验证 Creator Agent Dashboard：部分批次显示读取/接收/拒绝/重复数，干净批次不显示；390px 视口无横向溢出，页面无框架错误覆盖。独立 Vite 初载因缺 Electron preload 显示安全接口提示，验收时仅注入本地测试桥接，不连接真实账号；Browser 插件不可用，按已授权的 Playwright MCP 回退。Python 解析器未在本轮改变；当前 Python 环境缺 pytest 与 Scrapling，未重复执行其测试。

## v9.1.38 - 2026-10-16

### 修复

- 成就检查遇到已获得项目时改为继续检查后续成就，避免接口不返回且漏发符合条件的后续成就。
- 抖音官方导出 v3 对表头未识别、解析异常或整份文件行均被拒绝的批次在任何业务入库前失败关闭；采集器为全行拒绝情况增加明确质量告警。

### 验证

- 成就 HTTP 回归覆盖正常响应、后续成就授予与重复检查；官方导出服务合同覆盖解析质量告警的入库前拒绝；采集器解析 4 项、类型检查、版本治理、更新说明治理、测试入口与生产构建通过。构建保留既有 >500 kB 分包提示；定向 ESLint 0 errors，保留成就路由已有警告。

## v9.1.37 - 2026-10-16

### 修复

- 选题详情的桌面阶段推进及移动端保存、阶段推进、补齐阶段记录和审核增加同步互斥；服务端确认前锁定操作并显示处理中状态，防止快速重复点击造成重复写入。
- 登录页三种布局为账号与密码输入框补齐显式标签关联；备案链接使用主题次级文字令牌，满足普通文本对比度要求。

### 验证

- 浏览器回归覆盖选题写入防重复，以及三种登录布局的标签关联、备案链接对比度与登录导航；`npm run check -- --pretty false`、`npm run build`、版本/更新说明治理、测试入口检查和 `git diff --check` 通过。定向 ESLint 0 errors，保留既有警告；构建保留既有 >500 kB 分包提示。

## v9.1.36 - 2026-10-16

### 修复

- 桌面选题审核和桌面/移动看板阶段操作在服务端确认期间锁定表单或同一选题的操作按钮，并以同步互斥阻止重复写入。

### 验证

- `npm run check -- --pretty false`、`npm run build`、两个定向浏览器套件、版本/更新说明治理和测试入口检查通过；定向 ESLint 0 errors，保留既有警告。构建保留既有 >500 kB 分包提示。

## v9.1.35 - 2026-10-16

### 修复

- 移动端消息中心按页加载历史消息，未读徽标采用服务端全账号摘要；“全部已读”覆盖全部账号消息，失败时保留未读状态并允许重试。

### 验证

- `npm run check -- --pretty false` 与定向 ESLint 通过；Playwright MCP 390px 实测 45 条消息分页、加载失败保留与重试、全局未读数、账号级批量已读失败恢复均通过。仓库 Playwright 脚本因 macOS 拒绝 Chromium 子进程启动未能运行；本地修改，未提交、推送或部署。

## v9.1.34 - 2026-10-16

### 修复

- 首页待处理消息尚未读取完成或读取失败时，不再显示“今天没有必须处理的任务”；重试中的错误提示持续可见，成功后才确认空任务状态。

### 验证

- `npm run test:topic-stage-record-repair-browser` 覆盖消息读取中、503、只读重试及确认真实空任务；类型检查、定向 ESLint、生产构建和版本治理通过。构建保留既有 >500 kB 分包提示。无 API、权限、数据库或业务数据变化；Android 仅同步版本元数据至 90134，未构建 APK；本地修改，不提交、推送或部署。

## v9.1.33 - 2026-10-16

### 修复

- 选题模板创建或更新等待服务端确认时，显示处理中状态并锁定名称、平台、说明、正文与取消编辑入口，避免已确认写入后误清理并发输入。

### 验证

- `npm run test:template-management-browser` 覆盖保存失败保留表单、显式重试、创建/更新延迟回包时的处理中状态与字段锁定、重复创建防护、保存后只读恢复及 320/390/1440px 多主题页面可读性。类型检查、定向 ESLint、生产构建、版本/更新说明治理、测试入口、Android runtime 与模板权限合同通过；构建保留既有 >500 kB 分包提示。本地修改，不提交、推送或部署。

## v9.1.32 - 2026-10-16

### 修复

- 知识库分类树与资料结果独立读取；分类请求失败时仍保留已加载结果，关键词/分类切换只重读资料。
- 分类目录失败期间不开放分类管理，避免用不完整列表执行管理操作；恢复后重试只读取分类并恢复入口。

### 验证

- `npm run test:resource-hover-contrast-browser` 覆盖知识库分类 GET 503、资料结果保留、重试仅请求分类、管理入口门禁和 320/390px；`npm run check`、定向 ESLint、生产构建、版本/更新说明治理与差异检查通过。Android 仅同步元数据至 90132，未构建 APK；本地修改，未提交、推送或部署。

## v9.1.31 - 2026-10-16

### 修复

- 资料分类读取与资料列表解耦；分类接口暂时失败时，已加载的资料仍可查看。
- 分类失败提供独立只读重试，保留 URL 中的既有分类筛选；重试不会重复请求资料列表或执行写入。

### 验证

- `npm run test:resource-hover-contrast-browser` 覆盖分类 GET 503、列表保持可用、320/390px 提示布局和只读重试，并同时回归审计读取恢复；`npm run check`、定向 ESLint、生产构建、版本/更新说明治理与差异检查通过。Android 仅同步元数据至 90131，未构建 APK；本地修改，未提交、推送或部署。

## v9.1.30 - 2026-10-16

### 修复

- 资料详情与审计记录独立读取；审计接口失败不再让已成功读取的资料详情进入整页错误状态。
- 审计记录失败时明确提示并提供只读重试；重试只请求审计记录，不会重复读取详情或触发资料写入。

### 验证

- `npm run test:resource-hover-contrast-browser` 覆盖审计读取 503、详情保持可用、只读重试及无重复创建/删除；`npm run check`、定向 ESLint、生产构建、版本/更新说明治理与差异检查通过。Android 仅同步元数据至 90130，未构建 APK；本地修改，未提交、推送或部署。

## v9.1.29 - 2026-10-16

### 修复

- 选题提报中的负责人名单读取失败时不再静默退化为无负责人选项；表单内容和已保存的负责人选择保留。
- 名单故障提供明确说明与仅重新读取名单的重试，不会重复提报。

### 验证

- `npm run test:creator-topic-suggestions-browser` 覆盖桌面/移动提报页负责人名单 503、提示、只读重试及无 Topic 写入；类型检查、定向 ESLint、生产构建、版本/更新说明治理及差异检查通过。Android 仅同步元数据至 90129，未构建 APK；本地修改，未提交、推送或部署。

## v9.1.28 - 2026-10-16

### 修复

- 选题详情与负责人名单读取解耦；成员名单故障不再误报详情读取失败，详情仍可正常使用。
- 负责人名单读取失败时明确提示并可单独重试；保留现有负责人信息，重试只发读取请求。

### 验证

- `npm run test:topic-stage-record-repair-browser` 覆盖负责人名单 503、详情保持可用、重试恢复与没有选题写入；类型检查、定向 ESLint、生产构建、版本/更新说明治理及差异检查通过。Android 仅同步元数据至 90128，未构建 APK；本地修改，未提交、推送或部署。

## v9.1.27 - 2026-10-16

### 修复

- 发布与成片详情中的剧本版本历史读取失败时不再误显示“暂无已保存版本”；主记录仍可使用，历史列表提供独立重试。
- 版本保存后的历史刷新失败会明确标注列表可能不完整，并提供仅重新读取历史的入口，避免用户重复创建版本。

### 验证

- `npm run test:workflow-details-responsive-browser` 覆盖成片/发布历史读取 503、窄屏提示与无横向溢出、显式只读重试、真实空列表与记录路径；`npm run check`、定向 ESLint（0 errors/0 warnings）、生产构建、版本治理、更新说明治理及差异检查通过。Android 仅同步元数据至 90127，未构建 APK；本地修改，未提交、推送或部署。

## v9.1.26 - 2026-10-16

### 修复

- 日报总结归档的成员名单读取失败时不再静默显示空筛选；明确说明名单可能不完整，并提供只重新读取成员目录的重试操作。
- 日报归档内容按账号与权限范围隔离；切换账号或权限后不沿用之前的成员筛选状态，迟到的名单响应也不会覆盖当前请求。

### 验证

- `npm run test:daily-report-submit-recovery-browser` 覆盖成员名单 503→错误提示→显式重试恢复，并确认重试只读取成员目录、不重复日报写入；桌面与 390px 归档回归通过。`npm run check`、定向 ESLint 与 `git diff --check` 通过。Android 仅同步元数据至 90126，未构建 APK；本地修改，未提交、推送或部署。

## v9.1.25 - 2026-10-16

### 修复

- 复盘新建和详情在成员名单读取失败时不再静默显示不完整的负责人选项；明确提示并允许重新加载。无查看成员权限时不请求成员目录，保留当前用户/默认选项。
- 负责人名单请求按账号归属隔离，账号切换后迟到的旧回包不会覆盖新账号选项。

### 验证

- `npm run test:retrospective-list-responsive-browser` 覆盖读取失败与重试、新建/详情两入口、无 `user:view` 权限不发请求及账号切换后的迟到响应隔离；`npm run check`、定向 ESLint、生产构建、版本治理与差异检查通过。Android 仅同步元数据至 90125，未构建 APK；本地修改，未提交、推送或部署。

## v9.1.24 - 2026-10-16

### 修复

- 消息中心同一账号、筛选和页码的刷新失败时保留最近一次成功结果，显示可能过期的提示和重试；切换查询范围后不会把旧列表当作当前结果。
- 工作台的未知选题状态明确显示“状态待确认”，不再被误标成“进行中”。

### 验证

- `npm run test:mobile-work-center-browser` 全套隔离浏览器回归通过，覆盖消息刷新失败保留/重试、筛选切换隔离、工作台未知状态及 320/390px 布局。
- `npm run check`、定向 ESLint、`npm run build`、版本治理及 `git diff --check` 通过。Android 仅同步版本元数据至 90124，未构建 APK；本地修改，未提交、推送或部署。

## v9.1.23 - 2026-10-16

### 修复

- 团队日报刷新失败时保留同一查询范围内最近一次成功读取的日报，并说明数据可能不是最新；切换日期后不展示旧日期内容。

### 验证

- 隔离浏览器覆盖成功读取、同日刷新失败后保留、只读重试恢复、换日期失败隔离及旧日期延迟回包不覆盖新结果；类型检查与定向 ESLint 通过。Android 仅同步版本元数据至 90123，未构建 APK；未提交、推送或部署。

## v9.1.22 - 2026-10-16

### 修复

- 工作台“最近变化”刷新失败时保留最后一次成功读取的内容，并提示数据可能不是最新；恢复后只需重新读取，不会误示为空。

### 验证

- Playwright 隔离浏览器覆盖首次读取失败、重试恢复、已有数据刷新失败时继续显示旧内容及再次重试；类型检查、生产构建、版本治理与差异格式检查通过。
- Android 仅同步版本元数据至 90122，未构建 APK；无 API、权限或数据库变化。本批仅本地修改，未提交、推送或部署。

## v9.1.21 - 2026-10-15

### 修复

- 未保存的选题、创作稿、拍摄/成片、发布剧本和复盘结论在侧栏导航、浏览器后退及退出登录前会进入对应的离开保护；取消后保留当前修改。
- 写入或协作交接尚未完成时阻止离开；退出登录改为在确认离开后才清理会话，避免取消时提前登出。

### 验证

- `npm run check`、`npm run build`、`npm run version:check`、`npm run test:version-governance`、`npm run test:topic-stage-record-repair-browser` 与 `git diff --check` 通过；定向 ESLint 0 errors，保留既有 warnings。
- Playwright 回归覆盖亮/暗主题、浏览器后退、侧栏导航、退出登录取消、390px 移动页取消后草稿保留；无意外浏览器错误。Chrome DevTools MCP 确认新版路由入口可挂载登录页。
- Android 仅同步版本元数据至 90121，未构建 APK；无数据库变化。本批仅本地修改，未提交、推送或部署。

## v9.1.20 - 2026-10-15

### 修复

- Creator Agent 单账号同步增加基于数据库时钟的 30 分钟 claim 租约；过期的 running 任务会被标记失败后再接管，正常运行任务仍互斥。
- Yjs 对 `COORDINATION_UNAVAILABLE` 与 `COORDINATION_CONFLICT` 保留并退避重试同一批次，恢复后继续发送排队更新。
- 创作建议把无时区数据库日期按北京时间解析，显式 `Z`/offset 的 ISO 时间仍按绝对时刻解析。
- 分布式任务等待正在执行的续租完成后，再返回完成或租约失效结果。

### 验证

- Creator 同步单飞、Yjs ACK 重试、创作建议时间范围和分布式任务租约专项回归通过；`npm run check`、`npm run build`、全仓 ESLint（0 errors/299 warnings）、版本/迁移/部署门禁与测试入口检查通过。
- 数据库 SAFE_EXPAND 迁移 031；Android 仅同步版本元数据至 90120，未发布 APK。GitHub Actions run 38693849890 在精确合并提交 `242008c45486684045f6cdf985e0714dd5ccb4cd` 上 6 个任务全部通过；生产已于 2026-10-15 部署并完成独立健康回读。

## v9.1.19 - 2026-10-15

### 修复

- 选题、成片、发布、资料和复盘详情的首屏及附属历史/审计/风险读取绑定当前记录与请求代次；旧路由回包不会覆盖新详情。
- 选题审核/状态/保存、成片状态/版本与发布剧本版本的写后刷新仅更新当前记录；服务端已确认写入但页面已切换时明确提示，不污染当前页面。
- 复盘风险手动刷新失败时保留最近一次成功结果，仅在切换复盘时清除旧风险数据。

### 验证

- 资料详情迟到回包竞争回归及工作流详情、选题详情、复盘行动项浏览器套件通过；类型检查、定向 ESLint 与差异格式检查通过（0 errors；保留既有定向 lint warnings）。CI 审计生产依赖；安全部署完成运行检查后移除开发依赖，服务器启动所需 `tsx` 保留。全量审计仍有未修复上游的开发工具告警，详见依赖安全审计清单。无 API、权限模型、数据库或真实业务数据变化；Android 仅同步元数据至 90119，未构建 APK。

## v9.1.18 - 2026-10-15

### 修复

- 手机首页用服务端全范围准确数量和最多三条最近进行中选题替代前 30 条分页推算；包含已通过、排除已完成/已驳回，失败显示未知，并准确标记团队/个人范围。
- 手机摘要和共用权限读取绑定账号、角色、凭证和请求代次；立即隐藏旧值，忽略迟到响应。桌面创建入口按实际权限显示，灵感预览补齐三条；权限加载状态采用稳定数组，避免命令面板反复渲染。
- 复盘返回列表前确认未保存结论，取消保留文字；刷新/关闭在未保存或写入期间提醒，保存成功后解除提醒，放弃离开不写服务器。

### 验证

- 隔离首页 API、OpenAPI 合同、首页/选题及复盘完整浏览器回归通过，覆盖超过 30 条、范围隔离、已通过、稳定排序、失败重试、390/1440px 账号迟到响应及离页保护。现有摘要 API 增加 `active_topics`，无数据库或权限模型变更；Android 仅同步 90118，未构建 APK；仅本地修改，不提交、推送或部署。

## v9.1.17 - 2026-10-15

### 修复

- 桌面/移动网页提报选题等待期间锁定表单、富文本和本机草稿切换/删除，并以同步锁防止重复提交；失败后恢复原稿编辑。最后一份已提交草稿清理失败会明确提醒，不再误报已清理。
- 复盘结论与已保存基线分开，行动项、快照、刷新及保存回执保留未保存的新文字；发布/归档前要求处理未保存结论，转为只读后也保留文字并提供明确的本地恢复确认。
- 行动项表格与详情编辑结果同步，真正未保存的本地编辑仍保留；复盘列表的筛选/账号和个人行动项读取忽略过期响应。
- 创作资料读取成功且编辑器就绪后才允许添加；插入期间搜索、选择与关闭受保护，单次插入/引用失败保留正文、草稿和选择以供重试。

### 验证

- 移动工作台、生产审阅、复盘行动项和复盘列表完整浏览器套件通过；安全草稿和多草稿合同通过。覆盖 320/390/1440px、亮暗主题、双击、失败重试、未保存结论、跨入口同步和迟到响应。类型检查与全仓 ESLint 通过（0 errors、299 warnings）。无 API、权限模型、数据库或真实业务数据变化；Android 仅同步元数据至 90117，未构建 APK；仅本地修改，不提交、推送或部署。

## v9.1.16 - 2026-10-15

### 改进

- 日报填写与团队入口依据实际权限展示，已有日报在无提交权限时保持只读；接口返回正确的填写能力，不再恒为可填写。报告中心只展示可访问的日报入口。
- 月报/年报保存期间锁定正文、年份与月份，并同步防止双击；保存失败保留原内容、恢复编辑和显式重试，避免保存回执覆盖等待期间的新输入。
- JSON 导出明确为对应模块的数据文件，不再冒充完整系统备份；成功反馈说明已生成并开始下载。CSV 状态与已知平台改用中文，JSON 数据代码保持不变。

### 修复

- 批注操作菜单挂到页面根层，按实际尺寸限制在视口内；支持 Escape 关闭，外部滚动或窗口变化后关闭，避免过期定位。

### 验证

- 日报权限 API、日报提交/总结保存恢复、分析/报告中心浏览器、创作审阅浏览器和编辑菜单几何合同通过。覆盖权限撤销后的管理层、只读已有/空日报、授权团队入口、月报失败解锁/重试与年报双击锁定、CSV/JSON 文件与导出失败重试、320px 批注菜单定位/关闭及协作恢复。无权限模型、数据库或真实数据变化；Android 仅同步元数据至 90116，未构建 APK；仅本地修改，不提交、推送或部署。

## v9.1.15 - 2026-10-14

### 改进

- 全局壳层、页面操作浮层、弹窗、通知、命令面板和编辑器菜单共用 Studio 层级令牌，操作提示始终位于普通弹窗之上，命令面板可在弹窗打开时输入。
- 编辑器浮动菜单挂到页面根层，跟随祖先滚动并限制在视口内，避免玻璃卡片裁切和高亮面板越出顶部。

### 验证

- 资源页真实叠加交互验证令牌调整后弹窗/通知/命令层同步变化，并通过点击输入确认可达；编辑器回归覆盖菜单层级、滚动、子菜单、协作恢复。命令面板、日报详情、移动工作台、登录和灵感浏览器套件通过。类型检查、定向 ESLint、构建和版本治理通过；ESLint 保留 12 条既有警告，构建保留大分包提示。无 API、权限或数据库变化；Android 仅同步元数据至 90115，未构建 APK；仅本地修改，不提交、推送或部署。

## v9.1.14 - 2026-10-14

### 修复

- 日报归档现在准确区分草稿、已提交、已审核、已退回和已归档；未知状态显示“状态待确认”，不再被误判为草稿或已提交。
- 日报提交失败后保留页面内重试说明，不再额外叠加会在重试成功后短暂残留的全局失败通知。
- 日报提交期间暂时锁定正文和刷新；同步防重复提交保护覆盖保存草稿与正式提交，失败后恢复编辑与重试。
- 资料、创作、选题和日报的未知状态映射只识别显式登记值，特殊未知字符串也能安全显示待确认提示。

### 验证

- 日报浏览器回归覆盖延迟提交期间锁定、双击单次写入、失败解锁/安全重试、归档状态及月报/年报完整详情；总结 API 合同和业务语言回退合同通过。类型检查、定向 ESLint、生产构建、版本/更新说明治理和 `git diff --check` 通过。无 API、权限、数据库或日报数据变化；Android 仅同步元数据至 90114，未构建 APK；仅本地修改，不提交、推送或部署。

## v9.1.13 - 2026-10-14

### 改进

- 资料详情、创作详情及选题列表将状态枚举翻译成中文业务用语。未知值统一显示待确认提示，不直接暴露内部代码。

### 验证

- `npm run test:resource-hover-contrast-browser` 覆盖资料映射、未知值回退、详情呈现及删除失败/重试恢复；`npm run test:production-review-browser` 覆盖创作状态映射、未知值回退和实际详情呈现，并回归协作审阅流程；`npm run test:topics-responsive-browser` 覆盖选题列表状态标签及响应式操作。类型检查、生产构建、版本/更新说明治理、测试入口、Android runtime 契约与 `git diff --check` 通过。无 API、权限、数据库或数据变化；Android 仅同步元数据至 90113，未构建 APK；仅本地修改，不提交、推送或部署。

## v9.1.12 - 2026-10-14

### 修复

- 全局操作提示现在显示在确认弹窗遮罩之上，弹窗内写入失败时仍能看见并关闭提示；桌面提示也加入礼貌播报，移动端保持相同层级。

### 验证

- `npm run test:resource-hover-contrast-browser` 覆盖资料删除失败提示、关闭提示后重试、确认成功及列表/详情恢复；其他选题、发布、复盘、灵感、设置与窄屏/主题隔离浏览器回归通过。类型检查、生产构建、版本/更新说明治理、测试入口、Studio 令牌门禁及 `git diff --check` 通过。无 API、权限、数据库或业务状态规则变化；Android 仅同步元数据至 90112，未构建 APK；仅本地修改，不提交、推送或部署。

## v9.1.11 - 2026-10-14

### 改进

- 登录页不再显示尚未接通的微信、企微和邮箱登录按钮，避免把没有实际动作的占位入口误当作可用登录方式。
- 将登录页重复的英文系统尾注统一为中文业务说明。

### 验证

- `npm run test:login-theme-contrast-browser` 覆盖三种登录布局、亮/暗主题、320px/390px 控件可见和无横向溢出，并按前景透明度计算实测对比度；隔离浏览器无意外错误。Playwright MCP 与 Chrome DevTools MCP 复核登录页快照和 320px 页面。类型检查、定向 ESLint、生产构建、版本/更新说明治理、测试入口、Studio 令牌门禁、Android runtime 契约及 `git diff --check` 通过。无 API、权限、数据库或真实账号变化；Android 仅同步元数据至 90111，未构建 APK；仅本地修改，不提交、推送或部署。

## v9.1.10 - 2026-10-14

### 改进

- 首页内容阶段改由服务端一次性汇总精确数量与每阶段最多 3 条预览；个人待续写稿件只返回当前操作人名下的草稿/退回稿，不再先拉 12 条稿件后在浏览器端筛选，避免漏掉较早的本人稿件。
- 首页失败时阶段数量保持“暂不可用”，并由单一提示提供重试；不重复显示同一汇总故障，也不把失败误报为空列表。
- 首页阶段预览标题与停留时间统一提高为 Studio 次级文字令牌；隔离浏览器实测亮/暗主题对比度均 ≥4.5:1。
- 成就清单为空时隐藏无可执行对象的“检查新成就”按钮。

### 验证

- `npm run test:home-dashboard`、`npm run test:api-contract`、`npm run test:topic-stage-record-repair-browser`、`npm run check`、定向 ESLint、生产构建及 `git diff --check` 通过。隔离 API 覆盖精确计数、每阶段三条上限、本人/负责人可见范围、操作人草稿范围及不返回正文；浏览器覆盖无旧列表请求、单条失败提示/重试、亮暗主题 4.5:1 阶段摘要对比度和 1440px/390px 页面。无数据库迁移、权限规则或真实数据变化；Android 仅同步元数据至 90110，未构建 APK；仅本地修改，不提交、推送或部署。

## v9.1.9 - 2026-10-13

### 修复

- 成就系统无已配置成就时，按管理权限分别说明下一步，不再让普通成员寻找看不到的管理员按钮；管理操作改为“启用预设成就”。积分榜空态明确说明当前状态与成员启用后的展示内容。
- 补齐成就筛选器的辅助名称与稳定字段标识、标题层级和计分文本对比度。
- 页面文档语言改为简体中文、补充产品描述，并为需登录的协作系统声明不参与搜索收录。

### 验证

- `npm run test:achievements-leaderboard-browser` 覆盖普通成员/管理员两种权限态、实际挂载页面、亮/暗主题、筛选名称与字段标识、对比度、标题层级、中文文档元数据、robots 规则、390px 无溢出和零业务写入；Chrome DevTools Lighthouse 复核无障碍、最佳实践和 SEO 均为 100。另复核灵感转选题回链、标题相似度、灵感亮暗主题及移动工作台 320/390px 流程；修正移动回归测试中“已完成”指标标题与任务状态重复匹配。`npm run check`、定向 ESLint（0 errors/0 warnings）、生产构建、版本/更新说明治理、测试入口、Studio 令牌门禁及差异检查通过；构建保留既有大分包提示。无 API、权限、数据库或真实成就/成员数据变化；Android 仅同步元数据至 90109，未构建 APK；仅本地修改，不提交、推送或部署。

## v9.1.8 - 2026-10-13

### 修复

- 全局顶栏搜索快捷键“Ctrl K”及移动端标题、未选中导航标签改用 Studio 次级文字令牌，修复深色主题下低于 4.5:1 的对比度问题。

### 验证

- 隔离浏览器回归覆盖亮/暗主题；系统设置浏览器测试、Chrome DevTools MCP 及 Lighthouse 在桌面/移动页面复核均通过，所测文本对比度不低于 4.5:1，移动 390px 无水平溢出；类型检查、生产构建、版本治理、Android runtime 契约及 Studio 令牌门禁通过。无 API、权限、数据库或真实数据变化；Android 仅同步元数据至 90108，未构建 APK；仅本地修改，不提交、推送或部署。

## v9.1.7 - 2026-10-13

### 修复

- 选题仅修改标题等非大纲字段时走页面聚合保存，不再依赖未挂载的大纲编辑器；编辑大纲时，保存和版本留档等编辑器准备完成后开放，并说明等待状态。

### 验证

- 编辑分支逻辑合同和隔离浏览器覆盖标题单独保存、大纲手动保存失败重试与版本留档。无 API、权限、数据库或真实业务数据变化；Android 仅同步元数据至 90107，未构建 APK；仅本地修改，不提交、推送或部署。

## v9.1.6 - 2026-10-13

### 修复

- 选题从创作或成片制作阶段推进前，在同一事务内校验当前阶段记录。记录缺失时明确要求先补齐，状态、历史与下一阶段记录一起回滚；桌面和移动端隐藏推进入口，补齐后可继续。移动端成功推进后同步显示服务端创建的目标阶段记录，避免误报缺失。
- 选题编辑器极少见的保存入口未就绪/已关闭错误改为说明本次修改未保存的用户语言，不再暴露内部状态名。

### 验证

- 选题 API 回归覆盖创作/成片记录缺失时不写入阶段、历史或目标记录，并验证补齐后重试成功；隔离浏览器覆盖桌面与移动端“补齐后推进”流程。无数据库迁移、权限变化或历史回填；Android 仅同步元数据至 90106，未构建 APK；仅本地修改，不提交、推送或部署。

## v9.1.5 - 2026-10-13

### 修复

- 移动个人页角色名称统一使用规范中文映射；未知/自定义角色不再误显示为“成员”或暴露内部角色代码。

### 验证

- `npm run test:mobile-role-labels` 覆盖所有内置角色、未知及缺失角色；`npm run test:mobile-work-center-browser` 验证 390px 个人页显示“普通人员”，并回归 320px/390px 移动工作台与拍摄/发布流程。无 API、权限、数据库或业务规则变化；Android 仅同步元数据至 90105，未构建 APK；仅本地修改，不提交、推送或部署。

## v9.1.4 - 2026-10-13

### 优化

- 发布记录删除、抖音数据关联刷新和作品关联加入同步单飞保护；等待服务端确认时锁定相关操作入口，避免快速连点发出重复写入。
- 发布列表和抖音作品候选搜索增加可访问名称及稳定控件标识，修复浏览器检测到的无名称表单项。

### 验证

- 延迟 DELETE/POST/PUT 隔离浏览器确认重复触发只执行一次，写入在途时阻止取消/改开关联弹窗；浏览器也确认两个搜索字段均可按名称定位。`npm run test:publishing-hover-contrast-browser`、`npm run check`、目标 ESLint、生产构建、版本/更新说明治理、Android runtime 契约、测试入口检查和 `git diff --check` 通过。构建保留既有 >500kB 分包提示。Android 仅同步元数据至 90104，未构建 APK；未提交、推送或部署。

## v9.1.3 - 2026-10-13

### 新增

- 无

### 优化

- 编辑稿离开页面时，明确说明最后一次尚未确认保存的修改可能无法恢复，避免使用内部实现术语。
- 发布记录保存期间锁定表单并阻止重复提交，避免快速连点创建重复记录。

### 修复

- 无

### 技术升级

- 无

### 数据库变化

- 无

### 测试情况

- `npm run test:workflow-details-responsive-browser`、`npm run test:publishing-hover-contrast-browser`、`npm run check`、目标 ESLint 通过；保留编辑器对话框文件原有 1 条 Fast Refresh warning。无 API、权限或数据库变化；Android 仅同步版本元数据至 90103，未构建 APK；仅本地修改，不提交、推送或部署。

## v9.1.2 - 2026-10-13

### 修复

- 首页任务区入口改为“进入选题管理”，不再把只打开选题列表的操作描述成查看全部跨模块任务。
- 桌面选题管理的搜索框、列表/看板筛选及移动端搜索增加稳定控件标识和可访问名称；用户菜单名称包含可见账号与角色信息，动画标题保留静态读屏标题。

### 验证

- Playwright MCP 验证首页入口实际进入选题管理；桌面列表/看板与 390px 移动筛选控件名称/标识回归通过。Chrome DevTools MCP 的列表/看板 Lighthouse 快照可访问性与最佳实践均为 100。
- `npm run test:topic-stage-record-repair-browser`、`npm run test:topics-responsive-browser`、`npm run test:mobile-work-center-browser`、`npm run check`、定向 ESLint、生产构建、版本/更新说明治理及 Android runtime 契约通过；ESLint 保留 SplitText 文件原有 4 条 warning，构建保留既有 >500kB 分包提示。没有新增 API、权限、数据库或业务数据变化；未部署、提交或推送。

## v9.1.1 - 2026-10-13

### 新增

- 桌面首页“最近变化”可选展示近 7 天播放变化和最新粉丝总数；保留数据来源的真实口径与更新时间说明。

### 优化

- 只向已有创作者数据查看权限的账号读取；无权限、无账号或指标缺失时隐藏，不把缺失值显示为 0。读取失败独立提示并支持只读重试。

### 修复

- 无

### 技术升级

- 无

### 数据库变化

- 无

### 测试情况

- `npm run test:topic-stage-record-repair-browser`、`npm run check`、定向 ESLint 通过；覆盖权限门禁、空指标不显示、读取失败重试与 390px 独立移动工作台兼容。未部署、提交或推送。

## v9.1.0 - 2026-10-13

### 新增

- 首页“最近变化”改为服务端汇总显式稿件版本、批注/回复和选题状态历史，最多显示 12 条，并可直达对应稿件或选题。
- 活动摘要严格沿用内容可见范围，只返回标题、类型、时间和站内链接，不返回稿件、批注、回复或历史备注正文；读取失败独立提示并支持只读重试。

### 优化

- 首页不再为“最近变化”额外读取发布记录列表，避免把普通更新时间或当前状态误当作新事件。

### 验证

- SQLite/API 覆盖个人/管理者范围、稿件版本/批注/回复/选题状态、正文隔离和上限；OpenAPI 契约、首页浏览器跳转与独立失败重试、类型检查和定向 ESLint 通过。无数据库迁移或权限规则变化；Android 仅同步版本元数据至 90100，未构建 APK；仅本地修改，不提交、推送或部署。

## v9.0.7 - 2026-10-13

### 修复

- 内容复盘导航入口与页面路由统一使用 `analytics:retro:view`，避免入口权限与目标页门禁不一致。

### 验证

- 前端挂载合同覆盖导航权限与路由门禁一致。无 API、数据库或授权规则变化；Android 仅同步版本元数据至 90007，未构建 APK；未部署，仅本地修改。

## v9.0.6 - 2026-10-13

### 修复

- 首页内容流“复盘”阶段不再用已发布记录数和固定文案冒充复盘；改为显示真实复盘总数及最多三条复盘周期摘要。
- 复盘摘要沿用复盘列表既有可见范围，仅读取标题、周期、状态和更新时间；摘要读取失败时明确标记不可用，不影响首页其他数据。

### 验证

- 隔离 SQLite/API 覆盖管理者、个人可见范围、`analytics:retro:view`、摘要字段和预览上限；桌面浏览器验证真实复盘卡片、单独失败隔离及跳转复盘中心，移动工作台在 320px/390px 回归确认接口兼容与布局无溢出。无数据库迁移或权限规则变化，未部署。Android 仅同步版本元数据至 90006，未构建 APK。

## v9.0.5 - 2026-10-13

### 新增

- 发布归档详情可回到来源选题，显示成片/发布剧本的来源创作版本，可直达准确历史稿，并展开查看归档保留的来源正文快照。

### 修复

- 来源不可用、未记录或旧归档缺少来源信息时明确说明，不从当前稿件推断。

### 验证

- 隔离浏览器覆盖准确来源、正文快照、缺失边界、既有查看权限和 320px/390px 移动端；无权限规则、数据库迁移或真实业务写入，未部署。Android 仅同步元数据至 90005，未构建 APK。

## v9.0.4 - 2026-10-13

### 新增

- 创作初稿的选题大纲来源版本可直达选题历史；桌面自动展开准确大纲版本，移动网页以只读方式显示精确快照。

### 修复

- 来源版本不可定位时明确告知且不回退到当前大纲；来源历史页面隐藏当前选题编辑和工作流操作。

### 验证

- 隔离浏览器覆盖来源跳转、桌面/390px 精确历史正文、未找到来源边界及只读操作；未写入真实业务数据。无数据库迁移、未部署；Android 仅同步元数据至 90004，未构建 APK；仅本地修改，不提交或推送。

## v9.0.3 - 2026-10-13

### 修复

- 创作历史清理会保留仍被成片/发布文稿历史版本引用的来源版本；删除创作记录前也会检查逐版本来源，避免历史卡片指向已删除内容。

### 验证

- 隔离 API/SQLite 回归覆盖历史来源保留、精确历史读取和仅由历史文稿引用时拒绝删除。无数据库迁移、无真实数据写入；未部署；Android 仅同步元数据至 90003，未构建 APK；仅本地修改，不提交或推送。

## v9.0.2 - 2026-10-13

### 新增

- 成片与发布文稿的每一条历史版本展示其保存时记录的来源创作版本，并可直达该准确版本；旧版本来源没有记录时明确显示未记录。

### 验证

- 隔离浏览器覆盖来源版本写入、历史卡片显示、创作版本直达、未记录基线及窄屏可达；未写入真实业务数据。未部署；Android 仅同步版本元数据至 90002，未构建 APK；仅本地修改，不提交或推送。

## v9.0.1 - 2026-10-13

### 新增

- 创作初稿来源快照可关联到内容完全一致且唯一的选题大纲显式版本，并在桌面与移动创作详情中显示版本号。

### 数据边界

- migration 030 仅为来源快照增加可空版本字段；不回填旧记录、不将基线或重复内容猜作明确版本。没有唯一匹配时保留原文快照并明确显示未推断。

### 验证

- 隔离迁移/API/数据库测试与桌面、移动浏览器回归通过；未执行生产迁移或部署。Android 仅同步版本元数据至 90001，未构建 APK；仅本地修改，不提交或推送。

## v9.0.0 - 2026-10-13

### 新增

- 选题大纲、拍摄剧本和发布文稿支持用户显式保存小版本/大版本，并可展开查看对应历史正文。

### 优化

- 首次建立版本历史时保留未改动前的基线快照；来源创作版本继续作为追溯信息。

### 修复

- 删除文稿所属的选题、拍摄或发布记录时，在同一事务清理对应历史，避免遗留孤立快照。

### 技术升级

- 新增工作流文稿版本服务、冲突保护和只读历史预览。
- 新增 Studio 焦点环语义别名并映射到现有主色令牌。

### 数据库变化

- migration 029 以 SAFE_EXPAND 方式新增 `workflow_document_versions` 表和索引；不回填旧稿，不伪造旧记录时间或操作人。

### 测试情况

- 迁移幂等、版本递增、过期正文拒绝、来源追溯、发布归档同步及删除清理测试通过；桌面/移动隔离浏览器验证三类文稿的显式版本保存与历史正文查看。
- 本地修改；未提交、推送、部署或执行生产数据库迁移。Android 仅同步版本元数据至 90000，未构建 APK。

## v8.5.23 - 2026-10-13

### 修复

- 选题列表流程进度标签保持单行，避免窄表格列内逐字换行，横向展示审核、通过、创作、成片、发布和完成阶段。

### 边界

- 隔离浏览器覆盖选题表格 1366px/1440px/1920px 与 80%–125% 缩放；无 API、权限或数据库变化。Android 仅同步版本元数据至 80523，未构建 APK；仅本地修改，不提交、推送或部署。

## v8.5.22 - 2026-10-13

### 修复

- 移动选题详情的“保存修改/进入创作”操作栏避开固定底部导航；选题列表和详情统一用北京时间显示截止日期、更新时间，避免原始 ISO 时间戳及窄屏截断。

### 边界

- 隔离浏览器覆盖 320px/390px 选题列表和详情、日期呈现、操作栏与导航不重叠及无横向溢出。无 API、权限或数据库变化；Android 仅同步版本元数据至 80522，未构建 APK；仅本地修改，不提交、推送或部署。

## v8.5.21 - 2026-10-13

### 修复

- 移动创作保存/提交期间临时锁定正文和选题，避免在请求处理中继续编辑导致服务端保存旧正文、随后清掉本地新修改。

### 边界

- 隔离浏览器验证延迟写入期间正文不可编辑、审核提交不可与草稿保存并发；未改变 API、权限或数据库。Android 仅同步版本元数据至 80521，未构建 APK；仅本地修改，不提交、推送或部署。

## v8.5.20 - 2026-10-13

### 修复

- 移动端新建稿件会读取可关联选题；选题读取失败时可重试，不再被误导成无权限。
- 移动创作稿保存/提交增加同步互斥；快速双击只产生一次写入，失败后保留内容并可重试。

### 边界

- 隔离浏览器验证选题读取失败与恢复、延迟写入下双击防重及失败后重试。无 API、权限或数据库变化；Android 仅同步元数据至 80520，未构建 APK；仅本地修改，不提交、推送或部署。

## v8.5.19 - 2026-10-12

### 修复

- 移动日报保存/提交增加同步互斥；接口响应前快速双击只产生一次草稿保存，不再留下并发的版本冲突或误导性错误。

### 边界

- 隔离浏览器在延迟保存响应时验证双击仅一次写入；无 API、权限或数据库变化。Android 仅同步元数据至 80519，未构建 APK；仅本地修改，不提交、推送或部署。

## v8.5.18 - 2026-10-12

### 修复

- 移动日报界面按登录账号隔离；账号切换后旧状态立即移除，迟到读取不能覆盖当前日报。
- 日报保存完成时若账号已变化，不会继续以新账号身份提交旧账号日报。

### 边界

- 无 API、权限或数据库变化；隔离浏览器覆盖延迟读取的账号切换场景。Android 仅同步元数据至 80518，未构建 APK；仅本地修改，不提交、推送或部署。

## v8.5.17 - 2026-10-12

### 修复

- 移动选题列表读取失败不再误显示成空结果；失败时给出提示、保留上次成功数据并提供重试。

### 边界

- 无 API、权限或数据库变化；Android 仅同步元数据至 80517，未构建 APK；仅本地修改，不提交、推送或部署。

## v8.5.16 - 2026-10-12

### 修复

- 移动创作列表刷新失败时说明仍显示上次成功读取的数据；提供明确重试入口，成功后更新列表并清除旧提示。
- 账号切换时清理旧列表并忽略迟到的上一账号请求。

### 边界

- 无 API、权限或数据库变化；Android 仅同步元数据至 80516，未构建 APK；仅本地修改，不提交、推送或部署。

## v8.5.15 - 2026-10-12

### 修复

- 移动端选题关联资料读取失败会提示未完成并提供安全重试，避免误报“暂无关联资料”。

### 边界

- 权限初始化不会重复触发资料读取；重试为只读请求。浏览器回归与版本门禁通过，生产构建仍有既有 >500kB 分包提示。无 API、权限或数据库变化；Android 仅同步元数据至 80515，未构建 APK；仅本地修改，不提交、推送或部署。

## v8.5.14 - 2026-10-12

### 修复

- 选题详情保存失败会说明修改仍保留；修复保存中状态未复位导致无法重试的问题。

### 边界

- Playwright MCP 与 Chrome DevTools MCP 隔离验证失败不写入、草稿保留与显式重试成功；类型检查、生产构建和版本门禁通过。无 API、权限或数据库变化；Android 仅同步元数据至 80514，未构建 APK；仅本地修改，不提交、推送或部署。

## v8.5.13 - 2026-10-12

### 改进

- 编辑器工具栏浮层的锚点滚出可视区时自动收起，避免菜单残留在其它内容上方并拦截操作。

### 边界

- 隔离浏览器在 1200×839 验证打开“更多操作”后滚动离开工具栏会收起菜单；编辑器审阅、协作恢复和资料重试回归通过。无 API、权限或数据库变化。Android 仅同步版本元数据至 80513，未构建 APK；仅本地修改，不提交、推送或部署。

## v8.5.12 - 2026-10-12

### 改进

- 编辑器新增/编辑批注统一使用 Studio 对话框，补齐可访问名称与输入关联，并支持从任意焦点按 Escape 取消。
- 对话框挂载到页面根层，避免窄屏时被动画或滚动容器移出视口。

### 边界

- 隔离浏览器覆盖 320px 浅色视口、深色主题对比度、Escape 不写入及批注新增/编辑；完整审阅、协作恢复和资料重试回归通过。无 API、权限或数据库变化。Android 仅同步版本元数据至 80512，未构建 APK；仅本地修改，不提交、推送或部署。

## v8.5.11 - 2026-10-12

### 改进

- 登录安全升级页面改用业务人员易懂的准备事项与风险说明。
- 管理员展开技术明细后仍可查看原始风险原因和配置来源。

### 边界

- 仅调整页面文案与显示映射，无 API、权限、数据库或 Android 原生行为变化。Android 仅同步版本元数据至 80511，未构建 APK；仅本地修改，不提交、推送或部署。

## v8.5.10 - 2026-10-12

### 改进

- 作品库桌面表格的作品标题改为可键盘聚焦的详情链接，按 Enter 可打开对应作品复盘；保留整行鼠标操作。
- 隔离浏览器验证焦点可达和键盘导航，不读取或写入真实作品数据。

### 边界

- 无 API、权限或数据库变化。Android 仅同步版本元数据至 80510，未构建 APK；仅本地修改，不提交、推送或部署。

## v8.5.9 - 2026-10-12

### 改进

- 发布管理的抖音关联、编辑、链接和删除操作在窄屏横向表格中固定可见。
- 四类操作补充包含发布内容标题的辅助名称；320px 亮/暗主题验证固定列位置、按钮可见和横向滚动仍可用。

### 边界

- 无 API、权限、数据库或 Android 原生行为变化。Android 仅同步版本元数据至 80509，未构建 APK；仅本地修改，不提交、推送或部署。

## v8.5.8 - 2026-10-12

### 改进

- 创作列表接入统一响应式表格壳；窄屏仍可横向查看全部字段，右侧查看/编辑操作固定在可视区域内。
- 查看和编辑按钮加入包含选题标题的辅助名称；在 320px 视口验证操作可达、横向滚动保留及编辑弹窗可打开/退出。

### 边界

- 无 API、权限、数据库或 Android 原生行为变化。Android 仅同步版本元数据至 80508，未构建 APK；仅本地修改，不提交、推送或部署。

## v8.5.7 - 2026-10-12

### 改进

- 创作列表新建/编辑弹窗统一复用 Studio 对话框，补齐对话框可访问名称、Escape 关闭和窄屏内部滚动；保存期间阻止误关闭。
- 在 320px 浅色新建与 390px 深色编辑视口验证弹窗边界、令牌表面、内部滚动、Esc 关闭及创建/编辑后的列表反馈。

### 边界

- 无 API、权限、数据库或 Android 原生行为变化。Android 仅同步版本元数据至 80507，未构建 APK；仅本地修改，不提交、推送或部署。

## v8.5.6 - 2026-10-12

### 改进

- 首次登录强制改密弹窗改为 Studio 主题令牌，在浅色和深色模式下保持文字、输入框与操作清晰。
- 修复认证态更新先触发首页跳转、导致首次改密弹窗被离开的竞争；隔离浏览器覆盖三种登录布局、明暗主题与对话框对比度。

### 边界

- 无 API、权限、数据库或 Android 原生行为变化。Android 仅同步版本元数据至 80506，未构建 APK；仅本地修改，不提交、推送或部署。

## v8.5.5 - 2026-10-12

### 改进

- 外观中心按钮动效、AI 按钮与亮暗主题统一使用 Studio 语义色令牌，取消独立硬编码色板。
- 双主题隔离浏览器验证 AI 按钮对比度、边框/星光/电流/火花/光泽效果实际解析颜色及 320px 布局。

### 边界

- 无 API、权限、数据库或 Android 原生行为变化。Android 仅同步版本元数据至 80505，未构建 APK；仅本地修改，不提交、推送或部署。

## v8.5.4 - 2026-10-12

### 改进

- React Bits 渐变、闪光和聚焦文本动效改用 Studio 亮暗主题颜色令牌；文本槽不再订阅冗余的全局主题状态。
- 隔离浏览器验证 320px 下亮/暗渐变分别解析到当前主题令牌，并保留外观设置的无写入预览边界。

### 边界

- 无 API、权限、数据库或 Android 原生行为变化；Android 仅同步版本元数据至 80504，未构建 APK；仅本地修改，不提交、推送或部署。

## v8.5.3 - 2026-10-12

### 改进

- 外观中心亮/暗预览和开发验收矩阵统一使用 Studio 背景、边框、文字与对比色令牌，不再用 slate/白色固定色板覆盖作用域主题。
- 隔离浏览器在 320px 下验证两种主题的令牌计算、矩阵标签对比度及无横向溢出；预览过程中不保存个人设置。

### 边界

- 仅外观预览呈现与验证变化，不保存个人设置；无 API、权限、数据库或 Android 原生行为变化。Android 仅同步版本元数据至 80503，未构建 APK。
- 仅本地修改，不提交、推送或部署。

## v8.5.2 - 2026-10-12

### 改进

- 手机浏览器查看历史创作版本时，会显示该版本独立保存的只读资料快照。
- 历史记录明确区分“未记录快照”与“已记录但为空”，不会用当前草稿代替旧内容。

### 边界

- 仅手机浏览器启用该展示；Android 原生移动编辑器不变，留待未来专项处理。无 API、权限或数据库变化；Android 仅同步版本元数据至 80502，未构建 APK。
- 仅本地修改，不提交、推送或部署。

## v8.5.1 - 2026-10-12

### 新增

- 手机宽度下，成片详情新增创作来源版本入口，可直达其引用的准确历史稿。

### 优化

- 保留既有安全离开检查；历史来源仍只读，不会以当前正文或资料草稿冒充旧版本。
- 补充选题列表窄窗口下批量操作条可见性回归。

### 修复

- 补齐成片来源在手机浏览器中因入口仅位于隐藏侧栏而不可达的问题。

### 技术升级

- 扩展隔离浏览器回归，验证成片与发布两条来源路径、当前资料草稿隔离及窄屏操作可见性。

### 数据库变化

- 无。

### 测试情况

- 桌面/手机来源追溯、选题窄窗口、模板、作品库、设置、分析、公告、活动记录，以及灵感/资料/发布/匿名反馈/复盘的隔离浏览器回归通过；类型检查、生产构建及版本/更新说明/测试入口/Studio 门禁通过。通用认证态亮色主题测试因配置的本机服务未运行而未执行。Android 仅同步版本元数据至 80501，未构建 APK；仅本地修改，不提交、推送或部署。移动编辑器的历史资料快照展示仍留待未来 Android 专项；B6、B8 与 B4/B5 全站范围仍开放。

## v8.5.0 - 2026-10-12

### 改进

- 创作记录生成历史版本时，将当时独立保存的资料草稿一并写入对应历史记录，确保正文与辅助资料按同一版本追溯。
- 桌面创作历史页显示该历史版本的只读资料快照，不再请求或展示当前资料草稿；旧版本无记录时明确标记“未记录”，明确保存为空时显示空快照。
- 新增迁移 028，仅为历史记录增加可空快照字段；旧记录不回填、不推断，保留“未知”与“明确为空”的区别。

### 测试情况

- 迁移重复执行与旧记录保留、HTTP 版本创建/事务/精确历史读取、桌面历史快照隔离浏览器回归通过；类型检查通过。Android 仅同步元数据至 80500，未构建 APK；仅本地修改，不提交、推送或部署。B6 全链路、B8 其他写入路径、B4/B5 全站审计仍开放。

## v8.4.8 - 2026-10-12

### 修复

- 成片和发布详情展示精确创作来源版本时间：当前稿取最近更新时间，历史稿取对应历史快照时间。
- 成片时间线不再用成片自身更新时间冒充来源版本时间，避免编辑衍生剧本造成来源历史时间漂移。
- 浏览创作历史版本时明确标注资料区展示的是该生产记录当前整理草稿，不冒充对应历史版本快照。

### 测试情况

- `npm run test:workflow-script-source` 在隔离 SQLite/API 环境验证当前版、历史版和成片更新时间边界；`npm run test:workflow-details-responsive-browser` 确认衍生稿来源时间及历史预览中的资料草稿边界说明。无数据库结构、权限或真实业务数据变化；Android 仅同步元数据至 80408，未构建 APK；仅本地修改，不提交、推送或部署。

## v8.4.7 - 2026-10-12

### 修复

- 创作详情和历史分页读取按请求序号保护当前路由；旧生产记录响应不会覆盖已切换到的新稿。
- 创作资料面板按生产记录 ID 隔离生命周期；旧资料读取不会覆盖新记录，切换时未完成的自动保存仍写回原记录，离开原稿后晚到的来源结果会被丢弃。

### 测试情况

- `npm run test:workflow-details-responsive-browser` 覆盖旧详情响应和延迟历史分页不污染新路由、旧资料 GET 晚回、切换时待保存草稿写回原记录，以及晚到的来源查找不插入新稿；既有来源历史、归档恢复、桌面/窄屏回归通过。`npm run test:production-materials`、类型检查、生产构建、版本/更新说明/入口/Studio 门禁、定向 ESLint 与 `git diff --check` 通过。无 API、权限、数据库或真实业务资料变化；Android 仅同步元数据至 80407，未构建 APK；仅本地修改，不提交、推送或部署。B8 其他写入路径、B4/B5 全站审计及 B6 完整跨模块来源历史仍开放。

## v8.4.6 - 2026-10-12

### 优化

- Creator Agent 一次性绑定码使用同步锁防止快速重复生成；有效期显示服务端返回的准确截止时间。
- 绑定码创建失败保留此前已确认的绑定码并显示错误，恢复后显式重试可生成新码。
- Creator Dashboard 账号切换隐藏旧范围数据；三个并发读取会丢弃过期结果，防止慢账号响应覆盖当前账号。

### 测试情况

- `npm run test:creator-topic-suggestions-browser` 覆盖慢账号→快账号反序响应、快速双触发仅发一次 POST、账号范围、过期时间展示、503 后保留旧码和重试；`npm run test:creator-topic-suggestions` 覆盖反馈/API合同。版本、类型检查、构建、更新说明/测试入口治理、定向 ESLint 与 `git diff --check` 通过。无真实绑定码、权限或数据库变化；Android 仅同步元数据至 80406，未构建 APK；仅本地修改，不提交、推送或部署。

## v8.4.5 - 2026-10-12

### 优化

- Creator Center 运营报告重载期间禁用生成和删除；删除确认打开时禁止并行启动重载，避免读写相互覆盖。
- 报告读取采用请求序号，忽略较早返回的列表；生成/删除获服务端确认后也会使先前请求失效。

### 测试情况

- `npm run test:creator-reports-browser` 覆盖生成后列表刷新失败、删除确认与重载互斥、延迟重载期间写入入口禁用及只读恢复；类型检查、生产构建、版本/更新说明/测试入口治理、定向 ESLint 与 `git diff --check` 通过。构建保留既有 >500kB 分包警告。无 API、权限、数据库或真实报告数据变化；Android 仅同步元数据至 80405，未构建 APK；仅本地修改，不提交、推送或部署。

## v8.4.4 - 2026-10-12

- 站内消息单条已读改为按当前账号原子更新；批量已读拒绝格式错误的 ID 参数，按当前账号去重并在事务内更新。响应返回真实匹配/变更数量，不再按请求数组长度虚报；桌面成功提示使用服务端确认数。已确认的已读/清空操作使旧列表请求失效，避免旧汇总覆盖成功结果。隔离 SQLite 覆盖单条/批量账号边界、重复/已读/越权/不存在 ID、非法请求及全账号计数；隔离浏览器覆盖清空失败恢复及延迟旧读请求不复活汇总。无数据库结构或权限规则变化；Android 仅同步元数据至 80404，未构建 APK；仅本地修改，不提交、推送或部署。

## v8.4.3 - 2026-10-12

- 角色存在性、系统角色保护及使用人数检查与角色权限映射/角色记录删除改为同一事务；删除失败整体回滚，权限缓存只在成功后清理。隔离 SQLite 验证仍被分配的角色拒删、触发删除失败时角色和权限均保留、恢复后删除成功。无数据库结构或权限规则变化；Android 仅同步元数据至 80403，未构建 APK；仅本地修改，不提交、推送或部署。

## v8.4.2 - 2026-10-12

- 选题创建、普通编辑、审核和补建阶段记录所需的详情/历史读回现在都在主事务内完成；读回失败会回滚相关业务状态、阶段稿件和操作记录。通知接收人读取不会在主写入确认后使接口误报失败，实时事件只在提交后发送。隔离 SQLite 故障注入验证创建/编辑/审核/补建回滚及恢复；无数据库结构或权限规则变化。Android 仅同步元数据至 80402，未构建 APK；仅本地修改，不提交、推送或部署。

## v8.4.1 - 2026-10-12

- 灵感评论写入、更新时间和响应数据读取在一个事务内完成；投票记录与投票数在一个事务内同步；删除灵感与清理评论/投票记录也作为整体提交。注入 SQLite 故障验证失败回滚、恢复重试、权限拒绝无副作用及最终数据一致。无数据库结构或权限规则变化；Android 仅同步元数据至 80401，未构建 APK；仅本地修改，不提交、推送或部署。

## v8.4.0 - 2026-10-12

- 成片/发布剧本已确认保存但发布归档刷新失败时，接口和页面会分开反馈主写入与归档状态；详情重载会检测归档脚本快照是否落后。用户可用新重试入口只重建已保存内容的归档，不重复提交主记录；重试接口沿用成片/发布权限与选题编辑范围。隔离 SQLite 注入归档写失败并验证主记录保持成功、详情待同步可见、重试失败保留状态、恢复后归档准确刷新。无数据库结构或权限规则变化；Android 仅同步元数据至 80400，未构建 APK；仅本地修改，不提交、推送或部署。

## v8.3.3 - 2026-10-12

- 创作新版本更新、旧稿历史快照和大版本替代关系现放在同一事务提交；历史写入失败时当前正文和版本号回滚，隔离测试验证失败后可安全重试。版本清理失败作为维护问题记录，不再把已确认保存误报为失败。无数据库结构或权限变化；Android 仅同步元数据至 80303，未构建 APK；仅本地修改，不提交、推送或部署。

## v8.3.2 - 2026-10-12

- 资料创建、更新、回收/恢复、标签绑定/解绑、资料关联增删及文件元数据增删，现与对应操作记录在同一事务提交；选题详情侧的资料关联/解除也一并原子化。日报提交/审核、复盘各项写入、用户创建/更新/删除、改密和个人资料更新同样把业务变更与操作记录纳入同一事务；停用用户时还会在该事务内撤销活动会话，避免部分完成。隔离 SQLite 验证失败回滚和重试。审计失败会返回安全错误；真正的唯一关联冲突仍返回 409。内容资产页、选题模板页及设置中心通知偏好修正辅助文字对比度并统一使用 Studio 次级文字令牌；通知偏好窄屏下权限按钮纵向排列、状态标签保持单行，模板列表刷新失败会区分已确认写入并提供只读恢复。隔离测试逐类验证回滚、安全重试和冲突反馈；浏览器覆盖筛选、通知保存恢复及 320/390/1440px 亮暗主题。无数据库结构或权限变化；Android 仅同步元数据至 80302，未构建 APK；仅本地修改，不提交、推送或部署。

## v8.3.1 - 2026-10-12

- 创作资料草稿保存接口现在直接返回本次事务已确认的内容、修订号和更新时间，不再依赖提交后额外读取；避免读回异常把已保存内容误报为失败并导致重试冲突。隔离数据库测试模拟读回未命中并验证响应与持久结果。无数据库结构或权限变化；Android 仅同步元数据至 80301，未构建 APK；仅本地修改，不提交、推送或部署。

## v8.3.0 - 2026-10-12

- 资料库与知识库“分类管理”现在可新增、改名、移动和删除分类；删除被资料或子分类占用的分类时会保留服务端原因。写入成功后的分类列表刷新失败提供只读重试并阻止重复操作；知识库“新增资料”现已接入创建弹窗并打开已创建资料详情。分类移动/改名在同一事务内重建所有后代路径，循环关系拒绝保存。隔离 API 与浏览器回归覆盖权限、路径、失败恢复、320px 窄屏及知识库新增跳转。无数据库结构或新权限变化；Android 仅同步版本元数据至 80300，未构建 APK；仅本地修改，不提交、推送或部署。

## v8.2.3 - 2026-10-12

- 资料草稿说明原资料更新或移入回收站后的内容保留边界；已复制的资料不会因此消失，来源回收后可能无法打开。隔离 API 回归确认来源回收后拒绝再次插入且不改动已保存草稿或正式正文。`production-review-browser` 的选区交互改为等待正文实际布局并使用鼠标拖选，避免主题重载时标题先出现造成不稳定断言；完整审阅回归连续两次通过。无 API、权限或数据库变化；Android 仅同步元数据至 80203，未构建 APK；仅本地修改，不提交、推送或部署。

## v8.2.2 - 2026-10-12

- 修正生产审阅窄屏右键菜单回归的点击方式：通过目标编辑器执行右键并由 Playwright 自动滚入可视区，避免复用桌面页后拿到屏外坐标造成误报。全套生产审阅与协作浏览器回归通过；仅测试校准，无用户可见功能、API、权限或数据库变化。Android 仅同步元数据至 80202，未构建 APK；仅本地修改，不提交、推送或部署。

## v8.2.1 - 2026-10-12

- 资料选择器分别展示来源是否已加入创作资料草稿、已引用到正文或两处均有，避免把两条内容线混为一谈。回归覆盖草稿与正文来源状态及只读查询；无 API、权限或数据库变化。Android 仅同步元数据至 80201，未构建 APK；仅本地修改，不提交、推送或部署。

## v8.2.0 - 2026-10-12

- 创作资料区明确为独立整理草稿，不会自动改动正式正文；资料库内容加入草稿时保留引用正文和可点击的资料来源链接。
- 只有明确选择“引用到正文”才写入创作正文；隔离浏览器/API 回归验证草稿保存与正式正文互不覆盖。无 API、权限或数据库变化。Android 仅同步版本元数据至 80200，未构建 APK；仅本地修改，不提交、推送或部署。

## v8.1.0 - 2026-10-12

- 从选题大纲创建的创作初稿会保存原文来源快照；桌面和移动创作详情可回看，后续改纲/改稿不会改写快照。手工建稿仅在服务端确认页面大纲仍与事务内最新大纲一致时记录来源；过期内容拒绝创建。
- 旧稿来源不猜测、不回填。迁移 027 只新增 SAFE_EXPAND 追溯表；无权限范围变化。Android 仅同步版本元数据至 80100，未构建 APK；仅本地修改，不提交、推送或部署。

## v8.0.1 - 2026-10-09

- 桌面和移动网页从成片或发布详情打开历史创作来源时，按精确版本读取并以只读方式显示；来源版本不可用时 fail-closed，不以当前稿替代。移动网页返回当前版本前先等待数据加载，避免旧历史正文进入当前协作稿。
- `test:workflow-details-responsive-browser` 覆盖桌面与 390px 移动端来源跳转、历史/当前正文区分、不可用版本保护及返回路径；无 API、权限或数据库变化。Android 仅同步元数据至 80001，未构建 APK；仅本地修改，不提交、推送或部署。

## v8.0.0 - 2026-10-09

- 成片/发布剧本首次保存时记录对应的已审核创作版本；详情可追溯准确来源，发布归档也保留成片与发布剧本的来源关系。旧剧本来源未知时不猜测、不回填。
- 被阶段剧本引用的历史创作版本不会在版本清理时移除；引用中的创作记录不能被删除，归档同时保留准确来源文本快照。
- 新增安全扩展迁移 026，仅添加可空追溯字段。Android 仅同步版本元数据至 80000，未构建 APK；仅本地修改，不提交、推送或部署。

## v7.8.47 - 2026-10-09

- 成片与发布详情按 `script_content` 是否为 `null` 判断是否存在独立本地剧本；空字符串也代表用户保存的空白分支，不再回退显示创作原稿。
- `npm run test:workflow-details-responsive-browser` 覆盖成片/发布两条隔离详情：空白独立稿保留分支标识、不显示创作原稿；发布详情显示“暂无剧本内容”。Playwright MCP 与 Chrome DevTools MCP 复核桌面页面；无真实稿件、API、权限或数据库变化。Android 仅同步元数据至 70847，未构建 APK；仅本地修改，不提交、推送或部署。

## v7.8.46 - 2026-10-09

- 编辑器选区浮动菜单的文字颜色/高亮颜色标题去除低对比透明度，统一使用 Studio 次级文字令牌。
- `npm run test:production-review-browser` 现以亮/暗主题实际渲染透明度计算两类面板标题对比度并要求 ≥4.5:1；验证原桌面/移动审阅、工具栏和协作恢复流程通过。无 API、权限或数据库变化；Android 仅同步元数据至 70846，未构建 APK；仅本地修改，不提交、推送或部署。

## v7.8.45 - 2026-10-09

- CommandPalette 窄屏搜索行允许输入框收缩，修复 320px 下 ESC 快捷键提示超出面板并被裁切；命令说明、搜索分类、占位文字和结果摘要改用 Studio 次级文字色，保证暗色主题文字对比。
- `npm run test:global-search-browser` 覆盖 320px 亮/暗主题初始列表与搜索结果、面板宽度/裁切、占位符与全部面板文字对比。Playwright MCP 与 Chrome DevTools MCP 交叉核对 320px 页面无横向溢出、ESC 提示完整显示。无 API、权限、数据库或真实业务数据变化；Android 仅同步元数据至 70845，未构建 APK；仅本地修改，不提交、推送或部署。

## v7.8.44 - 2026-10-09

- 创作详情浏览器回归补齐 320px 移动网页的返回、格式、保存和提交流程可见性/裁切检查；右键浮层测试改为先加载桌面编辑器再缩小视口，避免误测移动壳。
- `npm run test:production-actions-responsive-browser` 覆盖 320px 窄屏和 390px 桌面窄视口浮层，Playwright MCP 与 Chrome DevTools MCP 对隔离夹具复核 320px 亮色布局、操作位置和无横向溢出。无产品行为、API、权限、数据库或真实业务数据变化；Android 仅同步元数据至 70844，未构建 APK；仅本地修改，不提交、推送或部署。

## v7.8.43 - 2026-10-09

- Creator Center 作品详情读取失败时提供持续错误说明、返回作品库和只读重试；不会因为恢复读取而修改作品或复盘数据。
- `npm run test:creator-works-browser` 注入详情 GET 503，验证失败状态、显式重试成功和返回列表。无 API、权限规则、数据库或真实业务数据变化。Android 仅同步元数据至 70843，未构建 APK；仅本地修改，不提交、推送或部署。

## v7.8.42 - 2026-10-09

- Creator Center 作品库首次读取失败不再误示为空并提供重试；已有作品在刷新失败时保留，下一页失败可重试原游标并保留已加载内容。窄屏以作品卡片显示指标，桌面保留表格，并为排序控件增加可访问名称。
- `npm run test:creator-works-browser` 注入初次、刷新和分页 GET 503，验证恢复、结果保留和预期请求次数。无 API、权限规则、数据库或真实业务数据变化。Android 仅同步元数据至 70842，未构建 APK；仅本地修改，不提交、推送或部署。

## v7.8.41 - 2026-10-09

- Creator Center 趋势中心读取失败时持续显示错误并可只读重试；同周期刷新失败保留最近一次成功图表，切换周期后不混显旧周期数据，并忽略过期请求响应。
- `npm run test:creator-trends-browser` 覆盖初次失败恢复、同周期刷新失败保留和再次恢复，原桌面/390px 官方逐日趋势回归通过。无 API、权限规则、数据库或真实业务数据变化。Android 仅同步元数据至 70841，未构建 APK；仅本地修改，不提交、推送或部署。

## v7.8.40 - 2026-10-09

- Creator Center 抖音数据驾驶舱将核心数据、同步日志和采集端状态分开读取；某部分失败不再丢弃其它成功结果，已有驾驶舱数据刷新失败时会明确提示并保留上次成功内容。
- 未知采集端状态不再误示为离线；同步日志没有可用记录时，次数显示“—”而非误报 0。隔离浏览器注入三类 GET 503，验证初次恢复、部分刷新失败/保留及完整重试；无 API、权限规则、数据库或真实业务数据变化。Android 仅同步元数据至 70840，未构建 APK；仅本地修改，不提交、推送或部署。

## v7.8.39 - 2026-10-09

- Creator Center 报告列表初次读取失败时明确标记“暂时不可用”，不再同时误示“尚未生成报告”；账号数据和报告列表独立收集结果，任一成功都不会被另一请求失败丢弃。
- 报告重载会重试必要的账号范围与报告读取；隔离浏览器验证报告 GET 503、成功账号信息保留、仅读恢复且不触发生成/删除。无 API、权限规则、数据库或真实业务数据变化。Android 仅同步元数据至 70839，未构建 APK；仅本地修改，不提交、推送或部署。

## v7.8.38 - 2026-10-09

- 首页工作台区分“读取成功且确实为零”和“接口暂时不可用”：失败阶段显示“—”及具体不可读状态，已成功读取的其它阶段保留；全局提示列出失败分区并支持重新读取。
- 待处理任务和最近变化在来源读取失败且结果为空时不再显示成“没有任务/没有变化”。隔离浏览器注入待审与关注事项读取失败，验证未知计数、明确告警及 GET-only 恢复；无 API、权限规则、数据库或真实业务数据变化。Android 仅同步元数据至 70838，未构建 APK；仅本地修改，不提交、推送或部署。

## v7.8.37 - 2026-10-09

- 按真实导出 API 契约修复 CSV：选题使用响应中的 `data` 明细；分析 CSV 正确整理状态、成员活动、每日趋势和平台分布，不再把汇总响应误当作品播放/点赞数组。
- 周报与 CSV/JSON 备份收敛到受 `export:data` 保护的报告中心；移除 Analytics 重复周报/导出入口及月报/总结占位页。隔离浏览器按真实响应结构验证下载、失败恢复和权限隔离；无真实数据/API/权限规则/数据库变化。Android 仅同步元数据至 70837，未构建 APK；仅本地修改，不提交、推送或部署。

## v7.8.36 - 2026-10-09

- 数据导出失败由自动消失的通知升级为页面内持续提示，失败后可以安全重试；空结果与导出成功显示明确结果，导出期间锁定类型切换并同步防止重复触发。
- 初版隔离浏览器夹具把导出响应错误模拟为数组，未覆盖真实 API 契约；v7.8.37 已按对象结构修复并重新验证 CSV 下载。失败/空值/成功反馈、防重复与字段转义逻辑仍保留。Android 当时仅同步元数据至 70836，未构建 APK；仅本地修改，不提交、推送或部署。

## v7.8.35 - 2026-10-09

- 周报复制的旧式剪贴板兜底现在会核实浏览器返回结果；复制失败时持续提示真实失败状态并保留重试，成功后清除错误。
- 隔离浏览器覆盖剪贴板权限拒绝、兜底拒绝与成功，并确认临时输入框清理。无 API、权限或数据库变化；Android 仅同步元数据至 70835，未构建 APK；仅本地修改，不提交、推送或部署。

## v7.8.34 - 2026-10-09

- 数据复盘初次统计读取失败时不再显示未经确认的 0，已加载结果刷新失败时保留最近一次成功数据并标明其周期；统计与选题数据提供独立只读恢复，恢复前禁用过期/未知数据导出。周报读取失败显示持续错误和只读重试，刷新失败时保留已确认周报并暂停复制。
- 隔离浏览器分别注入团队统计、选题明细与周报失败，覆盖未知值、刷新期间保留旧结果、显式重试及 GET-only；无真实指标、API、权限或数据库变化。Android 仅同步版本元数据至 70834，未构建 APK；仅本地修改，不提交、推送或部署。

## v7.8.33 - 2026-10-09

- 团队活动日志初次读取失败时不再误示“暂无活动记录”；已有日志刷新失败时保留最近一次成功记录，并提供只读重试。成员筛选列表读取失败也提供独立重试，不影响日志读取恢复。
- 隔离浏览器覆盖日志/成员列表分别失败、各自恢复、保留旧记录及 GET-only 重试；无真实日志、用户、API、权限或数据库变化。Android 仅同步版本元数据至 70833，未构建 APK；仅本地修改，不提交、推送或部署。

## v7.8.32 - 2026-10-09

- 发布归档列表读取失败时显示持续的错误和只读重载，不再误示为空；首次成功读取前，归档计数与汇总显示为暂不可用。刷新失败时保留上次确认的列表与计数。
- 隔离浏览器覆盖初次 GET 503、已加载列表刷新 503、只读重试及无归档写入；无真实归档、API、权限或数据库变化。Android 仅同步版本元数据至 70832，未构建 APK；仅本地修改，不提交、推送或部署。

## v7.8.31 - 2026-10-09

- 资料详情删除增加同步防重；请求处理中确认、取消、关闭、Esc 和遮罩均不能再次触发或中断操作，失败仍留在详情页供明确重试。
- 隔离浏览器验证快速双触发只发一次删除请求，失败保留确认并可重试，列表页已有恢复测试继续通过。无 API、权限、数据库或真实资料变化；Android 仅同步版本元数据至 70831，未构建 APK；仅本地修改，不提交、推送或部署。

## v7.8.30 - 2026-10-09

- 修复创作详情编辑器右键菜单被玻璃卡片偏移、裁切的问题：菜单改为相对浏览器可视区域定位，并在页面内容层之外呈现；右键监听在编辑器布局阶段完成注册，避免首屏快速操作漏响应。
- 隔离浏览器验证 390px 菜单与子菜单边界、320px 深色菜单可见及亮暗主题；生产详情全套浏览器回归通过。无 API、数据库、权限规则或真实稿件内容变化；Android 仅同步元数据至 70830，未构建 APK；仅本地修改，不提交、推送或部署。

## v7.8.29 - 2026-10-09

- 补齐复盘详情核心写入的自动化回归：结论保存、指标快照、发布和归档分别覆盖快速双击仅一次请求、503 后当前内容/状态不变、明确重试后按服务端结果更新；执行一个写入时，其它复盘写入入口保持锁定。
- Playwright MCP 与 Chrome DevTools MCP 在隔离页面交叉核对结论保存和快照生成的失败恢复、网络请求及窄屏无横向溢出；仅本机内存夹具写入。无 API、数据库、权限规则或真实业务数据变化；Android 仅同步元数据至 70829，未构建 APK；仅本地修改，不提交、推送或部署。

## v7.8.28 - 2026-10-09

- 复盘详情页所有写入共用同步互斥，避免行动项列表/详情保存、结论保存、快照生成、发布、归档或新建行动项在快速重复触发或彼此重叠时重复写入。
- 行动项更新期间暂时锁定状态/结果输入和详情抽屉关闭入口，避免请求结果回来时覆盖正在编辑的内容。
- 日报风险转行动项在服务端确认成功后清空当前选择/表单；失败时保留来源与填写内容，请求期间锁定输入。
- 隔离浏览器覆盖行动项更新双击仅一次 PATCH、503 后状态/结果保留、显式重试、移动详情抽屉重复保存，以及日报风险转行动项失败保留/成功清空；无 API、数据库、权限规则或真实复盘数据变化。Android 仅同步元数据至 70828，未构建 APK；仅本地修改，不提交、推送或部署。

## v7.8.27 - 2026-10-09

- 行动项创建失败时保留标题和说明，不再提前清空；仅在服务端确认成功后清空表单。创建请求期间锁定输入并阻止重复提交。
- 隔离浏览器覆盖双击仅一次 POST、503 后输入保留、明确重试成功后更新行动项列表；无 API、数据库、权限规则或真实复盘数据变化。Android 仅同步元数据至 70827，未构建 APK；仅本地修改，不提交、推送或部署。

## v7.8.26 - 2026-10-09

- 新建复盘增加同步防重锁，快速重复提交不会创建多条记录；创建失败时表单和输入保留，用户可明确重试，成功后进入新复盘详情。
- 隔离浏览器覆盖双触发仅一次 POST、503 后保留表单与窗口、显式重试成功；无 API、数据库、权限规则或真实复盘数据变化。Android 仅同步元数据至 70826，未构建 APK；仅本地修改，不提交、推送或部署。

## v7.8.25 - 2026-10-09

- 复盘详情读取失败不再误报“复盘不存在或无权访问”；初次失败和已有详情刷新失败均给出准确状态与只读重试。
- 日报风险读取失败不再伪装成无风险；保留最近一次成功数据并暂停风险转行动项，恢复只发起读取。隔离浏览器覆盖详情/风险双 503、数据保留、禁用转换和重试恢复；无 API、数据库、权限规则或真实业务数据变化。Android 仅同步元数据至 70825，未构建 APK；仅本地修改，不提交、推送或部署。

## v7.8.24 - 2026-10-09

- 复盘列表、我的复盘行动项读取失败显示独立错误和重试，不再误报为空或静默清空。
- 刷新失败时保留最近一次成功读取的数据；错误状态改为局部页面状态，避免通知 store 更新触发重复读取。隔离浏览器覆盖双列表初次失败→重试恢复→已有数据刷新失败仍保留→只读恢复；无 API、数据库、权限规则或真实业务数据变化。Android 仅同步元数据至 70824，未构建 APK；仅本地修改，不提交、推送或部署。

## v7.8.23 - 2026-10-09

- 人员管理操作日志读取失败显示明确错误和只读重试，不再被误呈现为“暂无操作日志”；刷新失败时保留已加载的日志记录。
- 隔离浏览器覆盖初次读取失败、只读恢复、已有记录在刷新失败时保留及再次恢复。无 API、数据库、权限规则或真实业务数据变化；Android 仅同步元数据至 70823，未构建 APK；仅本地修改，不提交、推送或部署。

## v7.8.22 - 2026-10-09

- 人员启用/禁用与创建、编辑、删除共用同步互斥，快速重复触发不会并发改变用户状态。
- 删除失败时保留用户行和确认框，可显式重试；取消确认不发送请求，服务端确认删除后立即更新当前列表。
- 隔离浏览器覆盖启用/禁用双触发仅一次 PUT、删除取消无写入、删除双触发仅一次 DELETE、失败后重试成功，以及 320/390px 移动工作流。无 API、数据库、权限规则或真实用户数据变化；Android 仅同步元数据至 70822，未构建 APK；仅本地修改，不提交、推送或部署。

## v7.8.21 - 2026-10-09

- 角色权限页读取失败会明确提示并提供重载，不再把故障呈现为空列表；创建/更新成功与后续重读失败分别反馈，重载只读、不重复写入。
- 角色删除改为二次确认，失败保留确认框与原角色，服务端确认后立即从列表移除；所有角色写入使用同步互斥。
- 隔离浏览器覆盖角色/权限清单读取失败、创建连点、创建/更新成功后列表刷新失败及只读恢复、删除取消/失败重试，以及 320/390px 布局。无 API、数据库、权限规则或真实业务数据变化；Android 仅同步元数据至 70821，未构建 APK；仅本地修改，不提交、推送或部署。

## v7.8.20 - 2026-10-09

- 首页公告板改用统一公告 API；读取失败显示可重试错误，不再伪装为空列表。
- 公告创建/删除增加同步互斥与服务端确认；删除需二次确认，刷新失败后只读重载且不会重复写入。公告管理按钮遵循既有 `system:announcement` 权限。
- 390px 隔离浏览器覆盖读取恢复、创建/删除失败、刷新失败和权限视图。无真实公告或权限数据变化；Android 仅同步元数据至 70820，未构建 APK；仅本地修改，不提交、推送或部署。

## v7.8.19 - 2026-10-09

- 移动网页通知偏好保存期间阻止重复提交，并暂停切换选项，避免页面选择与服务端写入内容不一致。
- 隔离浏览器验证快速重复触发只写入一次；503 失败保留选择，可明确重试。Android 仅同步元数据至 70819，未构建 APK；仅本地修改，不提交、推送或部署。

## v7.8.18 - 2026-10-09

- 设置中心旧备份入口增加删除二次确认、同步互斥和已确认结果即时更新。
- 备份创建/删除后的列表刷新失败单独提示已确认写入，重试仅重新读取清单。
- 隔离假数据覆盖取消、失败重试、重复点击及刷新失败；没有操作真实备份文件。Android 仅同步元数据至 70818，未构建 APK；仅本地修改，不提交、推送或部署。

## v7.8.17 - 2026-10-09

- 桌面通知偏好、个人资料与密码更新增加同步互斥，防止请求处理中快速重复提交。
- 隔离浏览器验证失败后输入保留并可重试，密码仅在服务端确认成功后清空。
- 无 API、数据库、权限或真实业务数据变化；Android 仅同步元数据至 70817，未构建 APK。仅本地修改，不提交、推送或部署。

## v7.8.16 - 2026-10-09

### 修复

- 移动网页个人资料保存增加同步互斥，快速重复触发只发送一次请求；失败后保留姓名和邮箱输入，可明确重试。

### 验证

- `npm run test:mobile-work-center-browser` 覆盖个人资料 PUT 双击去重、注入 503 后保留输入及显式重试成功，并通过 320/390px 移动工作流回归。

### 发布边界

- 无 API、数据库、权限或真实业务数据变化；仅使用本机隔离夹具。Android 仅同步版本元数据至 70816，未构建 APK。仅本地修改，不提交、推送或部署。

## v7.8.15 - 2026-10-09

### 修复

- 选题模板首次读取失败时不再显示为空列表，并提供重试；模板新增/编辑/删除/列表重载共享同步锁，防止重复或并发操作。

### 验证

- `npm run test:workflow-designer-language-browser` 覆盖首次列表 GET 503→只读重试、保存时连续提交去重、写入成功后刷新失败及既有审批流/权限页面回归。

### 发布边界

- 无 API、数据库、权限或真实业务数据变化；仅使用本机隔离内存夹具。Android 仅同步版本元数据至 70815，未构建 APK。仅本地修改，不提交、推送或部署。

## v7.8.14 - 2026-10-09

### 修复

- 创作建议“暂不采用”和加入选题草稿的反馈写入增加按依据维度的同步锁；不同建议的请求状态互不覆盖，失败仍可明确重试。

### 验证

- `npm run test:creator-topic-suggestions-browser` 对延迟接口连续触发暂不采用与采纳，分别验证每类反馈只写入一次；样本、权限、失败重试、草稿保留与 1440/390/320px 原回归通过。

### 发布边界

- 无 API、数据库、权限或真实业务数据变化；仅使用本机隔离内存夹具。Android 仅同步版本元数据至 70814，未构建 APK。仅本地修改，不提交、推送或部署。

## v7.8.13 - 2026-10-09

### 修复

- 资料创建成功后立即提示服务端已确认；若详情读取失败，显示可恢复的读取错误和只读重试，不再误导为资料不存在，也避免重复创建。

### 验证

- `npm run test:resource-hover-contrast-browser` 覆盖创建成功后详情 GET 503、持续确认提示及重试只读恢复；Playwright MCP 与 Chrome DevTools MCP 均验证创建 POST 仅一次。

### 发布边界

- 无 API、数据库、权限或真实业务数据变化；仅使用本机隔离内存夹具。Android 仅同步版本元数据至 70813，未构建 APK。仅本地修改，不提交、推送或部署。

## v7.8.12 - 2026-10-09

### 修复

- 灵感点赞/取消点赞请求处理中禁用当前按钮并增加同步锁，快速连续点击不会发送互相抵消的重复切换；按钮暴露当前按压状态。

### 验证

- `npm run test:inspiration-theme-contrast-browser` 覆盖投票失败回滚、显式重试和延迟响应中的快速双击，只产生一次请求；原亮暗主题与 320/390/1440px 回归通过。

### 发布边界

- 无 API、数据库、权限或真实业务数据变化；仅使用本机隔离内存夹具。Android 仅同步版本元数据至 70812，未构建 APK。仅本地修改，不提交、推送或部署。

## v7.8.11 - 2026-10-09

### 修复

- 资料删除成功后立即从当前资料库移除；若列表刷新失败，持续说明服务端已确认删除并提供只读重载，重试不重复删除。
- 发布归档删除确认后立即从当前列表移除，不再依赖额外列表请求；同步拦截重复删除。

### 验证

- 扩展 `npm run test:resource-hover-contrast-browser` 注入资料删除后的列表 GET 503，验证已删除行即时消失、告警持续显示、重试仅 GET。
- 扩展 `npm run test:published-archives-browser` 验证发布归档删除写入仅一次、当前列表即时移除且不额外读取。

### 发布边界

- 无 API、数据库、权限或真实业务数据变化；浏览器使用本机内存夹具。Android 仅同步版本元数据至 70811，未构建 APK。仅本地修改，不提交、推送或部署。

## v7.8.10 - 2026-10-09

### 修复

- 桌面日报草稿保存成功后立即保留服务端返回的日报与版本；若随后提交失败，持续说明草稿已保存，重试沿用当前日报和最新版本，避免旧版本冲突或重复创建。

### 验证

- `npm run test:daily-report-submit-recovery-browser` 隔离覆盖保存成功、提交 503、保留草稿版本后重试成功；Playwright MCP 与 Chrome DevTools MCP 分别复核，最终使用同一日报提交。

### 发布边界

- 无 API、数据库、权限或真实业务数据变化；浏览器使用本机内存夹具。Android 仅同步版本元数据至 70810，未构建 APK。仅本地修改，不提交、推送或部署。

## v7.8.9 - 2026-10-09

### 修复

- 选题批量审核/删除按逐项服务端结果保留已成功变化与失败项选择；后续列表刷新失败时持续说明已确认数量，重载只读取列表。

### 验证

- `npm run test:topics-batch-mutation-browser` 隔离覆盖批量删除/审核部分成功、后续 GET 503、失败项保留及只读重载，确认重载不会重复写入。

### 发布边界

- 无 API、数据库、权限或真实业务数据变化；浏览器使用本机内存夹具。Android 仅同步版本元数据至 70809，未构建 APK。仅本地修改，不提交、推送或部署。

## v7.8.8 - 2026-10-09

### 修复

- 抖音自动关联与手工关联/解除的服务端确认，现在和发布列表后续刷新结果分开反馈；刷新失败时持续提示已确认操作并提供只读重载。

### 验证

- `npm run test:publishing-hover-contrast-browser` 隔离注入自动关联与手工关联成功后的发布列表 GET 503；确认各写请求仅一次，重载仅 GET。Playwright MCP 覆核两类操作，Chrome DevTools MCP 独立复核自动关联。

### 发布边界

- 无 API、数据库、权限或真实业务数据变化；浏览器使用本机内存夹具。Android 仅同步版本元数据至 70808，未构建 APK。仅本地修改，不提交、推送或部署。

## v7.8.7 - 2026-10-09

### 修复

- 备份创建成功与后续清单读取分开反馈；清单刷新失败时持续提示备份已创建，提供只读重载并阻止误重复创建。
- 清单读取失败且没有已知记录时不再显示“没有发现备份文件”，避免把读取错误当作空清单。

### 验证

- `npm run test:mobile-work-center-browser` 使用隔离备份夹具模拟创建成功、清单 GET 503、只读恢复；创建计数保持一次。`npm run check`、定向 ESLint 通过。

### 发布边界

- 未创建真实备份文件；无 API、数据库、权限或真实业务数据变化。Android 仅同步版本元数据至 70807，未构建 APK。仅本地修改，不提交、推送或部署。

## v7.8.6 - 2026-10-09

### 修复

- 人员管理创建/编辑以服务端确认与后续列表读取分开反馈；刷新失败时保留已确认提示并提供只读重载，避免误报失败和重复写入。
- 创建与编辑表单字段标签正确关联输入框，便于辅助技术识别和按名称操作。

### 验证

- `npm run test:mobile-work-center-browser` 隔离验证创建、编辑成功后注入用户列表 GET 503；提示保持，读重试只发 GET，创建/更新均仅一次。`npm run check`、定向 ESLint 通过。

### 发布边界

- 无 API、数据库、权限或真实业务数据变化；Android 仅同步版本元数据至 70806，未构建 APK。仅本地修改，不提交、推送或部署。

## v7.8.5 - 2026-10-09

### 修复

- 成片制作计划创建、删除和完成操作与列表刷新分开反馈；删除/完成成功后即时更新当前列表，列表读取失败时持续说明已确认结果并提供只读重试，避免重复操作。

### 验证

- `npm run test:mobile-work-center-browser` 在 320/390px 隔离浏览器验证完成写入成功、随后列表 GET 503、页面保留完成状态并移除重复完成入口；重新加载只发 GET，不重复 PUT。既有移动工作台、选题、日报、流程状态等回归通过。

### 发布边界

- 无 API、数据库、权限或真实业务数据变化；Android 仅同步版本元数据至 70805，未构建 APK。仅本地修改，不提交、推送或部署。

## v7.8.4 - 2026-10-09

### 修复

- 选题资料关联与解除关联经服务端确认后立即更新当前列表，不依赖额外列表读取；操作处理中拦截重复和冲突写入。

### 验证

- `npm run test:topic-stage-record-repair-browser` 隔离验证关联/解除关联各只写入一次，确认成功后列表即时更新且不额外请求资料列表。

### 发布边界

- 无 API、数据库、权限或真实业务数据变化；Android 仅同步版本元数据至 70804，未构建 APK。仅本地修改，不提交、推送或部署。

## v7.8.3 - 2026-10-09

### 修复

- 匿名意见管理的状态、公开切换、回复与删除在服务端确认后先更新当前行；若随后列表 GET 失败，持续说明已完成的操作并提供只读重载，避免重复写入。

### 验证

- 隔离浏览器注入状态/公开/回复/删除成功后的列表 GET 503，验证各写请求只发送一次、页面保留已确认结果，重试只触发 GET；覆盖亮暗主题和 320/390/1440px。Playwright MCP 与 Chrome DevTools MCP 分别复核状态重试及删除后的即时移除/只读恢复。

### 发布边界

- 无 API、数据库、权限或真实业务数据变化；Android 仅同步版本元数据至 70803，未构建 APK。仅本地修改，不提交、推送或部署。

## v7.8.2 - 2026-10-09

### 修复

- 运营复盘报告生成或删除经服务端确认后，即使列表读取失败也会保留成功结果；删除行立即从当前列表移除，重新加载只读取报告列表，不重复执行写入。

### 验证

- 隔离浏览器在生成/删除成功后注入列表 GET 503，验证写入各仅一次、成功反馈明确、列表状态可信，且重试仅触发报告列表 GET；Playwright MCP 与 Chrome DevTools MCP 复核生成失败刷新与只读恢复。

### 发布边界

- 无 API、数据库、权限或真实业务数据变化；Android 仅同步版本元数据至 70802，未构建 APK。仅本地修改，不提交、推送或部署。

## v7.8.1 - 2026-10-09

### 修复

- 灵感提交经服务端确认后，直接把返回记录加入当前列表并提示成功；不依赖实时广播，提交过程中拦截重复请求。
- 通知状态更新不再触发灵感列表重复读取。

### 验证

- 隔离浏览器确认服务端写入后无需后续列表读取即可显示新灵感，重复激活只产生一次创建请求；亮暗主题及 320/390/1440px 灵感页回归通过。

### 发布边界

- 仅增加现有创建响应字段，不改数据库或权限；Android 仅同步版本元数据至 70801，未构建 APK。仅本地修改，不提交、推送或部署。

## v7.8.0 - 2026-10-09

### 修复

- 日历事件创建经服务端确认后，如果紧接着的日历读取失败，会持续说明事件已创建，并提供只重新读取日历的入口，避免重复创建。

### 测试情况

- 隔离浏览器覆盖创建请求成功、随后日历 GET 503、提示确认结果及只读重试恢复；验证重试不重复创建。

### 发布边界

- 无 API、数据库、权限或真实业务数据变化；Android 仅同步版本元数据至 70800，未构建 APK。仅本地修改，未提交、推送或部署。

## v7.7.0 - 2026-10-09

### 修复

- 发布记录创建、更新或删除获服务端确认后，列表刷新失败会明确说明已完成的操作并提供只读重试，不再让用户重复提交。
- 删除成功后立即从当前列表移除该行；窄屏下刷新告警文字与重试按钮上下排布，避免文字挤成窄列。

### 测试情况

- 隔离 Playwright 覆盖删除失败后可重试、删除成功及创建成功后的列表 GET 503→只读重试恢复；断言删除/创建写接口均只发起一次，并检查 390px 告警排版。Playwright MCP 与 Chrome DevTools MCP 复核桌面/移动页面。

### 发布边界

- 无 API、数据库、权限或真实业务数据变化；Android 仅同步版本元数据至 70700，未构建 APK。仅本地修改，未提交、推送或部署。

## v7.6.0 - 2026-10-09

### 修复

- 创作记录创建/更新成功后，后续列表刷新失败不再误报写入失败；更新字段保留在列表，创建结果明确告知并允许单独重试读取。
- 保存期间防止重复提交；实时新增事件触发的列表读取失败也显示明确的重试入口。

### 测试情况

- 隔离 Playwright 覆盖创建/更新成功后列表 GET 503、双击防重复、失败状态、更新本地保留和仅重试读取；类型检查通过。

### 发布边界

- 无 API、数据库、权限或业务数据变化；Android 仅同步版本元数据至 70600，未构建 APK。仅本地修改，未提交、推送或部署。

## v7.5.0 - 2026-10-09

### 改进

- 首页增加待审核稿件任务，按现有 `production:update` 权限和创作编辑范围统计，桌面/移动端均可直达稿件。

### 权限与数据边界

- 未配置专属指定审核人；列表表示当前账号可操作，不等于审核责任已指派。只返回稿件标题、版本和归属信息，不返回正文；不改变审核流程或权限规则。

### 测试情况

- 隔离 API 覆盖权限开关、创建者/负责人/当前创作操作人范围、计数与正文隔离；桌面/390px 浏览器覆盖任务排序、稿件直达及手机无横向溢出。

### 发布边界

- 无数据库迁移或权限配置变化；Android 仅同步版本元数据至 70500，未构建 APK。仅本地修改，未提交、推送或部署。

## v7.4.0 - 2026-10-09

### 改进

- 管理员/负责人首页增加创作者数据同步异常任务；仅按每个账号最新同步结果展示失败或部分失败，后续同步运行中暂不误报，完整成功后自动清除。
- 异常项可直达对应账号的抖音数据驾驶舱；桌面和手机首页首屏优先保留消息、同步异常、审核与发布任务，避免较多待审核事项挤掉今日发布。

### 权限与数据边界

- 汇总仅对管理员/负责人且具备 `creator:data:view` 权限的账号可用；不展示同步错误原文，不改权限配置、历史记录或数据库结构。
- 播放骤降未设告警阈值，不自动生成该类异常。

### 测试情况

- 隔离 API 覆盖按账号最新结果、失败/部分失败、运行中重试抑制、成功恢复、精确计数/预览上限和非管理角色数据隔离；桌面/390px 浏览器覆盖首屏任务保留与账号定向跳转。

### 发布边界

- Android 仅同步版本元数据至 70400，未构建 APK。仅本地修改，未提交、推送或部署。

## v7.3.0 - 2026-10-09

### 改进

- 首页桌面与移动网页新增“今日发布”待办，显示当天待发布/已定时的平台安排及北京时间；同一选题任一平台已发布后不再列为待办，“发布异常”按已处理排除。
- 负责人首页将当前账号的未读且关联业务页面的消息作为可执行任务；消息中心可从首页直达“待处理”筛选。

### 测试情况

- 隔离首页 API 覆盖多平台重复任务、任一平台已发布排除、发布异常排除、发布人个人范围和当天筛选；桌面/390px 移动浏览器覆盖重试、排期时间、负责人任务优先级、消息筛选直达和发布详情跳转。

### 发布边界

- 无数据库迁移或权限规则变化；Android 仅同步版本元数据至 70300，未构建 APK。仅本地修改，未提交、推送或部署。

## v7.2.0 - 2026-10-09

### 改进

- 首页新增服务端关注事项汇总，准确统计选题逾期、两日内截止和阶段停留超过两日的数量，且支持查看全部内容的管理者与普通成员使用各自可见的数据范围。
- 桌面与移动网页首页共用此汇总；汇总数字与最多 8 条优先选题预览分开，列表超出上限时仍保留完整计数。加载失败提供单独重试，不影响首页其他内容。

### 技术升级

- 新增需登录的 `GET /api/dashboard/home-attention`，并登记 OpenAPI 响应合同；未新增数据库迁移或权限规则。

### 测试情况

- 隔离 API 覆盖未登录拒绝、管理者与个人数据范围、逾期/临近截止/卡点计数、两日阈值边界、已完成排除和预览上限；API 合同与首页桌面/390px 移动网页失败重试回归通过。

### 发布边界

- Android 仅同步版本元数据至 70200，未构建 APK。仅本地修改，未提交、推送或部署。

## v7.1.0 - 2026-10-09

### 改进

- 首页“我的今日任务”按工作职责调整标题、说明和优先顺序：有审核职责的用户先处理待审核事项，负责人先看团队重点，个人创作/发布任务按可执行权限排序。
- 负责人队列中，待审核内容优先于待发布任务；没有权限的事项不会进入队列。

### 测试情况

- 隔离浏览器覆盖编辑与负责人任务标题、负责人待审核/待发布排序；类型检查、构建与版本治理通过。

### 发布边界

- 无 API 或数据库变化；Android 仅同步版本元数据至 70100，未构建 APK。仅本地修改，未提交、推送或部署。

## v7.0.0 - 2026-10-09

### 改进

- 工作台内容流阶段卡在三条最新选题下显示本阶段停留时间；历史数据缺少可信阶段起点时明确显示“阶段时间待确认”。
- 新建选题和真实阶段流转统一记录阶段进入时间，普通内容编辑不会重置该时间。

### 数据库变化

- 新增可空字段 `topics.stage_entered_at`（迁移 025，SAFE_EXPAND）。旧记录不回填、不推测；旧版本可忽略新增字段。Android 仅同步版本元数据至 70000，未构建 APK。仅本地修改，未提交、推送或部署。

## v6.1.25 - 2026-10-09

### 改进

- 首页待办“开始审核”现在直达选题详情的现有审核弹窗；审核仍需用户明确选择并提交，未授权或选题不处于待审状态时不打开。
- 首页内容流阶段卡展示当前有界列表里最新创建的三条选题，而不再只展示两条。

### 测试情况

- 隔离 Playwright 覆盖首页点击、无权限/过期状态直达、无自动写入和阶段卡三条最新选题；类型检查通过。

### 数据库变化

- 无 API、权限规则或数据库变化；仅同步 Android 版本元数据至 60125，未构建 APK。仅本地修改，未提交、推送或部署。

## v6.1.24 - 2026-10-09

### 修复

- 完善拍摄状态、选题模板、选题详情及灵感投票的写入结果反馈：服务端已确认但后续刷新失败时不再诱导重复提交；投票请求失败会恢复原状态并提示用户。
- 番茄钟结束通知按页面可见性和通知权限只选择一个渠道，前台显示站内提示，后台在用户启用系统通知时发送桌面通知，避免双重提醒。
- 设置页系统配置、通知偏好及品牌 Logo 补充隔离浏览器保存反馈验收：保存失败不覆盖服务端值，重试成功后才确认持久化。
- 选题详情审核操作补充隔离浏览器失败→重试验收：失败时保留审核窗口和原状态，成功重试后再显示审核结果。
- 手机消息“全部已读”补充部分失败验收：只重试仍未读消息，成功项状态与失败项状态分别保留。
- 设置中心通知偏好表格分隔线统一使用 Studio 边框令牌，浅/深主题均有实际边界对比。
- 补充品牌 Logo 隔离浏览器验收：选图仅更新本地预览，保存失败不误报成功且预览可重试，只有显式保存成功才会持久化。

### 数据库变化

- 无 API、权限或数据库变化；仅同步 Android 版本元数据至 60124，未构建 APK 或开展原生专项。仅本地修改，未提交、推送或部署。

## v6.1.23 - 2026-10-08

### 修复与改进

- 登录页三种布局统一跟随主题令牌，修复浅色背景与文字对比问题；选题列表将“下一步”操作并入标题行，修复固定操作列遮挡；编辑器主工具栏及选区颜色/高亮浮层按可用空间翻转并限制高度，避免窄视口下被裁切。知识库分类、Creator Center 指标/徽标等文字统一使用主题对比令牌，并补充亮暗主题、分辨率/缩放浏览器回归。
- 后续浅色审查继续覆盖看板阶段操作与逾期日期、Creator Center 状态/趋势/错误提示、登录品牌标签和旧版富文本批注；没有改变业务流程或数据。
- 继续收敛移动网络状态、创作依据采纳/反馈失败、资料/选题/备份错误提示、备份徽标、番茄钟名次及编辑器右键危险操作的浅色对比；覆盖用例通过，B4/B5 全站审计仍进行中。
- 再统一工作台/协作时间轴/审批流/登录安全、消息通知、灵感筛选、移动日报、资源操作、周报和编辑器保存状态的浅色语义对比；无业务规则或权限变化。
- Creator Reports 旧口径警示、异常说明和作品等级徽标在亮/暗主题均通过 ≥4.5:1 对比度回归；报告生成入口改用统一主按钮样式。拍摄/发布详情的按钮与“已通过”状态改用适配主题的令牌，关键操作增加 320px 窄屏验收；B4/B5 全站检查仍继续。
- 移动端主操作与选中态统一使用专用主按钮令牌，通知未读徽标改用主题适配的珊瑚对比令牌；报告中心和桌面日报当前标签统一到主按钮令牌，共用危险确认改用主题适配危险按钮，并补充亮/暗主题对比度回归。全站 B4/B5 检查继续。
- 扩展主题对比修正至数据复盘排行榜、选题审核选择/确认、移动消息筛选、日历今日标记、日报归档类型和分页当前页；隔离浏览器亮/暗主题文字对比均达到 4.5:1。仅本地样式和测试变化，全站 B4/B5 检查继续。
- 编辑器右键菜单的颜色/高亮子菜单会按可用空间向左或向右展开；390×844 亮/暗主题隔离浏览器确认主/子菜单均留在视口内，B4/B5 全站审计继续。
- 拍摄指标卡片浅色主题改用同色系深对比渐变；登录/关于页品牌标记、发布进度图标、资料选中态、成就头像、选题阶段推进按钮和编辑器离开失败弹窗补充亮暗主题对比浏览器回归，拍摄详情返回按钮补无障碍名称；B4/B5 仍开放。
- 共用确认弹窗 warning 操作改用亮暗主题适配的 amber 语义按钮，默认确认使用统一主按钮；审批流默认模板、管理员角色图标与系统内置徽标改用主题 primary 对比令牌。发布列表互动数据及来源小字对比修正，亮/暗主题均达 4.5:1；创作资料失败重试入口通过浅色主题对比检查，并验证失败后重试成功；角色卡片通过 390px 单行与无横向溢出回归。拍摄“完成”确认仅打开并取消，未推进业务状态；全站 B4/B5 审计继续。
- 匿名意见箱提交图标在亮/暗主题改用 cyan-soft 背景与 cyan-contrast 前景，隔离浏览器实测图形对比达到 3:1；B4/B5 全站审计继续。
- 匿名意见管理表格把行操作固定在横向滚动视口右侧，并允许窄屏操作按钮换行；外层 GlassPanel 不再裁切内层响应式表格壳。亮/暗主题 × 320/390/1440px 隔离浏览器确认操作可见、页面无横向溢出，状态文字对比 ≥4.5:1、删除图标 ≥3:1；回复弹窗仅打开后取消，未修改数据。
- 复盘列表的“详情”入口在横向表格中固定于可见右侧；亮/暗主题 × 320/390/1440px 浏览器验收通过，并确认手机滚动到按钮后不会被底部导航遮挡。
- 选题列表查看/删除按钮补充带选题标题的无障碍名称；删除悬停改用有效的珊瑚语义背景和对比文字令牌。回归扩展至 320/390px 固定操作列及桌面多分辨率/缩放，亮暗主题悬停图标对比达标。

### 数据库变化

- 为登录主题、关联选题悬停文字、资料/知识库主题对比及编辑器主菜单和选区浮层增加浏览器回归，覆盖 1024×600 至 1920×600 的低视口及 125% 缩放；发布归档、拍摄完成和发布编辑/取消/保存操作覆盖桌面缩放、权限/数据边界及移动视口。无 API、权限或数据库变化。Android 仅同步版本元数据至 60123；仅本地修改，未提交、推送或部署。

## v6.1.22 - 2026-10-08

### 改进

- 为选题详情和创作详情的核心操作增加真实浏览器可见性与防裁切回归，覆盖 1366/1440/1920px 及 80%–125% 缩放。

### 数据库变化

- 仅增加隔离浏览器回归，不改变页面行为、API、权限或数据库。Android 仅同步版本元数据至 60122；仅本地修改，未提交、推送或部署。

## v6.1.21 - 2026-10-08

### 优化

- 审批流设计中的风险级别、规则原因和建议说明改为中文；风险提示跟随实际阶段规则校验，不改变审批策略。

### 数据库变化

- 无 API、权限或数据库变化。Android 仅同步版本元数据至 60121；仅本地修改，未提交、推送或部署。

## v6.1.20 - 2026-10-08

### 优化

- 选题只读详情改为直接说明“当前账号仅可查看此选题”，不再呈现“无编辑权限”提示或类似禁用按钮的样式。

### 数据库变化

- 无 API、权限或数据库变化。Android 仅同步版本元数据至 60120；仅本地修改，未提交、推送或部署。

## v6.1.19 - 2026-10-08

### 修复

- 创建“已通过”的创作记录时，在事务内复核选题阶段；阶段推进、选题历史和创作记录一并提交，失败时整体回滚。

### 数据库变化

- 无 schema migration、历史回填或业务库写入。Android 仅同步版本元数据至 60119；仅本地修改，未提交、推送或部署。

## v6.1.18 - 2026-10-08

### 修复

- 选题审核与阶段推进按原状态条件更新；过期请求不会覆盖先提交的新状态，也不会重复生成阶段记录或历史。

### 数据库变化

- 无 schema migration、历史回填或业务库写入。Android 仅同步版本元数据至 60118；仅本地修改，未提交、推送或部署。

## v6.1.17 - 2026-09-30

### 修复

- 创作提交审核、审核通过等状态变化现在同步写入选题历史和操作日志，记录前后状态、创作记录编号与操作者。
- 审计记录与状态/阶段交接同事务提交；过期并发状态更新被拒绝，普通状态变化不创建内容版本。

### 数据库变化

- 无 schema migration 或历史回填。Android 仅同步版本元数据至 60117，未构建 APK/开展原生专项。仅本地修改，未提交、推送或部署。

## v6.1.16 - 2026-09-30

### 修复

- 选题详情可以识别当前阶段缺少的创作、成片或发布记录；有编辑权限时可一键幂等补齐，不改变选题阶段。
- 已完成但缺少发布记录的选题仅提示核对历史，不自动伪造发布数据；创建、历史和操作日志同事务保存。

### 数据库变化

- 无 schema migration、历史回填或业务库写入。Android 仅同步版本元数据至 60116，未构建 APK/开展原生专项。仅本地修改，未提交、推送或部署。

## v6.1.15 - 2026-09-30

### 修复

- 成片状态真实变化时将前后状态和操作者写入选题历史与操作日志；审计和状态更新在同一事务，重复/无变化请求不重复记账。
- 无数据库迁移或历史回填，不改变状态规则和权限。Android 仅同步版本元数据至 60115；仅本地修改，未提交、推送或部署。

## v6.1.14 - 2026-09-30

### 新增

- 选题提报支持多份本机草稿列表，可新建、选择续写并删除单条草稿。

### 优化

- 桌面和移动提报共用账号隔离的草稿集合；旧版单草稿和桌面草稿可安全迁移。
- 提报成功只清理当前草稿，未提交的其他草稿仍保留。

### 测试情况

- 隔离单元及 Playwright 覆盖草稿迁移、切换、刷新、删除、桌面/移动互续、权限拒绝、存储失败和提报结果。无 API/数据库迁移；Android 仅同步版本元数据至 60114。仅本地修改，未提交、推送或部署。

## v6.1.13 - 2026-09-30

### 新增

- 自定义审批流阶段交接同步补齐目标阶段记录，并留存选题历史与操作日志。

### 优化

- 审批时事务内复核选题阶段；既有稿件/子记录幂等保留，完成阶段继续遵守多平台处理规则。

### 修复

- 修复严格审批模式把当前通过记录误当风险信号、阻断本次及同节点后续审批的问题。

### 测试情况

- 隔离 SQLite/API 覆盖审批权限、创作/成片/发布记录创建与复用、历史留痕、未处理发布阻断和发布异常完成；类型检查、定向 ESLint、构建、版本治理及差异检查通过。无数据库迁移或历史回填；仅本地修改，未提交、推送或部署。

## v6.1.12 - 2026-09-30

### 新增

- 资料中心新增独立“发布归档”入口，按选题展示发布快照、覆盖平台与记录数量。

### 优化

- 发布详情逐条列出各平台指标和对应发布记录链接，不跨平台合并数值；平台标识以中文展示。
- 修正嵌套资料页的导航高亮与面包屑，避免父级和子级同时处于选中状态。

### 修复

- 旧单平台归档继续兼容；删除入口遵循既有权限，确认文案说明只删除归档快照。

### 测试情况

- 隔离 API 回归覆盖发布记录数、平台摘要及原有上传者可见范围；Playwright 桌面/移动夹具覆盖多平台详情、旧归档兼容、删除权限、入口导航与窄屏，无浏览器错误。类型检查、生产构建、版本/更新说明治理、定向 ESLint 与差异检查通过；构建仅有既有大分包提示。无数据库迁移或历史回填；仅本地修改，未提交、推送或部署。

## v6.1.11 - 2026-09-30

### 优化

- 多平台指标、周报与归档按每条发布记录保持独立；周报识别已关联的抖音作品为已发布内容。
- 主题内容资产标出最新指标的平台、发布记录号和详情入口。

### 修复

- 选题发布归档列出全部已发布平台及其各自指标，同时保留最近单条字段兼容旧消费者；抖音关联成功后同步刷新完成状态与归档。

### 测试情况

- 隔离 SQLite/API 覆盖多平台指标粒度、周报、抖音有效发布、归档记录数组与旧字段兼容；Playwright 桌面/移动验收覆盖平台标识、发布记录直达及窄屏，无浏览器错误。无数据库迁移；仅本地修改，未提交、推送或部署。

## v6.1.10 - 2026-09-30

### 优化

- 明确多平台发布完成条件：任一平台已发布即完成；没有已发布平台时，所有平台均为发布异常才按已处理完成；仍有待发布或已定时记录时保持发布中。
- 选题手动推进与审批流模板同样遵循发布完成条件；选题进入终态后不自动回退。

### 测试情况

- 隔离 SQLite/API 回归覆盖任一平台发布即完成、失败状态尚未全部处理时不完成、全失败均处理后完成，以及选题手动完成门禁。无数据库迁移；仅本地修改，未提交、推送或部署。

## v6.1.9 - 2026-09-30

### 修复

- 发布状态人工更正保留原有权限与编辑方式，并在选题历史、操作记录中写明更正前后状态和操作人。
- 创作审核、成片完成、发布完成等自动阶段交接同步进入选题历史；发布子状态更正不会让已完成选题倒退。

### 测试情况

- 隔离 SQLite/API 回归覆盖发布状态更正审计、自动阶段交接历史以及已完成阶段保持；其余检查结果记录于升级进度。无数据库迁移；仅本地修改，未提交、推送或部署。

## v6.1.8 - 2026-09-30

### 修复

- 成片记录完成并流转到发布环节后，拒绝退回其他状态或更换关联选题；服务端校验成片状态枚举。

### 测试情况

- 隔离 SQLite/API 回归覆盖已完成状态保护、关联选题保护、无效状态拒绝及完成后文案编辑；类型、构建、版本治理与差异检查通过，无数据库变化。仅本地修改，未提交、推送或部署。

## v6.1.7 - 2026-09-30

### 优化

- 桌面与移动提报页共用按账号隔离的本机草稿，桌面输入自动保存，旧版桌面草稿可继续编辑。

### 修复

- 提交前同步保底保存；存储失败会明确提醒，且无提报权限时不展示草稿。

### 测试情况

- Playwright 隔离浏览器覆盖 390px/1440px 草稿续写、旧格式迁移、权限拒绝、存储空间不足、提交失败保留与成功清理；类型、草稿契约与浏览器回归通过。无数据库变化；仅本地修改，未提交、推送或部署。

## v6.1.6 - 2026-09-30

### 修复

- 创作审核、成片完成和发布完成仅在允许的选题阶段推进；重复保存不会重置后续阶段或已编辑的发布记录。

### 测试情况

- 隔离 SQLite 工作流集成回归、选题 API、稿件权限和版本同步测试、类型检查、生产构建、版本/更新说明治理与差异检查通过。构建保留既有大分包提示；无数据库结构变化；仅本地修改，未提交、推送或部署。

## v6.1.5 - 2026-09-30

### 修复

- 桌面和移动端「开始创作」改为先通过选题阶段事务补建或复用稿件，再打开编辑；阶段推进失败不再遗留游离稿件，历史缺失稿件也可补齐。

### 测试情况

- 新增创作交接合同测试；选题 API 回归与 Playwright 桌面/移动浏览器验收覆盖阶段先行、稿件复用、失败不落孤儿稿及实际编辑页导航。无数据库结构或业务数据变更；仅本地修改，未提交、推送或部署。

## v6.1.4 - 2026-09-30

### 优化

- API 暂时失败、找不到功能或内容过大时，统一显示清楚的中文处理建议，不再出现英文错误或工程术语。

### 测试情况

- HTTP 集成回归覆盖 404（新旧接口）、实际超限请求 413 与 500 错误脱敏；仅调整提示文案，不改变业务处理、权限或数据库。仅本地修改，未提交、推送或部署。

## v6.1.3 - 2026-09-30

### 修复

- 批量审核和删除现在按实际成功数区分全部成功、部分完成和全部失败，不再把全部失败误报为成功。

### 优化

- 版本更新改为页面顶部轻提示，完整内容保留在设置的更新说明中，不再用全屏弹窗打断操作。
- 合并更新说明中的两条 v2.20.5 历史记录，去掉同版本重复项并保留合并前的全部修复信息。

### 测试情况

- 新增批量操作反馈合同测试和更新说明版本唯一性测试；覆盖成功、部分失败、全部失败、计数边界及历史重复版本；本地修改，未提交、推送或部署。

## v6.1.2 - 2026-09-30

### 新增

- 补充选题状态推进集成回归，覆盖缺失流程记录补建、已有创作复用、非法推进反馈和补建失败回滚。

### 优化

- 更新提示统一使用「版本更新」，移除面向用户的英文系统术语。

### 修复

- 无；本次仅加强回归保护与界面用语，不改变流程逻辑。

### 技术升级

- 无

### 数据库变化

- 无；改造清单中的本地数据只读核对未修改任何记录。

### 测试情况

- 选题状态推进集成回归、创作列表编辑保存合同测试、类型检查、版本检查、版本治理测试与生产构建通过；仅本地修改，未提交、推送或部署。

## v6.1.1 - 2026-09-30

### 新增

- 新增 Web 端统一结构化诊断日志，覆盖登录、Socket 生命周期、前端 API、错误边界、权限、通知、编辑器和运行环境事件。

### 优化

- 浏览器日志采用事件/字段白名单；标识仅记录存在性，错误仅保留安全类别，断连原因仅保留已知枚举。

### 修复

- 移除上述活跃诊断路径中可能输出的原始错误消息、堆栈、Socket 标识、请求标识与动态断连文本；不改变业务响应、权限或数据库。

### 技术升级

- 增加 Web 日志字段合同测试，并将前端诊断统一通过结构化 logger 输出；无外部遥测接入。

### 数据库变化

- 无。

### 测试情况

- 日志白名单合同、Socket 客户端生命周期、Web 登录运行时、401 恢复、Playwright 模拟登录观察、登录导航、版本治理、类型检查和生产构建通过；全仓 lint 为 0 errors、324 warnings。构建保留大分包提示（最大 Silk 分包 843.50 kB）。浏览器验收使用本地模拟 API，不访问线上账号；登录导航测试未启动 API 服务，页面其他后台请求在 Vite 代理处被拒绝，但登录/重定向断言通过。Sentry 与生产日志采集/留存仍未验收，Phase 4 未退出。仅本地修改，未提交、推送或部署；Creator Agent 保持 2.14.5-agent，Android 仅同步版本元数据至 60101，未构建 APK。

## v6.1.0 - 2026-09-30

### 新增

- API 请求完成时输出结构化日志，统一记录 requestId、数字 userId、模块、模板化操作、状态码、耗时和环境。
- Creator Agent 桌面与采集阶段输出本地 NDJSON 运行日志，Agent 版本更新为 2.14.5-agent。

### 优化

- 活跃 API 的认证、限流、Socket、协作、数据库、消息、日报、工作流和发布日志迁入 Pino；删除请求/数据库原始错误、IP、URL、UA、房间/用户标识及可猜测用户名哈希，并规范化 Origin/transport。

### 修复

- 修复运行日志可能保留完整查询串、SQL/异常细节、页面/成员标识和未净化 Origin/transport 的问题；没有改变业务响应、鉴权、协作处理或限流行为。

### 技术升级

- 新增 Pino 10.3.1 API logger 与请求日志契约测试；将 `ip-address` 覆写升至 10.7.2、`engine.io` 升至 6.6.11，并将开发树中的 `brace-expansion` 更新至已修复版本。

### 数据库变化

- 无。

### 测试情况

- API 请求日志、限流脱敏、Socket 生命周期、协作权限/协调与 Redis 故障恢复、相关业务回归、5xx HTTP 脱敏及 Agent 日志合同测试通过；活跃 API 路径不再使用普通 `console.*`，仅保留启动致命错误直接输出和未挂载旧流程。`npm audit` 与 `npm audit --omit=dev` 均无漏洞。类型检查、构建、全仓 lint（0 errors，323 warnings）、Agent 构建/检查、版本治理和 `git diff --check` 通过。Sentry 未接入，无外部遥测传输；Web 浏览器日志与生产采集留存仍待治理。仅本地修改，未提交、推送或部署；Agent 元数据为 2.14.5-agent，Android 仅同步元数据至 60100，未构建 APK。

## v6.0.3 - 2026-09-30

### 新增

- 无

### 优化

- 将 Redis Streams 集成验收扩展到 Redis 进程被强制终止后重启，确认已确认写入的 AOF stream 记录保留，并验证双 API 协作恢复。

### 修复

- 无

### 技术升级

- 故障注入仅作用于测试创建的本机 Redis 子进程；AOF 使用 `appendfsync always`。不模拟断电、存储损坏或生产故障切换。

### 数据库变化

- 无

### 测试情况

- `npm run test:collaboration-redis-integration` 通过；类型检查、构建、版本治理与定向 ESLint 在本次版本闭环中复验。生产 Redis 持久性/HA、真实 Caddy 与多实例部署仍未验收；仅本地修改，未提交、推送或部署。Android 仅同步元数据至 60003，未构建 APK。

## v6.0.2 - 2026-09-30

### 新增

- 无

### 优化

- 扩展 Redis Streams 集成测试：启用隔离 AOF，重启 Redis 后核对 Socket.IO stream 记录仍在，并验证双 API 进程恢复协作。

### 修复

- 无

### 技术升级

- 测试 Redis 仅运行于本机临时目录，使用 `appendfsync always`；没有触及生产 Redis、代理或部署配置。

### 数据库变化

- 无

### 测试情况

- `npm run test:collaboration-redis-integration` 通过；版本治理、类型检查、构建及定向 ESLint 在本次版本闭环中复验。生产 Redis 持久性/HA、真实 Caddy 与多实例部署仍未验收；仅本地修改，未提交、推送或部署。Android 仅同步元数据至 60002，未构建 APK。

## v6.0.1 - 2026-09-30

### 新增

- 无

### 优化

- 为 Creator Agent 官方导出 schema v2 增加双独立进程同批次并发回归；确认同一批次只提交一次，争用响应可安全重试。

### 修复

- 无

### 技术升级

- 扩展官方导出契约测试，以独立 nonce 并发访问共享隔离 SQLite；重试沿用稳定批次 ID、刷新请求 nonce。

### 数据库变化

- 无

### 测试情况

- `npm run test:official-export-v2`、`npm run test:creator-sync-single-flight`、`npm run test:creator-agent-replay-security`、`npm run check`、`npm run build`、`npm run version:check`、`npm run test:version-governance`、定向 ESLint 与 `git diff --check` 均通过；构建仅有既有的大 chunk 提示。未改业务代码或数据库结构。仅本地修改，未提交、推送或部署；Android 仅同步元数据至 60001，未构建 APK。

## v6.0.0 - 2026-09-30

### 新增

- 新增共享数据库分布式任务租约能力，支持原子抢占、自动续租、主动释放、过期接管和递增 fencing token。

### 优化

- 无

### 修复

- 无

### 技术升级

- 使用数据库时钟判定租约有效期，并提供租约丢失中止信号与执行前所有权复核。

### 数据库变化

- SAFE_EXPAND 迁移 024 新增 `distributed_job_leases` 表；租约记录在释放后保留，避免 fencing token 重置。

### 测试情况

- 双独立 Node 进程隔离测试已通过，覆盖互斥、续租、主动释放、租约丢失中止、崩溃过期恢复和 fencing token 递增。
- `npm run check`、`npm run build`、`npm run version:check`、`npm run test:version-governance`、`npm run test:migration-readiness`、`npm run migration:check`（只读 GO）、`npm run test:entrypoints`（157 个文件）、定向 ESLint 和 `git diff --check` 均通过；构建有超过 500 kB 的分包提示。未运行全量测试与全仓 lint。
- 当前仅提供底座，未注册或启动任何生产任务；未部署、提交或推送。Android 仅同步版本元数据至 60000，未构建 APK。

## v5.0.3 - 2026-09-30

### 站内消息实时同步

- 实时 `new_message` 事件使用数据库实际生成的消息 ID，确保消息中心里的消息和后续操作指向同一条记录；消息先持久化再推送，断线期间的消息与未读数在重连后从服务端恢复。
- 两 API 进程的隔离 Redis/SQLite 联调验证跨实例投递、用户房间隔离、数据库 ID 对齐、已读操作和离线期间的持久消息/未读数恢复。系统版本升至 5.0.3；Android 仅同步元数据至 50003，未构建 APK。生产 Redis/代理配置未验收；仅本地修改，未提交、推送或部署。

## v5.0.2 - 2026-09-30

### 多实例采集互斥

- Creator Agent 标准同步（schema v1）通过共享数据库保证同一平台账号最多一个运行中任务；账号忙及 nonce 写库锁定返回 HTTP 503 与重试提示，不使用上传队列视为重复接收的 409。保留任务结束后的同编号重试，SQLite 暂时占用采用有界重试；官方导出 schema v2 沿用原事务与批次幂等路径。
- SAFE_EXPAND 迁移 023 在创建约束前检查已有运行中重复任务；发现历史冲突时停止迁移且不删除或改写任务。双 Node 进程共享隔离 SQLite 验收覆盖不同 Agent 设备争抢、锁释放与失败重试，HTTP 测试覆盖忙时响应和 nonce 防重放的边界。
- 房间清理仅释放各 API 实例的本机内存，Yjs 运行态仍由持久层恢复；快照在多实例时关闭；备份仍由共享锁保护的系统任务运行。短视频每日调度器目前没有 API 启动调用，本次不启用它。完整 job runner、通知故障语义、生产代理及 Redis 持久性/HA 仍未验收；不表示允许生产横向扩容。
- 系统版本升至 5.0.2；Android 仅同步版本元数据至 50002，未构建 APK。仅本地修改，未提交、推送或部署。

## v5.0.1 - 2026-09-29

### 协作跨实例验收

- 新增真实 Redis Streams 双进程集成测试，覆盖跨实例锁事件广播、生产成员列表的远程 socket 查询，以及 Redis 中断后 readiness fail-closed 和恢复后的广播恢复。
- 使用本机临时 Redis（仅绑定 127.0.0.1、关闭 RDB/AOF，不保留业务数据）；两个完整 API 子进程共用隔离 SQLite，通过真实鉴权入房、presence、锁拒写、并发 Yjs 版本写入及 Redis 中断/恢复验证。测试代理证明无 affinity 的 polling 会失败、sticky cookie 能固定 polling 与 websocket upgrade 路由。真实 Caddy/生产代理、生产 Redis 持久性与 HA 尚未验收；未修改部署配置，生产仍默认单实例。
- 系统版本升至 5.0.1；Android 仅同步版本元数据至 50001，未构建 APK。仅本地修改，未提交、推送或部署。

## v5.0.0 - 2026-09-29

### 协作跨实例协调准备

- 增加可选 Redis Streams Socket.IO adapter；默认仍为单实例。跨实例 Yjs 持久化写入通过共享 SQLite 版本校验、冲突重载与有界重试，锁在持久层事务内再次核验，房间成员列表查询 adapter 中的全部 socket。
- 多实例配置缺少 Redis、Redis 初始连接失败时拒绝启动，不回退成本机广播；多实例模式禁用进程内临时快照，保留数据库 checkpoint。
- 仅本地实现并通过独立 Node 进程共享隔离 SQLite 的并发恢复测试。当前未接入真实 Redis、未进行 Redis 双实例/负载均衡验收；本轮未读取生产实例数且未修改线上配置，不能据此宣称多实例已获准上线。Android 仅同步元数据至 50000，未构建 APK 或进行原生专项。

## v4.5.0 - 2026-09-29

### 创作建议提交归因

- 用户把建议依据加入项目背景并正式提交后，系统将准确的建议证据版本与新选题 ID 一并关联；普通选题提报不受影响。
- 服务端重新核验创作数据权限、账号范围和最新样本；过期证据不会创建错误关联。新增 SAFE_EXPAND 迁移 022，发布表现后续通过现有 `topic_id` 追踪。
- 当前只验证了隔离数据链路，真实选题发布效果仍待部署并积累数据观察。本次仅本地修改，未提交、推送或部署。Android 仅同步元数据至 40500，未构建 APK 或开展原生端专项。

## v4.4.0 - 2026-09-29

### 创作建议采纳反馈

- 数据指导创作可记录用户将依据加入选题草稿或暂不采用的反馈，并按创作者账号、操作用户和证据版本区分。
- 只保存样本数量与汇总播放指标，不保存样本标题；证据更新后要求基于新建议反馈。
- 新增 SAFE_EXPAND 迁移 021。真实采纳率与后续发布效果仍待发布后观察；仅本地修改，未提交、推送或部署。Android 仅同步版本元数据到 40400。

## v4.3.0 - 2026-09-29

### 协作更新本机恢复

- 浏览器先将尚未确认的 Yjs 增量暂存到按账号和稿件房间隔离的 IndexedDB；页面重新打开后先同步服务器，再恢复并重发待确认更新。
- 收到服务端持久化 ACK 后清理本机副本；恢复失败会显示提示并锁定稿件编辑，避免旧正文覆盖未恢复内容。仅保存未确认增量，单房间设有本机容量上限。
- 不新增数据库迁移或网络事件；浏览器存储写入失败会明确提示，并仍尝试既有服务端确认流程。多实例协作与生产部署仍未覆盖；仅本地修改，未提交、推送或部署；Android 仅同步版本元数据到 40300。

## v4.2.0 - 2026-09-29

### 协作更新确认与重试

- 客户端只有收到服务端持久化成功确认后才清除 Yjs 更新批次；失败/超时会保留并按退避间隔重试，重连后先恢复服务端状态再补发。
- 确认通过现有 Socket.IO 更新事件的可选回调提供，事件名与更新负载保持兼容；旧客户端可继续不传确认回调。
- 不新增数据库迁移；确认尚未返回时的本机内存更新在关闭页面前仍不保证离线恢复。仅本地修改，未提交、推送或部署；Android 仅同步版本元数据，未构建 APK 或开展原生端专项。

## v4.1.0 - 2026-09-29

### Yjs 运行态持久化

- 已授权协作房间的 Yjs 更新先持久化再应用并广播；服务重启后按检查点和更新日志恢复已被服务端接受的协作中间态。
- 每 100 条更新生成检查点并在事务中压缩旧日志；持久化失败、恢复失败或容量超限会明确提示，不伪装成协作已保存。
- 新增 SAFE_EXPAND 迁移 020；正式正文仍以业务自动保存为准，未更改 Socket.IO 协议或生产数据。
- 仅本地修改，未提交、推送或部署；Android 仅同步版本元数据，未构建 APK 或开展原生端专项。

## v4.0.0 - 2026-09-29

### 指标单一真源与抖音优先口径

- 发布记录成为播放、点赞、分享和评论指标的归属；抖音官方导出逐项优先，手工数据只补充缺项并展示来源。
- 月度统计、用户统计、周报、主题资产、发布归档和复盘快照使用同一套发布级指标解析。
- 旧选题级记录保持不变；仅在选题与发布时间唯一匹配时用于历史兜底，未关联或有歧义的数据不进入发布汇总。
- 新增 SAFE_EXPAND 迁移 019。Android 仅同步版本元数据，未构建 APK 或开展原生端专项。
- 仅本地修改，未提交、推送或部署。

## v3.8.0 - 2026-09-29

### 品牌化配置与默认主题

- 系统管理新增默认主题设置；尚未在当前浏览器保存个人主题时应用，已有个人选择不会被覆盖。
- 继续使用现有 `app_meta` 系统设置记录，无数据库迁移。P2-5 Android 端及推送按用户决定延期到未来专项；本次仅本地修改，未提交、推送或部署。

## v3.7.0 - 2026-09-29

### 移动端稿件批注

- 移动创作页现在可查看版本批注讨论、定位原文、回复和结束讨论，也可基于正文选区新建批注/修改建议。
- 继续复用 `workflow:comment`、稿件访问范围和当前版本规则，不增加新 API 或数据库迁移。
- 390px 移动浏览器回归通过。Android 推送仍默认关闭；当前没有可用的 Firebase/FCM 发送配置，未将设备登记误当作推送已可用。仅本地修改，未提交、推送或部署。

## v3.6.0 - 2026-09-29

### 协作批注与审阅建议

- 稿件批注和修改建议绑定到具体版本，支持线程回复、讨论结束以及建议接受/拒绝；历史版本只读。
- 接受建议时先精确定位原文并等待正文保存确认，再更新建议状态；原文变化或保存未确认时不会误报已采纳。
- 新增 SAFE_EXPAND 数据库迁移 018；本地隔离数据库与浏览器验收通过。仅本地修改，未提交、推送或部署。

## v3.5.0 - 2026-09-29

### 全局内容搜索

- ⌘K / Ctrl K 搜索扩展到稿件正文、资料全文、日报与日报条目、复盘摘要/行动项/指标；保留选题、成员和页面搜索。
- 按当前权限并行检索、至少输入 2 个字后防抖触发；结果有界且可直达内容。部分数据源暂不可用时明确提示并允许重试。
- 沿用各业务现有可见范围；无数据库迁移。日报结果按日期和成员进入归档，本人日报只开放给本人或按既有归档权限查看。
- 仅本地修改，未提交、推送或部署。

## v3.4.0 - 2026-09-28

### 作品表现驱动选题构思

- 运营概览新增“数据指导创作”，以同账号、同发布时间段作品的显式标签及问句标题为观察特征，展示样本、播放中位数、对照组与计算规则。
- 桌面和移动提报页可重新核验建议并手动追加依据到项目背景，不覆盖标题、平台或已有草稿，不自动创建选题；作品依据保留账号范围并在新窗口打开。
- 无数据库迁移、权限码变更或外部 AI 调用。新增业务能力按开发规范递增 Minor 至 v3.4.0；仅本地修改，未部署。

## v3.3.54 - 2026-09-28

### 选题详情维度录入

- 桌面与移动选题详情可直接登记、查看和移除城市、人物与项目标签；继续使用既有权限和审计记录，不新增迁移或历史回填。
- 窄屏下选题流程进度限制在内部横向滚动，避免桌面详情缩至手机宽度时撑开整页。

## v3.3.53 - 2026-09-28

### 选题内容资产维度登记与聚合

- 可按选题明确登记城市、人物和项目，支持在主题内容资产中筛选，并按维度汇总主题、稿件、可见资料、拍摄和发布数量。
- 维度写入需 `topic:update` 且通过选题归属校验，新增/移除记录进入选题历史；历史内容不自动回填。
- 新增 SAFE_EXPAND 迁移 017；不改变旧资料关联、分析数据或生产环境。

## v3.3.52 - 2026-09-28

- 资料中心新增主题内容资产视图，按可访问的选题汇总稿件、资料、拍摄、发布及最近数据；只使用显式关联、遵循权限，读取失败显示服务端说明并可重试，不猜测城市或人物关系。无数据库迁移。

## v3.3.51 - 2026-09-28

- 完成选题本地草稿续写闭环：桌面/移动端保存后刷新可恢复，提交失败保留内容与草稿，提交成功后清理；移动端本机存储写入失败时明确提示。

## v3.3.50 - 2026-09-28

- 桌面和移动选题管理合并列表与看板视图；5 个内容/协作分析页收敛为“系统 → 内容实验室”多视图。旧看板及实验室页面地址保留兼容跳转，独立日历事件仍由排期日历管理。

## v3.3.49 - 2026-09-28

- 消息中心支持服务端分页与关联筛选，汇总及跨页已读保持准确；人员管理支持服务端搜索和分页，不再局限于当前加载的用户范围。

## v3.3.48 - 2026-09-28

- 移动端选题详情支持一键开始/进入创作：已有稿件直接复用，没有时用选题大纲创建草稿并同步阶段，编辑页可返回原选题。

## v3.3.47 - 2026-09-28

- 选题提报和灵感转选题前增加标题相似提醒，只检索当前账号可查看的选题；用户确认后才继续，不修改 API、权限或数据库。

## v3.3.46 - 2026-09-28

- 灵感转为选题后持久保存关联；转化和历史写入使用同一事务，重复请求返回既有关联。旧历史记录不做猜测式匹配。

## v3.3.45 - 2026-09-28

- 从消息中心打开待处理内容时，只有成功标记已读后才会跳转；失败时保留未读消息和重试机会，并避免重复请求。

## v3.3.44 - 2026-09-28

- 内容生产导航中，“创作管理”和“成片制作”紧跟“选题管理”，更符合从选题进入创作与制作的日常顺序；其它入口及权限不变。

## v3.3.43 - 2026-09-28

- 同一选题、同一类型的桌面消息在 5 分钟内合并为可更新提醒并避免重复提示音；消息记录仍逐条保留。桌面通知点击安全的站内关联路径可直达业务页面，非站内链接回到消息中心。

## v3.3.42 - 2026-09-28

- 移动消息读取失败且没有可用缓存时显示错误与重试，只有成功加载后才显示空列表；未读标记失败或离线时停留在消息页，成功标记后再打开关联页面。移动端修改密码增加当前密码/新密码长度校验、处理中状态和重复提交保护，成功提示保持可见。

## v3.3.41 - 2026-09-27

- 移动消息缓存、选题新建/修改、稿件和日报本机草稿改为按账号隔离，避免共享设备切换账号后在页面恢复他人内容。旧版无法确认归属的本机数据不自动迁移或删除；无服务端权限、API 或数据库变化。

## v3.3.40 - 2026-09-27

- 移动首页、选题列表/详情、创作列表及拍摄/发布列表与详情对未知状态显示安全中文提示，不泄漏原始状态码或留白，并使用中性状态样式。Android 工程版本与 production endpoint manifest 同步到 3.3.40 / 30340。无权限、流程状态、数据库或服务端写入规则变化。

## v3.3.39 - 2026-09-27

- 移动日报按真实审核状态显示中文说明；退回日报展示审核意见，已通过/已归档明确只读。未改变日报权限或服务端状态规则，无数据库迁移。

## v3.3.38 - 2026-09-27

- 补全移动“我的”页内容岗位的中文角色名，覆盖文案、后期和摄像；同步 Android 版本号与 production endpoint 清单。因本机缺少 Java Runtime，debug APK 未能生成。权限配置不变，无数据库迁移。

## v3.3.37 - 2026-09-27

- 修复移动选题详情因权限回调身份变化而重复加载的问题，授权编辑者现在可稳定输入和保存；创建与审核失败会展示服务端具体说明，并保留内容供重试。权限规则不变，无数据库迁移。

## v3.3.36 - 2026-09-27

- 移动创作详情使用服务端计算的稿件编辑范围；可查看但无权编辑的 director 用户现在看到只读编辑器，不会误以为保存会成功。后端权限边界不变，无数据库迁移。

## v3.3.35 - 2026-09-27

- 修复移动日报草稿已保存但提交失败时客户端仍使用旧版本号的问题；恢复后重试使用服务端最新版本，避免乐观并发冲突。无数据库迁移。

## v3.3.34 - 2026-09-27

- 日历加载失败时显示错误与重试，避免旧月份汇总残留；创建失败保留表单，可在请求结束后重试。权限回归覆盖登录、事件创建者与关联选题访问边界。无数据库迁移。

## v3.3.33 - 2026-09-27

- 移动日历与灵感现在可直接打开关联选题，选题详情返回来源页；首页快捷入口的子页返回首页，工作中心入口仍返回工作中心。无数据库迁移。

## v3.3.32 - 2026-09-27

- 修复窄屏灵感页按钮和卡片操作文字被拆分、删除动作依赖悬停的问题，并改善看板筛选项的手机布局。无数据库迁移。

## v3.3.31 - 2026-09-27

- 修复看板点击拍摄/发布中选题时使用错误记录 ID 的问题，按选题查找关联流程记录后再跳转；记录缺失或加载失败时提示并回到选题详情。无数据库迁移。

## v3.3.30 - 2026-09-27

- 手机端创作/拍摄/发布编辑器改用轻量工具栏，窄屏发布详情操作可折行；Android `versionName` 与系统版本对齐并按公式更新版本码。无数据库迁移。

## v3.3.29 - 2026-09-27

- 拍摄与发布详情适配手机宽度，审核历史显示中文；选题详情遇到失权/未找到时不再展示本机旧缓存。无数据库迁移。

## v3.3.28 - 2026-09-27

- 移动端选题新建/编辑及 `topic:audit` 审核与权限控制；日报提交按权限控制且读取失败时禁止覆盖并可重试。
- 移动消息批量已读逐条同步，准确保留部分成功状态并提供剩余重试；无数据库迁移。

## v3.3.27 - 2026-09-27

- 移动端创作列表按查看权限显示，编辑器按查看/修改能力切换只读与可提交操作；只读状态不读取或写回本机草稿。移动通知的偏好、渠道和事件必须全部成功加载后才开放保存，失败时可重试。
- 无数据库迁移。

## v3.3.26 - 2026-09-27

- 手机浏览器首次打开应用时采用移动导航及已有移动页面，布局在本次打开期间保持稳定；工作子页补齐导航归属与返回入口，移动端显示全局操作反馈。原生认证逻辑不变，无数据库迁移。

## v3.3.25 - 2026-09-27

- 设置中心区分我的设置、系统管理和产品信息，管理入口按现有权限显示。
- 关于系统展示已保存品牌信息，移除未经检测的运行正常、模块已启用和固定备份策略说明。
- 系统配置读取失败支持重试并阻止默认值误保存；备份读取失败不再显示为空列表。
- 无数据库迁移。

## v3.3.24 - 2026-09-27

- 通知偏好、渠道和事件配置全部加载成功后才允许保存；失败时显示错误与重试，避免空配置覆盖已有偏好。
- Logo 选择仅更新本页预览；校验图片可解码，并明确提示需保存后才会应用。
- 无数据库迁移。

## v3.3.23 - 2026-09-27

- 实时房间事件只显示应用内 toast；桌面通知由持久化个人消息统一触发，消除同一业务操作重复弹出系统通知。
- 核实选题审核成功本就有明确 toast，改造清单该项属于现状已覆盖。
- 无数据库迁移。

## v3.3.22 - 2026-09-27

- 日报、月报/年报读取错误可见并支持重试，提交操作有成功/失败反馈。
- 番茄钟统计和排行榜加载失败可见并可重试。
- 批量消息已读准确同步逐条成功项，失败项保持未读并提示数量。
- 无数据库迁移。

## v3.3.21 - 2026-09-27

- 成就数据加载失败显示明确错误与重试，不再伪装成暂无成就。
- 资料搜索和资料库筛选忽略迟到的旧请求结果，避免覆盖当前资料、错误提示或加载状态。
- 无数据库迁移。

## v3.3.20 - 2026-09-27

- 报告中心周报加载失败现在明确显示错误与重试入口，不再误显示为暂无周报数据。
- 无数据库迁移。

## v3.3.19 - 2026-09-27

- 知识库搜索和分类切换忽略过期请求结果，避免慢响应覆盖当前列表或改变新请求的加载/错误状态。
- 无数据库迁移。

## v3.3.18 - 2026-09-27

- 全局页面崩溃回退使用双主题可读的错误表面、文字与操作按钮；重载、返回首页和复制诊断行为不变。
- 无数据库迁移。

## v3.3.17 - 2026-09-27

- 共用空状态的图标面板改用不透明 Studio 表面令牌，修复底色样式未生成导致的透明图标底。
- 无数据库迁移。

## v3.3.16 - 2026-09-27

- 共用 403 权限提示改用 Studio 双主题语义柔和底色与中性边框，文字和导航操作不变。
- 无数据库迁移。

## v3.3.15 - 2026-09-27

- 共用确认弹窗的危险、警告和默认图标改用 Studio 双主题语义底色与中性边框，确认、取消按钮逻辑不变。
- 无数据库迁移。

## v3.3.14 - 2026-09-27

- 共用错误状态组件的失败、警告和未找到图标面板改用双主题底色及中性边框；错误语义与重试操作不变。
- 无数据库迁移。

## v3.3.13 - 2026-09-27

- 组织权限页角色徽标和启用/禁用标签改用双主题语义柔和底色与中性边框；角色与账户状态不变。
- 无数据库迁移。

## v3.3.12 - 2026-09-27

- 全局成功、失败、警告和提示通知改用双主题语义柔和底色与中性边框，消息类型和自动关闭逻辑不变。
- 无数据库迁移。

## v3.3.11 - 2026-09-27

- 成就稀有度标签改用明暗主题可见的 primary、violet、amber 柔和底色和中性边框；筛选及成就逻辑不变。
- 无数据库迁移。

## v3.3.10 - 2026-09-27

- 移动端选题列表与详情按待审核、已通过、已驳回、创作中、拍摄中、发布中显示对应的双主题语义柔和底色和中性边框。
- 状态流程不变，无数据库迁移。

## v3.3.9 - 2026-09-27

- 复盘与行动项状态标签改用双主题语义柔和底色和中性边框，状态及流程不变。
- 无数据库迁移。

## v3.3.8 - 2026-09-27

- 灵感库类别和“已转选题”标签改用双主题语义柔和底色，保持明暗主题下可见；业务流程不变。
- 无数据库迁移。

## v3.3.7 - 2026-09-27

- 发布详情状态标签改用明确的双主题语义底色和中性边框，修复已发布等状态标签底色不显示；状态流转不变。
- 无数据库迁移。

## v3.3.6 - 2026-09-27

- 成片制作详情的状态、完成和本地编辑提示改用真实可见的双主题语义底色，状态与内容流程不变。
- 无数据库迁移。

## v3.3.5 - 2026-09-27

- 选题详情阶段状态标签改用真实可见的双主题语义底色，避免半透明背景工具类失效；状态流转不变。
- 无数据库迁移。

## v3.3.4 - 2026-09-24

- 创作列表的选题与创作状态标签改用明确的双主题语义柔和底色和中性边框，避免半透明背景工具类失效后标签只剩文字。
- 无业务逻辑或数据库变更。

## v3.3.3 - 2026-09-24

- 灵感库“有新评论”提示改用主题表面和高对比文字，修复透明底及浅色主题可读性；评论事件逻辑不变，无数据库迁移。

## v3.3.2 - 2026-09-24

- 趋势周期选中态改为主题表面和 cyan 对比文字，避免浅色文字低对比及透明背景导致选中状态不可见。
- 暗色批注添加、已有批注编辑与取消路径复测通过；无数据库迁移。

## v3.3.1 - 2026-09-24

- 修复浅色主题下编辑器批注输入框的硬编码白色表面与占位文字颜色，改为跟随 Studio 主题令牌。
- 无数据库迁移；只验证了隔离数据库副本上的界面交互，未部署生产。

## v3.3.0 - 2026-09-24

- 新增选题的“存本机草稿”不再创建待审选题；同一设备与账号再次进入提报页可继续编辑，提报成功后清除草稿并直达详情。
- 新增选题大纲改用统一富文本编辑器，服务端继续保存 HTML，历史选题不批量改写。
- 选题列表使用响应式表格壳，窄屏可横向浏览且操作列保持可见；新增页按钮在窄屏自动换行。
- 修复编辑器快速挂载或卸载时旧实例被菜单与字数同步访问、偶发页面报错的问题。
- 统一编辑器增加查找高亮、逐个/全部替换、大小写与全词匹配；只读稿件仅可查找，替换仍可撤销，不自动保存或创建版本。
- 编辑器页脚增加当前字数、按稿件区分的本机目标、完成进度和预计阅读时长；目标只保存数字，不进入正文或协作版本。
- 当前可编辑稿件新增专注写作模式，隐藏导航、资料与版本区，保留正文和保存状态；退出后恢复原界面，普通编辑不创建新版本。
- 当前稿件可按选题大纲补入尚未写入正文的小节；修复通知引发详情重载、覆盖刚插入内容的问题。
- 资料搜索可将单条资料连同来源链接引用到正式正文，并按当前正文显示“已用/待用”；原资料草稿插入保持独立。
- 创作资料中可选中文字后选择来源进行片段引用；原文不匹配时拒绝插入，避免错误归因。
- 无数据库迁移，不自动合并或删除旧版“保存草稿”已创建的选题。

## v3.2.0 - 2026-09-23

- 首页由展示型驾驶舱改为按角色聚合今日任务、逾期提醒、七阶段内容流和最近变化的工作台。
- 打通灵感转选题、审核通过选题进入创作及创作列表更新链路；更新操作不再误建重复稿件。
- 创作列表接口增加兼容式分页与精确总数，未传分页参数的旧调用保持原返回格式。
- 日常导航收敛为五个业务分组，命令面板复用同一权限导航；旧资料入口归并到资料与资产中心。
- 消息已读失败给出明确反馈，移动端状态与角色使用中文，设置页隐藏框架、数据库路径等技术细节。
- 编辑器浮层和亮暗主题表面统一使用设计令牌；无数据库迁移，不改写既有业务数据。

## v3.1.2 - 2026-09-23

- 修复创作详情「版本操作」区在部分电脑/缩放下按钮完全不显示的问题。
- 核心操作（当前版本查看/编辑、小修保存、另开新版、提交审核）不再被侧栏 `hidden/xl:flex` 在小屏隐藏。
- 按钮改为可换行收缩，避免窄容器 `overflow-hidden` 裁切；权限与另开新版业务逻辑保持不变。

## v3.1.1 - 2026-09-23

- 修复富文本编辑器文字选中在亮色/暗色主题下对比度过低、几乎不可见的问题。
- 编辑器选区改用主题变量 `--editor-selection-bg` / `--editor-selection-fg`：亮色中深蓝底 + 白字，暗色较亮蓝底 + 白字。
- 覆盖 Tiptap / contenteditable / 彩色文字与高亮 span 的 native selection，并保持 BubbleMenu 操作时选区清晰。
- 仅调整选区视觉反馈，不修改正文 HTML/JSON/颜色数据。

## v3.1.0 - 2026-09-22

- 全站视觉升级为 Studio Atelier 设计系统：统一深空墨蓝色板、发丝线、玻璃层与镜面高光。
- 按钮、输入框、卡片、状态标签、空态/骨架/错误态走统一 token 与组件契约，业务页不再散落硬编码色。
- 命令面板、模态、帮助与更新弹窗共用同一套浮层入场编排（遮罩淡入 + 面板上浮）。
- 登录页三套布局对齐主强调色并提升对比度；首页驾驶舱浅色主题表面材质精修。
- 富文本编辑器工具栏/菜单 chrome 对齐 token，正文高亮色板保持独立语义。
- 新增 DESIGN.md 与 AGENTS.md，约定后续界面开发的设计系统调用关系。
- 强制改密改为服务端拦截，认证接口纳入共享限流；资料写操作与协作编辑按权限控制。
- 番茄钟连接真实接口并支持放弃记录；选题删除改为事务，避免部分删除。
- 下线失效的社媒复盘前端入口，旧抖音技术入口转向运营中心，修复选题创建结果解包。
- Creator Agent v2.14.4-agent 向本地快照传递有上限的脱敏 XHR 记录，缺失模块不再假报成功。
- legacy 令牌支持即时吊销；生产历史分页、协作锁落库、模板管理和资源接口收敛完成。
- 全仓 lint 恢复零错误并进入 CI，新增项目完整性回归套件。

## v3.0.5 - 2026-09-22

- 抖音运营概览按字段展示官方周期播放、互动及粉丝净变化，明确缺失的真实基线或周期导出。
- 官方作品导出不会将旧粉丝数写成当日观测值；保留已有同日真实粉丝快照与既有生产历史。

## v3.0.4 - 2026-09-21

- 普通编辑与粘贴保留当前稿件版本，明确选择另开新版时才升大版本。
- 多人协作保存保护已新增内容，旧版本无法向新版本房间写入。
- 内容动态按历史快照和当前保存分别展示，并校准北京时间与操作人。
- 无数据库迁移，不自动回填历史或覆盖现有稿件。

## v3.0.3 - 2026-09-21

- Creator Agent v2.14.3-agent 的 12 小时与每日自动任务改用已验证的官方四文件采集路径，避免全量作品滚动异常阻断定时导出。
- 手动“开始同步”继续保留全量采集；手动“小范围同步”及定时任务负责稳定下载作品列表和 1/7/30 天作品数据。

## v3.0.2 - 2026-09-19

- Creator Agent v2.14.2-agent 将抖音对象形态的作品状态收敛为可持久化标量，无法识别的对象按缺失处理，不再让整批作品快照变为“部分成功”。
- 四份官方导出、最新批次覆盖规则和 1/7/30 天计算口径保持不变。

## v3.0.1 - 2026-09-17

- Creator Agent v2.14.1-agent 固定选择数据中心“作品数据”的导出按钮，避免误下载同页的粉丝指标文件。
- 错源或周期日数不符时继续失败关闭，不覆盖最后一次成功数据。

## v3.0.0 - 2026-09-17

- Creator Agent v2.14.0-agent 使用后台无头浏览器，自动下载内容管理作品列表及数据中心昨天、近 7 天、近 30 天三份指标文件。
- 抖音运营中心按最新完整官方文件清洗数据：计数按日求和，率与时长按播放量加权，不再对日流量二次差分。
- 新增官方账号日指标审计表；缺少任一文件、周期或预期日数时拒绝残缺同步，较旧批次不得覆盖较新数据。

## v2.22.3 - 2026-09-17

- 官方累计指标启用时，不再把旧采集快照与官方导出口径相减生成虚假的播放或互动增长。
- 概览和复盘报告会明确显示周期增长暂不可用，并保留可独立核验的真实粉丝变化。

## v2.22.2 - 2026-09-17

- 修复官方导出中没有播放指标行的作品未计入作品总数的问题；作品数按最新官方文件的全部作品键统计。
- 不改变累计播放和互动汇总，也不补造缺失指标值。

## v2.22.1 - 2026-09-16

- 抖音粉丝采集兼容创作者中心当前使用的粉丝字段，修复实时粉丝长期停留在 1815 的问题。
- 运营概览与复盘报告优先使用最新一次官方作品导出的完整指标，旧导出不会重复累计或覆盖实时粉丝。
- 官方作品按标题与发布日期完全一致时回写作品明细；未匹配记录只进入官方汇总并保留历史，不强行合并或删除。
- 周期增长缺少接近边界的可比快照时显示暂无数据，不再使用过旧快照生成误导变化。

## v2.22.0 - 2026-09-16

- 抖音运营概览、作品、趋势和复盘报告统一使用标准化数据，累计播放不再重复累加历史快照。
- 复盘报告补齐当前指标、周期变化、作品分层和数据完整度，并支持按账号范围安全删除。
- 下线无真实可用来源的粉丝画像入口；粉丝总量与变化继续保留在统一数据链路。
- 登录安全升级只将真实外部抓取视为监控证据，并明确 Socket 独立审批状态。

## v2.21.4 - 2026-09-16

- 内容时间轴简化为可读的“内容动态”，并接入持久化创作版本历史。
- 登录安全升级页增加下一阶段准入结论和前置项，不再只展示技术指标。
- 备份管理汇总应用、部署应急和系统定时备份，外部备份保持只读。
- 抖音运营中心移除重复的作品复盘入口并收敛导航名称。

## v2.21.3 - 2026-09-15

- 放了些小惊喜。
- 优化按钮显示与消息中文体验。

## v2.21.2 - 2026-09-15

- 放了些小惊喜。

## v2.21.1 - 2026-09-15

- 修复同一选题存在多日分析快照时发布列表重复、分页总数虚增的问题；未关联记录只读取最新旧分析快照。
- 发布指标写入改为按选题和日期更新，部分字段更新保留未提交指标，不再覆盖其他日期的历史数据。
- 抖音关联后的平台、状态、时间和互动指标增加服务端锁定，避免绕过页面直接修改权威字段。
- 分析数据录入补齐选题范围、日期和非负整数校验；发布页统计改为同一权限范围内的服务端全量汇总和北京时间口径。
- 无数据库 schema 迁移，不清理、不合并、不重写既有历史分析记录。

## v2.21.0 - 2026-09-12

- 发布管理与抖音运营中心新增持久化一对一关联；同步完成后自动匹配高置信标题，歧义或弱匹配保留人工确认。
- 已关联稿件的发布时间、发布状态、播放、点赞、分享和评论直接读取抖音作品实时数据，发布稿件正文及原始字段不被覆盖。
- 发布管理新增关联刷新、候选搜索、人工绑定和解除绑定能力，并继续执行发布范围与 Creator 数据权限校验。
- migration 013 仅新增关联表和索引，不删除、不合并、不改写已有发布稿件或抖音作品。

## v2.20.25 - 2026-09-12

- 已审核稿件的创作资料切换为严格只读，不再因编辑器初始化或卸载触发自动保存和重复错误提示。
- 首页驾驶舱直接聚合选题、创作和发布记录；内容生产指数按每个选题已到达的最深业务阶段计算。
- 首页播放量优先使用抖音运营中心的同源累计播放数据，无 Creator 数据权限或暂无数据时保留原分析数据回退。

## v2.20.24 - 2026-09-11

- 修复活动日志按 UTC 默认值写入且无偏移返回的问题，历史日志校正为北京时间，API 明确返回 `+08:00`。
- 活动日志仅保留最近 7 天；migration 012 清理现有过期记录并建立持续保留触发器。
- 页面日期展示、排序和日期输入回填统一使用共享北京时间层；遗留运行时数据库时钟写入与查询边界同步收口。

## v2.20.23 - 2026-09-11

- 创作资料区收敛为单一连续富文本草稿，删除卡片、数量角标、单条操作和“新建手动资料”。
- 点击“添加资料”直接打开资料库选择器，正文按选择顺序插入光标位置，空正文会明确跳过。
- 新增稿件级统一草稿表；历史卡片正文按原排序幂等合并，旧卡片数据和资料库原文均保留。
- 统一草稿使用 800ms 串行自动保存、revision 冲突保护和服务端 HTML 白名单清洗。

## v2.20.22 - 2026-09-10

- 创作详情的“参考资料”升级为可直接阅读正文的“创作资料”工作区。
- 支持资料库多选快照、手动资料、富文本编辑、自动保存、独立删除与按用户记忆高度。
- 新增 `production_materials` 扩展式迁移，历史关联资料安全回填为独立快照，不修改或删除知识库原文。
- 服务端对白名单富文本执行二次清洗，并以 revision 乐观锁阻止旧保存请求覆盖新内容。

## v2.20.21 - 2026-09-10

- 从前后端共享 `User` 模型和登录响应适配器中移除 `password` 字段，客户端用户状态不再接收或保留密码值。
- 删除仅被专项测试调用的 `resolveAuthMode()` 死函数，保留灰度运行时仍使用的认证模式类型。
- 完成代码精简清单的引用核验；Social Review、JWT 兼容入口、数据库兼容表、认证灰度和迁移脚本因仍有真实依赖而保留。
- Creator Agent 升级至 v2.13.10-agent：修复 macOS 封面来源检查重复启动及启动状态并发读取同一专用 Chrome Profile、触发 `SingletonLock` 冲突的问题，并提供固定、脱敏且可操作的本地诊断。

## v2.20.20 - 2026-09-09

- 为休眠的 Social Review 路由增加统一 `analytics:view` 权限门禁，保留管理员操作的二次校验。
- 统一 Social Review 与总结归档的安全错误响应，未知异常不再回传内部错误文本。
- 用户与日志列表限制为每页最多 200 条，权限缓存 TTL 缩短为 60 秒。
- 修复工作流通知中的选题标题插值错误；新增覆盖授权、脱敏、分页与文案的回归合同。

## v2.20.19 - 2026-09-09

- 修复 Creator Agent 封面仅诊断不落地的问题：认证浏览器成功加载的受限图片经校验后随加密作品包上传，生产端以登录态读取托管封面。
- 修复同标题、同精确发布时间但采集 ID 不同的同一作品重复展示，并同步修正驾驶舱作品统计。
- 官方导出和常规作品包改为独立上传，新增 `creator_cover_assets` 表；不删除历史业务数据。
- Creator Agent 升级至 v2.13.8-agent。

## v2.20.18 - 2026-09-08

### 修复

- 修复亮色模式下选题管理统计卡片仍固定为黑色背景的问题。
- 修复选题详情关联资料、状态标签、平台与资源徽标、错误提示等共享界面在亮色背景上对比度不足的问题。
- 选题、创作、成片、发布、日报、日历、用户和资料中心的语义状态色统一改为深浅主题自适应令牌。

### 数据库变化

- 无 schema 迁移，不修改业务数据、权限或 API 语义。

### 测试情况

- 新增认证态亮色模式对比度回归，覆盖选题管理统计卡和选题详情关联资料。

## v2.20.17 - 2026-09-08

### 修复

- 修复新建账号姓名为空时，后端认证成功但前端因响应适配失败而显示“当前服务暂时不可用”的问题。
- Legacy 与 v1 Web 登录响应均在显示名为空或只有空白时回退到用户名。
- 修复本地字体声明位于主题样式导入之前，导致生产构建丢失主题变量、页面出现黑色卡片和深色框线的问题。

### 数据库变化

- 无 schema 迁移；生产目标账号已在独立在线备份及完整性检查后，将空姓名回填为用户名。

### 测试情况

- 增加 Legacy 与 v1 Web 空显示名登录响应回归测试；验证生产构建不再产生 CSS 导入顺序警告，构建产物包含主题变量定义。

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

## 2.20.15 - 2026-09-07

### Security

- 升级 `@tiptap/*` 全家桶至 ^3.31.0，修复 `mergeAttributes()` 在 `__proto__` 上将自有键转换为可继承可执行 DOM 属性的中危漏洞。
- 在 `package.json#overrides` 中将 `qs` 锁定到 6.16.0，修复 express/body-parser 链路上的 `qs` 数组上限绕过与 `isBuffer` DoS 中危漏洞。
- 新增 HTTP 级错误脱敏拦截器回归测试（`tests/security/error-response-http-contract.test.ts`），守护 `api/app.ts:267` 单点依赖。

### Fixes / Improvements

- 请求体上限改为常量统一来源：`api/utils/limits.ts` 提供 `HTTP_JSON_BODY_LIMIT` / `CREATOR_SYNC_MAX_PAYLOAD_BYTES`，`api/app.ts` 全局 413 文案与 `creatorSyncV291.ts` 同步包 413 文案均改为引用，消除魔法数字与不一致文案。
- 抖音官方导出 xlsx 解析改用 `sheet['!ref']` 在展开前判断行/列数，命中限制直接抛错，避免把整张表展开为内存数组再校验。
- 删除 `api/services/creatorDataCenter.ts` 中未被引用的 `acceptCreatorDataSync` 死代码副本，以及随之失效的辅助函数与导入。
- 成就进度接口按 `condition_type`（`login_streak` 额外按时间窗）聚合缓存查询，消除成就列表增长后的 N+1 计数。
- 新增 `deploy/linux/HTTPS_REQUIRED.md`，明确 `upgrade-insecure-requests` CSP 指令下 XMT 必须部署在 HTTPS 站点之后；并在 `docs/上线前检查清单.md` 中补充对应章节。

### 版本与兼容性

- XMT 升级至 v2.20.15；不涉及数据库迁移或破坏性 API 变更。
- 升级 `package-lock.json` 后需运行 `npm ci` 同步 `node_modules`。
- 未改动 RBAC、Session、Creator Agent 上传协议、Scrapling Collector 合同。

## 2.20.14 - 2026-09-04

- 为月报、年报总结归档增加完整详情入口：列表保留摘要，详情分区展示全部主要内容、提交人、所属期间和时间信息。
- 增加受管理员守卫的按 ID 总结详情读取，明确区分 400、403 与 404；不改变日报归档与既有可见范围。
- BaseModal 支持 Esc 关闭，归档详情支持遮罩、关闭按钮、长文本滚动和窄屏布局；无数据库 schema 变更。

## 2.20.13 - 2026-09-04

- 修复月报、年报提交时 snake_case 正文未被服务端读取，导致归档记录存在但正文为空的问题。
- 归档接口统一提供 `display_content_md`，兼容仍保存在旧 `content_md` 字段的历史报告；已确认生产中正文实际为空的记录不会伪造恢复。
- 增加月报、年报写入、归档、旧字段兼容、空正文、成员筛选与访问控制回归测试；无数据库 schema 变更。

## 2.20.12 - 2026-09-02

- 新增封面候选 HEAD、有限 Range GET 与固定 Creator Referer 的脱敏 403 分类，未转发认证信息或持久化图片。
- Creator Agent 升级至 v2.13.7-agent；未使用正式 Profile 或真实候选复验。

## 2.20.11 - 2026-09-02

- 修复 Creator 内容页 XHR 正则的双重转义错误；精确 Creator HTTPS 来源捕获为空时不再伪装为成功的作品 0。
- metadata-only 返回严格白名单的分阶段脱敏诊断，普通同步、上传、队列、数据库写入与生产接口行为不变。
- Creator Agent 升级至 v2.13.6-agent；未安装正式包且未执行第二次真实 metadata-only。

## 2.20.10 - 2026-09-02

- 修复 Creator Agent sandboxed Preload 运行时误导入 `node:crypto` 导致 contextBridge 未建立、Renderer 空白的问题。
- 账号短审计标识 HMAC 保留在 Electron Main；Preload 和 Renderer 只使用纯浏览器安全的白名单契约，并增加最终打包制品依赖门禁与 sandbox 冒烟测试。
- Creator Agent 升级至 v2.13.5-agent；无数据库迁移，不执行同步、上传或 metadata-only。

## 2.20.9 - 2026-09-01

- 修复 Creator Agent Renderer 直接透传绑定配置导致账号标识暴露的问题；界面现在仅显示 Main 生成的短审计标识与账号范围状态。
- Preload 对状态 IPC 进行运行时白名单投影，未知字段、日志和原始错误上下文不会进入 Renderer。
- Creator Agent 升级至 v2.13.4-agent；不新增数据库迁移，不改变同步、上传或 metadata-only 的零副作用边界。

## 2.20.8 - 2026-09-01

- 新增本地封面 metadata-only 检查；Creator Agent v2.13.3-agent 与业务同步、队列和上传隔离，无数据库迁移。

## 2.20.7 - 2026-08-31

### 修复

- Creator 作品封面仅接受 HTTP(S) URL；旧同步路径不再把相对路径或无效 scheme 写入作品库。
- 旧记录读取时从既有 raw 数据恢复可解析封面；无有效新封面时保留已存有效封面，不伪造不存在的封面。
- 作品库在账号范围内以 aweme ID 构建 canonical 读模型；缩略图按有界、去重的合法候选回退，不改写来源历史记录或指标快照。

### 版本与兼容性

- XMT 升级至 v2.20.7；Creator Agent v2.13.2-agent 与上传协议保持不变，无数据库迁移。

## 2.20.6 - 2026-08-31

### 修复

- Creator Agent 将受管 Profile 的认证事实与临时登录窗口交互彻底分离；Main 统一计算 `canSync` 与登录动作，已认证 Profile 不再依赖登录窗口存活。
- Renderer 首次加载、恢复和重新聚焦时重新读取 Main 能力快照；认证有效时显示"重新登录"并按 Main 能力启用同步。

### 版本与兼容性

- XMT 升级至 v2.20.6，Creator Agent 升级至 v2.13.2-agent；不新增数据库迁移，不改变上传协议或受管 Profile。

## 2.20.5 - 2026-08-31

### 修复

- Creator Agent 登录状态、登录窗口和浏览器识别统一管理；关闭窗口或主进程重启后不沿用旧界面状态。无可用浏览器时停止登录/同步并给出引导。
- 拍摄计划与发布管理列表提供受限分页和前端翻页；修正 16MB 请求体限制文案。

### 安全与兼容性

- API 500 响应不再包含底层 SQL 或绑定参数；增加安全响应头、Socket 单包上限和权限缓存上限。
- 将有已知告警的前端路由、Socket、网络解析和 Excel 解析依赖升级到修复版本；官方 Excel 解析限制文件大小、行数和列数。

## 2.20.4 - 2026-08-28

### 修复

- Creator Agent 本地队列使用 canonical JSON TEXT 与严格 SQLite 参数边界，读取时校验 payload SHA-256。
- 旧数据库启动先完成 upload_queue 幂等迁移和就绪检查；同步错误不再向界面暴露 SQL 或驱动参数。

### 版本与兼容性

- XMT 升级至 v2.20.4，Creator Agent 升级至 v2.13.0-agent；未开始 macOS 正式打包、发布或生产同步。

## 2.20.3 - 2026-08-28

### 新增

- Creator Agent 本地解析官方导出 Excel，并通过 schema v2 安全同步标准数据和审计摘要。

### 版本与兼容性

- 新增仅追加的官方导出批次、文件和指标审计表；v1 上传协议与既有 Creator 数据读取路径保持兼容。

## 2.20.2 - 2026-08-27

### 修复

- 恢复此前未进入主线的 Android Native Auth 真实续期调度：V1 登录保留服务端 `expiresIn`，移动登录完成后显式绑定 Token 生命周期。
- refresh 成功后按新生命周期重新调度；JWT `exp` 仅作回退，并补齐前后台、网络恢复、可见性与延迟定时器补偿。
- 增加调度代际保护、single-flight 与真实登录到连续两轮 refresh 的集成合同，防止重复刷新和旧定时器回流。
- 归档 v2.17.2 Socket 业务时段只读观察报告；日报布局代码已由 v2.19.3 合入，不重复迁移旧实现。

### 版本与兼容性

- XMT 与 Android 统一升级至 v2.20.2 / 22002；Creator Agent 保持 v2.12.1-agent。
- 无数据库迁移，不改变 RBAC、Session concurrency、生产端点、Creator 上传协议或 Scrapling Collector 合同。

## 2.20.1 - 2026-08-26

### 修复与验收

- 修复 works SQLite 非标量字段持久化。
- 增加 Creator Collector 无 UI CLI E2E 入口、官方导出观测与连续双导出验收。
- 修复 Collector 未观测账号资料覆盖已有资料；账号元数据现按 observed-only 语义更新。
- 修复 full_snapshot 固定滚动导致历史作品可能漏采，改为带安全上限的耗尽式滚动验收。
- 修复 Creator Agent 发布包缺失 Scrapling Collector runtime；发布版现携带冻结 Worker 并增加 Windows artifact contract。
- 收紧 full_snapshot：耗尽前恢复并验证无约束全量视图，无法确认时 fail closed。
- 恢复 Creator 作品指标容器与别名兼容；未观测指标不再被制造为零值。
- `--exports` 现为每轮两份官方导出的 fail-closed E2E Gate。
- Collector 现严格复用 Agent 所选 Chromium-compatible 浏览器运行时/可执行路径，不再强制 Google Chrome。
- Worker `login_required` 现作为类型化认证失败向 Desktop 传播，UI 与 heartbeat 会立即反映登录失效。

## 2.19.11 - 2026-08-20

### Security

- Creator Agent `/data-sync` 现在永久要求 `protocol_version=1`，签名覆盖 timestamp 与 nonce，并在验签后以原子 nonce 预留拒绝重放。
- 退役未被现行客户端使用的旧 `/api/creator-agent/report` 上传入口，统一返回 410，关闭旧协议旁路。

### Tests

- 新增 Creator Agent 上传防重放安全合同并纳入核心安全 CI。
## 2.19.10 - 2026-08-20

### Security

- Legacy 401 Recovery 使用精确 URL Origin 验证，避免将新 Bearer Token 发送到伪同源、错误端口或 HTTP 地址。
- 角色批量授予和角色权限定义在事务前执行调用者权限上限检查，拒绝自举提权。

### Fixes

- 增加认证 Origin 与角色权限安全回归合同，并纳入核心安全 CI。

## 2.19.9 - 2026-08-20

### Security

- 限制用户角色授予上限，非管理员不能创建或修改为 admin。
- 所有富文本和 Markdown 预览在最终 DOM 渲染前统一净化；畸形 Yjs 更新只拒绝当前消息。
- Douyin Webhook 缺 Secret 或签名非法时一律拒绝；Legacy JWT 固定 HS256。
- 禁用账号吊销 Auth V1 会话并断开该用户实时连接；角色变化也会强制重连。

### Fixes

- Legacy Web 和 Native HTTP 401 复用既有 refresh runtime 后仅重试一次。
- Production build 不再注入 react-dev-locator，新增安全合同进入 CI。

## 2.19.8 - 2026-08-17

### Fixes

- Android Production Build 固定注入 `https://lanyaomedia.com/api` 与 `https://lanyaomedia.com`，不再依赖开发者 shell 或未提交环境文件。
- Native Production 缺失或错误 endpoint 时 fail-closed；移动端 API Health 与认证响应拒绝 HTTP 200 HTML 假成功。
- 新增构建 manifest、Build Output/APK 端点校验，并将正式 Android 产物合同加入 CI。

## 2.19.7 - 2026-08-17

### Fixes

- Android Native Auth 独立调度 access token 临期 refresh，不再依赖默认关闭的 Socket Coordinator。
- 区分终态认证失败与瞬时网络失败：后者保留 Keystore refresh credential，并采用有界重试及生命周期补偿。

## 2.19.6 - 2026-08-14

### Fixes

- Android Capacitor HTTPS localhost Origin 以精确 allowlist 方式进入 CORS 策略；拒绝任意端口、局域网与 lookalike 来源。
- 新增真实 HTTP CORS 合同测试，覆盖 HTTPS localhost 的 GET、OPTIONS、credentials 与恶意 Origin 拒绝。

## 2.19.5 - 2026-08-14

### 新增

- 编辑器生产区新增 Word 式格式刷：单击应用一次，双击可连续应用，支持 Esc 或再次点击退出。
- 格式刷通过 ProseMirror transaction 复制字符样式、颜色、高亮、标题、对齐和首行缩进；不复制链接、批注或业务元数据。

## 2.19.4 - 2026-08-14

### Fixes

- 让公网内部路由检查读取权威运行时环境文件，并为重启后的健康检查提供受限重试，避免健康服务尚未就绪时误判回滚失败。

## 2.19.3 - 2026-08-14

### Fixes

- 修复日报页在 Glass Surface 外观下将表单区块横向挤压为窄列的问题。

## 2.19.2 - 2026-08-13

### 安全

- 统一 `/internal/*` Direct Loopback 边界，拒绝带反向代理转发证据的请求。
- 生产默认绑定 `127.0.0.1`，并建立运行环境文件、运行时回读和公网暴露门禁。

## 2.19.1 - 2026-08-13

### Mobile Auth production gate

- Added an independently approved Android allowlist gate for login, refresh, session and Socket.IO.
- Closed the production generic V1-login fallback when Web V1 is not enabled.

## 2.19.0 - 2026-08-13

### Android 移动办公

- 新增 Capacitor Android 工程、移动底部导航、Safe Area、网络/前后台与返回键适配。
- 增加平台运行时、HTTPS/WSS 端点配置、Android Keystore 刷新凭据存储与 Mobile Auth 合同。

## 2.18.4 - 2026-08-13

### Deployment safety

- Run version consistency validation before the deployment backup restore drill and any service restart.

## 2.18.3 - 2026-08-13

### Deployment safety

- Require an exact target SHA for safe deployment and run the deployment backup restore drill before any service restart.

## 2.18.2 - 2026-08-12

### Operations reliability

- Added a shared backup lock, non-destructive restore drill, and migration rollback-compatibility gate.
- Expanded version consistency checks across runtime, UI, and release documentation.

## 2.18.1 - 2026-08-12

### Security and release reliability

- Enforced resource-scoped Socket.IO collaboration authorization, including a view-only boundary for non-privileged participants.
- Added real Socket.IO/Yjs authorization black-box coverage to the CI security contract.
- Made role/permission updates atomic and aligned the primary role with role mappings.
- Made SQLite deployment backups verifiable and deployment failures roll back the application revision.
- Added explainable Auth readiness decisions: `GO`, `NO-GO`, or `INSUFFICIENT_DATA` with per-check status.

### Database changes

- No schema changes.

## 2.18.0 - 2026-08-12

### 新增

- 建立 React Bits Scene 场景化页面编排体系与页面级视觉应用范围。
- 新增岚曜极光、深空科技、丝绸创意、线性协作、极简无扰、自由搭配六套视觉方案。
- Appearance Center 支持 Scene Preview、配置导入导出、恢复默认与持久化。
- 增加 Persistent-Off、Guard-Only 与关键 Scene 浏览器自动化回归。

### 优化

- 优化 Home、Topics、Daily Report、Creator、Analytics、Workflow、Editor 的视觉表现与响应式体验。
- 完善字号、深浅主题、motionMode 与 Canvas owner/lifecycle 管理。
- Appearance Center 高级设置默认折叠，页面应用范围与设置语义更清晰。

### 修复

- 修复 Silk / React Three Fiber 生命周期兼容与动效关闭后的 Canvas 残留风险。
- 修复 Settings 主题 select accessible name、React Bits locator、A11Y 与视觉裁切问题。

### 技术说明

- Workflow Engine、Backend、API、permissions、Socket.IO、Yjs 与 Database 未修改。

## 2.17.2 - 2026-08-08

### React Bits 认证态兼容测试补充

- 认证态兼容测试统一仅从临时 `XMT_E2E_*` 环境变量读取专用测试账号，不提供明文 fallback。
- 扩展本地 Playwright 验收：登录、双主题、六套预设、字号、三种视口、按钮组合、外观持久化与恢复默认。
- 测试目标强制限制为 `localhost` 或 `127.0.0.1`，避免误连生产环境。

## 2.17.1 - 2026-08-08

### React Bits 浅色主题与字体兼容修复

- 修复 React Bits 按钮在浅色模式下的文字、边框与高光对比；分别适配 primary、secondary、ghost、danger、icon 与 AI 变体。
- 为 SpecularButton 传入主题颜色参数，并修复 GlareHover、ClickSpark 与 Magnet 的尺寸和布局约束。
- 为文本动画增加语义字号与外层裁切安全区；全局字号改为仅作用于业务正文，不再改变 `html` 的 rem 基准。
- 外观中心新增同一草稿配置的深色、浅色真实预览及仅开发环境可见的兼容矩阵。

## 2.17.0 - 2026-08-08

### React Bits 原生动效主题系统

- 建立 React Bits 官方组件来源层、官方来源清单及按需动态加载注册表。
- 新增“外观与动效”中心：六套官方预设、背景/文本/按钮/卡片/内容进入动画自由搭配、实时预览、导入导出及恢复默认。
- 新增浏览器本地外观配置与 reduced-motion、移动端低强度、WebGL 静态 fallback 策略。
- Login、Home 和通用 ActionButton 接入外观槽位；不修改后端 API、数据库、权限、Workflow、Socket.IO 或 Yjs。

## 2.16.1 - 2026-08-07

### 首页驾驶舱视觉增强

- 将 Home 升级为品牌级内容生产驾驶舱，新增融合 Aurora 的 Hero 展示区域与核心指标入口。
- MagicBento 调整为非对称大卡与辅助卡组合，强化内容生产指数、任务、选题、审核、发布、播放和 AI 入口层级。
- 首页关键内容接入 AnimatedContent 进入动画，并启用 MagicBento 的 Spotlight、粒子、倾斜、磁吸和点击反馈。
- 增加 WebGL 与减少动态效果偏好的降级机制，完成 1440 桌面端及 390×844 移动端适配。
- 后端 API、数据库、权限系统、Workflow Engine、Socket.IO 与 Yjs 均保持不变。

## 2.16.0 - 2026-08-06

### React Bits 原生体验升级

- 正式接入 React Bits 官方 TypeScript + Tailwind 组件源码，建立 `src/components/reactbits` 第三方组件层与 `src/components/xmt-ui` 业务适配层。
- Login 接入 Aurora 动态背景，并提供 WebGL 不可用时的静态渐变降级。
- Home 驾驶舱接入 MagicBento，Dashboard 数据展示接入 AnimatedContent。
- Topics 的重点选题接入 SpotlightCard，保留普通高频列表原有展示方式。
- Creator Dashboard 接入 ProfileCard，仅展示已同步的真实账号和内容数据，并适配桌面与移动端布局。
- 后端 API、数据库、权限系统、Workflow Engine、Socket.IO 与 Yjs 均保持不变。

## 2.15.4 - 2026-08-06

### UI 应用补全升级

- 完成 XMT 自研 Design System 与 XMTCard 在 Dashboard、Topics、Workflow 和 Creator 页面中的业务应用；本版本不属于 React Bits 官方组件集成。
- Dashboard 保留 AnimatedNumber 与 ProgressBar，并统一使用 XMTCard 的 hover 交互。
- 不修改 API、数据库、权限系统、Workflow Engine、Socket.IO、Yjs 或 Creator Agent。
## 2.15.3 - 2026-08-05

### React Bits 风格 Design System 基础升级

- 发布日期：2026-08-06；已完成生产环境部署与基础线上验证。

- 建立 XMT Design System，统一颜色、字体、圆角、阴影和动效 token。
- 新增 XMTTheme、XMTCard、AnimatedNumber 与 ProgressBar 基础组件。
- 首页指标接入数字变化动画与完成率进度动画，保留传媒 SaaS 的克制表达。
- 升级页面过渡、空状态、加载状态、弹窗进入动效及侧边栏展开收缩体验。
- 不修改后端 API、数据库、权限系统、Workflow Engine、Socket.IO、Yjs 或 Creator Agent。

## 2.13.17 - 2026-08-01

- 新增 Socket Auth Bridge 模块与 SocketAuthContext Zod 契约。
- 增加 legacy/v1-web 显式认证分支，严格禁止跨模式 fallback。
- Collaboration JOIN 改为使用服务端认证身份覆盖客户端展示身份；预留 Room 权限入口。
- Feature Flag 默认关闭，生产环境硬性保持关闭；Yjs 协议、正式 Login、数据库不变。

## 2.13.16 - 2026-07-31

- 完成 Socket/Yjs 当前认证链路审计与 Auth Bridge 设计。
- 冻结 SocketAuthContext、v1 Access handshake、Refresh 重连和 Room/Yjs 恢复契约。
- 新增断网、多标签、Token 到期、Yjs 最终一致性和回滚测试计划。
- 仅更新设计文档；不修改生产 Socket、Yjs、正式 Login、数据库或灰度配置。

## 2.13.15 - 2026-07-31

- 新增默认关闭、受内网 CIDR 控制的 Auth Prometheus HTTP endpoint。
- Prometheus/OTel 指标增加稳定 instance 标签，并提供 scrape、Collector 与告警规则示例。
- 新增多实例指标治理和正式 Login 迁移设计；active_sessions 不作为全局唯一会话数求和。
- 不修改正式 Login、legacy JWT、Socket/Yjs、数据库或生产用户灰度。

## 2.13.14 - 2026-07-31

- 新增 Auth Metrics Registry、Prometheus Exporter 与厂商无关 OpenTelemetry 适配。
- 增加登录、Refresh、失败、Logout、安全事件、活跃 Session 和 Refresh 耗时生产指标。
- Auth Rollout 诊断增加 Exporter 状态、指标来源、最近事件和最近导出时间。
- 新增生产告警规则基础；不修改 Login、legacy JWT、Socket/Yjs、数据库或生产灰度。

## 2.13.13 - 2026-07-31

- 新增统一 Auth Event、Metrics Service 与 Memory Exporter，指标只从事件事实派生。
- 修复成功登录在不同观测层重复计数；Session 与 Rollout 事件不再重复增加 login 指标。
- Auth Rollout 诊断增加 5 分钟窗口和统一安全事件统计，保留 60 分钟与 24 小时窗口。
- 不修改正式 Login、legacy 行为、Socket/Yjs 或数据库认证结构。

## 2.13.12 - 2026-07-31

- 新增生产 Auth v1-web 独立批准门禁；仅允许批准后的明确用户 ID allowlist。
- 生产 `internal` 与 `percentage` 模式继续强制回落 legacy，未批准配置不会挂载 v1 Auth。
- 不切换正式 Login、管理员账号、Socket/Yjs 或 legacy JWT。
- 无数据库结构变化，生产验证使用三个隔离的普通测试账号。

## 2.13.11 - 2026-07-31

- 新增管理员只读 Auth Rollout 状态诊断，展示当前模式、用户命中规则、指标、风险和配置审计。
- Auth Migration Metrics 增加有界时间事件与 60 分钟/24 小时聚合，不记录 Token。
- 新增 Refresh 失败率、CSRF、Token reuse 和 expired 停止阈值，只生成风险事件，不自动修改配置。
- 新增认证迁移状态管理页与运行手册；正式登录、生产灰度、legacy JWT、Socket/Yjs 和 Caddy 不变。
- 无数据库结构变化，配置审计和运行指标当前为进程内有界记录。

## 2.13.10 - 2026-07-31

- 新增统一 Auth Rollout Config，支持 disabled、legacy、internal、allowlist 和稳定 percentage 分桶。
- 兼容现有 `XMT_AUTH_V1_ENABLED`、`XMT_AUTH_WEB_ENABLED` 与用户 ID allowlist，生产环境继续强制 legacy。
- 新增 Auth Migration Metrics 和不含 Token 的结构化迁移事件，覆盖登录、刷新、CSRF、复用、退出与过期。
- 配置回滚只停止新用户进入 v1-web，保留既有 Session 数据，legacy JWT 继续有效。
- 正式 Login、默认登录流程、Socket/Yjs、Caddy 和生产 v1-web 均未切换。

## 2.13.9 - 2026-07-31

- 新增真实 Chromium Web Auth 暗启契约测试，覆盖冷启动、F5、新标签页、关闭重开、并发 401、失败过期和注销闭环。
- 浏览器验证确认 Access Token 仅存在内存，HttpOnly Refresh Cookie 不可由页面读取，CSRF Cookie 可按契约回传。
- api-client 修复浏览器默认 fetch 调用上下文，并避免已完成刷新后的迟到 401 再次触发刷新。
- legacy 登录、正式 Login 页面、持久 Token、Socket/Yjs、Caddy、生产开关和线上 Cookie 策略不变。

## 2.13.8 - 2026-07-31

- 为显式开启且命中用户 ID 白名单的非生产 v1 Web Auth 增加 HttpOnly Refresh Cookie 与 CSRF HTTP 适配。
- Web login/refresh JSON 不再返回 Refresh Token；refresh 只接受 Cookie，并在成功轮换后覆盖 Cookie。
- Web login 将 session、generation 0 Refresh hash 和登录活动记录纳入同一 SQLite 事务。
- logout 验证 Access/Session/Origin/CSRF 后撤销 session，并以相同 Cookie 范围清除凭据。
- legacy 登录、持久 Token、JWT、Socket、Caddy 和生产开关不变。

## 2.13.7 - 2026-07-31

- 新增未接入现有登录页的 Web Auth Runtime，Access Token 仅保存在内存，并提供认证状态机和刷新单飞能力。
- api-client 增加 `credentials: include`、显式 v1 模式 401 刷新和原请求最多一次重试，并新增 Auth v1 客户端封装。
- 新增未挂载的 Refresh Cookie、CSRF 签名服务、Web Auth 开关与用户 ID allowlist 基础能力。
- legacy 登录、浏览器持久 Token、JWT、Socket、Caddy 和生产 v1 开关均保持不变。

## 2.13.6 - 2026-07-30

- 新增由 `XMT_AUTH_V1_ENABLED` 控制的实验性 `/api/v1/auth/login|refresh|logout|sessions`，默认关闭且生产环境强制不挂载。
- 新增 Auth v1 Zod Schema、标准响应/错误码和 OpenAPI `x-experimental` 标记。
- 新增 HTTP 集成测试，覆盖 token 轮换、复用撤销、session 查询和 logout，并验证 legacy 7 天 JWT 不变。
- 未修改 Login 页面、Cookie、前端 token 存储或 Socket 认证。

## 2.13.5 - 2026-07-30

- 新增未接线的 Session Service 和 Refresh Token Service，支持会话生命周期、256-bit 随机凭据、分版本 HMAC、单次轮换与复用检测。
- 新增 SQLite 原子轮换 Repository，在一个事务内消费旧 token、创建替换记录并更新会话活动。
- 为 Token Service 增加独立 v1 Access Token 方法，旧 `signToken`、`verifyToken`、payload 和 7 天有效期保持不变。
- 新增 Session Service 专项测试；未开放 `/api/v1/auth/*`，未修改前端或 Socket 认证。

## 2.13.4 - 2026-07-30

- 通过正式 migration 新增 `auth_sessions` 与 `auth_refresh_tokens`，包含会话到期、撤销、轮换链及必要索引。
- 新增独立 Session Repository 接口与 SQLite 基础实现，但不接入 Auth Service。
- 新增 migration 专项测试，验证表、字段、索引、外键、幂等执行和既有用户数据完整性。
- legacy `/api/auth/*`、7 天 JWT、前端 token 存储、Socket 认证和生产登录行为保持不变。

## 2.13.3 - 2026-07-30

- 将 legacy `GET /api/auth/me`、`POST /api/auth/change-password` 和 `POST /api/auth/logout` 收口到 Auth Module。
- Controller、Service、Repository 与密码服务分别承担 HTTP、流程、SQLite 和 bcrypt 职责，旧路由只保留模块入口。
- 扩展认证行为冻结测试，覆盖当前用户、禁用账号、修改密码、强制改密标记清除、完整认证链路及退出后 JWT 仍有效。
- 未修改数据库、JWT、权限、Socket、前端 token 存储或 logout 语义，未引入 Refresh Token。

## 2.13.2 - 2026-07-30

- 建立 Auth Repository、Service、Controller、Token、Password 与 Mapper 模块边界。
- legacy `POST /api/auth/login` 改为委托 Auth Module，响应、错误、JWT、日志和限流行为保持不变。
- 新增临时 SQLite 认证冻结测试，覆盖登录、JWT 验证、角色回查以及 logout 不撤销令牌的现状。
- 未修改数据库、权限、Socket、前端登录或 7 天 JWT 有效期，未引入 Refresh Token。

## 2.13.1 - 2026-07-30

- 修复资料库“新增资料”按钮没有交互的问题，补齐创建表单、校验、真实写入和详情跳转。
- 山东地情档案导入增加 UTF-8、BOM、换行、不可见字符、行尾空白和过量空行清洗。
- manifest 同时记录原始与清洗后 SHA256、清洗数量和字符变化，继续支持批次审计、幂等、恢复和回滚。

## 2.13.0 - 2026-07-30

- 创作生产详情新增参考资料模块，支持搜索资料中心、添加关联、查看详情和解除关联。
- 新增生产资料关联 API，复用 `resource_relations` 保存 `production/reference` 关系，不新增业务数据表。
- 生产编辑者可在具备资料查看权限时使用关联能力，普通查看用户只读，资料管理权限保持不变。
- 资料关联操作独立于编辑器正文、版本历史、协作编辑和保存流程，解除关联不会删除原资料。

## 2.12.0 - 2026-07-29

- 建立 `/api/v1/*` 成功、错误、分页、错误码和 HTTP 状态码契约。
- 新增 requestId 生成、透传和响应回写机制，Topic v1 envelope 统一携带 requestId。
- 新增 Zod 驱动的 OpenAPI 3.0.3 文档与 `/api/docs` Swagger UI，首批覆盖四个 Topic v1 接口。
- 新增 `packages/api-client` 基础骨架和 API Contract 临时 SQLite 测试；legacy API 与业务规则保持不变。

## 2.11.0 - 2026-07-29

- 将 Topic 的 Repository、Policy、Service、Controller 与 HTTP 路由抽离到 `api/modules/topics`，旧 `/api/topics` 保持兼容。
- 新增默认关闭的 `/api/v1/topics` 严格 Zod 契约；只有设置 `XMT_TOPICS_V1_ENABLED=true` 才挂载，Web 仍使用旧接口。
- 新增临时 SQLite Topic 专项测试，覆盖 Repository、Service 失败分支及 legacy/v1 API 契约。
- 保持数据库结构、权限判断、状态机、通知、Socket 事件和 history/activity 写入行为不变。

## 2.10.3 - 2026-07-29

- 修复 Creator Agent 未上传粉丝总数的问题，兼容分隔符、万/亿单位、加号和嵌套对象。
- 修复作品主封面在统一载荷裁剪时丢失的问题，并保留有效旧封面。
- 限制全量同步中审计原始响应的上传体积，保留标准化作品和指标，避免代理链路长时间传输后断开。
- 全量同步默认采集全部作品列表并抽取 3 条详情，缩短浏览器采集时间且不影响粉丝、封面和作品指标入库。
- 移除账号健康度模块，将六个指标调整为桌面端两行三列。
- 封面统一使用无 Referer 懒加载和失败占位；官方 API 运营调度继续关闭。

## 2.10.2-storage - 2026-07-24

- Creator 数据查看权限与管理权限分离：具有 `creator:data:view` 的系统角色可查看已完成标准化同步的公开平台账号，管理操作仍仅限 admin、director。
- Creator Agent 抖音驾驶舱、作品库、趋势、同步日志和运营分析查询统一使用公开查看范围；同步、绑定和授权管理继续保留权限隔离。
- 抖音作品库 API 增加 cursor 分页，默认 20 条、最大 100 条，前端按页加载。
- 统一作品封面解析顺序，并为作品库与驾驶舱 TOP5 增加懒加载和失败占位。
- 本阶段不修改数据库结构、不执行生产数据库变更，也不清理历史数据。

## 2.10.2-sync - 2026-07-24

- 服务端按 `contract_version` 分流，支持 v2.10.2 严格 `DouyinWorkInput`，并兼容无版本/v2.10.1 payload。
- 同一作品在单个事务中写入 `creator_content_items` 与 `douyin_works`，通过 `content_id` 关联。
- 同步日志增加契约、采集模式、快照和统计摘要字段；`snapshot_id` 支持幂等提交。
- 历史直接删除逻辑改为只读污染候选报告，本阶段不清理历史数据。

## 2.10.2-agent - 2026-07-24

- Agent 增加安全 JSON 解析、超长 ID 字符串保真、严格作品识别、cursor 分页及 v2.10.2 上传契约。
- 修复编辑器右键菜单定位和 BubbleMenu 互斥问题，保留多人协作光标链路。

## 2.10.1 - 2026-07-24

- 新增标准 `douyin_*` 账号、作品、日快照、作品快照、分析和同步日志模型。
- Creator Center 运营分析与趋势改为读取标准抖音真实表。

## 2.10.0 - 2026-07-23

- Creator Data Center 升级为独立账号数据分析中心，新增数据驾驶舱、作品库、作品复盘、趋势分析、粉丝分析与运营报告。
- 新增数据库规则驱动的 `CreatorAnalyticsService`，提供账号健康度、作品透明评分、评论关键词、流量结构与周期趋势计算。
- 新增日报、周报、月报数据分析报告，以及 `creator:report:view`、`creator:report:manage` 权限。
- 保持 Creator Agent、真实 Chrome CDP、Network Collector、Page Explorer、AES-256-GCM、HMAC-SHA256 与 `/data-sync` 协议不变。

## 2.9.1 - 2026-07-23

### 稳定性与治理

- Agent 新增本地同步任务账本，记录运行、成功、部分成功和失败状态及模块计数。
- 上传层按 `platform_item_id` 增量发送新作品，指标继续按 `snapshot_time` 保存历史。
- 服务端改为模块级独立事务，作品、指标、画像、原始数据或页面知识库单模块失败不再回滚其他模块。
- 原始 API 响应新增 SHA-256 哈希去重与 gzip 压缩，降低长期存储增长。
- Page Explorer 增加响应字段路径提取并同步至 `creator_page_schema` 页面知识库。

### 分析、权限与协作

- 新增 `creator_insights` 与本地规则分析服务，生成日、周、月、作品和粉丝洞察。
- 新增作品详情路由 `/analytics/creator-center/work/:id`，展示基础指标、趋势、标签和表现评级。
- 新增 `creator:data:view`、`creator:data:manage` 及账号授权范围表。
- 远程光标标签支持平滑移动、淡入淡出、最多显示最近活跃三人，其余以头像列表收纳。

## 2.9.0 - 2026-07-23

### Creator Data Center

- 新增平台无关的创作者账号、内容资产、指标快照、趋势、账号经营、粉丝画像和原始 API 数据模型。
- 新增 `POST /api/creator-agent/data-sync`，沿用 AES-256-GCM 加密与 HMAC-SHA256 签名，服务端统一完成身份校验、解密、事务入库、去重和快照创建。
- Creator Agent 上传层将真实采集快照映射为统一协议；保留旧 `/report` 服务端接口用于兼容既有客户端。
- 新增真实 Page Explorer，扫描创作者中心按钮和 Tab，记录点击后新增的 XHR/fetch 到 `page-capability-map.json`。
- 新增 `/analytics/creator-center` 运营数据中心，包含账号驾驶舱、作品库、作品分析、粉丝画像和历史复盘。

### 多人协作编辑

- 远程光标用户名改为编辑区行侧动态标签，不再覆盖正文。
- 标签仅在远程光标活跃时短暂显示，支持多人光标、滚动与窗口尺寸变化，并保持 pointer-events 隔离。
- 保持既有 Yjs 同步、断线重连、版本历史与撤销链路不变。
## 2.20.0 - 2026-08-18

### 新增

- Creator Collector 切换为 Scrapling First 本地 Worker，增加脱敏 XHR 与能力清单。

### 技术升级

- Creator Agent 升级为 2.12.0-agent；移除旧 Node Playwright Collector 和已提交构建产物。
