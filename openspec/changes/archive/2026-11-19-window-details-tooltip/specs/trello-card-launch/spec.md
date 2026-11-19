# Spec Delta

## Purpose

What a Claude task launched on a Trello card, from the Chrome extension or from the panel's Trello drawer, gets from that card besides its prompt, so its window is easy to recognise in the panel and in tmux.

## ADDED Requirements

### Requirement: A card's task renames its window after the card

When a task is launched on a Trello card, from the extension or from the panel's Trello drawer, the text typed into its new window SHALL start with an instruction, in Spanish, for the agent to rename its own tmux window before anything else, with a summary of the card's title, without the card's number, of at most 30 characters. The instruction SHALL quote the card's title and give the command that renames the window the agent runs in. The prompt of the launch form SHALL follow it unchanged.

#### Scenario: A card launched from the extension

- **GIVEN** the card #481 «Permitir reintentar las subidas de vídeo que fallan por timeout» and the prompt «Haz la tarjeta https://trello.com/c/aB3dE6fG»
- **WHEN** the owner launches it from the extension in a new worktree
- **THEN** the text typed into the new window starts with the instruction to rename the window with a summary of «Permitir reintentar las subidas de vídeo que fallan por timeout», without a number and of at most 30 characters, followed by «Haz la tarjeta https://trello.com/c/aB3dE6fG»

#### Scenario: A card launched from the panel's Trello drawer

- **GIVEN** the card #485 «Permitir añadir avatares a los alumnos» opened in the panel's Trello drawer
- **WHEN** the owner launches it
- **THEN** the text typed into the new window starts with the instruction to rename the window after «Permitir añadir avatares a los alumnos»

#### Scenario: A card launched with the prompt left empty

- **GIVEN** the card #458 «Búsqueda y descarga de certificados» in the extension, in a new worktree, with the prompt emptied
- **WHEN** the owner launches it
- **THEN** the text typed into the new window is the instruction to rename the window after «Búsqueda y descarga de certificados», alone

### Requirement: The window keeps its launch name until the agent renames it

A card's window SHALL be created with the name it gets today (its worktree's name with feat/ or bug/, or else the card's title) and kept fixed, so that the host kit does not replace the name the agent gives it. The comment left on the card SHALL name the window as it was launched.

#### Scenario: The agent renames the window

- **GIVEN** a task launched on the card #481 in the worktree «feature/481-permitir-reintentar-subidas», its window named «feat/481-permitir-reintentar-subidas»
- **WHEN** the agent runs the rename the instruction gives, with «Reintentar subidas fallidas»
- **THEN** the window is named «Reintentar subidas fallidas» in tmux and in the panel, and keeps that name while Claude works in it

#### Scenario: The comment on the card

- **GIVEN** a task launched on the card #481 in the worktree «feature/481-permitir-reintentar-subidas»
- **WHEN** the hub comments on the card
- **THEN** the comment names the window «feat/481-permitir-reintentar-subidas»

### Requirement: A card the hub cannot read launches without the instruction

The hub SHALL read the card once per launch. When it cannot read it, the task SHALL still launch, with the prompt alone and the window name of the launch form, and the launch result SHALL carry a warning saying the card could not be read, as it does today when the card cannot be moved or commented on.

#### Scenario: Trello does not answer

- **GIVEN** a launch on the card #481 while Trello's API answers with an error
- **WHEN** the owner launches it
- **THEN** the task starts with the prompt alone, and the extension or the panel shows a warning that the card could not be read

### Requirement: Launches without a card do not change

A launch that carries no card (a new worktree from «Nuevo espacio» or «Nueva ventana», or a run of an automation) SHALL type the prompt alone into its window, as before this change.

#### Scenario: A launch without a card

- **GIVEN** «Nueva ventana» of «Local · demo» starting Claude in the new worktree «feature/12-tests» with the prompt «revisa los tests»
- **WHEN** it launches
- **THEN** the text typed into the new window is «revisa los tests» alone
