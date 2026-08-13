import { execFileSync } from 'node:child_process';
const checks = [['Node', 'node', ['--version']], ['npm', 'npm', ['--version']], ['Java', 'java', ['-version']], ['adb', 'adb', ['version']]] as const;
let failed = false;
for (const [label, command, args] of checks) { try { console.log(`✓ ${label}: ${execFileSync(command, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim().split('\n')[0]}`); } catch { console.error(`✗ ${label}: 未找到或不可用`); failed = true; } }
if (!process.env.ANDROID_HOME && !process.env.ANDROID_SDK_ROOT) { console.error('✗ Android SDK: 请设置 ANDROID_HOME 或 ANDROID_SDK_ROOT'); failed = true; } else console.log('✓ Android SDK: 已配置');
if (failed) process.exitCode = 1;
