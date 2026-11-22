## MODIFIED Requirements

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
