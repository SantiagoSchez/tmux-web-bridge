# Proposal

## Why

The owner gets a «Terminado» push notification every time Claude Code ends a turn, even when it is only pausing until background work wakes it up again: a background subagent, a workflow, a monitor, or the next run of a `/loop` or a `ScheduleWakeup`. The notice arrives while the work is still going on, so it no longer tells the owner that Claude is waiting for them ([Issue #55](https://github.com/SantiagoSchez/tmux-web-bridge/issues/55)).

The kit's `Stop` hook treats every end of turn as the end of the work. Claude Code passes that hook two arrays, `background_tasks` and `session_crons`, meant to tell a finished session from one paused until background work wakes it up; the kit does not read them yet.

## What Changes

- When Claude Code ends a turn and its `Stop` input lists a background task other than a shell command, or any session cron, the kit treats the end of turn as a pause: the pane keeps the working mark (🔨) and the machine sends no notice to the hub.
- A background shell command does not count as pending work: a dev server or a `tail -f` never ends, and with them the owner would never be told that Claude is waiting.
- Without pending work, or when the input carries neither array (an older Claude Code), the end of turn behaves as today: ✅ (🤖 when a terminal shows the pane) and the «Terminado» notice.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `push-notifications`: a new requirement says when an end of turn is a pause for background work, which sends no notice and keeps the working mark. The existing requirements about finished turns still apply to a real finish.

## Impact

- Layers: `host-kit` only (`host-kit/tmux-window-title.sh` and its integration test `scripts/test-window-title.sh`). No external service is touched.
- Contracts: none changes. The kit reads two more fields of Claude Code's `Stop` hook input; the hub's `POST /api/notify` payload is the same, it only stops receiving `done` notices for pauses. No environment variable, data model or migration.
- Rollout: the kit reaches the machines at the next release tag («Actualizar» in the panel, or the checkout of the tag). A push to `master` deploys nothing for this change.

## Non-goals

- Holding back the notice when another `Stop` hook (for example, the ka plugin's typecheck hook) blocks the end of turn and sends Claude back to work: `Stop` hooks run in parallel, so the kit's hook cannot know another one will block.
- Changing the hub, the web panel or Claude Code's hook configuration (`host-kit/claude-hooks.json`).
- Notifying when a paused session's background work ends without waking Claude.
