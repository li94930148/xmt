# UI设计规范

## 文档说明

本规范基于当前项目已经落地的页面结构和组件能力整理，目标是统一后台页面的基础骨架、常见状态和弹窗边界，降低重复实现成本。

当前阶段遵循两条原则：

1. 页面外层统一优先
2. 业务内核保守处理

P1-001 页面基础框架统一阶段已正式结束。本阶段已经完成 `Messages`、`Users`、`Resources`、`Shooting`、`Publishing`、`Topics`、`Calendar`、`Analytics` 页面外层骨架统一验证，后续不再为了“统一结构”继续强推复杂业务模块改造。

## 1. 列表页标准骨架

推荐结构：

1. `PageHeader`
2. `PageToolbar`
3. `Table / List`
4. `Pagination`
5. `EmptyState / LoadingState / ErrorState`

适用范围：

1. 标准管理列表页
2. 带搜索、筛选、操作按钮的页面
3. 表格页、卡片页、混合列表页

说明：

1. `PageHeader` 负责页面标题、说明、返回和右侧操作
2. `PageToolbar` 负责搜索、筛选、轻量操作和特殊插槽
3. 列表主体继续按业务页面选择表格、卡片或混合布局
4. 分页、批量操作和表格列定义保留业务语义，不强行收成一个超级列表组件

## 2. 详情页标准骨架

推荐结构：

1. `PageHeader`
2. 主内容区
3. 侧边辅助区
4. 局部 `EmptyState / LoadingState`

说明：

1. 详情页优先统一头部，不强行统一业务内容区
2. 主内容区、侧边区、Tab 区域保留模块自身表达
3. 评论区、流程区、版本区、统计卡片等业务块不因“统一”而削弱语义

## 3. 弹窗规范

### BaseModal

用于统一弹窗基础壳，负责：

1. 遮罩层
2. 居中容器
3. 标题区
4. 内容区
5. 底部操作区

不负责：

1. 表单字段定义
2. 业务提交逻辑
3. 复杂焦点管理系统

### FormModal

用于新增、编辑、设置类弹窗。

职责边界：

1. 统一弹窗壳和默认按钮区
2. 不统一表单字段结构
3. 不接管表单校验
4. 不绑定业务提交流程

### ConfirmModal

用于删除、清空、禁用、重置等危险确认。

职责边界：

1. 统一确认交互
2. 适合单步确认
3. 不替代复杂二次流程
4. 不承载多步骤业务状态机

## 4. 状态展示规范

### StatusBadge

适合：

1. 通用状态展示
2. 常量可映射的状态
3. 轻量结果标识

不适合：

1. 流程进度条
2. 平台专用色语义
3. 强业务专用状态块
4. 带明显交互语义的控件

### EmptyState

适合：

1. 页面级空状态
2. 局部列表空状态
3. 搜索无结果

建议包含：

1. 简洁标题
2. 说明文本
3. 可选动作按钮

### LoadingState

适合：

1. 页面级加载
2. 区块级加载
3. 行内加载提示

说明：

1. `page / section / inline` 场景优先使用 `LoadingState`
2. 复杂表格优先保留 `SkeletonTable`
3. 不要求所有表格强制替换成 `LoadingState`

### SkeletonTable

适合：

1. 标准表格页
2. 列结构较复杂的列表页
3. 需要稳定占位和列宽预期的场景

### ErrorState

适合：

1. 页面级加载失败
2. 无权限页面
3. 未找到页面

说明：

1. 普通保存失败、按钮点击失败等场景仍可继续使用 toast
2. `ErrorState` 不替代 `ErrorBoundary`

## 5. 不应过度抽象的内容

当前阶段明确不建议继续抽象：

1. 流程进度条
2. 批量操作内部逻辑
3. 实时同步高亮
4. 详情页业务区块
5. 表格列定义
6. 状态颜色专用映射
7. 排序逻辑
8. 时间快捷填充逻辑
9. 图表和统计计算逻辑
10. 节点编辑器
11. 编辑器相关区域

原因：

1. 这些结构不只是视觉重复
2. 它们通常深度绑定业务语义、权限、刷新链路或交互规则
3. 过度抽象会让后续维护成本反而上升

## 6. 高风险模块说明

以下模块不再纳入 P1-001 常规页面骨架统一：

1. `WorkflowDesigner`
2. 编辑器相关区域

说明：

1. `WorkflowDesigner` 不是普通列表页，包含模板列表、节点编辑器、流程配置、审批条件和模板保存逻辑，后续归入 `P1-003：WorkflowDesigner 流程设计器专项治理`
2. 编辑器相关区域涉及 `RichTextEditor` 与 `components/editor/Editor` 并存问题，后续归入 `P1-002：编辑器路线治理`

## Workflow Engine UI 状态规范

当前 WorkflowDesigner 已接入 Workflow Engine v2 strict，UI 不再只是普通模板表单，而是承载规则提示、风险提示和修复建议。

### 节点提示层级

1. `low`：绿色或弱提示，表示当前 shadow / decision 未发现明显风险。
2. `medium`：黄色提示，表示存在 warning 或中等置信度风险，需要人工复核。
3. `high`：红色提示，表示 strict policy 或 decision 认为节点配置不可接受。

### UI 行为

1. warning 可提示，但不自动修改节点。
2. suggested transition 可以作为按钮展示，点击后仅更新当前表单字段。
3. strict invalid node 必须在保存前阻断，并显示明确原因。
4. hover tooltip 可以展示 shadow log count、latest reason、heatmap、risk score 和 decision reason。

### 禁止

1. 不把 workflow risk badge 作为通用状态标签抽象。
2. 不让提示组件改变审批接口逻辑。
3. 不在 UI 中隐藏 strict 阻断原因。
4. 不把 decision suggestion 自动保存为模板。

## 7. 当前阶段结论

P1-001 已验证以下能力可以稳定推广：

1. `PageHeader`
2. `PageToolbar`
3. `BaseModal`
4. `FormModal`
5. `ConfirmModal`
6. `LoadingState`
7. `ErrorState`
8. `EmptyState`
9. `SkeletonTable`
10. `Pagination`
11. `BatchActions`

后续页面治理应继续遵循：

1. 页面外层统一优先
2. 业务内核保守处理
3. 先治理高频重复结构，再评估是否继续推广
