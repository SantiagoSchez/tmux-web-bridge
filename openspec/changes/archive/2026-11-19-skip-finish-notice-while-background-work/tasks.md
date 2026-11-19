# Tasks

## 1. Branch (mandatory step 1)

- [x] 1.1 Create the branch `bugfix/55-aviso-terminado-con-trabajo-en-segundo-plano` (Issue #55's title, shortened to fit 64 characters) from `origin/master` in its own worktree with `/ka:git-worktree create`; verify with `git branch --show-current`.
  - Created; `git branch --show-current` prints the branch, based on `7203adf`.

## 2. Review the existing tests (mandatory step 2)

- [x] 2.1 Read the tests of every module the change touches and output one line per module: `host-kit/tmux-window-title.sh` (`scripts/test-window-title.sh`: its four cases run `state done` with a payload that has no `background_tasks` or `session_crons`; confirm they still describe a real finish), and `scripts/test-kit-update.sh` (not touched by the change; confirm it does not exercise `state done`).
  - `host-kit/tmux-window-title.sh` (`scripts/test-window-title.sh`): tests up to date; its four cases (`{"last_assistant_message":"Listo"}`, no arrays) describe a real finish and stay valid. Tests added in this change (3.1).
  - `scripts/test-kit-update.sh`: tests up to date; it only checks that `install.sh` writes the `Stop` hook's command (`state done`), not what the command does.

## 3. Pause on pending background work (mandatory step 3, design D1 to D4)

`scripts/test-window-title.sh` runs the real script against its own tmux (`-L twbwt`, its own `TMUX_TMPDIR`, no `TMUX`/`TMUX_PANE`) and a fake hub on a loopback port. Never run a bare `tmux` or the script against the real tmux server.

- [x] 3.1 Let `finish()` in `scripts/test-window-title.sh` take the `Stop` payload as an argument (default: today's `{"last_assistant_message":"Listo"}`), and wait for the hub only as long as needed when no notice is expected. Add the failing cases, each on a pane open only in the web terminal: a `subagent` task (no notice, 🔨); only a `session_crons` entry (no notice, 🔨); only a `shell` task (notice not seen, ✅); empty arrays (notice not seen, ✅); a `subagent` pause followed by a `Stop` with empty arrays (exactly one notice, ✅). Run `scripts/test-window-title.sh` and see the pause cases fail for the right reason (a notice was sent, ✅ shown).
  - `finish()` takes the payload as `$2` and `WAIT` (tenths of a second) shortens the wait when no notice is expected. Five cases added; the shell-only and empty-arrays cases pass already. Failed first, 5 checks: the subagent and the cron cases got `prueba %0 viewed=false` and ✅, and the pause-then-finish case got 2 notices instead of 1.
- [x] 3.2 In `cmd_state` of `host-kit/tmux-window-title.sh`, when the state is `done` and `jq` is available, read `background_tasks` (entries whose `type` is not `shell`) and `session_crons` from `PAYLOAD`; when either is non-empty, set the state to `busy` and send no notice. A missing `jq` or a payload that is not JSON keeps the current path. Update the script's header comment (the `Stop` → `state done` behaviour). Verify with `scripts/test-window-title.sh` (every case passes).
  - `waits_for_background()` (jq, `[.background_tasks[]? | select(.type != "shell")]` or a non-empty `session_crons`); `cmd_state` turns `done` into `busy` with no event. Header comments of the script and of the test updated. `scripts/test-window-title.sh`: «Todo bien.»

## 4. Tests, typecheck and lint (mandatory step 4)

- [x] 4.1 Run `scripts/test-kit-update.sh && scripts/test-window-title.sh` and see them pass. The `host-kit` layer has no typecheck or lint command.
  - Both end with «Todo bien.». `bash -n` passes on both changed scripts; `shellcheck` is not installed on this machine.
- [x] 4.2 Run `ka scope` and the project checks it lists (`ka features-check`, `ka docs-check`); report the ones that do not apply. Run `openspec validate --strict skip-finish-notice-while-background-work`.
  - Both checks apply and exit 0: `ka features-check` lists as pending the requirement the catalogue step (6.1) adds; `ka docs-check` finds no dead reference. `openspec validate --strict` passes.

## 5. Documentation and changelog (mandatory step 5)

- [x] 5.1 Run `/ka:update-docs`: the flow visible to the owner changes (when «Terminado» arrives). Check whether `docs/dev-standards/host-kit-standards.md` (Testing: what `scripts/test-window-title.sh` drives) and the README's description of the notices need a line; verify with `ka docs-check`.
  - `docs/dev-standards/host-kit-standards.md` (Testing): the line on `scripts/test-window-title.sh` now says it checks that a `Stop` payload with pending work sends no notice and keeps 🔨. The README says nothing the change makes false (it lists ✅ as «terminado» and the push notices without saying when a turn ends). `ka docs-check`: no dead reference.
- [x] 5.2 Add a changelog entry with `/ka:changelog` (es-ES, `fixed`, Issue #55: «Terminado» no longer arrives while Claude waits for background work); verify the JSON file under `changelogs/unreleased/`.
  - `changelogs/unreleased/20261119T170527591-bugfix-55-aviso-terminado-con-trabajo-en-segundo-plano.json` (`fixed`, `host-kit`, Issue 55). `--pr` is added by `/ka:commit` when it opens the pull request.

## 6. Feature catalogue (mandatory step 6, after the review loop's gate passes)

- [x] 6.1 Run `/ka:update-features skip-finish-notice-while-background-work` for the new requirement of `push-notifications`, then `ka features-check --strict` with exit code 0, and commit with `/ka:commit`.
  - New section «Una pausa a la espera de trabajo en segundo plano no avisa» in the «Notificaciones» area of `docs/FEATURES.md`, after «El ✅ de un panel terminado». `ka features-check --strict`: exit 0, 56 sections verified.

## 7. E2E pipeline (mandatory step 7)

- [x] 7.1 The project has no E2E suite; this step does not apply. Record it here.
  - Not applicable: `ka scope` reports "the project has no E2E suite".

## 8. Human review (mandatory step 8)

- [x] 8.1 Ask the owner with `AskUserQuestion` who reviews the pull request (a person, or the owner takes it as good) and record the answer here; do not archive before the approval or that answer.
  - The owner takes PR #56 as good without a manual review (2026-11-19), after review round 1 approved it and `ka review-rounds gate` passed on `b2b5d88`.

## 9. features-check before the archive (mandatory step 9)

- [x] 9.1 Run `ka features-check --strict` as the last task before `/opsx:archive`; the exit code must be 0.
  - Exit 0: 56 sections verified.

## Workflow follow-up

- Between groups 5 and 6: `/opsx:verify`, `/ka:commit` with the pull request, and the bounded review loop (`/ka:review-pr`, `ka review-rounds record`, `ka review-rounds gate`). No adversarial review: no payload, wiring or migration changes.
- After the approval: `/opsx:archive`, `/ka:commit`, check the pull request's head against `git rev-parse HEAD`, merge with `gh pr merge --squash --match-head-commit <sha>`, follow the `deploy` run with `gh run watch` (this change touches only `host-kit/**`, so the merge may deploy nothing), and propose the release, which is what brings the fix to the machines.
- Ask in one `AskUserQuestion` whether to comment on Issue #55 with the pull request's link (es-ES) and close it, and whether to remove the worktree with `/ka:git-worktree remove`.
