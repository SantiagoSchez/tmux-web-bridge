# Tasks

## 1. Create the branch

- [x] 1.1 Create `bugfix/81-la-cabecera-de-la-ventana-no-cabe-en-el-movil` from `master` in its own worktree with `/ka:git-worktree create`; check with `git branch --show-current`.

## 2. Review the existing tests

- [x] 2.1 Read the tests of every module the change touches and write one line per module saying «tests up to date» or «tests updated/added in this change»: `web/src/components/WindowView.tsx` and `web/src/styles.css` (the web layer has no test suite: say so), and `shared/change-progress.ts` (`server/src/change-progress.test.ts`, tests added in group 3).
  - `web/src/components/WindowView.tsx`, `web/src/styles.css`: no tests (the web layer has no test suite); checked by hand in 4.3.
  - `shared/change-progress.ts`: tests updated/added in this change; the existing tests of `changeLine` (full label and its rounding down) still describe the intended behaviour and stay as they are.
- [x] 2.2 Trace the bug before the fix changes anything: run `ka review-rounds escape --path web/src/components/WindowView.tsx --line 153 --reason "The window header's buttons never shrink; the folder button left no room on a phone, so the header overflowed and widened the page"` (the `FolderButton` line, the fourth fixed-width button that pushed the header past a phone's width).

## 3. The percentage alone (shared module, test-first)

- [x] 3.1 Add to `server/src/change-progress.test.ts` a test for `taskPercent` of `shared/change-progress.ts` (D3): 7 of 23 gives «30 %», 120 of 121 gives «99 %» (rounded down), 121 of 121 gives «100 %». Run `pnpm --filter server test` and see it fail because `taskPercent` does not exist.
- [x] 3.2 Write `taskPercent(tasks)` and make `taskProgress` build on it, until `pnpm --filter server test` passes (the existing test of `changeLine`'s rounding still passes unchanged).
- [x] 3.3 Commit the group with `/ka:commit` (with the change's OpenSpec artifacts) once `pnpm --filter server test`, `pnpm --filter server typecheck` and `pnpm --filter web typecheck` pass.

## 4. The header fits its width

- [x] 4.1 In `web/src/components/WindowView.tsx`, render each change button's progress as two spans, the full `taskProgress` and the short `taskPercent`, after «☑»; keep its `aria-label` and `title` with the change's name and the full progress (D1). Put the change buttons in a `.wv-changes` group, rendered only when at least one change has tasks (D2). `pnpm --filter web typecheck` passes.
- [x] 4.2 In `web/src/components/Files.tsx`, give the counted form of `ChangesButton` the class `changes-lines` (D4). In `web/src/styles.css`, make `.wv-head` a size container with `overflow: hidden` (D1); under `@container (max-width: 560px)` show the short span instead of the full one (D1) and stack the counts of `.changes-lines` on two lines (D4); make `.wv-changes` a wrapping row one button high that shrinks first and hides what does not fit, let `.wv-change` shrink with its text cut by «…», and give `.wv-title` a minimum width of 64 px, leaving back, folder, ± and «⋯» at `flex-shrink: 0` (D2). `pnpm --filter web typecheck` passes.
- [x] 4.3 Check it by hand in a browser against an isolated hub (its own `HOME` and `TMUX_TMPDIR`, a tmux on its own socket started with `-f /dev/null`, never the user's tmux), with a window whose pane's repo has OpenSpec changes with tasks and uncommitted changes: at 411 px with one change, «A phone with a change and changed files» (`document.documentElement.scrollWidth` equals `innerWidth`, every button inside the screen, «☑ <n> %», ± on two lines); at 360 px with one and with two changes, «Two changes on a narrow phone»; «A sheet over the window on a phone» with «Ficheros cambiados» open; at 1280 px, «A wide header keeps the long forms». Record what was checked in this task.
  - Setup: a hub on its own port with a fake `HOME` and `TMUX_TMPDIR`, a tmux wrapper on a relative `-S` socket with `-f /dev/null`, vite against it, headless Chrome; a repo with `.claude/ka.json`, the change «show-progress» at 116/121, a second change at 3/12 for the two-change case, and +18,9k −1,5k uncommitted lines. Widths read from each header child's bounding box and `document.documentElement.scrollWidth`.
  - Before the second design round (D2 and D4 missing): 411 px with one change fitted, but 360 px with two changes made the page 422 px wide with «⋯» off screen, which led to D2, D4 and the header's `overflow: hidden`.
  - 411 px, one change: page 411 px; back 6–50, name 54–181, «☑ 95 %» 185–248, folder 252–296, ± on two lines 300–357, «⋯» 361–405.
  - 360 px, one change: page 360 px; «☑ 95 %» whole, name 76 px, «⋯» 310–354.
  - 360 px, two changes: page 360 px; «☑ 25 %» whole, the second change left out, name at its 64 px minimum, «⋯» 310–354.
  - «Ficheros cambiados» over the window at 411 px: page 411 px, sheet 0–411, its controls and list 16–395.
  - The window's icon (the owner saw it cut in the header before the fix): with `@pane_icon` 🤖 on the pane, at 411 px the name takes 58–177 with the icon at 58–68 and the name's text from 74; at 360 px with two changes the name keeps its 64 px minimum (58–114) and the icon shows whole (headless Chrome draws the emoji as a 10 px box; a real one is about 20 px).
  - 1280 px (window view about 600 px wide): «☑ 116/121 (95 %)» and «+18,9k −1,5k» on one line, as before.
- [x] 4.4 Commit the group with `/ka:commit` once `pnpm --filter web typecheck` passes.

## 5. Run tests, typecheck and lint

- [x] 5.1 Run `pnpm --filter server test`, `pnpm --filter server typecheck` and `pnpm --filter web typecheck`, all green; run `ka scope` and the checks it lists (`ka features-check`, `ka docs-check`), or record them as not applicable.
  - `pnpm --filter server test`: 501 pass, 0 fail; `pnpm --filter server typecheck` and `pnpm --filter web typecheck`: clean. `ka scope`: features-check and docs-check apply; `ka features-check` exit 0 (one pending section, for group 8); `ka docs-check` exit 0, no dead reference.

## 6. Update the documentation and the changelog

- [x] 6.1 Run `/ka:update-docs` for the flow visible to the end user (the header's short label on a narrow header); add `taskPercent` to the list of shared logic of the web standards only if it names the module's functions.
- [x] 6.2 Add the changelog entry with `/ka:changelog --issue 81`: the window header fits on a phone and no longer widens the page or cuts the sheets opened over it.
- [x] 6.3 Commit the group with `/ka:commit` once `pnpm --filter server test` and `pnpm --filter web typecheck` pass.

## 7. Review loop

- [x] 7.1 Run `/opsx:verify` and fix what it reports through the artifacts.
- [x] 7.2 The adversarial review does not apply: the change touches no message or job payload, no dependency-injection wiring or bootstrap, and no migration; it changes one component's markup, its styles and a pure shared helper.
- [x] 7.3 Open the pull request with `/ka:commit --pr`.
- [x] 7.4 Run `/ka:review-pr` in rounds as the bounded review loop says, recording each with `ka review-rounds record`; tick this task once `ka review-rounds gate` passes and the pending suggestions have gone through `ka-evaluator`.

## 8. Update the feature catalogue

- [x] 8.1 Run `/ka:update-features fix-window-header-overflow` for the modified and added requirements of `change-progress`.
- [x] 8.2 Run `ka features-check --strict` with exit code 0.
- [x] 8.3 Commit the catalogue with `/ka:commit`.

## 9. E2E pipeline

- [x] 9.1 The project has no E2E suite; this step does not apply.

## 10. Human review

- [x] 10.1 Ask the user with `AskUserQuestion` who reviews the pull request, and wait for the approval or record that the user takes it as good. The owner took PR #82 as good without a manual review (2026-11-22).

## 11. Feature catalogue check before the archive

- [x] 11.1 Run `ka features-check --strict` with exit code 0 as the last task before `/opsx:archive`.

## Workflow follow-up

- Run `/opsx:archive`, commit the archive moves with `/ka:commit`, check the pull request's head matches `git rev-parse HEAD`, and merge with `gh pr merge --squash --match-head-commit <commit>` on the owner's yes.
- Follow the `deploy` run of the merge commit with `gh run watch`.
- Offer to comment and close Issue #81 and to remove the worktree with `/ka:git-worktree remove`.
