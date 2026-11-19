# Proposal

GitHub issue: [#52](https://github.com/SantiagoSchez/tmux-web-bridge/issues/52)

## Why

Switching the owner's MacBook Pro from account s1 to s2 left every Claude Code on it, new ones included, on s1: the hub wrote s2 into `~/.claude/.credentials.json` and `~/.claude.json`, but Claude Code there keeps its login in the Keychain, which the hub never touched. On the way, the hub filed a login of s2 under account s1, so it now reads s1's usage with s2's token and the panel warns about a foreign reading on both accounts. Separately, on a Linux or Windows computer, Ctrl+V in the panel's terminal never pastes an image: xterm.js turns it into `^V` and cancels the key, so the browser never fires the paste the upload listens to.

Observed on 2026-11-19: from the hub's SSH session `security find-generic-password` exits 36 (locked Keychain), and run through the Mac's tmux server (`tmux run-shell`) it exits 0. The Mac's tmux server was started from a Terminal in the graphical session.

## What Changes

- On macOS, the hub reads and writes Claude Code's Keychain item through the machine's tmux server when the Keychain does not answer the SSH session. When it answers neither way, the hub uses `~/.claude/.credentials.json`, as today.
- When the store is the Keychain, a switch writes the new login to the Keychain only (keeping the item's other fields), never a second copy to `~/.claude/.credentials.json`.
- The hub confirms with Anthropic's profile which account a login belongs to before using it, and moves a login filed under the wrong account to the account it belongs to (creating that account when unknown). A moved login stays there when its machine renews it. Logins stored before this change are confirmed on their first use.
- Outside macOS, Ctrl+V and Ctrl+Shift+V in the panel's terminal paste from the computer's clipboard (an image goes through the existing upload; text is pasted into the pane) instead of sending `^V` to the pane, whatever the keyboard layout.

No API payload, message payload or environment variable changes. `accounts.json` (the hub's stored data) gains two optional per-login fields: whether the login was confirmed for its account, and, for a machine's login moved off the account its `~/.claude.json` names, that account. Files without them load as before.

## Capabilities

### New Capabilities

- `claude-accounts`: where the hub reads and writes a machine's Claude Code login, and how it keeps each stored login under the account it belongs to.
- `terminal-paste`: what pasting into the panel's terminal does on each kind of computer.

### Modified Capabilities

None.

## Impact

- Layers: `server` (`server/src/host-creds.ts`, `server/src/accounts.ts`, `server/src/account-store.ts`, `server/src/claude-oauth.ts`, and `server/src/exec.ts` with its new `tmuxFunction()`, which `server/src/worktree-base.ts` now uses too) and `web` (`web/src/components/TerminalView.tsx`).
- External services: Anthropic's OAuth profile endpoint (`/api/oauth/profile`), now also called when a login is new to the hub or its token changed; the macOS `security` tool on the machines, now also run through `tmux run-shell`.
- Stored data: `accounts.json` gets two optional fields per login; no migration.
- Behaviour change visible to the owner: on Linux and Windows, Ctrl+V no longer sends `^V` to the pane.

## Non-goals

- Rewriting a machine's `~/.claude.json` when its login turns out to be of another account than the one the file names: the panel shows the machine on the login's real account, and the next switch fixes the file.
- Making the Keychain reachable when the machine's tmux server was started outside the graphical session: Claude Code there uses the file too, which the hub already handles.
- Pasting images on the phone, or reading the clipboard with the asynchronous Clipboard API (it asks for a permission).
- A way to send `^V` from a Linux or Windows keyboard.
- The ⚠ warning rules themselves (`usage-limits`): they were right; the hub's reading of s1 was wrong.
