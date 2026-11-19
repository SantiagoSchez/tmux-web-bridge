# Design

## Context

See proposal.md for the incident. The parts of the code involved:

- `server/src/host-creds.ts` runs one POSIX script on a machine over SSH, in two modes: `inspect` (prints what Claude Code is logged in with) and `switch` (takes Claude Code's three locks, prints the same, waits for `WRITE` or `SKIP` on stdin, writes). It picks the store with `security find-generic-password … -w` run from the SSH session: the Keychain if that answers with a login, the file otherwise. From SSH, the login Keychain of a Mac answers 36 ("User interaction is not allowed"), so a Mac is always handled through the file, even when its Claude Codes run in a tmux server started from the graphical session and keep their login in the Keychain.
- `server/src/account-store.ts` files a machine's login under the account that `~/.claude.json` names (`observe`, `commitSwitch`), without checking the token. When the file holds one account's login and `~/.claude.json` names another, the login lands under the wrong account and stays there as a spare after the next switch.
- `server/src/accounts.ts` reads usage with a spare login first, else a machine's. It reads the profile every 6 hours and ignores a profile whose account differs from the one the login is filed under.
- `web/src/components/WindowView.tsx` uploads an image or file pasted into the window (`onPasteCapture`). `TerminalView.tsx`'s `attachCustomKeyEventHandler` handles Mac shortcuts and lets every other key through to xterm.js, which turns Ctrl+V into `\x16` and cancels the event, so the browser never pastes.

The flow of a switch, before and after:

```
panel ──account switch──▶ hub (AccountManager.switchHost)
  hub ──ssh: script MODE=switch──▶ machine
        machine: take locks; read store (SSH, then tmux run-shell on Darwin); print snapshot; READY
  hub: confirm the spare login's account (profile) ─▶ Anthropic
  hub ──WRITE + config + cred──▶ machine
        machine: write the store (the Keychain by the channel it was read through, or the file), then ~/.claude.json; DONE
```

## Goals / Non-Goals

**Goals:**

- The script reaches the same login store the machine's Claude Codes read, with one extra hop at most.
- A login is never used under an account Anthropic does not confirm.

**Non-Goals:**

- Changing how `limits-check.ts` decides a reading is foreign.
- Any new hub–browser payload: the panel already shows accounts, their machines and their usage.

## Decisions

### D1. The Keychain is reached through the machine's tmux server

**Context.** A tmux server started from a Terminal belongs to the graphical session, and its child processes can use the login Keychain; the SSH session cannot. Verified on the owner's Mac: exit 36 from SSH, 0 through `tmux run-shell`.

**Decision.** The script receives the machine's tmux command words (`TmuxExec.tmuxCommand`, already quoted for the host) in a variable, beside `MODE`. On Darwin, when the Keychain does not answer from SSH, it runs the same `security` call through `<tmux> run-shell` (synchronous, without `-b`). Both reads and writes go through a private directory created with `mktemp -d` under `~/.claude` (umask 077): the read leaves the password and the exit code there; the write puts the `security -i` command line (or, above its 4032-byte limit, the hex value read by a small script in that directory, as the SSH path does today) there and runs it through `run-shell`. The script's exit trap removes the directory. The snapshot gains how the store was reached (`ssh` or `tmux`), and the write uses the same channel as the read. When `run-shell` fails (no server) or `security` answers nothing through it, the store is the file, as today.

tmux expands formats in `run-shell`'s command (`#{…}`, `#(…)`), so the script's quoting helper for that command line doubles every `#` as well as quoting the word: a `$HOME` with a `#` reaches `security` unchanged.

**Consequences.** Secrets never appear in a `run-shell` argument; the 4032-byte fallback puts the hex value on `security`'s argument list for an instant, as the SSH path already does. A machine with tmux started outside the graphical session keeps the file behaviour, which is also what its Claude Codes use.

Alternatives considered: unlocking the Keychain from SSH (`security unlock-keychain`) needs the user's password on the hub; running the whole script through `run-shell` loses the stdin dialogue the switch relies on.

### D2. A Keychain switch writes only the Keychain, then the config

**Decision.** When the store is the Keychain, a switch writes the login there and then `~/.claude.json`; it does not touch `~/.claude/.credentials.json`. Order on the machine: the store (refused → `ERR keychain`, nothing written), then `~/.claude.json`.

**Consequences.** Owner's choice (2026-11-19, after the adversarial review): a refresh token works once, so two copies of one login cannot both stay valid. A copy in the file renewed by a Claude Code outside the graphical session (one started over SSH, outside tmux) would spend the token the Keychain holds, and every Claude Code of the graphical session would lose its session on its next renewal. Such a Claude Code keeps the previous account instead. The case is rare: when the tmux server itself is outside the graphical session, the Keychain does not answer through it and the store is the file (D1).

Alternatives considered: writing both copies (the owner's first choice, dropped for the reason above); writing the file without its refresh token (unverified whether Claude Code accepts it, and it would ask for `/login` once the access token expires).

### D3. Logins carry the account they were confirmed for

**Context.** Pairing a token with the account named by `~/.claude.json` is what filed s2's login under s1.

**Decision.** `StoredLogin` gains an optional `confirmed: true`, set once Anthropic's profile for the login's access token names the account it is filed under. It is cleared whenever the login's credential is replaced by one with another refresh token coming from a machine (`observe`, `commitSwitch`); the hub's own refresh of a spare login keeps it. `AccountManager` confirms an unconfirmed login before reading usage with it and before handing it to a machine, and right after `inspect` takes in a machine login whose access token is still valid. When the profile names another account, `AccountStore.moveLogin` moves the login there (creating the account from the profile's `oauthAccount`), points the machine at that account when the login is on one, and the hub logs `[cuentas] login de <alias> movido a <alias>`. A usage reading made with a login that turns out to be of another account is not recorded. `observe` keeps a confirmed login under its account when the machine's `~/.claude.json` names another, so the next look at the machine does not undo the move.

A machine renews its login with a new refresh token, and the old one stops working. So a moved machine login also records, in an optional `configAccount`, the account its machine's `~/.claude.json` named when it moved. When `observe` or `commitSwitch` (the login a switch takes back) meets a token the hub does not know on a machine whose stored login carries a `configAccount` equal to what `~/.claude.json` names now, the file has not changed: it is that login, renewed. It is updated in place, in its account and unconfirmed, and confirmed again before its next use. When `~/.claude.json` names another account, someone ran `/login` by hand: the previous login, still valid, comes back as spare and the new one is filed as any new login. No copy of a spent refresh token is ever left as spare. `configAccount` is cleared when the login sits under the account `~/.claude.json` names, and when it comes back to the hub.

When `owns()` finds that the account a profile names is the one the login already sits in (two rounds confirmed it at once), it confirms without logging a move. The log says when it was the profile question that failed, not the reading of the machine.

A login on a machine whose access token has expired is not confirmed until the machine renews it (the hub never renews a machine's login).

`AccountManager` takes the `fetch` it calls Anthropic with (a constructor parameter, the global `fetch` by default) and passes it to the request functions of `claude-oauth.ts`, so the tests answer at the `fetch` boundary, as the server standards ask. A login made from the panel is confirmed when it is added: its profile was read with its own token.

**Consequences.** One extra profile request per new login and per renewal coming from a machine (about every 8 hours per machine). Logins stored before the change start unconfirmed and are confirmed on their first use after the deploy, which moves the owner's s2 login out of s1 without a manual step.

Alternatives considered: confirming on every usage read (one more request every 5 minutes per account, against an endpoint with a tight hourly budget); dropping a mismatched login (loses a valid login, the owner chose to move it).

### D4. Outside a Mac, Ctrl+V and Ctrl+Shift+V are left to the browser

**Decision.** In `TerminalView`'s custom key handler, when `isMac` (`web/src/shortcuts.ts`) is false and the key is `v` with Ctrl, with or without Shift, and without Alt or Meta, the handler returns `false` without `preventDefault()`. The key is recognised by `e.key` or by `keyCode` 86, as xterm.js itself does: with a Cyrillic or Greek layout `e.key` is that layout's letter, and xterm.js would still send `^V`. xterm.js then ignores the key and the browser performs its paste: `WindowView`'s capture listener uploads an image or file (unchanged), and xterm.js's own paste listener pastes text (bracketed paste). The soft-keyboard input of phones is not touched.

**Consequences.** `^V` can no longer be typed from a Linux or Windows keyboard in the panel. A panel shortcut the owner sets to Ctrl+Shift+V keeps working, since the panel's shortcuts are handled before the terminal sees the key.

## Risks / Trade-offs

- [The Keychain shows an access dialog to the `security` run from tmux, and `run-shell` waits for it] → Claude Code creates the item with `security`, so its access list already allows it; the hub's 20 s and 30 s timeouts end the SSH side, and the read falls back to the file.
- [`run-shell` reaches a different tmux server than the one Claude Code runs in] → the hub uses the same socket arguments it uses to show that machine's sessions, so it is the server whose panes the panel drives.
- [Profile requests get rate limited] → confirmation is once per login and token; a 429 leaves the login unconfirmed and unused until the next round, as a failed usage read does today.
- [A Linux user relied on Ctrl+V sending `^V`] → accepted by the owner; Claude Code on a Linux machine has no clipboard to read with it.

## Migration Plan

Deploy with the merge into `master`. On the first usage round, every stored login is confirmed; the s2 login filed under s1 moves to s2. The owner then switches the MacBook Pro to s2 again from the panel, which now writes the Keychain. Rollback: the previous build ignores the `confirmed` field.
