# claude-accounts Specification

## Purpose

Defines where the hub reads and writes the Claude Code login of each machine, so that a switch from the panel reaches the Claude Code that runs there, and how the hub keeps every login it stores under the account it really belongs to.

## Requirements

### Requirement: The hub uses the store the machine's Claude Code reads

On a Mac, the hub SHALL read and write the Keychain item of Claude Code when the Keychain answers its SSH session, else when it answers through the machine's tmux server, and SHALL use `~/.claude/.credentials.json` only when it answers neither way. On Linux it SHALL use the file. No secret SHALL appear on a command line the tmux server runs, and a `#` in the machine's paths SHALL reach that command line literally, not as a tmux format.

#### Scenario: A Mac whose Keychain only answers through tmux

- **GIVEN** a Mac whose Keychain refuses the hub's SSH session and answers through its tmux server, with account s1's login in the Keychain and another in the file
- **WHEN** the hub reads what the Mac is logged in with
- **THEN** it reads s1's login from the Keychain

#### Scenario: Switching that Mac

- **GIVEN** the same Mac on account s1
- **WHEN** the owner switches it to s2 from the panel
- **THEN** the Keychain holds s2's login, and a Claude Code started on the Mac afterwards talks to Anthropic as s2

#### Scenario: A Mac whose Keychain answers no one

- **GIVEN** a Mac whose Keychain refuses the SSH session, with no tmux server running
- **WHEN** the owner switches it to s2
- **THEN** the hub writes s2's login into `~/.claude/.credentials.json`, as on Linux

### Requirement: A Keychain switch writes only the Keychain

When the hub switches a Mac whose store is the Keychain, it SHALL write the new login into the Keychain, keeping the item's other entries (the MCP servers' tokens), and SHALL NOT write the `.credentials.json` of the Claude Code folder (`~/.claude/.credentials.json` by default): a refresh token works once, and a second copy that another Claude Code renews would end the Keychain's session. The Keychain SHALL be written before the folder's account file (`~/.claude.json` by default): if it is refused, nothing changes. Once the Keychain holds the new login, the hub SHALL set the modification time of the folder's `.credentials.json` to the time of the switch when that file exists, leaving its content as it was, and SHALL NOT create it when it does not: the Claude Codes already running on the Mac re-read their login when that time changes.

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

### Requirement: Every login is filed under the account it belongs to

Before the hub reads an account's usage with a login, or hands a login to a machine, it SHALL confirm with Anthropic's profile which account the login belongs to, unless it already confirmed that same login. A login filed under another account SHALL move to the one it belongs to, created when the hub does not know it, and a machine using it SHALL show that account.

#### Scenario: A login of s2 filed under s1

- **GIVEN** the hub keeps under account s1 a spare login whose profile says s2
- **WHEN** the hub is about to read s1's usage
- **THEN** it moves that login to s2, does not record its usage as s1's, and s1's row stops showing s2's numbers

#### Scenario: A machine whose files disagree

- **GIVEN** a machine whose `~/.claude.json` names s1 and whose login is of s2
- **WHEN** the hub reads what the machine is logged in with
- **THEN** the panel shows the machine on s2

#### Scenario: That machine renews its token

- **GIVEN** the same machine, shown on s2, whose `~/.claude.json` still names s1
- **WHEN** its Claude Code renews the login and the hub looks at the machine again
- **THEN** the panel keeps showing the machine on s2, and the hub keeps no copy of the login's previous refresh token

#### Scenario: Switching that machine to the account its file names

- **GIVEN** a machine shown on s1, whose login is s1's and whose `~/.claude.json` names s2
- **WHEN** the owner switches it to s2 from the panel
- **THEN** the hub writes an s2 login into the machine's store, and the panel shows the machine on s2

#### Scenario: A /login by hand on that machine

- **GIVEN** the same machine, shown on s2, whose `~/.claude.json` names s1
- **WHEN** the owner runs `/login` there with account s3, which rewrites `~/.claude.json`
- **THEN** the panel shows the machine on s3, and the s2 login it had comes back to the hub as spare

#### Scenario: A login of an account the hub does not know

- **GIVEN** a stored login whose profile names an account the hub has never seen
- **WHEN** the hub confirms it
- **THEN** that account appears in the panel with the login as its own

#### Scenario: A confirmed login is not asked again

- **GIVEN** a login the hub already confirmed as s2, whose token has not changed
- **WHEN** the hub reads s2's usage every 5 minutes
- **THEN** it asks Anthropic for the profile no more often than it did before this change

#### Scenario: A machine login that cannot be asked yet

- **GIVEN** a login on a machine whose access token has expired, which only that machine renews
- **WHEN** the hub would confirm it
- **THEN** it waits for the machine's renewed token instead of renewing it itself, and does not read usage with it meanwhile

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
