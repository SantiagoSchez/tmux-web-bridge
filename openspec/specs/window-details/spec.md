# window-details Specification

## Purpose

The details of a window, a space or a pending pane that the panel shows when the mouse rests on it, so the owner can read in full what the list cuts with «…».

## Requirements

### Requirement: A window's details show after the mouse rests on it

When the mouse rests 0.2 seconds on a window of the list of spaces and windows, the panel SHALL show a tooltip with that window's details next to it, inside the screen. Moving the mouse away before those 0.2 seconds SHALL show nothing.

#### Scenario: The mouse rests on a window

- **GIVEN** the panel on a computer, with window 1 «feat/481-permitir-reintentar-subidas» of «Local · shop» cut with «…» in the list
- **WHEN** the owner rests the mouse on that window for 0.2 seconds
- **THEN** a tooltip shows next to it with the name «feat/481-permitir-reintentar-subidas» in full

#### Scenario: The mouse passes over a window

- **GIVEN** the panel on a computer
- **WHEN** the owner moves the mouse across window 1 «claude» of «Local · demo» and leaves it after a tenth of a second
- **THEN** no tooltip shows

#### Scenario: A window at the bottom of the screen

- **GIVEN** the panel on a computer, with window 5 «shell» of «Local · demo» as the last row of the list, at the bottom of the screen
- **WHEN** the owner rests the mouse on it for 0.2 seconds
- **THEN** the whole tooltip shows inside the screen, none of it cut by its edges

### Requirement: A window's details list the window and each of its panes

A window's tooltip SHALL show its full name, its state with its icon and how long it has had it when the panel knows, the machine's name when the panel shows several machines, and, for each pane, its command, its git worktree or else its branch, its folder in full, the Claude account it uses when it has one, and each active OpenSpec change of its folder with its name, its progress with its percentage, its pull request, its review round and its open blockers when it has them. Each detail SHALL be shown whole, never cut. A window with several panes SHALL mark its active pane.

#### Scenario: A window with one Claude pane in a worktree

- **GIVEN** window 2 «feat/484-revisar» of «Local · shop», waiting on a question for 3 minutes, with one pane running `claude` in the worktree «feature-484-revisar-la-funcionalidad-de-busqueda», in the folder `~/Proyectos/shop/.claude/worktrees/feature-484-revisar-la-funcionalidad-de-busqueda`, with the Claude account `ana@example.com`
- **WHEN** its tooltip shows
- **THEN** it shows the name «feat/484-revisar», 🙋 with the state's name and «hace 3 min», `claude`, the worktree «feature-484-revisar-la-funcionalidad-de-busqueda», that folder and `ana@example.com`, each in full

#### Scenario: A window with two panes

- **GIVEN** window 3 «api» of «Local · backend» with two panes: the active one running `claude` on the branch «main», and another one running `zsh` in `~/Proyectos/backend/web`, outside any repository
- **WHEN** its tooltip shows
- **THEN** it lists both panes, the first marked as the active one with `claude` and the branch «main», and the second with `zsh` and `~/Proyectos/backend/web`

#### Scenario: A detail the panel does not have

- **GIVEN** window 1 «shell» of «Local · demo» with no state and one pane running `zsh` outside any repository, with no Claude account
- **WHEN** its tooltip shows
- **THEN** it shows the name, `zsh` and the folder, and no state, branch, worktree, account or change line

#### Scenario: A pane with an active change

- **GIVEN** window 3 «feat/74-estado» of «Local · shop» with one pane in a folder with the change «show-progress-of-openspec-changes» at 7 of 23 tasks, pull request 74, round 2 of 3 and 1 open blocker
- **WHEN** its tooltip shows
- **THEN** the pane's details show «show-progress-of-openspec-changes» in full, with «7/23 (30 %)», «PR #74», «ronda 2/3» and «1 bloqueante»

### Requirement: The details stay current while they show

While a tooltip shows, it SHALL reflect the latest state the panel has of what it describes, and it SHALL close when that window, space or pane is no longer there.

#### Scenario: The state changes while the tooltip shows

- **GIVEN** the tooltip of window 1 «claude» of «Local · demo» showing 🔨
- **WHEN** Claude in that window finishes and the panel receives the new state
- **THEN** the tooltip shows ✅ without the owner moving the mouse

#### Scenario: The window closes while the tooltip shows

- **GIVEN** the tooltip of window 4 «bug/464» of «Local · shop» showing
- **WHEN** that window is closed from the machine
- **THEN** the tooltip closes

### Requirement: A space's and a pending pane's details

The same delay SHALL show a tooltip on the other places of the list that cut text: on a space with a single window, the details of that window under the space's full name; on a space's header, the space's full name and its number of windows; on a pane button of the folded list, the details of that pane's window, marking that pane.

#### Scenario: A space with a single window

- **GIVEN** the space «Local · blog-personal-de-recetas», with a single window, shown as one row
- **WHEN** the owner rests the mouse on that row for 0.2 seconds
- **THEN** the tooltip shows «blog-personal-de-recetas» in full and the details of its window

#### Scenario: A space's header

- **GIVEN** the space «Local · shop-platform» with 5 windows, its name cut with «…» in its header
- **WHEN** the owner rests the mouse on the header for 0.2 seconds
- **THEN** the tooltip shows «shop-platform» and that it has 5 windows

#### Scenario: A pane of the folded list

- **GIVEN** the list folded on a wide screen, showing 🙋 for pane 2 of window 3 «api» of «Local · backend»
- **WHEN** the owner rests the mouse on that 🙋 for 0.2 seconds
- **THEN** the tooltip shows the details of window «api», with pane 2 marked

### Requirement: The tooltip replaces the native title of what it covers

The places that show the tooltip SHALL NOT also show the browser's own tooltip: the window's second line (worktree, branch or folder), a space header's fold button and the folded list's pane buttons SHALL lose their native title. Their accessible names SHALL stay as they are.

#### Scenario: The mouse on a window's branch

- **GIVEN** the panel on a computer, with window 1 «claude» of «Local · demo» on the branch «main»
- **WHEN** the owner rests the mouse on the branch of that window's second line
- **THEN** only the panel's tooltip shows, not the browser's

### Requirement: The tooltip shows only with a mouse and closes on any other action

The tooltip SHALL show only on a device whose main pointer is a mouse or a trackpad. It SHALL close when the mouse leaves what it describes, on a click or a tap anywhere, on Escape, and when the list or the page scrolls or resizes. A click on what it describes SHALL still do what it does today.

#### Scenario: A touch screen

- **GIVEN** the panel on a phone
- **WHEN** the owner touches and holds window 1 «claude» of «Local · demo»
- **THEN** no tooltip shows

#### Scenario: The mouse leaves

- **GIVEN** the tooltip of window 1 «claude» of «Local · demo» showing
- **WHEN** the owner moves the mouse off that window
- **THEN** the tooltip closes

#### Scenario: A click on the window

- **GIVEN** the tooltip of window 2 «shell» of «Local · demo» showing
- **WHEN** the owner clicks that window
- **THEN** the tooltip closes and the panel opens window 2 «shell»

#### Scenario: The list scrolls

- **GIVEN** the tooltip of window 1 «claude» of «Local · demo» showing
- **WHEN** the owner scrolls the list with the wheel
- **THEN** the tooltip closes
