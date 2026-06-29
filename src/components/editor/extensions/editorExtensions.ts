import type { Extensions } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { Paragraph } from '@tiptap/extension-paragraph';
import { Table } from '@tiptap/extension-table';
import { TableRow } from '@tiptap/extension-table-row';
import { TableCell } from '@tiptap/extension-table-cell';
import { TableHeader } from '@tiptap/extension-table-header';
import { Image } from '@tiptap/extension-image';
import { TaskList } from '@tiptap/extension-task-list';
import { TaskItem } from '@tiptap/extension-task-item';
import { Link } from '@tiptap/extension-link';
import { Placeholder } from '@tiptap/extension-placeholder';
import { Underline } from '@tiptap/extension-underline';
import { Highlight } from '@tiptap/extension-highlight';
import { Typography } from '@tiptap/extension-typography';
import { TextAlign } from '@tiptap/extension-text-align';
import { TextStyle } from '@tiptap/extension-text-style';
import { Color } from '@tiptap/extension-color';
import { CommentExtension } from './CommentExtension';

const ParagraphWithIndent = Paragraph.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      textIndent: {
        default: null,
        parseHTML: (element) => {
          const indent = (element as HTMLElement).style.textIndent;
          return indent === '2em' ? '2em' : null;
        },
        renderHTML: (attributes) => {
          if (attributes.textIndent !== '2em') return {};
          return { style: 'text-indent: 2em;' };
        },
      },
    };
  },
});

export function createEditorExtensions(placeholder = '开始编写...'): Extensions {
  return [
    StarterKit.configure({
      heading: { levels: [1, 2, 3, 4, 5, 6] },
      link: false,
      paragraph: false,
      underline: false,
    }),
    ParagraphWithIndent,
    Table.configure({ resizable: true }),
    TableRow,
    TableCell,
    TableHeader,
    Image,
    TaskList,
    TaskItem.configure({ nested: true }),
    Link.configure({ openOnClick: false }),
    Placeholder.configure({ placeholder }),
    Underline,
    Highlight.extend({
      addAttributes() {
        if (!this.options.multicolor) return {};
        return {
          color: {
            default: null,
            parseHTML: (el) => el.getAttribute('data-color'),
            renderHTML: (attrs) => {
              if (!attrs.color) return {};
              return { 'data-color': attrs.color };
            },
          },
        };
      },
    }).configure({ multicolor: true }),
    Typography,
    TextAlign.configure({ types: ['heading', 'paragraph'] }),
    TextStyle,
    Color,
    CommentExtension,
  ];
}

export const editorExtensions = createEditorExtensions();
