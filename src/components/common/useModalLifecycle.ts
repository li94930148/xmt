import { useLayoutEffect, useRef, type RefObject } from 'react';

interface ModalStackEntry {
  overlay: HTMLElement;
  returnFocus: HTMLElement | null;
  onClose: () => void;
  closeOnEscape: () => boolean;
}

interface BackgroundState {
  inert: string | null;
  ariaHidden: string | null;
}

const modalStack: ModalStackEntry[] = [];
const backgroundStates = new Map<HTMLElement, BackgroundState>();
let backgroundObserver: MutationObserver | null = null;

const focusableSelector = [
  'a[href]',
  'area[href]',
  'button',
  'input:not([type="hidden"])',
  'select',
  'textarea',
  'iframe',
  '[contenteditable="true"]',
  '[tabindex]',
].join(',');

function rememberBackgroundState(element: HTMLElement) {
  if (backgroundStates.has(element)) return;
  backgroundStates.set(element, {
    inert: element.getAttribute('inert'),
    ariaHidden: element.getAttribute('aria-hidden'),
  });
}

function restoreBackgroundState(element: HTMLElement, state: BackgroundState) {
  if (state.inert !== null) element.setAttribute('inert', state.inert);
  else element.removeAttribute('inert');

  if (state.ariaHidden === null) element.removeAttribute('aria-hidden');
  else element.setAttribute('aria-hidden', state.ariaHidden);
}

function isAvailableForFocus(element: HTMLElement) {
  if (!element.isConnected || element.matches(':disabled')) return false;
  if (element.closest('[hidden], [inert], [aria-hidden="true"]')) return false;

  const style = window.getComputedStyle(element);
  return style.display !== 'none' && style.visibility !== 'hidden' && style.visibility !== 'collapse';
}

function getFocusableElements(overlay: HTMLElement) {
  return Array.from(overlay.querySelectorAll<HTMLElement>(focusableSelector)).filter((element) => (
    element.tabIndex >= 0 && isAvailableForFocus(element)
  ));
}

function focusElement(element: HTMLElement | null) {
  if (!element || !isAvailableForFocus(element)) return false;
  element.focus({ preventScroll: true });
  return document.activeElement === element;
}

function focusInitialElement(entry: ModalStackEntry) {
  const explicitTarget = entry.overlay.querySelector<HTMLElement>('[data-modal-autofocus]');
  const target = explicitTarget && isAvailableForFocus(explicitTarget)
    ? explicitTarget
    : getFocusableElements(entry.overlay)[0];

  if (!focusElement(target ?? entry.overlay)) {
    entry.overlay.focus({ preventScroll: true });
  }
}

function syncModalEnvironment() {
  const top = modalStack[modalStack.length - 1];
  const body = document.body;
  if (!body) return;

  for (const child of Array.from(body.children)) {
    if (!(child instanceof HTMLElement)) continue;
    rememberBackgroundState(child);

    if (child === top?.overlay) {
      child.removeAttribute('inert');
      child.removeAttribute('aria-hidden');
    } else {
      child.setAttribute('inert', '');
      child.setAttribute('aria-hidden', 'true');
    }
  }
}

function handleModalKeydown(event: KeyboardEvent) {
  const top = modalStack[modalStack.length - 1];
  if (!top) return;
  if (event.key !== 'Tab') return;

  const focusable = getFocusableElements(top.overlay);
  if (focusable.length === 0) {
    event.preventDefault();
    top.overlay.focus({ preventScroll: true });
    return;
  }

  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  const active = document.activeElement;

  if (event.shiftKey && (active === first || !top.overlay.contains(active))) {
    event.preventDefault();
    last.focus({ preventScroll: true });
  } else if (!event.shiftKey && (active === last || !top.overlay.contains(active))) {
    event.preventDefault();
    first.focus({ preventScroll: true });
  }
}

function handleModalEscape(event: KeyboardEvent) {
  if (event.key !== 'Escape') return;
  const top = modalStack[modalStack.length - 1];
  if (top?.closeOnEscape()) top.onClose();
}

function registerModal(entry: ModalStackEntry) {
  modalStack.push(entry);

  if (modalStack.length === 1) {
    document.addEventListener('keydown', handleModalKeydown, true);
    window.addEventListener('keydown', handleModalEscape);
    backgroundObserver = new MutationObserver(syncModalEnvironment);
    backgroundObserver.observe(document.body, { childList: true });
  }

  syncModalEnvironment();
  focusInitialElement(entry);

  return () => {
    const index = modalStack.indexOf(entry);
    if (index < 0) return;
    const wasTop = index === modalStack.length - 1;
    modalStack.splice(index, 1);

    if (!wasTop) {
      const currentTop = modalStack[modalStack.length - 1];
      if (currentTop?.returnFocus && entry.overlay.contains(currentTop.returnFocus)) {
        currentTop.returnFocus = entry.returnFocus;
      }
    }

    if (modalStack.length === 0) {
      document.removeEventListener('keydown', handleModalKeydown, true);
      window.removeEventListener('keydown', handleModalEscape);
      backgroundObserver?.disconnect();
      backgroundObserver = null;

      for (const [element, state] of backgroundStates) {
        restoreBackgroundState(element, state);
      }
      backgroundStates.clear();
    } else {
      syncModalEnvironment();
    }

    if (!wasTop) return;
    if (focusElement(entry.returnFocus)) return;

    const nextTop = modalStack[modalStack.length - 1];
    if (nextTop) focusInitialElement(nextTop);
  };
}

export function useModalLifecycle<T extends HTMLElement>(
  open: boolean,
  overlayRef: RefObject<T | null>,
  onClose: () => void,
  closeOnEscape = false,
) {
  const onCloseRef = useRef(onClose);
  const closeOnEscapeRef = useRef(closeOnEscape);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const wasOpenRef = useRef(false);

  onCloseRef.current = onClose;
  closeOnEscapeRef.current = closeOnEscape;

  if (open && !wasOpenRef.current) {
    returnFocusRef.current = typeof document === 'undefined' || !(document.activeElement instanceof HTMLElement)
      ? null
      : document.activeElement;
    wasOpenRef.current = true;
  } else if (!open) {
    wasOpenRef.current = false;
  }

  useLayoutEffect(() => {
    if (!open || !overlayRef.current) return undefined;
    return registerModal({
      overlay: overlayRef.current,
      returnFocus: returnFocusRef.current,
      onClose: () => onCloseRef.current(),
      closeOnEscape: () => closeOnEscapeRef.current,
    });
  }, [open, overlayRef]);
}
