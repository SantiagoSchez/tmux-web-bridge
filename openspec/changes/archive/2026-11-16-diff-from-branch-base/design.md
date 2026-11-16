# Design

## Context

See proposal.md for the motivation. Today `server/src/files.ts` holds one shell fragment, `BASE_SCRIPT`, that tries `origin/HEAD`, `origin/main`, `origin/master`, `main` and `master` and prints the first one with its merge-base as `M<tab>ref<tab>commit`. `MODE_SCRIPT` turns the mode «auto» into «branch» when the current branch is not that ref without `origin/`. Both run on the user's machine over SSH: `gitChanges` (the modal's list, through `runBytes` and `host.exec.spawnShell`) and `gitStat` (the window's +/− counter, through `host.exec.shell`). `gitDiff` receives the merge-base commit from the web app and does not look for a base itself.

What each tool writes down when it creates a branch was checked on git 2.x with a throwaway repository (the oldest entry of `git reflog show --format=%gs refs/heads/<branch>`):

| How the branch was created | Note |
|---|---|
| The hub, with a base (`git branch --no-track -- <w> refs/remotes/origin/<b>`, `server/src/worktree-base.ts`) | `branch: Created from refs/remotes/origin/<b>` |
| The hub, branch already on `origin` (`git worktree add --track -b <w> <dir> refs/remotes/origin/<w>`) | `branch: Created from refs/remotes/origin/<w>` |
| `git checkout -b`, `git worktree add -b`, `git branch` with `origin/<b>` (the koalarnes hook, by hand) | `branch: Created from origin/<b>` |
| `git switch -c <x> <b>` or `git branch <x> <b>` with a local branch | `branch: Created from <b>` |
| `git worktree add -b <x> <dir>` with no start point | `branch: Created from HEAD` |
| `git branch <x> <hash>` | `branch: Created from <hash>` |

The machines are Linux and macOS, so the scripts stay POSIX `sh` with tools both have (`sed`, `tail`).

## Goals / Non-Goals

**Goals:**

- One rule for «the branch this one started from», shared by the modal and the counter, run in the same SSH call each already makes.
- A `base` parameter that can only name a branch of `origin`, checked on the hub before anything runs on the machine.

**Non-Goals:**

- Storing the base anywhere on the hub or in the repository: the reflog is the only source.
- Changing `gitDiff` or `/api/git/diff`: they already take the merge-base commit.

## Decisions

### The base comes from the branch's oldest reflog entry

- **Context**: worktrees are created by the hub, by the koalarnes hook and by hand. The owner chose to rely only on git's creation note.
- **Decision**: the script reads `git reflog show --format=%gs "refs/heads/$b" -- | tail -n 1` and keeps what follows `branch: Created from `. Rules, in order:
  1. `refs/remotes/origin/X` becomes `origin/X`; `origin/X` stays; `refs/heads/X` becomes `X`.
  2. A name without `origin/` becomes `origin/X` when `refs/remotes/origin/X` exists, else stays `X` only when `refs/heads/X` exists.
  3. The result is dropped when it is `HEAD`, when it is `origin/$b` or `$b` (the branch's own copy: the hub's reuse of a remote branch, a `git checkout <b>` that tracks `origin/<b>`), when it names no existing branch (a hash, a tag, a deleted branch, another remote), or when there is no note.
  4. When dropped, the main-branch loop of today runs unchanged.
- **Alternatives**: the branch's upstream (`branch.<b>.merge`) is empty, because the hub and the hook create branches with `--no-track`; a file the hub writes at creation would miss the hook's and the hand-made branches; the nearest branch by merge-base is a guess the owner ruled out.
- **Consequences**: a branch whose reflog expired (`gc.reflogExpire`, 90 days by default), a repository with `core.logAllRefUpdates=false`, or a branch checked out on another machine than the one that created it compares with the main branch, as today.

### One script builder for the base, with an optional asked branch

- **Decision**: `BASE_SCRIPT` becomes `baseScript(asked?: string)`. It prints `D<tab>ref` with the start branch (or the main one), and `M<tab>ref<tab>commit` with the ref compared and its merge-base. With `asked`, the compared ref is `origin/<asked>` when `refs/remotes/origin/<asked>` exists; otherwise the script prints `GONE` and `gitChanges` throws a `FileError` 404 «La rama <asked> ya no está en origin». When it exists but shares no commit with the current branch (an orphan branch such as `gh-pages`), the script prints `NOBASE` and `gitChanges` throws a `FileError` 409 «La rama <asked> no tiene historia en común con esta». Both labels are looked for only in the header, before the line `F`, so a file name cannot fake them. `MODE_SCRIPT` keeps its test against the `D` ref, so «auto» is «branch» on any branch but the one it would compare with. `gitStat` calls `baseScript()` without `asked`. `gitChanges` also prints `O<tab>name` for each `refs/remotes/origin/*` but `origin/HEAD` (`git for-each-ref --format='%(refname:lstrip=3)' refs/remotes/origin`, which leaves the name without `refs/remotes/origin/`).
- **Alternatives**: a separate request for the branch list would cost a second SSH round trip on every open; the `/api/branches` route of `worktree-base` fetches from the remote first, which is slow and not wanted here.

### The contract names an origin branch, not a ref

- **Context**: the parameter ends up inside a shell script on the user's machine.
- **Decision**: `GET /api/git/changes` takes `base`, a branch name of `origin` (`release/2.0`, never `origin/release/2.0`). The route rejects it with 400 when `branchNameProblem` (shared/worktree.ts) finds a problem, before any script runs, and the script receives it quoted with `quote()`. The script only ever builds `refs/remotes/origin/<name>` from it. `base` is ignored in «Sin commit». `GitChanges` gains `defaultBase?: string` (the `D` ref) and `branches: string[]` (origin's branch names, sorted as git lists them).
- **Consequences**: the web app can only ask for a branch of `origin`. A start branch that is local only (`prueba`) is reached by sending no `base`.

### The web app keeps the choice in a module signal

- **Decision**: `Files.tsx` adds a `changesBase` signal next to `changesQuery`, reset by the function that opens the modal. `ChangesView` sends it as `base` in «Toda la rama» and reloads when it changes, so the choice survives the remount after a file's diff and dies with the modal. The tab chosen moves to a `changesMode` signal too (it was `ChangesView` state, reset to the opening tab on that remount, and the `mode` of the `changes` screen of `web/src/fileViewer.ts` goes away); picking a branch sets it to «Toda la rama», so a modal opened on «auto» keeps the branch when it comes back from a diff. What the choice offers (`defaultBase` and `branches` of the last answer) lives in a `changesChoice` signal reset in the same place, so a picked branch that is gone or has no history in common still leaves the choice to pick another one, also after coming back from a diff. A request that a newer one replaced is aborted and its answer ignored, so a late answer cannot show one branch's list under another's name. In «Toda la rama», a `<select class="text-input changes-base">` sits on its own row below `.file-actions`, above the search field: its first option, value `''`, is `defaultBase`; the others are `origin/<name>` for each of `branches` except the one equal to `defaultBase`. It is hidden when there is no other option. The subtitle keeps «desde <base.ref>» and the empty list says «Esta rama no tiene cambios respecto a <base.ref>.». `DiffView` is unchanged; `ChangesButton` (the window's +/− counter) keeps its shape, and its label falls back to «desde su rama base» instead of «la rama principal».
- **Alternatives**: a sheet with a searchable branch list, like the base picker of «Nuevo worktree», is heavier than the owner asked for.

### Flow

1. The web app asks `GET /api/git/changes?host&window&pane&mode=branch&base=master`.
2. The hub validates `base` (400 on a bad name), finds the pane's folder, and runs one script on the machine over SSH: repository root, branch, `baseScript('master')`, mode, the branch list, then the changed files against the merge-base.
3. The hub parses `R`, `B`, `D`, `M`, `X` and `O` lines and the file list, and answers `GitChanges`, 404 when the script printed `GONE` or 409 when it printed `NOBASE`.
4. The web app lists the files; opening one calls `GET /api/git/diff` with `base.commit`, as today.

The counter's `GET /api/git/stat` runs `baseScript()` in its own script and is not affected by the modal.

## Risks / Trade-offs

- [The note of an old branch expired, so it compares with the main branch without saying so] → the subtitle and the counter's label always name the branch compared with, and the dropdown lets the user pick the right one.
- [A branch created from another feature branch that was later merged and deleted] → rule 3 drops a branch that no longer exists, and the main branch is used.
- [Repositories with hundreds of remote branches make a long dropdown] → a native `<select>` handles long lists on phones; no limit is set.
- [A `git` older than the reflog `--format` option on a machine] → the note comes out empty and the main branch is used; nothing breaks.

## Migration Plan

Nothing to migrate: the hub and the web app deploy together on merge, and the scripts run with each request. Reverting the merge restores the old comparison.
