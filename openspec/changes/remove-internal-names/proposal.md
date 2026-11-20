# Proposal

## Why

The repository is public, and its files name the owner's own machines (their hostnames and container ids), the owner's other projects (tmux session names) and the real addresses of the owner's network. Those names reached the capability specs, the archived OpenSpec changes and the server tests because they were the examples at hand. The owner asked on 2026-11-20 to replace them and to add a rule so that agents stop publishing them. There is no GitHub issue: it is a chore.

## What Changes

- Every machine name of the owner in a tracked file becomes a generic one: the hub and Proxmox host `linux-box`, the bot's machine `bot-box`, the development container `dev-box`, the hub's container `hub-box`. Container ids are dropped.
- Every project name of the owner becomes `shop` (`shop-platform`, `shop-generator` for its sessions).
- The real addresses in `server/src/machines.test.ts` (the tailnet address and the LAN and internal ones) become example addresses outside the owner's networks.
- The examples of three capability specs change the same way: `scheduled-messages`, `usage-limits` and `window-details`. No behaviour changes: only the names in their scenarios.
- The archived changes under `openspec/changes/archive/` are edited in place, the one exception to «the archive is history»: the names must leave every tracked file.
- A new principle in `docs/dev-standards/base-standards.md`, with a line in `AGENTS.md` under «Always in view»: never write the owner's machine names, project names or network addresses into anything published (tracked files, commit messages, issues, pull requests, comments).
- Outside the repository, the descriptions and the agent's comments of the issues and pull requests that name them (Issue #16, #43, #52, #60, #61, #64 and PR #4, #44, #53, #62) are edited the same way.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `scheduled-messages`: the requirements whose scenarios name one of the owner's machines; it becomes `linux-box`.
- `usage-limits`: the requirement whose scenarios name the bot's machine; it becomes `bot-box`.
- `window-details`: the requirements whose scenarios name one of the owner's projects; it becomes `shop`.

## Impact

- Layers: `server` (tests only: `server/src/machines.test.ts`, `scheduled.test.ts`, `scheduled-rules.test.ts`, `ext.test.ts`, `window-details.test.ts`). No production code changes.
- Documentation: the three capability specs, the archived changes, `AGENTS.md` and `docs/dev-standards/base-standards.md`. The feature catalogue holds none of the names.
- Contracts: none. No API, payload, data model, environment variable or migration.
- External services: GitHub (editing issue and pull request texts).

## Non-goals

- Rewriting the git history or force-pushing `master`: the names stay in earlier commits and in GitHub's edit history of each text, which the owner can delete by hand.
- The owner's user name in test paths (`/Users/santiago`, `santiago@`), the Mac models (MacBook Pro, MacBook Air) and the bot's user name: the owner chose to keep them.
- The repository's own address (`SantiagoSchez/tmux-web-bridge`).
