import { registerPlugin } from '@capacitor/core';
import { isNative } from '@/platform/runtime';
import type { User } from '@/types';

type SecureCredentialPlugin = { set(options: { key: string; value: string }): Promise<void>; get(options: { key: string }): Promise<{ value: string | null }>; remove(options: { key: string }): Promise<void> };
const SecureCredential = registerPlugin<SecureCredentialPlugin>('SecureCredential');
const REFRESH_KEY = 'refresh_token';
const USER_KEY = 'xmt_mobile_user';

export const nativeRefreshCredentials = {
  async get() { return isNative() ? (await SecureCredential.get({ key: REFRESH_KEY })).value : null; },
  async set(value: string) { if (isNative()) await SecureCredential.set({ key: REFRESH_KEY, value }); },
  async clear() { if (isNative()) await SecureCredential.remove({ key: REFRESH_KEY }); },
};

/** Profile metadata is non-secret; only refresh credentials go to the Keystore. */
export const nativeUserProfile = {
  get(): User | null { try { const value = localStorage.getItem(USER_KEY); return value ? JSON.parse(value) as User : null; } catch { return null; } },
  set(user: User) { localStorage.setItem(USER_KEY, JSON.stringify(user)); },
  clear() { localStorage.removeItem(USER_KEY); },
};
