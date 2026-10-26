# XMT v2.10.0 Creator Data Center

## 定位

Creator Data Center 是独立的新媒体账号数据分析中心，只承担平台数据采集、存储、分析、作品复盘和运营洞察。它不引用选题、创作、成片、发布或员工日报数据。

## 保持不变的链路

- Creator Agent 真实 Chrome CDP 连接与登录流程
- Network Collector 与 Page Explorer
- AES-256-GCM 加密、HMAC-SHA256 签名
- `POST /api/creator-agent/data-sync` 请求体和响应兼容关系

## 分析规则

作品评分总分 100：播放表现 35、互动表现 30、完播表现 20、涨粉转化 15。播放以账号作品中位数为基准；互动率满分线为 12%；完播率满分线为 100%；涨粉转化满分线为 2%。

等级：爆款 85–100，优秀 70–84.9，普通 45–69.9，低效 0–44.9。

账号健康度由内容活跃度、粉丝增长率、互动率、内容稳定性四项等权计算。所有报告和分析只使用 Creator Data Center 已入仓数据，不调用外部 AI。

## 页面

- `/analytics/creator-center` 数据驾驶舱
- `/analytics/creator-center/works` 作品库
- `/analytics/creator-center/reviews` 作品复盘
- `/analytics/creator-center/work/:id` 作品详情分析
- `/analytics/creator-center/trends` 趋势分析
- `/analytics/creator-center/fans` 粉丝分析
- `/analytics/creator-center/reports` 运营报告

## 权限

- `creator:data:view`：查看授权账号数据和分析结果
- `creator:data:manage`：管理账号范围
- `creator:report:view`：查看数据分析报告
- `creator:report:manage`：生成日报、周报和月报

## Creator Agent 绑定码恢复

- `POST /api/creator-agent/binding-codes` 可接收 UUID `request_id`；相同操作者、可管理账号、有效期和请求编号重放时返回同一个未过期绑定码。显式提供的空值或非法请求编号会被拒绝；未提供字段的旧客户端继续使用兼容路径。
- `GET /api/creator-agent/binding-codes/requests/:requestId?account_id=...` 是 `no-store` 只读核实入口，结果限定到当前操作者与账号。绑定码只在有效期内、尚未使用时可恢复；新码会使同账号的旧码终止。
- 恢复密文使用独立 AES-256-GCM 密钥 `XMT_CREATOR_AGENT_BINDING_KEY_V1`；值必须是规范 Base64 编码的 32 字节密钥。密钥缺失、格式错误或与创建时不一致时服务 fail closed，不回退到 JWT 或其他应用密钥。生产启用前需在受控运行时配置该密钥，并确保所有 API 实例使用同一稳定值；当前尚未部署。v1 密钥的轮换/多版本解密尚未实现，不应在仍有有效恢复码时直接替换密钥。
- 数据库只保留绑定码哈希及加密短期回执；绑定完成、过期或确认消费后清除恢复密文，并保留请求摘要终态，防止旧请求键重新签发。SAFE_EXPAND 迁移 052 尚未在真实数据库执行。

## Creator Agent 绑定凭据结果恢复

- 新 Agent 在 `POST /api/creator-agent/bind` 提交 UUID `request_id` 和独立的 32 字节 `recovery_secret`。服务端成功提交但 HTTP 响应丢失后，客户端以同一绑定码、设备载荷与恢复能力重试，可在 24 小时内取回完全相同的 token；仅请求编号不足以恢复。旧客户端不传恢复字段时保持原有一次性响应合同。
- 重绑已有设备时，新 token 先加密暂存，原 token 保持有效；Electron 客户端使用 safeStorage 保存 token 和配置后调用 `POST /api/creator-agent/bind/ack`。确认后服务端激活新 token 并清除回执密文；确认接口可幂等重试。
- 桌面端请求前将绑定码、设备载荷和恢复能力以 Electron `safeStorage` 加密写入 owner-only 本地文件；凭据保存后将记录收敛为只含确认所需材料的状态。新服务端使用同一专用密钥 `XMT_CREATOR_AGENT_BINDING_KEY_V1`。SAFE_EXPAND 迁移 053 尚未执行真实数据库迁移，Agent v2.14.7-agent 与服务端均仅本地验证，未发布。
