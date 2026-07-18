# Editor Copy All Content Feature

## Scope

Added a shared “复制全文” action only in `src/components/editor/Editor.tsx`. Runtime, autosave, Yjs, Socket.IO, save strategies, page components, and persisted data were not changed.

## Behavior

The toolbar action reads only from the Tiptap editor instance:

```ts
const plainText = editor.getText({ blockSeparator: '\n\n' });
const html = editor.getHTML();
```

It writes both MIME representations using the system Clipboard API:

- `text/plain`: block-separated plain text for text editors.
- `text/html`: serialized Tiptap HTML for rich-text targets such as Word and WeChat.

It does not read editor content from the DOM. If a browser does not expose the multi-MIME Clipboard API, it degrades to `writeText(plainText)` rather than failing the copy action.

## UI

- Button label: `复制全文`.
- On successful copy: `已复制`.
- On failure: `复制失败`.
- The status returns to `复制全文` after approximately two seconds.

## Browser verification

| Editor surface | Result |
| --- | --- |
| Production Runtime Editor (85) | Button appears once; click changes its label to `已复制`. |
| Shooting Runtime Editor (35) | Button appears once; click changes its label to `已复制`. |
| Topic Runtime Editor (99, outline edit mode) | Button appears once; click changes its label to `已复制`, then returns to `复制全文` after 2.1 seconds. |

The browser test clipboard adapter exposes `text/plain` metadata only; it does not expose the browser's `text/html` entry for inspection. The implementation nevertheless invokes `ClipboardItem` with both required MIME types in the user-gesture click handler. Its output is therefore compatible with rich and plain paste destinations; final destination-specific paste behavior should be smoke-tested in the target installed Word/WeChat clients during release validation.

## Validation

- `npm run check` passed (`tsc --noEmit`).
- No production, shooting, or topic document content was changed during copy verification.
