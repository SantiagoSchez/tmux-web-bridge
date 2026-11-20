## MODIFIED Requirements

### Requirement: A window's details show after the mouse rests on it

When the mouse rests 1 second on a window of the list of spaces and windows, the panel SHALL show a tooltip with that window's details next to it, inside the screen. Moving the mouse away before that second SHALL show nothing.

#### Scenario: The mouse rests on a window

- **GIVEN** the panel on a computer, with window 1 «feat/481-permitir-reintentar-subidas» of «Local · shop» cut with «…» in the list
- **WHEN** the owner rests the mouse on that window for 1 second
- **THEN** a tooltip shows next to it with the name «feat/481-permitir-reintentar-subidas» in full

#### Scenario: The mouse passes over a window

- **GIVEN** the panel on a computer
- **WHEN** the owner moves the mouse across window 1 «claude» of «Local · demo» and leaves it after half a second
- **THEN** no tooltip shows

#### Scenario: A window at the bottom of the screen

- **GIVEN** the panel on a computer, with window 5 «shell» of «Local · demo» as the last row of the list, at the bottom of the screen
- **WHEN** the owner rests the mouse on it for 1 second
- **THEN** the whole tooltip shows inside the screen, none of it cut by its edges

### Requirement: A window's details list the window and each of its panes

A window's tooltip SHALL show its full name, its state with its icon and how long it has had it when the panel knows, the machine's name when the panel shows several machines, and, for each pane, its command, its git worktree or else its branch, its folder in full and the Claude account it uses when it has one. Each detail SHALL be shown whole, never cut. A window with several panes SHALL mark its active pane.

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
- **THEN** it shows the name, `zsh` and the folder, and no state, branch, worktree or account line

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
- **WHEN** the owner rests the mouse on that row for 1 second
- **THEN** the tooltip shows «blog-personal-de-recetas» in full and the details of its window

#### Scenario: A space's header

- **GIVEN** the space «Local · shop-platform» with 5 windows, its name cut with «…» in its header
- **WHEN** the owner rests the mouse on the header for 1 second
- **THEN** the tooltip shows «shop-platform» and that it has 5 windows

#### Scenario: A pane of the folded list

- **GIVEN** the list folded on a wide screen, showing 🙋 for pane 2 of window 3 «api» of «Local · backend»
- **WHEN** the owner rests the mouse on that 🙋 for 1 second
- **THEN** the tooltip shows the details of window «api», with pane 2 marked
