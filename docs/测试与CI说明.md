# 测试与 CI 说明

> 配置文件：`.github/workflows/ci.yml`  
> 触发条件：`main` 分支 `push` 与 `pull_request`

---

## 1. 总览

CI 在 GitHub Actions（`CI` workflow）中并行执行 **6 个 Job**。其中合并 `main` 的分支保护要求 **2 项必需状态检查**：

| 必需检查 | Job 名 | 作用 |
|---------|--------|------|
| 1 | `fast-gate` | 依赖、审计、版本、类型检查、生产构建 |
| 2 | `core-security-contract` | 业务契约与安全回归（Auth / RBAC / Socket / Origin / Mobile / Ops） |

其余 Job 为平台与端上契约验证，失败会标红 workflow，但不计入上表两项 required checks。

> 直推 `main` 会被拒绝。变更必须通过 Pull Request，并等待上述 2 项检查通过后合并。

---

## 2. Job 说明

### 2.1 `fast-gate`（必需）

| 步骤 | 命令 | 说明 |
|------|------|------|
| 安装 | `npm ci` | 按 `package-lock.json` 锁定安装 |
| 入口完整性 | `npm run test:entrypoints` | 校验测试入口脚本存在且可解析 |
| 依赖审计 | `npm audit --audit-level=high` | 高危及以上漏洞直接失败 |
| 版本一致性 | `npm run version:check` | 版本号与发布契约对齐 |
| 类型检查 | `npm run check` | `tsc --noEmit` |
| 生产构建 | `npm run build` | `tsc -b && vite build` |

环境：`ubuntu-latest` · Node.js **22** · npm cache

### 2.2 `core-security-contract`（必需）

在 `npm ci` 后串行执行核心契约与安全测试，覆盖：

- **内容与 API**：选题、API 契约、创作资料、内容文档
- **认证与权限**：Auth / RBAC 不变量 / Session / V1 / Login Gateway / 角色授予上限
- **实时协作**：Socket 生命周期、协调器、Yjs 非法 update、协作授权
- **安全边界**：Origin / CORS、错误响应脱敏、HTML 净化、Webhook fail-closed、会话撤销、401 Recovery
- **移动端与原生**：Safe Draft、网络、消息分类、返回键、深链、设备注册、Android 运行时与生产门禁
- **运维**：CI 状态决策、备份锁/清单/恢复演练、迁移就绪、版本治理、部署安全

### 2.3 `android-debug-apk`

| 步骤 | 说明 |
|------|------|
| Java 21 (temurin) | Android 构建 |
| `npm run mobile:sync:production` | 同步生产端点契约 |
| `test:android-build-endpoints` | 端点契约 |
| `./gradlew assembleDebug` | Debug APK |
| `test:apk-endpoint-artifact` | 产物内端点校验 |
| 上传产物 | `xmt-android-debug` |

### 2.4 `creator-agent-package-contract`（Windows）

Creator Agent Electron 打包契约：

- `npm --prefix agent ci` + `electron:build`
- `test:package-runtime`（包运行时安全）

### 2.5 `creator-agent-macos-arm64-package-contract`（macOS 14）

- Python 3.11 venv + `electron:build:mac`
- `test:package-runtime:mac`
- 上传 `xmt-creator-agent-macos-arm64`（`agent/release/XMT-Creator-Agent-v*-macos-arm64.zip`）
- 产物路径按 `agent/package.json` 版本推导，**禁止**在 CI 写死旧版本号

### 2.6 `collector-contract`

Python 采集器契约：

- `collector/requirements.lock` 安装
- Renderer 安全 / Collector Bridge / 浏览器认证 / CLI 导出断言
- `pytest collector/tests`

---

## 3. 读取 CI 结论

```bash
# 需要本机已登录 gh 或提供 GITHUB_TOKEN
npm run ops:ci-status -- <commit-sha>
```

输出 JSON 中的 `decision`：

| 值 | 含义 |
|----|------|
| `PASS` | `fast-gate` 与 `core-security-contract` 均为 success |
| `FAIL` | 任一必需 Job 失败 / 取消 / 超时 |
| `IN_PROGRESS` | 仍在运行 |
| `NO_RUN` | 该 SHA 无 CI 运行 |
| `UNAVAILABLE` | GitHub API 网络错误或限流 |

判定逻辑见 `api/modules/ops/ci-status-decision.ts`（有对应单测 `test:ops-ci-status`）。

---

## 4. 提交前本地检查

UI / 业务改动至少执行：

```bash
npm run check
npm run build
```

建议同时：

```bash
npm run lint
```

全仓 ESLint 仍有历史债务，**未纳入 CI 阻塞**；新增代码不应扩大 lint 问题。

### 4.1 UI / 设计系统改动

涉及 `src/styles/tokens.css`、`src/index.css`、`src/components/studio/**`、`src/design-system/**` 或业务页配色时，额外确认：

1. 颜色、圆角、阴影、动效只走 token（`DESIGN.md`）
2. 不新增 hex 硬编码色板
3. 浮层使用 `xmt-overlay` + `xmt-panel-enter`
4. 空态 / 骨架 / 错误态走统一组件
5. 尊重 `prefers-reduced-motion`

### 4.2 发布版本

1. 更新 `package.json` 的 `version`
2. 同步根目录 `CHANGELOG.md` 与 `docs/CHANGELOG.md`
3. 更新 `src/data/changelog.ts`（更新弹窗数据）
4. 更新 `README.md` 当前版本号
5. 执行 `npm run version:check`

---

## 5. 本地 Smoke / E2E（不进 CI）

以下需要真实服务与临时凭据，**只在本地隔离环境执行**，CI 不注入 token。

日报：

```bash
API_BASE_URL=http://localhost:3001/api TOKEN=本地临时token ADMIN_TOKEN=本地临时管理员token npm run test:daily-reports
```

复盘：

```bash
API_BASE_URL=http://localhost:3001/api TOKEN=本地临时token ADMIN_TOKEN=本地临时管理员token npm run test:retrospectives
```

E2E：

```bash
E2E_BASE_URL=http://localhost:5174 E2E_USERNAME=本地测试账号 E2E_PASSWORD=本地测试密码 npm run test:e2e
```

> 不要将真实 Token、账号、密码或生产密钥写入代码、脚本、文档、CI 配置或提交记录。

---

## 6. 产物

| Job | Artifact 名 | 内容 |
|-----|-------------|------|
| android-debug-apk | `xmt-android-debug` | Android Debug APK |
| creator-agent-macos-arm64-package-contract | `xmt-creator-agent-macos-arm64` | macOS ARM64 Creator Agent 安装包 |

Windows Creator Agent 与 collector 契约 Job 当前只验证、不上传产物。

---

## 7. 分支保护与合并

1. 禁止直推 `main`
2. 变更走 PR（建议分支名如 `feat/*` / `fix/*` / `codex/*`）
3. Required status checks：**fast-gate**、**core-security-contract**
4. 全绿后由仓库管理员合并；合并后本地 `git pull` 对齐

---

## 8. 后续建议

- 在隔离测试库与稳定测试账号就绪后，再考虑把 smoke / E2E 作为非生产阻塞项
- 分批清理历史 lint 债务后，将 `npm run lint` 纳入 `fast-gate`
- 新增契约测试时同步更新本文 Job 表，避免文档与 `ci.yml` 再次漂移

---

## 9. 修订记录

| 日期 | 说明 |
|------|------|
| 2026-09-22 | 按当前 `ci.yml` 全量重写：6 Job、2 项必需检查、产物、本地检查与 UI 设计系统约定 |
| 早期版本 | 仅记录 `check/build`，已过时 |
