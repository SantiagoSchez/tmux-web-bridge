# Tasks

## 1. Branch (mandatory step 1)

- [x] 1.1 Create the branch `bugfix/52-el-mac-sigue-con-la-cuenta-anterior-y-ctrl-v-no-pega` (Issue #52's title, shortened to 62 characters) from `origin/master` in its own worktree with `/ka:git-worktree create`; verify with `git branch --show-current`.

## 2. Review the existing tests (mandatory step 2)

- [x] 2.1 Read the tests of every module the change touches and output one line per module: `server/src/accounts.test.ts` (covers `account-store.ts`, `claude-oauth.ts` parsing and the `host-creds.ts` script), `server/src/limits-check.test.ts` (not touched; confirm it still describes the warning), and `web/src/components/TerminalView.tsx` (no tests: `web` has no runner; checked in a browser in group 6). The test named «a Mac whose Keychain refuses the hub (SSH) switches through the file, as Claude Code does» describes the behaviour this change replaces: rename and rewrite it in group 3 so it covers a Mac with no tmux server.
  - `server/src/account-store.ts`: tests up to date for what stays; tests added in group 5 (confirmation, moves).
  - `server/src/accounts.ts` (`AccountManager`): no tests today; tests added in group 5.
  - `server/src/host-creds.ts`: two Mac tests describe the replaced behaviour («…refuses the hub (SSH) switches through the file…» and «…its file is left alone»); updated in groups 3 and 4. The Linux tests stay as they are.
  - `server/src/claude-oauth.ts`: tests up to date (parsing does not change).
  - `server/src/limits-check.ts`: tests up to date; the warning rules do not change.
  - `web/src/components/TerminalView.tsx`: no tests; checked in a browser in group 6.
  - `server/src/exec.ts` (new `tmuxFunction()`): `exec.test.ts` up to date; the function is exercised by the script tests of group 3.
  - `server/src/worktree-base.ts` (now builds its `t` function with `tmuxFunction()`): `worktree-base.test.ts` up to date; the generated script is unchanged.

## 3. The Keychain through the machine's tmux server (mandatory step 3, design D1)

The script tests run the real script with `/bin/sh` in a temporary `HOME`, with fake `uname`, `security` and `tmux` executables on `PATH`. The fake `security` answers only when an environment variable set by the fake `tmux run-shell` is present (the graphical session), and exits 36 otherwise. No real tmux is started.

- [x] 3.1 Write the failing tests in `server/src/accounts.test.ts`: inspect of a Mac whose Keychain answers only through tmux reads the Keychain's login (not the file's) and reports the Keychain store reached through tmux; a Mac whose Keychain answers neither way (the fake `tmux` fails as with no server) reads and switches the file, as today. Run `pnpm --filter server test` and see the first fail for the right reason.
- [x] 3.2 Pass the machine's tmux command words to the script (`TmuxExec.tmuxCommand`, beside `MODE`), and on Darwin try `security` through `<tmux> run-shell` when SSH gets no login, using a private `mktemp -d` directory under `~/.claude` removed by the exit trap; add how the store was reached to `HostSnapshot`. Verify with `pnpm --filter server test` (3.1 passes) and `pnpm --filter server typecheck`.
- [x] 3.3 Write the failing test: a switch of a Mac whose Keychain answers only through tmux writes the new login into the Keychain through `run-shell`, and no secret appears in the `run-shell` arguments the fake `tmux` records. See it fail, then make the write use the channel the read used; verify with `pnpm --filter server test`.
- [x] 3.4 Write the failing test: a Mac whose `$HOME` holds a `#` (`/…/a#b`) and whose Keychain answers only through tmux is read from the Keychain and switched there (the fake `tmux run-shell` expands `#{…}` and `##` as tmux does). See it fail, then make the script's `q()` double every `#`; verify with `pnpm --filter server test`.
  - Failed first (the store fell back to `file`: the fake tmux turned `x#Hy` into `xXy`); passes with `q()` doubling `#`.

## 4. A Keychain switch writes only the Keychain (mandatory step 3, design D2)

Fix round of the adversarial review (owner's decision of 2026-11-19): the first implementation also wrote `~/.claude/.credentials.json`; that is removed.

- [x] 4.1 Rewrite the tests of a Keychain switch (through SSH and through tmux) into the corrected behaviour: the Keychain holds the new login and keeps its `mcpOAuth`, and `~/.claude/.credentials.json` is left byte for byte as it was. Keep the failure case (a Keychain that refuses the write leaves the Keychain, the file and `~/.claude.json` unchanged, with «no se pudo escribir en el Llavero del Mac»). Add a switch through tmux of a Keychain document longer than 4032 bytes (with `mcpOAuth`): written through the hex file, no secret on `run-shell`'s command line, no `.twb-kc.*` folder left. See the first fail.
  - The two Keychain-switch tests (SSH and tmux) failed first: the file held `rt-team`. The test of a login over 4032 bytes passed on its first run; it adds coverage of a path that already worked (`kc.args` holds the hex, `tmux.log` no secret, no `.twb-kc.*` left).
- [x] 4.2 Remove from `server/src/host-creds.ts` the file's document (`FILE` line, `fileDoc`, `fileCreds`, the third input line, `WARN creds`, `fileFailed`) and from `server/src/accounts.ts` the log of `fileFailed`; the script writes the store, then `~/.claude.json`. Update the module's header comment. Verify with `pnpm --filter server test` and `pnpm --filter server typecheck`.
  - Removed; no reference left (`grep`). 326 server tests pass; typecheck clean.

## 5. Every login under its own account (mandatory step 3, design D3)

- [x] 5.1 Write the failing store tests in `server/src/accounts.test.ts`: `moveLogin` moves a spare login to the account the profile names (creating it when unknown) and marks it confirmed; moving a machine's login points that machine at the new account; `observe` of a machine whose `~/.claude.json` names s1 keeps a login confirmed as s2 under s2 and shows the machine on s2; a credential with another refresh token from a machine clears `confirmed`, a refresh by the hub keeps it; an `accounts.json` without the field loads with every login unconfirmed. See them fail.
- [x] 5.2 Implement `confirmed` and `moveLogin` in `server/src/account-store.ts` (saved with the store's usual temporary file and `0o600`). Verify with `pnpm --filter server test`.
- [x] 5.3 Make the `fetch` that `AccountManager` calls Anthropic with injectable (a constructor parameter, the global `fetch` by default, passed to the request functions of `server/src/claude-oauth.ts`) and write the failing manager tests with a fake that answers like Anthropic's profile and usage endpoints: an unconfirmed spare login of s2 filed under s1 is moved before s1's usage is read and no usage is recorded for s1 with it; a confirmed login is not asked for its profile again on the next round; a switch confirms the spare login first and, when it moves, uses another spare or asks for a login; a machine login with an expired access token is neither confirmed nor used. See them fail.
- [x] 5.4 Implement the confirmation in `server/src/accounts.ts` (poll, switch, after `inspect`), replacing the profile check that ignored a mismatch, and log each move with `[cuentas]` without tokens. Verify with `pnpm --filter server test` and `pnpm --filter server typecheck`.
- [x] 5.5 Boot smoke test (the constructor of `AccountManager` changes): start the hub with a temporary config and `dataDir`, its own `TMUX_TMPDIR`, no `TMUX`/`TMUX_PANE`, wait for its ready log line, stop it. Record the line here.
  - `tmux-web-bridge escuchando en http://127.0.0.1:7691 (1 máquinas, config …/scratchpad/hub/config.yaml)`, with a `local` machine on its own socket (`-S ./tsock`) and its own `HOME`, so its `accounts.json` stayed empty (no login of this machine was read). Kept running for group 6 and stopped there.
- [x] 5.6 Fix round of the adversarial review (HIGH): write the failing store tests. (A) A machine whose `~/.claude.json` names s1, with its login moved to s2, renews it (new refresh token): after `observe` the machine is still on s2, its login is the renewed one, unconfirmed, and no login of any account keeps the old refresh token. (B) The same renewal followed by a switch to s3 (`commitSwitch`): s2's spare is the renewed login, and no spare holds the old refresh token. (C) The same machine after a `/login` by hand to s3 (`~/.claude.json` names s3): the machine is on s3 and the s2 login comes back as spare with its own refresh token. Also the manager test: after (A), the next round confirms the renewed login as s2 with one profile request. See (A) and (B) fail.
  - (A) failed (the machine went back to s1) and (B) failed (s2's spare was the spent `rt-s2`); (C) passed already and still does. The manager test passes after 5.7 (profile questions `at-s2`, then `at-s2-b`; the login confirmed on s2).
- [x] 5.7 Implement design D3's `configAccount` in `server/src/account-store.ts` (set by `moveLogin` on a machine's login, kept while the login stays off that account, cleared when the login sits under the account `~/.claude.json` names or comes back to the hub) and use it in `owner()` for `observe` and `commitSwitch`. Verify with `pnpm --filter server test`.
  - Set in `observe` and `moveLogin`, cleared in `commitSwitch` (the outgoing login and the incoming one); `owner(host, seen)` uses it.
- [x] 5.8 In `server/src/accounts.ts`, `owns()` confirms without logging a move or emitting a change when the profile's account is the one the login already sits in; a profile question that fails after `inspect` is logged as such, not as a failed reading of the machine. Cover the first with a test (two confirmations of one login at once log no move). Verify with `pnpm --filter server test`.
  - The test holds both profile answers until both questions are in flight; it failed first with «el login que estaba en s2 es de s2: movido». `owns()` now compares with where the login sits now (`AccountStore.loginAccount`). After `inspect`, a failed question logs «no se pudo preguntar a Anthropic de qué cuenta es su login».
- [x] 5.9 Type the fake `fetch` of the manager tests without casts: `answer` with the `Fetch` signature, and the token read with `new Headers(init?.headers).get('Authorization')`. Verify with `pnpm --filter server test` and `pnpm --filter server typecheck`.
  - Done; no cast left in `fakeAnthropic`. The `as unknown as HostMonitor` of `fakeMachine` stays, as in the suite's other fake hosts (`actions.test.ts`, `kit.test.ts`).
- [x] 5.10 Fix round of review round 1 (R1-01): write the failing manager tests. A machine whose `~/.claude.json` names s2 and whose login is s1's (shown on s1, with a spare s2 login in the hub), switched to s2: its file then holds the s2 spare's refresh token and the machine is on s2. See it fail.
  - Failed first (the file kept `rt-s1`). The review also proposed failing a switch that leaves the machine on another account; with the new rule no realistic state reaches it, so it was left out rather than added untested.
- [x] 5.11 In `AccountManager.switchHost`, skip the write only when the machine's refresh token is of a login the store keeps under the target account. When a login comes back to the hub as spare in `observe`, clear its `configAccount` (R1-03). Document R1-02's accepted case in D3 (done in the design). Verify with `pnpm --filter server test` and `pnpm --filter server typecheck`.
  - `AccountStore.tokenAccount()` gives the account a refresh token is kept under. The `/login`-by-hand test now also checks `configAccount` is cleared, and failed without the change. 327 server tests pass; typecheck clean.

## 6. Ctrl+V pastes outside a Mac (mandatory step 3, design D4)

`web` has no test runner: the behaviour is checked in a Linux browser (agent-browser on this machine) against an isolated hub (own `TMUX_TMPDIR`, no `TMUX`/`TMUX_PANE`, a `local` machine on its own `-L` socket) and the `vite` dev server, first on the unchanged code and seen failing, then on the changed code.

- [x] 6.1 On the unchanged code, with an image and then a text on the browser's clipboard, press Ctrl+V in the terminal of a pane running `cat -v`: record that `^V` reaches the pane and nothing is uploaded.
  - Headless Chrome refuses to write the system clipboard ("Write permission denied", even after `Browser.grantPermissions`), so the check counted the browser's `paste` events instead (a listener in the capture phase) and read the pane with `cat -v` after `stty lnext undef`. Unchanged code: Ctrl+V put `^V` in the pane and fired 0 paste events, so nothing could be uploaded; Ctrl+Shift+V fired 1; Ctrl+X put `^X`.
- [x] 6.2 In the custom key handler of `web/src/components/TerminalView.tsx`, return `false` without `preventDefault()` for Ctrl+V and Ctrl+Shift+V when `isMac` is false; verify with `pnpm --filter web typecheck`.
- [x] 6.3 Repeat 6.1 on the changed code and see every scenario of `specs/terminal-paste/spec.md` pass that a Linux browser can run: the image is uploaded and its path typed without Enter, text is pasted with no `^V`, Ctrl+Shift+V behaves like Ctrl+V, and text with a picture pastes only the text. Record what could not be run headless (the Windows and Mac scenarios) for the owner to check by hand. Stop the hub, Vite and the test tmux server afterwards.
  - Changed code, after a full page reload: Ctrl+V and Ctrl+Shift+V each fire 1 paste event and put nothing in the pane (no `^V`); `a` and Ctrl+X still reach it (`a`, `^X`).
  - The paste chain, driven by a synthetic `ClipboardEvent` on xterm's textarea: an image alone is uploaded ("Subido: image.png") and `/tmp/twb-uploads/…-image.png` is typed without Enter; a text alone is pasted (`hola-text`); a text with an image pastes only the text and uploads nothing.
  - Left to the owner: Ctrl+V of a real screenshot from a Linux and a Windows browser, and Cmd+V on the Mac (unchanged code path, `isMac` is true there).
  - Hub, Vite, the browser session and the test tmux server stopped; the uploaded test image removed.
- [x] 6.4 Fix round of the adversarial review: make `isPasteKey` also recognise the key by `keyCode` 86, as xterm.js does, so Ctrl+V with a Cyrillic or Greek layout pastes. Check it in the browser as in 6.3 with a synthetic keydown whose `key` is `м` and `keyCode` 86 (one paste event, no `^V`), and see it fail on the code before the fix. Verify with `pnpm --filter web typecheck`; stop what 6.3 stopped.
  - The key went as a trusted CDP `Input.dispatchKeyEvent` (Ctrl, `key` «м», `code` KeyV, keyCode 86). Before the fix: `^V` in the pane, 0 paste events. After it (page reloaded): 1 paste event, nothing in the pane.
  - 6.3's checks repeated on the final code and still pass: `a` and `^X` reach the pane, Ctrl+V and Ctrl+Shift+V paste, an image is uploaded and its path typed, text is pasted, text with an image pastes only the text.
  - Hub, Vite, the browser session and the test tmux server stopped; the test image removed. `pnpm --filter web typecheck` exits 0.

## 7. Tests, typecheck and lint (mandatory step 4)

Run again after the fix round of the adversarial review.

- [x] 7.1 Run `pnpm --filter server test`, `pnpm --filter server typecheck` and `pnpm --filter web typecheck` and see them pass.
  - First run: server 319 tests pass, 0 fail; both typechecks clean. No layer of this change has a lint command.
  - After the fix round: server 326 tests pass, 0 fail; both typechecks exit 0.
- [x] 7.2 Run `ka scope` and the project checks it lists (`ka features-check`, `ka docs-check`); report the ones that do not apply.
  - First run: both apply and pass (exit 0). `ka features-check` lists as pending the 4 requirements the catalogue step (9.1) adds; `ka docs-check` finds no dead reference.
  - After the fix round: the same (4 pending, now with «a-keychain-switch-writes-only-the-keychain»); `openspec validate --strict` passes.

## 8. Documentation and changelog (mandatory step 5)

- [x] 8.1 Run `/ka:update-docs`: the comment at the top of `server/src/host-creds.ts` and `docs/dev-standards/server-standards.md` where they describe how a machine's login is reached (Keychain through tmux, only the store written on a switch) and that a stored login is used only once its account is confirmed; verify with `ka docs-check`. After the fix round, check again that the header no longer says a Keychain switch writes the file, and that `run-shell`'s `#` expansion is in the standards line.
  - `server/src/host-creds.ts`: the header now says the Keychain is asked from SSH, then through the machine's tmux server, the file last; and that `oauthAccount` is checked against Anthropic before a login is used.
  - `server/src/account-store.ts`: `observe`'s JSDoc had ended up above `owner`; moved back and corrected (a new login is filed unconfirmed; logins are read from the Keychain or the files).
  - `docs/dev-standards/server-standards.md` (Conventions): reaching what needs a Mac's graphical session through the machine's tmux server, with secrets in a private `mktemp -d` folder. It held no description of the login store that the change made false.
  - No document mentions Ctrl+V or `^V`. `ka docs-check`: no dead reference.
  - After the fix round: the header of `host-creds.ts` says a switch writes only the store, and why; the standards line says `q()` doubles `#` for `run-shell`. The JSDoc of `StoredLogin.configAccount` and of `owns()` describe the renewal and the concurrent confirmation.
- [x] 8.2 Add a changelog entry with `/ka:changelog` (es-ES: the Mac switch now reaches Claude Code, accounts no longer mix logins, Ctrl+V pastes images on Linux and Windows); verify the JSON file under `changelogs/unreleased/`. After the fix round, rewrite the `server` entry so it no longer says the file is kept up to date.
  - Two entries, one per independent fix, both `fixed` with Issue 52: `server` (the Mac switch and the logins filed under the wrong account) and `web` (Ctrl+V outside the Mac). `--pr` is added by `/ka:commit` when it opens the pull request.
  - After the fix round: the `server` entry rewritten (`-f`) without the file being kept up to date.

## 9. Feature catalogue (mandatory step 6, after the review loop's gate passes)

- [x] 9.1 Run `/ka:update-features fix-mac-keychain-switch-and-linux-paste` for the new `claude-accounts` and `terminal-paste` capabilities, then `ka features-check --strict` with exit code 0, and commit with `/ka:commit`.
  - Two new areas in `docs/FEATURES.md`, each with its index line: «Cuentas de Claude» (3 sections) and «Pegar en el terminal» (1 section). `ka features-check --strict`: exit 0, 55 sections verified.

## 10. E2E pipeline (mandatory step 7)

- [x] 10.1 The project has no E2E suite; this step does not apply. Record it here.
  - Not applicable: `ka scope` reports "the project has no E2E suite".

## 11. Human review (mandatory step 8)

- [x] 11.1 Ask the owner with `AskUserQuestion` who reviews the pull request (a person, or the owner takes it as good) and record the answer here; do not archive before the approval or that answer.
  - The owner takes PR #53 as good without a manual review (2026-11-19), after review round 2 approved it and `ka review-rounds gate` passed on `6cff5fe`.

## 12. features-check before the archive (mandatory step 9)

- [x] 12.1 Run `ka features-check --strict` as the last task before `/opsx:archive`; the exit code must be 0.
  - Exit 0: 55 sections verified.

## Workflow follow-up

- Between groups 8 and 9: `/opsx:verify`, `/ka:adversarial-review` (the change touches the account store's stored data and the credential script), `/ka:commit` with the pull request, and the bounded review loop (`/ka:review-pr`, `ka review-rounds record`, `ka review-rounds gate`).
- After the approval: `/opsx:archive`, `/ka:commit`, check the pull request's head against `git rev-parse HEAD`, merge with `gh pr merge --squash --match-head-commit <sha>`, follow the `deploy` run with `gh run watch`, and propose the release.
- After the deploy: the owner switches the MacBook Pro to s2 again from the panel and checks that a new Claude Code there uses s2, and that s1's row shows s1's own week.
- Ask in one `AskUserQuestion` whether to comment on Issue #52 with the pull request's link (es-ES) and close it, and whether to remove the worktree with `/ka:git-worktree remove`.
