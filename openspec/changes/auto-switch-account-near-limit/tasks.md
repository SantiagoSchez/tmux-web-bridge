# Tasks

## 1. Create the branch

- [x] 1.1 Create `feature/64-rotar-sola-la-cuenta-de-una-maquina-cuando-se-acerque` from `origin/master` in its own worktree with `/ka:git-worktree create` (the issue's slug, shortened to 64 characters); verify with `git branch --show-current`.

## 2. Review the existing tests

- [x] 2.1 Read `server/src/accounts.test.ts`, `server/src/settings.test.ts`, `server/src/activity.test.ts`, `server/src/limits-check.test.ts` and `server/src/push.test.ts`, confirm they still describe the intended behaviour, and record one line per module («tests up to date» or «tests updated/added in this change») in this task.
  - `accounts.ts`: tests up to date (the switch and the usage reads do not change).
  - `settings.ts`: tests updated/added in this change (`accountRotation`, task 4.1).
  - `activity.ts`: tests up to date (it stores any kind; the new `account` kind needs no new store behaviour).
  - `limits-check.ts`: tests up to date (its kept readings are an input, unchanged).
  - `push.ts`: tests up to date (the new push goes through the same `send()` and quiet schedule).
  - `rotation.ts` (new): tests added in this change (tasks 3.x and 5.2).

## 3. The decision (`shared/rotation.ts`)

- [x] 3.1 Write failing tests in `server/src/rotation.test.ts` for `sanitizeAccountRotation`: defaults `{ fiveHour: 90, sevenDay: 95, hosts: [] }`, whole numbers 1 to 100 kept, 0, 150, 90.5 and non-numbers replaced by the previous value of that field, `hosts` deduplicated and non-strings dropped; see them fail.
- [x] 3.2 Add `AccountRotationSettings` to `HubSettings` in `shared/types.ts` (documented field `accountRotation`) and implement `sanitizeAccountRotation` in `shared/rotation.ts` until 3.1 passes (`pnpm --filter server test`).
- [x] 3.3 Write failing tests for `rotationAccounts` (the usage it gives each account): the hub's reading alone; a fresher kept statusline reading under the account's email wins; an older one does not; a window whose reset has passed counts as 0 %; no reading gives none (spec «The usage the decision uses»).
- [x] 3.4 Implement `rotationAccounts` until 3.3 passes.
- [x] 3.5 Write failing tests for `decideRotation`, one per scenario of the spec: switch off; below both thresholds; over the 5-hour and over the weekly threshold; free account first; least used among the free; an account used by another machine when no free one is left; no spare login; usage error and `needsLogin` excluded; current account without a reading; a model's weekly limit ignored; the 10-point fallback with 97/92 (stays) and 100/90 (switches); no target gives `stuck` once per window and again in a new window; the account left excluded while over a threshold (`left`); a machine not connected gives `offline` once per window; a machine in `skip` or being switched is passed over; see them fail.
- [x] 3.6 Implement `decideRotation` in `shared/rotation.ts` (design D1, D2, D4, D7) until 3.5 passes; break one rule at a time (the free-account preference, the 10-point margin, the `left` guard) and watch the matching test fail, then restore it.
- [x] 3.7 (Adversarial review) Write failing tests for `decideRotation`: the hub's reading and a statusline's of the same window, with resets a second apart, give the same window key (no second warning, no second failure report); a failure with another reason is reported in the same window (`failed` holds `window|reason`); a machine whose `retryAt` is in the future is not switched, and is switched once `now` passes it; a switch to an account over a threshold carries the target's window (`targetWindow`); see them fail.
- [x] 3.8 Implement them in `shared/rotation.ts` (design D1, D4): the window key rounds the reset to 10 minutes (5 hours) or 1 hour (7 days), `RotationInput` gains `now`, `RotationMemory` gains `retryAt`, the `offline` key includes its reason, and a fallback `switch` carries `targetWindow`; until 3.7 passes.

- [x] 3.9 (Adversarial review, second run) Write failing tests for `decideRotation`: a machine over its weekly threshold with no target, whose 5-hour usage crosses its threshold up and down, gives one `stuck` per limit, not one per crossing (`warned` and `failed` kept per limit); a warning on s1 does not silence a warning on s2 whose window resets at the same time (the window key names the account); see them fail.
- [x] 3.10 Implement them in `shared/rotation.ts` (design D1, D4): `warned` and `failed` become machine → limit → key, the window key is `account:limit:reset`, and `targetWindow` carries the limit and the window; update the tests that spell window keys; until 3.9 passes.

## 4. Settings in the hub (`server/src/settings.ts`)

- [x] 4.1 Write failing tests in `server/src/settings.test.ts`: `accountRotation` defaults on a fresh store; `update({ accountRotation })` with valid values saves and survives a reload from a new instance; an out-of-range threshold keeps the previous one; `forgetHost` removes the machine from `accountRotation.hosts`; see them fail.
- [x] 4.2 Add `accountRotation` to `DEFAULTS`, sanitise it on load and in `update()` with `sanitizeAccountRotation`, and drop the machine in `forgetHost`, until 4.1 passes.

## 5. The service (`server/src/rotation.ts`) and its wiring

- [x] 5.1 Add `'account'` to `ActivityEvent.kind` and the documented `account?: { from; to?; limit; pct; error? }` field to `ActivityEvent` in `shared/types.ts` (design D6).
- [x] 5.2 Write failing tests in `server/src/rotation.test.ts` for `AccountRotation` with injected collaborators: a switch calls `switchHost` once and reports an `account` event with both aliases, the limit and the percentage; two machines on one account are decided one after the other and the second sees the first switch; a failed `switchHost` is reported once across several `evaluate()` calls and again after a success clears it; a call to `evaluate()` while a round runs joins it, and what changed meanwhile is decided in that round; the warning with no target is not repeated; the account just left is not a target again while over a threshold; see them fail.
- [x] 5.3 Implement `AccountRotation` (design D3, D4) until 5.2 passes; its log lines use `[cuentas]` and Spanish text, with no token.
- [x] 5.4 Wire it in `server/src/index.ts`: instantiate it with the settings, `accounts.info`, `checkNow().kept`, the machines' status and `accounts.switchHost`; report with `activity.add` and `push.send` (title and body from `rotationNotice` of `server/src/rotation.ts`, tested there, tag `account:<host>`; `pct` rounded in the event); call `evaluate()` from `accounts.on('change')`, from the machine handler when `usage.add` returned true, and from `settings.on('change')`. Verify with `pnpm --filter server typecheck`.
- [x] 5.5 Boot smoke test: build and start the hub against a temporary `dataDir` and config with no machines (isolated as `testing-standards.md` says, no `TMUX`/`TMUX_PANE`, its own `TMUX_TMPDIR`), wait for the line `tmux-web-bridge escuchando en`, then stop it; record the result here.
  - Done: `pnpm --filter server build`, then `node server/dist/index.js` with a throwaway config and `dataDir`, no machines, `TMUX`/`TMUX_PANE` unset and its own `TMUX_TMPDIR`: it printed `tmux-web-bridge escuchando en http://127.0.0.1:17981 (0 máquinas, …)` and stopped cleanly.
- [x] 5.6 Audit every producer and consumer of `HubSettings` and `ActivityEvent` (`grep -rn "HubSettings\|ActivityEvent" server shared web trello-extension`) and confirm each was updated; list them in this task.
  - `HubSettings`: produced by `server/src/settings.ts` (`DEFAULTS`, load, `update()`, `forgetHost`), updated; broadcast whole by `server/src/index.ts` and the `/ws` snapshot, no change needed; consumed by `web/src/state.ts` and `web/src/ws.ts` (the whole object, no change needed) and by the new controls of task 6.1. `trello-extension` does not use it.
  - `ActivityEvent`: produced by `server/src/activity.ts` (stores and reloads any string `kind`, no change needed) and by `reportRotation` in `server/src/index.ts` (new); consumed by `web/src/ws.ts` (stores it, no change needed), `web/src/components/Tree.tsx` (only reads `done` and `launch`, unaffected) and `web/src/components/Activity.tsx` (task 6.2).
- [x] 5.7 (Adversarial review) Make the fake hub of `server/src/rotation.test.ts` emit the change synchronously as `AccountManager.switchHost` does (a call to `evaluate()` at the start of `switchHost` and in its `finally`), then write failing tests: a switch that keeps failing is tried once per event, not in a loop; it is tried again after 5 minutes without a second report; two machines on one account with a single spare login switch one machine and report the other's failure once; a failure with another reason is reported; a change of the machine's account by hand clears the failure, so the next failure in that window is reported; no warning of no target follows a switch to an account over a threshold; a statusline reading that `checkLimits` keeps reaches the decision (through `checkLimits`, not a hand-built list); see them fail.
- [x] 5.8 Fix `AccountRotation` (design D3, D4) until 5.7 passes: register the round before it starts, record `retryAt` 5 minutes after a failed switch, key reported failures by reason, clear `failed` and `retryAt` when the round sees the machine on another account (`seen`), record `warned` with `targetWindow` after a fallback switch, and read an error's message with `err instanceof Error ? err.message : String(err)`. Rename the tests that pin texts and defaults so their names say they pin them.
- [x] 5.9 Repeat the boot smoke test of 5.5 and record the result here.
  - Done with the same isolated setup: `tmux-web-bridge escuchando en http://127.0.0.1:17981 (0 máquinas, …)`, stopped cleanly. Server: 445 tests pass; server and web typechecks pass. Breaking each fix one at a time (late round registration, no retry wait, failure key without reason, no forgetting on a change by hand, warning after a fallback, no `skip`, rounding of the window, `retryAt` ignored, `targetWindow` missing) makes a test fail; the fake hub stops emitting its change after 5 switches and refuses a 21st report, so a regression fails instead of looping. A round also stops, with a log line, if it is handed a machine already in `skip`.
- [x] 5.10 (Adversarial review, second run) Store the target's window under its limit after a fallback switch in `AccountRotation`; replace the test that restates `DEFAULT_ACCOUNT_ROTATION` (the default is tested through a new `SettingsStore`) and the one that copies the push texts whole by checks that each branch names the machine, the accounts, the limit and the percentage; run the mutation checks again, capped in memory and time.
- [x] 5.11 (PR #69 review, round 1) A machine still `connecting` is left out of the round: `RotationDeps.machines()` gives each machine's `HostStatus`, `AccountRotation` decides only `ok` (connected) and `error` (not connected) machines; write the failing test first (a connecting machine over a threshold gets no report, and is switched once it is `ok`), then fix design D1's wording of the inputs and the actions (design D1, D7).
- [x] 5.12 (PR #69 review, round 1) Merge `origin/master` into the branch (a merge, not a rebase: the pull request is already pushed and is squash-merged, so no force push is needed) (PR #68 added a field to `HubSettings` and `DEFAULTS` and tests at the end of `settings.test.ts`): keep both fields and both sets of tests, end the changelog description with a full stop, then run `pnpm --filter server test`, both typechecks, `ka features-check`, `ka docs-check` and the boot smoke test again.
  - Merged `origin/master` (PR #68 and release 1.29.0): `HubSettings` and `DEFAULTS` keep `accountRotation` and `mute`, load sanitises both, `forgetHost` keeps its docstring with the automatic switch, and both sets of tests stay. Server: 471 tests pass; server and web typechecks, `ka docs-check`, `ka features-check` and the boot smoke test pass. The changelog description ends with a full stop.

## 6. The panel (`web`)

- [x] 6.1 Add a «Cambio automático de cuenta» section to Ajustes › Máquinas (`MachineSettings` in `web/src/components/Settings.tsx`): the two thresholds as number fields saved on blur, and one toggle per machine, writing `hub.send({ t: 'settings', settings: { accountRotation } })`, with a text that says the hub only switches to accounts it holds a spare login of and switches again a machine moved back by hand while it stays over a threshold.
- [x] 6.2 Show `account` events in «Actividad» (`web/src/components/Activity.tsx`): icon 🔄, the texts for a switch («Cuenta cambiada de s1 a s2: límite de 5 h al 91 %»), no target and a failure, listed only under «Todo».
- [x] 6.3 Run `pnpm --filter web typecheck`, then check by hand against an isolated hub with the Vite dev server, on a phone-sized and a wide viewport: the thresholds and toggles save and come back after a reload, and an `account` event renders in «Actividad».
  - Done against an isolated hub (throwaway `dataDir`, two made-up machines on unroutable addresses, no local machine) serving the built panel instead of the Vite dev server, at 1280×900 and 390×844: turning on a machine and setting 80 % saved `accountRotation` in `settings.json`; 150 showed «Tiene que ser un número entero del 1 al 100.» and went back to 95; the values came back after a reload; the three `account` entries rendered in «Actividad» under «Todo» (red for the failure, yellow for no target). The test browser has no emoji font, so 🔄 (and every other emoji icon of the panel) showed as a box there.

## 7. Run tests, typecheck and lint

- [x] 7.1 Run `pnpm --filter server test` and `pnpm --filter server typecheck` (server and shared) and verify both pass.
- [x] 7.2 Run `pnpm --filter web typecheck` and verify it passes.
- [x] 7.3 Run the project checks that `ka scope` says apply (`ka features-check`, `ka docs-check`) and verify they pass; record the ones that do not apply.
  - `ka scope`: both apply. `ka features-check` exit 0, with the requirements of `account-auto-switch` pending for step 6 (12 after the review fixes); `ka docs-check` exit 0, no dead reference. Server: 434 tests pass; server and web typechecks pass.

## 8. Documentation and changelog

- [x] 8.1 Run `/ka:update-docs` (a new `HubSettings` field, a new `ActivityEvent` kind and a user-visible flow): add the rotation module and its wiring where `server-standards.md` describes the accounts, if it introduces a pattern to follow.
  - `docs/dev-standards/server-standards.md` (Conventions: a machine's account changes only through `AccountManager.switchHost`, also from `rotation.ts`); `docs/dev-standards/web-standards.md` (Conventions: the save-on-blur rule covers `type="number"` fields; Testing: `rotation.ts` among the shared modules tested from `server/src`).
- [x] 8.2 Add a changelog entry with `/ka:changelog` (es-ES) for the automatic account switch.
  - `changelogs/unreleased/20261120T152906692-feature-64-rotar-sola-la-cuenta-de-una-maquina-cuando-se-acerque.json` (added, server, Issue #64).
- [x] 8.3 (Adversarial review) Add to the conventions of `docs/dev-standards/server-standards.md` that `AccountManager` emits `'change'` synchronously inside `switchHost`, so a service driven by that event registers its run before it starts; run `ka docs-check`.

## 9. Review loop and feature catalogue

- [x] 9.1 Run `/opsx:verify`, then `/ka:adversarial-review auto-switch-account-near-limit` (the change wires a new service and changes the settings and activity payloads), and fix its CRITICAL, HIGH and MEDIUM findings through the artifacts.
  - First run: one HIGH (rounds re-entered from the synchronous `'change'` of `switchHost`), three MEDIUM and LOW findings; fixed by tasks 3.7, 3.8, 5.7 to 5.9 and 8.3. Second run, after the fix: the eight fixes hold; two MEDIUM (warnings kept per machine instead of per limit; the retry requirement contradicted the change by hand) and three LOW, fixed by tasks 3.9, 3.10 and 5.10, with the spec and the design amended. The second fix touches no wiring, payload or migration, so the review does not run a third time. Server: 447 tests pass; typechecks, `ka docs-check`, `ka features-check` and the boot smoke test pass; 16 capped mutations each make a test fail.
- [ ] 9.2 Commit with `/ka:commit --pr` and run the bounded review loop (`/ka:review-pr`, `ka review-rounds record`, `ka review-rounds gate`) until the gate passes.
- [ ] 9.3 Run `/ka:update-features auto-switch-account-near-limit`, then `ka features-check --strict` (exit code 0), and commit with `/ka:commit`.
- [ ] 9.4 E2E: the project has no E2E suite; this step does not apply.
- [ ] 9.5 Human review: ask the owner with `AskUserQuestion` who reviews the pull request, and record the answer here.

## 10. Before the archive

- [ ] 10.1 Run `ka features-check --strict` and verify the exit code is 0.

## Workflow follow-up

- `/opsx:archive`, `/ka:commit` of the archive moves, check that the pull request's head matches `git rev-parse HEAD`, and merge with `gh pr merge --squash --match-head-commit <sha>` once the owner approves or takes it as good.
- Follow the `deploy` run of the merge commit with `gh run watch`.
- Offer to comment on Issue #64 with the pull request link and close it, and to remove the worktree with `/ka:git-worktree remove`.
- Propose a release with `ka changelog release --dry-run` once the feature is merged, deployed and checked.
