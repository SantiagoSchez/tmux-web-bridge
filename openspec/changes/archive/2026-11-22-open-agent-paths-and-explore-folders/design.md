# Design

## Context

See proposal.md for the motivation. The pieces this change builds on:

- `web/src/components/TerminalView.tsx` creates the xterm terminal. OSC 8 hyperlinks go through its `linkHandler`, whose `activate` calls `openLink`, a plain `window.open`. File paths found on screen go through `fileLinkProvider` (`web/src/fileLinks.ts`) and the pure detection of `shared/paths.ts`, which rejects any token that ends with `/`. A tap finds links through `linkAt()`, which asks every provider, xterm's own OSC 8 provider included.
- The file viewer (`web/src/components/Files.tsx`, state in `web/src/fileViewer.ts`) is a stack of screens (`FileScreen`: `file`, `changes`, `diff`), each a `Sheet`; the back button counts its screens (`web/src/backButton.ts`).
- `GET /api/files` (`server/src/index.ts`, logic in `server/src/files.ts`) resolves a relative path against the folders of the window's panes, the pane under the link first (`paneFolders`), then searches the repositories (`findInReposScript`). A folder answers 400 «No es un fichero (¿una carpeta?)».
- The folder pickers (Ajustes › Carpetas and «Nueva carpeta») use `useDirBrowser`/`DirBrowser` (`web/src/components/Folders.tsx`), fed by the `listDirs` tree action (`server/src/actions.ts`), which lists folders only and accepts only `/…` or `~/…`.
- The kit registers Claude Code hooks from `host-kit/claude-hooks.json`, all calling `host-kit/tmux-window-title.sh`; `install.sh` and `uninstallScript` (`server/src/kit.ts`) recognise the kit's hooks by that script's name.

## Goals / Non-Goals

**Goals:**

- One explorer component used by the file viewer and both folder pickers.
- One hub endpoint that lists a folder, resolving relative paths exactly as `/api/files` resolves files.
- Path and hyperlink classification as pure logic in `shared/`, tested from `server/src/*.test.ts`.

**Non-Goals:**

- Hover previews for OSC 8 hyperlinks and folder links: only taps and clicks change.
- Searching the repositories for a relative folder (`findInReposScript` stays for files only).

## Decisions

### D1. A REST endpoint `GET /api/dir` replaces the `listDirs` tree action

**Context.** The explorer opened from the terminal needs relative paths resolved against the pane under the link, which `/api/files` already does with `paneFolders`; `listDirs` only takes absolute paths and goes over the websocket.

**Decision.** `GET /api/dir?host&window&pane&path` returns `DirListing` (`shared/types.ts`): `path` (absolute, `~/…` under the home folder), `parent` (null at `/`), `dirs` (names) and `files` (`DirFile[]`: `name` and `size` in bytes). A path starting with `/` or `~` is used as is; a relative one is tried in each folder of `paneFolders`, and the first that is a folder wins. Errors: 400 for an unknown machine or a window with no known folder, 404 «No existe la carpeta <path> en <máquina>». The logic lives in `server/src/files.ts` (`listHostDir`), next to `statHostFile`. The `listDirs` `ActionOp`, its `case` and its test go; its test cases move to `files.test.ts` against the new function.

**Consequences.** The pickers call `api<DirListing>('/api/dir?…')` instead of `hub.action`, and show the failure inline, under the path field, as the explorer does everywhere. Hub and panel ship in the same deploy, so no caller of the old action is left.

**Alternatives.** Extending `listDirs` with files and an origin: the websocket action has no pane-folder resolution and its results are meant for tree changes. Rejected.

### D2. The listing is linear and bounded on the machine, portable across GNU and BSD

The listing script `cd`s into the folder and prints `pwd` and `$HOME`. Then, for each kind, `find -L . -mindepth 1 -maxdepth 1 -type d` (folders, a link to a folder counting as one) and `-type f` (files): the names are sorted with `LC_ALL=C sort -f` and cut with `head -n 2000` on the machine, so the output stays bounded whatever the folder holds, and the count of each kind comes from the same `find` through `wc -l`. Only the 2000 files kept get a size: their names go to `xargs -0` (after `tr '\n' '\0'`), which runs `stat -L -c '%s %n'` when `stat -c %s /` works (GNU), else `stat -L -f '%z %N'` (BSD, macOS), in as few calls as `ARG_MAX` allows. `awk` prefixes each line (`D\t`, `F\t`) and a last line gives both counts. A file whose name holds a newline is dropped (its `stat` fails); a folder whose name holds one is listed under its first line, which then does not open. The cut follows byte order (`LC_ALL=C`), so in a folder with more than 2000 entries of a kind, names starting with an accented letter or a `_` are the ones left out, even though the hub's order would put them earlier; below 2000 the cut changes nothing. The hub sorts what it gets with `localeCompare(…, 'es', { sensitivity: 'base' })` and returns, in `left`, how many entries the cut left out; the explorer says so under the list. Every step is linear in the folder's size: the first version gathered the files with `set -- "$@" "$e"`, which copies the list on every file, so a folder of 16 000 files took 17 s, over the 15 s script timeout, and the 2000-entry cap only applied in the hub after the whole output arrived (found by the adversarial review). A test lists 20 000 real files through a `stat` that counts its calls: a few calls, naming only the 2000 files kept, and a listing of 20 000 files costs less than 40 times one of 2000 (a ratio, not a time budget, which the testing standards refuse; the quadratic script cost about 100 times). A `wc -c` per file was rejected: one process per file is seconds over SSH for a large folder.

### D3. A folder answered by `/api/files` names itself

`statHostFile` prints `DIR\t<absolute path>` when the first existing candidate is a folder, and `/api/files` answers 409 `{ error, dir }` (`FilesError` in `shared/types.ts`). The file screen of the viewer, on that answer, replaces itself with an explorer screen of that folder (`replaceFileScreen`), so the back button counts one screen, not two. This covers folder paths without a trailing slash and hyperlinks whose target is a folder.

### D4. The explorer is a `dir` screen of the viewer's stack, and a component the pickers embed

`FileScreen` gains `{ kind: 'dir'; path: string }`; `openExplorer(origin, path)` opens the viewer with it. The screen renders `ExplorerView`, a `Sheet` around `Explorer` (`web/src/components/Explorer.tsx`). `Explorer` takes an `useExplorer(origin, start)` state: the listing shown, the typed path, the filter, «Mostrar ocultos», the selected file and the busy flag, with `go(path)` and `here()` as `useDirBrowser` had. Navigation inside the explorer changes its own state and pushes nothing: only «Abrir» pushes a `file` screen. Since the screens below stay mounted, going back shows the explorer as it was. `useDirBrowser` and `DirBrowser` are removed; `FolderPicker` and `NewFolderWhere` use `useExplorer` with the origin `{ host }` and start at `~`.

The filter folds case and accents with the `fold` helper of `Files.tsx`, moved to a shared spot of the web layer so both use one copy. «Mostrar ocultos» is local state, off each time the explorer opens.

### D5. The preview reuses the file screen's content

The fetching of `FileView` (kind detection, probing or fetching) becomes the hook `useFile(origin, path, max, folder?)`, and its rendering of images, PDFs, video, audio, Markdown and text becomes `FileBody`; `FileView` and the explorer's preview use both. The preview fetches at most 256 KB of a text file (the viewer 2 MB) and shows the same notice when it is cut. Layout is CSS with a container query, not the screen width: the explorer is a size container, and from `min-width: 720px` of its own width it holds two columns (list, preview); below that one column, the list on top limited to about half the height and the preview under it. So the viewer on a computer gets two columns, and the narrower folder pickers keep one on any screen. The preview's header shows the file's name and «Abrir». `fold` (accent- and case-insensitive matching) moves to `web/src/text.ts`, used by the file list's filter, the explorer's and the palette's.

### D6. The file viewer goes over a dialog only when opened from one

«Abrir» in a picker opens the file viewer over a dialog («Nueva carpeta») or over Ajustes. Putting the viewer always above the dialogs was rejected: a dialog opened by its shortcut while the viewer shows (a quick note) would open hidden under it. So `openFile` records `overDialog` when a dialog is open at that moment, and only then `Overlays` (`App.tsx`) renders `FileViewerSheet` after `Dialogs`, and `closeTop` (`backButton.ts`) closes the viewer before the dialog. Otherwise the order stays as it was. While the viewer is open, the sheets of Ajustes and «Nueva carpeta» are `inert`.

### D7. Hyperlink targets are classified in `shared/paths.ts`

`hyperlinkTarget(uri)` decides what a hyperlink does, as pure logic tested from `server`: `{ kind: 'web', url }` for an `http:` or `https:` target, `{ kind: 'file', path, line? }` or `{ kind: 'dir', path }` for a file of the machine (through `fileTarget`), and null for anything else (`javascript:`, `data:`, `vbscript:`, `mailto:`…, whatever the case or leading spaces). `fileTarget(uri)` returns null for a target with a scheme other than `file:` (`/^[a-z][a-z0-9+.-]*:(?!\d)/i`: a word followed by `:` and a digit is a name with a line, as `notes:3`, so `mailto:123` opens the viewer on a missing file, and `hyperlinkTarget` still never hands it to `window.open`), else `{ path, line?, dir }`: a `file://` URL gives its decoded path (any host part and any `?query` are ignored: the file is on the pane's machine); `/…`, `~/…` and a relative path give themselves; a trailing `:N` or `#LN` gives the line, and a `#fragment` with no `.` or `/` in it (a Markdown heading such as `#instalacion`) is dropped, so a `#` inside a name (`issue#12.md`) stays; a trailing `/` marks a folder. The `linkHandler.activate(e, uri, range)` of `TerminalView` only dispatches on `hyperlinkTarget`: it takes the pane from `range.start` (`screenCell`, then `origin()`) and calls `openExplorer`, `openFile` or `openLink`, and does nothing on null. The adversarial review asked for the decision to leave the component, where no test reached it. xterm hands non-web targets to `activate` only with `linkHandler.allowNonHttpProtocols: true` (found while checking by hand: without it the file links were underlined but did nothing), so that option is on, and the scheme check replaces the protection it gave: a program in the terminal cannot make the panel open a `javascript:` target. The drag guard applies as for the other links.

### D8. Folder paths are hits of `findPaths` with `dir: true`

`PathHit` and `RowPathHit` gain `dir: boolean`. A token that ends with `/` is a folder path when the part before the slash has at least two characters, a letter, no `//`, and each segment matches `[\w.@+-]+` (a leading `~` or `/` aside). `:` already falls outside the token, so `render-crf20/:` yields `render-crf20/`. The joining of rows broken at the edge works unchanged. `fileLinkProvider` passes `dir` to its `open` handler, and `TerminalView` opens the explorer for a folder; no hover preview for folders.

### D9. The kit adds the instruction from a SessionStart hook of `tmux-window-title.sh`

A new subcommand, `tmux-window-title.sh context`, prints `{"hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":"…"}}` when `TMUX_PANE` is set, and nothing otherwise. It takes no lock and touches no tmux state. `claude-hooks.json` adds it as a second SessionStart hook with no matcher, so it runs on startup, resume, clear and compact. Because the command calls `tmux-window-title.sh`, `install.sh` and `uninstallScript` already treat it as the kit's: no filter changes. The instruction, in English for the model: in its replies in the terminal, write every file or folder path as a Markdown link whose target is the absolute path, with a trailing `/` for a folder, never a `file://` URL. It says it is only for those replies: what Claude writes into files, commit messages, pull requests, issues, comments or tracker cards keeps its own conventions, so the machine's absolute paths (its user, its projects) do not end up in public text. The adversarial review found the first wording had no such scope.

**Alternatives.** Printing it from `start`: `start` refreshes tmux and runs under the lock, and mixing stdout with the hook's context is fragile. A line in each machine's `CLAUDE.md`: the user chose the kit so every machine gets it.

### D10. The window header's folder button opens `.`

`FolderButton` (`Files.tsx`) sits before `ChangesButton` in `WindowView.tsx` and calls `openExplorer({ host, window, pane }, '.')`. `/api/dir` resolves `.` against the selected pane's folder first, so the panel needs no pane path of its own. It shows always; outside a repository, `ChangesButton` still hides itself.

### D11. A change's task count carries its percentage, written once in `shared/change-progress.ts`

The owner asked, during this change, to see next to each window's task count how much of it is done. `taskProgress(tasks)` in `shared/change-progress.ts` writes «7/23 (30 %)»: the share of ticked tasks rounded down, so «100 %» shows only when every task is ticked and a change with one task left never reads as finished. The space before «%» follows the Spanish rule. `changeFacts` uses it, so the list row, the «Pendientes» card and the tooltip get it, and the window header's button uses it too. A separate fact («7/23 · 30 %») was rejected: the « · » separates different facts, and the percentage belongs to the count.

## Risks / Trade-offs

- [Claude Code may write hyperlink targets in a form D7 does not expect] → A task inspects the installed Claude Code bundle for how it writes OSC 8 targets before the classification is written, and the four forms are covered anyway.
- [tmux before 3.4, or without the `hyperlinks` terminal feature, drops OSC 8] → The path detection still runs on the visible text; the kit's instruction makes the visible text the file name only in that case, a known limit.
- [Single-segment folder names (`docs/`) can match prose] → At least two characters and a letter; a false hit opens an explorer with an error, which the back button closes.
- [The viewer over the dialogs would hide a dialog opened by its shortcut (the quick note)] → It goes over the dialogs only when opened from one (`overDialog`, D6).
- [Listing a huge folder] → Linear steps and the 2000-entry cut on the machine (D2); beyond 2000 of a kind, the explorer shows the first ones by name and says how many it left out, and the name filter only searches those.
- [The instruction costs every Claude Code session in tmux a few dozen tokens of context] → Accepted by the user.
- [In a native terminal (Ghostty on the Mac) that reaches the same tmux, a path shows as the name Claude gives its link] → Ghostty opens OSC 8 links too, and the target is the absolute path; accepted, the instruction asks for paths whose visible text is the file's name.

## Migration Plan

Hub and panel deploy together on the merge. The kit's instruction reaches each machine at the next release, through «Actualizar» or the checkout of its tag. Rollback is a revert: no stored data changes.
