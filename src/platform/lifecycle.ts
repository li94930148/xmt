import { App } from '@capacitor/app';
import { Network } from '@capacitor/network';
import { Keyboard } from '@capacitor/keyboard';
import { StatusBar, Style } from '@capacitor/status-bar';
import { SplashScreen } from '@capacitor/splash-screen';
import { Capacitor } from '@capacitor/core';

export async function initializeNativeLifecycle(onResume: () => void) {
  // `VITE_APP_PLATFORM=android` is a UI-development override. Native plugin
  // listeners must only run inside an actual Capacitor runtime.
  if (!Capacitor.isNativePlatform()) return () => undefined;
  await StatusBar.setStyle({ style: Style.Dark }).catch(() => undefined);
  await SplashScreen.hide().catch(() => undefined);
  const listeners = await Promise.all([
    App.addListener('appStateChange', ({ isActive }) => { if (isActive) onResume(); }),
    App.addListener('appUrlOpen', ({ url }) => window.dispatchEvent(new CustomEvent('xmt-deep-link', { detail: { url } }))),
    Network.addListener('networkStatusChange', (status) => window.dispatchEvent(new CustomEvent('xmt-network-status', { detail: status }))),
    Keyboard.addListener('keyboardWillShow', ({ keyboardHeight }) => document.documentElement.style.setProperty('--xmt-keyboard-height', `${keyboardHeight}px`)),
    Keyboard.addListener('keyboardWillHide', () => document.documentElement.style.setProperty('--xmt-keyboard-height', '0px')),
  ]);
  return () => listeners.forEach((listener) => listener.remove());
}
