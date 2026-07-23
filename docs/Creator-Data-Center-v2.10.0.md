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
