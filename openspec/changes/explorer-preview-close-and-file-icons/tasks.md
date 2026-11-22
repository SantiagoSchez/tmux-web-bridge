# Tasks

## 1. Create the branch

- [x] 1.1 Create `feature/79-cerrar-la-vista-previa-e-iconos-por-tipo` from `master` in its own worktree with `/ka:git-worktree create`; check with `git branch --show-current`.

## 2. Review the existing tests

- [x] 2.1 Read the tests of every module the change touches and write one line per module saying «tests up to date» or «tests updated/added in this change»: `web/src/components/Explorer.tsx`, `Files.tsx`, `icons.tsx`, `Folders.tsx`, `Dialogs.tsx`, `web/src/backButton.ts` and `web/src/fileViewer.ts` (the web layer has no test suite: say so), and the new `shared/file-types.ts` (tests added in group 3).
  - `web/src/components/Explorer.tsx`, `Files.tsx`, `icons.tsx`, `Folders.tsx`, `Dialogs.tsx`, `web/src/backButton.ts`, `web/src/fileViewer.ts`: no tests (the web layer has no test suite); checked by hand in 5.5.
  - `shared/file-types.ts`: tests added in this change (`server/src/file-types.test.ts`).

## 3. Classify a file by its name (shared module, test-first)

- [x] 3.1 Write `server/src/file-types.test.ts` for `fileType(name)` of `shared/file-types.ts` (D4): one name per kind (`captura.PNG` image, `actual.mp4` video, `nota.m4a` audio, `factura.pdf` PDF, `INDICE.md` Markdown, `app.ts` code, `backup.tar.gz` archive, `notas.txt` file), the case ignored, `LICENSE` and `.env` generic, `Dockerfile` and `Makefile` code, and a name whose only dot is in a folder of its path. Run `pnpm --filter server test` and see it fail because the module does not exist.
- [x] 3.2 Write `shared/file-types.ts` with the extension lists of D4 (the five lists moved unchanged from `Files.tsx`, plus code and archive) until `pnpm --filter server test` passes.
- [x] 3.3 Rewrite `fileKind` in `web/src/components/Files.tsx` over `fileType` (code, archive and file map to `'text'`) and delete the regexes it no longer uses there; `pnpm --filter web typecheck` passes and a search for `IMAGE`, `MARKDOWN`, `PDF`, `VIDEO` and `AUDIO` in `web/src` finds no stale use.
- [x] 3.4 Commit the group with `/ka:commit` (with the change's OpenSpec artifacts) once `pnpm --filter server test`, `pnpm --filter server typecheck` and `pnpm --filter web typecheck` pass.

## 4. The file type icons

- [x] 4.1 Add the eight icons of D5 to `web/src/components/icons.tsx` (24-unit grid, `currentColor`, the same stroke as `IconFileDiff`) and `FileTypeIcon({ name })`, which picks one with `fileType`; `pnpm --filter web typecheck` passes.
- [x] 4.2 Put `FileTypeIcon` in the empty `menu-icon` slot of the explorer's file rows (`Explorer.tsx`) and in a new `menu-icon` span between the `git-badge` and the name in the rows of «Ficheros cambiados» (`Files.tsx`), with any style the row needs in `web/src/styles.css`; `pnpm --filter web typecheck` passes.
- [x] 4.3 Commit the group with `/ka:commit` once `pnpm --filter web typecheck` passes.

## 5. Close the preview

- [x] 5.1 Add to the preview's header, after «Abrir», an icon button with `IconClose` and the accessible name «Cerrar la vista previa», which deselects the file; make a click on the selected file's row deselect it too; on closing, move the focus to the file's row (D3). `pnpm --filter web typecheck` passes.
- [x] 5.2 Add `explorerPreviews` to `web/src/fileViewer.ts` and make `useExplorer` take an owner and register `{ owner, close }` while a file is selected, in one effect with its clean-up (D1). Pass the owner from `ExplorerView` (its `FileScreen`), `FolderPicker` (`Folders.tsx`) and `NewFolderWhere` (`Dialogs.tsx`) (their dialog value). `pnpm --filter web typecheck` passes.
- [x] 5.3 Make `layers()` in `web/src/backButton.ts` count `explorerPreviews`, and make `closeTop()` close the preview owned by what is on top before closing it (D1); `pnpm --filter web typecheck` passes.
- [x] 5.4 Add the explorer's capture `keydown` listener for Escape while a file is selected, which closes the preview only when the explorer's `.sheet-backdrop` is the last one and is not inert, and stops the event (D2); `pnpm --filter web typecheck` passes.
- [x] 5.5 Check it by hand in the browser against an isolated hub (its own `TMUX_TMPDIR`, `-L` socket and `-f /dev/null`, never the user's tmux), at phone and desktop width: every scenario of «The preview closes», «The explorer goes back one screen at a time», «The folder pickers browse with the explorer» (back and Escape in both pickers) and «Closing the sheet on top goes back one screen» (the existing ones still hold), the icons of «A folder of mixed files», «A file with no extension» and «A modified source file and a new image». Record what was checked in this task.
  - Setup: a hub on its own port with a fake `HOME` and `TMUX_TMPDIR`, a tmux on a relative `-S` socket (the scratch path is too long for `-L`) started with `-f /dev/null`, vite against it, headless Chrome at 412 × 860 and 1280 × 860; the hub's history depth read from `history.state` after each step.
  - Icons: `~/videos` with the eight files of the scenario plus `LICENSE` shows image, video, audio, PDF, Markdown, code, archive, generic and generic; «Ficheros cambiados» of a repo with `src/app.ts` modified and `docs/captura.png` new shows «N», image icon, `captura.png` and «M», code icon, `app.ts`.
  - The preview closes: ✕ on the phone closes it, the list fills the explorer and the focus is on the file's row; tapping the selected file again closes it; tapping another file switches the preview without a new history entry.
  - Back and Escape in the viewer: back closes the preview, then the viewer; Escape twice does the same; «Abrir» then back three times shows the explorer with its preview, closes the preview, closes the viewer; Escape on the file opened over the explorer closes only the file; a tap outside the explorer's sheet on a wide screen closes the viewer with the preview open.
  - Pickers: in Ajustes › Carpetas back and Escape close the preview first, and the next back goes from the section to the settings list; in «Nueva carpeta» back and Escape close the preview first, and «Abrir» then back three times closes the file, the preview and «Nueva carpeta».
  - Not re-run: the diff scenarios of «Closing the sheet on top goes back one screen» (Escape, tap outside and drag on a diff); `closeTop()` reaches them only when no preview has the diff as its owner, which never happens.
- [x] 5.6 Commit the group with `/ka:commit` once `pnpm --filter web typecheck` passes.

## 6. Run tests, typecheck and lint

- [ ] 6.1 Run `pnpm --filter server test`, `pnpm --filter server typecheck` and `pnpm --filter web typecheck`, all green; run `ka scope` and the checks it lists (`ka features-check`, `ka docs-check`), or record them as not applicable.

## 7. Update the documentation and the changelog

- [ ] 7.1 Run `/ka:update-docs`: the web standards say that an explorer's preview is a layer of the back button with its owner, closed by `closeTop()` before its screen or dialog, and that a file's type comes from `shared/file-types.ts`; the README's explorer paragraph mentions the ✕ and the icons. Check with a search that no line still says the preview closes only when changing folder.
- [ ] 7.2 Add the changelog entry with `/ka:changelog --issue 79`: closing the explorer's preview and the file type icons in the explorer and «Ficheros cambiados».
- [ ] 7.3 Commit the group with `/ka:commit` once `pnpm --filter server test` and `pnpm --filter web typecheck` pass.

## 8. Review loop

- [ ] 8.1 Run `/opsx:verify` and fix what it reports through the artifacts.
- [ ] 8.2 The adversarial review does not apply: the change touches no message or job payload, no dependency-injection wiring or bootstrap, and no migration; it changes UI components, the back button's layer count and a new pure module.
- [ ] 8.3 Open the pull request with `/ka:commit --pr`.
- [ ] 8.4 Run `/ka:review-pr` in rounds as the bounded review loop says, recording each with `ka review-rounds record`; tick this task once `ka review-rounds gate` passes and the pending suggestions have gone through `ka-evaluator`.

## 9. Update the feature catalogue

- [ ] 9.1 Run `/ka:update-features explorer-preview-close-and-file-icons` for the new and modified requirements of `file-explorer` and `file-viewer`.
- [ ] 9.2 Run `ka features-check --strict` with exit code 0.
- [ ] 9.3 Commit the catalogue with `/ka:commit`.

## 10. E2E pipeline

- [ ] 10.1 The project has no E2E suite; this step does not apply.

## 11. Human review

- [ ] 11.1 Ask the user with `AskUserQuestion` who reviews the pull request, and wait for the approval or record that the user takes it as good.

## 12. Feature catalogue check before the archive

- [ ] 12.1 Run `ka features-check --strict` with exit code 0 as the last task before `/opsx:archive`.

## Workflow follow-up

- Run `/opsx:archive`, commit the archive moves with `/ka:commit`, check the pull request's head matches `git rev-parse HEAD`, and merge with `gh pr merge --squash --match-head-commit <commit>` on the owner's yes.
- Follow the `deploy` run of the merge commit with `gh run watch`.
- Offer to comment and close Issue #79 and to remove the worktree with `/ka:git-worktree remove`.
