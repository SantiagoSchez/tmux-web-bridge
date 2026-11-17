# Proposal

## Why

The koalarnes plugin is now called **ka**, and its `ka sync` moves each project's harness configuration from `.claude/koalarnes.json` to `.claude/ka.json`. The panel reads only the old name, so in every migrated project (this one included, once PR #45 merges) it links `PR #N` and `Issue #N` to the `origin` remote instead of `platform.repository`, stops underlining `Trello #N`, and offers the remote's default branch instead of `git.baseBranch` as the base of a new worktree. GitHub issue: [Issue #46](https://github.com/SantiagoSchez/tmux-web-bridge/issues/46).

## What Changes

- The panel reads a project's harness configuration from `.claude/ka.json` and, when that file does not exist, from `.claude/koalarnes.json`. When both exist, `.claude/ka.json` wins.
- This applies to the two places that read it: the terminal links (`platform.host`, `platform.repository`, `tracker.board`) and the project's base branch for worktrees (`git.baseBranch`), used by «Nuevo worktree», the Trello extension and the panel's Trello drawer.
- Projects that have not migrated yet keep working as today: their `.claude/koalarnes.json` lives outside this repository, on the owner's machines, so the old name stays readable.
- The specs, the feature catalogue, the README and the code comments name both files.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `terminal-links`: "The pane's project decides the repository" and "Trello references open the card" read `.claude/ka.json`, else `.claude/koalarnes.json`.
- `worktree-base`: "The base branch offered first is the last one used" takes the project's base from `.claude/ka.json`, else `.claude/koalarnes.json`.

## Impact

- Layers: **server** (`server/src/project-refs.ts`, `server/src/worktree-base.ts`, their tests, comments in `shared/types.ts`) and **web** (a comment in `web/src/refLinks.ts`). Documentation: `docs/FEATURES.md`, `README.md`.
- External services: none. Both readers run as shell scripts on each machine, over SSH or locally.
- Contracts: no API payload, message, schema or environment variable changes. `RefContext` and the branch-list response keep their shape.

## Non-goals

- Reading any other key of the configuration, or parsing it differently: the readers keep their current limits and matching.
- Migrating the owner's projects to `.claude/ka.json`: `ka sync` does that, project by project.
- Dropping `.claude/koalarnes.json` support.
- The detection of a plugin's `WorktreeCreate` hook, which already follows whatever plugin name `enabledPlugins` holds.
