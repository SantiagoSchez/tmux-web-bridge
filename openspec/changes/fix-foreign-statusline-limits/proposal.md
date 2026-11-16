# Proposal

GitHub issue: [Issue #16](https://github.com/SantiagoSchez/tmux-web-bridge/issues/16).

## Why

The usage strip shows, in one account's row, the 5-hour and weekly limits of another account. In the reported case, s2's row showed s1's 5 % and 0 %, with s1's reset times, while s2's weekly use was near 96 %. The owner reads the strip to decide which account to work with, so a wrong row leads to running out of an account they believe has room.

The cause is the statusline's label. `host-kit/statusline.sh` publishes the `rate_limits` Claude Code hands it under the email of `oauthAccount` in `.claude.json`, which it reads at every repaint. The `rate_limits` describe the account the running Claude last talked to Anthropic with. After «Usar aquí» switches a machine whose Claudes are already running, a repaint can publish the previous account's numbers under the new account's email. The panel prefers a statusline reading to the hub's own reading when it is fresher, which it nearly always is, and the hub adds it to the usage history the forecast is computed from.

## What Changes

- The hub checks every statusline reading against its own reading of the account with that email (`/api/oauth/usage`). A reading whose 5-hour or weekly reset disagrees with the hub's, while both windows are still current, is of another account; so is one whose window was already open when the hub saw that window closed or ended. The hub keeps it out of the hosts it sends to the panel and out of the usage history.
- The hub tells the panel, per account, on which machines a statusline published another account's limits under that account's email.
- The panel marks that account's row with a ⚠ and explains it, both in the row's tooltip and in the account's menu: a Claude on that machine published another account's limits under this one, so it is probably still on the previous account.
- The warning lasts while the foreign reading stays on the machine and its window is current. A correct reading from that machine for the same account replaces it, and the warning goes away.

## Capabilities

### New Capabilities

- `usage-limits`: the usage strip's per-account limits and where they come from (the hub's reading and the statuslines'). This change adds only the requirements about readings published under the wrong account.

### Modified Capabilities

None. No capability spec covers the usage strip yet.

## Impact

- Layers: `server` (a new pure module with its tests, and its wiring in `server/src/index.ts`; `shared/types.ts`) and `web` (`web/src/components/LimitsBar.tsx`, `web/src/accounts.tsx`, `web/src/styles.css` if needed). The `host-kit` layer does not change.
- External services: none new. The check uses the readings the hub already takes from Anthropic's `/api/oauth/usage`.
- Contract change: `ClaudeAccount` in `shared/types.ts` gains a field with the ids of the machines that published another account's limits under it. It travels in the `accounts` websocket message and the initial snapshot. The hub and the panel deploy together, so there is no compatibility concern. The `host` and `tree` messages keep their shape; their `limits` lose the foreign readings.
- Data: `usage.json` (the usage history) stops receiving foreign readings. The ones already stored age out within 7 hours, so nothing is migrated.

## Non-goals

- Labelling the reading correctly at the source. Claude Code does not tell the statusline which account its `rate_limits` belong to, so the statusline cannot fix the label.
- Readings of an email two hub accounts share, and of an account the hub has no reading of. The panel already ignores the statusline for a shared email; for an account without a hub reading there is nothing to compare against. Both keep their current behaviour.
- The pane's `@claude_account`, which the statusline sets from the same `.claude.json` and the panel uses to highlight the open window's account. The highlight already prefers the hub's record of the machine's login.
- Restarting or messaging the affected Claudes from the panel.
