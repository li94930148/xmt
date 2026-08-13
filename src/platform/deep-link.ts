export function resolveMobileDeepLink(value: string) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'xmt:') return null;
    if (url.host === 'messages') return '/messages';
    if (url.host === 'daily-report') return '/daily-report';
    if (url.host === 'topics') return `/topics${url.pathname}`;
    if (url.host === 'production') return `/production${url.pathname}`;
    return null;
  } catch { return null; }
}
