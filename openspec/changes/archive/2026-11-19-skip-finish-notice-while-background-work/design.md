# Design

## Context

Claude Code's `Stop` hook runs `host-kit/tmux-window-title.sh state done <project>` with the hook's JSON on stdin (`PAYLOAD`). `cmd_state` writes the pane's state (`done`, or `claude` when a terminal shows the pane), refreshes the window's icon, and `notify` posts the notice to the hub in a background subshell. Every `Stop` is handled the same way.

Claude Code (checked on 2.1.328, documented under «Stop input» in the hooks reference) adds two arrays to the `Stop` input: `background_tasks`, one entry per in-flight task with a `type` label (`shell`, `subagent`, `monitor`, `workflow`, `teammate`, `cloud session`, `MCP task`, or the raw discriminant for an unknown type), and `session_crons`, one entry per scheduled wakeup (`CronCreate`, `ScheduleWakeup`, `/loop`). Both are present when the task registry is reachable and empty when nothing is pending. Older versions send neither.

When background work wakes Claude up, no `UserPromptSubmit` fires: the next hooks are `PreToolUse`/`PostToolUse` (which set `busy` through `cmd_tool`) and, at the real end, another `Stop`.

## Goals / Non-Goals

**Goals:**

- Decide in the kit, from the `Stop` input alone, whether an end of turn is a pause, with no network call and no new hook.

**Non-Goals:**

- Detecting a pause caused by another `Stop` hook that blocks (see the proposal's Non-goals).
- Any change to the hub, the web panel or `claude-hooks.json`.

## Decisions

### D1. A pause is decided from the `Stop` input inside `cmd_state`

`cmd_state done` reads the payload with `jq`. When `background_tasks` holds an entry whose `type` is not `shell`, or `session_crons` holds any entry, the state becomes `busy` and no notice is sent; otherwise the current `done` path runs unchanged.

- Alternative: a `Notification` hook with the `idle_prompt` matcher instead of `Stop`. Rejected: it fires about 60 seconds after the end of turn, and in a terminal only when Claude Code thinks the owner is away, which overlaps the kit's own «you are looking at it» logic.
- Alternative: a separate hook command (`state stop`) in `claude-hooks.json`. Rejected: the change would need `install.sh` to rewrite every machine's settings, while the existing `state done` already receives the payload.

### D2. Shell tasks never count as pending work

A background shell command can run forever (a dev server, `tail -f`), and Claude Code keeps it in `background_tasks` while Claude waits for the owner. Counting it would hold back every «Terminado» of that session. Every other type counts, including types the kit does not know yet, so a new kind of agent work is treated as a pause by default. The owner chose this on 2026-11-19.

### D3. The paused pane keeps the working mark

During the pause the pane's state is `busy` (🔨), not `done` without a notice: the work is still going on, and ✅ keeps meaning «finished and waiting for you». When Claude resumes, `cmd_tool` finds `busy` and does nothing; the final `Stop` sets ✅ and sends the one notice. The owner chose this on 2026-11-19.

### D4. A missing `jq` or unreadable payload keeps today's behaviour

The check is skipped when `jq` is missing or the payload is empty or not JSON, so the end of turn is a finish, as before the change. `jq` is already required by `install.sh` and used by `notify_preview`.

## Risks / Trade-offs

- [A monitor or a cron that never ends holds back every notice of that session] → It is the behaviour the owner chose (D2 covers only shell commands); the working mark still shows that Claude is not idle, and the pane can be checked from the panel.
- [Claude Code renames the `shell` label] → A renamed shell task would count as pending work and hold back the notice; the integration test pins the label the kit expects, and the hooks reference documents it.
- [A background task ends without waking Claude] → The pane stays at 🔨 with no notice until the next prompt; Claude Code wakes the session when a background task it tracks ends, so this should not happen in practice.

## Migration Plan

None: the change is in a kit script. It reaches each machine at the next release tag, through «Actualizar» or the checkout of the tag; rolling back is checking out the previous tag.
