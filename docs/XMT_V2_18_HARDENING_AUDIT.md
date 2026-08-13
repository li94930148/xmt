# XMT v2.18 安全与发布可靠性审计

审计日期：2026-08-12。结论以当前工作区代码为准；未连接或修改生产环境。

## 已实施

### COLLAB-01（P0）协作文档未按资源范围授权

- 证据：原 `authorizeSocketRoomJoin` 只校验正整数用户 ID 与非空房间；`roomManager` 在 JOIN 时立即发送 Yjs state，UPDATE 与 awareness 未要求已加入房间。
- 风险：已登录用户可猜测 `production:<id>` 或 `shooting:<id>` 读取状态并广播写入。
- 处理：新增 `CollaborationAccessPolicy`，仅解析两类严格房间格式；JOIN 需 view，UPDATE 需 edit 且已 JOIN，awareness 与 typing 需已 JOIN。非特权的 production/shooting 参与者具有查看而非编辑协作权限；服务端身份覆盖客户端 payload。
- 数据库/生产配置：无 schema 或生产配置变化。

### RBAC-01（P0）主角色与多角色映射可分叉

- 证据：`POST /api/roles/user/:userId` 原允许空 `role_ids`，先删除 `user_roles` 后未更新 `users.role`；而前后端管理员 bypass 依赖 `users.role`。
- 风险：管理员权限撤销后仍可能保持全权限。
- 处理：拒绝空、重复、非法和不存在角色；先验证用户与角色，再单事务替换映射并同步首个角色为主角色，提交后清缓存。
- 数据库/生产配置：无 schema 或生产配置变化。

### DEPLOY-01（P0）WAL 备份 fallback 与失败部署滞留

- 证据：`deploy/xmt-safe-deploy.sh` 在无 `sqlite3` 时复制主 `.db`，且健康检查失败只退出。
- 风险：WAL 已提交数据可能未进入副本，新代码故障可使服务停在不可用版本。
- 处理：`sqlite3` 现在为强制依赖；使用 `.backup`、`quick_check` 和可打开验证；记录 previous/target SHA，部署后的任意失败自动恢复上一应用提交并重新健康检查。数据库不自动回滚。

## 已实施的 P1

- `RBAC-02`：角色与权限映射创建/替换改为完整事务，拒绝重复和不存在的权限 ID。
- `BACKUP-01`：备份下载、删除只接受严格的 XMT 备份文件名，并校验解析路径仍在备份目录内。
- `CI-01`：PR/main 增加 version、Auth、Socket、Yjs、Topic、API Contract、协作访问策略和真实 Socket.IO 授权黑盒的核心安全门禁；需要真实凭据的 smoke 不进入每次 PR。
- `OPS-01`：`main` 已启用单一 Branch Protection：必须经 PR、严格要求 `fast-gate` 和 `core-security-contract`、管理员也不得绕过、禁止 force push 与删除；单维护者不要求额外批准。
- `OPS-02`：API、systemd 与部署备份使用共享目录锁协议；Web 进程不再自行启动/定时备份，避免多实例与运维 timer 重复执行。
- `OPS-03`：新增默认非破坏性 restore drill 与 migration compatibility Gate。历史 migration checksum 不变；未审查或阻止代码回滚的待执行 migration 默认阻止无人值守部署。

## 仅完成评估，未在本阶段修改

- Creator Agent 客户端当前上传 `protocol_version=1`、timestamp、nonce、HMAC 和 AES-GCM。服务端现在以 `XMT_CREATOR_AGENT_V1_ONLY=true` 提供可逆拒绝开关，并记录不含凭据的 legacy 协议遥测；默认继续兼容缺失版本和 legacy `/report`，直到生产绑定 Agent 状态有证据可支持强制启用。
- 正式 migrations 已有 runner 与 checksum 记录，但 `initDatabase` 仍同时承载大量 compat ALTER/seed；建议下一阶段将新增演进限定到 versioned migration，并要求 expand-only/向后兼容审查。
- 前端构建基线：Silk route chunk 843.49 kB（gzip 227.02 kB）、editor chunks 210–379 kB；现有 reduced-motion CSS 已覆盖。应先建立 route chunk、Canvas 残留、移动端与编辑输入延迟预算，不凭感觉删减视觉能力。
- Auth v1 生产证据仍为 legacy、门禁关闭且观察样本不足；`npm run ops:auth-readiness` 以 PM2、RSS、heap、Socket 生命周期、health、SQLite 和业务样本窗口生成逐项 `PASS/FAIL/UNKNOWN`。仅可信异常为 `NO-GO`，数据缺失为 `INSUFFICIENT_DATA`；它不会重启进程、修改配置或写入数据库。本阶段未启用任何 Auth/Login/Socket 灰度。

## 剩余风险

- 协作策略现有真实 Socket.IO 黑盒测试，使用实际认证、JOIN、Yjs SYNC/UPDATE、awareness、typing 和临时测试数据库；覆盖越权、伪造身份、只读参与者、未 JOIN 写入、非法房间及断线后 disabled 重连。授权在每次连接和每次协作事件执行；在线已加入 Socket 的即时撤权仍不是本阶段能力。
- API、部署和 systemd 备份通过同一目录锁协议互斥，锁持有者异常退出后以本机 PID 存活性回收。该协议的边界是单台主机；未来跨主机运行前必须替换为共享协调锁。`npm run ops:backup-restore-drill -- --backup=<绝对路径>` 可做非破坏性演练。
- 精确 SHA 的 CI 状态查询将 `RATE_LIMITED` 与 `NETWORK_ERROR` 作为不可用状态单独报告，绝不将其推断为 CI 失败或成功。
- 部署脚本在目标代码检出和 `npm ci` 后、服务重启前执行 `npm run migration:check`；依赖安装、迁移 gate 或构建失败时只恢复工作树，不重启仍在运行的旧服务。`REVIEW_REQUIRED`、`NO-GO` 或数据库信息不足都会终止无人值守部署，且不会执行 down migration。
- Web/Socket 协作状态仍是单实例运行态。部署脚本要求 PM2 目标应用恰好一个实例；未来横向扩容需先引入共享 Socket/协作状态与 leader/外部任务调度。
