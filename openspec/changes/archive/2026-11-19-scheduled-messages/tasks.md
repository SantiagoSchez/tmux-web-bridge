# Tasks

## 1. Create the branch

- [x] 1.1 Create `feature/50-programar-mensajes-de-un-solo-uso` from `master` in its own worktree with `/ka:git-worktree create`; verify `git branch --show-current` prints it

## 2. Review the existing tests

- [x] 2.1 Read `server/src/automations.test.ts`, `server/src/activity.test.ts` and `server/src/settings.test.ts`; record one line per module ("tests up to date" or "tests updated/added in this change"), and note that `scheduled.ts` and `shared/scheduled.ts` are new and get their tests in this change
  - `automations.test.ts`: tests up to date (the scheduler is unchanged; only its launch wiring in `index.ts`, which has no tests, moves to `launchOnHost`).
  - `activity.test.ts`: tests up to date (the store keeps any `source`; only the type's union grows).
  - `settings.test.ts`: tests up to date (no hub setting changes).
  - `server/src/scheduled.ts` and `shared/scheduled.ts`: new; tests added in this change (`scheduled.test.ts`, `scheduled-rules.test.ts`).

## 3. Types and the rules in `shared/`

- [x] 3.1 Add `ScheduledMessage`, `ScheduledMessageInput`, the `{ t: 'scheduled' }` `ServerMessage` variant and the `'scheduled'` activity source to `shared/types.ts`, documented (design D2); verify `pnpm --filter server typecheck` passes
- [x] 3.2 Write failing tests in `server/src/scheduled-rules.test.ts` for `scheduledProblem` (design D3): a missing name, folder or prompt, a time not in the future («Esa hora ya ha pasado»), an invalid base branch with a worktree, a valid message; see them fail
- [x] 3.3 Write failing tests for `limitSuggestions` (design D6): the spec's Tuesday example gives Wednesday 12:00, Thursday 00:00, Thursday 09:00 and today 15:40 in that order; a weekly reset 2 hours away gives none of the three weekly ones; no resets give none; times are rounded down to the minute; see them fail
- [x] 3.4 Implement `shared/scheduled.ts` with no Node or DOM import; verify the tests of 3.2 and 3.3 pass

## 4. The store and scheduler

- [x] 4.1 Write failing tests in `server/src/scheduled.test.ts` with a temporary `dataDir`, a fake `launch`, a fake `check` and a fake clock (design D1, D4): a pending message launches once at its time with its options and records the window; its worktree is named after the planned time; a message whose time passed while the hub was stopped launches on the first tick with `late` and its `at`; a message launched on the tick right after its time is not `late`; a message found `launching` on load becomes an error «El hub se reinició mientras lo lanzaba» and is not launched; a tick that runs while a slow launch is in progress does not launch it again; a failing launch records the error; a result older than 7 days leaves the list and one of 6 days stays; see them fail
- [x] 4.2 Write failing tests for the edits: create, edit a pending one (the new time is the one that launches), cancel a pending one (nothing launches), refuse an edit of a launched one, refuse a delete while launching, remove a result, refuse an unknown id, refuse a machine or folder `check` rejects, refuse a message beyond 50; the list survives a reload; see them fail
- [x] 4.3 Implement `ScheduledMessages` in `server/src/scheduled.ts`; verify the tests of 4.1 and 4.2 pass

## 5. Wiring and routes in `server/src/index.ts`

- [x] 5.1 Extract `launchOnHost` from the automations wiring and use it for both (design D5); verify the automation tests still pass
- [x] 5.2 Construct `ScheduledMessages` with `launch` and `check`, start it next to `automations.start()`, broadcast `{ t: 'scheduled' }` on change, send it in the `/ws` snapshot, add the activity and the error push on `'run'`, and add `GET /api/scheduled`, `POST /api/scheduled` and `POST /api/scheduled/:id/delete` with the status codes of design D5; verify `pnpm --filter server typecheck` passes
- [x] 5.3 Boot smoke test: start the hub with a temporary `dataDir`, its own `TMUX_TMPDIR`, no `TMUX`/`TMUX_PANE` and no `local` machine, wait for its listening log line, stop it; verify it starts with no error
  - The hub with no machine printed «tmux-web-bridge escuchando en http://127.0.0.1:17991 (0 máquinas, …)» and stopped cleanly.
- [x] 5.4 Check the routes with `curl` against that hub: create (200), a time in the past (400), an unknown machine (400), list, edit, delete an unknown id (404), delete; record the results here
  - Against an isolated hub with a `local` machine (own `TMUX_TMPDIR`, `-L twb50`, a fake `claude`): create 200; a past time 400 «Esa hora ya ha pasado»; machine `mac` 400 «No existe la máquina «mac»»; a folder not saved 400 «Esa carpeta no está entre las de Local»; edit a pending one 200; edit and delete an unknown id 404 «Ese mensaje programado ya no existe»; cancel 200; list.
  - A message for 50 s later launched on the next check: window «twb:Repasar tests» running the fake claude, `status: launched` with its window and pane, `[programados] Repasar tests: launched` in the log, a `launch` event with `source: scheduled` in the activity. Editing it then answered 409 «Ese mensaje ya se ha lanzado»; removing it, 200.
  - A message with a worktree in a folder outside git failed at its time: `status: error` with «La carpeta no está en un repositorio git: no se puede crear un worktree», and an `error` event with `source: scheduled` (no `[push]` line: the test hub has no subscribed device).
- [x] 5.5 Audit every producer and consumer of `ServerMessage`, `ActivityEvent.source` and the automations' launch dependency (`grep -rn "ServerMessage\|source:\|ActivityEvent\|launchTask(" server web shared trello-extension`) and confirm each one handles the new variant and source or needs no change; record the list here
  - `ServerMessage`: produced by `send()`/`broadcast()` in `server/src/index.ts` (the new `scheduled` broadcast and snapshot); consumed by `onMessage` in `web/src/ws.ts` (its `case` comes in task 6.1). `trello-extension` does not use it.
  - `ActivityEvent.source`: produced by `activity.add` in `server/src/index.ts` (automations, scheduled messages, `logLaunch`); consumed by `SOURCE` and `what()` in `web/src/components/Activity.tsx` (task 6.5); `server/src/activity.ts` stores it as is.
  - Launch dependency: `launchOnHost` serves `Automations` and `ScheduledMessages`; the other `launchTask` callers (the panel's `launchTask` action, `launchFromRequest`) are unchanged.

## 6. The panel

- [x] 6.1 Add the `scheduled` signal and the `{ kind: 'scheduled' }` dialog to `web/src/state.ts`, set the signal from `web/src/ws.ts`, and add `scheduledFolded` to `web/src/prefs.ts`; verify `pnpm --filter web typecheck` passes
- [x] 6.2 Move the launch fields of `AutomationForm` into `web/src/components/LaunchFields.tsx` (`useLaunchFields`, `LaunchTargetFields`, `LaunchOptionFields`) used by `web/src/components/Automations.tsx`; verify `pnpm --filter web typecheck` passes and the automation form still creates and edits an automation in the browser
  - In the browser (1280×900): a new automation «Deps nocturnas» on folder `twb` saved to `automations.json` with its folder and prompt; editing its prompt kept the folder and saved the new prompt.
- [x] 6.3 Export `machineLimits(hostId)` from `web/src/components/LimitsBar.tsx` (design D6)
- [x] 6.4 Write `web/src/components/Scheduled.tsx`: `ScheduledDialog` (launch fields, `datetime-local`, suggestion chips, `scheduledProblem` before sending, the hub's refusal shown) rendered by `web/src/components/Dialogs.tsx`, and `ScheduledList` with the rows and actions of design D7; add `IconScheduled` to `web/src/components/icons.tsx` and the button in both header variants of `web/src/components/Tree.tsx`; put `ScheduledList` at the top of `web/src/components/Scratchpads.tsx`; styles in `web/src/styles.css`; verify `pnpm --filter web typecheck` passes
- [x] 6.5 Add the `scheduled` source to `web/src/components/Activity.tsx`; verify `pnpm --filter web typecheck` passes
- [x] 6.6 Check it by hand against a hub started as in 5.3, with a fake machine (an isolated `tmux -L` server, never the user's) and the Vite dev server, at a phone-sized and a wide viewport: the sidebar button opens the form with that machine; a message saved for two minutes later shows in «Programados», launches its window at its time, shows «Ir a la ventana», and opens it; editing and cancelling a pending one work; a time in the past shows the error; folding the section survives a reload; the activity list shows the launch; record what was checked here
  - Hub as in 5.4, its test tmux started with `-f /dev/null` (without it, the user's `~/.tmux.conf` restored the real sessions into the test server, `claude --resume` included; stopped at once), and Vite on 5288, with agent-browser at 1280×900 and 390×844.
  - The clock button next to «Nuevo espacio» opened «Programar mensaje» with machine Local. The account of this machine offered the two suggestions still to come («3 h antes del reinicio semanal», «Cuando se reinicie el límite de 5 h»), and a chip filled the date and time. A time two hours back showed «Esa hora ya ha pasado» with «Programar» disabled.
  - Saved, the message showed in «Programados (1)» with «Editar» and «Cancelar». «Editar» opened it with its values, and moving it to two minutes later saved the new time. It launched at that time: space `twb`, window «Repasar tests» running the fake claude with the prompt, the row showing «Lanzado el …» with «Ir a la ventana» (it opened `#/h/local/w/1`) and «Quitar». The activity showed «Lanzado el mensaje programado «Repasar tests»».
  - «Cancelar» on a second one asked for confirmation and removed it. Folded, the section stayed folded after a reload.
  - On the phone, the form fits the sheet and the section sits at the top of the right drawer. «Ir a la ventana» opened the window and closed the drawer. «Quitar» removed the last message and the section went away.

## 7. Tests, typecheck and lint

- [x] 7.1 Run `pnpm --filter server test`, `pnpm --filter server typecheck` and `pnpm --filter web typecheck`; all pass
  - 391 tests pass; both typechecks report no error.
- [x] 7.2 Run `ka scope`, then `ka features-check` and `ka docs-check` where they apply (report the others as not applicable); they pass
  - `ka scope`: both checks apply, no E2E suite. `ka features-check` passes (exit 0) with the 11 requirements of this change pending for step 9; `ka docs-check` passes with no dead reference.

## 8. Documentation and changelog

- [x] 8.1 Run `/ka:update-docs` (new REST routes, a websocket message, a data file and a user-visible flow) and verify the standards documents it touched; add the feature to the README
  - `server-standards.md`: `scheduled.json` among the stores; the `launchOnHost()` and «saved as launching before the launch» conventions; the tmux isolation of tests now points to the testing standards.
  - `testing-standards.md`: test tmux servers start with `-f /dev/null`, and a test hub's `local` machine gets a `tmux` wrapper that does.
  - `web-standards.md`: forms of tasks launched later use `LaunchFields.tsx`; the manual-check line points to the testing standards for the isolation.
  - `README.md`: the «Mensajes programados» feature. `ka docs-check` passes.
- [x] 8.2 Add the changelog entry with `/ka:changelog`; verify the file under `changelogs/unreleased/`
  - `changelogs/unreleased/20261119T215125309-feature-50-programar-mensajes-de-un-solo-uso.json` (`added`, `server`, Issue 50; the PR number is added when the pull request opens).

## 9. Feature catalogue

- [x] 9.1 Run `/ka:update-features scheduled-messages`, then `ka features-check --strict` (exit code 0), and commit with `/ka:commit`
  - New area «Mensajes programados» in `docs/FEATURES.md`, with its index line and 11 sections, one per requirement. `ka features-check --strict`: 82 sections verified, exit 0.

## 10. E2E pipeline

- [x] 10.1 The project has no E2E suite: record here that this step does not apply
  - Not applicable: the project has no E2E suite (`ka scope`: «the project has no E2E suite»).

## 11. Human review

- [x] 11.1 After `ka review-rounds gate` passes, ask the owner with `AskUserQuestion` who reviews the pull request, and record the answer here
  - The gate passed on `051cdbd` after 2 rounds. The owner takes PR #63 as good, with no manual review.

## 12. features-check before the archive

- [x] 12.1 Run `ka features-check --strict` as the last task before `/opsx:archive`; exit code 0
  - 82 sections verified, exit 0.

## Workflow follow-up

- `/opsx:verify`, commit and pull request with `/ka:commit --pr`, the bounded review loop with `/ka:review-pr` and `ka review-rounds`.
- `/opsx:archive`, `/ka:commit`, merge with `gh pr merge --squash --match-head-commit`, follow the `deploy` run, then offer the Issue #50 comment, the worktree removal, and release 1.28.0 with Issues #50 and #51.
