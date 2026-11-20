# push-notifications Specification

## Purpose

Defines when the hub sends a push notification for a pane's question, permission request or finished Claude Code turn, and when it holds one back because the owner is already looking at that pane.

## Requirements

### Requirement: Only a terminal showing the pane counts as looking at it

A machine SHALL report a notice as already seen only when a terminal attached to its tmux, other than the panel's web terminal, currently shows the notifying pane and the owner is in front of it: on macOS, Ghostty is visible; elsewhere, that terminal had input in the last 120 seconds. The web terminal never makes a notice count as seen; whether the web app shows the pane is the hub's decision.

#### Scenario: The web terminal is still connected after the owner locks the phone

- **GIVEN** a pane of a Linux machine is open only in the panel's web terminal
- **AND** the owner typed in it 60 seconds ago and then locked the phone
- **WHEN** Claude Code finishes its turn in that pane
- **THEN** the machine reports the notice as not seen
- **AND** the hub sends the push notification

#### Scenario: A terminal on the machine shows the pane and was just used

- **GIVEN** a terminal attached to a Linux machine's tmux shows the pane
- **AND** it had input 30 seconds ago
- **WHEN** Claude Code finishes its turn in that pane
- **THEN** the machine reports the notice as seen
- **AND** the hub sends no push notification

#### Scenario: A terminal on the machine shows another pane

- **GIVEN** a terminal attached to a Linux machine's tmux, with input 30 seconds ago, shows another window of the same session
- **WHEN** Claude Code finishes its turn in the pane
- **THEN** the machine reports the notice as not seen

#### Scenario: A terminal shows the pane but has been idle

- **GIVEN** a terminal attached to a Linux machine's tmux shows the pane
- **AND** its last input was 150 seconds ago
- **WHEN** Claude Code finishes its turn in that pane
- **THEN** the machine reports the notice as not seen

### Requirement: A finished pane keeps its mark unless a terminal shows it

When Claude Code finishes its turn in a pane, the pane SHALL show the finished mark (✅) unless a terminal attached to the machine's tmux, other than the panel's web terminal, currently shows that pane; in that case it shows the idle Claude mark (🤖).

#### Scenario: Finished while only the web terminal shows the pane

- **GIVEN** a pane is open only in the panel's web terminal
- **WHEN** Claude Code finishes its turn in that pane
- **THEN** the pane's window shows ✅

#### Scenario: Finished while a terminal on the machine shows the pane

- **GIVEN** a terminal attached to the machine's tmux shows the pane
- **WHEN** Claude Code finishes its turn in that pane
- **THEN** the pane's window shows 🤖

### Requirement: A notice the hub holds back leaves a log line

When the hub receives a notice from a machine and sends no push notification for it, it SHALL write one `[push]` log line that names the notice and the reason in Spanish: the machine is not one of the hub's machines, the machine reported it as seen, the pane is open in the web app, the web app is on screen at the device where the owner is working, or it is inside the quiet schedule.

#### Scenario: The machine reports the notice as seen

- **GIVEN** a machine reports a finished turn as seen
- **WHEN** the hub receives the notice
- **THEN** the hub sends no push notification
- **AND** its log has a `[push]` line saying it was not sent because it was already seen at the terminal

#### Scenario: The pane is open in the web app

- **GIVEN** the pane is open in a visible tab of the web app
- **WHEN** the hub receives a notice for that pane reported as not seen
- **THEN** the hub sends no push notification
- **AND** its log has a `[push]` line naming the pane's window and saying it is open in the web app

#### Scenario: The notice comes from a machine the hub does not have

- **GIVEN** a machine whose id is not among the hub's machines (renamed or removed from the panel) still has the notify token
- **WHEN** the hub receives a notice from it
- **THEN** the hub sends no push notification
- **AND** its log has a `[push]` line naming that machine id and saying it is not one of the panel's machines

#### Scenario: The notice arrives inside the quiet schedule

- **GIVEN** the quiet schedule is on and it is inside its window
- **WHEN** the hub receives a notice for a pane reported as not seen and not open in the web app
- **THEN** the hub sends no push notification
- **AND** its log has a `[push]` line naming the pane's window and saying it is inside the quiet schedule

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

### Requirement: The quiet window silences push notifications on its days

While the quiet schedule (`QuietHours` in the hub settings) is on, the hub SHALL send no push notification between its start and end time on each day it lists, in the hub's local time. A window whose end is earlier than its start crosses midnight and belongs to the day it starts on. The start minute is inside the window; the end minute is not.

#### Scenario: A turn ends inside a window that crosses midnight

- **GIVEN** the quiet schedule is on, from 22:00 to 08:00 on Fridays
- **AND** the pane is open only in the panel's web terminal
- **WHEN** Claude Code finishes its turn in that pane on Saturday at 03:00
- **THEN** the hub sends no push notification
- **AND** the pane's window shows ✅

#### Scenario: A turn ends just before the window starts

- **GIVEN** the quiet schedule is on, from 22:00 to 08:00 on Fridays
- **WHEN** Claude Code finishes its turn in a pane on Friday at 21:59, reported as not seen
- **THEN** the hub sends the push notification

#### Scenario: A turn ends at the window's end time

- **GIVEN** the quiet schedule is on, from 22:00 to 08:00 on Fridays
- **WHEN** Claude Code finishes its turn in a pane on Saturday at 08:00, reported as not seen
- **THEN** the hub sends the push notification

#### Scenario: The night after a day the window does not list

- **GIVEN** the quiet schedule is on, from 22:00 to 08:00 on Fridays only
- **WHEN** Claude Code asks a question in a pane on Sunday at 03:00, reported as not seen
- **THEN** the hub sends the push notification

#### Scenario: A window inside one day

- **GIVEN** the quiet schedule is on, from 14:00 to 16:00 on every day
- **WHEN** Claude Code asks for permission in a pane on Tuesday at 15:00, reported as not seen
- **THEN** the hub sends no push notification

### Requirement: A whole quiet day silences push notifications all day

While the quiet schedule is on, the hub SHALL send no push notification at any time, from 00:00 to 24:00 in the hub's local time, on each day the schedule lists as a whole quiet day, whatever the window says.

#### Scenario: A question on a whole quiet day

- **GIVEN** the quiet schedule is on, with Sunday as a whole quiet day and a window from 22:00 to 08:00 on weekdays
- **WHEN** Claude Code asks a question in a pane on Sunday at 15:00, reported as not seen
- **THEN** the hub sends no push notification

#### Scenario: The day after a whole quiet day

- **GIVEN** the quiet schedule is on, with Sunday as the only whole quiet day and no window day
- **WHEN** Claude Code finishes its turn in a pane on Monday at 00:30, reported as not seen
- **THEN** the hub sends the push notification

### Requirement: The quiet schedule covers every push except the test

The quiet schedule SHALL silence every push notification the hub sends: Claude Code's question, attention and finished-turn notices, and the notice that an automation could not launch. The test notification sent from «Enviar prueba» SHALL always be sent. Silencing a push does not change pane marks or the activity list.

#### Scenario: An automation fails during the quiet schedule

- **GIVEN** the quiet schedule is on and it is inside its window
- **WHEN** an automation cannot launch because its machine is not connected
- **THEN** the hub sends no push notification
- **AND** the activity list shows the automation's error

#### Scenario: The test notification during the quiet schedule

- **GIVEN** the quiet schedule is on and it is inside its window
- **WHEN** the owner presses «Enviar prueba» on a subscribed device
- **THEN** the hub sends the test notification to that device

### Requirement: Turning the quiet schedule off keeps it

The hub SHALL keep the quiet schedule's window, window days and whole quiet days while it is off, and SHALL send push notifications as if there were no schedule. Turning it on again SHALL use the same window and days.

#### Scenario: The schedule is off

- **GIVEN** the quiet schedule from 22:00 to 08:00 on every day is off
- **WHEN** Claude Code finishes its turn in a pane at 23:00, reported as not seen
- **THEN** the hub sends the push notification

#### Scenario: The schedule is turned on again

- **GIVEN** the quiet schedule from 22:00 to 08:00 on Fridays, with Sunday as a whole quiet day, was turned off
- **WHEN** the owner turns it on again
- **THEN** the schedule is from 22:00 to 08:00 on Fridays, with Sunday as a whole quiet day

### Requirement: A quiet window must start and end at different times

The hub SHALL refuse a quiet schedule whose window starts and ends at the same minute, or whose times or days are not valid, and SHALL keep the schedule it had. The settings screen SHALL say why it cannot be saved.

#### Scenario: A window from 08:00 to 08:00

- **GIVEN** the quiet schedule is from 22:00 to 08:00 on every day
- **WHEN** the owner sets the window from 08:00 to 08:00
- **THEN** the settings screen says the window cannot start and end at the same time
- **AND** the hub keeps the schedule from 22:00 to 08:00
