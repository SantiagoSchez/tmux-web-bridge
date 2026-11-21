# Tasks

## 1. Branch (mandatory step 1)

- [x] 1.1 Create the branch `feature/74-mostrar-en-cada-ventana-el-estado-de-su-cambio` (the issue's slug shortened to fit 64 characters) from `origin/master` in its own worktree with `/ka:git-worktree create`. Verify with `git branch --show-current`.
  - Created; `git branch --show-current` prints the branch, based on `6894ea6`.

## 2. Review the existing tests (mandatory step 2)

- [x] 2.1 Read the tests of every module the change touches (`server/src/git.test.ts`, `server/src/window-details.test.ts`, `server/src/host.test.ts`, `server/src/tip-position.test.ts`) and write one line per module saying «tests up to date» or «tests updated/added in this change». `web` has no tests (web standards).
  - `server/src/git.test.ts`: tests up to date; tests added in this change (changes per folder, groups 4 and 5).
  - `server/src/window-details.test.ts`: tests up to date; tests added in this change (a pane's changes, group 6).
  - `server/src/host.test.ts`: tests up to date (it covers the tmux parse, which does not change).
  - `server/src/tip-position.test.ts`: tests up to date (the position does not change; the delay lives in `HoverTip.tsx`, untested by design).
  - `server/src/change-progress.test.ts`: new in this change (groups 3 and 6).

## 3. Review state of a registry (design D3)

- [x] 3.1 Write failing tests in `server/src/change-progress.test.ts` for `reviewState(json)`: the second-round scenario (PR 74, round 2 of 3, 1 open blocker, a fixed CRITICAL and an open SUGGESTION not counted), the reset-plus-extensions scenario (round 1 of 4), version 2 gives nothing, a non-object or missing `version` gives nothing, a PR with no round gives no `round`, and malformed fields (`pr` a string, `rounds` not a list) are dropped without throwing. See each fail for the right reason.
  - Five tests. Seen failing for the right reason by breaking the open-state filter of the blockers (tests 1 and 5), reading the first reset instead of the last (test 2) and dropping the version check (test 4).
- [x] 3.2 Implement `reviewState` in `server/src/change-progress.ts` (a `//` paragraph opening the module, JSDoc, every field narrowed). Verify: the tests of 3.1 pass with `pnpm --filter server test`.
  - `server/src/change-progress.ts`; 5 of 5 pass.
- [x] 3.3 (Adversarial review, L7) Add to `server/src/change-progress.test.ts` an extension granted right at the last reset (`afterRound` equal to it), which ka counts; see it fail by turning `>= since` into `> since`.
  - Test «an extension granted right at the last reset raises the limit»: round 1 of 4. With `> since` it gives 1 of 3 and fails.

## 4. Reading the changes in the scanner (design D1, D2)

- [x] 4.1 Add `ChangeProgress` and `PaneInfo.changes` to `shared/types.ts` (D4), documented.
- [x] 4.2 Extend `server/src/git.test.ts` with a failing test that runs the real script under `/bin/sh` against a temporary `HOME` and a throwaway repository (explicit `{ PATH, HOME }` environment): a repository with `.claude/ka.json`, `openspec/changes/archive/`, a change with `tasks.md` (7 `- [x]`, indented ones too, and 16 `- [ ]`), `proposal.md` and a version 1 `review.json`, and a change with only `proposal.md`; a second repository with `.koalarnes.json` only under `.claude/`; a third with changes and no harness configuration; two folders of the same repository (the changes read once per top folder); a `review.json` over 256 KB (no review state). Assert the `ChangeProgress[]` each folder gets, in name order. See it fail.
  - Test added. Seen failing before the script existed, then by dropping the archive exclusion and the harness check (each fails it). A repository named `old 100%` caught a bug of the first draft (`printf "$tops"` read the path as a format).
- [x] 4.3 Extend `gitScript` and `parseGit` (`server/src/git.ts`), using `CONFIG_FILE` and `MAX_CONFIG`-style caps of `harness-config.ts`: `S` and `R` lines once per top folder with a harness configuration, at most 20 changes, `review.json` at most 256 KB, lines with the wrong number of fields dropped. `GitScanner.apply()` sets or deletes `PaneInfo.changes` next to `PaneInfo.git`. Verify: 4.2 and the existing `git.test.ts` test pass.
  - `CHANGES_SCRIPT` and `parseChanges` live in `server/src/change-progress.ts` (`MAX_CHANGES` 20, `MAX_REVIEW` 256 KB); `gitScript` runs them once per top folder (`sort -u`), `parseGit` returns `changes` per folder, `apply()` sets or deletes `PaneInfo.changes`. Both `git.test.ts` tests pass.
- [x] 4.4 (Adversarial review, L3, L4, L7) Write failing tests in `server/src/git.test.ts` running the real script: a change folder whose name holds a line break followed by a forged `H` line leaves the machine's home as it is and is not listed; a repository with 21 changes gives 20; a `review.json` between 64 KB and 256 KB gives no review state; a `review.json` that is not valid JSON gives no review state and keeps the task progress.
  - One test with all four cases (a change named `a\nH\tforged` that sorts first, 21 valid changes, a 100 KB `review.json`, a truncated one). It failed on the 100 KB registry before 4.5; afterwards it fails by removing the name filter (the home becomes «forged») and by removing the cap (21 changes).
- [x] 4.5 Implement them in `server/src/change-progress.ts` (design D2): skip change names with a tab or a line break in `CHANGES_SCRIPT`, `MAX_REVIEW` at 64 KB, and no non-null assertion in `parseChanges` (adversarial review, L8). Verify: 4.4 and the other `git.test.ts` tests pass.
  - A `case` on `$c` against a tab and a line break skips the name before it counts; `MAX_REVIEW` is 65 536; `parseChanges` keeps each top folder's map in a local. `git.test.ts` and `change-progress.test.ts`: 13 of 13 pass.

## 5. A new reading after a state change (design D5)

- [x] 5.1 Write a failing test for `GitScanner.rescan()`: with a fake `TmuxExec` whose `shell` counts calls, `apply()` right after a scan does not scan, `rescan()` then `apply()` scans, and `rescan()` during a running scan scans once more when it ends. See it fail.
  - Test added; it failed with «scanner.rescan is not a function», and again when the flag was cleared at the end of a reading instead of at its start. `GitScanner` now takes `Pick<TmuxExec, 'shell'>`, so the fake needs no cast.
- [x] 5.2 Implement `rescan()` in `GitScanner` and call it from `HostMonitor.detectTransitions` when a pane changed state. Verify: 5.1 passes and `server/src/host.test.ts` still passes.
  - `rescan()` sets a flag the next `apply()` reads; `detectTransitions` calls it for every pane whose state changed. `git.test.ts`, `host.test.ts` and `change-progress.test.ts`: 10 of 10 pass; `pnpm --filter server typecheck` passes.
- [x] 5.3 (Adversarial review, M2; design D5 revised) Rewrite the test of 5.1 so it drives the trigger itself: `apply()` with the same panes and states right after a reading does not read; `apply()` with a pane whose state changed reads again before the 15 s; a state change seen during a reading reads once that reading ends; a pane seen for the first time does not count as a change. No non-null assertion in the test (L8). See it fail against the current code.
  - «a pane changing state reads the folders again…» replaces the `rescan()` test; `finish()` asserts a reading is running instead of `!`. It failed against the code of 5.2 (expected 1 reading, got 0).
- [x] 5.4 Implement it in `GitScanner.apply()` (it remembers each pane's state) and remove the public `rescan()` and its call in `HostMonitor.detectTransitions`. Verify: 5.3 passes, and deleting the state comparison in `apply()` makes it fail.
  - `apply()` keeps a map of each pane's state and sets `due` when a pane it saw before comes with another one; `rescan()` is gone and `host.ts` is as on `master`. The test fails by deleting the comparison (0 readings) and by counting a new pane as a change (1 reading where 0). Server: 485 of 485 pass; typecheck passes.

## 6. The shared text and the tooltip data (design D4)

- [x] 6.1 Write failing tests in `server/src/change-progress.test.ts` for `changeLine(change)` of `shared/change-progress.ts`: «☑ 7/23 · PR #74 · ronda 2/3 · 1 bloqueante», «2 bloqueantes», zero blockers omitted, no round when none was counted, a change with tasks and no review («☑ 3/10»), a change with neither («☑ add-export»), a review with no progress («☑ PR #74»). Extend `server/src/window-details.test.ts` with the scenario «A pane with an active change» (each pane's `changes` in `PaneDetails`) and the «A detail the panel does not have» case without changes. See them fail.
  - Three `changeLine` tests and one `window-details` test (the existing «nothing to say» test already asserts no `changes` key). They failed while the module did not exist, then by writing «bloqueantes» for one blocker (test 1) and by showing zero blockers (tests 2 and 3).
- [x] 6.2 Implement `changeLine` in `shared/change-progress.ts` (plain TypeScript, no imports beyond `import type`) and add the pane's changes to `PaneDetails` in `shared/window-details.ts`. Verify: 6.1 passes.
  - `changeFacts` (the parts, also used by the tooltip) and `changeLine` in `shared/change-progress.ts`; `PaneDetails.changes` is `{ name, facts }[]`. 15 of 15 pass.
- [x] 6.3 (Adversarial review, M1) The `window-details` delta now also modifies «A space's and a pending pane's details» (its scenarios at 0.2 seconds). Confirm that `TIP_DELAY` in `HoverTip.tsx` is the one delay of every tip (`useHoverTip`), so the spaces' headers and the folded list follow it with no code change, and record it here.
  - Every tip goes through `useHoverTip`, the only timer, set to `TIP_DELAY`: the window rows and the pending cards (`Tree.tsx`, `windowTip`), the spaces' headers (`Tree.tsx`, `spaceTip`) and the folded list (`Rail.tsx`, `windowTip` with `mark`). No other delay exists.

## 7. The panel (design D6, D7)

- [x] 7.1 `web/src/components/Tree.tsx`: a `ChangeLines` component under `WhereLine` in `WindowRow` and `SoloSession` (active pane, hidden in the compact list) and in `PendingCard` (its pane, always), one line per change with `changeLine`; styles in `web/src/styles.css` with the theme's custom properties.
  - `ChangeLines` in `Tree.tsx` (under `WhereLine` in `WindowRow` and `SoloSession`, and in `PendingCard` with `always`); `.change-lines`/`.change-line` in `styles.css`, and the compact card wraps so the lines take their own row.
- [x] 7.2 `web/src/components/HoverTip.tsx`: each pane's changes in the window tooltip (name in full, then the line's data); `TIP_DELAY` to 200 ms.
  - A «Cambio» line per change in each pane of the tooltip (name, then the facts); `TIP_DELAY` is 200.
- [x] 7.3 `web/src/components/WindowView.tsx`: one button per change with `tasks` before `ChangesButton`, labelled «☑ 7/23», `aria-label` and `title` with the change's name, opening `${change.path}/tasks.md` with `openFile`.
  - One `changes-btn wv-change` button per change with `tasks`, before `ChangesButton`; label and title «Tareas de <change>: 7 de 23».
- [x] 7.4 `web/src/menus.ts`: in `windowMenu`, one entry «Propuesta de <change>» per change of the target pane with `proposal`, opening `${change.path}/proposal.md` with `openFile`.
  - `proposals` in `windowMenu`, built only when there is a target pane (no non-null assertion), right after «Ficheros cambiados».
- [x] 7.5 Check the panel by hand against an isolated hub (own `TMUX_TMPDIR`, no `TMUX`/`TMUX_PANE`, its own socket, `-f /dev/null`, a fake `HOME` with a throwaway repository holding a harness configuration and two changes) and the `vite` dev server, on a phone-sized and a wide viewport: the row lines, the compact list, a ✅ card, the tooltip at 0.2 s, the header button opening `tasks.md`, the menu entry opening `proposal.md`, and the card updating within a couple of seconds after the pane's state changes. Record what was seen here.
  - Isolated hub on port 7693 and vite on 5193 (fake `HOME`, tmux through a wrapper with `-f /dev/null`, a relative socket and its own `TMUX_TMPDIR`), a throwaway repository with `.claude/ka.json`, the changes «show-progress» (6/23, PR 74, round 2/3, 1 REQUIRED open) and «add-export» (proposal only), and a second window outside the harness.
  - 1280×800: two lines under the branch («☑ add-export», «☑ 6/23 · PR #74 · ronda…», cut with «…» in the sidebar); the tooltip at 0.3 s with both changes in full; the header button «☑ 7/23» opens `tasks.md` rendered, and «add-export» has none; the ··· menu holds «Propuesta de add-export» and «Propuesta de show-progress», and the first opens `proposal.md`.
  - Ticking task 7 and setting the pane to ✅: the card showed 7/23 after 1.9 s.
  - 390×844: the card shows the whole line; the header fits «☑ 7/23» next to «+43 −0». Compact list: no change line in the rows; the card keeps them on their own lines.
  - Emoji show as boxes (no emoji font in the headless Chrome). Afterwards the processes were stopped by port and the test tmux through its wrapper; the last resurrect snapshot holds no test session.
- [x] 7.6 (Review R1-01) In `web/src/styles.css`, let a compact card wrap only when it holds change lines (`.tree.compact .card-body:has(> .change-lines)`), so a card without changes keeps its title and its state on one line and cuts a long title with «…», as before this change.
  - The rule now carries `:has(> .change-lines)`, with a comment saying why.
- [x] 7.7 Check by hand, with the isolated hub of 7.5 in the compact list: a card with a long window name and no changes stays on one line with its title cut; a card with changes still shows each line on its own row. Record what was seen here.
  - Same hub as 7.5, at 390×844 in the compact list, with two ✅ cards: «feature-484-revisar-la-funcionalidad-de-busqueda-avanzada-del-catalogo» (no changes) keeps title and state on one row (`nowrap`, title cut with «…»); «feat/74-estado» wraps and shows «☑ add-export» and «☑ 6/23 · PR #74 · ronda 2/3 · 1 bloqueante» on rows of their own. Processes stopped afterwards and both ports free.

## 8. Payload audit

- [x] 8.1 List every producer and consumer of `PaneInfo` (`grep -rn "PaneInfo" server shared web trello-extension`) and confirm each was updated or does not need to be: the hub builds it in `host.ts` and `git.ts`; `web` reads it; `trello-extension` does not use it. Record the list here.
  - Producers: `server/src/host.ts` builds each `PaneInfo` from tmux; `server/src/git.ts` (`GitScanner.apply`) sets `git` and now `changes`. The views of `index.ts` (`hostView`, `treeView`) pass the panes through unchanged.
  - Consumers that read `changes` (updated): `web/src/components/Tree.tsx`, `HoverTip.tsx` (through `shared/window-details.ts`), `WindowView.tsx`, `web/src/menus.ts`. Consumers that read other fields and need nothing: `web/src/state.ts`, `Assist.tsx`, `TerminalView.tsx`, `shared/panes.ts`. `trello-extension/src` does not use `PaneInfo`. The field is optional: an older panel ignores it.

## 9. Tests, typecheck and lint (mandatory step 4)

- [x] 9.1 Run `pnpm --filter server test`, `pnpm --filter server typecheck` and `pnpm --filter web typecheck`; all must pass. `trello-extension` and `host-kit` are untouched. Run `ka scope` and the checks it lists (`ka features-check`, `ka docs-check`), reporting the ones that do not apply, and `openspec validate --strict openspec-change-status`.
  - `pnpm --filter server test`: 483 of 483 pass. Both typechecks exit 0. `ka scope`: both checks apply, no E2E suite. `ka features-check`: in sync, 104 sections, 8 pending for this change (written in step 6). `ka docs-check`: no dead reference. `openspec validate --strict`: valid.

## 10. Documentation and changelog (mandatory step 5)

- [x] 10.1 Run `/ka:update-docs`: the payload changes (`PaneInfo.changes`) and a user-visible flow is added. Add to `docs/dev-standards/web-standards.md` the list of shared modules tested from `server` (`change-progress.ts`) and whatever pattern the change introduces. Verify with `ka docs-check`.
  - `docs/dev-standards/web-standards.md`: the hover-tip convention no longer pins «1 s» (the code holds the delay); `change-progress.ts` added to the shared modules tested from `server`.
  - `docs/dev-standards/server-standards.md` (Conventions): what the hub reads from the panes' folders goes into `GitScanner`'s one script, once per top folder, and `rescan()` after a state change.
  - `README.md`: «Detalles al pasar el ratón» says 0,2 s and lists the changes; a new bullet «Cómo va cada cambio de OpenSpec».
  - `server/src/harness-config.ts`: its opening comment lists `change-progress.ts` among the scripts that read the configuration.
  - `ka docs-check`: no dead reference; no «un segundo» or «1 s» left about the tooltip.
- [x] 10.2 Add a changelog entry with `/ka:changelog` (es-ES), describing the change lines, the header button, the menu entry and the 0.2 s tooltip.
  - Two entries, two independent visible changes: `added` (web) for the change lines, the header button and the menu entry, and `changed` (web) for the 0.2 s tooltip, both with `--issue 74`, under `changelogs/unreleased/`.
- [x] 10.3 After 5.4, update the convention of `docs/dev-standards/server-standards.md` that names `GitScanner.rescan()`: the scanner reads again on its own when it sees a pane change state. Run `ka docs-check`, the server tests and both typechecks again.
  - The convention now says `GitScanner.apply()` reads again when a pane it saw changes state, and that a new reason to read goes there with its test. Server 485 of 485, both typechecks pass, `ka docs-check` finds no dead reference; no `rescan` is left in code or docs.

## 11. Verification and the bounded review loop (between mandatory steps 5 and 6)

- [x] 11.1 Run `/opsx:verify openspec-change-status`.
  - First run before the adversarial review: every requirement implemented. Second run after its fixes: 28 of 31 tasks, the three left come after the pull request; one warning (the requirement did not say that names with a tab or a line break are left out) fixed in the `change-progress` delta; `openspec validate --strict` valid.
- [x] 11.2 Run `/ka:adversarial-review openspec-change-status`: the change adds a field to the tree payload.
  - Its findings went back through the artifacts (design D2 and D5 revised, the `window-details` delta) and were fixed by tasks 3.3, 4.4, 4.5, 5.3, 5.4, 6.3 and 10.3; the LOW ones accepted are in the design's risks. Not run again: the fix touched no payload, wiring or migration.
- [x] 11.3 Commit with `/ka:commit --pr` and open the pull request.
  - PR #75; the changelog entries reference it.
- [x] 11.4 Run the bounded review loop: `/ka:review-pr`, `ka review-rounds record`, the QUESTION findings to the owner, and `ka review-rounds gate` until it passes; each blocker goes back through the artifacts, `/opsx:apply`, `/opsx:verify` and `/ka:commit`.
  - Round 1 (full, `1a5fc8b`): R1-01 (compact cards wrap), R1-02 (this group was missing), R1-03 (the proposal's Impact) REQUIRED; R1-04 and R1-05 SUGGESTION; one NITPICK. No QUESTION.
  - Fixed through the artifacts (tasks 7.6, 7.7, this group, the proposal's Impact, design D6), re-verified and committed in `c393b97`.
  - Round 2 (incremental, `c393b97`): no new finding, R1-01 to R1-03 resolved; `ka review-rounds gate` passed on `c393b97`.
- [x] 11.5 Once the gate passes, send the pending suggestions to `ka-evaluator`, record the scores with `ka review-rounds score`, and offer those of 8 or more to the owner as follow-up issues.
  - R1-04 scored 5 (listed in the final review comment), R1-05 scored 4 (dropped). None reached 8, so nothing was offered.

## 12. Feature catalogue (mandatory step 6, after the review loop's gate passes)

- [x] 12.1 Run `/ka:update-features openspec-change-status`, then `ka features-check --strict` with exit code 0, and commit with `/ka:commit`.
  - New area «Cambios de OpenSpec» with its index line and one section per `change-progress` requirement (8); in «Detalles al pasar el ratón», the 0,2 s delay (its heading too, which said «un segundo»), the change line of each pane, and the spaces' delay. `ka features-check --strict`: 112 sections in sync, exit 0.

## 13. E2E pipeline (mandatory step 7)

- [x] 13.1 The project has no E2E suite; this step does not apply. Record it here.
  - Not applicable: `ka scope` reports no E2E suite.

## 14. Human review (mandatory step 8)

- [x] 14.1 Ask the owner with `AskUserQuestion` who reviews the pull request and record the answer here; do not archive before the approval or that answer.
  - The owner takes PR #75 as good without a manual review (2026-11-21).

## 15. features-check before the archive (mandatory step 9)

- [x] 15.1 Run `ka features-check --strict` as the last task before `/opsx:archive`; the exit code must be 0.
  - 112 sections in sync, exit 0.

## Workflow follow-up

- After the approval: `/opsx:archive`, `/ka:commit`, check the head, merge with `gh pr merge --squash --match-head-commit <sha>`, follow the `deploy` run, then offer the comment on Issue #74 and the removal of the worktree.
