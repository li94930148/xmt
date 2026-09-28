---
feature: project-integrity-audit
status: delivered
updated: 2026-09-22
branch: codex/project-integrity-audit
commits: ba1d3d8..HEAD
---

# XMT 项目完整性与连贯性深审

## Report

**What was built** — 完成 XMT v3.0.5 全仓完整性与连贯性深审（D1–D10 + FE↔API↔shared 契约专项 + README 能力对照），并实跑验证基线（typecheck / lint / build / 89 条本地单测 / collector 38 / agent 11 / Playwright E2E）。结论：**主业务闭环（选题→创作→发布→复盘、权限骨架、协作 join/view ACL、移动端契约、备份/CI）基本可用；高优先级问题集中在授权一致性、抖音数据面断裂、Agent 采集假成功、以及「前端可点、后端未接/已死」的连贯性事故。** 独立复审驳回了初版两条高严重度结论（协作 join 无 ACL、topics 信封导致详情页字段全空），已按源码证据改写。

**Verification** — 见下方验证矩阵。关键命令均为 worktree `/Users/youfeifei/Projects/xmt/.worktrees/project-integrity-audit` 实跑。独立复审分项结论见 §0。

**Journey log** — 1) social-review 在 `app.ts` 显式不挂载，但 FE 五页仍完整存在——迁移半程最大的运行时 404 面。2) 「权限码未挂」≠「无授权」：production/topic 另有 ownership ACL，resources 写才是真缺口。3) Agent `scrapling.ts` 把 captures/dashboard/fans 硬编码为空，collector 落盘数据从未上送，属静默假成功。4) `getTopic` 已解 `.data`，**不要**盲目再解一层；只修 `createTopic`。5) 子代理 Finding 必须回源码核验后再进 P0——本次 F-D5-01/F-CT-03 即被独立复审驳回。

### 0. 独立复审结论（T10）

| 分项 | 结论 |
|---|---|
| Spec compliance | T1–T9 满足；T10 由本复审完成。初版表格缺 location/evidence/impact/domain，已在 §0b 为关键项补齐 S2 全字段 |
| Correctness | **F-D5-01、F-CT-03 主结论被驳回并已改写**；F-D2-01/F-D3-01 降为 medium（ownership ACL 在）；补充 **F-D5-06**；F-D10-02 上调 high；不安全 P0（对 `getTopic` 再解包、盲加窄化 join ACL）已撤回 |
| Codebase consistency | ID 与 P0/P1/P2 稳定；severity 改为单一值；验证词汇统一 PASS/FAIL/PRE-EXISTING/BLOCKED |

**复审驳回摘要**

- **F-D5-01 原表述**「join 无文档 ACL → 任意用户可读 Yjs」**不成立**：`roomManager` join 已调用 `collaborationAccessPolicy.canViewDocument`（topic 范围 ACL），且有 `collaboration-socket-authorization` / `collaboration-access-policy` 测试。Residual 仅：静默拒绝、`authorizeSocketRoomJoin` stub、以及 **F-D5-06** 编辑角色面过宽。
- **F-CT-03 原表述**「TopicDetail 字段 undefined / 灵感 toast #undefined」**不成立**：`getTopic` 已 `return result.data`；灵感 promote 返回裸 `{message, topicId}`。Residual 仅 `createTopic` 返回信封与类型不一致。
- **F-D2-01 / F-D3-01** 路由缺 `requirePermission` 属实，但服务层分别有 `canEditTopic` / `canEditProduction` ownership ACL，**不是**开放写；与 F-D9-04（resources 无任何授权码）不可同级。

### 0b. 关键 Finding 全字段明细（S2 格式）

**F-D6-01** | critical | 连贯性  
location: `api/app.ts:58`; `src/App.tsx:240-243`; `src/api/socialReview.ts:3`  
evidence: app.ts 注释 “Legacy social-review routes are intentionally not mounted”；挂载列表无 `/api/social-review`；FE 仍注册 SocialReview 等页并调用约 30 个端点。  
impact: 社媒复盘/远程扫码登录整域运行时 404。  
recommendation: 挂载路由并加权限，或下线 FE 路由与客户端；迁移中用 feature-flag。

**F-CT-01** | critical | 连贯性  
location: `src/api/douyin.ts:39-69`; `api/routes/douyin.ts`; `src/config/navigation.ts:159`  
evidence: FE 调 `/scrape/:id`、`/snapshots/*`、`/trend/:id`；API 仅 OAuth/accounts/webhook + 410 墓碑。  
impact: DouyinAnalytics 页全链路失败。  
recommendation: 下线该页并指向 creator-agent，或重建路由。

**F-D1-01** | high | 安全/数据  
location: `api/middleware/auth.ts:87`; `src/components/ProtectedRoute.tsx:13`  
evidence: `force_change_password` 仅映射进 `req.user`，无 403；仅 FE 重定向。  
impact: 改密前旧会话仍可调业务 API。  
recommendation: authenticate 对白名单外（change-password/logout/me/login/health）返回 403 `PASSWORD_CHANGE_REQUIRED`。

**F-D1-02** | high | 安全/数据  
location: `api/middleware/permissions.ts`（admin 短路）vs `user_roles`/`role_permissions`  
evidence: RBAC 联表与 `req.user.role === 'admin'` 双源。  
impact: 权限矩阵与审计不可信。  
recommendation: 统一 RBAC 或改角色时双写 + 不变量测试。

**F-D7-01** | high | 完整性  
location: `agent/core/collector/scrapling.ts:97-109`  
evidence: `raw.captures: []`、`fans: {}`、`dashboard: {}` 硬编码；collector 已 sanitize 落盘。  
impact: raw_records/fans 静默假成功。  
recommendation: 映射 collector 产物；空则标 empty/failed。

**F-D9-01** | high | 完整性  
location: `src/components/PomodoroTimer.tsx:14-23`; `src/api/pomodoro.ts`; `api/routes/pomodoro.ts`  
evidence: 组件内 `// Mock API` 本地函数；真实客户端与后端均存在且未 import。  
impact: Web 番茄钟不落库，与排行榜不一致。  
recommendation: 换真实 API 并对齐 stats 字段名。

**F-D9-04** | high | 安全/数据  
location: `api/routes/resources.ts:167-236`  
evidence: 写路径仅 `authenticate` + ownership；`file_path` 直接入库。  
impact: 绕过统一 RBAC。  
recommendation: 补 `resource:*` 或并入 resource-center；路径白名单。

**F-D5-06** | high | 安全/数据  
location: `api/collaboration/access/CollaborationAccessPolicy.ts`（`canEditDocument`）  
evidence: admin/director/editor/copywriter/post_production/camera 无条件 `return true`，不校验 creator/assignee。  
impact: 可编辑任意能看见的 production/shooting 房。  
recommendation: 与 `canEditProduction`/`hasEditScope` 对齐。

**F-CT-03** | medium | 连贯性  
location: `src/api/topics.ts:61-68`（`createTopic`）  
evidence: 返回 `response.json()`（`sendSuccess` → `{success,data:{topicId},message}`）但类型为 `{message,topicId}`；`getTopic` 已正确 `return result.data`。  
impact: `createTopic` 调用方可能读到 `topicId === undefined`。  
recommendation: **只**解包/修正 `createTopic`；**禁止**再对 `getTopic` 解一层。

### 1. 执行摘要

| 维度 | 总评 |
|---|---|
| 功能完整性 | **部分完整**：核心内容生产链路可用；抖音数据/社媒复盘、番茄钟 Web 端、模板管理存在断环或死面 |
| 跨模块连贯性 | **偏弱**：FE↔API 路径/信封/字段多处漂移；Agent→API 原始采集链路断裂；shared 契约大量单边 |
| 测试/质量 | **中等偏上**：auth/协作/安全测试厚；workflow 三阶段与复盘权限几乎只有 smoke；lint 380 问题为存量债 |
| 安全/数据 | **有高危**：协作编辑角色面过宽、强制改密仅前端拦截、admin 短路 RBAC、resources 写无授权 |
| 文档/工程 | **中等**：备份/CI/版本治理扎实；README 抖音能力与 OpenAPI 覆盖被夸大 |

**Top 风险（P0 候选，已按独立复审修正）**

1. **F-D6-01 / F-CT-02** social-review API 未挂载但 FE 五页可进 → 整域 404
2. **F-CT-01 / F-D6-02** `DouyinAnalytics` 调用不存在的 scrape/snapshot/trend 端点
3. **F-D1-01 / F-D1-02** 强制改密仅 FE 拦截；`users.role==='admin'` 短路 RBAC
4. **F-D7-01 / F-D7-02** Agent 主采集路径 captures 为空 → raw_records 静默假成功
5. **F-D9-04** resources 写路径完全无授权码
6. **F-D9-01** 番茄钟组件内 mock，后端与客户端 API 均已就绪却未接入
7. **F-D5-06** `canEditDocument` 按角色放行编辑；**F-D5-01 residual**：join 静默拒绝 + stub
8. **F-D10-02** `/api/auth/*` 绕过全局限流

### 2. 验证矩阵

| 命令 | 结果 | 备注 |
|---|---|---|
| `npm run check` | PASS | 根 `tsc --noEmit` 干净 |
| `npm run lint` | FAIL (PRE-EXISTING) | 380 problems / 328 errors / 52 warnings；未新增 |
| `npm run build` | PASS | `tsc -b && vite build` 成功；有 chunk>500kB 警告 |
| `npm run test:entrypoints` | PASS | 110 个测试入口 |
| 本地独立 `test:*`（89） | 85 PASS / 4 FAIL | 见下表 |
| `agent` `npm run check` | PASS | main + renderer tsc |
| `agent` `test:cross-platform` | PASS | 11/11 |
| `collector` pytest | PASS | 38 passed |
| Playwright `tests/browser/*` | 部分 PASS / 多项 FAIL·BLOCKED | 见 E2E 表 |

**单测 4 个失败归因**

| 测试 | 状态 | 归因 |
|---|---|---|
| `test:auth-session-migration` | PRE-EXISTING FAIL | 断言 `databaseMigrations.at(-1).version === '005'`，实际 `014`；断言过时 |
| `test:auth-production-build-runtime` | BLOCKED | 需要 `XMT_PRODUCTION_TEST_URL` |
| `test:official-export-real-http` | BLOCKED/ENV | 需要真实官方导出 HTTP；`retryable_failed` |
| `test:android-build-endpoints` | BLOCKED | 依赖 `dist/xmt-mobile-build.json` |

**E2E 摘要**

| Spec | 结果 | 归因 |
|---|---|---|
| `auth-socket-yjs-e2e` | PASS | |
| `socket-auth-recovery` | PASS | |
| `creator-reports-auth-readiness` | FAIL | `UpdateNotification` 全屏遮罩拦截点击 |
| `creator-trends-official-daily` | FAIL | 同上遮罩拦截 |
| `douyin-growth-availability.spec.tsx` | FAIL | 测试内 JSX 被当成 React child（测试基建） |
| `reactbits-guard-only` / `persistent-off` 等 | BLOCKED | 缺 `XMT_E2E_USERNAME` / `XMT_E2E_PASSWORD` |

### 3. 分域发现（D1–D10 + 契约）

严重度：critical / high / medium / low。关键项全字段见 §0b。

#### D1 认证与权限

| ID | Sev | 结论 | 建议 |
|---|---|---|---|
| F-D1-01 | high | `force_change_password` 仅 FE 拦截；API 不拒绝 | 403 `PASSWORD_CHANGE_REQUIRED` + 白名单 |
| F-D1-02 | high | admin 短路与 RBAC 双源 | 统一 RBAC 或双写 + 不变量测试 |
| F-D1-03 | medium | legacy JWT 不走 session 吊销 | 接入 SessionService 或强制 iss/aud |
| F-D1-04 | low | 权限缓存 60s 未测降权窗口 | 改角色强制 `clearPermissionCache` |

#### D2 选题与创作

| ID | Sev | 结论 | 建议 |
|---|---|---|---|
| F-D2-01 | medium | update/status 无 `requirePermission`；**ownership `canEditTopic` 在**（复审修正） | 对齐权限码前核角色授予 |
| F-D2-02 | high | 删题级联 5 处空 catch 不回滚 | 单事务 + 失败抛错 |
| F-D2-03 | medium | legacy/v1 校验强度不一致 | 统一 schema 或 legacy 只读 |
| F-D2-04 | low | 缺流转/级联测试 | 补 403 与孤儿行断言 |

#### D3 拍摄/生产/发布

| ID | Sev | 结论 | 建议 |
|---|---|---|---|
| F-D3-01 | medium | production 写无权限码；**`canEditProduction` 在**（复审修正） | 对齐前核授予，避免误伤 ownership 协作者 |
| F-D3-02 | medium | 列表 content 双别名 vs 详情 COALESCE | 统一 SELECT |
| F-D3-03 | medium | history 无 LIMIT 且 `ph.*` | 分页 + 去大字段 |
| F-D3-04 | medium | `production:*` vs `workflow:production` 两套码 | 归并词表 |
| F-D3-05 | medium | shooting/publishing CRUD 无自动化 | 补 `workflow-stage-crud` |

#### D4 复盘/分析/日报

| ID | Sev | 结论 | 建议 |
|---|---|---|---|
| F-D4-01 | medium | `/api/reports` 与 `/api/daily-reports` 双 API | deprecate `/api/reports` |
| F-D4-02 | medium | 复盘权限仅 smoke | 迁入 `retro-permissions.test.ts` |
| F-D4-03 | low | 文案正则判 400 | 改错误码 |
| F-D4-04 | low | `/archive` 路由层缺权限码 | 补 `report:daily:archive` |

#### D5 协作与实时

| ID | Sev | 结论 | 建议 |
|---|---|---|---|
| F-D5-01 | medium | **复审修正**：join 已有 `canViewDocument`。Residual：静默拒绝、`authorizeSocketRoomJoin` stub | 拒绝时 emit 错误；stub 对齐或删除 |
| F-D5-02 | medium | `collaborationGuard.canEdit` 名不副实 | 重命名 `isDocUnlocked` |
| F-D5-03 | medium | 锁/lockEvents 仅内存 | 落库 + LIMIT |
| F-D5-04 | low | update 失败单 reason | 分型错误 |
| F-D5-05 | low | dashboard/timeline 无契约测试 | 补越权用例 |
| F-D5-06 | high | **复审补充**：`canEditDocument` 对多角色无条件放行编辑 | 与 `hasEditScope`/`canEditProduction` 对齐 |

#### D6 抖音/创作者数据

| ID | Sev | 结论 | 建议 |
|---|---|---|---|
| F-D6-01 | critical | social-review 未挂载；FE 五页仍在 | 挂载或下线 FE |
| F-D6-02 | critical | DouyinAnalytics 调死端点 | 下线或对齐 creator-agent |
| F-D6-03 | high | export 等回传原始 error | `sendSafeServerError` |
| F-D6-04 | medium | sync 时间戳只读不写 | 写入或删字段 |
| F-D6-05 | medium | 官方导出标题匹配脆弱 | 优先 `platform_item_id` |
| F-D6-06 | medium | `accountId===2` + stub | 去白名单；实现或删 stub |
| F-D6-07 | medium | heartbeat 不校验 protocol_version | 与 data-sync 对齐 |
| F-D6-08 | low | 无 FE⊆mounted 契约测试 | fail-on-unmounted |

#### D7 Agent / Collector

| ID | Sev | 结论 | 建议 |
|---|---|---|---|
| F-D7-01 | high | captures/dashboard/fans 硬编码空 | 映射 collector；空则标 empty/failed |
| F-D7-02 | high | 上传链路断裂，raw_records 恒空 | worker 带 captures；契约测试 |
| F-D7-03 | medium | README 平台范围冲突 | 更新说明 |
| F-D7-04 | medium | 双协议同名未交叉校验 | bridge health + 命名区分 |
| F-D7-05 | medium | collect() 无单测 | 补契约测试 |
| F-D7-06 | low | TLS 依赖 env | 部署清单断言 |

#### D8 移动端 — **无重大缺口**

| ID | Sev | 结论 | 建议 |
|---|---|---|---|
| F-D8-01 | medium | `allowBackup=true` + prefs 凭据 | 关 backup 或排除 |
| F-D8-02 | low | SecureCredential 无测试 | 补 JVM/仪器测试 |
| F-D8-03 | low | README 路线图未勾选移动端 | 更新文档 |
| F-D8-04 | low | deep-link host 仅 4 个 | 常量表双端引用 |

#### D9 组织协作外围

| ID | Sev | 结论 | 建议 |
|---|---|---|---|
| F-D9-01 | high | PomodoroTimer 组件内 mock | 接真实 API |
| F-D9-02 | medium | templates 无 FE 页面 | 补页面或删客户端 |
| F-D9-03 | medium | resources / resource-center 双体系 | 收敛 |
| F-D9-04 | high | resources 写无授权码 | 补权限 + 路径白名单 |
| F-D9-05 | low | public 泄露版本号 | 去掉 version |
| F-D9-06 | low | ranking 隐私 + 文案 bug | 脱敏；修字符串 |
| F-D9-07 | low | D9 零 OpenAPI | 逐步 Zod 化 |

#### D10 运维/安全/工程

| ID | Sev | 结论 | 建议 |
|---|---|---|---|
| F-D10-01 | medium | catch 显式回传 error.message | `sendSafeServerError` + lint 门禁 |
| F-D10-02 | high | auth 绕过 apiLimiter（复审上调） | 限流前置或 auth 独立桶 |
| F-D10-03 | low | 根目录遗留脚本 | 归档 `scripts/audit-scratch/` |
| F-D10-04 | low | OpenAPI 宣称过满 | 覆盖率矩阵 + 快照 diff |
| F-D10-05 | low | overrides 无 CVE 注释 | 记录动机 |

**D10 已验证扎实**：错误脱敏主路径、备份恢复演练、safe-deploy 顺序、版本治理、origin/internal-access、限流维度化、CI fast-gate。

#### 契约专项（F-CT）

| ID | Sev | 结论 | 建议 |
|---|---|---|---|
| F-CT-01 | critical | DouyinAnalytics 全链路 404 | 下线或重建 |
| F-CT-02 | critical | social-review 整域 FE 死客户端 | 挂载或下线 |
| F-CT-03 | medium | **复审修正**：仅 `createTopic` 信封/类型不一致 | **只**修 `createTopic` |
| F-CT-04 | high | shared Douyin 类型与 OAuth 载荷不符 | 对齐或删除 |
| F-CT-05 | medium | FE `/latest-snapshot` vs API `/snapshots/latest` | 修路径 |
| F-CT-06 | medium | OpenAPI 缺 7 个 v1 操作 | 补注册 |
| F-CT-07 | medium | `/api/reports` 死面 | deprecate |
| F-CT-08 | low | shadow-analytics 等无 FE 调用 | 标 internal 或删 |
| F-CT-09 | medium | 多套响应信封并存 | 新接口统一 v1 |
| F-CT-10–14 | low | shared 单边/死导出 | 收敛或标注 |
| F-CT-15 | medium | README 抖音能力夸大 | 改文案 |

#### README 能力对照（T8 摘要）

- **已实现**：选题/创作/发布/复盘/协作/编辑器/组织外围/JWT·RBAC 骨架/备份 CI 等
- **部分**：拍摄人员分派、后期阶段机、数据采集→复盘、行动项→选题回写、抖音数据接入与趋势、OpenAPI
- **缺失/断环**：社媒复盘运行时、DouyinAnalytics 抓取面、番茄钟 Web 落库、模板管理 UI
- **文档过时**：抖音能力表述、OpenAPI 能力背书、Agent 平台范围、移动端路线图

### 4. 修改建议路线图

#### P0 — 安全与运行时事故（1–2 个迭代；已按复审修正操作步骤）

| 建议 | 触点 | 对应 |
|---|---|---|
| social-review：挂载或下线 FE（feature-flag） | `api/app.ts`, `src/App.tsx`, `src/api/socialReview.ts` | F-D6-01 F-CT-02 |
| DouyinAnalytics：下线死客户端或接 creator-agent | `src/api/douyin.ts`, `DouyinAnalytics.tsx` | F-D6-02 F-CT-01 |
| 强制改密 API 拦截（白名单 change-password/logout/me/login/health） | `api/middleware/auth.ts` | F-D1-01 |
| 收敛 admin 短路或与 RBAC 同步 | `api/middleware/permissions.ts` | F-D1-02 |
| resources 写补授权（**无** ownership 等价物，优先于 topic/production 权限码对齐） | `resources.ts` | F-D9-04 |
| 番茄钟接真实 API 并对齐 stats | `PomodoroTimer.tsx` | F-D9-01 |
| Agent captures 上送；空数据不得标 success | `scrapling.ts`, workerBridge | F-D7-01 F-D7-02 |
| export/resource-center 错误脱敏 | `export.ts`, `resource-center.ts` | F-D6-03 F-D10-01 |
| 收窄 `canEditDocument` 角色放行 | `CollaborationAccessPolicy.ts` | F-D5-06 |
| join 拒绝 emit 错误；对齐/删除 stub | `roomManager.ts`, `socket-auth.service.ts` | F-D5-01 |
| **只**修 `createTopic` 解包/类型（勿动 `getTopic`） | `src/api/topics.ts` | F-CT-03 |
| UpdateNotification 可关/自动关/降 z-index | `UpdateNotification.tsx` | E2E FAIL |
| `/api/auth/*` 纳入限流 | `app.ts`, `rateLimit.ts` | F-D10-02 |

#### P1 — 连贯性与数据正确性

| 建议 | 触点 | 对应 |
|---|---|---|
| 删题级联改事务 | `topics.sqlite-repository.ts` | F-D2-02 |
| production SELECT 对齐 + history 分页 | `workflow.ts` | F-D3-02 F-D3-03 |
| 权限词表归并（**先审计角色授予再动码**） | migrations / `db.ts` / FE | F-D3-04 F-D4-01 F-D2-01 F-D3-01 |
| deprecate `/api/reports`；resources→resource-center | `reports.ts`, `resources.ts` | F-CT-07 F-D9-03 |
| 官方导出改 platform_item_id；sync 时间戳写入 | `creatorSyncV291.ts`, `creatorAgent.ts` | F-D6-04 F-D6-05 |
| heartbeat 校验 protocol_version；去 accountId===2 | `creator-agent.ts`, social-review | F-D6-06 F-D6-07 |
| shared 类型/schema 对齐或标注单边 | `shared/types`, `packages/api-client` | F-CT-04 F-CT-10–12 |
| session-migration 断言改「含 005」 | `session-migration.test.ts` | 验证 FAIL |
| OpenAPI 补 mobile-auth + topic mutations | `openapi.ts` | F-CT-06 |
| `/archive` 补 `report:daily:archive` | `daily-reports.ts` | F-D4-04 |

#### P2 — 质量、文档与工程卫生

| 建议 | 触点 | 对应 |
|---|---|---|
| workflow 三阶段 / 复盘权限 / scrapling 契约 / FE⊆mounted 测试 | `tests/**` | F-D3-05 F-D4-02 F-D7-05 F-D6-08 |
| lint 清债 | eslint | 验证矩阵 |
| README 抖音/OpenAPI/Agent/移动端表述 | `README.md` | F-CT-15 F-D7-03 F-D8-03 F-D10-04 |
| 遗留脚本归档；overrides 补注释 | 根目录, `package.json` | F-D10-03 F-D10-05 |
| Android allowBackup + SecureCredential 测试 | Manifest, plugin test | F-D8-01 F-D8-02 |
| 协作锁落库；templates 收敛；deep-link 常量表 | collaboration / templates / platform | F-D5-03 F-D9-02 F-D8-04 |

### 5. README 能力矩阵（精简）

| 能力 | 状态 | 证据 |
|---|---|---|
| 选题提交/审核/分配/状态 | 已实现 | topics 模块（`createTopic` 类型 residual 见 F-CT-03） |
| 创作任务与内容编辑 | 已实现 | workflow production + ContentEditor |
| 拍摄计划/进度 | 部分 | 有 plan/location/status；缺独立人员分派 |
| 发布任务与平台信息 | 已实现 | workflow publishing |
| 内容分析/复盘/行动项 | 已实现 | analytics + retrospectives |
| 内容历史版本 | 已实现 | production history |
| Socket 协作 / Yjs / 锁 / 时间线 | 已实现 | join 已有 `canViewDocument`；编辑角色面过宽 F-D5-06 |
| Tiptap 编辑器 | 已实现 | editor 组件 |
| 消息/日历/灵感/资源/日报/成就 | 已实现 | D9 路由 + 页面 |
| 番茄钟 | **断环** | FE mock（F-D9-01） |
| JWT / RBAC / 限流 | 部分 | 骨架在；admin 短路与 auth 限流缺口 |
| 抖音账号与作品数据 | 部分 | creator-agent 有；DouyinAnalytics 死 |
| 抖音趋势/粉丝/运营分析 | 部分 | creator-agent 有；旧页 404 |
| 社媒复盘 | **运行时缺失** | API 未挂载 |
| OpenAPI / Webhook / 同步 | 部分 | OpenAPI 仅 v1 子集 |
| SQLite / 健康检查 / 备份 / ECS / CI | 已实现 | deploy + ops 测试 |

## [S1] Problem

XMT（v3.0.5）是前后端同仓的内容生产协作中台，子系统包括 `api`（Express + SQLite）、`src`（React/Vite）、`agent`（Creator Agent 桌面采集端）、`collector`（Python 采集运行时）、`android`（Capacitor 壳）、`shared`（契约/时间/工作流）以及大量测试与运维脚本。版本迭代快（近期集中在抖音官方导出、协作编辑、生产素材），但缺少一次覆盖全仓的功能完整性与跨模块连贯性审查，具体表现为：

1. **功能完整性不透明**：README / 核心能力宣称与实际路由、页面、服务实现之间是否有缺口、半成品或死代码，缺少系统对照。
2. **跨模块连贯性风险**：前端调用、API 契约、服务层、数据库字段、Agent/Collector 协议、移动端端点之间是否一致；共享 schema 是否被真实使用。
3. **验证基线不清**：`package.json` 中数十条 `test:*` / `smoke:*` / 浏览器 spec 的真实通过情况、哪些依赖外部账号/服务器、哪些是 PRE-EXISTING 失败，缺少一次完整记录。
4. **修改建议缺失**：在完整性/连贯性证据之上，需要可执行的优先级排序修改建议，而不是零散印象。

本 feature 的交付物是：全仓深审结论 + 测试验证记录 + 可执行修改建议（不在本阶段直接改业务代码，除非建议被后续批准实施）。

## [S2] Design

### 审查模型

按「能力域 × 切面」组织审查，输出统一发现格式（Finding）：

```text
Finding {
  id: F-xxx
  severity: critical | high | medium | low
  domain: 完整性 | 连贯性 | 测试/质量 | 安全/数据 | 文档/工程
  location: file:line 或 module
  evidence: 可复现证据（代码/命令输出）
  impact: 对功能完整性/连贯性的影响
  recommendation: 可执行修改建议（尽量到文件/接口级）
}
```

### 能力域清单（与 README 核心能力对齐）

| Domain ID | 能力域 | 主要路径 |
|---|---|---|
| D1 | 认证与权限 | `api/routes/auth.ts`, `api/middleware`, `src/auth`, `shared/schema/auth*.ts` |
| D2 | 选题与创作 | `api/routes/topics.ts`, `src/pages/Topic*`, `src/pages/AddTopic.tsx` |
| D3 | 拍摄/生产/发布 | `api/routes/production-resources.ts`, `workflow*.ts`, `src/pages/Production*`, `Shooting*`, `Publishing*` |
| D4 | 复盘/分析/日报 | `api/routes/retrospectives.ts`, `analytics.ts`, `daily-reports.ts`, `report-summaries.ts` |
| D5 | 协作与实时 | `api/collaboration`, `api/routes/collaboration-*`, `src/collaboration`, Socket/Yjs |
| D6 | 抖音/创作者数据 | `api/services/douyin*`, `creator*`, `api/routes/douyin.ts`, `social-review.ts` |
| D7 | Agent / Collector | `agent/`, `collector/` |
| D8 | 移动端 | `android/`, `src/platform`, `src/pages/mobile`, Capacitor 配置 |
| D9 | 组织协作外围 | 消息、日历、灵感、资源、成就、番茄钟、匿名反馈 |
| D10 | 运维/安全/工程 | `deploy/`, `api/security`, 限流、备份、错误脱敏、版本治理、CI |

### 切面检查（每个域都过一遍）

1. **完整性**：路由/页面/服务是否闭环；README 声称是否可走通；TODO/半成品/死路由。
2. **连贯性**：FE ↔ API 路径与载荷；`shared/` 契约是否双向使用；DB 字段与服务读写；Agent 协议与 API；Android 端点契约。
3. **错误与边界**：权限缺失、静默吞错、N+1、缺 LIMIT、错误响应是否脱敏。
4. **测试映射**：该域是否被 `tests/` 覆盖；测试与生产代码是否一致；明显缺口。
5. **文档一致性**：README / CHANGELOG / docs/releases 与代码行为是否冲突。

### 验证命令基线（必须实跑并记录）

| 类别 | 命令 | 说明 |
|---|---|---|
| 类型 | `npm run check` | 全仓 tsc |
| Lint | `npm run lint` | eslint |
| 构建 | `npm run build` | tsc -b + vite build |
| 契约/单元 | `npm run test:entrypoints` + 可本地独立执行的 `test:*` | 以 package.json 为准 |
| 浏览器 E2E | Playwright `tests/browser/*.spec.ts` 及同类 | 需本机浏览器；记录环境阻断 |
| Agent | `npm --prefix agent run check` 及 agent 侧 test | |
| Collector | `pytest`（collector/tests） | |

状态标记：`PASS` / `FAIL` / `PRE-EXISTING` / `BLOCKED`（缺凭证/浏览器/外网）。

### 报告结构（最终 Report）

1. 执行摘要（完整性/连贯性总评 + Top 风险）
2. 验证矩阵（命令 → 结果）
3. 按 D1–D10 的发现（Finding 列表）
4. 修改建议路线图（P0/P1/P2，含预估触点）

## [S3] Out of Scope

- 不在本 feature 内直接实施业务代码修改、重构或补测试实现（建议被批准后另开 feature）。
- 不对生产环境做写操作、不跑需要真实抖音账号登录的破坏性采集。
- 不重写 README/CHANGELOG 全文；只指出与代码冲突之处。
- 不处理 Android 原生 UI/Gradle 打包签名链路的深度逆向（以端点契约与 Capacitor 桥接为界）。
- 不删除仓库内既有未跟踪审计脚本；仅可参考其结论。

## Tasks

- [x] T1: 建立验证基线 — acceptance: `npm run check`/`lint`/`build` 与 test:entrypoints 结果已记录 (covers: S2)
- [x] T2: 跑通可本地执行的单元/契约测试套件 — acceptance: 每条 `test:*` 有 PASS/FAIL/PRE-EXISTING/BLOCKED 结论 (covers: S2; depends: T1)
- [x] T3: 跑通浏览器 E2E（tests/browser） — acceptance: 每个 spec 有结论；环境阻断须注明 (covers: S2; depends: T1)
- [x] T4: 深审 D1–D5（认证、选题创作、生产发布、复盘分析、协作） — acceptance: 每域至少输出完整性/连贯性 Finding 或明确「无缺口」 (covers: S1, S2)
- [x] T5: 深审 D6–D8（抖音数据、Agent/Collector、移动端） — acceptance: 同上，含协议/端点契约对照 (covers: S1, S2)
- [x] T6: 深审 D9–D10（组织外围、运维安全工程） — acceptance: 同上，含安全扫描复核 (covers: S1, S2)
- [x] T7: FE↔API↔shared 契约连贯性专项 — acceptance: 列出路径/字段不一致或确认一致 (covers: S2)
- [x] T8: README/能力宣称 vs 实现对照 — acceptance: 宣称能力逐条标注 已实现/部分/缺失/文档过时 (covers: S1)
- [x] T9: 汇总 Finding 并撰写修改建议路线图 — acceptance: Report 含 P0/P1/P2 建议与触点 (covers: S1, S2; depends: T2, T3, T4, T5, T6, T7, T8)
- [x] T10: 独立复审审查结论 — acceptance: 复审对 spec 合规性/正确性/一致性给出分项结论 (covers: S1, S2; depends: T9)
