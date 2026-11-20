# Proposal

## Why

Since the pause for background work ([Issue #55](https://github.com/SantiagoSchez/tmux-web-bridge/issues/55)), the kit holds back the «Terminado» notice and keeps 🔨 whenever Claude Code's `Stop` input lists any background task that is not a shell command. Claude Code 2.1.329 also lists there its own internal work, which never wakes Claude up: `dream` (memory consolidation) and `auto-mode scan`. When one of them is running at the end of a turn, the pane stays at 🔨 for good and the owner is never told that Claude is waiting ([Issue #65](https://github.com/SantiagoSchez/tmux-web-bridge/issues/65)).

On 2026-11-20 two windows of the `shop-generator` session on the MacBook Pro ended their turns at 09:26 and 09:40; the `Stop` hook wrote 🔨 and sent nothing. Their transcripts show no subagent, workflow, monitor or cron in flight, only background shell commands. The kit does not keep the payload, so the exact task cannot be named.

## What Changes

- Only the background task types that wake Claude up count as a pause: `subagent`, `workflow`, `monitor`, `teammate`, `cloud session` and `MCP task`, plus any entry of `session_crons`. A shell command, Claude Code's internal work (`dream`, `auto-mode scan`) and any type the kit does not know no longer hold the notice back. This reverses decision D2 of `skip-finish-notice-while-background-work`, under which unknown types counted.
- The host-kit integration tests run on macOS too: `scripts/test-window-title.sh` used to exit at once outside Linux, and `scripts/test-kit-update.sh` failed its uninstall checks there because `/tmp` is a link.
- When the kit treats an end of turn as a pause, it writes the tasks and crons that caused it to a file next to the pane's state (`<pane>.pause` in the kit's state folder), so the owner can see what held the notice back. Each pause overwrites it; a real finish and the pane's other cleanups remove it.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `push-notifications`: the requirement «An end of turn that waits for background work sends no notice» names the closed list of task types that count, says that any other type does not hold the notice back, and says that the machine keeps a record of what caused each pause.

## Impact

- Layers: `host-kit` only (`host-kit/tmux-window-title.sh` and the integration tests `scripts/test-window-title.sh` and `scripts/test-kit-update.sh`). No external service is touched.
- Contracts: none changes. The kit reads the same two fields of Claude Code's `Stop` input; the hub's `POST /api/notify` payload is the same. The new `.pause` file is local to the machine, under `/tmp`, and nothing else reads it. No environment variable, data model or migration.
- Rollout: the kit reaches the machines at the next release tag («Actualizar» in the panel, or the checkout of the tag). A push to `master` deploys nothing for this change.

## Non-goals

- A timer or any other fallback that turns a paused pane into ✅ when its background work ends without waking Claude.
- Telling an ambient monitor from one that wakes Claude: Claude Code labels both `monitor` in the `Stop` input.
- Sending the pause record to the hub or showing it in the web panel.
- Changing Claude Code's hook configuration (`host-kit/claude-hooks.json`).
