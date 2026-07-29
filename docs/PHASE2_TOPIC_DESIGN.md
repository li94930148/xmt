# Phase 2 Topic 模块垂直切片详细设计

## 文档状态与边界

本文是 Phase 2 的设计交付，不代表模块化、Repository、Zod 或 `/api/v1` 已实现。

本轮明确不做：修改数据库、删除旧接口、大量移动目录、修改状态机、权限口径、数据范围、通知、实时事件或其他业务逻辑。

## 一、当前 Topic 模块架构

当前 Topic 是典型的“路由承载业务”的纵向链路：

```text
Topics / AddTopic / TopicDetail / Kanban
        ↓
src/api/topics.ts（fetch + Bearer token）
        ↓
/api/topics（api/app.ts 挂载）
        ↓
api/routes/topics.ts
├── authenticate / requirePermission
├── access.ts 数据范围
├── workflow.ts 状态机
├── database/utils.ts 直接 SQL
├── messageHelper.ts 通知
└── socket.ts 实时广播
        ↓
topics + history + production/shooting/publishing 等表
```

`api/routes/topics.ts` 约 349 行，同时负责输入读取、查询拼接、授权、状态校验、事务、跨表副作用、消息和 Socket 广播。当前没有 Topic Service 或 Repository。

共享层已有 `Topic`、`TopicStatus`、`CreateTopicRequest`、`AuditTopicRequest`、`UpdateTopicRequest` TypeScript 类型，但没有运行时 Schema。当前共享请求类型落后于真实 payload：创建接口还接收 `outline`、`outlineMarkdown`、`outlineJson`、`assignee_id`，更新接口也处理大纲字段。

## 二、接口清单

当前路由统一挂载于 `/api/topics`：

| 方法与路径 | 当前守卫 | 输入 | 当前主要行为 | 当前响应 |
|---|---|---|---|---|
| `GET /api/topics` | 登录 | `status? search? page=1 limit=10` | 列表、搜索、状态筛选、分页、用户名称关联 | `{ success, data, pagination }` |
| `GET /api/topics/:id` | 登录 + `canAccessTopic` | path `id` | 详情、创建人/负责人名称、历史记录 | `{ success, data: topicWithHistory }` |
| `POST /api/topics` | 登录 + `topic:create` | 标题、描述、大纲、平台、截止时间、负责人 | 创建 pending 选题、历史、活动日志、通知、广播 | `{ success, data: { topicId }, message }` |
| `PUT /api/topics/:id` | 登录 + `canEditTopic` | 部分选题字段 | 动态更新字段并广播 | `{ success, message }` |
| `DELETE /api/topics/:id` | 登录 + `topic:delete` | path `id` | 尝试清理关联记录、删除选题并广播 | `{ success, message }` |
| `POST /api/topics/:id/audit` | 登录 + `topic:audit` | `approved/rejected`、备注、负责人 | 审核、历史/日志、必要时创建 production、通知、广播 | `{ success, message }` |
| `POST /api/topics/:id/status` | 登录 + `canEditTopic` | 目标状态 | 校验状态机、历史/日志、按阶段创建 production/shooting/publishing、通知 | `{ success, message }` |

兼容事实：

1. 读取接口没有显式使用 `topic:view`。
2. 更新接口没有显式使用 `topic:update`，后端只执行 `canEditTopic`。
3. 状态接口没有使用 `topic:status`，这是现有“数据归属 + 状态机”口径。
4. 创建成功的 `topicId` 位于 `data.topicId`；`src/api/topics.ts` 的返回类型目前错误地声明为顶层 `topicId`，现有页面没有读取该值。
5. 错误响应使用 `{ success: false, error }`，前端 `getErrorMessage` 却优先读取 `message`，错误契约并不完全一致。

以上均为当前行为，本设计阶段不修正。

## 三、数据库关系

### 3.1 Topic 主表

`topics` 初始建表字段包括：`id`、`title`、`description`、`outline`、`status`、`platform`、`deadline`、`creator_id`、`assignee_id`、`created_at`、`updated_at`。

运行时兼容迁移另增加：

- `workflow_template_id`
- `submitted_at`
- `outline_json`
- `outline_markdown`

索引包括 status、creator、assignee、created_at。

### 3.2 直接关系

| 关系 | 用途 | 当前约束特征 |
|---|---|---|
| `topics.creator_id → users.id` | 创建人、访问范围、通知 | 由应用查询和约定维护 |
| `topics.assignee_id → users.id` | 负责人、访问范围、任务通知 | 由应用查询和约定维护 |
| `topic_history.topic_id → topics.id` | 创建、审核、状态变化历史 | 有索引，未在初始定义中声明外键 |
| `production.topic_id → topics.id` | 进入创作后的一对零/一主记录 | 应用层避免重复创建 |
| `shooting.topic_id → topics.id` | 进入拍摄后的主记录 | 应用层避免重复创建 |
| `publishing.topic_id → topics.id` | 进入发布后的主记录 | 应用层避免重复创建 |
| `analytics.topic_id → topics.id` | 发布后数据分析 | 通过 topic 聚合 |
| `calendar_events.topic_id → topics.id` | 选题关联排期 | 可选关联 |
| `comments(target_type='topic', target_id)` | 选题评论 | 多态关系，无直接外键 |
| `workflow_template_id → workflow_templates.id` | 自定义流程模板 | 兼容迁移字段 |

### 3.3 写入副作用

- 创建：`topics`、`topic_history`、`activity_log` 在事务内；消息与广播在提交后。
- 审核：更新 `topics`，写历史/日志，批准时按需创建 `production`；之后发送消息和广播。
- 状态流转：更新 Topic、写历史/日志，并按目标状态创建阶段记录；之后发送消息。
- 删除：当前按 comments → shooting → production_history → production → topic_history → topics 顺序执行，其中前五项错误被忽略，整个过程不在事务中；未显式清理 publishing、analytics、calendar_events 等所有可能关联。

垂直切片实施不得暗中改变这些副作用和失败语义。删除完整性应另立数据库治理任务处理。

## 四、权限模型

### 4.1 权限点

Topic 权限定义为：`topic:create`、`topic:view`、`topic:update`、`topic:delete`、`topic:audit`、`topic:status`。

当前接口实际使用情况见接口清单，并非每个权限点都直接挂载到同名操作。

### 4.2 数据范围事实

当前 `access.ts` 的真实行为：

- `canViewAllContent` 对 admin、director、editor/copywriter/post_production/camera 和 member 均返回 true。
- 因此上述角色的列表和详情当前可查看全部选题。
- `canEditAllContent` 仅包括 admin 和内容生产角色，不包括 director。
- director、member 若不是创建人、负责人或参与者，`canEditTopic` 返回 false。

这与部分既有权限文档中的“普通用户按归属查看”描述存在偏差。Phase 2 切片必须先以当前代码为兼容基准，不在结构重构中顺手纠正；权限口径调整需单独授权、测试和版本说明。

### 4.3 前端权限

- `/topics/add` 路由和提报按钮使用 `topic:create`。
- TopicDetail 审核按钮使用 `topic:audit`。
- TopicDetail 编辑入口同时检查 `topic:update`、角色及 creator/assignee。
- Topics 页批量审核、批量删除操作的呈现未见对应权限守卫，最终由后端拒绝未授权请求。
- Kanban 会直接调用状态接口，前端没有同等完整的权限策略复用。

未来 `topics.policy.ts` 应封装当前策略，但第一版必须逐项复制现有结果，不能重新解释角色。

## 五、前端调用链

### 5.1 列表页

`Topics.tsx → getTopics → GET /api/topics`。页面自己维护列表、分页、加载和筛选状态，没有使用已经存在的 `useTopics` hook；Socket `topics` 房间的 created/updated/deleted/audited 事件直接修改页面本地列表。

### 5.2 创建页

`AddTopic.tsx → createTopic → POST /api/topics`，并另外调用 users API 加载负责人。页面“提交”和“保存草稿”最终都创建 status=`pending` 的 Topic，后端没有独立草稿语义。

### 5.3 详情页

`TopicDetail.tsx → getTopic/updateTopic/auditTopic/updateTopicStatus`。详情页还包含聚合草稿、手动保存适配器、离开保护和编辑器分支逻辑；Topic 模块化不能破坏这些调用时序和 HTML 大纲字段兼容。

### 5.4 看板

`Kanban.tsx → getTopics(limit=200)/updateTopicStatus`。看板在本地复制状态机展示规则，服务端仍是合法性最终判断者。

### 5.5 状态管理现状

`useTopics.ts` 已包装部分 TanStack Query mutation，但主列表页未使用；`useTopicStore` 仍存在但本次主要页面没有以它作为事实来源。Phase 2 后端切片不同时重构前端状态层，以避免扩大范围。

## 六、未来 `modules/topics` 结构设计

第一轮只新增局部模块目录，不移动现有大目录：

```text
api/modules/topics/
├── index.ts
├── topics.routes.ts
├── topics.controller.ts
├── topics.service.ts
├── topics.repository.ts
├── topics.sqlite-repository.ts
├── topics.policy.ts
├── topics.mapper.ts
└── topics.types.ts

shared/schema/
└── topics.schema.ts
```

职责：

- `index.ts`：构造依赖并导出 legacy router 与 v1 router。
- `routes`：声明路径、认证、现有权限中间件和 Schema middleware。
- `controller`：HTTP 参数/响应适配，不写 SQL 和业务规则。
- `service`：用例、事务边界、状态机、通知和广播编排。
- `repository`：数据库无关接口。
- `sqlite-repository`：当前 SQL 的唯一新归属。
- `policy`：复制当前查看/编辑范围判断；不改权限结果。
- `mapper`：数据库 row、domain、legacy response、v1 DTO 映射。
- `shared/schema`：前后端可共享的 Zod 输入输出契约。

`api/routes/topics.ts` 首轮保留为兼容入口，最终只 re-export legacy router；在新模块完整回归前不得删除原实现。

## 七、Repository 接口设计

建议接口使用明确查询对象，不向 Service 暴露 SQL：

```ts
type TopicListFilter = {
  status?: TopicStatus;
  search?: string;
  page: number;
  limit: number;
  visibility: { mode: 'all' } | { mode: 'owner-or-assignee'; userId: number };
};

interface TopicRepository {
  list(filter: TopicListFilter): Promise<{ items: TopicRecord[]; total: number }>;
  findById(id: number): Promise<TopicRecord | null>;
  findDetailById(id: number): Promise<TopicDetailRecord | null>;
  listHistory(topicId: number): Promise<TopicHistoryRecord[]>;
  create(input: CreateTopicRecord, tx: TransactionContext): Promise<number>;
  updateFields(id: number, patch: TopicPersistencePatch, tx?: TransactionContext): Promise<void>;
  addHistory(input: AddTopicHistoryRecord, tx: TransactionContext): Promise<void>;
  productionExists(topicId: number, tx: TransactionContext): Promise<boolean>;
  createInitialProduction(input: InitialProductionRecord, tx: TransactionContext): Promise<void>;
  shootingExists(topicId: number, tx: TransactionContext): Promise<boolean>;
  createInitialShooting(input: InitialShootingRecord, tx: TransactionContext): Promise<void>;
  publishingExists(topicId: number, tx: TransactionContext): Promise<boolean>;
  createInitialPublishing(input: InitialPublishingRecord, tx: TransactionContext): Promise<void>;
  deleteLegacyRelations(topicId: number): Promise<void>;
  deleteTopic(topicId: number): Promise<void>;
}
```

边界规则：

1. Repository 不判断 Express user、不发送通知、不广播、不生成 HTTP 错误。
2. 列表查询和 count 必须共享同一过滤条件构造器，避免分页总数漂移。
3. 动态 patch 只能接受白名单字段，不能接收任意列名。
4. 第一版 SQLite Repository 复用 `database/utils.ts`，不引入 ORM、不改 Schema。
5. 活动日志、用户查询和消息可暂时通过适配接口注入；不要把所有域都塞入 TopicRepository。
6. `deleteLegacyRelations` 第一版必须保持旧清理顺序与容错行为；事务化和补齐关联删除另立任务。

## 八、Service 职责设计

`TopicService` 暴露以下用例：

```ts
interface TopicService {
  listTopics(actor: Actor, query: TopicListQuery): Promise<TopicPage>;
  getTopic(actor: Actor, id: number): Promise<TopicDetail>;
  createTopic(actor: Actor, input: CreateTopicInput): Promise<{ topicId: number }>;
  updateTopic(actor: Actor, id: number, input: UpdateTopicInput): Promise<void>;
  deleteTopic(actor: Actor, id: number): Promise<void>;
  auditTopic(actor: Actor, id: number, input: AuditTopicInput): Promise<void>;
  transitionTopic(actor: Actor, id: number, input: TransitionTopicInput): Promise<void>;
}
```

Service 应负责：

- 调用 policy 做当前数据范围判断。
- 调用现有 `workflow.ts` 校验审核和状态转换，不复制状态机。
- 定义当前事务边界和跨表创建顺序。
- 在数据库提交成功后触发消息和广播。
- 返回领域错误码，如 `TOPIC_NOT_FOUND`、`TOPIC_FORBIDDEN`、`TOPIC_INVALID_TRANSITION`。

Service 不负责：读取 `req/res`、解析 query string、拼 JSON envelope、直接调用 SQLite 或决定前端提示文字。

为保证无业务变化，实施前需建立“行为冻结表”，覆盖通知接收人、事件名/payload、初始 production 内容来源、历史 action/comment、活动日志文本和状态流转结果。

## 九、Zod Schema 设计

计划在 `shared/schema/topics.schema.ts` 定义：

```ts
const topicStatusSchema = z.enum([
  'pending', 'approved', 'rejected',
  'production', 'shooting', 'publishing', 'completed',
]);

const topicIdParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

const topicListQuerySchema = z.object({
  status: topicStatusSchema.optional(),
  search: z.string().trim().max(200).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(10),
});

const createTopicSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().optional().default(''),
  outline: z.string().nullable().optional(),
  outlineMarkdown: z.string().nullable().optional(),
  outlineJson: z.union([z.string(), z.record(z.string(), z.unknown())]).nullable().optional(),
  platform: z.string().max(100).optional().default(''),
  deadline: z.string().optional().default(''),
  assignee_id: z.coerce.number().int().positive().nullable().optional(),
});

const updateTopicSchema = createTopicSchema
  .omit({ title: true })
  .partial()
  .extend({ title: z.string().trim().min(1).max(200).optional() })
  .refine((value) => Object.keys(value).length > 0, '没有需要更新的字段');

const auditTopicSchema = z.object({
  status: z.enum(['approved', 'rejected']),
  comment: z.string().max(2000).optional().default(''),
  assignee_id: z.coerce.number().int().positive().optional(),
});

const transitionTopicSchema = z.object({ status: topicStatusSchema });
```

上述长度、空字符串、null 和 `outlineJson` 形式在实施前必须用现有数据和页面 payload 验证。Zod 不得在 legacy 路径上突然拒绝过去可接受的输入。建议：

1. v1 路径执行严格 Schema。
2. legacy 路径首轮仅做兼容解析和观测，保持当前错误状态与默认值。
3. 输出 Schema 区分 `TopicSummary`、`TopicDetail`、`TopicHistory`、分页和标准错误。
4. TypeScript DTO 由 Schema `z.infer` 生成，逐步替换重复手写类型。

## 十、API v1 兼容方案

### 10.1 并行挂载

```text
/api/topics/*      → legacy controller/response adapter
/api/v1/topics/*   → v1 controller/response adapter
                         ↓
                  同一个 TopicService
                         ↓
                  同一个 Repository
```

两个入口不得复制 Service 和 SQL。

### 10.2 v1 路径

首轮保持现有动词，降低业务迁移风险：

- `GET /api/v1/topics`
- `GET /api/v1/topics/:id`
- `POST /api/v1/topics`
- `PUT /api/v1/topics/:id`
- `DELETE /api/v1/topics/:id`
- `POST /api/v1/topics/:id/audit`
- `POST /api/v1/topics/:id/status`

后续是否将部分更新改为 PATCH，需作为新版本契约单独讨论。

### 10.3 响应兼容

- legacy adapter 精确保持当前 `{ success, data?, message?, error?, pagination? }`。
- v1 使用 `{ success: true, data, meta? }` 和 `{ success: false, error: { code, message, requestId, details? } }`。
- v1 创建返回 `data.topicId`，与当前真实后端位置一致。
- Socket 房间名 `topics`、事件名和 payload 在本切片中不改。

### 10.4 客户端切换

1. 先上线 v1 与集成测试，Web 继续使用 legacy。
2. 在 `src/api/topics.ts` 内通过单一配置切换 base path，不改页面。
3. 按列表 → 详情 → 创建/更新 → 审核/状态 → 删除顺序切换。
4. 观察错误率、403、分页、消息和 Socket 一致性。
5. 完成观察窗口后才讨论 legacy 退役；本阶段禁止删除。

## 十一、测试方案

### 11.1 行为冻结测试

- 七个旧接口的状态码和 JSON 快照。
- 列表分页、搜索、状态筛选、排序和 count 一致。
- 角色/归属组合的查看、编辑、删除、审核和状态权限。
- 当前特殊行为：member/内容角色查看范围、director 编辑范围。
- 创建/审核/状态变化产生的历史、活动日志、阶段记录、通知和 Socket 事件。
- 创建响应 `data.topicId` 和 legacy 错误 envelope。

### 11.2 Repository 契约测试

使用临时 SQLite：列表过滤、详情 join、历史排序、字段白名单更新、阶段记录幂等查询和事务回滚。测试不得连接开发或生产数据库。

### 11.3 Service 单元测试

注入 fake repositories/notifier/broadcaster，覆盖 not found、forbidden、非法状态转换、审核批准、拒绝、各阶段进入和副作用提交后执行。

### 11.4 API 集成测试

使用 Supertest 同时调用 legacy 与 v1，对同一场景比较领域结果；允许 envelope 不同，但数据库副作用必须一致。覆盖非法 id、无 token、禁用用户、错误 payload 和分页边界。

### 11.5 前端与 E2E

- `src/api/topics.ts` 的 legacy/v1 响应解析。
- Topics 列表与实时事件合并。
- AddTopic 提交。
- TopicDetail 加载、保存、审核、状态变化和离开保护回归。
- Kanban 状态切换。
- 完整链路：登录 → 创建 → 审核 → 进入创作，并确认 history/production。

### 11.6 必须执行的校验

实施阶段至少执行：Topic 专项测试、`npm run check`、`npm run lint`、`npm run build`。新增测试框架前先确认依赖范围和版本升级级别。

## 十二、迁移风险

| 风险 | 影响 | 控制措施 |
|---|---|---|
| 重构时“顺手修复”权限偏差 | 用户可见范围或编辑能力变化 | 冻结当前角色/归属矩阵，权限治理另立任务 |
| legacy/v1 响应混用 | 页面读取失败 | 两个 response adapter，客户端契约测试 |
| Zod 收紧旧输入 | 历史页面请求被拒绝 | legacy 宽松兼容，v1 严格；先观测 payload |
| SQL 移入 Repository 后 count 条件漂移 | 分页总数错误 | 共享 filter builder + 契约测试 |
| 事务或副作用顺序变化 | 通知、历史或阶段记录不一致 | 行为冻结测试，首轮保持现有边界 |
| 删除逻辑被“完善” | 产生不可预期级联删除 | 首轮复刻旧行为，完整性治理单独审批 |
| TopicDetail 大纲字段映射变化 | 编辑内容丢失 | 冻结 HTML/Markdown/JSON fallback 顺序 |
| Socket payload 变化 | 列表实时更新失效 | 事件协议本切片不改，并加入事件测试 |
| 前端同时改 Query/Zustand | 难以定位回归 | Phase 2 只切后端契约，状态治理后置 |
| `app.ts` 双挂载次序错误 | v1 404 或被 legacy 捕获 | 显式注册 `/api/v1/topics`，增加路由探测测试 |

## 十三、回滚方案

1. 保留 `api/routes/topics.ts` 原实现，直到新模块完成行为对比和观察窗口。
2. 新 v1 路由通过独立注册开关启用；出现异常时关闭 v1 挂载，legacy 不受影响。
3. Web 默认继续调用 `/api/topics`；切换 v1 后可通过单点配置恢复 legacy。
4. Repository 切换按用例分批，不进行全文件一次性替换；每个提交可独立回退。
5. 本切片无数据库迁移，因此回滚不涉及数据恢复或 Schema 回退。
6. 不删除旧类型、路由、事件或 SQL，回滚时不需要恢复被删除文件。
7. 若新 Service 已产生数据，因其必须保持旧业务语义，回滚后 legacy 应可继续读取；若出现副作用差异，立即停止 v1 写流量并按审计日志人工核验。

## 实施前门禁

进入编码前必须再次确认：

1. 第一批实施范围是只读接口，还是完整七接口切片。
2. Zod/OpenAPI 所需依赖及版本升级级别。
3. v1 是否默认关闭，以及切换方式。
4. 行为冻结测试的临时数据库方案。
5. 当前权限偏差明确“保持兼容”，不在同批修复。
6. 当前版本 `2.10.2-storage` 如何统一为纯 `X.Y.Z` 基线。

完成上述确认后才能实施；本文交付后等待下一步指令。
