import type { EditorState, Transaction } from '@tiptap/pm/state';
import type { Mark, Node as ProseMirrorNode } from '@tiptap/pm/model';

export type FormatPainterMode = 'idle' | 'single' | 'persistent';

export interface FormatSnapshot {
  marks: Mark[];
  block: {
    type: string;
    attrs: Record<string, unknown>;
  } | null;
}

const PRESENTATIONAL_MARKS = new Set(['bold', 'italic', 'underline', 'strike', 'textStyle', 'highlight']);
const TEXT_BLOCKS = new Set(['paragraph', 'heading']);

function findTextBlock($pos: EditorState['selection']['$from']): { pos: number; node: ProseMirrorNode } | null {
  for (let depth = $pos.depth; depth > 0; depth -= 1) {
    const node = $pos.node(depth);
    if (TEXT_BLOCKS.has(node.type.name)) return { pos: $pos.before(depth), node };
  }
  return null;
}

function sourceMarks(state: EditorState): Mark[] {
  const { from, to, $from } = state.selection;
  let marks: readonly Mark[] | null = null;

  if (from !== to) {
    state.doc.nodesBetween(from, to, (node) => {
      if (!node.isText || marks) return false;
      marks = node.marks;
      return false;
    });
  }

  return (marks || $from.marks()).filter((mark) => PRESENTATIONAL_MARKS.has(mark.type.name));
}

/** Captures only presentation data, never link/comment or application metadata. */
export function captureFormatSnapshot(state: EditorState): FormatSnapshot | null {
  const block = findTextBlock(state.selection.$from);
  if (!block) return null;

  return {
    marks: sourceMarks(state),
    block: {
      type: block.node.type.name,
      attrs: { ...block.node.attrs },
    },
  };
}

function targetTextBlocks(state: EditorState): Array<{ pos: number; node: ProseMirrorNode }> {
  const { from, to, $from } = state.selection;
  const blocks: Array<{ pos: number; node: ProseMirrorNode }> = [];
  const seen = new Set<number>();

  state.doc.nodesBetween(from, to, (node, pos) => {
    if (!TEXT_BLOCKS.has(node.type.name) || seen.has(pos)) return;
    seen.add(pos);
    blocks.push({ pos, node });
  });

  if (blocks.length === 0) {
    const block = findTextBlock($from);
    if (block) blocks.push(block);
  }
  return blocks;
}

/**
 * Produces one ordinary ProseMirror transaction for a target text selection.
 * The caller dispatches it once, so each application remains its own undo item.
 */
export function createFormatPainterTransaction(state: EditorState, snapshot: FormatSnapshot): Transaction | null {
  const { from, to } = state.selection;
  if (from === to) return null;

  const tr = state.tr;
  for (const markName of PRESENTATIONAL_MARKS) {
    const markType = state.schema.marks[markName];
    if (markType) tr.removeMark(from, to, markType);
  }
  for (const mark of snapshot.marks) tr.addMark(from, to, mark);

  if (snapshot.block) {
    const targetType = state.schema.nodes[snapshot.block.type];
    if (targetType) {
      for (const { pos } of targetTextBlocks(state).reverse()) {
        tr.setNodeMarkup(pos, targetType, snapshot.block.attrs);
      }
    }
  }

  return tr.docChanged ? tr : null;
}
