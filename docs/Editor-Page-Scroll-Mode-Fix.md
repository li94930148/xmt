# Editor Page Scroll Mode Fix

## Goal

Replace the temporary internal Tiptap scroll-container model with page-level vertical scrolling. Rich-text content now grows naturally with the page; the application page scroll surface, rather than the editor body, owns wheel scrolling.

## Changes

### Shared Editor

`src/components/editor/Editor.tsx`

- Removed the viewport-bounded immersive height and the editor-body `overflow-y:auto` path.
- Removed the `editor-scroll` container and its independent scroll responsibility.
- `editor-shell` now grows with ProseMirror content using natural layout (`overflow: visible`).
- Removed the TOC panel's independent vertical scrolling so it also contributes to page height.
- Kept the fullscreen overlay behavior unchanged; no Runtime, persistence, collaboration, or editor extension code changed.

### Shooting page container

`src/pages/ShootingDetail.tsx`

- Removed the page-local `height: calc(100vh - 96px)` constraint.
- Removed the editor main column's `overflow-hidden` clipping.
- Removed the sidebar's independent vertical scrolling so the Shooting page can grow naturally.

### Page audit

| Page | Finding | Action |
| --- | --- | --- |
| ProductionDetail | The editor's containing panel has no fixed/max height. Its separate header `GlassPanel` uses `overflow-hidden`, but it is not an ancestor of the editor. | No change required. |
| ShootingDetail | Fixed viewport height plus `overflow-hidden` on the editor main column clipped long document growth. | Removed. |
| TopicDetail | Runtime/manual editor is in normal document flow; no fixed height, max-height, or clipping ancestor is present. | No change required. |

## Long-text safety retained

The shared `.editor-content` / ProseMirror styles in `src/index.css` remain in place:

- `min-width: 0`
- `max-width: 100%`
- `overflow-wrap: anywhere`
- `word-break: break-word`

This prevents horizontal expansion for continuous characters, long English tokens, and URLs while allowing the document to grow vertically.

## Browser verification

| Surface | Scenario | Result |
| --- | --- | --- |
| Production 85 | Existing long content with continuous `x` text | No `.editor-scroll` element; editor shell is 1942px tall with visible overflow. The application page scroll host is 720px / 2410px. Wheel input over the editor moved page scroll `0 -> 700`; no editor-level scroll container exists. |
| Production 85 | Long-token width | Editor content `scrollWidth === clientWidth` (657px), so the right-side panel is not widened. |
| Shooting 35 | Chinese text, long English token, 2700 continuous `x` characters, long URL, and large pasted paragraphs | No `.editor-scroll`; editor shell grew to 4898px and the page scroll host grew to 5216px. Wheel input over the editor moved page scroll `4406 -> 3506 -> 4206`; no editor-level vertical scroll container exists. |
| Shooting 35 | Autosave/regression | The long-content marker persisted after refresh through the existing `script_content` autosave path. The test fixture was then restored through normal editor/autosave and verified after refresh. |

## Validation

- `npm run check` passed (`tsc --noEmit`).
- `git diff --check` passed.
- No Runtime, Autosave, Yjs, Socket.IO, SaveStrategy, API, or data-structure code was modified.

## Result

Long rich-text documents now use the page's normal vertical scroll experience. The editor has no independent content scrollbar, while long unbroken strings remain safely wrapped inside the available width.
