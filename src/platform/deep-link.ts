import mobileDeepLinks from '../../shared/mobile-deep-links.json';

export function resolveMobileDeepLink(value: string) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'xmt:') return null;
    const route = mobileDeepLinks.find((item) => item.host === url.host);
    if (!route) return null;
    return route.ignorePath ? route.pathPrefix : `${route.pathPrefix}${url.pathname}`;
  } catch { return null; }
}
