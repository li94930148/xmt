import { Extension } from '@tiptap/core';
import { Plugin } from '@tiptap/pm/state';
import { yCursorPlugin, ySyncPlugin, yUndoPlugin } from 'y-prosemirror';
import type { Awareness } from 'y-protocols/awareness';
import type * as Y from 'yjs';
export { editorExtensions } from '../../components/editor/extensions/editorExtensions';

export interface TiptapCollaborationOptions {
  fragment: Y.XmlFragment;
  awareness: Awareness;
}

const ACTIVE_LABEL_MS = 2600;

function remoteCursorLabelPlugin() {
  return new Plugin({
    view(editorView) {
      let positionTimer: ReturnType<typeof setTimeout> | null = null;
      let visibilityTimer: ReturnType<typeof setInterval> | null = null;
      const seen = new WeakSet<Element>();
      const lastPositions = new WeakMap<Element, string>();
      const overflow = document.createElement('div');
      overflow.className = 'xmt-collaboration-cursor-overflow';
      overflow.setAttribute('aria-label', '其他协作者');
      document.body.append(overflow);

      const positionLabels = () => {
        positionTimer = null;
        const editorRect = editorView.dom.getBoundingClientRect();
        editorView.dom.querySelectorAll<HTMLElement>('.xmt-collaboration-cursor-label').forEach((label) => {
          const cursor = label.parentElement;
          if (!cursor) return;
          if (!seen.has(label)) {
            seen.add(label);
            label.dataset.activeUntil = String(Date.now() + ACTIVE_LABEL_MS);
          }
          const cursorRect = cursor.getBoundingClientRect();
          const positionKey = `${Math.round(cursorRect.left)}:${Math.round(cursorRect.top)}`;
          if (lastPositions.get(label) !== positionKey) {
            lastPositions.set(label, positionKey);
            label.dataset.activeUntil = String(Date.now() + ACTIVE_LABEL_MS);
          }
          const labelWidth = label.offsetWidth || 72;
          const leftGutter = editorRect.left - labelWidth - 10;
          const rightGutter = editorRect.right + 10;
          const left = leftGutter >= 8 ? leftGutter : Math.min(rightGutter, window.innerWidth - labelWidth - 8);
          label.style.left = `${Math.max(8, left)}px`;
          label.style.top = `${Math.max(8, cursorRect.top - 1)}px`;
          label.style.visibility = cursorRect.bottom < 0 || cursorRect.top > window.innerHeight ? 'hidden' : 'visible';
        });
        overflow.style.left = `${Math.max(8, Math.min(editorRect.right - 140, window.innerWidth - 148))}px`;
        overflow.style.top = `${Math.max(8, editorRect.top - 34)}px`;
      };
      const schedulePosition = () => {
        if (positionTimer) clearTimeout(positionTimer);
        positionTimer = setTimeout(positionLabels, 80);
      };
      const refreshVisibility = () => {
        const labels = [...editorView.dom.querySelectorAll<HTMLElement>('.xmt-collaboration-cursor-label')].sort((a, b) => Number(b.dataset.activeUntil || 0) - Number(a.dataset.activeUntil || 0));
        const active = labels.filter((label) => Number(label.dataset.activeUntil || 0) > Date.now());
        labels.forEach((label) => label.classList.remove('is-active'));
        active.slice(0, 3).forEach((label) => label.classList.add('is-active'));
        overflow.replaceChildren();
        (labels.length > 3 ? labels.filter((label) => !active.slice(0, 3).includes(label)).slice(0, 6) : []).forEach((label) => {
          const avatar = document.createElement('span');
          avatar.className = 'xmt-collaboration-cursor-avatar';
          avatar.textContent = (label.dataset.remoteName || '协').slice(0, 1);
          avatar.title = label.dataset.remoteName || '协作者';
          avatar.style.backgroundColor = label.dataset.remoteColor || '#3b82f6';
          overflow.append(avatar);
        });
        overflow.classList.toggle('is-visible', overflow.childElementCount > 0);
      };
      const observer = new MutationObserver(() => { schedulePosition(); refreshVisibility(); });
      observer.observe(editorView.dom, { childList: true, subtree: true });
      window.addEventListener('resize', schedulePosition);
      window.addEventListener('scroll', schedulePosition, true);
      visibilityTimer = setInterval(refreshVisibility, 250);
      schedulePosition();
      return {
        update: schedulePosition,
        destroy() {
          observer.disconnect();
          window.removeEventListener('resize', schedulePosition);
          window.removeEventListener('scroll', schedulePosition, true);
          if (positionTimer) clearTimeout(positionTimer);
          if (visibilityTimer) clearInterval(visibilityTimer);
          overflow.remove();
        },
      };
    },
  });
}

export const TiptapCollaboration = Extension.create<TiptapCollaborationOptions>({
  name: 'xmtCollaboration',

  addProseMirrorPlugins() {
    const { fragment, awareness } = this.options;

    return [
      ySyncPlugin(fragment),
      yCursorPlugin(awareness, {
        cursorBuilder: (user) => {
          const cursor = document.createElement('span');
          cursor.classList.add('xmt-collaboration-cursor');
          cursor.style.borderColor = user.color || '#3b82f6';

          const label = document.createElement('span');
          label.classList.add('xmt-collaboration-cursor-label');
          label.style.backgroundColor = user.color || '#3b82f6';
          label.textContent = user.role ? `${user.name || '协作者'} · ${user.role}` : user.name || '协作者';
          label.dataset.remoteName = user.name || '协作者';
          label.dataset.remoteColor = user.color || '#3b82f6';
          cursor.append(label);

          return cursor;
        },
      }),
      remoteCursorLabelPlugin(),
      yUndoPlugin(),
    ];
  },
});
