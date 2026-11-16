# Tasks

## 1. Branch

- [x] 1.1 Create `bugfix/16-barra-de-limites-muestra-los-5h-y-7d-de-otra-cuenta` from `origin/master` in its own worktree with `/koalarnes:git-worktree create` (the issue's slug, shortened to fit 64 characters); verify `git branch --show-current` prints it.

## 2. Review the existing tests

- [x] 2.1 Read `server/src/host.test.ts` (`parseLimits`) and `server/src/accounts.test.ts` (`parseUsage`, `AccountStore.info()`), note that `server/src/usage.ts` has no test file, and confirm they still describe the intended behaviour; record one line per module here: "tests up to date" or "tests updated/added in this change".
  - `server/src/host.ts`: tests up to date; `parseLimits` is private and has no test, and this change does not touch it.
  - `server/src/claude-oauth.ts` and `server/src/account-store.ts` (`server/src/accounts.test.ts`): tests up to date; `info()` gains an empty `mislabelledOn`, which the check's tests cover (3.4).
  - `server/src/usage.ts`: no test file; it does not change, it only receives fewer readings.
  - `server/src/limits-check.ts`: new, tests added in this change (3.2, 3.4).
- [x] 2.2 Confirm the web modules the change touches (`web/src/components/LimitsBar.tsx`, `web/src/accounts.tsx`) have no tests by the web standards and are checked by hand in 6.2; record one line per module.
  - `web/src/components/LimitsBar.tsx`: no tests by the web standards; checked by hand in 6.2.
  - `web/src/accounts.tsx`: no tests by the web standards; checked by hand in 6.2.

## 3. The check (pure logic)

- [x] 3.1 Add `mislabelledOn: string[]` to `ClaudeAccount` in `shared/types.ts`, with its JSDoc (design: The contract), and return it empty from `AccountStore.info()`; verify `pnpm --filter server typecheck` passes.
- [x] 3.2 Write failing tests in `server/src/limits-check.test.ts` for `isForeign(reading, usage, now)`, one per scenario of the requirement «A statusline reading that contradicts the hub's is not shown»: another weekly reset, another 5-hour reset with the same weekly one, matching resets, a hub weekly reset already passed, a reading whose own windows ended, a hub reading without a window, a reset of 0, and a difference within 300 seconds; see them fail.
  - Eight tests; the three about foreign readings failed against a stub that answered `false`.
- [x] 3.3 Implement `isForeign` in `server/src/limits-check.ts` (design: The check is a pure module of the hub) until 3.2 passes.
  - The eight pass. Six mutations (no current-window check on either side or on one side, no margin, no weekly window, no 5-hour window) each make at least one test fail.
- [x] 3.4 Write failing tests for `checkLimits(hosts, accounts, now)`: a foreign reading is dropped from its host and its host id is listed under the account; a matching reading is kept; readings of an email two accounts share and of an email no account has are kept and list nothing; two hosts with foreign readings under one account list both; see them fail, implement until they pass.
  - Four tests (a reading without an email added to the shared and unknown ones); the two about foreign readings failed against a stub that kept everything. Three mutations (any account of a shared email, foreign readings kept, only the last host listed) each make one fail; a fourth showed a redundant guard on the email, removed.

PR #17 review (design: The check is a pure module of the hub, as revised):

- [x] 3.5 Write failing tests for `isForeign` for the requirement «A window that started before the hub saw it closed is not shown»: with no hub window (none, or a reset of 0), a reading whose window started before the hub's reading is foreign and one that started after is not, for both windows; the margin of one reset step either side (5-hour: 9 and 11 minutes; 7-day: 59 and 61 minutes); with a hub window that has ended, a reading whose window started before its reset is foreign and one of the next window is not; and two resets exactly 300 seconds apart are the same window. See them fail, implement until they pass, and check each new branch with a mutation.
  - The old tests of a hub without a window and of a reset of 0 described the behaviour the review rejected: they now keep only an account never read and a window the reading lacks. Four new tests (no hub window before and after, margins, ended window, plus a hub window ending right now) failed three of them before `windowForeign()`. Nine mutations (no margin, double margin, swapped steps, `>=` 300, ended reset ignored, ended reading windows looked at, no hub reading foreign, a hub window ending now taken as current) each make at least one fail.
- [x] 3.6 Write failing tests for `SentLimits` in `server/src/limits-check.test.ts`: a fresh one reports no change for a check with no foreign reading and no readings (no re-send after a start); a host whose kept readings differ from what was recorded is reported, and not once recorded; a host never recorded with no readings is not; the accounts are reported when their machines change and not once recorded; a forgotten host's readings are no longer compared. See them fail, implement until they pass.
  - Five tests; the file failed to load before `SentLimits` existed. Four mutations (a starting key of `''`, no default for a host never sent, `forget` not deleting, no readings told apart from an empty list) each make at least one fail.

Second PR #17 review:

- [x] 3.7 Write failing tests for `isForeign`, with the hub's reading time as a parameter of the tests' `hub()`: a hub reading taken after its window ended, with a reading whose window started between that reset and the reading, is foreign; a start exactly one step before the hub's reading (10 minutes, 1 hour) is not; a reading window whose reset is exactly `now` is not looked at. Move the hub's reading time before its ended reset in the existing tests of an ended window, where the scenario needs it. Implement `max(ended reset, usage.t)` in `windowForeign()` (design: The check is a pure module of the hub) until they pass, and repeat the mutations, including `<` turned into `<=` on both comparisons.
  - One new test (a hub reading after its window ended) failed before the maximum; the exact steps and a reading reset of exactly `now` were added to the existing tests, and the ended-window tests now read the account before its reset. 22 tests pass. Seventeen mutations, the round-one rule without the maximum, a minimum instead of it and both `<`/`<=` swaps among them, each make at least one fail.

## 4. Wiring in the hub

- [x] 4.1 In `server/src/index.ts`, add `hostView(info)` and `accountsView()` over `checkLimits` and send every `host`, `tree` and `accounts` message, and the initial snapshot of `/ws`, through them; re-broadcast the accounts after a host change that changes any account's `mislabelledOn`, and every host whose kept readings change after an accounts change; pass only kept readings to `UsageHistory.add` (design: The hub sends filtered views). Verify `pnpm --filter server typecheck` passes.
  - `/opsx:verify` found that removing a machine re-sent the tree but not the accounts, so a warning kept naming the removed machine; `machinesChanged()` now re-sends the accounts when their machines change (design updated).
- [x] 4.2 Payload audit for `ClaudeAccount.mislabelledOn` and the filtered `HostInfo.limits`: list every producer (`AccountStore.info()`, `accountsView()`, `hostView()`, the `/ws` snapshot, the `tree` broadcast after a machine change) and consumer (`web/src/ws.ts`, `LimitsBar.tsx`, `accounts.tsx`, `UsageHistory.add`) and confirm each was updated; record the list here.
  - Producers of `ClaudeAccount`: only `AccountStore.info()` builds it (empty `mislabelledOn`); `AccountManager.info` passes it on; `accountsView()` fills it for the `accounts` broadcast (`broadcastAccounts`) and the `/ws` snapshot. `accounts.run()` returns no account. No other module, nor `trello-extension/`, builds or reads it.
  - Producers of `HostInfo` for the panel: the `host` broadcast (`broadcastHost`, after a host change and after an accounts change that moves its kept readings), the `tree` broadcast (`broadcastTree`, from `machinesChanged()`) and the `/ws` snapshot (`treeView`), all through `hostView()`. `HostMonitor.snapshot` keeps the raw readings for `checkLimits`; its other readers in `index.ts` use only `status` and `error`.
  - Consumers: `web/src/ws.ts` stores both as they come (`accounts`, `host`, `tree`); `rows()` of `LimitsBar.tsx` reads `host.limits` (already filtered, unchanged); `AccountRow` and `accountMenu()` read `mislabelledOn` (5.1, 5.2); `UsageHistory.add` gets only `check.kept` from the host handler.
- [x] 4.3 Boot smoke test: start a dev hub with an isolated `TMUX_TMPDIR`, no `TMUX`/`TMUX_PANE` and a scratch `dataDir`, wait for its ready log line and `/api/health`, then stop it.
  - The hub of the worktree started with a scratch `HOME`, `dataDir` and config, `TMUX_TMPDIR=/tmp/twbt-tmux` and a `local` machine on the socket `twbtest`: it logged «tmux-web-bridge escuchando en http://127.0.0.1:7799 (1 máquinas…)» and `/api/health` answered `{"ok":true,"hosts":[{"id":"claude","status":"ok"}]}`. It was stopped after 6.2.

- [x] 4.4 Replace `sentLimits` and `sentMislabelled` in `server/src/index.ts` with a `SentLimits` (design: What the panel last got is a small class of the same module); verify `pnpm --filter server typecheck` passes and repeat the boot smoke test of 4.3.
  - `index.ts` keeps only `sent.sentHost`, `sent.sentAccounts`, `sent.forget`, `sent.hostsChanged` and `sent.accountsChanged`; the unused `RateLimits` import went with the keys. Typecheck exits 0; the hub started and logged «tmux-web-bridge escuchando en http://127.0.0.1:7799 (1 máquinas…)» before 6.3.

## 5. The warning in the panel

- [x] 5.1 In `AccountRow` (`web/src/components/LimitsBar.tsx`), show the ⚠ when `acc.mislabelledOn` is not empty and add the warning text with the machines' names to the row's `title` (design: The panel only shows the warning); verify `pnpm --filter web typecheck` passes.
  - The text comes from `mislabelledWarning()` in `web/src/accounts.tsx`, shared with the menu (in `LimitsBar.tsx` it would have made the two modules import each other). Singular and plural wording for one or several machines.
- [x] 5.2 In `accountMenu()` (`web/src/accounts.tsx`), show the same text in the `top` block when `acc.mislabelledOn` is not empty, styled with the existing classes (or a new one in `web/src/styles.css` built on the theme's custom properties); verify `pnpm --filter web typecheck` passes.
  - A new `.account-warning` paragraph under the machines, in `var(--peach)` like the row's ⚠.

## 6. Manual checks

- [x] 6.1 Against an isolated dev hub (scratch `HOME`, `dataDir` and `TMUX_TMPDIR`, no `TMUX`/`TMUX_PANE`, its own tmux socket) with an account whose usage is faked in the store's file, publish with `tmux -L <socket> set-option -g @claude_rate_limits` a foreign reading and then a matching one under its email; verify on the `/ws` stream that the first is dropped and lists the host in `mislabelledOn`, and that the second is kept and clears it.
  - Two accounts without logins in `accounts.json` (s1: 5 %/0 %; s2: 40 %/96 %, other resets). With s1's numbers and resets published under s2's email, the `host` message carried no readings, `accounts` listed `s2:[claude]`, a new connection's snapshot said the same, and s2's history kept only the hub's 40/96. With s2's own resets published next, the reading arrived (41 %/96 %), `accounts` listed `s2:[]` and the history added 41/96.
- [x] 6.2 Check in headless Chrome against that hub, at a wide viewport and on an emulated phone: the row's ⚠ and tooltip, the account menu's text, and that both disappear after the matching reading. Record what was checked here.
  - At 1600×900, with the foreign reading: s2's row showed the hub's 40 % and 96 % with their resets (13:10, 19/11), and its tooltip ended with the warning naming `drangleic-claude`. On an emulated Pixel 7, s2's menu showed the warning in peach under «Sin usar en ninguna máquina». After the matching reading (42 %), without reloading: the row showed 42 %, and the warning left the tooltip and the menu. Both rows keep a ⚠ for «Hace falta iniciar sesión otra vez», since the test accounts have no logins. Headless Chrome has no font for ⚠ in the menu, as for its other glyphs (↻, ✎).

- [x] 6.3 Repeat 6.1 with s2 read by the hub without a 7-day window and with a 5-hour window that has ended: s1's reading under s2's email is dropped and lists the machine; a reading of a window opened after the hub's reading is kept.
  - s2 in `accounts.json` with no `sevenDay` and a 5-hour reset an hour back; s1's windows started 3 hours (5-hour) and 2 days (7-day) back. s1's reading under s2's email: no readings in the `host` message, `accounts` listed `s2:[claude]`, a new connection's snapshot the same, s2's history empty. s2's reading of windows opened after the hub's reading: kept (41 %/96 %), `s2:[]`, history 41/96.

## 7. Tests, typecheck and lint

- [x] 7.1 Run `pnpm --filter server test`, `pnpm --filter server typecheck`, `pnpm --filter web typecheck` and `ka features-check`; all pass. The trello-extension and host-kit layers are not touched.
  - `pnpm --filter server test`: 226 pass, 0 fail. Both typechecks exit 0. `ka features-check` exits 0 (the new capability enters the catalogue in 9.1).

- [x] 7.2 After the PR #17 review fixes, run the same commands again; all pass.
  - `pnpm --filter server test`: 235 pass, 0 fail. Both typechecks exit 0. `ka features-check` exits 0. `openspec validate fix-foreign-statusline-limits --strict`: valid.
- [x] 7.3 After the second PR #17 review fixes, run the same commands again; all pass.
  - `pnpm --filter server test`: 236 pass, 0 fail. Both typechecks exit 0. `ka features-check` exits 0. `openspec validate fix-foreign-statusline-limits --strict`: valid.

## 8. Documentation and changelog

- [x] 8.1 Run `/koalarnes:update-docs` for the new field of `ClaudeAccount` and the filtered statusline readings, and apply what it proposes.
  - Applied with the owner's approval: a rule in the Conventions of `docs/dev-standards/server-standards.md` (the machines and the accounts reach the panel only through the views of `index.ts`) and a sentence in `README.md` («Usar tu propia status line…») on the check of each entry. `ka docs-check` finds no dead reference.
- [x] 8.2 Add the changelog entry with `/koalarnes:changelog` (a user-visible fix: the strip no longer shows another account's limits, and warns about the machine that published them).
  - `changelogs/unreleased/20261116T093112899-bugfix-16-barra-de-limites-muestra-los-5h-y-7d-de-otra-cuenta.json`: `fixed`, scope `web`, Issue 16.

## 9. Feature catalogue

- [x] 9.1 Run `/koalarnes:update-features fix-foreign-statusline-limits`, review and apply the draft of `docs/FEATURES.md`, run `ka features-check` (exit code 0) and commit it with `/koalarnes:commit`.
  - Applied with the owner's approval: a new area «Límites de uso» with one section per requirement and its index entry. The spec was synced to `openspec/specs/usage-limits/spec.md` with `/opsx:sync`, as PR #15 did, because `ka features-check` only reads the main specs; it exits 0. Committed in «docs: add the usage limits checks to the feature catalogue» (PR #17).

- [x] 9.2 After the PR #17 review: sync the revised spec to `openspec/specs/usage-limits/spec.md`, add the new requirement to the catalogue with `/koalarnes:update-features` (and revise «Lecturas de otra cuenta», whose last sentence no longer holds), run `ka features-check` (exit code 0) and commit with `/koalarnes:commit`.
  - Spec synced; the catalogue gained «Ventanas que el servidor vio cerradas», and «Lecturas de otra cuenta» now says the hub skips a reading's ended window, not one the hub saw end. The `README.md` sentence on the check covers the new case too. `ka features-check` exits 0 (14 sections). Committed in «fix: catch foreign readings of a window the hub saw closed» (PR #17).
- [x] 9.3 After the second PR #17 review: sync the revised spec again, check that the catalogue section «Ventanas que el servidor vio cerradas» still matches it, run `ka features-check` (exit code 0), update the PR description (test counts, the new rule) and commit with `/koalarnes:commit`.
  - Spec synced and valid. The catalogue section already says «antes de esa lectura del servidor, o antes de que terminara su ventana anterior», which is the later of the two: unchanged. `ka features-check` exits 0. The PR description now has the new rule, 236 tests and an open item for the real answer of `/api/oauth/usage`. Committed in «fix: take the later of the hub's reading and its ended reset» (PR #17).

## 10. E2E pipeline

- [x] 10.1 The project has no E2E suite; this step does not apply. Record it here.
  - Does not apply: the project has no E2E suite. The behaviour is covered by the unit tests of `limits-check.ts` and the manual checks of 6.1 and 6.2.

## 11. Human review and archive

- [ ] 11.1 After `/koalarnes:review-pr` comes back clean, the owner reviews the pull request; their findings are handled by editing these artifacts, re-applying, verifying and committing.
- [ ] 11.2 Run `ka features-check` as the last task before `/opsx:archive` (exit code 0).

## Workflow follow-up

- After the owner approves: `/opsx:archive`, then `/koalarnes:commit` with the archive moves.
- Merge only on the owner's yes in the chat, then follow the `deploy` run with `gh run watch`.
- Once merged, propose closing Issue #16 and removing the worktree, in one `AskUserQuestion` call.
