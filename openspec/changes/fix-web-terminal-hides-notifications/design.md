# Design

## Context

See proposal.md (Why) for the bug. The pieces involved:

- `server/src/terminal.ts` opens each web terminal as a pty running a tmux client on a new session grouped with the target one (`new-session -t <session> -s _tw-<hex>`, `WEB_SESSION_PREFIX` in `server/src/host.ts`). The client stays attached while the WebSocket is open, also when the tab is hidden or the phone is locked.
- `host-kit/tmux-window-title.sh`, run by Claude Code's hooks, decides two things with two helpers:
  - `pane_is_viewed <pane>`: `display-message -t <pane>` with `pane_active && window_active && session_attached`. A pane id resolves to the most recently used session that contains it, which is the `_tw-` session while the web terminal is open, so the check answers for the web client. Verified on an isolated tmux: with a `_tw-` client attached the pane resolves to `_tw-…` and the check gives 1.
  - `user_is_looking <pane>`: on macOS, Ghostty is in front or its quick terminal is down; elsewhere, any client of the pane's session (the session `display-message` resolved, so the `_tw-` one) had activity in the last 120 s.
  - `notify` posts `viewed: true` to `/api/notify` when both hold; `cmd_state` turns ✅ into 🤖 when `pane_is_viewed` holds.
- `Notifier.onScriptNotify` (`server/src/notifications.ts`) returns without a log line for `unknown host`, `viewed` and `watched in web`; only `route()`'s `none` branch logs (`no se envía, tienes twb a la vista en …`). The notify listener on port 7682 runs Fastify with `logger: false`, so nothing else records the drop.
- `host-kit/tmux-spaces.sh` already filters web sessions with `#{m:_tw-*,#{session_name}}`.
- `tmux list-clients -F '#{pane_id} #{client_activity} #{session_name}'` reports, for each client, the pane that client is showing (verified on tmux 3.8 with a `_tw-` client on window 0 and a plain client on window 1: each line carries its own pane).

## Goals / Non-Goals

**Goals:**

- One helper in the kit answers "does a real terminal show this pane", ignoring `_tw-` sessions, and both decisions (`viewed` and ✅ → 🤖) use it.
- Every notice the hub drops after receiving it from a machine leaves one `[push]` line.
- The kit's decision is covered by an automated test that runs the real script against a real, isolated tmux.

**Non-Goals:**

- An activity threshold that can be changed by configuration or by the test.
- Any change to `/api/notify`'s body, to `isWatched` or to `pushRoute`.

## Decisions

### D1. The kit reads `list-clients` and skips `_tw-` sessions to decide whether a terminal shows the pane

**Context:** `display-message -t <pane>` answers for a single session, picked by tmux, which is the web one while it is the most recent. **Decision:** replace both helpers with one that walks `tmux list-clients -F '#{pane_id} #{client_activity} #{session_name}'` (space-separated, with the session last because its name may hold spaces; tabs are avoided because tmux 3.5 escapes control characters in `-F` output), skips sessions matching `_tw-*`, and keeps the clients whose `pane_id` is the notifying pane. `pane_is_viewed` holds when one such client exists. The "in front of it" check then applies to those clients only: on macOS, Ghostty visible (unchanged); elsewhere, one of them with activity under 120 s. **Consequences:** a client on another window of the same session no longer counts (before, any client of the session did on Linux), which is what the spec asks. The prefix `_tw-` becomes a contract between `server/src/host.ts` and the kit, as it already is for `tmux-spaces.sh`; the comment next to `WEB_SESSION_PREFIX` names both kit scripts.

Alternatives considered:
- Have the hub ignore `viewed` when the pane's only client is a web one: the hub cannot tell which tmux client was used at the machine, and it would need a tmux round trip per notice.
- Detach or mark the web client when the tab is hidden: changes the terminal's lifecycle and reconnect cost for a notification concern.

### D2. The hub logs every drop in `onScriptNotify` with the existing `[push]` format

**Decision:** before returning `viewed` and `watched in web`, `onScriptNotify` writes `[push] <title>: no se envía, ya lo has visto en la terminal` and `[push] <title>: no se envía, lo tienes abierto en la web`. `<title>` is the window title the push would have had (`this.title(ctx, state)`), or the icon and the host name when the pane is not in the tree (`route()`'s existing line keeps naming the icon alone). For `viewed`, which returns before today's `host.refresh()`, the hub looks the pane up in the tree it already holds (`host.findPane`) without refreshing; the kit sends an empty `title` with `viewed: true`, so the request's title is no fallback. Before returning `unknown host`, it writes `[push] <icon> <host id>: no se envía, la máquina <host id> no está en el panel`: the request's `host` is all there is to name, and a machine renamed or removed from the panel keeps the hub's single notify token, so its notices still arrive. **Consequences:** a line per drop, in the hub's existing log volume (one per Claude turn at most).

### D3. A Bash integration test drives the real script on an isolated tmux

**Decision:** `scripts/test-window-title.sh`, in the style of `scripts/test-kit-update.sh` (`expect` lines, `KEEP=1`):

1. Unset `TMUX` and `TMUX_PANE`, set `TMUX_TMPDIR` to a `mktemp -d /tmp/twbwt.XXXX` directory and use `-L twbwt` on every `tmux` call; a sentinel check at the end confirms the default socket's server, if any, was not touched (same idea as `test-kit-update.sh`).
2. Start a fake hub: a small Node HTTP server on a loopback port the test picks, appending each request body to a file. `XDG_CONFIG_HOME` points to the temporary directory, whose `tmux-web-bridge/notify.env` names that hub.
3. Attach clients with `script -qfc 'tmux -L twbwt …' /dev/null` in the background: a web client with `new-session -t main -s _tw-test`, and a plain client with `attach -t main` when the case needs it.
4. Run the real `host-kit/tmux-window-title.sh state done test` with `TMUX` set to the isolated server's socket (`<socket>,<pid>,0`) and `TMUX_PANE` set to the pane, payload on stdin, then wait for the fake hub's file.
5. Cases: only the web client on the pane → `viewed: false` and `@pane_icon` ✅; a plain client on the pane → `viewed: true` and 🤖; a plain client on another window → `viewed: false`; a plain client on the pane, idle for 150 s → `viewed: false`.
6. The idle case fakes the clock, the one boundary in the way: tmux sets `client_activity` from real input only, so the test moves the script's "now" instead. A `date` wrapper first on the script's `PATH` prints the real `date +%s` plus 150 for `+%s` and runs the real `date` for any other argument. No production code learns about the test.

The test is Linux-only (`script` options and the activity branch); on macOS it prints that it does not apply and exits 0. The host-kit layer's test command in `.claude/koalarnes.json` runs both scripts, and the layer's paths gain `scripts/test-window-title.sh`; then `ka sync`.

Alternatives considered: extending `scripts/test-kit-update.sh` (mixes install and runtime behaviour in one script); a manual check only (no guard against a regression); an environment variable that lowers the 120 s threshold (a test hook in production code, and the non-goal above); waiting 120 s in the test (slow, and still racing the threshold).

### D4. The server's log lines are unit-tested through the notifier's outcome

**Decision:** in `server/src/notifications.test.ts`, the existing fakes stay; two tests capture `console.log` (the log is the outcome the spec names) and assert the `[push]` line and that nothing was pushed, for `viewed` and for `watched in web`.

## Risks / Trade-offs

- [The web session prefix changes in the server and the kit keeps the old one] → The prefix lives in `WEB_SESSION_PREFIX`; its comment lists the kit scripts that match it, and the review checks both sides.
- [Kits before this release keep the bug] → Expected: the fix reaches a machine at the next release through «Actualizar». The hub's log lines ship with the merge and make the remaining drops visible meanwhile.
- [`script -qfc` differs on macOS] → The test exits 0 with a message there; the kit's own logic on macOS keeps the Ghostty check and only adds the client filter.
- [A plain client on the pane but in a hidden terminal on Linux still counts for 120 s] → Out of scope (proposal, Non-goals).

## Migration Plan

No data or contract migration. Merge deploys the hub (log lines). Cut a release so machines can update the kit; on `drangleic-dev`, update with «Actualizar» and repeat the 60 s check with the web terminal: the ✅ must arrive. Rollback: revert the merge and update the kit to the previous tag.
