import { registerPlugin } from '@capacitor/core';
import { isNative } from '@/platform/runtime';

type SecureCredentialPlugin = { set(options: { key: string; value: string }): Promise<void>; get(options: { key: string }): Promise<{ value: string | null }>; remove(options: { key: string }): Promise<void> };
const SecureCredential = registerPlugin<SecureCredentialPlugin>('SecureCredential');
const REFRESH_KEY = 'refresh_token';

export const nativeRefreshCredentials = {
  async get() { return isNative() ? (await SecureCredential.get({ key: REFRESH_KEY })).value : null; },
  async set(value: string) { if (isNative()) await SecureCredential.set({ key: REFRESH_KEY, value }); },
  async clear() { if (isNative()) await SecureCredential.remove({ key: REFRESH_KEY }); },
};
