# change-progress Specification

## Purpose

Lets the owner tell, from the panel, how far each OpenSpec change of a window's repository has got and where its review stands, so a window that finished its change looks different from one that stopped halfway.

## Requirements

### Requirement: The active changes of a harness repository are found

For a pane whose folder is inside a git repository whose top folder has a harness configuration (`.claude/ka.json`, else `.claude/koalarnes.json`), the panel SHALL know the active OpenSpec changes of that top folder, up to 20: each folder under `openspec/changes/` except `archive/`, in name order. A folder whose name holds a tab or a line break SHALL be left out. A repository without a harness configuration SHALL have none.

#### Scenario: A worktree with one change

- **GIVEN** a pane in the worktree «feature-74-estado» of the repository «shop», which has `.claude/ka.json` and the folders `openspec/changes/show-progress/` and `openspec/changes/archive/`
- **WHEN** the panel reads that pane's folder
- **THEN** it knows one active change, «show-progress»

#### Scenario: Several changes in one worktree

- **GIVEN** a pane in a repository with `.claude/koalarnes.json` and the folders `openspec/changes/fix-login/` and `openspec/changes/add-export/`
- **WHEN** the panel reads that pane's folder
- **THEN** it knows two active changes, «add-export» first and «fix-login» second

#### Scenario: A repository without a harness configuration

- **GIVEN** a pane in a repository with `openspec/changes/add-export/` and neither `.claude/ka.json` nor `.claude/koalarnes.json`
- **WHEN** the panel reads that pane's folder
- **THEN** it knows no active change

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

### Requirement: A change's review state comes from its review registry, version 1 only

When a change has a `review.json` whose `version` is 1, the panel SHALL read from it the pull request number, the review round over the budget limit and the number of open blockers. The round is the counted rounds after the last budget reset over the budget's rounds plus the extensions granted since that reset. Open blockers are the findings of severity CRITICAL or REQUIRED in state `open`. A `review.json` of any other version, that does not parse, or larger than 64 KB SHALL contribute nothing.

#### Scenario: A change in its second review round

- **GIVEN** the change «show-progress» whose `review.json` has `version` 1, `pr` 74, a budget of 3 rounds with no extension or reset, 2 counted rounds, and one open REQUIRED finding, one fixed CRITICAL finding and one open SUGGESTION
- **WHEN** the panel reads it
- **THEN** its review state is pull request 74, round 2 of 3, 1 open blocker

#### Scenario: A budget reset and an extension

- **GIVEN** a `review.json` with `version` 1, a budget of 3 rounds, a reset after round 2, an extension granted after round 1 and another after round 3, and counted rounds 1, 2 and 3
- **WHEN** the panel reads it
- **THEN** its round is 1 of 4

#### Scenario: A registry of another version

- **GIVEN** the change «show-progress» whose `review.json` has `version` 2 and `pr` 74
- **WHEN** the panel reads it
- **THEN** it has no review state, and its task progress still shows

#### Scenario: A pull request with no review yet

- **GIVEN** a `review.json` with `version` 1, `pr` 74 and no round
- **WHEN** the panel reads it
- **THEN** its review state is pull request 74, with no round and no blocker

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

The header of an open window SHALL show one button per active change with progress of the folder of the pane the window works on, as many as fit its width (see «The open window's header fits its width»), labelled «☑» and its progress with its percentage, whose accessible name holds the change's name and its full progress. When the header is narrow, the button SHALL show only «☑» and the percentage. Pressing it SHALL open that change's `tasks.md` in the file viewer.

#### Scenario: Opening the tasks from the header

- **GIVEN** window «feat/74-estado» of «Local · shop» open, working on a pane whose folder has the change «show-progress» at 7 of 23 tasks
- **WHEN** the owner presses the header's «☑ 7/23 (30 %)» button
- **THEN** the file viewer opens `openspec/changes/show-progress/tasks.md` of that repository, rendered as Markdown

#### Scenario: A narrow header shows only the percentage

- **GIVEN** window «feat/74-estado» open on a phone, its header narrow, working on a pane whose folder has the change «show-progress» at 7 of 23 tasks
- **WHEN** its header shows
- **THEN** the change's button reads «☑ 30 %» and its accessible name still holds «show-progress» and «7/23 (30 %)»

#### Scenario: A change with only a proposal

- **GIVEN** an open window whose pane's folder has only the change «add-export», with no `tasks.md`
- **WHEN** its header shows
- **THEN** it shows no change button

### Requirement: The open window's header fits its width

The header of an open window SHALL never be wider than the room the page gives it, so the page is never wider than the screen. Of the parts the header has (a computer's has no back button), back, a minimum of the window's name, the folder button, the ± button and «⋯» SHALL always show. The change buttons SHALL give up their room first: one that does not fit whole cuts its text with «…», and one with no room left is not shown.

#### Scenario: A phone with a change and changed files

- **GIVEN** a phone 411 px wide showing window «feat/74-estado», whose pane's folder has the change «show-progress» at 116 of 121 tasks and changed files counted «+18,8k −1,5k»
- **WHEN** its header shows
- **THEN** back, part of the window's name, «☑ 95 %», the folder button, «+18,8k» over «−1,5k» and «⋯» all show inside the screen, and the page does not scroll sideways

#### Scenario: Two changes on a narrow phone

- **GIVEN** a phone 360 px wide showing a window whose pane's folder has two active changes with tasks and changed files
- **WHEN** its header shows
- **THEN** back, part of the window's name, the folder button, the ± button and «⋯» show inside the screen, the change buttons take the room left (a button cut with «…», or left out when no room is left), and the page does not scroll sideways

#### Scenario: A sheet over the window on a phone

- **GIVEN** the window of the first scenario open on that phone
- **WHEN** the owner opens «Ficheros cambiados» from the header
- **THEN** the sheet is as wide as the screen and none of its controls is cut on the right

### Requirement: A narrow window header shows the changed lines on two lines

When the header of an open window is narrow, its ± button SHALL show the lines added over the lines removed, on two lines; a wide header SHALL show them side by side on one line. Its accessible name SHALL not change.

#### Scenario: The changed lines on a phone

- **GIVEN** a phone 411 px wide showing a window whose repository has changed files counted «+18,8k −1,5k»
- **WHEN** its header shows
- **THEN** the ± button reads «+18,8k» over «−1,5k»

#### Scenario: A wide header keeps the long forms

- **GIVEN** a computer whose window view is 1000 px wide, showing a window whose pane's folder has the change «show-progress» at 116 of 121 tasks and changed files counted «+18,8k −1,5k»
- **WHEN** its header shows
- **THEN** the change's button reads «☑ 116/121 (95 %)» and the ± button reads «+18,8k −1,5k» on one line

### Requirement: The window menu opens each change's proposal

The ··· menu of a window SHALL hold one entry «Propuesta de <change>» per active change with a `proposal.md` of the folder of the pane it acts on, and choosing it SHALL open that `proposal.md` in the file viewer.

#### Scenario: Opening the proposal from the menu

- **GIVEN** window «feat/74-estado» of «Local · shop», whose pane's folder has the change «show-progress»
- **WHEN** the owner opens its ··· menu and chooses «Propuesta de show-progress»
- **THEN** the file viewer opens `openspec/changes/show-progress/proposal.md` of that repository, rendered as Markdown
