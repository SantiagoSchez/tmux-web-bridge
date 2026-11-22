## MODIFIED Requirements

### Requirement: A change's task progress comes from its tasks file

A change's progress SHALL be the number of ticked checkboxes (`- [x]`, also with `X`) over all its checkboxes (ticked plus `- [ ]`) in its `tasks.md`, whatever their indentation. A change without `tasks.md`, or whose `tasks.md` has no checkbox, SHALL have no progress. Wherever the panel shows a progress, it SHALL write it as «<ticked>/<all> (<percentage> %)», the percentage being the share of ticked checkboxes rounded down, so that it reads «100 %» only when every checkbox is ticked.

#### Scenario: A change halfway

- **GIVEN** the change «show-progress» whose `tasks.md` has 7 lines `- [x]` and 16 lines `- [ ]`
- **WHEN** the panel reads it
- **THEN** its progress is 7 of 23, written «7/23 (30 %)»

#### Scenario: One task left

- **GIVEN** the change «show-progress» whose `tasks.md` has 119 lines `- [x]` and 1 line `- [ ]`
- **WHEN** the panel shows its progress
- **THEN** it writes «119/120 (99 %)»

#### Scenario: Every task ticked

- **GIVEN** the change «show-progress» whose `tasks.md` has 23 lines `- [x]` and none `- [ ]`
- **WHEN** the panel shows its progress
- **THEN** it writes «23/23 (100 %)»

#### Scenario: A change with only a proposal

- **GIVEN** the change «add-export» with `proposal.md` and no `tasks.md`
- **WHEN** the panel reads it
- **THEN** it has no progress

### Requirement: The changes are read apart from the poll and after each state change

The panel SHALL read the changes of the panes' folders together with their worktree and branch, apart from the poll of the windows, again at most every 15 seconds, and again as soon as a pane of the machine changes state. Reading them SHALL NOT run git commands beyond the ones that find each folder's repository.

#### Scenario: Claude finishes after ticking tasks

- **GIVEN** a window showing «☑ 6/23 (26 %)» for the change «show-progress», whose Claude ticks the seventh task and finishes
- **WHEN** the panel sees that pane change from 🔨 to ✅
- **THEN** it reads that folder again and the window shows «☑ 7/23 (30 %)» without waiting for the next 15-second reading

### Requirement: The list row shows one line per active change

In the detailed list, a window's row SHALL show, under its worktree or branch line, one line per active change of its active pane's folder: «☑», the progress «7/23 (30 %)» when it has one, «PR #74», «ronda 2/3» when a round was counted, and «1 bloqueante» or «N bloqueantes» when there are any, joined with « · ». A change with neither progress nor review state SHALL show its name. The compact list SHALL NOT show these lines.

#### Scenario: A window with one change under review

- **GIVEN** window 3 «feat/74-estado» of «Local · shop», whose active pane is in the worktree «feature-74-estado» with the change «show-progress» at 7 of 23 tasks, pull request 74, round 2 of 3 and 1 open blocker
- **WHEN** the detailed list shows it
- **THEN** its row shows «☑ 7/23 (30 %) · PR #74 · ronda 2/3 · 1 bloqueante» under the line of the worktree «feature-74-estado»

#### Scenario: Two changes and no review

- **GIVEN** a window whose active pane's folder has the change «add-export» with only a proposal and the change «fix-login» at 3 of 10 tasks, neither with a `review.json`
- **WHEN** the detailed list shows it
- **THEN** its row shows two lines, «☑ add-export» and then «☑ 3/10 (30 %)»

#### Scenario: The compact list

- **GIVEN** the same window of «Local · shop» with the change «show-progress»
- **WHEN** the compact list shows it
- **THEN** its row shows no change line

### Requirement: A pending card shows the same lines

A card of «Pendientes» SHALL show, under its state line, the same lines as the list row for the active changes of the folder of the pane the card is about.

#### Scenario: A finished pane halfway through its change

- **GIVEN** pane 1 of window «feat/74-estado» of «Local · shop», finished 2 minutes ago, in a folder with the change «show-progress» at 7 of 23 tasks, pull request 74 and round 2 of 3
- **WHEN** «Pendientes» shows its card
- **THEN** the card shows «Terminado hace 2 min» and, under it, «☑ 7/23 (30 %) · PR #74 · ronda 2/3»

### Requirement: The open window's header opens each change's tasks

The header of an open window SHALL show one button per active change with progress of the folder of the pane the window works on, labelled «☑» and its progress with its percentage, whose accessible name holds the change's name. Pressing it SHALL open that change's `tasks.md` in the file viewer.

#### Scenario: Opening the tasks from the header

- **GIVEN** window «feat/74-estado» of «Local · shop» open, working on a pane whose folder has the change «show-progress» at 7 of 23 tasks
- **WHEN** the owner presses the header's «☑ 7/23 (30 %)» button
- **THEN** the file viewer opens `openspec/changes/show-progress/tasks.md` of that repository, rendered as Markdown

#### Scenario: A change with only a proposal

- **GIVEN** an open window whose pane's folder has only the change «add-export», with no `tasks.md`
- **WHEN** its header shows
- **THEN** it shows no change button
