# Tasks

## 1. Branch

- [x] 1.1 Create `feature/41-devolver-el-foco-al-elemento-que-abrio-cada-pantalla` from `origin/master` in its own worktree with `/koalarnes:git-worktree create` (the issue title's slug, shortened to fit 64 characters); verify `git branch --show-current` prints it.
  - Done; `git branch --show-current` prints it.

## 2. Review the existing tests

- [x] 2.1 Confirm that `web/src/components/Files.tsx` has no tests (the web layer has no test runner) and that no `server/src/*.test.ts` covers the file viewer's focus; record one line per module, and that the behaviour is checked by hand in 3.3 (design D3).
  - `web/src/components/Files.tsx`: no tests by the web standards; checked by hand in 3.1 and 3.3.
  - `server/src/files.test.ts`, `server/src/git.test.ts`: tests up to date (they cover `/api/files` and `/api/git/*`, untouched).

## 3. Focus back to the opener (web)

- [x] 3.1 Check by hand with the current code, against an isolated hub with the keyboard, that closing a diff opened from the list leaves the focus on the page (`document.activeElement` is `body`): the failure this change fixes, seen before the fix.
  - Seen: Tab to `fichero24.ts`, Enter opens its diff (the focus already falls to `body` as the list turns inert), Escape closes it and the focus stays on `body`. Chrome's Tab still continues from the old starting point, but no element has the focus.
- [x] 3.2 In `web/src/components/Files.tsx`: `push` records `document.activeElement` (or `null` for `body`) for the depth it pushes from, then calls `pushFileScreen` (design D1); `FileViewerSheet` keeps the previous top index in a ref and, when it goes down, focuses the recorded opener of the new top with `preventScroll` if it is still connected (design D2), with its hooks before the early return. Verify `pnpm --filter web typecheck` passes.
  - Done: `openers` and `push` replace the `push` alias; the effect in `FileViewerSheet` runs before the early return. Web typecheck passes.
- [x] 3.3 Check by hand against the isolated hub, wide screen and phone width, every scenario of `specs/file-viewer/spec.md`: Tab + Enter on a file, Escape returns the focus to it and Tab continues after it; «Ver el fichero» by keyboard, «Atrás» returns the focus to it; a file at the bottom edge keeps the list's scroll; a diff opened by a click with nothing focused (simulated by blurring before opening) leaves no element focused on closing; the phone's back button and a tap outside also return the focus. Record what was checked.
  - Isolated hub with vite, keyboard driven. Wide: Tab to `fichero24.ts` + Enter, Escape returns the focus to it and Tab goes on to the next file; Tab to «Ver el fichero» + Enter, «Atrás» returns the focus to «Ver el fichero», the browser's back button then returns it to `fichero24.ts`; `fichero18.ts` half out at the list's bottom edge (scroll 600), Enter and Escape: focus on it, scroll still 600; a click that focuses nothing (blur, then `click()` like Safari) leaves `body` focused after Escape; a tap outside the diff returns the focus. Phone width (390×844): dragging the diff down returns the focus to its file. The parent effect runs after `Sheet` lifts `inert` (the focus lands on the list's button every time).

## 4. Checks

- [x] 4.1 Run `pnpm --filter web typecheck` and `ka features-check` (`ka scope` says whether it applies); verify each passes. Run `openspec validate return-focus-in-file-viewer --strict`; verify it is valid.
  - Web typecheck exit 0; `ka scope`: the catalogue check applies; `ka features-check` exit 0 (the new requirement pending until step 6); `openspec validate --strict` valid.

## 5. Documentation and changelog

- [x] 5.1 Add a changelog entry with `/koalarnes:changelog` (type `changed`, scope `web`, Issue #41): a flow visible to keyboard and screen reader users changes.
  - Entry `changelogs/unreleased/20261117T153449971-feature-41-…json` (changed, web, Issue #41).
- [x] 5.2 Run `/koalarnes:update-docs` and apply what it proposes after the owner's review.
  - Owner approved: web-standards, the stacked-sheet pattern on the `Sheet.tsx` line now records the opener and gives it the focus back. README unchanged (it does not describe focus); no stale line found.

## 6. Feature catalogue

- [x] 6.1 Run `/koalarnes:update-features return-focus-in-file-viewer`, review and apply: a new section in «Visor de ficheros» for the new requirement, with its anchor.
  - Owner approved: section «El foco vuelve a donde estaba» at the end of «Visor de ficheros», with its anchor.
- [x] 6.2 Run `ka features-check --strict`; verify the exit code is 0.
  - 44 sections verified, exit 0.
- [x] 6.3 Commit the catalogue sync with `/koalarnes:commit` before the human review.
  - Committed `docs(features)`, with tasks.md and review.json, before the human review.

## 7. E2E pipeline

- [x] 7.1 The project has no E2E suite; this step does not apply. Record it here.
  - The project has no E2E suite; this step does not apply.

## 8. Human review

- [x] 8.1 Once `ka review-rounds gate` passes, ask the owner with `AskUserQuestion` who reviews the pull request (a person, or the owner takes it as good) and record the answer here; findings go through the fix path of the review loop until approval.
  - The owner took PR #42 as good without a manual review (answer in the chat, 2026-11-17), after one automated round (approved, gate passed on 1ffe8a8). The only suggestion (R1-01, score 2) was dropped.

## 9. Before the archive

- [x] 9.1 Run `ka features-check --strict` as the last task before `/opsx:archive`; verify the exit code is 0.
  - 44 sections verified, exit 0, right before the archive.

## Workflow follow-up

- After approval: `/opsx:archive return-focus-in-file-viewer`, then `/koalarnes:commit` to push the archive into the same pull request.
- Merge only on the owner's yes, with `--match-head-commit`; then follow the `deploy` run with `gh run watch` and report it.
- Once merged, propose commenting on and closing Issue #41 and removing the worktree, in one `AskUserQuestion` call; then propose a release.
