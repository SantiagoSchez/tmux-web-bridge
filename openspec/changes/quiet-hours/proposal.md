# Proposal

GitHub issue: [#51 Horario de descanso sin notificaciones](https://github.com/SantiagoSchez/tmux-web-bridge/issues/51)

## Why

The hub sends push notifications at any hour when a Claude asks, needs attention or finishes, and when an automation fails to launch. The only way to stop them during the night or the weekend is to turn notifications off on every device, and then turn them back on.

## What Changes

- A hub-wide quiet schedule, kept in the hub settings (`HubSettings.quietHours`), so it applies to every subscribed device.
- The schedule is a time window (from, to) on chosen days of the week, plus a separate set of days silenced entirely. A window that crosses midnight belongs to the day it starts on. Times are the hub's local time (TZ), as for automations.
- Inside the schedule the hub drops every push notification (Claude's 🙋/💬/✅ notices and the error notice of an automation that could not launch), except the «Enviar prueba» test push. Each dropped notice leaves a `[push]` log line. The pane icons and the activity list are unchanged, so what is pending is still visible in the panel.
- The schedule can be turned off and on without losing its window and days.
- A new Settings section «Notificaciones» holds the switch, the window and the two day pickers.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `push-notifications`: adds the quiet schedule (when it silences a push, which pushes it covers, turning it off), and adds the quiet schedule as a reason in the requirement «A notice the hub holds back leaves a log line».

## Impact

- Layers: `server` (`shared/quiet-hours.ts` new, `shared/types.ts`, `server/src/settings.ts`, `server/src/push.ts`, `server/src/notifications.ts`, `server/src/index.ts`) and `web` (`web/src/state.ts`, `web/src/components/Settings.tsx` with the new section, `web/src/components/DayPicker.tsx` new and used by `web/src/components/Automations.tsx` too, `web/src/styles.css`); `shared/schedule.ts` shares its day names with the section's summary. No external service changes; Web Push is only called less often.
- Contract: `HubSettings` gains the `quietHours` field (type `QuietHours` in `shared/types.ts`). It travels in the existing settings broadcast and in the `settings` client message; no new endpoint, message type or environment variable. `settings.json` files without the key take the default (off, 22:00 to 08:00 every day, no whole days); no migration.

## Non-goals

- A schedule per device or per machine.
- Queuing the dropped notices to send them when the quiet schedule ends.
- More than one window per day.
- Silencing anything other than push notifications (pane icons, activity, the panel's pending list).
