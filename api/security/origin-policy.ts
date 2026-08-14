export const DEFAULT_ALLOWED_ORIGINS = [
  // Capacitor Android/WebView local asset servers may use either scheme.
  // Keep both exact origins explicit; never use a wildcard with credentials.
  'http://localhost',
  'https://localhost',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:5174',
  'http://127.0.0.1:5174',
];

export function parseConfiguredOrigins(value?: string) {
  const origins = value ? value.split(',') : DEFAULT_ALLOWED_ORIGINS;
  return new Set(origins.map((origin) => origin.trim().toLowerCase()).filter(Boolean));
}

function normalizeOrigin(origin: string) {
  try {
    const url = new URL(origin);
    if (!/^https?:$/i.test(url.protocol)) return null;
    return url.origin.toLowerCase();
  } catch {
    return null;
  }
}

export function isAllowedRequestOrigin(origin: string | undefined, allowedOrigins: ReadonlySet<string>) {
  if (!origin) return true;
  const normalized = normalizeOrigin(origin);
  return normalized !== null && allowedOrigins.has(normalized);
}
