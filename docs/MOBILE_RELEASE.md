# XMT Mobile 发布

版本以 `package.json` 为准。Android `versionName` 与其一致，`versionCode` 为递增整数。执行 `npm run mobile:apk:debug` 生成可测试 APK；Release 使用 `npm run mobile:apk:release`，正式签名由 CI 或 Android Studio 读取外部 keystore，不得提交密钥或密码。
