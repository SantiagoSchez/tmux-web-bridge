# Spec Delta

## ADDED Requirements

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

#### Scenario: The picked branch has no history in common

- **GIVEN** a repository whose `origin` has an orphan branch `pages` that shares no commit with the current branch
- **WHEN** the user picks `pages`
- **THEN** the modal says that branch has no history in common with the current one, not that it is gone, and the user can pick another one

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
