# Spec Delta

## ADDED Requirements

### Requirement: The hub uses the Claude Code folder of the machine's tmux sessions

When the machine's tmux server sets `CLAUDE_CONFIG_DIR` in its global environment, the hub SHALL read and write the login, the account and the locks of that folder, as Claude Code does with that variable, in place of `~/.claude` and `~/.claude.json`, and SHALL leave the default folder untouched. Without the variable, or without a tmux server, it SHALL use the default folder.

#### Scenario: A machine whose panes use another folder

- **GIVEN** a Linux machine whose tmux server sets `CLAUDE_CONFIG_DIR` to `~/.claude-twb`, with s2's login and account there and s1's in `~/.claude` and `~/.claude.json`
- **WHEN** the hub reads what the machine is logged in with
- **THEN** the panel shows the machine on s2

#### Scenario: Switching that machine

- **GIVEN** the same machine, on s2
- **WHEN** the owner switches it to s3 from the panel
- **THEN** `~/.claude-twb` holds s3's login and names s3, and `~/.claude/.credentials.json` and `~/.claude.json` keep what they had

#### Scenario: A Mac whose panes use another folder

- **GIVEN** a Mac whose tmux server sets `CLAUDE_CONFIG_DIR`, whose Keychain answers through tmux, with s2's login in the Keychain item Claude Code uses for that folder and s1's in the item `Claude Code-credentials`
- **WHEN** the owner switches it to s3
- **THEN** the item of that folder holds s3's login, and the item `Claude Code-credentials` keeps s1's

#### Scenario: A machine whose tmux does not set the variable

- **GIVEN** a machine whose tmux server does not set `CLAUDE_CONFIG_DIR`, or that has no tmux server running
- **WHEN** the owner switches it to s3
- **THEN** the hub writes `~/.claude/.credentials.json` (or the Keychain item `Claude Code-credentials`) and `~/.claude.json`, as before

## MODIFIED Requirements

### Requirement: A Keychain switch writes only the Keychain

When the hub switches a Mac whose store is the Keychain, it SHALL write the new login into the Keychain, keeping the item's other entries (the MCP servers' tokens), and SHALL NOT write `~/.claude/.credentials.json`: a refresh token works once, and a second copy that another Claude Code renews would end the Keychain's session. The Keychain SHALL be written before `~/.claude.json`: if it is refused, nothing changes. Once the Keychain holds the new login, the hub SHALL set the modification time of `~/.claude/.credentials.json` to the time of the switch when that file exists, leaving its content as it was, and SHALL NOT create it when it does not: the Claude Codes already running on the Mac re-read their login when that time changes.

#### Scenario: Only the Keychain after a switch

- **GIVEN** a Mac whose store is the Keychain, with an MCP server's token in the Keychain item and another login in the file
- **WHEN** the owner switches it to s2
- **THEN** the Keychain holds s2's login and keeps the MCP server's token, and the file keeps its content

#### Scenario: The Claude Codes already running pick up the switch

- **GIVEN** a Mac whose store is the Keychain, with a Claude Code running on s1 and a `~/.claude/.credentials.json` last modified before the switch
- **WHEN** the owner switches it to s2
- **THEN** the file's modification time is the time of the switch and its content is unchanged, so the running Claude Code reads s2's login from the Keychain on its next request

#### Scenario: A Mac with no credentials file

- **GIVEN** a Mac whose store is the Keychain and which has no `~/.claude/.credentials.json`
- **WHEN** the owner switches it to s2
- **THEN** the Keychain holds s2's login and `~/.claude/.credentials.json` still does not exist

#### Scenario: The Keychain refuses the write

- **GIVEN** a Mac whose Keychain answers reads but refuses the write
- **WHEN** the owner switches it to s2
- **THEN** the panel shows the error, and the file (its content and its modification time), the Keychain and `~/.claude.json` keep what they had
