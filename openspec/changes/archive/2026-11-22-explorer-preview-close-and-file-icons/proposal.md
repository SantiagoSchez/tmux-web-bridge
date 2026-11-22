# Proposal

GitHub issue: [#79](https://github.com/SantiagoSchez/tmux-web-bridge/issues/79).

## Why

The file explorer added by PR #77 shows the preview of the selected file until the user moves to another folder: there is no way to close it and give the list its space back, which on the phone leaves half the screen to a file the user no longer wants. Its files also have no icon (only the folders have one), so a folder of mixed files reads as one block of names, and «Ficheros cambiados» has the same problem.

## What Changes

- The explorer's preview gets a ✕ button next to «Abrir» that closes it; tapping the selected file again closes it too. With the preview closed the list takes the whole explorer.
- With a preview open, the phone's back button and Escape close the preview first; the next press closes the explorer screen (or the folder picker) as today. A tap outside the sheet, dragging it down and its «Atrás» still close the whole screen.
- Every file of the explorer's list (in the file viewer and in the folder pickers of Ajustes › Carpetas and «Nueva carpeta») and every row of «Ficheros cambiados» shows a line icon of its type: image, video, audio, PDF, Markdown, code, archive, or a generic file. In «Ficheros cambiados» it goes between the git status letter and the name.
- The extension lists that decide a file's kind move to one shared module, used by the viewer's `fileKind` and by the icons, and tested from `server`.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `file-explorer`: the preview can be closed (new requirement); the back button and Escape close an open preview before the screen or the picker (modified «The explorer goes back one screen at a time» and «The folder pickers browse with the explorer»); each file shows its type's icon (new requirement).
- `file-viewer`: the back button and Escape on an explorer with its preview open close the preview first (modified «Closing the sheet on top goes back one screen»); each changed file shows its type's icon (new requirement).

## Non-goals

- Icons for files outside the explorer and «Ficheros cambiados» (the terminal's links, the hover preview, the viewer's title).
- Telling a file's type by its content: the icon follows the name's extension only, as the viewer already does.
- Remembering a closed or open preview across folders or sessions.
- Any change to the server, the `/api/dir` listing or any payload.

## Impact

- Layers: `web` (`web/src/components/Explorer.tsx`, `Files.tsx`, `icons.tsx`, `Folders.tsx`, `Dialogs.tsx`, `web/src/backButton.ts`, `web/src/fileViewer.ts`, `web/src/styles.css`) and `server`'s `shared/` folder for the pure classification module, with its tests under `server/src/`.
- No API, payload, data model, environment variable or external service changes.
