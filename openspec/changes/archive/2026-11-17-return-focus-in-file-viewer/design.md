# Design

## Context

`FileViewerSheet` (`web/src/components/Files.tsx`) renders every screen of `fileViewer.value.stack`, each in a `Sheet`; the ones below the top are `inert`. A screen is opened by `push` (an alias of `pushFileScreen` in `Files.tsx`) from a click handler: a file of the list in `ChangesView`, «Ver el fichero» in `DiffView`. Every way of closing the top sheet calls `fileViewerBack`, which drops the top screen.

When the screen below becomes `inert` (set by `Sheet` in an effect after the render), the browser takes the focus away from any element inside it, so by the time the top screen closes nothing remembers which element had it.

## Goals / Non-Goals

**Goals:**

- Remember, for each screen, the element that had the focus when the screen above it was opened, and focus it again when that screen closes.

**Non-Goals:**

- Focus management when the viewer opens or closes as a whole.
- Changing `Sheet` or `fileViewer.ts`.

## Decisions

### D1. The opener is recorded when the screen is pushed

`push` in `Files.tsx` stores `document.activeElement` in a module-level array indexed by the depth of the screen it is pushed from, then calls `pushFileScreen`. It runs inside the click or Enter handler, before the render that makes that screen `inert` and before the browser takes the focus away. An active element that is `body` (or none) is stored as `null`.

Alternative considered: read the focused element in an effect of `FileViewerSheet` after the stack grows. Rejected: it depends on running before `Sheet`'s `inert` effect, an ordering between sibling effects that nothing guarantees.

### D2. The opener is focused after the render that drops the top screen

`FileViewerSheet` keeps the previous top index in a ref and, in an effect on the top index, when it went down, focuses the opener recorded for the new top with `focus({ preventScroll: true })`, if it is still in the document. Preact runs a parent's effects after its children's, so `Sheet`'s effect has already removed `inert` from the screen below: an `inert` element cannot take the focus. The hooks run before the early return of a closed viewer, as hooks must.

`preventScroll` keeps the list where it is; the element is on screen anyway in the normal case, since the user activated it there.

### D3. The check is manual, in a browser

As for the stacked sheets, the web layer has no test runner and the behaviour is the DOM's (focus, `inert`, scroll). It is checked by hand against an isolated hub, with the keyboard, following each scenario of the delta, and with the old code first to see the focus lost.

## Risks / Trade-offs

- [The element recorded is gone when its screen comes back (the viewer was replaced by `openFile` from the terminal)] → It is checked with `isConnected`, and a replaced stack mounts new components, so a stale element is never in the document.
- [A browser that does not focus buttons on click (Safari)] → `activeElement` is `body`, stored as `null`; nothing is focused, which is the spec's last scenario.
- [The focus ring shows after Escape] → The browser's `:focus-visible` heuristics decide it: after a key it shows, after a click on «Atrás» it does not. That matches what a keyboard user expects.

## Migration Plan

None: a front-end change with no stored data. It deploys with the panel; rolling back is reverting the commit.
