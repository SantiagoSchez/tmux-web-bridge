# Spec Delta

## Purpose

Defines what pasting into the panel's terminal does on each kind of computer: text goes into the pane as a paste, and an image or a file goes to the pane's machine for Claude Code.

## ADDED Requirements

### Requirement: The computer's paste key pastes into the terminal

On a computer, the paste key (Cmd+V on a Mac; Ctrl+V or Ctrl+Shift+V elsewhere) SHALL paste the computer's clipboard into the terminal. An image or a file on the clipboard, with no text, SHALL be uploaded to the open pane's machine and its path typed into the pane without Enter; text SHALL be pasted into the pane. Outside a Mac, Ctrl+V SHALL no longer send `^V` to the pane.

#### Scenario: An image with Ctrl+V on Linux

- **GIVEN** the panel in a browser on a Linux computer, with a window open on a pane running Claude Code and a screenshot on the clipboard
- **WHEN** the owner presses Ctrl+V in the terminal
- **THEN** the image is uploaded to the pane's machine and its path appears in Claude Code's prompt, without Enter

#### Scenario: Text with Ctrl+V on Windows

- **GIVEN** the panel in a browser on a Windows computer, with text on the clipboard
- **WHEN** the owner presses Ctrl+V in the terminal
- **THEN** the text is pasted into the pane and no `^V` reaches it

#### Scenario: Ctrl+Shift+V on Linux

- **GIVEN** the panel in a browser on a Linux computer, with an image on the clipboard and no panel shortcut set to Ctrl+Shift+V
- **WHEN** the owner presses Ctrl+Shift+V in the terminal
- **THEN** the image is uploaded and its path typed into the pane, as with Ctrl+V

#### Scenario: Ctrl+V with a non-Latin keyboard layout

- **GIVEN** the panel in a browser on a Linux computer with a Cyrillic or Greek keyboard layout, and text on the clipboard
- **WHEN** the owner presses Ctrl and the key that is V on a Latin layout
- **THEN** the text is pasted and no `^V` reaches the pane

#### Scenario: Ctrl+V on a Mac is unchanged

- **GIVEN** the panel in a browser on a Mac
- **WHEN** the owner presses Ctrl+V in the terminal
- **THEN** `^V` reaches the pane, so Claude Code there reads the Mac's own clipboard as before

#### Scenario: Text copied with a picture of it

- **GIVEN** cells copied from a spreadsheet, which put both text and an image on the clipboard
- **WHEN** the owner presses Ctrl+V on Linux
- **THEN** the text is pasted and nothing is uploaded
