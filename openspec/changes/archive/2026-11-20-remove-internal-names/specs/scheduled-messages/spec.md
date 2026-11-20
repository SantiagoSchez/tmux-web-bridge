## MODIFIED Requirements

### Requirement: A scheduled message launches once at its time

When a scheduled message's date and time arrive, the hub SHALL launch its prompt once, as a task in a new window of its folder's space on its machine, with its options: a new worktree named after the message and its time, the worktree's base branch, and skipping permissions. The window takes the message's name, or the worktree's when it has one. The message then records that it launched, with its window.

#### Scenario: A message reaches its time

- **GIVEN** a scheduled message «Repasar tests» for Friday at 10:00 on machine `linux-box` and folder `twb`, with no worktree
- **WHEN** Friday 10:00 arrives
- **THEN** the hub opens one new window named «Repasar tests» in the space of `twb` on `linux-box` and launches Claude Code there with the prompt
- **AND** the message is recorded as launched, with that window
- **AND** the activity list shows the launch as coming from a scheduled message

#### Scenario: A message with a new worktree

- **GIVEN** a scheduled message «Limpieza» with a new worktree from base branch `master`, for 20/11 at 18:30
- **WHEN** it launches
- **THEN** Claude Code starts in a new worktree named `limpieza-20261120-1830` from `origin/master`

### Requirement: The panel shows the scheduled messages

The right panel SHALL show a «Programados» section above the scratchpads while there is any scheduled message, foldable, listing each message with when it launches, its machine and its folder: pending ones with ways to edit and cancel them; launched ones with their result, a way to open their window while it exists, and a way to remove them; failed ones with their error and a way to remove them.

#### Scenario: A pending message in the panel

- **GIVEN** a pending message «Repasar tests» for Friday 10:00 on `linux-box` › `twb`
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

- **WHEN** the owner presses the scheduling button next to machine `linux-box` in the sidebar
- **THEN** the form opens with `linux-box` as its machine
