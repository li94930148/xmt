import type { Transaction } from '@tiptap/pm/state';
import { ySyncPluginKey } from 'y-prosemirror';

/** Yjs applies another collaborator's update as a ProseMirror transaction too. */
export function isLocalEditorChange(transaction: Transaction, collaborative: boolean): boolean {
  return !collaborative || !transaction.getMeta(ySyncPluginKey)?.isChangeOrigin;
}
