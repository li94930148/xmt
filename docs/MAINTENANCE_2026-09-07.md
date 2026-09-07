# 2026-09-07 分支整合、历史修复与项目精简

## 范围与版本

本轮版本 v2.20.16，基于 PR #41 的 v2.20.15 安全整改及 main `de3c2d4`。范围是已存在的审计问题、失败的自动检查和重复开发资产；长期功能规划、框架大版本迁移及未经复现的问题不记为完成。本轮不部署生产代码。

## 分支与数据保护

- 远端原有 main 加 13 个功能分支；12 个功能分支的 tip 均为 main 的祖先，已核对精确远端 SHA 后原子删除，保留未合并的 PR #41 直至 CI 通过。
- 全 refs Git bundle 已创建并通过 `git bundle verify`，另存当前未提交 patch、旧工作区 patch、分支 SHA 清单和工作区清单。
- 本机备份位于 `/Users/youfeifei/Projects/xmt-maintenance-backup-20260907`，仅当前用户可访问，未上传 GitHub。
- 六个旧工作区均无未提交文件、没有检测到打开的文件，且 HEAD 已合入 main；完整移动至 `/Users/youfeifei/.Trash/xmt-merged-worktrees-20260907`，随后 prune 注册信息并删除对应已合并本地分支。现在仅保留主工作区。
- 旧工作区移动时约 16GB。随后按白名单移除其中 35 个可重建目录（node_modules、Python 虚拟环境和构建缓存），删除前占用合计 9.23GiB；源码、历史安装包与 Git bundle 继续保留，可重建依赖。没有清空整个废纸篓。主工作区业务数据库、环境变量及 Creator Agent 登录资料保持原位。
- 另清理 17 个已合入 main 的历史本地分支；5 个不属于 main 祖先的旧本地分支保留，避免把未核验历史改动丢弃或混入远端整合。

## 修复与复核

| 问题 | 当前证据与处理 |
|---|---|
| PR #41 核心安全 CI 失败 | package script 引用不存在的文件；改为真实 HTTP 契约测试文件，新增 97 个测试入口存在性检查 |
| HTTP 测试可能连接本地业务库 | 导入 app 前设置独立临时 SQLite 路径；finally 关闭服务、连接并清理临时文件 |
| 协作 Socket 测试偶发超时 | 实际回归复现 `collaboration:users` 超时；原来等待 JOIN 完成后才订阅，改成先订阅并并发等待 JOIN 和广播 |
| 开发工具依赖漏洞 | 全量 npm audit 从 24 项（含 12 high、3 critical）降至 0；定向更新兼容工具版本，未执行强制全量升级 |
| 重复动画依赖 | 四个调用文件统一到已有 motion/react；移除 framer-motion 直接依赖，其作为 motion 的内部依赖继续存在 |
| 仅供类型使用的 Vercel 构建依赖 | 转发入口改用 Node IncomingMessage/ServerResponse，移除 @vercel/node；运行处理仍直接交给 Express |
| lint 报告被生成文件污染 | 排除打包副本和 Python 虚拟环境；真实源码保持原规则，剩余 343 error / 57 warning |
| Git 忽略业务数据时误忽略源码 | 将 data/ 收窄为 /data/，src/data 不再误匹配；根数据库及 agent/data 仍被忽略 |
| 错误响应泄露、分页状态、通知偏好事务 | 已在 PR #41 实现；当前核对真实中间件、fetchData(page) 与 runInTransaction，安全及接口回归通过 |
| Creator 同名死代码、导出表格展开过大、成就 N+1 | 已在 PR #41 移除死代码、展开前限制表格范围、按指标缓存查询；当前代码复核确认 |
| 请求体限制文案 | 两个上限是不同层次：HTTP 16MB、Creator 同步包 12MB；已集中定义，未改变协议上限；不应误称二者必须同值 |
| HTTPS 要求与生产不可用 | HTTPS 说明已存在；另补充本次 Node 安装目录丢失及恢复记录，见 deploy/UBUNTU_ECS_DEPLOY.md |

## 依赖与体积

- 根依赖目录本机观测从约 471MB 降至 401MB，约减少 70MB；不同操作系统的可选依赖会使实际体积不同。
- 保持 Vite 6 主版本；更新到 6.4.3，tsx 更新到 4.23.13。修复后的锁文件固定实际依赖。
- xcode 唯一调用为 CommonJS `uuid.v4()`，单独覆盖为仍提供 CommonJS 的 uuid 11.1.1；验证实际生成 100 个唯一的 24 位项目标识。
- CI 增加全量依赖 high/critical 阻塞门禁，防止新披露高危直接进入主线。
- 生产只读体积检查：node_modules 506MB、data 7.5GB、emergency-backup 3.8GB。后两者涉及业务数据与恢复点，本轮保留；Node/npm/PM2 安装目录属于运行依赖，不能作为缓存删除。

## 验证结果

- PASS：版本一致性、97 个测试入口存在性、TypeScript 检查、生产构建、git diff --check。
- PASS：核心 CI 60 项命令；其中协作 Socket 授权首次发现竞态并在修复后单独复测通过，其余 59 项一次通过。
- PASS：全量依赖审计 0 vulnerabilities、xcode UUID CommonJS 调用。
- FAIL（现有债务）：源码 ESLint 343 error / 57 warning，以 any、未使用变量等维护问题为主；未通过关规则或全量自动改写掩盖。
- 未执行：真实业务账号的全站人工验收、生产新代码部署、Vercel 平台部署、服务器重启演练。
- 完整日志保存在本机备份目录；远端合并须以 PR #41 当前提交的 CI 全部通过为准。

## 剩余事项

1. 按模块逐步收敛源码 lint，配合真实业务场景验收；本轮结果不能证明整个项目不存在未知 bug。
2. 生产数据/备份体积治理需先制定保留周期与恢复点清单，不能直接删除 data 或 emergency-backup。
3. 生产运行目录被删除的操作来源仍未查明；当前服务恢复不等于该外部操作原因已消除。
4. 大型视觉背景 chunk 的构建体积警告仍存在，属于后续性能优化范围。
