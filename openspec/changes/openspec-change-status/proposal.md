# Proposal

GitHub issue: [Issue #74 · Mostrar en cada ventana el estado de su cambio de OpenSpec](https://github.com/SantiagoSchez/tmux-web-bridge/issues/74)

## Why

Every end of a Claude Code turn marks its window ✅, so a window whose change is finished and one that stopped at task 7 of 23 look the same in the panel. In a project that runs the koalarnes harness, the files of each OpenSpec change already say how far it got (`tasks.md`) and where its review stands (`review.json`); the panel only has to read them.

## What Changes

- The hub reads, for every pane folder inside a repository that has a harness configuration (`.claude/ka.json`, else `.claude/koalarnes.json`), the active OpenSpec changes of that repository's top folder: every folder under `openspec/changes/` except `archive/`.
- For each change it reads the tasks done over the total (the `- [x]` and `- [ ]` checkboxes of its `tasks.md`) and, from its `review.json` when `version` is 1, the pull request, the review round over the budget limit and the open blockers. A `review.json` of another version contributes nothing.
- The reading runs in the scanner that already reads each folder's worktree and branch (every 15 s, apart from the 1 s poll), plus right after a pane changes state, so a ✅ shows fresh numbers.
- The panel shows each active change in four places:
  - the list row: one line per change under the worktree or branch line («☑ 7/23 · PR #74 · ronda 2/3 · 1 bloqueante»), hidden in the compact view like the worktree line;
  - the «Pendientes» card: the same line;
  - the hover tooltip: the same data with each change's name;
  - the open window's header: one button per change with its tasks («☑ 7/23») that opens its `tasks.md` in the file viewer.
- The window's ··· menu gets one entry per change that opens its `proposal.md` in the file viewer.
- The hover tooltip shows after the mouse rests 0.2 s on a row instead of 1 s.
- No rule of `ka review-rounds gate` is reimplemented: no git, no «head moved»; only files are read.

## Capabilities

### New Capabilities

- `change-progress`: the panel shows, for a window whose folder is in a repository using the koalarnes harness, each active OpenSpec change with its tasks and review state, and opens its tasks and proposal.

### Modified Capabilities

- `window-details`: the tooltip shows after 0.2 s instead of 1 s, and a pane's details list the active changes of its folder.

## Impact

- Layers: `server` (`server/src/git.ts`, `server/src/host.ts`, `shared/types.ts`, a pure parser in `shared/`) and `web` (`web/src/components/Tree.tsx`, `HoverTip.tsx`, `WindowView.tsx`, `web/src/menus.ts`, `web/src/styles.css`). Not `host-kit` nor `trello-extension`.
- Contract: `PaneInfo` in `shared/types.ts` gains an optional `changes` field, sent to the browsers in the tree (`ServerMessage` `tree`/`host` payloads). The only consumer is `web`; the Trello extension does not read panes.
- External services: none. The hub reads files on each machine over the SSH connection it already uses for the scanner.
- Dependency on the koalarnes harness's file formats: `tasks.md` checkboxes and `review.json` version 1. A new `review.json` version hides the review data until the panel learns it.

## Non-goals

- Deciding whether a change passes its review gate, or detecting a commit after the last review («head moved»): that needs git and the harness's rules.
- Showing archived changes, or changes of repositories without a harness configuration.
- Changes kept outside `openspec/changes/` (a harness configuration whose `features.specsDir` points elsewhere): the panel reads only that folder.
- Editing a change from the panel, or ticking tasks.
- A push notification when a change finishes or stalls.
- The tooltip on touch screens, which still has none.
