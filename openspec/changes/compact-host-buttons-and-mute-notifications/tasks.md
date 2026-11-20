# Tasks

## 1. Branch (mandatory step 1)

- [x] 1.1 Create the branch `chore/compact-host-buttons-and-mute-notifications` from `origin/master` in its own worktree with `/ka:git-worktree create` (a chore with no work item). Verify with `git branch --show-current`.
  - Created; `git branch --show-current` prints `chore/compact-host-buttons-and-mute-notifications`, based on `f8b47d0`.

## 2. Review the existing tests (mandatory step 2)

- [x] 2.1 Read the tests of the modules the change touches (`server/src/push.test.ts`, `server/src/notifications.test.ts`, `server/src/settings.test.ts`, `server/src/quiet-hours.test.ts`) and output one line per module saying "tests up to date" or "tests updated/added in this change". The quiet-schedule tests of `push.test.ts` and `notifications.test.ts` build `PushService` and the fake push with a boolean `quiet`; they are updated in group 4 to the reason the callback now returns (design D3), keeping what they assert.
  - `server/src/push.test.ts`: tests updated in this change (the `quiet` callback returns a reason).
  - `server/src/notifications.test.ts`: tests updated in this change (`fakePush` takes a reason).
  - `server/src/settings.test.ts`: tests added in this change (mute and unmute).
  - `server/src/quiet-hours.test.ts`: tests up to date.

## 3. The mute's pure logic in `shared/` (design D1, D2, D5)

- [x] 3.1 Write failing tests in `server/src/mute.test.ts` for `isMutedAt` (not muted with `null`; muted before `until` and not at `until`; muted forever with `until: null`), `muteUntil(hours, now)` (`null` hours gives `{ until: null }`; 2 hours from 15:00 gives 17:00), `sanitizeMute` (keeps `null`, `{ until: null }` and a finite positive `until`; drops other keys; anything else is `null`) and `describeMute` («Silenciadas hasta nuevo aviso», «Silenciadas hasta las 18:00», «Silenciadas hasta mañana a las 02:00»). Verify: `pnpm --filter server test` fails on them because the module does not exist.
- [x] 3.2 Add `NotificationMute` and the `mute` field of `HubSettings`, documented, to `shared/types.ts`, and `shared/mute.ts` with `MUTE_HOURS`, `MuteHours`, `isMutedAt`, `muteUntil`, `sanitizeMute` and `describeMute`. Verify: the tests of 3.1 pass, and each one fails when its line is inverted.
  - Written one function at a time; each new test failed against an empty function before its code. `shared/mute.ts` also has `isMuteHours`, the guard the hub applies to a device's `hours` (D2). 10 tests pass. The three that passed against the empty functions (no mute, until further notice, malformed file) each fail when its line is broken: `mute === null ||`, `now + (hours ?? 0) * HOUR`, and a `sanitizeMute` that keeps any `until`.

## 4. The hub keeps the mute and holds pushes back (design D1 to D3)

- [x] 4.1 Write failing tests in `server/src/settings.test.ts`: `mute(2, now)` saves `{ until: now + 2 h }` and emits `'change'`; `mute(null, now)` saves `{ until: null }`; `mute(4, now)` changes nothing; `unmute()` saves `null`; `update({ mute: … })` changes nothing; a new store over the saved file loads the mute; a file with a malformed `mute` or without it loads `null`. Verify: they fail.
- [x] 4.2 Implement `SettingsStore.mute()` and `unmute()`, `mute: null` in `DEFAULTS` and `sanitizeMute` on load. Verify: the tests of 4.1 pass.
  - 7 new tests failed first (`mute` undefined, no `mute()`), then pass with the other 19. `mute()` takes `hours: unknown` and checks it with `isMuteHours`, so the store refuses a bad duration whoever calls it. Breaking the duration guard, the load sanitising or the unmute's `'change'` makes its test fail.
- [x] 4.3 Update the tests of `server/src/push.test.ts` and `server/src/notifications.test.ts` to a `quiet` callback that returns `QuietReason | null`, and add failing tests: a muted push is not sent and logs `no se envía, las notificaciones están silenciadas`; the test notification goes out while muted; `onScriptNotify` while muted answers `{ pushed: false, reason: 'muted' }` and logs the pane with the mute's reason. Verify: the new ones fail and the existing quiet-schedule ones still pass once adapted.
  - The quiet-schedule tests now pass `'quiet hours'` (or `null`) and still pass. New: the muted push and the muted `onScriptNotify` failed on the log text and the reason before 4.4; the test notification while muted passes as a guard.
- [x] 4.4 Change `PushService` to take `quiet: () => QuietReason | null` and log the reason; change `Notifier.quiet()` to log and answer with it. Verify: `pnpm --filter server test` passes.
  - The log texts (`QUIET_LOG`) live in `push.ts`, which re-exports `QuietReason` from `shared/mute.ts` (moved there by 4.8); `Notifier.quiet()` returns the reason. `pnpm --filter server test`: 417 pass at this point.
- [x] 4.5 In `server/src/index.ts`, build `PushService` with the function of D3 (mute first, then the quiet schedule), and handle the `ClientMessage` variants `{ t: 'mute'; hours }` (ignored unless `hours` is `null` or in `MUTE_HOURS`) and `{ t: 'unmute' }`, added to `shared/types.ts`. Verify: `pnpm --filter server typecheck` passes.
  - The guard on `hours` lives in `SettingsStore.mute()` (4.2), so the handler passes `msg.hours` as it comes. `pnpm --filter server typecheck` and `pnpm --filter web typecheck`: exit 0.
- [x] 4.6 Boot smoke test (the wiring of `PushService` changed): start the hub on a temporary `dataDir` with no machines (an isolated `TMUX_TMPDIR`, no `TMUX`), wait for its ready log line, send `{ t: 'mute', hours: 1 }` over `/ws` and check the `settings` broadcast carries a `mute` one hour ahead, then stop it. Verify: the ready line and the broadcast are seen; record both here.
  - A script in the session scratchpad started the hub (`npx tsx src/index.ts`) with its own config, port 7791, `dataDir`, `ssh.controlDir` and `TMUX_TMPDIR`, without `TMUX`. Ready line: `tmux-web-bridge escuchando en http://127.0.0.1:7791 (0 máquinas, …)`. The `settings` broadcasts seen by a `/ws` client: `null` (snapshot), the mute of `hours: 1` ending 60 minutes after it was sent, nothing for `hours: 4`, `null` after `unmute`; `settings.json` ends with `mute: null`. The hub was stopped and the port checked free.
- [x] 4.7 Payload audit: list every producer and consumer of `HubSettings` and of `ClientMessage` (server `index.ts` and `settings.ts`, `web/src/ws.ts`, `web/src/state.ts`, the settings components, `trello-extension/` if it reads either) and of the `reason` of `POST /api/notify` (the host kit), and confirm each was updated or needs nothing. Record the list here.
  - `HubSettings`: produced by `server/src/settings.ts` (new `mute` in `DEFAULTS`, sanitised on load, set only by `mute()`/`unmute()`), broadcast and sent in the snapshot by `server/src/index.ts` (unchanged code). Consumed in `web/src/ws.ts` and `web/src/state.ts` (stored whole) and read field by field in `web/src/menus.ts`, `dictation.ts` and the components `Settings`, `ExtToken`, `WindowView`, `KeybarSettings`, `Scheduled`, `Mic`, `Dialogs`, `TerminalView`, `Machines`, `ShortcutSettings`, `Trello` and `Folders`; the optimistic updates spread the current value, so none needs a change (`pnpm --filter web typecheck` passes). The bell (group 5) is the new reader. `trello-extension/` reads neither type.
  - `ClientMessage`: produced only by `web/src/ws.ts` (`hub.send`), consumed only by the `/ws` handler of `server/src/index.ts`, which handles `mute` and `unmute`.
  - `reason` of `POST /api/notify`: the host kit's callers (`host-kit/tmux-window-title.sh`, `host-kit/install.sh`) discard the body; nothing reads it.

- [x] 4.8 Found by `/opsx:verify`: the precedence of the mute over the quiet schedule was an inline expression of `index.ts` no test ran. Write failing tests in `server/src/mute.test.ts` for `quietReason` (neither, only muted, only the quiet schedule, both: `'muted'`), then move `QuietReason` and `quietReason` to `shared/mute.ts` (design D3), re-export the type from `push.ts`, and make `index.ts` call it. Verify: the tests fail first, then `pnpm --filter server test` and `pnpm --filter server typecheck` pass, and swapping the two checks inside `quietReason` makes the «both» test fail.
  - 4 tests; 3 failed against an empty `quietReason`, the «neither» one passes as a guard. `pnpm --filter server test`: 421 pass; both typechecks exit 0. Swapping the checks fails «muted inside the quiet schedule, the reason is the mute». The boot smoke test of 4.6, run again: same ready line and broadcasts.

## 5. The panel: bell, Actividad menu and host head (design D4 to D6)

- [x] 5.1 Add `IconBell` and `IconBellOff` to `web/src/components/icons.tsx` and redraw `IconScheduled` as an alarm clock (face, hands, two bells, two feet, 18px). Verify by eye at 18px in the light and dark themes.
  - Also `IconChevronDown` (16px) for the views button. `MenuItem.icon` (`web/src/state.ts`) widens from `string` to `ComponentChildren`, so the «Actividad» item keeps its pulse icon (`IconActivity`), and `.menu-icon svg` centres it. Seen at 3x in both themes: the alarm clock, the bell and the chevron read clearly.
- [x] 5.2 In `web/src/components/Header.tsx`, replace the Actividad button with the chevron button and its menu («Actividad» opens the activity sheet), and add `MuteButton` (menu of 1, 2, 3, 5 hours and «Hasta nuevo aviso» when not muted; crossed bell with `describeMute` as `title` and `aria-label`, one tap to unmute, when muted; a timeout to the exact end that bumps `clock`). Add their styles in `web/src/styles.css`, the chevron narrower than the other top bar buttons. Verify: `pnpm --filter web typecheck` passes.
  - The chevron is 22px wide inside `.views-group` with the grid button; the menus are titled «Más vistas» and «Silenciar notificaciones» (subtitle «En todos los dispositivos. «Enviar prueba» llega igual.»); unmuting shows the toast «Notificaciones activadas». `pnpm --filter web typecheck`: exit 0.
- [x] 5.3 In `web/src/components/Tree.tsx`, wrap the three buttons of both host heads in `.host-btns` and give them `host-btn`; in `web/src/styles.css`, `.host-btn` is 28×36px and `.host-btns` has no gap. Verify: `pnpm --filter web typecheck` passes.
  - `pnpm --filter web typecheck`: exit 0. The space rows keep `.small-btn`.
- [x] 5.4 Check by hand in a browser against a hub started as in 4.6 (the Vite dev server proxying to it), at a phone width (390px) and a wide one: the host head's three buttons take 84px and touch; the alarm clock reads; the grid button still toggles with one tap; the chevron opens «Actividad»; muting for 1 hour turns the bell crossed on a second open tab too, its tooltip says until when, and a tap unmutes on both; a mute whose end passes with the panel open turns the bell back. Record what was seen here.
  - Setup (scripts in the session scratchpad): an isolated tmux (relative socket, `-f /dev/null`, no `TMUX`) with two sessions, a hub on 7792 with two `local` machines on it through a `tmux` wrapper, Vite on 5192, agent-browser at 390×844 and at 1400×900. All stopped afterwards; ports checked free.
  - The host head's buttons: 84px together (252px at 3x), touching, in both machines. The grid button opens the grid with one tap (on a phone the grid is a page with a back arrow, as before). The chevron opens «Más vistas» with «Actividad», which opens the activity sheet.
  - «1 hora» from the phone: both sessions showed the crossed bell labelled «Silenciadas hasta las 17:33. Toca para activarlas.» (an hour after the tap). A tap on the wide session turned both back to «Silenciar notificaciones» and showed «Notificaciones activadas».
  - Expiry: a mute ending 5 s later, put into the panel's own state from the page, showed «Silenciadas hasta las 16:33…» and, 5.5 s later, «Silenciar notificaciones» without a reload.
  - Wiring: muted from the panel, `POST /api/notify` answered `{"pushed":false,"reason":"muted"}` and the hub logged `[push] ✅ linux-box: no se envía, las notificaciones están silenciadas`; after unmuting, the same notice answered `{"pushed":true}`.
  - In the menu of durations the items have no icon, so their labels sit after the empty icon column, like the other menus' items.

## 5b. Findings of the adversarial review (design, Risks)

- [x] 5.5 Unmuting with no connection: in `MuteButton`, when `wsStatus` is not `'open'`, show the error toast «Sin conexión con el servidor central: no se han activado» and change nothing. Verify: `pnpm --filter web typecheck` passes, and in the browser, with the hub stopped, a tap on the crossed bell keeps it crossed and shows the toast.
  - Typecheck exit 0. Muted for 2 hours from the panel, the test hub stopped (its config checked first): a tap kept «Silenciadas hasta las 18:50…» and showed the toast next to «Sin conexión con el servidor central. Reintentando…».
- [x] 5.6 The narrowest top bar: inside `@container (max-width: 380px)`, the chevron narrows to 18px; update the comment that lists the top bar's buttons (it still names «activity»). Verify by hand at the desktop sidebar's 340px with a Trello button and a two-digit pending pill in the bar (put there from the page if Trello is not configured): the pill does not touch the grid's button.
  - At 1400×900 (sidebar 339px), with a Trello-like button and a «12» pill put in from the page: with the chevron at 18px alone, 1.9px were left between the pill and the grid's button (the brand overflowed the bar's 8px gap). With the top bar's buttons also at 32px instead of 34px in that container, 11.9px are left and the name «twb» stays whole. The comment lists «grid and its chevron, bell, Trello, connections, settings».
- [x] 5.7 Tests that add nothing: remove «the test notification goes out even while muted» from `server/src/push.test.ts` (`send()` does not tell the reasons apart, so the quiet-schedule one guards it), and keep one positive case in the duration test of `server/src/mute.test.ts`. Verify: `pnpm --filter server test` passes.
  - 420 pass.
- [x] 5.8 `docs/dev-standards/web-standards.md`: where it says hub settings change with `hub.send({ t: 'settings' })`, say that a setting only the hub decides has its own message (`mute`/`unmute`), linking the server standards. Verify: `ka docs-check` passes.
  - Also says that `hub.send` drops a message while the socket is down, so an optimistic control checks `wsStatus` first. `ka docs-check`: no dead reference.

## 5c. Findings of review round 1 (PR #68)

- [x] 5.9 R1-01: `proposal.md` lists the `mute`/`unmute` `ClientMessage` variants as the contract change, says a `settings` patch cannot carry the mute, and names `web/src/state.ts` among the layers. Verify: `openspec validate --strict compact-host-buttons-and-mute-notifications` passes.
  - Valid.
- [x] 5.10 R1-02 (a suggestion, fixed with the blocker since it is the same defect as 5.5): choosing a duration with no connection shows the error toast «Sin conexión con el servidor central: no se han silenciado» and sends nothing (design, Risks). Verify: `pnpm --filter web typecheck` passes, and in the browser, with the hub stopped, choosing «1 hora» leaves the bell as it was and shows the toast.
  - Typecheck exit 0. The menu opened, the test hub stopped (its config checked first), then «1 hora»: the bell stayed «Silenciar notificaciones» and the toast showed. The connection is read when the duration is chosen, not when the menu opens.

## 6. Tests, typecheck and lint (mandatory step 4)

- [x] 6.1 Run `pnpm --filter server test`, `pnpm --filter server typecheck` and `pnpm --filter web typecheck`; all must pass. Run `ka scope` and the checks it lists (`ka features-check`, `ka docs-check`), reporting the ones that do not apply, and `openspec validate --strict compact-host-buttons-and-mute-notifications`.
  - Last run, after group 5b: `pnpm --filter server test`: 420 pass. Both typechecks: exit 0. `ka scope`: both checks apply, no E2E suite. `ka features-check`: exit 0, in sync, with the three new requirements pending for step 6. `ka docs-check`: no dead reference. `openspec validate --strict`: valid.

## 7. Documentation and changelog (mandatory step 5)

- [x] 7.1 Run `/ka:update-docs`. Expected: the server standards' line on `PushService.send()` names the mute next to the quiet schedule; `README.md` says Actividad is in the chevron's menu next to the grid button, names the alarm clock instead of «el botón del reloj», describes the bell, and its troubleshooting row mentions the mute.
  - `docs/dev-standards/server-standards.md`: the `PushService.send()` convention names the mute and `QuietReason`; the «A new hub setting» workflow says a value only the hub may decide stays out of `update()`, as `mute()` and `setTrelloExtension()`. `README.md`: Actividad's place, a «Silenciar un rato» item after the quiet schedule, «el botón del despertador», and the troubleshooting row. No stale «pulso» or «botón del reloj» left.
- [x] 7.2 Add a changelog entry with `/ka:changelog` (a user-visible flow and a hub setting changed).
  - Two entries under `changelogs/unreleased/`: `added` (the bell) and `changed` (Actividad's place, the narrower host buttons and the alarm clock), both scope `web`. The pull request number goes in when `/ka:commit` opens it.

## 8. E2E pipeline (mandatory step 7)

- [x] 8.1 The project has no E2E suite; this step does not apply. Record it here.
  - Not applicable: `ka scope` reports no E2E suite.

## 9. Feature catalogue (mandatory step 6, after the review loop's gate passes)

- [x] 9.1 Run `/ka:update-features compact-host-buttons-and-mute-notifications`, then `ka features-check --strict` with exit code 0, and commit with `/ka:commit`. The section «El botón del reloj de cada máquina» also describes the new icon, and the sections of «A message that cannot launch says so» and of the `[push]` log line name the mute.

## 10. Human review (mandatory step 8)

- [ ] 10.1 Ask the owner with `AskUserQuestion` who reviews the pull request and record the answer here; do not archive before the approval or that answer.

## 11. features-check before the archive (mandatory step 9)

- [ ] 11.1 Run `ka features-check --strict` as the last task before `/opsx:archive`; the exit code must be 0.

## Workflow follow-up

- Between groups 7 and 9: `/opsx:verify`, `/ka:adversarial-review` (the change touches `ClientMessage`, `HubSettings` and the wiring of `PushService`), `/ka:commit` with the pull request, and the bounded review loop.
- After the approval: `/opsx:archive`, `/ka:commit`, check the head, merge with `gh pr merge --squash --match-head-commit <sha>` on the owner's yes, follow the `deploy` run, and remove the worktree.
