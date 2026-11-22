# Spec Delta

## ADDED Requirements

### Requirement: Hyperlinks to files open in the file viewer

A hyperlink a program writes in the terminal (OSC 8, whose visible text may differ from its target) SHALL open in the panel's file viewer when its target is a file of the machine (`file://`, `/…`, `~/…` or a relative path), resolved like a file path link of the pane it is written in. A web target (`http:`, `https:`) SHALL keep opening in a new tab; any other scheme SHALL open nothing.

#### Scenario: Markdown link with an absolute target

- **GIVEN** a pane running Claude Code that shows the link `INDICE.md` whose target is `/home/me/tests/INDICE.md`
- **WHEN** the user taps `INDICE.md`
- **THEN** the file viewer opens `/home/me/tests/INDICE.md`
- **AND** no new tab opens

#### Scenario: file:// target

- **GIVEN** a hyperlink whose target is `file:///home/me/tests/f111%20actual.png`
- **WHEN** the user taps it
- **THEN** the file viewer opens `/home/me/tests/f111 actual.png`

#### Scenario: Relative target in a split window

- **GIVEN** a window split into two panes whose folders both hold `docs/notes.md`, with the right pane selected
- **WHEN** the user taps a hyperlink whose target is `docs/notes.md`, written in the left pane
- **THEN** the file viewer opens the left pane's `docs/notes.md`

#### Scenario: Link broken across rows

- **GIVEN** a hyperlink inside a table cell whose text `f111_actual` wraps onto two rows
- **WHEN** the user taps its second row
- **THEN** the file viewer opens the hyperlink's target

#### Scenario: Web target

- **WHEN** the user taps a hyperlink whose target is `https://example.com/docs`
- **THEN** a new tab opens `https://example.com/docs`

#### Scenario: Hyperlink to a heading of a file

- **GIVEN** a hyperlink whose target is `/home/me/docs/README.md#instalacion`
- **WHEN** the user taps it
- **THEN** the file viewer opens `/home/me/docs/README.md`

#### Scenario: A target of another scheme

- **WHEN** the user taps a hyperlink whose target is `javascript:alert(1)`
- **THEN** nothing opens and nothing runs

#### Scenario: Hyperlink to a folder

- **GIVEN** a hyperlink whose target is `/home/me/tests/frames/`
- **WHEN** the user taps it
- **THEN** the file explorer opens in `/home/me/tests/frames`

### Requirement: Folder paths are links

The terminal SHALL link a folder path: a path that ends with `/`, optionally followed by `:` or sentence punctuation, absolute (`/…`), under the home folder (`~/…`) or relative (`docs/`). A folder path broken across rows at the terminal's edge SHALL be one link. A lone `/` or `~/` SHALL NOT be linked.

#### Scenario: Folder path before a colon

- **WHEN** the terminal shows `Están en ~/Downloads/tests/render-crf20/:`
- **THEN** `~/Downloads/tests/render-crf20/` is underlined, without the colon

#### Scenario: Bare folder name

- **WHEN** the terminal shows `- fotogramas/: las parejas de fotogramas.`
- **THEN** `fotogramas/` is underlined

#### Scenario: Folder path broken at the edge

- **GIVEN** a row that ends with `~/Downloads/tests/videos/render` at the terminal's edge and a next row that starts with `-crf20/:`
- **WHEN** the user taps either piece
- **THEN** the file explorer opens in `~/Downloads/tests/videos/render-crf20`

#### Scenario: Root and home alone

- **WHEN** the terminal shows `cd /` or `cd ~/`
- **THEN** neither `/` nor `~/` is underlined

#### Scenario: URL

- **WHEN** the terminal shows `https://example.com/docs/`
- **THEN** it opens as a web link, not as a folder

### Requirement: Claude Code is asked for paths as links

On a machine with the host kit, every Claude Code session that starts, resumes or compacts inside a tmux pane SHALL receive an instruction to write each file or folder path in its replies in the terminal as a Markdown link whose target is the absolute path. The instruction SHALL say it does not apply to what Claude writes into files, commit messages, pull requests, issues, comments or tracker cards. A session outside tmux SHALL NOT receive it.

#### Scenario: New session in tmux

- **GIVEN** a machine whose kit is up to date
- **WHEN** Claude Code starts in a tmux pane
- **THEN** its session context holds the instruction to write paths as Markdown links with absolute targets

#### Scenario: Text Claude publishes keeps its own paths

- **GIVEN** a Claude Code session in a tmux pane that opens a pull request
- **WHEN** it reads its session context
- **THEN** the instruction says the links are only for its replies in the terminal, not for pull requests, commits, issues, comments, tracker cards or files

#### Scenario: Session after compacting

- **GIVEN** a Claude Code session in a tmux pane that compacts its conversation
- **WHEN** the session goes on
- **THEN** its context still holds the instruction

#### Scenario: Session outside tmux

- **WHEN** Claude Code starts in a terminal that is not a tmux pane
- **THEN** its session context does not hold the instruction
