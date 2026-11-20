## MODIFIED Requirements

### Requirement: An end of turn that waits for background work sends no notice

When Claude Code ends its turn in a pane while it still has a background task of a type that wakes Claude (a subagent, a workflow, a monitor, a teammate, a cloud session or an MCP task) or a scheduled wakeup of the session, the machine SHALL send no notice to the hub and the pane SHALL keep the working mark (🔨). Any other background task, such as a shell command, Claude Code's own internal work or a type the machine does not know, does not hold the notice back.

#### Scenario: Claude waits for a background subagent

- **GIVEN** Claude Code in a pane has a subagent running in the background
- **WHEN** Claude Code ends its turn in that pane
- **THEN** the machine sends no notice to the hub
- **AND** the pane's window shows 🔨

#### Scenario: Claude waits for the next run of a loop

- **GIVEN** Claude Code in a pane has a scheduled wakeup (`/loop`, `ScheduleWakeup` or `CronCreate`) and no background task
- **WHEN** Claude Code ends its turn in that pane
- **THEN** the machine sends no notice to the hub
- **AND** the pane's window shows 🔨

#### Scenario: Only a background shell command is running

- **GIVEN** Claude Code in a pane has only a background shell command running, such as a dev server
- **AND** the pane is open only in the panel's web terminal
- **WHEN** Claude Code ends its turn in that pane
- **THEN** the machine reports the finished turn to the hub as not seen
- **AND** the pane's window shows ✅

#### Scenario: Only Claude Code's internal work is running

- **GIVEN** Claude Code in a pane has only its own internal work in the background (a memory consolidation, `dream`, or an `auto-mode scan`), besides any shell command
- **AND** the pane is open only in the panel's web terminal
- **WHEN** Claude Code ends its turn in that pane
- **THEN** the machine reports the finished turn to the hub as not seen
- **AND** the pane's window shows ✅

#### Scenario: A background task of a type the machine does not know

- **GIVEN** Claude Code in a pane has only a background task whose type is none of the types that wake Claude
- **AND** the pane is open only in the panel's web terminal
- **WHEN** Claude Code ends its turn in that pane
- **THEN** the machine reports the finished turn to the hub as not seen
- **AND** the pane's window shows ✅

#### Scenario: Claude Code does not say what is running

- **GIVEN** Claude Code's end-of-turn input lists no background task and no scheduled wakeup, or lacks both lists
- **AND** the pane is open only in the panel's web terminal
- **WHEN** Claude Code ends its turn in that pane
- **THEN** the machine reports the finished turn to the hub as not seen
- **AND** the pane's window shows ✅

#### Scenario: The background work ends and Claude finishes

- **GIVEN** Claude Code ended a turn in a pane while a background subagent was running, and no notice was sent
- **WHEN** the subagent ends, Claude Code resumes and ends its turn with nothing left in the background
- **THEN** the machine reports one finished turn to the hub
- **AND** the pane's window shows ✅

## ADDED Requirements

### Requirement: The machine records what held back a finish notice

When the machine treats an end of turn as a pause for background work, it SHALL keep, on that machine, a record for that pane of the background tasks and scheduled wakeups that held the notice back. The next pause of the pane replaces the record; a real end of turn and the end of the pane's Claude Code session remove it.

#### Scenario: A pause leaves its record

- **GIVEN** Claude Code in a pane has a subagent running in the background and a scheduled wakeup
- **WHEN** Claude Code ends its turn in that pane
- **THEN** the machine keeps a record for that pane listing that subagent and that scheduled wakeup
- **AND** the record lists no shell command or other task that does not wake Claude

#### Scenario: A real finish removes the record

- **GIVEN** a pane has a record left by an earlier pause
- **WHEN** Claude Code ends its turn in that pane with nothing that wakes Claude in the background
- **THEN** the machine no longer keeps a record for that pane
