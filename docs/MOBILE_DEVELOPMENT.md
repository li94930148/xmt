# XMT Mobile 开发

1. 安装 Node 22、JDK 21、Android Studio/SDK，设置 `ANDROID_HOME`。
2. 设置 `JAVA_HOME`（JDK 21）和 `ANDROID_HOME`（Android SDK），运行 `npm ci` 与 `npm run mobile:doctor`。
3. Android 本地开发必须显式提供 `VITE_API_BASE_URL` 与 `VITE_SOCKET_BASE_URL`，再执行 `npm run mobile:sync:development`。若通过 HTTP 联调，还必须显式设置 `VITE_ANDROID_ALLOW_CLEARTEXT=true`；该开关只配合 Debug 配置，Release 仍固定禁止明文网络。
4. 正式生产候选不读取上述 shell 变量：执行 `npm run mobile:sync:production` 或 `npm run mobile:apk:debug:production`。它固定打入 `https://lanyaomedia.com/api` 与 `https://lanyaomedia.com`，并生成 `xmt-mobile-build.json` 供产物校验。
5. `npm run mobile:sync` 保留为 development 别名，避免把开发构建误当作生产候选；以 `npm run mobile:android` 打开 Android Studio。
