import { Capacitor } from '@capacitor/core';
import { Browser } from '@capacitor/browser';
import { getNativeEndpointConfigurationErrorFor } from './native-endpoint-contract';

export type RuntimeEnvironment = 'web-development' | 'web-production' | 'android-development' | 'android-production';
export type BackButtonAction = 'navigate-back' | 'warn-exit' | 'exit-app';

const trimTrailingSlash = (value: string) => value.replace(/\/+$/, '');
const isAndroidDevelopmentOverride = () => import.meta.env.DEV && import.meta.env.VITE_APP_PLATFORM === 'android';
const allowsAndroidDebugCleartext = () => import.meta.env.VITE_ANDROID_ALLOW_CLEARTEXT === 'true';
const mobileRootPaths = new Set(['/', '/topics', '/production', '/messages', '/me']);

export class NativeEndpointConfigurationError extends Error {
  readonly code = 'ANDROID_PRODUCTION_ENDPOINT_INVALID';

  constructor(message: string) {
    super(message);
    this.name = 'NativeEndpointConfigurationError';
  }
}

export const isAndroid = () => Capacitor.getPlatform() === 'android' || isAndroidDevelopmentOverride();
export const isNative = () => Capacitor.isNativePlatform() || isAndroidDevelopmentOverride();
export const isWeb = () => !isNative();

export function getRuntimeEnvironment(): RuntimeEnvironment {
  if (isAndroid()) return import.meta.env.DEV ? 'android-development' : 'android-production';
  return import.meta.env.DEV ? 'web-development' : 'web-production';
}

/** Native builds must set HTTPS/WSS endpoints at build time; web retains same-origin defaults. */
export function getApiBaseUrl(): string {
  const error = getNativeEndpointConfigurationError();
  if (error) throw new NativeEndpointConfigurationError(error);
  const configured = import.meta.env.VITE_API_BASE_URL?.trim();
  if (configured) return trimTrailingSlash(configured);
  return '/api';
}

export function getSocketBaseUrl(): string {
  const error = getNativeEndpointConfigurationError();
  if (error) throw new NativeEndpointConfigurationError(error);
  const configured = import.meta.env.VITE_SOCKET_BASE_URL?.trim();
  if (configured) return trimTrailingSlash(configured);
  return isWeb() ? window.location.origin : getApiBaseUrl().replace(/\/api$/, '');
}

export async function openExternalUrl(url: string) {
  if (isNative()) return Browser.open({ url });
  window.open(url, '_blank', 'noopener,noreferrer');
}

export function getNativeEndpointConfigurationError(): string | null {
  return getNativeEndpointConfigurationErrorFor({
    native: isNative(),
    development: import.meta.env.DEV,
    apiBaseUrl: import.meta.env.VITE_API_BASE_URL,
    socketBaseUrl: import.meta.env.VITE_SOCKET_BASE_URL,
    allowCleartext: allowsAndroidDebugCleartext(),
  });
}

/**
 * Keep the shell renderable when an artifact is missing its endpoint config.
 * Requests remain blocked by Android's HTTPS policy; the login UI can report
 * the configuration issue instead of leaving users with a blank screen.
 */
export function assertNativeEndpointSecurity() {
  const error = getNativeEndpointConfigurationError();
  if (error) console.error(`[XMT] ${error}`);
}

/** Decides Android back behavior without binding React navigation to native APIs. */
export function handleBackButton(pathname: string, lastBackAt: number, now = Date.now()): { action: BackButtonAction; nextBackAt: number } {
  if (!mobileRootPaths.has(pathname)) return { action: 'navigate-back', nextBackAt: lastBackAt };
  if (now - lastBackAt < 1800) return { action: 'exit-app', nextBackAt: 0 };
  return { action: 'warn-exit', nextBackAt: now };
}
