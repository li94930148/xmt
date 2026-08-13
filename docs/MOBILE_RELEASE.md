# XMT Mobile 发布

Production Mobile Auth rollout requires the controlled runtime configuration in
`docs/PRODUCTION_RUNTIME_ENV.md`. The first gray user must be a non-admin
internal test account unless a human explicitly approves an admin exception.

版本以 `package.json` 为准。Android 的 `versionName` 必须一致，`versionCode` 必须递增。构建前配置 Java 21 和 Android SDK：

```bash
export JAVA_HOME=/path/to/jdk-21
export ANDROID_HOME=/path/to/android-sdk
export ANDROID_SDK_ROOT="$ANDROID_HOME"
export PATH="$JAVA_HOME/bin:$ANDROID_HOME/platform-tools:$PATH"
```

## Debug APK：内部开发与真机验收

```bash
npm ci
npm run mobile:apk:debug
apksigner verify --verbose android/app/build/outputs/apk/debug/app-debug.apk
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
```

路径：`android/app/build/outputs/apk/debug/app-debug.apk`。Gradle 使用 Android Debug Key 自动签名，因此该 APK 可通过 `adb install -r` 安装，仅用于开发和内部真机验收。

## Unsigned Release APK：Release 构建验证

```bash
npm run mobile:apk:release
apksigner verify --verbose android/app/build/outputs/apk/release/app-release-unsigned.apk
```

路径：`android/app/build/outputs/apk/release/app-release-unsigned.apk`。该产物只证明 Release 编译、压缩和安全清单通过；它**不可安装、不可分发**，直到使用正式 Release Key 重新签名。

## Signed Release APK / AAB：正式发布

正式内部发布或应用商店发布必须由外部 Release Keystore 签名。Keystore、alias、store password、key password 只能由 CI Secret、受控密钥服务或 Android Studio 的本地安全配置提供，禁止提交到 Git 或写入源码。

示例（变量由受控环境注入）：

```bash
apksigner sign \
  --ks "$XMT_RELEASE_KEYSTORE" \
  --ks-key-alias "$XMT_RELEASE_KEY_ALIAS" \
  --out app-release-signed.apk \
  android/app/build/outputs/apk/release/app-release-unsigned.apk
apksigner verify --verbose --print-certs app-release-signed.apk
```

生成 AAB 时，在同一受控签名配置下执行 `./gradlew bundleRelease`。发布前还必须核对 applicationId、版本、证书指纹、HTTPS API/Socket 地址和 Release 清单的 `usesCleartextTraffic=false`。
