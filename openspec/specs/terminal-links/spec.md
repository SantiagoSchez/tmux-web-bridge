# terminal-links Specification

## Purpose

Defines which text of the panel's terminal becomes a link, where each kind of link leads, and when the panel does not offer a link, so references an agent writes can be opened with one click or tap.

## Requirements

### Requirement: Repository references open their page

The terminal SHALL link `PR #N` and `Issue #N`, and on Bitbucket `pipeline #N`, to that pull request, issue or Pipelines run of the pane's repository. The keyword matches in any letter case and needs a word boundary before it. A click or tap opens the page in a new tab.

#### Scenario: Pull request on GitHub

- **GIVEN** a pane whose project is the GitHub repository `owner/repo`
- **WHEN** the terminal shows `PR #123` and the user taps it
- **THEN** a new tab opens `https://github.com/owner/repo/pull/123`

#### Scenario: Issue on GitHub

- **GIVEN** a pane whose project is the GitHub repository `owner/repo`
- **WHEN** the terminal shows `Issue #42` and the user clicks it
- **THEN** a new tab opens `https://github.com/owner/repo/issues/42`

#### Scenario: Pull request on Bitbucket

- **GIVEN** a pane whose project is the Bitbucket repository `workspace/repo`
- **WHEN** the terminal shows `PR #332` and the user taps it
- **THEN** a new tab opens `https://bitbucket.org/workspace/repo/pull-requests/332`

#### Scenario: Pipeline on Bitbucket

- **GIVEN** a pane whose project is the Bitbucket repository `workspace/repo`
- **WHEN** the terminal shows `pipeline #1987` and the user taps it
- **THEN** a new tab opens `https://bitbucket.org/workspace/repo/pipelines/results/1987`

#### Scenario: Pipeline on GitHub is not linked

- **GIVEN** a pane whose project is a GitHub repository
- **WHEN** the terminal shows `pipeline #1987`
- **THEN** the text is not underlined and a tap on it does not open anything

#### Scenario: Keyword inside another word

- **WHEN** the terminal shows `SPR #12` or `reissue #3`
- **THEN** neither is linked

### Requirement: The pane's project decides the repository

The panel SHALL take the repository of a reference from the `.claude/koalarnes.json` of the project of the pane the reference is written in (`platform.host` and `platform.repository`) and, when that file is missing or names no repository, from the `origin` remote of the pane's folder. The panel SHALL NOT underline a repository reference it cannot resolve.

#### Scenario: koalarnes.json wins over the remote

- **GIVEN** a pane whose project's `.claude/koalarnes.json` names the GitHub repository `owner/repo` and whose `origin` points elsewhere
- **WHEN** the user taps `PR #5`
- **THEN** the page opened is `https://github.com/owner/repo/pull/5`

#### Scenario: Fallback to the origin remote

- **GIVEN** a pane in a repository without `.claude/koalarnes.json` whose `origin` is `git@bitbucket.org:workspace/repo.git`
- **WHEN** the user taps `PR #7`
- **THEN** the page opened is `https://bitbucket.org/workspace/repo/pull-requests/7`

#### Scenario: Pane outside a known repository

- **GIVEN** a pane whose folder is not a git repository, or whose `origin` is neither GitHub nor Bitbucket, and has no `.claude/koalarnes.json`
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

The terminal SHALL link `Trello #N` to the card whose short number is N on the board named by `tracker.board` in the pane project's `.claude/koalarnes.json`, opening the card's page in a new tab. Without that board the text SHALL NOT be underlined.

#### Scenario: Card on the project's board

- **GIVEN** a pane whose project's `.claude/koalarnes.json` has `tracker.board` set to a board that holds card number 470
- **AND** a Trello account configured in Ajustes › Trello
- **WHEN** the user taps `Trello #470`
- **THEN** a new tab opens that card's Trello page

#### Scenario: Project without a board

- **GIVEN** a pane whose project has no `.claude/koalarnes.json`, or one without `tracker.board`
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

### Requirement: File paths open from the pane they are written in

The terminal SHALL look a relative file-path link up first in the folder of the pane the path is written in, both to open it and to show its preview; the other panes' folders and their repositories come after, as for any file link. In a split window that pane is the one under the link, not the selected pane.

#### Scenario: Relative path in the other pane of a split window

- **GIVEN** a window split into two panes whose folders both hold a `docs/notes.md`, with the right pane selected
- **WHEN** the user taps `docs/notes.md` written in the left pane
- **THEN** the viewer opens the left pane's `docs/notes.md`

#### Scenario: Preview of the same path in each pane

- **GIVEN** a window split into two panes whose folders both hold a `docs/notes.md`, and a desktop browser with a mouse
- **WHEN** the mouse rests on `docs/notes.md` in the left pane and then on `docs/notes.md` in the right pane
- **THEN** each preview shows the file of its own pane

### Requirement: Image placeholders open the pasted image

The terminal SHALL link `[Image #N]` to image N of the Claude Code session running in the pane the placeholder is written in, as Claude Code saved it when it was pasted, sent or not, and open it in the panel's file viewer. With a mouse, resting on the link SHALL show the same preview as a file path. When the image cannot be found, the panel SHALL show an error toast and open nothing.

#### Scenario: Image pasted and not sent yet

- **GIVEN** a pane running Claude Code whose prompt shows `[Image #3]` for a screenshot just uploaded from the panel
- **WHEN** the user taps `[Image #3]` before sending the message
- **THEN** the panel's file viewer opens that screenshot

#### Scenario: Image already sent

- **GIVEN** a pane running Claude Code whose session has sent a message with `[Image #2]`
- **WHEN** the user taps `[Image #2]` in the terminal
- **THEN** the panel's file viewer opens that image

#### Scenario: Hover preview on desktop

- **GIVEN** a desktop browser with a mouse and `[Image #1]` in the terminal
- **WHEN** the mouse rests on `[Image #1]`
- **THEN** the panel shows the same preview it shows for an image path

#### Scenario: Number reused in the same session

- **GIVEN** a session where image number 1 was pasted, and later, after Claude Code restarted its numbering, another image number 1 was pasted
- **WHEN** the user taps `[Image #1]`
- **THEN** the viewer opens the later image

#### Scenario: Image not found

- **GIVEN** a pane whose Claude Code session has no saved image number 4, for example because the machine emptied its temporary folder
- **WHEN** the user taps `[Image #4]`
- **THEN** the panel shows an error toast saying it cannot find image 4 and opens nothing

#### Scenario: Image in the other pane of a split window

- **GIVEN** a window split into two panes, each running its own Claude Code session with an image number 1
- **WHEN** the user taps `[Image #1]` written in the pane that is not selected
- **THEN** the viewer opens image 1 of that pane's session

#### Scenario: Pane without a Claude Code session

- **GIVEN** a pane where the host kit has not recorded a Claude Code session
- **WHEN** the user taps `[Image #1]`
- **THEN** the panel shows an error toast saying it cannot find image 1
