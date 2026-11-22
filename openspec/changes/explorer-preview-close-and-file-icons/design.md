# Design

## Context

The explorer (`web/src/components/Explorer.tsx`) keeps the selected file in `useExplorer`'s `selected` state and renders `Preview` while it is set; only `go()` clears it. It appears in two kinds of places: as a screen of the file viewer's stack (`ExplorerView`, rendered by `Files.tsx` for a `{ kind: 'dir' }` screen), and embedded in two dialogs, the folder pickers `FolderPicker` (`Folders.tsx`, opened through `dialog.value`) and `NewFolderWhere` (`Dialogs.tsx`).

Two mechanisms close what is on top, and the preview has to enter both:

- **The phone's back button** (`web/src/backButton.ts`). `layers()` counts the open layers; an effect pushes one history entry per new layer while the tap that opened it still counts as the user's; `popstate` calls `closeTop()` until the count matches the depth. `closeTop()` decides what is on top: the file viewer over a dialog, a dialog, the palette, the file viewer, the settings section, a sheet, the scratchpads, the drawer.
- **Escape**: each `Sheet` listens on `window` and closes itself when its backdrop is the last `.sheet-backdrop` in the document.

The file kind regexes (`IMAGE`, `MARKDOWN`, `PDF`, `VIDEO`, `AUDIO`) and `fileKind` live in `web/src/components/Files.tsx`, where no test reaches them.

## Goals / Non-Goals

**Goals:**

- The back button and Escape close an open preview before the screen or dialog that holds it, with the history entries staying consistent (no press that does nothing, no press that skips a layer).
- One place decides a file's kind by its name, for the viewer and for the icons.

**Non-Goals:**

- Changing how the other layers close, or how the sheet's own gestures (tap outside, drag, «Atrás») behave.

## Decisions

### D1. An open preview is a layer of the back button, owned by the screen or dialog that shows it

`web/src/fileViewer.ts`, which `backButton.ts` already imports and which must not import components, gets a signal of the open previews: `explorerPreviews = signal<{ owner: unknown; close: () => void }[]>` (`unknown`, since one owner is a string), with `closeExplorerPreview(preview)` beside it. The owner is the value that identifies the layer holding the explorer: the `FileScreen` of an explorer screen (the stack entry itself), the dialog value (`dialog.value`) of «Nueva carpeta», and the sheet value (`'settings'`) of Ajustes › Carpetas, whose picker is part of the settings sheet, not a dialog. `useExplorer` takes that owner and, while a file is selected, registers `{ owner, close }` in a layout effect keyed on whether there is a selection (so moving from one file to another does not re-register) and removes it on clean-up (deselecting, moving to another folder, unmounting).

`layers()` adds `explorerPreviews.value.length`, so opening a preview pushes a history entry from the tap that opened it, as the other layers do. `closeTop()` first finds the owner of what is on top, in the order it already uses: the top screen when the viewer is over a dialog, else the dialog, else nothing while the palette is open, else the viewer's top screen, else the sheet. When a preview has that owner, it removes it from `explorerPreviews` at once and calls its `close`; otherwise it goes on as today. The removal has to be synchronous: `popstate` calls `closeTop()` while `layers()` is above the depth, and the explorer's clean-up runs only after the next render, so a preview left in the list would be closed again in a loop.

Consequences: «Abrir» over a preview pushes a file screen above it, so going back from the file shows the explorer with its preview (one layer less), the next press closes the preview, and the next the explorer, as the spec's scenario says. Closing the preview with ✕ or by tapping the file again leaves a stale entry, which `backButton.ts` already handles (the next press goes back once more).

Alternatives: a flag on `fileViewer` would not cover the pickers, which are dialogs; making the preview a `FileScreen` of its own would put it on the stack and change how the viewer renders its sheets, for something that lives inside one sheet.

### D2. Escape closes the preview from a capture listener of the explorer

While a file is selected, the explorer adds a `keydown` listener on `window` in the capture phase. On Escape, when the explorer's own `.sheet-backdrop` is the last one in the document (the same test `Sheet` uses) and is not inert, it deselects the file and calls `stopImmediatePropagation()`, so the `Sheet`'s own Escape listener, which runs later in the bubble phase on `window`, does not close the screen or the dialog. With no file selected the listener is not there, and Escape behaves as today.

Alternative: routing Escape through `closeTop()` would change how every sheet closes with Escape; `Sheet` stays generic.

### D3. The ✕ and the second tap deselect; focus goes back to the file's row

The preview's header gets an icon button with `IconClose` and the accessible name «Cerrar la vista previa», after «Abrir». It and a click on the row of the selected file call `setSelected(null)`. Closing it from the ✕, or with Escape or back, moves the focus to the file's row in the list, so a keyboard or screen reader user stays where they were (the ✕ that had the focus is gone). The list's layout already fills the explorer when there is no preview (`has-preview` is only set with one), so no style change is needed for that.

### D4. One shared module classifies a file by its name

`shared/file-types.ts` exports `fileType(name)`: `'image' | 'video' | 'audio' | 'pdf' | 'markdown' | 'code' | 'archive' | 'file'`, by the name's extension, ignoring case. It holds the extension lists that today sit in `Files.tsx`, unchanged, plus two new ones:

- **code**: `ts tsx js jsx mjs cjs py rb go rs java kt kts swift c h cc cpp hpp cs php sh bash zsh fish ps1 lua pl r scala sql html htm css scss sass less vue svelte json jsonc yaml yml toml xml ini conf`, and the names `Dockerfile` and `Makefile`;
- **archive**: `zip tar gz tgz bz2 xz zst 7z rar`, so `backup.tar.gz` is an archive.

`fileKind` in `Files.tsx` (what the viewer does with a file: show it as an image, a PDF, a video, sound, Markdown or text) is rewritten over `fileType`, mapping `code`, `archive` and `file` to `'text'`, as they are today. Tests in `server/src/file-types.test.ts` cover every kind, the case, a name with no extension, a double extension and a dotfile (`.env` is a generic file).

Alternative: keeping the regexes in `Files.tsx` and adding the new ones there leaves the classification untested, which the web standards ask to avoid by putting pure logic in `shared/`.

### D5. Eight line icons and one component that picks them

`web/src/components/icons.tsx` gets eight icons drawn on the same 24-unit grid and stroke as the others, built on the page outline of `IconFileDiff`: a generic file, an image (a mountain and sun), a video (a play triangle), audio (a note), PDF (the letters «PDF» are too small at 18 px, so a page with a folded corner and a band), Markdown (a down arrow with «M»), code (`</>`), and an archive (a zipper). `FileTypeIcon({ name })` picks one with `fileType`. The explorer's file rows put it in their empty `menu-icon` slot; the rows of «Ficheros cambiados» put a `menu-icon` span with it between the `git-badge` and the name.

## Risks / Trade-offs

- [The back button's count and its history entries drift if a preview registers twice or never unregisters] → The registration lives in one effect keyed on `selected` and the owner, with its clean-up; a test of the explorer by hand checks back from a file, from a preview and from a picker.
- [The owner of «Nueva carpeta» is the dialog value; a dialog replaced by another with the same kind is a new object] → The picker remounts with the new dialog, so its preview unregisters and nothing is left owned by the old one.
- [The owner of Ajustes › Carpetas is the string `'settings'`, the same for any section] → Only the folders section embeds an explorer, and its picker unmounts with the section, taking its preview with it.
- [Escape in the filter field] → The capture listener closes the preview first even when the filter has the focus; a second Escape then closes the screen. This matches the spec: Escape closes the preview first wherever the focus is inside the explorer.
- [An extension list misses a common type] → It falls back to the generic icon; the lists are data in one module, easy to extend.
