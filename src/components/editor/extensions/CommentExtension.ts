/**
 * 批注 Mark 扩展（增强版）
 * 支持新增/编辑/删除批注，批注显示在文字后方
 */
import { Mark, mergeAttributes } from '@tiptap/core';

export interface CommentOptions {
  HTMLAttributes: Record<string, unknown>;
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    comment: {
      setComment: (commentId: string, commentText: string, createdAt: string) => ReturnType;
      updateComment: (commentId: string, newText: string) => ReturnType;
      removeComment: (commentId: string) => ReturnType;
      unsetComment: () => ReturnType;
    };
  }
}

export const CommentExtension = Mark.create<CommentOptions>({
  name: 'comment',

  addOptions() {
    return { HTMLAttributes: {} };
  },

  addAttributes() {
    return {
      commentId: {
        default: null,
        parseHTML: (el) => el.getAttribute('data-comment-id'),
        renderHTML: (attrs) => attrs.commentId ? { 'data-comment-id': attrs.commentId } : {},
      },
      commentText: {
        default: null,
        parseHTML: (el) => el.getAttribute('data-comment-text'),
        renderHTML: (attrs) => attrs.commentText ? { 'data-comment-text': attrs.commentText } : {},
      },
      createdAt: {
        default: null,
        parseHTML: (el) => el.getAttribute('data-created-at'),
        renderHTML: (attrs) => attrs.createdAt ? { 'data-created-at': attrs.createdAt } : {},
      },
    };
  },

  parseHTML() {
    return [{ tag: 'span[data-comment-id]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'span',
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
        class: 'comment-mark',
        style: 'background-color: #fef3c7; border-bottom: 2px solid #f59e0b; cursor: help;',
      }),
      0,
    ];
  },

  addCommands() {
    return {
      setComment:
        (commentId: string, commentText: string, createdAt: string) =>
        ({ commands }) => {
          return commands.setMark(this.name, { commentId, commentText, createdAt });
        },
      updateComment:
        (commentId: string, newText: string) =>
        ({ tr, state }) => {
          let found = false;
          state.doc.descendants((node, pos) => {
            if (found) return false;
            node.marks.forEach((mark) => {
              if (mark.type.name === this.name && mark.attrs.commentId === commentId) {
                tr.addMark(
                  pos,
                  pos + node.nodeSize,
                  mark.type.create({ ...mark.attrs, commentText: newText })
                );
                found = true;
              }
            });
          });
          return found;
        },
      removeComment:
        (commentId: string) =>
        ({ tr, state }) => {
          let found = false;
          state.doc.descendants((node, pos) => {
            if (found) return false;
            node.marks.forEach((mark) => {
              if (mark.type.name === this.name && mark.attrs.commentId === commentId) {
                tr.removeMark(pos, pos + node.nodeSize, mark.type);
                found = true;
              }
            });
          });
          return found;
        },
      unsetComment:
        () =>
        ({ commands }) => {
          return commands.unsetMark(this.name);
        },
    };
  },
});
