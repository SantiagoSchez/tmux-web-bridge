# Proposal

GitHub issues: [Issue #60](https://github.com/SantiagoSchez/tmux-web-bridge/issues/60) and [Issue #61](https://github.com/SantiagoSchez/tmux-web-bridge/issues/61), fixed in one pull request.

## Why

An account switch from the panel does not reach the Claude Codes that should take it, for two independent reasons:

- **Running Claude Codes on a Mac (Issue #60).** They keep the previous account for hours, spend its limits, and the sidebar's hover keeps naming it. Claude Code (read in the 2.1.329 binary) re-reads its login before a request only when the modification time of its `.credentials.json` changes, or on every request (through a 30 s cache) when that file does not exist; otherwise it keeps the token in memory until that token is about to expire. The owner's Mac keeps a `.credentials.json` from the switches made before the Keychain was reached, and a Keychain switch leaves that file untouched, so nothing tells the running Claudes.
- **Claude Codes with another config folder (Issue #61).** On drangleic-claude the panel's tmux sessions run Claude Code with `CLAUDE_CONFIG_DIR=~/.claude-twb`, set in the tmux server's global environment. The hub reads and writes only the default folder (`~/.claude` and `~/.claude.json`), so a switch writes the new login into the Telegram bot's folder and leaves the panes on the old account, even after a restart. The statusline does honour `CLAUDE_CONFIG_DIR`, so the hover shows the panes' real account.
- **The worktree hook looked in the same wrong folder.** The script that prepares a worktree for a launch reads `${CLAUDE_CONFIG_DIR:-$HOME/.claude}` in the SSH session, which never has the variable, so on drangleic-claude it looks for a `WorktreeCreate` hook in `~/.claude` instead of `~/.claude-twb`. Found by the first review of this pull request (R1-02); the owner asked to fix it here.

## What Changes

- The switch script and the inspection read `CLAUDE_CONFIG_DIR` from the machine's tmux server global environment, and when it is set use that folder the way Claude Code does: the login file `<folder>/.credentials.json`, the account file `<folder>/.claude.json`, the locks `<folder>/.oauth_refresh.lock`, `<folder>.lock` and `<folder>/.claude.json.lock`, and on macOS the Keychain item `Claude Code-credentials-<first 8 hex digits of the SHA-256 of the folder>`. Without the variable, or without a tmux server, nothing changes.
- A switch whose store is the Keychain, once the Keychain write succeeds, sets the modification time of the folder's `.credentials.json` to now (`touch -c`), without changing its content and without creating it when it is missing. Every Claude Code running on the machine then re-reads the Keychain on its next request.
- A switch whose store is the file is unchanged in that respect: it already rewrites the file, which changes its time.
- The worktree preparation script looks for the `WorktreeCreate` hook in the settings and plugins of the same folder, read the same way (`t show-environment -g CLAUDE_CONFIG_DIR`, `~/.claude` without it).
- The switch's error messages and the hub's comments stop naming `~/.claude.json` and `~/.claude/.credentials.json` as if they were the only files (R1-01): they name Claude Code's account and credentials files.
- The header comment of `server/src/host-creds.ts` is corrected: it says Claude Code re-reads the Keychain within about 30 s and that only the default folder is handled.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `claude-accounts`: a new requirement, the hub uses the Claude Code folder the machine's tmux sessions use; and the requirement «A Keychain switch writes only the Keychain» adds that the switch signals running Claude Codes by the time of the credentials file, with its content left as it was.
- `worktree-base`: the requirement «The worktree starts from the chosen base» says where the hook is looked for: the folder of the machine's tmux sessions and the project's settings.

## Impact

- Layers: `server` only (`server/src/host-creds.ts`, the script the hub runs on a machine over SSH, and its tests in `server/src/accounts.test.ts`; `server/src/worktree-base.ts`, the worktree preparation script, and its tests in `server/src/worktree-base.test.ts`). No change to `web`, `trello-extension` or `host-kit`.
- External services: none. The script runs on the owner's machines over the SSH the hub already uses; no new call to Anthropic.
- Contracts: no API payload, message payload or environment variable of the hub changes. The stored accounts (`data/accounts.json`) keep their format.
- drangleic-claude after the deploy: the hub starts reading `~/.claude-twb` there, so the panel shows the panes' real account. The login the earlier switches wrote into the bot's `~/.claude` is also a login the hub keeps; the two copies share a refresh token that works once, so the owner gives the bot its own login again (see design.md, Migration Plan).

## Non-goals

- Deleting the leftover `.credentials.json` on a Mac: a Claude Code started outside the graphical session (over SSH, outside tmux) uses it, and the owner chose to keep it.
- Writing the login into the file as well as the Keychain: the decision of the 2026-11-19 change stands (a refresh token works once).
- Claude Codes of an older version still running from memory: what they do on a store change is out of the hub's reach; restarting them is the remedy.
- Claude Codes started outside the machine's tmux server with yet another folder (the Telegram bot): the hub manages the Claude Codes of the panel's tmux sessions only.
- Repairing the bot's login on drangleic-claude from the hub: it is a one-time step the owner does by hand.
