# Tasks

## 1. Branch (mandatory step 1)

- [x] 1.1 Create the branch for Issue #65 from `origin/master` in its own worktree with `/ka:git-worktree create`; the issue's title gives a slug over 64 characters, so the name is shortened to `bugfix/65-ventanas-sin-aviso-por-tareas-internas`. Verify with `git branch --show-current`.
  - Created; `git branch --show-current` prints `bugfix/65-ventanas-sin-aviso-por-tareas-internas`, based on `f201258`.

## 2. Review the existing tests (mandatory step 2)

- [x] 2.1 Read the tests of every module the change touches and output one line per module: `host-kit/tmux-window-title.sh` (`scripts/test-window-title.sh`: its pause cases use `subagent`, a cron, `shell` and empty arrays; confirm they still describe the intended behaviour under D1) and `scripts/test-kit-update.sh` (confirm it does not exercise `state done` or the state folder).
  - `host-kit/tmux-window-title.sh` (`scripts/test-window-title.sh`): tests updated/added in this change. Its existing pause cases (`subagent`, cron, `shell`, empty arrays) stay valid under D1; it lacked the internal and unknown types (4.1), the record (5.1) and could not run on macOS (3.1).
  - `scripts/test-kit-update.sh`: tests up to date; it only checks that `install.sh` writes the `Stop` hook's command (`state done`), not what the command does, and never reads the state folder.

## 3. The window-title test runs on macOS (mandatory step 3, design D4)

`scripts/test-window-title.sh` runs the real script against its own tmux (`-L twbwt`, its own `TMUX_TMPDIR`, no `TMUX`/`TMUX_PANE`) and a fake hub on a loopback port. Never run a bare `tmux` or the script against a real tmux server.

- [x] 3.1 In `scripts/test-window-title.sh`, drop the early exit outside Linux and support macOS: `client()` takes the tmux arguments as words and attaches with `script -qfc` on Linux and `script -q /dev/null` on macOS; on macOS a folder of the test's own, first on `PATH`, holds a fake `lsappinfo` (Ghostty in front or not, read from a file of the test's folder; in front by default) and a fake `osascript` (no floating Ghostty window); the idle-terminal case uses the advanced clock on Linux and Ghostty not visible on macOS. Refuse to run on any other system with a message. Update the header comment. Verify: the test ends with «Todo bien.» on this Mac with every existing case run (none skipped), and a sentinel check still shows the default-socket tmux untouched.
  - Done. `client()` takes words (`client attach -t main \; select-window -t :1`); on Linux it quotes them with `printf %q` into `script -qfc`. The fakes live in `$T/mac`, first on `PATH`; `$T/ghostty` says `front` or `oculto`. On this Mac (macOS, Ghostty in front while it ran) every one of the 21 checks passes, the idle case included, so the fake decides; «Todo bien.», no `/tmp/twbwt.*` left. The Linux branch of `client()` is not run yet on Linux: group 6 runs it there too.
## 4. Only the task types that wake Claude make a pause (mandatory step 3, design D1)

- [x] 4.1 Add the failing cases to `scripts/test-window-title.sh`, each on a pane open only in the web terminal: a `Stop` whose only background tasks are `dream` and `auto-mode scan` plus a `shell` (notice not seen, ✅); one whose only task has a made-up type such as `future-thing` (notice not seen, ✅); one with a `workflow`, one with a `monitor`, one with a `teammate`, one with a `cloud session` and one with an `MCP task` (each: no notice, 🔨). Run the test and see the `dream` and unknown-type cases fail for the right reason (no notice, 🔨) while the others pass.
  - Added (`STOP_INTERNAL`, `STOP_UNKNOWN`, a loop over the five other waking types). Seen failing on macOS, 4 checks: the internal and the unknown-type cases got «sin aviso» and 🔨; the five waking types passed.
- [x] 4.2 In `waits_for_background` of `host-kit/tmux-window-title.sh`, count a `background_tasks` entry only when its `type` is `subagent`, `workflow`, `monitor`, `teammate`, `cloud session` or `MCP task`; keep `session_crons` as it is. Use only `jq` features available in jq 1.6. Update the comment above the function and the header line on pauses. Verify: every case of `scripts/test-window-title.sh` passes.
  - The `jq` program holds the six labels in `$wake` and matches with `$wake | any(. == $t)` (jq 1.5+). Comments updated. On macOS: «Todo bien.».

## 5. The pause record (mandatory step 3, design D2 and D3)

- [x] 5.1 Add the failing cases to `scripts/test-window-title.sh`: after a `Stop` with a `subagent`, a `shell` and a cron, `$STATE_DIR/<pane>.pause` exists, lists the subagent's id and the cron's id, and does not list the shell's id nor `last_assistant_message`; after a following `Stop` with empty arrays, the file is gone; after a pause followed by `tmux-window-title.sh clear`, the file is gone. The test derives `STATE_DIR` the way the script does (`/tmp/tmux-window-state-<uid>-<server pid>`). Run it and see these cases fail because the file does not exist.
  - Added (`STOP_MIXED`, `pause_file`). Seen failing on macOS, 3 checks: «sin registro», an empty `grep -c` and «no está». The two «desaparece» checks passed vacuously then; they were seen failing in 5.2.
- [x] 5.2 In `host-kit/tmux-window-title.sh`, have the pause check produce the filtered record (`background_tasks` entries that count and `session_crons`) and write it to `$STATE_DIR/$TMUX_PANE.pause` on a pause; remove the file on a real end of turn in `cmd_state`, in `cmd_clear` and in `cmd_reload`, next to the `.since` file. Verify: every case of `scripts/test-window-title.sh` passes, and `bash -n host-kit/tmux-window-title.sh` passes.
  - `waits_for_background` became `background_wakeups`: the same `jq` program prints the record (`-c`, the counted `background_tasks` and `session_crons`) and fails when there is nothing, so the decision and the record cannot disagree. `cmd_state` writes `<pane>.pause` after `write_state` on a pause and removes it on a real `done`; `cmd_clear` and `cmd_reload` remove it with `.since`. `bash -n` passes; on macOS «Todo bien.». With the two removals replaced by `:`, the «desaparece» checks fail («sigue»); restored.

## 5b. The kit-update test runs on macOS (mandatory step 3, design D5)

- [x] 5b.1 In `scripts/test-kit-update.sh`, take the physical path of the temporary folder (`pwd -P` after `mktemp -d /tmp/twb-kit-test.XXXXXX`), so no path the test builds goes through the `/tmp` link of macOS, and clone the working tree with `git clone --no-local --bare`. Update the comment that explains the `/tmp` choice. Verify: on this Mac the test ends with «Todo bien.» three runs in a row (before: 6 uninstall checks failed, and the first clone failed now and then); on drangleic-dev it still ends with «Todo bien.».
  - `T` takes `pwd -P` of the new folder; the bare clone uses `--no-local`; comments explain both. Before, on this Mac: 6 uninstall checks failed (3 `LEFT=` lines) and the first clone failed in 3 of 4 runs. After: 3 runs in a row, 49 checks, «Todo bien.». `docs/dev-standards/host-kit-standards.md` (Testing) gets the rule for tests under `/tmp` and clones of the working tree.

## 6. Tests, typecheck and lint (mandatory step 4)

- [x] 6.1 Run `scripts/test-kit-update.sh && scripts/test-window-title.sh` and see both end with «Todo bien.». Run `scripts/test-window-title.sh` on macOS and on a Linux machine with this branch's files (for example drangleic-dev), so both branches of `client()` and both idle cases run. The `host-kit` layer has no typecheck or lint command; run `shellcheck` on the changed scripts if it is installed, else say it is not.
  - macOS (this Mac): `scripts/test-kit-update.sh` «Todo bien.» (49 checks), `scripts/test-window-title.sh` «Todo bien.» (all cases). Linux (drangleic-dev, CT 110, reached with `pct exec` from drangleic.local; tmux 3.8, jq 1.7): a throwaway clone in `/tmp` at `f201258` with the three changed scripts copied over and `server/node_modules` linked to the main checkout's, so nothing was written in the Dropbox folder; both tests «Todo bien.», the idle case with the advanced clock. `bash -n` passes on the three scripts; `shellcheck` is not installed on this Mac.
- [x] 6.2 Run `ka scope` and the project checks it lists (`ka features-check`, `ka docs-check`), reporting the ones that do not apply; run `openspec validate --strict fix-pause-only-for-waking-background-work`. Each must exit 0.
  - `ka scope`: both checks apply, no E2E suite. `ka features-check`: exit 0, 83 sections verified, 1 pending (the added requirement, for group 8). `ka docs-check`: no dead reference. `openspec validate --strict`: valid.

## 7. Documentation and changelog (mandatory step 5)

- [x] 7.1 Run `/ka:update-docs`: the flow visible to the owner changes (when «Terminado» arrives). Update the Testing section of `docs/dev-standards/host-kit-standards.md`: `scripts/test-window-title.sh` runs on Linux and macOS (how it attaches clients and fakes the Ghostty check on macOS) and what it checks (the closed list and the `.pause` record); update the Stack line that says it uses util-linux `script`. Check the README says nothing this change makes false. Verify with `ka docs-check`.
  - `docs/dev-standards/host-kit-standards.md`: Stack (`script` on both systems) and Testing (the test runs on Linux and macOS, how it attaches clients and fakes the Ghostty check, the closed list and the `.pause` record). The README does not mention the test or the pause. `ka docs-check`: no dead reference; no `waits_for_background` left outside this change's history.
- [x] 7.2 Add a changelog entry with `/ka:changelog` (es-ES, `fixed`, `host-kit`, Issue #65: a window no longer stays at 🔨 without notice when Claude Code leaves only its own internal work in the background). Verify the JSON file under `changelogs/unreleased/`.
  - `changelogs/unreleased/20261120T093037045-bugfix-65-ventanas-sin-aviso-por-tareas-internas.json` (`fixed`, `host-kit`, issue 65). `--pr` is added by `/ka:commit` when it opens the pull request.

## 8. Feature catalogue (mandatory step 6, after the review loop's gate passes)

- [x] 8.1 Run `/ka:update-features fix-pause-only-for-waking-background-work` for the modified and the added requirement of `push-notifications`, then `ka features-check --strict` with exit code 0, and commit with `/ka:commit`.
  - After round 1's gate passed on `1a80ca7` (3 suggestions, scored 5, 3 and 3; none offered as follow-up work). `docs/FEATURES.md`: «Una pausa a la espera de trabajo en segundo plano no avisa» rewritten (internal work and unknown types do not count) and «Por qué una ventana sigue en 🔨 sin avisar» added under «Notificaciones». `ka features-check --strict`: exit 0, 84 sections in sync.

## 9. E2E pipeline (mandatory step 7)

- [x] 9.1 The project has no E2E suite; this step does not apply. Record it here.
  - Not applicable: `ka scope` reports "the project has no E2E suite".

## 10. Human review (mandatory step 8)

- [ ] 10.1 Ask the owner with `AskUserQuestion` who reviews the pull request (a person, or the owner takes it as good) and record the answer here; do not archive before the approval or that answer.

## 11. features-check before the archive (mandatory step 9)

- [ ] 11.1 Run `ka features-check --strict` as the last task before `/opsx:archive`; the exit code must be 0.

## Workflow follow-up

- Between groups 7 and 8: `/opsx:verify`, `/ka:commit` with the pull request, and the bounded review loop (`/ka:review-pr`, `ka review-rounds record`, `ka review-rounds gate`). No adversarial review: no payload, wiring or migration changes.
- After the approval: `/opsx:archive`, `/ka:commit`, check the pull request's head against `git rev-parse HEAD`, merge with `gh pr merge --squash --match-head-commit <sha>`, follow the `deploy` run with `gh run watch` (this change touches only `host-kit/**`, so the merge may deploy nothing), and propose the release, which is what brings the fix to the machines.
- Ask in one `AskUserQuestion` whether to comment on Issue #65 with the pull request's link (es-ES) and close it, and whether to remove the worktree with `/ka:git-worktree remove`.
