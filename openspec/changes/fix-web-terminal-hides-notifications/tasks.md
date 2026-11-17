# Tasks

## 1. Branch (mandatory step 1)

- [x] 1.1 Create `bugfix/43-las-notificaciones-de-las-maquinas-linux-se-pierden` from `origin/master` in its own worktree with `/koalarnes:git-worktree create`; verify with `git branch --show-current`.

## 2. Review the existing tests (mandatory step 2)

- [x] 2.1 Read `server/src/notifications.test.ts` and confirm its cases still describe the intended behaviour of `onScriptNotify` and the fallback; record one line: "tests up to date" or "tests updated/added in this change".
  - `server/src/notifications.ts`: tests up to date; tests added in this change for the `viewed` and `watched in web` drops, which no case covered.
- [x] 2.2 Confirm `host-kit/tmux-window-title.sh` has no automated test (host-kit standards, Testing) and record "tests added in this change" for it.
  - `host-kit/tmux-window-title.sh`: no automated test existed; tests added in this change (`scripts/test-window-title.sh`).

## 3. The kit ignores the web terminal (host-kit)

- [x] 3.1 Write `scripts/test-window-title.sh` as in design D3 (isolated tmux on `-L twbwt` with its own `TMUX_TMPDIR`, `TMUX`/`TMUX_PANE` unset, fake hub on a loopback port, clients through `script -qfc`, sentinel check of the default socket, `KEEP=1`, exit 0 with a message on macOS). Cases: web client only on the pane → `viewed: false` and `@pane_icon` ✅; plain client on the pane → `viewed: true` and 🤖; plain client on another window → `viewed: false`; plain client on the pane idle for 150 s, with the `date` wrapper of design D3 first on the script's `PATH` → `viewed: false`. Run it against the current script and verify the web-only case fails for the reason the spec names (`viewed=true`, 🤖) while the other cases, whose behaviour does not change, pass; after 3.2, break the 120 s comparison on purpose and verify the idle case fails, and drop the `_tw-` filter on purpose and verify the web-only case fails.
- [x] 3.2 In `host-kit/tmux-window-title.sh`, replace the `display-message` checks of `pane_is_viewed` and `user_is_looking` with one walk of `tmux list-clients` that skips `_tw-*` sessions and keeps clients whose current pane is the notifying one (design D1); keep the Ghostty check on macOS and the 120 s activity rule elsewhere, applied to those clients only. Verify `scripts/test-window-title.sh` passes.
- [x] 3.3 Add a comment next to `WEB_SESSION_PREFIX` in `server/src/host.ts` naming the kit scripts that match the prefix (`tmux-window-title.sh`, `tmux-spaces.sh`); verify with `pnpm --filter server typecheck`.
- [x] 3.4 In `.claude/koalarnes.json`, add `scripts/test-window-title.sh` to the host-kit layer's paths and make its test command run `scripts/test-kit-update.sh` and `scripts/test-window-title.sh`; run `ka sync` and verify the host-kit commands in `.claude/rules/koalarnes-mandatory-steps.md` list both.
- [x] 3.5 Update `docs/dev-standards/host-kit-standards.md`, Testing: replace the line saying `tmux-window-title.sh` has no automated tests with the integration level of `scripts/test-window-title.sh` and what it checks; add `scripts/test-window-title.sh` to the layer's paths in its first paragraph. Verify `ka docs-check` reports no dead reference.

## 4. The hub logs every notice it holds back (server)

- [x] 4.1 In `server/src/notifications.test.ts`, add two tests that capture `console.log`: a notice with `viewed: true` pushes nothing and logs `[push] … no se envía, ya lo has visto en la terminal` with the pane's window title; a notice for a pane watched in a visible web tab pushes nothing and logs `[push] … no se envía, lo tienes abierto en la web`. Run `pnpm --filter server test` and verify both fail.
- [x] 4.2 In `Notifier.onScriptNotify`, write those lines before returning `viewed` and `watched in web` (design D2), with the title from the tree when the pane is found and the icon plus the host name otherwise. Verify `pnpm --filter server test` passes.
- [x] 4.3 Review round 1 (R1-01): add a test that a notice from a host id the hub does not have pushes nothing and logs `[push] ✅ <id>: no se envía, la máquina <id> no está en el panel`, and make the unknown-pane `viewed` test also assert nothing was pushed; run `pnpm --filter server test` and verify the new test fails.
- [x] 4.4 Write that line before returning `unknown host` in `onScriptNotify` (design D2); verify `pnpm --filter server test` passes.

## 5. Tests, typecheck and lint (mandatory step 4)

- [x] 5.1 Run `pnpm --filter server test` and `pnpm --filter server typecheck`; both pass.
- [x] 5.2 Run the host-kit test command (`scripts/test-kit-update.sh` and `scripts/test-window-title.sh`); both pass.
- [x] 5.3 Run `ka scope` and `ka features-check`; the catalogue check passes or is reported as not applicable.

## 6. Documentation and changelog (mandatory step 5)

- [x] 6.1 Run `/koalarnes:update-docs` over the branch and apply what it proposes (the host-kit testing level and the web session prefix contract); verify the standards match the code.
- [x] 6.2 Add the changelog entries with `/koalarnes:changelog`, in es-ES, one per independent change: a `fixed` entry (scope `host-kit`) for notifications from Linux machines arriving while the web terminal stays open, and an `added` entry (scope `server`) for the log lines of the notices the hub holds back; verify the JSON files under `changelogs/unreleased/`.

## 7. Feature catalogue (mandatory step 6)

- [ ] 7.1 After `ka review-rounds gate` passes, run `/koalarnes:update-features fix-web-terminal-hides-notifications` to add the «Notificaciones» area with one section per `push-notifications` requirement, and apply it.
- [ ] 7.2 Run `ka features-check --strict`; exit code 0.
- [ ] 7.3 Commit the catalogue with `/koalarnes:commit`.

## 8. E2E pipeline (mandatory step 7)

- [x] 8.1 Record that the project has no E2E suite: this step does not apply.
  - Not applicable: the project has no E2E suite (`ka scope`: "the project has no E2E suite").

## 9. Human review (mandatory step 8)

- [ ] 9.1 After the gate passes and the catalogue is committed, ask the owner with `AskUserQuestion` who reviews the pull request, and record the answer here.

## 10. features-check before the archive (mandatory step 9)

- [ ] 10.1 Run `ka features-check --strict` as the last task before `/opsx:archive`; exit code 0.

## Workflow follow-up

- `/opsx:archive`, `/koalarnes:commit` of the archive moves, check the pull request head and merge with `--squash`.
- Follow the `deploy` run with `gh run watch` (the server change deploys the hub) and report it.
- Propose a release: the kit fix reaches the machines only with it. After «Actualizar» on `drangleic-dev`, repeat the 60 s check with the web terminal: the ✅ must arrive.
- Comment on Issue #43 with the pull request link (es-ES) and close it; remove the worktree with `/koalarnes:git-worktree remove`.
