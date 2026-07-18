# Graceful Dispose Page Integration

## 1 当前页面生命周期

### ProductionDetail

当前可离开编辑页的显式路径包括：

| 路径 | 当前行为 | 编辑器结果 |
| --- | --- | --- |
| 返回创作管理 | `navigate('/production')` | 立即路由切换，ContentEditor unmount 后 Runtime `destroy()` |
| 关联选题（顶部/侧栏） | `navigate('/topics/:topicId')` | 同上 |
| 进入成片制作 | `navigate('/shooting')` | 同上 |
| 删除成功后返回列表 | `deleteProduction()` 后 `navigate('/production')` | 删除属于独立业务动作，不能当作普通保存离开 |
| 全局 Layout 链接、浏览器后退/前进 | 当前未由页面处理 | 同样触发 component unmount |

Production 的状态更新、版本预览切换和编辑模式切换并不离开当前路由；D6 不应在这些动作中调用 gracefulDispose。版本、`version_action` 和审批行为保持原样。

### ShootingDetail

当前显式离开路径包括：

| 路径 | 当前行为 | 编辑器结果 |
| --- | --- | --- |
| 返回成片列表 | `navigate('/shooting')` | 立即路由切换，Runtime 在 unmount 时立即 destroy |
| 查看关联创作版本 | `navigate('/production/:id')` | 同上 |
| 全局 Layout 链接、浏览器后退/前进 | 当前未由页面处理 | 同样触发 component unmount |

Shooting 的 workflow 状态按钮只更新当前记录，并不需要 gracefulDispose。D6 不改变 workflow、Publishing 或 `script_content` 的业务保存 payload。

### 现有 Runtime 接口位置

`ContentEditorRuntime` 已经创建 `ContentEditorRuntimeHandle`，但该 handle 目前只保存在 `ContentEditor` 内部的 ref；ProductionDetail 与 ShootingDetail 无法在导航前调用它。当前 Runtime effect cleanup 会调用立即释放的 `destroy()`，不会等待网络。

因此，**不能把 gracefulDispose 放进 unmount cleanup**：那时路由已经开始切换，无法可靠延迟卸载，也无法显示 retry/放弃选择。

## 2 导航场景分类

| 场景 | 是否可等待异步 dispose | 设计动作 |
| --- | --- | --- |
| 页面内显式按钮导航 | 是 | 先 `gracefulDispose`，根据聚合结果决定是否 `navigate` |
| 受控 document switch | 是 | 同上，但 reason 使用 `document_switch` |
| Layout 全局链接、浏览器后退/前进 | 取决于 Router blocker 能力 | 后续接入统一 navigation blocker；当前不得假设已拦截 |
| 刷新、关闭标签页、地址栏跳转 | 否 | 不等待 gracefulDispose；可用 `beforeunload` 给浏览器原生离开提示 |
| unmount cleanup | 否 | 保持 Runtime `destroy()` 的立即释放语义 |
| 已确认删除的业务记录 | 不属于普通离开 | 维持删除业务流程；另开删除与未保存写入竞态评审 |

当前应用使用 declarative `<BrowserRouter>` 与 `<Routes>`。在没有验证其 blocker API 可用性的情况下，不能直接引入某个 Router hook 并声称可拦截全局导航。D6 的首个实现应先覆盖页面上明确的 `navigate()` 路径；全局导航拦截需要单独验证 React Router v7 的可用方案，且不应为此重写路由架构。

## 3 接入方案

### 3.1 Runtime handle 上送

未来应在 `ContentEditor` 增加一个可选、向后兼容的 handle bridge，例如：

```ts
onRuntimeHandleChange?(handle: ContentEditorRuntimeHandle | null): void
```

ContentEditor 在 Runtime ready 时上送 handle，在卸载/文档变更时上送 `null`。Production/Shooting 页面把它写入本地 ref。该 bridge 只暴露通用 Runtime contract，不泄漏 Tiptap、Yjs、Socket 或 Adapter 细节。

不建议让页面 import Runtime、Provider 或 AutosaveCoordinator；也不建议通过 DOM event、全局单例或 `window` 查找 editor instance。

### 3.2 共用 `useEditorLeaveGuard`

建议新增一个页面层 hook（后续实现，D6 不创建）：

```ts
const { requestLeave, leaveState, retry, discardAndLeave } = useEditorLeaveGuard({
  runtimeHandleRef,
  timeoutMs: 1500,
});
```

`requestLeave` 接收导航 continuation 和 reason：

```ts
requestLeave({
  reason: 'route_transition',
  proceed: () => navigate('/production'),
});
```

内部规则：

1. 若不存在 Runtime handle、页面只读或没有 editor，直接执行 `proceed()`。
2. 调用 `handle.gracefulDispose({ reason, timeoutMs, participants })`。
3. 当前 D3 collaboration barrier 尚未实现前，传入空 participant 列表；不能伪造协作 participant。
4. 仅当 aggregate `outcome === 'durable'` 时执行 `proceed()`。
5. `durable + degraded` 仍执行 `proceed()`，但记录/展示非阻塞提示。
6. `not_durable` 或 `interrupted` 保持当前页面和 Runtime，不执行 `proceed()`，转入明确的用户决定流程。
7. guard 自身需防止双击/重复导航：同一 leave request 复用 in-flight 结果；在 continuation 执行后拒绝第二次调用。

`timeoutMs` 是受控导航的 UX 预算，建议先采用 1500ms 并通过验收测试验证；它不是浏览器关闭时的可靠网络承诺。

### 3.3 gracefulDispose 与 destroy 的调用时机

| 时机 | 调用 |
| --- | --- |
| 页面按钮导致的普通导航 | `gracefulDispose()`，成功后才 `navigate()` |
| 同一编辑器切换到另一 document | `gracefulDispose({ reason: 'document_switch' })`，成功后更新路由/document id |
| Autosave 失败/超时后用户选择 retry | 再次 `gracefulDispose()`；D2/D5 允许 retry |
| 用户在失败提示中明确选择放弃离开 | `destroy()` 后执行 `navigate()` |
| gracefulDispose 成功后路由卸载 | 不额外手动 destroy；ContentEditorRuntime cleanup 的既有 `destroy()` 幂等执行 |
| 浏览器刷新/关闭/unmount | 不调用异步 gracefulDispose；保留立即 `destroy()` |

删除 Production 是例外：删除确认后的记录不应再由普通 autosave 继续写入。此处必须先单独评审“删除请求与 in-flight autosave”的竞态；D6 不把删除按钮接到 leave guard，也不改变现有删除逻辑。

## 4 用户交互

页面层只使用 D5 聚合结果，不显示 Yjs、Socket、ack 或 participant 内部术语。

| Aggregate result | 页面行为 | 用户文案建议 |
| --- | --- | --- |
| `durable`, `degraded: false` | 立即继续导航 | 不必弹窗；可维持现有保存状态 |
| `durable`, `degraded: true` | 继续导航，显示非阻塞 toast | “内容已保存；协作交接未确认。” |
| `not_durable` | 阻止导航，打开确认 modal | “最后修改尚未保存。请重试或留在当前页面。” |
| `interrupted` | 阻止导航，打开确认 modal | “保存过程已中断，无法确认最后修改。” |

`not_durable` modal 应提供：

- **重试保存并离开**：重新调用同一个 leave request；
- **留在页面**：关闭 modal，不销毁 Runtime；
- **仍然离开**：需二次确认，调用 `destroy()` 后执行保存的 navigation continuation。

`interrupted` 默认提供“留在页面”和“仍然离开”。只有 handle 仍然有效且 Autosave 生命周期为 `active` 时，才显示 retry；已 destroyed 时不得提供无法执行的 retry。

### 刷新和关闭页面

未来可在编辑中且 Runtime status 为 `saving`/`conflicted` 时注册 `beforeunload`，触发浏览器原生确认提示。它不能等待 Promise、不能提供自定义文案、不能保证 Autosave 或协作发送完成，也不能替代受控路由 leave guard。

## 5 Production 方案

ProductionDetail 通过 `ContentEditor` 的新 handle bridge 持有通用 Runtime ref。以下显式 `navigate()` 在后续实现中统一替换为 `requestLeave`：

- 返回 `/production`；
- 打开 `/topics/:topicId`（顶部与侧栏）；
- 已审核状态下进入 `/shooting`。

Production guard 只处理编辑器生命周期，不触碰：

- `updateProduction` 的 `version_action: 'none'` autosave 语义；
- major/minor 版本与 `production_history`；
- 审批/状态按钮；
- `canEditProduction`、资源归属和权限判断。

若当前展示的是历史只读版本，或用户没有编辑权限而未挂载 ContentEditor，guard 将没有 handle，直接导航即可。

## 6 Shooting 方案

ShootingDetail 采用同一个 `useEditorLeaveGuard` 和 ContentEditor handle bridge，替换：

- 返回 `/shooting`；
- 进入 `/production/:id`。

它仍只通过 Shooting Adapter 的既有 `updateShooting(id, { script_content })` 实现 durability；guard 不读取或写入 Production，不创建版本，不触发 workflow 或 Publishing。Shooting 尚未存在自己的 version/approval dispose participant，D6 不引入它们。

## 7 风险

| 风险 | 影响 | 缓解措施 |
| --- | --- | --- |
| Runtime handle 未及时上送或已被置空 | guard 无法执行保存 | handle bridge 明确 ready/null 生命周期；无 handle 时只在只读/未挂载场景直通 |
| 双击多个导航按钮 | 重复 dispose 或多次 navigate | guard 复用 in-flight，并锁定 navigation continuation |
| 全局 Layout 导航未被覆盖 | 用户可绕过页面按钮 | 后续单独验证 Router blocker；首期清单明确覆盖范围 |
| browser close 不能 await | 仍可能丢失最后输入 | `beforeunload` 仅提示；依赖 Autosave/Yjs 重连恢复，不承诺 durability |
| degraded 被误解为保存失败 | 用户不必要地被阻塞 | 明确以 Autosave durability 决定是否离开；协作仅显示交接提示 |
| 删除与 autosave 竞态 | 删除后旧请求可能写回 | 保持删除路径 out of scope，单独评审 |

## 8 实施计划

后续必须另开实现任务，按以下最小步骤执行：

1. 为 ContentEditor 增加可选 Runtime handle bridge，并添加无业务依赖的组件测试；不改变其既有 props 行为。
2. 实现并单测 `useEditorLeaveGuard`：durable、degraded、failed/timeout retry、discard、重复点击与无 handle。
3. 仅接入 ProductionDetail 的三个明确导航按钮；验证 version_action、权限、历史与双用户协作不变。
4. 在 Production 验收后，以相同 hook 接入 ShootingDetail 的两个明确导航按钮；验证 `script_content`、workflow 与 Publishing 不变。
5. 单独评估 Layout/global navigation 与浏览器 back/forward 的 React Router blocker 方案；未经该评估不得宣称全站导航受保护。
6. 在 D3 provider barrier 已实现并完成隔离测试后，才把 collaboration participant 传入 guard。
7. 最后进行双用户受控导航验收：最后输入、durable+degraded、autosave 失败 retry、强制放弃、刷新/关闭提示。

本阶段仅完成设计。未修改页面、ContentEditor、Runtime、Adapter、Yjs、Socket.IO、API 或数据库。

