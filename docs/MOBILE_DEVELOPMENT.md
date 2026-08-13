# XMT Mobile 开发

1. 安装 Node 22、JDK 21、Android Studio/SDK，设置 `ANDROID_HOME`。
2. 运行 `npm ci` 与 `npm run mobile:doctor`。
3. 为 Android 调试设置 `VITE_API_BASE_URL` 与 `VITE_SOCKET_BASE_URL`；正式环境只能使用 HTTPS/WSS。
4. 执行 `npm run mobile:sync`，以 `npm run mobile:android` 打开 Android Studio，或运行 `npm run mobile:apk:debug`。
