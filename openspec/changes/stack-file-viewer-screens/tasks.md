# Tasks

## 1. Branch

- [x] 1.1 Create `feature/39-abrir-el-diff-de-un-fichero-cambiado-en-un-panel` from `origin/master` in its own worktree with `/koalarnes:git-worktree create` (the issue title's slug, shortened to fit 64 characters); verify `git branch --show-current` prints it.
  - Done; `git branch --show-current` prints it.

## 2. Review the existing tests

- [x] 2.1 Confirm that `web/src/components/Files.tsx`, `web/src/components/Sheet.tsx`, `web/src/fileViewer.ts` and `web/src/backButton.ts` have no tests (the web layer has no test runner) and that no `server/src/*.test.ts` covers the file viewer's screens; record one line per module, and that the behaviour is checked by hand in 3.4 (design D4).
  - `web/src/components/Files.tsx`, `Sheet.tsx`, `web/src/fileViewer.ts`, `web/src/backButton.ts`: no tests by the web standards; checked by hand in 3.4.
  - `server/src/files.test.ts` and `server/src/git.test.ts`: tests up to date (they cover `/api/files` and `/api/git/*`, which this change does not touch).

## 3. Stacked file-viewer sheets (web)

- [x] 3.1 `Sheet` (`web/src/components/Sheet.tsx`): add an optional `stacked` prop that adds the class `stacked` to its backdrop and makes `dragToClose` leave the backdrop's colour alone, and an optional `inert` prop set on its backdrop; in `web/src/styles.css`, `.sheet-backdrop.stacked` has a transparent background. Verify `pnpm --filter web typecheck` passes.
  - Done; `HTMLElement.inert` is typed, set from the backdrop's ref (Preact's JSX types lack it). Web typecheck passes.
- [x] 3.2 `FileViewerSheet` (`web/src/components/Files.tsx`): render one screen per entry of `fileViewer.value.stack` in order, keyed by its index, its kind and its path (design D1); each gets `fileViewerBack` as its `onClose` and «Atrás» when it is not the first; every screen above the first is `stacked`, every screen below the top one is `inert`. `FileView`, `ChangesView` and `DiffView` pass `stacked` and `inert` through to their `Sheet`. Verify `pnpm --filter web typecheck` passes.
  - Done: each screen gets a `Layer` (`back`, `stacked`, `inert`, `onClose`) spread into its `Sheet`; keys also carry the diff's or file's path. Web typecheck passes.
- [x] 3.3 Update the comments that describe the viewer as one screen at a time (`fileViewer.ts`, the `changesQuery` comment in `Files.tsx`) so they say the screens stack; verify by reading them against the code.
  - `fileViewer.ts`: the signal and `fileViewerBack` comments now say the screens stack and every way of closing goes back; `FileViewerSheet` has its own; the `changesQuery` and `backButton.ts` comments still hold.
- [x] 3.4 Check by hand against an isolated hub (own port, `dataDir`, `HOME`, `TMUX_TMPDIR` and tmux socket, no `TMUX`/`TMUX_PANE`) with the vite dev server, on a wide screen and on a phone width, in a repository with enough changed files to scroll, every scenario of `specs/file-viewer/spec.md`: the list keeps its scroll, filter, tab and branch after a diff; going back sends no new `/api/git/changes` request (network log) and shows no «Cargando…»; «Volver a mirar» refreshes; «Ver el fichero» stacks over the diff and the diff keeps its scroll; Escape, a tap outside, a drag down and the back button each close one sheet and the last one closes the viewer; Tab never reaches the list under a diff; the page is dimmed once with three sheets; dark and light themes. Record what was checked.
  - Checked against an isolated hub (port 7695, own dataDir, HOME, TMUX_TMPDIR and socket, no TMUX) with vite, in a test repository with 80 to 83 changed files, counting `/api/git/changes` requests by wrapping `fetch`. Wide screen: the list scrolled to 1500 px stays at 1500 px after a diff closed with Escape and with a tap outside, with no new request and no «Cargando…»; the filter «mod3» is kept; a diff scrolled to 300 px stays there after «Ver el fichero» and «Atrás»; three sheets stack, only the top one is not `inert` and only it has reachable focusable elements; the page shade is the bottom backdrop's (stacked backdrops transparent); the browser's back button closes file, diff and list one per press and stays on the window's page; files added on the machine do not appear on going back (82 kept) and «Volver a mirar» shows them (83, one more request). Phone width (390×844): dragging the diff down shows the list underneath at its scroll with a single shade, and letting go leaves the list open at 1500 px with no new request. Dark and light themes look right.
  - Seen meanwhile, not changed (already so before this change): in a scrolled diff, «Atrás», «Ver el fichero» and «Copiar la ruta» scroll away with the content.

## 4. Checks

- [x] 4.1 Run the step 4 commands of the touched layer, `pnpm --filter web typecheck`, and `ka features-check` (`ka scope` says whether it applies); verify each passes. Run `openspec validate stack-file-viewer-screens --strict`; verify it is valid.
  - `pnpm --filter web typecheck` passes; `ka scope`: the feature catalogue check applies; `ka features-check` exit 0 (the four `file-viewer` sections pending until step 6); `openspec validate --strict` valid.

## 5. Documentation and changelog

- [x] 5.1 Add a changelog entry with `/koalarnes:changelog` (type `changed`, scope `web`, Issue #39): a flow visible to the user changes.
  - Entry `changelogs/unreleased/20261117T100502017-feature-39-…json` (changed, web, Issue #39).
- [x] 5.2 Run `/koalarnes:update-docs` and apply what it proposes after the owner's review (the README if it describes the diff screen, and `docs/dev-standards/web-standards.md` if `Sheet`'s `stacked`/`inert` props are a pattern for other stacked sheets).
  - Owner approved: README (the diff opens over the list, which stays where it was) and web-standards (the `stacked`/`inert` pattern on the `Sheet.tsx` line). No stale line found.

## 6. Feature catalogue

- [x] 6.1 Run `/koalarnes:update-features stack-file-viewer-screens`, review and apply: a new area for the `file-viewer` capability with one section per requirement, each with its anchor.
  - Owner approved: new area «Visor de ficheros» after «Worktrees» (docs/FEATURES.md:100-120) with four sections and their anchors, and its index line.
- [x] 6.2 Run `ka features-check --strict`; verify the exit code is 0.
  - 43 sections verified, exit 0.
- [x] 6.3 Commit the catalogue sync with `/koalarnes:commit` before the human review.
  - Committed `docs(features)`, with tasks.md and review.json, before the human review.

## 7. E2E pipeline

- [x] 7.1 The project has no E2E suite; this step does not apply. Record it here.
  - The project has no E2E suite; this step does not apply.

## 8. Human review

- [ ] 8.1 Once `ka review-rounds gate` passes, ask the owner with `AskUserQuestion` who reviews the pull request (a person, or the owner takes it as good) and record the answer here; findings go through the fix path of the review loop until approval.

## 9. Before the archive

- [ ] 9.1 Run `ka features-check --strict` as the last task before `/opsx:archive`; verify the exit code is 0.

## Workflow follow-up

- After approval: `/opsx:archive stack-file-viewer-screens`, then `/koalarnes:commit` to push the archive into the same pull request.
- Merge only on the owner's yes, with `--match-head-commit`; then follow the `deploy` run with `gh run watch` and report it.
- Once merged, propose commenting on and closing Issue #39 and removing the worktree, in one `AskUserQuestion` call; then propose a release.
