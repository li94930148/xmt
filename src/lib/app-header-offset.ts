const APP_HEADER_HEIGHT_PROPERTY = '--xmt-app-topbar-height';

export function observeAppHeaderHeight(container: HTMLElement): () => void {
  const header = container.querySelector<HTMLElement>(':scope > header');
  if (!header) {
    container.style.removeProperty(APP_HEADER_HEIGHT_PROPERTY);
    return () => undefined;
  }

  const syncHeight = () => {
    const zoom = Number.parseFloat(getComputedStyle(document.documentElement).zoom) || 1;
    const height = header.getBoundingClientRect().height / zoom;
    container.style.setProperty(APP_HEADER_HEIGHT_PROPERTY, `${height}px`);
  };

  syncHeight();
  if (typeof ResizeObserver === 'undefined') {
    window.addEventListener('resize', syncHeight);
    return () => window.removeEventListener('resize', syncHeight);
  }

  const observer = new ResizeObserver(syncHeight);
  observer.observe(header);
  return () => observer.disconnect();
}
