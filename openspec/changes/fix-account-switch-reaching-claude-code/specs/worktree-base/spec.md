## MODIFIED Requirements

### Requirement: The worktree starts from the chosen base

A worktree created with a base branch SHALL start from that branch as it is on the remote, or, when the remote cannot be reached, from the copy the machine has, telling the user. With a hook that creates Claude Code's worktrees, the hook SHALL still create the worktree and do its own preparation; the hook SHALL be looked for in the settings and plugins of the Claude Code folder the machine's tmux sessions use (the tmux server's global `CLAUDE_CONFIG_DIR`, `~/.claude` without it) and in the project's settings; without one, the hub SHALL create it under the main checkout, copying the ignored files `.worktreeinclude` selects. Its branch SHALL keep the worktree's name.

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

#### Scenario: Hook in the folder the machine's tmux sets

- **GIVEN** a machine whose tmux server sets `CLAUDE_CONFIG_DIR` to `~/.claude-twb`, with a hook that creates worktrees declared only in that folder's settings
- **WHEN** a task is launched in worktree `feature/14-login` with base `release/2.0`
- **THEN** the hook creates the worktree, and its branch `feature/14-login` starts at `origin/release/2.0`
