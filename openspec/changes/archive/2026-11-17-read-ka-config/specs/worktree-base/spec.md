## MODIFIED Requirements

### Requirement: The base branch offered first is the last one used

The base branch offered first SHALL be the last one used for the same Trello board, in the extension and in the panel's Trello drawer, and for the same folder, in «Nuevo worktree». With nothing remembered, or when the remembered branch is no longer on the remote, it SHALL be the project's base: `git.baseBranch` of the repository's harness configuration (`.claude/ka.json`, else `.claude/koalarnes.json`), else the remote's default branch.

#### Scenario: Remembered per Trello board

- **GIVEN** a task launched from the extension on a card of board A with base `release/2.0`
- **WHEN** the user opens the extension's dialog on another card of board A
- **THEN** `release/2.0` is the base branch offered first

#### Scenario: Another board starts from the project's base

- **GIVEN** a project whose `.claude/ka.json` sets `git.baseBranch` to `develop`, and nothing remembered for board B
- **WHEN** the user opens the extension's dialog on a card of board B for that project
- **THEN** `develop` is the base branch offered first

#### Scenario: Project still on koalarnes.json

- **GIVEN** a project without `.claude/ka.json` whose `.claude/koalarnes.json` sets `git.baseBranch` to `develop`, and nothing remembered
- **WHEN** the user opens «Nuevo worktree» on it
- **THEN** `develop` is the base branch offered first

#### Scenario: ka.json wins over koalarnes.json

- **GIVEN** a project whose `.claude/ka.json` sets `git.baseBranch` to `develop` and whose `.claude/koalarnes.json` sets it to `release/2.0`, and nothing remembered
- **WHEN** the user opens «Nuevo worktree» on it
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

- **GIVEN** a repository without `.claude/ka.json` or `.claude/koalarnes.json` whose remote's default branch is `main`, and nothing remembered
- **WHEN** the user opens «Nuevo worktree» on it
- **THEN** `main` is the base branch offered first
