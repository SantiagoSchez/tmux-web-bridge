# Proposal

GitHub issue: [Issue #76](https://github.com/SantiagoSchez/tmux-web-bridge/issues/76).

## Why

The paths an agent writes in the panel's terminal are often impossible to open with a tap on the phone. Markdown links that Claude Code shows as OSC 8 hyperlinks (visible text such as `INDICE.md` or a table cell, with the path hidden) go to `window.open`, which cannot reach a file of the machine. Folder paths are never links. Names relative to a folder written earlier are not found, and a path broken anywhere but at the terminal's edge is lost. There is also no way to browse a machine's files from the panel: the only folder browser lists folders, for picking one.

## What Changes

- An OSC 8 hyperlink whose target is a file of the machine (`file://…`, `/…`, `~/…`, or a relative path with no scheme) opens in the panel's file viewer, resolved against the pane under the link. Web targets (`http:`, `https:`) keep opening in a new tab.
- Folder paths in the terminal become links (`~/videos/render/`, `fotogramas/`, also followed by `:`). Tapping one opens the file explorer in that folder. A path the viewer opens that turns out to be a folder opens the explorer too.
- A new file explorer, a screen of the file viewer's stack: the folders and files of the machine with each file's size, a name filter, «Mostrar ocultos», free navigation up to `/`. The selected file's preview sits to the right on a wide screen and below the list on the phone, with «Abrir» to open the whole file over the explorer.
- A folder button in each window's header, next to «Ficheros cambiados», opens the explorer in the folder of the window's pane, in a repository or not.
- Ajustes › Carpetas and «Nueva carpeta» browse with the same explorer, files and preview included; their button still picks the folder shown. The folder-only browser is removed.
- The host kit tells every Claude Code session it starts in tmux to write each path it gives the user as a Markdown link with an absolute target, so the terminal always gets it as a whole link however the line wraps.
- Each change's task count shows the share of tasks done next to it, «☑ 7/23 (30 %)», wherever the panel shows it: the window header, the detailed list, the «Pendientes» cards and the tooltip. Asked by the owner during this change.
- **BREAKING** (internal contract): the `listDirs` tree action is replaced by a REST endpoint that lists a folder's folders and files, resolving relative paths like `/api/files`. Hub and panel ship together; nothing outside the repository uses it.

## Capabilities

### New Capabilities

- `file-explorer`: browsing a machine's folders and files in the panel: the explorer screen, its preview and filter, where it opens from (folder links, the window header, a folder opened as a file) and the folder pickers that use it.

### Modified Capabilities

- `change-progress`: the task count carries its percentage in the list row, the cards and the window header.
- `window-details`: the tooltip's change line carries the percentage too.
- `terminal-links`: OSC 8 hyperlinks to files open in the viewer; folder paths are links that open the explorer; the host kit asks Claude Code for paths as Markdown links with absolute targets.

## Impact

- Layers: `web` (terminal links, the explorer, the window header, the folder pickers), `server` and `shared` (the folder listing endpoint, folder detection in `shared/paths.ts`, the shared types, the task percentage in `shared/change-progress.ts`), `host-kit` (a SessionStart hook output in `host-kit/tmux-window-title.sh` and `host-kit/claude-hooks.json`).
- Contracts: new `GET /api/dir` with its result type in `shared/types.ts` (`DirListing` gains the files and their sizes); the `listDirs` `ActionOp` is removed; `/api/files` answers a folder with an error body that names it, so the viewer can switch to the explorer.
- External services: none. The kit change reaches each machine at the next release, through «Actualizar».
- Claude Code: every session started in a tmux pane on a machine with the kit gets one more instruction as session context.

## Non-goals

- Editing, renaming, moving or deleting files from the explorer.
- Uploading files through the explorer (the terminal's attach button stays the way to upload).
- Reading paths from Claude Code's transcript instead of the screen.
- Joining paths broken by wrapping inside table cells or by overlays drawn over the terminal: the kit's instruction makes those arrive as OSC 8 links instead.
