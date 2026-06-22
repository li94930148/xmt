import { Extension } from '@tiptap/core';
import { yCursorPlugin, ySyncPlugin, yUndoPlugin } from 'y-prosemirror';
import type { Awareness } from 'y-protocols/awareness';
import type * as Y from 'yjs';
export { editorExtensions } from '../../components/editor/extensions/editorExtensions';

export interface TiptapCollaborationOptions {
  fragment: Y.XmlFragment;
  awareness: Awareness;
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
          cursor.append(label);

          return cursor;
        },
      }),
      yUndoPlugin(),
    ];
  },
});
