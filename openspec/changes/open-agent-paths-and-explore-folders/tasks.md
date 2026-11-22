# Tasks

## 1. Branch (mandatory step 1)

- [x] 1.1 Create the branch `feature/76-abrir-las-rutas-del-agente-y-explorar-carpetas` (the issue's slug shortened to fit 64 characters) from `origin/master` in its own worktree with `/ka:git-worktree create`. Verify with `git branch --show-current`.
  - Created; `git branch --show-current` prints the branch, based on `6fa508a`.

## 2. Review the existing tests (mandatory step 2)

- [x] 2.1 Read the tests of every module the change touches (`server/src/files.test.ts` for `shared/paths.ts` and `server/src/files.ts`, `server/src/actions.test.ts` for `listDirs`, `server/src/kit.test.ts`, `scripts/test-window-title.sh`, `scripts/test-kit-update.sh`) and write one line per module saying «tests up to date» or «tests updated/added in this change». `web` has no tests (web standards).
  - `server/src/files.test.ts` (paths): tests updated in this change. Two assertions describe the behaviour this change replaces: `carpeta/` is not a path, and a folder broken across rows is not a link (group 4).
  - `server/src/files.test.ts` (files): tests added in this change (`listHostDir`, a folder in `statHostFile`, group 5).
  - `server/src/actions.test.ts`: tests updated in this change; the `listDirs` test moves to `files.test.ts` (group 5).
  - `server/src/kit.test.ts`: tests up to date (no builder of `kit.ts` changes).
  - `scripts/test-window-title.sh`: tests added in this change (`context`, group 8).
  - `scripts/test-kit-update.sh`: tests added in this change (the SessionStart hook in `settings.json`, group 8).

## 3. What Claude Code writes as a hyperlink (design risk 1)

- [x] 3.1 Find in the installed Claude Code bundle how it writes a Markdown link as OSC 8 (the target it passes for `[name](/abs/path)`, a relative target and a `file://` one). Record the forms found here, and adjust design D7 if one is missing. Verify: the record names the bundle version and the forms.
  - Claude Code 2.1.330, the Markdown renderer's `link` case: when the terminal supports hyperlinks, the OSC 8 target is the link's target as written, so `[x](/abs/path)` gives `/abs/path` and `[x](docs/a.md)` gives `docs/a.md`. A target with a `file:` scheme is never written as a hyperlink (its normaliser returns null and the text shows plain). D7 covers both forms and keeps `file://` for other programs; no change to the design. The kit's instruction asks for absolute paths, never `file://`.

## 4. Hyperlink targets and folder paths in `shared/paths.ts` (design D7, D8)

- [x] 4.1 Write failing tests in `server/src/files.test.ts` for `fileTarget(uri)`: `https://…` and `mailto:…` give null; `file:///home/me/a%20b.png` gives `/home/me/a b.png`; `file://host/x/y.md` gives `/x/y.md`; `/abs/f.md`, `~/f.md` and `docs/f.md` give themselves; `src/x.ts:42` and `src/x.ts#L42` give line 42; a trailing `/` gives `dir: true`. See them fail.
  - Added, with percent-encoded paths (Markdown encodes spaces and accents in a target), a stray `%` kept, and `notes.md:3` not read as a scheme. Seen failing against a stub that returned null.
- [x] 4.2 Implement `fileTarget` in `shared/paths.ts` with its JSDoc. Verify: 4.1 passes with `pnpm --filter server test`.
  - Passes; paths without a scheme are percent-decoded too.
- [x] 4.3 Write failing tests in `server/src/files.test.ts` for folder hits of `findPaths` and `findPathsInRows`: `~/Downloads/tests/render-crf20/:` gives `~/Downloads/tests/render-crf20/` with `dir: true`; `fotogramas/:` and `docs/.` give folders; `/`, `~/`, `a/` and `https://example.com/docs/` give nothing; a folder broken at the edge (`…/render` then `-crf20/:`) is one hit on both rows; existing file hits keep `dir: false`. See them fail.
  - Added (`y/o/` among the non-folders); the two outdated assertions rewritten (`carpeta/` dropped from the non-paths; the folder broken across three rows is now one folder link, its sample path made generic). Seen failing before the rule existed; the non-folder test seen failing by allowing one-letter names.
- [x] 4.4 Implement the folder rule of design D8 in `shared/paths.ts` (`PathHit.dir`, `RowPathHit.dir`). Verify: 4.3 and the existing path tests pass.
  - `src/files.test.ts`: 17 of 17 pass.

## 5. Listing a folder on the hub (design D1, D2, D3)

- [x] 5.1 Add `DirFile`, the `files` field of `DirListing` and `FilesError` (`{ error, dir? }`) to `shared/types.ts`, documented; remove the `listDirs` variant of `ActionOp`.
- [x] 5.2 Move the `listDirs` cases of `server/src/actions.test.ts` to `server/src/files.test.ts` as failing tests of `listHostDir(host, candidates)`, run for real under `/bin/sh` against a temporary `HOME` through the fake host: folders and files with sizes in name order, hidden entries included, a link to a folder listed as a folder, a name with spaces, `~` paths under the home folder, the parent (null at `/`), relative candidates where the first folder that exists wins, and «No existe la carpeta …» for none. Add a test that the BSD branch of the `stat` call is taken when `stat -c` fails (a fake `stat` first on `PATH`). See them fail.
  - Four tests (the listing, relative candidates, BSD `stat`, and 5.4's folder as a file); seen failing against a stub. A link to a file is sized through the link (`stat -L`).
- [x] 5.3 Implement `listHostDir` in `server/src/files.ts` (design D2) and remove `listDirs` from `server/src/actions.ts` and `READ_ONLY_OPS`. Verify: 5.2 passes.
  - `src/files.test.ts`: 21 of 21 pass. Sizes are piped through a `while read` loop, not `sed 's/^/F\t/'`, which BSD `sed` does not read as a tab. `pnpm --filter server typecheck` passes.
- [x] 5.4 Write a failing test in `server/src/files.test.ts`: `statHostFile` on a folder rejects with a `FileError` of status 409 that carries the folder's absolute path. Implement it (design D3). Verify: the test passes.
  - Passes; the 400 left for something that exists and is neither file nor folder now reads «No es un fichero».
- [x] 5.5 Add `GET /api/dir` to `server/src/index.ts` under the files section (query narrowed, `paneFolders` for relative paths, 400 and 404 as design D1), and make `/api/files` answer a folder with 409 `{ error, dir }`. Verify with `curl` against a dev hub with an isolated tmux (testing standards): an absolute path, `~`, `.` with a pane, a relative folder of the pane, a missing folder (404), an unknown machine (400), and `/api/files` on a folder (409 with `dir`).
  - Hub on a loopback port with its own `HOME`, `TMUX_TMPDIR`, socket `-L` and `-f /dev/null`, two panes in `~/shop` and `~/blog`: absolute 200, `~` 200, `.` gives each pane's own folder, `docs/` resolves in the pane asked for, `missing/` 404 «No existe la carpeta missing/ en Prueba», unknown machine 400, no path 400 «Falta la carpeta», `/api/files` on `~/videos` and on the relative `docs` 409 with the absolute `dir`, on a file 200. No data to restore: every call reads.

## 6. The explorer component (design D4, D5)

- [x] 6.1 Move `fold` out of `Files.tsx` to a web module both callers import, with no change of behaviour. Verify with `pnpm --filter web typecheck`.
  - Done: `fold` lives in `web/src/text.ts`; `Files.tsx`, `Explorer.tsx` and `Palette.tsx` (which had its own copy, `norm`) import it. `pnpm --filter web typecheck` passes.
- [x] 6.2 Split `FileView` in `web/src/components/Files.tsx` into the hook `useFile(origin, path, max, folder?)` and the component `FileBody`, and use both in `FileView`. Verify by hand: an image, a PDF, a video, a Markdown file and a cut 3 MB text file show as before.
  - Done: Checked by hand against the isolated hub (vite on a wide viewport): an image, a PDF, a WebM video and Markdown show in the preview and the viewer as before; a 2.9 MB text says «Solo los primeros 256 KB de 2,9 MB» in the preview and «Solo los primeros 2 MB de 2,9 MB» in the viewer.
- [x] 6.3 Write `web/src/components/Explorer.tsx`: `useExplorer(origin, start)` (listing through `api<DirListing>`, typed path, filter cleared on a new folder, «Mostrar ocultos», selected file cleared on a new folder, busy) and `Explorer` (path field, «..», folders, files with `fileSize`, empty and error states, preview with the file's name, «Abrir» and `FileContent` at 256 KB). Styles in `web/src/styles.css`: the explorer is a size container, two columns from 720 px of its own width, list above preview below that. Verify by hand on a phone-sized viewport and a wide one.
  - Done: Checked by hand: on a 1400 px viewport the viewer's explorer shows the preview to the right; on a Pixel 7 viewport the list is on top and the preview below; folders before files, sizes, «..», the filter and «Mostrar ocultos».
- [x] 6.4 Add the `dir` screen to `FileScreen` (`web/src/fileViewer.ts`), `openExplorer(origin, path)`, `ExplorerView` in `FileViewerSheet`, and «Abrir» pushing a `file` screen. Make `FileView` replace its screen with a `dir` screen when the hub answers `{ dir }` (`replaceFileScreen`). Verify by hand: «Abrir» then back shows the explorer with its folder, filter, selection and scroll; the phone's back button counts one screen each.
  - Done: Checked by hand: «Abrir» then history back shows the explorer with its folder and selected file and preview; each screen takes one back.

## 7. Where the explorer opens from (design D6, D7, D8, D10)

- [x] 7.1 In `TerminalView.tsx`, make `linkHandler.activate` classify the target with `fileTarget`, resolve the pane from `range.start`, and call `openExplorer` or `openFile`, keeping `openLink` for web targets and the drag guard for all. Pass `dir` from `fileLinkProvider` (`web/src/fileLinks.ts`) and open the explorer for folder hits. Verify by hand with a pane that prints an OSC 8 link to a file, one to a folder and an `https` one (`printf '\e]8;;/tmp/x.md\e\\x\e]8;;\e\\\n'`), and folder paths before a colon and broken at the edge, in a split window.
  - Done: Found while checking: xterm drops non-web OSC 8 targets unless `linkHandler.allowNonHttpProtocols` is on (they were underlined but did nothing); it is on now, and other schemes than `http(s)` open nothing (design D7, spec scenario «A target of another scheme»). Checked by hand in a split window, with a mouse and with emulated touch taps: an OSC 8 link to a file opens it in the viewer, one to a folder opens the explorer there, an `https` one opens a new tab, and `~/videos/render-crf20/:` opens the explorer in that folder. The folder broken at the edge is covered by `files.test.ts`.
- [x] 7.2 Add `FolderButton` and an `IconFolder` in `Files.tsx` and `icons.tsx`, placed before `ChangesButton` in `WindowView.tsx`, opening `openExplorer(origin, '.')` (aria-label «Explorar la carpeta de la ventana»). Verify by hand in a window inside a repository, one outside, and a split window.
  - Done: Checked by hand: the button opens the explorer in the folder of the window's active pane (`~/shop`, a repository; the other pane is in `~/blog`, outside one).
- [x] 7.3 Replace `useDirBrowser`/`DirBrowser` with `useExplorer`/`Explorer` in `FolderPicker` (`Folders.tsx`) and `NewFolderWhere` (`Dialogs.tsx`), confirming with the folder shown; remove the old browser and its styles. Record `overDialog` in `openFile` when a dialog is open; only then render `FileViewerSheet` after `Dialogs` in `App.tsx` and make `closeTop` (`backButton.ts`) close the file viewer before the dialog. Make the pickers `inert` while the viewer is open. Verify by hand: adding a folder with a file selected adds the folder; «Abrir» in «Nueva carpeta» opens the file over it and the back button returns to the dialog as it was; a quick note opened by its shortcut over the viewer shows on top.
  - Done: Checked by hand: in Ajustes › Carpetas, adding with a file selected, after «Abrir» and back, adds the folder shown (`~/Downloads`); in «Nueva carpeta», «Abrir» opens the file over the dialog and back returns to the dialog with its folder, selection and preview; the quick note shortcut over the explorer opens the note on top, and Escape closes only the note.

## 8. The kit's instruction to Claude Code (design D9)

- [x] 8.1 Add a failing case to `scripts/test-window-title.sh`: `tmux-window-title.sh context` inside a pane of its isolated tmux prints valid JSON whose `hookSpecificOutput.additionalContext` asks for paths as Markdown links with absolute targets, and prints nothing with `TMUX_PANE` unset. See it fail.
  - Done: The case «Claude empieza una sesión en un panel» failed before `context` existed (the script printed its usage and stopped).
- [x] 8.2 Implement `cmd_context` in `host-kit/tmux-window-title.sh` (no lock, its line in the usage header and the dispatcher's usage). Verify: 8.1 passes.
  - Done: `cmd_context` prints the SessionStart JSON with the instruction when `TMUX_PANE` is set; no lock, no state, a line in the usage header and in the dispatcher's usage. `scripts/test-window-title.sh`: «Todo bien.»
- [x] 8.3 Add the hook to `host-kit/claude-hooks.json` (a second SessionStart entry, no matcher) and an `expect` in `scripts/test-kit-update.sh` that the installed `settings.json` has it once after a re-install and none after the uninstall. Verify: `scripts/test-kit-update.sh && scripts/test-window-title.sh` pass.
  - Done: The new `expect` failed (0 hooks) before the entry was added. With it, `scripts/test-kit-update.sh` and `scripts/test-window-title.sh` both end «Todo bien.»; the existing «…ni los hooks de Claude» covers the uninstall.

## 9. The percentage of tasks done (design D11, asked by the owner during the change)

- [x] 9.1 Update the tests of `server/src/change-progress.test.ts` to the lines with the percentage («☑ 7/23 (30 %) · PR #74 · …») and add the rounding cases (119/120 is «99 %», 23/23 is «100 %», 0/5 is «0 %»), and the tooltip's facts in `server/src/window-details.test.ts` if it asserts them. See them fail.
  - Done: the four tests failed against the old line («☑ 7/23 · …»), then passed with `taskProgress` (17 of 17 in `change-progress.test.ts` and `window-details.test.ts`).
- [x] 9.2 Add `taskProgress(tasks)` to `shared/change-progress.ts` and use it in `changeFacts` and in the window header's button (`WindowView.tsx`, its accessible name too). Verify: 9.1 passes, `pnpm --filter web typecheck` passes, and by hand the header, the detailed list and a «Pendientes» card show «☑ N/M (P %)».
  - Done: Checked by hand with a change at 119 of 120 tasks: the window header shows «☑ 119/120 (99 %)» (accessible name «Tareas de demo-change: 119/120 (99 %)»), and so does the detailed list. On a phone the wider button leaves less room for the window's name («de…»). `pnpm --filter web typecheck` passes.

## 10. Fixes from the adversarial review (design D2, D7, D9)

- [x] 10.1 Add to `server/src/files.test.ts` a `listHostDir` test over a folder of 20 000 real files that must answer within a time budget, list the first 2000 files by name with their sizes and report the 18 000 left out (`left`); and a folder with 2001 subfolders. See them fail against the current script. Done: the 20 000-file test timed out against the old script (one `stat` per file) and now passes in about a second; the 2001-folder one reports `left` 1.
- [x] 10.2 Rewrite the listing script of `listHostDir` (`server/src/files.ts`) as D2 says: `find -L` per kind, `sort -f` and `head -n 2000` on the machine, `wc -l` counts, sizes of the kept files only through `xargs -0` and one `stat` form; add `left` to `DirListing` (`shared/types.ts`) and the line under the explorer's list (`Explorer.tsx`). Verify: 10.1 passes, every `listHostDir` test passes (the BSD `stat` fake included), and by hand the explorer lists a folder of 18 000 files and says how many it left out. Done: 25 of 25 tests of `files.test.ts` pass, the BSD fake included; by hand the hub returns `left: 16000` for the folder of 18 000 frames and the explorer shows «16.000 entradas más que no se listan…».
- [x] 10.3 Add tests for `hyperlinkTarget` to `server/src/files.test.ts`: `http:` and `https:` give a web target; `javascript:alert(1)`, ` JAVASCRIPT:x`, `data:text/html,x`, `vbscript:x` and `mailto:a@b` give null; a path gives a file or a folder; `/abs/README.md#instalacion` gives `/abs/README.md`; `file:///abs/a.md?x=1` gives `/abs/a.md`. See them fail. Done: the tests failed on the missing export and the kept fragment and query, then passed.
- [x] 10.4 Add `hyperlinkTarget` to `shared/paths.ts` (and the fragment and query handling of `fileTarget`), and make `activateHyperlink` in `TerminalView.tsx` only dispatch on it. Check `typeof body.error === 'string'` in `fileFetchError` (`Files.tsx`). Verify: 10.3 passes, `pnpm --filter web typecheck`, and by hand the file, folder and web hyperlinks still open as in 7.1. Done: the tests pass, `pnpm --filter web typecheck` passes, and by hand `notes.md#notas` opens the file, the folder link opens the explorer, the web link opens a tab and `javascript:` does nothing.
- [x] 10.5 Add to the SessionStart case of `scripts/test-window-title.sh` an `expect` that the instruction is only for replies in the terminal and names commits, pull requests, issues and tracker cards as out of it. See it fail, then reword `CONTEXT_PATHS` in `host-kit/tmux-window-title.sh` as D9 says. Verify: `scripts/test-window-title.sh` passes. Done: the new expects failed against the old text; after the rewording `scripts/test-window-title.sh` prints «Todo bien.».
- [x] 10.6 (Review round 1, R1-01) Replace the time budget of the 20 000-file test in `server/src/files.test.ts` (`took < 5000`, refused by the testing standards) with counted operations and a ratio, as D2 says: a `stat` first on the PATH that counts its calls and the names it is given, which must be a few calls naming exactly the 2000 kept files; and a listing of 20 000 files that costs less than 40 times one of 2000. See the count fail against a script that runs one `stat` per file. Verify: `pnpm --filter server test`.
  - Done: with the script changed to `xargs -0 -n 1 stat` the test failed on «2001 calls to stat»; with the real script it passes, three runs in a row, and `pnpm --filter server test` passes 496 of 496 with a clean typecheck.

## 11. Payload audit

- [x] 11.1 List every producer and consumer of `DirListing`, `ActionOp` (`listDirs`) and the `/api/files` error body (`grep -rn "DirListing\|listDirs\|api/files" server shared web trello-extension`) and confirm each was updated. Record the list here.
  - Done: Producers and consumers: `DirListing` is produced by `listHostDir` (`server/src/files.ts`) through `GET /api/dir` (`server/src/index.ts`) and read only by `useExplorer` (`web/src/components/Explorer.tsx`); `FilesError` is produced by `fileError` (`server/src/index.ts`) and read by `fileFetchError` (`web/src/components/Files.tsx`), which `fetchText` and `probeFile` use, so `FileView`, the preview and `FilePeek` all get it; the `listDirs` `ActionOp` has no producer or consumer left. `trello-extension` uses none of them. `ChangeProgress` is unchanged: the percentage is written on the client. After the adversarial fixes, `DirListing` gains the optional `left`, written by `listHostDir` and read by `Explorer.tsx` only, so its one producer and its one consumer are updated.

## 12. Tests, typecheck and lint (mandatory step 4)

- [x] 12.1 Run `pnpm --filter server test`, `pnpm --filter server typecheck`, `pnpm --filter web typecheck` and `scripts/test-kit-update.sh && scripts/test-window-title.sh`; all must pass. `trello-extension` is untouched. Run `ka scope` and the checks it lists (`ka features-check`, `ka docs-check`), reporting the ones that do not apply, and `openspec validate --strict open-agent-paths-and-explore-folders`.
  - Done: `pnpm --filter server test` (492 of 492; 496 of 496 after group 10), `pnpm --filter server typecheck`, `pnpm --filter web typecheck`, `scripts/test-kit-update.sh` and `scripts/test-window-title.sh` («Todo bien.» both, again after group 10) pass. `trello-extension` is untouched. `ka scope`: the feature catalogue and the standards documents apply, no E2E suite. `ka features-check` passes with 13 pending sections for step 6; `ka docs-check` finds no dead reference; `openspec validate --strict` is valid.

## 13. Documentation and changelog (mandatory step 5)

- [x] 13.1 Run `/ka:update-docs`: a new endpoint (`/api/dir`), a removed tree action, a changed error body, a kit hook and user-visible flows. Update the web standards (the explorer as the one folder browser, the viewer above dialogs, `fileTarget` among the shared modules tested from `server`), the server standards if a convention changes, the host-kit standards' «What the kit touches» if needed, and the README (the explorer, the folder button, the kit's instruction to Claude Code). Verify with `ka docs-check`.
  - Done: `/ka:update-docs` wrote: web standards (the change-progress module line, conventions for OSC 8 hyperlinks and `allowNonHttpProtocols`, the explorer as the one browser, the viewer over dialogs with `overDialog`, `fold`; a forbidden second browser), server standards (`FileError` with `dir`, resolving a relative path like `/api/files` and `/api/dir`), host-kit standards (a hook that gives Claude context), and README (links, folder paths, the explorer and the folder button, the percentage, the explorer in Ajustes › Carpetas, the kit hook). `ka docs-check`: no dead reference.
- [x] 13.2 Add changelog entries with `/ka:changelog` (es-ES) with `--issue 76`: the explorer and the folder button, the links that now open (OSC 8 and folders), the kit's instruction, and the percentage of tasks done.
  - Done: Four entries under `changelogs/unreleased/`, all `--issue 76`: the explorer (web), the links that now open (web), the kit's instruction (host-kit) and the percentage of tasks done (web).

## 14. Verification and the bounded review loop (between mandatory steps 5 and 6)

- [x] 14.1 Run `/opsx:verify open-agent-paths-and-explore-folders`.
  - Done: No critical issue in the checks that ran: the 20 ADDED and MODIFIED requirements are implemented and design D1 to D11 is followed. Two spec sentences of `file-explorer` were reworded to say what the code does (the filter keeps names holding every word typed, as «Ficheros cambiados»; the folder button is there whether or not the folder is a repository). Checked by hand too: an OSC 8 link to a folder written without `/` opens the explorer in it.
- [x] 14.2 Run `/ka:adversarial-review open-agent-paths-and-explore-folders`: the change replaces a tree action with an endpoint, changes an error body and adds a Claude Code hook on every machine.
  - Done: First run: one HIGH (the listing script was quadratic and its cap applied only on the hub), MEDIUMs (the hyperlink decision untested in the component, the kit's instruction reaching commits and pull requests, the error body's type) and LOWs, fixed in group 10. Second run, after group 10 touched the `DirListing` payload: «Ship as is», six LOW findings, none blocking: the byte-order cut, a hidden relative folder (`.git/`) losing its dot, a folder name with a newline, `mailto:123` read as a name with a line, a typed relative path resolved against the pane's folder instead of the one shown, and the `as unknown as HostMonitor` of the test host. D2 and D7 now say what the code does for the first, third and fourth.
- [x] 14.3 Commit with `/ka:commit --pr` and open the pull request.
  - Done: PR #77, with the changelog entries referencing it.
- [x] 14.4 Run the bounded review loop: `/ka:review-pr`, `ka review-rounds record`, the QUESTION findings to the owner, and `ka review-rounds gate` until it passes; each blocker goes back through the artifacts, `/opsx:apply`, `/opsx:verify` and `/ka:commit`.
  - Done: round 1 (full) found one REQUIRED (R1-01, the time budget of the 20 000-file test), fixed through D2 and task 10.6, and one SUGGESTION (R1-02); round 2 (incremental) resolved R1-01 with no new blocker. `ka review-rounds gate` passes on `4b03388` after 2 of 3 rounds; no QUESTION findings.
- [x] 14.5 Once the gate passes, send the pending suggestions to `ka-evaluator`, record the scores with `ka review-rounds score`, and offer those of 8 or more to the owner as follow-up issues.
  - Done: `ka-evaluator` scored R1-02 (a relative path typed in the explorer resolves against the panes' folders) 5 of 10; recorded with `ka review-rounds score` and listed in the final review comment of PR #77, with no follow-up issue.

## 15. Feature catalogue (mandatory step 6, after the review loop's gate passes)

- [x] 15.1 Run `/ka:update-features open-agent-paths-and-explore-folders`, then `ka features-check --strict` with exit code 0, and commit with `/ka:commit`.
  - Done: `/ka:update-features` wrote three sections in «Terminal» (links to files and folders, folder paths, Claude Code writing paths as links), the new area «Explorador de archivos» with its ten sections and its index line, and the percentage in the «Cambios de OpenSpec» sections and in «Qué muestran los detalles de una ventana». `ka features-check --strict`: 125 sections in sync, exit 0.

## 16. E2E pipeline (mandatory step 7)

- [x] 16.1 The project has no E2E suite; this step does not apply. Record it here.
  - Done: not applicable, the project has no E2E suite.

## 17. Human review (mandatory step 8)

- [ ] 17.1 Ask the owner with `AskUserQuestion` who reviews the pull request and record the answer here; do not archive before the approval or that answer.

## 18. features-check before the archive (mandatory step 9)

- [ ] 18.1 Run `ka features-check --strict` as the last task before `/opsx:archive`; the exit code must be 0.

## Workflow follow-up

- After the approval: `/opsx:archive`, `/ka:commit`, check the head, merge with `gh pr merge --squash --match-head-commit <sha>`, follow the `deploy` run, then offer the comment on Issue #76 and the removal of the worktree.
- Then run `/ka:update-harness` in a branch of its own, as the owner asked.
