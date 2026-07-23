# XMT Creator Agent Desktop

Windows 独立桌面客户端。用户无需安装 Node.js，也不需要使用命令行。采集浏览器和 Profile 完全在用户设备运行，不上传 Cookie，不保存 XMT 或抖音密码。

## 开发

```powershell
cd agent
$env:PLAYWRIGHT_BROWSERS_PATH='0'
npm install
npx playwright install chromium
npm run check
npm run dev
```

- `npm run build`：构建 core、Electron 主进程和 React UI。
- `npm run electron:dev`：配合 renderer 开发服务器启动桌面端。
- `npm run electron:build`：生成 Windows NSIS 安装包。

## Windows Portable 构建产物

```text
release/XMT-Creator-Agent-Portable.zip
```

无需安装或管理员权限。解压后双击 `XMT Creator Agent/XMT-Creator-Agent.exe`。不创建快捷方式、卸载器或注册表安装项。

## 本地数据

便携包中存在 `portable.flag` 时，位置为程序旁的 `data/`；开发模式或无标志文件时继续兼容 `%APPDATA%\XMT Creator Agent\`。

- `config.json`：服务器、设备 ID、平台账号和同步计划，不包含敏感 Token。
- `agent-token.bin`：使用 Electron `safeStorage` 调用当前 Windows 用户的 DPAPI 加密。
- `browser/`：Agent 启动的真实 Google Chrome 专用 Profile，仅保存在本机。
- `douyin-api-discovery/`：由真实页面 XHR/Fetch 响应自动生成的接口发现结果，不含 Cookie、Token 或临时访问密钥。
- `logs/sync.log`：脱敏同步日志，不写入 Cookie、密码或 Token。

便携版没有卸载器。关闭程序后移动整个目录即可迁移，删除目录即可清除便携数据。

## 使用流程

1. 启动应用，输入 XMT HTTPS 地址、XMT 用户名/密码和要绑定的抖音账号 ID。
2. 客户端登录 XMT 并调用既有 `/api/creator-agent/register`，密码在请求结束后即释放。
3. 默认选择“真实 Chrome”。点击“登录抖音”后，Agent 自动定位 Chrome、仅关闭 `chrome.exe` 进程，并以 9222 调试端口和 XMT 专用本地 Profile 启动 Chrome。
4. Agent 使用 `chromium.connectOverCDP()` 连接自动启动的 Chrome；用户在抖音创作者中心手动登录，Agent 不会自动输入账号密码或上传 Cookie/Profile。
5. 点击“立即同步”；Agent 通过 Playwright `connectOverCDP()` 连接 9222，并使用 `page.on('response')` 监听真实 XHR/Fetch；不调用 CDP `Network.enable`。
6. 作品管理页默认监听 5 分钟，随后依次采集作品详情、账号总览、作品分析和粉丝分析，并生成按页面拆分的接口发现 JSON。
7. 数据以 AES-256-GCM 加密并使用 HMAC-SHA256 签名后，通过既有 `/api/creator-agent/report` 上传。
8. 在设置中选择手动、每 12 小时或每天指定小时同步，并可开启 Windows 登录后自动启动。
