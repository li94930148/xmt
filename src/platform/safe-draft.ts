/** Local recovery for non-sensitive editor content. Never use this for tokens or credentials. */
const prefix = 'xmt:safe-draft:v1:';

export function readSafeDraft<T>(key: string): T | null {
  try { const raw = localStorage.getItem(`${prefix}${key}`); return raw ? JSON.parse(raw) as T : null; } catch { return null; }
}

export function writeSafeDraft<T>(key: string, value: T) {
  try { localStorage.setItem(`${prefix}${key}`, JSON.stringify({ savedAt: Date.now(), value })); return true; } catch { return false; }
}

export function readSafeDraftValue<T>(key: string): T | null {
  const entry = readSafeDraft<{ savedAt: number; value: T }>(key);
  return entry?.value ?? null;
}

export function clearSafeDraft(key: string) {
  try { localStorage.removeItem(`${prefix}${key}`); } catch { /* Storage is best-effort only. */ }
}
