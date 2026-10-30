const STORAGE_KEY_PREFIX = 'xmt:mobile-password-change-recovery:v1:user:';

type PasswordChangeRecoveryMarker = {
  version: 1;
  userId: number;
  createdAt: number;
};

export type PasswordChangeRecoveryStatus = 'clear' | 'pending' | 'unavailable';

function getStorageKey(userId: number): string | null {
  return Number.isSafeInteger(userId) && userId > 0
    ? `${STORAGE_KEY_PREFIX}${userId}`
    : null;
}

export function readMobilePasswordChangeRecovery(userId: number): PasswordChangeRecoveryStatus {
  const key = getStorageKey(userId);
  if (!key || typeof window === 'undefined') return 'clear';

  try {
    const value = window.sessionStorage.getItem(key);
    return value === null ? 'clear' : 'pending';
  } catch {
    return 'unavailable';
  }
}

export function writeMobilePasswordChangeRecovery(userId: number): boolean {
  const key = getStorageKey(userId);
  if (!key || typeof window === 'undefined') return false;

  const marker: PasswordChangeRecoveryMarker = {
    version: 1,
    userId,
    createdAt: Date.now(),
  };

  try {
    const value = JSON.stringify(marker);
    window.sessionStorage.setItem(key, value);
    return window.sessionStorage.getItem(key) === value;
  } catch {
    return false;
  }
}

export function clearMobilePasswordChangeRecovery(userId: number): boolean {
  const key = getStorageKey(userId);
  if (!key || typeof window === 'undefined') return false;

  try {
    window.sessionStorage.removeItem(key);
    return window.sessionStorage.getItem(key) === null;
  } catch {
    return false;
  }
}
