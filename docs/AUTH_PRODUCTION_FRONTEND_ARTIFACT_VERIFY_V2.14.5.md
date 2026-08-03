# Auth 生产前端产物核验（v2.14.5）

核验时间：2026-08-03（Asia/Shanghai）
核验方式：只读 SSH、HTTPS 响应头和静态文件摘要比对。未开启任何 Auth 灰度开关。

## 结论

生产前端静态产物与已部署的 `840be73`（v2.14.5）一致；公网实际返回的 Login 动态块与服务器文件的 SHA-256 完全相同。未发现旧 bundle、未完成发布或静态资源缓存错配。

## 生产构建证据

| 项目 | 结果 |
| --- | --- |
| Git commit | `840be73744b2d710d4bee5efaee54184dcb66a7d` |
| package 版本 | `2.14.5` |
| `dist/index.html` 生成时间 | `2026-08-03 14:29:49 +08:00` |
| 主入口 | `assets/index-gt5fWH0E.js` |
| Login 动态块 | `assets/Login-DRYkiYPW.js` |
| Login 动态块大小 | `73553` bytes |
| Login 动态块 SHA-256（服务器） | `32956f8193b126f24b9e83ffbebcbb400c77850eb13e889242007b473f6f8fef` |
| Login 动态块 SHA-256（公网，强制重新验证） | `32956f8193b126f24b9e83ffbebcbb400c77850eb13e889242007b473f6f8fef` |

## 关键代码标记

生产 Login 动态块包含 `v1-web` 与 `xmtAuthRuntime` 标记，说明其中已包含 v1 Web 登录路径与内存运行态能力。开发/测试专用 trace 字符串未出现在生产 bundle，符合“生产不输出前端认证调试日志”的安全约束。

## 缓存结论

公网 HTML 和 Login 动态块均返回 200，并且其 `Last-Modified` 与部署构建时间一致。动态块文件名带内容哈希，且新建 Chromium 上下文加载的文件摘要与服务器一致，因此不支持“浏览器使用旧静态资源”的判断。
