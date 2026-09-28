/** Choose once per app mount so resizing never discards an open editor. */
export function shouldUseMobileLayout(android: boolean, viewportWidth: number): boolean {
  return android || (viewportWidth > 0 && viewportWidth < 768);
}

export function mobileNavigationPath(pathname: string): string | undefined {
  if (['/', '/home', '/dashboard'].includes(pathname)) return '/';
  if (pathname === '/notification-settings') return '/me';
  if (['/production', '/calendar', '/kanban', '/inspirations', '/shooting', '/publishing', '/daily-report'].some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  )) return '/production';
  return ['/topics', '/messages', '/me'].find((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}
