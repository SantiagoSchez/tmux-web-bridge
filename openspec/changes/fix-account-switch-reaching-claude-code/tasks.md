# Tasks

## 1. Branch (mandatory step 1)

- [x] 1.1 Create the branch `bugfix/60-los-claude-en-marcha-en-un-mac-siguen-con-la-cuenta` (Issue #60's title, shortened to 61 characters) from `origin/master` in its own worktree with `/ka:git-worktree create`; verify with `git branch --show-current`. Issue #61 was found after the branch was created and is fixed in the same pull request (owner's choice).
  - Created; `git branch --show-current` prints the branch, based on `c9c5d41` (`origin/master`).

## 2. Review the existing tests (mandatory step 2)

- [x] 2.1 Read the tests of every module the change touches and output one line per module: `server/src/host-creds.ts` is covered by the script tests of `server/src/accounts.test.ts` (`fakeExec`, `fakeHome`, `fakeMac`). Confirm the Linux tests, the Keychain-switch tests (through SSH and through tmux) and the refused-write test still describe the intended behaviour, and note what none checks: the credentials file's modification time, a Mac without that file, a tmux server that sets `CLAUDE_CONFIG_DIR`. Note that the fake `security` ignores the service name and the fake Mac `tmux` answers only `run-shell`; group 3 extends them.
  - `server/src/host-creds.ts`: tests up to date for the existing behaviour (the Linux tests run with `tmux` = `false`, so the default folder stays covered); tests added in this change for the file's time, a Mac without the file and `CLAUDE_CONFIG_DIR`.

## 3. The Claude Code folder of the machine's tmux sessions (mandatory step 3, design D1)

The script tests run the real script with `/bin/sh` in a temporary `HOME`, with fake `uname`, `security` and `tmux` on `PATH`; no real tmux is started.

- [x] 3.1 Extend the fakes in `server/src/accounts.test.ts`: a fake `tmux` option that answers `show-environment -g CLAUDE_CONFIG_DIR` with `CLAUDE_CONFIG_DIR=<folder>` (exit 1, like tmux, when not set) for the Linux machine and for `fakeMac`; and a fake `security` that keeps one password file per service name (`-s`), so a test can tell `Claude Code-credentials` from `Claude Code-credentials-<hash>`. Verify that every existing script test still passes with `pnpm --filter server test`.
  - `showEnvironment()`, `fakeTmux()`, `fakeConfigDir()`, `folderService()`, `fakeMac`'s `configDir` and the per-item fake `security` (`~/kc<rest of the item's name>`, exit 44 for a missing item); `keychainWrite` takes the item. 344 tests pass.
- [x] 3.2 Write the failing tests: (a) a Linux machine whose tmux sets `CLAUDE_CONFIG_DIR` to `$HOME/.claude-twb`, with another login and account there than in `~/.claude`: `inspectHost` returns the folder's login and account; (b) a switch of that machine writes the new login into `.claude-twb/.credentials.json` and the account into `.claude-twb/.claude.json`, keeps `~/.claude/.credentials.json` and `~/.claude.json` byte for byte, and leaves no lock behind (`.claude-twb/.oauth_refresh.lock`, `.claude-twb.lock`, `.claude-twb/.claude.json.lock`); (c) a Mac whose tmux sets the variable and whose Keychain answers through tmux is read from and switched in the item `Claude Code-credentials-<first 8 hex of sha256 of the folder>` (computed in the test with `node:crypto`), and the item `Claude Code-credentials` keeps its login. Run `pnpm --filter server test` and see them fail for the right reason (the default folder or item is used).
  - The three failed: (a) read `rt-max`, the default folder's; (b) waited on the default folder's refresh lock the test holds (a refresh of the bot) and ended with `ERR lock`; (c) read `rt-pro` from `Claude Code-credentials`. Test (b) also holds `~/.claude/.oauth_refresh.lock`, so it proves the switch no longer takes the default folder's locks.
- [x] 3.3 In the script of `server/src/host-creds.ts`, read the folder with `t show-environment -g CLAUDE_CONFIG_DIR` before any lock and derive from it the paths, the locks and, on Darwin, the Keychain service, as design D1 says; the default folder keeps today's paths and name. Verify with `pnpm --filter server test` (3.2 passes, the existing tests still pass) and `pnpm --filter server typecheck`.
  - `F` from `t show-environment -g CLAUDE_CONFIG_DIR` (value cut after the first `=`: `${…}` cannot be written inside the script's `String.raw`); `C`, `CONF`, `CREDS`, the lock `$C.lock` and, on Darwin, `SVC` with the hash (`shasum -a 256`, `sha256sum` where `shasum` is missing) follow from it. 347 tests pass; typecheck clean.

## 4. Running Claude Codes pick up a Keychain switch (mandatory step 3, design D2)

- [x] 4.1 Write the failing tests: in the Keychain-switch tests (SSH and tmux), set the credentials file's times to a past date with `utimesSync` before the switch and assert after it that its content is byte for byte the same and its `mtimeMs` is later than that date; a new test, a Mac whose store is the Keychain (through tmux) with no `.credentials.json`, switched: the Keychain holds the new login and the file still does not exist; in the refused-write test, assert the file's `mtimeMs` is unchanged too; in 3.2 (c), assert the folder's `.credentials.json` has a new time. Run `pnpm --filter server test` and see the time assertions fail for the right reason (the time is unchanged).
  - The SSH and tmux Keychain switches and the `CLAUDE_CONFIG_DIR` Mac test failed on the time (it stayed at 2020-01-01). The no-file test and the refused-write test passed already, as nothing touches the file today; they guard the fix against creating the file or touching it on a refusal.
- [x] 4.2 In the script, after the Keychain write succeeds and before the account file is written, run `touch -c "$CREDS"` from the SSH session, ignoring its failure. Verify with `pnpm --filter server test` (4.1 passes) and `pnpm --filter server typecheck`.
  - `touch -c "$CREDS" 2>/dev/null` right after the Keychain write's `|| { echo "ERR keychain"; exit 6; }`. 348 tests pass; typecheck clean.
- [x] 4.3 Rewrite the header comment of `server/src/host-creds.ts`: the folder comes from the tmux server's `CLAUDE_CONFIG_DIR` (default `~/.claude`) with Claude Code's own names for its files, locks and Keychain item; Claude Code 2.1.329 re-reads its store when the time of the folder's `.credentials.json` changes, on every check through a 30 s cache when the file is missing, otherwise at its token's expiry; so a Keychain switch touches the file without writing it. Verify by reading the comment against design.md's Context.
  - Rewritten: a paragraph on which Claude Code and its folder, the folder-suffixed Keychain item, `<folder>/.claude.json`, a paragraph on when a running Claude Code reads its store again (the old «within ~30 s» line removed), and the folder's lock named generically. Checked against design.md's Context.

## 5. Tests, typecheck and lint (mandatory step 4)

- [x] 5.1 Run `pnpm --filter server test` and `pnpm --filter server typecheck` and see them pass. The `server` layer has no lint command.
  - 348 tests pass, 0 fail; typecheck exit 0.
- [x] 5.2 Run `ka scope` and the project checks it lists (`ka features-check`, `ka docs-check`); report the ones that do not apply.
  - Both apply and exit 0. `ka features-check` lists as pending the added requirement «the-hub-uses-the-claude-code-folder-of-the-machine-s-tmux-sessions» (catalogue step 7.1); `ka docs-check` finds no dead reference.

## 6. Documentation and changelog (mandatory step 5)

- [x] 6.1 Run `/ka:update-docs`: `docs/dev-standards/server-standards.md` gets, where it describes reaching a machine's Claude Code login, that the folder is the tmux server's `CLAUDE_CONFIG_DIR`; check that no standards document says only `~/.claude` is handled or when a running Claude Code re-reads its login. Verify with `ka docs-check`.
  - `docs/dev-standards/server-standards.md` (Conventions): a new line after the Keychain one: the folder comes from the tmux server's `CLAUDE_CONFIG_DIR`, the SSH session lacks the variable, and with it the account file and the Keychain item change. No document said only `~/.claude` is handled or when a running Claude Code re-reads its login (`grep` of «~30 s» and «default config folder only»: nothing left). `ka docs-check`: no dead reference. Found while doing it: the `HOOK` script of `server/src/worktree-base.ts` reads `${CLAUDE_CONFIG_DIR:-$HOME/.claude}` over SSH, so it always looks at the default folder; reported to the owner, out of this change's scope.
- [x] 6.2 Add the changelog entries with `/ka:changelog` (es-ES, `fixed`, `server`): one for Issue #60 (the Claude Codes already running on a Mac switch account on their next request) and one for Issue #61 (the switch reaches the Claude Codes whose tmux sets another config folder, and no longer touches the default one there); verify the JSON files under `changelogs/unreleased/`.
  - Two `fixed` entries for `server` under `changelogs/unreleased/`: `20261119T211957136-…json` (Issue 60) and `20261119T211958594-…json` (Issue 61), read back. `--pr` is added by `/ka:commit` when it opens the pull request.

## 7. Feature catalogue (mandatory step 6, after the review loop's gate passes)

- [x] 7.1 Run `/ka:update-features fix-account-switch-reaching-claude-code` for the added and the modified requirements of `claude-accounts`, then `ka features-check --strict` with exit code 0, and commit with `/ka:commit`.
  - Run after `ka review-rounds gate` passed on `7d62394` (round 1: no blocker). `docs/FEATURES.md`, area «Cuentas de Claude»: new section «La cuenta de los Claude de los paneles» (line 328) and «En el Mac solo se toca el Llavero» rewritten (line 333). `ka features-check --strict`: exit 0, 67 sections verified.

## 8. E2E pipeline (mandatory step 7)

- [x] 8.1 The project has no E2E suite; this step does not apply. Record it here.
  - Not applicable: `ka scope` reports «the project has no E2E suite».

## 9. Human review (mandatory step 8)

- [ ] 9.1 Ask the owner with `AskUserQuestion` who reviews the pull request (a person, or the owner takes it as good) and record the answer here; do not archive before the approval or that answer.

## 10. features-check before the archive (mandatory step 9)

- [ ] 10.1 Run `ka features-check --strict` as the last task before `/opsx:archive`; the exit code must be 0.

## Workflow follow-up

- Between groups 6 and 7: `/opsx:verify`, `/ka:commit` with the pull request (closing Issue #60 and Issue #61), and the bounded review loop (`/ka:review-pr`, `ka review-rounds record`, `ka review-rounds gate`). No adversarial review: the change keeps the script's protocol and the stored data, with no payload, wiring or migration in the hub.
- After the approval: `/opsx:archive`, `/ka:commit`, check the pull request's head against `git rev-parse HEAD`, merge with `gh pr merge --squash --match-head-commit <sha>`, follow the `deploy` run with `gh run watch`, and propose the release.
- After the deploy: on drangleic-claude, the owner gives the Telegram bot its own login again (design.md, Migration Plan) and switches the machine from the panel, checking that the panes' hover names the new account; on the MacBook Pro, the owner switches account with Claude Codes running and checks that their hover changes after their next answer.
- Ask in one `AskUserQuestion` whether to comment on Issue #60 and Issue #61 with the pull request's link (es-ES) and close them, and whether to remove the worktree with `/ka:git-worktree remove`.
