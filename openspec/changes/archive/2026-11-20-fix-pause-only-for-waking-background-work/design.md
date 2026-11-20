# Design

## Context

`cmd_state` in `host-kit/tmux-window-title.sh` handles Claude Code's `Stop` hook (`state done`, the hook's JSON in `PAYLOAD`). `waits_for_background` decides whether the end of turn is a pause: today it returns true when `background_tasks` holds an entry whose `type` is not `shell`, or `session_crons` holds any entry. On a pause the state becomes `busy` and no notice is sent.

Claude Code 2.1.329 builds `background_tasks` from its task registry: every task whose status is `running` or `pending` and that is not a foreground task, except `post_turn_memory`. Each entry's `type` is a label: `subagent` (local agent), `workflow`, `shell` (background Bash), `monitor` (the `Monitor` tool, MCP monitors and WebSocket monitors, ambient ones included), `MCP task`, `teammate`, `dream` (memory consolidation), `auto-mode scan` and `cloud session`; an unknown task type falls back to its raw name. `dream` and `auto-mode scan` are Claude Code's own work: they run without a transcript and never wake the session when they end.

The kit keeps one state file per pane in `$STATE_DIR` (`/tmp/tmux-window-state-<uid>-<server pid>/<pane>`), plus `<pane>.since` while a permission is pending. Nothing lists the folder: every reader opens `$STATE_DIR/<pane>` by name, so a new `<pane>.pause` file is read by no one by accident. `cmd_clear` (`SessionEnd`) and `cmd_reload` remove `<pane>` and `<pane>.since`.

## Goals / Non-Goals

**Goals:**

- Hold the notice back only for background work that will wake Claude up.
- Leave on the machine a record of what held each pause, so the next stuck pane can be explained from its file instead of guessed.

**Non-Goals:**

- A fallback for work that ends without waking Claude (see the proposal's Non-goals).
- Any change to the hub, the web panel or `host-kit/claude-hooks.json`.

## Decisions

### D1. A closed list of the task types that wake Claude

The pause check (`background_wakeups`, which replaces `waits_for_background`) counts an entry of `background_tasks` only when its `type` is one of `subagent`, `workflow`, `monitor`, `teammate`, `cloud session` or `MCP task`. `session_crons` keeps counting whatever it holds. `shell`, `dream`, `auto-mode scan` and any other label do not count.

- Context: decision D2 of `skip-finish-notice-while-background-work` counted every type but `shell`, unknown ones included, so a new kind of agent work would be a pause by default. Claude Code's internal tasks proved the default wrong: a type the kit does not know is more likely internal work than a new way to wake Claude.
- Consequences: a future Claude Code type that does wake Claude sends a «Terminado» too early until the kit adds its label. That costs one early notice per turn; the old default cost a pane stuck at 🔨 with no notice at all. The owner chose the closed list on 2026-11-20.
- Alternative: keep D2 and add `dream` and `auto-mode scan` to the excluded labels. Rejected: the next internal type would stick the panes again.

### D2. The pause record is the filtered payload, in `<pane>.pause`

On a pause, `cmd_state` writes to `$STATE_DIR/<pane>.pause` a JSON object with the `background_tasks` entries that counted and the `session_crons`, as `jq` filtered them for D1. The same `jq` program decides the pause and produces the record, so both always agree. Each pause overwrites the file. A real end of turn (`state done` that is not a pause), `cmd_clear` and `cmd_reload` remove it, next to the `.since` file.

- Alternative: keep the whole payload. Rejected: it carries `last_assistant_message`, the text of Claude's reply, which has no place in a world-readable file under `/tmp`. The filtered entries hold task descriptions and cron prompts, which the state folder already exposes to the same user's processes in other forms; the file is written with the same permissions as the state file.
- Alternative: send the record to the hub. Rejected by the owner: it would change the `POST /api/notify` payload and touch the server layer.

### D3. The record does not change what the pane shows

The `.pause` file is written and removed by `cmd_state` only; `cmd_refresh`, `tmux-spaces.sh` and the icons keep reading `<pane>` alone. A `UserPromptSubmit` or a tool hook after a pause leaves the file in place: Claude is working again, and the record still says what the last pause waited for until the next pause or the real finish replaces or removes it.

### D4. The window-title integration test also runs on macOS

`scripts/test-window-title.sh` exits at once outside Linux, so this change could not be tested on the owner's Mac. Two things tie it to Linux: it attaches tmux clients with util-linux `script -qfc "<command>"`, and on macOS the kit decides «you are looking at it» by asking `lsappinfo` and `osascript` whether Ghostty is visible, which would make the result depend on the desktop of whoever runs the test. On macOS the test attaches clients with BSD `script -q /dev/null <command>`, and puts first on the script's `PATH` a fake `lsappinfo` that reports Ghostty in front or not (from a file of the test's folder) and a fake `osascript` that reports no floating Ghostty window. The case of an idle terminal (Linux: the clock 150 s ahead) becomes, on macOS, a terminal with Ghostty not visible; both expect a notice not seen. Every other case is the same on both systems.

- Alternative: keep the test Linux-only and run it on drangleic-dev. Rejected by the owner on 2026-11-20: every run would need the branch's files copied to another machine.

### D5. The kit-update test works from its folder's physical path

On macOS `scripts/test-kit-update.sh` fails 6 uninstall checks: `/tmp` is a link to `/private/tmp`, so for `shared_dir()` in `server/src/kit.ts` every file under the fake `HOME` sits in a linked folder, and the uninstall leaves them (`LEFT=` lines) as it should for a really shared file. The kit's behaviour is right; the test's folder is what misleads it. The test takes the physical path of its temporary folder (`pwd -P` after `mktemp -d`), so `HOME` and every path the test builds hold no link. Its first `git clone --bare` of the working tree also fails now and then on this Mac («trying to write ref … with nonexistent object»), with a different tag on each run; a local clone copies the object files directly, and the repository lives in a Dropbox folder. The test clones with `--no-local`, which reads the objects through git instead.

- Context: the owner asked on 2026-11-20 to fix it in this change, so that every test of the layer runs on the Mac where the change is made.
- Alternative: teach `shared_dir()` to ignore a link above `HOME`. Rejected: a machine whose home sits under a linked folder really shares it, and the uninstall must keep leaving it alone.

## Risks / Trade-offs

- [The real cause of Issue #65 is a type on the list, such as an ambient `monitor` or a skill run as a background subagent] → The panes would still stick; the `.pause` file then names the task, which is what the next change needs. Telling ambient monitors apart is out of reach: the `Stop` input labels them `monitor` with no other field.
- [Claude Code renames a label on the list] → That type stops holding the notice back and a «Terminado» arrives early. The integration test pins the labels the kit expects.
- [A missing `jq` or a payload that is not JSON] → Unchanged: no pause and no record, the end of turn is a finish.
- [On macOS the test fakes the Ghostty check] → The real `ghostty_is_visible` stays untested there, as it is today; the test covers what the kit does with its answer.

## Migration Plan

None: the change is in a kit script. It reaches each machine at the next release tag, through «Actualizar» or the checkout of the tag; rolling back is checking out the previous tag. Panes already stuck at 🔨 recover at their next prompt or end of turn.
