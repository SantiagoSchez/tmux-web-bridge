# Proposal

GitHub issue: [#50 Programar mensajes de un solo uso para gastar el límite semanal que sobra](https://github.com/SantiagoSchez/tmux-web-bridge/issues/50)

## Why

When the weekly Claude limit is tight, critical work takes it and tasks that could wait are left undone; by the end of the week some limit is usually left, but those tasks have to be launched by hand at the right moment. Automations launch a prompt at a time, but they repeat: they do not fit a task done once.

## What Changes

- A scheduled message: a prompt the hub launches once, at a fixed date and time, as a task in a new window of a folder's space on a machine, with the options of an automation (name, folder, new worktree, base branch, skip permissions).
- A new button (a + with a clock) next to each machine's + in the sidebar opens its form. The form suggests times from the limits of the Claude account the machine uses: 1 day, 12 hours and 3 hours before the weekly reset, and when the 5-hour limit resets. Picking one only fills the date and time, which are saved as they are; a date and time can also be typed.
- A foldable «Programados» section at the top of the right panel, above the scratchpads, shown while there is any: when each one launches, on which machine and folder, with edit and cancel while pending; once launched, its result (launched, with a link to its window, or the error) and a way to remove it. Results go away on their own after 7 days.
- If the hub was stopped at a message's time, it launches the message when it starts and says so in its result. A message launches even when the account has spent its weekly or 5-hour limit, as automations do. A message is never launched twice.
- A message that cannot launch leaves its error in the activity list and sends a push notification (held back inside the quiet schedule, like every push). A launched one appears in the activity list like any task.

## Capabilities

### New Capabilities

- `scheduled-messages`: one-off prompts the hub launches at a fixed time: creating, editing and cancelling them, the times suggested from the account's limits, launching (on time, late after a stop, never twice), the results kept for 7 days, and where the panel shows them.

### Modified Capabilities

None.

## Impact

- Layers: `server` (`server/src/scheduled.ts` new store and scheduler, `server/src/index.ts` routes, wiring and broadcast, `shared/scheduled.ts` new validation and time suggestions, `shared/types.ts`) and `web` (`web/src/components/Tree.tsx` button, a new `web/src/components/Scheduled.tsx` with the form and the panel section, the launch fields shared with `web/src/components/Automations.tsx`, `web/src/components/Scratchpads.tsx`, `web/src/components/LimitsBar.tsx` for the account's limits, `web/src/components/Activity.tsx`, `web/src/components/Dialogs.tsx`, `web/src/state.ts`, `web/src/ws.ts`, `web/src/prefs.ts`, `web/src/components/icons.tsx`, `web/src/styles.css`). No external service changes.
- Contract:
  - REST: `GET /api/scheduled`, `POST /api/scheduled` (create, or edit a pending one), `POST /api/scheduled/:id/delete` (cancel a pending one or remove a result). Body and result types `ScheduledMessage` and `ScheduledMessageInput` in `shared/types.ts`.
  - Websocket: a new `ServerMessage` variant `{ t: 'scheduled'; list: ScheduledMessage[] }`, broadcast on every change and sent in the initial `/ws` snapshot.
  - `ActivityEvent.source` gains `'scheduled'`.
  - Data: a new store file `dataDir/scheduled.json`; no migration.
  - No new environment variable or `config.yaml` option.

## Non-goals

- Recurring messages (automations already do that).
- Times that follow the reset when it or the machine's account changes after saving.
- Waiting for limit to be available before launching, or checking the limits at launch.
- An indicator of scheduled messages in the folded right panel.
