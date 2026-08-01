# Auth 灰度浏览器验证夹具

浏览器 A 使用 allowlist member 账号登录同一创作记录并保持旧版本编辑。浏览器 B 使用另一 member 账号登录同一记录并执行“另开新版”。

验收顺序：A 登录 → B 登录 → A 输入未保存内容 → B 创建 major → A 收到 `version:superseded` → A 编辑器只读且出现“进入最新版本” → A 点击后进入最新版本并恢复编辑。同步验证同时记录 Refresh Cookie、Socket 重连、房间恢复和 Yjs state vector。
