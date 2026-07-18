# Editor Scroll Container Fix

## Scope

This change fixes clipping of long rich-text content in the shared Tiptap `Editor` surface. It does not change the Runtime, autosave coordinator, Yjs, Socket.IO, save strategies, API contracts, or persisted data.

## Root cause

The immersive `Editor` path used by both Production and Shooting allowed the editor body to use `overflow: visible` and set the runtime root to `height: auto`. In Shooting, that expanded body was clipped by the page's outer `overflow-hidden` flex item. In Production, it expanded outside the visible application scroll region instead of becoming a local editor scroll area.

## Layout change

`src/components/editor/Editor.tsx` now uses a bounded flex layout:

```text
Editor root
├─ toolbar
└─ editor-shell (flex: 1; min-height: 0; overflow: hidden)
   └─ editor-scroll (flex: 1; min-height: 0; overflow-y: auto)
      └─ ProseMirror
```

- Immersive Production has a viewport-bounded editor height; immersive Shooting inherits its page flex height.
- `editor-scroll` owns vertical scrolling for both paths.
- The Tiptap root now uses `min-height: 100%`, rather than a rigid `height: 100%`.
- Existing shared long-token protection is retained in `src/index.css`: `min-width: 0`, `max-width: 100%`, `overflow-wrap: anywhere`, and `word-break: break-word` for `.editor-content` / `.ProseMirror`.

## Browser verification

| Surface | Input / check | Result |
| --- | --- | --- |
| Production 85 | Existing long content, including a continuous `x` run | `editor-scroll`: 440px viewport / 1965px content; wheel scroll changed editor `scrollTop` 0 -> 700 while page scroll stayed 0. |
| Production 85 | Long unbroken text width | ProseMirror `scrollWidth === clientWidth` (651px); no horizontal expansion. |
| Production 85 | Focus and ArrowDown | Editable focus and a selection range remained available. |
| Shooting 35 | Chinese text, long English token, 2600 continuous `x` characters, long URL, and large pasted paragraphs | `editor-scroll`: 471px viewport / 4361px content; wheel scroll moved the editor from 2950 -> 3650 while page scroll stayed 0. |
| Shooting 35 | Autosave and refresh | Long-content marker persisted after refresh, confirming the existing `script_content` autosave path remained active. |
| Shooting 35 | Fixture restoration | Restored through the normal editor/autosave path; refresh confirmed `D7 Shooting Graceful Dispose Fixture Content` and no long marker. |

## Static verification

- `npm run check` passed (`tsc --noEmit`).
- `git diff --check` passed.

## Observed non-layout console item

During the Production hot-reload cycle, the existing word-count effect logged a transient `Editor.getText()` / null schema error while React recreated the editor tree. The reloaded editor rendered and the scroll checks completed; Shooting emitted no application console error. This task intentionally does not alter Tiptap lifecycle or collaboration code, so the item is recorded rather than changed here.

## Changed behavior

Only the shared editor visual containment and scroll ownership changed. Toolbar, Tiptap extensions, collaboration, cursor synchronization, autosave, and all domain persistence remain on their existing code paths.
