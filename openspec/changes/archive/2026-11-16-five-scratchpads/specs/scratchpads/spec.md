# Spec Delta

## RENAMED Requirements

- FROM: `### Requirement: Three scratchpads shared by every device`
- TO: `### Requirement: Coloured scratchpads shared by every device`

- FROM: `### Requirement: A scratchpad holds at most 10 notes`
- TO: `### Requirement: Limits of a scratchpad and of a note`

## MODIFIED Requirements

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
