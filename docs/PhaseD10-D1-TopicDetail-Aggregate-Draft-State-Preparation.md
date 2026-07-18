# Phase D10-D1 TopicDetail Aggregate Draft State Preparation

## 1. 修改文件

- `src/pages/TopicDetail.tsx`
- `src/pages/topicDetailAggregateDraft.ts`
- `src/pages/topicDetailAggregateDraft.test.ts`

未修改 Runtime、SaveStrategy、ManualSaveController、ContentEditor、Adapter、Production、Shooting、AddTopic、API contract、数据库、Yjs 或 Socket.IO。

## 2. Aggregate Draft 模型

新增页面级 `TopicDetailAggregateDraft`，覆盖：

- `title`
- 原始 `description`
- `details`：`assignee_id`、`deadline`、`platform`
- `outline`
- `parsedFields`：项目背景、目标受众

加载 Topic 时通过同一初始化器建立 draft 与 immutable baseline。每个字段修改都通过页面 handler 更新 draft ref、递增 `aggregateRevision` 并比较 baseline，形成稳定 dirty 状态。保存时复制 snapshot，避免异步 API 完成覆盖保存期间产生的新输入。

`handleCancel()` 现在从 baseline 恢复完整 draft，包括 parsed fields；这修复了此前取消只恢复原始 description、未恢复 parsed fields 的状态不一致风险。

## 3. 保存与并发

`handleSave()` 仍是 TopicDetail 唯一业务保存 owner，仍调用既有：

```ts
updateTopic(id, {
  title,
  description,
  outline,
  platform,
  deadline,
  assignee_id,
})
```

新增 `TopicDetailAggregateSaveGate`：页面按钮和未来键盘入口共享同一个 in-flight Promise。重复点击不会创建第二个 PUT；保存过程中按钮禁用。

如果保存期间有新字段变化，旧请求成功只更新已保存 baseline，不会关闭编辑态或覆盖当前 draft；dirty 保持为真。只有保存 revision 仍是当前 revision 时，才刷新 baseline、退出编辑态并清除 dirty。

## 4. 验证结果

通过：

```text
npx tsx src/pages/topicDetailAggregateDraft.test.ts
npm run check
```

纯状态测试覆盖：

- 单字段修改 dirty 比较
- 全字段 payload 构造
- baseline clone / cancel 恢复比较
- 保存 snapshot 后继续修改不会与旧 snapshot 相等
- AggregateSaveGate 重复调用复用一个 in-flight Promise

浏览器在可回滚 Topic fixture `112` 上验证：

- 修改标题后取消，标题恢复 baseline；
- 修改标题后保存，既有保存流程完成并退出编辑态；
- 测试完成后使用正常保存恢复 fixture 标题，并刷新确认恢复成功。

## 5. 观察项

页面控制台仍存在一个 pre-existing React warning：Topic 的 `assignee_id` 可为 `null`，而编辑状态中的 `<select>` 期望受控字符串/数字值。此次没有扩大范围处理该数据归一化问题；它不影响本阶段 draft、保存或恢复验收，但应在独立 Topic form null-safety 任务中修复。

## 6. 下一步

可以进入 D10-D2 的 TopicDetail manual adapter / handle bridge 实施准备，但仍需遵守 D10-A HTML fixture 准入。D10-D1 本身没有接入 Runtime，也没有新增 Adapter。

