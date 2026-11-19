# Spec Delta

## ADDED Requirements

### Requirement: An end of turn that waits for background work sends no notice

When Claude Code ends its turn in a pane while it still has a background task other than a shell command (a subagent, a workflow, a monitor, a teammate, a cloud session or an MCP task) or a scheduled wakeup of the session, the machine SHALL send no notice to the hub and the pane SHALL keep the working mark (🔨). A background shell command alone does not hold the notice back.

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
