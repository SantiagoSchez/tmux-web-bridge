# Spec Delta

## Purpose

When the panel's terminal takes the keyboard focus on its own, so that the owner can type into tmux on a computer without clicking the terminal first.

## ADDED Requirements

### Requirement: Opening a window gives the terminal the focus on a computer

On a computer, whenever the panel opens a window, from any of the places that open one (the list of spaces and windows, its cards, the rail, the grid, the search, the activity, the usage limits bar, the pane tabs, the number shortcuts or a window just created), the terminal SHALL take the keyboard focus, so that the next key typed reaches tmux. This SHALL hold for a window of the space already shown as well as for one of another space.

#### Scenario: Another window of the same space

- **GIVEN** the panel on a computer showing window 1 «claude» of «Local · demo», with the focus on the terminal
- **WHEN** the owner clicks window 2 «shell» of «Local · demo» in the list
- **THEN** the panel shows window 2 «shell» and the next key typed reaches its pane

#### Scenario: A window of another space

- **GIVEN** the panel on a computer showing window 1 «claude» of «Local · demo»
- **WHEN** the owner clicks window 1 «api» of «Local · backend» in the list
- **THEN** the panel shows that window and the next key typed reaches its pane

#### Scenario: From the search

- **GIVEN** the panel on a computer with the search open
- **WHEN** the owner picks window 2 «shell» of «Local · demo» and presses Enter
- **THEN** the search closes, the panel shows that window and the next key typed reaches its pane

### Requirement: An open sheet or dialog keeps the focus when a window opens

On a computer, when a window opens while a sheet or a dialog of the panel is open, the focus SHALL stay in that sheet or dialog.

#### Scenario: The settings opened while a new window starts

- **GIVEN** the panel on a computer, a window just created in «Local · demo» that has not appeared yet, and the owner typing in a field of «Ajustes»
- **WHEN** the window appears and the panel opens it
- **THEN** the panel shows that window behind «Ajustes» and the next key typed reaches the field of «Ajustes»

### Requirement: Clicking the window already open gives its terminal the focus

On a computer, clicking the window the panel already shows, from any place that opens a window, SHALL give the focus back to its terminal without reloading the window.

#### Scenario: Back to the terminal from the list

- **GIVEN** the panel on a computer showing window 1 «claude» of «Local · demo», after the owner clicked a button of the list
- **WHEN** the owner clicks window 1 «claude» of «Local · demo» in the list
- **THEN** the terminal keeps what it shows and the next key typed reaches its pane

### Requirement: Opening a window leaves the on-screen keyboard as it was on a touch device

On a touch device, opening a window SHALL NOT bring up the on-screen keyboard; a tap on the terminal keeps bringing it up.

#### Scenario: Opening a window on the phone

- **GIVEN** the panel on a phone with the on-screen keyboard hidden
- **WHEN** the owner taps window 2 «shell» of «Local · demo» in the list
- **THEN** the panel shows that window and the on-screen keyboard stays hidden
