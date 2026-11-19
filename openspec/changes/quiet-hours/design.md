# Design

## Context

See proposal.md for the motivation. Today three places send a push notification:

- `Notifier` (`server/src/notifications.ts`): Claude Code's 🙋/💬/✅ notices, from `/api/notify` (`onScriptNotify`) or from a pane icon that no script reported (`fallback`). Both go through `deliver()`, which retries to every device when the device you are at no longer takes pushes.
- The `automations.on('run')` handler in `server/src/index.ts`: the error notice of an automation that could not launch.
- `POST /api/push/test` in `server/src/index.ts`: «Enviar prueba».

All three call `PushService.send()` (`server/src/push.ts`). Hub settings shared by every device live in `HubSettings`, kept by `SettingsStore` (`server/src/settings.ts`) and broadcast to every browser; automations already use the hub's local time (TZ) and a day picker with `DAY_LETTERS` from `shared/schedule.ts`.

## Goals / Non-Goals

**Goals:**

- One rule, in `shared/`, that says whether an instant is inside the quiet schedule, used by the hub to decide and by the panel to describe it.
- A single gate in front of Web Push, so a push added later (the scheduled messages of Issue #50) is covered without extra code.

**Non-Goals:**

- Telling the browsers whether the hub is in quiet hours right now (no live indicator).

## Decisions

### D1. The quiet schedule is a field of `HubSettings`, not a store of its own

**Context:** the schedule is one small value every device shares and edits from Settings.
**Decision:** `HubSettings.quietHours: QuietHours`, with `QuietHours = { enabled: boolean; from: string; to: string; days: number[]; allDay: number[] }` in `shared/types.ts` (`from`/`to` as `HH:MM`, days 0 Sunday … 6 Saturday as in `shared/schedule.ts`). The default is off, 22:00 to 08:00, every day, no whole days.
**Consequences:** it travels in the existing `settings` broadcast, the initial `/ws` snapshot and the `{ t: 'settings' }` client message; no endpoint or message type is added. A `settings.json` without the key takes the default.

### D2. A window belongs to the day it starts on; whole days are a separate list

**Context:** the issue asks for a window that may cross midnight and for days silenced entirely; the owner chose the alarm-clock convention.
**Decision:** `isQuietAt(q, date)` in `shared/quiet-hours.ts` returns true when `q.enabled` and either `date`'s weekday is in `allDay`, or the window covers `date`: for `from < to`, the weekday is in `days` and `from ≤ time < to`; for `from > to`, the weekday is in `days` and `time ≥ from`, or the previous weekday is in `days` and `time < to`. Times are compared in whole minutes of the local clock (`getDay()`, `getHours()`, `getMinutes()`), so the hub uses its TZ and daylight saving changes need no special case.
**Alternatives:** each day owning its own 00:00–24:00 slice (marking Friday would silence Friday 00:00–08:00 and 22:00–24:00); rejected by the owner.

### D3. Validation lives in `shared/` and the hub ignores an invalid schedule

**Decision:** `quietHoursProblem(raw)` returns a Spanish message or null: `from`/`to` must match `HH:MM`, must differ («La franja no puede empezar y acabar a la misma hora»), and `days`/`allDay` must be arrays of integers 0–6. `sanitizeQuietHours(raw)` returns the normalised value (days deduplicated and sorted) or null. `SettingsStore.update()` keeps the previous schedule when the patch's is invalid, as it does for every other setting, and the constructor falls back to the default when the saved one is invalid. The panel calls `quietHoursProblem` before sending and shows the message instead of sending. Empty `days` and `allDay` are valid: the schedule then silences nothing, and the panel's description says so.

### D4. `PushService` is the gate; the test push bypasses it explicitly

**Context:** the gate has to cover every push, including those added later, but the `Notifier` also needs to stop before it captures the pane and waits for the choices menu (up to 2.5 s), and to log the reason with the window's name.
**Decision:** `PushService` takes a `quiet: () => boolean` in its constructor (`index.ts` passes `() => isQuietAt(settings.value.quietHours, new Date())`) and exposes it as `push.quiet()`. `send(payload, only, { evenWhenQuiet })` drops the push while `quiet()` is true, unless `evenWhenQuiet`, writes `[push] <title>: no se envía, es horario de descanso` and returns 0. `/api/push/test` passes `evenWhenQuiet: true`. `Notifier.onScriptNotify` checks `push.quiet()` after the seen and watched checks and before `route()`, logs the same line naming the window and returns `{ pushed: false, reason: 'quiet hours' }`; `fallback()` checks it before capturing the pane.
**Alternatives:** checking only in `Notifier` and in the automation handler; rejected because every new caller would have to remember it.
**Consequences:** `PushService`'s constructor changes, so `index.ts` wiring changes: the tasks include a boot smoke test.

### D5. A section «Notificaciones» in Settings, with a day picker shared with automations

**Decision:** a new `SettingsTab` `'notifications'` with its section component, `QuietHoursSettings`, in `web/src/components/Settings.tsx` next to `DictationSettings`, because both use that file's `Toggle`: the on/off switch (the `Toggle` of `Settings.tsx`), two `type="time"` inputs (desde, hasta), the window's day picker and the whole days' day picker, and a one-line description of what is silenced. The day chips of `Automations.tsx` move to a `DayPicker` component (`web/src/components/DayPicker.tsx`) that both screens use. Every change validates with `quietHoursProblem` and sends `hub.send({ t: 'settings', settings: { quietHours } })`. The times are kept as typed and saved when their field loses focus, because a time field fires `change` on every digit and would save the half-typed time; the toggle sends the whole schedule with only `enabled` flipped, so turning it off keeps the rest.

## Risks / Trade-offs

- [A notice that crosses the window's start while the `Notifier` waits for the choices menu] → `PushService.send` drops it and writes a second log line; harmless.
- [The hub's TZ differs from the owner's] → same as automations; the section's description says the times are the hub's.

## Migration Plan

None: the default applies to existing `settings.json` files. Rolling back leaves the key in `settings.json`, unused.
