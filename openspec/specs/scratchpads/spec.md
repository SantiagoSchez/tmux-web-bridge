# scratchpads Specification

## Purpose

Five coloured scratchpads where the owner jots down short notes to tell Claude later, shared by every device, and from which a note goes into a pane with one click.

## Requirements

### Requirement: Coloured scratchpads shared by every device

The panel SHALL offer five scratchpads, told apart by a fixed colour each and with no name, shown in this order: blue, green, yellow, orange and purple. The hub SHALL keep their notes, so that every device shows the same notes, a change made on one device SHALL appear on every other open device without reloading, and the notes SHALL survive a restart of the hub. Notes saved when there were three scratchpads (blue, green and orange) SHALL keep their colour, and the yellow and purple scratchpads SHALL start empty.

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

#### Scenario: Five colours in order

- **GIVEN** the panel open
- **WHEN** the owner looks at the scratchpads
- **THEN** the colours read blue, green, yellow, orange and purple, each with the number of notes it holds

#### Scenario: Notes from three scratchpads keep their colour

- **GIVEN** notes saved in the blue, green and orange scratchpads before there were five
- **WHEN** the hub starts with the new version
- **THEN** each note is still in its colour, and the yellow and purple scratchpads are empty

### Requirement: Adding a note

Each scratchpad SHALL have a field at its foot that adds a plain-text note: Enter SHALL save it and Shift+Enter SHALL insert a new line. A new note SHALL be unpinned and go after the existing ones. From 3500 characters on, the field SHALL show how many characters it holds out of 4000, counted without trailing whitespace as the hub counts them, marked when it goes over. Text that is empty or only whitespace SHALL add nothing.

#### Scenario: Enter adds the note

- **GIVEN** the green scratchpad with 3 notes
- **WHEN** the owner types «Revisar el test de login» in its field and presses Enter
- **THEN** the note is added last, unpinned, the field empties and the green colour shows 4 notes

#### Scenario: Shift+Enter keeps writing

- **GIVEN** text typed in the field
- **WHEN** the owner presses Shift+Enter
- **THEN** a new line is inserted and no note is added yet

#### Scenario: Empty text

- **GIVEN** the field holding only spaces
- **WHEN** the owner presses Enter
- **THEN** no note is added

#### Scenario: Character counter near the limit

- **GIVEN** the field holding 3499 characters
- **WHEN** the owner types one more
- **THEN** the field shows «3500/4000», and no counter was shown before

#### Scenario: Character counter over the limit

- **GIVEN** the field holding 4100 characters
- **WHEN** the owner looks at the counter
- **THEN** it reads «4100/4000» and is marked as over the limit

#### Scenario: Trailing whitespace does not count

- **GIVEN** the field holding 3999 characters followed by two new lines
- **WHEN** the owner looks at the counter
- **THEN** it reads «3999/4000» and is not marked

### Requirement: Limits of a scratchpad and of a note

A scratchpad SHALL hold at most 20 notes, and a note SHALL hold at most 4000 characters. The hub SHALL refuse a note beyond either limit with a message saying why, and the panel SHALL not let the owner add a twenty-first note.

#### Scenario: Full scratchpad

- **GIVEN** the orange scratchpad with 20 notes
- **WHEN** the owner looks at its field
- **THEN** the field is disabled and says the scratchpad is full

#### Scenario: Two devices fill the last place

- **GIVEN** a scratchpad with 19 notes open on two devices
- **WHEN** both add a note at the same time
- **THEN** one note is added and the other device shows an error saying the scratchpad is full

#### Scenario: Note too long

- **GIVEN** a text of 5000 characters pasted into the field
- **WHEN** the owner presses Enter
- **THEN** the hub refuses it, the panel says notes hold at most 4000 characters and the text stays in the field

### Requirement: Editing a note

A click on a note's text SHALL open it for editing in place. Enter or leaving the note SHALL save the new text, Shift+Enter SHALL insert a new line and Escape SHALL cancel. Saving an empty text SHALL delete the note. If the hub refuses the new text, the note SHALL stay open with it and the panel SHALL say why. From 3500 characters on, the note being edited SHALL show the same character counter as the add field.

#### Scenario: Editing in place

- **GIVEN** the note «Preguntar por la migración»
- **WHEN** the owner clicks its text, changes it to «Preguntar por la migración de usuarios» and presses Enter
- **THEN** the note holds the new text on every device

#### Scenario: Escape cancels

- **GIVEN** a note being edited with changed text
- **WHEN** the owner presses Escape
- **THEN** the note keeps its previous text

#### Scenario: A refused edit keeps the text

- **GIVEN** a note being edited
- **WHEN** the owner pastes a text of 5000 characters into it and presses Enter
- **THEN** the panel says notes hold at most 4000 characters and the note stays open with that text

#### Scenario: Emptying deletes

- **GIVEN** a note being edited
- **WHEN** the owner deletes all its text and presses Enter
- **THEN** the note is removed

#### Scenario: Counter while editing

- **GIVEN** a note of 3800 characters
- **WHEN** the owner opens it for editing
- **THEN** it shows «3800/4000»

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

Each note SHALL have a paste button that types its text into the active pane of the window open in the panel as a paste, without pressing Enter. After a successful paste the hub SHALL remove the note unless it is pinned, and on a computer the terminal SHALL take the keyboard back, ready for Enter. With no window open the button SHALL be disabled. If the paste fails the note SHALL stay and the panel SHALL show the error.

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

#### Scenario: Ready to send

- **GIVEN** a wide screen with a window open on Claude Code
- **WHEN** the owner pastes a note and presses Enter
- **THEN** Enter reaches Claude Code and sends the pasted text

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
- **THEN** the text is pasted once and the other device is told the note is already being pasted

### Requirement: Scratchpads sidebar on wide screens

On a wide screen the scratchpads SHALL sit in a sidebar on the right of the panel, on every screen. The sidebar SHALL fold into a narrow strip that shows the five colours, from which a click unfolds it on that scratchpad. Whether it is folded SHALL be remembered on each device. ⌘. on a Mac, and Ctrl+Shift+. elsewhere, SHALL fold or unfold it.

#### Scenario: Folding with the shortcut

- **GIVEN** a wide screen on a Mac with the sidebar unfolded
- **WHEN** the owner presses ⌘.
- **THEN** the sidebar folds into the strip of five colours

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

#### Scenario: A strip that scrolls sideways keeps its swipe

- **GIVEN** a phone with a window open and the key bar able to scroll further right
- **WHEN** the owner swipes left from the right edge over the key bar
- **THEN** the key bar scrolls and the drawer stays shut; once the key bar reaches its end, the same swipe opens the drawer

#### Scenario: Closing

- **GIVEN** the scratchpads drawer open
- **WHEN** the owner taps outside it, swipes it back to the right edge or presses the phone's back button
- **THEN** the drawer closes and the page under it stays

#### Scenario: Pasting from the drawer

- **GIVEN** a phone with a window open and the scratchpads drawer open over it
- **WHEN** the owner pastes a note
- **THEN** the text is typed into the window's pane and the drawer closes, leaving the terminal in view

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
