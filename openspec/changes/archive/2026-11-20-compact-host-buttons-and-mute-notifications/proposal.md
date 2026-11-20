# Proposal

## Why

The three buttons at the head of each machine in the sidebar («+», «Programar mensaje», «•••») take 124px of a narrow column, and the «Programar mensaje» icon (a clock with a plus) is hard to read at 18px. The owner also has no quick way to stop push notifications for a while (a meeting, a nap): the quiet schedule in Ajustes › Notificaciones is a recurring window, not a one-off pause, and reaching it takes several taps.

There is no GitHub issue: the owner asked for this in chat, and the branch is a `chore/` branch with no work item.

## What Changes

- The «+», «Programar mensaje» and «•••» buttons of a machine's head become 28px wide (36px high, as now) with no gap between them, in both the multi-machine and the single-machine sidebar.
- The «Programar mensaje» icon becomes an alarm clock (a clock face with two bells on top and two feet).
- A bell button in the top bar mutes push notifications. Not muted: a tap opens a menu to mute for 1, 2, 3 or 5 hours, or until further notice. Muted: the bell is crossed out, its tooltip says until when, and a tap unmutes at once.
- The mute is a hub setting, the same for every device. While it lasts, the hub sends no push notification, exactly the ones the quiet schedule silences; «Enviar prueba» still arrives. A mute with an end stops applying at that time on its own.
- A push the mute holds back leaves a `[push]` log line saying the notifications are muted, distinct from the quiet schedule's line.
- The «Actividad» button leaves the top bar to make room. Next to the windows-grid button (which still toggles the grid with one tap), a narrow chevron button opens a menu with «Actividad».

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `push-notifications`: a new requirement for the temporary mute (its durations, its end, every device, what it silences), and the requirement on the log line of a held-back notice gains the mute as a reason.
- `scheduled-messages`: the requirement «A message that cannot launch says so» names the mute next to the quiet schedule as what holds its push back.

The sidebar buttons, the icon and the top bar's layout are not requirements of any capability: the requirement «Each machine in the sidebar opens the scheduling form» of `scheduled-messages` stays true as written.

## Impact

- Layers: `server` (`server/src/settings.ts`, `server/src/push.ts`, `server/src/notifications.ts`, `server/src/index.ts`, and `shared/types.ts` plus a new pure module in `shared/`), and `web` (`web/src/components/Header.tsx`, `web/src/components/Tree.tsx`, `web/src/components/icons.tsx`, `web/src/state.ts`, where `MenuItem.icon` also takes an icon component, and `web/src/styles.css`).
- Contract changes:
  - `ClientMessage` gains `{ t: 'mute'; hours }` and `{ t: 'unmute' }`: the only way to set or end the mute. A `settings` patch cannot carry it; the hub ignores a `mute` key there.
  - `HubSettings` gains `mute`, read-only for the panel: it reaches every device in the `settings` broadcast and the `/ws` snapshot.
  - The answer of `POST /api/notify` gains a `reason` value for a muted push; the host kit does not read it.
- Persisted data: `settings.json` gains the field; a file without it loads as not muted. No migration.
- No new environment variable, dependency or external service.
- Docs: `README.md` names «el botón con el pulso de la cabecera» for Actividad and «el botón del reloj» for scheduled messages; both change. `docs/FEATURES.md` describes the clock button and the reasons of the `[push]` line.

## Non-goals

- Muting only one device, one machine or one kind of notice: the mute is the hub's, for every push.
- Showing or changing the mute in Ajustes › Notificaciones: the bell is its only control.
- Changing the quiet schedule, or the pane marks, the pending list and the activity, which the mute leaves as they are.
- Any change to what the «Actividad» sheet shows.
