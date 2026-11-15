# Proposal

GitHub issue: [Issue #14](https://github.com/SantiagoSchez/tmux-web-bridge/issues/14).

## Why

Every worktree the panel or the Trello extension creates starts from the remote's default branch, because `claude --worktree` gives no way to pick another. Work that has to start from a release branch, a long-lived feature branch or a branch under review needs a hand-made worktree today, outside the panel.

## What Changes

- Creating a worktree asks which branch it starts from, in every place that creates one: the «Nuevo worktree» step of «Nuevo espacio» and «Nueva ventana», the panel's Trello drawer and the Trello extension's dialog when «En un worktree nuevo» is checked, and the automations that run in a new worktree each time.
- The choice lists `origin`'s branches, read on the machine after a `git fetch`.
- The branch offered first is the last one used: per Trello board in the extension and in the panel's Trello drawer (next to the machine and destination they already remember per board), per folder in «Nuevo worktree». With nothing remembered, or when that branch no longer exists, the project's base: `git.baseBranch` of the project's `.claude/koalarnes.json`, else the remote's default branch. An automation keeps its base with it; empty means the project's base.
- The hub applies the base in one of two ways. When the machine has a `WorktreeCreate` hook (in Claude Code's settings or an enabled plugin), the hub first creates the worktree's local branch from `origin/<base>` and launches `claude --worktree` as today, so the hook reuses that branch and still does its setup. Without a hook, the hub creates the worktree itself with `git worktree add` from `origin/<base>` and starts Claude inside it, because Claude Code's own `--worktree` always starts from the remote's default branch. When the base is the project's own, nothing changes from today.
- A branch that already exists with the worktree's name is reused as it is: the base is ignored and the panel or the extension says so.
- Contracts:
  - `ExtLaunchRequest` (`POST /api/ext/launch`, `POST /api/trello/launch`) and the `launchTask` action gain an optional `base`; `ExtLaunchResult` gains an optional `notice` for the reused-branch warning. Requests without `base` behave as today, so an extension not yet updated keeps working.
  - New read-only `listBranches` action and `GET /api/ext/branches`: the branches of a launch target's repository and its base (new type `BranchList`).
  - `Automation` gains an optional `base`, stored in `dataDir/automations.json`; automations saved before keep working without it.
  - No new environment variable.

## Capabilities

### New Capabilities

- `worktree-base`: which branch a worktree created by the panel, the Trello extension or an automation starts from, how that branch is chosen and remembered, and what happens when the worktree's branch already exists.

### Modified Capabilities

None.

## Impact

- Layers: `server` (branch listing, applying the base before or instead of `claude --worktree`, hook detection, the new action and endpoint, the automation field, `shared/types.ts`), `web` (the branch choice in «Nuevo worktree», the Trello drawer and the automation form, the per-folder memory in `prefs`) and `trello-extension` (the branch choice in the launch dialog and its per-board memory, a new message to the service worker). `host-kit` is not changed.
- Machines: the hub runs `git fetch` and `git branch` or `git worktree add` in the target folder's repository, and reads Claude Code's settings and plugin hook files to detect a `WorktreeCreate` hook. A fetch reaches the repository's remote with the machine's own credentials.
- External services: the repository's git remote (GitHub, Bitbucket or other), through the machine's `git fetch`. No API is called.
- Stored data: an optional field in the automations file, the extension's `chrome.storage.local` memory and the panel's per-device prefs; nothing to migrate.

## Non-goals

- Choosing a base for «Nuevo espacio» or «Nueva ventana» without a worktree, or for opening an existing worktree.
- Basing a worktree on a local branch that was never pushed, a tag or a commit.
- Changing the worktree's name or branch prefix rules (`cardWorktreeName`).
- Replicating a hook's setup (copying `.env` files, installing dependencies) when the machine has no hook.
- Passing the base to Claude Code itself (it has no option for it) or changing `worktree.baseRef`.
