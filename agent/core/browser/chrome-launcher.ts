import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';

const CREATOR_URL = 'https://creator.douyin.com/';

export function findChrome(preferredPath?: string) {
  if (preferredPath && fs.existsSync(preferredPath) && path.basename(preferredPath).toLowerCase() === 'chrome.exe') return preferredPath;
  const candidates = [
    process.env.PROGRAMFILES && path.join(process.env.PROGRAMFILES, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    process.env['PROGRAMFILES(X86)'] && path.join(process.env['PROGRAMFILES(X86)'], 'Google', 'Chrome', 'Application', 'chrome.exe'),
    process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Google', 'Chrome', 'Application', 'chrome.exe'),
  ].filter((value): value is string => Boolean(value));
  const executable = candidates.find((candidate) => fs.existsSync(candidate));
  if (!executable) throw new Error('Chrome启动失败，请检查Chrome安装。');
  return executable;
}

export function stopChrome() {
  const result = spawnSync('taskkill.exe', ['/F', '/IM', 'chrome.exe'], { windowsHide: true, stdio: 'ignore' });
  if (result.error) throw new Error(`无法关闭现有 Chrome：${result.error.message}`);
}

export async function launchChrome(profileDir: string, port = 9222, preferredPath?: string) {
  const executable = findChrome(preferredPath);
  fs.mkdirSync(profileDir, { recursive: true });
  stopChrome();
  const child = spawn(executable, [
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profileDir}`,
    '--no-first-run',
    '--no-default-browser-check',
    CREATOR_URL,
  ], { detached: true, stdio: 'ignore', windowsHide: false });
  child.unref();
  const endpoint = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${endpoint}/json/version`, { signal: AbortSignal.timeout(1_500) });
      if (response.ok) return endpoint;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error('Chrome启动失败：9222 调试端口未就绪。');
}
