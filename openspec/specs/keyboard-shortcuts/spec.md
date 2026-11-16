# keyboard-shortcuts Specification

## Purpose

The panel's keyboard shortcuts: which ones there are, their defaults on a Mac and elsewhere, which ones the owner can change and where each is kept, the combinations refused, and the «Atajos» section of the settings that lists and changes them.

## Requirements

### Requirement: The panel's shortcuts and their defaults

The panel SHALL answer these shortcuts, before the terminal sees the key, with these defaults:

| Shortcut | Mac | Elsewhere |
|---|---|---|
| Search | ⌘K | Ctrl+Shift+K |
| Fold the list | ⌘B | Ctrl+Shift+B |
| Fold the scratchpads | ⌘. | Ctrl+Shift+. |
| Quick note | ⌃⌥N | Ctrl+Alt+N |
| Dictation | Ctrl+Shift+Space | Ctrl+Shift+Space |

#### Scenario: Search outside the Mac

- **GIVEN** the panel on a Linux computer with the default shortcuts
- **WHEN** the owner presses Ctrl+Shift+K
- **THEN** the search opens, and nothing is typed into the terminal

#### Scenario: Quick note on a Mac

- **GIVEN** the panel on a Mac with the default shortcuts and the terminal with the focus
- **WHEN** the owner presses ⌃⌥N
- **THEN** the quick note dialog opens and nothing is typed into the terminal

#### Scenario: The ñ on a Mac

- **GIVEN** the panel on a Mac with the default shortcuts and the terminal with the focus
- **WHEN** the owner types ⌥N and then N
- **THEN** «ñ» is typed into the terminal

### Requirement: The number shortcuts stay fixed

The families Ctrl+1…9 (window N of the space), Ctrl+Shift+1…9 (space N) and Ctrl+Shift+Alt+1…9 (machine N) SHALL keep their keys, and the settings SHALL list them without a way to change them.

#### Scenario: Listed, fixed

- **GIVEN** the «Atajos» section open
- **WHEN** the owner looks at the row of Ctrl+1…9
- **THEN** it shows its keys and has no «Cambiar» button

### Requirement: The «Atajos» settings section

The settings SHALL have an «Atajos» section that lists every shortcut of the panel with its current combination, as the device's keyboard names it. Search, fold the list, fold the scratchpads, quick note and dictation SHALL each change by pressing «Cambiar» and then the new combination, and «Restablecer» SHALL bring back its default. The dictation section SHALL name the dictation shortcut and lead to «Atajos».

#### Scenario: Changing a shortcut

- **GIVEN** the «Atajos» section open on a Mac
- **WHEN** the owner presses «Cambiar» next to the quick note and then ⌘⇧U
- **THEN** the row shows ⇧⌘U, the Mac's order of the symbols, and from then on ⌘⇧U opens the quick note and ⌃⌥N does nothing

#### Scenario: Back to the default

- **GIVEN** the fold the list shortcut changed to ⌘J
- **WHEN** the owner presses «Restablecer» on its row
- **THEN** it is ⌘B again

#### Scenario: Dictation lives in Atajos

- **GIVEN** Ajustes › Dictado open
- **WHEN** the owner looks for the dictation shortcut
- **THEN** the section names it and links to «Atajos», where it is changed

### Requirement: Waiting for a new combination

While the «Atajos» section waits for a new combination, no shortcut SHALL act, and Escape SHALL stop waiting without changing anything.

#### Scenario: Cancelling

- **GIVEN** the «Atajos» section waiting for the quick note's new combination
- **WHEN** the owner presses Escape
- **THEN** the quick note keeps its combination and the section stops waiting

#### Scenario: Waiting does not trigger shortcuts

- **GIVEN** the «Atajos» section waiting for a new combination
- **WHEN** the owner presses the current quick note shortcut
- **THEN** the dialog does not open, and that combination is taken as the new one, or refused if it clashes

### Requirement: Where each shortcut is kept

The search, fold and quick note shortcuts SHALL be kept on each device, so one computer can use different keys from another; a device that never changed them SHALL use the defaults of its kind (Mac or not). The dictation shortcut SHALL be kept by the hub and SHALL be the same on every device, as before this capability.

#### Scenario: Per device

- **GIVEN** the quick note shortcut changed on the Mac
- **WHEN** the owner opens the panel on the Linux computer
- **THEN** the quick note there is still Ctrl+Alt+N

#### Scenario: Dictation on every device

- **GIVEN** the dictation shortcut changed to Ctrl+Shift+D on the Mac
- **WHEN** the owner opens «Atajos» on the Linux computer
- **THEN** the dictation shortcut there is Ctrl+Shift+D

### Requirement: Combinations that are refused

A new combination SHALL be refused, with the reason shown and the previous one kept, when it would type into the terminal (no Ctrl, Alt or Cmd, F1–F12 aside), is Ctrl with only a letter (the terminal's) or with a number (the panel's families), is Alt with only 1 to 5 (the quick note's colours), or another shortcut of the panel uses it on this device, the dictation's included. «Restablecer» SHALL be refused the same way when another shortcut uses the default.

#### Scenario: Clash with another shortcut

- **GIVEN** the «Atajos» section on a Mac with the default shortcuts
- **WHEN** the owner sets the quick note to ⌘B
- **THEN** it is refused because ⌘B already folds the list, and the quick note keeps ⌃⌥N

#### Scenario: A combination that would type

- **GIVEN** the «Atajos» section waiting for a combination
- **WHEN** the owner presses Shift+N
- **THEN** it is refused because it would type into the terminal, and the section keeps waiting

#### Scenario: Clash with the dictation

- **GIVEN** the dictation shortcut Ctrl+Shift+Space
- **WHEN** the owner sets the search to Ctrl+Shift+Space
- **THEN** it is refused because the dictation already uses it

#### Scenario: A quick note colour

- **GIVEN** the «Atajos» section waiting for the search's new combination
- **WHEN** the owner presses Alt+2
- **THEN** it is refused because Alt+2 chooses the green scratchpad in the quick note

#### Scenario: Restoring a default another shortcut took

- **GIVEN** a Mac with fold the list changed to ⌘J and the quick note changed to ⌘B
- **WHEN** the owner presses «Restablecer» on fold the list
- **THEN** it is refused because ⌘B is the quick note's, and fold the list keeps ⌘J
