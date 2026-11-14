# host-kit standards

The conventions of the `host-kit` layer (host-kit/**, server/src/kit.ts, scripts/test-kit-update.sh). The principles in [base-standards.md](base-standards.md) apply first; this document adds what is specific to this layer. Keep it short and concrete: a rule here is something a reviewer can check, and something the code does not already show. What the manifests, the directory tree or the linter say is left out, where it cannot go stale.

## Stack

- Bash for the kit's scripts. The git hooks `install.sh` writes are `#!/bin/sh`.
- tmux 3.2 or later (`install.sh` refuses older), configured by `host-kit/tmux.conf` with tmux formats (`#{q:@twb_kit_dir}`, `#{d:current_file}`).
- `jq`, `curl` and `git` on the machine (`install.sh` requires `jq` and `curl`; `unzip` only for the Trello extension). Targets: macOS, Linux and WSL.
- The hub side, `server/src/kit.ts` (TypeScript, server layer toolchain), builds POSIX `sh` scripts and runs them on the machine with `host.exec.shell()` (`sh -c` over SSH, `/bin/sh -c` for the local host).
- The integration test, `scripts/test-kit-update.sh`, is Bash and drives `kit.ts` through the `tsx` of `server/node_modules`.

## Structure

- What the kit touches outside the clone, and nothing else (README, «Qué toca el kit»): a marked block in `~/.tmux.conf` (or `~/.config/tmux/tmux.conf` when only that exists); the hooks and `statusLine` in `<claude dir>/settings.json`; `~/.config/tmux-web-bridge/` (`notify.env`, `claude-dir`, `trello-extension`); `~/.local/share/tmux-web-bridge/trello-extension`; and the clone's own `post-merge`, `post-rewrite` and `post-checkout` hooks with a repo-local `core.hooksPath`.

## Conventions

- **Releases only.** The kit reaches a machine at a `vX.Y.Z` tag: the panel's «Actualizar» (`updateKit`) or `git fetch --tags && git checkout vX.Y.Z` in the clone, after which the `post-checkout` hook re-runs `install.sh --quiet`. The clone stays on a detached HEAD. `kitTag()` lets only a plain `X.Y.Z` into a script. A kit change reaches no machine until the next release.
- **Everything runs from the clone.** Nothing is linked or copied outside it. `tmux.conf` calls scripts as `#{q:@twb_kit_dir}/host-kit/<script>`; `claude-hooks.json` uses `@KIT@`, which `install.sh` replaces with `$HOME/…` (`KIT_REF`).
- **Shared dotfiles keep working.** Paths written to files that may be shared between machines use `~` or `$HOME` (`tilde()`, `KIT_REF`), and the block uses `source-file -q`, so a machine without the clone loads nothing and reports no error.
- **Marked block in `~/.tmux.conf`.** Exactly `# >>> tmux-web-bridge: lo pone y lo quita el kit (host-kit/install.sh)`, `source-file -q ~/…/host-kit/tmux.conf`, `# <<< tmux-web-bridge`. `install.sh` writes it where it already is (the block, or the loose `source-file` line of older kits, which it replaces), so a block the user moved, above tpm for instance, stays there; with none, at the end. `uninstallScript` removes it with the same patterns.
- **Idempotent.** Re-running `install.sh` with nothing new rewrites nothing: files are compared first (`cmp -s`, `jq -S` for JSON) and only a change is written. Each change prints one `say` line; unchanged items use `same`, which `--quiet` (the git hooks, the hub) silences.
- **Backup, then write in place.** Before changing a user file, copy it to `<file>.bak.<YYYYmmdd-HHMMSS>` (`$STAMP`); write with `cat "$tmp" > "$file"`, not `mv`, so a symlinked file stays a symlink. Temporary files come from `mktemp` and are removed.
- **Never force.** `kitScript` stops when the clone's `origin` is not twb's repository or it has local changes; it never resets, cleans or checks out with `-f`. `uninstallScript` keeps the clone when it is also a hub install (it holds the server's build output or `node_modules`), has local changes, or a shared file still uses it.
- **Shared files are left alone on uninstall.** A file that is a symlink or sits in a symlinked folder (`shared()`, `shared_dir()`) is not edited; the script prints a `LEFT=` line and the panel lists it. `install.sh`'s `unlink_old` likewise leaves links of pre-1.22 kits in a shared folder.
- **Hub scripts are POSIX `sh`.** They begin with `PATH="$PATH:${EXTRA_PATH}"; export PATH` (and `inClone(dir)` for scripts that work in the clone); each step fails as `|| { echo "<Spanish message naming the clone>" >&2; exit 1; }`; results come back as `KEY=value` stdout lines (`TWB_KIT_DIR=`, `TWB_TRELLO_DIR=`, `LEFT=`, `KIT=`, `MISSING=`) that the TypeScript side parses and filters out of the log. `runKit()` strips ANSI colours and turns transport errors and timeouts into «<máquina> no responde».
- **Quoting and secrets.** Every value interpolated into a hub script goes through `shq()`, `shQuote()`, `kitDir()` (all from or on top of `exec.ts`) or a regex check (`kitTag`, the key blob in `uninstallKit`). The notify token goes on stdin (`IFS= read -r token`), never on a command line. `install.sh` quotes every expansion and refuses a kit path with `"`, `$`, `` ` `` or `\`. `notify.env` is written under `umask 077` and `chmod 600`.
- **The hub reloads tmux itself.** It runs the checkout with `-c core.hooksPath=/dev/null` and `install.sh` with `TWB_NO_TMUX_RELOAD=1`, then `source-file`s the kit's `tmux.conf` through the host's own socket; `install.sh` alone only reaches the default socket.
- **Older kits keep working with a newer hub.** `kitDir()` falls back to `"$HOME"/tmux-web-bridge` when a kit (1.0.0) does not publish `@twb_kit_dir`; a new `install.sh` option is passed only after detecting it (`grep -q -- '--trello-extension)' host-kit/install.sh`), because older `install.sh` dies on unknown options; `server/src/actions.ts` falls back to `~/.scripts` for kits before 1.22.
- **Claude Code hooks never block.** The notice to the hub runs in a background subshell with `curl -m 5`, and missing tools or config make it return quietly (`command -v … || return 0`). Optional steps of `install.sh` (the Trello extension download) warn and let the rest finish.
- **Messages the panel shows go to stdout.** `install.sh` reports a non-fatal problem as `say "Aviso: …"` because the panel shows its stdout, not its stderr.
- **Git hooks stay in the clone.** They go to the clone's own git hooks folder with a repo-local `core.hooksPath`; each one unsets `GIT_DIR GIT_WORK_TREE GIT_INDEX_FILE` and `exec`s `install.sh --quiet`; `post-checkout` acts only on a branch or commit change (`$3 = 1`).
- **Portable across BSD and GNU.** In-place edits use `sed -i.x` and remove the `.x`; where the tools differ, try the BSD form and fall back to GNU (`date -r` then `date -d`); macOS-only behaviour sits behind `uname -s` = `Darwin`.
- **Languages.** Output for the user is Spanish (`say`, `warn`, `die`, the hub scripts' `echo … >&2`, the `Error` messages in `kit.ts`). Comments in `kit.ts` are English; the kit's shell scripts, `tmux.conf` and `test-kit-update.sh` are commented in Spanish (to confirm whether new comments there follow the file or base-standards' English).

## Forbidden patterns

- Linking or copying kit files outside the clone (`~/.scripts`, `<claude dir>/scripts`, …): call them in the clone through `@twb_kit_dir` or `@KIT@`.
- An absolute `/home/<user>` or `/Users/<user>` path in `~/.tmux.conf` or `settings.json`: write `~` or `$HOME`.
- A hard-coded clone path in `tmux.conf` or `claude-hooks.json`: use `#{q:@twb_kit_dir}` and `@KIT@`.
- `mv` over a user file, or editing one without a `.bak.<stamp>` copy: back up, then `cat` into it.
- Editing a shared (symlinked) file on uninstall: leave it and print `LEFT=`.
- Updating or documenting the kit through `master` or `git pull`: only release tags.
- A global `core.hooksPath`, or hooks in the global hooks folder: the clone's own hooks only.
- `git reset --hard`, `git clean`, `checkout -f` or any forced step in a machine's clone: stop with a message instead.
- A token or secret in a remote command line or in the logged script: pass it on stdin.
- An unescaped or unvalidated value in a hub script: `shq()`, `shQuote()`, `kitDir()` or a regex first.
- Bash-only syntax (`[[`, arrays, `local`, `$'…'`) in the scripts `kit.ts` builds: they run under `sh`.
- Passing a new `install.sh` option to a machine without checking its `install.sh` knows it.
- A Claude Code hook that waits on the network in the foreground.
- Testing `install.sh` by hand against a makeshift clone or tmux, or running a bare `tmux` (or `tmux kill-server`) in a test: `install.sh` uses the default socket, a fake `HOME` does not isolate it, and this once dirtied the real tmux of a machine.

## Testing

- The levels this layer tests at and where each kind of test lives, following [testing-standards.md](testing-standards.md).
- The test, typecheck and lint commands are configured in `.claude/koalarnes.json` and listed in step 4 of [the mandatory task steps](../../.claude/rules/koalarnes-mandatory-steps.md); never copy them here, where they would go stale.
- **Unit:** `server/src/kit.test.ts` (`node:test`) checks the builders' output (the order of the guards, the flags, quoting), `kitTag`, `kitDir` and how a machine that does not answer is explained, with a fake `HostMonitor` that only fails.
- **End to end:** `scripts/test-kit-update.sh` builds a bare fake origin whose newest tag is the working tree (last tag plus one patch), a clone at the previous tag in a temporary `HOME`, runs `install.sh`, starts the machine's tmux on `-L twbkit`, and calls `installKit`, `updateKit`, `setTrelloExtension` and `uninstallKit` through a `tsx` driver with a local host. It checks the refusals, the update, that a re-install leaves `~/.tmux.conf` unchanged, the Trello extension download (`TWB_RELEASES_URL=file://…`), the uninstall and a fresh install, and that a sentinel tmux on the default socket was not touched. Each check is an `expect` line; `KEEP=1` keeps the temporary folder.
- It runs whenever `server/src/kit.ts`, `host-kit/install.sh` or `host-kit/tmux.conf` change, and a new behaviour of install, update or uninstall gets its `expect` there.
- **Any test that starts tmux is isolated:** unset `TMUX` and `TMUX_PANE`, its own `TMUX_TMPDIR` (under `/tmp`: socket paths are limited to about 100 characters), and its own socket with `-L` or `-S`. `test-kit-update.sh` also fakes `HOME`, `GIT_CONFIG_GLOBAL` (with `GIT_CONFIG_NOSYSTEM=1`), unsets `XDG_CONFIG_HOME` and `CLAUDE_CONFIG_DIR`, redirects the GitHub URL to the fake origin with `url.<origin>.insteadOf`, and kills tmux servers in its cleanup only after checking `TMUX_TMPDIR` is its own.
- Never test `install.sh` by hand against a makeshift clone or tmux: use, or extend, `scripts/test-kit-update.sh`.
- `test-kit-update.sh` does not strip git's repository-local variables (`git rev-parse --local-env-vars`) as testing-standards asks for tests that run git (to confirm whether it should).
- `tmux-window-title.sh`, `tmux-spaces.sh` and `statusline.sh` have no automated tests (to confirm the expected level for them).

## Common workflows

- **A file the kit writes outside the clone:** its section in `host-kit/install.sh` (backup, compare before writing, `cat` into it, `~`/`$HOME` paths, shared-file aware); its removal in `uninstallScript` in `server/src/kit.ts`, with a `LEFT=` line for a shared file; the list in the header of `install.sh` and in the README's «Qué toca el kit»; `expect` lines in `scripts/test-kit-update.sh` for install, re-install and uninstall.
- **A new kit script:** `host-kit/<name>.sh` (`#!/bin/bash`, `set -u`, a `cmd_<name>` dispatcher), executable in git and in the `chmod +x` line of `install.sh`; called from `tmux.conf` as `#{q:@twb_kit_dir}/host-kit/<name>.sh` or from `claude-hooks.json` as `"@KIT@/<name>.sh"`. If tmux binds keys to it, add it to `KIT_SCRIPT` in `kit.ts` so the uninstall unbinds them.
- **A tmux binding or hook:** `host-kit/tmux.conf`, quoting format arguments (`'#{client_name}'`); a prefix key the kit takes from tmux gets its default in `DEFAULT_KEYS`, a new `set-hook` goes in `KIT_HOOKS`, and a new global option in the list `unloadKit` unsets, all in `server/src/kit.ts`; a test in `kit.test.ts` for `unbindKitKeys` when its parsing changes; the bindings in the README if users see them.
- **A Claude Code hook:** `host-kit/claude-hooks.json` with `"@KIT@/…"`. `install.sh` and `uninstallScript` recognise the kit's hooks by a command matching `tmux-window-title.sh`: a hook calling another script needs both filters extended.
- **A new `install.sh` option:** its `case` in the argument loop, its line in the header (which is `--help`), its detection in `kit.ts` before passing it (as `TRELLO_FLAG`), a pin in `kit.test.ts`, and an `expect` in `scripts/test-kit-update.sh`.
- **A new remote operation from the hub:** a builder in `server/src/kit.ts` returning a POSIX `sh` script (the `PATH` line or `inClone()`, Spanish errors on stderr with `exit 1`, results as `KEY=` lines), run with `runKit()`; its unit test in `server/src/kit.test.ts` and a case in the driver of `scripts/test-kit-update.sh`.
- **Shipping:** a push of `host-kit/**` alone deploys nothing, while a change to `server/src/kit.ts` deploys the hub. Machines get the kit at the next release, through «Actualizar» or the checkout of its tag: say so when pushing.
