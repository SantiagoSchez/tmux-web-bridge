# Tasks

## 1. Create the branch

- [x] 1.1 Create `feature/51-horario-de-descanso-sin-notificaciones` from `master` in its own worktree with `/ka:git-worktree create`; verify `git branch --show-current` prints it

## 2. Review the existing tests

- [x] 2.1 Read `server/src/notifications.test.ts`, `server/src/settings.test.ts` and the schedule tests in `server/src/automations.test.ts`; record one line per module ("tests up to date" or "tests updated/added in this change")
  - `notifications.test.ts`: tests updated/added in this change (its `fakePush` gains `quiet()`, new quiet-schedule tests).
  - `settings.test.ts`: tests updated/added in this change (quiet-schedule setting).
  - `automations.test.ts`: tests up to date (schedules unchanged; the day picker move is UI only).
  - `push.ts`: no tests yet; added in this change (`push.test.ts`).

## 3. The quiet-schedule rule in `shared/`

- [x] 3.1 Add the `QuietHours` type and the `HubSettings.quietHours` field to `shared/types.ts`, documented (design D1); verify `pnpm --filter server typecheck` reports only the missing settings default
- [x] 3.2 Write failing tests in `server/src/quiet-hours.test.ts` for `isQuietAt`: a window crossing midnight belongs to its start day (Friday 22:00–08:00 silences Saturday 03:00, not Friday 21:59, not Saturday 08:00, not Sunday 03:00 when only Friday is listed), a window inside one day, a whole day from 00:00 to 23:59 that does not reach the next day, and a schedule that is off; see them fail
- [x] 3.3 Write failing tests for `quietHoursProblem` and `sanitizeQuietHours`: equal start and end is refused with «La franja no puede empezar y acabar a la misma hora», bad `HH:MM` and days outside 0–6 are refused, days are deduplicated and sorted, empty day lists are valid; see them fail
- [x] 3.4 Implement `shared/quiet-hours.ts` (`DEFAULT_QUIET_HOURS`, `isQuietAt`, `quietHoursProblem`, `sanitizeQuietHours`, `describeQuietHours` for the panel's one-line summary, including the case that silences nothing) with no Node or DOM import; verify the tests of 3.2 and 3.3 pass
- [x] 3.5 Review fix R1-01 (PR #59): write failing tests in `server/src/quiet-hours.test.ts` for `editQuietHours(current, typed, patch)` (design D5): a day tapped with a valid typed time saves both; typed times that equal each other block a time save and report the problem; a day tapped with refused typed times saves the day with the hub's times; see them fail, then implement it in `shared/quiet-hours.ts` and see them pass

## 4. The hub setting

- [x] 4.1 Write failing tests in `server/src/settings.test.ts`: a new hub starts with the default schedule off; a valid patch is kept and survives a reload; an invalid patch (08:00 to 08:00) keeps the previous schedule; turning it off keeps the window and days; an invalid saved schedule falls back to the default; see them fail
- [x] 4.2 Add `quietHours` to `DEFAULTS`, to `update()` and to the constructor of `server/src/settings.ts` using `sanitizeQuietHours`; verify the tests of 4.1 pass

## 5. The gate in front of Web Push

- [x] 5.1 Write failing tests in `server/src/notifications.test.ts`: a notice inside the quiet schedule is not pushed, returns `{ pushed: false, reason: 'quiet hours' }` and logs a `[push]` line naming the window and «horario de descanso»; a pane icon turning ✅ inside it pushes nothing; the same notice outside it is pushed; see them fail
- [x] 5.2 Write failing tests for `PushService.send` (a new `server/src/push.test.ts` with a temporary `dataDir`, Web Push faked at its network boundary): inside the quiet schedule it sends nothing, returns 0 and logs the line; with `evenWhenQuiet` it sends; see them fail
- [x] 5.3 Implement design D4 in `server/src/push.ts` (`quiet` constructor dependency, `quiet()`, `send(..., { evenWhenQuiet })`) and `server/src/notifications.ts` (`onScriptNotify` after the seen and watched checks, `fallback` before the capture); verify the tests of 5.1 and 5.2 pass
- [x] 5.4 Wire it in `server/src/index.ts`: construct `PushService` with `() => isQuietAt(settings.value.quietHours, new Date())` (moving the construction after `settings` if needed) and pass `{ evenWhenQuiet: true }` from `POST /api/push/test`; verify `pnpm --filter server typecheck` passes
- [x] 5.5 Boot smoke test: start the hub with a temporary `dataDir`, its own `TMUX_TMPDIR`, no `TMUX`/`TMUX_PANE` and no `local` machine, wait for its listening log line, stop it; verify it starts with no error
- [x] 5.6 Audit every producer and consumer of `HubSettings` and of `PushService.send` (`grep -rn "HubSettings\|push.send" server web shared trello-extension`) and confirm each one still compiles and needs no change beyond this task group; record the list in the task
  - `HubSettings`: produced by `server/src/settings.ts` (default, load, `update()`); consumed by `web/src/state.ts` (`hubSettings` signal, written by `ws.ts`) and, from task group 6, `QuietHoursSettings` in `Settings.tsx`. `trello-extension` does not use it.
  - `PushService.send`: `Notifier.deliver()` (both calls, after the quiet check), the automation error handler in `index.ts` (dropped inside the schedule), `POST /api/push/test` (`evenWhenQuiet: true`). `new PushService` only in `index.ts`.
  - Boot smoke test (5.5): the hub printed «tmux-web-bridge escuchando en http://127.0.0.1:17991 (0 máquinas, …)» and stopped cleanly.

## 6. The «Notificaciones» section in Settings

- [x] 6.1 Move the day chips of `web/src/components/Automations.tsx` into a `DayPicker` component and use it there; verify `pnpm --filter web typecheck` passes and the automation form still toggles days in the browser
- [x] 6.2 Add `'notifications'` to `SettingsTab` (`web/src/state.ts`), its entry in `SECTIONS` and its case in `SettingsSection` (`web/src/components/Settings.tsx`), and `QuietHoursSettings` in `web/src/components/Settings.tsx` with the switch, «Desde», «Hasta», the window's days, the whole days and the summary from `describeQuietHours`, validating with `quietHoursProblem` before `hub.send({ t: 'settings', settings: { quietHours } })` (design D5); styles in `web/src/styles.css`; verify `pnpm --filter web typecheck` passes
- [x] 6.3 Check it by hand against a hub started as in 5.5 with the Vite dev server, at a phone-sized and a wide viewport: turning it on and off keeps the window, 08:00 to 08:00 shows the error and sends nothing, a reload shows the saved schedule
  - Checked with agent-browser at 1280×900 and 390×844. It found that Chrome fires `change` on every digit of a time field (typing «08» saved 00:00 on the way), so the times are now kept as typed and saved when the field loses focus (design D5). After the fix: «08» then leaving the field shows «La franja no puede empezar y acabar a la misma hora» and `settings.json` keeps the previous time; «22» saves 22:00; turning it off keeps window and days; a reload shows them. In the automation form, marking Sunday adds Sunday to «Próximas».
- [x] 6.4 Review fix R1-01 (PR #59): in `QuietHoursSettings`, compute every save with `editQuietHours` over `hubSettings.value.quietHours` read when the control fires, write the result into `hubSettings` before `hub.send`, and set the fields to the saved times (design D5); verify `pnpm --filter web typecheck` passes
- [x] 6.5 Check by hand, as in 6.3: type 23:00 in «Desde» and tap «V» without leaving the field, then tap «L» and «M» in a row; after a reload, «Desde» is 23:00 and Friday, Monday and Tuesday keep the state they were given
  - Checked with agent-browser at 1280×900: typing 23 then tapping «V», «L» and «M» saved `from: 23:00, days: [0, 3, 4, 6]` in `settings.json`, and the reload showed the same; «08» then leaving the field still shows the error and saves nothing.

## 7. Tests, typecheck and lint

- [x] 7.1 Run `pnpm --filter server test`, `pnpm --filter server typecheck` and `pnpm --filter web typecheck`; all pass
- [x] 7.2 Run `ka scope`, then `ka features-check` and `ka docs-check` where they apply (report the others as not applicable); they pass

## 8. Documentation and changelog

- [x] 8.1 Run `/ka:update-docs` (a new hub setting and a user-visible flow) and verify the standards documents it touched
- [x] 8.2 Add the changelog entry with `/ka:changelog`; verify the file under `changelogs/unreleased/`

## 9. Feature catalogue

- [ ] 9.1 Run `/ka:update-features quiet-hours`, then `ka features-check --strict` (exit code 0), and commit with `/ka:commit`

## 10. E2E pipeline

- [x] 10.1 The project has no E2E suite: record here that this step does not apply
  - Not applicable: the project has no E2E suite (`ka scope`: «the project has no E2E suite»).

## 11. Human review

- [ ] 11.1 After `ka review-rounds gate` passes, ask the owner with `AskUserQuestion` who reviews the pull request, and record the answer here

## 12. features-check before the archive

- [ ] 12.1 Run `ka features-check --strict` as the last task before `/opsx:archive`; exit code 0

## Workflow follow-up

- `/opsx:verify`, commit and pull request with `/ka:commit --pr`, the bounded review loop with `/ka:review-pr` and `ka review-rounds`.
- `/opsx:archive`, `/ka:commit`, merge with `gh pr merge --squash --match-head-commit`, follow the `deploy` run, then offer the Issue #51 comment and the worktree removal.
