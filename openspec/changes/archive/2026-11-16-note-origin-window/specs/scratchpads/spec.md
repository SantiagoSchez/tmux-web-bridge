# Spec Delta

## ADDED Requirements

### Requirement: A note remembers the window it was added in

A note added while the panel shows a window SHALL remember that window, and SHALL show below its text a line naming the machine, the session and the window (its index and name), such as «Local · demo · 1 claude». A note added outside a window, and a note saved before this capability existed, SHALL have no such line. Editing, pinning or pasting a note SHALL NOT change the window it remembers.

#### Scenario: Added in a window

- **GIVEN** the panel showing window 1 «claude» of session «demo» on machine «Local»
- **WHEN** the owner adds the note «Revisar el test de login»
- **THEN** the note shows «Local · demo · 1 claude» below its text, on every device

#### Scenario: Added outside a window

- **GIVEN** the panel on its home screen, with no window open
- **WHEN** the owner adds a note
- **THEN** the note has no window line

#### Scenario: Notes saved before

- **GIVEN** notes saved before this capability existed
- **WHEN** the panel shows them
- **THEN** they have no window line and keep their text and pin

#### Scenario: Editing keeps the window

- **GIVEN** a note added in window «Local · demo · 1 claude»
- **WHEN** the owner, now in another window, edits its text and pins it
- **THEN** the note still shows «Local · demo · 1 claude»

#### Scenario: A window the hub does not know

- **GIVEN** a request to add a note whose window the hub does not have, such as one closed meanwhile
- **WHEN** the hub receives it
- **THEN** the note is added without a window line

### Requirement: The window line opens its window

While the window a note remembers is open, in the session it was added in, its line SHALL show the window's and the session's current names and SHALL open that window when pressed; on a phone it SHALL also close the scratchpads drawer. Pasting SHALL keep typing the note into the window open now, whichever window the note remembers.

#### Scenario: Going back to the window

- **GIVEN** a note added in window «Local · demo · 1 claude», and the panel now showing another window
- **WHEN** the owner presses the note's window line
- **THEN** the panel opens window 1 «claude» of session «demo» on «Local»

#### Scenario: On a phone

- **GIVEN** the scratchpads drawer open on a phone
- **WHEN** the owner presses a note's window line
- **THEN** the drawer closes and that window opens

#### Scenario: Pasting goes to the window open now

- **GIVEN** a note added in window «Local · demo · 1 claude», and the panel showing window «Local · demo · 2 tests»
- **WHEN** the owner presses «Pegar» on that note
- **THEN** the note is typed into window 2 «tests»

#### Scenario: A renamed window

- **GIVEN** a note added in window 1 «claude», which was renamed «api» afterwards
- **WHEN** the panel shows the note
- **THEN** its line reads «Local · demo · 1 api»

#### Scenario: A renamed session

- **GIVEN** a note added in window «Local · demo · 1 claude», and session «demo» renamed «web» afterwards
- **WHEN** the panel shows the note
- **THEN** its line reads «Local · web · 1 claude» and still opens the window

### Requirement: A closed window stays named

When the window a note remembers is no longer open, or its machine is not answering, its line SHALL keep the machine, session and window names it had when the note was added, shown dimmed and without opening anything, and its tooltip SHALL say whether the window was closed or the machine is not answering.

#### Scenario: The window was closed

- **GIVEN** a note added in window «Local · demo · 1 claude», and that window closed afterwards
- **WHEN** the panel shows the note
- **THEN** its line still reads «Local · demo · 1 claude», dimmed, and pressing it does nothing

#### Scenario: The machine is not answering

- **GIVEN** a note added in a window of machine «Local», and «Local» not answering the hub
- **WHEN** the panel shows the note
- **THEN** its line reads as it was, dimmed, and its tooltip says the machine has no connection

#### Scenario: The machine's tmux restarted

- **GIVEN** a note added in window «Local · demo · 1 claude», and the machine's tmux server restarted since, with its sessions restored (as tmux-resurrect does)
- **WHEN** the panel shows the note
- **THEN** its line reads «Local · demo · 1 claude», dimmed, as a closed window, even where a restored window has the same session, number and name
