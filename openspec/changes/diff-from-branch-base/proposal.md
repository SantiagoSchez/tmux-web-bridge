# Proposal

GitHub issue: [Issue #30 «El diff compara con la rama de la que salió el worktree, con un desplegable para elegir otra»](https://github.com/SantiagoSchez/tmux-web-bridge/issues/30).

## Why

Since a worktree can start from any branch of `origin` (capability `worktree-base`), «Toda la rama» in «Ficheros cambiados» and the window's +/− counter still compare it with the repository's main branch. A worktree created from `release/2.0` then lists every commit `release/2.0` has and the main branch lacks, mixed with its own work, and the user cannot compare it with any other branch.

## What Changes

- The whole-branch comparison, in the «Ficheros cambiados» modal and in the window's +/− counter, starts from the branch the current branch was created from, as git wrote it down when it created the branch. A note naming `refs/remotes/origin/X` or `origin/X` means `origin/X`; a local branch `X` means `origin/X` when `origin` has it, else `X`. When there is no usable note (none, or one that names `HEAD`, a commit, the branch's own copy on `origin`, or a branch that no longer exists), the comparison keeps today's rule: the main branch (`origin/HEAD`, `origin/main`, `origin/master`, `main`, `master`).
- In «Toda la rama», the modal shows a dropdown with the branches of `origin` the machine knows, with the branch it started from selected. Picking another one compares the branch with it. The choice lasts while the modal is open (also when the user opens a file's diff and goes back) and is not remembered when it is opened again.
- The +/− counter always compares with the branch it started from, never with the one picked in the modal.
- **Contract**: `GET /api/git/changes` accepts an optional `base` query parameter, the name of a branch of `origin`. `GitChanges` (shared/types.ts) gains `defaultBase` (the ref the whole-branch mode uses when none is asked) and `branches` (the branches of `origin` the machine knows). `GitStat.base` and `GitChanges.base.ref` keep their shape and now name the branch the current one started from. `GET /api/git/diff` and `GET /api/git/stat` keep their parameters. No message or job payload, data model or environment variable changes.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `worktree-base`: adds what a branch's changes are compared with: the branch it started from, the fallback to the main branch, the branch picked in «Ficheros cambiados», and the +/− counter.

## Impact

- **Layers**: `server` (`server/src/files.ts`: the script that finds the base, `gitChanges`, `gitStat`; the `/api/git/changes` route in `server/src/index.ts`; `shared/types.ts`) and `web` (`web/src/components/Files.tsx`: `ChangesView` and its dropdown). The `trello-extension` and `host-kit` layers are untouched.
- **External services**: none new. The scripts run on the user's machines over SSH as today, read git's reflog and the remote branches the clone already has, and do not fetch from the remote.
- **Compatibility**: the web app and the hub deploy together; an older web app that sends no `base` gets the new default comparison.

## Non-goals

- Fetching from the remote before comparing: the modal and the counter compare with the copy of the branches the machine already has, as today.
- Remembering the branch picked in the modal, per folder or per device.
- Comparing with branches of remotes other than `origin`, with tags or with arbitrary commits.
- Guessing the base of a branch with no creation note (for example, the nearest branch by merge-base).
- Changing the «Sin commit» mode, the per-file diff view or how worktrees are created.
