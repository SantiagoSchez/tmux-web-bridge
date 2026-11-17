# Proposal

## Why

Push notifications from Linux machines are lost when the pane is open in the panel's web terminal and the owner stops looking shortly after typing (phone locked, tab in the background). The host kit counts the web terminal's tmux client as "you are in front of the pane", posts `viewed: true` to the hub, and the hub drops the notice without a trace. Confirmed on 2026-11-17 on `drangleic-dev`: 60 s after typing in the web terminal with the phone locked, no ✅ arrived; after 150 s it did. GitHub Issue #43: https://github.com/SantiagoSchez/tmux-web-bridge/issues/43

## What Changes

- The host kit decides whether you are in front of a pane only from real terminal clients: tmux clients whose session is not a web session (`_tw-…`) and whose current pane is the one notifying. Whether the web app shows the pane stays the hub's call, which knows if the tab is visible.
- On Linux, the existing rule stays for real clients: one of them must have had activity in the last 120 s. On macOS, the Ghostty-visible check stays.
- The same check drives the ✅ → 🤖 icon rule: a finished pane shown only in the web terminal keeps its ✅.
- The hub logs a `[push]` line when it drops a notice because the kit reports it viewed or because the pane is open in the web app, as it already does when the app is on screen at a device.
- A new integration test runs the real `tmux-window-title.sh` against an isolated tmux with a web client and a real client, and captures what it posts to a fake hub.

## Capabilities

### New Capabilities

- `push-notifications`: when the hub sends a push notification for a pane's question, permission request or finished turn, and when it holds one back because the owner is already looking at the pane.

### Modified Capabilities

None.

## Impact

- **Layers:** `host-kit` (`host-kit/tmux-window-title.sh`, the new `scripts/test-window-title.sh`, the host-kit test command in `.claude/koalarnes.json`, `docs/dev-standards/host-kit-standards.md`) and `server` (`server/src/notifications.ts` and its test).
- **Contracts:** none. The `/api/notify` body (`NotifyRequest`) keeps its shape; only how the kit computes `viewed` changes.
- **Rollout:** the hub's log lines deploy with the merge into `master`. The kit fix reaches each machine only at the next release, through «Actualizar» or the checkout of its tag.
- **External services:** none.

## Non-goals

- Telling on Linux whether a real terminal is visible (for example, ssh into the machine from Ghostty on a Mac): the 120 s activity rule stays for real clients.
- Changing how the hub decides from the web app's own presence and visibility (`isWatched`, `pushRoute`).
- Keeping hub logs across container recreations.
