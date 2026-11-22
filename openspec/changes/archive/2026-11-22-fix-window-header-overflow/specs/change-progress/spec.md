## MODIFIED Requirements

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

## ADDED Requirements

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
