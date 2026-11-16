# Spec Delta

## Purpose

Three coloured scratchpads where the owner jots down short notes to tell Claude later, shared by every device, and from which a note goes into a pane with one click.

## ADDED Requirements

### Requirement: Three scratchpads shared by every device

The panel SHALL offer three scratchpads, told apart by a fixed colour each (blue, green and orange) and with no name. The hub SHALL keep their notes, so that every device shows the same notes, a change made on one device SHALL appear on every other open device without reloading, and the notes SHALL survive a restart of the hub.

#### Scenario: A note appears on another device

- **GIVEN** the panel open on the Mac and on the phone
- **WHEN** the owner adds a note to the green scratchpad on the Mac
- **THEN** the phone shows that note in its green scratchpad without reloading

#### Scenario: Notes survive a restart

- **GIVEN** a note in the blue scratchpad
- **WHEN** the hub restarts and the panel reconnects
- **THEN** the blue scratchpad still holds that note

#### Scenario: Switching scratchpads

- **GIVEN** the blue scratchpad shown
- **WHEN** the owner clicks the orange colour
- **THEN** the orange scratchpad's notes are shown instead

### Requirement: Adding a note

Each scratchpad SHALL have a field at its foot that adds a plain-text note: Enter SHALL save it and Shift+Enter SHALL insert a new line. A new note SHALL be unpinned and go after the existing ones. The field SHALL show how many notes the scratchpad holds out of 10. Text that is empty or only whitespace SHALL add nothing.

#### Scenario: Enter adds the note

- **GIVEN** the green scratchpad with 3 notes
- **WHEN** the owner types «Revisar el test de login» in its field and presses Enter
- **THEN** the note is added last, unpinned, the field empties and the count reads 4/10

#### Scenario: Shift+Enter keeps writing

- **GIVEN** text typed in the field
- **WHEN** the owner presses Shift+Enter
- **THEN** a new line is inserted and no note is added yet

#### Scenario: Empty text

- **GIVEN** the field holding only spaces
- **WHEN** the owner presses Enter
- **THEN** no note is added

### Requirement: A scratchpad holds at most 10 notes

A scratchpad SHALL hold at most 10 notes, and a note SHALL hold at most 4000 characters. The hub SHALL refuse a note beyond either limit with a message saying why, and the panel SHALL not let the owner add an eleventh note.

#### Scenario: Full scratchpad

- **GIVEN** the orange scratchpad with 10 notes
- **WHEN** the owner looks at its field
- **THEN** the field is disabled and says the scratchpad is full

#### Scenario: Two devices fill the last place

- **GIVEN** a scratchpad with 9 notes open on two devices
- **WHEN** both add a note at the same time
- **THEN** one note is added and the other device shows an error saying the scratchpad is full

#### Scenario: Note too long

- **GIVEN** a text of 5000 characters
- **WHEN** the owner tries to save it as a note
- **THEN** the hub refuses it and the panel says notes hold at most 4000 characters

### Requirement: Editing a note

A click on a note's text SHALL open it for editing in place. Enter or leaving the note SHALL save the new text, Shift+Enter SHALL insert a new line and Escape SHALL cancel. Saving an empty text SHALL delete the note.

#### Scenario: Editing in place

- **GIVEN** the note «Preguntar por la migración»
- **WHEN** the owner clicks its text, changes it to «Preguntar por la migración de usuarios» and presses Enter
- **THEN** the note holds the new text on every device

#### Scenario: Escape cancels

- **GIVEN** a note being edited with changed text
- **WHEN** the owner presses Escape
- **THEN** the note keeps its previous text

#### Scenario: Emptying deletes

- **GIVEN** a note being edited
- **WHEN** the owner deletes all its text and presses Enter
- **THEN** the note is removed

### Requirement: Pinning a note

Each note SHALL have a pin button. A pinned note SHALL stay in its scratchpad when pasted; pressing the button again SHALL unpin it. The note SHALL show whether it is pinned.

#### Scenario: Pin and unpin

- **GIVEN** an unpinned note
- **WHEN** the owner presses its pin button twice
- **THEN** the note is pinned after the first press and unpinned after the second, on every device

### Requirement: Deleting a note

Each note SHALL have a delete button that removes it from its scratchpad on every device, pinned or not.

#### Scenario: Delete

- **GIVEN** a pinned note
- **WHEN** the owner presses its delete button
- **THEN** the note is removed from every device

### Requirement: Pasting a note into the active pane

Each note SHALL have a paste button that types its text into the active pane of the window open in the panel as a paste, without pressing Enter. After a successful paste the hub SHALL remove the note unless it is pinned. With no window open the button SHALL be disabled. If the paste fails the note SHALL stay and the panel SHALL show the error.

#### Scenario: Pasting an unpinned note

- **GIVEN** a window open on a pane running Claude Code and the unpinned note «Revisar el test de login»
- **WHEN** the owner presses the note's paste button
- **THEN** the text appears in Claude Code's input without being sent, and the note disappears from every device

#### Scenario: Pasting a pinned note

- **GIVEN** a window open and a pinned note
- **WHEN** the owner presses the note's paste button
- **THEN** the text is pasted and the note stays

#### Scenario: Several lines

- **GIVEN** a note of two lines and a window open on Claude Code
- **WHEN** the owner pastes it
- **THEN** both lines appear in Claude Code's input and nothing is sent

#### Scenario: No window open

- **GIVEN** the panel on its home screen, with no window open
- **WHEN** the owner looks at a note
- **THEN** its paste button is disabled

#### Scenario: The machine does not answer

- **GIVEN** a window open on a machine that has lost its connection
- **WHEN** the owner pastes an unpinned note
- **THEN** the panel shows an error and the note stays

#### Scenario: Pasted twice at once

- **GIVEN** an unpinned note shown on two devices, each with a window open
- **WHEN** both press its paste button at the same time
- **THEN** the text is pasted once and the other device is told the note no longer exists

### Requirement: Scratchpads sidebar on wide screens

On a wide screen the scratchpads SHALL sit in a sidebar on the right of the panel, on every screen. The sidebar SHALL fold into a narrow strip that shows the three colours, from which a click unfolds it on that scratchpad. Whether it is folded SHALL be remembered on each device. ⌘. on a Mac, and Ctrl+Shift+. elsewhere, SHALL fold or unfold it.

#### Scenario: Folding with the shortcut

- **GIVEN** a wide screen on a Mac with the sidebar unfolded
- **WHEN** the owner presses ⌘.
- **THEN** the sidebar folds into the strip of three colours

#### Scenario: Unfolding from the strip

- **GIVEN** the sidebar folded
- **WHEN** the owner clicks the green dot of the strip
- **THEN** the sidebar unfolds showing the green scratchpad

#### Scenario: Remembered per device

- **GIVEN** the sidebar folded on the Mac and unfolded on another computer
- **WHEN** the owner reloads the panel on the Mac
- **THEN** the sidebar is still folded on the Mac and unfolded on the other computer

### Requirement: Scratchpads drawer on phones

On a narrow screen the scratchpads SHALL open in a drawer that slides in from the right edge with a swipe, and closes by swiping it back or tapping outside it, mirroring the list's drawer on the left.

#### Scenario: Opening from the right edge

- **GIVEN** a phone with a window open
- **WHEN** the owner swipes left from the right edge of the screen
- **THEN** the scratchpads drawer opens

#### Scenario: Closing

- **GIVEN** the scratchpads drawer open
- **WHEN** the owner taps outside it, swipes it back to the right edge or presses the phone's back button
- **THEN** the drawer closes and the page under it stays

#### Scenario: Pasting from the drawer

- **GIVEN** a phone with a window open and the scratchpads drawer open over it
- **WHEN** the owner pastes a note
- **THEN** the text is typed into the window's pane and the drawer closes, leaving the terminal in view
