# Design

## Context

The file viewer already keeps a stack of screens: `fileViewer` in `web/src/fileViewer.ts` holds `{ origin, stack: FileScreen[] }`, `pushFileScreen` adds a screen and `fileViewerBack` drops the top one (or closes the viewer from the last). `web/src/backButton.ts` counts each screen as a layer of the phone's back button and closes it with `fileViewerBack`. That part already behaves as a stack.

The rendering does not. `FileViewerSheet` in `web/src/components/Files.tsx` renders only the top screen, so pushing a diff unmounts `ChangesView` and popping it mounts a new one. The new `ChangesView` runs its `load()` effect (a new `/api/git/changes` request and «Cargando…» while it lasts) and starts at scroll 0. The filter, tab and branch survive only because they live in module-level signals. Every screen passes `onClose={close}`, which sets `fileViewer` to `null`, so Escape, a tap outside or a drag on a diff close the whole viewer instead of going back.

Every file-viewer sheet has the `file-sheet` class, which gives it the same fixed size on each layout (`min(960px, 92vw)` × `min(85vh, 820px)` on a wide screen, `88dvh` on the phone), so a sheet stacked over another covers it exactly.

`Sheet` (`web/src/components/Sheet.tsx`) renders its own `.sheet-backdrop`. Its Escape handler acts only when its backdrop is the last `.sheet-backdrop` in the document. Its drag-to-close fades the backdrop's colour inline while the sheet is dragged.

## Goals / Non-Goals

**Goals:**

- Keep every screen below the top one mounted, so its component state, its DOM and its scroll position survive.
- Make every way of closing the top sheet go back one screen.
- Look and feel like one sheet replaced by another: one level of shade, no change of size.

**Non-Goals:**

- Changing the stack model in `fileViewer.ts` or the back button's layers.
- Changing `Sheet` for the other sheets of the panel.

## Decisions

### D1. Every screen of the stack is rendered, the top one last

`FileViewerSheet` renders one component per entry of `fileViewer.value.stack`, in order, each keyed by its index, its kind and, for a diff or a file, its path (`${i}:diff:${path}`), so a different file at the same depth is a new component. Preact keeps the components at indices that did not change, so popping the top one leaves the ones below mounted with their state, and pushing a new one mounts only that one. The top one comes last in the document, which keeps `Sheet`'s Escape rule (the last backdrop closes) pointing at it.

Alternative considered: keep rendering only the top screen and lift the list's data and scroll into signals, restoring the scroll by hand on mount. Rejected: it duplicates state the component already has, restoring a scroll needs the list rendered at its full height first, and «Ver el fichero» over a diff would need the same treatment for the diff.

### D2. Every sheet's `onClose` goes back one screen

Each screen gets `fileViewerBack` as its `onClose`, the same function as its «Atrás» and the back button's `closeTop`. On the only screen left, `fileViewerBack` closes the viewer, which is today's behaviour for a single sheet. The «Atrás» button stays on stacked sheets, with its label, for a visible way back.

### D3. A stacked sheet has a transparent backdrop and the ones below are inert

`Sheet` gets an optional `stacked` flag. A stacked sheet's backdrop gets the class `stacked`, whose background is transparent, and its drag-to-close leaves the backdrop's colour alone, so the shade stays the one of the bottom sheet's backdrop. The stacked backdrop still covers the page, so a tap outside the top sheet lands on it and closes that sheet only.

Each screen that is not on top is rendered with `inert` on its backdrop: the browser takes it out of the focus order, of pointer input and of the accessibility tree, and gives it back when it is on top again. Its DOM, scroll position included, is untouched.

Alternative considered: hide the sheets below with `display: none`. Rejected: an element with `display: none` loses its scroll position in browsers. `visibility: hidden` would keep it, but the list would vanish under the rising diff instead of being covered by it.

### D4. The check is manual, in a browser

The `web` layer has no test runner and the behaviour is the DOM's (mounted components, scroll, focus, `inert`), not pure logic that could move to `shared/`. The change is checked by hand against a hub with its own `TMUX_TMPDIR` and no `TMUX`, on a phone-sized and a wide viewport, following each scenario of the `file-viewer` spec, and the network panel shows no second `/api/git/changes` request when going back.

## Risks / Trade-offs

- [The sheets below stay in memory: a long list, a diff of up to its full size and a file of up to 2 MB at once] → At most three screens deep from «Ficheros cambiados», each already bounded (`MAX_LINES`, `TEXT_MAX`); they are freed when the viewer closes.
- [A list left mounted is not refreshed: a file committed while the user reads its diff still shows] → Agreed with the owner; «Volver a mirar» refreshes it.
- [Escape, a tap outside or a drag on a diff no longer close the whole viewer] → Agreed with the owner: it is the purpose of the change. Several presses close it.
- [`inert` support] → Supported by every current browser the panel targets (Chrome, Safari, Firefox since 2023).

## Migration Plan

None: a front-end change with no stored data. It deploys with the panel; rolling back is reverting the commit.
