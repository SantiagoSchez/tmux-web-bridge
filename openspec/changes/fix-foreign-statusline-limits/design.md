# Design

## Context

Two sources feed the usage strip's 5-hour and 7-day meters (see proposal.md, Why):

- The hub's reading of each account it keeps a login of, every 5 minutes (`AccountManager.poll` in `server/src/accounts.ts`, stored as `ClaudeAccount.usage`). It carries the per-model limits too, and it is always of the right account, because it uses that account's token.
- The statusline readings (`HostInfo.limits`, parsed from `@claude_rate_limits` in `server/src/host.ts`), one per email per machine. `rows()` in `web/src/components/LimitsBar.tsx` uses one when it is fresher than the hub's, unless the email is shared by two accounts. The `host` handler in `server/src/index.ts` adds every one of them to `UsageHistory` (`server/src/usage.ts`).

Resets come on a fixed grid: the weekly one on the hour, the 5-hour one on 10-minute marks (see the fixtures in `server/src/accounts.test.ts`). Two accounts rarely share both, and the same account's two sources carry the same value.

Which Claude published a foreign reading is unknown. `server/src/host-creds.ts` documents that a running Claude Code re-reads the credentials file when it changes, so the cause may be a repaint that still carries the `rate_limits` of the previous account until the next request, or a process that kept the old token. The warning text covers both.

## Goals / Non-Goals

**Goals:**

- One check, in the hub, applied before a statusline reading reaches the panel or the usage history.
- The panel learns from the hub which machines published a foreign reading under each account, without computing anything itself.

**Non-Goals:**

- Telling apart the two possible causes on the machine.
- Re-checking on a timer. The result is recomputed whenever a host or the accounts change, which happens every few minutes at the most.

## Decisions

### The check is a pure module of the hub

`server/src/limits-check.ts` holds the logic, with no I/O:

- `isForeign(reading, usage, now)`: whether, for the 5-hour or the 7-day window, the reading cannot be of the account the hub read. Only a reading's window still current (reset greater than `now`) is looked at, and only when the hub has read the account at all (`usage`). Then, by what the hub saw of that window:
  - **Current** (reset greater than `now`): the two resets differ by more than 300 seconds.
  - **Ended or none** (`reset <= now`, no window, or a reset of 0): the reading's window started before the later of the hub's reading (`usage.t`) and the hub's ended reset, minus one reset step. The account's next window cannot open before the previous one ends, and it was not open when the hub saw none. This is the case of an account not used since its reset (first PR #17 review). Taking the later of the two also covers a reading of the hub taken after its window ended, if Anthropic still returns that window's reset then (second PR #17 review).
- `checkLimits(hosts, accounts, now)`: for every host, the readings to keep, and for every account id, the hosts that published a foreign reading under it. It only compares a reading whose email belongs to exactly one account.

A window starts at its reset minus its length (18 000 s or 604 800 s). Anthropic rounds resets to a grid, 10 minutes for 5 hours and the hour for 7 days, so the start computed that way can be off by one step in either direction: a step is the margin of the comparisons with a start. 300 seconds, the margin between two resets, is below the 10-minute grid and far above any rounding between the two sources, which carry the same value.

### What the panel last got is a small class of the same module

`SentLimits` in `limits-check.ts` records what the last `host`, `tree` and `accounts` messages carried (a key per host for its kept readings, one for the accounts' machines) and says what a new check changes: the hosts whose readings differ and whether the accounts' machines do. Its starting state is an empty check, so the first host change after a start does not re-send the accounts for nothing. It moved out of `index.ts` after the PR #17 review, to be tested: `/opsx:verify` had already found a case it missed there.

Alternative considered: the check in `shared/`, run by the panel. The owner chose the hub, so the usage history is filtered by the same code and the panel stays a consumer.

### The hub sends filtered views, the monitors keep the raw readings

`HostMonitor.snapshot` stays as it is. `server/src/index.ts` derives what it sends:

- `hostView(info)`: the host with `limits` replaced by the kept readings. Every `host` and `tree` message, and the initial snapshot of `/ws`, go through it.
- `accountsView()`: `accounts.info` with `mislabelledOn` filled for each account. Every `accounts` message and the initial snapshot go through it.

The hub remembers what it sent in a `SentLimits`. After a host change it broadcasts that host and, if any account's hosts changed, the accounts. After an accounts change it broadcasts the accounts and every host whose kept readings changed. After a machine is added, edited or removed (`machinesChanged()`), it broadcasts the tree and, if any account's hosts changed, the accounts: a removed machine leaves the warnings that named it. `UsageHistory.add` only receives kept readings.

This rewires the composition root, so the tasks include a boot smoke test.

Alternative considered: dropping foreign readings inside `HostMonitor`. It does not know the accounts, and a reading must come back as soon as the hub's reading of its account agrees with it.

### The contract: `ClaudeAccount.mislabelledOn`

`ClaudeAccount` in `shared/types.ts` gains `mislabelledOn: string[]`: ids of the machines whose statusline published another account's limits under this account's email. `AccountStore.info()` returns it empty; `index.ts` fills it. The hub and the panel deploy together, so the field is required, not optional.

### The panel only shows the warning

`AccountRow` adds the ⚠ the row already uses for a login problem when `acc.mislabelledOn` is not empty, and adds to the row's `title`:

> Un Claude de drangleic-claude ha publicado con esta cuenta los límites de otra: seguramente sigue con la anterior. Si no se corrige con su próximo mensaje, reinícialo.

With several machines, their names are joined with ` · `, as `hostNames()` already does. `accountMenu()` in `web/src/accounts.tsx` shows the same text in its `top` block, so it reaches a phone, where the tooltip does not. `rows()` keeps using `host.limits` as it is: what arrives is already filtered.

## Risks / Trade-offs

- [Two accounts with the same 5-hour and 7-day resets] → A foreign reading goes undetected and the row shows wrong numbers, as today. It needs both windows on the same grid mark; accepted.
- [The hub's reading is from before a new 5-hour window and the statusline's from after it] → The hub's window has ended, and the reading's window started after it: not foreign.
- [A foreign window that started less than one reset step before the hub's reading] → Not detected through that window: the margin absorbs it. A switch right after the previous account opened its window is the case; the other window usually still differs.
- [Anthropic answers a window already open with no reset (`resets_at` null)] → `parseUsage` turns it into a reset of 0, which counts as no window, and the account's own reading would be taken as foreign. No reading has shown that answer: the owner checks a real one before the merge (second PR #17 review).
- [A machine with a Claude still on the previous account and another on the new one] → Both publish under the new account's email into one entry of `@claude_rate_limits`, by turns. The numbers stay right (the foreign reading is dropped, the right one is shown), but the warning comes and goes at every repaint while both run. The owner accepted it (PR #17 review).
- [The warning outlives the Claude that caused it] → The owner chose that it lasts until corrected. Once that Claude is closed and no other publishes under the account on that machine, the warning stays until the reading's windows end, a week at most.
- [A foreign reading published before this change sits in `usage.json`] → It ages out within 7 hours (`KEEP_SECONDS`).

## Migration Plan

Deploys with the hub on the merge into `master`. No host kit update and no data migration. Rolling back is redeploying the previous version.
