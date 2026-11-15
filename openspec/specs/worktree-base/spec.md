# worktree-base Specification

## Purpose

Defines which branch a git worktree created by the panel, the Trello extension or an automation starts from, how the user picks it, what is remembered, and what happens when the worktree's branch already exists.

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

A worktree created with a base branch SHALL start from that branch as it is on the remote, whether or not the machine has a hook that creates Claude Code's worktrees. When the machine has such a hook, the hook SHALL still create the worktree and do its own preparation. The worktree's branch SHALL keep the name given to the worktree.

#### Scenario: Machine with a worktree hook

- **GIVEN** a machine whose Claude Code has a hook that creates worktrees
- **WHEN** a task is launched in worktree `feature/14-login` with base `release/2.0`
- **THEN** the hook creates the worktree, and its branch `feature/14-login` starts at `origin/release/2.0`

#### Scenario: Machine without a worktree hook

- **GIVEN** a machine whose Claude Code has no hook that creates worktrees
- **WHEN** a task is launched in worktree `feature/14-login` with base `release/2.0`
- **THEN** Claude Code starts inside a new worktree whose branch `feature/14-login` starts at `origin/release/2.0`

#### Scenario: Base is the project's own

- **GIVEN** a project whose base is `master`
- **WHEN** a task is launched in a new worktree with base `master`
- **THEN** the worktree is created as it was before this change

#### Scenario: Launch without a base

- **GIVEN** a launch request that names a worktree but no base, such as one from an extension not yet updated
- **WHEN** the hub launches it
- **THEN** the worktree is created as it was before this change

### Requirement: An automation keeps its base branch

An automation that runs in a new worktree SHALL keep the base branch saved with it and start every run's worktree from that branch. An automation saved without a base SHALL use the project's base at each run.

#### Scenario: Automation with a saved base

- **GIVEN** an automation that runs in a new worktree with base `release/2.0`
- **WHEN** it runs
- **THEN** its worktree starts at `origin/release/2.0`

#### Scenario: Automation without a base

- **GIVEN** an automation saved before this change, or with the base left on the project's base
- **WHEN** it runs in a project whose base is `develop`
- **THEN** its worktree starts at `origin/develop`

### Requirement: An existing branch with the worktree's name is reused

When a branch with the worktree's name already exists in the repository, the worktree SHALL use that branch as it is, the chosen base SHALL be ignored, and the panel or the extension SHALL tell the user so after launching.

#### Scenario: Branch already exists

- **GIVEN** a repository with a branch `feature/14-login`
- **WHEN** the user launches a task in worktree `feature/14-login` with base `release/2.0`
- **THEN** the worktree uses the existing `feature/14-login` and the user is told that the base was not applied because the branch already existed

#### Scenario: Unknown base branch

- **GIVEN** a launch request whose base is not a branch of the remote
- **WHEN** the hub receives it
- **THEN** nothing is launched and the user is told the base branch does not exist
