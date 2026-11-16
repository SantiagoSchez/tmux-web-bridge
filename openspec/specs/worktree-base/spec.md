# worktree-base Specification

## Purpose

Defines which branch a git worktree created by the panel, the Trello extension or an automation starts from, how the user picks it, what is remembered, what happens when the worktree's branch already exists, and which branch a branch's changes are compared with.

## Requirements

### Requirement: Creating a worktree asks for its base branch

Every place that creates a worktree SHALL let the user pick the branch it starts from: the «Nuevo worktree» step of «Nuevo espacio» and «Nueva ventana», the panel's Trello drawer and the Trello extension's launch dialog when «En un worktree nuevo» is checked, and the form of an automation that runs in a new worktree. The choice SHALL list the branches of the target repository's `origin`, read on its machine after fetching from the remote.

#### Scenario: Branches of the target repository

- **GIVEN** a folder whose repository's `origin` has the branches `master`, `release/2.0` and `feature/login`
- **WHEN** the user opens «Nuevo worktree» on that folder
- **THEN** the base branch choice lists `master`, `release/2.0` and `feature/login`

#### Scenario: The list follows the destination

- **GIVEN** the Trello extension's dialog with «En un worktree nuevo» checked
- **WHEN** the user changes the destination to a folder of another repository
- **THEN** the base branch choice lists that repository's branches

#### Scenario: The remote cannot be reached

- **GIVEN** a repository whose remote does not answer
- **WHEN** the base branch choice opens
- **THEN** it lists the remote branches the machine already knows and says it could not refresh them

#### Scenario: Destination outside a repository

- **GIVEN** a destination folder that is not in a git repository
- **WHEN** the user checks «En un worktree nuevo»
- **THEN** the base branch choice says the folder is not a git repository and the task cannot be launched in a worktree

#### Scenario: Repository without remote branches

- **GIVEN** a repository with no `origin`, or whose `origin` has no branches
- **WHEN** the user checks «En un worktree nuevo»
- **THEN** the base branch choice says there is no branch to start from and the task can still be launched in a worktree without a base

#### Scenario: The branch list cannot be read

- **GIVEN** a machine that fails to answer the branch list
- **WHEN** the base branch choice opens
- **THEN** it says the branches could not be read, offers to read them again, and the task can still be launched in a worktree without a base

### Requirement: The base branch offered first is the last one used

The base branch offered first SHALL be the last one used for the same Trello board, in the extension and in the panel's Trello drawer, and for the same folder, in «Nuevo worktree». With nothing remembered, or when the remembered branch is no longer on the remote, it SHALL be the project's base: `git.baseBranch` of the repository's `.claude/koalarnes.json`, else the remote's default branch.

#### Scenario: Remembered per Trello board

- **GIVEN** a task launched from the extension on a card of board A with base `release/2.0`
- **WHEN** the user opens the extension's dialog on another card of board A
- **THEN** `release/2.0` is the base branch offered first

#### Scenario: Another board starts from the project's base

- **GIVEN** a project whose `.claude/koalarnes.json` sets `git.baseBranch` to `develop`, and nothing remembered for board B
- **WHEN** the user opens the extension's dialog on a card of board B for that project
- **THEN** `develop` is the base branch offered first

#### Scenario: Remembered per folder in «Nuevo worktree»

- **GIVEN** a worktree created with «Nuevo worktree» on folder F from `feature/login`
- **WHEN** the user opens «Nuevo worktree» on folder F again on the same device
- **THEN** `feature/login` is the base branch offered first

#### Scenario: Remembered branch gone from the remote

- **GIVEN** a board whose remembered base `release/1.9` was deleted from the remote
- **WHEN** the user opens the dialog on a card of that board
- **THEN** the project's base is offered first

#### Scenario: Project without koalarnes.json

- **GIVEN** a repository without `.claude/koalarnes.json` whose remote's default branch is `main`, and nothing remembered
- **WHEN** the user opens «Nuevo worktree» on it
- **THEN** `main` is the base branch offered first

### Requirement: The worktree starts from the chosen base

A worktree created with a base branch SHALL start from that branch as it is on the remote, or, when the remote cannot be reached, from the copy the machine has, telling the user. With a hook that creates Claude Code's worktrees, the hook SHALL still create the worktree and do its own preparation; without one, the hub SHALL create it under the main checkout, copying the ignored files `.worktreeinclude` selects. Its branch SHALL keep the worktree's name.

#### Scenario: Machine with a worktree hook

- **GIVEN** a machine whose Claude Code has a hook that creates worktrees
- **WHEN** a task is launched in worktree `feature/14-login` with base `release/2.0`
- **THEN** the hook creates the worktree, and its branch `feature/14-login` starts at `origin/release/2.0`

#### Scenario: Machine without a worktree hook

- **GIVEN** a machine whose Claude Code has no hook that creates worktrees
- **WHEN** a task is launched in worktree `feature/14-login` with base `release/2.0`
- **THEN** Claude Code starts inside a new worktree under the repository's `.claude/worktrees/`, whose branch `feature/14-login` starts at `origin/release/2.0` and which has the ignored files `.worktreeinclude` lists

#### Scenario: Base is the project's own

- **GIVEN** a project whose base is `master`
- **WHEN** a task is launched in worktree `feature/14-login` with base `master`
- **THEN** its branch `feature/14-login` starts at `origin/master`, created by the hook when the machine has one

#### Scenario: Launch without a base

- **GIVEN** a launch request that names a worktree but no base, such as one from an extension not yet updated
- **WHEN** the hub launches it
- **THEN** a machine's hook creates the worktree as it did before this change, and without a hook the worktree starts from the project's base

#### Scenario: Worktree name that starts with a dash

- **GIVEN** a worktree name that starts with `-`, such as `-m`
- **WHEN** a task is launched in it
- **THEN** nothing is launched, nothing changes in the repository, and the user is told the name is not valid

#### Scenario: Destination inside a worktree

- **GIVEN** a machine without a worktree hook and an open space whose folder is a worktree of the repository
- **WHEN** a task is launched there in worktree `feature/15-otra` with base `master`
- **THEN** the new worktree is created under the main checkout's `.claude/worktrees/`, not inside the other worktree

#### Scenario: The remote cannot be reached at launch

- **GIVEN** a machine that knows `origin/release/2.0` and cannot reach the remote
- **WHEN** a task is launched in a new worktree with base `release/2.0`
- **THEN** the worktree starts from the known `origin/release/2.0` and the user is told the remote could not be updated

### Requirement: An automation keeps its base branch

An automation that runs in a new worktree SHALL keep the base branch saved with it and start every run's worktree from that branch. An automation saved without a base SHALL launch each run without one: the machine's worktree hook creates the worktree as it would for any launch without a base, and without a hook the worktree starts from the project's base at that run.

#### Scenario: Automation with a saved base

- **GIVEN** an automation that runs in a new worktree with base `release/2.0`
- **WHEN** it runs
- **THEN** its worktree starts at `origin/release/2.0`

#### Scenario: Automation without a base

- **GIVEN** an automation saved before this change, or with the base left on the project's base, on a machine without a worktree hook
- **WHEN** it runs in a project whose base is `develop`
- **THEN** its worktree starts at `origin/develop`

#### Scenario: Automation without a base on a machine with a hook

- **GIVEN** an automation saved without a base, on a machine with a worktree hook
- **WHEN** it runs
- **THEN** the hook creates the worktree as it does for any launch without a base

### Requirement: An existing branch with the worktree's name is reused

When a branch with the worktree's name already exists in the repository, or on the remote although the machine has not fetched it yet, the worktree SHALL use that branch as it is, the chosen base SHALL be ignored, and the panel or the extension SHALL tell the user so after launching.

#### Scenario: Branch already exists

- **GIVEN** a repository with a branch `feature/14-login`
- **WHEN** the user launches a task in worktree `feature/14-login` with base `release/2.0`
- **THEN** the worktree uses the existing `feature/14-login` and the user is told that the base was not applied because the branch already existed

#### Scenario: Branch on the remote not fetched yet

- **GIVEN** a remote with a branch `feature/14-login` that the machine's clone has not fetched
- **WHEN** the user launches a task in worktree `feature/14-login` with base `release/2.0`
- **THEN** the worktree uses the remote's `feature/14-login` and the user is told that the base was not applied

#### Scenario: Branch on the remote that cannot be fetched

- **GIVEN** a remote with a branch `tema/x` that the machine cannot fetch, such as when its clone still keeps a remote branch `tema` deleted on the remote
- **WHEN** the user launches a task in worktree `tema/x`
- **THEN** nothing is launched, no branch is created in its place, and the user is told the remote's branch could not be fetched

#### Scenario: Worktree folder deleted by hand

- **GIVEN** a machine without a worktree hook and a worktree `feature/14-login` whose folder was deleted without telling git
- **WHEN** the user launches a task in worktree `feature/14-login` again
- **THEN** the worktree is created again on its branch and the task starts in it

#### Scenario: Branch checked out in another folder

- **GIVEN** a machine without a worktree hook and a branch `master` checked out in the project's folder
- **WHEN** the user launches a task in worktree `master`
- **THEN** nothing is launched and the user is told the branch is checked out in that folder

#### Scenario: Unknown base branch

- **GIVEN** a launch request whose base is not a branch of the remote, even if the machine still has an old copy of it
- **WHEN** the hub receives it
- **THEN** nothing is launched and the user is told the base branch does not exist

### Requirement: A branch's changes are compared with the branch it started from

«Toda la rama» in the «Ficheros cambiados» modal SHALL compare the current branch with the branch it was created from, as git noted it when it created the branch on that machine, using the copy of that branch the machine has without fetching from the remote. A note that names `refs/remotes/origin/X` or `origin/X` SHALL mean `origin/X`; one that names a local branch `X` SHALL mean `origin/X` when the machine knows it, else `X`. The modal's subtitle SHALL name the branch compared with.

#### Scenario: Worktree created by the panel from another branch

- **GIVEN** a worktree `feature/14-login` the panel created with base `release/2.0`
- **WHEN** the user opens «Ficheros cambiados» on «Toda la rama» in a window inside it
- **THEN** the files listed are the ones changed since the branch left `origin/release/2.0`, and the subtitle says «desde origin/release/2.0»

#### Scenario: Branch created by hand from a remote branch

- **GIVEN** a branch `tema/x` created with `git checkout -b tema/x origin/develop`
- **WHEN** the user opens «Ficheros cambiados» on «Toda la rama» in it
- **THEN** it compares with `origin/develop`

#### Scenario: Branch created from a local branch that origin has

- **GIVEN** a branch created with `git branch tema/y develop`, on a machine that knows `origin/develop`
- **WHEN** the user opens «Ficheros cambiados» on «Toda la rama» in it
- **THEN** it compares with `origin/develop`

#### Scenario: Branch created from a local branch that origin lacks

- **GIVEN** a branch created from a local branch `prueba` that `origin` does not have
- **WHEN** the user opens «Ficheros cambiados» on «Toda la rama» in it
- **THEN** it compares with `prueba`

### Requirement: Without a usable creation note, the main branch is used

When the branch has no creation note, or the note names `HEAD`, a commit, the branch's own copy on `origin`, or a branch the machine no longer has, the comparison SHALL use the repository's main branch: `origin/HEAD`, else `origin/main`, `origin/master`, `main`, `master`, as before this change.

#### Scenario: Branch with no usable note

- **GIVEN** a repository whose main branch is `origin/master`, and a branch created from `HEAD`, from a commit hash, from a branch the machine no longer has, or whose creation note git no longer keeps
- **WHEN** the user opens «Ficheros cambiados» on «Toda la rama» in it
- **THEN** it compares with `origin/master`, as before this change

#### Scenario: Branch created from its own copy on origin

- **GIVEN** a worktree `feature/9-pagos` whose branch already existed on `origin` when it was created, so git noted `origin/feature/9-pagos` as its start
- **WHEN** the user opens «Ficheros cambiados» on «Toda la rama» in it
- **THEN** it compares with the repository's main branch, not with `origin/feature/9-pagos`

#### Scenario: On the main branch

- **GIVEN** a window on the repository's main branch `master`
- **WHEN** the user opens «Ficheros cambiados»
- **THEN** it opens on «Sin commit», as before this change

### Requirement: The +/− counter compares with the branch it started from

The window's +/− counter SHALL count the lines and files changed since the current branch left the branch it started from, by the same rules as the modal, and its label SHALL name that branch, whatever branch the modal compares with.

#### Scenario: The counter compares with the branch it started from

- **GIVEN** a worktree created from `release/2.0` with changes since it left it
- **WHEN** the window shows its +/− counter
- **THEN** the counter counts the lines and files changed since the branch left `origin/release/2.0`, and its label says «desde origin/release/2.0»

#### Scenario: The counter ignores the choice

- **GIVEN** a worktree created from `release/2.0` and the modal comparing with `master`
- **WHEN** the window's +/− counter refreshes
- **THEN** it still counts the changes since the branch left `origin/release/2.0`

### Requirement: The changes modal compares with the branch the user picks

In «Toda la rama», the «Ficheros cambiados» modal SHALL offer a choice of the branch to compare with: the branch the current one started from, selected when the modal opens, and the branches of `origin` the machine knows. Picking another one SHALL list the files changed since the current branch left that branch of `origin`, and each file's diff SHALL compare with the same point.

#### Scenario: The choice lists origin's branches

- **GIVEN** a worktree created from `release/2.0`, in a repository whose `origin` has `master`, `release/2.0` and `feature/login`
- **WHEN** the user opens «Ficheros cambiados» on «Toda la rama»
- **THEN** the choice lists `master`, `release/2.0` and `feature/login`, with `release/2.0` selected

#### Scenario: Comparing with another branch

- **GIVEN** the modal of a worktree created from `release/2.0`, on «Toda la rama»
- **WHEN** the user picks `master`
- **THEN** the files listed are the ones changed since the branch left `origin/master`, the subtitle says «desde origin/master», and a file's diff shows its changes since that point

#### Scenario: Branch that started from a local branch

- **GIVEN** a branch created from a local branch `prueba` that `origin` does not have
- **WHEN** the user opens the choice on «Toda la rama»
- **THEN** `prueba` is selected and the branches of `origin` follow it

#### Scenario: The picked branch is gone

- **GIVEN** the modal listing `origin/feature/login`, and the machine's copy of it deleted afterwards (for example, by a fetch with prune)
- **WHEN** the user picks `feature/login`
- **THEN** the modal says that branch is no longer on `origin` and the user can pick another one

#### Scenario: A request with an invalid branch name

- **GIVEN** a request for the changes of a window whose `base` is not a valid branch name, such as `-x` or `a..b`
- **WHEN** the hub receives it
- **THEN** it answers that the branch is not valid and runs nothing on the machine

### Requirement: The picked branch lasts while the modal is open

The branch picked in the modal SHALL last while the modal is open, also after opening a file's diff and going back, and SHALL NOT be remembered when the modal is opened again.

#### Scenario: The choice lasts while the modal is open

- **GIVEN** the modal comparing with `master`, picked by the user
- **WHEN** the user opens a file's diff and goes back
- **THEN** the list still compares with `master`

#### Scenario: The choice is not remembered

- **GIVEN** the user compared with `master` and closed the modal
- **WHEN** the user opens «Ficheros cambiados» again in the same window
- **THEN** it compares with the branch the current one started from
