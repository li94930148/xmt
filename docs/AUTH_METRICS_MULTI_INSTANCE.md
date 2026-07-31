# XMT Auth 多实例指标治理

## 目标

Auth 指标通过统一 Event 事实分别由各 XMT 实例输出，Prometheus 或 OpenTelemetry Collector 负责跨实例采集。每个指标都带稳定、非敏感、低基数的 `instance` 标签；部署必须为每个进程配置唯一 `XMT_INSTANCE_ID`。

## 聚合规则

| 指标类型 | 跨实例规则 |
| --- | --- |
| 登录、Refresh、失败、Logout、安全事件 Counter | 按环境求和；排障时保留 instance 分组 |
| Refresh 耗时 Histogram | 使用后端的 histogram 聚合与分位数函数，不平均各实例分位数 |
| `xmt_auth_active_sessions` Gauge | 不得简单求和作为全局唯一 Session 数 |

`active_sessions` 是每个进程从自身运行期事件观测到的集合，进程重启会重新建立观察范围；同一 Session 在负载均衡、多次连接或故障转移下可能被不同实例观察。因此它用于实例异常、趋势和容量信号，不是数据库会话事实。全局唯一活跃 Session 应由只读数据库查询或专门聚合任务计算，但本阶段禁止增加数据库结构或把该查询接入认证路径。

## 实例身份

- Kubernetes：使用 Pod UID/名称，但应控制 Pod 生命周期导致的时序数量。
- systemd/虚拟机：使用稳定的主机与进程槽位，如 `xmt-prod-a-1`。
- PM2 cluster：使用主机名加实例序号。
- 禁止将用户 ID、Session ID、IP、Token、Cookie 或 requestId 作为 metric label。

## 抓取与故障策略

1. `/internal/metrics/auth` 默认关闭，只允许经复核的监控网段 CIDR。
2. Caddy、防火墙或安全组必须阻止公网访问；Node 内网校验是第二道防线。
3. 每个实例独立抓取，外部后端负责持久化；单个实例不可达应触发 scrape/target 告警。
4. Exporter 或 Collector 故障不得改变 Login、Refresh、Logout 的业务结果。
5. 扩缩容、重启和回滚期间，Counter 使用 `rate/increase` 处理重置，不以绝对累计值判断事故。
