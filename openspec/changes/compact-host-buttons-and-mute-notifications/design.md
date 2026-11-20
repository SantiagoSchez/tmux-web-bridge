# Design

## Context

See proposal.md for the motivation. The current state that shapes the approach:

- Every push goes through `PushService.send()` (`server/src/push.ts`), which drops it when `quiet()` is true. `index.ts` builds the service with `() => isQuietAt(settings.value.quietHours, new Date())`. `send()` logs `[push] <title>: no se envía, es horario de descanso`. Only `POST /api/push/test` passes `{ evenWhenQuiet: true }`.
- `Notifier` (`server/src/notifications.ts`) checks `push.quiet()` itself before reading the pane, logs the same reason with the pane's name, and answers `onScriptNotify` with `{ pushed: false, reason: 'quiet hours' }`. The host kit does not read that `reason`.
- Hub settings live in `SettingsStore` (`server/src/settings.ts`): `update(patch)` keeps only known, valid keys; `'change'` is broadcast as `{ t: 'settings' }` to every browser and also refreshes every machine. The web panel keeps them in `hubSettings` (`web/src/state.ts`).
- Menus are the `dialog` signal's `menu` variant (`MenuItem[]`), as `hostMenu()` in `web/src/menus.ts` does. `web/src/time.ts` has a `clock` signal that ticks every 30 s.
- The host head (`web/src/components/Tree.tsx`) renders three `.icon-btn.small-btn` buttons (36×36px) in `.host-head`, a flex row with `gap: 8px`.

## Goals / Non-Goals

**Goals:**

- One rule decides whether a push is silenced (quiet schedule or mute), so `PushService` and `Notifier` cannot drift apart.
- The mute's end is computed on the hub's clock, so a device whose clock is off does not shorten or lengthen it.

**Non-Goals:**

- A timer on the hub that clears an expired mute: an expired mute is simply not in force.
- Tests for the web layer, which has no runner (see the web standards); its logic that deserves a test lives in `shared/`.

## Decisions

### D1. The mute is a `HubSettings` field holding its end, not a duration

Context: the mute must reach every device and survive a hub restart.

Decision: `HubSettings.mute: NotificationMute | null`, with `NotificationMute = { until: number | null }` in `shared/types.ts`. `until` is epoch milliseconds; `null` inside means until further notice; `mute: null` means not muted. It is saved in `settings.json` and sanitised on load (`sanitizeMute`): anything else loads as `null`.

Alternatives: a separate store (more wiring for one field); storing a duration (needs a start time anyway, and every reader would add them).

Consequences: the existing `settings` broadcast and initial snapshot carry it with no new `ServerMessage`. An expired mute stays in the file until the next mute or unmute, harmless because nothing reads it as in force.

### D2. Muting is its own client message, computed on the hub's clock

Context: a `settings` patch carries values the device computed; `until` computed on the phone would carry its clock's error.

Decision: a new `ClientMessage` variant `{ t: 'mute'; hours: MuteHours | null }`, with `MUTE_HOURS = [1, 2, 3, 5] as const` and `MuteHours` in `shared/mute.ts` (`null`: until further notice), and `{ t: 'unmute' }`. `index.ts` handles them with `settings.mute(hours, Date.now())` and `settings.unmute()`. `SettingsStore.update()` ignores a `mute` key in a patch, as it ignores `trelloExtension`, so a `settings` patch cannot set an arbitrary end. Both methods save and emit `'change'`.

Alternatives: the `settings` patch with an absolute `until` (device clock decides); a REST endpoint (the panel changes hub settings over the websocket everywhere else).

Consequences: an `hours` value outside `MUTE_HOURS` (other than `null`) is ignored. The `'change'` handler also refreshes every machine, as for any setting; one extra poll per mute is accepted.

### D3. `quiet()` returns the reason, mute first

Context: the log line must say whether the mute or the quiet schedule held the push back, and when both apply it says the mute.

Decision: `shared/mute.ts` exports `isMutedAt(mute, now)` (`mute !== null && (mute.until === null || now < mute.until)`) and `quietReason(mute, quietHours, date)`, which returns `'muted'` when `isMutedAt`, else `'quiet hours'` when `isQuietAt`, else `null`, so the precedence is unit-tested. `QuietReason = 'muted' | 'quiet hours'` lives in `shared/mute.ts` and `push.ts` re-exports it. `PushService`'s constructor takes `quiet: () => QuietReason | null`; `index.ts` passes `() => quietReason(settings.value.mute, settings.value.quietHours, new Date())`. `PushService.send()` and `Notifier.quiet()` log `no se envía, las notificaciones están silenciadas` or `no se envía, es horario de descanso`, and `onScriptNotify` answers `{ pushed: false, reason }` with that value. `{ evenWhenQuiet: true }` keeps letting the test notification through either way.

Alternatives: a second callback for the mute (two checks to keep in step in two classes).

Consequences: the `reason` of `POST /api/notify` gains `'muted'`; no consumer reads it, and the existing `'quiet hours'` value is unchanged.

### D4. The bell lives in the top bar; Actividad moves behind a chevron

Context: the top bar has little room on a phone (`.topbar .icon-btn` already narrows to 38px and 34px under media queries).

Decision: `Header.tsx` drops the Actividad button and adds, right after the grid button, a narrow chevron button (`aria-label="Más vistas"`, `aria-haspopup="menu"`) that opens a `menu` dialog with one item, «Actividad», which sets `sheet.value = 'activity'`. The grid button keeps its toggle. The bell (`MuteButton`, in `Header.tsx`) goes before Trello:

- Not muted: `IconBell`; a tap opens a `menu` dialog titled «Silenciar notificaciones» with «1 hora», «2 horas», «3 horas», «5 horas» and «Hasta nuevo aviso», each sending `{ t: 'mute', hours }`.
- Muted: `IconBellOff` (a bell with a slash), class `on`, `aria-pressed="true"`, a `title` and `aria-label` from `describeMute()`; a tap sends `{ t: 'unmute' }` and shows a toast «Notificaciones activadas».
- Both sends update `hubSettings` optimistically only for the unmute (`mute: null`); the mute waits for the hub's broadcast, because only the hub knows the end.

Whether it is muted is read with `isMutedAt(mute, clock.value)`, and a `useEffect` sets a timeout to the exact `until` that bumps `clock`, so the bell flips back at the end and not up to 30 s later.

Alternatives: a single button that opens both the grid and Actividad (two taps for the grid, rejected by the owner); the bell in Ajustes (the owner wants one tap).

Consequences: the README's «el botón con el pulso de la cabecera» changes to the chevron's menu.

### D5. `describeMute()` in `shared/mute.ts` writes the button's text

Decision: `describeMute(mute, now)` returns «Silenciadas hasta nuevo aviso», «Silenciadas hasta las 18:00», or, when the end is on another day, «Silenciadas hasta mañana a las 02:00». It reads `Date`'s local hours, which in the browser is the device's clock: the end is an absolute instant, so the device shows it in its own time. It is unit-tested from `server/src/mute.test.ts`.

### D6. The host head's buttons shrink through a modifier class

Decision: the three buttons of both host heads get the class `host-btn`: `width: 28px; height: 36px`. `.host-head` keeps `gap: 8px` between the name and the buttons, and the buttons sit in a `.host-btns` wrapper with `display: flex; gap: 0`. `.small-btn` stays as it is for its other users. `IconScheduled` becomes an alarm clock: a circle for the face, the hands, two arcs for the bells and two short strokes for the feet, at 18px like now.

Alternatives: changing `.small-btn` (used elsewhere); a negative margin (fragile).

## Risks / Trade-offs

- [28px wide is under the 44px `--tap` target on phones] → the height stays 36px and the buttons touch each other, so a near miss lands on a neighbour, not on nothing; the owner chose this width knowingly.
- [The chevron is 22px wide (18px in the narrowest top bar), well under `--tap`, and touches the grid's button] → a near miss toggles the grid, which the same button undoes; it is the price of keeping «Actividad» one tap away without taking a whole button's width, which is what the owner asked for.
- [The bell decides whether it looks muted on the device's clock, while the hub decides on its own] → a device whose clock runs ahead shows the bell back on before the hub's mute ends, and a tap then offers to mute again instead of unmuting. Accepted: the pushes, which are what the mute is for, follow the hub's clock; making the panel follow it would need the hub's time in every `settings` message for a skew that devices with network time do not have.
- [Unmuting while the panel has no connection to the hub] → the message would be dropped while the panel showed the bell on. The bell refuses: with the websocket not open it shows the error toast «Sin conexión con el servidor central: no se han activado» and changes nothing.
- [The narrowest top bar (the desktop sidebar, 340px) with Trello configured and a two-digit pending count] → the bell and the chevron take room the pending pill needs; in that container the chevron narrows to 18px and the bar's icon buttons to 32px, and the fit is checked by hand with both.
- [A hub whose clock is wrong ends the mute at the wrong time] → the hub's clock already decides the quiet schedule and scheduled messages; nothing new.
- [A mute until further notice is forgotten and every push stays silent] → the crossed bell stays in the top bar of every device, and the `[push]` line says why.
- [Two devices mute at once] → the last message the hub receives wins; both get its broadcast.

## Migration Plan

No data migration: a `settings.json` without `mute` loads as not muted. Rollback is a redeploy of the previous version; an older hub keeps `mute` in the file through its `...saved` spread but never reads it, so pushes go out.
