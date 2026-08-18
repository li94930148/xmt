# XMT Creator Agent

当前版本：`v2.12.0-agent`。运营数据采集已切换为 Scrapling First：Electron 仅管理独立 Profile、Worker 进程和加密同步；Python Worker 使用 Scrapling `AsyncDynamicSession` 采集抖音 Creator Center 的用户可见数据。Worker 仅通过 stdin/stdout JSON Lines 通信，不开放 localhost 服务，也不输出 Cookie、Token 或完整 URL 到日志。

Creator Agent 在用户自己的 macOS 或 Windows 电脑上读取抖音创作者中心的只读运营数据。Linux 服务器不登录抖音、不保存浏览器会话，只负责设备认证、数据校验、入库和展示。

## 安全边界

- Cookie、localStorage、二维码、密码、浏览器 Profile 和请求签名仅保留在本机。
- 上传内容是经过脱敏和规范化的运营数据，使用 AES-256-GCM 加密、HMAC-SHA256 签名、五分钟时间窗和一次性 nonce。
- 生产服务器必须使用 HTTPS；本地开发仅允许 `localhost` 或 `127.0.0.1`。
- Agent 不发布、删除或修改抖音内容，也不读取 XMT 的历史 OAuth Token。

## 环境自检

在项目根目录运行：

```bash
npm run creator-agent:doctor
```

要求 Node.js 22。自检会报告系统架构、浏览器位置、本地数据目录和协议版本，不输出凭据。

## macOS

支持 Apple Silicon 和 Intel Mac。当前推荐 Chromium 系浏览器以获得最佳兼容性，但 Creator Agent 采用通用浏览器适配架构，并支持多种浏览器运行时。

```bash
cd agent
npm ci
npm run check
npm run dev
```

标准数据目录为 `~/Library/Application Support/XMT Creator Agent`，浏览器资料和日志均位于该目录的专用子目录。系统安全存储由 Electron `safeStorage` 提供。Agent 不会结束用户正在使用的日常浏览器。

## Windows 10/11

```powershell
cd agent
npm ci
npm run check
npm run dev
```

支持 Chrome、Edge、Brave、Chromium，以及 Playwright 托管运行时。路径通过系统路径 API 构建，可包含空格和中文。标准数据目录使用 `LOCALAPPDATA`/`APPDATA`；历史 Portable 数据目录继续兼容。凭据由当前 Windows 用户的系统安全存储保护。

## 浏览器支持和选择

- 正式兼容目标：系统 Chrome、Chromium、Edge、Brave，以及 Playwright Chromium。
- Arc 可按 Chromium 系浏览器发现，但资料目录和启动行为独立处理，完成实机检测前标记为“未检测”。
- Playwright Firefox 和 WebKit 使用原生持久化上下文，不强制套用 CDP。因创作者中心兼容性差异，默认标记为“部分兼容”。
- 外部 CDP 只用于用户明确启用的 Chromium 调试会话；Agent 断开时不关闭外部浏览器。
- Safari 本体不作为自动化目标，避免操作用户日常 Safari 资料；WebKit 仅用于兼容性验证。

选择顺序是：用户指定、上次成功、已通过兼容检测的系统 Chromium 浏览器、Playwright Chromium、Firefox、WebKit。自动回退只遍历有限候选，不无限重启。

```bash
npm run creator-agent:browser:list
npm run creator-agent:browser:test -- --browser=chrome
npm run creator-agent:browser:select -- --browser=chrome
npm run creator-agent:browser:select -- --path="/自定义路径/Browser"
```

不同浏览器、抖音账号和 Profile 名称使用独立目录：`profiles/<browser>/<account>/<profile>`。不会默认复用浏览器日常资料。清理资料会导致重新登录，必须由用户明确确认；清理不会删除设备凭据、XMT 数据库或其他浏览器资料。

## 登录、绑定与同步

1. 管理员在 XMT Creator Center 创建 15 分钟有效的一次性绑定码。
2. 启动 Agent，填写 XMT 地址和绑定码。绑定码成功使用后立即失效，设备凭据仅返回一次并进入系统安全存储。
3. 点击“登录抖音”，用抖音 App 扫码；登录状态只保存在 Agent 独立 Profile。
4. 点击“立即同步”。Agent 按账号、作品列表、作品详情、数据总览、内容分析和粉丝分析分阶段采集。
5. 作品列表持续读取 `has_more` 和游标，不固定第一页；详情页采用串行低频访问。

浏览器升级或卸载后先执行 `browser:list` 和 `browser:test`，再选择新候选。浏览器崩溃时会释放失效会话，按有限回退策略恢复；登录失效时停止上传，不会用空数据覆盖已有数据。

## 定时同步

桌面设置支持手动、每12小时或每天一次。默认关闭自动同步；同一进程只允许一个任务运行。macOS 使用登录项常驻，Windows 使用登录启动，用户无需手工编辑 launchd 或任务计划文件。

## 登录失效与诊断

- 显示“登录已失效”时，重新打开登录窗口扫码，不要复制浏览器 Profile。
- 日志按任务记录页面、阶段、数量和错误，不记录 Cookie、Token 或完整敏感响应。
- `npm run creator-agent:doctor` 用于基础诊断。
- 历史明文 OAuth 凭据只可用根项目的 `npm run audit:douyin-legacy-tokens` 检测；默认不会删除。

## 数据来源

抖音运营中心正式链路仅为：抖音创作者中心 → Creator Agent → XMT 服务端。官方开放平台 OAuth 仅为仍需授权回调或 Webhook 的独立功能保留，不参与运营数据采集。
