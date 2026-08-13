import { Capacitor } from '@capacitor/core';
import { Browser } from '@capacitor/browser';

export type RuntimeEnvironment = 'web-development' | 'web-production' | 'android-development' | 'android-production';

const trimTrailingSlash = (value: string) => value.replace(/\/+$/, '');
const isAndroidDevelopmentOverride = () => import.meta.env.DEV && import.meta.env.VITE_APP_PLATFORM === 'android';

export const isAndroid = () => Capacitor.getPlatform() === 'android' || isAndroidDevelopmentOverride();
export const isNative = () => Capacitor.isNativePlatform() || isAndroidDevelopmentOverride();
export const isWeb = () => !isNative();

export function getRuntimeEnvironment(): RuntimeEnvironment {
  if (isAndroid()) return import.meta.env.DEV ? 'android-development' : 'android-production';
  return import.meta.env.DEV ? 'web-development' : 'web-production';
}

/** Native builds must set HTTPS/WSS endpoints at build time; web retains same-origin defaults. */
export function getApiBaseUrl(): string {
  const configured = import.meta.env.VITE_API_BASE_URL?.trim();
  if (configured) return trimTrailingSlash(configured);
  if (isNative()) return '/api';
  return '/api';
}

export function getSocketBaseUrl(): string {
  const configured = import.meta.env.VITE_SOCKET_BASE_URL?.trim();
  if (configured) return trimTrailingSlash(configured);
  return isWeb() ? window.location.origin : getApiBaseUrl().replace(/\/api$/, '');
}

export async function openExternalUrl(url: string) {
  if (isNative()) return Browser.open({ url });
  window.open(url, '_blank', 'noopener,noreferrer');
}

export function assertNativeEndpointSecurity() {
  if (!isNative() || import.meta.env.DEV) return;
  const endpoint = getApiBaseUrl();
  if (!/^https:\/\//i.test(endpoint)) {
    throw new Error('Android 正式构建必须配置 HTTPS 的 VITE_API_BASE_URL。');
  }
}
