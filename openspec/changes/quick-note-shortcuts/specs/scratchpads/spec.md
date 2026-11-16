# Spec Delta

## ADDED Requirements

### Requirement: A quick note from the keyboard

The quick note shortcut SHALL open a dialog with the focus in its text field and the scratchpad shown on the device chosen. Alt+1 to Alt+5 SHALL choose a scratchpad in screen order (blue, green, yellow, orange, purple), and Tab SHALL reach the colours, which the arrow keys move between. Enter SHALL add the note and close the dialog, Shift+Enter SHALL start a new line and Escape SHALL close it without adding anything; the focus SHALL then return where it was.

#### Scenario: Writing a note without the mouse

- **GIVEN** the panel showing window 1 «claude» of «Local · demo», the blue scratchpad shown and the terminal with the focus
- **WHEN** the owner presses the quick note shortcut, types «Revisar el test de login», presses Alt+4 and Enter
- **THEN** the dialog closes, the note is the last of the orange scratchpad with the line «Local · demo · 1 claude», the orange scratchpad is shown and the terminal has the focus again

#### Scenario: Choosing the colour with Tab

- **GIVEN** the quick note dialog open with some text and blue chosen
- **WHEN** the owner presses Tab, the right arrow twice and Enter
- **THEN** the note is added to the yellow scratchpad

#### Scenario: Several lines

- **GIVEN** the quick note dialog open
- **WHEN** the owner types a line, presses Shift+Enter and types another
- **THEN** the field holds both lines and the dialog stays open

#### Scenario: Leaving without a note

- **GIVEN** the quick note dialog open with some text
- **WHEN** the owner presses Escape
- **THEN** the dialog closes, no note is added and the focus returns where it was

### Requirement: A quick note is added like any other

A note from the quick note dialog SHALL be added at the end of the chosen scratchpad as one written at its foot: with the same limits and character counter, and remembering the window open at the time. After it is added, the scratchpad shown on the device SHALL be the chosen one. A note the hub refuses SHALL leave the dialog open with its text and the reason.

#### Scenario: A full scratchpad

- **GIVEN** the green scratchpad with 20 notes and the quick note dialog open on green
- **WHEN** the owner presses Enter with some text
- **THEN** the dialog says the scratchpad is full, keeps the text and stays open, so another colour can be chosen

#### Scenario: Nothing to add

- **GIVEN** the quick note dialog open with an empty field
- **WHEN** the owner presses Enter
- **THEN** no note is added and the dialog stays open

## MODIFIED Requirements

### Requirement: Scratchpads sidebar on wide screens

On a wide screen the scratchpads SHALL sit in a sidebar on the right of the panel, on every screen. The sidebar SHALL fold into a narrow strip that shows the five colours, from which a click unfolds it on that scratchpad. Whether it is folded SHALL be remembered on each device. The fold scratchpads shortcut (⌘. on a Mac, and Ctrl+Shift+. elsewhere, unless changed in the settings) SHALL fold or unfold it, and the sidebar's fold and unfold buttons SHALL name the shortcut configured on the device.

#### Scenario: Folding with the shortcut

- **GIVEN** a wide screen on a Mac with the sidebar unfolded and the default shortcuts
- **WHEN** the owner presses ⌘.
- **THEN** the sidebar folds into the strip of five colours

#### Scenario: A changed shortcut

- **GIVEN** the fold scratchpads shortcut changed to ⌘J on this device
- **WHEN** the owner presses ⌘J, and hovers over the button that unfolds the strip
- **THEN** the sidebar folds, and the button's title names ⌘J

#### Scenario: Unfolding from the strip

- **GIVEN** the sidebar folded
- **WHEN** the owner clicks the green dot of the strip
- **THEN** the sidebar unfolds showing the green scratchpad

#### Scenario: Remembered per device

- **GIVEN** the sidebar folded on the Mac and unfolded on another computer
- **WHEN** the owner reloads the panel on the Mac
- **THEN** the sidebar is still folded on the Mac and unfolded on the other computer
