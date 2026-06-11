import { useState, useEffect, useCallback } from 'react';
import {
  isNotificationSupported,
  getNotificationPermission,
  requestNotificationPermission,
  isDesktopNotifyEnabled,
  setDesktopNotifyEnabled,
  isNotifySoundEnabled,
  setNotifySoundEnabled,
  notifyDesktop,
  playNotificationSound,
  type DesktopNotificationOptions,
} from '../utils/notification';

interface DesktopNotificationState {
  /** 浏览器是否支持桌面通知 */
  supported: boolean;
  /** 当前权限状态 */
  permission: NotificationPermission;
  /** 用户是否开启了桌面通知 */
  enabled: boolean;
  /** 用户是否开启了提示音 */
  soundEnabled: boolean;
}

interface DesktopNotificationActions {
  /** 请求通知权限 */
  requestPermission: () => Promise<NotificationPermission>;
  /** 开关桌面通知 */
  toggleEnabled: () => void;
  /** 开关提示音 */
  toggleSound: () => void;
  /** 发送一条桌面通知 */
  notify: (options: DesktopNotificationOptions) => void;
  /** 单独播放提示音（用于测试） */
  testSound: () => void;
}

/**
 * 桌面通知 Hook
 * 管理通知权限、开关状态，提供发送通知的方法
 */
export function useDesktopNotification(): DesktopNotificationState & DesktopNotificationActions {
  const [state, setState] = useState<DesktopNotificationState>({
    supported: isNotificationSupported(),
    permission: getNotificationPermission(),
    enabled: isDesktopNotifyEnabled(),
    soundEnabled: isNotifySoundEnabled(),
  });

  // 监听权限变化（某些浏览器支持 permissionchange 事件）
  useEffect(() => {
    if (!state.supported) return;

    // 定期检查权限状态（兼容不支持 permissionchange 的浏览器）
    const interval = setInterval(() => {
      const current = getNotificationPermission();
      setState((prev) => {
        if (prev.permission !== current) {
          return { ...prev, permission: current };
        }
        return prev;
      });
    }, 2000);

    return () => clearInterval(interval);
  }, [state.supported]);

  const requestPermission = useCallback(async () => {
    const result = await requestNotificationPermission();
    setState((prev) => ({ ...prev, permission: result }));
    return result;
  }, []);

  const toggleEnabled = useCallback(() => {
    const newVal = !isDesktopNotifyEnabled();
    setDesktopNotifyEnabled(newVal);
    setState((prev) => ({ ...prev, enabled: newVal }));
  }, []);

  const toggleSound = useCallback(() => {
    const newVal = !isNotifySoundEnabled();
    setNotifySoundEnabled(newVal);
    setState((prev) => ({ ...prev, soundEnabled: newVal }));
  }, []);

  const notify = useCallback((options: DesktopNotificationOptions) => {
    notifyDesktop(options);
  }, []);

  const testSound = useCallback(() => {
    playNotificationSound();
  }, []);

  return {
    ...state,
    requestPermission,
    toggleEnabled,
    toggleSound,
    notify,
    testSound,
  };
}
