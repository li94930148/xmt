# P2-8：Yjs 运行态持久化

## 目标与边界

当前服务端把 Yjs `Y.Doc`、快照和更新日志保存在 Node 进程内存。服务重启或房间空闲清理后，尚未进入正式正文自动保存的协作中间态无法从协作运行态恢复。本阶段持久化服务端已接受的 Yjs 更新，并要求客户端收到持久化确认后才清除对应待发送批次，降低进程退出或短暂故障造成的中间态丢失风险。

- 正式稿件正文仍以 Production/Shooting 既有数据库自动保存为业务真源；Yjs 持久副本不替代正文保存、版本、审核或时间轴。
- 只在当前授权 room 的 server update handler 通过鉴权、加入房间、可编辑和文档锁检查之后读写持久层。
- Yjs 更新先写入数据库，成功后才更新内存状态并广播给其他协作者。数据库写入失败时不应用、不广播，并向发起端发送明确冲突事件。
- 浏览器 Provider 的 50ms 本地批量窗口和网络尚未送达服务端的更新不属于服务端持久化；每条本机增量会先暂存于账号/房间隔离的 IndexedDB，再进入现有 ACK 队列。页面重开时先同步服务端状态，再恢复、重发本机未确认增量；只有收到服务端成功 ACK 后才清理本机副本。
- ACK 使用现有 `collaboration:update` Socket.IO 事件的可选回调，不改变事件名称或更新负载；没有发送 ACK 回调的旧客户端继续使用既有冲突事件行为。

## 存储模型

迁移 `020_collaboration_runtime_persistence` 新增两张独立表：

- `collaboration_document_updates`：按 `doc_id + version` 保存已接受的 Yjs update、操作者 ID 和时间；每个更新在服务端接受前原子写入。
- `collaboration_document_snapshots`：每 100 个已接受更新生成当前 CRDT checkpoint，并在同一数据库事务中删除被 checkpoint 覆盖的 update 行。

更新和快照用 Base64 保存二进制 Yjs 编码。房间身份原样复用现有 `production:{id}@{version}`、兼容的 `production:{id}` 与 `shooting:{id}`，不从正文、选题或标题推导身份。production 或 shooting 被删除时，数据库触发器一并删除所属运行态副本；不回填迁移前内存状态，也不修改正式正文或历史。

客户端待确认队列只保存尚未获得成功 ACK 的 Yjs 增量，不保存完整文档；记录按用户 ID 与精确 `roomId` 分区。单账号/房间最多保留 5000 条或 32 MiB，服务端确认后删除对应本机记录。浏览器 IndexedDB 是本机明文站点存储，不是正式稿件真源；用户清理站点数据、浏览器禁用存储、空间不足或本机暂存写入失败时不保证跨页面恢复。恢复读取失败时前端锁定正式稿件编辑并显示恢复提示；暂存写入失败仍尝试服务端 ACK 流程，同时提醒用户保存正文。

## 恢复与失败

首次授权加入 room 时，服务端单飞加载最新 checkpoint，再按版本顺序应用其后的更新日志；若 Base64、Yjs 数据或版本序列损坏，恢复失败即拒绝加入，不发送空文档覆盖现有运行态。多实例下新连接还会在授权完成后重读共享持久状态。房间空闲清理仍只释放当前进程内存，持久数据留待下次授权进入时恢复。

每次更新在房间级串行队列中执行：复制当前 Y.Doc、尝试应用更新并校验完整状态不超过 16 MiB；提交 append-only update 后才替换内存文档并广播，再通过 ACK 返回持久化版本。客户端仅在收到成功 ACK 后清除当前批次；`PERSISTENCE_FAILED`、`UPDATE_FAILED` 或 ACK 超时保留批次并退避重试。锁定拒绝的更新会等收到对应文档解锁事件后重试。容量超限反馈 `DOCUMENT_TOO_LARGE`；载入失败反馈 `RECOVERY_FAILED`。检查点失败不会回滚已落库更新，日志仍可恢复，后续更新会再次尝试 checkpoint。

单条传入 update 仍受既有 500 KiB 限制；ACK 丢失后重试可能将同一 CRDT 更新重复追加一次，但 Yjs 更新应用具幂等性，重复行由后续 checkpoint 压缩。

## 跨实例协调与 Redis 联调（v5.0.0–v5.0.1，本地阶段）

服务端增加可选 Redis Streams Socket.IO adapter。默认 `XMT_SOCKET_ADAPTER=single`、`XMT_WEB_INSTANCE_COUNT=1`，现有单实例行为不要求 Redis。显式配置多实例时必须同时设置：

- `XMT_WEB_INSTANCE_COUNT`：1–64 的实例数；大于 1 时未使用 Redis Streams 会拒绝配置。
- `XMT_SOCKET_ADAPTER=redis-streams`：启用跨实例房间广播与远程 socket 查询。
- `XMT_REDIS_URL`：Redis 连接地址；推荐私网 TLS/ACL 凭据并限制网络访问。连接地址不会写入启动日志。
- 可选 `XMT_SOCKET_ADAPTER_CHANNEL_PREFIX`：同环境共享、不同环境隔离的 Redis key/channel 前缀。

初次 Redis 连接最多进行有限重试，仍不可达则启动失败，不静默切回本地 adapter；已连通后的暂时中断继续重连，协作写入会暂停并等待可用。持久 Yjs 更新使用共享数据库中的版本号作为并发序列：每次事务复查锁和数据库最新版本，冲突后重载 checkpoint 与追加日志并有界重试；新 socket 加入前刷新本地 Y.Doc。presence 列表通过 adapter 查询房间内所有 socket。多实例不发布各进程私有的内存快照，只保留数据库 checkpoint。

`npm run test:collaboration-redis-integration` 使用两个完整 API 子进程、共享隔离 SQLite 和本机临时 Redis 实测 Redis Streams：真实 token 用户经生产 JOIN handler 授权入房；生产 `broadcastUserList()` 经 adapter 的 `fetchSockets()` 返回两侧成员；跨进程文档锁拒绝另一实例 Yjs 写入；两端并发更新形成连续持久版本且彼此收到广播。Redis 停止期间协作更新返回 `COORDINATION_UNAVAILABLE`，不写数据库；服务恢复后两个 API 实例重新 ready，后续 Yjs 更新保存到版本 3 并广播。测试 Redis 仅监听 `127.0.0.1`，关闭 RDB/AOF，临时数据随测试清理，因此不验证 Redis 服务进程重启后的 stream 数据保留、HA 或生产等价持久性。Homebrew Redis 8.10.2 仅安装在开发机供该测试使用，不会随项目启动，也未配置开机服务。

客户端仍启用 polling → websocket upgrade，任何启用多实例的负载均衡必须提供 sticky session；Socket.IO 官方 Redis Streams adapter 文档也明确指出仍需 sticky sessions。集成测试用隔离代理验证了两种情况：round-robin 且无 affinity 时 polling handshake 后续请求失败；cookie 固定实例时两个真实 API 客户端各自完成 polling→websocket upgrade，并可跨节点广播。该代理仅验证 Socket.IO 所需行为，不代表生产 Caddy 已配置或通过浏览器实际验收。生产 Redis ACL/TLS/持久性、Caddy/负载均衡和压力验收仍未完成。Caddy、systemd 与生产环境变量均未修改；完成上述项之前不得启用生产多实例。

本实现仅覆盖 Socket/Yjs 房间协调，不意味着进程内分析事件流、其他模块缓存或后台任务已经适合多实例；这些路径需单独审计重复执行与共享状态语义。本轮未读取生产运行实例数，也未修改生产设置；默认代码配置仍为单实例，线上配置需另行只读核验。

## 首次上线注意

迁移前正在运行的进程内 Yjs 文档不能由新迁移回填。未来首次部署该版本前，应先让正在编辑的正式正文完成自动保存，并避免在服务重启窗口持续输入；迁移就绪检查、备份和受控发布依旧按安全发布流程执行。此阶段尚未部署或运行任何生产迁移。

## 本地验收

`npm run test:yjs-runtime-persistence` 使用隔离 SQLite 验证未 checkpoint 更新重启恢复、100 条更新 checkpoint/日志清理、数据库写失败不改变运行态或恢复结果，以及删除业务稿件后的协作副本清理；另由两个独立 Node 子进程并发写同一隔离数据库，检查版本序列和最终恢复内容。`npm run test:collaboration-coordination` 验证配置门禁及 Redis 不可达时启动拒绝。`npm run test:collaboration-redis-integration` 是显式依赖本机 `redis-server` 的完整 API 双进程联调：隔离 SQLite、真实鉴权、生产 presence、跨进程锁拒写、并发 Yjs 连续持久版本，Redis 中断期间拒绝协作更新与恢复后持久化/广播；另在隔离代理上验证无 sticky session 的 polling 失败及 cookie affinity 下 polling→websocket upgrade 成功。临时 Redis 不持久化，该代理不替代真实 Caddy/生产代理验收。`npm run test:yjs-provider-ack` 验证客户端暂存/ACK 清理、provider 重建恢复和存储失败反馈；`npm run test:production-review-browser` 验证桌面/移动 ACK 重试、本机恢复失败时编辑器只读。Playwright MCP 与 Chrome DevTools MCP 另在隔离本地浏览器测试真实 IndexedDB 整页重载恢复。生产 Redis 持久性、真实负载均衡与重复任务语义仍未执行；其他结果及尚未覆盖项记录在 `UPGRADE_PROGRESS.md`。
