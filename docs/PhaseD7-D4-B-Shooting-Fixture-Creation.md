# Phase D7-D4-B Shooting Fixture Creation

## 1. 创建资源

| 资源 | 标识 | ID | 状态 |
| --- | --- | ---: | --- |
| Topic | `[D7 TEST] Shooting Graceful Dispose Topic` | 112 | 已通过审核 |
| Production | Topic 112 自动生成的 Production fixture | 86 | 草稿，可编辑 |
| Shooting | `[D7 TEST] Shooting Graceful Dispose Shooting`（制作地点标记） | 35 | 计划中，可编辑 |

Production 数据模型没有独立名称字段，页面名称由关联 Topic 提供；因此 Production fixture 以 Topic 112 和 Production ID 86 共同识别。Shooting 数据模型同样没有独立标题字段，所要求的 Shooting 名称已写入其可见的制作地点标记，列表/详情标题仍显示关联 Topic。

## 2. 创建流程

1. 通过正常选题管理页面创建 Topic 112，并使用既有审核流程通过审核。
2. 系统既有流程自动创建关联的 Production 86；未修改任何已有 Production。
3. 通过正常成片制作页面创建 Shooting 35，选择 Topic 112，并填写唯一的制作地点与设备标记。
4. 通过 Shooting 详情的既有编辑器写入 `D7 Shooting Graceful Dispose Fixture Content`；页面重载后内容仍存在，确认 `script_content` 已按既有自动保存链路持久化。

未直接编辑 SQLite，也未调用未受页面使用的写入路径。

## 3. Fixture Manifest

临时本地 manifest：`tests/fixtures/shooting-graceful-dispose.manifest.local.json`

| 字段 | 值 |
| --- | --- |
| `shootingId` | 35 |
| `productionId` | 86 |
| `allowedPath` | `/api/workflow/shooting/35` |

该 manifest 仅为 D7-D4-A 的 localhost/CI Shooting failure proxy 提供精确白名单，不扩大 Production proxy 的匹配范围。

## 4. 验收检查

| 检查项 | 结果 |
| --- | --- |
| Shooting 页面可打开 | 通过：`/shooting/35` 正常打开 |
| 编辑权限 | 通过：当前测试会话可编辑，编辑器显示协作已连接 |
| 预期协作 room | `shooting:35`；由既有 `getCollaborationRoomId('shooting', 35)` 规则生成 |
| script_content 初始化 | 通过：重载后显示唯一初始化文本 |
| Production 关联 | 通过数据关联：Shooting 35 → Topic 112，Topic 112 已关联自动生成的 Production 86 |
| 关联 Production 按钮 | 当前 Shooting 详情信息栏未渲染独立“查看关联 Production”控件；这是后续导航验收前需要记录的页面能力缺口，未在本阶段修改 |
| Publishing | 未创建 Publishing；Shooting 保持 `planned`，页面时间轴为 0，未执行完成制作或发布流程 |
| 现有测试数据 | 未修改 Shooting 34 或既有 Production/Topic 数据 |

## 5. 回滚与清理

使用正常管理页面、具备相应权限的测试管理员执行以下顺序：

1. 在成片制作列表按制作地点标记 `[D7 TEST] Shooting Graceful Dispose Shooting` 定位并删除 Shooting 35。
2. 在创作管理中删除 Production 86（如需要先单独清理）。
3. 在选题管理中删除 Topic 112。既有 Topic 删除流程会清理该 Topic 下的 Shooting、Production 与相关历史；若步骤 2 已完成，此步仍可安全执行。
4. 删除本地 `tests/fixtures/shooting-graceful-dispose.manifest.local.json`，并清除 `SHOOTING_FAILURE_FIXTURE_MANIFEST` 环境变量。

本阶段没有执行浏览器 failure flow，也没有进入 D8。
