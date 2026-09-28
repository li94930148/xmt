import { useSyncExternalStore } from 'react';

const MOBILE_EDITOR_QUERY = '(max-width: 639px)';
let mobileEditorMediaQuery: MediaQueryList | null = null;

function getMobileEditorMediaQuery() {
  if (typeof window === 'undefined') return null;
  mobileEditorMediaQuery ??= window.matchMedia(MOBILE_EDITOR_QUERY);
  return mobileEditorMediaQuery;
}

function subscribe(listener: () => void) {
  const mediaQuery = getMobileEditorMediaQuery();
  mediaQuery?.addEventListener('change', listener);
  return () => mediaQuery?.removeEventListener('change', listener);
}

function getSnapshot() {
  return getMobileEditorMediaQuery()?.matches ?? false;
}

export function useCompactEditorToolbar() {
  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}
