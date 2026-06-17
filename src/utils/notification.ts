/**
 * 桌面通知工具
 * 使用 Web Notifications API 实现系统级桌面弹窗
 * 使用 Web Audio API 生成提示音（无需外部音频文件）
 */

// ---- 提示音 ----

let audioContext: AudioContext | null = null;

function getAudioContext(): AudioContext {
  if (!audioContext) {
    audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
  }
  return audioContext;
}

/**
 * 播放提示音 —— 两声短促的 "叮咚"，类似微信提示
 */
export function playNotificationSound() {
  try {
    const ctx = getAudioContext();
    // 如果 AudioContext 被浏览器挂起（需要用户交互才能恢复），先恢复
    if (ctx.state === 'suspended') {
      ctx.resume();
    }

    const now = ctx.currentTime;

    // 第一声：较高音
    playTone(ctx, now, 880, 0.15, 0.3);       // A5, 0.15秒, 音量0.3
    // 第二声：更高音，稍后开始
    playTone(ctx, now + 0.12, 1108.73, 0.18, 0.25); // C#6, 0.18秒, 音量0.25
  } catch (e) {
    console.warn('播放提示音失败:', e);
  }
}

function playTone(ctx: AudioContext, startTime: number, frequency: number, duration: number, volume: number) {
  const oscillator = ctx.createOscillator();
  const gainNode = ctx.createGain();

  oscillator.type = 'sine';
  oscillator.frequency.setValueAtTime(frequency, startTime);

  // 音量包络：快速上升 → 短暂停留 → 缓慢衰减
  gainNode.gain.setValueAtTime(0, startTime);
  gainNode.gain.linearRampToValueAtTime(volume, startTime + 0.01);      // 10ms 上升
  gainNode.gain.setValueAtTime(volume, startTime + duration * 0.6);      // 保持
  gainNode.gain.exponentialRampToValueAtTime(0.001, startTime + duration); // 衰减

  oscillator.connect(gainNode);
  gainNode.connect(ctx.destination);

  oscillator.start(startTime);
  oscillator.stop(startTime + duration);
}

// ---- 桌面通知 ----

/**
 * 检查是否在安全上下文（HTTPS 或 localhost）
 * 桌面通知和提示音自动播放都需要安全上下文
 */
export function isSecureContext(): boolean {
  return window.isSecureContext;
}

/**
 * 检查浏览器是否支持桌面通知
 */
export function isNotificationSupported(): boolean {
  return 'Notification' in window && window.isSecureContext;
}

/**
 * 获取当前通知权限状态
 * 'default' | 'granted' | 'denied'
 */
export function getNotificationPermission(): NotificationPermission {
  if (!isNotificationSupported()) return 'denied';
  return Notification.permission;
}

/**
 * 请求通知权限（必须由用户交互触发）
 */
export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (!isNotificationSupported()) return 'denied';
  return await Notification.requestPermission();
}

export interface DesktopNotificationOptions {
  title: string;
  body: string;
  icon?: string;
  tag?: string;
  url?: string;       // 点击通知后跳转的地址
  silent?: boolean;   // 是否静音（不用系统默认声音，我们自己播放）
}

/**
 * 显示桌面通知
 * 注意：需要先获得用户权限
 */
export function showDesktopNotification(options: DesktopNotificationOptions): Notification | null {
  if (!isNotificationSupported()) return null;
  if (Notification.permission !== 'granted') return null;

  const notification = new Notification(options.title, {
    body: options.body,
    icon: options.icon || '/logo.png',
    tag: options.tag || 'xmt-notification',
    silent: true,  // 禁用系统默认声音，我们用自己的提示音
  });

  // 播放自定义提示音
  playNotificationSound();

  // 点击通知 → 跳转到对应页面
  notification.onclick = () => {
    window.focus();
    if (options.url) {
      window.location.href = options.url;
    }
    notification.close();
  };

  // 8秒后自动关闭
  setTimeout(() => notification.close(), 8000);

  return notification;
}

// ---- 用户偏好 ----

const DESKTOP_NOTIFY_PREF_KEY = 'xmt_desktop_notify_enabled';
const NOTIFY_SOUND_PREF_KEY = 'xmt_notify_sound_enabled';

/**
 * 获取桌面通知开关状态（从 localStorage）
 */
export function isDesktopNotifyEnabled(): boolean {
  const val = localStorage.getItem(DESKTOP_NOTIFY_PREF_KEY);
  // 默认开启
  return val === null ? true : val === 'true';
}

/**
 * 设置桌面通知开关
 */
export function setDesktopNotifyEnabled(enabled: boolean): void {
  localStorage.setItem(DESKTOP_NOTIFY_PREF_KEY, String(enabled));
}

/**
 * 获取提示音开关状态
 */
export function isNotifySoundEnabled(): boolean {
  const val = localStorage.getItem(NOTIFY_SOUND_PREF_KEY);
  return val === null ? true : val === 'true';
}

/**
 * 设置提示音开关
 */
export function setNotifySoundEnabled(enabled: boolean): void {
  localStorage.setItem(NOTIFY_SOUND_PREF_KEY, String(enabled));
}

/**
 * 便捷方法：根据用户偏好，显示桌面通知 + 播放提示音
 */
export function notifyDesktop(options: DesktopNotificationOptions): void {
  if (!isDesktopNotifyEnabled()) return;
  if (!isNotificationSupported()) return;
  if (Notification.permission !== 'granted') return;

  const notification = new Notification(options.title, {
    body: options.body,
    icon: options.icon || '/logo.png',
    tag: options.tag || 'xmt-notification',
    silent: true,
  });

  // 根据用户偏好决定是否播放提示音
  if (isNotifySoundEnabled()) {
    playNotificationSound();
  }

  notification.onclick = () => {
    window.focus();
    if (options.url) {
      window.location.href = options.url;
    }
    notification.close();
  };

  setTimeout(() => notification.close(), 8000);
}
