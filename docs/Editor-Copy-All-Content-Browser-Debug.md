# Editor Copy All Content Browser Debug

## Scope

This investigation and fix change only `src/components/editor/Editor.tsx`. Runtime, autosave, Yjs, Socket.IO, SaveStrategy, and page components remain untouched.

## Real browser reproduction

Production Runtime Editor was opened at `http://127.0.0.1:5174/production/85` and the visible `复制全文` button was clicked through the browser UI.

### Environment evidence

| Check | Result |
| --- | --- |
| `location.origin` | `http://127.0.0.1:5174` |
| `window.isSecureContext` | `true` (loopback is treated as trustworthy) |
| `navigator.clipboard` | present |
| `typeof navigator.clipboard.write` | `function` |
| `typeof navigator.clipboard.writeText` | `function` |
| `typeof ClipboardItem` | `function` |

### Actual user-gesture results

1. A normal UI click called `navigator.clipboard.write()` once and it resolved once.
2. It did not call `writeText()` on that path.
3. The button changed to `已复制` and no copy-specific console exception was produced.
4. When `clipboard.write()` was intentionally made to reject, the same real click called `writeText()` once and it resolved once.

This verifies that the Clipboard APIs run inside the actual click user gesture, not from an asynchronous/background invocation.

## Root cause

The current loopback development origin cannot reproduce the reported failure: it is a secure context and supports `ClipboardItem` rich copying.

The original fallback was incomplete for an ordinary HTTP origin that is not loopback. In that environment browsers may omit `navigator.clipboard` entirely; attempting `navigator.clipboard.writeText()` then also fails and the UI reaches `复制失败`.

## Fix

The copy flow is now:

1. `ClipboardItem` with both `text/plain` and `text/html`.
2. `navigator.clipboard.writeText(plainText)` if rich copy is unavailable or rejected.
3. A temporary, hidden textarea plus `document.execCommand('copy')` if the Clipboard API is absent or rejected.

The fallback still derives content only from Tiptap:

- `editor.getText({ blockSeparator: '\n\n' })`
- `editor.getHTML()`

It never reads the editor DOM. The temporary textarea is only a browser compatibility transport for the already-produced plain text.

## HTTP fallback validation

In the real Production click, both modern clipboard methods were deliberately forced to reject. The resulting evidence was:

```text
clipboard.write calls:     1
clipboard.writeText calls: 1
legacy execCommand calls:  1
button state:              已复制
```

This confirms the final plain-text fallback executes in a real user gesture and prevents the ordinary HTTP/no-Clipboard-API case from showing `复制失败`.

## Console notes

No copy-specific browser error was emitted. During Vite hot reload, the pre-existing Editor word-count lifecycle error (`Editor.getText()` after a null schema) appeared in the console; it is unrelated to the copy click and is outside this narrowly scoped Clipboard compatibility fix.

## Validation

- `npm run check` passed (`tsc --noEmit`).
- Production normal rich-copy path, forced `writeText()` fallback, and forced legacy fallback were browser-verified.
