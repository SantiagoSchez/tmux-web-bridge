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

## 4. Wiring in the hub

- [x] 4.1 In `server/src/index.ts`, add `hostView(info)` and `accountsView()` over `checkLimits` and send every `host`, `tree` and `accounts` message, and the initial snapshot of `/ws`, through them; re-broadcast the accounts after a host change that changes any account's `mislabelledOn`, and every host whose kept readings change after an accounts change; pass only kept readings to `UsageHistory.add` (design: The hub sends filtered views). Verify `pnpm --filter server typecheck` passes.
  - `/opsx:verify` found that removing a machine re-sent the tree but not the accounts, so a warning kept naming the removed machine; `machinesChanged()` now re-sends the accounts when their machines change (design updated).
- [x] 4.2 Payload audit for `ClaudeAccount.mislabelledOn` and the filtered `HostInfo.limits`: list every producer (`AccountStore.info()`, `accountsView()`, `hostView()`, the `/ws` snapshot, the `tree` broadcast after a machine change) and consumer (`web/src/ws.ts`, `LimitsBar.tsx`, `accounts.tsx`, `UsageHistory.add`) and confirm each was updated; record the list here.
  - Producers of `ClaudeAccount`: only `AccountStore.info()` builds it (empty `mislabelledOn`); `AccountManager.info` passes it on; `accountsView()` fills it for the `accounts` broadcast (`broadcastAccounts`) and the `/ws` snapshot. `accounts.run()` returns no account. No other module, nor `trello-extension/`, builds or reads it.
  - Producers of `HostInfo` for the panel: the `host` broadcast (`broadcastHost`, after a host change and after an accounts change that moves its kept readings), the `tree` broadcast (`broadcastTree`, from `machinesChanged()`) and the `/ws` snapshot (`treeView`), all through `hostView()`. `HostMonitor.snapshot` keeps the raw readings for `checkLimits`; its other readers in `index.ts` use only `status` and `error`.
  - Consumers: `web/src/ws.ts` stores both as they come (`accounts`, `host`, `tree`); `rows()` of `LimitsBar.tsx` reads `host.limits` (already filtered, unchanged); `AccountRow` and `accountMenu()` read `mislabelledOn` (5.1, 5.2); `UsageHistory.add` gets only `check.kept` from the host handler.
- [x] 4.3 Boot smoke test: start a dev hub with an isolated `TMUX_TMPDIR`, no `TMUX`/`TMUX_PANE` and a scratch `dataDir`, wait for its ready log line and `/api/health`, then stop it.
  - The hub of the worktree started with a scratch `HOME`, `dataDir` and config, `TMUX_TMPDIR=/tmp/twbt-tmux` and a `local` machine on the socket `twbtest`: it logged «tmux-web-bridge escuchando en http://127.0.0.1:7799 (1 máquinas…)» and `/api/health` answered `{"ok":true,"hosts":[{"id":"claude","status":"ok"}]}`. It was stopped after 6.2.

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

## 7. Tests, typecheck and lint

- [x] 7.1 Run `pnpm --filter server test`, `pnpm --filter server typecheck`, `pnpm --filter web typecheck` and `ka features-check`; all pass. The trello-extension and host-kit layers are not touched.
  - `pnpm --filter server test`: 226 pass, 0 fail. Both typechecks exit 0. `ka features-check` exits 0 (the new capability enters the catalogue in 9.1).

## 8. Documentation and changelog

- [x] 8.1 Run `/koalarnes:update-docs` for the new field of `ClaudeAccount` and the filtered statusline readings, and apply what it proposes.
  - Applied with the owner's approval: a rule in the Conventions of `docs/dev-standards/server-standards.md` (the machines and the accounts reach the panel only through the views of `index.ts`) and a sentence in `README.md` («Usar tu propia status line…») on the check of each entry. `ka docs-check` finds no dead reference.
- [x] 8.2 Add the changelog entry with `/koalarnes:changelog` (a user-visible fix: the strip no longer shows another account's limits, and warns about the machine that published them).
  - `changelogs/unreleased/20261116T093112899-bugfix-16-barra-de-limites-muestra-los-5h-y-7d-de-otra-cuenta.json`: `fixed`, scope `web`, Issue 16.

## 9. Feature catalogue

- [x] 9.1 Run `/koalarnes:update-features fix-foreign-statusline-limits`, review and apply the draft of `docs/FEATURES.md`, run `ka features-check` (exit code 0) and commit it with `/koalarnes:commit`.
  - Applied with the owner's approval: a new area «Límites de uso» with one section per requirement and its index entry. The spec was synced to `openspec/specs/usage-limits/spec.md` with `/opsx:sync`, as PR #15 did, because `ka features-check` only reads the main specs; it exits 0. Committed in «docs: add the usage limits checks to the feature catalogue» (PR #17).

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
