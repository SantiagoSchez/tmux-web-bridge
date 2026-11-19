# scheduled-messages Specification

## Purpose

Lets the owner schedule a prompt for the hub to launch once, at a chosen date and time, on a folder of a machine, so the limit left at the end of the week can be spent without being there to launch it.

## Requirements

### Requirement: A scheduled message launches once at its time

When a scheduled message's date and time arrive, the hub SHALL launch its prompt once, as a task in a new window of its folder's space on its machine, with its options: a new worktree named after the message and its time, the worktree's base branch, and skipping permissions. The window takes the message's name, or the worktree's when it has one. The message then records that it launched, with its window.

#### Scenario: A message reaches its time

- **GIVEN** a scheduled message «Repasar tests» for Friday at 10:00 on machine `drangleic` and folder `twb`, with no worktree
- **WHEN** Friday 10:00 arrives
- **THEN** the hub opens one new window named «Repasar tests» in the space of `twb` on `drangleic` and launches Claude Code there with the prompt
- **AND** the message is recorded as launched, with that window
- **AND** the activity list shows the launch as coming from a scheduled message

#### Scenario: A message with a new worktree

- **GIVEN** a scheduled message «Limpieza» with a new worktree from base branch `master`, for 20/11 at 18:30
- **WHEN** it launches
- **THEN** Claude Code starts in a new worktree named `limpieza-20261120-1830` from `origin/master`

### Requirement: A pending message can be edited or cancelled

The owner SHALL be able to change any field of a message that has not launched yet, or cancel it, and the hub SHALL launch it at its new time with its new fields, or not at all. A message that already launched or failed SHALL NOT be edited.

#### Scenario: Moving a pending message

- **GIVEN** a pending message for Friday at 10:00
- **WHEN** the owner changes it to Friday at 12:00
- **THEN** nothing launches at 10:00 and the message launches at 12:00

#### Scenario: Cancelling a pending message

- **GIVEN** a pending message for Friday at 10:00
- **WHEN** the owner cancels it
- **THEN** it leaves the list and nothing launches at 10:00

#### Scenario: Editing a launched message

- **GIVEN** a message that already launched
- **WHEN** the owner tries to edit it
- **THEN** the hub refuses, saying it has already launched

### Requirement: A scheduled message is checked when saved

The hub SHALL refuse to save a message without a name, a machine the panel has, a folder of that machine's folders or a prompt, with a time that is not in the future, with an invalid base branch, or beyond the maximum number of messages, and SHALL say why in Spanish.

#### Scenario: A time in the past

- **GIVEN** it is Friday 10:00
- **WHEN** the owner saves a message for Friday 09:00
- **THEN** the hub refuses it, saying the time has already passed

#### Scenario: A folder the machine does not have

- **WHEN** the owner saves a message for a folder that is not among the machine's folders
- **THEN** the hub refuses it, saying the folder is not one of the machine's

### Requirement: The form suggests times from the machine's account limits

The form SHALL offer, from the latest reading of the limits of the Claude account the machine uses, the times 1 day, 12 hours and 3 hours before the weekly limit resets and the time the 5-hour limit resets, only those still in the future. Picking one SHALL only fill the date and time. With no known account or reset, the form offers no suggestion and the date and time are typed.

#### Scenario: Suggestions on a Tuesday

- **GIVEN** the machine uses account s2, whose weekly limit resets on Thursday at 12:00 and whose 5-hour limit resets today at 15:40
- **WHEN** the owner opens the form on Tuesday at 11:00
- **THEN** it suggests Wednesday 12:00, Thursday 00:00, Thursday 09:00 and today 15:40

#### Scenario: A suggestion that has passed

- **GIVEN** the weekly limit resets in 2 hours
- **WHEN** the owner opens the form
- **THEN** it does not suggest 1 day, 12 hours or 3 hours before the weekly reset

#### Scenario: A machine with no known account

- **GIVEN** the hub knows no Claude account for the machine
- **WHEN** the owner opens the form
- **THEN** it suggests no time, and the date and time can be typed

#### Scenario: The reset changes after saving

- **GIVEN** a message saved from the suggestion 1 day before the weekly reset, for Wednesday 12:00
- **WHEN** the machine switches to an account whose weekly limit resets on Friday
- **THEN** the message still launches on Wednesday at 12:00

### Requirement: A message missed while the hub was stopped launches when it starts

When the hub starts and a pending message's time has passed, it SHALL launch the message on its first check, within 20 seconds of starting, and record in its result that it launched late and the time it was due.

#### Scenario: The hub was stopped at the message's time

- **GIVEN** a pending message for 10:00 and the hub stopped from 09:50 to 11:30
- **WHEN** the hub starts at 11:30
- **THEN** it launches the message within 20 seconds
- **AND** its result says it launched late and was due at 10:00

### Requirement: A message launches whatever the account's limits

The hub SHALL launch a scheduled message at its time even when the machine's Claude account has spent its weekly or 5-hour limit.

#### Scenario: The weekly limit is spent

- **GIVEN** the machine's account has used 100% of its weekly limit
- **WHEN** a scheduled message's time arrives
- **THEN** the hub launches it

### Requirement: A message that cannot launch says so

When a scheduled message cannot launch (its machine is not connected or no longer in the panel, its folder is gone, the launch fails), the hub SHALL record the error in the message's result, add it to the activity list, and send a push notification saying the scheduled message could not launch, unless the quiet schedule holds it back.

#### Scenario: The machine is not connected

- **GIVEN** a scheduled message on machine `mac`, which is not connected
- **WHEN** its time arrives
- **THEN** the message's result is an error saying `mac` is not connected
- **AND** the activity list shows the error
- **AND** the hub sends a push notification saying the scheduled message could not launch

### Requirement: A message is never launched twice

The hub SHALL record that a message is launching before it launches it. A message found launching when the hub starts, because the hub stopped in the middle, SHALL be recorded as an error and not launched again.

#### Scenario: The hub stops in the middle of a launch

- **GIVEN** the hub stopped while it was launching a scheduled message
- **WHEN** the hub starts again
- **THEN** it does not launch that message again
- **AND** the message's result is an error saying the hub restarted while launching it

#### Scenario: A slow launch

- **GIVEN** a scheduled message whose launch takes longer than the hub's check interval
- **WHEN** the next check runs while it is still launching
- **THEN** the hub does not start a second launch

### Requirement: Results stay for 7 days

A message that launched or failed SHALL stay in the list, with its result, for 7 days after it ran, and SHALL then leave it on its own. The owner SHALL be able to remove it before.

#### Scenario: A result a week old

- **GIVEN** a message that launched 7 days and 1 hour ago
- **WHEN** the hub next checks its messages
- **THEN** the message is no longer in the list

#### Scenario: Removing a result

- **GIVEN** a message that launched an hour ago
- **WHEN** the owner removes it
- **THEN** it leaves the list

### Requirement: The panel shows the scheduled messages

The right panel SHALL show a «Programados» section above the scratchpads while there is any scheduled message, foldable, listing each message with when it launches, its machine and its folder: pending ones with ways to edit and cancel them; launched ones with their result, a way to open their window while it exists, and a way to remove them; failed ones with their error and a way to remove them.

#### Scenario: A pending message in the panel

- **GIVEN** a pending message «Repasar tests» for Friday 10:00 on `drangleic` › `twb`
- **WHEN** the owner looks at the right panel
- **THEN** the «Programados» section shows it with its time, machine and folder, and ways to edit and cancel it

#### Scenario: No scheduled message

- **GIVEN** there is no scheduled message
- **WHEN** the owner looks at the right panel
- **THEN** there is no «Programados» section

#### Scenario: Opening the window of a launched message

- **GIVEN** a message launched an hour ago whose window is still open
- **WHEN** the owner chooses to open its window
- **THEN** the panel opens that window

### Requirement: Each machine in the sidebar opens the scheduling form

Each machine in the sidebar SHALL have a button, next to the one that opens a new space, that opens the scheduling form with that machine chosen.

#### Scenario: The sidebar button

- **WHEN** the owner presses the scheduling button next to machine `drangleic` in the sidebar
- **THEN** the form opens with `drangleic` as its machine
