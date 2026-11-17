# Proposal

GitHub issue: [Issue #39](https://github.com/SantiagoSchez/tmux-web-bridge/issues/39).

## Why

In the «Ficheros cambiados» modal, tapping a file replaces the list with the file's diff inside the same sheet. Going back mounts the list again: it asks the hub for the changes once more, shows «Cargando…» and loses its scroll position, so with a long list the user has to find their place again after every diff.

## What Changes

- Each screen of the file viewer (the changed files, a diff, a file) opens in a sheet of its own, stacked over the one it was opened from. The sheets below stay mounted, untouched: their content, their scroll and their filter are kept, and nothing is fetched again.
- Tapping a file in «Ficheros cambiados» stacks its diff over the list; «Ver el fichero» in a diff stacks the file over the diff.
- Closing the sheet on top by any means (its «Atrás», Escape, a tap outside it, dragging it down on the phone, the phone's back button) closes only that sheet and shows the one below as it was. Closing the last one closes the viewer. **BREAKING** for the user's habits only: today Escape, a tap outside or a drag on a diff close the whole viewer; after this change they go back one screen.
- The list does not reload on its own when the user comes back to it; «Volver a mirar» stays the way to refresh it.
- Only the sheet on top dims the page: stacked sheets add no extra shade, and the sheets below cannot be reached with the keyboard or a screen reader while covered.

## Capabilities

### New Capabilities

- `file-viewer`: the panel's file viewer (a file, the changed files of a window's repository and a file's diff) and how its screens open over each other and close.

### Modified Capabilities

None. The `worktree-base` requirement «The picked branch lasts while the modal is open» still holds, now because the list is never unmounted.

## Impact

- Layers: `web` only (`web/src/components/Files.tsx`, `web/src/components/Sheet.tsx`, `web/src/styles.css`; `web/src/fileViewer.ts` and `web/src/backButton.ts` keep their stack and its back-button layers as they are).
- No API, payload, shared type, data model or environment variable changes. No external service is touched.
- The hub receives fewer `/api/git/changes` requests: none when the user goes back from a diff.

## Non-goals

- Opening a diff in another browser tab or window.
- Reloading the list in the background when the user goes back to it.
- Changing what the list, a diff or a file show, or the other sheets of the panel (settings, Trello, dialogs).
