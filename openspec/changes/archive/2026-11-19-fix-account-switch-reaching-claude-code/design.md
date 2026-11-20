# Design

## Context

See proposal.md, Why. The switch is the POSIX script of `server/src/host-creds.ts`, run by the hub on the machine over SSH, in `inspect` or `switch` mode. It sets fixed paths (`C="$HOME/.claude"`, `CONF="$HOME/.claude.json"`, the Keychain service `Claude Code-credentials`), takes Claude Code's three locks in `switch` mode, prints the snapshot, waits for `WRITE`, writes the login into its store (the Keychain, over SSH or through `t run-shell`, or the file) and then the account file. `t` runs the machine's tmux (`tmuxFunction()`, `exec.ts`).

What Claude Code 2.1.329 does, read in its macOS binary (`darwin-arm64`, checksum checked against the release manifest) and its Linux binary:

- **Its folder.** With `CLAUDE_CONFIG_DIR` set, the login file is `$CLAUDE_CONFIG_DIR/.credentials.json`, the account file `$CLAUDE_CONFIG_DIR/.claude.json`, the refresh lock `$CLAUDE_CONFIG_DIR/.oauth_refresh.lock` and the folder's own lock `$CLAUDE_CONFIG_DIR.lock` (for the default folder these are the paths the script uses today). On macOS the Keychain service is `Claude Code-credentials` followed by `-` and the first 8 hex digits of the SHA-256 of the variable's value (NFC-normalised), and plain `Claude Code-credentials` without the variable.
- **Its store on macOS.** The Keychain, with the plaintext file as fallback: it reads the Keychain first and the file only when the Keychain has nothing. Keychain reads are cached for 30 s.
- **When a running Claude Code re-reads its login.** Before a request, its token check stats the folder's `.credentials.json`. When the file's `mtimeMs` differs from the one it saw last, it drops its token cache and the Keychain cache and reads the store again. When the stat fails (no file), it reads the store again on every check, through the 30 s cache. When the time is unchanged, it keeps its in-memory token and re-reads only when that token is dead or about to expire, which can be hours away.

On bot-box, `~claudebot/.tmux.conf` sets `CLAUDE_CONFIG_DIR` to `~/.claude-twb` with `set-environment -g`; every pane inherits it. The Telegram bot runs outside that tmux server with the default folder. The host kit already honours the variable (the statusline, `tmux-spaces.sh`, `install.sh --claude-dir`).

## Goals / Non-Goals

**Goals:**

- The hub reads and switches the Claude Code login that the machine's panes use.
- A Claude Code running on a Mac adopts a Keychain switch on its next request.

**Non-Goals:**

- Telling an individual Claude Code to reload by any other channel (a signal, tmux keys): Claude Code offers none, and the file's time is the one it already watches.
- A setting in the panel to choose a machine's folder: the tmux environment already says which folder the panes use.

## Decisions

### D1. The Claude Code folder comes from the tmux server's global environment

**Context.** The panel drives the Claude Codes of the machine's tmux sessions, and they inherit the tmux server's global environment. The host kit records `--claude-dir` in `~/.config/tmux-web-bridge/claude-dir`, but only on machines installed with that option, and it can drift from what tmux sets.

**Decision.** At its start, before it takes any lock, the script runs `t show-environment -g CLAUDE_CONFIG_DIR`. When that prints `CLAUDE_CONFIG_DIR=<value>` with a non-empty value, the folder is that value; otherwise (no server, a variable not set or removed with `-`) it is `$HOME/.claude`. From the folder `F` it derives everything Claude Code derives: `CREDS="$F/.credentials.json"`, `CONF="$F/.claude.json"` (`$HOME/.claude.json` for the default folder), the locks `$F/.oauth_refresh.lock`, `$F.lock` and `$CONF.lock`, and on Darwin the service `Claude Code-credentials-<hash>` with `<hash>` the first 8 hex digits of `printf %s "$F" | shasum -a 256` when the variable is set. The value is used as tmux gives it, which is the string the panes' Claude Codes hash. Both modes use the same folder, so the snapshot the hub files and the switch it writes always agree.

**Consequences.** On a machine without the variable, every path and name is the one the script uses today. On bot-box, the hub stops reading and writing the bot's `~/.claude`. A Claude Code started outside tmux with the default folder (the bot) is no longer the hub's concern.

Alternatives considered: the kit's `claude-dir` file (the owner chose the tmux environment: it is what the panes really get); a per-machine setting in the panel (one more thing to keep in step by hand).

### D2. The switch signals a Keychain change by the time of the credentials file

**Context.** Claude Code re-reads its store when the time of its folder's `.credentials.json` changes. The 2026-11-19 change decided that a Keychain switch never writes that file, so that no second copy of a refresh token exists.

**Decision.** After the Keychain write succeeds, the script runs `touch -c "$CREDS"` from the SSH session (a file operation needs no graphical session), before it writes the account file. `-c` does not create the file; `touch` follows a symlink and updates its target, which is the file Claude Code stats. A failure of `touch` is ignored: the switch has already happened, and the running Claude Codes then adopt it at their token's expiry, as before.

**Consequences.** The file's content, and with it D2 of the 2026-11-19 change, is unchanged. A Claude Code that uses the file as its store (one started outside the graphical session) also re-reads it and finds the same login it had. A Keychain refusal ends the script before the `touch`, so a refused switch changes nothing.

Alternatives considered: deleting the file (Claude Code would re-read the Keychain every 30 s, but a Claude Code outside the graphical session would lose its login; the owner chose `touch -c`); creating an empty file when it is missing (not needed: with no file, Claude Code already re-reads on every check).

### D3. The worktree hook is looked for in the same folder

**Context.** `prepareScript` in `server/src/worktree-base.ts` decides whether the hub creates the worktree itself or leaves it to a `WorktreeCreate` hook. Its `HOOK` part read `${CLAUDE_CONFIG_DIR:-$HOME/.claude}` in the SSH session, which never has the variable (the reason for D1), so on a machine whose tmux sets another folder it looked in the wrong settings and plugin cache.

**Decision.** `HOOK` takes the folder as D1 does: `t show-environment -g CLAUDE_CONFIG_DIR`, the value after `CLAUDE_CONFIG_DIR=` when it is not empty, `$HOME/.claude` otherwise. The script already defines `t` for the SSH agent search. The project's settings keep their places.

**Consequences.** On a machine without the variable nothing changes. On bot-box a hook declared in `~/.claude-twb` (directly or through an enabled plugin) creates the worktree, and one declared only in `~/.claude` (which the panes' Claude Code does not read) no longer does.

## Risks / Trade-offs

- [A later Claude Code version changes the folder's file names, the Keychain naming or stops watching the file's time] → The header comment of `host-creds.ts` names the version these were read in, so the next look knows what to check.
- [A folder with non-ASCII characters on a Mac] → Claude Code hashes the NFC form; the script hashes the bytes tmux gives. They differ only for a decomposed non-ASCII path, which no machine of the owner has; the store then falls back to the file, as with a Keychain that does not answer.
- [A Claude Code reloads between the Keychain write and the account file's write] → It holds the new login while the account file names the old account for an instant. The script holds the account file's lock meanwhile, so Claude Code cannot write that file until the script has.
- [`show-environment` reaches the machine's real tmux server] → It only reads; the tests use a fake `tmux`, never a real one.

## Migration Plan

Deploying the hub is enough: the script travels with each command. Rollback is the previous image.

On bot-box, the earlier switches wrote the hub's logins into the bot's `~/.claude`. After the deploy the hub reads `~/.claude-twb` and shows the panes' real account. The login it handed to the bot comes back to it as a spare, while the bot keeps a copy with the same refresh token, and a refresh token works once. The owner gives the bot its own login again (`/login` in the bot's Claude Code, outside the panel's tmux). If the bot renewed the shared login first, the hub's copy is dead, and the panel asks for a new login of that account, as it already does for a dead login.
