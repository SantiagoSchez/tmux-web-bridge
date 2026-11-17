## MODIFIED Requirements

### Requirement: The pane's project decides the repository

The panel SHALL take the repository of a reference from the harness configuration of the project of the pane the reference is written in (`platform.host` and `platform.repository`) and, when the project has none or it names no repository, from the `origin` remote of the pane's folder. The harness configuration is `.claude/ka.json` or, when that file does not exist, `.claude/koalarnes.json`. The panel SHALL NOT underline a repository reference it cannot resolve.

#### Scenario: ka.json wins over the remote

- **GIVEN** a pane whose project's `.claude/ka.json` names the GitHub repository `owner/repo` and whose `origin` points elsewhere
- **WHEN** the user taps `PR #5`
- **THEN** the page opened is `https://github.com/owner/repo/pull/5`

#### Scenario: koalarnes.json wins over the remote

- **GIVEN** a pane whose project has no `.claude/ka.json` and whose `.claude/koalarnes.json` names the GitHub repository `owner/repo`, and whose `origin` points elsewhere
- **WHEN** the user taps `PR #5`
- **THEN** the page opened is `https://github.com/owner/repo/pull/5`

#### Scenario: ka.json wins over koalarnes.json

- **GIVEN** a pane whose project's `.claude/ka.json` names the GitHub repository `owner/new` and whose `.claude/koalarnes.json` names `owner/old`
- **WHEN** the user taps `PR #5`
- **THEN** the page opened is `https://github.com/owner/new/pull/5`

#### Scenario: Fallback to the origin remote

- **GIVEN** a pane in a repository without `.claude/ka.json` or `.claude/koalarnes.json` whose `origin` is `git@bitbucket.org:workspace/repo.git`
- **WHEN** the user taps `PR #7`
- **THEN** the page opened is `https://bitbucket.org/workspace/repo/pull-requests/7`

#### Scenario: Pane outside a known repository

- **GIVEN** a pane whose folder is not a git repository, or whose `origin` is neither GitHub nor Bitbucket, and has no harness configuration
- **WHEN** the terminal shows `PR #7`
- **THEN** the text is not underlined

#### Scenario: Reference in the other pane of a split window

- **GIVEN** a window split into a pane in the GitHub repository `owner/one` and a selected pane in the GitHub repository `owner/two`
- **WHEN** the user taps `PR #5` written in the `owner/one` pane
- **THEN** the page opened is `https://github.com/owner/one/pull/5`

#### Scenario: Project read more than five minutes ago

- **GIVEN** a terminal that has stayed open on the same pane for more than five minutes since its project was read
- **WHEN** the user taps `PR #5`
- **THEN** the page opens at the first tap

### Requirement: Trello references open the card

The terminal SHALL link `Trello #N` to the card whose short number is N on the board named by `tracker.board` in the pane project's harness configuration (`.claude/ka.json`, else `.claude/koalarnes.json`), opening the card's page in a new tab. Without that board the text SHALL NOT be underlined.

#### Scenario: Card on the project's board

- **GIVEN** a pane whose project's `.claude/ka.json` has `tracker.board` set to a board that holds card number 470
- **AND** a Trello account configured in Ajustes › Trello
- **WHEN** the user taps `Trello #470`
- **THEN** a new tab opens that card's Trello page

#### Scenario: Board of a project still on koalarnes.json

- **GIVEN** a pane whose project has no `.claude/ka.json` and whose `.claude/koalarnes.json` has `tracker.board` set to a board that holds card number 470
- **AND** a Trello account configured in Ajustes › Trello
- **WHEN** the user taps `Trello #470`
- **THEN** a new tab opens that card's Trello page

#### Scenario: Project without a board

- **GIVEN** a pane whose project has no harness configuration, or one without `tracker.board`
- **WHEN** the terminal shows `Trello #470`
- **THEN** the text is not underlined

#### Scenario: No card with that number

- **GIVEN** a pane whose project names a board that has no card number 9999
- **WHEN** the user taps `Trello #9999`
- **THEN** the opened tab closes and the panel shows an error toast saying the card was not found

#### Scenario: Trello account missing or rejected

- **GIVEN** no Trello account in Ajustes › Trello, or one Trello rejects
- **WHEN** the user taps `Trello #470`
- **THEN** the opened tab closes and the panel shows an error toast that points to Ajustes › Trello

#### Scenario: Browser blocks the new tab

- **GIVEN** a browser that blocks the tab the panel opens
- **WHEN** the user taps `Trello #470`
- **THEN** the panel shows an error toast saying the browser blocked the tab
